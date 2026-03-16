# Config

`openclaw-feishu-botgroup` merges a small `agentHandoff` block into `channels.feishu`.

## 中文说明

这个配置块会被合并到：

`channels.feishu.agentHandoff`

它的职责不是决定具体业务流程，而是提供 bot 群聊协作的基础设施能力：

- 最大转交轮次
- 自动回执
- 自动完成通知
- synthetic task 的提示模板

另外，合并脚本还会顺手补齐 bot 可见名称，方便在群里直接 `@指挥家`、`@男高音` 这种别名。

## Keys

- `maxRounds`: maximum synthetic handoff depth
- `autoReceipt`: whether the delegated bot auto-notifies the source bot that work was received
- `autoComplete`: whether the delegated bot auto-notifies the source bot after the delegated chain is finished
- `taskTemplate`: system prompt injected into delegated tasks
- `receiptTemplate`: visible group message template for accepted status
- `completeTemplate`: visible group message template for completed status

## 字段说明

- `maxRounds`
  控制最多允许多少轮 synthetic handoff。超过后会停止继续转交。
- `autoReceipt`
  下游 bot 接到任务后，是否自动在群里 `@` 上游 bot，告知“已收到”。
- `autoComplete`
  下游 bot 完成当前链路后，是否自动在群里 `@` 上游 bot，告知“已完成”。
- `taskTemplate`
  注入给下游 bot 的系统提示模板。
- `receiptTemplate`
  “已收到”状态消息模板。
- `completeTemplate`
  “已完成”状态消息模板。

## Alias Mapping

The merge step also updates:

- `agents.list[].name`
- `channels.feishu.accounts.<id>.name`

These names are used for visible `@agent` matching in group chat.

## 中文别名说明

合并时还会更新下面两类名称：

- `agents.list[].name`
- `channels.feishu.accounts.<id>.name`

这两个名称会一起参与 bot 别名解析。也就是说，群里出现的 `@指挥家` 最终能被映射回 `zhihui`。
