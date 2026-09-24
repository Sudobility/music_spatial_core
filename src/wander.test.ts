import { describe, expect, it } from 'vitest';
import {
  IDLE_WANDER,
  pickWanderTarget,
  RECENT,
  stepWander,
  WANDER_SPEED,
  type WanderInstrument,
  type WanderState,
} from './wander';

/** A fixed sequence, so a test's "random" choice is reproducible. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const LEFT: WanderInstrument = {
  id: 'left',
  point: { x: -3, z: 4 },
  sounding: true,
};
const MID: WanderInstrument = {
  id: 'mid',
  point: { x: 0, z: 5 },
  sounding: true,
};
const RIGHT: WanderInstrument = {
  id: 'right',
  point: { x: 3, z: 4 },
  sounding: true,
};
const ALL = [LEFT, MID, RIGHT];
const AT_ORIGIN = { x: 0, z: 0, facingDeg: 0 };
const READY: WanderState = { ...IDLE_WANDER, dwellUntil: -1 };

const withSounding = (ids: readonly string[]): WanderInstrument[] =>
  ALL.map(i => ({ ...i, sounding: ids.includes(i.id) }));

describe('pickWanderTarget', () => {
  it('stands a pace or two in front of the chosen instrument, on the side it is approached from', () => {
    const rng = seeded(1);
    for (let i = 0; i < 100; i++) {
      const { target, anchorId } = pickWanderTarget(
        ALL,
        ALL,
        AT_ORIGIN,
        null,
        rng
      );
      const anchor = ALL.find(a => a.id === anchorId)!.point;
      const d = Math.hypot(anchor.x - target.x, anchor.z - target.z);
      expect(d).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(d).toBeLessThanOrEqual(1.8 + 1e-9);
      expect(Math.hypot(target.x, target.z)).toBeLessThan(
        Math.hypot(anchor.x, anchor.z) + 1e-9
      );
    }
  });

  it('never lands inside an instrument, nor far from the group', () => {
    const rng = seeded(2);
    for (let i = 0; i < 200; i++) {
      const { target } = pickWanderTarget(ALL, ALL, AT_ORIGIN, null, rng);
      for (const a of ALL)
        expect(
          Math.hypot(a.point.x - target.x, a.point.z - target.z)
        ).toBeGreaterThanOrEqual(0.9 - 1e-9);
      expect(Math.hypot(target.x, target.z - 4.333)).toBeLessThanOrEqual(
        3.07 + 1.5 + 1e-6
      );
    }
  });

  it('does not visit the same instrument twice running when there is a choice', () => {
    const rng = seeded(3);
    let previous = 'mid';
    for (let i = 0; i < 50; i++) {
      const { anchorId } = pickWanderTarget(ALL, ALL, AT_ORIGIN, previous, rng);
      expect(anchorId).not.toBe(previous);
      previous = anchorId;
    }
  });

  it('only ever picks from the candidates it is given', () => {
    const rng = seeded(4);
    for (let i = 0; i < 50; i++)
      expect(
        pickWanderTarget([RIGHT], ALL, AT_ORIGIN, null, rng).anchorId
      ).toBe('right');
  });
});

describe('stepWander', () => {
  it('stands still with no instruments, and with none playing', () => {
    expect(
      stepWander(AT_ORIGIN, READY, [], 0.5, { rng: seeded(5) }).listener
    ).toEqual(AT_ORIGIN);
    const silent = stepWander(AT_ORIGIN, READY, withSounding([]), 0.5, {
      rng: seeded(5),
    });
    expect(silent.listener).toEqual(AT_ORIGIN);
    expect(silent.state.target).toBeNull();
  });

  it('walks only toward an instrument that is playing', () => {
    const rng = seeded(6);
    for (let i = 0; i < 20; i++) {
      const step = stepWander(
        AT_ORIGIN,
        READY,
        withSounding(['right']),
        1 / 60,
        { rng }
      );
      expect(step.state.anchorId).toBe('right');
    }
  });

  it('waits out a dwell before picking a target', () => {
    const dwelling: WanderState = {
      ...IDLE_WANDER,
      anchorId: 'mid',
      dwellUntil: 2,
      elapsed: 0,
    };
    const a = stepWander(AT_ORIGIN, dwelling, ALL, 1, { rng: seeded(7) });
    expect(a.state.target).toBeNull();
    expect(Math.hypot(a.listener.x, a.listener.z)).toBeCloseTo(0);
    const b = stepWander(a.listener, a.state, ALL, 1.5, { rng: seeded(7) });
    expect(b.state.target).not.toBeNull();
  });

  it('turns to face the instrument it is standing at', () => {
    const dwelling: WanderState = {
      ...IDLE_WANDER,
      anchorId: 'right',
      dwellUntil: 100,
      elapsed: 0,
    };
    let listener = { x: 0, z: 4, facingDeg: 0 };
    let state = dwelling;
    for (let frame = 0; frame < 60 * 4; frame++) {
      const step = stepWander(listener, state, ALL, 1 / 60, { rng: seeded(8) });
      listener = step.listener;
      state = step.state;
    }
    expect(listener.facingDeg).toBeCloseTo(90, 0);
    expect(listener.x).toBeCloseTo(0);
    expect(listener.z).toBeCloseTo(4);
  });

  it('leaves an instrument that stops playing for one that is, after the grace period', () => {
    const dwelling: WanderState = {
      ...IDLE_WANDER,
      anchorId: 'right',
      dwellUntil: 100,
      elapsed: 0,
      heard: { right: 0, left: 0 },
    };
    // Right goes silent while left keeps sounding: within RECENT it stays; after, it goes.
    const soon = stepWander(
      { x: 1.5, z: 4, facingDeg: 90 },
      dwelling,
      withSounding(['left']),
      RECENT * 0.5,
      { rng: seeded(9) }
    );
    expect(soon.state.anchorId).toBe('right');
    const later = stepWander(
      soon.listener,
      soon.state,
      withSounding(['left']),
      RECENT,
      { rng: seeded(9) }
    );
    expect(later.state.anchorId).toBe('left');
    expect(later.state.target).not.toBeNull();
  });

  it('does not abandon an instrument that merely rests between notes', () => {
    let state: WanderState = {
      ...IDLE_WANDER,
      anchorId: 'mid',
      dwellUntil: 100,
      elapsed: 0,
      heard: { mid: 0 },
    };
    const listener = { x: 0, z: 3.5, facingDeg: 0 };
    // A one-second rest, then a note, repeated: never silent longer than RECENT.
    for (let beat = 0; beat < 10; beat++) {
      state = stepWander(listener, state, withSounding([]), 1, {
        rng: seeded(10),
      }).state;
      expect(state.anchorId).toBe('mid');
      state = stepWander(listener, state, withSounding(['mid']), 0.1, {
        rng: seeded(10),
      }).state;
    }
  });

  it('walks toward its target, turning before it moves, arrives, then lingers', () => {
    const rng = seeded(11);
    let listener = AT_ORIGIN;
    let state = READY;
    const first = stepWander(listener, state, ALL, 1 / 60, { rng });
    const target = first.state.target!;
    listener = first.listener;
    state = first.state;
    let arrived = false;
    for (let frame = 0; frame < 60 * 60 && !arrived; frame++) {
      const step = stepWander(listener, state, ALL, 1 / 60, { rng });
      listener = step.listener;
      state = step.state;
      if (state.target === null) arrived = true;
    }
    expect(arrived).toBe(true);
    expect(
      Math.hypot(target.x - listener.x, target.z - listener.z)
    ).toBeLessThan(0.25);
    expect(state.dwellUntil - state.elapsed).toBeGreaterThanOrEqual(4);
  });

  it('never moves faster than the walking pace', () => {
    const rng = seeded(12);
    let listener = AT_ORIGIN;
    let state = READY;
    for (let frame = 0; frame < 900; frame++) {
      const step = stepWander(listener, state, ALL, 1 / 60, { rng });
      const moved = Math.hypot(
        step.listener.x - listener.x,
        step.listener.z - listener.z
      );
      expect(moved).toBeLessThanOrEqual(
        WANDER_SPEED.metersPerSecond / 60 + 1e-9
      );
      expect(
        Math.abs(step.listener.facingDeg - listener.facingDeg) % 360
      ).toBeLessThanOrEqual(WANDER_SPEED.degreesPerSecond / 60 + 1e-6);
      listener = step.listener;
      state = step.state;
    }
  });
});
