# GitHub 游戏开发仓库

本仓库为昊天兽王维护的公开游戏开发仓库，保留游戏源码、公开模型、场景资源、Electron 桌面壳、本地运行接口、测试及 Git 历史。后续游戏开发与更新以 [GitHub 仓库](https://github.com/haotianshouwang/dafeiyu-room-dev) 的 `main` 分支为准。

独立的云端 `dafeiyu-community-server` 不在本仓库中。游戏自带的 `server/` 用于本地运行和桌面版，是游戏启动所需的接口；此目录随游戏保留。

## 开发与检查

需要 Node.js 22.13 或更新版本，推荐 Node.js 24。

```sh
npm ci
npm run dev
```

浏览器打开 `http://127.0.0.1:5200/`。本地联机代理默认连接已配置的社区测试服务；如需覆盖，可参考 `.env.example`。

```sh
npm test
npm run build
npm run build:community
npm run check:public
```

普通游戏测试可独立运行。需要闭源云端源码的内部集成测试保留在原本地工作区，不随本仓库上传。

## 远程仓库与分支

- `github-dev`：公开游戏开发仓库 `haotianshouwang/dafeiyu-room-dev`，作为后续开发与更新的主要仓库。
- `origin`：Gitee 上游 `poxiao12138/dafeiyu-room`，用于跟进原游戏。
- `personal`：Gitee 公开 Fork `haotianshouwang/dafeiyu-room`，用于提交经过审核的 PR。
- 本地 `dev/github-game` 跟踪 `github-dev/main`，日常开发在此分支提交和推送。
- `codex/game-online-client-pr` 保留已提交的 Gitee PR 版本。

从现有工作区推送游戏开发分支：

```sh
git switch dev/github-game
git push github-dev HEAD:main
```

`.env`、密钥、个人存档、数据库、依赖目录、构建产物、日志和浏览器临时文件继续只保存在本地。

## 游戏开发工具

- `scripts/optimize-character-textures.py`：生成优化贴图的浏览器 GLB 和 gzip 文件，需要 Python 与支持 WebP 的 Pillow。原始模型保留。
- `scripts/local-production-api-proxy.mjs`：本地调试社区 HTTP/WebSocket 连接的辅助代理，仅监听 `127.0.0.1`；日常游戏优先使用内置的 `/community-api` 代理。
- `scripts/verify-live-account-position.mjs`：真实服务的位置与画面同步验收脚本。登录凭据通过标准输入提供；它会操作测试账号的位置，应使用专用测试账号。浏览器路径可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定。

上传开发仓库不代表云端生产验收或新安装包发布。联机测试服务仍由昊天兽王提供，运行问题请提交 Issue 并附上脱敏信息。
