import { describe, expect, it } from 'vitest';
import type { ActiveTribeState } from '../src/game/era-types';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { parseGame, serializeGame } from '../src/game/persistence';
import { groundHeight, horizontalDistance } from '../src/game/random';
import { continueToTribeEra, createGame, makeCheckpoint, step } from '../src/game/simulation';
import { issueTribeOrder, tribeHome } from '../src/game/tribe';
import { EMPTY_INPUT } from '../src/game/types';
import type { Creature, GameState, Resource, Vec3 } from '../src/game/types';
import { createWorld, spawnCreature } from '../src/game/world';

type TribeGame = GameState & { tribe: ActiveTribeState };
const DT = 1 / 60;
function point(x: number, z: number): Vec3 { return { x, y: groundHeight(x, z, 2) + .8, z }; }

/** Prepared coast completion tests the live tribe boundary, not earned campaign
 * progression. Modern fixtures retain the actual journey source references. */
function fixture({ seed = 481516, legacy = true, isolated = true, jaw = false } = {}): TribeGame {
  const s = createGame(seed, legacy, !legacy);
  s.id = `tribe-wildlife-${seed}`;
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  if (jaw) s.player.genome.parts = s.player.genome.parts.filter(p => p.kind !== 'filter');
  for (const kind of [...(jaw ? ['jaw'] as const : []), 'legs', 'lungs'] as const) {
    s.player.genome.parts.push({ id: `wildlife-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  }
  s.player.health = computeStats(s.player.genome).maxHealth;
  s.player.totalDna = 300;
  s.player.dna = genomeCost(initialGenome()) + s.player.totalDna - genomeCost(s.player.genome);
  if (isolated) {
    s.world.obstacles = []; s.world.creatures = []; s.journey.hunters = [];
    s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.stage === 2 && site.sourceId === r.id));
  }
  Object.assign(s.campaign, { won: true, finale: 'restoration' });
  expect(continueToTribeEra(s)).toBe(true);
  // These scenes isolate wildlife versus player, not the new third competitor.
  if(isolated&&s.tribe?.version===2)for(const n of s.tribe.neighbours){n.society!.food=48;n.society!.recruitCooldown=120;for(const u of n.society!.members)u.hunger=0;}
  makeCheckpoint(s);
  return s as TribeGame;
}

function animal(s: TribeGame, species: string, x: number, z: number, overrides: Partial<Creature> = {}): Creature {
  const c = spawnCreature(s.world, species, 0);
  Object.assign(c, { pos: point(x, z), hunger: 80, velocity: { x: 0, y: 0, z: 0 }, intent: 'rest', target: null, cooldown: 0 }, overrides);
  s.world.creatures.push(c); return c;
}

function resource(s: TribeGame, x: number, z: number, amount = 3): Resource {
  const r: Resource = { id: s.world.nextId++, kind: 'algae', pos: point(x, z), amount, max: amount, patch: 0, regen: 0 };
  s.world.resources.push(r); return r;
}

function run(s: TribeGame, seconds: number) {
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) step(s, EMPTY_INPUT, DT);
}

function until(s: TribeGame, done: () => boolean, seconds = 20) {
  for (let frame = 0; frame < Math.round(seconds / DT) && !done(); frame++) step(s, EMPTY_INPUT, DT);
  expect(done(), `Condition not reached in ${seconds}s of stage-3 step()`).toBe(true);
}

describe('live inherited coast during tribe play', () => {
  it('moves a hungry grazer to real food, depletes it, and leaves the retired body alone', () => {
    const s = fixture(), c = animal(s, 'bell', 20, 0), r = resource(s, 32, 0);
    const player = structuredClone(s.player), origin = { ...c.pos }, hunger = c.hunger;
    until(s, () => r.amount < r.max);
    expect(horizontalDistance(c.pos, origin)).toBeGreaterThan(8);
    expect(horizontalDistance(c.pos, r.pos)).toBeLessThan(2);
    expect(c.hunger).toBeLessThan(hunger); expect(c.age).toBeGreaterThan(0);
    expect(r.amount).toBeGreaterThanOrEqual(0); expect(s.player).toEqual(player);
    const consumed = r.amount;
    run(s, 1);
    expect(r.amount).toBe(consumed);
  });

  it('makes wildlife and gatherers compete for the same finite resource', () => {
    const s = fixture(), c = animal(s, 'bell', 20, 1), r = resource(s, 20, 0, 1);
    const u = s.tribe.members[0]; u.pos = point(14, 0);
    const stock = s.tribe.food;
    expect(issueTribeOrder(s, [u.id], 'gather', { kind: 'food', id: r.id }).ok).toBe(true);
    run(s, 5);
    expect(c.hunger).toBeLessThan(80); expect(r.amount).toBeCloseTo(.65);
    expect(u.cargo).toBe(0); expect(u.orders).toHaveLength(0);
    expect(s.tribe.food).toBe(stock);
  });

  it('attacks the nearby living tribe member even with the retired player directly beside the predator', () => {
    const s = fixture(), u = s.tribe.members[0];
    u.pos = point(20, 0); s.player.pos = point(21, 0);
    const c = animal(s, 'crest', 21, 0), player = structuredClone(s.player);
    s.tick = 29;
    step(s, { ...EMPTY_INPUT, x: 1, feed: true, pulse: true }, DT);
    expect(c.intent).toBe('hunt'); expect(u.health).toBeLessThan(100);
    expect(s.player).toEqual(player);
    run(s, 4); expect(s.player).toEqual(player);
  });

  it('records one real prey death and one physical corpse with a new unique world ID', () => {
    const s = fixture(), prey = animal(s, 'gnaw', 20, 0, { health: 1, hunger: 0 });
    const predator = animal(s, 'crest', 21, 0), nextId = s.world.nextId;
    const deaths = s.world.deaths, hunted = s.world.patches[0].hunted, stock = s.tribe.food;
    s.tick = 29;
    until(s, () => !s.world.creatures.includes(prey), 2);
    expect(s.world.deaths).toBe(deaths + 1); expect(s.world.patches[0].hunted).toBe(hunted + 1);
    expect(predator.hunger).toBe(0); expect(s.tribe.food).toBe(stock);
    const meat = s.world.resources.filter(r => r.kind === 'meat');
    expect(meat).toHaveLength(1); expect(meat[0]).toMatchObject({ id: nextId, pos: prey.pos, amount: 5 });
    expect(s.world.nextId).toBe(nextId + 1);
    run(s, 4);
    expect(s.world.deaths).toBe(deaths + 1); expect(s.world.resources.filter(r => r.kind === 'meat')).toHaveLength(1);
    const ids = [...s.world.resources, ...s.world.creatures, ...s.world.obstacles].map(x => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it.each([481516, 20260913, 8675309])('continues native wildlife exactly through a save/load for seed %i', seed => {
    const s = fixture({ seed, legacy: false, isolated: false });
    const starts = new Map(s.world.creatures.map(c => [c.id, { ...c.pos }])), player = structuredClone(s.player);
    run(s, 7);
    expect(s.world.creatures.some(c => starts.has(c.id) && horizontalDistance(c.pos, starts.get(c.id)!) > 2)).toBe(true);
    const loaded = parseGame(serializeGame(s)) as TribeGame;
    expect(loaded).toEqual(s); expect(loaded.world).toBe(loaded.worlds[2]);
    for (let frame = 0; frame < 900; frame++) { step(s, EMPTY_INPUT, DT); step(loaded, EMPTY_INPUT, DT); }
    expect(loaded).toEqual(s); expect(s.player).toEqual(player);
    expect(s.tribe.elapsed).toBeCloseTo(22, 8);
    expect(parseGame(serializeGame(s))).toEqual(s);
  });
});

describe('inherited ecology references after actual tribe-era deaths', () => {
  it.each(['wildlife', 'tribe'] as const)('preserves a valid modern save when %s kills a root-fragment carrier', killer => {
    const s = fixture({ legacy: false, jaw: killer === 'tribe' });
    const carrier = animal(s, 'gnaw', 20, -42, { health: 1, hunger: 0 });
    s.journey.rootDispersal!.carried.push({ carrierId: carrier.id, site: 6, origin: { ...s.journey.sites[6].source }, vitality: 12 });
    if (killer === 'wildlife') animal(s, 'crest', 21, -42);
    else {
      const u = s.tribe.members[0]; u.pos = point(20, -42);
      expect(issueTribeOrder(s, [u.id], 'attack', { kind: 'creature', id: carrier.id }).ok).toBe(true);
    }
    s.tick = 29; makeCheckpoint(s);
    expect(parseGame(serializeGame(s))).toEqual(s);
    until(s, () => !s.world.creatures.includes(carrier), 5);
    expect(s.journey.rootDispersal!.carried.some(f => f.carrierId === carrier.id)).toBe(false);
    expect(s.journey.rootDispersal!.roots).toHaveLength(0);
    expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('round-trips a killed remembered hunter without losing the surviving coastal history', () => {
    const s = fixture({ legacy: false, jaw: true }), hunter = animal(s, 'crest', 20, -42, { health: 1, hunger: 0 });
    const u = s.tribe.members[0]; u.pos = point(20, -42);
    s.journey.hunters.push({ stage: 2, id: hunter.id, phase: 'recover', time: 1, aim: point(21, -42), feedingHome: point(28, -42) });
    const history = structuredClone(s.journey.sites), home = { ...tribeHome(s.tribe) };
    expect(issueTribeOrder(s, [u.id], 'attack', { kind: 'creature', id: hunter.id }).ok).toBe(true);
    makeCheckpoint(s); expect(parseGame(serializeGame(s))).toEqual(s);
    until(s, () => !s.world.creatures.includes(hunter), 5);
    const loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s); expect(loaded.journey.sites).toEqual(history);
    expect(tribeHome(s.tribe)).toEqual(home);
  });
});
