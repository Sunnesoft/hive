#!/usr/bin/env bash
# Swarm-for-Hire commands. Needs near-cli-rs, jq, curl, node 22 and `npm ci`; docker and phala for the TEE.
#
#   NETWORK=testnet|mainnet ROOT=<owner account> TOKEN=<USDC contract> scripts/swarm.sh <command> ...
#   KEYCHAIN=legacy-keychain keeps keys in ~/.near-credentials instead of the system keychain.
#   SWARM_ACCOUNT=<account> names the contract if it is not swarm.ROOT (a second deployment by the same owner).
#
# testnet
#   faucet <account>               a new testnet account with NEAR from the faucet, its key in the keychain
#
# owner
#   test-token                     testnet: deploy our own USDC at TOKEN, 1M of it to ROOT
#   fund <account> <usdc>          register an account with the token and send it USDC
#   deploy                         build the contract; create swarm/runner/operator.ROOT; deploy and init
#   upgrade                        build the contract and put the new code on the account that has the old state
#                                  (version 3.0.0), reading it into the new one in the same transaction
#   set <field> <value>            announce one config field changed (fee_bps, audit_base, delay_secs, ...): it takes
#                                  effect delay_secs later (at once while the delay is 0)
#   apply-config | cancel-config   put an announced config in force once its time has come (anyone) / take it back
#   image <repo>                   build and push the runner image, pin its digest in docker-compose.yml
#   tee-deploy                     deploy docker-compose.yml to Phala Cloud with the secrets of .env.tee, on the
#                                  smallest machine (TEE_SIZE names another). Phala bills it for every hour it runs
#   tee-stop | tee-delete          stop the machine: only its disk is billed / delete it: nothing is billed
#   runner-key <url> <compose>     check the runner, then let its signing key call the runner's methods
#   dev-key                        a runner key without a TEE (local chain, testnet): prints DEV_KEY
#   pause | resume                 stop the runner at once: nothing it does is accepted / let it work again
# sponsor (SPONSOR=<account>)
#   join <agent folder> <usdc>     check the runner (RUNNER_URL, COMPOSE), seal the folder to it, register, upload
#   top-up <owner/name> <usdc>     add to the balance behind an agent (its owner's)
# operator
#   payouts                        pay every accepted assignment's rounds: each delivered expert its rate (cron-safe)
#   revenue <assignment#round> <usdc>  forward one payout by hand
# customer (CUSTOMER=<account>)
#   order "<the work>" <usdc>      the task's text to the runner (RUNNER_URL), its hash and budget into the contract;
#                                  prints the order's id. PUBLISH=1 puts the text into the transaction as well
#   answers                        the customer's orders and their answers, from the runner (RUNNER_URL), signed with its key
#   refund <order>                 send back an order nobody answered within run_secs (anyone may call it)
# anyone
#   verify <url> <compose>         check a runner: Intel quote, its keys, event log, compose, policies
#   withdraw <account> [usdc]      take a balance, all of it if no amount
#   close <job>                    end a job past its timeout (SIGNER=<account>, default ROOT)
#   status [account | owner/name]  books, config; an account's balance and agents, or one agent
set -euo pipefail
cd "$(dirname "$0")/.."
: "${NETWORK:=testnet}" "${ROOT:?owner account, e.g. alice.testnet}" "${TOKEN:?USDC contract on this network}"
C=${SWARM_ACCOUNT:-swarm.$ROOT}
RPC=${RPC:-https://rpc.$NETWORK.fastnear.com}
KC=${KEYCHAIN:-keychain} # where near-cli-rs keeps and finds keys

# "4.5" -> 4500000 (USDC has 6 decimals). String math: floats turn 1.13 into 1129999.
usdc() {
  [[ $1 =~ ^[0-9]+(\.[0-9]{1,6})?$ ]] || { echo "bad USDC amount: $1" >&2; exit 1; }
  local whole=${1%%.*} frac=""
  [[ $1 == *.* ]] && frac=${1#*.}
  frac="${frac}000000"
  echo $((10#$whole * 1000000 + 10#${frac:0:6}))
}
# view <contract> <method> [json-args]: straight to RPC, so the output is plain JSON.
view() {
  local args; args=$(printf %s "${3:-"{}"}" | base64 | tr -d '\n')
  curl -fsS "$RPC" -H 'content-type: application/json' -d "$(jq -nc --arg c "$1" --arg m "$2" --arg a "$args" \
    '{jsonrpc:"2.0",id:1,method:"query",params:{request_type:"call_function",finality:"final",account_id:$c,method_name:$m,args_base64:$a}}')" |
    jq -r 'if .result.result then (.result.result | implode) else error(.error // .result.error | tostring) end'
}
# exists <account>: is it on chain?
exists() {
  curl -fsS "$RPC" -H 'content-type: application/json' -d "$(jq -nc --arg a "$1" '{jsonrpc:"2.0",id:1,method:"query",params:{request_type:"view_account",finality:"final",account_id:$a}}')" | jq -e .result >/dev/null
}
# send <contract> <method> <json-args> <signer> [deposit]
send() {
  near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas '100 Tgas' \
    attached-deposit "${5:-0 NEAR}" sign-as "$4" network-config "$NETWORK" sign-with-$KC send
}
# pay <from> <units> <msg>: USDC into the contract with a message
pay() { send "$TOKEN" ft_transfer_call "$(jq -nc --arg r "$C" --arg a "$2" --arg m "$3" '{receiver_id:$r,amount:$a,msg:$m}')" "$1" '1 yoctoNEAR'; }
# A function-call key: it can call only the runner methods of the contract. It cannot move a token to itself or
# to anyone it chooses: an order's money goes only where the contract's rules send it.
runner_key() {
  near account add-key "runner.$ROOT" grant-function-call-access --allowance '5 NEAR' \
    --contract-account-id "$C" --function-names 'review, assign, finish, deliver, decline' \
    use-manually-provided-public-key "$1" network-config "$NETWORK" sign-with-$KC send
}
set_cfg() { send "$C" set_config "$(view "$C" config | jq -c --arg k "$1" --arg v "$2" '{cfg: (.[$k] = (if .[$k] | type == "number" then ($v | tonumber) else $v end))}')" "$ROOT"; }
ts() { node --experimental-strip-types --disable-warning=ExperimentalWarning "$@"; }
verify() { RPC="$RPC" RUNNER="runner.$ROOT" ts scripts/verify.ts "$@"; }

case "${1:-}" in
faucet)
  near account create-account sponsor-by-faucet-service "$2" autogenerate-new-keypair save-to-$KC network-config "$NETWORK" create ;;
test-token)
  (cd e2e/token && cargo near build non-reproducible-wasm --no-abi)
  near account create-account fund-myself "$TOKEN" '2 NEAR' autogenerate-new-keypair save-to-$KC \
    sign-as "$ROOT" network-config "$NETWORK" sign-with-$KC send
  near contract deploy "$TOKEN" use-file e2e/token/target/near/token.wasm with-init-call new \
    json-args "$(jq -nc --arg o "$ROOT" '{owner_id:$o, total_supply:"1000000000000"}')" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config "$NETWORK" sign-with-$KC send ;;
fund)
  send "$TOKEN" storage_deposit "$(jq -nc --arg a "$2" '{account_id:$a}')" "$ROOT" '0.00125 NEAR'
  send "$TOKEN" ft_transfer "$(jq -nc --arg a "$2" --arg n "$(usdc "$3")" '{receiver_id:$a, amount:$n}')" "$ROOT" '1 yoctoNEAR' ;;
deploy)
  (cd contract && cargo near build non-reproducible-wasm) # not reproducible on purpose: the source stays private for now
  for a in "$C:${SWARM_NEAR:-5}" "runner.$ROOT:1" "operator.$ROOT:1"; do # full-access keys stay with the owner; the contract's NEAR pays its storage
    exists "${a%:*}" && continue # deploy again: the runner keeps its keys, the operator its balance
    near account create-account fund-myself "${a%:*}" "${a#*:} NEAR" autogenerate-new-keypair save-to-$KC \
      sign-as "$ROOT" network-config "$NETWORK" sign-with-$KC send
  done
  cfg=$(jq -nc --arg r "$ROOT" '{owner:$r, runner:"runner.\($r)", operator:"operator.\($r)", fee_bps:500,
    audit_base:"100000", audit_per_mb:"100000", min_deposit:"1000000", overhead:"500000", overhead_per_agent:"100000",
    run_secs:1800, pay_secs:1209600, delay_secs:0}') # mainnet: `set delay_secs 172800` once all else is set
  near contract deploy "$C" use-file contract/target/near/swarm.wasm with-init-call new \
    json-args "$(jq -nc --arg t "$TOKEN" --argjson c "$cfg" '{token:$t, cfg:$c}')" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config "$NETWORK" sign-with-$KC send
  for a in "$C" "operator.$ROOT" "$ROOT"; do # every payout receiver must be registered with the token
    send "$TOKEN" storage_deposit "$(jq -nc --arg a "$a" '{account_id:$a}')" "$ROOT" '0.00125 NEAR'
  done ;;
