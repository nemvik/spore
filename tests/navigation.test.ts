import { describe, expect, it } from 'vitest';
import { steerToward } from '../src/game/navigation';
import { createWorld } from '../src/game/world';
import { createGame } from '../src/game/simulation';
import { distance, groundHeight } from '../src/game/random';
import type { Obstacle, Vec3, World } from '../src/game/types';

function world(stage: 0 | 1 | 2 = 0) {
  const result = createWorld(481516, stage); result.obstacles = []; return result;
}
function rock(w: World, x: number, z: number, radius = 1.5, top = 9) {
  const obstacle: Obstacle = { id: w.nextId++, kind: 'rock', pos: { x, y: -6, z }, radius, height: top + 6 };
  w.obstacles.push(obstacle); return obstacle;
}
const point = (x: number, z: number, y = 1.1): Vec3 => ({ x, y, z });

/** Actual numerical movement at 60 Hz, decisions at 2 Hz. No collision pushing,
 * teleporting or fixture relocation hides an unsafe steering result. */
function route(w: World, start: Vec3, target: Vec3, radius = .5, seconds = 25) {
  const pos = { ...start }, path = [{ ...pos }], speed = 3.8;
  let heading = Math.atan2(target.x - start.x, target.z - start.z), velocity = { x: 0, y: 0, z: 0 };
  for (let frame = 0; frame < seconds * 60 && distance(pos, target) > .1; frame++) {
    if (frame % 30 === 0) {
      const waypoint = steerToward(w, pos, target, radius, heading), d = distance(pos, waypoint);
      const scale = d > 1e-8 ? Math.min(speed, d / .5) / d : 0;
      velocity = { x: (waypoint.x - pos.x) * scale, y: (waypoint.y - pos.y) * scale, z: (waypoint.z - pos.z) * scale };
    }
    const before = { ...pos };
    pos.x += velocity.x / 60; pos.y += velocity.y / 60; pos.z += velocity.z / 60;
    if (Math.hypot(velocity.x, velocity.z) > .01) heading = Math.atan2(velocity.x, velocity.z);
    expect(Number.isFinite(pos.x + pos.y + pos.z)).toBe(true);
    expect(distance(pos, before)).toBeLessThanOrEqual(speed / 60 + 1e-8);
    for (const obstacle of w.obstacles) if (w.stage !== 1 || pos.y <= obstacle.pos.y + obstacle.height + radius) {
      expect(Math.hypot(pos.x - obstacle.pos.x, pos.z - obstacle.pos.z)).toBeGreaterThanOrEqual(obstacle.radius + radius - 1e-6);
    }
    if (w.stage === 1) { expect(pos.y).toBeLessThanOrEqual(12); expect(pos.y).toBeGreaterThanOrEqual(groundHeight(pos.x, pos.z, 1) + 1.3); }
    path.push({ ...pos });
  }
  return { pos, path };
}

