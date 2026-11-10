#!/usr/bin/env bash
# Build and check everything on this machine. No keys, no accounts, no money:
# contract unit tests, runner types and unit tests, then the whole flow on a local chain.
set -euo pipefail
cd "$(dirname "$0")/.."

# Prefer rustup's toolchain (it has the wasm target) over a system Rust; cargo-near lives in ~/.cargo/bin.
if command -v rustup >/dev/null; then PATH="$(dirname "$(rustup which cargo)"):$PATH"; fi
PATH="$HOME/.cargo/bin:$PATH"
rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown ||
  { echo "need: rustup target add wasm32-unknown-unknown" >&2; exit 1; }
command -v cargo-near >/dev/null || { echo "need: cargo install cargo-near --locked" >&2; exit 1; }

step() { printf '\n== %s\n' "$*"; }
step "contract: unit tests"
(cd contract && cargo test -q)
step "contract and test token: wasm"
(cd contract && cargo near build non-reproducible-wasm)
(cd e2e/token && cargo near build non-reproducible-wasm --no-abi)
step "runner: dependencies, types, unit tests"
[[ -d node_modules ]] || npm ci
npm run -s ui # the wallet connector for the cabinet page, bundled from npm
npm run -s check
npm test
step "end to end on a local chain (near-sandbox, nearcore 2.14.0)"
npm run -s e2e
