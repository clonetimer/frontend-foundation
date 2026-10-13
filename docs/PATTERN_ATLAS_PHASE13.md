# Pattern Atlas · Phase 13 — API 工作流和画布定位

本版本基于 Phase 12 更新，仅修改 Showcase 应用层与 Showcase 开发 API；Foundation 核心 DSL、旧 Designer、Project Compiler 未修改。

## 使用方式

运行 `pnpm dev:studio`，在 `http://localhost:5173/studio` 打开统一设计器。

### 位置与尺寸

在画布选中任意非根组件，右侧「位置」→「启用绝对坐标」。X=0、Y=0 为**当前页面内容区左上角**。例如 X=240、Y=100 即距内容区左侧 240px、上侧 100px。W/H 是组件宽度和高度。新组件直接输入 X/Y 会自动启用绝对定位；已有文件未启用此模式时，原相对偏移值保持不变。可使用「恢复自动布局」退回普通网格/流式编排。

绝对定位经页级 React portal 渲染，因此嵌在面板和网格里的组件也可相对于整个页面定位，编辑器与独立 React 导出一致。**注意：坐标为 px，不会随手机宽度自动重排；请分别切换桌面、平板和手机检查碰撞或溢出。**

### 顶栏下方的重复小标题

Showcase 的 Shell 关闭了 Breadcrumb（面包屑）栏；顶栏导航和页面本身的正式标题仍保留。没有逐页删除或更改业务数据。

### 数据源工作流

详见 `docs/PATTERN_ATLAS_API_QUICKSTART.md`，界面可在右侧「数据源」展开「如何连接后端接口？」。

1. 右侧「页面」添加 **列表/详情/保存联动示例**。
2. 右侧「数据源」选择「普通接口示例」或「分页与映射示例」，点击「测试 GET 列表与详情」。
3. 如需真实后端，在同一面板替换 API URL、返回数组路径、主键字段、字段映射，点击「绑定到本页」。
4. 切换到「体验」，可搜索、筛选状态、排序、编辑详情并保存；配置新增 POST 与删除 DELETE 后可直接进行相应请求。
5. 使用「导出页面代码」，取得可重新编辑的 `atlas.studio.json`、基础 `foundation.project.json` 以及独立 React TSX/CSS。业务行为仅在 Studio React 输出中完整保留。

## 本轮修复

- 修复 Ant Design 6 `Divider.orientation="left"` 不合法：改为 `"start"`。
- 修复 `studio-v11.test.ts` 两处伪造 `Response` 对象引发 TS2352：改用原生 `Response` 构造器；不关闭 TypeScript 严格模式。
- Shell 关闭重复的 Breadcrumb。
- 位置面板提供相对于页面原点的绝对坐标和 W/H，保存、旧文件兼容以及导出同步。
- 数据源增加客户端/服务端筛选排序、POST 新增、DELETE 删除（删除需确认），以及相应的本地 Vite 演示 API。

## 技术限制

- 演示 API 使用 Vite 进程内的临时数组；重启开发服务器后恢复初始数据。它不是生产后端。
- 创建表单目前仅支持标题和默认状态（非通用 Schema 表单创建）；删除有二次确认，但后端要自行完成认证、权限、审计和防护。
- 浏览器使用 `credentials: 'same-origin'`，跨域 API 需允许 CORS 或使用同源反向代理；请勿将 Token/密码写入 URL 或项目文件。
- 筛选为单字段枚举筛选，排序为单字段升/降序；暂不支持复杂条件组合、多表关联或完整的审批事务。
- 原 Foundation Compiler **不支持 Studio 独有的 absolute geometry、数据源注册表或 CSS 特效**，应采用此项目导出的 React TSX + CSS 才能保留上述扩展能力。
- 不具备依赖安装的当前构建环境只做了离线检查、隔离类型检查、原编译器校验与 TSX 解析。需要在用户机器执行真实 Showcase `typecheck/test/build` 和浏览器交互验收，不能视为已生产验证。
