# 验证证据与派生产物

历史 v0.3 曾有 HTTP/Python 测试日志、Chromium 阻断记录、生成的 React ZIP 和 npm 缺依赖日志。为了保持 Git 主干干净，本目录**不归档**这些派生文件。

请按上一层 README 的命令重跑；`run_comparison.py` 会自动创建此目录并保存当前的 `comparison-proof.json`（已被 .gitignore 排除）。

正式 FF Studio GUI/React 完整构建验收仍须在具备依赖与允许 localhost 的实际环境执行，并附上独立证据。
