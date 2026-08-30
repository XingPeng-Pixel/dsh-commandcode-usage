# DSH 破坏性更新适配审计

> 审计时间：DeepSeek Harness 新源码 / txtai 新索引（`0.1.2-alpha.1` 系列）就位后。
> 方法：txtai 专业语料探测 + codegraph（当前项目 & DSH 框架源码双索引）+ npm registry 版本比对。

## 结论（重要）

**本地 DSH 源码比 npm registry 新**：

- 本地源码/workspace 版本：`0.1.2-alpha.1`（已把 `@deepseek-ai/dsh-client-runtime` 拆为 `@deepseek-ai/dsh-client-store` + `@deepseek-ai/dsh-client-ui-renderer`）。
- npm registry 当前发布版：`0.1.1-rc.2`（仍使用 `@deepseek-ai/dsh-client-runtime`，且 `@deepseek-ai/dsh-client-store` 尚未发布）。

因此：

1. **不能用 `npm install` 安装指向本地新源码的版本**（例如 `^0.1.2-alpha.1`、`@deepseek-ai/dsh-client-store`）。这是刚才 `npm install` 报 `ETARGET / notarget` 的直接原因。
2. 当前插件源码/依赖已经**回退到 npm 发布版兼容状态**，保证 `npm install` 能正常解析。
3. 要真正适配本地新源码，需要走 **DSH monorepo workspace / `file:` / `link:` 依赖**，或等 DSH 把 `0.1.2-alpha.1` 发布到 npm 后再升级。

---

## 本地新源码 vs npm 发布版差异

| 项 | npm 当前发布版 `0.1.1-rc.2` | 本地新源码 `0.1.2-alpha.1` |
| --- | --- | --- |
| 客户端运行时包 | `@deepseek-ai/dsh-client-runtime`（存在） | 已删除/拆分 |
| 新平台 store | 无 | `@deepseek-ai/dsh-client-store`（未发布） |
| `ClientContext` | `@deepseek-ai/dsh-client-runtime/client` | `@deepseek-ai/cordis` 的 `Context` |
| `SettingsScope` / `SettingsScopeSpec` | `@deepseek-ai/dsh-client-runtime/client` | `@deepseek-ai/dsh-client-ui-settings/client` |
| 槽位渲染器 | `@deepseek-ai/dsh-client-runtime` 内提供 | `@deepseek-ai/dsh-client-ui-renderer` |
| `PLATFORM_MODULES` | `dsh-client-ui-slots` / `dsh-client-ui-primitives` + preloaded `dsh-client-runtime/client` | `dsh-client-store` / `dsh-client-ui-slots` / `dsh-client-ui-primitives` |

---

## 已确认兼容（两边都成立）

| 插件使用点 | 当前签名 | 状态 |
| --- | --- | --- |
| `ctx.webServer.register(route)` / `WebRoute` | `dsh-host-webserver` | ✅ 不变 |
| `ctx.credentials.resolve/describe/set/unset` | `dsh-credentials` | ✅ 不变 |
| `credentialRef()` | `dsh-credentials` | ✅ 不变 |
| `launchEnvironmentOf(ctx).get(name)?.value` | `dsh-launch-environment` | ✅ 不变 |
| `ctx.commands.register(CommandDefinition)` | `dsh-commands` | ✅ 不变 |
| `installSettingsSection` / `settingsNamespace` | `dsh-settings` | ✅ 不变 |
| `ctx.slots.inject/register`、`PropsLocale/InjectFace/PropsRuntime` | `dsh-client-ui-slots` | ✅ 不变 |
| `ctx.locale.register(NS, { zh, en })` | `dsh-client-locale` | ✅ 不变 |
| `session/event` `assistant/message` usage 字段 | `session` / `token-meter` | ✅ 不变 |

---

## 当前已执行的操作（0.1.2-comp 分支）

本分支已按“路线 B”完成适配：

```text
src/client/index.ts       # ClientContext → @deepseek-ai/cordis；SettingsScope/Spec → dsh-client-ui-settings/client；补 dsh-client-ui-renderer/client 类型合并
package.json              # version 0.1.2-comp.0；dsh.client.inject 移除 runtime，加入 renderer/api-remotes；DSH 依赖范围 ^0.1.2-alpha.1
build/web-platform.ts     # PLATFORM_MODULES 使用 dsh-client-store
build/tsdown.client.ts    # 移除 RUNTIME_STORE_EXEMPTION
```

> 注意：该分支依赖 DSH `0.1.2-alpha.1`，普通 `npm install` 从公共 registry 无法解析；需在 DSH monorepo / `file:` 依赖环境中使用。

---

## 分支策略

### 路线 A：`main` 分支（npm 发布版 `0.1.1-rc.2`）

- 保持现状，`npm install` 可直接使用。
- 验证命令：
  ```bash
  npm install
  npm run typecheck
  npm test
  npm run build
  ```

### 路线 B：`0.1.2-comp` 分支（本地 DSH `0.1.2-alpha.1`）

- 已实施上述代码修改。
- 验证需使用本地 DSH checkout：
  ```bash
  # 在 DSH monorepo workspace 中，或通过 file:/link: 安装本地 DSH 包
  npm install
  npm run typecheck
  npm test
  npm run build
  ```
- 等 DSH 发布 `0.1.2-alpha.1` 到 npm 后，可将该分支合并回 `main` 并直接升级版本范围。
