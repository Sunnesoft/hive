#!/usr/bin/env bash
# Swarm-for-Hire commands for the owner, sponsors and the operator. Needs near-cli-rs, jq, curl, node, npm ci.
#
#   NETWORK=testnet|mainnet ROOT=<owner account> TOKEN=<USDC contract> scripts/swarm.sh <command> ...
#
#   test-token                      owner     testnet: deploy our own USDC at TOKEN (= usdc.<ROOT>), 1M to ROOT
#   fund <account> <usdc>           owner     register an account with the token and send it USDC
#   deploy                          owner     build, create swarm/runner/operator, deploy and init the contract
#   runner-key <quote.json>         owner     check a TEE quote, give its key the runner methods, publish its seal key
#   dev-key                         owner     runner keys without a TEE (testnet only); prints DEV_KEY for .env
#   pause | resume                  owner     no key can act as the runner / the runner works again
#   agent <manifest> <usdc> <cap>   sponsor   seal the manifest to the runner, register: deposit, cap per job (SPONSOR=)
#   top-up <agent> <usdc>           anyone    add to an agent's budget (SPONSOR=<payer>)
#   revenue <assignment> <usdc>     operator  forward an Agent Market payout to the accepted round's agents
#   withdraw <account> [usdc]       anyone    take a balance, all of it if no amount
#   close <job>                     anyone    close a stuck job after its timeout (SIGNER=<account>, default ROOT)
#   status [account]                anyone    books check, config, an account's agent and balance
set -euo pipefail
cd "$(dirname "$0")/.."
: "${NETWORK:=testnet}" "${ROOT:?owner account, e.g. sunnesoft.testnet}" "${TOKEN:?USDC contract on this network}"
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
runner_key() {
  near account add-key "runner.$ROOT" grant-function-call-access --allowance '5 NEAR' \
    --contract-account-id "$C" --function-names 'review, assign, finish' \
    use-manually-provided-public-key "$1" network-config "$NETWORK" sign-with-keychain send
}
# set_cfg <field> <value>: change one config field (owner)
set_cfg() { send "$C" set_config "$(view "$C" config | jq -c --arg k "$1" --arg v "$2" '{cfg: (.[$k] = $v)}')" "$ROOT"; }
# ts <js>: run JavaScript that may import the runner's TypeScript modules
ts() { node --experimental-strip-types --disable-warning=ExperimentalWarning --input-type=module -e "$1"; }

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
  (cd contract && cargo near build non-reproducible-wasm)
  for a in "$C:5" "runner.$ROOT:1" "operator.$ROOT:1"; do # full-access keys stay with the owner; swarm pays for storage
    near account create-account fund-myself "${a%:*}" "${a#*:} NEAR" autogenerate-new-keypair save-to-keychain \
      sign-as "$ROOT" network-config "$NETWORK" sign-with-keychain send
  done
  cfg=$(jq -nc --arg r "$ROOT" '{owner:$r, runner:"runner.\($r)", operator:"operator.\($r)", fee_bps:500,
    review_fee:"100000", min_deposit:"1000000", run_secs:1800, pay_secs:1209600, seal_key:""}')
  near contract deploy "$C" use-file contract/target/near/swarm.wasm with-init-call new \
    json-args "$(jq -nc --arg t "$TOKEN" --argjson c "$cfg" '{token:$t, cfg:$c}')" \
    prepaid-gas '30 Tgas' attached-deposit '0 NEAR' network-config "$NETWORK" sign-with-keychain send
  for a in "$C" "operator.$ROOT" "$ROOT"; do # every payout receiver must be registered with the token
    send "$TOKEN" storage_deposit "$(jq -nc --arg a "$a" '{account_id:$a}')" "$ROOT" '0.00125 NEAR'
  done ;;
runner-key)
  pk=$(jq -r .publicKey "$2")
  seal=$(jq -r .sealKey "$2")
  want="$(printf %s "$pk" | shasum -a 256 | cut -c1-64)$seal"
  got=$(jq -r '.quote | ltrimstr("0x")' "$2" | xxd -r -p | tail -c +569 | head -c 64 | xxd -p -c 128) # TDX v4: report_data at byte 568
  [[ $got == "$want" ]] || { echo "report_data does not commit to these keys" >&2; exit 1; }
  echo "report_data commits to signing key $pk and seal key $seal."
  echo "Now check the quote and its compose-hash (docs/RUNBOOK.md, TEE)."
  read -rp "give these keys to runner.$ROOT? [y/N] " ok
  [[ $ok == y ]] || exit 1
  runner_key "$pk"
  [[ $(view "$C" config | jq -r .seal_key) == "$seal" ]] || set_cfg seal_key "$seal" ;;
dev-key)
  read -r sk pk seal < <(ts "import { KeyPair } from 'near-api-js'; import { devSecret, publicKeyOf } from './node/src/seal.ts';
    const k = KeyPair.fromRandom('ed25519'); console.log(k.toString(), k.getPublicKey().toString(), publicKeyOf(devSecret(k.toString())).toString('hex'))")
  runner_key "$pk"
  set_cfg seal_key "$seal"
  echo "DEV_KEY=$sk" ;;
pause) set_cfg runner "paused.$ROOT" ;; # a subaccount only the owner could ever create
resume) set_cfg runner "runner.$ROOT" ;;
agent)
  : "${SPONSOR:?account that sponsors the agent}"
  key=$(view "$C" config | jq -r .seal_key)
  [[ -n $key ]] || { echo "the contract has no seal key yet: run runner-key or dev-key first" >&2; exit 1; }
  sealed=$(FILE="$2" KEY="$key" ts "import { readFileSync } from 'node:fs'; import { seal } from './node/src/seal.ts';
    const { FILE, KEY, SPONSOR } = process.env;
    process.stdout.write(seal(readFileSync(FILE), Buffer.from(KEY, 'hex'), SPONSOR).toString('base64'))")
  (( ${#sealed} * 3 / 4 <= 16384 )) || { echo "$2 is too big: the sealed manifest must fit 16 KiB" >&2; exit 1; }
  pay "$SPONSOR" "$(usdc "$3")" "$(jq -nc --arg s "$sealed" --arg m "$(usdc "$4")" '{Register:{manifest:$s, max_cost:$m}}')" ;;
top-up)
  pay "${SPONSOR:?account that pays}" "$(usdc "$3")" "$(jq -nc --arg a "$2" '{TopUp:{agent:$a}}')" ;;
revenue) # an assignment id pays its latest finished round: the one the customer accepted
  job=$2
  if [[ $job != *#* ]]; then
    for k in $(seq 1 20); do
      [[ $(view "$C" job "$(jq -nc --arg j "$2#$k" '{job:$j}')") != null ]] && job="$2#$k"
    done
  fi
  [[ $job == *#* ]] || { echo "no finished round for $2" >&2; exit 1; }
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
*) sed -n '2,17p' "$0"; exit 1 ;;
esac
