# 历史实验记录（截至 2026-10-20，归档原文）

> 注意：下文的 `evidence/` 和自动生成 ZIP 原属 v0.3 临时交付包；本次 Git 归档不包含这些派生产物。复现步骤以本目录 README 为准。

# FF 需求驱动对照实验 v0.3：真正调用 Studio 源码导入/导出

2026-10-20 · **研究性实验，不修改 FF main、组件、内核或 Release。**

## 0. 判读摘要

- **新增证据：** 对实际 FF GitHub Release 完整源码 SHA `5a87866fde6f0afb0a8070882e4a18bffe0e25ae` 的 `studio/model.ts` 与 `studio/exporter.ts` 执行成功（不是另写一个假生成器）；候选 `atlas.studio.json` 经真实解析、规范化与重新导入结果一致；真实 `projectExportFiles` + `zipTextFiles` 已产出 **21 文件**的独立 React 源码 ZIP（约 232 KB）。
- **源文件检查：** 解压后 `11` 个 `.ts/.tsx` 文件使用环境自带 TypeScript 5.8.3 做语法解析、相对导入存在性检查，**0 个问题**。注意这不是 TypeScript 类型检查或 Vite 构建。
- **原业务 A：** v0.1 Python/HTTP/SQLite 单元及集成测试 **13/13 PASS**。
- **FF 业务侧协议适配 B：** Python HTTP + 设计静态规则 **11/11 PASS**（7 项 API/安全、4 项设计规则）；机器复核两个方案共有的查询子集返回一致。
- **没有通过：** 用 Chromium 启动 Studio 后，访问 `http://127.0.0.1:5188/studio` 收到浏览器 `ERR_BLOCKED_BY_ADMINISTRATOR`；浏览器导入/点击/下载尚不能验收。独立 React ZIP 的 `npm install --offline` 返回 `ENOTCACHED`，缺少 React/AntD/Vite 的 npm 缓存；随后的 `npm run build` 因依赖未安装而失败。不能将其写为构建通过或源码类型正确性已验证。**实际生产浏览器全闭环：未通过。**
- 另有 GitHub CI 构建完成的 Studio RC 编辑器二进制包，来源提交 `339f1e0404fd39ea1fd527e2289584187d298fb4`（不同于测试模型/导出器的 `5a87866`）；该包服务器能启动并 HTTP 200，但本机 Chromium 仍被策略阻止。不能把 CI 自身已有截图算作**本实验设计文件**浏览器验收。

## 1. 需要比较的业务事实

业务原话：**“把本地数据文件，转换为数据库文件，并且支持根据查询条件，执行检索和导出。”**

验收样例：10 行 UTF-8 CSV（示例遥测），真实写入 SQLite；根据 `设备编号 = FW-02 AND 温度 >= 42` 返回 **2 行**并导出；允许下载数据库文件。这个规则源自 v0.1 **实验默认假设**，不等于客户已签收的正式要求。

方案 A：根据 Q-01~Q-14 澄清后编写独立 HTML/JS + Python/SQLite 全栈业务应用。

方案 B：同样的 Python/SQLite 内核，采用 FF Studio `file-upload`、`table`、两个项目数据源和业务后端适配 `/api/ff/...`。此方案不是全功能替代：Studio 只覆盖通用交互子集。

## 2. 真实执行的 FF 路径

```text
atlas.studio.json（v0.2 设计候选）
  → FF 真实 model.parseStudioFile(input)
  → FF 真实 model.serializeStudioDocument(doc)
  → FF 真实 model.parseStudioFile(serialized) + 相等断言
  → FF 真实 exporter.projectExportFiles(doc)
  → FF 真实 exporter.zipTextFiles(files)
  → FF_Studio实际导出.zip（21 文件）
  → 解压完整性检查与 .ts/.tsx AST 语法检查
```

这是真实 FF 逻辑在 Node 中执行，**不等于** FF 编辑器 GUI 中手动打开项目、点击导出按钮成功；后两项被浏览器安全策略阻止。执行脚本保留于 `scripts/ff_import_export.js`，用户可用指定版本 FF 源码自行复现。

## 3. 功能对照与最终状态

