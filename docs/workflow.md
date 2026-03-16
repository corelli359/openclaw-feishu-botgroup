# Workflow

## A -> B

1. A replies with `@B`.
2. The plugin resolves the visible alias back to bot B.
3. A synthetic handoff is dispatched to B.
4. B sends a visible `received` notice to A.
5. B handles the task and replies in group.
6. B sends a visible `completed` notice to A.

## A -> B -> C

1. A delegates to B.
2. B can decide, based on its own prompt rules, whether to delegate part of the task to C.
3. Round count increases on every synthetic handoff.
4. When the configured round limit is reached, the plugin blocks further delegation.

## Responsibility Split

- Code layer: transport, alias resolution, status notices, loop control
- Agent prompt layer: delegation policy, orchestration order, summarization rules
