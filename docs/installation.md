# 安装

## 本地开发安装

```bash
dsh plugin --profile web add link:/绝对路径/dsh-commandgo-usage
```

## 发布后安装

```bash
dsh plugin --profile web add dsh-commandcode-usage-monitor
```

## 只读 `~/.dsh` 场景

如果 `~/.dsh` 被挂载为只读，无法直接 `dsh plugin --profile web add` 写入正式 profile。此时可使用项目内的 `scripts/dev-loopback.sh` 在可写 `DSH_HOME` 副本中回环验证，或解除只读后安装。

```bash
COMMANDCODE_API_KEY=user_xxx ./scripts/dev-loopback.sh 3099
```

启动后访问：

```bash
curl http://127.0.0.1:3099/commandcode-usage/status.json
curl http://127.0.0.1:3099/commandcode-usage/turn-cost.json
```
