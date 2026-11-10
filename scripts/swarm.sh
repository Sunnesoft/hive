#!/usr/bin/env bash
# Swarm-for-Hire commands. Needs near-cli-rs, jq, curl, node 22 and `npm ci`; docker and phala for the TEE.
#
#   NETWORK=testnet|mainnet ROOT=<owner account> TOKEN=<USDC contract> scripts/swarm.sh <command> ...
#
# owner
#   test-token                     testnet: deploy our own USDC at TOKEN, 1M of it to ROOT
#   fund <account> <usdc>          register an account with the token and send it USDC
#   deploy                         build the contract; create swarm/runner/operator.ROOT; deploy and init
#   set <field> <value>            change one config field (fee_bps, audit_base, min_deposit, ...)
#   image <repo>                   build and push the runner image, pin its digest in docker-compose.yml
#   tee-deploy                     deploy docker-compose.yml to Phala Cloud with the secrets of .env.tee
#   runner-key <url> [compose]     check the runner, then let its signing key call review/assign/finish
#   dev-key                        a runner key without a TEE (local chain, testnet): prints DEV_KEY
#   pause | resume                 no key can act as the runner / the runner works again
# sponsor (SPONSOR=<account>)
#   join <agent folder> <usdc>     seal the folder to the runner (RUNNER_URL), register with a deposit, upload
#   top-up <agent> <usdc>          add to an agent's balance
# operator
#   revenue <assignment> <usdc>    forward an Agent Market payout to the round the customer accepted
# anyone
#   verify <url> [compose]         check a runner: Intel quote, its keys, event log, compose, policies
#   withdraw <account> [usdc]      take a balance, all of it if no amount
#   close <job>                    end a job past its timeout (SIGNER=<account>, default ROOT)
#   status [account]               books, config, an agent and its balance
set -euo pipefail
cd "$(dirname "$0")/.."
: "${NETWORK:=testnet}" "${ROOT:?owner account, e.g. alice.testnet}" "${TOKEN:?USDC contract on this network}"
C="swarm.$ROOT"
RPC=${RPC:-https://rpc.$NETWORK.fastnear.com}

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
# send <contract> <method> <json-args> <signer> [deposit]
send() {
  near contract call-function as-transaction "$1" "$2" json-args "$3" prepaid-gas '100 Tgas' \
    attached-deposit "${5:-0 NEAR}" sign-as "$4" network-config "$NETWORK" sign-with-keychain send
}
# pay <from> <units> <msg>: USDC into the contract with a message
pay() { send "$TOKEN" ft_transfer_call "$(jq -nc --arg r "$C" --arg a "$2" --arg m "$3" '{receiver_id:$r,amount:$a,msg:$m}')" "$1" '1 yoctoNEAR'; }
# A function-call key: it can call only the runner methods of the contract and never moves tokens.
runner_key() {
  near account add-key "runner.$ROOT" grant-function-call-access --allowance '5 NEAR' \
    --contract-account-id "$C" --function-names 'review, assign, finish' \
    use-manually-provided-public-key "$1" network-config "$NETWORK" sign-with-keychain send
}
set_cfg() { send "$C" set_config "$(view "$C" config | jq -c --arg k "$1" --arg v "$2" '{cfg: (.[$k] = (if .[$k] | type == "number" then ($v | tonumber) else $v end))}')" "$ROOT"; }
ts() { node --experimental-strip-types --disable-warning=ExperimentalWarning "$@"; }
verify() { RPC="$RPC" RUNNER="runner.$ROOT" ts scripts/verify.ts "$@"; }

case "${1:-}" in
test-token)
  (cd e2e/token && cargo near build non-reproducible-wasm --no-abi)
  near account create-account fund-myself "$TOKEN" '2 NEAR' autogenerate-new-keypair save-to-keychain \
    sign-as "$ROOT" network-config "$NETWORK" sign-with-keychain send
  near contract deploy "$TOKEN" use-file e2e/token/target/near/token.wasm with-init-call new \
    json-args "$(jq -nc --arg o "$ROOT" '{owner_id:$o, total_supply:"1000000000000"}')" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config "$NETWORK" sign-with-keychain send ;;
fund)
  send "$TOKEN" storage_deposit "$(jq -nc --arg a "$2" '{account_id:$a}')" "$ROOT" '0.00125 NEAR'
  send "$TOKEN" ft_transfer "$(jq -nc --arg a "$2" --arg n "$(usdc "$3")" '{receiver_id:$a, amount:$n}')" "$ROOT" '1 yoctoNEAR' ;;
deploy)
  (cd contract && cargo near build non-reproducible-wasm) # not reproducible on purpose: the source stays private for now
  for a in "$C:5" "runner.$ROOT:1" "operator.$ROOT:1"; do # full-access keys stay with the owner
    near account create-account fund-myself "${a%:*}" "${a#*:} NEAR" autogenerate-new-keypair save-to-keychain \
      sign-as "$ROOT" network-config "$NETWORK" sign-with-keychain send
  done
  cfg=$(jq -nc --arg r "$ROOT" '{owner:$r, runner:"runner.\($r)", operator:"operator.\($r)", fee_bps:500,
    audit_base:"100000", audit_per_mb:"100000", min_deposit:"1000000", run_secs:1800, pay_secs:1209600}')
  near contract deploy "$C" use-file contract/target/near/swarm.wasm with-init-call new \
    json-args "$(jq -nc --arg t "$TOKEN" --argjson c "$cfg" '{token:$t, cfg:$c}')" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config "$NETWORK" sign-with-keychain send
  for a in "$C" "operator.$ROOT" "$ROOT"; do # every payout receiver must be registered with the token
    send "$TOKEN" storage_deposit "$(jq -nc --arg a "$a" '{account_id:$a}')" "$ROOT" '0.00125 NEAR'
  done ;;
