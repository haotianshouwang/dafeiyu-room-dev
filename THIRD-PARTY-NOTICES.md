# 第三方组件声明（THIRD-PARTY NOTICES）

本项目**成品**（`大肥鱼房间.html`）只包含一个第三方库：**three.js**（MIT）。
美术素材、贴图、模型、字体**全部为程序化生成或系统字体**，未使用任何第三方素材。

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

## 评估过但最终没有使用的素材库

| 来源 | 许可证 | 为什么没用 |
|---|---|---|
| Kenney（家具/道具低模） | CC0 | 风格偏卡通，混进真实光照会拉低质感 |
| Poly Haven（HDRI / PBR 贴图） | CC0 | 适合写实场景，本项目走程序化贴图路线更可控 |
| ambientCG（材质贴图） | CC0 | 同上 |
| Poly Pizza（聚合低模） | 逐模型不同 | 许可证不统一，商用前需逐个核对，MVP 阶段不值得 |

结论：**成品零第三方素材，不存在素材署名/商用限制问题**；唯一需要保留的是 three.js 的 MIT 版权声明（已内嵌进单文件 HTML 顶部注释）。
