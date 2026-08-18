# Fork 基线验证记录

本文件记录 `packages/deepseek-harness` fork 的基线构建/typecheck/测试结果，
供后续补丁与上游同步时回归对比。当前台账见
[packages/deepseek-harness/PATCHES.md](../packages/deepseek-harness/PATCHES.md)。

## 基线

- 上游:`deepseek-ai/deepseek-harness`
- tag:`dsh-v0.1.0-rc.7` @ `99f6f02`
- runtime family:`0.1.0-rc.7`(根目录 `upstream.json`)
- 补丁状态:零补丁

## 验证环境

- 主机:macOS arm64(darwin / arm64)
- fork 包管理:pnpm 11.7.0(按 fork 自身 `packageManager` 解析)
- 安装方式:`pnpm install --ignore-scripts`(避免 fork lefthook postinstall 污染外层 git hooks)

## 结果

| 命令 | 结果 |
|---|---|
| `pnpm run build` | 通过 |
| `pnpm run typecheck` | 通过 |
| `pnpm run test` | 通过(0 失败) |

测试汇总:

- Test Files:808 passed / 8 skipped(816)
- Tests:13507 passed / 109 skipped / 0 failed(13616)

## 环境说明

本次验证中,两个平台可选依赖因 registry HTTP/2 传输中断无法由 pnpm 正常下载:

- `@anthropic-ai/claude-agent-sdk-darwin-arm64@0.3.220`
- `@openai/codex@0.147.0-darwin-arm64`

处理方式:用 curl 强制 HTTP/1.1 下载对应 tarball,校验 sha512 与
`pnpm-lock.yaml` 中的 integrity 一致后,解包到 fork 的 pnpm 虚拟 store 对应
目录。这不是仓库代码补丁,只是本机安装态修复;重新安装时如遇同样网络问题,
可重复该步骤。
