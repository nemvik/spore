import { describe, expect, it } from 'vitest';
import { initialVehicle, validateVehicle, vehicleCost, vehicleStats } from '../src/game/blueprint';
import type { Carrier, VehicleBlueprint } from '../src/game/blueprint';
import type { ActiveMachineState, ActiveTribeState, LegacyAbility, MachineUnit } from '../src/game/era-types';
import {
  buildMachine, createMachines, issueMachineOrder, machineDesign, machineHome, machineIncome,
  machineEconomyStranded, machinesReady, repairMachines, stepMachines, stopMachines,
} from '../src/game/machines';
import { groundHeight, horizontalDistance } from '../src/game/random';
import { createGame } from '../src/game/simulation';
import { createTribe } from '../src/game/tribe';
import type { GameState } from '../src/game/types';
import { MAX_UNIT_ORDERS } from '../src/game/unit-order';
import { createWorld } from '../src/game/world';

type MachineGame = GameState & { tribe: ActiveTribeState; machines: ActiveMachineState };
const DT = 1 / 30;

/** Prepared completed tribe, not an earned campaign playthrough. Production
 * construction retains the coast and adds its actual closed rock barrier.
 * After this fixture, activities use public actions and advancing simulation. */
function game(archetype: LegacyAbility = 'restoration', seed = 481516, resource = 100): MachineGame {
  const s = createGame(seed, true);
  for (const stage of [1, 2] as const) { s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world; }
  Object.assign(s.campaign, { won: true, finale: archetype, drought: .42 });
  s.tribe = createTribe(s); s.tribe.completed = true;
  for (const neighbour of s.tribe.neighbours) { neighbour.resolved = archetype === 'predator' ? 'conquered' : 'allied'; neighbour.relation = neighbour.resolved === 'allied' ? 100 : -100; }
  s.machines = createMachines(s); s.machines.resource = resource; s.stage = 4;
  return s as MachineGame;
}
function step(s: MachineGame, count = 1): void {
  for (let i = 0; i < count; i++) { s.tick++; s.world.time += DT; stepMachines(s, DT); }
}
function runUntil(s: MachineGame, done: () => boolean, seconds = 120, observe?: () => void): void {
  for (let tick = 0; tick < seconds / DT && !done() && !s.deathReason; tick++) { step(s); observe?.(); }
  expect(done(), `Condition not reached after ${seconds}s: ${JSON.stringify({ death: s.deathReason, fleet: s.machines.fleet.map(u => ({ id: u.id, pos: u.pos, intent: u.intent, health: u.health, cargo: u.cargo, orders: u.orders })), regions: s.machines.regions, resource: s.machines.resource })}`).toBe(true);
}
function design(s: MachineGame, carrier: Carrier = 'tank', armor = false): VehicleBlueprint {
  const g = initialVehicle(carrier, s.machines.archetype);
  if (armor) g.parts.push({ id: 'survival-armor', kind: 'armor', axial: -.3, angle: 0, scale: 1, mirrored: false });
  return g;
}
function build(s: MachineGame, carrier: Carrier = 'tank', armor = false): MachineUnit {
  const g = design(s, carrier, armor); expect(validateVehicle(g)).toEqual([]);
  expect(buildMachine(s, g).ok).toBe(true); return s.machines.fleet.at(-1)!;
}
function capture(s: MachineGame, u: MachineUnit, index = 0): void {
  const spring = s.machines.springs[index];
  expect(issueMachineOrder(s, [u.id], 'gather', { kind: 'spring', id: spring.id }).ok).toBe(true);
  runUntil(s, () => spring.owner === 'player', 120);
}
function regionOrder(s: MachineGame) { return s.machines.archetype === 'restoration' ? 'build' : s.machines.archetype === 'predator' ? 'attack' : 'socialize'; }
function home(s: MachineGame, u: MachineUnit): void {
  expect(issueMachineOrder(s, [u.id], 'move', { kind: 'point', pos: { ...machineHome(s) } }).ok).toBe(true);
  runUntil(s, () => u.orders.length === 0, 150); expect(horizontalDistance(u.pos, machineHome(s))).toBeLessThanOrEqual(1.05);
}

