# Config

[中文文档](./config.zh-CN.md)

`openclaw-feishu-botgroup` merges a small `agentHandoff` block into `channels.feishu.agentHandoff`.

## Purpose

This block provides infrastructure for group collaboration. It does not define business orchestration. Its scope is:

- maximum handoff depth
- automatic receipt notices
- automatic completion notices
- synthetic task prompt templates

The merge step also fills visible bot names so group mentions can match aliases.

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
