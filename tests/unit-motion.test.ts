import { describe, expect, it } from 'vitest';
import { groundHeight, horizontalDistance } from '../src/game/random';
import type { Vec3 } from '../src/game/types';
import { moveUnit, openGround, unitNavigation } from '../src/game/unit-motion';
import type { MovingUnit } from '../src/game/unit-motion';
import { createWorld } from '../src/game/world';

function point(x: number, z: number): Vec3 { return { x, y: groundHeight(x, z, 2) + .8, z }; }
function unit(id: number, x: number, z: number): MovingUnit {
  const pos = point(x, z); return { id, pos, heading: 0, navigation: unitNavigation(pos) };
}

describe('RTS movement on the inherited coastal world', () => {
  it('travels continuously and arrives within the requested interaction radius', () => {
    const world = createWorld(481516, 2); world.obstacles = [];
    const u = unit(1, -12, 0), target = point(12, 0), speed = 4, dt = 1 / 60;
    let arrived = false;
    for (let i = 0; i < 600 && !arrived; i++) {
      const previous = { ...u.pos };
      arrived = moveUnit(world, u, target, [], speed, dt, .5);
      expect(horizontalDistance(previous, u.pos)).toBeLessThanOrEqual(speed * dt + 1e-7);
      expect(u.pos.y).toBeCloseTo(groundHeight(u.pos.x, u.pos.z, 2) + .8, 10);
    }
    expect(arrived).toBe(true); expect(horizontalDistance(u.pos, target)).toBeLessThanOrEqual(.55);
    const settled = structuredClone(u);
    expect(moveUnit(world, u, target, [], speed, dt, .55)).toBe(true); expect(u).toEqual(settled);
  });

  it('uses elapsed time, with matching unobstructed arrival at 30 and 60 simulation steps per second', () => {
    const world = createWorld(481516, 2); world.obstacles = [];
    const a = unit(1, -12, 0), b = unit(1, -12, 0), target = point(12, 0);
    for (let i = 0; i < 90; i++) moveUnit(world, a, target, [], 4, 1 / 30, .5);
    for (let i = 0; i < 180; i++) moveUnit(world, b, target, [], 4, 1 / 60, .5);
    expect(a.pos.x).toBeCloseTo(b.pos.x, 8); expect(a.pos.z).toBeCloseTo(b.pos.z, 8);
    expect(horizontalDistance(point(-12, 0), a.pos)).toBeCloseTo(12, 8);
  });

  it('routes around a physical obstacle without tunnelling or teleporting', () => {
    const world = createWorld(481516, 2);
    world.obstacles = [{ id: 700, kind: 'rock', pos: point(0, 0), radius: 3.5, height: 9 }];
    const u = unit(7, -12, 0), target = point(12, 0), radius = .72;
    let arrived = false, detour = 0;
    for (let i = 0; i < 1200 && !arrived; i++) {
      const previous = { ...u.pos };
      arrived = moveUnit(world, u, target, [], 4, 1 / 60, .5, radius);
      expect(horizontalDistance(previous, u.pos)).toBeLessThanOrEqual(4 / 60 + .00002);
      expect(horizontalDistance(u.pos, world.obstacles[0].pos)).toBeGreaterThanOrEqual(3.5 + radius - .00001);
      detour = Math.max(detour, Math.abs(u.pos.z));
    }
    expect(arrived).toBe(true); expect(detour).toBeGreaterThan(3.5);
  });

  it('finishes a short intermediate waypoint on the route to seed 20260913 food 111', () => {
    const world = createWorld(20260913, 2);
    const home = openGround(world, world.landmarks.find(l => l.kind === 'nest')!.pos, 0, 4);
    const start = openGround(world, home, 0, 4);
    const u = unit(2, start.x, start.z), food = world.resources.find(r => r.id === 111)!;
    expect(food.kind).toBe('detritus');
    // Pace of the prepared coastal lineage used in the 54-resource route audit.
    // A .03 m stopping epsilon froze this route .026 m from a ring waypoint,
    // which steerToward still considered unreached (.02 m), 11.6 m from food.
    const pace = 4.661398217264562;
    let arrived = false;
    for (let frame = 0; frame < 2400 && !arrived; frame++) {
      const previous = { ...u.pos };
      arrived = moveUnit(world, u, food.pos, [], pace, 1 / 60, 2);
      expect(horizontalDistance(previous, u.pos)).toBeLessThanOrEqual(pace / 60 + .00002);
    }
    expect(arrived).toBe(true);
    expect(horizontalDistance(u.pos, food.pos)).toBeLessThanOrEqual(2.05);
  });

  it('separates a moving group, including coincident starting units, using frozen positions', () => {
    const world = createWorld(481516, 2); world.obstacles = [];
    const units = [unit(1, -12, 0), unit(2, -12, 0), unit(3, -12, .4)];
    const targets = [point(12, -2), point(12, 0), point(12, 2)];
    for (let frame = 0; frame < 600; frame++) {
      const frozen = units.map(u => ({ id: u.id, pos: { ...u.pos } }));
      for (let i = 0; i < units.length; i++) moveUnit(world, units[i], targets[i], frozen, 4, 1 / 60, .4);
      for (const u of units) expect(Object.values(u.pos).every(Number.isFinite)).toBe(true);
    }
    for (let i = 0; i < units.length; i++) {
      expect(horizontalDistance(units[i].pos, targets[i])).toBeLessThanOrEqual(.5);
      for (let j = i + 1; j < units.length; j++) expect(horizontalDistance(units[i].pos, units[j].pos)).toBeGreaterThan(1.4);
    }
  });

  it('replans a cached route promptly when the target changes', () => {
    const world = createWorld(481516, 2); world.obstacles = [];
    const u = unit(2, 0, 0);
    moveUnit(world, u, point(10, 0), [], 4, 1 / 60);
    const before = { ...u.pos };
    moveUnit(world, u, point(-10, 0), [], 4, 1 / 60);
    expect(u.pos.x).toBeLessThan(before.x);
  });

  it.each([481516, 20260913, 8675309])('places and replays units safely in the generated obstacles for seed %i', seed => {
    const world = createWorld(seed, 2), original = structuredClone(world);
    const origin = world.landmarks.find(l => l.kind === 'nest')!.pos;
    const start = openGround(world, origin, 3, 4), target = openGround(world, point(26, -15), 1, 3);
    expect(world).toEqual(original);
    expect(world.obstacles.every(o => horizontalDistance(start, o.pos) > o.radius + 1.3)).toBe(true);
    const a = { ...unit(3, start.x, start.z) }, b = structuredClone(a);
    let arrived = false;
    for (let frame = 0; frame < 2400 && !arrived; frame++) {
      const previous = { ...a.pos };
      arrived = moveUnit(world, a, target, [], 5, 1 / 60, .5);
      moveUnit(world, b, target, [], 5, 1 / 60, .5);
      expect(a).toEqual(b);
      expect(horizontalDistance(previous, a.pos)).toBeLessThanOrEqual(5 / 60 + .00002);
      expect(world.obstacles.every(o => horizontalDistance(a.pos, o.pos) >= o.radius + .72 - .00001)).toBe(true);
    }
    expect(arrived).toBe(true); expect(world).toEqual(original);
  });
});
