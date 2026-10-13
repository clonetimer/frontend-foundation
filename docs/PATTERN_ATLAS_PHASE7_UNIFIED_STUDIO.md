# Pattern Atlas · Phase 7 统一设计器

## 范围与决策

用户反馈：`/create` 的 JSON 预览难以理解，界面出现开发命令/端口说明，独立的 5174 Designer 与 5173 图鉴/特效无法直接配合。本阶段的主线是让 5173 Showcase 自己完成「创建项目 → 拖拽编辑 → 配置形式/特效/交互 → 导出页面」，而不是强制跨应用传递 Blueprint。

设计原则：

1. **保留原工具链**。现有 Foundation Blueprint v1、Project Compiler、Designer、Registry/SDK 的所有代码与契约不修改；独立 Designer 只是移出新手默认路径，暂不删除。
2. **分离数据归属**。`StudioDocument` 包含 `blueprint: ProjectBlueprintDocument`、`design: DesignConfig`、`decorations: Record<pageId:nodeId, StudioDecoration>`。展示形式、特效、演示按钮反馈在 Studio 私有 metadata 中，不向冻结的 Blueprint DSL 注入新字段。
3. **结果可携带、可继续编辑**。本地自动保存只是便利；ZIP 的 `atlas.studio.json` 是可再次导入的完整配置，`foundation.project.json` 是 Compiler 标准入口，`pages/*.tsx` + `studio-effects.css` 是 Studio 可展示效果的可修改实现。
4. **有限能力明确标注**。原生 Blueprint 编译与 Studio TSX 导出不等价。复杂看板拖拽、流程编辑器、业务 API、完整表单验证、权限等尚未实现；目前的模式选择仅包括可演示的 Bento、看板分列、时间轴、折叠视觉排列，不代表全部 38 种交互已能配置为成品。

## 关键路由

| 路径 | 用户界面 |
|---|---|
| `/create` | 图形化创建向导和页面预览，隐藏非必要 ID 字段 |
| `/studio` | 新增的统一可视化拖拽设计器 |
| `/designer` | 重定向 `/studio`，不再出现独立服务运行说明 |
| `/patterns` | 布局/交互图鉴 |
| `/patterns/effects` | 18 种特效实验室 |
| `/patterns/config` | 设计参数配置中心 |

## Studio 操作

- 左侧：组件库（布局 4 类、基础内容 7 类）及组件树；组件可以点击插入或 HTML5 拖入，已有组件可以重排到有效位置。
- 中间：所选页面的实时结构预览，可切换桌面/平板/手机，支持「编辑 / 体验」以及撤销、重做。组件树和画布选择关联。
- 右侧：内容（文本、标题、网格列数、间距等）、形式（几种展示形态及网格跨列）、交互（按钮提示、切换、项目页面跳转）、特效（18 种白名单 CSS 效果）、风格（主题色、字体、间距、明暗、动效偏好等）。
- 项目：可导入 Studio JSON 或原 Blueprint，增加页面时保留当前页面及其形式/效果配置；切换项目会保留一份可恢复的上次草稿。
- 导出：浏览器生成无外部 ZIP 依赖的源码包。生产环境使用前需要检查 React/Ant Design 依赖、复制 CSS、安装路由并接入数据服务。

## 关键目录

```text
apps/showcase/src/modules/pattern-atlas/
  studio/
    model.ts             # 文档、树操作、读写和严格兼容清洗
    StudioCanvas.tsx     # 画布可视化、拖放、演示交互
    effect-styles.ts     # Studio 与导出页面共用的视觉效果 CSS
    exporter.ts          # Blueprint + Studio 文件 + React TSX/CSS + ZIP
    pages.route.tsx      # 统一设计器
    studio.css           # 工作台样式和响应式
  tests/studio.test.ts   # 模型与导出测试（真实 Vitest 待验收）
```

## 运行与验收

正常使用只需要 `pnpm dev:studio`，其脚本现指向 Showcase 的 `pnpm dev`。原来的 `pnpm designer` 可按需单独运行。新增的所有用户导航文案均已改成中文，开发端口不再展示为面向用户的功能说明。

本阶段已经检查：

- 原仓库 126 项离线校验；仓库边界 / 架构 / 设计模型镜像检查。
- Studio 模型与导出的 TypeScript 严格静态检查；Studio/Create/Canvas TSX 在简化类型声明下的检查。这不等同安装真实依赖后的 Showcase 类型检查。
- 27 条新增模型和导出运行断言；ZIP 完整性及 TSX 语法。
- 导出的基础 Blueprint 通过原 Project Compiler `validate` 和 `compile`，产出 React 项目结构；这是原编译器路径，不是 Studio React TSX 的 Vite 构建。

**待用户具备完整依赖的环境验收**：

```bash
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev:studio
```

重点验证 `/create` → `/studio` → 新增页面、拖拽、体验、导出 ZIP → 重新导入 `atlas.studio.json` 的完整流程；同时通过真实浏览器测试桌面/移动端、焦点与键盘操作。新设计器尚未宣称完成生产级浏览器测试。

## 下一阶段可选路线

- 提升视觉拖放精度、响应式断点规则、键盘操作与无障碍。
- 从图鉴一键将更多真实布局/组件模板插入选中页面，而不仅是形式标记。
- 扩充真实表单校验、列表联动、数据绑定；考虑沿用 Domain Component SDK 而不是复制核心协议。
- 接入长期项目仓库保存/版本控制与发布流水线。