describe('paid machine construction and immutable designs', () => {
  it('pays the full blueprint price, deep-clones it and derives the actual unit health and motion', () => {
    const s = game(), draft = design(s), stock = s.machines.resource, inherited = structuredClone({ tribe: s.tribe, player: s.player, campaign: s.campaign });
    expect(buildMachine(s, draft).ok).toBe(true);
    const u = s.machines.fleet[0], saved = machineDesign(s.machines, u), stats = vehicleStats(draft);
    expect(s.machines.resource).toBe(stock - vehicleCost(draft)); expect(saved).toEqual(draft); expect(saved).not.toBe(draft); expect(saved.parts).not.toBe(draft.parts);
    expect(u.health).toBe(stats.durability); expect(u.blueprint).toBe(s.machines.blueprints[0].id); expect(u.id).not.toBe(u.blueprint);
    const before = structuredClone(saved); draft.name = 'Edited after build'; draft.parts[0].scale = .55; draft.parts.pop();
    expect(saved).toEqual(before); expect(u.health).toBe(stats.durability);
    expect({ tribe: s.tribe, player: s.player, campaign: s.campaign }).toEqual(inherited);
    const destination = { ...u.pos, x: u.pos.x + 5 }, start = { ...u.pos };
    expect(issueMachineOrder(s, [u.id], 'move', { kind: 'point', pos: destination }).ok).toBe(true);
    step(s); expect(horizontalDistance(start, u.pos)).toBeGreaterThan(0); expect(horizontalDistance(start, u.pos)).toBeLessThanOrEqual(stats.speed * DT + 1e-6);
  });

  it('charges an edited design as a new machine without replacing or refunding the first', () => {
    const s = game('restoration', 481516, 200), first = build(s), old = structuredClone(first), oldDesign = structuredClone(machineDesign(s.machines, first));
    const revised = structuredClone(oldDesign); revised.parts.at(-1)!.scale = 1.2; revised.hue = 190;
    const stock = s.machines.resource;
    expect(buildMachine(s, revised).ok).toBe(true);
    expect(s.machines.resource).toBe(stock - vehicleCost(revised)); expect(s.machines.fleet).toHaveLength(2); expect(s.machines.blueprints).toHaveLength(2);
    expect(first).toEqual(old); expect(machineDesign(s.machines, first)).toEqual(oldDesign);
    expect(s.machines.fleet[1].blueprint).not.toBe(first.blueprint);
  });

  it('rejects invalid, unaffordable and locked construction atomically, including IDs', () => {
    const s = game('restoration', 481516, 10), incomplete = design(s); incomplete.parts.pop();
    for (const draft of [design(s), incomplete, design(s, 'air')]) {
      const before = structuredClone(s); expect(buildMachine(s, draft).ok).toBe(false); expect(s).toEqual(before);
    }
    const full = game('migration', 481516, 1000);
    for (let i = 0; i < 8; i++) build(full);
    const before = structuredClone(full); expect(buildMachine(full, design(full)).ok).toBe(false); expect(full).toEqual(before);
  });

  it('reclaims historical wreck designs at the archive limit while retaining every live design and monotonic IDs', () => {
    const s = game('migration', 481516, 1000), first = build(s), second = build(s);
    // Prepared long-lived archive. Its entries represent already retired units;
    // the subsequent rejected and accepted builds use the public transaction.
    while (s.machines.blueprints.length < 64) s.machines.blueprints.push({ id: s.machines.nextId++, blueprint: structuredClone(machineDesign(s.machines, first)) });
    const previous = structuredClone(s), nextId = s.machines.nextId, stock = s.machines.resource;
    const invalid = design(s); invalid.parts.pop();
    expect(buildMachine(s, invalid).ok).toBe(false); expect(s).toEqual(previous);
    const live = s.machines.fleet.map(u => ({ unit: structuredClone(u), design: structuredClone(machineDesign(s.machines, u)) }));
    expect(buildMachine(s, design(s)).ok).toBe(true);
    expect(s.machines.fleet).toHaveLength(3); expect(s.machines.blueprints).toHaveLength(3);
    expect(s.machines.resource).toBe(stock - vehicleCost(design(s))); expect(s.machines.nextId).toBe(nextId + 2);
    expect(s.machines.blueprints.at(-1)!.id).toBe(nextId); expect(s.machines.fleet.at(-1)!.id).toBe(nextId + 1);
    for (const saved of live) {
      const unit = s.machines.fleet.find(u => u.id === saved.unit.id)!;
      expect(unit).toEqual(saved.unit); expect(machineDesign(s.machines, unit)).toEqual(saved.design);
    }
    expect(s.machines.blueprints.map(d => d.id)).toEqual([first.blueprint, second.blueprint, nextId]);
  });
});

