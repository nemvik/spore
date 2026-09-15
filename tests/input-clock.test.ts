import { describe, expect, it } from 'vitest';
import { FixedStepClock, InputLatch } from '../src/game/input-clock';

const noActions = { feed: false, bond: false, tend: false, pulse: false };

describe('simulation-step input latch', () => {
  it.each([
    ['KeyR', 'bond'], ['KeyT', 'tend'], ['KeyX', 'pulse'], ['Space', 'feed'],
  ] as const)('preserves a quick %s press and release until the next actual step', (code, action) => {
    const latch = new InputLatch();
    latch.keyDown(code); latch.keyUp(code);
    expect(latch.consume()).toEqual({ ...noActions, [action]: true });
    expect(latch.consume()).toEqual(noActions);
  });

  it('does not lose a tapped action across multiple render frames with zero simulation steps', () => {
    const clock = new FixedStepClock(), latch = new InputLatch();
    expect(clock.advance(0)).toBe(0);
    latch.keyDown('KeyT'); latch.keyUp('KeyT');
    for (const timestamp of [3, 6, 9, 12, 15]) expect(clock.advance(timestamp)).toBe(0);
    const actions = Array.from({ length: clock.advance(17) }, () => latch.consume());
    expect(actions).toEqual([{ ...noActions, tend: true }]);
    expect(latch.consume()).toEqual(noActions);
  });

  it('holds Space across steps while one-shot keys and browser repeat fire only once', () => {
    const latch = new InputLatch();
    for (const code of ['Space', 'KeyR', 'KeyT', 'KeyX']) {
      latch.keyDown(code); latch.keyDown(code); latch.keyDown(code);
    }
    expect(latch.consume()).toEqual({ feed: true, bond: true, tend: true, pulse: true });
    for (let step = 0; step < 10; step++) {
      latch.keyDown('KeyR'); // OS auto-repeat does not create a new rising edge.
      expect(latch.consume()).toEqual({ ...noActions, feed: true });
    }
    latch.keyUp('Space');
    expect(latch.consume()).toEqual(noActions);
    latch.keyUp('KeyR'); latch.keyDown('KeyR');
    expect(latch.consume()).toEqual({ ...noActions, bond: true });
  });

  it('fires a released one-shot once during multi-step catch-up, while held Space continues', () => {
    const latch = new InputLatch(), clock = new FixedStepClock(); clock.advance(0);
    latch.keyDown('KeyX'); latch.keyUp('KeyX'); latch.keyDown('Space');
    const inputs = Array.from({ length: clock.advance(100) }, () => latch.consume());
    expect(inputs).toHaveLength(6);
    expect(inputs.filter(input => input.pulse)).toHaveLength(1);
    expect(inputs.every(input => input.feed)).toBe(true);
    expect(inputs[0].pulse).toBe(true);
  });

  it('clears pending taps and held keys on mode change/blur, then accepts a fresh press', () => {
    const latch = new InputLatch();
    latch.keyDown('Space'); latch.keyDown('KeyR'); latch.keyUp('KeyR');
    latch.clear();
    expect(latch.consume()).toEqual(noActions);
    latch.keyUp('Space'); // A late keyup after focus loss is harmless.
    latch.keyDown('KeyR');
    expect(latch.consume()).toEqual({ ...noActions, bond: true });
  });

  it('ignores movement, unknown keys and keyup without a preceding keydown', () => {
    const latch = new InputLatch();
    for (const code of ['KeyW', 'Escape', 'Enter', 'unbound-key']) latch.keyDown(code);
    latch.keyUp('KeyX');
    expect(latch.consume()).toEqual(noActions);
  });
});

describe('fixed simulation clock independent of visible frame rate', () => {
  it.each([30, 60, 144])('produces exactly 3600 simulation steps over one minute at %iHz', hz => {
    const clock = new FixedStepClock();
    let steps = clock.advance(0);
    for (let frame = 1; frame <= hz * 60; frame++) steps += clock.advance(frame * 1000 / hz);
    expect(steps).toBe(3600);
  });

  it.each([80, 100])('preserves all elapsed time across ordinary %ims visible frames', frameMs => {
    const clock = new FixedStepClock(); clock.advance(0);
    let steps = 0;
    for (let timestamp = frameMs; timestamp <= 10_000; timestamp += frameMs) steps += clock.advance(timestamp);
    expect(steps).toBe(600);
  });

  it('retains fractional progress through mixed frame durations and duplicate timestamps', () => {
    const clock = new FixedStepClock(); clock.advance(0);
    let timestamp = 0, steps = 0;
    for (const delta of [4, 3, 10, 80, 100, 6, 144, 3, 100, 200, 250, 100]) {
      timestamp += delta;
      steps += clock.advance(timestamp);
      expect(clock.advance(timestamp)).toBe(0);
    }
    expect(timestamp).toBe(1000);
    expect(steps).toBe(60);
  });

  it('caps a visible long stall and discards excess time without future catch-up debt', () => {
    const clock = new FixedStepClock(); clock.advance(0);
    expect(clock.advance(12_000)).toBe(15);
    expect(clock.advance(12_000)).toBe(0);
    expect(clock.advance(12_000 + 1000 / 60)).toBe(1);
    expect(clock.advance(12_000 + 2000 / 60)).toBe(1);
  });

  it('does not advance hidden/paused time and primes the clock again on return', () => {
    const clock = new FixedStepClock(); clock.advance(0);
    expect(clock.advance(100)).toBe(6);
    expect(clock.advance(120, false)).toBe(0);
    expect(clock.advance(120_000, false)).toBe(0);
    expect(clock.advance(240_000)).toBe(0);
    expect(clock.advance(240_100)).toBe(6);
  });

  it('reset at visibility loss prevents a burst even if no hidden RAF callback occurs', () => {
    const clock = new FixedStepClock(); clock.advance(0); clock.advance(10);
    clock.reset();
    expect(clock.advance(300_000)).toBe(0);
    expect(clock.advance(300_010)).toBe(0);
    expect(clock.advance(300_020)).toBe(1);
  });

  it('recovers safely from an invalid or backwards timestamp', () => {
    const clock = new FixedStepClock(); clock.advance(100);
    expect(clock.advance(110)).toBe(0);
    expect(clock.advance(90)).toBe(0);
    expect(clock.advance(100)).toBe(0);
    expect(clock.advance(Number.NaN)).toBe(0);
    expect(clock.advance(1000)).toBe(0);
    expect(clock.advance(1100)).toBe(6);
  });

  it('supports an explicit smaller catch-up bound and rejects invalid configuration', () => {
    const clock = new FixedStepClock({ maxStepsPerFrame: 6 }); clock.advance(0);
    expect(clock.stepSeconds).toBe(1 / 60);
    expect(clock.advance(1000)).toBe(6);
    for (const stepSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new FixedStepClock({ stepSeconds })).toThrow(RangeError);
    }
    for (const maxStepsPerFrame of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new FixedStepClock({ maxStepsPerFrame })).toThrow(RangeError);
    }
  });
});
