import { describe, expect, it } from 'vitest';
import { obstacleSegmentEntry, resolveObstacleMotion } from '../src/game/obstacle-geometry';
import { lineBlocked, feedTarget } from '../src/game/interactions';
import { steerToward } from '../src/game/navigation';
import { compositionCamera, keepCameraOutside, safeCameraPosition } from '../src/game/camera';
import { createWorld } from '../src/game/world';
import { createGame } from '../src/game/simulation';
import { distance, groundHeight } from '../src/game/random';
import type { Obstacle, Vec3, World } from '../src/game/types';

const p = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
function roof(radius = 4): Obstacle { return { id: 1, kind: 'rock', pos: p(0, 6), radius, height: 2 }; }
function world(obstacles: Obstacle[] = [roof()]): World {
  const w = createWorld(481516, 1); w.obstacles = obstacles; return w;
}

describe('finite cylinder segment contacts', () => {
  it('detects pure vertical crossings of both real caps', () => {
    const o = roof();
    expect(obstacleSegmentEntry(p(0, 2), p(0, 10), o)).toBeCloseTo(.5, 12);
    expect(obstacleSegmentEntry(p(0, 10), p(0, 2), o)).toBeCloseTo(.25, 12);
    expect(obstacleSegmentEntry(p(5, 2), p(5, 10), o)).toBeNull();
  });

  it('expands the bottom and top by body clearance and permits cap tangents', () => {
    const o = roof();
    expect(obstacleSegmentEntry(p(0, 2), p(0, 10), o, .5)).toBeCloseTo(3.5 / 8, 12);
    expect(obstacleSegmentEntry(p(0, 10), p(0, 2), o, .5)).toBeCloseTo(1.5 / 8, 12);
    expect(obstacleSegmentEntry(p(-6, 5.5), p(6, 5.5), o, .5)).toBeNull();
    expect(obstacleSegmentEntry(p(0, 5.5), p(0, 5.6), o, .5)).toBe(0);
  });

  it('does not treat the cylinder as an infinite wall above or below its body', () => {
    expect(obstacleSegmentEntry(p(-9, 3), p(9, 3), roof())).toBeNull();
    expect(obstacleSegmentEntry(p(-9, 11), p(9, 11), roof())).toBeNull();
    expect(obstacleSegmentEntry(p(-9, 7), p(9, 7), roof())).toBeCloseTo(5 / 18, 12);
  });

  it('permits an overlapping body to leave through its nearest cap or side without snapping', () => {
    const o = roof();
    expect(obstacleSegmentEntry(p(0, 6.1), p(0, 5), o)).toBeNull();
    expect(obstacleSegmentEntry(p(0, 7.9), p(0, 9), o)).toBeNull();
    expect(obstacleSegmentEntry(p(3.9, 7), p(5, 7), o)).toBeNull();
    expect(obstacleSegmentEntry(p(0, 6.1), p(0, 6.5), o)).toBe(0);
    expect(obstacleSegmentEntry(p(3.9, 7), p(2, 7), o)).toBe(0);
    expect(obstacleSegmentEntry(p(0, 7), p(0, 7), o)).toBe(0);
  });

  it('uses the whole diagonal interval, including a cap entered after the radial boundary', () => {
    expect(obstacleSegmentEntry(p(-5, 1), p(5, 11), roof())).toBeCloseTo(.5, 12);
    expect(obstacleSegmentEntry(p(-5, 1), p(5, 5), roof())).toBeNull();
  });
});

