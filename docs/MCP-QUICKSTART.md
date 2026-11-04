# 让智能体进入世界

需要 Node.js 22.13+（推荐 24）。在项目目录运行 `npm ci`、`npm run dev`，打开游戏 `http://127.0.0.1:5200`。第一次打开时，用启动终端显示的一次性主人配对码完成配对。主人凭证保存在 HttpOnly cookie 中；不要分享配对码。

1. 点击游戏右上角「连接智能体」，点击「复制地址」。本机默认地址是 `http://127.0.0.1:5200/mcp`。
2. 在支持 **Streamable HTTP + 标准 OAuth** 的 MCP 客户端中添加这个地址。
3. 客户端自动发现授权方式并打开确认页。在同一个已配对的浏览器确认权限。默认是观察世界、角色行动、场景建设。
4. 客户端可以调用 `world_enter` 进入已有世界，通过工具和规则查询了解角色、门槽和家具，再预览、提交建设。进入和复制都不会创建新角色或重置世界，无需另写游戏提示词。

默认一次授权包含观察世界、角色行动、场景建设。聊天沿用 QQ 作为唯一入口；游戏 MCP 用于观察世界、控制角色、建设、读取和确认世界事件，以及单独授权的已有音频播放。

## 状态与撤销

「服务已启动」表示世界服务正常响应；「协议待客户端验证」表示尚未取得实际客户端的兼容性结果，不能据此宣称远程已连通。客户端协议不兼容应按其报错升级或改用 stdio；页面显示离线时先检查游戏服务。主人会话丢失时，在本机停止服务并用 `node server/start.js --recover-owner` 启动，使用新的一次性码恢复；旧会话会失效。普通重启保留已配对状态，不会生成可重复使用的配对码。

伙伴列表显示**已授权 / 已过期 / 已撤销**，不把 grant 当成在线连接。点击「撤销授权」立即禁止这个主体的新 MCP 调用，并取消它当前的动作。撤销通过主人 cookie 与 CSRF 校验；地址本身没有任何访问权限。

游戏服务持续运行时，关网页仍能完成已接受动作。智能体何时继续思考和唤醒由其宿主负责，游戏不安装、修改或管理宿主插件与调度。

## 另一台设备或部署

loopback 地址只供运行服务的这台电脑使用。部署时设置 `WORLD_PUBLIC_URL=https://你的域名`，运行公开构建和世界服务；反向代理必须把页面、`/api`、`/mcp`、`/oauth`、`/.well-known` 转发到同一服务，并保留 Host/Origin。仅支持无路径 HTTPS origin，禁止把内部 API 端口 5201 当成公开 MCP 地址。

页面会显示配置的 HTTPS MCP 地址，标记「外部联通尚未验证」。需从实际客户端所在设备验证证书、OAuth 回调和连接；本机测试不等于跨机可用。首次主人配对仍需在本机完成。部署使用 `npm run build` 的产物，角色运行资源随构建提供；存档和凭证目录不得公开挂载。

## 高级：仅支持 stdio 的客户端

使用本项目适配器，世界服务需先启动：

```bash
npm run mcp:stdio -- --config /你的受保护目录/world-mcp.json
```

凭证 JSON 形状为 `{ "endpoint": "http://127.0.0.1:5200/mcp", "accessToken": "…", "refreshToken": "…", "clientId": "…" }`。由主人通过已配对的同源 `POST /api/auth/grants`（附会话的 `x-csrf-token`）签发，按实际需要填写 `clientName`、`actorIds` 和 `scopes`。此响应包含秘密，仅保存到当前用户拥有的普通文件，权限 `0600`；不要粘贴聊天、提交仓库或放入 MCP URL。适配器拒绝软链接和不安全权限。有 refreshToken/clientId 可自动续期并原子更新文件；仅有 accessToken 则在其到期后失效。退出适配器不会关闭世界服务。

