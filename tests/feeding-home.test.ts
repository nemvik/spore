import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { createWorld, spawnCreature, WORLD_BOUND } from '../src/game/world';
import { initializeJourneyStage, journeyAction } from '../src/game/journey';
import { hunterThreatening } from '../src/game/hunter-appetite';
import { genomeCost, initialGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { distance, groundHeight, horizontalDistance } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
import type { Creature, GameState, Resource, Vec3 } from '../src/game/types';

const point = (x: number, z = -20): Vec3 => ({ x, y: groundHeight(x, z, 2) + 1.2, z });

/** Prepared land encounter: one crest, a three-portion carcass and clear ground.
 * Retained worlds/sources remain valid. In the exercised T/E sequence, player
 * and hunter positions subsequently change only through public step inputs. */
function scene(version: 2 | 3 = 3) {
  const s = createGame(481516, false);
  if (version === 2) { s.journey.version = 2; delete s.journey.canopy; }
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world; initializeJourneyStage(s);
  }
  s.player.genome = structuredClone(s.player.genome);
  s.player.genome.parts.push(
    { id: 'home-legs', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: true },
    { id: 'home-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
  );
  s.player.totalDna = 100; s.player.dna = genomeCost(initialGenome()) + 100 - genomeCost(s.player.genome);
  s.player.pos = point(-4); s.player.heading = Math.PI / 2;
  s.world.creatures = []; s.world.obstacles = []; s.journey.hunters = []; s.checkpoint = null;
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.stage === 2 && site.sourceId === r.id));
  s.world.patches.forEach(patch => { patch.discovered = true; });
  const hunter = spawnCreature(s.world, 'crest', 1);
  Object.assign(hunter, { pos: point(10), hunger: 20, health: 55, heading: 0, target: null, fear: 0, velocity: { x: 0, y: 0, z: 0 } });
  s.world.creatures.push(hunter);
  const carcass = meat(s, point(-4), 3);
  return { s, hunter, carcass };
}

function meat(s: GameState, position: Vec3, amount = 1, offered = false): Resource {
  const food: Resource = { id: s.world.nextId++, kind: 'meat', pos: { ...position }, amount, max: amount, regen: 0, patch: 1 };
  s.world.resources.push(food);
  if (offered) s.journey.offerings.push({ id: food.id, site: 7, stage: 2, remaining: 120 });
  return food;
}
function memory(s: GameState, hunter: Creature) { return s.journey.hunters.find(h => h.stage === 2 && h.id === hunter.id); }
function cooldown(s: GameState) { for (let i = 0; i < 180 && s.player.cooldown > 0; i++) step(s, EMPTY_INPUT); }
function take(s: GameState) {
  cooldown(s); expect(journeyAction(s)).toMatchObject({ operation: 'take-meat', ready: true });
  step(s, { ...EMPTY_INPUT, tend: true }); expect(s.journey.cargo).toMatchObject({ purpose: 'food', kind: 'meat' });
}
function walk(s: GameState, goal: Vec3) {
  for (let i = 0; i < 900 && horizontalDistance(s.player.pos, goal) > .25; i++) {
    const dx = goal.x - s.player.pos.x, dz = goal.z - s.player.pos.z, d = Math.hypot(dx, dz);
    const demand = Math.min(.8, d / 2);
    step(s, { ...EMPTY_INPUT, x: dx / d * demand, z: dz / d * demand });
  }
  expect(horizontalDistance(s.player.pos, goal)).toBeLessThan(.25);
}
function offer(s: GameState): Resource {
  cooldown(s); expect(journeyAction(s, true)).toMatchObject({ operation: 'offer', ready: true });
  step(s, { ...EMPTY_INPUT, offer: true });
  const id = s.journey.offerings.at(-1)!.id;
  return s.world.resources.find(r => r.id === id)!;
}
function eat(s: GameState, hunter: Creature, food: Resource) {
  for (let i = 0; i < 900 && food.amount >= 1; i++) step(s, EMPTY_INPUT);
  expect(food.amount).toBe(0); expect(memory(s, hunter)?.feedingHome).toEqual(hunter.pos);
  expect(distance(hunter.pos, food.pos)).toBeLessThan(2);
  return { ...memory(s, hunter)!.feedingHome! };
}
function firstMeal() {
  const fixture = scene(), { s, hunter, carcass } = fixture;
  take(s); walk(s, point(2)); const offering = offer(s);
  return { ...fixture, offering };
}

