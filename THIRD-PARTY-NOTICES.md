# 第三方组件声明（THIRD-PARTY NOTICES）

本说明对应当前 Gitee 胖鲸鱼公开版。网页运行依赖 Three.js，开发构建和测试还使用下述工具。胖鲸鱼、场景和程序化贴图的实现随源码提供；内置角色配音来自项目开发视频的独立演示音频。私人模型、立绘及视频配乐未随本公开仓库分发。README 中的人物版实机截图经项目作者确认用于展示，不包含可下载的人物模型，也不授予模型或截图的独立再利用许可。

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
- 内置角色配音来自本项目开发视频，网页文件位于 `public/voices/dafeiyu/`，台词和文件映射见 `src/ui/voice-clips.json`。它们不是 Three.js 等第三方代码许可证的一部分。

上述清单依据本次分发文件与开发记录整理，不把“程序化生成”直接等同于已完成全部权利审查。如发现遗漏，可提供具体文件与出处核对补充。

## 与项目 MIT 许可的边界

项目自身源码使用根目录 LICENSE 中的 MIT 许可，第三方依赖保留原许可。`public/voices/dafeiyu/` 中的配音和 `docs/screenshots/` 中的截图不因代码 MIT 许可自动获得商用或再分发授权；具体范围见 README 的“授权说明”。商业发行前应取得素材授权或替换相应素材，不能仅通过关闭语音播放按钮规避素材打包问题。私人模型不随仓库分发。


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
