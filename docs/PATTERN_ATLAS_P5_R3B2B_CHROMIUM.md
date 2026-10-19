# P5-R3b2b · 真实 Chromium 同源会话与持久回执联动验证

## 本阶段做了什么

新增独立的 Python 测试服务 tooling/scripts/aas_p0/p5_r3b2_browser_fixture.py 与 Node 验收程序 tooling/scripts/p5-r3b2-chromium-e2e.mjs。由 Studio RC GitHub Actions 在 Linux 和 Windows 的真实 production Chromium 上分别执行；它不是模拟 fetch 的 Node 单元测试。

测试页、浏览器会话端点、能力协商、任务读取、状态 PATCH 和回执查询**确实位于相同的 scheme/host/port**。服务端使用全新、临时、带专用标记的 R3b1 SQLite 合成库，不访问用户业务库。测试页仅显示测试标题，没有登录和业务 UI。

## 核心验证链路

1. 可信 Python 测试进程通过进程内 SyntheticSessionStore.issue 创建随机会话；只经父进程 stdin/stdout 测试控制通道把 Cookie 交给 Node。Node 使用 Chromium CDP Network.setCookie 注入 HttpOnly/SameSite=Strict Cookie；Cookie **不会通过 HTTP 登录端点、网页脚本、URL 或 SQLite 发放**，且断言 document.cookie 读取不到。
2. Chromium 使用 credentials=same-origin 读取 /api/session，由服务端获得 tenant/subject/sessionEpoch/role 与短期 CSRF Token；动态导入服务端固定路径提供的**原始** p5_capability_contract.mjs，在实际页面调用 R3a discoverP5Capability 和 authorizeP5WritePlan，检查固定能力协议、身份作用域、后端 ID、回执 epoch 和白名单。
3. 读取同租户合成 task 的强 ETag，将原始 method/path/key/body/ETag/tenant/subject/session/provider/receiptEpoch 写入**测试专用** localStorage journal（不保存任何 Cookie/CSRF）。缺失正确 CSRF 的 PATCH 必须 403，随后正确请求触发 R3b1 原子 SQLite COMMIT 与故意 HTTP 503。
4. 用**仅测试进程可访问的控制通道**撤销旧 Cookie、颁发相同 tenant/subject 的新 Cookie 和 CSRF；实际浏览器验证旧 Cookie 401，新 Cookie 正常。重新加载测试页，恢复 pending，并重新从服务端获取当前会话+能力证明。
5. 精确比较 pending 的身份、provider、receipt epoch，重新调用 R3a authorizeP5WritePlan，然后**只 GET 原始 Key 的服务端持久回执**，验证已提交，删除测试 journal，不再次 PATCH。通过测试宿主只读的进程控制查询确认 task version=2、回执=1、spent key=1、commit audit=1。
6. 切换为 tenant-b 身份，浏览器验证 R3a 旧作用域 grant 不可再使用，跨租户查询原回执返回 404；撤销会话后 /api/session 返回 401。

## 跨平台门禁

运行命令（需要 Python 3、Node 22+/24、Chrome/Chromium 与空闲 loopback 测试端口 5497 和 Chrome CDP 9399）：

    node tooling/scripts/p5-r3b2-chromium-e2e.mjs

GitHub Workflow pattern-atlas-studio-rc.yml 在 production Studio 现有 Chromium smoke 后执行本专项，保留机器可读验收证据：artifacts/pattern-atlas/studio-p0-evidence/p5-r3b2b-chromium-session-recovery.json。Cookie、CSRF、原始 Key 以外的秘密均不进入验收输出；原始 Key 也只在测试过程使用，不写报告。

## 边界与后续

- Chromium 执行的是独立的严格同源**测试页**，不是正式 Studio 登录 UI，更不是在普通 Modal/Drawer 或导出 ZIP 中自动接入持久幂等写入。当前 journal 是测试脚本的验证逻辑，不是可以复用的产品级恢复管理器。
- 测试身份仍由可信本地 Python 内存注册表创建，不是 OIDC/SSO、正式会话数据库或多实例生产网关。浏览器调试协议只能由受控测试进程访问；不能把 Cookie 控制 IPC 当作生产认证接口。
- 尚未实现浏览器跨标签页原子协调、业务多租户真实数据模型迁移、线上 TLS 会话签发、全量审计/凭据周期、真实反向代理/灾备，也没有改变项目 Stable 发布状态。
- P5-R3c 的下一阶段是**在真实身份后端可用之前先验证身份绑定 pending journal 的跨标签页互斥和显式恢复状态机**，之后才可规划小范围业务来源 opt-in 接入。

测试成功仅证明合成条件下的真实 Chromium 同源链路成立，不能宣称生产级 exactly-once。
