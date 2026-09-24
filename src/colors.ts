/**
 * One colour per track, from its name — the same colour on the map marker
 * and on the instrument's lines in the 3D view, so "which one is the
 * cello" is answered the same way in both.
 *
 * The hue is a hash of the track's *name* (stable across sessions and
 * devices, no state to store), then pushed apart from any other track's
 * hue within the score so two "Violin" tracks — or two names that happen
 * to hash close — still come out distinguishable. Saturation/lightness are
 * fixed for the dark stage: a full-strength but not-quite-white "lit"
 * colour while the part sounds, and a dimmer "base" while it rests.
 */

export interface TrackColor {
  /** 0–360. */
  readonly hue: number;
  /** CSS colour for a resting instrument. */
  readonly base: string;
  /** CSS colour for a sounding one. */
  readonly lit: string;
}

/** FNV-1a over the UTF-16 code units, then spread over the hue circle. */
export function hueFromName(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // The golden-angle stretch turns similar hashes into well-separated hues.
  return (h * 137.508) % 360;
}

/**
 * Resting: mostly grey with a tint of the track's hue — enough to tell
 * which instrument is which, not enough to compete with the ones sounding.
 * Sounding: the hue at full strength.
 */
export function colorFromHue(hue: number): TrackColor {
  const h = ((hue % 360) + 360) % 360;
  return {
    hue: h,
    base: `hsl(${h.toFixed(0)}, 10%, 50%)`,
    lit: `hsl(${h.toFixed(0)}, 100%, 70%)`,
  };
}

/** The smallest hue gap two tracks are allowed, in degrees. */
const MIN_GAP = 28;

/**
 * Colours for every track in a score, keyed by id. Hues start from each
 * name's hash and are then separated: going round the circle, any hue
 * closer than `MIN_GAP` to the previous one is pushed forward. With more
 * than 360/MIN_GAP tracks the gap shrinks to what fits.
 */
export function trackColors(
  tracks: readonly { readonly id: string; readonly name: string }[]
): Readonly<Record<string, TrackColor>> {
  const out: Record<string, TrackColor> = {};
  if (tracks.length === 0) return out;
  const gap = Math.min(MIN_GAP, 360 / tracks.length);
  const order = tracks
    .map((track, index) => ({ track, index, hue: hueFromName(track.name) }))
    .sort((a, b) => a.hue - b.hue || a.index - b.index);
  // Two passes round the circle: the second catches the wrap-around
  // between the last and the first.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < order.length; i++) {
      const prev = order[(i - 1 + order.length) % order.length];
      const cur = order[i];
      const prevHue = i === 0 ? prev.hue - 360 : prev.hue;
      if (cur.hue - prevHue < gap) cur.hue = prevHue + gap;
    }
  }
  for (const { track, hue } of order) out[track.id] = colorFromHue(hue);
  return out;
}
