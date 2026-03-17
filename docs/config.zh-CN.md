# 配置说明

[English](./config.md)

`openclaw-feishu-botgroup` 会把一小段 `agentHandoff` 配置合并到 `channels.feishu.agentHandoff`。

## 作用

这段配置不负责定义具体业务流程，它只负责 bot 群聊协作所需的基础能力：

- 最大转交轮次
- 自动回执
- 自动完成通知
- synthetic task 的提示模板

合并脚本还会顺手补齐 bot 的可见名称，方便在群里直接使用别名 `@bot`。仓库里附带的 `机器人甲`、`agent-a` 之类名称只是占位符，其中 `name` 表示飞书里展示出来的 bot 名称，需要替换成你自己的实际值。

## 字段

- `maxRounds`：最多允许多少轮 synthetic handoff，超过后停止继续转交
- `autoReceipt`：下游 bot 接到任务后，是否自动通知上游 bot“已收到”
- `autoComplete`：下游 bot 完成当前链路后，是否自动通知上游 bot“已完成”
- `taskTemplate`：注入给下游 bot 的系统提示模板
- `receiptTemplate`：“已收到”状态消息模板
- `completeTemplate`：“已完成”状态消息模板

## 别名映射

合并时还会更新：

- `agents.list[].name`
- `channels.feishu.accounts.<id>.name`

这两类名称都会参与群聊里的 `@agent` 匹配。例如群里出现 `@机器人甲`，最终可以被解析回 `agent-a`。
