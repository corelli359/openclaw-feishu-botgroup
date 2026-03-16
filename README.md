# openclaw-feishu-botgroup

帮助 OpenClaw 在飞书群中实现 bot 与 bot 的群聊协作。

`openclaw-feishu-botgroup` is a small CLI kit for enabling Feishu bot-group collaboration in OpenClaw. It patches the `openclaw-lark` extension, merges safe handoff config into `~/.openclaw/openclaw.json`, and provides agent prompt templates for multi-bot group chat.

## 中文说明

这个项目的目标很直接：

- 让多个飞书 bot 可以在同一个群里互相 `@`
- 让 bot A 可以把任务转交给 bot B
- 让 bot B 在群里可见地回执“已收到”“已完成”
- 通过轮次限制避免 bot 之间互相回调导致失控
- 用配置和提示词模板，而不是让用户反复手改源码

它本质上是一个 CLI 工具包，不是单独的飞书 webhook 服务。它会：

1. patch 本地 `openclaw-lark`
2. 把安全的 handoff 配置合并进 `~/.openclaw/openclaw.json`
3. 提供 agent 协作提示词模板

## What It Adds

- Feishu bot-to-bot `@agent` routing inside the same group
- Synthetic agent handoff when bot A delegates work to bot B
- Automatic visible status messages for `received` and `completed`
- Configurable handoff round limit to prevent callback loops
- Name alias support, so `@指挥家` can map back to `zhihui`

## 安装

发布到 npm 后可以直接用：

```bash
npx openclaw-feishu-botgroup install
npx openclaw-feishu-botgroup merge-config
```

如果你是在本地仓库里调试：

```bash
node bin/openclaw-botgroup.js install
node bin/openclaw-botgroup.js merge-config
```

## Install

Use `npx` after publish:

```bash
npx openclaw-feishu-botgroup install
npx openclaw-feishu-botgroup merge-config
```

Or run locally from the repository:

```bash
node bin/openclaw-botgroup.js install
node bin/openclaw-botgroup.js merge-config
```

## 常用命令

```bash
openclaw-botgroup install
openclaw-botgroup install --openclaw-home ~/.openclaw --no-restart
openclaw-botgroup merge-config
openclaw-botgroup print-config-template
openclaw-botgroup print-agent-template
```

说明：

- `install`: 覆盖本地 `openclaw-lark` 的 patch 文件
- `merge-config`: 把 botgroup 配置定点合并进 `openclaw.json`
- `print-config-template`: 打印 JSON 配置模板
- `print-agent-template`: 打印 agent 协作提示词模板

## Commands

```bash
openclaw-botgroup install
openclaw-botgroup install --openclaw-home ~/.openclaw --no-restart
openclaw-botgroup merge-config
openclaw-botgroup print-config-template
openclaw-botgroup print-agent-template
```

## 推荐使用步骤

1. 先执行 patch 安装
2. 再执行配置合并
3. 把 `templates/agent-collaboration.AGENTS.md` 里的规则放进各自 agent 的提示词
4. 重启 gateway
5. 在群里测试 `A -> B` 和 `A -> B -> C`

## Recommended Setup

1. Patch the local `openclaw-lark` extension.
2. Merge `templates/feishu-agent-handoff.config.json` into `~/.openclaw/openclaw.json`.
3. Copy `templates/agent-collaboration.AGENTS.md` rules into each agent prompt file.
4. Restart the gateway and test `A -> B` and `A -> B -> C` group workflows.

## 目录结构

- `bin/`: CLI 入口
- `scripts/`: 安装脚本和配置合并脚本
- `templates/`: JSON 模板和 agent 提示词模板
- `remote_patch/`: patch 后的 `openclaw-lark` 源文件
- `docs/`: 配置说明和流程说明

## Repository Layout

- `bin/`: CLI entry point
- `scripts/`: install and config merge scripts
- `templates/`: JSON config and agent prompt templates
- `remote_patch/`: patched `openclaw-lark` source files
- `docs/`: config and workflow notes

## 说明

- 这不是官方 upstream release，而是一套 patch kit + CLI 包装
- 协作顺序、汇总策略、是否继续下钻，应该写在 agent 提示词里
- 代码层只负责收发、别名解析、状态通知和轮次控制
- 目前配置模板是标准 `JSON`，不是 `JSON5`

## Notes

- This project patches `openclaw-lark`; it is not an official upstream release.
- Handoff strategy should stay in agent prompts. The code layer should only provide transport, alias mapping, notices, and round control.
- Current config template is plain JSON, not JSON5.
