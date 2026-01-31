#!/usr/bin/env bash
# Shared env loader for bash utilities.
# Loads config from:
#  1) repo-local .env (optional)
#  2) XDG config: ~/.config/lobs-mcp/config.env (recommended)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/lobs-mcp"
CONF_FILE="$CONF_DIR/config.env"
# shellcheck disable=SC1090
if [ -f "$CONF_FILE" ]; then
  set -a
  source "$CONF_FILE"
  set +a
fi

# shellcheck disable=SC1090
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

: "${LOBS_BRIDGE_HTTP_URL:=http://127.0.0.1:17381}"
: "${LOBS_BRIDGE_TIMEOUT_MS:=15000}"

export LOBS_BRIDGE_HTTP_URL
export LOBS_BRIDGE_TIMEOUT_MS