describe('continuous body movement around roofs', () => {
  it('stops ascent at the underside and descent at the top without moving horizontally', () => {
    const w = world(), before = JSON.stringify(w);
    expect(resolveObstacleMotion(w, p(0, 2), p(0, 12), .5)).toEqual(p(0, 5.5));
    expect(resolveObstacleMotion(w, p(0, 12), p(0, 1), .5)).toEqual(p(0, 8.5));
    expect(JSON.stringify(w)).toBe(before);
  });

  it('slides along the underside under sustained ascent and then escapes past its edge', () => {
    const w = world([roof(8)]), start = p(0, 4);
    const first = resolveObstacleMotion(w, start, p(3, 9, 2), .5);
    expect(first.x).toBeCloseTo(3, 12); expect(first.y).toBe(5.5); expect(first.z).toBe(2);
    let position = first;
    for (let frame = 0; frame < 180; frame++) {
      const next = p(position.x + .05, position.y + .05, position.z);
      const moved = resolveObstacleMotion(w, position, next, .5);
      expect(distance(position, moved)).toBeLessThanOrEqual(distance(position, next) + 1e-9);
      expect(obstacleSegmentEntry(moved, moved, w.obstacles[0], .5)).toBeNull();
      position = moved;
    }
    expect(position.x).toBeGreaterThan(11); expect(position.y).toBeGreaterThan(8.5);
  });

  it('slides around a side without tunnelling or gaining displacement', () => {
    const w = world(), from = p(-7, 7, -2), to = p(0, 7, 2);
    const result = resolveObstacleMotion(w, from, to, .5);
    expect(Math.hypot(result.x, result.z)).toBeGreaterThanOrEqual(4.5 - 1e-9);
    expect(result.z).toBeGreaterThan(from.z); expect(result.y).toBe(7);
    expect(distance(from, result)).toBeLessThanOrEqual(distance(from, to));
  });

  it('still blocks very short side and cap steps near resting contact', () => {
    const w = world();
    expect(resolveObstacleMotion(w, p(4.5000001, 7), p(4.4999999, 7), .5).x).toBeCloseTo(4.5, 12);
    expect(resolveObstacleMotion(w, p(0, 5.4999999), p(0, 5.5000001), .5).y).toBeCloseTo(5.5, 12);
  });

  it('handles a ceiling followed by a side contact independently of obstacle order', () => {
    const ceiling = roof(12), pillar: Obstacle = { id: 2, kind: 'coral', pos: p(5, -6), radius: 1.5, height: 12 };
    const w = world([ceiling, pillar]), a = p(0, 3), b = p(8, 10);
    const result = resolveObstacleMotion(w, a, b, .5);
    expect(result).toEqual(resolveObstacleMotion(world([pillar, ceiling]), a, b, .5));
    expect(result.y).toBeLessThanOrEqual(5.5); expect(result.x).toBeLessThanOrEqual(3);
    for (const obstacle of w.obstacles) expect(obstacleSegmentEntry(result, result, obstacle, .5)).toBeNull();
  });

  it('keeps the established microscopic endpoint projection even for a raised obstacle', () => {
    const w = world(); w.stage = 0;
    expect(resolveObstacleMotion(w, p(-7, 1.1), p(.1, 1.1), .5)).toEqual(p(4.5, 1.1));
  });
});

