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

# The generated data is split by season: index.json says which seasons exist and which one the
# app opens, and that season's meta.json carries the dataVersion.
if [ -f public/data/index.json ]; then
  summary=$(node -e "
    try {
      const index = require('./public/data/index.json');
      const list = index.seasons.map((s) => s.id + (s.provisional ? '(provisional)' : '')).join(', ');
      const meta = require('./public/data/md' + index.default + '/meta.json');
      process.stdout.write('seasons ' + list + ', open md' + index.default + ' dataVersion=' + (meta.dataVersion ?? '?'));
    } catch (error) {
      process.stdout.write('unreadable — run: npm run data:build');
    }
  " 2>/dev/null)
  echo "[session-start] generated data: ${summary:-unreadable}"
else
  echo "[session-start] public/data is empty — run: npm run data:build"
fi

if [ -d data/raw/static ] && [ -n "$(ls -A data/raw/static 2>/dev/null)" ]; then
  echo "[session-start] vendored static data present"
else
  echo "[session-start] data/raw/static missing — run: npm run data:fetch (needs network)"
fi

exit 0
