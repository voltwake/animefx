# Effect selection guide

Use this guide after search returns multiple plausible effects. Keep the user's content hierarchy ahead of novelty.

## Role first

| Role | Purpose | Typical prefixes |
|---|---|---|
| `bg` | Sustain atmosphere without becoming the reading subject | `canvas.*`, `grid.*`, `shader.*`, `three.*` |
| `hero` | Carry the screen's single dominant visual event | `hero.*`, `explode.*` |
| `component` | Explain or introduce a specific UI/data object | `chart.*`, `card.*`, `stagger.*`, `svg.*`, `shape.*` |
| `text-enter` | Establish reading order | `text.charsReveal`, `text.wordsAppear`, `text.scrambleIn` |
| `text-exit` | Remove content intentionally | `text.exitFade`, `text.scrambleOut`, `stagger.cascadeOut` |
| `text-emphasis` | Draw attention after layout settles | `text.countUp`, `text.highlightSweep`, `text.scrambleCycle` |
| `transition` | Bridge two content states | `transition.*` or documented cover/reveal hero modes |

Choose the motion role before binding visual style. A background effect is not a substitute for a transition, and a once-only component entrance cannot sustain a full-screen background.

## Style belongs to the target project

AnimeFX is the motion source of truth, not a design system. Resolve color, typography, spacing, radius, and surface treatment from the user's existing project or its chosen design system (such as Curio). Bind external tokens to the four semantic roles `bg`, `ink`, `accent`, and `muted`; never infer a style from a recipe's `exampleTheme`. The three named themes bundled under `manifest/suites/` are deterministic rendering fixtures only.

## Weight budget

- Use at most one `heavy` effect on a screen.
- Prefer `light` text or component motion when a heavy hero already exists.
- Treat Three.js scenes as heavy even when their visual opacity is low.
- Treat a persistent Shader as part of the WebGL context budget.
- Do not stack two effects with the same attentional role.

## Language and context

- Chinese editorial text: prefer `text.charsReveal`.
- English/numeric system language: `text.scrambleIn` or `text.scrambleCycle` can fit.
- Calm cultural or archival context: prefer `svg.draw`, restrained text motion, and paper-like backgrounds; reserve `three.inkFluid` for a single high-budget hero.
- Premium product or spatial UI: consider `hero.glassReveal`, `transition.glassRise`, and restrained gradients.
- Technology, networks, or signals: consider particles, matrices, grids, tunnels, and deterministic scramble.
- Data meaning must lead decoration: pair `chart.donutDraw` with `text.countUp`; use `chart.barGrow` for actual comparison.

## Candidate decision

For each candidate, answer:

1. Does its role match the element's job?
2. Does its weight fit the existing hierarchy?
3. Does its language match the content and audience?
4. Can the target stack support its runtime and cleanup?
5. Does the preview show the movement the user actually described?

Reject a candidate if any hard constraint fails, even if its mood keywords match.

## Combining effects

Combine only when the roles are complementary. Typical safe structures are:

- background + text entrance;
- chart drawing + synchronized number;
- hero + restrained subtitle entrance;
- list entrance + one emphasis after the list settles;
- transition cover + matching reveal.

Documented 3.0 pairs:

- `chart.progressStack` + `text.countUp`: start together and share duration when a visible value accompanies each progress bar;
- `ui.gestureSwipe` + `transition.swipePush`: gesture explains the interaction, then the page motion confirms it;
- `sticker.stampPunch` + `camera.shake`: keep the shake short, deterministic, and subordinate to the stamp impact;
- `text.annotate` + `sticker.arrowDraw`: share the same injected accent role and roughness seed so the marks read as one hand-drawn language;
- `camera.zoomPan` + `transition.zoomThrough`: use zoomPan for page-level framing and zoomThrough only at the boundary.

Do not combine two heroes, two competing text entrances, or multiple persistent WebGL backgrounds.

## No exact match

If the top score is low or the list is empty:

1. state that no exact AnimeFX effect exists;
2. select the closest reference by motion principle rather than visual resemblance alone;
3. read its implementation and constraints;
4. write the missing behavior in the target project;
5. describe it as “derived from `<effect.id>`,” not as a new AnimeFX API.
