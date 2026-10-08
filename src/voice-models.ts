/**
 * The two singers who stand in for General MIDI's vocal programs on the
 * Spatial stage: Choir Aahs (52) as a man in a tuxedo and Voice Oohs (53)
 * as a woman in an evening gown, each at a microphone stand.
 *
 * Modelled as meshes (`assets/*.glb`) and turned into strokes and a map
 * icon by `scripts/generate-voice-models.ts`; the data is
 * `voice-models.generated.ts`. Regenerate rather than edit it.
 */
import { isPercussionTrack, spatialModel } from '@sudobility/music_types';
import type {
  InstrumentIconArt,
  InstrumentSpatialModel,
  SpatialStroke,
  Track,
} from '@sudobility/music_types';
import {
  FEMALE_VOCALIST_ICON,
  FEMALE_VOCALIST_STROKES_MM,
  MALE_VOCALIST_ICON,
  MALE_VOCALIST_STROKES_MM,
} from './voice-models.generated';

export interface PerformerModel {
  readonly lineModel: InstrumentSpatialModel;
  /** The front silhouette, for the map overlay's marker. */
  readonly icon: InstrumentIconArt;
}

function strokesFromMillimetres(
  strokes: readonly (readonly number[])[]
): SpatialStroke[] {
  return strokes.map(flat => {
    const points: [number, number, number][] = [];
    for (let i = 0; i < flat.length; i += 3) {
      points.push([flat[i] / 1000, flat[i + 1] / 1000, flat[i + 2] / 1000]);
    }
    return points;
  });
}

export const MALE_VOCALIST: PerformerModel = {
  lineModel: spatialModel(
    'male-vocalist',
    strokesFromMillimetres(MALE_VOCALIST_STROKES_MM)
  ),
  icon: MALE_VOCALIST_ICON,
};

export const FEMALE_VOCALIST: PerformerModel = {
  lineModel: spatialModel(
    'female-vocalist',
    strokesFromMillimetres(FEMALE_VOCALIST_STROKES_MM)
  ),
  icon: FEMALE_VOCALIST_ICON,
};

/**
 * The singer `track` is drawn as, if any. On a percussion track
 * `midiProgram` names a kit, and kits 52 and 53 are not voices.
 */
export function performerForTrack(
  track: Pick<Track, 'clef' | 'midiProgram'>
): PerformerModel | undefined {
  if (isPercussionTrack(track)) return undefined;
  if (track.midiProgram === 52) return MALE_VOCALIST;
  if (track.midiProgram === 53) return FEMALE_VOCALIST;
  return undefined;
}
