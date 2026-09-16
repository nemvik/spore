import { describe, expect, it } from 'vitest';
import { initialVehicle, vehicleCost } from '../src/game/blueprint';
import type { ActiveMachineState, ActiveTribeState, LegacyAbility, MachineUnit } from '../src/game/era-types';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { buildMachine, issueMachineOrder, machineDesign, machineHome, machinesReady, retireMachine } from '../src/game/machines';
import { parseGame, serializeGame } from '../src/game/persistence';
import { horizontalDistance } from '../src/game/random';
import { continueToMachinesEra, continueToPlanetEra, continueToTribeEra, createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import type { GameState } from '../src/game/types';
import { EMPTY_INPUT } from '../src/game/types';
import { createWorld } from '../src/game/world';

type MachineGame = GameState & { tribe: ActiveTribeState; machines: ActiveMachineState };
const DT = 1 / 30;

/** Earlier coast/tribe completion is prepared, not a claimed full campaign.
 * The regression below starts P2 with the real 100 amber entry budget; all
 * fleet expansion, income, movement and territorial progress then use actions. */
function game(archetype: LegacyAbility = 'restoration', preparedStock?: number): MachineGame {
  const s = createGame(481516, false, true, true, true);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world; initializeJourneyStage(s);
  }
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `retirement-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  s.player.health = computeStats(s.player.genome).maxHealth; s.player.totalDna = 300;
  s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  Object.assign(s.campaign, { won: true, finale: archetype });
  expect(continueToTribeEra(s)).toBe(true);
  const tribe = s.tribe as ActiveTribeState;
  tribe.neighbours.forEach(n => { n.resolved = 'allied'; n.relation = 100; }); tribe.completed = true;
  expect(continueToMachinesEra(s)).toBe(true);
  if (preparedStock !== undefined) (s.machines as ActiveMachineState).resource = preparedStock;
  makeCheckpoint(s); return s as MachineGame;
}

function until(s: MachineGame, done: () => boolean, seconds = 360): void {
  for (let tick = 0; tick < seconds / DT && !done() && !s.deathReason; tick++) step(s, EMPTY_INPUT, DT);
  expect(done(), `Timed out: ${JSON.stringify({ death: s.deathReason, fleet: s.machines.fleet, regions: s.machines.regions, resource: s.machines.resource })}`).toBe(true);
}

function build(s: MachineGame, carrier: 'tank' | 'air' = 'tank'): MachineUnit {
  expect(buildMachine(s, initialVehicle(carrier, s.machines.archetype)).ok).toBe(true);
  return s.machines.fleet.at(-1)!;
}

function home(s: MachineGame, u: MachineUnit): void {
  expect(issueMachineOrder(s, [u.id], 'move', { kind: 'point', pos: { ...machineHome(s) } }).ok).toBe(true);
  until(s, () => u.orders.length === 0);
  expect(horizontalDistance(u.pos, machineHome(s))).toBeLessThanOrEqual(1.05);
}

function expectPersistent(s: MachineGame): void {
  makeCheckpoint(s);
  const loaded = parseGame(serializeGame(s)); expect(loaded).toEqual(s); expect(loaded.world).toBe(loaded.worlds[2]);
  const recovered = recoverGeneration({ ...loaded, deathReason: 'Prepared recovery check' });
  expect(recovered.machines).toEqual(s.machines); expect(recovered.stage).toBe(s.stage);
  expect(parseGame(serializeGame(recovered)).machines).toEqual(s.machines);
}

describe('machine retirement releases a full fleet without losing the campaign', () => {
  it('earns eight tanks, retires one at home, builds an aircraft and completes the inaccessible highland', () => {
    const s = game(), m = s.machines, tank = build(s);
    for (const spring of m.springs.slice(0, 2)) {
      expect(issueMachineOrder(s, [tank.id], 'gather', { kind: 'spring', id: spring.id }).ok).toBe(true);
      until(s, () => spring.owner === 'player');
    }
    for (const region of m.regions.slice(0, 2)) {
      expect(issueMachineOrder(s, [tank.id], 'build', { kind: 'region', id: region.id }).ok).toBe(true);
      until(s, () => region.owner === 'player');
    }
    while (m.fleet.length < 8) {
      until(s, () => m.resource >= vehicleCost(initialVehicle('tank', 'restoration'))); build(s);
    }
    until(s, () => m.resource >= vehicleCost(initialVehicle('air', 'restoration')));
    expect(m.fleet.every(u => machineDesign(m, u).carrier === 'tank')).toBe(true);
    expect(m.airUnlocked).toBe(true); expect(m.completed).toBe(false);
    const blocked = structuredClone(s);
    expect(buildMachine(s, initialVehicle('air', 'restoration')).ok).toBe(false);
    expect(issueMachineOrder(s, [tank.id], 'build', { kind: 'region', id: m.regions[2].id }).ok).toBe(false);
    expect(s).toEqual(blocked);

    home(s, tank);
    const resource = m.resource, designs = structuredClone(m.blueprints), nextId = m.nextId;
    const refund = Math.floor(vehicleCost(machineDesign(m, tank)) * .35);
    expect(retireMachine(s, tank.id).ok).toBe(true);
    expect(m.resource).toBe(resource + refund); expect(m.fleet).toHaveLength(7);
    expect(m.blueprints).toEqual(designs); expect(m.nextId).toBe(nextId);
    expectPersistent(s);

    const air = build(s, 'air'); expect(air.id).toBeGreaterThan(tank.id);
    expect(issueMachineOrder(s, [air.id], 'build', { kind: 'region', id: m.regions[2].id }).ok).toBe(true);
    until(s, () => m.completed);
    expect(machinesReady(s)).toBe(true); expect(m.regions[2].owner).toBe('player');
    expect(m.fleet).toHaveLength(8); expectPersistent(s);
    expect(continueToPlanetEra(s)).toBe(true); expect(s.stage).toBe(5); expectPersistent(s);
  });
});

describe('retirement pays one conservative refund and preserves saved references', () => {
  it.each([['restoration', 12], ['migration', 8]] as const)('returns a genuinely purchased %s delivery at its %i amber price', (archetype, price) => {
    const s = game(archetype, 200), u = build(s), survivor = build(s); home(s, u);
    const resource = s.machines.resource;
    expect(issueMachineOrder(s, [u.id], archetype === 'restoration' ? 'build' : 'socialize', { kind: 'region', id: s.machines.regions[0].id }).ok).toBe(true);
    step(s, EMPTY_INPUT, DT);
    expect(u.cargo).toBe(1); expect(s.machines.resource).toBe(resource - price);
    expect(horizontalDistance(u.pos, machineHome(s))).toBeLessThan(12);
    const imported = parseGame(serializeGame(s)) as MachineGame;
    const before = structuredClone(imported), refund = Math.floor(vehicleCost(machineDesign(imported.machines, u)) * .35) + price;
    expect(retireMachine(imported, u.id).ok).toBe(true);
    expect(imported.machines.resource).toBe(before.machines.resource + refund);
    expect(imported.machines.fleet).toEqual([before.machines.fleet.find(v => v.id === survivor.id)]);
    expect(imported.machines.blueprints).toEqual(before.machines.blueprints);
    expect(imported.machines.nextId).toBe(before.machines.nextId);
    const once = structuredClone(imported);
    expect(retireMachine(imported, u.id).ok).toBe(false); expect(imported).toEqual(once);
    expectPersistent(imported);
  });

  it('refunds only the blueprint salvage price for a predator machine', () => {
    const s = game('predator', 200), u = build(s); build(s); home(s, u);
    // A legacy cargo flag is schema-valid, but predator actions never paid for it.
    u.cargo = 1;
    const resource = s.machines.resource, refund = Math.floor(vehicleCost(machineDesign(s.machines, u)) * .35);
    expect(retireMachine(s, u.id).ok).toBe(true); expect(s.machines.resource).toBe(resource + refund);
    expectPersistent(s);
  });

  it('accepts the inclusive 12-metre boundary and clamps the refund to the persisted resource maximum', () => {
    const s = game('restoration', 200), u = build(s); build(s);
    u.pos = { ...machineHome(s), x: machineHome(s).x + 12 }; s.machines.resource = 1e9 - 1; u.cargo = 1;
    expect(retireMachine(s, u.id).ok).toBe(true); expect(s.machines.resource).toBe(1e9);
    expectPersistent(s);
  });
});

describe('invalid machine retirement is atomic', () => {
  it.each(['too far', 'missing', 'dead', 'last live', 'stage 5', 'death screen'] as const)('rejects %s without changing inventory, orders, references or amber', reason => {
    const s = game('restoration', 200), u = build(s), other = build(s); home(s, u);
    let id = u.id;
    if (reason === 'too far') u.pos = { ...machineHome(s), x: machineHome(s).x + 12.001 };
    if (reason === 'missing') id = s.machines.nextId + 100;
    if (reason === 'dead') u.health = 0;
    if (reason === 'last live') other.health = 0;
    if (reason === 'stage 5') {
      s.machines.regions.forEach(r => { r.owner = 'player'; r.method = 'restoration'; });
      s.machines.springs.slice(0, 2).forEach(p => { p.owner = 'player'; p.progress = 1; });
      s.machines.airUnlocked = true; s.machines.completed = true; expect(continueToPlanetEra(s)).toBe(true);
    }
    if (reason === 'death screen') s.deathReason = 'Prepared death';
    makeCheckpoint(s);
    const imported = parseGame(serializeGame(s)) as MachineGame, before = structuredClone(imported);
    expect(retireMachine(imported, id).ok).toBe(false); expect(imported).toEqual(before);
  });
});
