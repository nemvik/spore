import { describe, expect, it } from 'vitest';
import { authorVortex, vortexSourceAt } from '../src/game/journey-layout';
import { emptyJourney } from '../src/game/journey-types';
import type { EcologySite } from '../src/game/journey-types';
import { createGame, makeCheckpoint, step } from '../src/game/simulation';
import { initialGenome, cloneGenome } from '../src/game/genome';
import { journeyAction } from '../src/game/journey';
import { lineBlocked } from '../src/game/interactions';
import { horizontalDistance } from '../src/game/random';
import { parseGame, serializeGame } from '../src/game/persistence';
import type { GameState, Vec3 } from '../src/game/types';
import { EMPTY_INPUT } from '../src/game/types';

const local = (x: number, z: number): Vec3 => ({ x: 37 + x, y: 1.1, z: -20 + z });
function room(seed = 481516) {
  const state = createGame(seed, true), world = state.world;
  state.journey = emptyJourney();
  // Complete persistent catalogue; only the vortex receives geometry in this fixture.
  for (const patch of world.patches) {
    const source = { id: world.nextId++, kind: 'mineral' as const, pos: { ...patch.center }, amount: 12, max: 12, patch: patch.id, regen: .08 };
    world.resources.push(source);
    const site: EcologySite = { id: patch.id, stage: 0, patch: patch.id, source: { ...source.pos }, refuges: [{ ...source.pos }, { ...source.pos }], sourceId: source.id, plantedId: null, vitality: 100, observed: true, resolved: false, method: null, threatIds: [], phase: 1 };
    state.journey.sites.push(site);
  }
  const site = state.journey.sites[1];
  authorVortex(world, site);
  return { state, world, site };
}

function forBody(state: GameState, radius: number): GameState {
  // Same obstacle columns and shared production intersection function; expansion
  // accounts for the circular body used by simulation.constrain().
  return { ...state, world: { ...state.world, obstacles: state.world.obstacles.map(rock => ({ ...rock, radius: rock.radius + radius + .01 })) } };
}
function clearPoint(state: GameState, position: Vec3): boolean {
  return state.world.obstacles.every(rock => horizontalDistance(position, rock.pos) >= rock.radius);
}

/** Bounded half-metre grid checks topology, not a gameplay or timing claim. */
function routeLength(state: GameState, start: Vec3, target: Vec3): number {
  const spacing = .5, minX = 6, minZ = -51, width = 125;
  const index = (p: Vec3) => Math.round((p.z - minZ) / spacing) * width + Math.round((p.x - minX) / spacing);
  const position = (id: number): Vec3 => ({ x: minX + id % width * spacing, y: 1.1, z: minZ + Math.floor(id / width) * spacing });
  const visited = new Int32Array(width * width).fill(-1), origin = index(start), end = index(target);
  const queue = [origin]; visited[origin] = 0;
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]; if (current === end) return visited[current] * spacing;
    const x = current % width, z = Math.floor(current / width), from = position(current);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= width) continue;
      const next = nz * width + nx;
      if (visited[next] !== -1) continue;
      const to = position(next);
      if (!clearPoint(state, to) || lineBlocked(state, from, to)) continue;
      visited[next] = visited[current] + 1; queue.push(next);
    }
  }
  return Infinity;
}

