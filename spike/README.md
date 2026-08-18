# Consumption-mechanism spike (open question A)

目标:验证 Electron 如何消费 fork 的构建产物。两个阶段:

1. `boot-test.mjs` — 用 **Electron 二进制的 Node 模式**(ELECTRON_RUN_AS_NODE)在 fork workspace 内启动
   `dsh --profile web`,解析 `dsh web: http://127.0.0.1:<port>` 并 HTTP 验证页面。
   这一步同时验证了选项 (d) 的核心机制:Electron binary 作为 Node helper 运行 fork 源码。
2. `electron-main.mjs` — 真正的 Electron main:spawn 同一子进程,等待 URL,创建沙箱 BrowserWindow
   加载 loopback 页面,验证 did-finish-load 与 document.title。

运行(构建完成后):

```sh
# 阶段 1(纯 Node 模式,无窗口)
pnpm node spike/boot-test.mjs

# 阶段 2(Electron GUI)
bash spike/run-electron.sh

# Loader 冒烟(Phase 2):desktop 三个 Host row 经 --patch overlay 组合进 web profile
pnpm node spike/loader-smoke.mjs

# desktop profile 管理 headless 单测(Phase 3)
pnpm node spike/profile-ensure.mjs

# 控制通道完整回环(Phase 4):bridge register + settings 模式变更 → restart 请求
pnpm node spike/smoke-bridge.mjs

# desktopPnpm 探针(Phase 4):经 Cordis 注入调用 pnpm --version
pnpm node spike/smoke-pnpm.mjs
```

子进程启动方式对齐 fork 的 source-launch 契约:`node --import tsx/esm apps/cli/src/bin.ts --profile web`,
cwd = `packages/deepseek-harness`,因此 fork 内部 `workspace:*` 互链全部在其自身 workspace 内解析——
这是选项 (d)「Host 进程外运行」消除模块解析问题的关键。

## 结果(2026-08-18,两阶段通过,选项 d 采纳)

- 阶段 1:`SPIKE_BOOT_OK url=http://127.0.0.1:62733 status=200 bytes=12076`
- 阶段 2:`SPIKE_ELECTRON_OK url=http://127.0.0.1:62805 title="DeepSeek Harness"`(官方 Web UI 在 Electron 43 窗口渲染)

关键发现:

1. **必须 `--expose-internals`**:fork 的裸插件解析依赖 `ModuleLoader.fromInternal()`(Node 内部
   loader);其 `node-addon-require-builtin` 路径在 Electron 运行时不可用
   ("Unsupported/no-realm: no compatible GetAlignedPointerFromEmbedderData symbol")。
   子进程 argv 加 `--expose-internals` 后内部 loader 可直接 require,无需 fork 补丁。
2. **必须 `--port 0`**:web 默认端口 3080 在本机已被占用(EADDRINUSE)。
3. fork 安装须 `--ignore-scripts`(其 postinstall 的 lefthook 会污染外层 git);构建直接调
   `pnpm run build:lib:host/build:lib:client/build:web`(fork 的 `build` 包装了 `npm run`,本机无 npm),
   且 PATH 需有 node(scripts 内 shebang 依赖)。
4. pnpm 在 fork 目录自动切换到其声明的 11.7.0,与根 9.15.0 共存无碍。
5. 源码态启动(tsx)约 15–30s;生产 launcher 应使用 fork 构建产物,源码态仅用于 dev。

运行前置:`pnpm --dir packages/deepseek-harness install --ignore-scripts` +
`pnpm run build:lib:host && pnpm run build:lib:client && pnpm run build:web`(在 fork 目录内)。

## Phase 3/4 追加结果(2026-08-18)

- `loader-smoke`:`LOADER_SMOKE_OK` —— fail-loud 审计下三个 desktop row 挂载成功。
- `profile-ensure`:8/8 PASS —— 创建/幂等/用户清单保留/损坏 fail loud。
- `smoke-bridge`:`SMOKE_BRIDGE_OK register=true restart="settings-committed"` ——
  desktop-bridge 挂载即向控制面注册;提交 `settings.yaml` 的 `dsh-desktop.mode: advanced`
  后,desktop-shell 的 settings watcher 触发 `ctx.desktopRuntime.requestRestart`,
  经 bridge POST 到达控制面。**选项 d 的 Host↔launcher 接缝全链路成立。**
- `smoke-pnpm`:`SMOKE_PNPM_OK exit=0 version=9.15.0` —— 探针 row 经 `ctx.inject`
  消费 `desktopProfiles`/`desktopPnpm`,受管操作句柄跑通 `pnpm --version`。
- 真实应用 e2e:desktop-layer 含 `desktop-bridge`;控制面与 carrier 双 loopback 端口监听;
  carrier HTTP 200;`desktop-state.json` 提交 `lastKnownGood: true`;退出无孤儿进程。

