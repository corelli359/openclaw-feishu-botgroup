# npm / npx 发布与隐私检查

本文档整理了 `openclaw-feishu-botgroup` 当前的发布状态、推荐发布流程，以及一次面向“通用性”和“隐私泄露风险”的发布前检查结果。

截至 2026-03-18，本检查基于当前仓库 `main` 分支完成。

## 当前状态

- 包名：`openclaw-feishu-botgroup`
- CLI 命令：`openclaw-botgroup`
- 当前版本：`0.1.1`
- `npm pack --dry-run` 已通过
- `npm view openclaw-feishu-botgroup version` 返回 `404`

最后一条说明在检查时，npm 官方仓库里还没有同名包。这个状态可能变化，正式发布前应再检查一次。

## 当前结论

可以发布，但建议先看完下面两类问题：

1. 发布流程本身已经基本齐备，缺的主要是 npm 账号登录、版本管理和正式 `npm publish`。
2. 代码层面目前没有发现明文密码、API Key、SSH 私钥、服务器 IP、绝对本机路径等直接敏感信息，但仍有两类需要你确认是否接受：
   - 截图文件里有可见聊天身份和会话内容。
   - 仓库元数据链接仍然会暴露 GitHub 用户名，因为仓库本身就在当前 GitHub 账号名下。

## 发布前检查结果

### 1. 通用性检查

检查结论：当前代码是通用的，没有发现写死你当前线上 bot 的逻辑。

主要依据：

- agent 发现逻辑来自当前 `openclaw.json`，不是硬编码 bot 列表。
- mention 解析走的是动态目录构建，不依赖固定 bot 名。
- handoff / result return 逻辑按 `agentId`、`accountId`、bindings 和当前配置运行，不依赖你的 VPS 环境。
- 默认路径使用的是 `~/.openclaw`，这是工具默认约定，不是你机器的绝对个人路径。

已检查的关键文件包括：

- `bin/openclaw-botgroup.js`
- `scripts/init-feishu-agent-handoff-config.js`
- `scripts/merge-feishu-agent-handoff-config.js`
- `remote_patch/openclaw-lark/src/messaging/inbound/dispatch.js`
- `remote_patch/openclaw-lark/src/messaging/shared/agent-mentions.js`

### 2. 敏感信息检查

已扫描已跟踪文本文件中的以下风险项：

- `sk-...` 形式的 key
- `appSecret`
- `apiKey`
- `token`
- `password`
- 固定服务器 IP
- 绝对本机路径，如 `/Users/...`
- 绝对 VPS 路径，如 `/root/...`
- 你这次测试用过的 bot 名和 agent id

当前结果：

- 没发现明文密码、明文 API Key、明文 appSecret、SSH 私钥或固定服务器 IP。
- 没发现你本机的绝对路径进入已跟踪代码文件。
- 没发现你 VPS 的配置文件、令牌或密钥被提交进仓库。

### 3. 仍需你确认的隐私点

以下内容不属于“密码泄露”，但仍然可能暴露身份或测试环境信息：

- `assets/1.png`
- `assets/2.png`

这两张截图里可以直接看到：

- 飞书会话内容
- 群里的 bot 显示名
- 一个用户标识 `user245074`

如果你希望 npm 页面和 GitHub 仓库都尽量脱敏，建议在正式发布前把截图里的身份标识打码，或者替换成演示环境截图。

另外，以下文件里仍然能看到当前 GitHub 用户名：

- `package.json`
- `LICENSE`

其中：

- `package.json` 里的 `author` 当前保留为 `corelli359`。
- `homepage`、`repository`、`bugs` 仍会指向当前 GitHub 仓库，因此会自然暴露当前 GitHub 用户名。
- `LICENSE` 里的 copyright 目前也是当前用户名。

这部分不是“密钥泄露”，但如果你希望 npm 包元数据里也完全不出现当前用户名，建议：

1. 先把仓库迁移到 GitHub 组织或一个专门的发布账号。
2. 再更新 `package.json` 里的 `homepage`、`repository`、`bugs`。
3. 最后再决定是否调整 `LICENSE` 里的 copyright 表述。

## 推荐发布流程

### 1. 先检查 npm 登录状态

```bash
npm login
npm whoami
```

如果 `npm whoami` 能返回你的 npm 用户名，说明登录状态正常。

### 2. 再检查包名是否仍可用

```bash
npm view openclaw-feishu-botgroup version
```

如果仍然返回 `404`，一般表示同名包还未被占用。

### 3. 做一次本地打包预演

```bash
NPM_CONFIG_CACHE=/tmp/openclaw-npm-cache npm pack --dry-run
```

这里显式指定 `NPM_CONFIG_CACHE`，是因为当前这台机器的 `~/.npm` 目录有历史权限问题。这个问题属于本机 npm 环境，不是仓库本身的问题。

如果你想长期修复本机 npm 缓存权限，再单独处理 `~/.npm` 的 owner 即可。

### 4. 确认版本号

当前版本是 `0.1.1`。如果你准备发布这一版，可以直接发布；如果还想补小改动，先升版本：

```bash
npm version patch
git push --follow-tags
```

### 5. 正式发布

当前包名是不带 scope 的公开包，命令一般是：

```bash
NPM_CONFIG_CACHE=/tmp/openclaw-npm-cache npm publish
```

如果后面改成 scoped package，再按 npm 的 scoped public package 规则补 `--access public`。

### 6. 发布后验证

发布完成后，建议立即验证：

```bash
npm view openclaw-feishu-botgroup version
npx openclaw-feishu-botgroup help
npx openclaw-feishu-botgroup setup --help
```

预期行为：

- `npm view` 能看到刚发布的版本号
- `npx openclaw-feishu-botgroup help` 能拉起 CLI
- `setup --help` 或 `help` 能正常显示说明

## `npm` 与 `npx` 的实际使用方式

发布后，用户有两种常见使用方式。

### 方式一：直接用 `npx`

```bash
npx openclaw-feishu-botgroup setup
```

### 方式二：全局安装后再执行命令

```bash
npm i -g openclaw-feishu-botgroup
openclaw-botgroup setup
```

注意这里有两个名字：

- npm 包名：`openclaw-feishu-botgroup`
- 安装后的 CLI 命令：`openclaw-botgroup`

## 建议你在正式发布前再确认一次的事项

1. 是否接受截图里当前显示的用户标识和 bot 名。
2. 是否接受 npm 页面继续通过仓库链接暴露当前 GitHub 用户名。
3. 发布后 npm 页面里的 README 图片是否正常显示。

第三点要单独强调一下：

- 当前 README 使用的是相对路径图片：`./assets/1.png`、`./assets/2.png`
- 当前建议把 `assets` 一并纳入 npm 包内容

这不影响 GitHub 仓库展示，但发布到 npm 后，README 图片是否完全按预期显示，建议你在第一版发布后立即实测。

如果 npm 页面图片显示不正常，通常有两个解决方向：

1. 把 README 图片改成 GitHub 的绝对地址。
2. 把 `assets` 加入 `package.json` 的 `files`。

## 官方参考

- https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages
- https://docs.npmjs.com/cli/v11/configuring-npm/package-json
- https://docs.npmjs.com/trusted-publishers

## 下一步建议

如果你决定继续，我建议按这个顺序走：

1. 先确认截图和 GitHub 用户名暴露是否可接受。
2. 再决定要不要补一版“脱敏”修改。
3. 然后我再帮你补最终发布版：
   - 调整 npm README 图片策略
   - 检查 `package.json` 最终元数据
   - 确认版本号
   - 准备正式 `npm publish`
