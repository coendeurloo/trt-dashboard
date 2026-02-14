#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
NODE_BIN=$("$PROJECT_DIR/scripts/find-node.sh" || true)
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "Node runtime not found. Install Node.js first." >&2
  echo "Tip: install Node LTS via https://nodejs.org or Homebrew, then retry." >&2
  exit 1
fi

exec "$NODE_BIN" "$PROJECT_DIR/scripts/server-control.mjs" stop "$@"