| 需求 | A 独立业务应用 | B FF 现有能力 + 业务适配 | 本轮证据 |
|---|---|---|---|
| CSV/TXT 文件导入 | 完整后端/HTTP | FF FormData 文件控件、Python multipart 适配 | A/B HTTP PASS；FF GUI 未测 |
| 保存 SQLite 文件 | 完成 | 共享业务服务端内核 | HTTP + SQLite 文件头校验通过，不属于 FF 内核 |
| 列表、分页、排序 | 完成 | 固定字段表格和数据源可以配置 | B 合同测试 PASS、FF 真实导出代码已生成，浏览器未测 |
| 多数据集自由切换 | 完成 | 需业务状态联动 | FF 原生配置未实现 |
| 任意 CSV 表头生成列 | 完成 | 固定列最多 8 项 | FF 原生配置未实现 |
| 任意多条件 AND、数值范围 | 完成 | 搜索设备编号 + 状态枚举筛选 | FF 原生配置未实现目标 `温度>=42` |
| 导出**全部匹配**的 CSV | 完成 | 当前过滤条件未绑定下载动作 | FF 原生配置未实现 |
| 下载选中 SQLite 数据库文件 | 完成 | 依赖业务 ID 联动 | FF 原生配置未实现 |
| 可重编辑 Studio 配置文件 | A 不适用 | **FF 真实 parser + serialize** | PASS（Node，不是浏览器） |
| FF 完整独立 React 源码 ZIP | A 不适用 | **FF 真实 exporter** | 已生成 21 文件，ZIP 解压 PASS |
| 依赖安装 + TS 类型检查 + Vite 生产构建 | A 不适用 | 无 npm 缓存 | **阻塞，NOT PASS** |
| GUI/浏览器完整路径 | v0.1 浏览器同受策略限制 | 策略拦截 Studio localhost | **阻塞，NOT PASS** |

对照输入和查询数据未更改：共同支持的 `设备编号包含 FW-02 AND 状态=告警` 返回 **相同 3 行**；而完整目标 `FW-02 AND 温度>=42` 由 A 返回 **2 行**，B 不具备原生数值比较 UI，不允许通过人为改后端响应来冒充通过。

## 4. 可量化投入指标（只统计客观物理源码行数，不当作人力工时）

| 统计项 | 可复核数值 | 说明 |
|---|---:|---|
| A 手写业务前后端 | 5 个文件、**687 行** | app.py、core.py、静态 HTML/JS/CSS；CSS 为单行，行数受格式化影响 |
| B 业务适配 + Studio 文档生成脚本 + Studio JSON | 3 个文件、**553 行** | 约 194 行适配层、57 行生成脚本、302 行 JSON 配置；不能与 A 视为完全等价功能 |
| FF 自动输出的 TypeScript/TSX | **11 文件、2032 行** | 自动生成的结果，不能当作业务工程师亲自编写 |
| B Studio 输出 ZIP | 21 个文件、**约 232 KB** | 包含自动生成的 TSX、CSS、设计 JSON、P5 dormant reference，非可直接部署的 dist |
| 测试 | A 13/13；B 11/11；FF 导入/导出/解析 3 项 PASS | 范围不同，不能以“24 vs 3”比较产品质量 |

缺少真实的起止计时、参与人数、客户沟通时长、返工次数和完整运行时验收；因此 **不能得出 FF 更快 X% 或低代码降本 X% 的结论**。B 的业务完成度低于 A，是当前最重要的比较公平性约束。

## 5. 对 FF 路线的直接建议

**目前不解冻 FF 功能、不合并新 PR。** 可以直接保留以下上游方法（FF 外部）：

1. 客户原话 → 分层问题澄清（来源：原话/客户确定/AI 建议/开发假设）；
2. 业务规则 → 原生组件覆盖评估（完全可配、需接口适配、需业务定制代码、后端职责）；
3. 编号规则 → 独立验收用例与证据状态（PASS / PARTIAL / NOT_RUN / BLOCKED）；
4. 明确区分 FF 作为**前端基础设施**，不负责 SQLite 落盘、任意 SQL 条件语义、后端权限与事务；
5. 复杂业务查询器先在**具体业务应用**中实现，出现多个不同真实项目重复需求后，再讨论是否提炼 FF 可选扩展组件。

下一轮只值得补两个可判定的验收：有完整 npm 依赖的联网或内网镜像机器执行 `npm ci/npm install` 和 `npm run build`；允许 localhost 的真实浏览器手动导入 `atlas.studio.json`、在同源下真实上传、查询和下载，出具可复核记录。即使这两个都通过，B 原生配置仍不等价于 A 的完整任意条件查询器。

## 6. 证据路径

- `evidence/real-ff-import-export.log`、`FF_Studio实际导出.zip`：真实 FF 模型/导出器执行产物；
- `evidence/ts-parse.json`：生成 TS/TSX AST 解析及相对 import 校验；
- `evidence/baseline-tests.log`、`evidence/ff-adapter-tests.log`：独立 A/B API 测试；
- `evidence/npm-install-offline.log`、`evidence/npm-build.log`：因缺依赖而阻塞的清晰日志；
- `evidence/browser-probe.log`：本机 Chromium 行政策略阻断；
- `experiment/atlas.studio.json`、`experiment/ff_experiment/`：可复现设计输入和后端样本。

**FF 完整源码来自 Github Release**：https://github.com/clonetimer/frontend-foundation/releases/tag/foundation-source-v0.21.0-20261020 ，commit `5a87866...`。来源准确性已通过发布器生成的 Git archive/校验和，不向 FF 仓库写入任何变更。