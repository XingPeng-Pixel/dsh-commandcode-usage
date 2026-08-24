# 测试

## 运行测试

```bash
npm test
```

当前使用 Node.js 内置 test runner 和 `tsx`，测试文件位于 `tests/`。

## 测试范围

- `tests/client.test.ts`
  - `getUsageReport` 解析四个 `/alpha/*` 端点
  - 部分失败降级与全 401 分类
  - `probeFiveHourWindow` 窗口解析
  - JSON 解析失败不会被误判为网络故障
  - 未配置 Key 时返回 `configured: false`
- `tests/poller.test.ts`
  - Poller 发布快照并在失败时标记 stale
  - 防止 in-flight 请求重叠

## 发布前检查

```bash
npm run typecheck
npm test
npm run build
```
