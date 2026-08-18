# OpenHarness 改造计划

配套文档:[architecture.md](architecture.md)。本文档把改造拆成可独立验收的阶段,每个阶段给出动作、产出与验收标准。

## 现状盘点(2026-08-18)

已就位:

- 根 monorepo 骨架:pnpm workspace(`packages/*` + `apps/*`)、turbo、Biome、changesets、`tsconfig.base.json`。
- `packages/deepseek-harness`:完整 fork(`@deepseek-ai/dsh-root` v0.1.0-rc.7),含 vendored Cordis 与其自身嵌套 pnpm workspace。
- `apps/desktop`:electron-vite + electron-builder 脚手架,但仍是"IPC 传 prompt/token"的朴素方案,与目标架构冲突。
- `apps/web`、`apps/cli`、`apps/mobile`:占位。

已修复:

- `packages/dsh‑plugin‑desktop` 目录名含 U+2011 不换行连字符 → 已重命名为 ASCII `packages/dsh-plugin-desktop`(空目录,待搭骨架)。
- 2026-08-18 方案审查后(P0+P1+P2 全部修复):
  - `pnpm-workspace.yaml` 改为显式枚举(`packages/dsh-plugin-desktop` + `apps/*`),fork 根包移出根 workspace——消除其 devDeps 被根重复安装、其 lefthook postinstall 污染外层 git hooks 的问题;
  - `biome.json` ignore 增加 `packages/deepseek-harness/**`(fork 用自身 oxlint/eslint 工具链);
  - `apps/desktop` 升级 **Electron ^43**(内置 Node 24.x,满足 fork engines `^22.19.0 || >=24.0.0`;Electron 36.9.5=Node 22.19.0 为最低线),删除失效的 `@openharness/deepseek-harness` 依赖与 react/@vitejs/plugin-react 等 renderer 时代依赖,描述改为薄宿主;
  - `apps/cli` 删除同样的失效依赖;`apps/web`/`apps/cli`/`apps/mobile` 改为 parked 状态(清理误导性描述);
  - 根 `engines` 对齐 `>=22.19.0`,根 package.json 增加 `fork:install`/`fork:build`/`fork:test` 编排脚本;
  - 新增根级 `upstream.json`:上游基线 `deepseek-ai/deepseek-harness` tag `dsh-v0.1.0-rc.7` @ `99f6f02`(runtime family `0.1.0-rc.7`);
  - 根 README 写入两套包管理编排说明;架构文档补 `ctx.desktopRuntime` 内部契约、npm 名占用警示、loopback 钉死 `127.0.0.1`、版本约束与消费机制 spike 说明。

待解决问题:

| # | 问题 | 处理阶段 |
|---|------|---------|
| 1 | fork 产物消费机制未定(开放问题 A,spike 前置) | Phase 0/2 spike |
| 2 | fork 安装/构建编排验证(fork:* 脚本 + turbo 边界) | Phase 0 |
| 3 | fork 补丁流程(PATCHES.md 台账、Agent Note 约定)未建立 | Phase 1 |
| 4 | ~~`packages/dsh-plugin-desktop`(Cordis 插件包)无代码~~ ✅ Phase 2 骨架 + Loader 冒烟完成 | Phase 2 |
| 5 | ~~`apps/desktop`(真正的桌面端代码)需从 IPC 方案重构为薄宿主 + loopback carrier~~ ✅ Phase 3 重构完成并端到端验证 | Phase 3 |

## Phase 0 — 仓库卫生与编排接线

**动作**

1. ✅ `apps/desktop`/`apps/cli` 的失效依赖已删除;`apps/web`/`cli`/`mobile` 已 parked。消费机制在开放问题 A 的 spike 后定,**此前根 workspace 任何包不得声明对 fork 的依赖**。
2. ✅ 根 scripts 已加 `fork:install`/`fork:build`/`fork:test`(turbo 不深入 fork 内部任务)。turbo 与 fork 的边界维持:fork 任务不进 turbo 图,避免 turbo 缓存误判嵌套 workspace 的 lockfile;CI 中作为前置步骤显式执行。
3. ✅ 根 `.gitignore` 已核对并覆盖 fork 的构建产物(`lib/`、`dist/`、`out/`、`.turbo` 等)及桌面端打包产物 `dist-electron/`。
4. ✅ 版本对齐:根 `engines` 已升 `>=22.19.0`;**根 pnpm@9.15.0 与 fork 声明的 pnpm@11.7.0 并存**——fork 目录内遵循其自身 packageManager(建议 CI 用 corepack 固定双版本),README 已说明。

