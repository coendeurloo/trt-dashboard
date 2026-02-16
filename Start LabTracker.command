#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! "$PROJECT_DIR/scripts/start-server.sh" --open; then
  osascript -e 'display alert "LabTracker app start mislukt" message "Controleer of Node.js is geinstalleerd en probeer opnieuw." as critical'
  exit 1
fi
