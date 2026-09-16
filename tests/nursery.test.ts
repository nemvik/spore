import type { WorldStage as Stage } from '../src/game/stage';
import { describe, expect, it } from 'vitest';
import { awakenNursery, nurseryFood, nurserySpecies } from '../src/game/nursery';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { initializeJourneyStage } from '../src/game/journey';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createWorld, spawnCreature, WORLD_BOUND } from '../src/game/world';
import { speciesById } from '../src/game/content';
import { speciesGroundClearance } from '../src/game/anatomy';
import { genomeCost, initialGenome } from '../src/game/genome';
import { distance, groundHeight, horizontalDistance } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
import type { FoodKind, GameState, Resource, } from '../src/game/types';

/** Explicit local-extinction scenes, not a played campaign. Actual retained
 * source/canopy records remain intact unless a geometry test says otherwise. */
function scene(id = 0) {
  const s = createGame(20260913, false), stage = Math.floor(id / 3) as Stage;
  for (let next = 1; next <= stage; next++) {
    s.stage = next as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.world.stage] = s.world;
    initializeJourneyStage(s);
  }
  const site = s.journey.sites.find(site => site.id === id)!;
  site.observed = true; site.phase = 1;
  const species = id === 0 ? 'veil' : stage === 1 ? 'sail' : id === 8 ? 'gloom' : 'bell';
  s.world.creatures = s.world.creatures.filter(c => c.patch !== site.patch || c.species !== species);
  const mother = s.world.resources.find(r => r.id === site.sourceId)!;
  if (id === 4) {
    const canopy = s.journey.canopy!; canopy.releasedAt = 0;
    s.world.resources.find(r => r.id === canopy.crustId)!.amount = 0;
    s.world.obstacles = s.world.obstacles.filter(o => o.id !== canopy.capId);
  }
  if (stage === 2) {
    // Real evolution replaces the genome; preserve that cache identity contract.
    s.player.genome = structuredClone(s.player.genome);
    s.player.genome.parts.push(
      { id: 'nursery-legs', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: false },
      { id: 'nursery-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
    );
    s.player.totalDna = 100; s.player.dna = genomeCost(initialGenome()) + 100 - genomeCost(s.player.genome);
  }
  s.player.pos = { ...s.world.landmarks[0].pos }; s.checkpoint = null;
  return { s, site, mother, species };
}

function food(s: GameState, kind: FoodKind, x: number, y: number, z: number, amount = 1): Resource {
  const resource: Resource = { id: s.world.nextId++, kind, pos: { x, y, z }, amount, max: amount, regen: 0, patch: 0 };
  s.world.resources.push(resource); return resource;
}

function isolated(id = 0) {
  const fixture = scene(id), { s, site, mother } = fixture;
  s.world.obstacles = []; s.world.creatures = []; s.world.resources = [mother];
  site.source = { x: 0, y: s.stage === 0 ? 1.1 : s.stage === 1 ? 0 : groundHeight(0, 0, 2) + 1.2, z: 0 };
  mother.pos = { ...site.source }; s.player.pos = { x: -10, y: site.source.y, z: 0 };
  return fixture;
}

