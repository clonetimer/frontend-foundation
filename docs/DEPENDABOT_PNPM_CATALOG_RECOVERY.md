# Issue #68 · pnpm 11 catalog / Dependabot 无效升级治理

## 现象与根因边界

2026-10-20 的 #7/#8/#50/#51/#66/#67/#69–#72 的部分自动升级 PR 标题声称目标版本变化，但真实 `pnpm-lock.yaml` 的 `catalogs.default.<name>.version` 没有变化；PR diff 只改变 importer/key 排序。这是客观可复现的**锁文件无效升级**，不是构建成功或依赖已升级。与 Dependabot 上游 pnpm catalog 问题 `dependabot/dependabot-core#14339` 和较早的 #11953 症状相关，但无法由该仓库的证据断言唯一内部根因。

## 隔离与保留功能

- `.github/dependabot.yml` 对 **npm 常规版本更新**设置 `open-pull-requests-limit: 0`，阻止重复制造无效 PR。官方文档说明该限额不阻止安全更新；但安全更新是否实际推送，仍取决于仓库 Settings → Security → Dependabot security updates 是否启用。
- `github-actions` ecosystem 保持原有 Dependabot 正常升级，不采用全局 ignore。
- 不修改 `pnpm-workspace.yaml` 的 catalog、`pnpm-lock.yaml` 实际依赖版本、`catalogMode: strict`、`minimumReleaseAge`、构建脚本或 `pnpm install --frozen-lockfile`。跨主版本 `@types/node` 的现有 ignore 策略保留。

## 强制验收门禁

`tooling/scripts/dependabot-catalog-gate.mjs` 是无第三方依赖的 Node 静态检查，接入 CI 的 Static gates：

1. 所有 CI（包含 main）要求 workspace `catalog` 的每一条 specifier 与锁文件 `catalogs.default` 完全相同且具备解析版本；修复 pnpm frozen install 可能遗漏的 catalog 声明不一致风险。
2. 仅当 PR 作者为 `dependabot[bot]` 时，使用 GitHub `pull_request` 合成 merge commit 的**第一个 parent**作为 base，在 `HEAD^1` 与当前候选锁文件之间比对；为此 checkout 设置 `fetch-depth: 2`。
3. 对 `bump <package> from <old> to <new>`，目标 catalog/resolution 必须由 old 实际变为 new。对于分组/安全更新 PR，至少必须有一个 catalog 解析版本或 `packages` 的真实包版本键变化；仅 importer 排序变动会被拒绝。
4. 只改动 `.github/workflows/` 的 GitHub Actions 升级 PR 豁免 npm lockfile 门禁，业务 PR 不使用 bot-only 检查，但仍必须满足 catalog 一致性。
5. 通过 `node --test tooling/scripts/test-dependabot-catalog-gate.mjs` 回归正反样例，不引入 npm 安装与网络依赖。

## 当前可执行的正常升级方法

在**新的 feature 分支**操作，继续遵守 pnpm@11.7.0 固定版本、受控依赖范围和原有 CI：

```bash
corepack pnpm --version
node tooling/scripts/dependabot-catalog-gate.mjs
# 对 catalog-managed package 使用无显式版本号的名称更新，避免 strict catalog 下 `pkg@ver` 冲突
pnpm -r update '@tanstack/react-query'
node tooling/scripts/dependabot-catalog-gate.mjs --expect '@tanstack/react-query' 5.104.3
pnpm install --frozen-lockfile
pnpm check
git diff -- pnpm-workspace.yaml pnpm-lock.yaml
```

以上 `--expect` 的版本号只是验收样例，须替换为本次**实际计划升级**的版本。更新应该改变 lockfile resolved version；如升级范围、registry、minimumReleaseAge 或本机 pnpm 导致目标版本不满足条件，命令应失败/被拒绝，不能手工改写 lockfile 中的解析版本来绕过检查。

Storybook 的 `storybook`、`@storybook/react-vite`、`@storybook/addon-a11y` 必须一起按相同版本更新、验证、构建 Storybook。任何真实升级须执行 Linux/Windows CI、Security、Stable/Standalone Export（按触发路径）以及合并后 main 工作流，**不自动发布 Stable**。

## 完成定义与残余风险

本 PR 解决的是仓库级无效 PR 污染和真实性门禁，**不是修复 GitHub 托管的 Dependabot updater 内部实现**；暂停期间 npm 常规版本升级必须由维护者受控执行，或者以后引入经实测支持 pnpm 11 catalog 的替代 updater。Dependabot Security PR 能否生成需维护者确认 GitHub Security Settings，且若安全 PR 也命中 catalog bug，仍会被本 CI 拦截并需要人工修复。Issue #68 在有真实自动 catalog updater 恢复验证前保留跟踪。
