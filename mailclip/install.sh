#!/bin/bash
# Install (or `./install.sh -u` to uninstall) the mailclip clipboard helper
# as a LaunchAgent for the CURRENT user. Run it from anywhere; paths resolve
# to this folder. See mailclip.js for what the helper does and why.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.ironshield.mailclip"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_NUM=$(id -u)

if [[ "${1:-}" == "-u" ]]; then
  launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "mailclip removed."
  exit 0
fi

mkdir -p "$DIR/logs" "$HOME/Library/LaunchAgents"
sed "s|__DIR__|$DIR|g" "$DIR/$LABEL.plist.template" > "$PLIST"

# Reload cleanly if it was already running.
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"

echo "mailclip is running (logs: $DIR/logs/mailclip.log)"
echo "Uninstall anytime with: $DIR/install.sh -u"