describe('local body-aware NPC navigation', () => {
  it('returns an absolute direct waypoint without mutating the world or endpoints', () => {
    const w = world(), a = point(-3, -4), b = point(5, 7), before = structuredClone(w);
    expect(steerToward(w, a, b, .5, 0)).toEqual(b);
    expect(w).toEqual(before); expect(a).toEqual(point(-3, -4)); expect(b).toEqual(point(5, 7));
  });

  it('rounds a central rock with continuous motion and no corner overshoot', () => {
    const w = world(); rock(w, 0, 0, 2);
    const target = point(9, 0), result = route(w, point(-9, 0), target);
    expect(distance(result.pos, target)).toBeLessThan(.11);
    expect(Math.max(...result.path.map(p => Math.abs(p.z)))).toBeGreaterThan(2.5);
  });

  it('rounds a diagonal barrier made of adjacent rocks instead of alternating sides forever', () => {
    const w = world(); for (let i = -2; i <= 2; i++) rock(w, i * 1.7, i * 2.2, 1.7);
    const target = point(12, -7), result = route(w, point(-12, 7), target, .65);
    expect(distance(result.pos, target)).toBeLessThan(.11);
  });

  it('passes several successive obstacle clusters on repeated 2 Hz decisions', () => {
    const w = world();
    for (const [x, z] of [[-8, -1.2], [-8, 1.2], [0, 0], [6, -2], [6, .5], [12, 1]]) rock(w, x, z, 1.5);
    const target = point(20, 0), result = route(w, point(-18, 0), target, .7, 35);
    expect(distance(result.pos, target)).toBeLessThan(.11);
  });

  it('takes a narrow opening only when the whole body fits', () => {
    const w = world(); rock(w, 0, -2.3, 1.6); rock(w, 0, 2.3, 1.6);
    const start = point(-10, 0), target = point(10, 0);
    const narrow = route(w, start, target, .35), wide = route(w, start, target, 1.05);
    expect(distance(narrow.pos, target)).toBeLessThan(.11); expect(distance(wide.pos, target)).toBeLessThan(.11);
    expect(Math.max(...narrow.path.map(p => Math.abs(p.z)))).toBeLessThan(.01);
    expect(Math.max(...wide.path.map(p => Math.abs(p.z)))).toBeGreaterThan(4.9);
  });

  it('uses reef height when already above a coral, and can climb over a low broad coral', () => {
    const w = world(1); rock(w, 0, 0, 4.5, 3);
    const high = point(9, 0, 6);
    expect(steerToward(w, point(-9, 0, 6), high, .5, Math.PI / 2)).toEqual(high);
    const target = point(9, 0, 2), result = route(w, point(-9, 0, 2), target);
    expect(distance(result.pos, target)).toBeLessThan(.11);
    expect(Math.max(...result.path.map(p => p.y))).toBeGreaterThan(3.5);
  });

  it('routes beside a coral too high to safely cross under the water ceiling', () => {
    const w = world(1); rock(w, 0, 0, 2, 11.7);
    const target = point(8, 0, 6), result = route(w, point(-8, 0, 6), target, .7);
    expect(distance(result.pos, target)).toBeLessThan(.11);
    expect(Math.max(...result.path.map(p => Math.abs(p.z)))).toBeGreaterThan(2.7);
  });

  it('honors finite columns throughout an ascending segment, not only at its endpoint', () => {
    const w = world(1); rock(w, 0, 0, 2.2, 5);
    const target = point(8, 0, 10), result = route(w, point(-8, 0, 0), target, .5);
    expect(distance(result.pos, target)).toBeLessThan(.11);
  });

  it.each([481516, 20260913, 8675309])('reaches both authored garden refuges for seed %i', seed => {
    const s = createGame(seed, false), garden = s.journey.sites[0];
    for (const refuge of garden.refuges) expect(distance(route(s.world, garden.source, refuge, .39, 35).pos, refuge)).toBeLessThan(.11);
  });

  it('returns the same continuous path regardless of obstacle array order', () => {
    const w = world(); rock(w, 0, 0, 2); rock(w, 4, 3, 1.5);
    const reversed = structuredClone(w); reversed.obstacles.reverse();
    expect(route(w, point(-9, 0), point(10, 1)).path).toEqual(route(reversed, point(-9, 0), point(10, 1)).path);
  });

  it('can leave the collision margin using a short outward waypoint without a position snap', () => {
    const w = world(); rock(w, 0, 0, 2);
    const start = point(-2.55, 0), waypoint = steerToward(w, start, point(9, 0), .5, -Math.PI / 2);
    expect(start).toEqual(point(-2.55, 0)); expect(distance(start, waypoint)).toBeCloseTo(1);
    expect(Math.hypot(waypoint.x, waypoint.z)).toBeGreaterThan(2.55);
    expect(distance(route(w, start, point(9, 0), .5).pos, point(9, 0))).toBeLessThan(.11);
  });

  it('does not cut through a tiny obstacle when leaving its safety margin', () => {
    const w = world(); rock(w, 0, 0, .12);
    const target = point(2, 0), result = route(w, point(-.3, 0), target, .1);
    expect(distance(result.pos, target)).toBeLessThan(.11);
  });

  it('stays finite for identical points, invalid heading, and invalid numerical input', () => {
    const w = world(), start = point(0, 0);
    expect(steerToward(w, start, start, .5, Number.NaN)).toEqual(start);
    expect(steerToward(w, start, point(2, 4), .5, Number.NaN)).toEqual(point(2, 4));
    expect(steerToward(w, start, { x: Number.NaN, y: 1, z: 0 }, .5, 0)).toEqual(start);
  });

  it('respects the world boundary while finding a route around an edge obstacle', () => {
    const w = world(); rock(w, 75, 0, 2);
    const target = point(75, 9), result = route(w, point(75, -9), target, .7);
    expect(distance(result.pos, target)).toBeLessThan(.11);
    expect(result.path.every(p => Math.abs(p.x) <= 78 - .7 && Math.abs(p.z) <= 78 - .7)).toBe(true);
  });
});
