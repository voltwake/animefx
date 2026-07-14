# AGENTS.md — AnimeFX for AI coding agents

You are working in a project that has already run `npm install animefx`. This file tells you how to use the library. Read it before adding any animation.

## What this is

AnimeFX is a reference library of **88 verified motion effects** and **8 scenario recipes** built on [anime.js](https://animejs.com) v4. Every effect ships a deterministic timeline and a documented parameter contract (name, type, default, range, pairs, constraints). It is a *reference-and-reuse* library, not a video generator — you build in the current project, you do not migrate the project into AnimeFX.

Requires Node.js ≥ 22.12.

## 1. Discover — search before you implement

Never invent an effect ID or a parameter. Search first, then look up the exact contract.

```bash
# find effects by motion intent (role + mood + stack + constraints in the query)
npx animefx --query "restrained but premium heading reveal" --limit 3

# find a whole-page arrangement instead of one primitive
npx animefx --query "data page with animated stats" --type recipe --limit 3

# exact contract for one effect or recipe (authoritative params)
npx animefx --id text.charsReveal --format json

# filters: --role bg|hero|component|text-enter|text-exit|text-emphasis|transition
#          --runtime dom|svg|canvas|three|shader|webgl   --target html|video|react|vue|svelte|canvas-video
#          --weight light|medium|heavy   --limit 1..10   --list
```

If `npx animefx` is unavailable, call the bundled script directly:

```bash
node node_modules/animefx/skills/anime-fx-reference/scripts/search-effects.mjs --query "<motion intent>" --limit 3
```

Compact retrieval index (fast to scan): `node_modules/animefx/manifest/ai-catalog.json`.
Full parameter contracts (authoritative): `node_modules/animefx/manifest/effects.json`.
Recipes: `node_modules/animefx/manifest/recipes.json`.

Treat `high` search confidence as a strong candidate, `medium` as a comparison, `low` as only the nearest motion principle. If nothing fits, say so and label any new code as derived — do not claim it is a library effect.

## 2. Use

**ESM / bundlers / Node:**

```js
import AnimeFX, { defineMotionRoles } from 'animefx';

AnimeFX.init('hero', 7);                 // (compositionId, seed) — once, before any effect
AnimeFX.text.charsReveal('#title', { at: 300 });
AnimeFX.finalize();                      // pin all registered instances to frame 0
```

**Browser (plain `<script>`):** load anime.js v4 first, then the runtime.

```html
<script src="node_modules/animefx/lib/anime.v4.umd.min.js"></script>
<script src="node_modules/animefx/lib/anime-fx.js"></script>
<!-- AnimeFX is now on window.AnimeFX -->
```

**Shader effects (`shader.*`, WebGL)** need two extra files loaded before `anime-fx.js`:

```html
<script src="node_modules/animefx/lib/afx-shaders.umd.js"></script>
<script src="node_modules/animefx/lib/shader-fx-config.js"></script>
```

DOM / SVG / Canvas / Three / Shader effects must run in a browser; the library can still be imported and searched in Node.

## 3. Style injection — never let demo colors leak in

AnimeFX ships no palette. Map the four semantic motion roles from the project's own `design.md` (or its design system, e.g. Curio) and pass those values in — do not hardcode the colors you see in AnimeFX previews.

```js
const roles = defineMotionRoles({
  bg: '#1B2127',    // surface the motion sits on
  ink: '#F0EBE0',   // primary foreground / text
  accent: '#AFC6CF',// emphasis / highlight
  muted: '#A89B82'  // secondary / de-emphasized
});
// then drive the effect's color params from roles.bg / roles.ink / roles.accent / roles.muted
```

`defineMotionRoles` throws if any of `bg / ink / accent / muted` is missing, so the mapping is explicit.

## 4. Rules

- **Search before implementing.** Do not reinvent an effect that already exists; do not invent IDs or params.
- **Respect the lifecycle.** `AnimeFX.init(id, seed)` once up front → call effects → `AnimeFX.finalize()`. Every effect returns the anime instance it created (or `null` on failure) and registers it for seek-driven playback.
- **Style comes from the project, not from AnimeFX.** Bind colors/typography via the four roles above.
- **Honor `prefers-reduced-motion`** in interactive output unless the project already defines an accessibility policy.
- **Dispose** Canvas/WebGL/Three resources and detach listeners on unmount; in `adapt` mode preserve the motion principle, timings, and deterministic driver while handing DOM ownership to the framework.
- **Full workflow, selection guide, and integration guide** live in `node_modules/animefx/skills/anime-fx-reference/SKILL.md` — read it for anything beyond a single primitive.

## 5. Using AnimeFX in programmatic video (Hyperframe / Remotion)

AnimeFX is built for deterministic, seek-driven rendering, so it composes with frame-exact video hosts:

- Effects push their anime instances into a global registry (`__hfAnime`). A video host drives every frame by **seeking that registry to the composition's global time**, not by a real-time clock. `AnimeFX.init` installs the ready hooks and pauses the built-in engine so the host owns time; `AnimeFX.finalize()` pins everything to frame 0 as the starting state.
- Randomness is seeded per `init` (deterministic PRNG), so seeking to the same time always reproduces the same frame. Do **not** introduce `Math.random()` or `Date.now()` into render callbacks — that breaks reproducibility.
- Instances created outside the standard effect calls can be handed to the same seek contract with `AnimeFX.register(instance)`.

See the register/finalize contract and per-runtime notes at the top of `node_modules/animefx/lib/anime-fx.js` and in the integration guide under `skills/anime-fx-reference/`. If a detail is not documented there, verify it against `manifest/effects.json` rather than guessing.
