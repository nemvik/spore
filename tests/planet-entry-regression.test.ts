import { describe, expect, it } from 'vitest';
import { initialVehicle, vehicleCost } from '../src/game/blueprint';
import { getClimate } from '../src/game/climate';
import type { ActiveMachineState, ActivePlanetState, ActiveTribeState, LegacyAbility } from '../src/game/era-types';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { buildMachine, createMachines, issueMachineOrder, machineDesign, machineHome, stepMachines } from '../src/game/machines';
import { parseGame, serializeGame } from '../src/game/persistence';
import { introducePlanetLife, planetVehicle, removePlanetLife, retirePlanetVehicle } from '../src/game/planet';
import { groundHeight } from '../src/game/random';
import { continueToPlanetEra, createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import { createTribe } from '../src/game/tribe';
import type { GameState } from '../src/game/types';
import { createWorld } from '../src/game/world';

type MachineGame = GameState & { tribe: ActiveTribeState; machines: ActiveMachineState };
type PlanetGame = MachineGame & { planet: ActivePlanetState };

/** Prepared earlier campaign completion, not a claimed earned playthrough.
 * Construction, cargo purchase, era entry and retirement use public actions.
 * Imported wrecks are a valid save shape even though normal P2 steps remove them. */
function machineFixture(archetype: LegacyAbility = 'restoration', units = 2): MachineGame {
  const s = createGame(481516, false, true, true, true);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world; initializeJourneyStage(s);
  }
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `entry-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  s.player.health = computeStats(s.player.genome).maxHealth; s.player.totalDna = 300;
  s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  Object.assign(s.campaign, { won: true, finale: archetype });
  s.tribe = createTribe(s); s.tribe.completed = true; s.tribe.neighbours.forEach(n => { n.resolved = 'allied'; });
  s.machines = createMachines(s); s.stage = 4; s.machines.resource = 1000;
  for (let i = 0; i < units; i++) expect(buildMachine(s, initialVehicle('tank', archetype)).ok).toBe(true);
  return s as MachineGame;
}

function importCompleted(s: MachineGame): MachineGame {
  s.machines.regions.forEach(r => { r.owner = 'player'; r.method = s.machines.archetype; });
  s.machines.springs.slice(0, 2).forEach(spring => { spring.owner = 'player'; spring.progress = 1; });
  s.machines.airUnlocked = true; s.machines.completed = true; makeCheckpoint(s);
  return parseGame(serializeGame(s)) as MachineGame;
}

function enter(s: MachineGame): PlanetGame {
  expect(continueToPlanetEra(s)).toBe(true);
  return s as PlanetGame;
}

function expectSaveAndRecovery(s: PlanetGame): void {
  const loaded = parseGame(serializeGame(s)) as PlanetGame;
  expect(loaded).toEqual(s); expect(loaded.world).toBe(loaded.worlds[2]);
  expect(planetVehicle(loaded)?.health).toBeGreaterThan(0);
  const recovered = recoverGeneration({ ...loaded, deathReason: 'Prepared recovery check' }) as PlanetGame;
  expect(recovered.stage).toBe(5); expect(recovered.world).toBe(recovered.worlds[2]);
  expect(recovered.machines).toEqual(s.machines); expect(recovered.planet).toEqual(s.planet);
  expect(parseGame(serializeGame(recovered)).planet).toEqual(s.planet);
}

describe('P3 entry and retirement keep a live selected machine', () => {
  it('imports a valid dead-first P2 fleet and selects the surviving machine before saving its entry checkpoint', () => {
    const prepared = machineFixture(), dead = prepared.machines.fleet[0], survivor = prepared.machines.fleet[1];
    dead.health = 0;
    const imported = importCompleted(prepared), designs = structuredClone(imported.machines.blueprints);
    expect(imported.machines.fleet.map(u => u.health > 0)).toEqual([false, true]);
    const s = enter(imported);
    expect(s.machines.fleet.map(u => u.id)).toEqual([survivor.id]);
    expect(s.machines.blueprints).toEqual(designs); expect(s.planet.activeMachine).toBe(survivor.id);
    expect(planetVehicle(s)?.id).toBe(survivor.id); expectSaveAndRecovery(s);
  });

  it('refuses to retire the last live machine even when a valid imported wreck remains in the fleet', () => {
    const s = enter(importCompleted(machineFixture()));
    s.machines.fleet[1].health = 0; planetVehicle(s)!.pos = { ...machineHome(s) }; makeCheckpoint(s);
    const imported = parseGame(serializeGame(s)) as PlanetGame, before = structuredClone(imported);
    expect(retirePlanetVehicle(imported).ok).toBe(false);
    expect(imported).toEqual(before); expectSaveAndRecovery(imported);
  });

  it('skips an earlier wreck when retiring one of two living machines and preserves the remaining design', () => {
    const s = enter(importCompleted(machineFixture('restoration', 3)));
    const [wreck, retiring, survivor] = s.machines.fleet;
    wreck.health = 0; s.planet.activeMachine = retiring.id; s.planet.toolOn = true;
    retiring.pos = { ...machineHome(s) }; makeCheckpoint(s);
    const imported = parseGame(serializeGame(s)) as PlanetGame;
    const resource = imported.machines.resource, refund = Math.floor(vehicleCost(machineDesign(imported.machines, retiring)) * .35);
    const designs = structuredClone(imported.machines.blueprints);
    expect(retirePlanetVehicle(imported).ok).toBe(true);
    expect(imported.machines.fleet.some(u => u.id === retiring.id)).toBe(false);
    expect(imported.planet.activeMachine).toBe(survivor.id); expect(planetVehicle(imported)?.id).toBe(survivor.id);
    expect(imported.planet.toolOn).toBe(false); expect(imported.machines.resource).toBe(resource + refund);
    expect(imported.machines.blueprints).toEqual(designs);
    makeCheckpoint(imported); expectSaveAndRecovery(imported);
  });
});

describe('P3 entry returns the paid P2 cargo balance once', () => {
  it.each([['restoration', 12], ['migration', 8]] as const)('refunds only the living %s machines at their actual %i amber cargo price', (archetype, price) => {
    const prepared = machineFixture(archetype, 3), home = machineHome(prepared), beforePurchase = prepared.machines.resource;
    prepared.machines.fleet.forEach(u => { u.pos = { ...home }; });
    expect(issueMachineOrder(prepared, prepared.machines.fleet.map(u => u.id), archetype === 'restoration' ? 'build' : 'socialize', { kind: 'region', id: prepared.machines.regions[0].id }).ok).toBe(true);
    stepMachines(prepared, 1 / 30);
    expect(prepared.machines.fleet.map(u => u.cargo)).toEqual([1, 1, 1]);
    expect(prepared.machines.resource).toBe(beforePurchase - 3 * price);
    // Completion is prepared while two paid deliveries remain unused; the
    // third loaded machine is a wreck and its cargo cannot create a refund.
    prepared.machines.fleet[0].health = 0;
    const imported = importCompleted(prepared), resource = imported.machines.resource;
    const designs = structuredClone(imported.machines.blueprints), s = enter(imported);
    expect(s.machines.resource).toBe(resource + 2 * price); expect(s.machines.fleet).toHaveLength(2);
    expect(s.machines.fleet.every(u => u.cargo === 0 && u.orders.length === 0 && u.intent === 'rest')).toBe(true);
    expect(s.machines.blueprints).toEqual(designs); expectSaveAndRecovery(s);
    const once = structuredClone(s); expect(continueToPlanetEra(s)).toBe(false); expect(s).toEqual(once);
  });

  it('does not invent a cargo refund for the predator strategy', () => {
    const prepared = machineFixture('predator');
    // Schema accepts an obsolete cargo flag; predator combat did not buy it.
    prepared.machines.fleet[0].cargo = 1;
    const imported = importCompleted(prepared), resource = imported.machines.resource, s = enter(imported);
    expect(s.machines.resource).toBe(resource); expect(s.machines.fleet.every(u => u.cargo === 0)).toBe(true);
    expectSaveAndRecovery(s);
  });

  it('keeps a refund within the persisted resource maximum', () => {
    const prepared = machineFixture(); prepared.machines.resource = 1e9 - 1; prepared.machines.fleet[0].cargo = 1;
    const s = enter(importCompleted(prepared));
    expect(s.machines.resource).toBe(1e9); expect(s.machines.fleet[0].cargo).toBe(0); expectSaveAndRecovery(s);
  });
});

describe('P3 climate uses current roots before any renderer world-stage projection', () => {
  it('ignores historical spring credit and derives changing water from actual living planet roots without mutation', () => {
    const s = enter(importCompleted(machineFixture()));
    s.world.landmarks.filter(l => l.kind === 'spring').forEach(l => { l.charge = 10; }); s.campaign.drought = 1;
    const springSupport = () => getClimate(s).springs.find(spring => spring.id === 'spring-0')!;
    const before = structuredClone(s);
    expect(springSupport().support).toBe(0); expect(springSupport().water).toBe(0);
    expect(getClimate({ ...s, stage: s.world.stage }).springs.find(spring => spring.id === 'spring-0')!.support).toBe(1);
    expect(s).toEqual(before);

    // Prepared research and climate isolate water projection. The roots still
    // enter through the paid public introduction action and actual resources.
    s.journey.ecology!.contacts = [
      { key: 'culture:6', stage: 2, patch: 0, method: 'culture' },
      { key: 'culture:7', stage: 2, patch: 1, method: 'culture' },
    ];
    Object.assign(s.planet, { temperature: .4, atmosphere: -.4, tScore: 2 });
    const biome = s.planet.biomes[0];
    planetVehicle(s)!.pos = { ...biome.pos, y: groundHeight(biome.pos.x, biome.pos.z, 2) + 15 };
    expect(introducePlanetLife(s, biome.id, 'culture:6').ok).toBe(true);
    expect(introducePlanetLife(s, biome.id, 'culture:7').ok).toBe(true);
    expect(springSupport().support).toBe(.75); expect(springSupport().water).toBe(.75);
    s.planet.stabilizers[0].site.vitality = 25;
    const stressed = structuredClone(s); expect(springSupport().support).toBe(.25); expect(s).toEqual(stressed);
    expect(removePlanetLife(s, s.planet.stabilizers[0].id).ok).toBe(true);
    expect(springSupport().support).toBe(0); expect(springSupport().water).toBe(0);
    makeCheckpoint(s); expectSaveAndRecovery(s);
  });
});
