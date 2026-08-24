# 安全政策

## 受支持版本

当前处于预发布阶段，以最新发布版本为准。

## 报告漏洞

请勿在公开 issue 中提交敏感信息。如发现安全漏洞，请通过 GitHub Security Advisory 私下报告，或联系维护者。

## 安全注意事项

- 本插件会读取并转发 Command Code API 凭据，请勿在日志或文档中记录明文 Key。
- 浏览器端不接触明文 API Key；所有凭据写入均通过 DSH credentials 服务。
