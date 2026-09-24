# music_spatial_core — design spec (draft, for review)

Status: **draft, not implemented.** Nothing in `src/` is real yet.

## What this is

Everything about the Moosiac "Spatial" 3D view that is pure logic — no
Canvas mounting, no DOM, no React Native, no raw input capture — lives here
once. [`music_spatial`](../../music_spatial/docs/SPEC.md) (web) and
[`music_spatial_rn`](../../music_spatial_rn/docs/SPEC.md) (React Native)
both depend on this package and differ from each other only in the parts
that genuinely can't be shared: mounting a `<Canvas>`
(`@react-three/fiber` vs `/native`), capturing raw input (keyboard vs
touch/gesture), and rendering the map overlay's actual elements (DOM/CSS vs
RN `View`/`StyleSheet`).

This package exists because `three` core (not `@react-three/fiber`) and
React core (not `react-dom`/`react-native`) both run identically on web and
native — that's the same fact that makes `@react-three/fiber/native`
possible at all, reusing `three` unmodified and only swapping the
reconciler. Almost every piece of *logic* in the Spatial feature turns out
to sit on that shared foundation once it's looked for.

## Dependency graph

```
music_spatial_core
├── @sudobility/music_types  (peer) — InstrumentSpatialModel, spatialModelForTrack,
│                                     Score, Track, UnpluggedListener/Point/Arrangement
│                                     — and, since the move, the Unplugged
│                                     arrangement policy too (`domain/unplugged`:
│                                     effectiveUnpluggedArrangement, UNPLUGGED_RADIUS,
│                                     the mix formula), so this package depends on
│                                     nothing else in the family. It used to take
│                                     those two helpers from music_lib, which
│                                     dragged the whole frontend library in for two
│                                     pure functions; music_lib now re-exports them.
├── three                    (peer) — geometry/math only: BufferGeometry, Vector3,
│                                     Euler, Color. Nothing here ever constructs a
│                                     WebGLRenderer or mounts a scene — that's the
│                                     one line each platform package still owns.
├── react                    (peer) — hooks only (useState/useRef/useCallback +
│                                     requestAnimationFrame, all environment-
│                                     neutral); never react-dom or react-native.
```

No `@react-three/fiber` dependency in either form — that split happens one
level up, in each platform package, which is the only place it can.

## 1. Instrument geometry — data in, drawable out

```ts
import type { InstrumentSpatialModel, InstrumentPose } from "@sudobility/music_types";
import type { BufferGeometry } from "three";

/** One drawable stroke, set up for `THREE.LineSegments`, already positioned/
 *  rotated/scaled per the model's own pose — the caller places the whole
 *  group at the track's stage position and does nothing further to it. */
export function buildInstrumentGeometry(
  model: InstrumentSpatialModel,
  pose: InstrumentPose,
): readonly BufferGeometry[];
```

Pure `three` math (`Vector3`, matrix transforms) — no scene graph, no
renderer. Both platform packages wrap each returned geometry in their own
`<lineSegments geometry={g} />`, which is in fact identical JSX either way:
`@react-three/fiber`'s intrinsic elements are the same vocabulary on web and
native, so this is where sharing very nearly extends into the platform
packages' own render code too, short of the `Canvas` mount itself.

## 2. Scene composition

```ts
export type Vec3Tuple = readonly [number, number, number];

export interface SpatialInstrument {
  readonly trackId: string;
  readonly geometry: readonly BufferGeometry[];
  readonly position: Vec3Tuple;   // stage position, from the arrangement
  readonly rotation: Vec3Tuple;   // radians: pose + facing-the-audience default
  readonly lit: boolean;          // trackId ∈ soundingTrackIds
  readonly litColor: string;      // resolved once here, not per-frame per-platform
}

export interface SpatialCamera {
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;   // yaw only, from listener.facingDeg
}

export interface SpatialScene {
  readonly instruments: readonly SpatialInstrument[];
  readonly camera: SpatialCamera;
}

export function buildScene(
  score: Score,
  soundingTrackIds: ReadonlySet<string>,
): SpatialScene;
```

The single function each platform package calls once per relevant render:
resolving each track's model via `spatialModelForTrack`, its position via
`effectiveUnpluggedArrangement`, its geometry via `buildInstrumentGeometry`,
and the camera transform from the listener are all pure and identical on
both platforms. A platform's `SpatialCanvas` becomes close to a plain
`.map()` over `scene.instruments` plus one camera assignment — there is very
little decision left for it to make.

## 3. Movement

Spatial-view-specific behavior — nothing else in either app ever calls
it — so it lives beside the rest of the engine rather than in `music_lib`'s
general-purpose surface, which keeps only what's needed independent of
whether the Spatial view exists at all (`effectiveUnpluggedArrangement`, the
audio mix formula).

```ts
export interface MovementInput {
  readonly forward: number; // -1..1: back..forward
  readonly strafe: number;  // -1..1: left..right, lateral
  readonly turn: number;    // -1..1: turn left..turn right
}

export interface MovementSpeed {
  readonly metersPerSecond: number;   // default TBD, ~3
  readonly degreesPerSecond: number;  // default TBD, ~120
}

/** Pure, frame-rate-independent: multiply input by deltaSeconds and speed,
 *  apply relative to the listener's CURRENT facing (forward is always
 *  "where the listener is looking now"), using the same bearing convention
 *  established for the existing 2D map — facingDeg 0 = +z, clockwise-positive. */
export function stepListener(
  listener: UnpluggedListener,
  input: MovementInput,
  deltaSeconds: number,
  speed?: MovementSpeed,
): UnpluggedListener;
```

