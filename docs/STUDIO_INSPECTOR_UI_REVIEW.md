# Studio Inspector · P2 可访问性与响应式审查

基线：main \`4151a532b0a99e921c8bfd2df911c0e46950c781\`，仅约束 Showcase \`/studio\` 应用层，不修改 Foundation 0.21.0 冻结的 Runtime/Compiler/Blueprint 契约。

## 源码审查发现

- Inspector 分类使用按钮及 \`aria-pressed\`；按 Enter/Space 激活为浏览器原生行为。但是“折叠/展开组件设置”按钮原来没有 \`aria-expanded\`，也没有建立与右侧设置面板的可访问关系。
- 项目页面切换使用原生 button，并通过 \`active\` 视觉样式提示。增加 \`aria-current="page"\`，以便辅助技术识别当前页面。
- Inspector 采用桌面固定属性工具栏与窄屏水平工具栏，在实际页面中仍应验证 \`320/375/768/1440px\` 视口的整体页面溢出和分类区域的可达性，而非仅测试 CSS 断点。
- 数据表格使用 Ant Design Table 的服务端分页/筛选/排序和逐行/批量删除确认。Modal/Drawer 使用已有 Ant Design 焦点语义和保存状态，但需后续进行真实表单错误、焦点返回与不确定写入专项检查。**本 PR 不将这些尚未执行的专项验收标记 PASS。**

## P2 最小整改

1. 为 Inspector 折叠按钮添加 \`aria-expanded\` 及展开态 \`aria-controls\`，为属性面板添加稳定 ID、区域名称和 \`role="region"\`。
2. 为页面切换按钮添加精确的 \`aria-current\`；保留现有按钮 API 与业务行为。
3. 将真实键盘 Tab/Enter 交互检查、四视口 DOM 几何检查及失败截图集成到 Studio 编辑器生产 Chromium 验收入口 \`tooling/scripts/pattern-atlas-studio-rc-smoke.mjs\`。
4. 只以实际精确 Git SHA 的 Linux/Windows CI 和制品作为自动通过证据；人工视觉、读屏以及 Modal/Drawer 后端事务仍需单独验收。

## 验收项与状态

- [ ] Linux / Windows \`Pattern Atlas Studio RC Artifact\` production Chromium
- [ ] Inspector 键盘访问、选中状态、折叠/恢复及当前页面语义
- [ ] 320/375/768/1440px 截图和横向溢出
- [ ] 原有 Studio → 独立 ZIP → 重导入回归
- [ ] 人工视觉签收（本轮不自动确认）
- [ ] Modal/Drawer 错误提示与读屏专项（后续阶段）

自动证据预定路径：\`artifacts/pattern-atlas/studio-p0-evidence/studio-inspector-ui-automated.json\`、\`studio-inspector-{320,375,768,1440}.png\`。