**验收**:根 `pnpm install` 成功且 lockfile 不再包含 fork 依赖图;fork 目录内独立 `pnpm install && pnpm run build:lib` 成功;`biome check .` 不触及 fork。

## Phase 1 — Fork 基线与补丁流程

**动作**

1. ✅ 上游基线已记录于根级 `upstream.json`(tag `dsh-v0.1.0-rc.7` @ `99f6f02`)。可选增量:本地维护 upstream 镜像分支供 `git diff` 审查补丁。
2. ✅ 新建 `packages/deepseek-harness/PATCHES.md` 补丁台账:每条补丁记录动机、涉及包、上游同步策略(重放/废弃/已上游化)。当前台账为空——fork 尚未打任何补丁。
3. ✅ 约定:fork 内的非平凡修改遵守 fork 自身 `AGENTS.md`(Agent Note、测试、`verify-*` gates);补丁提交信息使用 `patch:` 前缀便于检索。
4. ✅ 跑通 fork 基线验证:`pnpm run typecheck`、`pnpm run test`,结果已记录于 `docs/fork-baseline.md`(13507 通过 / 0 失败 / 109 跳过)。

**验收**:✅ 基线构建/测试通过并记录;`PATCHES.md` 存在且格式定稿。

## Phase 2 — dsh-plugin-desktop 骨架

**动作**

1. ✅ **开放问题 A 的 spike 已完成(2026-08-18),结论:选 (d) Host 进程外运行**。验证过程与证据见 `spike/`(两阶段均通过:阶段 1 `SPIKE_BOOT_OK` 拿到 loopback URL + HTTP 200;阶段 2 `SPIKE_ELECTRON_OK` 窗口加载官方 UI,title="DeepSeek Harness")。候选回顾:
   - (a) 根 workspace 吸收 fork 内部 228 个包:lockfile 吞并 + pnpm 9/11 漂移,**否决**;
   - (b′) `release:pack` 全家族 tarball + `file:` 消费:构建链过重,**否决**;
   - (d) **采纳**:Electron main 以 `ELECTRON_RUN_AS_NODE=1` 子进程在 fork workspace 内启动 Host,loopback carrier 跨进程;fork 保持完全隔离,与"隔离 workspace"决策一致。子进程生命周期(崩溃恢复、协同关闭、进程树清理)归 apps/desktop。
   **spike 关键发现**:① fork 的裸插件解析依赖 Node 内部 loader(`ModuleLoader.fromInternal()`),其 `node-addon-require-builtin` 路径在 Electron 运行时不可用("no compatible GetAlignedPointerFromEmbedderData symbol"),子进程 argv 必须携带 **`--expose-internals`**(无需 fork 补丁,launcher 私有细节);② web 默认端口 3080 可能被占用,生产用 `--port 0` 临时端口;③ pnpm 会按 fork 的 packageManager 自动切换 11.7.0,双版本共存无碍(R5 缓解);④ fork 安装用 `--ignore-scripts`(防 lefthook 污染外层 git),构建需直接调 `pnpm run build:lib:host/build:lib:client/build:web`(fork 的 `build` 脚本经 `npm run` 包装,本机无 npm)。
2. ✅ 搭 `packages/dsh-plugin-desktop` 包骨架(2026-08-18 完成;只采用 Cordis 机制,不含 Electron 应用代码;窗口/托盘等物理对象归 `apps/desktop`,见 architecture.md"职责分工"):
   - `package.json`:包名 `dsh-plugin-desktop`(`private: true`,npm 名已被参考项目占用),subpath exports `./profile-service`、`./pnpm`、`./runtime`、`./host/*`、`./client`,`dsh.bundle` manifest;类型锚定 npm 已发布 0.1.0-rc.7 家族(cordis 4.0.1 与 fork vendored 一致);
   - Host rows(全部 Cordis Service):`desktop-profiles`(提供 `ctx.desktopProfiles`,config 由 launcher 组合注入)、`desktop-pnpm`(提供 `ctx.desktopPnpm`,dev 态 child_process shell-free argv;打包态 Phase 4)、`desktop-shell`(经 `installSettingsSection` 注册 `dsh-desktop` namespace,committed mode ≠ generation mode 时经 `ctx.desktopRuntime` 请求重启);
   - Client face:compatibility 校验后返回;advanced 显式 no-op(Phase 5);
   - `cordis.patch.yml` bundle 层(launcher 在 `dsh-web-app` 后插入,config 由 overlay 整体替换);
   - **Loader 冒烟通过**:`spike/loader-smoke.mjs` 经 `--patch` overlay(绝对路径 specifier)把三个 row 组合进 web profile,fail-loud 审计下启动成功 = rows 已挂载,`LOADER_SMOKE_OK` + HTTP 200。
   已知技术事实:published cordis 声明图存在 Context 双重身份(lib/types/index re-export vs context),经 `internal/context.ts` 的 `ConstructorParameters<typeof Service>[0]` 提取统一;类型与运行时边界各一处 documented cast。
