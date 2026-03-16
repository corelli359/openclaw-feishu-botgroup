# openclaw-feishu-botgroup

帮助 OpenClaw 在飞书群中实现 bot 与 bot 的群聊协作。

`openclaw-feishu-botgroup` is a small CLI kit for enabling Feishu bot-group collaboration in OpenClaw. It patches the `openclaw-lark` extension, merges safe handoff config into `~/.openclaw/openclaw.json`, and provides agent prompt templates for multi-bot group chat.

## What It Adds

- Feishu bot-to-bot `@agent` routing inside the same group
- Synthetic agent handoff when bot A delegates work to bot B
- Automatic visible status messages for `received` and `completed`
- Configurable handoff round limit to prevent callback loops
- Name alias support, so `@指挥家` can map back to `zhihui`

## Install

Use `npx` after publish:

```bash
npx openclaw-feishu-botgroup install
npx openclaw-feishu-botgroup merge-config
```

Or run locally from the repository:

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

## Recommended Setup

1. Patch the local `openclaw-lark` extension.
2. Merge `templates/feishu-agent-handoff.config.json` into `~/.openclaw/openclaw.json`.
3. Copy `templates/agent-collaboration.AGENTS.md` rules into each agent prompt file.
4. Restart the gateway and test `A -> B` and `A -> B -> C` group workflows.

## Repository Layout

- `bin/`: CLI entry point
- `scripts/`: install and config merge scripts
- `templates/`: JSON config and agent prompt templates
- `remote_patch/`: patched `openclaw-lark` source files
- `docs/`: config and workflow notes

## Notes

- This project patches `openclaw-lark`; it is not an official upstream release.
- Handoff strategy should stay in agent prompts. The code layer should only provide transport, alias mapping, notices, and round control.
- Current config template is plain JSON, not JSON5.
