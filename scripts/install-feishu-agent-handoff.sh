#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
PLUGIN_DIR="${PLUGIN_DIR:-$OPENCLAW_HOME/extensions/openclaw-lark}"
PATCH_ROOT="${PATCH_ROOT:-$REPO_ROOT/remote_patch/openclaw-lark}"
BACKUP_DIR="${BACKUP_DIR:-$OPENCLAW_HOME/backups/openclaw-lark-oneclick-$(date +%Y%m%d-%H%M%S)}"
RESTART_GATEWAY="${RESTART_GATEWAY:-1}"

FILES=(
  "src/messaging/inbound/dispatch.js"
  "src/messaging/shared/agent-mentions.js"
  "src/card/reply-dispatcher.js"
)

if [[ ! -d "$PLUGIN_DIR" ]]; then
  echo "Plugin directory not found: $PLUGIN_DIR" >&2
  exit 1
fi

if [[ ! -d "$PATCH_ROOT" ]]; then
  echo "Patch root not found: $PATCH_ROOT" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

for rel in "${FILES[@]}"; do
  src="$PATCH_ROOT/$rel"
  dst="$PLUGIN_DIR/$rel"

  if [[ ! -f "$src" ]]; then
    echo "Missing patch file: $src" >&2
    exit 1
  fi

  if [[ ! -f "$dst" ]]; then
    echo "Missing target file: $dst" >&2
    exit 1
  fi

  mkdir -p "$(dirname "$BACKUP_DIR/$rel")"
  cp "$dst" "$BACKUP_DIR/$rel"
  cp "$src" "$dst"
  echo "Patched: $dst"
done

echo "Backup saved to: $BACKUP_DIR"

if [[ "$RESTART_GATEWAY" == "1" ]]; then
  if systemctl --user status openclaw-gateway.service >/dev/null 2>&1; then
    systemctl --user restart openclaw-gateway.service
    echo "Restarted: openclaw-gateway.service"
  else
    echo "Skipped restart: systemd user service openclaw-gateway.service not found"
  fi
fi

echo
echo "Suggested next steps:"
echo "1. Merge templates/feishu-agent-handoff.config.json into ~/.openclaw/openclaw.json"
echo "   node scripts/merge-feishu-agent-handoff-config.js"
echo "2. Add templates/agent-collaboration.AGENTS.md rules into each agent prompt file"
echo "3. Run: openclaw gateway status --deep"