3. ✅ `docs/plugin-services.md`:两个公开 service 契约、数据流图、第三方兼容规则(普通 DSH 下视为可选)、scaffold 实现状态。
4. ✅ `ctx.desktopRuntime` 内部契约:`./runtime` subpath 导出 `DesktopRuntime`/`TrayItemRegistry`/`DesktopWindowValues` 类型与 ctx 槽声明;实现由 apps/desktop 在 Phase 3 provide;契约测试随 Phase 3 重启协调器落地。

**验收**:✅ Loader 冒烟通过(`LOADER_SMOKE_OK`);`pnpm --filter dsh-plugin-desktop build/typecheck` 零错误;Biome 全绿;subpath 类型契约可导入(第三方风格消费验证随 Phase 3 集成)。

## Phase 3 — apps/desktop 重构为真正的桌面端宿主

`apps/desktop` 是真正的桌面端代码,承担参考架构中 "Launcher + native runtime" 的全部职责;`dsh-plugin-desktop` 的 Cordis rows 由它在组合 generation 时挂载。

**动作**

0. ✅ **Host 引导能力冒烟**:spike 两阶段 + 本阶段构建产物端到端启动均通过(Electron ^43 内置 Node 24.18 与 fork engines 兼容)。
1. ✅ 删除 IPC 方案(`src/shared/ipc.ts`、preload、renderer 自绘 React UI 全部移除;react/@vitejs/plugin-react 依赖已在 P0 清理)。
2. ✅ Electron main 重写为 launcher(`apps/desktop/src/main/`,8 个模块):
   - `index.ts`:单实例锁、second-instance 聚焦、window-all-closed 退出、before-quit 有序 teardown;
   - `launcher.ts`:desktop 私有状态(userData/desktop-state.json)、generation 监督、重启协调器;
   - `generation.ts`:ELECTRON_RUN_AS_NODE 子进程(`--expose-internals` + `--port 0` 硬性规则)、URL 发现、有界 dispose(SIGTERM→8s→SIGKILL);
   - `profile.ts`:launcher 管理的 desktop profile(纯 fs、Electron-free、可 headless 测试);
   - `overlay.ts`:desktop 层 `--patch` 组合(写 userData,不落盘进 profile);
   - `window.ts`:沙箱 BrowserWindow、导航钉死同源、外链委托系统、compatibility chrome(固定标题、抑制页面标题、Windows autoHideMenuBar);
   - `tray.ts`:Web surface 加载成功后创建;v1 命令:Open/Restart/Quit;
   - `paths.ts`:仓库根/fork/插件 lib/DSH home 解析(OPENHARNESS_ROOT 可覆盖)。
   - **端到端证据**:构建产物启动 → `~/.dsh/profiles/desktop` 按 installation-owned manifest 创建 → carrier HTTP 200(`<title>DeepSeek Harness</title>`)→ `desktop-state.json` 提交 `lastKnownGood: true` → 退出后无孤儿进程、端口释放。
3. ✅ generation 生命周期:重启协调器(pendingRelaunch + launcher-initiated dispose 才 relaunch;失败 generation 不重启);服务引用不跨 generation。重启执行只在 apps/desktop。
4. ✅ compatibility 模式窗口:v1 统一固定标题 `DeepSeek Harness Desktop` + 抑制页面标题(macOS/Windows 一致;平台细分随 Phase 4 打磨)。
5. ✅ renderer 无任何 preload;官方 Web UI 即界面。
6. ✅ **launcher 管理的 `desktop` profile**(v1):缺席时创建 installation-owned manifest;已存在的用户修改清单原样保留(desktop 层经 overlay 注入,与 manifest 无关);损坏 manifest fail loud。完整 installation-owned 前缀修复语义随 Phase 4 `dsh plugin` 接线迭代。**headless 单测 8/8 通过**(`spike/profile-ensure.mjs`)。
7. ✅ **dev workflow**:根 README「桌面端开发循环」章节(fork 构建前置 + `@openharness/desktop dev` + 可选 `dev:web` watcher)。
8. ✅ 风险项收敛:裸插件解析经 `--expose-internals` 解决(spike 实证);打包态验证归 Phase 4。