describe('physical amber and supply logistics', () => {
  it('requires a tank to reach and work a spring before starting continuous income', () => {
    const s = game(), u = build(s), spring = s.machines.springs[0], stock = s.machines.resource;
    expect(horizontalDistance(u.pos, spring.pos)).toBeGreaterThan(3);
    expect(issueMachineOrder(s, [u.id], 'gather', { kind: 'spring', id: spring.id }).ok).toBe(true);
    step(s); expect(spring.progress).toBe(0); expect(machineIncome(s.machines)).toBe(0); expect(s.machines.resource).toBe(stock);
    runUntil(s, () => spring.progress > 0, 60);
    expect(horizontalDistance(u.pos, spring.pos)).toBeLessThanOrEqual(3.05); expect(spring.owner).toBe('neutral'); expect(s.machines.resource).toBe(stock);
    const started = s.machines.elapsed; runUntil(s, () => spring.owner === 'player', 20);
    expect(s.machines.elapsed - started).toBeGreaterThan(15); expect(u.orders).toHaveLength(0);
    expect(machineIncome(s.machines)).toBe(spring.rate); const capturedStock = s.machines.resource;
    step(s, 300); expect(s.machines.resource).toBeCloseTo(capturedStock + spring.rate * 10, 7);
    expect(s.machines.airUnlocked).toBe(false);
    const before = structuredClone(s); expect(buildMachine(s, design(s, 'air')).ok).toBe(false); expect(s).toEqual(before);
  });

  it.each(['restoration', 'migration'] as const)('performs paid physical round trips for %s instead of remote deliveries', archetype => {
    const s = game(archetype), u = build(s), region = s.machines.regions[0], stock = s.machines.resource;
    expect(issueMachineOrder(s, [u.id], regionOrder(s), { kind: 'region', id: region.id }).ok).toBe(true);
    let loads = 0, deliveries = 0, priorCargo = 0, priorStock = stock, farthestFromHome = 0;
    runUntil(s, () => region.owner === 'player', 250, () => {
      farthestFromHome = Math.max(farthestFromHome, horizontalDistance(u.pos, machineHome(s)));
      if (u.cargo > priorCargo) { loads++; expect(horizontalDistance(u.pos, machineHome(s))).toBeLessThanOrEqual(5.2); expect(priorStock - s.machines.resource).toBe(archetype === 'restoration' ? 12 : 8); }
      if (u.cargo < priorCargo) { deliveries++; expect(horizontalDistance(u.pos, region.pos)).toBeLessThanOrEqual(4.05); }
      if (u.cargo === priorCargo) expect(s.machines.resource).toBe(priorStock);
      priorCargo = u.cargo; priorStock = s.machines.resource;
    });
    expect(loads).toBe(archetype === 'restoration' ? 2 : 3); expect(deliveries).toBe(loads);
    expect(s.machines.resource).toBe(stock - 24); expect(farthestFromHome).toBeGreaterThan(20); expect(u.cargo).toBe(0);
    if (archetype === 'restoration') { expect(region.soil).toBe(100); expect(region.settlers).toBe(2); expect(region.deliveries).toBe(0); }
    else { expect(region.relation).toBe(100); expect(region.deliveries).toBe(3); expect(region.settlers).toBe(0); }
  });
});

