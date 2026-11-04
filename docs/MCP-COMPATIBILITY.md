# 世界 MCP 兼容与验证边界

验证日期：2026-11-04。项目锁定 `@modelcontextprotocol/sdk@1.32.2` 和 `zod@3.25.76`，以 package-lock 为准。Node.js 最低 22.13，推荐 24。

| 验证 | 证据与边界 |
| --- | --- |
| 标准 HTTP/stdio 传输 | `node scripts/probe-world-integration.mjs` 启动 SDK 客户端、子进程及临时 HTTP fixture，观测初始化协议 `2025-11-25`，调用中文回显并拒绝未授权请求；仅协议探针 |
| 产品 MCP 与 OAuth | `npm run self-check` 经真实 SDK 发现、动态注册、PKCE、主人同意、令牌和 HTTP 调用完整世界流程；临时数据库和端口，不访问个人存档 |
| 世界事实 | 创建室内/户外、连通现有院子、放家具、往返、坐下、断开后有限动作完成、服务重启、消费游标与撤权取消；真实运行器配合确定时钟 |
| 其他权限/恢复 | `npm test` 包含 stdio 令牌轮换、事件隔离、历史缺口恢复、事务回滚、门槽/导航/编辑/相机和音频状态校验 |
| 音频播放 | 仅播放调用方已生成的内容，独立 `audio:play` 授权和主人开启声音；状态不能证明人听见。真实浏览器播放需单独验收 |
| 网络与宿主 | 仅本机 loopback；不证明任一具体第三方宿主兼容，未验收远程 HTTPS、反代、证书、跨设备连接或真实客户端回调 |
| 其他协议功能 | 不以 MCP Tasks、旧 SSE 为前提，动作使用 actionId 查询 |

探针的 JSON 采用字段和值白名单，不序列化凭证、本地路径或原始异常；未知宿主保持 `unverified`。产品验证使用 [官方 SDK](https://github.com/modelcontextprotocol/typescript-sdk) 的客户端，不修改外部宿主配置。

QQ 是唯一聊天入口。项目不包含录音、ASR、TTS、语音模型、模型安装器或系统声音依赖；音频由外部智能体生成后提供。没有额外字体或声音素材随包分发。连接、授权、音频样例与网络部署见 [接入指南](MCP-QUICKSTART.md)。
