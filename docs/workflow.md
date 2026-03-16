# Workflow

## 中文说明

这里的重点不是让代码决定谁该怎么协作，而是把“基础链路”讲清楚：

- 代码层负责把 `@bot` 解析成目标 agent
- 代码层负责发送 synthetic handoff
- 代码层负责状态通知和轮次限制
- 具体的任务拆分、汇总、回传顺序，应该由 agent 提示词决定

## A -> B

1. A replies with `@B`.
2. The plugin resolves the visible alias back to bot B.
3. A synthetic handoff is dispatched to B.
4. B sends a visible `received` notice to A.
5. B handles the task and replies in group.
6. B sends a visible `completed` notice to A.

## A -> B（中文）

1. A 在群里通过 `@B` 发出协作意图。
2. 插件把可见别名解析回真正的 agent。
3. 系统构造 synthetic handoff，把任务投递给 B。
4. B 可见地向 A 回执“已收到”。
5. B 处理任务并在群里回复结果。
6. B 在链路完成后向 A 回执“已完成”。

## A -> B -> C

1. A delegates to B.
2. B can decide, based on its own prompt rules, whether to delegate part of the task to C.
3. Round count increases on every synthetic handoff.
4. When the configured round limit is reached, the plugin blocks further delegation.

## A -> B -> C（中文）

1. A 先把任务交给 B。
2. B 是否继续拆给 C，不该由代码强制，而应由 B 的提示词决定。
3. 每发生一次 synthetic handoff，轮次就会增加。
4. 到达最大轮次后，系统阻止继续下钻，避免 bot 之间互相回调。

## Responsibility Split

- Code layer: transport, alias resolution, status notices, loop control
- Agent prompt layer: delegation policy, orchestration order, summarization rules

## 分层职责

- 代码层：收发、别名解析、状态通知、循环控制
- agent 提示词层：任务拆分、编排顺序、汇总与回传策略
