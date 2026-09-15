import { describe, expect, it } from 'vitest';
import { authorReef, reefConditions } from '../src/game/reef-layout';
import { createWorld } from '../src/game/world';
import { createGame, step } from '../src/game/simulation';
import { emptyJourney } from '../src/game/journey-types';
import { SITE_STORIES } from '../src/game/journey-content';
import { groundHeight, horizontalDistance } from '../src/game/random';
import { lineBlocked } from '../src/game/interactions';
import { journeyAction } from '../src/game/journey';
import { cloneGenome, functionalProfile, initialGenome } from '../src/game/genome';
import type { EcologySite } from '../src/game/journey-types';
import type { GameState, Vec3, World } from '../src/game/types';
import { EMPTY_INPUT } from '../src/game/types';

function room(seed = 481516, author = true) {
  const state = createGame(seed, true); state.stage = 1; state.world = createWorld(seed, 1); state.worlds[1] = state.world; state.journey = emptyJourney();
  const w = state.world;
  for (const id of [3, 4, 5]) {
    const story = SITE_STORIES[id], source = { x: story.source[0], y: story.source[1], z: story.source[2] };
    const mother = { id: w.nextId++, kind: story.kind, pos: { ...source }, amount: 12, max: 12, patch: id - 3, regen: .08 }; w.resources.push(mother);
    const site: EcologySite = { id, stage: 1, patch: id - 3, source, refuges: story.refuges.map(([x, y, z]) => ({ x, y, z })), sourceId: mother.id, plantedId: null, vitality: 100, observed: false, resolved: false, method: null, threatIds: [], phase: 0 };
    state.journey.sites.push(site);
    // The caller already clears generic source/refuge approaches before authoring.
    w.obstacles = w.obstacles.filter(o => ![site.source, ...site.refuges].some(p => horizontalDistance(p, o.pos) < o.radius + 4));
  }
  if (author) authorReef(w, state.journey.sites);
  return { state, w, ribbons: state.journey.sites[1], vent: state.journey.sites[2] };
}

function pointClear(w: World, p: Vec3, radius = .8): boolean {
  return p.y >= groundHeight(p.x, p.z, 1) + 1.3 && p.y <= 12 && w.obstacles.every(o => p.y > o.pos.y + o.height + radius || horizontalDistance(p, o.pos) >= o.radius + radius);
}

/** Same finite-cylinder line test as interactions, expanded for the moving body. */
function bodyWorld(state: GameState, radius = .8): GameState {
  return { ...state, world: { ...state.world, obstacles: state.world.obstacles.map(o => ({ ...o, radius: o.radius + radius, height: o.height + radius - .2 })) } };
}
function clearRoute(state: GameState, points: Vec3[], radius = .8): boolean {
  const expanded = bodyWorld(state, radius);
  return points.every(p => pointClear(state.world, p, radius)) && points.slice(1).every((point, i) => !lineBlocked(expanded, points[i], point));
}
function length(points: Vec3[]): number { return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x-points[i].x, p.y-points[i].y, p.z-points[i].z), 0); }

/** Connectivity at breathing height plus an unobstructed vertical ascent witnesses
 * access to every real resource. This is geometry, not a player-speed benchmark. */
function reachableSurface(state: GameState) {
  const w = state.world, expanded = bodyWorld(state, 1.44);
  const min = -77, width = 155, total = width * width, free = new Uint8Array(total), visited = new Uint8Array(total);
  const index = (x: number, z: number) => (z-min) * width + x-min;
  for (let z = min; z <= 77; z++) for (let x = min; x <= 77; x++) free[index(x,z)] = pointClear(w, { x, y: 12, z }, 1.44) ? 1 : 0;
  const queue = new Int32Array(total), origin = index(0,0); let head = 0, tail = 1; queue[0] = origin; visited[origin] = 1;
  while (head < tail) {
    const current = queue[head++], x = current % width, z = Math.floor(current / width);
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x+dx, nz = z+dz; if (nx < 0 || nx >= width || nz < 0 || nz >= width) continue;
      const next = nz * width + nx; if (!free[next] || visited[next]) continue;
      if (lineBlocked(expanded, { x: x + min, y: 12, z: z + min }, { x: nx + min, y: 12, z: nz + min })) continue;
      visited[next] = 1; queue[tail++] = next;
    }
  }
  return (p: Vec3) => {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = Math.round(p.x) + dx, z = Math.round(p.z) + dz; if (x >= min && x <= 77 && z >= min && z <= 77 && visited[index(x,z)] && !lineBlocked(expanded, { x, y: 12, z }, { ...p, y: 12 })) return true; }
    return false;
  };
}

