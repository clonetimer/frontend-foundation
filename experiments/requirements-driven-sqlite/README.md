# 需求驱动开发对照实验：本地文件 → SQLite → 检索与导出

> **实验示例（非 FF 稳定版功能）**。本目录只归档业务案例、需求记录、配置与独立测试；不修改 Foundation Blueprint、Studio、组件库或 Release。业务默认值均为**尚待客户确认的实验假设**。

## 基线与两条路径

- **A：独立业务应用**：`ff_experiment/app.py` + `core.py` + `static/`，在本机读取 CSV/TSV/TXT，写入真实 SQLite 文件，执行参数化条件检索，并导出 CSV。
- **B：FF Studio 优先**：`atlas.studio.json` + `foundation.project.json` 使用已有 Studio 文件上传与数据表格；`ff_experiment/ff_adapter.py` 在**业务服务端**实现 `multipart/form-data` 上传及固定字段分页查询适配。此方案**不能**通过 Studio 原生配置表达任意多字段 AND、温度数值比较、任意 CSV 动态表头和全条件同步导出。
- **比较依据**：`requirements/` 保存 Q-01~Q-14 澄清假设和验收追踪；`HISTORICAL_V03_REPORT.md` 记录 2026-10-20 对照实验实测范围与当时环境的限制。

## 快速复验（Python 3.11+，无额外 Python 依赖）

从**本目录**执行：

```bash
cd ff_experiment
python -m unittest discover -s tests -v          # 原业务：13 项
python app.py --port 8766                        # 本机访问 http://127.0.0.1:8766/
```

另开终端在**本目录**执行：

```bash
python -m unittest discover -s tests -v           # FF 适配/配置：11 项
python run_comparison.py                          # 真实 SQLite、共同查询子集、能力差距证明
python ff_experiment/ff_adapter.py --port 8768    # FF 业务适配接口
```

本机浏览器如果能够访问 loopback，可用 `ff_experiment/samples/设备遥测样例.csv` 导入后查看真实记录。应用只监听 `127.0.0.1`；切勿作为有公网访问权限、多人账户或生产数据的业务服务器。

## 可重编辑的 FF Studio 配置与源码导出

1. 使用已验收的 FF 源码（归档参考：`5a87866fde6f0afb0a8070882e4a18bffe0e25ae`），安装仓库锁定依赖并运行 `pnpm dev:studio`；打开 `/studio` 导入 `atlas.studio.json`。
2. 在 Studio 中打开/编辑/体验并通过官方按钮导出 React ZIP；本目录**没有**提交历史导出的 ZIP、构建目录、`node_modules` 或发布附件。
3. 在本目录可用真实 FF 解析器/导出器重跑（依赖 FF 环境安装 TypeScript）：

```bash
node scripts/ff_import_export.js /path/to/FF/repo atlas.studio.json /tmp/ff-case-export.zip
```

4. 解压后使用 `node scripts/check_export.js /path/to/unzipped-ff-export` 做 TS/TSX 语法和相对引用检查。**这不是** React/Vite 完整生产构建或 GUI 端到端验收。
5. 生产构建和 GUI 验收需要另外执行 `npm install && npm run build`、启动同源测试服务，并保存可重查的浏览器操作记录。历史 v0.3 因 npm 离线缓存缺失及 Chromium 环境政策阻断，均未宣称 PASS。

## 结果、能力边界与证据级别

| 验收项目 | 历史 v0.3 实测结果 |
| --- | --- |
| 独立 Python/HTTP/SQLite | 13/13 PASS |
| FF 业务适配与 Studio 设计结构检查 | 11/11 PASS |
| Studio 源码解析、序列化、真实导出器生成 React 源码 | PASS（Node 实际执行，不是 GUI） |
| 独立 React 构建 | BLOCKED（缺 npm 依赖） |
| Chromium 手工导入、上传、检索、下载 | BLOCKED（本地环境管理员策略） |
| B 与 A 的全部业务功能等价 | **NO** |

请勿将 CI 绿色等同于真实用户业务验收；本示例没有声明 FF Studio 能生产部署 SQLite 后端、权限系统或任意查询引擎。

## 安全与版本记录

- 数据为合成设备遥测，任何写入均落在本机实验 `data/`；提交中不存数据库、日志、私有文件或凭据。
- v0.3 归档报告提及的 `evidence/` 日志和历史生成 ZIP 是**当时的运行产物**，未纳入 Git。请运行上述命令重新产生当前环境证据。
- 历史报告的“未修改 main”描述对应原实验执行时的事实；本次仅把示例文件归档到 `experiments/`，并不改变 FF 核心。
- 后续如希望研究需求澄清自动化，首先扩展该**外部工作流**，不要未经真实需求验证就新增 Studio DSL 或正式组件。
