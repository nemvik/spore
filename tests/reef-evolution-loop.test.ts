import type { WorldStage as Stage } from '../src/game/stage';
import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { initializeJourneyStage, journeyAction } from '../src/game/journey';
import { livingStreams, reefWater, streamEffect } from '../src/game/journey-network';
import { reefConditions } from '../src/game/reef-layout';
import { reefBodyProfile } from '../src/game/reef-body';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { groundHeight, horizontalDistance } from '../src/game/random';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT } from '../src/game/types';
import type { AdaptationId, GameState, Input, } from '../src/game/types';

/** Prepared integration scenes, not earned campaigns. Visited worlds are authored
 * normally, then NPCs and incidental food are removed to isolate the stated cause.
 * Authored mothers, canopy references, geometry and rates remain in place. */
function fixture(optedIn = true, stage: Stage = 1, organs: AdaptationId[] = ['filter', 'gills']) {
  const s = createGame(8675309, false, true, optedIn);
  for (let visited = 1; visited <= stage; visited++) {
    s.stage = visited as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.world.stage] = s.world;
    initializeJourneyStage(s);
  }
  s.player.genome = initialGenome();
  for (const kind of [...organs, ...(stage === 2 ? ['legs', 'lungs'] as const : [])]) if (!s.player.genome.parts.some(part => part.kind === kind)) s.player.genome.parts.push({
    id: `loop-${kind}`, kind, axial: kind === 'filter' ? .9 : 0, angle: Math.PI / 2, scale: 1, mirrored: kind === 'legs',
  });
  s.player.totalDna = 300; s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  s.player.health = computeStats(s.player.genome).maxHealth;
  s.player.pos = { x: 0, y: stage === 1 ? 5 : stage === 2 ? groundHeight(0, -35, 2) + 1.5 : 1.1, z: -35 };
  s.player.energy = 60; s.player.oxygen = 70;
  s.world.creatures = [];
  const retained = new Set(s.journey.sites.filter(site => site.stage === stage).map(site => site.sourceId));
  if (stage === 1 && s.journey.canopy) retained.add(s.journey.canopy.crustId);
  s.world.resources = s.world.resources.filter(resource => retained.has(resource.id));
  s.world.obstacles = s.world.obstacles.filter(obstacle => horizontalDistance(obstacle.pos, s.player.pos) > obstacle.radius + 6);
  s.world.time = Math.PI / 2 / .55;
  makeCheckpoint(s); return s;
}

function ticks(s: GameState, frames: number, input: Partial<Input> = {}) {
  for (let i = 0; i < frames; i++) step(s, { ...EMPTY_INPUT, ...input });
}

/** An isolated released-canopy scene. During observation T creates the actual
 * root, then a prepared nearby hungry sail must physically eat it through step. */
function establishedRoot(upper: boolean, optedIn = true) {
  const s = fixture(optedIn), canopy = s.journey.canopy!, site = s.journey.sites.find(site => site.id === 4)!;
  canopy.releasedAt = 0;
  s.world.resources.find(resource => resource.id === canopy.crustId)!.amount = .65;
  s.world.obstacles = s.world.obstacles.filter(obstacle => obstacle.id !== canopy.capId);
  site.observed = true;
  const refuge = site.refuges[upper ? 0 : 1];
  s.player.pos = { ...refuge };
  s.journey.cargo = { site: 4, kind: 'algae', purpose: 'culture', vitality: 100, distance: 0 };
  const sail = spawnCreature(s.world, 'sail', 1);
  Object.assign(sail, { pos: { ...refuge, x: refuge.x + .7 }, velocity: { x: 0, y: 0, z: 0 }, target: null, intent: 'rest', hunger: 75, cooldown: .2, fear: 0 });
  s.world.creatures.push(sail);
  expect(journeyAction(s)).toMatchObject({ ready: true, operation: 'plant', site: { id: 4 } });
  ticks(s, 1, { tend: true });
  expect(site.plantedId).not.toBeNull();
  expect(site.resolved).toBe(false);
  expect(livingStreams(s)).toEqual([]);
  for (let i = 0; i < 120 && !site.resolved; i++) ticks(s, 1);
  expect(site.resolved).toBe(true);
  expect(sail.hunger).toBeLessThan(60);
  const plant = s.world.resources.find(resource => resource.id === site.plantedId)!;
  expect(plant.amount).toBeLessThan(8);
  return { s, site, plant };
}

