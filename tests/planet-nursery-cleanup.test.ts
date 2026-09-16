import { describe, expect, it } from 'vitest';
import { initialVehicle } from '../src/game/blueprint';
import type { ActiveMachineState, ActivePlanetState, ActiveTribeState } from '../src/game/era-types';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { buildMachine, machineHome } from '../src/game/machines';
import { parseGame, serializeGame } from '../src/game/persistence';
import { introducePlanetLife, planetVehicle, preparePlanetNursery, samplePlanetLife } from '../src/game/planet';
import { horizontalDistance } from '../src/game/random';
import { continueToMachinesEra, continueToPlanetEra, continueToTribeEra, createGame, makeCheckpoint, step } from '../src/game/simulation';
import { removeTribePrey } from '../src/game/tribe-wildlife';
import type { GameState, Resource } from '../src/game/types';
import { EMPTY_INPUT } from '../src/game/types';
import { createWorld } from '../src/game/world';

type PlanetGame = GameState & { tribe: ActiveTribeState; machines: ActiveMachineState; planet: ActivePlanetState };

/** Prepared earlier campaign completion and local extinction isolate cleanup.
 * Actual factories create every era, the paid aircraft and the two mothers.
 * Empty food and prepared sampling positions keep each consumption observable. */
function game(): PlanetGame {
  const s = createGame(481516, false, true, true, true);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world; initializeJourneyStage(s);
  }
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `cleanup-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  s.player.health = computeStats(s.player.genome).maxHealth; s.player.totalDna = 300;
  s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  Object.assign(s.campaign, { won: true, finale: 'restoration' });
  expect(continueToTribeEra(s)).toBe(true);
  const tribe = s.tribe as ActiveTribeState;
  tribe.neighbours.forEach(n => { n.resolved = 'allied'; n.relation = 100; }); tribe.completed = true;
  expect(continueToMachinesEra(s)).toBe(true);
  const machines = s.machines as ActiveMachineState;
  machines.regions.forEach(r => { r.owner = 'player'; r.method = 'restoration'; });
  machines.springs.slice(0, 2).forEach(p => { p.owner = 'player'; p.progress = 1; });
  machines.airUnlocked = true; machines.completed = true;
  expect(buildMachine(s, initialVehicle('air', 'restoration')).ok).toBe(true);
  expect(continueToPlanetEra(s)).toBe(true);
  s.world.creatures = []; s.journey.rootDispersal!.carried = [];
  s.world.resources.forEach(r => { r.amount = 0; });
  planetVehicle(s)!.pos = { ...machineHome(s) };
  makeCheckpoint(s); return s as PlanetGame;
}

function persist(s: PlanetGame): void {
  makeCheckpoint(s);
  expect(parseGame(serializeGame(s))).toEqual(s);
}

describe('paid planet nursery reuses unowned food without moving it', () => {
  it.each(['bell', 'gnaw'])('consumes three real portions for %s and reuses the food ID after the animal dies', species => {
    const s = game(), stock = s.machines.resource, resourceIds = new Set(s.world.resources.map(r => r.id));
    expect(preparePlanetNursery(s, species).ok).toBe(true);
    const animal = s.world.creatures[0], snack = s.world.resources.find(r => !resourceIds.has(r.id))!;
    expect(snack).toMatchObject({ kind: 'nectar', amount: 3, max: 3, regen: 0 });
    expect(s.machines.resource).toBe(stock - 8);
    // Only position is prepared; each sample consumes actual compatible food.
    planetVehicle(s)!.pos = { ...animal.pos, y: animal.pos.y + 15 };
    for (let portion = 1; portion <= 3; portion++) {
      expect(samplePlanetLife(s, { kind: 'creature', id: animal.id }).ok).toBe(true);
      expect(snack.amount).toBe(3 - portion);
    }
    expect(s.journey.ecology!.contacts.some(c => c.key === `species:${species}`)).toBe(true);
    // Use the same death cleanup as a real predator kill; no manual removal.
    removeTribePrey(s, animal); planetVehicle(s)!.pos = { ...machineHome(s) };
    const nextId = s.world.nextId, count = s.world.resources.length, foodPosition = { ...snack.pos };
    expect(preparePlanetNursery(s, species).ok).toBe(true);
    const replacement = s.world.creatures[0];
    expect(replacement.id).not.toBe(animal.id); expect(s.world.nextId).toBe(nextId + 1);
    expect(s.world.resources).toHaveLength(count); expect(s.world.resources.find(r => r.id === snack.id)).toBe(snack);
    expect(snack.amount).toBe(3); expect(snack.pos).toEqual(foodPosition);
    expect(horizontalDistance(snack.pos, replacement.pos)).toBeLessThanOrEqual(8);
    expect(s.machines.resource).toBe(stock - 16); expect(s.world.births).toBe(2); expect(s.world.deaths).toBe(1);
    const once = structuredClone(s); expect(preparePlanetNursery(s, species).ok).toBe(false); expect(s).toEqual(once);
    persist(s);
  });

  it('tops up an unowned partially consumed portion without moving it or granting free nursery care', () => {
    const s = game(), snack: Resource = { id: s.world.nextId++, kind: 'nectar', amount: 1.2, max: 3, regen: 0, patch: 0, pos: { ...s.planet.nursery.pos } };
    s.world.resources.push(snack);
    const count = s.world.resources.length, nextId = s.world.nextId, position = { ...snack.pos }, stock = s.machines.resource;
    expect(preparePlanetNursery(s, 'bell').ok).toBe(true);
    expect(s.world.resources).toHaveLength(count); expect(s.world.nextId).toBe(nextId + 1);
    expect(snack.amount).toBe(3); expect(snack.pos).toEqual(position); expect(s.machines.resource).toBe(stock - 8);
    expect(horizontalDistance(snack.pos, s.world.creatures[0].pos)).toBeLessThanOrEqual(8);
    persist(s);
  });

  it.each(['journey mother', 'journey planted roots', 'nursery mother', 'planet roots'] as const)('preserves %s even when its exhausted food matches the snack shape', kind => {
    const s = game(); let protectedFood: Resource;
    if (kind === 'journey mother') protectedFood = s.world.resources.find(r => r.id === s.journey.sites.find(site => site.id === 6)!.sourceId)!;
    else if (kind === 'journey planted roots') {
      protectedFood = { id: s.world.nextId++, kind: 'nectar', pos: { ...s.planet.nursery.pos }, amount: 0, max: 3, regen: 0, patch: 0 };
      s.world.resources.push(protectedFood); s.journey.sites.find(site => site.id === 6)!.plantedId = protectedFood.id;
    } else if (kind === 'nursery mother') protectedFood = s.world.resources.find(r => r.id === s.planet.nursery.sources[0].resourceId)!;
    else {
      s.journey.ecology!.contacts.push({ key: 'culture:6', stage: 2, patch: 0, method: 'culture' });
      Object.assign(s.planet, { temperature: .4, atmosphere: -.4, tScore: 2 });
      planetVehicle(s)!.pos = { ...s.planet.biomes[0].pos, y: s.planet.biomes[0].pos.y + 15 };
      expect(introducePlanetLife(s, 1, 'culture:6').ok).toBe(true);
      protectedFood = s.world.resources.find(r => r.id === s.planet.stabilizers[0].site.sourceId)!;
    }
    Object.assign(protectedFood, { amount: 0, max: 3, regen: 0, pos: { ...s.planet.nursery.pos } });
    if (kind === 'planet roots') {
      const site = s.planet.stabilizers[0].site; site.source = { ...protectedFood.pos }; site.refuges = [{ ...protectedFood.pos }];
    }
    planetVehicle(s)!.pos = { ...machineHome(s) };
    // The max=3 planet root is a defensive fixture outside the normal max=12
    // schema. Other three owners remain valid imported shapes at max=3.
    if (kind !== 'planet roots') persist(s);
    const before = structuredClone(protectedFood), count = s.world.resources.length, nextId = s.world.nextId;
    expect(preparePlanetNursery(s, 'bell').ok).toBe(true);
    expect(protectedFood).toEqual(before); expect(s.world.resources).toHaveLength(count + 1);
    expect(s.world.nextId).toBe(nextId + 2);
    if (kind === 'planet roots') protectedFood.max = 12;
    persist(s);
  });
});

describe('later-era wildlife bounds remains without removing ecological roots', () => {
  it('keeps exactly the newest 40 non-depleted corpses at the cleanup tick and still saves', () => {
    const s = game(), plantIds = s.world.resources.filter(r => r.kind !== 'meat').map(r => r.id);
    const references = structuredClone({ journey: s.journey.sites, nursery: s.planet.nursery });
    // Prepared long-lived carcass history isolates the periodic cleanup boundary.
    for (let i = 0; i < 70; i++) s.world.resources.push({ id: s.world.nextId++, kind: 'meat', amount: i % 7 === 0 ? .1 : i % 7 === 1 ? .2 : 5, max: 5, regen: 0, patch: 0, pos: { ...s.planet.nursery.pos } });
    const survivors = s.world.resources.filter(r => r.kind === 'meat' && r.amount >= .2).slice(-40).map(r => r.id);
    s.tick = 1799; step(s, EMPTY_INPUT, 1 / 60);
    expect(s.tick).toBe(1800); expect(s.world.resources.filter(r => r.kind === 'meat').map(r => r.id)).toEqual(survivors);
    expect(s.world.resources.filter(r => r.kind !== 'meat').map(r => r.id)).toEqual(plantIds);
    expect({ journey: s.journey.sites, nursery: s.planet.nursery }).toEqual(references);
    persist(s);
  });
});