Web's keyboard handling and RN's joystick/look-drag both reduce to producing
a `MovementInput` from their own raw input source, then calling this one
function every frame. The existing discrete keyboard nudge on the 2D map
(one step per keypress) is kept as its own, separate, simpler caller of the
Unplugged commands directly — a different job (fine placement while
arranging) from continuous walking, not superseded by `stepListener`.

## 4. Map-overlay math

The existing 2D arrangement UI (`UnpluggedTab.tsx`, both platforms today)
mixes raw-event capture (DOM pointer events vs. RN gesture-handler +
`measureInWindow`) with pure geometry (pixel position ↔ arrangement point,
bearing-from-center for rotation, half-circle clamping). Only the capture
half is platform-bound; the geometry moves here:

```ts
export interface OverlayGeometry {
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusPx: number; // the rendered half-circle's radius, in the
                              // overlay's own pixel space
}

/** Pixel position -> a point in arrangement space (meters from center),
 *  clamped to the half-circle the instruments are laid out in. */
export function pointFromPixel(
  geometry: OverlayGeometry,
  pixelX: number,
  pixelY: number,
): UnpluggedPoint;

/** The reverse, for drawing a marker at a point's pixel position. */
export function pixelFromPoint(
  geometry: OverlayGeometry,
  point: UnpluggedPoint,
): { readonly x: number; readonly y: number };

/** Bearing from the arrangement's center to a pixel position, in degrees —
 *  the exact-rotation math already verified during the 2D build: computed
 *  fresh from the CURRENT absolute pixel position every call, never from an
 *  accumulated delta, which is what removed the rotation drift both
 *  platforms hit during that work. */
export function bearingFromCenter(
  geometry: OverlayGeometry,
  pixelX: number,
  pixelY: number,
): number;
```

Each platform's drag hook still owns *getting* a pixel position — DOM
`getBoundingClientRect`/pointer events vs. RN `measureInWindow`/
`GestureDetector`'s `absoluteX`/`absoluteY` — the two event systems don't
share a common shape to unify without an abstraction costing more than it
saves for two call sites. Everything downstream of "here is a pixel
position" is shared.

## 5. The throttled-commit hook

The drag-performance fix already built and verified for the 2D map — local
state for instant visual feedback, `requestAnimationFrame`-throttled store
commits, a guaranteed final synchronous commit on release — has no DOM or RN
dependency in it: `useState`/`useRef`/`useCallback` are core React, and
`requestAnimationFrame` is standard on both web and RN (RN polyfills it). So
the hook itself, not just the pattern, is shareable:

```ts
export function useThrottledCommit<T>(
  value: T,
  commit: (value: T) => void,
): {
  readonly value: T;                    // the throttled-for-display value
  readonly setValue: (next: T) => void; // instant local update + scheduled commit
  readonly commitNow: () => void;       // forces the pending commit through (drag end)
};
```

Both platforms' drag handlers call `setValue` on every raw move event (from
whichever event system) and `commitNow` on release; neither reimplements the
throttling.

## What's still genuinely platform-specific — the honest remainder

- Mounting the `<Canvas>` — `@react-three/fiber` vs `/native`; different
  packages, can't share the import.
- Capturing raw input — `keydown`/`keyup` (web) vs.
  `react-native-gesture-handler` gestures + a joystick/look-drag scheme
  (RN) — different event systems, feed the same `MovementInput`/pixel-
  position shapes into the functions above immediately after capture.
- Rendering the map overlay's actual elements — `<div style={...}>`/CSS vs
  `<View style={...}>`/`StyleSheet` — different element vocabularies,
  positioned using the shared `pixelFromPoint`/`pointFromPixel` math.
- RN's native GL context acquisition (the open Tier 1/Tier 2 risk in
  `music_spatial_rn`'s spec) — has no web equivalent at all.

Everything else — instrument geometry, scene composition, camera transform,
movement, map math, and the drag-throttling hook — is written once, here.

## The one thing that stays in `music_types`, not here, and why

`InstrumentSpatialModel`/`spatialModelForTrack` — the 136 authored
wireframe models (all 128 GM melodic programs plus the 8 drum kits, per the
user's decision: every instrument this app supports, no family-fallback
shortcut) — live in `music_types`, a sibling to the existing 2D icon system
(`icon-art.ts`, `gm-icon.ts`), not in this package. Two reasons: it's data
about an instrument, the same category as everything else already in
`domain/instruments/`, and the *data itself* needs no `three` dependency to
exist (a `Vec3` is just three numbers) — only §1's *conversion* into
drawable geometry needs `three`, and that's the part that does live here.
Still open (stated fully in `music_spatial`'s spec, not repeated): whether
the 136 models are hand-written coordinate arrays or authored through a
small per-family templated mini-language, given the scale.

## Testing

Vitest, and unusually thorough for this family's "unit tests pin the
encoding" convention, because almost everything in this package *is* logic
rather than encoding: `buildInstrumentGeometry` (once real model data
exists), `buildScene`'s composition (given a fixture score + arrangement +
a couple of `soundingTrackIds`, exact expected transforms), `stepListener`
(frame-independence, facing-relative movement), the map math
(`pointFromPixel`/`pixelFromPoint` round-trip, `bearingFromCenter` against
the same fixed convention already pinned by the 2D build), and
`useThrottledCommit` (via `@testing-library/react`'s `renderHook`,
environment-neutral — no DOM or RN needed to test it, matching the point of
building it here).

## Build sequencing

Built alongside `music_spatial` (web first, per the existing decision) —
there's no scenario where this package is useful before at least one
platform consumes it. `music_spatial_rn` then consumes it as-is, ideally
unmodified, when native work starts.