upgrade) # the contract's own key signs both: the new code, and `migrate`, which only the contract may call
  (cd contract && cargo near build non-reproducible-wasm)
  near contract deploy "$C" use-file contract/target/near/swarm.wasm with-init-call migrate json-args '{}' \
    prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config "$NETWORK" sign-with-$KC send ;;
set) set_cfg "$2" "$3" ;;
apply-config) send "$C" apply_config '{}' "${SIGNER:-$ROOT}" ;;
cancel-config) send "$C" cancel_config '{}' "$ROOT" ;;
image) # the TEE runs exactly this digest; the compose hash in the quote covers it
  docker build --platform linux/amd64 -t "$2:latest" .
  docker push "$2:latest"
  digest=$(docker inspect --format '{{index .RepoDigests 0}}' "$2:latest")
  sed -i.bak -E "s#image: .*#image: $digest#" docker-compose.yml && rm docker-compose.yml.bak
  echo "docker-compose.yml now runs $digest" ;;
tee-deploy) # .env.tee: NEARAI_API_KEY, MARKET_TOKEN, optional BRAVE_API_KEY. Encrypted to the TEE by the CLI.
  [[ -f .env.tee ]] || { echo "need .env.tee with the secrets" >&2; exit 1; }
  # The size is named here, not left for Phala to choose: it is what the machine costs per hour.
  phala deploy -c docker-compose.yml -n swarm-runner -e .env.tee -t "${TEE_SIZE:-tdx.small}" --wait ;;
