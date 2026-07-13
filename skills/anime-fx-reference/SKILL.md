---
name: anime-fx-reference
description: Discover, inspect, reuse, and adapt verified AnimeFX motion effects while building or editing websites, React/Vue/Svelte interfaces, HTML/Canvas/Three.js scenes, short videos, motion graphics, heroes, transitions, text animation, charts, and micro-interactions. Use when an AI needs to choose an animation, add motion, avoid inventing an effect that already exists, inspect AnimeFX source/examples/previews, or translate an existing AnimeFX motion pattern into the user's current technology stack. This is a reference-and-adaptation skill, not a video generator.
---

# AnimeFX Reference

Use AnimeFX as an evidence-backed motion reference library. Work inside the user's current project. Do not move the task into AnimeFX's composition compiler or MP4 renderer unless the user explicitly asks for that repository-specific workflow.

## Resolve the plugin root

Treat the directory containing `.codex-plugin/`, `.claude-plugin/`, `manifest/`, and `lib/` as `PLUGIN_ROOT`.

- In Claude Code, use `${CLAUDE_PLUGIN_ROOT}`.
- In other agents, resolve `PLUGIN_ROOT` as three directories above this `SKILL.md`.
- Run all bundled scripts by absolute path if the current working directory is the user's target project.

Search from the plugin root with:

```bash
node skills/anime-fx-reference/scripts/search-effects.mjs --query "<motion intent>" --limit 3
```

When the user needs a complete page arrangement rather than one motion primitive, search the 16 verified recipes instead:

```bash
node skills/anime-fx-reference/scripts/search-effects.mjs --type recipe --query "<page intent>" --limit 3
```

Use an effect search for one target or interaction. Use a recipe search for a cover, data page, list, copy page, or ending that needs a coordinated sequence. A recipe is optional composition evidence, not permission to move the user's project into AnimeFX's compiler.

## Required workflow

1. Inspect the target project before choosing an effect. Identify:
   - target element and motion role: background, hero, component, text entrance, text exit, emphasis, or transition;
   - target stack: HTML/DOM, React/Vue/Svelte, SVG, Canvas, Three.js, WebGL, or video renderer;
   - visual intent and exclusions;
   - performance budget and whether a heavy effect already exists.
2. Convert the task into a short search query containing the role, mood, target stack, and constraints. Run the search script and request three candidates.
   - If the request is page-level orchestration, run `--type recipe` first, inspect its effect sequence, then look up only the selected individual effects as needed.
3. Keep the candidate IDs and evidence. Do not invent an AnimeFX ID or parameter.
4. Choose one candidate, or a documented pair, then run an exact lookup:

   ```bash
   node skills/anime-fx-reference/scripts/search-effects.mjs --id <effect.id> --format json
   ```

5. Read only the selected effect's real implementation, anchor case, and preview:
   - open `source.file` and locate `source.symbol`;
   - open `anchorCase` for integration structure;
   - inspect `preview` when visual judgment matters;
   - treat the exact lookup's `params` as authoritative.
6. Select an integration mode:
   - **reuse**: import the AnimeFX runtime and call the existing API in an HTML/video environment;
   - **adapt**: preserve the motion principle, timings, deterministic driver, and constraints while translating it into the target framework's ownership model.
7. Implement the effect in the user's current project. Respect existing architecture, animation libraries, cleanup conventions, reduced-motion behavior, and rendering lifecycle.
8. Validate the result in the target project. Check visual scale, context, timing, cleanup, performance, and determinism in proportion to the task.
9. Report the AnimeFX effect IDs used as references and distinguish direct reuse from adapted or newly derived code.

## Selection rules

- Prefer a verified library effect when it materially fits the request.
- Return one primary choice and at most two alternatives. Explain tradeoffs instead of dumping the catalog.
- Treat `high` search confidence as a strong candidate, `medium` as a comparison candidate, and `low` as only the closest motion reference.
- If search returns no result or only low-confidence results, state that the requested effect is not in the library. Use the closest motion principle if useful and label all new code as derived.
- Do not use a heavy effect when the screen already has a heavy hero.
- Keep Chinese titles out of scramble/glitch effects unless the user explicitly requests that language.
- Preserve documented pairs such as `chart.donutDraw` + `text.countUp` and cover/reveal transition pairs.
- Do not combine effects merely because both are visually impressive.

Read [selection-guide.md](references/selection-guide.md) when choosing between multiple candidates or combining effects.

## Integration rules

- Reuse mode is preferred for plain HTML, DOM-based video, or an existing AnimeFX project.
- Adapt mode is preferred when React/Vue/Svelte owns the DOM lifecycle, the target already uses another animation system, or only the motion principle is needed.
- Do not copy the whole runtime when a small isolated implementation is sufficient.
- Do not silently replace the project's existing animation stack.
- For loop, Canvas, Three.js, and Shader effects, drive the frame from a deterministic timeline or supplied time value. Do not introduce `Math.random()` or `Date.now()` into render callbacks.
- Dispose Canvas/WebGL/Three resources and detach listeners when the target unmounts.
- Honor `prefers-reduced-motion` in interactive web output unless the project already defines another accessibility policy.

Read [integration-guide.md](references/integration-guide.md) before adapting across frameworks or using Canvas, Three.js, or Shader effects.

## Evidence hierarchy

Use sources in this order:

1. `manifest/effects.json` for exact API names, parameters, defaults, pairs, and constraints.
2. `manifest/ai-catalog.json` for retrieval metadata and source routing.
3. `source.file` for implementation behavior.
4. `anchorCase` for working integration structure.
5. `preview` for visual evidence.
6. Recipe search results for optional page-orchestration examples. `exampleTheme` and `manifest/suites/` are rendering fixtures only, never style recommendations.

Never treat generated prose, memory, or an old example as more authoritative than the API manifest.

## What not to do

- Do not default to creating a composition spec.
- Do not default to compiling HTML or rendering MP4.
- Do not force the user to select `techNoir`, `inkPaper`, or `appleGlass`.
- Do not source colors, typography, or surface language from AnimeFX. Style comes from the user's project or design system (for example Curio); bind its tokens to `bg`, `ink`, `accent`, and `muted` roles.
- Do not read all 88 effect implementations before searching.
- Do not claim an adapted effect is a direct library effect.
- Do not claim visual validation if no rendered target was inspected.
- Do not modify AnimeFX itself unless the user asks to extend or maintain the library.

## Human browsing entry

Use `总览门户.html` as the single human directory for 88 effects and 16 page recipes. Each effect card opens its own `效果详情.html?fx=<effect.id>` parameter lab with live preview, replay, shareable state, and generated invocation code. `anchorCase` remains internal integration evidence for developers and AI; it is not the human-facing detail-page model. Working integration examples remain in `案例/`, including `案例/18-基础效果锚点.html` for the nine foundational effects formerly hosted by the legacy gallery.

## Maintaining the plugin

Read [catalog-schema.md](references/catalog-schema.md) only when adding effects, changing catalog metadata, modifying retrieval, or validating the plugin package.

After maintenance changes, run:

```bash
node tools/build-ai-catalog.mjs --write
node tools/build-ai-catalog.mjs --check
node tools/test-ai-reference.mjs
```
