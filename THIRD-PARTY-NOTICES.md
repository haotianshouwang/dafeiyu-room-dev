# 第三方组件声明（THIRD-PARTY NOTICES）


---

## 随成品分发的

### three.js 0.170.0 — MIT
用途：WebGL 渲染、几何、材质、后处理（EffectComposer / UnrealBloomPass / OutputPass / RoundedBoxGeometry / RectAreaLightUniformsLib 等 addons 均属 three.js 仓库）
来源：https://github.com/mrdoob/three.js

```
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## 仅在开发/构建/测试阶段使用（不进入成品）

| 组件 | 版本 | 许可证 | 用途 |
|---|---|---|---|
| Vite | 5.4.11 | MIT | 开发服务器 / 模块解析 |
| esbuild | 0.24.0 | MIT | 打包成单文件 |
| Playwright | 1.49.0 | Apache-2.0 | 自动化截图与交互测试 |
| Rollup | (vite 传递依赖) | MIT | 打包 |
| PostCSS / nanoid / picocolors / source-map-js | (传递依赖) | MIT / MIT / ISC / BSD-2-Clause | 构建工具链 |

---

## 调研参考与非分发内容

- 茉莉的小房间：norsizu，https://github.com/norsizu/moli-room 。开发时作为陪伴房间体验与玩法方向的调研参考；本公开仓库不包含该项目文件。其许可不由本仓库授予或修改。
- Kenney、Poly Haven、ambientCG、Poly Pizza 曾作为素材方向被评估；本次公开文件清单没有从这些素材库分发下载资源。

上述清单依据本次分发文件与开发记录整理，不把“程序化生成”直接等同于已完成全部权利审查。如发现遗漏，可提供具体文件与出处核对补充。

## 与项目 MIT 许可的边界

项目自身源码及作者有权授权的 `resources/character/` 资源、项目截图采用根目录 LICENSE 中的 MIT 许可，允许使用、修改、分发及商用，须保留版权和许可文本。第三方依赖保留原许可。

人物模型包含付费 Meshy 服务生成内容及破晓手记制作、修复和编辑的源文件，作者署名为「破晓手记」。同时保留腾讯版试验模型与制作说明；授权以项目作者实际拥有的权利为范围。资源清单及 SHA-256 见 `resources/character/manifest.json`。

## 本地后端新增依赖

### fastify 5.12.8 — MIT

来源：https://github.com/fastify/fastify

用途：本地存档 API 与构建产物静态服务。

```text
MIT License

Copyright (c) 2016-present The Fastify team <https://github.com/fastify/fastify#team>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

### @fastify/static 8.3.0 — MIT

来源：https://github.com/fastify/fastify-static

用途：本地存档 API 与构建产物静态服务。

```text
MIT License

Copyright (c) 2017-present The Fastify team

The Fastify team members are listed at https://github.com/fastify/fastify#team.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```

SQLite 通过 Node.js 内置 `node:sqlite` 调用，不额外分发数据库引擎二进制。Node.js 与其内置组件的声明随用户安装的运行时提供。

## 世界 MCP 与输入校验

| 组件 | 锁定版本 | 许可证 | 用途 |
| --- | --- | --- | --- |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | 1.32.2 | MIT | 服务器、客户端适配、Streamable HTTP、stdio 与 OAuth |
| [Zod](https://github.com/colinhacks/zod) | 3.25.76 | MIT | 工具和世界命令输入校验 |

以上组件的版权和许可证由 npm 安装包各自 LICENSE 提供；传递依赖以 `package-lock.json` 为准，分别遵循各自声明。

本项目不分发语音合成/识别引擎、模型权重、录音、字体或系统声音。播放用音频由外部智能体提供，临时保留于服务内存，不打包进公开产物；音频提供方负责其内容来源与使用权限。
