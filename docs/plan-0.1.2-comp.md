# 0.1.2-comp 分支修改计划

> 状态：✅ 已实施于 `0.1.2-comp` 分支，typecheck / test / build 已通过。
> 目标：让 `dsh-commandcode-usage-monitor` 完整兼容本地 DSH 新源码 `0.1.2-alpha.1`，并推送到 GitHub 的 `0.1.2-comp` 分支。
> 依据：txtai 新源码语料 + codegraph（当前项目 & DSH 框架源码双索引）+ 实际 API 签名核对。

## 1. 结论：可行，但要注意依赖来源

- 本地 DSH 源码是 `0.1.2-alpha.1`，**尚未发布到 npm**。
- 因此 `0.1.2-comp` 分支不能直接 `npm ci` / `npm install` 从公共 registry 安装全部依赖。
- 该分支应面向 **DSH monorepo checkout / workspace 环境**，或等 DSH 发布 `0.1.2-alpha.1` 后再作为普通 npm 包使用。
- 建议同时保留 `main` 分支继续面向 npm 发布版 `0.1.1-rc.2`，避免破坏现有用户。

## 2. 分支与版本

```text
分支名：0.1.2-comp
package.json version：0.1.2-comp.0
```

`0.1.2-comp.0` 是合法 semver prerelease，不会与 `0.1.2-alpha.1` 或 `0.1.1-rc.2` 冲突。

## 3. 依赖策略

### 3.1 本地开发 / 验证

在 DSH checkout 旁使用 workspace 或 `file:` 依赖：

```bash
# 示例：在 DSH monorepo 内把本插件作为 workspace 包加入
# 或在本插件 package.json 中临时使用 file: 指向 DSH packages
npm install ../deepseek-harness/packages/client/runtime
npm install ../deepseek-harness/packages/client/ui-renderer
npm install ../deepseek-harness/packages/client/store
```

### 3.2 package.json 版本范围

将 DSH 相关依赖统一改为：

```jsonc
"@deepseek-ai/dsh-commands": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-credentials": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-host-webserver": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-launch-environment": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-settings": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-api-remotes": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-client-connection": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-client-locale": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-client-ui-renderer": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-client-ui-settings": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-client-ui-sidebar": "^0.1.2-alpha.1",
"@deepseek-ai/dsh-client-ui-slots": "^0.1.2-alpha.1"
```

> 若在 DSH monorepo 内使用，建议直接写 `workspace:^`；若独立仓库使用，则用 `file:` 或等待 npm 发布。

## 4. 代码修改清单

### 4.1 `src/client/index.ts`

```ts
// 删除
import type {
  ClientContext,
  SettingsScope,
  SettingsScopeSpec,
} from '@deepseek-ai/dsh-client-runtime/client'

// 改为
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client'
```

保留其余 type-only import（locale / settings / sidebar / slots）。

### 4.2 `package.json`

- `version` → `0.1.2-comp.0`
- `dsh.client.inject` 改为：

```json
"inject": [
  "@deepseek-ai/dsh-client-connection",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-ui-renderer",
  "@deepseek-ai/dsh-client-ui-settings",
  "@deepseek-ai/dsh-client-ui-sidebar",
  "@deepseek-ai/dsh-api-remotes"
]
```

- devDependencies：
  - 移除 `@deepseek-ai/dsh-client-runtime`
  - 新增 `@deepseek-ai/dsh-client-ui-renderer`
  - 其余 DSH 包版本升到 `^0.1.2-alpha.1`

### 4.3 `build/web-platform.ts`

同步本地 DSH `packages/client/web/src/platform.ts`：

```ts
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const
```

### 4.4 `build/tsdown.client.ts`

- 删除 `RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'`
- `CLIENT_EXTERNALS = [...PLATFORM_MODULES]`
- 可选：进一步同步当前 DSH `packages/client/tsdown.client.ts` 的新能力（`?inline` CSS、`staticLinked`、`clientBuildEnvironmentDefines`），但当前插件只用 `.module.css`，非必须。

### 4.5 `tsdown.config.ts`

- 若不同步完整 DSH 构建预设，则无需修改。
- 若同步完整预设，需移除 `libExternal` 参数并适配新 `clientBundle` 签名。

## 5. 文档更新

- `docs/project-facilities.md`：Browser 技术栈改为 `dsh-client-store` / `dsh-client-ui-renderer`，并注明该分支面向 `0.1.2-alpha.1`。
- `docs/dsh-breaking-change-audit.md`：标记“路线 B 已实施于 0.1.2-comp 分支”。
- `docs/README.md`：加入本计划文档。

## 6. CI 策略

当前 `.github/workflows/ci.yml` 使用 `npm ci`，在 `0.1.2-comp` 分支上会失败（因为 `0.1.2-alpha.1` 未发布）。

建议：

1. 在 `0.1.2-comp` 分支上新增/调整 workflow：
   - 先 checkout `deepseek-harness` 到对应 `0.1.2-alpha.1` 源码
   - 将本插件作为 workspace 包加入 DSH monorepo，或使用 `file:` 依赖安装
   - 再执行 `typecheck / test / build`
2. 或者暂时让 `0.1.2-comp` 分支跳过 CI，等 DSH 发布后再恢复标准 `npm ci`。

## 7. 验证清单

```bash
# 在 DSH monorepo workspace 环境中
npm install
npm run typecheck
npm test
npm run build
```

预期：

- `typecheck` 通过
- 现有 7 个测试全部通过
- `lib/index.js` 与 `lib/client.js` 正常生成
- 浏览器端能正常注册 `settings.section` 与 `sidebar.footer.action`

## 8. 风险与注意

- `@deepseek-ai/dsh-client-store` 未发布到 npm，普通用户无法直接安装该分支。
- 若 DSH 后续发布正式版，`0.1.2-comp` 分支应尽快合并回 `main` 并更新版本范围。
- 构建预设若不同步，可能无法使用 DSH 新 CSS 能力，但不影响当前功能。