describe('opted-in reef body integration', () => {
  it('keeps factory defaults old and preserves explicit rules with and without a recovery checkpoint', () => {
    expect(createGame(8675309, false, true).journey).not.toHaveProperty('reefEvolution');
    expect(createGame(8675309, true, true, true).journey).not.toHaveProperty('reefEvolution');
    const s = createGame(8675309, false, true, true);
    expect(s.journey.reefEvolution).toEqual({ version: 1, pumping: 0 });
    expect(recoverGeneration(s).journey.reefEvolution).toEqual(s.journey.reefEvolution);
    s.checkpoint = null;
    const restarted = recoverGeneration(s);
    expect(restarted.journey.reefEvolution).toEqual({ version: 1, pumping: 0 });
    expect(restarted.journey.rootDispersal).toEqual(s.journey.rootDispersal);
  });

  it('opens continuously on feed without a target, consumes energy, then closes on release', () => {
    const pumping = fixture(), closed = parseGame(serializeGame(pumping));
    const count = pumping.world.resources.length, meals = pumping.player.meals;
    ticks(pumping, 1, { feed: true });
    expect(pumping.journey.reefEvolution!.pumping).toBeGreaterThan(0);
    expect(pumping.journey.reefEvolution!.pumping).toBeLessThan(1);
    ticks(pumping, 14, { feed: true }); ticks(closed, 15);
    expect(pumping.journey.reefEvolution!.pumping).toBeCloseTo(1, 12);
    expect(pumping.player.energy).toBeLessThan(closed.player.energy - .05);
    expect(pumping.player.cooldown).toBe(0);
    expect(pumping.player.meals).toBe(meals);
    expect(pumping.world.resources).toHaveLength(count);
    ticks(pumping, 4);
    expect(pumping.journey.reefEvolution!.pumping).toBeGreaterThan(0);
    expect(pumping.journey.reefEvolution!.pumping).toBeLessThan(.7);
    ticks(pumping, 7);
    expect(pumping.journey.reefEvolution!.pumping).toBe(0);
  });

  it('requires filter tissue and usable energy instead of producing free purification', () => {
    const bare = fixture(true, 1, ['proboscis']), exhausted = fixture();
    bare.player.genome.parts = bare.player.genome.parts.filter(part => part.kind !== 'filter');
    bare.player.dna = genomeCost(initialGenome()) + bare.player.totalDna - genomeCost(bare.player.genome);
    makeCheckpoint(bare);
    expect(() => parseGame(serializeGame(bare))).not.toThrow();
    exhausted.player.energy = 1; exhausted.journey.reefEvolution!.pumping = 1;
    ticks(bare, 20, { feed: true }); ticks(exhausted, 20, { feed: true });
    expect(bare.journey.reefEvolution!.pumping).toBe(0);
    expect(exhausted.journey.reefEvolution!.pumping).toBe(0);
    expect(reefBodyProfile(bare.player.genome, 1).purification).toBe(0);
  });

  it('still eats one real portion and continues pumping through the ordinary meal cooldown', () => {
    const s = fixture(), food = { id: s.world.nextId++, kind: 'algae' as const, pos: { ...s.player.pos }, amount: 2, max: 2, regen: 0, patch: 0 };
    s.world.resources.push(food); s.player.energy = 30;
    ticks(s, 1, { feed: true });
    expect(food.amount).toBe(1); expect(s.player.meals).toBe(1);
    expect(s.player.energy).toBeGreaterThan(46);
    const opening = s.journey.reefEvolution!.pumping;
    ticks(s, 6, { feed: true });
    expect(s.player.cooldown).toBeGreaterThan(0);
    expect(s.journey.reefEvolution!.pumping).toBeGreaterThan(opening);
    expect(food.amount).toBe(1); expect(s.player.meals).toBe(1);
  });

  it('cleans only nearby water, including vertical distance, without consuming RNG on queries', () => {
    const s = fixture(), source = s.journey.sites.find(site => site.id === 5)!.source;
    s.player.pos = { ...source }; s.journey.reefEvolution!.pumping = 1;
    const radius = reefBodyProfile(s.player.genome, 1).filterRadius;
    const points = [source, { ...source, y: source.y + radius * .8 }, { ...source, y: source.y + radius + .1 }];
    const before = JSON.stringify(s);
    const ratios = points.map(point => {
      const raw = reefConditions(s.world, point).oxygenUse;
      expect(raw).toBeGreaterThan(0);
      return reefWater(s, point).oxygenUse / raw;
    });
    expect(ratios[0]).toBeLessThan(.6);
    expect(ratios[1]).toBeGreaterThan(ratios[0]);
    expect(ratios[1]).toBeLessThan(1);
    expect(ratios[2]).toBe(1);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('turns an actual deep-root meal into partial cleaning while old saves retain their 90% stream', () => {
    const current = establishedRoot(false), old = establishedRoot(false, false);
    for (const [scene, factor] of [[current, .45], [old, .1]] as const) {
      const { s } = scene, source = s.journey.sites.find(site => site.id === 5)!.source;
      expect(livingStreams(s)).toMatchObject([{ kind: 'oxygen', from: scene.plant.pos, to: source }]);
      expect(reefWater(s, source).oxygenUse / reefConditions(s.world, source).oxygenUse).toBeCloseTo(factor, 12);
    }
    current.plant.amount = 0;
    expect(livingStreams(current.s)).toEqual([]);
    const source = current.s.journey.sites.find(site => site.id === 5)!.source;
    expect(reefWater(current.s, source).oxygenUse).toBe(reefConditions(current.s.world, source).oxygenUse);
  });

  it('turns an actual upper-root meal into physical ascent without pretending the vent gas is clean', () => {
    const { s, plant } = establishedRoot(true), source = s.journey.sites.find(site => site.id === 5)!.source;
    expect(livingStreams(s)).toMatchObject([{ kind: 'lift', from: source }]);
    s.player.pos = { ...source, y: 6 }; s.player.velocity = { x: 0, y: 0, z: 0 };
    const unsupported = parseGame(serializeGame(s));
    unsupported.world.resources.find(resource => resource.id === plant.id)!.amount = 0;
    expect(streamEffect(s, s.player.pos).flow.y).toBeGreaterThan(5);
    expect(reefWater(s, source).oxygenUse).toBe(reefConditions(s.world, source).oxygenUse);
    ticks(s, 1); ticks(unsupported, 1);
    expect(s.player.pos.y).toBeGreaterThan(unsupported.player.pos.y + .05);
  });

  it.each([3, 4, 5])('adds gas stress only to a new-reef mother culture from site %i', id => {
    const current = fixture(true, 1, []), old = fixture(false, 1, []);
    for (const s of [current, old]) {
      s.player.pos = { ...s.journey.sites.find(site => site.id === 5)!.source };
      const site = s.journey.sites.find(site => site.id === id)!;
      const kind = s.world.resources.find(resource => resource.id === site.sourceId)!.kind;
      s.journey.cargo = { site: id, kind, purpose: 'culture', vitality: 100, distance: 0 };
      ticks(s, 1);
      expect(Number.isFinite(s.journey.cargo!.vitality)).toBe(true);
      expect(s.journey.cargo!.vitality).toBeGreaterThan(0);
    }
    if (id === 5) expect(current.journey.cargo!.vitality).toBeLessThan(old.journey.cargo!.vitality - .2);
    else expect(current.journey.cargo!.vitality).toBe(old.journey.cargo!.vitality);
  });

  it('keeps ordinary carried food intact and removes a culture cleanly at zero vitality', () => {
    const food = fixture(true, 1, []), fragile = fixture(true, 1, []);
    for (const s of [food, fragile]) s.player.pos = { ...s.journey.sites.find(site => site.id === 5)!.source };
    food.journey.cargo = { site: 5, kind: 'detritus', purpose: 'food', vitality: 100, distance: 0 };
    fragile.journey.cargo = { site: 5, kind: 'detritus', purpose: 'culture', vitality: .001, distance: 0 };
    ticks(food, 1); ticks(fragile, 1);
    expect(food.journey.cargo!.vitality).toBe(100);
    expect(fragile.journey.cargo).toBeNull();
    expect(() => parseGame(serializeGame(fragile))).not.toThrow();
  });

  it('allows taking site 5 before the earlier reefs with only the starter body; old saves keep their original prerequisite', () => {
    for (const optedIn of [false, true]) {
      const s = fixture(optedIn, 1, []), site = s.journey.sites.find(site => site.id === 5)!;
      site.observed = true; s.player.pos = { ...site.source };
      expect(s.journey.sites.filter(site => site.id === 3 || site.id === 4).every(site => !site.resolved)).toBe(true);
      expect(journeyAction(s)).toMatchObject({ ready: optedIn, operation: 'take', site: { id: 5 } });
      ticks(s, 1, { tend: true });
      if (optedIn) expect(s.journey.cargo).toMatchObject({ site: 5, purpose: 'culture' });
      else expect(s.journey.cargo).toBeNull();
    }
  });

  it('lets T take a culture while an air body holds Space, preserving the old meal-first behavior without opt-in', () => {
    for (const optedIn of [false, true]) {
      const s = fixture(optedIn, 1, ['lungs']), site = s.journey.sites.find(site => site.id === 5)!;
      // Historical prerequisites are prepared in both scenes, so the only
      // causal difference under the observed input is the new action priority.
      for (const earlier of s.journey.sites.filter(site => site.id === 3 || site.id === 4)) {
        earlier.observed = true; earlier.resolved = true; earlier.method = 'cultivate'; earlier.phase = 4;
      }
      site.observed = true; s.player.pos = { ...site.source };
      const mother = s.world.resources.find(resource => resource.id === site.sourceId)!;
      const beforeFood = mother.amount, beforeEnergy = s.player.energy;
      expect(s.player.genome.parts.some(part => part.kind === 'gills')).toBe(false);
      expect(journeyAction(s)).toMatchObject({ ready: true, operation: 'take' });
      ticks(s, 1, { feed: true, tend: true });
      if (optedIn) {
        expect(s.journey.cargo).toMatchObject({ site: 5, purpose: 'culture' });
        expect(s.journey.reefEvolution!.pumping).toBeGreaterThan(0);
        expect(s.player.meals).toBe(0); expect(mother.amount).toBe(beforeFood);
        expect(s.player.energy).toBeLessThan(beforeEnergy);
      } else {
        expect(s.journey.cargo).toBeNull(); expect(s.player.meals).toBe(1);
        expect(mother.amount).toBe(beforeFood - 1);
        expect(s.player.energy).toBeGreaterThan(beforeEnergy);
      }
    }
  });

  it('carries a culture with its chosen upward outlet while counter-steering down still causes shear', () => {
    const { s: upward } = establishedRoot(true), source = upward.journey.sites.find(site => site.id === 5)!.source;
    // Prepared at a gas-free point on the already earned live outlet, so this
    // comparison isolates shear from gas, sprinting and the cost of transport.
    upward.player.pos = { ...source, y: 6 }; upward.player.velocity = { x: 0, y: 0, z: 0 };
    upward.journey.cargo = { site: 5, kind: 'mineral', purpose: 'culture', vitality: 100, distance: 0 };
    makeCheckpoint(upward);
    const downward = parseGame(serializeGame(upward));
    expect(reefWater(upward, upward.player.pos).oxygenUse).toBe(0);
    ticks(upward, 20, { vertical: 1 }); ticks(downward, 20, { vertical: -1 });
    expect(upward.player.pos.y).toBeGreaterThan(downward.player.pos.y);
    expect(upward.journey.cargo!.distance).toBeGreaterThan(0);
    expect(downward.player.velocity.y).toBeLessThan(0);
    expect(upward.journey.cargo!.vitality).toBeGreaterThan(99);
    expect(downward.journey.cargo!.vitality).toBeLessThan(upward.journey.cargo!.vitality - 1);
    expect(() => parseGame(serializeGame(upward))).not.toThrow();
    expect(() => parseGame(serializeGame(downward))).not.toThrow();
  });

  it.each([0, 2] as const)('does not pump or alter the ordinary step in stage %i', stage => {
    const old = fixture(false, stage, ['filter']), current = parseGame(serializeGame(old));
    // Explicit comparison fixture: the only difference is a dormant rules marker.
    current.journey.reefEvolution = { version: 1, pumping: .6 };
    makeCheckpoint(current);
    expect(() => serializeGame(current)).not.toThrow();
    ticks(old, 20, { x: .5, z: .5, feed: true }); ticks(current, 20, { x: .5, z: .5, feed: true });
    expect(current.journey.reefEvolution.pumping).toBe(.6);
    expect(current.player).toEqual(old.player);
    expect(current.worlds).toEqual(old.worlds);
    expect(current.campaign).toEqual(old.campaign);
    expect(current.rng).toBe(old.rng);
  });

  it('continues an exact mid-pump save and restores the checkpoint opening independently of later input', () => {
    const original = fixture(); ticks(original, 7, { feed: true }); makeCheckpoint(original);
    const opening = original.journey.reefEvolution!.pumping;
    expect(opening).toBeGreaterThan(0); expect(opening).toBeLessThan(1);
    const loaded = parseGame(serializeGame(original));
    for (const input of [{ x: .5, feed: true }, { vertical: 1 }, { z: -1, feed: true }]) {
      ticks(original, 25, input); ticks(loaded, 25, input);
    }
    expect(loaded).toEqual(original);
    expect(recoverGeneration(loaded).journey.reefEvolution!.pumping).toBe(opening);
    expect(parseGame(serializeGame(loaded))).toEqual(loaded);
  });
});
