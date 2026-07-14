<h1>AnimeFX</h1>

English | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

> Free & open-source web motion library built on [anime.js](https://animejs.com) and extended with WebGL shaders and three.js — **88 verified effects** and **8 real-scenario demos**, for web projects and programmatic video (Hyperframe / Remotion).

[![npm version](https://img.shields.io/npm/v/animefx.svg)](https://www.npmjs.com/package/animefx)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](https://nodejs.org)

AnimeFX is not a video generator. It is a reference-and-reuse library: **see the motion first**, then bring the parameter contract, source code and your project's `design.md` into your codebase. You build in your current stack — you do not migrate your project into AnimeFX.

![AnimeFX](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/hero-en.jpg)

## Highlights

- **Verified & deterministic.** Every effect is a seek-driven timeline validated by an automated check suite — the same input frame always reproduces the same output, so it composes cleanly with frame-exact video hosts.
- **Documented parameter contracts.** Each effect ships an authoritative contract (name, type, default, range, pairs, constraints) in `manifest/effects.json`; the retrieval CLI returns it verbatim so you never invent an ID or a param.
- **Style stays yours.** AnimeFX ships no palette. Colors are injected from your project's `design.md` through four semantic motion roles — `bg / ink / accent / muted`. AnimeFX never overrides your design spec.
- **AI-ready.** A drop-in [`AGENTS.md`](AGENTS.md), a deterministic natural-language retrieval CLI (`npx animefx --query`), and a compact `manifest/ai-catalog.json` let coding agents find the closest real effect instead of hallucinating one.
- **Free for commercial use.** All shipped code is MIT-licensed — free in personal and commercial projects.

## Install

```bash
npm install animefx
```

Requires Node.js ≥ 22.12.

## Quick start

**ESM / bundlers / Node:**

```js
import AnimeFX, { defineMotionRoles } from 'animefx';

const roles = defineMotionRoles({
  bg: '#1B2127',
  ink: '#F0EBE0',
  accent: '#AFC6CF',
  muted: '#A89B82'
});

AnimeFX.init('hero', 7);                 // (compositionId, seed) — once, before any effect
document.querySelector('#title').style.color = roles.ink;
AnimeFX.text.charsReveal('#title', { at: 300 });
AnimeFX.finalize();                      // pin all registered instances to frame 0
```

`defineMotionRoles` throws if any of `bg / ink / accent / muted` is missing, so the mapping is always explicit.

**Browser (plain `<script>`):** load anime.js v4 first, then the runtime.

```html
<script src="node_modules/animefx/lib/anime.v4.umd.min.js"></script>
<script src="node_modules/animefx/lib/anime-fx.js"></script>
<script>
  AnimeFX.init('scene-id', 6);
  AnimeFX.text.charsReveal('#title', { at: 300 });
  AnimeFX.finalize();
</script>
```

Shader effects (`shader.*`, WebGL) need two extra files loaded before `anime-fx.js`: `lib/afx-shaders.umd.js` and `lib/shader-fx-config.js`.

Without installing anything, you can also just search:

```bash
npx animefx --query "restrained but premium heading reveal" --limit 3
```

## For AI agents

Point your coding agent at [`AGENTS.md`](AGENTS.md) — it documents the full discover → use → style-inject → rules loop. After `npm install animefx`, paste this prompt:

```text
Use animefx in this project (run `npm install animefx` first if it isn't installed):
read node_modules/animefx/AGENTS.md and follow it to search for the right motion
effect and apply it to my needs.
```

The agent should search before implementing:

```bash
# find effects by motion intent
npx animefx --query "data page with animated stats" --type recipe --limit 3
# read the authoritative contract for one effect
npx animefx --id text.charsReveal --format json
```

`high` search confidence is a strong candidate, `medium` a comparison, `low` only the nearest motion principle — new code must be labelled as derived, never as a fabricated AnimeFX API.

## Screenshots

| Effects catalog | Effect detail | Demo playback |
|---|---|---|
| ![Effects catalog](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/effects-grid.jpg) | ![Effect detail](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/effect-detail.png) | ![Demo modal](https://raw.githubusercontent.com/voltwake/animefx/master/assets/readme/demo-modal.png) |

Browse all 88 effects with in-card playback; open any effect's detail page to tune every parameter live and copy the call; play any of the 8 scenario demos in place.

## design.md & Design by Curio

The integration order is: install the library → import your project's `design.md` → map `bg / ink / accent / muted` → call effects. If you already have a design system, import it directly. If you don't, pick and download a complete `design.md` from [Design by Curio](https://designbycurio.com) — 1000+ design systems — or let your AI fetch it via the [Curio MCP endpoint](https://designbycurio.com/mcp).

See the role contract in [`design.md`](design.md); the full mechanical mapping lives in the Chinese guide [`docs/风格注入约定.md`](docs/风格注入约定.md).

## Website

Browse everything with live previews at **[animefx.voltwake.com](https://animefx.voltwake.com)** (English and Japanese portals available). Each effect has its own shareable detail URL with auto-generated controls.

## License

**Code is free for commercial use (MIT). Brand & website assets are all rights reserved.**

- The runtime, effect data, AI skill, tooling and demo code — everything shipped in the [`animefx`](https://www.npmjs.com/package/animefx) npm package — is licensed under the [MIT License](LICENSE). Use it in personal or commercial projects, no permission or payment required; just keep the copyright notice with your distribution (third-party notices live in [`licenses/`](licenses/)).
- The AnimeFX name and logo, the design and copy of animefx.voltwake.com, and the preview imagery (`assets/`, `previews/`) are © Voltwake, all rights reserved.

For commercial licensing of the reserved assets, custom motion work or support, DM [@voltwake](https://x.com/voltwake) on X — see [docs/商业使用说明.md](docs/商业使用说明.md).
