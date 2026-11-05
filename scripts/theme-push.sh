#!/usr/bin/env bash
# Build, commit, and push the theme to Shopify and git.
set -euo pipefail

# Stop if live has code changes that aren't in this repo.
if ! ./scripts/theme-sync-check.sh; then
  echo
  read -r -p "Live differs from local (see above). Push anyway? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

npm run build

git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git status --short
  read -r -p "Commit message: " message
  if [ -z "$message" ]; then
    echo "Aborted: empty commit message."
    exit 1
  fi
  git commit -m "$message"
fi

# --nodelete: never remove files on Shopify that are missing locally
shopify theme push --nodelete
git push
