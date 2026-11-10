#!/usr/bin/env bash
# Checks that the Mermaid diagrams of docs/PROTOCOL.md render (mermaid-cli in Docker); GitHub draws them itself.
# The SVGs land in docs/.check/ (git-ignored) if you want to look at them.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf docs/.check && mkdir -p docs/.check
docker run --rm -v "$PWD/docs:/data" minlag/mermaid-cli -i /data/PROTOCOL.md -o /data/.check/PROTOCOL.md -b white
ls docs/.check
