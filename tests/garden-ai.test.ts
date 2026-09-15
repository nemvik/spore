import { describe, expect, it } from 'vitest';
import { createGame, evolve, step } from '../src/game/simulation';
import { actOnJourney, activeSites, initializeJourneyStage, journeyForageTarget } from '../src/game/journey';
import { speciesById } from '../src/game/content';
import { distance } from '../src/game/random';
import { createWorld, spawnCreature } from '../src/game/world';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState, Vec3 } from '../src/game/types';

// Diagnostic fixtures place only the player to perform real observe/take/plant
// actions. Campaign cases retain every generated NPC, rock, food, fear, hunter,
// birth and movement rule. They are not evidence of a fresh human playthrough.
function plantGarden(s: GameState, refuge: number) {
  const site = activeSites(s)[0];
  for (const pos of [site.source, site.source, site.refuges[refuge]]) {
    s.player.pos = { ...pos }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.cooldown = 0;
    expect(actOnJourney(s)).toBe(true);
  }
  expect(site.resolved).toBe(false);
  return s.world.resources.find(r => r.id === site.plantedId)!;
}

describe('garden consumers reach authored food with the complete food web running', () => {
  it.each([481516, 20260913, 8675309])('lets sated grazers investigate a new garden after a two-minute delayed approach for seed %i', seed => {
    const s = createGame(seed, false), site = activeSites(s)[0];
    // Time passes with the original food web running before the player arrives.
    // This previously made first contact wait over 80s for a hunger timer.
    for (let frame = 0; frame < 120 * 60; frame++) step(s, EMPTY_INPUT);
    expect(s.world.creatures.some(c => c.patch === 0 && speciesById(c.species).role === 'grazer' && c.hunger <= 28)).toBe(true);
    const plant = plantGarden(s, 0);
    s.player.pos = { x: 0, y: 1.1, z: 0 };
    let actualMeal = false;
    for (let frame = 0; frame < 30 * 60 && !site.resolved; frame++) {
      const previous = s.world.creatures.filter(c => speciesById(c.species).role === 'grazer').map(c => ({ c, cooldown: c.cooldown }));
      step(s, EMPTY_INPUT);
      actualMeal ||= previous.some(({ c, cooldown }) => c.target === plant.id && c.cooldown > cooldown && distance(c.pos, plant.pos) < 2);
    }
    expect(actualMeal).toBe(true);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate' });
    expect(s.player.kills).toBe(0); expect(s.deathReason).toBeNull();
  });

  it.each([481516, 20260913, 8675309].flatMap(seed => [0, 1].map(refuge => ({ seed, refuge }))))
  ('reaches refuge $refuge for seed $seed after the hunter has dispersed the original grazers', ({ seed, refuge }) => {
    const s = createGame(seed, false), site = activeSites(s)[0];
    const originalGrazers = s.world.creatures.filter(c => c.patch === 0 && speciesById(c.species).role === 'grazer');
    const originalHunter = s.world.creatures.find(c => c.patch === 0 && speciesById(c.species).role === 'predator')!;
    let fled = false;
    for (let frame = 0; frame < 20 * 60; frame++) {
      step(s, EMPTY_INPUT); fled ||= originalGrazers.some(c => c.intent === 'flee');
    }
    expect(fled).toBe(true);
    const food = plantGarden(s, refuge);
    s.player.pos = { x: 0, y: 1.1, z: 0 };
    expect(evolve(s, structuredClone(s.player.genome)).ok).toBe(true);
    let actualMeal = false;
    for (let frame = 0; frame < 45 * 60 && !site.resolved; frame++) {
      const previous = originalGrazers.map(c => ({ c, pos: { ...c.pos }, cooldown: c.cooldown }));
      step(s, EMPTY_INPUT);
      for (const before of previous) {
        // No actor is repositioned by the fixture after the colony is planted.
        // A radial collision projection lengthens the final chord very slightly.
        // Six full 45s trajectories measured a maximum 6.489µm excess; retain
        // the strict velocity bound and allow 10µm for the actual resolved step.
        // evidence/quality/hunter-tracking/movement-diagnosis.json records it.
        const limit = speciesById(before.c.species).speed * 1.3 / 60;
        expect(Math.hypot(before.c.velocity.x, before.c.velocity.y, before.c.velocity.z) / 60).toBeLessThanOrEqual(limit + 1e-7);
        expect(distance(before.pos, before.c.pos)).toBeLessThanOrEqual(limit + 1e-5);
        if (before.c.target === food.id && before.cooldown < before.c.cooldown && distance(before.c.pos, food.pos) < 2) actualMeal = true;
      }
    }
    expect(s.deathReason).toBeNull(); expect(s.player.kills).toBe(0);
    expect(s.world.creatures).toContain(originalHunter);
    expect(actualMeal).toBe(true);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate' });
  });
});

