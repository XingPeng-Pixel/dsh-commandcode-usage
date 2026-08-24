# 架构

```
dsh-commandgo-usage/
├── package.json            # bundle 包声明（dsh.bundle.patch）
├── cordis.patch.yml        # 插件挂载层
├── tsconfig.json
├── tsdown.config.ts        # 构建到 lib/
├── README.md
├── CHANGELOG.md
├── LICENSE
├── docs/                   # 项目文档
├── scripts/
│   └── dev-loopback.sh     # 本地回环验证脚本
├── src/
│   ├── index.ts            # apply 入口
│   ├── config.ts           # Config + Schemastery schema
│   ├── credentials.ts      # API Key 解析链
│   ├── client.ts           # /alpha/* 客户端
│   ├── store.ts            # 内存快照 + 订阅
│   ├── poller.ts           # 定时轮询 + 退避 + 并发控制
│   ├── routes.ts           # webServer JSON 路由
│   ├── session-watcher.ts  # session/event 每轮消耗聚合
│   ├── commands.ts         # /commandcode-usage 命令
│   ├── ui-routes.ts        # 浏览器同源凭据/刷新路由
│   ├── plan.ts             # 套餐额度表
│   ├── types.ts            # 数据契约
│   └── client/             # 浏览器端（挂件、设置页、hooks、样式）
└── tests/
    ├── client.test.ts
    └── poller.test.ts
```

## 数据流

1. `UsagePoller` 按配置间隔调用 `CommandCodeClient` 抓取 `/alpha/*`。
2. 抓取结果归一化后写入 `UsageStore`。
3. `routes.ts` 将 `UsageStore` 暴露为同源 JSON 路由。
4. 浏览器端 `src/client/` 通过 JSON 路由读取数据并渲染挂件/设置页。
5. `SessionWatcher` 监听 `session/event`，聚合每轮消耗并发布到 `turn-cost.json`。
