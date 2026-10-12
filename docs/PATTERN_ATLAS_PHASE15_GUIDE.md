# Phase 15：业务工作流条件分支、结果变量、组件事件及执行记录

本阶段基于 Phase 14，原 Foundation 0.21.0 Blueprint DSL、编译器、Designer 核心包不变。Studio 设计文件格式仍为 `pattern-atlas-studio` v1，旧工作流可正常加载。

## 一、在设计器里完成一个工作流

1. 打开 `/studio`，在画布中选择**操作按钮**。
2. 右侧展开「流程」，按顺序添加步骤：确认操作、请求后端 API、判断条件、显示消息、通知其他组件等。
3. 「判断条件」填写变量路径，选好判断方式，再分别配置「条件成立时」与「条件不成立时」的动作（各最多六步，不支持嵌套判断）。
4. 「通知其他组件」可以从当前页面组件列表中选择目标，并配置「突出显示」或「聚焦输入控件」。该功能**不会模拟点击按钮，也不会向后端写入数据**。
5. 切换「体验」模式，点击按钮。再查看右侧「流程」下方的**最近执行记录**。
6. 点击「导出页面代码」时，React 独立工程包含相同的 `studio-workflows.ts` 执行器和运行时日志入口。

### 示例：读取列表数量后提示

| 步骤 | 配置 |
| --- | --- |
| 1 · 请求 | GET `/api/studio-demo` |
| 2 · 判断 | 变量 `results.step-1.data.count`，方式「有值」 |
| 2A · 成立 | 显示 `列表数量：{{results.step-1.data.count}}`，可追加突出显示某个组件 |
| 2B · 不成立 | 显示 `列表暂无数据` |

注意：变量 `step-1` 必须与 API 请求步骤的 ID 对应。仅在**该次按钮执行期间**可以读取这个请求的结果；不会永久保存到项目文件、日志或浏览器存储。

## 二、支持的变量

- `selectedId`：当前选中记录的主键。
- `draft.title`、`draft.status` 等：当前记录编辑表单中的字段。
- `results.step-1.data.id`：之前 `step-1` 请求返回 JSON 中的字段；数组元素可使用数字下标，例如 `results.step-1.data.items.0.id`。

**插入方式：** 在提示文本、API 地址或 JSON 请求体的**字符串值**内使用 `{{变量路径}}`。例如：

```json
{
  "title": "{{draft.title}}",
  "recordId": "{{selectedId}}"
}
```

URL 替换时自动 URL 编码，例如 `A/B` → `A%2FB`。`{id}` 老写法仍支持。请求体必须是有效 JSON，变量会作为字符串安全替换，不会执行 JavaScript 表达式。

## 三、执行安全边界

- POST、DELETE 和记录保存必须在本次执行路径中**已经明确通过确认步骤**，取消后不继续执行。
- 工作流最多 12 个顶层步骤，条件分支每侧最多 6 个动作，不支持循环、递归判断、并行任务或任意脚本。
- 请求只允许明确配置的 HTTP(S) 地址或相对路径；浏览器按 `same-origin` 方式发送请求，跨域及身份认证由实际后端负责。
- 支持 GET/POST/DELETE，请求 JSON 响应的变量读取上限为 64KB；不会把响应体保存在日志里。敏感凭据不应写入设计文件。
- 最近执行记录最多保留 60 条，**仅在当前运行内存中**，不会默认保存，也不包含 URL、请求体、响应体或密码。
- 组件事件当前支持「聚焦输入」与「突出显示」，不是通用跨组件数据流引擎。复杂事件、持久化审计和服务器后台任务属于后续能力。

## 四、验证方式（Windows PowerShell）

在项目根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @foundation/showcase typecheck
pnpm --filter @foundation/showcase test
pnpm --filter @foundation/showcase build
pnpm -r build
pnpm dev:studio
```

浏览器内访问 `http://localhost:5173/studio`，在「流程」中验证条件、组件高亮与执行记录。

**独立浏览器冒烟脚本**（另开 PowerShell，先保持 5173 运行）：

```powershell
$env:CHROMIUM_BIN="C:\Program Files\Google\Chrome\Application\chrome.exe"
pnpm patterns:workflow:browser-smoke
```

该脚本使用隔离的临时浏览器档案，不会动用户已有的项目草稿；仅发送 GET 到 Showcase 的本地演示接口。它检查「读取 → 分支 → 组件高亮 → 日志」，无需连接真实后端。可将 `CHROMIUM_BIN` 指向实际 Chrome/Chromium 地址，也可设置 `STUDIO_SMOKE_URL` 指定 dev server 地址。

## 五、工作台与生成源码的区别

- **Studio 扩展导出**：`StudioApp.tsx`、`studio-records.tsx`、`studio-workflows.ts`、`studio-effects.css` 等，包含上述运行时能力。
- **Foundation Blueprint**：`foundation.project.json` 仍仅描述 Foundation 可编译的页面与基础组件。原 Project Compiler 不负责编译 Studio 专有工作流和视觉特效。

如需把 Studio 导出合并进已有业务系统，必须正确配置真实 API、鉴权、环境变量、路由和构建依赖。不要把演示接口视为生产后端。