describe('shared physical affordances beneath a roof', () => {
  it('blocks a selected meal through a cap while allowing food under that same roof', () => {
    const s = createGame(481516, false); s.stage = 1; s.world = world([roof(8)]); s.worlds[1] = s.world;
    s.player.pos = p(0, 4.5); s.player.cooldown = 0;
    const r = { id: s.world.nextId++, kind: 'algae' as const, pos: p(0, 7), amount: 3, max: 3, patch: 0, regen: 0 };
    s.world.resources = [r]; s.world.creatures = [];
    expect(lineBlocked(s, s.player.pos, r.pos)).toBe(true);
    expect(feedTarget(s, { kind: 'food', id: r.id, stage: 1 })?.reason).toBe('blocked');
    r.pos = p(2, 4.5);
    expect(lineBlocked(s, s.player.pos, r.pos)).toBe(false);
    expect(feedTarget(s, { kind: 'food', id: r.id, stage: 1 })?.ready).toBe(true);
  });

  it('returns the direct waypoint through open water under a roof', () => {
    const w = world([roof(8)]), start = p(-12, 3), goal = p(12, 3);
    expect(steerToward(w, start, goal, .5, Math.PI / 2)).toEqual(goal);
  });

  it('actively descends under a broad roof when that route is shorter than going around or above', () => {
    const w = world([{ ...roof(8), height: 4 }]), target = p(12, 7);
    let position = p(-12, 7), velocity = p(0, 0), heading = Math.PI / 2, minimumY = position.y;
    for (let frame = 0; frame < 1200 && distance(position, target) > .1; frame++) {
      if (frame % 30 === 0) {
        const waypoint = steerToward(w, position, target, .5, heading), gap = distance(position, waypoint);
        const scale = gap > 1e-9 ? Math.min(3.8, gap / .5) / gap : 0;
        velocity = p((waypoint.x - position.x) * scale, (waypoint.y - position.y) * scale, (waypoint.z - position.z) * scale);
      }
      const next = p(position.x + velocity.x / 60, position.y + velocity.y / 60, position.z + velocity.z / 60);
      const moved = resolveObstacleMotion(w, position, next, .5);
      expect(distance(position, moved)).toBeLessThanOrEqual(3.8 / 60 + 1e-8);
      expect(obstacleSegmentEntry(moved, moved, w.obstacles[0], .5)).toBeNull();
      expect(moved.y).toBeGreaterThanOrEqual(groundHeight(moved.x, moved.z, 1) + 1.3);
      expect(moved.y).toBeLessThanOrEqual(7 + 1e-8);
      minimumY = Math.min(minimumY, moved.y); position = moved;
      if (Math.hypot(velocity.x, velocity.z) > .01) heading = Math.atan2(velocity.x, velocity.z);
    }
    expect(distance(position, target)).toBeLessThan(.11); expect(minimumY).toBeLessThan(5.5);
  });

  it('keeps a purely vertical camera request below a real ceiling', () => {
    const w = world([roof(20)]), focus = p(0, 3);
    for (const eye of [safeCameraPosition(focus, p(0, 15), w), keepCameraOutside(p(0, 15), focus, w)]) {
      expect(eye.y).toBeGreaterThan(focus.y); expect(eye.y).toBeLessThanOrEqual(5.25);
      expect(obstacleSegmentEntry(focus, eye, w.obstacles[0], .7)).toBeNull();
    }
  });

  it('keeps every orbit bearing under the roof without lifting the eye through the solid', () => {
    const w = world([roof(30)]), focus = p(0, 3), before = JSON.stringify(w);
    for (const yaw of [0, .8, 1.6, 2.4, 3.2, 4, 4.8, 5.6]) {
      const eye = compositionCamera(focus, yaw, .55, 13, w);
      expect(eye.y).toBeLessThanOrEqual(5.25); expect(eye.y).toBeGreaterThan(focus.y);
      expect(obstacleSegmentEntry(focus, eye, w.obstacles[0], .7)).toBeNull();
      expect(Math.hypot(eye.x - focus.x, eye.z - focus.z)).toBeGreaterThan(5);
    }
    expect(JSON.stringify(w)).toBe(before);
  });

  it.each([1.2, 1.4])('keeps a near-ceiling visual focus at y%i from bypassing the camera padding', focusY => {
    const slab: Obstacle = { id: 1, kind: 'rock', pos: p(0, 1.5), radius: 30, height: 1.4 };
    const w = world([slab]), focus = p(0, focusY), desired = p(0, focusY + 10, 12);
    for (const eye of [compositionCamera(focus, 0, .55, 13, w), keepCameraOutside(desired, focus, w), safeCameraPosition(focus, desired, w)]) {
      expect(eye.y).toBeLessThanOrEqual(.75); expect(Object.values(eye).every(Number.isFinite)).toBe(true);
      expect(eye.y).toBeGreaterThan(groundHeight(eye.x, eye.z, 1) + .75);
      expect(obstacleSegmentEntry(focus, eye, slab)).toBeNull();
      expect(obstacleSegmentEntry(eye, eye, slab, .75)).toBeNull();
    }
  });
});
