# Config

`openclaw-feishu-botgroup` merges a small `agentHandoff` block into `channels.feishu`.

## Keys

- `maxRounds`: maximum synthetic handoff depth
- `autoReceipt`: whether the delegated bot auto-notifies the source bot that work was received
- `autoComplete`: whether the delegated bot auto-notifies the source bot after the delegated chain is finished
- `taskTemplate`: system prompt injected into delegated tasks
- `receiptTemplate`: visible group message template for accepted status
- `completeTemplate`: visible group message template for completed status

## Alias Mapping

The merge step also updates:

- `agents.list[].name`
- `channels.feishu.accounts.<id>.name`

These names are used for visible `@agent` matching in group chat.
