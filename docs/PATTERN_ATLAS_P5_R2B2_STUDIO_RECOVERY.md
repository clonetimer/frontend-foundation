# P5-R2b2 · Studio 隔离 AAS 原生写入与跨会话恢复 UI

## 实际实现

本阶段将 P5-R2b1 的 `p5_client_recovery.mjs` **作为唯一客户端协议实现**接入 Studio 编辑器的「接口管理 → 原生 AAS 幂等恢复」。用户必须在本次会话确认正在操作隔离合成模型副本，并手动输入 loopback 原生 HTTP 网关地址、合成模型 ID、目标状态和**临时写角色 Token**。

- 支持显式的一次状态 PATCH、原 Key 查询持久回执、经二次确认的原 Key 精确重放。
- 屏幕上可以识别当前 localStorage pending 操作并在页面刷新/重启后恢复；如果当前操作待确认，禁用新增写入。损坏的待处理日志显示阻断错误，不删记录，不放行新写入。
- 写角色 Token 只保留在短暂 React state 中，每次调用结束主动清空。不包含在工程数据、ZIP、浏览器 localStorage、日志或截图中。仍须警惕真实浏览器中的同源恶意脚本：此处是合成环境内的测试交互，**不是生产身份系统**。
- 只调用 `beginSyntheticStatusPatch/recoverSyntheticStatusPatch` 这两个专用方法；未改现有 DataSource/WidgetPreview/RecordProvider/Workflow 普通 POST/PATCH/DELETE，避免无后端能力声明时出现伪安全重试。
- 在 `tooling/scripts/aas_p0/p5_client_recovery.d.mts` 维护 TS 签名；浏览器编译使用原始 JS 模块而非另一份复制品。

## 自动化验收

既有 Studio RC 工作流在 Linux+Windows 编译 production editor 并运行真实 Chromium（`pattern-atlas-studio-rc-smoke.mjs`），新增 P5 native HTTP 试验：

1. 启动 `p5_browser_fixture.py`，通过 Python 标准库创建**全新临时** native SQLite `models` 合成数据库，显式准备 P5 回执表。使用 `make_handler`，只允许 `p0_case_1` 状态修改；未打开业务数据库。
2. 真正的生产 Chromium 打开 Studio 「接口管理」，明确启用合成试验，填写临时 Token，在 Ant Design Popconfirm 中确认一次状态写入。
3. 原生 SQLite 将 `models.status`、`evaluation_count` 和 `native_mutation_receipts` 同事务提交，故障钩子令网关第一次响应 HTTP 503；浏览器不得自动再次 PATCH，持久保留 key/ETag/原始 body。
4. 通过 Chromium 页面重新导航制造完整 React 会话重建，确保临时 Token 为空，但待处理回执仍被显示；用户重新输入 Token 后点击「按原 Key 查询回执」。
5. 核验确认为 committed，本地 journal 清除，原生数据库 `evaluation_count=1` 且只有一条持久回执；保存机器可读 JSON 和两张截图证据。

浏览器验收覆盖单窗口 UI+后端 HTTP/SQLite 503 和跨导航恢复；独立 `node --test tooling/scripts/aas_p0/test_p5_client_recovery.mjs` 覆盖 404 时不重放、显式相同字节重放、并发回执合同等纯客户端逻辑。后端 Python 合同测试仍保留。

## 限制

- 此处是**独立、显式的 Studio 管理工具面板**，不是普通业务表单通用自动保存功能，不是完整 P5-R2b 生产实现。由于协议规定只有强 ETag 与 `p0_case_N`，并不将通用 URL 或其他接口伪装成支持幂等。
- 未改变导出 ZIP 的业务调用行为。Studio 的 ZIP 工程配置不保存 Token；将此隔离工具打包进生成的业务页面既不安全也无必要。
- 没有多标签页/多设备互斥，存储检查非原子；没有真实租户身份、Token 轮换策略、收据 GC、生产迁移/回滚、重启后权限恢复、审计。错误或恶意页面脚本可能访问同源浏览器内存；仅用于明确授权的本地隔离测试。
- 生产环境采用该协议之前，必须由业务后端对能力、身份隔离、回执生命周期和部署模型单独验收。Studio 产品的人工可用性/视觉签收也仍单独完成。
