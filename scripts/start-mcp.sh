#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${LOBS_BRIDGE_SOCKET:=/run/gcal-bridge/bridge.sock}"
: "${LOBS_BRIDGE_TIMEOUT_MS:=15000}"

export LOBS_BRIDGE_SOCKET
export LOBS_BRIDGE_TIMEOUT_MS

# Build then run MCP server over stdio.
# (MCP clients spawn this and communicate via stdin/stdout.)

npm run -s build
exec node dist/index.js
