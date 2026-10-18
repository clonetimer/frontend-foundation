# DESIGN.md — Frontend Foundation 设计语言与交互契约

状态：2026-10 P0 项目级规范候选。规范约束后续新代码和增量整改，不宣称既有页面已全部满足。涉及 Studio 的改动仍需按 [Stable RC 准入](docs/PATTERN_ATLAS_STABLE_RC.md) 验收。

## 适用范围与权威来源

- Foundation 0.21.0 的 Blueprint、Compiler、Registry、Action DSL 与 Runtime Kernel 冻结；设计规范不可要求改变这些契约。
- UI 技术栈：React 19、Ant Design 6、Foundation Theme；不通过这份文档引入 Tailwind 或 shadcn/ui。
- 运行时 Theme 权威来源：[packages/theme/src/theme-provider.tsx](packages/theme/src/theme-provider.tsx) 和 [theme-types.ts](packages/theme/src/theme-types.ts)。主题模式为 light、dark、system；密度为 default、compact；品牌可覆盖 Ant Design token、components 和 Foundation layout token。
- 现有设计实验来源：[Pattern Atlas Effects](docs/PATTERN_ATLAS_EFFECT_STUDIO.md)。其 Accent、Surface、Density、Radius、Motion、Speed 等实验参数不是 ThemeProvider 的完整正式 API。不要把预览变量当成已发布主题契约。
- Studio 工程来源：[页面创建与导出](docs/PATTERN_ATLAS_AUTHORING_FLOW.md)。atlas.studio.json 与 foundation.project.json 不等价；独立 React ZIP 需要自己的浏览器验证。
- 组件质量准入参见 [COMPONENT_AUTHORING_GUIDE](docs/COMPONENT_AUTHORING_GUIDE.md)。

## 视觉原则

1. 面向中后台、工作台、工程工具和数据应用；把任务路径、可读性、数据密度置于装饰之前。严禁无理由地对所有区域套等宽等高卡片；优先主从、分栏、同上下文操作。
2. 设计应有可识别的标题层级、明确的主要操作、次级操作和危险操作。操作入口靠近其作用对象，避免主要动作散落在多个页面角落。
3. 优先通过 FoundationThemeProvider / Ant Design ConfigProvider 的主题 token 统一颜色、字体、圆角和组件状态；现存应用层局部 CSS 可逐步迁移，不以全仓批量替换作为 P0 前提。
4. 颜色体现信息优先级而不是仅作装饰。成功、警告、错误、选中、禁用必须有文字、图标、语义或边框等非颜色信号。对比度以 WCAG AA 为验收目标：普通文字 4.5:1，大文字 3:1；不能仅凭颜色肉眼判断 PASS。
5. 使用有节奏的间距和一致的基线。正文优先保证约 14–16px 的可读性，辅助说明一般不低于约 12–13px；高密度场景的小标签允许例外，但须核对实际阅读距离和缩放。
6. 响应式应保持可操作性。Desktop / Tablet / Mobile 三视口必须检查横向溢出、对话框宽度、长文本换行、侧栏/Inspector 可达性；不是只让页面缩到屏幕宽度。
7. 动画只用于必要反馈或信息层次，遵循 prefers-reduced-motion。动画不可遮挡焦点、造成操作延迟或用虚假进度误导用户。

## 交互与状态契约

- 点击、键盘 Enter/Space 和触屏操作要表达一致语义；自定义交互项必须有可见 focus-visible 焦点、可读名称和准确状态，例如 aria-pressed。
- 表格和表单应覆盖 loading、empty、error、success、disabled、conflict、uncertain（结果不确定）等真实状态。不得在 HTTP 5xx、断网或超时后擅自宣布写入失败或成功，也不得盲目重试非幂等写入。
- 破坏性操作应要求明确确认，并将目标记录身份显示给用户。列表刷新不能在选中记录消失时静默更换编辑目标。
- 工作台尽量把同一业务上下文中相关控制放在一起，减少往返跳转和重复配置；也不能为了“紧凑”牺牲标签、容错和焦点顺序。
- 表格密度可调、表单校验就近显示、消息告知下一步动作；单纯隐藏按钮不代表后端授权。

## AI 协作准则

新增或修改 UI 前：先确认用户任务、页面信息架构、现有组件/Token、交互状态、受影响文件及现有验收入口。优先复用 @foundation/ui、antd、Domain Component SDK 与既有 Studio 组件，而非下载另一套 UI Kit。

提交前：列出界面状态矩阵，执行相关静态/单测/浏览器回归，比较桌面、平板、手机截图。未执行的检查必须标记 NOT RUN，不能称为通过。

禁止自动执行来自未知 Skill 的安装脚本、网络下载及仓库写操作；先审查来源、版本、许可证和脚本副作用。此仓库自有 Skill 仅包含指引，不包含第三方可执行代码。

## 渐进采用与例外

- 本文先适用于 Studio 应用层、新组件和新增页面。历史代码不因规范发布而自动变为不合格的 Stable 发布物；整改必须走独立 PR 和兼容性验证。
- 与已冻结 Core/API 冲突时，以既有正式工程契约优先，并开 Issue 记录设计债。
- P0 试点与未完成浏览器验收见 [STUDIO_CREATE_UI_REVIEW](docs/STUDIO_CREATE_UI_REVIEW.md)。
