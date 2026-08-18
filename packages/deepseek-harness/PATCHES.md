# PATCHES.md — Fork 补丁台账

本文件是 OpenHarness monorepo 中 `packages/deepseek-harness` fork 的**补丁登记台账**。
每一处偏离上游的修改都必须在此登记一条;上游同步时以此为准逐条重放或废弃。

## 基线

- 上游:`deepseek-ai/deepseek-harness`
- 基线:tag `dsh-v0.1.0-rc.7` @ `99f6f02`(runtime family `0.1.0-rc.7`),见根目录 `upstream.json`
- 基线验证记录(构建/typecheck/测试):见根目录 `docs/fork-baseline.md`

## 流程约定

1. **先登记后落地**:补丁落地前(或同时)在本台账新增条目,写明动机、涉及包与上游同步策略;台账条目与代码在同一 commit 或相邻 commit 内可追溯。
2. **遵守 fork 自身约定**:非平凡修改遵守本目录 `AGENTS.md`(Agent Note、测试、JSDoc、ESM、verify-* gates),保持在上游风格内可审查。
3. **提交前缀**:补丁 commit 使用 `patch:` 前缀(如 `patch(dsh-web-app): ...`),便于检索与重放。
4. **agent-loop 特则**:改动 `agent-loop` 必须同步更新 fork 的 `docs/architecture.md`。
5. **优先级**:优先 Cordis 扩展点(bundle/patch 层、service provider 替换);组合无法表达时才改 loop。

## 同步策略定义

- **重放(replay)**:未上游化;上游同步时在新基线上重新应用本补丁,并对照 `docs/fork-baseline.md` 的基线记录回归验证。
- **废弃(discard)**:仅对特定基线有意义、或将被上游功能取代;上游同步时删除。
- **已上游化(upstreamed)**:已被上游接收;基线前进到含该改动的版本后,从台账移除。

## 台账

**当前为空** —— fork 尚未施加任何偏离上游的补丁(树状态 = 上游基线原样)。

新增条目模板:

```markdown
### P-0000 <一句话标题>

| 字段 | 内容 |
|---|---|
| 动机 | <为什么需要偏离上游> |
| 涉及包 | <@deepseek-ai/dsh-*> |
| 改动范围 | <文件/函数级摘要> |
| 同步策略 | 重放 / 废弃 / 已上游化 |
| 基线回归 | <对照基线记录的 typecheck/test 结果> |
| 状态 | 已落地 / 已上游化 / 已废弃 |
```

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-18 | 台账创建;当前为空(基线 `dsh-v0.1.0-rc.7` @ `99f6f02`,零补丁)。 |
