# P5-R3c2b1 · 独立 React ZIP 真正加载共用恢复模块的验收

## 为什么需要这一阶段

P5-R3c2a 已证明三个 P5 参考模块在生成 ZIP 前后的文本一致，且真实 Chromium 的独立测试页能够运行原仓库模块；但导出 ZIP 将这些 `.mjs` 存放在项目根目录 `p5-reference/`。在 Vite 构建后的生产站点中，这些未被应用导入的源文件不会自动被复制到 `dist/`，浏览器因而无法从相同 origin 加载它们。仅证明文件存在于 ZIP 不等于证明运行时可访问。

## 变更

- 在导出 ZIP 中把三个参考源文件存放到 `public/p5-reference/`。Vite 将其**原字节复制**到构建产物的 `dist/p5-reference/`，依赖的相对导入路径保持不变。
- **默认不在生成应用中 import、不绑定业务数据源、不开启任何写入。** 只有由可信运行时显式调用 `import('/p5-reference/p5_r3c2_runtime_adapter.mjs')`，才会加载这些模块。
- 在实际 ZIP 解包并执行 `npm run build` 后，构建验收逐一检查三份文件在 `dist` 中存在且字节一致。现有 Studio/ZIP 源码同步检查继续负责仓库存储快照的一致性。
- 在正式 React ZIP Vite preview 的真实 Chromium 页面中，显式动态 import 共用适配器，验证完整 ES module 依赖图能够加载；缺少可信宿主回调时拒绝初始化，带有宿主回调但未明确授权时拒绝发起任何新写入。原有 POST/PATCH/DELETE 模拟服务的计数必须保持不变。

## 验收

```bash
node tooling/scripts/sync-studio-widget-export.mjs --check
node --test tooling/scripts/test-p5-r3c2-export-parity.mjs
node tooling/scripts/pattern-atlas-export-build-smoke.mjs --browser
```

第三项在真实生产构建出的 ZIP 独立项目中执行，并保留原有的表单、联动、批量删除、异常恢复和浏览器图表回归测试；没有降低任何验收断言。

## 仍然禁止自动接入

公开访问这些无秘密的 `.mjs` 文件本身不代表任何访问者获得后台权限。P5 协议仍要求可信宿主同源身份、CSRF、短期能力协商、强 ETag、服务端原子持久回执和 Web Locks。浏览器可执行源码并不等于生产 SSO 或业务数据库已完成。

本阶段只完善**可选模块的独立应用可访问性与真正运行时验收**。不接入 Studio/ZIP 普通业务写入、项目数据源、生产多租户、跨设备事务或 Stable 自动发布。