describe('authored vortex crossing topology', () => {
  it.each([481516, 1, 20260913])('keeps a small western crossing and a longer viable broad-body route for seed %i', seed => {
    const { state } = room(seed), small = forBody(state, .8), broad = forBody(state, 1.8 * .8);
    const approach = local(-27, 0), inner = local(-8.5, 0);
    expect(lineBlocked(small, approach, inner)).toBe(false);
    expect(lineBlocked(broad, approach, inner)).toBe(true);
    const short = routeLength(small, approach, inner), long = routeLength(broad, approach, inner);
    expect(short).toBe(18.5);
    expect(Number.isFinite(long)).toBe(true);
    expect(long).toBeGreaterThan(short * 2);
    expect(long).toBeLessThan(125);
  });

  it('blocks the direct cross-room shortcut with the actual central obstacle', () => {
    const { state, site } = room();
    expect(lineBlocked(state, site.source, site.refuges[0])).toBe(true);
    expect(lineBlocked(forBody(state, 1.44), local(13.2, 0), local(8.5, 0))).toBe(false);
  });

  it('physically admits the initial body but cannot push a broad body through the narrow seam', () => {
    const outcomes = [1, 1.8].map(width => {
      const { state } = room();
      // Isolate the production collision solver from moving actors and swirling
      // side currents; the same held input still uses ordinary simulation.step.
      state.journey.legacy = true; state.world.creatures = [];
      state.player.genome.width = width; state.player.pos = local(-27, 0); state.player.heading = Math.PI / 2;
      for (let frame = 0; frame < 600; frame++) step(state, { ...EMPTY_INPUT, x: 1 });
      return state.player.pos;
    });
    expect(outcomes[0].x).toBeGreaterThan(28);
    expect(outcomes[1].x).toBeLessThan(22);
    expect(Math.abs(outcomes[1].z + 20)).toBeLessThan(.2);
  });

  it('permits outer-lip sampling with a long mouth while the initial body must approach farther', () => {
    const { state } = room(); state.player.pos = local(13.2, 0);
    expect(journeyAction(state)).toMatchObject({ operation: 'take', ready: false });
    state.player.genome = cloneGenome(initialGenome());
    state.player.genome.parts.push({ id: 'long-mouth-fixture', kind: 'proboscis', axial: .92, angle: 0, scale: 1, mirrored: false });
    state.player.totalDna += 14;
    expect(journeyAction(state)).toMatchObject({ operation: 'take', ready: true });
  });

  it('keeps the entire moving-source orbit and both landing centres clear for the widest legal body', () => {
    const { state, site } = room(), broad = forBody(state, 1.44);
    for (let time = 0; time < 100; time += .125) expect(clearPoint(broad, vortexSourceAt(time)), `orbit at ${time}`).toBe(true);
    for (const refuge of site.refuges) expect(clearPoint(broad, refuge)).toBe(true);
    expect(site.refuges).toHaveLength(2);
    for (const refuge of site.refuges) expect(horizontalDistance(refuge, state.world.patches[1].center)).toBeLessThan(29);
  });

  it('makes one landing physically sheltered while leaving the other exposed to the existing current', () => {
    const { world, site } = room();
    const still = (position: Vec3) => world.obstacles.some(rock => horizontalDistance(position, rock.pos) < rock.radius + 2.3);
    expect(still(site.refuges[0])).toBe(true);
    expect(still(site.refuges[1])).toBe(false);
  });

  it('preserves the source, nursery, other-patch food, far scenery and deterministic RNG', () => {
    const { world, site } = room(), beforeRng = world.rng;
    const protectedFood = world.resources.filter(r => r.id === site.sourceId || r.patch !== 1 || horizontalDistance(r.pos, world.landmarks[0].pos) < 18).map(r => r.id);
    const far = { id: world.nextId++, kind: 'rock' as const, pos: local(-60, 0), radius: 2, height: 5 };
    world.obstacles.push(far);
    const embedded = { id: world.nextId++, kind: 'mineral' as const, pos: local(0, 0), amount: 4, max: 4, patch: 1, regen: .004 };
    world.resources.push(embedded);
    authorVortex(world, site);
    expect(world.rng).toBe(beforeRng);
    expect(world.obstacles).toContain(far);
    expect(world.resources.some(r => r.id === embedded.id)).toBe(false);
    expect(protectedFood.every(id => world.resources.some(r => r.id === id))).toBe(true);
    expect(world.resources.find(r => r.id === site.sourceId)?.pos).toEqual(site.source);
    expect(new Set([...world.resources, ...world.obstacles, ...world.creatures].map(o => o.id)).size).toBe(world.resources.length + world.obstacles.length + world.creatures.length);
  });

  it('does not author other sites or stages and persists the exact authored world', () => {
    const { state, world, site } = room(), before = JSON.stringify(world);
    authorVortex(world, { ...site, id: 0, patch: 0 });
    authorVortex({ ...world, stage: 1 }, { ...site, stage: 1 });
    expect(JSON.stringify(world)).toBe(before);
    makeCheckpoint(state);
    expect(parseGame(serializeGame(state)).world).toEqual(world);
  });
});
