# AI catalog schema and maintenance

Use this reference only when maintaining the plugin catalog or retrieval behavior.

## Authority split

- `manifest/effects.json` is the API truth source. It owns IDs, params, defaults, pairs, conflicts, previews, and anchor cases.
- `manifest/ai-catalog.json` is a generated retrieval index. It owns summaries, task language, runtime routing, source references, and adaptation targets.
- `tools/build-ai-catalog.mjs` is the catalog generator and semantic curation source.
- `skills/anime-fx-reference/scripts/search-effects.mjs` is the deterministic retrieval contract.

Never hand-edit `manifest/ai-catalog.json`. Regenerate it.

## Catalog fields

| Field | Meaning |
|---|---|
| `id` | Exact AnimeFX API ID |
| `summary` | Concrete description of visible motion |
| `role` | Attention/composition role |
| `temporal` | `once`, `loop`, or `full-duration` |
| `weight` | Performance and attention weight |
| `mood` | Existing visual vocabulary from the API manifest |
| `runtimes` | DOM/SVG/Canvas/Three/WebGL execution surface |
| `dependencies` | Required runtime libraries |
| `directTargets` | Environments that can directly reuse the API |
| `adaptationTargets` | Frameworks that can adapt the implementation |
| `bestFor` | Task phrases used in retrieval and explanation |
| `avoidWhen` | Context and implementation exclusions |
| `suites` | Optional style systems that whitelist the effect |
| `keywords` | Generated retrieval terms |
| `source` | Real implementation file, symbol, and support files |
| `example` | Minimal API call from the truth manifest |
| `preview` | Existing rendered visual evidence |
| `anchorCase` | Existing working integration example |

## Adding or changing an effect

1. Update the runtime implementation.
2. Rebuild `manifest/effects.json` using the existing manifest workflow.
3. Add or revise summary, task uses, exclusions, runtime mapping, or source routing in `tools/build-ai-catalog.mjs`.
4. Ensure preview and anchor case files exist.
5. Regenerate the catalog.
6. Add a retrieval regression when the effect introduces a new intent category.
7. Run all checks.

## Required checks

```bash
node tools/build-ai-catalog.mjs --write
node tools/build-ai-catalog.mjs --check
node tools/test-ai-reference.mjs
node tools/build-manifest.mjs --check
```

The AI reference test verifies all 88 source/preview/case contracts, exact lookup, deterministic ordering, pairing, heavy-budget behavior, and representative natural-language queries.
