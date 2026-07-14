<h1>AnimeFX</h1>

[English](README.md) | 简体中文 | [日本語](README.ja.md)

> 基于 [anime.js](https://animejs.com) 的免费开源网页动效库 —— **88 个经过验证的动效**与 **8 个真实场景 Demo**，用于网页项目，也能用进 Hyperframe、Remotion 这样的程序化视频。

[![npm version](https://img.shields.io/npm/v/animefx.svg)](https://www.npmjs.com/package/animefx)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](https://nodejs.org)

AnimeFX 不是视频生成器，而是一个「先看后用」的参考复用库：先观看真实效果，再带着参数合同、源码与你项目的 `design.md` 进入代码。你在当前技术栈里落地，不需要把项目迁移成 AnimeFX 的 composition。

![AnimeFX](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/hero-zh.jpg)

## 要点

- **验证且确定性。** 每个效果都是可 seek 的时间轴，由自动检查套件验证——同一输入帧永远复现同一输出，因此能干净地组合进逐帧精确的视频宿主。
- **完整参数合同。** 每个效果在 `manifest/effects.json` 里都有权威合同（名称、类型、默认值、范围、配对、约束）；检索 CLI 原样返回，避免虚构 ID 或参数。
- **风格属于你的项目。** AnimeFX 不自带调色板。颜色通过四个语义化角色槽 `bg / ink / accent / muted` 从你项目的 `design.md` 注入，AnimeFX 从不覆盖你的设计规范。
- **面向 AI。** 开箱即用的 [`AGENTS.md`](AGENTS.md)、确定性自然语言检索 CLI（`npx animefx --query`）与紧凑的 `manifest/ai-catalog.json`，让编程代理找到最接近的真实效果，而不是凭空捏造。
- **代码免费商用。** 分发的全部代码按 MIT 授权，个人与商业项目均可免费使用。

## 安装

```bash
npm install animefx
```

环境要求：Node.js ≥ 22.12。

## 快速开始

**ESM / 打包器 / Node：**

```js
import AnimeFX, { defineMotionRoles } from 'animefx';

const roles = defineMotionRoles({
  bg: '#1B2127',
  ink: '#F0EBE0',
  accent: '#AFC6CF',
  muted: '#A89B82'
});

AnimeFX.init('hero', 7);                 // (compositionId, seed) —— 在任何效果之前调用一次
document.querySelector('#title').style.color = roles.ink;
AnimeFX.text.charsReveal('#title', { at: 300 });
AnimeFX.finalize();                      // 把所有注册实例定格到第 0 帧
```

`defineMotionRoles` 在缺少 `bg / ink / accent / muted` 任一时会抛错，映射始终显式。

**浏览器（原生 `<script>`）：** 先加载 anime.js v4，再加载运行时。

```html
<script src="node_modules/animefx/lib/anime.v4.umd.min.js"></script>
<script src="node_modules/animefx/lib/anime-fx.js"></script>
<script>
  AnimeFX.init('scene-id', 6);
  AnimeFX.text.charsReveal('#title', { at: 300 });
  AnimeFX.finalize();
</script>
```

Shader 效果（`shader.*`，WebGL）需要在 `anime-fx.js` 之前额外加载两个文件：`lib/afx-shaders.umd.js` 与 `lib/shader-fx-config.js`。

不安装任何东西时，也可以直接检索：

```bash
npx animefx --query "高级但克制的标题揭晓" --limit 3
```

## 交给 AI

把你的 AI 编程助手指向 [`AGENTS.md`](AGENTS.md)——里面记录了完整的「检索 → 使用 → 风格注入 → 规则」流程。装好 animefx 后，把下面这句话交给 AI：

```text
在本项目中使用 animefx（没装先 npm install animefx）：读取 node_modules/animefx/AGENTS.md，
按其中的指引检索合适的动效并应用到我的需求上。
```

## 截图

| 效果目录 | 效果详情 | Demo 播放 |
|---|---|---|
| ![效果目录](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/effects-grid.jpg) | ![效果详情](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/effect-detail.png) | ![Demo 弹窗](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/demo-modal.png) |

卡片内快速播放全部 88 个效果；进入任一效果详情页可实时调节全部参数并复制调用代码；点击任意 Demo 缩略图即可在弹窗内播放 8 个真实场景示例。

## design.md 与 Design by Curio

接入顺序是：安装库 → 导入项目的 `design.md` → 映射 `bg / ink / accent / muted` → 调用效果。已有设计系统就直接导入；没有的话，可以去 [Design by Curio](https://designbycurio.com) 从 1000+ 设计系统中挑选并下载完整 `design.md`，也可以让 AI 通过 [Curio MCP 接入页](https://designbycurio.com/mcp) 获取。

角色合同见 [`design.md`](design.md)，完整机械映射规则见 [`docs/风格注入约定.md`](docs/风格注入约定.md)。

## 网站

在 **[animefx.voltwake.com](https://animefx.voltwake.com)** 浏览全部效果与实时预览（另有英文、日文门户）。每个效果都有独立可分享的详情 URL，控件由 `manifest/effects.json` 自动生成。

---

## AI 怎么使用

插件触发后，AI 应先检查用户当前项目，再运行检索：

```bash
node skills/anime-fx-reference/scripts/search-effects.mjs \
  --query "React 产品发布页 高级但克制的标题揭晓" \
  --limit 3
```

检索结果会返回：真实效果 ID；为什么匹配；role / temporal / weight；DOM、SVG、Canvas、Three 或 Shader 依赖；推荐 `reuse` 还是 `adapt`；最小调用代码；源码文件和符号；预览、锚点案例和禁区。

选定效果后读取完整参数合同：

```bash
node skills/anime-fx-reference/scripts/search-effects.mjs --id hero.glassReveal --format json
```

### Reuse：直接调用

适合普通 HTML、DOM 视频或已经使用 AnimeFX 的项目——直接用 `<script>` 引入运行时并调用效果。

### Adapt：参考源码迁移

适合 React、Vue、Svelte、Remotion、GSAP 或已有动画架构：

1. 检索并选定真实效果；
2. 打开结果中的 `source.file` 和 `anchorCase`；
3. 提取运动阶段、时间比例、stagger、easing、seed 和几何逻辑；
4. 改造成当前框架的挂载、更新和清理模型；
5. 在交付说明中标记「adapted from `AnimeFX.<id>`」。

插件不会要求目标项目改用 AnimeFX 的 composition 编译器。

### 配方级检索

当问题不是「一个元素怎么动」，而是「封面、数据页、列表页或结尾如何整体编排」时，先查配方：

```bash
node skills/anime-fx-reference/scripts/search-effects.mjs \
  --type recipe --query "科技感数据页怎么编排" --limit 3
```

结果包含页面类型、时长、角色/内容槽合同、效果时序和可运行 demo。`exampleTheme` 只说明维护者 demo 使用了哪个测试夹具，不是配方身份或风格建议；在用户项目中应绑定自己的设计系统。

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
- `使用说明.md`：全部参数、默认值和直接调用说明。
- `previews/`：单效果截图；`案例/`：完整 HTML 用法。
- `docs/风格注入约定.md`：把项目设计 token 绑定到 AnimeFX 角色槽的机械规则。

## 维护与验证

环境：Node.js ≥ 22.12。首次运行 `npm install`。插件核心检查：

```bash
npm run build:ai-catalog
npm run check:ai-catalog
npm run check:reference
npm run check:plugin
npm run check:manifest
npm run check:gallery
npm run check:detail
```

增加新效果时：在运行时加入真实实现 → 更新 `manifest/effects.json` 的 API 与约束 → 在 `tools/build-ai-catalog.mjs` 补充任务语义和运行时映射 → 补预览与锚点案例 → 重建 catalog → 为新意图增加检索回归 → 跑完整检查 → 运行 `npm run build:gallery` 重建门户数据后再 `npm run check:gallery`。

不要手改 `manifest/ai-catalog.json` 或 `manifest/gallery-data.json`，它们由生成器维护。

## 授权 / License

**代码免费商用，品牌与站点素材版权保留。**

- 运行时、效果数据、AI 技能、工具与 Demo 代码（即 npm 包 [`animefx`](https://www.npmjs.com/package/animefx) 分发的一切）按 [MIT License](LICENSE) 授权——个人与商业项目均可免费使用、修改、分发，仅需随分发保留版权声明（第三方声明见 [`licenses/`](licenses/)）。
- AnimeFX 品牌名称与 Logo、官网 animefx.voltwake.com 的界面设计与文案、效果预览图（`assets/`、`previews/`）© Voltwake 版权保留，商用需授权。
- 详情与商务联系见 [docs/商业使用说明.md](docs/商业使用说明.md)，或 X 私信 [@voltwake](https://x.com/voltwake)。
