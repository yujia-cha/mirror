#!/usr/bin/env bash
# SessionStart: make the repo runnable and tell the agent what state the data is in.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

if [ ! -d node_modules ]; then
  echo "[session-start] node_modules missing — running npm ci"
  npm ci --no-audit --no-fund >/dev/null 2>&1 \
    && echo "[session-start] npm ci done" \
    || echo "[session-start] npm ci FAILED — run it manually"
fi

echo "[session-start] node $(node -v 2>/dev/null || echo '?')"

if [ -f public/data/meta.json ]; then
  version=$(node -e "try{process.stdout.write(require('./public/data/meta.json').dataVersion??'?')}catch{process.stdout.write('?')}" 2>/dev/null)
  echo "[session-start] generated data: dataVersion=${version}"
else
  echo "[session-start] public/data is empty — run: npm run data:build"
fi

if [ -d data/raw/static ] && [ -n "$(ls -A data/raw/static 2>/dev/null)" ]; then
  echo "[session-start] vendored static data present"
else
  echo "[session-start] data/raw/static missing — run: npm run data:fetch (needs network)"
fi

exit 0
