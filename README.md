# AnimeFX

> 给人和 AI 使用的验证动效库：先观看真实效果，再带着参数合同、源码与 `design.md` 设计规范进入项目。npm 包名为 `animefx`，运行时 API 为 `AnimeFX.*`。

AnimeFX 不是视频生成器。插件不会要求用户把项目迁移成 composition，也不会默认输出 HTML 或 MP4。它会在用户当前项目中完成以下工作：

```text
分析当前项目和视觉意图
→ 检索 88 个真实 AnimeFX 动效
→ 返回 1–3 个候选及选择证据
→ 读取候选源码、参数、案例和预览
→ 在当前技术栈中直接复用或适配
→ 在当前项目中验证
```

## 安装

```bash
npm install animefx
```

ESM / Node 与现代打包器：

```js
import AnimeFX, { defineMotionRoles } from 'animefx';

const roles = defineMotionRoles({
  bg: '#1B2127',
  ink: '#F0EBE0',
  accent: '#AFC6CF',
  muted: '#A89B82'
});

AnimeFX.init('hero', 7);
document.querySelector('#title').style.color = roles.ink;
AnimeFX.text.charsReveal('#title', { at: 300 });
AnimeFX.finalize();
```

库可以在 Node 中导入和检索，具体 DOM / SVG / Canvas / Three 效果需要在浏览器环境挂载。不安装插件时，也可以直接运行：

```bash
npx animefx --query "高级但克制的标题揭晓" --limit 3
```

## design.md 与 Design by Curio

