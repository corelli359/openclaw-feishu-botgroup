# openclaw-feishu-botgroup

[中文文档](./README.zh-CN.md)

`openclaw-feishu-botgroup` is a CLI kit for enabling multi-bot collaboration in Feishu groups with OpenClaw. It patches the local `openclaw-lark` extension, merges a safe handoff block into `~/.openclaw/openclaw.json`, and provides prompt templates for agent collaboration.

## What It Adds

- Bot-to-bot `@agent` routing inside the same Feishu group
- Synthetic handoff when one bot delegates work to another
- Visible `received` and `completed` notices in group chat
- Round limits to prevent callback loops
- Alias support so visible names such as `@Agent-A` can map to `agent-a`

## Prerequisites

Before using this toolkit, you must first install the official Feishu `openclaw-lark` plugin by following the official Feishu guide:

- Official guide: https://www.feishu.cn/content/article/7613711414611463386
- Official install command: `npx -y @larksuite/openclaw-lark-tools install`

This project does not replace the official plugin installation flow. It only adds patches and config on top of an existing local `openclaw-lark` install. If that step is skipped, the `install` command stops during preflight and tells you to run the official install command first.

## Install

After the official plugin is installed, continue with:

After publishing to npm:

```bash
npx openclaw-feishu-botgroup install
npx openclaw-feishu-botgroup merge-config
```

For local development:

```bash
node bin/openclaw-botgroup.js install
node bin/openclaw-botgroup.js merge-config
```

## Commands

```bash
openclaw-botgroup install
openclaw-botgroup install --openclaw-home ~/.openclaw --no-restart
openclaw-botgroup merge-config
openclaw-botgroup print-config-template
openclaw-botgroup print-agent-template
```

- `install`: verifies the official Feishu plugin is installed, then copies the patched `openclaw-lark` files
- `merge-config`: merges the handoff config into `openclaw.json`
- `print-config-template`: prints the JSON config template
- `print-agent-template`: prints the agent prompt template

## Recommended Setup

1. Install `openclaw-lark` using the official Feishu guide.
2. Install the patch.
3. Merge the config template.
4. Copy `templates/agent-collaboration.AGENTS.md` into your agent prompt setup.
5. Restart the gateway.
6. Test `A -> B` and `A -> B -> C` group workflows.

## Repository Layout

- `bin/`: CLI entry point
- `scripts/`: install and merge utilities
- `templates/`: config and prompt templates
- `remote_patch/`: patched `openclaw-lark` source files
- `docs/`: English and Chinese documentation

## Notes

- This is a patch kit, not an upstream OpenClaw release.
- The official Feishu plugin must be installed before this patch kit is used.
- Agent IDs and display names in the repository templates are placeholders; replace them with your own values before use.
- Delegation policy should stay in agent prompts, not in transport code.
- The current template format is plain JSON, not JSON5.
