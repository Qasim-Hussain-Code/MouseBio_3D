#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x .tools/node/bin/node ]; then
  export PATH="$PWD/.tools/node/bin:$PATH"
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22.12+ or run bash scripts/setup_node.sh.' >&2
  exit 1
fi
export npm_config_cache="$PWD/.npm-cache"
exec npm "$@"
