import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { obstacleSegmentEntry, resolveObstacleMotion } from '../src/game/obstacle-geometry';
import { parseGame, serializeGame } from '../src/game/persistence';
import { step } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { distance, horizontalDistance } from '../src/game/random';
import { EMPTY_INPUT, type Obstacle, type Vec3, type World } from '../src/game/types';

const stuck: Vec3 = { x: 25.41922383779647, y: -4.161431692349636, z: -14.7954226172564 };
const pillar: Obstacle = { id: 185, kind: 'rock', pos: { x: 24, y: -5.539961530810736, z: -16.95 }, radius: 1.9, height: 7.039961530810736 };
const body = .68;
function world(obstacles: Obstacle[]) { const w = createWorld(481516, 1); w.obstacles = obstacles; return w; }
function clear(w: World, p: Vec3, radius: number) {
  for (const o of w.obstacles) if (p.y > o.pos.y - radius + 1e-8 && p.y < o.pos.y + o.height + radius - 1e-8)
    expect(horizontalDistance(p, o.pos), `obstacle ${o.id}`).toBeGreaterThanOrEqual(o.radius + radius - 1e-8);
}
function native(name: string) { return parseGame(readFileSync(new URL(`./fixtures/saves/${name}.json`, import.meta.url), 'utf8')); }

describe('a recorded cylinder-side contact preserves tangential and vertical movement', () => {
  it('slides the native west/up request along the pillar instead of discarding its climb at the second contact', () => {
    const w = world([pillar]), desired = { x: stuck.x - .1, y: stuck.y + .07, z: stuck.z };
    expect(obstacleSegmentEntry(stuck, desired, pillar, body)).not.toBeNull();
    const actual = resolveObstacleMotion(w, stuck, desired, body);
    expect(actual.y).toBeCloseTo(desired.y, 12);
    expect(actual.x).toBeLessThan(stuck.x - .03); expect(actual.z).toBeGreaterThan(stuck.z + .02);
    expect(distance(stuck, actual)).toBeGreaterThan(.08); expect(distance(stuck, actual)).toBeLessThanOrEqual(distance(stuck, desired));
    clear(w, actual, body);
  });

  it('slides a northward request around the same real side and permits outward or vertical escape', () => {
    const w = world([pillar]);
    const north = resolveObstacleMotion(w, stuck, { ...stuck, z: stuck.z - .1 }, body);
    expect(north.x).toBeGreaterThan(stuck.x + .02); expect(north.z).toBeLessThan(stuck.z - .02); clear(w, north, body);
    for (const desired of [{ ...stuck, y: stuck.y + .07 }, { ...stuck, x: stuck.x + .1 }])
      expect(resolveObstacleMotion(w, stuck, desired, body)).toEqual(desired);
  });

  it('still stops exact inward movement and a complete crossing at the cylinder boundary', () => {
    const w = world([pillar]), surface = { x: pillar.pos.x + pillar.radius + body, y: -3, z: pillar.pos.z };
    expect(resolveObstacleMotion(w, surface, { ...surface, x: surface.x - .1 }, body)).toEqual(surface);
    const crossing = resolveObstacleMotion(w, { ...surface, x: 30 }, { ...surface, x: 20 }, body);
    expect(crossing.x).toBeCloseTo(surface.x, 12); clear(w, crossing, body);
    expect(obstacleSegmentEntry(surface, { ...surface, x: surface.x - .000001 }, pillar, body)).toBe(0);
  });

  it('preserves roof underside/top contact, including a genuinely entering diagonal at the lip', () => {
    const roof: Obstacle = { id: 1, kind: 'rock', pos: { x: 0, y: 2, z: 0 }, radius: 4, height: 1 };
    const w = world([roof]);
    expect(resolveObstacleMotion(w, { x: 0, y: 0, z: 0 }, { x: 0, y: 8, z: 0 }, .6)).toEqual({ x: 0, y: 1.4, z: 0 });
    expect(resolveObstacleMotion(w, { x: 0, y: 8, z: 0 }, { x: 0, y: 0, z: 0 }, .6).y).toBeCloseTo(3.6, 12);
    const lip = resolveObstacleMotion(w, { x: 4.7, y: 2.5, z: 0 }, { x: 4, y: 2.6, z: 0 }, .6);
    expect(lip.x).toBeCloseTo(4.6, 12); expect(lip.y).toBeCloseTo(2.6, 12); clear(w, lip, .6);
    const tangent = { x: 4.6, y: 8, z: 0 };
    expect(resolveObstacleMotion(w, { ...tangent, y: 0 }, tangent, .6)).toEqual(tangent);
  });

  it('ignoring one tangent never skips a second wall or permits passage through a blocked corner', () => {
    const side: Obstacle = { id: 1, kind: 'rock', pos: { x: 0, y: 0, z: 0 }, radius: 1, height: 3 };
    const ahead: Obstacle = { id: 2, kind: 'rock', pos: { x: 1.5, y: 0, z: 3 }, radius: .5, height: 3 };
    const corridor = world([side, ahead]);
    const stopped = resolveObstacleMotion(corridor, { x: 1.5, y: 1, z: 0 }, { x: 1.5, y: 1, z: 5 }, .5);
    expect(stopped).toEqual({ x: 1.5, y: 1, z: 2 }); clear(corridor, stopped, .5);
    const corner = world([{ ...side, pos: { x: -2, y: 0, z: 0 }, radius: 2 }, { ...ahead, pos: { x: 2, y: 0, z: 0 }, radius: 2 }]);
    const result = resolveObstacleMotion(corner, { x: 0, y: 1, z: 4 }, { x: 0, y: 1, z: -4 }, .5);
    expect(result.z).toBeGreaterThanOrEqual(1.5 - 1e-8); clear(corner, result, .5);
  });
});