describe('machine campaign strategies and actual terrain', () => {
  it.each(['restoration', 'predator', 'migration'] as const)('completes gardens, terraces and the enclosed highlands through %s', archetype => {
    const s = game(archetype), tank = build(s, 'tank', archetype === 'predator');
    const barrier = s.world.obstacles.filter(obstacle => s.machines.barrierIds.includes(obstacle.id));
    expect(barrier).toHaveLength(16); expect(barrier.every(o => o.kind === 'rock' && o.height >= 9)).toBe(true);
    expect(machinesReady(s)).toBe(false); expect(s.machines.airUnlocked).toBe(false);
    const locked = structuredClone(s); expect(buildMachine(s, design(s, 'air')).ok).toBe(false); expect(s).toEqual(locked);
    capture(s, tank);
    for (const region of s.machines.regions.slice(0, 2)) {
      expect(issueMachineOrder(s, [tank.id], regionOrder(s), { kind: 'region', id: region.id }).ok).toBe(true);
      runUntil(s, () => region.owner === 'player', 300);
      expect(region.method).toBe(archetype); expect(s.machines.airUnlocked).toBe(true); expect(s.deathReason).toBeNull();
      if (archetype === 'predator') { expect(region.health).toBe(0); expect(tank.health).toBeLessThan(vehicleStats(machineDesign(s.machines, tank)).durability); home(s, tank); expect(repairMachines(s, [tank.id]).ok).toBe(true); }
      else expect(region.health).toBeGreaterThan(0);
    }
    capture(s, tank, 1);
    const highlands = s.machines.regions[2], before = structuredClone(s);
    expect(issueMachineOrder(s, [tank.id], regionOrder(s), { kind: 'region', id: highlands.id }).ok).toBe(false); expect(s).toEqual(before);
    expect(issueMachineOrder(s, [tank.id], 'move', { kind: 'point', pos: { ...highlands.pos } }).ok).toBe(true);
    let nearestSummit = Infinity, barrierClearance = Infinity;
    for (let frame = 0; frame < 3600; frame++) {
      step(s); nearestSummit = Math.min(nearestSummit, horizontalDistance(tank.pos, highlands.pos));
      for (const obstacle of barrier) barrierClearance = Math.min(barrierClearance, horizontalDistance(tank.pos, obstacle.pos) - obstacle.radius - 1.1);
    }
    expect(nearestSummit).toBeGreaterThan(6); expect(barrierClearance).toBeGreaterThanOrEqual(-1e-5); expect(highlands.owner).toBe('neutral');
    expect(barrier.every(o => horizontalDistance(tank.pos, o.pos) >= o.radius + 1.1 - 1e-5)).toBe(true); stopMachines(s, [tank.id]);
    runUntil(s, () => s.machines.resource >= vehicleCost(design(s, 'air')) + 24, 180);
    const air = build(s, 'air'), rejected = structuredClone(s);
    expect(issueMachineOrder(s, [air.id], 'gather', { kind: 'spring', id: s.machines.springs[2].id }).ok).toBe(false); expect(s).toEqual(rejected);
    expect(issueMachineOrder(s, [tank.id, air.id], 'gather', { kind: 'spring', id: s.machines.springs[2].id }).ok).toBe(false); expect(s).toEqual(rejected);
    expect(issueMachineOrder(s, [air.id], regionOrder(s), { kind: 'region', id: highlands.id }).ok).toBe(true);
    let crossedBarrier = false;
    runUntil(s, () => highlands.owner === 'player', 250, () => {
      if (barrier.some(o => horizontalDistance(air.pos, o.pos) < o.radius + 1.1)) { crossedBarrier = true; expect(air.pos.y).toBeGreaterThan(groundHeight(air.pos.x, air.pos.z, 2) + 14); }
    });
    expect(crossedBarrier).toBe(true); expect(highlands.method).toBe(archetype); expect(machinesReady(s)).toBe(true); expect(s.machines.completed).toBe(true); expect(s.deathReason).toBeNull();
  }, 20000);
});

