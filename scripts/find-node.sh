#!/bin/sh
set -eu

first_non_empty_line() {
  awk 'NF { print; exit }'
}

is_executable_file() {
  [ -n "${1:-}" ] && [ -x "$1" ]
}

resolve_with_shell() {
  shell_path="$1"
  if [ ! -x "$shell_path" ]; then
    return 1
  fi

  node_path=$("$shell_path" -lic "command -v node 2>/dev/null || true" 2>/dev/null | first_non_empty_line || true)
  if is_executable_file "$node_path"; then
    printf "%s\n" "$node_path"
    return 0
  fi

  return 1
}

if command -v node >/dev/null 2>&1; then
  command -v node
  exit 0
fi

for candidate in \
  /opt/homebrew/bin/node \
  /usr/local/bin/node \
  "$HOME/.volta/bin/node" \
  "$HOME/.fnm/current/bin/node"
do
  if is_executable_file "$candidate"; then
    printf "%s\n" "$candidate"
    exit 0
  fi
done

if resolve_with_shell /bin/zsh; then
  exit 0
fi

if resolve_with_shell /bin/bash; then
  exit 0
fi

if [ -s "$HOME/.nvm/nvm.sh" ] && [ -x /bin/bash ]; then
  node_path=$(
    /bin/bash -lc \
      'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; command -v node 2>/dev/null || true' \
      2>/dev/null | first_non_empty_line || true
  )
  if is_executable_file "$node_path"; then
    printf "%s\n" "$node_path"
    exit 0
  fi
fi

exit 1
