# Frontend Foundation：Windows `Root packageManager must pin pnpm 11.x` 修复

适用仓库：`clonetimer/frontend-foundation`，本次验收完整源码基线 `aa3e6ad323915def8406ced024c64f59940d7745`。

## 诊断结论

报错来自 `tooling/scripts/repository-check.mjs` 对**仓库根目录 `package.json` 的 `packageManager` 字段**的检查，不是在检查 Node.js 版本。正确的项目基线字段是：

```json
"packageManager": "pnpm@11.7.0"
```

本次对交付源码 ZIP 的原样重解压测试：`repository-check.mjs` PASS（27 workspace manifests、278 TS/TSX files），`offline-verify.mjs` PASS（126/126）。在临时副本里故意改成 `pnpm@10.28.0`，可以重现所报错误；使用附带的修复脚本恢复字段后再次 PASS。因此，这条日志首先应检查你本机实际文件是否被修改。仅凭日志不能判定具体是谁修改的。

## 方案 A：先手工检查（推荐）

在 PowerShell 中执行：

```powershell
cd "D:\Project\frontend-foundation\frontend-foundation"
node -p "process.cwd() + ' => ' + require('./package.json').packageManager"
pnpm --version
```

如第一行显示不是 `pnpm@11.x`，再使用方案 B。请注意 `pnpm --version` 是**已安装命令行工具的版本**，而 `package.json` 字段是**项目期望的版本**，二者是不同的检查对象。

如果字段已经是 `pnpm@11.7.0`，但再次运行仍报告同一错误，说明你需要核对运行的是哪一份仓库（或者文件是否在两次运行之间被其他工具改写）。先在当前目录运行 `node tooling/scripts/repository-check.mjs`，不要盲目替换整份源码。

## 方案 B：使用独立诊断与修复脚本

将 `FrontendFoundation_Windows_pnpm11_diagnose_fix.mjs` 下载到任意本地目录。下面以下载目录为 `D:\Downloads` 举例：

```powershell
cd "D:\Project\frontend-foundation\frontend-foundation"
node "D:\Downloads\FrontendFoundation_Windows_pnpm11_diagnose_fix.mjs"
```

它只显示根目录、实际值和文件 SHA-256，**默认不修改任何文件**。如确认版本错误，再执行：

```powershell
node "D:\Downloads\FrontendFoundation_Windows_pnpm11_diagnose_fix.mjs" --fix
```

也可以在任意目录显式指定：

```powershell
node "D:\Downloads\FrontendFoundation_Windows_pnpm11_diagnose_fix.mjs" --root "D:\Project\frontend-foundation\frontend-foundation" --fix
```

`--fix` 仅恢复根目录 `packageManager` 为 `pnpm@11.7.0`；修改前将原始完整 `package.json` 备份到**仓库上一级目录**（不会污染仓库源码树）。修复完成后自动运行 `repository-check.mjs`。不会更改锁文件、依赖、其他工作区清单，也不会访问网络。

## 复测

```powershell
cd "D:\Project\frontend-foundation\frontend-foundation"
node tooling/scripts/repository-check.mjs
pnpm verify:offline
pnpm check
```

如果 `pnpm --version` 不是 `11.7.0`，还需先安装或启用匹配的 pnpm；**单独修改 `packageManager` 字段并不会安装 pnpm**。

如仍报错，请上传上述脚本的完整控制台输出、当前根目录 `package.json`（去掉任何你添加的私有字段）、`pnpm --version`，以及 `Acceptance/Evidence/logs` 中对应日志，便于定位下一个实际错误。
