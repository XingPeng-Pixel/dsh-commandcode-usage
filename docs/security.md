# 安全

## API Key 处理

- 浏览器端永远不会接触明文 Command Code API Key。
- 凭据写入通过 DSH credentials 服务完成；未挂载 credentials 服务时 UI 为只读。
- Host 侧解析顺序为：`config.apiKey` → `ctx.credentials` → 启动环境变量 → 官方 CLI `auth.json`。
- 仓库中不提交真实 Key、Token 或个人账户数据；示例数据均为占位符。

## 报告安全问题

请通过仓库的 Security Advisory 或维护者联系方式私下报告，不要公开提交敏感信息。