接入顺序是：安装库 → 导入项目的 `design.md` → 映射 `bg / ink / accent / muted` → 调用效果。直接导入已有设计系统；如果还没有，可以去 [Design by Curio](https://designbycurio.com) 从 1000+ 设计系统中挑选并下载完整 `design.md`，也可以在 [Curio MCP 接入页](https://designbycurio.com/mcp) 让 AI 获取。

具体角色合同见 [`design.md`](design.md)，完整机械映射规则见 [`docs/风格注入约定.md`](docs/风格注入约定.md)。

## 当前内容

- 完整入口：`总览门户.html`，由 manifest 生成数据，覆盖全部效果、角色槽与页面编排配方；支持直接以 `file://` 打开，也可通过本地 HTTP/GitHub Pages 访问。每个效果进入独立的 `效果详情.html?fx=<id>` 参数实验台。
- 88 个动效：68 个 AnimeFX DOM/SVG/Canvas/Three 效果，其中含 4 个 Three.js；另有 20 个已验证动态 WebGL Shader，并按背景动效与装饰特效归类。
- Codex 与 Claude Code 双插件 manifest，共用一个 `anime-fx-reference` Skill。
- 面向 AI 的紧凑检索目录：用途、角色、重量、依赖、源码、禁区、预览和案例。
- 确定性自然语言检索 CLI，支持精确 ID 和组合过滤。
- 88 张效果预览、88 个独立详情深链接与基于参数合同自动生成的实时控件；HTML 锚点案例仅作为开发者集成参考。
- `reuse` 与 `adapt` 两种集成模式。

## 插件结构

| 路径 | 作用 |
|---|---|
| `.codex-plugin/plugin.json` | Codex 插件入口 |
| `.claude-plugin/plugin.json` | Claude Code 插件入口 |
| `skills/anime-fx-reference/SKILL.md` | AI 的选择、读取、复用和适配流程 |
| `skills/anime-fx-reference/scripts/search-effects.mjs` | 确定性效果检索器 |
| `manifest/ai-catalog.json` | AI 使用的 88 项紧凑检索索引 |
| `manifest/effects.json` | API 名、参数、默认值与约束的真相源 |
| `manifest/gallery-data.json` | 完整门户数据，由生成器维护 |
| `效果详情.html` | 单效果实时预览、全参数控件、重播与调用代码复制 |
| `lib/anime-fx.js` | AnimeFX 基础效果实现 |
| `lib/shader-fx-config.js` | Shader API 包装 |
| `previews/` | 每个效果的真实视觉证据 |
| `案例/` | 可工作的集成代码锚点 |
| `demos/recipes/` | 16 个由 composition 编译器生成的中性配方 demo |
| `manifest/suites/` | 仅供 demo/测试渲染的具体值夹具，不是风格来源 |
| `manifest/recipes.json` | 与风格解耦的页型编排合同（roles/contentSlots） |

## AI 怎么使用

插件触发后，AI 应先检查用户当前项目，再运行检索：

```bash
node skills/anime-fx-reference/scripts/search-effects.mjs \
  --query "React 产品发布页 高级但克制的标题揭晓" \
  --limit 3
```

检索结果会返回：

- 真实效果 ID；
- 为什么匹配；
- role / temporal / weight；
- DOM、SVG、Canvas、Three 或 Shader 依赖；
- 推荐 `reuse` 还是 `adapt`；
- 最小调用代码；
- 源码文件和符号；
- 预览、锚点案例和禁区。

选定效果后读取完整参数合同：

```bash
node skills/anime-fx-reference/scripts/search-effects.mjs \
  --id hero.glassReveal \
  --format json
```

### Reuse：直接调用

适合普通 HTML、DOM 视频或已经使用 AnimeFX 的项目：

```html
<script src="https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js"></script>
<script src="path/to/lib/anime-fx.js"></script>
<script>
  AnimeFX.init('scene-id', 6);
  AnimeFX.text.charsReveal('#title', { at: 300 });
  AnimeFX.finalize();
</script>
```

### Adapt：参考源码迁移

适合 React、Vue、Svelte、Remotion、GSAP 或已有动画架构：

1. 检索并选定真实效果；
2. 打开结果中的 `source.file` 和 `anchorCase`；
3. 提取运动阶段、时间比例、stagger、easing、seed 和几何逻辑；
4. 改造成当前框架的挂载、更新和清理模型；
5. 在交付说明中标记“adapted from `AnimeFX.<id>`”。

插件不会要求目标项目改用 AnimeFX 的 composition 编译器。

### 配方级检索

当问题不是“一个元素怎么动”，而是“封面、数据页、列表页或结尾如何整体编排”时，先查配方：

```bash
node skills/anime-fx-reference/scripts/search-effects.mjs \
  --type recipe \
  --query "科技感数据页怎么编排" \
  --limit 3
```

结果包含页面类型、时长、角色/内容槽合同、效果时序和可运行 demo。`exampleTheme` 只说明维护者 demo 使用了哪个测试夹具，不是配方身份或风格建议；在用户项目中应绑定自己的设计系统。

## 在你的项目中使用

### Claude Code 插件方式

直接让 Claude Code 加载本仓库，不需要复制文件：

```bash
claude --plugin-dir /absolute/path/to/anime-fx-library
```

### 项目规则方式

不使用插件系统时，把下面规则加入目标项目的 `CLAUDE.md`（其他代理可放进等价的项目说明文件）：

```text
写动效代码前，必须先完整读取 /absolute/path/to/anime-fx-library/skills/anime-fx-reference/SKILL.md，
并运行 search-effects.mjs 检索。优先复用命中的真实效果；需要页面级编排时使用 --type recipe。
只读取候选效果的源码、参数、预览和锚点案例，不虚构 AnimeFX ID 或参数。
在当前项目技术栈中实现，并说明哪些是直接复用、哪些是适配、哪些是新写。
```

普通 DOM 效果至少需要 `lib/anime-fx.js` 和 anime.js v4。跨项目复用任何 `shader.*` 效果时，还必须连带复制：

- `lib/afx-shaders.umd.js`：离线 Shader 内核；
- `lib/shader-fx-config.js`：Shader 名称、默认参数与 uniform 映射；
- `lib/anime-fx.js`：统一挂载、时间驱动和释放入口。

## 没有插件系统的 AI

如果代理不支持 Codex/Claude 插件格式，也可以把仓库作为上下文并明确要求：

```text
先完整读取 skills/anime-fx-reference/SKILL.md。
在写任何动效代码前，运行 search-effects.mjs。
优先复用库内效果；只读取候选效果的源码、案例和预览。
在当前项目中实现，不要默认使用 composition 或 MP4 渲染器。
最终说明直接复用了哪些效果、适配了哪些效果、新写了哪些部分。
```

## Claude Code 本地开发测试

Claude Code 官方支持用插件目录直接加载开发版本：

```bash
claude --plugin-dir /absolute/path/to/anime-fx-library
```

Skill 会出现在插件命名空间中，也可以根据任务描述自动触发。修改后运行 `/reload-plugins`。

验证 manifest：

```bash
claude plugin validate .
```

## 选择原则

- 一屏只使用一个 `heavy` 主视觉。
- 中文标题默认使用 `text.charsReveal`，不默认使用 scramble。
- 环形进度与数字使用 `chart.donutDraw` + `text.countUp`，同起同长。
- Canvas、Three 和 Shader 必须使用确定性时间源并正确释放资源。
- 搜索为低置信度或无结果时，只把结果当作运动原理参考；新代码必须标记为派生，而不是伪造 AnimeFX API。
- 不因为插件存在就强迫所有动画都使用 AnimeFX。

## 人类查阅入口

- `总览门户.html`：效果、四个角色槽与页型配方的唯一完整目录入口。
- `效果详情.html?fx=<effect.id>`：每个效果独立的可分享详情 URL；控件由 `manifest/effects.json` 自动生成。
- `案例/18-基础效果锚点.html`：九个基础效果的稳定、可读集成锚点。
- `使用说明.md`：全部参数、默认值和直接调用说明。
- `previews/`：单效果截图。
- `案例/`：完整 HTML 用法。
- `docs/风格注入约定.md`：把项目设计 token 绑定到 AnimeFX 角色槽的机械规则。

## 维护与验证

环境：Node.js ≥ 22.12。首次运行：

```bash
npm install
```

插件核心检查：

```bash
npm run build:ai-catalog
npm run check:ai-catalog
npm run check:reference
npm run check:plugin
npm run check:manifest
npm run check:gallery
npm run check:detail
```

增加新效果时：

1. 在运行时加入真实实现；
2. 更新 `manifest/effects.json` 的 API 与约束；
3. 在 `tools/build-ai-catalog.mjs` 补充任务语义和运行时映射；
4. 补预览与锚点案例；
5. 重建 catalog；
6. 为新意图增加检索回归；
7. 跑完整检查。
8. 运行 `npm run build:gallery` 重建门户数据，再运行 `npm run check:gallery`。

不要手改 `manifest/ai-catalog.json` 或 `manifest/gallery-data.json`，它们由生成器维护。

## 可选维护者工具

仓库仍保留套系、配方、composition 编译器、浏览器 validator 和 MP4 renderer。这些工具用于验证效果能在确定性逐帧环境中工作，也可以作为组合示例，但它们不是插件的默认使用方式：

```bash
node tools/validate-composition.mjs examples/compositions/opus5.json
node tools/render-composition.mjs examples/compositions/opus5.json
```

插件的成功标准不是“自动生成一条视频”，而是：AI 在任何合适的网页或视频任务里，都能找到最接近的成熟动效实现，并把它正确地用于用户当前项目。

## 授权 / License

**代码免费商用，品牌与站点素材版权保留。**

- 运行时、效果数据、AI 技能、工具与 Demo 代码（即 npm 包 `animefx` 分发的一切）按 [MIT License](LICENSE) 授权——个人与商业项目均可免费使用、修改、分发，仅需随分发保留版权声明（第三方声明见 [`licenses/`](licenses/)）。
- AnimeFX 品牌名称与 Logo、官网 animefx.voltwake.com 的界面设计与文案、效果预览图（`assets/`、`previews/`）© Voltwake 版权保留，商用需授权。
- 详情与商务联系见 [docs/商业使用说明.md](docs/商业使用说明.md)，或 X 私信 [@voltwake](https://x.com/voltwake)。

Code (everything shipped on npm as `animefx`) is MIT-licensed — free for commercial use. The AnimeFX brand, website design/copy and preview imagery are © Voltwake, all rights reserved; see [docs/商业使用说明.md](docs/商业使用说明.md) for commercial licensing.
