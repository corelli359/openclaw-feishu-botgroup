# Workflow

[中文文档](./workflow.zh-CN.md)

The goal is to keep orchestration policy out of transport code. The code layer should only provide the collaboration pipeline:

- resolve `@bot` into the target agent
- dispatch synthetic handoff events
- emit visible status notices
- enforce round limits

Delegation order, task splitting, and summarization rules should stay in agent prompts.

## A -> B

1. A replies with `@B`.
2. The plugin resolves the visible alias back to bot B.
3. A synthetic handoff is dispatched to B.
4. B sends a visible `received` notice to A.
5. B handles the task and replies in the group.
6. B sends a visible `completed` notice to A.

## A -> B -> C

1. A delegates to B.
2. B decides, from its own prompt rules, whether to delegate part of the task to C.
3. Round count increases on every synthetic handoff.
4. When the configured round limit is reached, further delegation is blocked.

## Responsibility Split

- Code layer: transport, alias resolution, status notices, loop control
- Agent prompt layer: delegation policy, orchestration order, summarization rules
