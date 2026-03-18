#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
PLUGIN_DIR="${PLUGIN_DIR:-$OPENCLAW_HOME/extensions/openclaw-lark}"
PATCH_ROOT="${PATCH_ROOT:-$REPO_ROOT/remote_patch/openclaw-lark}"
BACKUP_DIR="${BACKUP_DIR:-$OPENCLAW_HOME/backups/openclaw-lark-oneclick-$(date +%Y%m%d-%H%M%S)}"
RESTART_GATEWAY="${RESTART_GATEWAY:-1}"
OFFICIAL_PLUGIN_GUIDE="https://www.feishu.cn/content/article/7613711414611463386"
OFFICIAL_PLUGIN_INSTALL_CMD="npx -y @larksuite/openclaw-lark-tools install"

PATCH_FILES=(
  "src/messaging/inbound/dispatch.js"
  "src/messaging/shared/agent-mentions.js"
  "src/card/reply-dispatcher.js"
)

print_official_plugin_help() {
  echo "Install the official Feishu plugin first:" >&2
  echo "  $OFFICIAL_PLUGIN_INSTALL_CMD" >&2
  echo "Guide:" >&2
  echo "  $OFFICIAL_PLUGIN_GUIDE" >&2
}

verify_official_plugin() {
  local rel
  local missing=()

  if [[ ! -d "$PLUGIN_DIR" ]]; then
    echo "Official Feishu plugin not detected: $PLUGIN_DIR" >&2
    print_official_plugin_help
    exit 1
  fi

  for rel in "${PATCH_FILES[@]}"; do
    if [[ ! -f "$PLUGIN_DIR/$rel" ]]; then
      missing+=("$rel")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    echo "Official Feishu plugin installation looks incomplete or incompatible: $PLUGIN_DIR" >&2
    echo "Missing required plugin files:" >&2
    for rel in "${missing[@]}"; do
      echo "  - $rel" >&2
    done
    print_official_plugin_help
    exit 1
  fi
}

if [[ ! -d "$PATCH_ROOT" ]]; then
  echo "Patch root not found: $PATCH_ROOT" >&2
  exit 1
fi

verify_official_plugin

mkdir -p "$BACKUP_DIR"

for rel in "${PATCH_FILES[@]}"; do
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

if [[ "${OPENCLAW_BOTGROUP_SETUP:-0}" != "1" ]]; then
  echo
  echo "Suggested next steps:"
  echo "1. Initialize a local handoff config from your current OpenClaw bots/accounts"
  echo "   node bin/openclaw-feishu-botgroup.js init-config"
  echo "2. Review the generated ~/.openclaw/feishu-agent-handoff.config.json"
  echo "3. Merge that local config into ~/.openclaw/openclaw.json"
  echo "   node bin/openclaw-feishu-botgroup.js merge-config ~/.openclaw/openclaw.json ~/.openclaw/feishu-agent-handoff.config.json"
  echo "4. Add templates/agent-collaboration.AGENTS.md rules into each agent prompt file"
  echo "5. Run: openclaw gateway status --deep"
fi
