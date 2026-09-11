#!/usr/bin/env bash
# PreToolUse(Bash): a commit or push must be preceded by a green check suite.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

payload=$(cat)
cmd=$(printf '%s' "$payload" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try { const j=JSON.parse(s); process.stdout.write(j.tool_input?.command ?? ''); }
  catch { process.stdout.write(''); }
});" 2>/dev/null)

case "$cmd" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

# Skip when there is nothing to check yet (fresh clone without deps).
[ -d node_modules ] || exit 0

if ! out=$(npm run -s check 2>&1); then
  printf 'npm run check failed — fix this before committing or pushing:\n%s\n' "$out" >&2
  exit 2
fi

exit 0