describe('explicit food-funded local nurseries', () => {
  it.each([0, 3, 4, 6, 7, 8])('restores site %i with one actual hungry local animal and no ecological completion', id => {
    const { s, site, mother, species } = scene(id), beforeJourney = structuredClone(s.journey), beforePlayer = structuredClone(s.player);
    const births = s.world.births, nextId = s.world.nextId, amount = mother.amount;
    expect(nurserySpecies(s, site)).toBe(species); expect(nurseryFood(s, site)).toBe(mother);
    expect(awakenNursery(s, site)).toBe(true);
    const child = s.world.creatures.find(c => c.id === nextId)!;
    expect(child).toMatchObject({ species, patch: site.patch, hunger: 70, health: 32, age: 0, velocity: { x: 0, y: 0, z: 0 } });
    expect(distance(child.pos, site.source)).toBeLessThan(5);
    expect(mother.amount).toBe(amount - 1); expect(s.world.births).toBe(births + 1); expect(s.world.nextId).toBe(nextId + 1);
    expect(s.journey).toEqual(beforeJourney); expect(s.player).toEqual(beforePlayer);
    const after = structuredClone(s);
    expect(nurserySpecies(s, site)).toBeNull(); expect(awakenNursery(s, site)).toBe(false); expect(s).toEqual(after);
  });

  it('prioritizes a previously debited compatible ordinary portion and clears only that cargo', () => {
    const { s, site, mother } = scene(3), amount = mother.amount;
    s.journey.cargo = { purpose: 'food', kind: 'algae', site: 3, vitality: 100, distance: 12 };
    expect(nurseryFood(s, site)).toBe('carried'); expect(awakenNursery(s, site)).toBe(true);
    expect(s.journey.cargo).toBeNull(); expect(mother.amount).toBe(amount);
  });

  it('keeps a living final culture intact while a real mother portion funds its carrier', () => {
    const { s, site, mother } = scene(8);
    s.journey.cargo = { purpose: 'culture', kind: 'detritus', site: 8, vitality: 76, distance: 9 };
    const cargo = structuredClone(s.journey.cargo), amount = mother.amount;
    expect(nurseryFood(s, site)).toBe(mother); expect(awakenNursery(s, site)).toBe(true);
    expect(s.journey.cargo).toEqual(cargo); expect(mother.amount).toBe(amount - 1);
  });

  it('does not turn an incompatible carried meal into compatible nursery food', () => {
    const { s, site, mother } = isolated(); mother.amount = 0;
    s.journey.cargo = { purpose: 'food', kind: 'meat', site: 0, vitality: 100, distance: 0 };
    const before = structuredClone(s);
    expect(nurseryFood(s, site)).toBeNull(); expect(awakenNursery(s, site)).toBe(false); expect(s).toEqual(before);
  });

  it('uses the mother before other food, then actual compatible reachable resource IDs', () => {
    const { s, site, mother } = isolated();
    const first = food(s, 'algae', 2.8, 1.1, 0), second = food(s, 'algae', -1, 1.1, 0);
    food(s, 'meat', 0, 1.1, .2); food(s, 'algae', 0, 1.1, 4.01);
    expect(nurseryFood(s, site)).toBe(mother); mother.amount = .99;
    expect(nurseryFood(s, site)).toBe(first);
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 1.4, y: -8, z: 0 }, radius: .5, height: 1 });
    expect(nurseryFood(s, site)).toBe(second); // The microscopic column fills its movement plane.
    expect(awakenNursery(s, site)).toBe(true); expect(second.amount).toBe(0); expect(first.amount).toBe(1);
  });

  it('does not mistake animals elsewhere or dead local bodies for a living local population', () => {
    const { s, site, species } = scene();
    const elsewhere = spawnCreature(s.world, species, 1), dead = spawnCreature(s.world, species, site.patch);
    dead.health = 0; s.world.creatures.push(elsewhere, dead);
    expect(nurserySpecies(s, site)).toBe(species); expect(awakenNursery(s, site)).toBe(true);
    expect(s.world.creatures.filter(c => c.species === species && c.patch === site.patch && c.health > 0)).toHaveLength(1);
  });

  it.each(['unobserved', 'another stage', 'unrelated site', 'old version', 'legacy', 'won', 'unreleased canopy', 'live local animal', 'dead player'] as const)
  ('rejects %s without consuming food, IDs or RNG', mode => {
    const { s, site } = scene(mode === 'unreleased canopy' ? 4 : 0);
    if (mode === 'unobserved') site.observed = false;
    if (mode === 'another stage') s.stage = 1;
    if (mode === 'unrelated site') site.id = 1;
    if (mode === 'old version') { s.journey.version = 2; delete s.journey.canopy; }
    if (mode === 'legacy') s.journey.legacy = true;
    if (mode === 'won') s.campaign.won = true;
    if (mode === 'unreleased canopy') s.journey.canopy!.releasedAt = null;
    if (mode === 'live local animal') s.world.creatures.push(spawnCreature(s.world, 'veil', site.patch));
    if (mode === 'dead player') s.player.health = 0;
    const before = structuredClone(s);
    expect(nurserySpecies(s, site)).toBeNull(); expect(nurseryFood(s, site)).toBeNull();
    expect(awakenNursery(s, site)).toBe(false); expect(s).toEqual(before);
  });

  it('preserves the world ceiling even when the requested species is locally extinct', () => {
    const { s, site } = scene();
    while (s.world.creatures.length < 48) s.world.creatures.push(spawnCreature(s.world, 'lantern', 2));
    const before = structuredClone(s);
    expect(awakenNursery(s, site)).toBe(false); expect(s).toEqual(before);
  });

  it('accepts space below and above finite roofs, but never spends a meal inside solid cover', () => {
    for (const y of [0, 4]) {
      const { s, site, mother } = isolated(3); site.source.y = mother.pos.y = y;
      s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 0, y: 1.5, z: 0 }, radius: 9, height: 1.4 });
      expect(awakenNursery(s, site)).toBe(true); expect(s.world.creatures[0].pos.y).toBe(y);
    }
    const { s, site } = isolated(3);
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 0, y: -2, z: 0 }, radius: 9, height: 5 });
    const before = structuredClone(s);
    expect(awakenNursery(s, site)).toBe(false); expect(s).toEqual(before);
  });

  it.each([0, 3, 6])('keeps site %i offspring inside bounds and at actual terrain clearance', id => {
    const { s, site, mother } = isolated(id);
    site.source.x = mother.pos.x = WORLD_BOUND - .1;
    if (s.stage === 2) site.source.y = mother.pos.y = groundHeight(site.source.x, site.source.z, 2) + 1.2;
    expect(awakenNursery(s, site)).toBe(true);
    const child = s.world.creatures[0], radius = speciesById(child.species).size * .6;
    expect(Math.abs(child.pos.x)).toBeLessThanOrEqual(WORLD_BOUND - radius);
    expect(Math.abs(child.pos.z)).toBeLessThanOrEqual(WORLD_BOUND - radius);
    if (s.stage === 0) expect(child.pos.y).toBe(1.1);
    if (s.stage === 1) expect(child.pos.y).toBeGreaterThanOrEqual(groundHeight(child.pos.x, child.pos.z, 1) + 1.3);
    if (s.stage === 2) expect(child.pos.y).toBeCloseTo(groundHeight(child.pos.x, child.pos.z, 2) + speciesGroundClearance(speciesById(child.species)));
  });

  it.each([-7, 12.01])('rejects reef source height %s rather than spawning through the floor or surface bound', y => {
    const { s, site, mother } = isolated(3); site.source.y = mother.pos.y = y;
    const before = structuredClone(s);
    expect(awakenNursery(s, site)).toBe(false); expect(s).toEqual(before);
  });

  it('finds a free local approach instead of overlapping a creature, the player or a column', () => {
    const { s, site } = isolated(); s.player.pos = { x: 1.2, y: 1.1, z: 0 };
    const other = spawnCreature(s.world, 'lantern', 2); other.pos = { x: -1.2, y: 1.1, z: 0 }; s.world.creatures.push(other);
    const rock = { id: s.world.nextId++, kind: 'rock' as const, pos: { x: 0, y: 0, z: 1.2 }, radius: .6, height: 3 }; s.world.obstacles.push(rock);
    expect(awakenNursery(s, site)).toBe(true);
    const child = s.world.creatures.at(-1)!, radius = speciesById(child.species).size * .6;
    expect(distance(child.pos, s.player.pos)).toBeGreaterThan(radius + .6);
    expect(distance(child.pos, other.pos)).toBeGreaterThan(radius + speciesById(other.species).size * .6);
    expect(horizontalDistance(child.pos, rock.pos)).toBeGreaterThan(rock.radius + radius);
  });

  it.each([0, 3, 4, 6, 7, 8])('round-trips site %i recovery and continues actual simulation deterministically', id => {
    const { s, site } = scene(id), loaded = parseGame(serializeGame(s));
    const loadedSite = loaded.journey.sites.find(other => other.id === site.id)!;
    expect(awakenNursery(s, site)).toBe(true); expect(awakenNursery(loaded, loadedSite)).toBe(true);
    expect(loaded).toEqual(s); expect(parseGame(serializeGame(s))).toEqual(s);
    for (let i = 0; i < 90; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded).toEqual(s); expect(parseGame(serializeGame(s))).toEqual(s);
    makeCheckpoint(s); const recovered = recoverGeneration(parseGame(serializeGame(s)));
    expect(recovered.world.creatures).toEqual(s.world.creatures); expect(recovered.world.resources).toEqual(s.world.resources);
    expect(recovered.world.rng).toBe(s.world.rng); expect(recovered.world.births).toBe(s.world.births);
  });

  it('keeps repeated affordance queries and rejected no-food actions completely read-only', () => {
    const { s, site, mother } = isolated(); mother.amount = .99;
    const before = structuredClone(s);
    for (let i = 0; i < 25; i++) {
      expect(nurserySpecies(s, site)).toBe('veil'); expect(nurseryFood(s, site)).toBeNull(); expect(awakenNursery(s, site)).toBe(false);
    }
    expect(s).toEqual(before);
  });
});
