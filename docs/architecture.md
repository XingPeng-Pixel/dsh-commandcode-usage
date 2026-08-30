# 架构

> 完整技术栈、组件职责与上游拾取手册见 [project-facilities.md](./project-facilities.md)。
> 本文档保持精简，只记录当前仓库实际存在的目录与数据流。

## 目录结构（当前实际）

```
dsh-commandgo-usage/
├── package.json            # bundle 包声明（dsh.bundle.patch）
├── cordis.patch.yml        # 插件挂载层
├── tsconfig.json / tsconfig.build.json
├── tsdown.config.ts        # 构建到 lib/（Host + Browser）
├── build/
│   ├── tsdown.client.ts    # 共享 client bundle 构建预设
│   └── web-platform.ts     # 浏览器平台模块表
├── README.md / README.en.md / CHANGELOG.md / LICENSE
├── docs/                   # 项目文档
├── assets/readme/          # 文档 SVG
├── src/
│   ├── index.ts            # Host apply 入口
│   ├── config.ts           # Config + Schemastery schema + 默认值
│   ├── credentials.ts      # API Key 解析链
│   ├── client.ts           # CommandCodeClient：/alpha/* 抓取
│   ├── store.ts            # UsageStore 内存快照 + 订阅
│   ├── poller.ts           # UsagePoller 定时轮询 + 退避 + 并发控制
│   ├── routes.ts           # 只读 JSON 路由（status / turn-cost / health）
│   ├── ui-routes.ts        # UI 路由（credential / refresh / plans / plan-preference）
│   ├── session-watcher.ts  # session/event 每轮消耗聚合
│   ├── commands.ts         # /commandcode-usage 命令
│   ├── plan.ts             # 套餐额度表
│   ├── types.ts            # 数据契约
│   └── client/             # 浏览器端（挂件、设置页、hooks、api、locales、样式）
└── tests/
    ├── client.test.ts
    └── poller.test.ts
```

## 数据流

1. `UsagePoller` 按配置间隔调用 `CommandCodeClient` 抓取 `/alpha/*`。
2. `CommandCodeClient` 归一化 4 个端点并做失败降级/分类，结果写入 `UsageStore`。
3. `routes.ts` 将 `UsageStore` 暴露为同源 JSON 路由。
4. 浏览器端 `src/client/` 通过 JSON 路由读取数据并渲染挂件/设置页。
5. `SessionWatcher` 监听 `session/event`，聚合每轮消耗并发布到 `turn-cost.json`。
6. `ui-routes.ts` 提供凭据写入、连接测试、手动刷新与 Plan 偏好管理，全部走 Host 侧能力。

## 生命周期

- Host `apply` 在 `ctx.effect` 中启动 Poller、注册路由、SessionWatcher、命令与 UI routes，返回统一 disposer。
- Browser `apply` 通过 `ctx.effect` 注册 locale 与两个槽位（`settings.section`、`sidebar.footer.action`）。
- 卸载时所有注册自动清理；命令通过子 Fiber `ctx.inject(['commands'])` 注册。

> 注意：README/docs 中提到的 `scripts/dev-loopback.sh` 当前仓库不存在，如需使用需补齐。
