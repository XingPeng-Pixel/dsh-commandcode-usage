# 文档索引

本目录维护 `dsh-commandcode-usage-monitor` 的完整项目文档。

## 快速导航

| 文档 | 内容 |
| --- | --- |
| [project-facilities.md](./project-facilities.md) | **完整技术栈与工作流 / 项目设施 / 上游快速拾取手册（推荐先读）** |
| [dsh-breaking-change-audit.md](./dsh-breaking-change-audit.md) | DSH 新源码破坏性更新适配审计（本次修改依据） |
| [plan-0.1.2-comp.md](./plan-0.1.2-comp.md) | 0.1.2-comp 分支完整兼容修改计划 |
| [architecture.md](./architecture.md) | 架构与数据流（简要） |
| [configuration.md](./configuration.md) | 插件配置项与示例 |
| [api.md](./api.md) | 对外 JSON 接口与字段 |
| [installation.md](./installation.md) | 安装与本地验证 |
| [development.md](./development.md) | 开发命令与回环验证 |
| [testing.md](./testing.md) | 测试范围与运行方式 |
| [security.md](./security.md) | 安全边界与 Key 处理 |

## 维护建议

- 上游接口/套餐变化时，优先更新 `project-facilities.md` 中对应的“外部依赖”与“已知技术债”章节。
- 所有文档以 `src/` 代码为准；配置以 `src/config.ts` 为准。
- 新增文档后同步更新本索引。
