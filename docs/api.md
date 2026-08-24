# 查询接口

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/commandcode-usage/health` | GET | 健康检查 |
| `/commandcode-usage/status.json` | GET | 完整用量快照 + revision + lastError |
| `/commandcode-usage/turn-cost.json` | GET | 最近一轮消耗 + seq（前端轮询判断新轮） |

所有路由返回 JSON，`Cache-Control: no-store`，并带 `Access-Control-Allow-Origin: *`。

## `GET /commandcode-usage/status.json`

```json
{
  "ok": true,
  "snapshot": {
    "updatedAt": 1700000000000,
    "stale": false,
    "accounts": [
      {
        "id": "default",
        "label": "Default",
        "configured": true,
        "active": false,
        "mark": "ok",
        "cooldownUntil": 0,
        "report": {
          "failures": [],
          "account": {
            "id": "account-uuid-placeholder",
            "name": "Example User",
            "userName": "example-user"
          },
          "usage": {
            "totalCount": 123,
            "totalCost": 1.23,
            "successRate": 100,
            "completedCount": 123,
            "failedCount": 0,
            "totalTokensIn": 123456,
            "totalTokensOut": 12345,
            "totalCredits": 1.23,
            "periodBasis": "billing-period"
          },
          "credits": {
            "monthlyCredits": 10,
            "purchasedCredits": 0,
            "freeCredits": 0,
            "fiveHour": {
              "used": 2.5,
              "cap": 14,
              "exceeded": false,
              "resetAt": 1700003600000
            },
            "weekly": {
              "used": 5.5,
              "cap": 35,
              "exceeded": false,
              "resetAt": 1700600000000
            }
          },
          "plan": {
            "planId": "individual-pro",
            "name": "Pro",
            "status": "active",
            "monthlyCredits": 10,
            "currentPeriodEnd": 0
          }
        }
      }
    ]
  },
  "revision": 1,
  "lastError": null
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `updatedAt` | 最近一次成功抓取时间（ms） |
| `stale` | 最近一次抓取是否有失败；`true` 表示数据可能不是最新 |
| `accounts[].configured` | 该账户是否解析到 API Key |
| `accounts[].mark` | `ok` / `rate-limit` / `invalid-credential` / `unknown` |
| `accounts[].report.failures` | 各端点失败信息 |
| `accounts[].report.blocked` | 全失败原因：`invalid-key` / `service-unavailable` / `network` |
| `credits.fiveHour/weekly` | 个人 Usage 余量核心：`used`、`cap`、`exceeded`、`resetAt` |

## `GET /commandcode-usage/turn-cost.json`

```json
{
  "ok": true,
  "seq": 3,
  "turn": 12,
  "amount": null,
  "tokens": 12345,
  "ts": 1700000000000
}
```

- `seq` 单调递增。前端首次拿到只对齐，之后 `seq` 变大表示新的一轮。
- `amount` 目前为 `null`（未内置价格表）；`tokens` 为真实 token 数。后续如需金额，可在 `SessionWatcher` 注入 `costFor` 价格换算。
