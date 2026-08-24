# 贡献指南

欢迎贡献！请先阅读 [README](README.md) 和 [开发文档](docs/development.md)。

## 开发流程

1. Fork 本仓库并创建特性分支。
2. 本地运行 `npm install`。
3. 修改代码后运行：
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
4. 提交前请确保不包含真实 API Key、Token 或个人数据。
5. 创建 Pull Request，说明改动内容和验证结果。

## 代码风格

- TypeScript + ESM
- 使用 `src/` 组织源码，`tests/` 放单元测试
- 浏览器端组件使用 React 函数组件 + CSS Modules
