# @sudobility/music_spatial_core

Platform-agnostic engine behind the Moosiac "Spatial" 3D view: instrument
geometry, scene composition, camera/listener math, projection to 2D line
segments, continuous movement, random wandering, facing detection, per-track
colours, and 2D map-overlay math. All pure logic — no `<Canvas>` mount, no DOM,
no native bridge — so the same build runs byte-for-byte on both
`@sudobility/music_spatial` (web) and `@sudobility/music_spatial_rn` (React
Native).

It depends only on `three` **core** (geometry/math: `BufferGeometry`,
`Vector3`, `Euler`, `Matrix4`, `Color`) and `react` **core** (hooks only) —
never `react-dom`, `react-native`, or `@react-three/fiber`. That split is what
lets one build serve both platforms; the platform packages own only what
genuinely can't be shared (mounting the canvas, capturing raw input, rendering
map-overlay elements).

See [`docs/SPEC.md`](docs/SPEC.md) for the full design rationale (note: its
"draft, not implemented" header is historical — the package is implemented and
published).

## Requirements

- [Bun](https://bun.sh) (the package manager and script runner; `bun.lock` is
  checked in). Scripts also invoke `node` for the build's ESM post-step.
- Access to the GitHub Packages registry for the `@sudobility` scope. `.npmrc`
  points `@sudobility:registry` at `https://npm.pkg.github.com`; installing
  needs a GitHub token with `read:packages` in your environment or `~/.npmrc`.

## Install

```bash
bun install
```

As a dependency in another package (peer deps must be provided by the consumer):

```bash
bun add @sudobility/music_spatial_core
# peers: @sudobility/music_types, react >=18, three ^0.160.0
```

This package declares **no runtime dependencies**; `@sudobility/music_types`,
`react`, and `three` are peers supplied by the consuming app.

## Build

```bash
bun run build      # tsc -p tsconfig.esm.json, then scripts/fix-esm-imports.mjs
bun run clean      # remove dist/
```

The build emits ESM + `.d.ts` to `dist/`. `scripts/fix-esm-imports.mjs`
rewrites relative import specifiers to add `.js` extensions so the output is
valid Node ESM. Only `dist/` is published (`files` in `package.json`).

## Test, lint, typecheck

```bash
bun run test:unit     # vitest run (jsdom env; 507 tests across 12 files)
bun run test:watch    # vitest watch
bun run typecheck     # tsc --noEmit
bun run lint          # eslint src
bun run format        # prettier --write src/**/*.ts
bun run format:check  # prettier --check
bun run verify        # format:check + typecheck + lint + test:unit + build
```

`verify` is what CI and `prepublishOnly` run; use it before committing.

## Regenerating assets

Two codegen scripts (committed outputs, not run on normal builds):

```bash
bun run generate:voices      # assets/*.glb singer meshes -> src/voice-models.generated.ts
bun run export:instruments   # music_types instrument models -> assets/instruments/*.glb + index.json
```

`src/voice-models.generated.ts` is generated — regenerate it, don't hand-edit.

## What's inside (`src/`)

| Module | Purpose |
| --- | --- |
| `geometry.ts` | `buildInstrumentGeometry` — one merged `three` `BufferGeometry` per instrument model (one draw call). |
| `scene.ts` | `buildInstruments` / `cameraFor` / `buildScene` — compose a `Score` + Unplugged arrangement into renderable instruments + camera. Mirrors x (left-handed arrangement frame -> right-handed three.js). |
| `project.ts` | `projectScene` — project a `SpatialScene` through its camera to 2D pixel-space line segments (for platforms with no GL context). |
| `movement.ts` | `stepListener` — pure, frame-rate-independent continuous walking from a `MovementInput`. |
| `wander.ts` | Autonomous "stroll between playing instruments" behaviour, driving `stepListener`. |
| `facing.ts` | Which instrument the listener is looking at (sticky nearest-in-FOV). |
| `map-math.ts` | 2D map-overlay geometry: pixel <-> arrangement point, bearing-from-center. |
| `stage-drag.ts` | Horizontal drag-to-turn for the 3D view (RN worklets). |
| `use-throttled-commit.ts` | React hook: live local drag preview, single store commit on gesture end. |
| `colors.ts` | One stable colour per track, hashed from its name. |
| `voice-models.ts` | The two GM vocal-program singer models (+ `voice-models.generated.ts`). |

`src/index.ts` is the public entry; it also re-exports
`effectiveUnpluggedArrangement`, `UNPLUGGED_RADIUS`, and
`EffectiveUnpluggedArrangement` from `@sudobility/music_types` for convenience.

## License

BUSL-1.1