describe('a satiated invader leaves a genuine opening for the first safe grazing meal', () => {
  it.each([20, 80])('judges the invader by its actual appetite (%i), not mere proximity', hunger => {
    const s = createGame(481516, false);
    s.stage = 2; s.world = createWorld(s.seed, 2); s.worlds[2] = s.world; initializeJourneyStage(s);
    s.world.creatures = []; s.world.obstacles = [];
    const plant = plantGarden(s, 0), site = activeSites(s)[0];
    const invader = spawnCreature(s.world, 'gnaw', 0), grazer = spawnCreature(s.world, 'bell', 0);
    Object.assign(invader, { pos: { ...plant.pos }, hunger, cooldown: 0, fear: 0 });
    Object.assign(grazer, { pos: { ...plant.pos, x: plant.pos.x + .5 }, hunger: 80, cooldown: 0, fear: 0 });
    s.world.creatures = [invader, grazer];
    s.player.pos = { ...s.world.landmarks[0].pos }; s.tick = 29;
    const amount = plant.amount;
    step(s, EMPTY_INPUT);
    expect(grazer.target).toBe(plant.id); expect(grazer.cooldown).toBe(10);
    expect(plant.amount).toBeLessThan(amount - .3);
    expect(site.resolved).toBe(hunger <= 28);
    expect(site.vitality).toBe(hunger <= 28 ? 100 : 88);
    expect(invader.intent).toBe(hunger <= 28 ? 'rest' : 'forage');
  });
});

describe('rooted colony emission and explicit offering bounds', () => {
  it('reaches the far side of its own habitat, while a remote food offer keeps its short range', () => {
    const s = createGame(481516, false), food = plantGarden(s, 0);
    const c = s.world.creatures.find(c => c.species === 'veil')!;
    c.pos = { x: -15, y: 1.1, z: -47 }; // disclosed targeting-only fixture, opposite habitat edge
    expect(distance(c.pos, food.pos)).toBeGreaterThan(55);
    expect(journeyForageTarget(s, c)?.id).toBe(food.id);
    activeSites(s)[0].plantedId = null;
    s.journey.offerings.push({ id: food.id, stage: 0, site: 0, remaining: 120 });
    expect(journeyForageTarget(s, c)).toBeNull();
  });

  it('keeps other habitats, far gate colonies, depleted food and incompatible diets bounded', () => {
    const s = createGame(481516, false), food = plantGarden(s, 0);
    const c = s.world.creatures.find(c => c.species === 'veil')!;
    c.pos = { x: -18, y: 1.1, z: -26 };
    c.patch = 1; expect(journeyForageTarget(s, c)).toBeNull();
    c.patch = 0; food.amount = .4; expect(journeyForageTarget(s, c)).toBeNull();
    food.amount = 8; food.kind = 'meat'; expect(journeyForageTarget(s, c)).toBeNull();
    food.kind = 'algae'; food.pos = { x: -8, y: 1.1, z: -57 }; c.pos = { x: -37, y: 1.1, z: 0 };
    expect(journeyForageTarget(s, c)).toBeNull();
    food.pos = { ...activeSites(s)[0].refuges[0] }; c.pos = { x: 35, y: 1.1, z: 0 };
    expect(journeyForageTarget(s, c)).toBeNull();
  });

  it('preserves a nearby explicit offering priority over the habitat colony', () => {
    const s = createGame(481516, false), plant = plantGarden(s, 0);
    const c = s.world.creatures.find(c => c.species === 'veil')!;
    s.world.obstacles = []; c.pos = { x: plant.pos.x, y: 1.1, z: plant.pos.z - 5 };
    const offer = { ...plant, id: s.world.nextId++, pos: { ...c.pos, x: c.pos.x + 8 } };
    s.world.resources.push(offer); s.journey.offerings.push({ id: offer.id, stage: 0, site: 0, remaining: 120 });
    expect(journeyForageTarget(s, c)?.id).toBe(offer.id);
    s.journey.offerings[0].remaining = 0; expect(journeyForageTarget(s, c)?.id).toBe(plant.id);
  });
});

describe('cover stops ongoing omniscient fear in the full NPC step', () => {
  it.each(['predator', 'armed-player'] as const)('ignores a hidden %s and flees once the view opens', threatKind => {
    // Deliberately prepared visibility fixture isolates the actual think step.
    const s = createGame(481516, false);
    const c = s.world.creatures.find(c => c.species === 'veil')!;
    const h = s.world.creatures.find(c => c.species === 'needle')!;
    const start: Vec3 = { x: 0, y: 1.1, z: 0 }, threat: Vec3 = { x: 6, y: 1.1, z: 0 };
    Object.assign(c, { pos: start, velocity: { x: 0, y: 0, z: 0 }, fear: 0, hunger: 80 });
    h.pos = { ...threat }; s.world.creatures = threatKind === 'predator' ? [c, h] : [c];
    s.player.pos = threatKind === 'predator' ? { x: -65, y: 1.1, z: 0 } : { ...threat };
    if (threatKind === 'armed-player') s.player.genome.parts.push({ id: 'prepared-jaw', kind: 'jaw', axial: .9, angle: 0, scale: 1, mirrored: false });
    s.world.obstacles = [{ id: s.world.nextId++, pos: { x: 3, y: 0, z: 0 }, radius: 1, height: 10, kind: 'rock' }];
    s.world.resources = [{ id: s.world.nextId++, pos: { x: 0, y: 1.1, z: 4 }, kind: 'algae', amount: 8, max: 8, patch: 0, regen: 0 }, ...s.world.resources.filter(r => activeSites(s).some(site => site.sourceId === r.id))];
    s.tick = 29; step(s, EMPTY_INPUT);
    expect(c.intent).toBe('forage'); expect(c.velocity.z).toBeGreaterThan(0);
    s.world.obstacles = []; s.tick = 59; step(s, EMPTY_INPUT);
    expect(c.intent).toBe('flee'); expect(c.velocity.x).toBeLessThan(0);
  });
});
