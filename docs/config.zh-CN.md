# 配置说明

[English](./config.md)

`openclaw-feishu-botgroup` 会把一小段 `agentHandoff` 配置合并到 `channels.feishu.agentHandoff`。推荐流程不是直接手改模板，而是先运行 `openclaw-botgroup setup` 或 `openclaw-botgroup init-config`，从当前配置里发现已有 bot/账号后再生成本地配置。

## 作用

这段配置不负责定义具体业务流程，它只负责 bot 群聊协作所需的基础能力：

- 最大转交轮次
- 自动回执
- 自动完成通知
- 自动失败通知
- synthetic task 的提示模板

如果你使用 `init-config` 生成的本地配置，合并时还会补齐 bot 的可见名称，方便在群里直接使用别名 `@bot`。这里的 `name` 表示飞书里展示出来的 bot 名称。

## 字段

- `maxRounds`：最多允许多少层 synthetic handoff，超过后停止继续转交；它是系统深度限制，不是任务编号
- `autoReceipt`：下游 bot 接到任务后，是否自动通知上游 bot“已收到”
- `autoComplete`：下游 bot 完成当前链路后，是否自动通知上游 bot“已完成”
- `taskTemplate`：注入给下游 bot 的系统提示模板
- `receiptTemplate`：“已收到”状态消息模板
- `completeTemplate`：“已完成”状态消息模板
- `failureTemplate`：“处理失败”状态消息模板

## 别名映射

合并时还会更新：

- `agents.list[].name`
- `channels.feishu.accounts.<id>.name`

这两类名称都会参与群聊里的 `@agent` 匹配。例如群里出现 `@机器人甲`，最终可以被解析回 `agent-a`。

## 推荐旅程

1. 先安装飞书官方 `openclaw-lark` 插件。
2. 再运行 `openclaw-botgroup setup`。
3. 初始化阶段会读取当前 `openclaw.json`，发现已有 bot/账号，并让你填写群内展示名。
4. 工具会把本地 handoff 配置写到 `~/.openclaw/feishu-agent-handoff.config.json`，然后再合并回 `openclaw.json`。
