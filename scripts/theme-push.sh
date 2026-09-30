#!/usr/bin/env bash
# Build, commit, and push the theme to Shopify and git.
set -euo pipefail

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

shopify theme push
git push
