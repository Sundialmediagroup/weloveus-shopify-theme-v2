#!/usr/bin/env bash
# Compare the live theme against local files before pushing.
# Flags code files that exist only on live (e.g. AI blocks made in the editor)
# and files whose live version differs from local. Files in .shopifyignore
# (merchant curation) are skipped. Exits 1 if anything needs attention.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Checking live theme for changes made outside this repo..."
shopify theme pull --live --path "$TMP" --no-color < /dev/null > "$TMP.log" 2>&1 || {
  cat "$TMP.log"; rm -f "$TMP.log"
  echo "Could not pull the live theme."; exit 1
}
rm -f "$TMP.log"

# Load .shopifyignore patterns (skip blanks and comments)
patterns=()
while IFS= read -r line || [ -n "$line" ]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  patterns+=("$line")
done < "$ROOT/.shopifyignore"

is_ignored() {
  local f="$1" p
  for p in "${patterns[@]}"; do
    # shellcheck disable=SC2053
    [[ "$f" == $p ]] && return 0
  done
  return 1
}

# Strip the auto-generated /* ... */ header Shopify adds to JSON files
normalize() {
  if [[ "$1" == *.json ]]; then sed '/^\/\*/,/\*\//d' "$1"; else cat "$1"; fi
}

only_live=()
differs=()
while IFS= read -r f; do
  f="${f#./}"
  is_ignored "$f" && continue
  if [ ! -f "$ROOT/$f" ]; then
    only_live+=("$f")
  elif ! diff -q <(normalize "$TMP/$f") <(normalize "$ROOT/$f") > /dev/null; then
    differs+=("$f")
  fi
done < <(cd "$TMP" && find . -type f ! -name '.DS_Store' | sort)

status=0
if [ ${#only_live[@]} -gt 0 ]; then
  status=1
  echo
  echo "Only on live (made in the editor?) — pull these into the repo:"
  printf '  %s\n' "${only_live[@]}"
  echo "  e.g. shopify theme pull --live --only \"${only_live[0]}\""
fi
if [ ${#differs[@]} -gt 0 ]; then
  status=1
  echo
  echo "Different on live vs local (expected if these are your edits;"
  echo "otherwise someone changed them on live and pushing will overwrite):"
  printf '  %s\n' "${differs[@]}"
fi

[ $status -eq 0 ] && echo "Live theme matches local code."
exit $status
