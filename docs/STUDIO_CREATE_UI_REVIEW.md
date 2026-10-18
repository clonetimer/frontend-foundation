# /create UI 设计审查试点 — P0

基线：main 47be38bd0f97c82b5b88438ab2a528fce58fe5d9；审查对象 apps/showcase/src/modules/pattern-atlas/builder/pages/create.route.tsx 与 create.css（并核对 studio.css 预览样式）。方式：GitHub 源码静态审查，**不是实际浏览器截图或人工试用**。

## 当前已有能力（源码可确认）

- 创建新项目 / 导入已有 Blueprint，输入项目与页面信息，选择空白、Bento、主从布局。
- 创建流程为左侧配置、右侧预览；高级 ID 收纳到 details；布局按钮采用原生 button + aria-pressed；已有小屏单列规则。
- 主要 CTA 是进入拖拽设计器，其他动作是保存项目文件。页面预览不直接承诺完整业务运行效果。

## 本轮可确认问题与处理

| 优先级 | 源码证据 | 处理 | 验证边界 |
| --- | --- | --- | --- |
| P1 | create.css 的 pa-create-template 仅定义 :hover / .active，未显式定义 :focus-visible；details summary 也无统一清晰的键盘焦点样式 | 增加明显的 :focus-visible 轮廓，覆盖模板、summary、发现链接 | 需浏览器键盘 Tab/Enter 手测焦点可见与焦点顺序 |
| P2 | create.css 的模板描述及底部说明文字使用 11px，辅助信息 12px | 将关键说明文字提升到 13px（受作用域限定），改善可读性 | 需在 320/375/768/1440 宽度检查换行和高度 |
| P2 | 模板按键有 aria-pressed，语义比自造 div 更好 | 保留原生 button，不改业务状态实现 | 需屏幕阅读器/辅助技术实测 |

## 不在本轮宣称已解决的事项

- 页面主色/正文对比度尚未做自动化 WCAG 实测；现有颜色的对比度需计算或浏览器审查，不可凭视觉给 PASS。
- CSS 布局静态有 1000px 和 580px 断点，但不是三视口截图 PASS；需真实核对水平滚动、卡片高度和信息密度。
- 创建已有项目后的导入失败恢复、按钮禁用态、文件保存以及从 /create 到 /studio 的完整跳转，需要真实浏览器验证。
- 不进行全局主题重构；已有 #hex 应逐步纳入 Design Token，不应在 RC 收口中无差别重写全部样式。

## 验证清单

1. 源码：检查新增 CSS 选择器只影响 /create，且不修改 React 逻辑、Foundation Kernel 或序列化协议。
2. 静态：pnpm check；pnpm patterns:stable:check（需安装依赖）。
3. 浏览器：键盘 Tab 到三个布局按钮，确认 focus-visible；Space/Enter 切换 aria-pressed；Tab 到高级设置并展开/收起。
4. 视口：320、375、768、1440px；核对布局卡片标题与说明不重叠，主操作按钮完整。
5. 工作流：新建及导入、切换布局、保存项目、进入 /studio、导出/重新导入、独立 ZIP 浏览器回归（影响范围决定是否需要全部回归）。
6. 证据：记录 commit、Node/pnpm 版本、对应 Actions、截图、错误列表与 NOT RUN 项。CI 自动绿灯不代替用户人工验收。

## P1 · 生产浏览器质量回归

新增 Studio RC 打包后 Chromium 自动化审查：测试入口为 tooling/scripts/pattern-atlas-studio-rc-smoke.mjs。真实 CDP Tab/Space/Enter 验证高级设置与布局按钮键盘可达、可见焦点及 aria-pressed；模拟 prefers-reduced-motion 核对模板过渡关闭；在 320、375、768、1440px 视口检查页面横向溢出、模板及主要操作的可见性，并保存截图。

输出 artifacts/pattern-atlas/studio-p0-evidence/create-ui-automated.json 和 create-*.png；证据包含 sourceCommit、平台、断言列表和视口几何信息。只有 PR 精确 HEAD 的 Linux/Windows 编辑器 Chromium CI 与工件通过后，才可写 AUTOMATED_PASS。人工视觉与屏幕阅读器验收继续是 NOT RUN；自动化不等于 Studio Stable 发布。

**此前仅完成源码检查；P1 的自动化新增项须以新 PR 的真实 CI 工件为准。人工检查仍待进行。**

## P1 实际失败归因（基于真实 Chromium）

初版浏览器回归在 320px 视口发现 documentScrollWidth=778px；/create 根表单自身为 241px，模板按钮和主操作并未越界。新诊断输出显示越界元素是 Showcase 顶部横向 Ant Design Menu 的 ant-menu-overflow-item，范围延伸至 x=778px。为避免改动冻结的 Foundation TopNavShell，本 PR 在 create.css 中仅对 /create 且视口宽度不超过 640px 时的顶部导航施加局部适配：Header 可换行，Menu 在限定宽度的内部水平滚动，内容区减小内边距。该整改仍须以修复后的 Linux/Windows CI 和截图判定，不能因修改 CSS 就标记通过。
