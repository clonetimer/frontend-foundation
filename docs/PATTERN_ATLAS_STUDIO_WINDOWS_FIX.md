# Windows 启动修复：`pnpm dev:studio` / `spawn EINVAL`

适用基线：Frontend Foundation 0.21.0 + Pattern Atlas Phase 6。

## 故障

在 Windows PowerShell、Node.js v24、pnpm 环境执行 `pnpm dev:studio`，构建开始后立刻抛出 `Error: spawn EINVAL`。根因是 `tooling/scripts/dev-studio.mjs` 使用 `child_process.spawn('pnpm.cmd', args)` 直接执行 `.cmd` 文件，Windows 新版 Node.js 不支持无 shell 运行这类脚本。

## 修复内容

- 首选 `process.execPath` 直接启动 `npm_execpath` 指定的 pnpm JS 入口，无需 shell，支持目录名中的空格。
- 如果 pnpm 不是 JS 入口，在 Windows 上通过 `cmd.exe /d /s /c "pnpm ..."` 调用固定的命令参数；Linux / macOS 仍直接调用 `pnpm`。
- 限制 Windows shell 回退的参数为安全字符，避免未来无意引入命令注入风险。
- 一台服务退出时关闭另一台；Windows 优先使用 `taskkill /T /F` 清理进程树。
- 新增 `node --test tooling/scripts/dev-studio-launch.test.mjs`（5 项测试）。

没有修改 `package.json`、`pnpm-lock.yaml`、Designer、Showcase 或 Foundation 核心包。

## 覆盖修复文件

只需把增量补丁 ZIP 中的 `tooling/scripts/` 和 `docs/` 按原始相对路径解压到工程根目录，允许覆盖原始 `tooling/scripts/dev-studio.mjs`。

在 PowerShell 中（当前目录必须是 `package.json` 所在目录）：

```powershell
Expand-Archive -Path 'D:\Downloads\pattern-atlas-phase6-windows-fix-overlay.zip' -DestinationPath . -Force
node --test tooling/scripts/dev-studio-launch.test.mjs
pnpm dev:studio
```

请把示例的下载路径替换成真实文件路径。无需重新 `pnpm install`。

启动后默认端口：

- Showcase 中文工作台：http://localhost:5173/
- 新建项目页面：http://localhost:5173/create
- Designer 拖拽编辑：http://localhost:5174/

退出请在运行 `pnpm dev:studio` 的终端按 `Ctrl+C`。

## 无补丁的临时替代方式

```powershell
pnpm build:packages
```

随后使用两个 PowerShell 窗口分别运行：

```powershell
pnpm --filter @foundation/showcase dev
```

```powershell
pnpm --filter @foundation/designer dev
```

## 验证范围

- Linux Node.js 22.16.0：5 项新测试通过，含假 pnpm CLI 的启动完整链路。
- 原仓库离线验证：126 项全部通过。
- Windows 启动命令由单元测试覆盖，**尚未在 Windows + Node 24 的真实进程环境测试**。
- 无项目 `node_modules`，未重复运行完整 Vite 构建或实际浏览器验证。