describe('machine orders, repairs and recovery', () => {
  it('rejects stale selections, incompatible targets, invalid points and full queues without partial changes', () => {
    const s = game(), u = build(s), target = { kind: 'point' as const, pos: { ...machineHome(s) } };
    for (const attempt of [
      () => issueMachineOrder(s, [u.id, 999999], 'move', target),
      () => issueMachineOrder(s, [u.id], 'attack', target),
      () => issueMachineOrder(s, [u.id], 'move', { kind: 'point', pos: { x: 77, y: 0, z: 0 } }),
      () => issueMachineOrder(s, [u.id], 'move', { kind: 'point', pos: { x: 0, y: NaN, z: 0 } }),
      () => issueMachineOrder(s, [u.id], 'gather', { kind: 'spring', id: 999999 }),
      () => issueMachineOrder(s, [u.id], 'attack', { kind: 'region', id: s.machines.regions[0].id }),
    ]) { const before = structuredClone(s); expect(attempt().ok).toBe(false); expect(s).toEqual(before); }
    for (let i = 0; i < MAX_UNIT_ORDERS; i++) expect(issueMachineOrder(s, [u.id], 'move', target, true).ok).toBe(true);
    const before = structuredClone(s); expect(issueMachineOrder(s, [u.id], 'move', target, true).ok).toBe(false); expect(s).toEqual(before);
    expect(stopMachines(s, [u.id]).ok).toBe(true); expect(u.orders).toHaveLength(0);
  });

  it('drops a spring order made stale by another worker and continues its appended destination', () => {
    const s = game('migration', 481516, 200), units = [build(s), build(s)], spring = s.machines.springs[0];
    const destinations = units.map((_, i) => ({ x: spring.pos.x + 12, y: 0, z: spring.pos.z + i * 6 }));
    for (const [i, u] of units.entries()) {
      expect(issueMachineOrder(s, [u.id], 'gather', { kind: 'spring', id: spring.id }).ok).toBe(true);
      expect(issueMachineOrder(s, [u.id], 'move', { kind: 'point', pos: destinations[i] }, true).ok).toBe(true);
    }
    runUntil(s, () => units.every(u => u.orders.length === 0), 120);
    expect(spring.owner).toBe('player'); expect(spring.progress).toBe(1); expect(machineIncome(s.machines)).toBe(spring.rate);
    for (const [i, u] of units.entries()) expect(horizontalDistance(u.pos, destinations[i])).toBeLessThanOrEqual(1.05);
  });

  it('rejects the wrong module for a region even though that legal design can gather amber', () => {
    const s = game('restoration'), draft = initialVehicle('tank', 'migration');
    expect(buildMachine(s, draft).ok).toBe(true); const u = s.machines.fleet[0], before = structuredClone(s);
    expect(issueMachineOrder(s, [u.id], 'build', { kind: 'region', id: s.machines.regions[0].id }).ok).toBe(false); expect(s).toEqual(before);
    capture(s, u); expect(machineIncome(s.machines)).toBeGreaterThan(0);
  });

  it('repairs real battle damage only after returning home, paying once for each damaged machine', () => {
    const s = game('predator'), u = build(s), region = s.machines.regions[0], max = u.health;
    expect(issueMachineOrder(s, [u.id], 'attack', { kind: 'region', id: region.id }).ok).toBe(true);
    runUntil(s, () => u.health < max, 100); expect(stopMachines(s, [u.id]).ok).toBe(true);
    const far = structuredClone(s); expect(repairMachines(s, [u.id]).ok).toBe(false); expect(s).toEqual(far);
    home(s, u); const stock = s.machines.resource;
    expect(repairMachines(s, [u.id]).ok).toBe(true); expect(u.health).toBe(max); expect(s.machines.resource).toBe(stock - 10);
    expect(repairMachines(s, [u.id]).ok).toBe(true); expect(s.machines.resource).toBe(stock - 10);
  });

  it('rejects unaffordable and partially stale repairs without restoring health or spending amber', () => {
    const s = game('predator', 481516, 60), u = build(s), max = u.health;
    expect(issueMachineOrder(s, [u.id], 'attack', { kind: 'region', id: s.machines.regions[0].id }).ok).toBe(true);
    runUntil(s, () => u.health < max, 100); home(s, u);
    expect(s.machines.resource).toBeLessThan(10);
    for (const ids of [[u.id], [u.id, 999999]]) {
      const before = structuredClone(s); expect(repairMachines(s, ids).ok).toBe(false); expect(s).toEqual(before);
    }
  });

  it('keeps captured income after a real fleet wipe and permits rebuilding', () => {
    const s = game('predator'), u = build(s); capture(s, u);
    expect(issueMachineOrder(s, [u.id], 'attack', { kind: 'region', id: s.machines.regions[1].id }).ok).toBe(true);
    runUntil(s, () => s.machines.fleet.length === 0, 150);
    expect(s.deathReason).toBeNull(); expect(machineIncome(s.machines)).toBeGreaterThan(0);
    const stale = structuredClone(s); expect(issueMachineOrder(s, [u.id], 'move', { kind: 'point', pos: { ...machineHome(s) } }).ok).toBe(false); expect(s).toEqual(stale);
    const stock = s.machines.resource; step(s, 300); expect(s.machines.resource).toBeCloseTo(stock + machineIncome(s.machines) * 10, 7);
    runUntil(s, () => s.machines.resource >= vehicleCost(design(s)), 120); build(s); expect(s.machines.fleet).toHaveLength(1);
  });

  it('offers recovery when the last tank dies leaving an unaffordable air-only economy, without destroying the survivor', () => {
    const s = game('predator'), tank = build(s), garden = s.machines.regions[0];
    expect(machineEconomyStranded(s)).toBe(false);
    expect(issueMachineOrder(s, [tank.id], 'attack', { kind: 'region', id: garden.id }).ok).toBe(true);
    runUntil(s, () => garden.owner === 'player', 120);
    const draft = design(s, 'air'); draft.parts.forEach(part => { part.scale = .55; });
    expect(buildMachine(s, draft).ok).toBe(true); const air = s.machines.fleet.at(-1)!;
    expect(s.machines.resource).toBe(9); expect(machineEconomyStranded(s)).toBe(false);
    expect(issueMachineOrder(s, [tank.id], 'attack', { kind: 'region', id: s.machines.regions[1].id }).ok).toBe(true);
    runUntil(s, () => !s.machines.fleet.some(unit => unit.id === tank.id), 120);
    const before = structuredClone(s);
    expect(machineEconomyStranded(s)).toBe(true); expect(s).toEqual(before);
    expect(s.machines.fleet).toEqual([air]); expect(air.health).toBeGreaterThan(0); expect(s.deathReason).toBeNull();
    expect(machineIncome(s.machines)).toBe(0);
    expect(issueMachineOrder(s, [air.id], 'gather', { kind: 'spring', id: s.machines.springs[0].id }).ok).toBe(false);
    step(s, 9000); expect(s.machines.resource).toBe(9); expect(machineEconomyStranded(s)).toBe(true); expect(s.deathReason).toBeNull();
    // Pure boundary checks distinguish this state from economies that can recover.
    const funded = structuredClone(s); funded.machines.resource = 28;
    expect(machineEconomyStranded(funded)).toBe(false);
    const income = structuredClone(s); Object.assign(income.machines.springs[0], { owner: 'player', progress: 1 });
    expect(machineEconomyStranded(income)).toBe(false);
  });

  it('ends a fleet wipe without income only when no valid replacement is affordable', () => {
    const cheap = initialVehicle('tank', 'migration'); cheap.parts.forEach(part => { part.scale = .55; });
    expect(validateVehicle(cheap)).toEqual([]); const minimum = vehicleCost(cheap);
    for (const available of [minimum - 1, minimum]) {
      const fullCost = vehicleCost(initialVehicle('tank', 'predator')), s = game('predator', 481516, fullCost + available), u = build(s);
      expect(issueMachineOrder(s, [u.id], 'attack', { kind: 'region', id: s.machines.regions[1].id }).ok).toBe(true);
      runUntil(s, () => s.machines.fleet.length === 0, 150);
      expect(s.machines.resource).toBe(available);
      if (available < minimum) expect(s.deathReason).toBeTruthy();
      else { expect(s.deathReason).toBeNull(); expect(buildMachine(s, cheap).ok).toBe(true); }
    }
  });
});

