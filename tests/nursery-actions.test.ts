import type { WorldStage as Stage } from '../src/game/stage';
import { describe, expect, it } from 'vitest';
import { actOnJourney, initializeJourneyStage, journeyAction } from '../src/game/journey';
import { nurserySpecies } from '../src/game/nursery';
import { createGame, step } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { genomeCost, initialGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { distance, horizontalDistance } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState, Vec3 } from '../src/game/types';

/** Prepared extinction/action scenes, not campaign evidence. Previous worlds
 * and authored mothers remain; local animals are removed explicitly. Exact
 * transactions use the same public action as T. Route tests then advance real
 * simulation without moving or retargeting the resulting animal. */
function scene(id = 0, historical = false) {
  const s = createGame(20260913, false), stage = Math.floor(id / 3) as Stage;
  if (historical) { s.journey.version = 2; delete s.journey.canopy; }
  for (let next = 1; next <= stage; next++) {
    s.stage = next as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.world.stage] = s.world;
    initializeJourneyStage(s);
  }
  if (stage === 2) {
    s.player.genome = structuredClone(s.player.genome);
    s.player.genome.parts.push(
      { id: 'care-legs', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: true },
      { id: 'care-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
    );
    s.player.totalDna = 100; s.player.dna = genomeCost(initialGenome()) + 100 - genomeCost(s.player.genome);
  }
  const site = s.journey.sites.find(site => site.id === id)!;
  const mother = s.world.resources.find(r => r.id === site.sourceId)!;
  s.world.creatures = []; s.checkpoint = null;
  s.world.resources.forEach(r => { r.regen = 0; });
  s.world.patches.forEach(patch => { patch.discovered = true; });
  if (id === 4 && s.journey.canopy) {
    s.journey.canopy.releasedAt = 0;
    s.world.resources.find(r => r.id === s.journey.canopy!.crustId)!.amount = 0;
    s.world.obstacles = s.world.obstacles.filter(o => o.id !== s.journey.canopy!.capId);
  }
  at(s, site.source);
  return { s, site, mother };
}

function at(s: GameState, point: Vec3) {
  s.player.pos = { ...point }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.cooldown = 0;
}
function act(s: GameState, operation: NonNullable<ReturnType<typeof journeyAction>>['operation']) {
  expect(journeyAction(s)).toMatchObject({ operation, ready: true });
  expect(actOnJourney(s)).toBe(true);
}
function observed(fixture: ReturnType<typeof scene>) {
  const { s, site } = fixture; act(s, 'observe'); at(s, site.source); return fixture;
}
function careCargo(s: GameState, site = s.journey.sites.find(site => site.stage === s.stage)!) {
  const mother = s.world.resources.find(r => r.id === site.sourceId)!;
  s.journey.cargo = { kind: mother.kind, purpose: 'food', site: site.id, vitality: 100, distance: 0 };
}