**v1 范围说明**:`ctx.desktopRuntime` 的 Host 侧 provider 需要 Host↔launcher 控制通道(选项 d 下 Host 在子进程,launcher 无法直接触及其 ctx)。v1 各 row 容忍其缺席(`ctx.get(...)?.`),重启经 tray/Electron 侧完成;控制通道(bridge row + loopback 控制面)随 Phase 4 打包运行时落地。

**验收**:✅ 开发模式启动后窗口加载 fork 构建的官方 Web UI;会话、工具、设置走官方 UI 完整可用;杀窗口/退出生命周期正确(无孤儿进程);tray 在 surface 加载后才出现(lastKnownGood 先行提交)。

## Phase 4 — 打包与运行时闭包(apps/desktop 所有)

**已完成(2026-08-18)**

0. ✅ **Host↔launcher 控制通道(选项 d 的接缝)**:`apps/desktop/src/main/control.ts`(token 鉴权、127.0.0.1 临时端口的 loopback HTTP 控制面)+ `dsh-plugin-desktop/src/host/bridge.ts`(`desktop-bridge` row,provide `ctx.desktopRuntime`,经控制面转发 `requestRestart`/托盘条目/窗口值)。launcher 在组合前启动控制面并把 `controlUrl`/`token` 注入 overlay。
1. ✅ **bridge 完整回环冒烟**:`spike/smoke-bridge.mjs` `SMOKE_BRIDGE_OK register=true restart="settings-committed"` —— 挂载即注册;提交 `settings.yaml` 模式变更 → desktop-shell watcher → `requestRestart` → 控制面收到。
2. ✅ **desktopPnpm 端到端探针**:`spike/smoke-pnpm.mjs` `SMOKE_PNPM_OK exit=0 version=9.15.0` —— 第三方风格 row 经 `ctx.inject` 消费两个公开 service,受管句柄跑通 `pnpm --version`。
3. ✅ **运行时闭包 staging**:`scripts/stage-runtime.mjs` 用 npm 在 `runtime/desktop/` 安装已发布 0.1.0-rc.7 家族(`@deepseek-ai/dsh`/`dsh-base`/`dsh-web-app`)+ 本地 `dsh-plugin-desktop` 的 tarball(npm 对目录型 `file:` 依赖会装成符号链接,electron-builder 复制后会变成空目录,故先 `npm pack` 成物理 tarball)。**关键决策:零补丁期 staging 用 npm 已发布包(与参考项目同构);首个偏离补丁起改用 fork `release:pack` tarball 并登记 PATCHES.md。**
4. ✅ **Packaged runtime gate**:`scripts/runtime-gate.mjs` 校验 8 个物理入口(dsh bin.js、两个 bundle patch、四个插件 row、插件 patch)+ native 模块清点。**PASS,无 native 告警**(web 闭包无 node-pty;landlock-run 仅 Linux)。
5. ✅ **打包态 launcher 支持**:`paths.ts`(`runtimeDir`/`pluginLibDir` 打包分支锚定 `process.resourcesPath/runtime`)+ `generation.ts`(`hostMode: packaged` 走构建的 `lib/bin.js`,无 tsx)+ `electron-builder.yml`(asar + asarUnpack + extraResources `runtime/`)。
6. ✅ **打包形态启动冒烟**:`spike/packaged-boot.mjs` `PACKAGED_BOOT_OK runtime=staged-closure` —— 构建 bin + staged 闭包 + staged 插件 artifacts 组合 desktop 层,carrier HTTP 200;bridge 对 stub 控制面的 fetch 失败被正确容忍。
7. ✅ onboarding(Phase 3 已完成)。
8. ✅ **macOS 未签名安装包与冷启动(2026-08-18)**:`electron-builder --mac dmg zip` 产出 arm64 dmg/zip;staged runtime 为完整物理闭包(runtime-gate PASS);`.app` 冷启动后 Host 子进程从 `Resources/runtime` 启动,carrier 200(`DeepSeek Harness`)、控制面 401,退出后无孤儿进程、端口释放。

**剩余(需要目标平台/签名环境)**

- Windows 真实执行 `electron-builder`(nsis),产物冷启动验证。
- macOS/Windows 代码签名与公证。
- 打包态 `desktopPnpm.runPlugin()`:staging 内置 pnpm/dsh 入口的可执行选择与子进程私有环境(当前 `dshCommand` 空时 fail loud,符合设计)。
- 第三方插件在打包态经 `dsh plugin` 的安装链路(依赖 runPlugin + 内置 pnpm)。