describe('land hunters learn only personally consumed feeding places', () => {
  it('real T, walking and E move future patrol beyond the old leash only after the hunter reaches and eats', () => {
    const { s, hunter, carcass, offering } = firstMeal(), dna = s.player.dna;
    expect(carcass.amount).toBe(2); expect(s.journey.cargo).toBeNull();
    expect(horizontalDistance(offering.pos, s.world.patches[1].center)).toBeGreaterThan(s.world.patches[1].radius + 4);
    expect(offering.amount).toBe(1); expect(memory(s, hunter)?.feedingHome).toBeUndefined();
    const beforeApproach = { ...hunter.pos }, home = eat(s, hunter, offering);
    expect(distance(hunter.pos, beforeApproach)).toBeGreaterThan(5);
    expect(memory(s, hunter)!.feedingHome).not.toBe(hunter.pos);
    expect(distance(home, offering.pos)).toBeGreaterThan(.1); // Learned contact position, not the resource centre.
    for (let i = 0; i < 900; i++) {
      step(s, EMPTY_INPUT);
      expect(horizontalDistance(hunter.pos, home)).toBeLessThanOrEqual(8.001);
      expect(hunterThreatening(s, hunter)).toBe(false); expect(hunter.intent).not.toBe('hunt');
    }
    expect(distance(hunter.pos, home)).toBeGreaterThan(1);
    expect(horizontalDistance(hunter.pos, s.world.patches[1].center)).toBeGreaterThan(20);
    expect(memory(s, hunter)!.feedingHome).toEqual(home); expect(s.player.dna).toBe(dna);
    expect(s.journey.sites.every(site => !site.resolved)).toBe(true);
  });

  it('a second actual carried meal corrects the remembered place while the healthy fed hunter remains non-hunting', () => {
    const { s, hunter, carcass, offering } = firstMeal(), oldHome = eat(s, hunter, offering);
    walk(s, carcass.pos); take(s); walk(s, point(11)); const second = offer(s);
    expect(memory(s, hunter)!.feedingHome).toEqual(oldHome); expect(second.amount).toBe(1);
    const nextHome = eat(s, hunter, second);
    expect(distance(nextHome, oldHome)).toBeGreaterThan(4); expect(carcass.amount).toBe(1);
    expect(hunterThreatening(s, hunter)).toBe(false); expect(s.world.creatures).toHaveLength(1);
  });

  it.each(['blocked', 'expired', 'dead', 'fleeing', 'committed lunge'] as const)('does not learn from the %s offered meal', situation => {
    const { s, hunter, carcass } = scene(); carcass.amount = 0; hunter.hunger = 70;
    const food = meat(s, point(11.95), 1, true);
    if (situation === 'blocked') s.world.obstacles.push({ id: s.world.nextId++, kind: 'tree', pos: { x: 10.975, y: groundHeight(10.975, -20, 2), z: -20 }, radius: .15, height: 5 });
    if (situation === 'expired') s.journey.offerings.at(-1)!.remaining = 0;
    if (situation === 'dead') hunter.health = 0;
    if (situation === 'fleeing') hunter.fear = 5;
    if (situation === 'committed lunge') {
      hunter.target = -1; hunter.intent = 'hunt'; hunter.velocity = { x: 10.4, y: 0, z: 0 };
      s.journey.hunters.push({ id: hunter.id, stage: 2, phase: 'lunge', time: .75, aim: point(20) });
    }
    step(s, EMPTY_INPUT);
    expect(food.amount).toBe(1); expect(memory(s, hunter)?.feedingHome).toBeUndefined();
  });

  it('keeps natural carcasses inside the old territorial leash even when an explicit nearby E offering could relocate it', () => {
    const { s, hunter, carcass } = scene(); carcass.amount = 0;
    hunter.pos = point(4); hunter.hunger = 70; s.player.pos = point(-20);
    const outside = meat(s, point(2.5));
    expect(horizontalDistance(outside.pos, s.world.patches[1].center)).toBeGreaterThan(33);
    step(s, EMPTY_INPUT);
    expect(outside.amount).toBe(1); expect(memory(s, hunter)?.feedingHome).toBeUndefined();
  });

  it('retains patch-centred patrol for an absent learned field, including a strict old-v2 import', () => {
    for (const version of [2, 3] as const) {
      const { s, hunter, carcass } = scene(version); carcass.amount = 0;
      s.player.pos = point(-30); const before = horizontalDistance(hunter.pos, s.world.patches[1].center);
      const loaded = parseGame(serializeGame(s)), copy = loaded.world.creatures.find(c => c.id === hunter.id)!;
      for (let i = 0; i < 900; i++) step(loaded, EMPTY_INPUT);
      expect(horizontalDistance(copy.pos, loaded.world.patches[1].center)).toBeLessThan(before - 10);
      expect(memory(loaded, copy)?.feedingHome).toBeUndefined();
    }
  });

  it('keeps an offspring at its actual birth site without inheriting its parent’s learned territory', () => {
    const { s, hunter, carcass } = scene(); carcass.amount = 0; hunter.hunger = 70; s.player.pos = point(-30);
    const food = meat(s, point(11), 2), oldBirths = s.world.births;
    step(s, EMPTY_INPUT);
    expect(food.amount).toBe(0); expect(s.world.births).toBe(oldBirths + 1); expect(s.world.creatures).toHaveLength(2);
    expect(memory(s, hunter)?.feedingHome).toEqual(hunter.pos);
    const child = s.world.creatures.find(c => c.id !== hunter.id)!, bornAt = { ...child.pos };
    expect(child.patch).toBe(hunter.patch); expect(distance(child.pos, food.pos)).toBeLessThan(5);
    expect(memory(s, child)?.feedingHome).toBeUndefined();
    for (let i = 0; i < 60; i++) step(s, EMPTY_INPUT);
    expect(memory(s, child)?.feedingHome).toBeUndefined();
    expect(horizontalDistance(child.pos, s.world.patches[1].center)).toBeLessThan(horizontalDistance(bornAt, s.world.patches[1].center));
  });

  it('round-trips a real learned place and checkpoint, then preserves exact future patrol and food state', () => {
    const { s, hunter, offering } = firstMeal(), home = eat(s, hunter, offering); makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s)); expect(loaded).toEqual(s);
    const recovered = recoverGeneration(loaded);
    expect(memory(recovered, hunter)!.feedingHome).toEqual(home);
    expect(recovered.world.creatures).toEqual(s.world.creatures); expect(recovered.world.resources).toEqual(s.world.resources);
    expect(recovered.world.rng).toBe(s.world.rng);
    const copy = parseGame(serializeGame(recovered));
    for (let i = 0; i < 600; i++) { step(recovered, EMPTY_INPUT); step(copy, EMPTY_INPUT); }
    expect(copy).toEqual(recovered); expect(memory(copy, hunter)!.feedingHome).toEqual(home);
  });

  it('does not insert a later meal into an earlier checkpoint; recovering that approach must earn it again', () => {
    const { s, hunter, offering } = firstMeal(); makeCheckpoint(s);
    expect(memory(s, hunter)?.feedingHome).toBeUndefined(); eat(s, hunter, offering);
    const recovered = recoverGeneration(parseGame(serializeGame(s))), recoveredHunter = recovered.world.creatures.find(c => c.id === hunter.id)!;
    const recoveredFood = recovered.world.resources.find(r => r.id === offering.id)!;
    expect(memory(recovered, recoveredHunter)?.feedingHome).toBeUndefined(); expect(recoveredFood.amount).toBe(1);
    eat(recovered, recoveredHunter, recoveredFood);
    expect(memory(recovered, recoveredHunter)?.feedingHome).toBeDefined();
  });

  it.each([
    ['outside x', { x: WORLD_BOUND + .01, y: 1, z: 0 }],
    ['outside z', { x: 0, y: 1, z: -WORLD_BOUND - .01 }],
    ['non-finite', { x: Infinity, y: 1, z: 0 }],
    ['missing axis', { x: 0, z: 0 }],
    ['unexpected field', { x: 0, y: 1, z: 0, radius: 9 }],
    ['null', null],
  ])('rejects a %s feeding place in a strict import', (_label, invalid) => {
    const { s, hunter, offering } = firstMeal(); eat(s, hunter, offering);
    const envelope = JSON.parse(serializeGame(s)); envelope.state.journey.hunters[0].feedingHome = invalid;
    expect(() => parseGame(JSON.stringify(envelope))).toThrow(/feedingHome/);
  });

  it.each(['reef', 'v2'] as const)('rejects learned territory in a %s record instead of silently migrating its behavior', mode => {
    const { s, hunter, offering } = firstMeal(); eat(s, hunter, offering);
    const envelope = JSON.parse(serializeGame(s));
    if (mode === 'reef') {
      envelope.state.journey.hunters[0].stage = 1;
      envelope.state.journey.hunters[0].id = s.worlds[1]!.creatures.find(c => c.species === 'ribbon')!.id;
    } else { envelope.state.journey.version = 2; delete envelope.state.journey.canopy; }
    expect(() => parseGame(JSON.stringify(envelope))).toThrow(/journey.hunters/);
  });
});