set) set_cfg "$2" "$3" ;;
image) # the TEE runs exactly this digest; the compose hash in the quote covers it
  docker build --platform linux/amd64 -t "$2:latest" .
  docker push "$2:latest"
  digest=$(docker inspect --format '{{index .RepoDigests 0}}' "$2:latest")
  sed -i.bak -E "s#image: .*#image: $digest#" docker-compose.yml && rm docker-compose.yml.bak
  echo "docker-compose.yml now runs $digest" ;;
tee-deploy) # .env.tee: NEARAI_API_KEY, MARKET_TOKEN, optional BRAVE_API_KEY. Encrypted to the TEE by the CLI.
  [[ -f .env.tee ]] || { echo "need .env.tee with the secrets" >&2; exit 1; }
  phala deploy -c docker-compose.yml -n swarm-runner -e .env.tee --wait ;;
runner-key)
  verify "$2" ${3:+"$3"} || { echo "the runner did not pass the checks" >&2; exit 1; }
  pk=$(curl -fsS "${2%/}/attestation" | jq -r .publicKey)
  read -rp "let $pk act as runner.$ROOT? [y/N] " ok
  [[ $ok == y ]] && runner_key "$pk" ;;
dev-key)
  read -r sk pk < <(ts --input-type=module -e "import { KeyPair } from 'near-api-js';
    const k = KeyPair.fromRandom('ed25519'); console.log(k.toString(), k.getPublicKey().toString())")
  runner_key "$pk"
  echo "DEV_KEY=$sk" ;;
pause) set_cfg runner "paused.$ROOT" ;; # a subaccount only the owner could ever create
resume) set_cfg runner "runner.$ROOT" ;;
verify) verify "$2" ${3:+"$3"} ;;
join)
  : "${SPONSOR:?account that registers the agent}" "${RUNNER_URL:?the runner, e.g. https://<app-id>-8080.<gateway>}"
  verify "$RUNNER_URL" || [[ ${TRUST_DEV_RUNNER:-} == 1 ]] || { echo "not sealing to an unverified runner (TRUST_DEV_RUNNER=1 for local tests)" >&2; exit 1; }
  out=$(SPONSOR="$SPONSOR" ts scripts/join.ts "$2" "$RUNNER_URL")
  deposit=$(usdc "$3")
  (( deposit >= $(jq -r .least <<<"$out") )) || { echo "the deposit must be at least $(jq -r .least <<<"$out") units" >&2; exit 1; }
  pay "$SPONSOR" "$deposit" "$(jq -c .msg <<<"$out")"
  curl -fsS --data-binary "@$(jq -r .file <<<"$out")" -H 'content-type: application/octet-stream' "$RUNNER_URL/upload/$SPONSOR"
  echo; echo "uploaded: the audit runs within a few minutes (scripts/swarm.sh status $SPONSOR)" ;;
top-up)
  pay "${SPONSOR:?account that pays}" "$(usdc "$3")" "$(jq -nc --arg a "$2" '{TopUp:{agent:$a}}')" ;;
revenue) # the latest round on chain is the one the customer accepted
  job=""
  for k in $(seq 1 20); do
    [[ $(view "$C" job "$(jq -nc --arg j "$2#$k" '{job:$j}')") != null ]] && job="$2#$k"
  done
  [[ -n $job ]] || { echo "no round of $2 is owed anything" >&2; exit 1; }
  echo "paying $3 USDC to $job"
  pay "operator.$ROOT" "$(usdc "$3")" "$(jq -nc --arg j "$job" '{Revenue:{job:$j}}')" ;;
withdraw)
  args='{}'
  [[ -n ${3:-} ]] && args=$(jq -nc --arg a "$(usdc "$3")" '{amount:$a}')
  send "$C" withdraw "$args" "$2" ;;
close)
  send "$C" close "$(jq -nc --arg j "$2" '{job:$j}')" "${SIGNER:-$ROOT}" ;;
status)
  total=$(view "$C" total | jq -r .)
  held=$(view "$TOKEN" ft_balance_of "$(jq -nc --arg a "$C" '{account_id:$a}')" | jq -r .)
  if [[ $(jq -n "$total <= $held") == true ]]; then echo "books OK: owed $total <= held $held"
  else echo "BOOKS MISMATCH: owed $total > held $held. Run: scripts/swarm.sh pause"; fi
  view "$C" config | jq .
  if [[ -n ${2:-} ]]; then
    view "$C" agent "$(jq -nc --arg a "$2" '{account:$a}')" | jq .
    echo "balance: $(view "$C" balance "$(jq -nc --arg a "$2" '{account:$a}')")"
  fi ;;
*) sed -n '2,26p' "$0"; exit 1 ;;
esac
