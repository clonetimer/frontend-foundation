# Chromium 浏览器验收启动失败：P5-R3c1 合并后门禁修复

## 触发原因与证据

合并 PR #59 后，`main` 的 CI / Security / Storybook 均通过，但 Linux 上 Studio RC 与 Stable 的旧有浏览器入口均在 Chromium DevTools HTTP 端口启动阶段超时（TypeError: fetch failed），分别早于编辑器界面断言和独立导出运行时断言。Windows Studio RC 成功，P5 的双平台专项与 PR 分支的 Chromium 集成验收成功。首次主分支失败后仅重跑 Linux Studio RC 仍出现同一 CDP 启动超时。

本修复**不把浏览器运行失败变为成功**，不省略任何原有业务断言，也不降低真实浏览器的端到端验收范围。它使浏览器启动阶段的失败具备可诊断性，并限制纯启动阶段的重试。

## 实现

- 新增 `tooling/scripts/chromium-cdp-start.mjs`，集中处理生产 Studio RC、独立 React ZIP 浏览器验收和 P5-R3b2b Chromium 验收的浏览器启动。
- 启动前检测 CDP 端口是否已被其他服务占用；防止误连接外部浏览器。
- 只对**尚未开始执行页面测试时**的 Chrome 启动失败做最多三次有界尝试（每次全新的临时 profile 子目录）；绝不自动重试 PATCH、Web Locks、回执查询或浏览器内部断言。
- 进程捕获最近一段 Chrome stderr、非零退出状态及 DevTools 探测结果；若全部尝试失败则整个 CI 作业继续 FAIL，显示具体失败诊断，而不是只打印无法连接。
- 保留强隔离 flags，禁止代理服务器，配置 CDP 监听 127.0.0.1；旧的产物检查、服务器模拟、回执/浏览器断言及所有 fail-closed 边界不变。
- 新增两项无浏览器依赖的启动参数拒绝与不存在 Chrome 可执行文件诊断测试，纳入 Linux CI Static Gates。

## 验收与部署边界

以新 feature 分支运行 CI、Linux/Windows Studio RC、Stable Full Admission、Security；仅当精确 HEAD 四项全部通过才合并，合并后再复核 `main` 的相同 SHA 下五套核心 Actions。

此修复只是改善**测试基础设施**可靠性，不能证明真正的生产浏览器环境、SSO、数据库或 P5-R3c 的跨设备 exactly-once 语义。Stable 发布仍需原有人工准入。
