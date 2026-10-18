# Component Authoring Guide — Foundation / Studio

状态：P0 工程审查清单；不改变 0.21.0 Frozen Kernel，不增加新的包运行时或组件系统。

## 优先复用与所有权

先检查 @foundation/ui、Ant Design 6、@foundation/theme 与 [Domain Component SDK](DOMAIN_COMPONENT_SDK.md)。业务组件属于项目或领域包；Foundation Runtime 只存放经评审的通用能力。Domain Registry 负责组件元数据；Designer 使用安全占位，不运行未知项目包源码。生成的 TSX 应使用静态导入，不要求运行时 JSON Renderer。

## 组件 API

- 使用 React + TypeScript 明确公开 props；命名遵循业务概念，必填与可选、默认值、禁用行为可解释。避免彼此冲突的布尔开关堆叠；复杂控件考虑清晰的子区域或数据模型，但不要将 React 运行时自由组合直接写进 Studio 的持久化 JSON。
- 优先组合而非单体超级组件。结构与业务状态分离；事件回调和异步 side effect 应有稳定契约；错误状态不能与成功混淆。
- 如需要 Domain Registry，必须提供命名空间 ID、公共导出、受约束属性、Binding/Event 元数据，验证 npm pack 与 Compiler 映射。不要绕过现有 Registry 增加自定义执行脚本。
- 只为已出现的业务需求添加新的组件或公开 API；不因引入 Skill 扩张 Foundation 0.21.0 的 Blueprint DSL。

## 可访问性与交互

- 原生 button、input、label 优先。自定义控件支持焦点可见、键盘激活、可读名称、准确 role/aria 状态和禁用语义。
- Modal/Drawer：打开后焦点进入合理位置；关闭后恢复；错误不会导致键盘陷阱。确认操作表明目标与不可逆性。
- Table：分页/排序/筛选同步显示状态；空态、加载中、失败和结果不确定均可辨识；批量操作只作用于用户确认的记录；不得丢失选中 ID。
- Form：错误提示与字段关联；编辑草稿在可恢复错误时尽量保存；重试写操作之前先从服务端核实。
- Chart：有文本替代、单位、数据时间范围；空数据不是正常零值；高密度图表仍需要键盘/触控可达的解释路径。
- 响应式验收不只查 CSS breakpoints，还需查溢出、滚动区嵌套、可点击区域、焦点顺序。运动遵循 prefers-reduced-motion。

## 验收证据

每个 UI 变更至少记录：影响页面、关键操作、Desktop/Tablet/Mobile 截图、键盘 Tab/Enter/Escape 复核、读屏或语义检查、源代码单测及浏览器用例、导出独立 ZIP（若影响 Studio 生成器）检查。不能执行的项目写 NOT RUN 并说明原因。

已存在的验证入口包括：pnpm check、pnpm patterns:stable:check、Studio Windows/Linux CI、独立 React ZIP Chromium 验收；详见 [Stable RC](PATTERN_ATLAS_STABLE_RC.md)。Storybook 已安装 addon-a11y，但插件存在不代表所有组件已完成无障碍验收。

## PR 审查清单

- [ ] 使用现有主题、组件或登记了必须新增的理由
- [ ] props/state/event 有类型、有文档，无意外副作用
- [ ] 明确 loading/empty/error/success/disabled 和破坏性操作
- [ ] 键盘、焦点、ARIA、文字对比度及 reduced-motion 已核查
- [ ] 三视口及典型长文本/空数据场景已核查
- [ ] 单测、跨平台 Studio 门禁与导出 ZIP 回归按影响范围执行
- [ ] 未验证项不标 PASS，未改变冻结 Core/Compiler 契约