describe('nursery care through the journey T action', () => {
  it.each([0, 3, 6, 7, 8])('keeps the first site %i sample available, then offers explicit care while holding that culture', id => {
    const { s, site, mother } = observed(scene(id));
    expect(nurserySpecies(s, site)).not.toBeNull(); act(s, 'take');
    const cargo = structuredClone(s.journey.cargo), dna = s.player.dna, totalDna = s.player.totalDna, amount = mother.amount;
    const progress = structuredClone(site), births = s.world.births; at(s, site.source);
    expect(journeyAction(s)?.label).toContain('Probudit zárodek'); act(s, 'awaken');
    expect(mother.amount).toBe(amount - 1); expect(s.world.births).toBe(births + 1);
    expect(s.journey.cargo).toEqual(cargo); expect(site).toEqual(progress);
    expect(s.player.dna).toBe(dna); expect(s.player.totalDna).toBe(totalDna);
    expect(s.world.creatures).toHaveLength(1); expect(s.world.creatures[0].patch).toBe(site.patch);
    at(s, site.refuges[0]); act(s, 'plant');
    expect(site.resolved).toBe(false); expect(site.phase).toBe(3);
  });

  it('makes released canopy extinction explicit before sampling, then restores the ordinary sample action', () => {
    const { s, site, mother } = observed(scene(4)), dna = s.player.dna, amount = mother.amount;
    act(s, 'awaken');
    expect(mother.amount).toBe(amount - 1); expect(s.player.dna).toBe(dna); expect(site.resolved).toBe(false);
    at(s, site.source); act(s, 'take');
    expect(s.journey.cargo).toMatchObject({ purpose: 'culture', site: 4 });
    at(s, site.refuges[0]); act(s, 'plant'); expect(site.resolved).toBe(false);
  });

  it('does not allow T to release attached canopy crust or awaken its grazers prematurely', () => {
    const { s, site, mother } = scene(4); s.journey.canopy!.releasedAt = null;
    const crust = s.world.resources.find(r => r.id === s.journey.canopy!.crustId)!; crust.amount = 1;
    observed({ s, site, mother }); const nextId = s.world.nextId, amount = mother.amount;
    expect(journeyAction(s)).toMatchObject({ operation: 'take', ready: false }); actOnJourney(s);
    expect(crust.amount).toBe(1); expect(s.journey.canopy!.releasedAt).toBeNull();
    expect(mother.amount).toBe(amount); expect(s.world.nextId).toBe(nextId); expect(s.world.creatures).toHaveLength(0);
  });

  it.each([0, 3, 4, 6, 7, 8])('consumes compatible ordinary care cargo at site %i without also debiting the mother', id => {
    const { s, site, mother } = observed(scene(id)); careCargo(s, site);
    const amount = mother.amount, dna = s.player.dna, progress = structuredClone(site);
    act(s, 'awaken');
    expect(s.journey.cargo).toBeNull(); expect(mother.amount).toBe(amount); expect(s.player.dna).toBe(dna);
    expect(site).toEqual(progress); expect(s.world.creatures).toHaveLength(1);
  });

  it.each(['cooldown', 'range', 'line of sight'] as const)('the %s affordance prevents the physical care transaction', condition => {
    const { s, site, mother } = observed(scene()); careCargo(s, site); s.world.obstacles = [];
    if (condition === 'cooldown') s.player.cooldown = .4;
    if (condition === 'range') s.player.pos.x += 12;
    if (condition === 'line of sight') {
      s.player.pos.x -= 3;
      s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: site.source.x - 1.5, y: 0, z: site.source.z }, radius: .45, height: 3 });
    }
    const food = mother.amount, cargo = structuredClone(s.journey.cargo), rng = s.world.rng, nextId = s.world.nextId, dna = s.player.dna;
    expect(journeyAction(s)?.ready).toBe(false); actOnJourney(s);
    expect(mother.amount).toBe(food); expect(s.journey.cargo).toEqual(cargo); expect(s.world.rng).toBe(rng);
    expect(s.world.nextId).toBe(nextId); expect(s.player.dna).toBe(dna); expect(s.world.creatures).toHaveLength(0);
    if (condition === 'line of sight') expect(journeyAction(s)?.detail).toContain('Překážka cloní');
  });

  it('uses the real tend input and cooldown to create only one animal from one carried portion', () => {
    const { s, site, mother } = observed(scene()); careCargo(s, site);
    const amount = mother.amount, dna = s.player.dna, births = s.world.births;
    step(s, { ...EMPTY_INPUT, tend: true });
    expect(s.world.creatures).toHaveLength(1); expect(s.world.births).toBe(births + 1); expect(s.journey.cargo).toBeNull();
    expect(s.player.dna).toBe(dna); expect(mother.amount).toBe(amount); expect(s.player.cooldown).toBeGreaterThan(0);
    step(s, { ...EMPTY_INPUT, tend: true });
    expect(s.world.births).toBe(births + 1); expect(s.world.creatures).toHaveLength(1);
  });

  it('reports missing food without spending a culture, then accepts an actual compatible portion at the mother', () => {
    const { s, site, mother } = observed(scene()); act(s, 'take'); at(s, site.source);
    s.world.resources.forEach(r => { if (distance(r.pos, site.source) < 4) r.amount = 0; });
    const cargo = structuredClone(s.journey.cargo), dna = s.player.dna, nextId = s.world.nextId, rng = s.world.rng;
    expect(journeyAction(s)).toMatchObject({ operation: 'awaken', ready: false });
    expect(journeyAction(s)?.detail).toContain('sousto řasy'); actOnJourney(s);
    expect(s.journey.cargo).toEqual(cargo); expect(s.world.nextId).toBe(nextId); expect(s.world.rng).toBe(rng);
    const offered = { id: s.world.nextId++, kind: 'algae' as const, pos: { ...site.source, z: site.source.z + 1 }, amount: 1, max: 1, regen: 0, patch: site.patch };
    s.world.resources.push(offered); act(s, 'awaken');
    expect(offered.amount).toBe(0); expect(mother.amount).toBe(0); expect(s.journey.cargo).toEqual(cargo); expect(s.player.dna).toBe(dna);
  });

  it.each([0, 3, 4, 6, 7])('a site %i nursery animal must physically approach and eat the authored planted food', id => {
    const { s, site, mother } = observed(scene(id));
    if (id !== 4) { act(s, 'take'); at(s, site.refuges[0]); act(s, 'plant'); at(s, site.source); }
    act(s, 'awaken'); const child = s.world.creatures[0], bornAt = { ...child.pos };
    if (id === 4) { at(s, site.source); act(s, 'take'); at(s, site.refuges[0]); act(s, 'plant'); }
    const plant = s.world.resources.find(r => r.id === site.plantedId)!;
    expect(distance(child.pos, plant.pos)).toBeGreaterThan(10); expect(site.resolved).toBe(false);
    at(s, s.world.landmarks[0].pos);
    const dna = s.player.dna; let frames = 0, beforeMeal = plant.amount;
    while (!site.resolved && frames++ < 1800) { beforeMeal = plant.amount; step(s, EMPTY_INPUT); }
    // Real plant regrowth continues during travel; assert the actual meal's
    // debit at arrival rather than comparing with its initial eight portions.
    expect(site.resolved).toBe(true); expect(plant.amount).toBeLessThan(beforeMeal - .3);
    expect(distance(child.pos, plant.pos)).toBeLessThan(2); expect(distance(child.pos, bornAt)).toBeGreaterThan(8);
    expect(s.player.dna).toBe(dna + 28); expect(mother.amount).toBeGreaterThanOrEqual(0);
  });

  it('a food-funded gloom follows actual movement before the distant home can receive its meal', () => {
    const { s, site } = observed(scene(8)); s.world.obstacles = []; // Isolate the 97 m migration from obstacle routing, tested separately.
    act(s, 'take'); at(s, site.source); act(s, 'awaken');
    const child = s.world.creatures[0], bornAt = { ...child.pos }, goal = site.refuges[0];
    let frames = 0;
    while (horizontalDistance(s.player.pos, goal) > 1 && frames++ < 3600) {
      const dx = goal.x - s.player.pos.x, dz = goal.z - s.player.pos.z, d = Math.hypot(dx, dz);
      step(s, { ...EMPTY_INPUT, x: dx / d * .7, z: dz / d * .7 });
    }
    expect(horizontalDistance(s.player.pos, goal)).toBeLessThan(1); expect(distance(child.pos, bornAt)).toBeGreaterThan(75);
    expect(child.health).toBeGreaterThan(0); expect(site.resolved).toBe(false);
    const dna = s.player.dna; act(s, 'plant'); const plant = s.world.resources.find(r => r.id === site.plantedId)!;
    expect(site.phase).toBe(3); expect(plant.amount).toBe(8);
    for (let i = 0; i < 600 && site.phase < 5; i++) step(s, EMPTY_INPUT);
    expect(site.phase).toBe(5); expect(site.resolved).toBe(true); expect(plant.amount).toBeLessThan(8);
    expect(distance(child.pos, plant.pos)).toBeLessThan(2); expect(s.player.dna).toBe(dna + 28);
    expect(s.campaign.won).toBe(false); // Care and arrival do not manufacture the missing ending support.
  });

  it('retries local extinction after a real first meal without granting observation, care or resolution rewards twice', () => {
    const { s, site } = observed(scene()); act(s, 'take'); at(s, site.refuges[0]); act(s, 'plant'); at(s, site.source); act(s, 'awaken');
    at(s, s.world.landmarks[0].pos);
    for (let i = 0; i < 1800 && !site.resolved; i++) step(s, EMPTY_INPUT);
    expect(site.resolved).toBe(true); const dna = s.player.dna, insights = [...s.journey.insights], births = s.world.births;
    // Explicit extinction fixture after the earned first meal; no resolution flags are repaired.
    s.world.creatures = []; at(s, site.source); act(s, 'awaken');
    expect(s.world.births).toBe(births + 1); expect(s.player.dna).toBe(dna); expect(s.journey.insights).toEqual(insights);
    at(s, s.world.landmarks[0].pos);
    for (let i = 0; i < 900; i++) step(s, EMPTY_INPUT);
    expect(s.player.dna).toBe(dna); expect(s.journey.insights).toEqual(insights); expect(site.resolved).toBe(true);
  });

  it.each([0, 3, 6, 7])('keeps old v2 site %i sampling and planting behavior without adding a nursery', id => {
    const { s, site, mother } = observed(scene(id, true)); act(s, 'take'); at(s, site.source);
    expect(journeyAction(s)?.operation).toBe('plant');
    const amount = mother.amount; at(s, site.refuges[0]); act(s, 'plant'); at(s, site.source);
    expect(journeyAction(s)?.operation).toBe('take'); expect(s.world.creatures).toHaveLength(0); expect(mother.amount).toBe(amount);
    expect(parseGame(serializeGame(s)).journey.version).toBe(2);
  });

  it('keeps old v2 canopy planting instant and old v2 gloom recovery free with the culture intact', () => {
    const reef = observed(scene(4, true)); act(reef.s, 'take'); at(reef.s, reef.site.refuges[0]); act(reef.s, 'plant');
    expect(reef.site.resolved).toBe(true); expect(reef.s.journey.canopy).toBeUndefined();
    const { s, site, mother } = observed(scene(8, true)); act(s, 'take'); at(s, site.source); mother.amount = 0;
    const cargo = structuredClone(s.journey.cargo), dna = s.player.dna; act(s, 'awaken');
    expect(s.world.creatures).toHaveLength(1); expect(s.world.creatures[0].species).toBe('gloom');
    expect(mother.amount).toBe(0); expect(s.journey.cargo).toEqual(cargo); expect(s.player.dna).toBe(dna);
    expect(parseGame(serializeGame(s)).journey.version).toBe(2);
  });
});