宿主使用自己的 MCP 配置机制启动上述适配器；本项目不提供宿主安装器。

## 工具与世界规则

当前发现 18 个工具，分为：

| 功能 | 工具 |
| --- | --- |
| 世界、规则与事件 | `world_enter`、`world_observe`、`world_get_events`、`world_ack_events` |
| 目录与建议 | `catalog_list`、`layout_suggest` |
| 控制与行动 | `actor_take_control`、`actor_release_control`、`actor_move`、`actor_interact`、`action_get`、`action_cancel` |
| 建设 | `build_preview`、`build_apply`、`build_undo` |
| 可选音频播放 | `audio_play`、`audio_get_status`、`audio_stop` |

建设从目录选模板和物件，观察 `detail: "portals"` 的可用门槽后预览，再提交。新场景接通现有世界后才可进入；移动和交互须取得角色租约，调用返回 actionId，查询真实终态。不要把命令接受当作完成。requestId 重试保持不变，避免重复效果。

室内固定 45° 朝向及等距俯角，户外仅可水平旋转；镜头高度和俯角固定，不在 MCP 参数中。现有九块农田和保护区域不能移动或侵占；开发和构建默认使用项目内的鲸鱼娘活泼版，也可用 `?character=whale` 切换胖鲸鱼。

## 可选：播放智能体已有音频

QQ 仍是唯一聊天入口。游戏不提供手机消息、录音、ASR、TTS 或本地模型。客户端需在 OAuth 请求中显式申请 `world:read audio:play`（如需控制/建设，再加入对应权限）；主人确认后，还须在游戏点「开启声音」。默认权限不含 `audio:play`。

以下是 SDK 调用示例；`generated.mp3` 是调用方已经生成的声音文件，文件读取发生在调用方，游戏只接收 base64：

```js
import { readFile } from 'node:fs/promises';
const audioBase64 = (await readFile('generated.mp3')).toString('base64');
const result = await client.callTool({
  name: 'audio_play',
  arguments: { requestId: 'hello-001', audioBase64, mimeType: 'audio/mpeg' }
});
const { playbackId } = result.structuredContent;
await client.callTool({ name: 'audio_get_status', arguments: { playbackId } });
// 如需取消：
await client.callTool({ name: 'audio_stop', arguments: { requestId: 'stop-001', playbackId } });
```

仅接收 `audio/mpeg`、`audio/wav`、`audio/ogg`，原始文件最多 4 MiB、时长最多 60 秒；不接收 URL 或路径。多个窗口仅一个播放主页面，顺序播放。网页播放事件确认 `started`/`finished`，`delivery: delivered_not_heard` 无法证明主人听见。浏览器拦截为 `blocked`，没有播放网页为 `client_offline`。刷新需要重新开启声音；静音、撤权、过期、断线、停止均取消并清除内存音频，音频不进入 SQLite 或公开目录。

## 断开、重启与事件恢复

世界服务持续运行时只推进已接受的有限动作；60 秒控制租约限制后台行动。没有网页不影响世界运行，但音频需要网页播放。新决策由外部宿主发起；服务停止、电脑休眠时不声称仍在移动，启动后从检查点继续，长间隔仅补算需求。

每次重新连接先调用 `world_enter`，检查 `activeActions`、位置、`lastConfirmedCursor`、未读计数。用 `world_get_events({afterCursor: lastConfirmedCursor})` 读取，再显式 `world_ack_events({requestId, cursor: nextCursor})` 确认处理；单纯读取不会推进消费游标。若 `snapshotResetRequired`，先处理 `recoverySnapshot`，再提交 `recoveryToken` 与 `recoveryCursor`。授权主体各自保存游标，刷新令牌不会新建角色或重复执行旧效果。

自检：`npm run self-check`；全套测试、公开构建与边界检查：`npm run check`。它们使用隔离 fixture，不验证特定宿主或跨设备网络，也不能证明用户听见声音。
