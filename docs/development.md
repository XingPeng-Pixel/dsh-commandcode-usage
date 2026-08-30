# 开发

## 环境要求

- Node.js `>=22`

## 常用命令

```bash
npm install
npm run typecheck
npm test
npm run build
```

- `typecheck`：TypeScript 类型检查
- `test`：Node built-in test + `tsx` 运行单元测试
- `build`：`tsc` 生成类型声明 + `tsdown` 生成 Host/Browser bundle

## 回环验证

```bash
# 使用可写 DSH_HOME 副本 + 环境变量 Key 启动临时实例
DSH_HOME=/path/to/writable-home COMMANDCODE_API_KEY=user_xxx dsh web --port 3099

# 查询接口
curl http://127.0.0.1:3099/commandcode-usage/status.json
curl http://127.0.0.1:3099/commandcode-usage/turn-cost.json
```

> 注：README 曾提到的 `scripts/dev-loopback.sh` 当前仓库不存在；如需一键回环，需先补齐该脚本，或直接用上面的 `DSH_HOME=... dsh web ...` 命令。

## 速率与风控说明

- 默认 60s 才抓取一次，单次抓取 4 个端点，属于低频请求。
- 多账户默认串行；如仍担心风控，可调大 `pollIntervalMs` 或保持 `accountConcurrency: 1`。
- 对 4xx 不重试，对网络/5xx 最多重试一次，避免放大请求。
