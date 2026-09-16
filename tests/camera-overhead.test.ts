import { describe, expect, it } from 'vitest';
import { overheadCamera } from '../src/game/camera';
import { groundHeight } from '../src/game/random';
import { createWorld } from '../src/game/world';

describe('command-stage overhead camera', () => {
  it.each([481516, 20260913, 8675309])('stays above coastal terrain at both zoom limits for seed %i', seed => {
    const world = createWorld(seed, 2);
    for (const x of [-80, 0, 80]) for (const z of [-80, 0, 80]) {
      const focus = { x, y: groundHeight(x, z, 2) + 1, z };
      for (const zoom of [18, 34, 60]) for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const eye = overheadCamera(focus, yaw, zoom, world);
        expect(Object.values(eye).every(Number.isFinite)).toBe(true);
        expect(eye.y).toBeGreaterThanOrEqual(groundHeight(eye.x, eye.z, 2) + 6);
        expect(eye.y).toBeGreaterThan(focus.y);
        expect(Math.hypot(eye.x - focus.x, eye.z - focus.z)).toBeCloseTo(zoom * Math.cos(1.02), 8);
      }
    }
  });

  it('is deterministic and does not change the focus or world', () => {
    const world = createWorld(481516, 2);
    const focus = { x: 0, y: groundHeight(0, 0, 2) + 1, z: 0 };
    const before = JSON.stringify({ focus, world });
    expect(overheadCamera(focus, 0.4, 34, world)).toEqual(overheadCamera(focus, 0.4, 34, world));
    expect(JSON.stringify({ focus, world })).toBe(before);
  });

  it('rises when the player zooms out', () => {
    const world = createWorld(481516, 2);
    const focus = { x: 0, y: groundHeight(0, 0, 2) + 1, z: 0 };
    const near = overheadCamera(focus, 0, 18, world);
    const middle = overheadCamera(focus, 0, 34, world);
    const far = overheadCamera(focus, 0, 60, world);
    expect(middle.y).toBeGreaterThan(near.y);
    expect(far.y).toBeGreaterThan(middle.y);
  });

  it('retains the requested yaw across a full turn', () => {
    const world = createWorld(481516, 2);
    const focus = { x: 21, y: groundHeight(21, -14, 2) + 1, z: -14 };
    for (const yaw of [-Math.PI, -0.4, 0, 0.4, Math.PI, Math.PI * 2]) {
      const eye = overheadCamera(focus, yaw, 34, world);
      const actualYaw = Math.atan2(eye.x - focus.x, eye.z - focus.z);
      expect(Math.atan2(Math.sin(actualYaw - yaw), Math.cos(actualYaw - yaw))).toBeCloseTo(0, 8);
    }
  });

  it('keeps a depressed focus from placing the eye below the terrain', () => {
    const world = createWorld(481516, 2);
    const eye = overheadCamera({ x: 80, y: -100, z: -80 }, 0.4, 18, world);
    expect(eye.y).toBe(groundHeight(eye.x, eye.z, 2) + 6);
  });
});
