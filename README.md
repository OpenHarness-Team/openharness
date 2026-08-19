# OpenHarness

pnpm monorepo 桌面/多端产品:把 **Fork 打补丁后的 DeepSeek Harness(DSH)内核** 与 **Electron 桌面壳** 通过 **Cordis 插件机制** 组合成同一个运行时。
简单言之：fork 的 DSH 内核是桌面端的“引擎”+打补丁后改造，Electron 桌面壳是“车身”，Cordis 插件机制是“传动系统”，最终形成一个可运行的桌面应用。

技术栈:pnpm workspace + monorepo + turbo + changesets + TypeScript + Biome + React(前端来自 fork 的官方 Web 应用)。

## 仓库结构

| 路径 | 角色 |
|---|---|
| `packages/deepseek-harness/` | Fork 的 DSH 内核(`@deepseek-ai/dsh-root`),保留完整 Cordis 机制与自身独立的 pnpm workspace,**不被根 workspace 吸收** |
| `packages/dsh-plugin-desktop/` | 采用 Cordis 机制的插件包(Host face services + Client face),不含 Electron 应用代码 |
| `apps/desktop/` | **真正的桌面端代码**:Electron main/launcher/窗口/托盘/生命周期 + electron-builder 打包 |
| `apps/web/` `apps/cli/` `apps/mobile/` | parked 占位,见改造计划 Phase 5 |
| `upstream.json` | fork 的上游基线(仓库、tag、commit、runtime family) |

## 文档

- 架构:[docs/architecture.md](docs/architecture.md)
- 改造计划(阶段、验收、风险):[docs/refactor-plan.md](docs/refactor-plan.md)
- fork 内核架构:`packages/deepseek-harness/docs/architecture.md`

## 开发编排

fork 内核与根 workspace 使用**两套隔离的包管理**:

```sh
# 根 workspace(自有包)
pnpm install
pnpm run build        # turbo:只构建自有包

# fork 内核(独立 pnpm workspace,packageManager 见其 package.json)
pnpm --dir packages/deepseek-harness install
pnpm --dir packages/deepseek-harness run build
```

注意:fork 要求 `node ^22.19.0 || >=24.0.0` 与其自身声明的 pnpm 版本;根 workspace 的 engines 与之对齐。`apps/desktop` 的 Electron 版本必须选择内置 Node 满足 fork engines 的大版本(当前决策见 `docs/refactor-plan.md` P0 修复记录)。

## 桌面端开发循环(Phase 3)

`apps/desktop` 是真正的桌面端代码:Electron main 以 `ELECTRON_RUN_AS_NODE` 子进程在 fork
workspace 内启动 Host,renderer 是经 loopback carrier 加载的官方 Web UI(无 IPC、无 preload)。

```sh
# 前置(首次或 fork 变更后):构建 fork 内核 + 插件包
pnpm run fork:install
pnpm run fork:build
pnpm run build

# 终端 1:桌面应用(main 变更自动重建重启)
pnpm run desktop:dev

# 终端 2(可选,仅当迭代 client 插件/官方前端时):client bundle watcher
pnpm run fork:dev:web
```

验证工具:根脚本 `smoke:loader`、`smoke:pnpm`、`smoke:packaged-pnpm`、`smoke:packaged-add`,
或 `spike/` 下的原始脚本。

桌面端安装包(未签名)按平台构建:

```sh
# 根脚本：构建插件 → staging runtime 闭包 → runtime-gate → electron-builder
pnpm run dist:mac
pnpm run dist:win
pnpm run dist:linux

# 等价于:
pnpm run release:mac
pnpm run release:win
pnpm run release:linux

# 仅在桌面包内直接构建(仍会自动 staging + gate):
pnpm --filter @openharness/desktop run package:mac
pnpm --filter @openharness/desktop run package:win
pnpm --filter @openharness/desktop run package:linux
```
