#!/bin/zsh
# Runs one report on a schedule, logs it, and posts a macOS notification.
# launchd calls this with `daily` or `weekly` (~/Library/LaunchAgents/com.weloveus.report-*.plist).

cd "${0:A:h}/.." || exit 1
mkdir -p reports/logs

log="reports/logs/$1.log"
print "\n── $(date '+%Y-%m-%d %H:%M') ──" >> "$log"

if npm run --silent report -- "$1" >> "$log" 2>&1; then
  file=$(grep -o 'reports/[a-z]*/[^ ]*\.md' "$log" | tail -1)
  osascript -e "display notification \"$file\" with title \"WeLoveUs $1 report ready\""
else
  osascript -e "display notification \"See $log\" with title \"WeLoveUs $1 report failed\""
  exit 1
fi
