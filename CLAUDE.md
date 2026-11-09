# CLAUDE.md

Guidance for working in `@sudobility/music_spatial_core`.

## What it is

Platform-agnostic **logic engine** for the Moosiac "Spatial" 3D view. Pure TS
library consumed by `@sudobility/music_spatial` (web) and
`@sudobility/music_spatial_rn` (React Native). It holds everything about the
Spatial feature that is NOT platform-bound: instrument geometry, scene/camera
composition, 2D projection, listener movement/wander/facing, map-overlay math,
track colours, drag hook.

## Stack

- TypeScript, ESM-only output. Strict mode, `noUnusedLocals/Parameters`.
- **Bun** is the package manager + script runner (`bun.lock` committed). Node
  is used only for the build's post-step.
- **No runtime dependencies.** `@sudobility/music_types`, `react` (>=18),
  `three` (^0.160.0) are **peer deps**, supplied by the consumer.
- Registry: GitHub Packages (`.npmrc`: `@sudobility` ->
  `npm.pkg.github.com`). Installing needs a `read:packages` token in env/npmrc.
- Vitest (jsdom env), ESLint 10 (flat config), Prettier.

## Commands (all verified)

```bash
bun install
bun run build        # tsc -p tsconfig.esm.json THEN node scripts/fix-esm-imports.mjs
bun run test:unit    # vitest run — 507 tests, 12 files
bun run typecheck    # tsc --noEmit (tsconfig.json has noEmit:true)
bun run lint         # eslint src
bun run format:check # prettier --check
bun run verify       # format:check + typecheck + lint + test:unit + build  <- run before commit
```

`verify` is what CI and `prepublishOnly` run. Codegen (committed outputs, not
in the normal build): `bun run generate:voices`, `bun run export:instruments`.

## Architecture (high level)

`src/index.ts` = public API (barrel). Modules are flat, one concern each:
`geometry` (model -> merged `three` BufferGeometry), `scene` (Score +
arrangement -> instruments + camera), `project` (scene -> 2D line segments),
`movement`/`wander`/`facing` (listener behaviour), `map-math`/`stage-drag`
(input geometry), `use-throttled-commit` (drag hook), `colors`,
`voice-models`. Tests sit beside each module as `*.test.ts`.

Data flow: `music_types` provides `Score`/`Track`/arrangement + the 136
authored instrument models (`spatialModelForTrack`); this package converts and
composes them into render-ready output; platform packages only mount a canvas,
capture raw input, and draw.

## Critical conventions & gotchas

- **Never import `react-dom`, `react-native`, or `@react-three/fiber`** (or
  `expo-gl`, any DOM/native API). The whole point is one build for both
  platforms. Use `three` core and `react` hooks only. The code touches neither
  `document`/`window` nor a native bridge.
- **Handedness / x-mirror.** The arrangement frame (music_types, map, audio
  pan) is left-handed: +z ahead, **+x = listener's right**. three.js is
  right-handed. `scene.ts` is the ONE place the two meet and it **mirrors x**
  (positions, geometry, sign of every y/z rotation). Upstream stays
  arrangement-space; don't re-mirror elsewhere.
- **`project.ts` must agree with `scene.ts` to the last sign.** It composes the
  same transforms using three's own `Matrix4`/`Euler` precisely so the 2D
  projection can't diverge from the GL view. Don't hand-roll rotation matrices;
  reuse three's pipeline (same reasoning in `geometry.ts` for not baking poses
  into vertices).
- **`src/voice-models.generated.ts` is generated** — regenerate via
  `generate:voices`, never hand-edit.
- **ESM import fixup.** TS source uses extensionless relative imports;
  `scripts/fix-esm-imports.mjs` adds `.js` in `dist/` so Node ESM resolves.
  Keep relative imports extensionless in source.
- **`stage-drag.ts` uses `'worklet'` directives** so RN can run drag math on
  the UI thread. Keep those functions worklet-safe (no closures over
  non-worklet values).
- `movement`/`wander`/`facing` are pure and frame-rate-independent (take
  `deltaSeconds`, injectable `rng`) so they can be tested deterministically.
- Tests follow the family convention "unit tests pin the encoding" — exact
  expected transforms/segments. Update expectations deliberately when logic
  changes; don't loosen assertions to pass.

## Docs

- `README.md` — install/build/test/run + module map.
- `docs/SPEC.md` — full design rationale. Its "draft, not implemented" header
  is **historical**; the package is implemented and published (v0.0.x). SPEC
  predates the `colors`/`wander`/`facing`/`stage-drag` modules.
