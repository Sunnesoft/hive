#!/usr/bin/env bash
# Draws the Mermaid diagrams of docs/FLOWS.md as SVG into docs/flows/ (mermaid-cli in Docker).
# It also checks their syntax: a broken diagram fails the run.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf docs/flows && mkdir -p docs/flows
docker run --rm -v "$PWD/docs:/data" minlag/mermaid-cli \
  -i /data/FLOWS.md -o /data/flows/FLOWS.md -b white
ls docs/flows
