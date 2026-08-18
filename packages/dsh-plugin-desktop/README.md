# dsh-plugin-desktop

采用 Cordis 机制的桌面集成插件包。把 Electron 桌面宿主(`apps/desktop`)与 DeepSeek Harness
组合进同一个运行时——**本包不含 Electron 应用代码**:窗口、托盘、生命周期、打包全部归
`apps/desktop`;本包只实现 Cordis rows/services/effects。

> npm 名 `dsh-plugin-desktop` 已被参考项目(anywhere-labs/deepseek-harness-desktop)发布。
> 本包保持 `private: true`,永不以该名发布。

## 结构

| 子路径 | 角色 |
|---|---|
| `./profile-service` | 公开契约:`ctx.desktopProfiles` 类型(第三方按可选对待) |
| `./pnpm` | 公开契约:`ctx.desktopPnpm` 类型(第三方按可选对待) |
| `./runtime` | 私有契约:`ctx.desktopRuntime` 内部适配器(apps/desktop 实现) |
| `./host/profiles` | Host row:提供 `ctx.desktopProfiles`(generation 内不可变的 profile 身份) |
| `./host/pnpm` | Host row:提供 `ctx.desktopPnpm`(插件增删改经 `runPlugin()`) |
| `./host/shell` | Host row:注册 `dsh-desktop` settings namespace;模式变更 → 重启请求 |
| `./client` | Client face:compatibility 校验后返回;advanced 见改造计划 Phase 5 |
| `cordis.patch.yml` | bundle 层:launcher 在 `dsh-web-app` 之后插入(不落盘) |

## 生命周期规则

- 公开 service 是 **generation 作用域**:profile/mode 切换 dispose 当前 generation 后,
  保留的引用必须失效;跨 generation 缓存任何引用都是错误。
- 插件只**请求**生命周期动作(`requestRestart`),执行(`app.relaunch()`)只发生在
  apps/desktop 的重启协调器,且仅在 Cordis 树零码退出之后。
- 第三方插件在普通 DSH(无桌面 launcher)下必须能在两个公开 service 缺席时保持原行为。

## 开发

```sh
pnpm --filter dsh-plugin-desktop build        # tsc → lib/
pnpm --filter dsh-plugin-desktop typecheck
node spike/loader-smoke.mjs                   # Loader 冒烟(需要 fork 已构建)
```

类型锚定:依赖 npm 已发布的 0.1.0-rc.7 家族(cordis 4.0.1 与 fork vendored 版本一致)。
fork 补丁一旦改动公开契约,本包必须重新锚定类型(file: tarball 或 tsconfig paths 指向 fork
源码),记录于 `docs/refactor-plan.md` 开放问题 D。

深入阅读:[docs/plugin-services.md](docs/plugin-services.md)、
[../../docs/architecture.md](../../docs/architecture.md)「职责分工」。
