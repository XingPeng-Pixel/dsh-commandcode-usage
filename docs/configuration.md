# 配置

插件配置项与默认值（Schemastery schema 定义在 `src/config.ts`）：

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `apiKeyEnv` | string | `COMMANDCODE_API_KEY` | 凭据引用名（环境变量 / credentials ref） |
| `apiKey` | string | 空 | 组合配置字面量 API Key（优先） |
| `apiBase` | string | `https://api.commandcode.ai` | Command Code API 地址 |
| `pollIntervalMs` | number | `60000` | 轮询间隔（ms） |
| `errorBackoffMs` | number | `15000` | 失败后退避间隔（ms） |
| `requestTimeoutMs` | number | `15000` | 单请求超时（ms） |
| `accountConcurrency` | number | `1` | 每轮多账户并发抓取数（保守默认 1） |
| `accounts` | array | `[]` | 额外账户列表 |
| `activeAccount` | string | 空 | 固定活动账户 slot id（预留，尚未参与运行时选择） |
| `enableSessionCost` | boolean | `true` | 是否启用每轮消耗聚合 |
| `enableRoutes` | boolean | `true` | 是否注册 webServer JSON 路由 |
| `storagePath` | string | 空 | 可选状态持久化路径（尚未实现，预留） |

## 示例

```yaml
- insert:
    - id: commandcode-usage-monitor
      name: dsh-commandcode-usage-monitor
      config:
        apiKeyEnv: COMMANDCODE_API_KEY
        apiBase: https://api.commandcode.ai
        pollIntervalMs: 60000
        errorBackoffMs: 15000
        requestTimeoutMs: 15000
        accountConcurrency: 1
        enableSessionCost: true
        enableRoutes: true
```

## 多账户

```yaml
config:
  accounts:
    - label: Account A
      apiKeyEnv: COMMANDCODE_API_KEY
    - label: Account B
      apiKeyEnv: COMMANDCODE_API_KEY_2
```

## API Key 解析顺序

1. `config.apiKey`（组合配置字面量）
2. `ctx.credentials` 服务（若 profile 提供）
3. 启动环境变量（`apiKeyEnv` 指定的名字）
4. 官方 CLI 登录文件 `~/.commandcode/auth.json`

实现见 `src/credentials.ts`。
