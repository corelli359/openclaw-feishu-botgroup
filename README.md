# openclaw-feishu-botgroup

[中文文档](./README.zh-CN.md)

`openclaw-feishu-botgroup` is a CLI kit for enabling multi-bot collaboration in Feishu groups with OpenClaw. It patches the local `openclaw-lark` extension, merges a safe handoff block into `~/.openclaw/openclaw.json`, and provides prompt templates for agent collaboration.

## What It Adds

- Bot-to-bot `@agent` routing inside the same Feishu group
- Synthetic handoff when one bot delegates work to another
- Automatic downstream result return back to the upstream bot
- Visible `received` and `completed` notices in group chat
- Round limits to prevent callback loops
- Alias support so visible names such as `@机器人甲` can map to `agent-a`

## Screenshots

Sequential delegation in one Feishu group:

![Sequential Feishu bot handoff](./assets/1.png)

Final summary returned to the original requester after both subtasks finish:

![Feishu bot final summary](./assets/2.png)

## Prerequisites

Before using this toolkit, you must first install the official Feishu `openclaw-lark` plugin by following the official Feishu guide:

- Official guide: https://www.feishu.cn/content/article/7613711414611463386
- Official install command: `npx -y @larksuite/openclaw-lark-tools install`

This project does not replace the official plugin installation flow. It only adds patches and config on top of an existing local `openclaw-lark` install. If that step is skipped, the `install` command stops during preflight and tells you to run the official install command first.

## Install

After the official plugin is installed, continue with:

After publishing to npm:

```bash
npx openclaw-feishu-botgroup setup
```

For local development:

```bash
node bin/openclaw-botgroup.js setup
```

## Commands

```bash
openclaw-botgroup setup
openclaw-botgroup install
openclaw-botgroup init-config
openclaw-botgroup install --openclaw-home ~/.openclaw --no-restart
openclaw-botgroup merge-config
openclaw-botgroup print-config-template
openclaw-botgroup print-agent-template
```

- `setup`: recommended entry point; patches the plugin, discovers current bots/accounts, scaffolds a local handoff config, and merges it back into `openclaw.json`
- `install`: verifies the official Feishu plugin is installed, then copies the patched `openclaw-lark` files
- `init-config`: discovers current bots/accounts from `openclaw.json` and scaffolds a local handoff config draft
- `merge-config`: merges the local handoff config into `openclaw.json`
- `print-config-template`: prints the safe base `agentHandoff` JSON template
- `print-agent-template`: prints the agent prompt template

## Recommended Setup

1. Install `openclaw-lark` using the official Feishu guide.
2. Run `node bin/openclaw-botgroup.js setup`.
3. During initialization, confirm or fill in each bot's visible name in the Feishu group.
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
- Use `setup` as the primary user flow instead of manually chaining `install`, `init-config`, and `merge-config`.
- `init-config` discovers bots/accounts from your current config, then lets you fill in the visible Feishu bot names.
- Delegation policy should stay in agent prompts, not in transport code.
- The current template format is plain JSON, not JSON5.