describe('authored three-dimensional reef routes', () => {
  it.each([481516, 20260913, 8675309])('preserves resources and a reachable surface connection for every source/refuge/meal on seed %i', seed => {
    const { state, w, ribbons, vent } = room(seed, false), beforeRng = w.rng, before = new Map(w.resources.map(r => [r.id, { kind: r.kind, amount: r.amount, max: r.max, regen: r.regen }]));
    authorReef(w, state.journey.sites);
    expect(w.rng).toBe(beforeRng); expect(w.resources).toHaveLength(before.size);
    const reachable = reachableSurface(state);
    for (const resource of w.resources) {
      expect({ kind: resource.kind, amount: resource.amount, max: resource.max, regen: resource.regen }).toEqual(before.get(resource.id));
      expect(pointClear(w, resource.pos, 1.44), `food ${resource.id}`).toBe(true); expect(reachable(resource.pos), `surface over ${resource.id}`).toBe(true);
      expect(clearRoute(state, [resource.pos, { ...resource.pos, y: 12 }], 1.44)).toBe(true);
    }
    for (const site of [ribbons, vent]) {
      expect(site.source.y).toBeLessThan(0); expect(w.resources.find(r => r.id === site.sourceId)!.pos).toEqual(site.source); expect(site.refuges).toHaveLength(2);
      for (const p of [site.source, ...site.refuges]) { expect(pointClear(w, p, 1.44)).toBe(true); expect(reachable(p)).toBe(true); }
    }
    expect(w.obstacles.length).toBeLessThan(100);
    const ids = [...w.obstacles, ...w.resources, ...w.creatures].map(item => item.id); expect(new Set(ids).size).toBe(ids.length); expect(w.nextId).toBeGreaterThan(Math.max(...ids));
  });

  it('makes low baffles crossable above their real tops while tall pinnacles retain horizontal choices', () => {
    const { state, w } = room();
    expect(clearRoute(state, [{ x: 26, y: 0, z: -33 }, { x: 37, y: 0, z: -33 }])).toBe(false);
    expect(clearRoute(state, [{ x: 26, y: 5.5, z: -33 }, { x: 37, y: 5.5, z: -33 }])).toBe(true);
    expect(clearRoute(state, [{ x: 0, y: 0, z: 23 }, { x: 0, y: 0, z: 35 }])).toBe(false);
    expect(clearRoute(state, [{ x: 0, y: 4.2, z: 23 }, { x: 0, y: 4.2, z: 35 }])).toBe(true);
    expect(w.obstacles.some(o => o.pos.y + o.height > 12)).toBe(true);
    expect(new Set(w.obstacles.map(o => Math.round(o.pos.y + o.height))).size).toBeGreaterThan(7);
  });

  it('lets the same held input cross a real low terrace only after the body ascends above it', () => {
    const endings = [0, 5.5].map(y => {
      const { state } = room(); state.world.creatures = []; state.journey.legacy = true;
      state.player.pos = { x: 26, y, z: -33 }; state.player.heading = Math.PI / 2;
      // Isolate the production collision solver and held movement from living
      // hazards; the two bodies have identical shape and steering inputs.
      for (let frame = 0; frame < 360; frame++) step(state, { ...EMPTY_INPUT, x: 1 });
      return state.player.pos;
    });
    expect(endings[0].x).toBeLessThan(27); expect(endings[1].x).toBeGreaterThan(39);
    expect(Math.abs(endings[0].z + 33)).toBeLessThan(.1);
  });

  it.each([481516, 20260913, 8675309])('offers a short submerged gorge and a longer clear surface/flank route for seed %i', seed => {
    const { state, vent } = room(seed), source = vent.source;
    const deep = [{ x: 0, y: 11.4, z: 15 }, { x: 0, y: 4.2, z: 23 }, { x: 0, y: 4.2, z: 35 }, source];
    const covered = [{ x: 0, y: 11.4, z: 15 }, { x: -11, y: 11.4, z: 20 }, { x: -11, y: 11.4, z: 49 }, { x: -9, y: -1, z: 51 }, { x: 0, y: -1, z: 51 }, source];
    expect(clearRoute(state, deep)).toBe(true); expect(clearRoute(state, covered)).toBe(true);
    expect(length(covered)).toBeGreaterThan(length(deep) * 1.7); expect(length(deep)).toBeLessThan(36); expect(length(covered)).toBeLessThan(85);
    // The alternate route spends its long traverse above the hazardous water.
    for (const p of covered.slice(0, 3)) expect(reefConditions(state.world, p).oxygenUse).toBe(0);
  });
});

