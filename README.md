# openclaw-feishu-botgroup

[中文文档](./README.zh-CN.md)

`openclaw-feishu-botgroup` is a CLI kit for enabling multi-bot collaboration in Feishu groups with OpenClaw. It patches the local `openclaw-lark` extension, merges a safe handoff block into `~/.openclaw/openclaw.json`, and provides prompt templates for agent collaboration.

## What It Adds

- Bot-to-bot `@agent` routing inside the same Feishu group
- Synthetic handoff when one bot delegates work to another
- Visible `received` and `completed` notices in group chat
- Round limits to prevent callback loops
- Alias support so visible names such as `@Conductor` can map to `zhihui`

## Install

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

- `install`: copies the patched `openclaw-lark` files
- `merge-config`: merges the handoff config into `openclaw.json`
- `print-config-template`: prints the JSON config template
- `print-agent-template`: prints the agent prompt template

## Recommended Setup

1. Install the patch.
2. Merge the config template.
3. Copy `templates/agent-collaboration.AGENTS.md` into your agent prompt setup.
4. Restart the gateway.
5. Test `A -> B` and `A -> B -> C` group workflows.

## Repository Layout

- `bin/`: CLI entry point
- `scripts/`: install and merge utilities
- `templates/`: config and prompt templates
- `remote_patch/`: patched `openclaw-lark` source files
- `docs/`: English and Chinese documentation

## Notes

- This is a patch kit, not an upstream OpenClaw release.
- Delegation policy should stay in agent prompts, not in transport code.
- The current template format is plain JSON, not JSON5.