**验收(已达成部分)**:控制通道与 desktopPnpm 全链路冒烟通过;staged 闭包 gate PASS;macOS 未签名 dmg/zip + `.app` 冷启动通过(打包态子进程启动并服务官方 Web UI)。**安装包级剩余验收**:Windows 冷启动、代码签名/公证、`dsh plugin` 链路。

## Phase 5 — advanced 模式与增强(可选增量)

1. advanced 模式:禁用官方 `ui-layout` row,desktop Client 提供 layout service + root occupant;theme presenter;macOS hiddenInset + vibrancy / Windows Mica;Linux 拒绝。
2. Windows 目录选择桥(`dialog.showOpenDialog` 同源路由)、本地目录拖放(webUtils 隔离 preload)。
3. parked 应用(`apps/web`/`apps/cli`/`apps/mobile`)重新评估:浏览器面默认由 fork 的 web profile 覆盖,确有差异化需求再立项。

## Phase 6 — CI 与发布

1. CI:根 install → fork install/build/test(隔离缓存)→ dsh-plugin-desktop gates → desktop 构建;Linux 容器只验证 compatibility 面。两套包管理在 CI 中用 corepack 分别固定(根 pnpm 9 / fork 声明版本)。
2. changesets 发布流:`dsh-plugin-desktop` 与 apps 版本联动;fork 不走 changesets,其版本语义由补丁台账 + 基线元数据表达。
3. Release 工件:安装包 + SHA-256 摘要。

## 开放问题

- **A. fork 产物消费机制**:✅ 已决(2026-08-18 spike):**选 (d) Host 进程外运行**。Electron main 以 `ELECTRON_RUN_AS_NODE=1` + `--expose-internals` 子进程在 fork workspace 内启动 Host(源码态 `--import tsx/esm apps/cli/src/bin.ts --profile web --port 0`,生产态换构建产物),loopback carrier 跨进程。证据:`spike/boot-test.mjs`(SPIKE_BOOT_OK)、`spike/electron-main.mjs`(SPIKE_ELECTRON_OK,title="DeepSeek Harness")。(a)/(b′) 否决理由见 Phase 2 第 1 条。
- **B. fork 内 pnpm 与根 pnpm 并存的人因成本**:是否在 CI 用 corepack 固定双版本(当前根 pnpm 9.15.0 / fork 声明 pnpm 11.7.0)。
- **C. `desktop` profile 的 bundle 修复策略**:参考项目中 launcher 只修复 installation-owned 前缀、保留第三方顺序;本项目沿用(Phase 3 第 6 条),但若 fork 升级 bundle 名需同步 launcher 常量。
- **D. 上游同步节奏**:fork 基线为 0.1.0-rc.7(`upstream.json` @ `99f6f02`);上游 rc 演进快,需约定同步触发条件(安全修复/所需特性)与回归基线(Phase 1 记录的测试结果)。

## 风险登记(2026-08-18 审查)

| ID | 风险 | 影响 | 缓解 |
|----|------|------|------|
| R1 | Electron 内置 Node 与 fork engines 漂移 | Host 运行时崩溃/隐性缺失 | 钉 Electron ^43(Node 24.x,满足 `^22.19 \|\| >=24`);Phase 3 第 0 条冒烟为第一道门;升级 Electron 前先对照 fork engines |
| R2 | fork `workspace:*` 互链阻断外层消费 | 依赖接线停滞 | 开放问题 A spike 前置,(b′)/(d) 优先于 (a) |
| R3 | 打包态 Electron 裸插件解析钩子缺失 | 打包后第三方插件无法加载 | ✅ 已关闭:`--expose-internals` 覆盖源码态与打包态(`spike/packaged-boot.mjs` PACKAGED_BOOT_OK,staged 闭包 + 构建 bin 验证通过) |
| R4 | native 模块(node-pty、landlock-run)ABI 与 Electron 不匹配 | 打包产物崩溃 | ✅ 已收敛:web profile 闭包无 node-pty;landlock-run 仅 Linux;runtime-gate 每次打包前清点 native 依赖,新增 addon 才触发 ABI rebuild 决策 |
| R5 | 两套包管理(根 pnpm 9 / fork pnpm 11)误用 | 安装错乱、lefthook hooks 污染 | pnpm-workspace 显式枚举已完成;README 双命令说明;CI corepack 双版本 |
| R6 | 上游快速演进,基线落后 | 错过安全修复/特性 | 开放问题 D;回归对比 Phase 1 基线记录 |
