# Pattern Atlas · Phase 8：组件布局 / 侧栏 / API / 多页面

## 设计目标

Phase 8 沿用 Phase 7 位于 Showcase `/studio` 的统一设计器，不替换 Foundation 核心包、Blueprint v1、旧 Visual Designer 或编译器。

### 右侧设置栏

- 原本的五个横向 `antd Tabs` 在狭窄面板中会遮蔽末尾的「风格」。改为固定竖向分类工具栏：**页面、内容、位置、形式、交互、特效、数据、风格**。
- 工具栏始终存在；点击当前分类收起全部属性，点击其他分类展开对应面板。窄屏工具栏变为横向可滚动工具条。
- 编辑器仍保留撤销/重做、选中组件、图层与拖放机制。

### 位置与大小

- 在右侧 **位置** 中可以设置 `X`、`Y`、`宽度`、`高度`，单位为 CSS 像素；空值表示自动。
- X/Y 为相对排版位置的**视觉偏移**（CSS `translate`），不会破坏 Grid/Flex 的其他组件流；**不是**自由绝对定位的 CAD 画布。
- 宽度限制在 40–2400，高度限制在 24–1800，偏移限制在 ±2000；设置宽度时也受父容器的 `max-width:100%` 约束。
- 在网格里还支持跨列数；重排顺序仍请拖放图层。
- 数值配置存储在 `atlas.studio.json` 的 decorations.geometry；与特效、交互同时导出到 React 组件源码中，不向冻结的 Foundation Blueprint 增加未知字段。

### 数据 API

- 右侧 **数据** 当前仅支持 **数字指标 / 文字：GET**，以及 **按钮：POST**。其他组件显示能力范围，不提供虚假的“已接入”表单。
- 使用相对地址 `/api/...` 或 `https://...` / `http://...`。GET 可指定 `data.total`、`data.items.0.name` 等响应路径；POST 可配置 JSON 请求体。编辑器提供「填入示例接口」：本地 Vite 开发服务提供 `/api/studio-demo` GET / POST 演示端点，不会连接生产后端。
- 「体验」模式的 GET 会使用浏览器 `fetch()` 调用实际接口；测试按钮可测试请求；体验模式 POST 点击前会二次确认。
- 导出的 `studio-api.tsx` 包含对应 GET / POST 运行时；导出的 `pages/*.tsx` 会使用它调用接口。
- 浏览器对跨域 API 执行 CORS 规则：本项目**不会绕过浏览器安全机制**，不包含代理服务或后端身份验证，使用同源 cookie 凭证策略。不要把 API 密钥、口令、Token 放到 Studio、请求体或导出的浏览器代码里。
- 尚未实现复杂表单提交、可视化接口调试器、列表字段映射、认证刷新、分页缓存与请求依赖关系。

### 多页面与导航

- 既有「添加页面」继续使用 Foundation v1 Blueprint pages / navigation；新增的右侧 **页面** 分类可以选择左侧目录、顶部菜单、隐藏导航、目录宽度和菜单顺序。
- 编辑画布中的导航使用与项目文档相同的页面与标题；在项目页面之间切换时保留各页的组件与特效配置。
- 导出包增加 `StudioApp.tsx`：以 `#/page-id` 使用浏览器 hash 路由，展示多页面与导航，不要求单独安装路由库；移动端把左侧目录转换为横向导航。
- `foundation.project.json` 依旧包含核心 Blueprint 页与导航，原 Compiler 只编译其原生支持的部分，不会把 Studio 专有的 API、尺寸偏移和动效加入 Blueprint 输出。

### 文件格式兼容

保持 `pattern-atlas-studio` version 1；旧 Phase 7 JSON 可继续导入，缺失的 shell 会自动使用 `sidebar` / 188px 的默认值。所有用户设置在导入时进行类型与范围校验，并对非法 API URL、路径、POST JSON 内容拒绝保存。

## 验证边界

完成了以下离线校验：

- Foundation 仓库原生离线验证和既有 126 项测试；
- 以严格 null / exact optional 类型规则，对新 Studio 逻辑与 TSX 进行隔离 TypeScript 检查；
- 测试旧文件导入、多页面导航、尺寸、API GET/POST、ZIP 导出；
- 生成的 React 组件、入口与 API runtime 的 TSX 语法和隔离类型检查；
- 两个页面的实际 Foundation Blueprint 校验与编译。

未在当前 Linux 环境完成含真实 npm 依赖的 Showcase `vite build`、`vitest` 与 Windows 浏览器点按拖拽验收。请不要将本阶段标记为 Stable，直到在有依赖的环境运行完整测试。

## 推荐验收顺序

```powershell
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev:studio
```

浏览器进入 `http://localhost:5173/studio`，按顺序验证：

1. 选择任何组件，在窄栏打开「特效」；折叠属性栏并重新展开，检查所有八个分类都可见。
2. 选中「进行中」指标，在「位置」填写 X=16、Y=8、宽度=220、高度=140，观察变化，然后撤销和恢复自动布局。
3. 右侧「页面」选择左侧目录，新增一页，切换两页，改变导航排序，试验平板和手机预览。
4. 选择数字指标，在「数据」中配置 GET 与取值路径，打开体验；选择按钮配置 POST，确认后测试。应分别观察请求成功和后端拒绝 / CORS 错误。
5. 导出 ZIP，检查 `StudioApp.tsx`、`studio-api.tsx` 和各页面 TSX；重新导入 `atlas.studio.json` 验证配置没有丢失。
