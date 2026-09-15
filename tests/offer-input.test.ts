import { describe, expect, it } from 'vitest';
import { FixedStepClock, InputLatch } from '../src/game/input-clock';

describe('deliberate offering input', () => {
  it('preserves a quick E tap for exactly one actual simulation step', () => {
    const latch = new InputLatch(), clock = new FixedStepClock(); clock.advance(0);
    latch.keyDown('KeyE'); latch.keyUp('KeyE');
    expect(clock.advance(10)).toBe(0);
    const inputs = Array.from({ length: clock.advance(100) }, () => latch.consume());
    expect(inputs).toHaveLength(6); expect(inputs.filter(input => input.offer)).toHaveLength(1);
    expect(inputs[0].offer).toBe(true); expect(inputs.every(input => !input.tend)).toBe(true);
  });

  it('does not offer repeatedly while E is held or the browser repeats keydown', () => {
    const latch = new InputLatch(); latch.keyDown('KeyE'); expect(latch.consume().offer).toBe(true);
    for (let i = 0; i < 10; i++) { latch.keyDown('KeyE'); expect(latch.consume().offer).not.toBe(true); }
    latch.keyUp('KeyE'); latch.keyDown('KeyE'); expect(latch.consume().offer).toBe(true);
  });

  it('keeps planting T separate from offering E', () => {
    const latch = new InputLatch(); latch.keyDown('KeyT'); latch.keyUp('KeyT');
    const plant = latch.consume(); expect(plant.tend).toBe(true); expect(plant.offer).not.toBe(true);
    latch.keyDown('KeyE'); latch.keyUp('KeyE');
    const offer = latch.consume(); expect(offer.offer).toBe(true); expect(offer.tend).toBe(false);
  });

  it('discards an unconsumed offering when focus or game mode changes', () => {
    const latch = new InputLatch(); latch.keyDown('KeyE'); latch.clear();
    expect(latch.consume().offer).not.toBe(true);
    latch.keyUp('KeyE'); latch.keyDown('KeyE'); expect(latch.consume().offer).toBe(true);
  });
});