describe('full public-input continuation of native canopy exports', () => {
  it('replays recorded ecology01–06 controls without the western pillar freezing A+Q and W', () => {
    // Native wall-clock key durations are mapped to nominal60Hz inputs. No
    // fixture state/geometry changes occur after this authentic save is read.
    const s = native('worker-second-retreat'), loaded = parseGame(serializeGame(s));
    const controls = [[-1, 0, 0, 108], [-1, 0, 0, 78], [0, -1, 0, 96], [-1, 0, 1, 138], [0, -1, 0, 96], [1, 0, 0, 78]];
    const legs: { start: Vec3; end: Vec3; maximumStill: number; moved: number }[] = [];
    for (const [x, z, vertical, frames] of controls) {
      const start = { ...s.player.pos }; let maximumStill = 0, still = 0, moved = 0;
      for (let frame = 0; frame < frames; frame++) {
        const previous = { ...s.player.pos }, input = { ...EMPTY_INPUT, x, z, vertical };
        step(s, input); step(loaded, input);
        const d = distance(previous, s.player.pos); moved += d;
        still = d < 1e-6 ? still + 1 : 0; maximumStill = Math.max(maximumStill, still);
        clear(s.world, s.player.pos, body);
      }
      legs.push({ start, end: { ...s.player.pos }, maximumStill, moved });
    }
    expect(legs[3].moved).toBeGreaterThan(10); expect(legs[3].end.y - legs[3].start.y).toBeGreaterThan(5);
    expect(legs[3].maximumStill).toBe(0); expect(legs[4].moved).toBeGreaterThan(8); expect(legs[4].maximumStill).toBe(0);
    expect(s.deathReason).toBeNull(); expect(loaded).toEqual(s); expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('retains ordinary Q escape through the real open chimney without an additional current or widened roof', () => {
    const s = native('worker-open-chimney-contact'), radius = Math.max(.6, s.player.genome.width * .8);
    const obstacles = structuredClone(s.world.obstacles); let above = false;
    for (let frame = 0; frame < 180; frame++) {
      step(s, { ...EMPTY_INPUT, vertical: 1 }); clear(s.world, s.player.pos, radius);
      above ||= s.player.pos.y > 2.9 + radius;
    }
    expect(above).toBe(true); expect(s.player.pos.y).toBeGreaterThan(10);
    expect(s.world.obstacles).toEqual(obstacles); expect(s.deathReason).toBeNull();
  });
});