describe('reef conditions preserve baseline respiration and make anatomy useful locally', () => {
  it('is pure and neutral outside an authored hazard, above water, below seabed and in other stages', () => {
    const { w, vent } = room(), before = JSON.stringify(w), zero = { oxygenUse: 0, flow: { x: 0, y: 0, z: 0 } };
    for (const p of [{ x: 0, y: 1, z: 0 }, { x: -37, y: 1, z: -20 }, { ...vent.source, y: 10.5 }, { ...vent.source, y: -50 }, { x: NaN, y: 0, z: 0 }]) expect(reefConditions(w, p)).toEqual(zero);
    expect(reefConditions(createWorld(481516, 1), vent.source)).toEqual(zero);
    for (const stage of [0, 2] as const) expect(reefConditions({ ...w, stage }, vent.source)).toEqual(zero);
    expect(JSON.stringify(w)).toBe(before);
  });

  it('keeps still pockets beside actual finite columns but does not cast their shelter upward', () => {
    const { w } = room(), column = w.obstacles.find(o => o.pos.x === 0 && o.pos.z === 29)!;
    const beside = { x: column.pos.x, y: 0, z: column.pos.z + column.radius + 1 }, above = { ...beside, y: 4 };
    const without = { ...w, obstacles: w.obstacles.filter(o => o.id !== column.id) };
    expect(reefConditions(w, beside).oxygenUse).toBeLessThan(reefConditions(without, beside).oxygenUse * .5);
    expect(reefConditions(w, above)).toEqual(reefConditions(without, above));
    expect(reefConditions(w, { x: column.pos.x, y: 0, z: column.pos.z })).toEqual({ oxygenUse: 0, flow: { x: 0, y: 0, z: 0 } });
  });

  it('lets bladder thrust oppose the exhalation while the basic body always has a weaker outer approach', () => {
    const { w, vent } = room(); w.time = Math.PI / 2 / .55;
    const core = reefConditions(w, vent.source), ordinary = functionalProfile(initialGenome()), buoyant = cloneGenome(initialGenome());
    buoyant.parts.push({ id: 'buoyancy', kind: 'bladder', axial: 0, angle: 0, scale: 1, mirrored: false });
    expect(core.flow.y).toBeGreaterThan(ordinary.verticalThrust); expect(core.flow.y).toBeLessThan(functionalProfile(buoyant).verticalThrust);
    const outer = reefConditions(w, { ...vent.source, z: vent.source.z + 11 }); expect(Math.abs(outer.flow.y)).toBeLessThan(ordinary.verticalThrust);
    w.time = 3 * Math.PI / 2 / .55; expect(reefConditions(w, vent.source).flow.y).toBeLessThan(0);
  });

  it('lets a long mouth sample from safer upper water and gills offset most deep oxygen loss', () => {
    const { state, w, vent } = room(); vent.observed = true; state.journey.sites.filter(site => site.id !== 5).forEach(site => { site.resolved = true; });
    // This checks mother-culture reach, independently of collectible food nearby.
    w.resources = w.resources.filter(r => state.journey.sites.some(site => site.stage === 1 && site.sourceId === r.id));
    state.player.pos = { ...vent.source, y: vent.source.y + 4.55 }; state.player.cooldown = 0;
    expect(journeyAction(state)).toMatchObject({ operation: 'take', ready: false });
    state.player.genome.parts.push({ id: 'long-mouth', kind: 'proboscis', axial: .92, angle: 0, scale: 1, mirrored: false });
    expect(journeyAction(state)).toMatchObject({ operation: 'take', ready: true });
    w.time = Math.PI / 2 / .55;
    expect(reefConditions(w, state.player.pos).oxygenUse).toBeLessThan(reefConditions(w, vent.source).oxygenUse * .6);
    const gilled = cloneGenome(initialGenome()); gilled.parts.push({ id: 'gills', kind: 'gills', axial: 0, angle: 0, scale: 1, mirrored: false });
    expect(functionalProfile(gilled).gillExchange).toBeGreaterThan(reefConditions(w, vent.source).oxygenUse * .85);
    expect(reefConditions(w, vent.source).oxygenUse).toBeGreaterThan(5);
  });

  it('keeps all phase/position samples finite and bounded', () => {
    const { w } = room();
    for (let phase = 0; phase < 12; phase++) { w.time = phase; for (const patch of [1, 2]) { const center = w.patches[patch].center; for (let x = -24; x <= 24; x += 4) for (let z = -24; z <= 24; z += 4) for (const y of [-3, 1, 5, 9, 11]) {
      const condition = reefConditions(w, { x: center.x + x, y, z: center.z + z }); expect(Number.isFinite(condition.oxygenUse + condition.flow.x + condition.flow.y + condition.flow.z)).toBe(true); expect(condition.oxygenUse).toBeGreaterThanOrEqual(0); expect(condition.oxygenUse).toBeLessThanOrEqual(6.6 + 1e-9); expect(Math.hypot(condition.flow.x, condition.flow.y, condition.flow.z)).toBeLessThanOrEqual(4.4);
    } } }
  });
});

describe('fresh-stage authoring lifecycle', () => {
  it('is idempotent and persists through a plain world/site round trip', () => {
    const { w, state, vent } = room(), before = JSON.stringify({ w, sites: state.journey.sites }); authorReef(w, state.journey.sites);
    expect(JSON.stringify({ w, sites: state.journey.sites })).toBe(before);
    const restored = JSON.parse(before) as { w: World; sites: EcologySite[] };
    expect(reefConditions(restored.w, vent.source)).toEqual(reefConditions(w, vent.source)); authorReef(restored.w, restored.sites); expect(JSON.stringify(restored)).toBe(before);
  });

  it('leaves other stages and already-played sites unchanged', () => {
    const { w, state } = room(481516, false); state.journey.sites.forEach(site => { site.observed = true; }); const before = JSON.stringify(w);
    authorReef(w, state.journey.sites); expect(JSON.stringify(w)).toBe(before);
    for (const stage of [0, 2] as const) { const other = createWorld(481516, stage), original = JSON.stringify(other); authorReef(other, state.journey.sites); expect(JSON.stringify(other)).toBe(original); }
  });
});