tee-stop) phala cvms stop swarm-runner ;;     # the disk stays, with the sealed uploads on it
tee-delete) phala cvms delete swarm-runner ;; # asks first: the disk and the sealed uploads go with it
runner-key)
  verify "$2" "${3:?app-compose.json of the deployed app}" || { echo "the runner did not pass the checks" >&2; exit 1; }
  pk=$(curl -fsS "${2%/}/attestation" | jq -r .publicKey)
  read -rp "let $pk act as runner.$ROOT? [y/N] " ok
  [[ $ok == y ]] && runner_key "$pk" ;;
dev-key)
  read -r sk pk < <(ts --input-type=module -e "import { KeyPair } from 'near-api-js';
    const k = KeyPair.fromRandom('ed25519'); console.log(k.toString(), k.getPublicKey().toString())")
  runner_key "$pk"
  echo "DEV_KEY=$sk" ;;
pause) send "$C" halt '{"halted":true}' "$ROOT" ;; # a subaccount only the owner could ever create
resume) send "$C" halt '{"halted":false}' "$ROOT" ;;
verify) verify "$2" ${3:+"$3"} ;;
join) # COMPOSE: the app-compose.json the owner published; it binds the TEE to our code
  : "${SPONSOR:?account that registers the agent}" "${RUNNER_URL:?the runner, e.g. https://<app-id>-8080.<gateway>}"
  REQUIRE_KEY=1 verify "$RUNNER_URL" "${COMPOSE:-app-compose.json}" || [[ ${TRUST_DEV_RUNNER:-} == 1 ]] ||
    { echo "not sealing to an unverified runner (TRUST_DEV_RUNNER=1 for local tests only)" >&2; exit 1; }
  out=$(SPONSOR="$SPONSOR" ts scripts/join.ts "$2" "$RUNNER_URL")
  deposit=$(usdc "$3")
  (( deposit >= $(jq -r .least <<<"$out") )) || { echo "the deposit must be at least $(jq -r .least <<<"$out") units" >&2; exit 1; }
  pay "$SPONSOR" "$deposit" "$(jq -c .msg <<<"$out")"
  for try in 1 2 3 4 5 6; do # the runner sees a new registration within a minute
    curl -fsS --data-binary "@$(jq -r .file <<<"$out")" -H 'content-type: application/octet-stream' "$RUNNER_URL/upload/$(jq -r .id <<<"$out")" && break
    (( try < 6 )) || exit 1
    sleep 15
  done
  echo; echo "uploaded: the audit runs within a few minutes (scripts/swarm.sh status $(jq -r .id <<<"$out"))" ;;