describe('deterministic machine simulation', () => {
  it.each([481516, 20260913, 8675309])('replays seed %i independently of fleet, design and selection storage order', seed => {
    const a = game('migration', seed, 200), units = [build(a), build(a)], b = structuredClone(a), spring = a.machines.springs[0];
    b.machines.fleet.reverse(); b.machines.blueprints.reverse(); b.machines.regions.reverse(); b.machines.springs.reverse();
    const ids = units.map(u => u.id);
    expect(issueMachineOrder(a, ids, 'gather', { kind: 'spring', id: spring.id }).ok).toBe(true);
    expect(issueMachineOrder(b, [...ids].reverse(), 'gather', { kind: 'spring', id: spring.id }).ok).toBe(true);
    step(a, 1200); step(b, 1200);
    const canonical = (s: MachineGame) => ({ ...s.machines, fleet: [...s.machines.fleet].sort((x, y) => x.id - y.id), blueprints: [...s.machines.blueprints].sort((x, y) => x.id - y.id), regions: [...s.machines.regions].sort((x, y) => x.id - y.id), springs: [...s.machines.springs].sort((x, y) => x.id - y.id) });
    expect(canonical(b)).toEqual(canonical(a)); expect(b.world).toEqual(a.world); expect(b.tick).toBe(a.tick);
    expect(spring.owner).toBe('player'); expect(a.machines.resource).toBeGreaterThan(100);
  });
});
