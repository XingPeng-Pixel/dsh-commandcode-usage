# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 初始 Host 后端实现：
  - Command Code `/alpha/*` 用量抓取客户端（whoami / usage/summary / billing/credits / billing/subscriptions）
  - 内存快照 store 与定时轮询（默认 60s、串行多账户、失败退避、in-flight 去重）
  - webServer JSON 查询接口：`/commandcode-usage/health`、`/commandcode-usage/status.json`、`/commandcode-usage/turn-cost.json`
  - session/event 每轮消耗聚合（`turn-cost.json` + seq）
  - `/commandcode-usage` 命令
  - API Key 解析链：config 字面量 → credentials 服务 → 启动环境变量 → 官方 CLI auth.json
  - 单元测试（client 解析/错误分类/退化、poller 防重入/失败标记）

### Changed

- 浏览器端侧边栏小挂件：
  - 自适应 sidebar footer 宽度
  - 三条用量条对齐并显示百分比
  - Token 详情改为堆叠式布局
- 设置页仪表盘由饼图改为圆环用量图（`UsageGauge`）
- 圆环颜色分档：蓝 → 橙 → 红平滑过渡
- 解除对 `dsh-client-ui-theme` 的运行时依赖，使用自带明/暗主题变量
- 文档迁移至 `docs/`，根 README 改为项目入口
- 清理示例数据中的个人/账户敏感信息

### Fixed

- 侧边栏小挂件在 sidebar footer 中宽度不自适应的问题
- 设置页/挂件在暗色主题下的可读性

### Security

- 仓库示例与文档不再包含真实账户名、UUID、用量或时间戳
