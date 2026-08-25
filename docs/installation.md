# 安装

## 方法一：通过 npm 安装（推荐）

插件已发布到 npm，可直接用 DSH 官方插件命令一键安装：

```bash
dsh plugin --profile web add dsh-commandcode-usage-monitor
```

## 方法二：本地源码添加（开发/体验）

```bash
# 1. 克隆仓库
git clone https://github.com/XingPeng-Pixel/dsh-commandcode-usage.git

# 2. 进入项目目录
cd dsh-commandcode-usage

# 3. 安装依赖并构建（首次需要，生成 lib/）
npm install
npm run build

# 4. 使用 DSH 官方插件命令添加本地源码
#    link:$(pwd) 会自动展开为当前仓库的绝对路径
dsh plugin --profile web add "link:$(pwd)"
```

> 也可以写成 `dsh plugin --profile web add link:/绝对路径/dsh-commandcode-usage`。

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
