# Config

[中文文档](./config.zh-CN.md)

`openclaw-feishu-botgroup` merges a small `agentHandoff` block into `channels.feishu.agentHandoff`. The recommended flow is not to hand-edit the repository template directly, but to run `openclaw-botgroup setup` or `openclaw-botgroup init-config` so the local config is scaffolded from your current bots/accounts first.

## Purpose

This block provides infrastructure for group collaboration. It does not define business orchestration. Its scope is:

- maximum handoff depth
- automatic receipt notices
- automatic completion notices
- synthetic task prompt templates

If you merge a local config produced by `init-config`, the merge step also fills visible bot names so group mentions can match aliases. Here, `name` means the bot name shown in Feishu.

## Keys

- `maxRounds`: maximum synthetic handoff depth
- `autoReceipt`: whether the delegated bot notifies the source bot when work is received
- `autoComplete`: whether the delegated bot notifies the source bot when the delegated chain completes
- `taskTemplate`: system prompt injected into delegated tasks
- `receiptTemplate`: visible group message template for accepted status
- `completeTemplate`: visible group message template for completed status

## Alias Mapping

The merge step also updates:

- `agents.list[].name`
- `channels.feishu.accounts.<id>.name`

These visible names are used for `@agent` matching in group chat.

## Recommended Flow

1. Install the official Feishu `openclaw-lark` plugin first.
2. Run `openclaw-botgroup setup`.
3. During initialization, the tool reads your current `openclaw.json`, discovers existing bots/accounts, and prompts for visible Feishu names.
4. The tool writes a local handoff config to `~/.openclaw/feishu-agent-handoff.config.json`, then merges it back into `openclaw.json`.
