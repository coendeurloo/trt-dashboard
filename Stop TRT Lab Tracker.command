#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! "$PROJECT_DIR/scripts/stop-server.sh"; then
  osascript -e 'display alert "TRT app stop mislukt" message "Kon de server niet netjes stoppen."'
  exit 1
fi