top-up)
  pay "${SPONSOR:?account that pays}" "$(usdc "$3")" "$(jq -nc --arg a "$2" '{TopUp:{agent:$a}}')" ;;
payouts) # needs the runner's env (.env.testnet or the like) for NEAR_RPC, CONTRACT, MARKET_TOKEN
  ts --env-file="${ENV_FILE:-.env.$NETWORK}" scripts/payouts.ts "operator.$ROOT" "${@:2}" ;;
revenue) # the round is in the accepted answer's footer: "round N"
  [[ $2 == *#* ]] || { echo "give the round: <assignment>#<round>" >&2; exit 1; }
  echo "paying $3 USDC to $2"
  pay "operator.$ROOT" "$(usdc "$3")" "$(jq -nc --arg j "$2" '{Revenue:{job:$j}}')" ;;
order) # the contract keeps only the hash; the answer is read with `answers`, or on the runner's /order page with the same wallet
  : "${CUSTOMER:?account that orders and pays}" "${RUNNER_URL:?the runner that gets the text, e.g. http://127.0.0.1:8080}"
  salt=$(openssl rand -hex 16)
  hash=$(printf '%s\n%s' "$salt" "$2" | openssl dgst -sha256 -r | cut -d' ' -f1) # computed here: the runner cannot name the task by another
  told=$(curl -fsS "$RUNNER_URL/brief" -H 'content-type: application/json' -d "$(jq -nc --arg s "$salt" --arg b "$2" '{salt:$s, brief:$b}')" | jq -r .hash)
  [[ $told == "$hash" ]] || { echo "the runner did not take the text under its hash" >&2; exit 1; }
  msg=$(jq -nc --arg h "$hash" '{Order:{brief_hash:$h}}')
  [[ ${PUBLISH:-} == 1 ]] && msg=$(jq -nc --arg h "$hash" --arg s "$salt" --arg b "$2" '{Order:{brief_hash:$h, salt:$s, brief:$b}}')
  pay "$CUSTOMER" "$(usdc "$3")" "$msg"
  view "$C" orders '{"from":0,"limit":100}' | jq -c --arg h "$hash" '.[] | select(.brief_hash == $h) | {id, amount, brief_hash}' ;;
answers) # reads the key from ~/.near-credentials, as near-cli-rs saves it with KEYCHAIN=legacy-keychain
  ts scripts/cabinet.ts "${CUSTOMER:?account that ordered}" "${RUNNER_URL:?the runner, e.g. http://127.0.0.1:8080}" "$NETWORK" --orders ;;
refund)
  send "$C" refund "$(jq -nc --arg o "$2" '{order:$o}')" "${SIGNER:-${CUSTOMER:-$ROOT}}" ;;
withdraw)
  args='{}'
  [[ -n ${3:-} ]] && args=$(jq -nc --arg a "$(usdc "$3")" '{amount:$a}')
  send "$C" withdraw "$args" "$2" ;;
close)
  send "$C" close "$(jq -nc --arg j "$2" '{job:$j}')" "${SIGNER:-$ROOT}" ;;
status)
  owed=$(view "$C" owed | jq -r .)
  held=$(view "$TOKEN" ft_balance_of "$(jq -nc --arg a "$C" '{account_id:$a}')" | jq -r .)
  if [[ $(jq -n "$owed <= $held") == true ]]; then echo "books OK: owed $owed <= held $held"
  else echo "BOOKS MISMATCH: owed $owed > held $held. Run: scripts/swarm.sh pause"; fi
  view "$C" config | jq .
  if [[ ${2:-} == */* ]]; then
    view "$C" agent "$(jq -nc --arg a "$2" '{id:$a}')" | jq .
  elif [[ -n ${2:-} ]]; then
    echo "balance: $(view "$C" balance "$(jq -nc --arg a "$2" '{account:$a}')")"
    for from in $(seq 0 100 10000); do # the agents it owns
      page=$(view "$C" agents "$(jq -nc --argjson f "$from" '{from:$f, limit:100}')")
      jq -c --arg o "$2" '.[] | select(.sponsor == $o) | {id, status, rate, max_cost, registration}' <<<"$page"
      (( $(jq length <<<"$page") == 100 )) || break
    done
  fi ;;
*) sed -n '2,36p' "$0"; exit 1 ;;
esac
