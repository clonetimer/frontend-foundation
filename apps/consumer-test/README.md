# Consumer Test

该 App 不通过 `workspace:*` 使用 Foundation。`tooling/scripts/consumer-test.mjs` 会将 Foundation packages `pnpm pack` 到临时目录，再创建独立 Vite Consumer 安装 tarball 并执行 build，用来发现 exports、peer dependency、CSS、类型声明和发布产物问题。
