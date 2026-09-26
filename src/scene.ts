/**
 * Composes a `Score` and its Unplugged arrangement into everything a
 * platform package needs to render one frame: each instrument's geometry
 * and world transform, and the camera transform for the listener. Called
 * once per relevant render/tick — a platform's `SpatialCanvas` becomes
 * close to a plain `.map()` over `instruments` plus one camera assignment.
 *
 * ## Two halves, memoised apart
 *
 * `buildInstruments` reads the tracks, their stage positions and the lit
 * set; `cameraFor` reads the listener and nothing else. They are separate
 * functions so a platform can memoise each on its own inputs: the listener
 * moves on every walking frame, and when the whole scene was one memo keyed
 * on `score` every step re-created every instrument's element for a camera
 * that was the only thing that had changed. `buildScene` composes the two
 * for callers that want the whole frame at once.
 *
 * ## Handedness
 *
 * The arrangement convention (`unplugged.ts`, the map overlay, the audio
 * pan) is: +z is straight ahead of the listener's default facing and **+x
 * is the listener's right**. That is a left-handed frame. three.js is
 * right-handed — facing +z with +y up puts +x on the *left* — so rendering
 * arrangement coordinates as-is produced a mirror image: an instrument
 * panned right appeared on the left, turning left turned the camera right,
 * and a violin held on the left shoulder rendered on the performer's
 * right. This module is the one place the two meet, so it mirrors x here:
 * positions, geometry (see `buildInstrumentGeometry`), and the sign of
 * every rotation about y and z. Nothing upstream has to know.
 */
import type { BufferGeometry } from 'three';
import {
  effectiveUnpluggedArrangement,
  trackSpatialModel,
} from '@sudobility/music_types';
import type {
  EffectiveUnpluggedArrangement,
  Score,
  Track,
  UnpluggedListener,
} from '@sudobility/music_types';
import { buildInstrumentGeometry } from './geometry';
import { trackColors } from './colors';

export type Vec3Tuple = readonly [number, number, number];

export interface SpatialInstrument {
  readonly trackId: string;
  /** Every stroke of the model in one `LineSegments` buffer — one draw call. */
  readonly geometry: BufferGeometry;
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
  readonly scale: number;
  readonly lit: boolean;
  /** The track's own colour (see `colors.ts`), dimmed while it rests. */
  readonly color: string;
  /** The same colour at full strength — what to draw while it sounds. */
  readonly litColor: string;
}

export interface SpatialCamera {
  readonly position: Vec3Tuple;
  readonly rotation: Vec3Tuple;
}

export interface SpatialScene {
  readonly instruments: readonly SpatialInstrument[];
  readonly camera: SpatialCamera;
}

/** What `buildInstruments` needs to know about a track. */
export type SpatialTrack = Pick<Track, 'id' | 'name' | 'clef' | 'midiProgram'>;

/** Stage floor height every instrument's own pose offset is measured from. */
const GROUND_Y = 0;

/** A first-person listener's ear height above the floor. */
const EAR_HEIGHT = 1.6;

/**
 * Every instrument on stage is yawed 180° from its authored rest
 * orientation, so a model authored facing +z (toward its own audience)
 * faces back toward the listener's default position — a stage convention
 * (performers face the audience), applied uniformly rather than aimed
 * per-instrument at wherever the listener currently stands.
 */
const AUDIENCE_YAW = Math.PI;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * One `SpatialInstrument` per track, placed by `arrangementTracks` (the
 * `tracks` half of an `EffectiveUnpluggedArrangement`) and lit by
 * `soundingTrackIds`. Independent of the listener: memoise it on these
 * three inputs and a walking frame costs nothing here.
 */
export function buildInstruments(
  tracks: readonly SpatialTrack[],
  arrangementTracks: EffectiveUnpluggedArrangement['tracks'],
  soundingTrackIds: ReadonlySet<string>
): readonly SpatialInstrument[] {
  const colors = trackColors(tracks);

  return tracks.map(track => {
    const point = arrangementTracks[track.id] ?? { x: 0, z: 0 };
    const { model, pose } = trackSpatialModel(track);
    const lit = soundingTrackIds.has(track.id);
    const color = colors[track.id];

    return {
      trackId: track.id,
      geometry: buildInstrumentGeometry(model),
      // x mirrored — see the module doc.
      position: [
        -(point.x + pose.position[0]),
        GROUND_Y + pose.position[1],
        point.z + pose.position[2],
      ],
      // Mirroring x negates rotations about y and z and keeps those about
      // x. Composing the instrument's own tilt with the stage yaw by adding
      // the y components is an approximation, exact for the y-only stage
      // yaw and the zero poses every authored model uses today (their
      // poses are baked into the geometry).
      rotation: [
        degToRad(pose.rotationDeg[0]),
        -(degToRad(pose.rotationDeg[1]) + AUDIENCE_YAW),
        -degToRad(pose.rotationDeg[2]),
      ],
      scale: pose.scale,
      lit,
      color: color.base,
      litColor: color.lit,
    };
  });
}

/** The camera transform for `listener`: ear height, x mirrored, yaw from its facing. */
export function cameraFor(listener: UnpluggedListener): SpatialCamera {
  return {
    position: [-listener.x, EAR_HEIGHT, listener.z],
    // Three.js cameras look down their local -Z. With x mirrored, a
    // facing of f degrees (clockwise-positive from +z in arrangement
    // space) is a camera yaw of PI - f: PI looks toward +z, and turning
    // left (f decreasing) turns the camera toward its own left. Pinned
    // by scene.test.ts rather than left to visual inspection — the sign
    // is exactly what was wrong before.
    rotation: [0, Math.PI - degToRad(listener.facingDeg), 0],
  };
}

/** Both halves at once, from the score's effective arrangement. */
export function buildScene(
  score: Pick<Score, 'tracks' | 'unplugged'>,
  soundingTrackIds: ReadonlySet<string>
): SpatialScene {
  const arrangement = effectiveUnpluggedArrangement(score);
  return {
    instruments: buildInstruments(
      score.tracks,
      arrangement.tracks,
      soundingTrackIds
    ),
    camera: cameraFor(arrangement.listener),
  };
}
