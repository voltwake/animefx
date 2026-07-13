# Integration guide

Use the smallest integration surface that preserves the chosen effect's behavior.

## Reuse in plain HTML or DOM video

Load anime.js before the AnimeFX runtime, initialize one composition timeline, invoke selected effects, then finalize:

```html
<script src="https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js"></script>
<script src="path/to/anime-fx.js"></script>
<script>
  AnimeFX.init('scene-id', 6);
  AnimeFX.text.charsReveal('#title', { at: 300 });
  AnimeFX.finalize();
</script>
```

Copy or reference only required runtime files. Shader effects additionally need `afx-shaders.umd.js` and `shader-fx-config.js`. Three effects need a compatible `THREE` instance passed exactly as shown by the anchor case.

## Adapt into React, Vue, or Svelte

Prefer adaptation when the framework owns mounting and cleanup:

1. create refs for effect targets;
2. initialize inside the framework's post-mount lifecycle;
3. copy the selected effect's motion driver or call AnimeFX against the mounted ref;
4. store the returned instance or cleanup handle;
5. dispose it on unmount;
6. prevent duplicate initialization in development strict modes;
7. keep content and DOM ownership in the framework.

Do not paste a complete standalone HTML case into a component. Extract only the target structure, required styles, selected effect call, and cleanup.

## Adapt to another animation system

When the target already uses GSAP, Motion, Web Animations, Remotion, or another timeline:

- preserve the selected effect's phases, duration ratios, stagger order, easing family, seed, and geometry;
- translate the driver, not the entire AnimeFX orchestration layer;
- keep the AnimeFX ID in a code comment or handoff note as provenance;
- do not claim API compatibility after translation.

## Canvas and deterministic loops

Drive Canvas output from supplied timeline time:

```js
function renderAt(timeMs, seed) {
  // Derive every position from timeMs and seeded state.
  // Do not accumulate uncontrolled real-time drift.
}
```

Set both intrinsic `width`/`height` attributes and CSS size. Scale for device pixel ratio when the target project requires sharp interactive output.

## Three.js and WebGL

- Reuse a renderer when the host architecture already owns one.
- Keep total WebGL contexts within the host's budget.
- Dispose geometries, materials, textures, render targets, and event listeners.
- Stop requestAnimationFrame loops on unmount.
- Use one timeline time source for deterministic video rendering.
- For a static poster, capture the frame and release the context if the scene is no longer interactive.

## Reduced motion

For interactive web output, provide a reduced-motion state:

- replace continuous backgrounds with a stable representative frame;
- shorten or remove large translations and repeated loops;
- keep information visible without waiting for animation;
- preserve the project's existing accessibility conventions when they are stricter.

## Validation checklist

- The target exists and has non-zero dimensions.
- The animation has one clear attentional role.
- Entrance motion settles before the user must read.
- Text remains legible throughout the effect.
- No persistent loop continues after unmount.
- No new random or wall-clock dependency breaks deterministic video output.
- The result was inspected in the actual target project, not only in the AnimeFX preview.
