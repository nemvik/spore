import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { starSystems, planetSystem } from '../src/game/galaxy';
import { FixedStepClock } from '../src/game/input-clock';
import { machineHome } from '../src/game/machines';
import { planetVehicle } from '../src/game/planet';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { initialShip } from '../src/game/ship-design';
import { newShipCreation } from '../src/game/ship-library';
import { combatEnergySpent, combatTotals, latestBattle, PIRATE } from '../src/game/space-combat-content';
import { combatCheckpointMatches } from '../src/game/space-combat-validation';
import { currentShipRescue, enableSpaceCombat, fireSpacePulse, investigatePirates, pirateQuote, pulseQuote, rescueShip } from '../src/game/space-combat';
import { applyEconomyOrder, economyQuote, spaceEconomy } from '../src/game/space-economy';
import { jumpToSystem, specimenQuote } from '../src/game/space-expedition';
import { shipCapabilities } from '../src/game/space-outfit-content';
import { buildShip, changeSpaceScale, launchShip } from '../src/game/space';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState, type Input } from '../src/game/types';

// Prepared UNIT continuations of exact native D2b. Beacon coordinates and ascent
// altitude are explicit test setup. Battles, payments, rescue and all elapsed
// time below use public runtime actions/ordinary simulation, never edited clocks.
const fixture = (flight = false) => parseGame(readFileSync(`tests/fixtures/space/native-d2b-${flight ? 'flight' : 'campaign'}.save.json`, 'utf8'));
const enabled = (flight = false) => { const s = fixture(flight); enableSpaceCombat(s); return s; };
const combat = (s: GameState) => s.space!.combat!;
const battle = (s: GameState) => latestBattle(s.space!)!;
const account = (s: GameState) => spaceEconomy(s)!;
const round = (s: GameState) => parseGame(serializeGame(s));
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...home } = s; return structuredClone(home); };
const noNotice = (s: GameState) => { const copy = structuredClone(s); copy.space!.notice = ''; return copy; };
const frames = (s: GameState, seconds: number, input: Input = EMPTY_INPUT) => { for (let i = 0; i < Math.round(seconds * 30); i++) step(s, input, 1 / 30); };
const serial = (s: GameState) => combat(s).archive.battles + combat(s).battles.length + 1;
const beacon = (s: GameState) => { s.space!.location!.pos = { x: 0, y: 0, z: 0 }; };
function finish(s: GameState) { for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30); expect(s.space!.leg).toBeNull(); }
function recharge(s: GameState, energy = 30) {
  for (let i = 0; i < 900 && s.space!.ship!.energy < energy; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.ship!.energy).toBeGreaterThanOrEqual(energy);
}
function orbit(s: GameState, index = 1) {
  const p = s.space!, systems = starSystems(p.homePlanetId); if (p.leg) finish(s);
  if (!p.location) expect(launchShip(s)).toBe(true);
  if (p.location!.scale === 'surface') { recharge(s); p.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  if (p.location!.scale === 'orbit' && p.location!.planetId === systems[index].planetId) { beacon(s); return; }
  if (p.location!.scale === 'orbit') { recharge(s); beacon(s); expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  let current = planetSystem(p.homePlanetId, p.location!.planetId)!.index;
  while (current !== index) { current += Math.sign(index - current); recharge(s); expect(jumpToSystem(s, systems[current].id)).toBe(true); finish(s); }
  beacon(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s);
}
function started(flight = false) { const s = enabled(flight); orbit(s); expect(investigatePirates(s, serial(s))).toBe(true); return s; }
function win(s: GameState, kite = false) {
  const p = s.space!, speed = shipCapabilities(p)!.speed;
  if (kite) expect(speed).toBeGreaterThanOrEqual(PIRATE.speed);
  for (let i = 0; i < 5; i++) {
    expect(fireSpacePulse(s)).toBe(true);
    if (i < 4) frames(s, 2 / 3, kite ? { ...EMPTY_INPUT, x: -PIRATE.speed / speed } : EMPTY_INPUT);
  }
  expect(battle(s).end?.outcome).toBe('won');
}
function lose(s: GameState) {
  for (let i = 0; i < 1800 && !battle(s).end; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(battle(s).end?.outcome).toBe('lost'); expect(s.space!.ship!.health).toBe(0);
}
function bareShip() {
  // Actual old native checkpoint has a legal zero space balance and no colonies.
  // Public construction pays its real home amber; this is not a fabricated wallet.
  const s = recoverGeneration(fixture()); planetVehicle(s)!.pos = { ...machineHome(s) }; enableSpaceCombat(s);
  expect(buildShip(s, newShipCreation(initialShip(), 'Unit rescue and archive regression', 'combat-regression', 100))).toBe(true);
  expect(account(s).balance).toBe(0); expect(account(s).colonies).toEqual([]); return s;
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
function refuseSignal(s: GameState, requested = serial(s)) {
  const before = noNotice(s); expect(pirateQuote(s, requested).ok).toBe(false); expect(investigatePirates(s, requested)).toBe(false); expect(noNotice(s)).toEqual(before);
}
function refusePulse(s: GameState) {
  const before = noNotice(s); expect(pulseQuote(s).ok).toBe(false); expect(fireSpacePulse(s)).toBe(false); expect(noNotice(s)).toEqual(before);
}
afterEach(() => vi.unstubAllGlobals());

describe('D3a explicit historical opt-in and deliberate orbit-only encounters', () => {
  it.each([false, true])('activates the historical flight=%s branch and its older CP independently, without fake battles or grants', flight => {
    const s = fixture(flight), before = structuredClone(s), oldCp = JSON.parse(s.checkpoint!) as GameState;
    expect(s.space!.combat).toBeUndefined(); expect(round(s)).toEqual(s); enableSpaceCombat(s);
    expect(combat(s)).toMatchObject({ version: 1, activated: { cut: { at: before.space!.elapsed, tick: before.tick, travelAction: before.space!.nextSerial,
      lifeAction: before.space!.expedition!.nextAction, economyAction: account(before).nextAction }, health: before.space!.ship!.health, repaired: account(before).ledger.healthRestored }, battles: [], legacyRescue: null });
    expect(Object.values(combat(s).archive).every(value => value === 0)).toBe(true);
    const cp = JSON.parse(s.checkpoint!) as GameState; expect(combat(cp).activated).toEqual({ cut: { at: 0, tick: oldCp.tick, travelAction: 1, lifeAction: 1, economyAction: 1 }, economyAt: account(oldCp).elapsed, health: null, repaired: 0 });
    expect(domestic(s)).toEqual(domestic(before)); expect(s.space!.ship).toEqual(before.space!.ship); expect(account(s)).toEqual(account(before));
    expect(s.space!.outfit).toEqual(before.space!.outfit); expect(s.space!.empires).toEqual(before.space!.empires); expect(s.space!.expansion).toEqual(before.space!.expansion);
    const once = structuredClone(s); enableSpaceCombat(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
  });

  it('preserves fresh opt-in after no-checkpoint recovery without copying late combat results', () => {
    const s = started(); win(s); s.checkpoint = null; const fresh = recoverGeneration(s);
    expect(fresh.stage).toBe(0); expect(fresh.space!.ship).toBeNull(); expect(combat(fresh).battles).toEqual([]);
    expect(combat(fresh).activated.health).toBeNull(); expect(Object.values(combat(fresh).archive).every(v => v === 0)).toBe(true); expect(round(fresh)).toEqual(fresh);
  });

  it('requires deliberate current-serial input at a foreign orbital beacon and refuses automatic encounters or reuse', () => {
    const s = enabled(); refuseSignal(s); expect(launchShip(s)).toBe(true); refuseSignal(s);
    s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); refuseSignal(s); finish(s); refuseSignal(s);
    orbit(s); frames(s, 10); expect(combat(s).battles).toEqual([]); s.space!.location!.pos.x = 25; refuseSignal(s); beacon(s);
    refuseSignal(s, 2); const before = structuredClone(s.space!.ship), money = account(s).balance;
    expect(investigatePirates(s, 1)).toBe(true); expect(s.space!.ship).toEqual(before); expect(account(s).balance).toBe(money);
    expect(battle(s)).toMatchObject({ serial: 1, kind: 'pirate', shots: 0, received: 0, damage: 0, end: null, rescue: null, enemy: { health: 60, pos: { x: 22, y: 0, z: 0 } } });
    refuseSignal(s, 1); refuseSignal(s, 2); expect(round(s)).toEqual(s);
  });
});

describe('D3a actual pulse, movement, cadence and three battle outcomes', () => {
  it('pays three immediately, damages twelve at range and prevents both a stale rapid shot and unpaid energy rollback', () => {
    const s = started(); makeCheckpoint(s); const health = s.space!.ship!.health, energy = s.space!.ship!.energy, home = domestic(s), accountBefore = structuredClone(account(s));
    expect(fireSpacePulse(s)).toBe(true); expect(s.space!.ship!.energy).toBe(energy - 3); expect(battle(s)).toMatchObject({ shots: 1, enemy: { health: 48 }, damage: 0 });
    expect(battle(s).lastShot).toEqual({ at: s.space!.elapsed, from: { x: 0, y: 0, z: 0 }, to: { x: 22, y: 0, z: 0 } });
    expect(combatEnergySpent(s.space!)).toBe(3); expect(s.space!.ship!.health).toBe(health); expect(domestic(s)).toEqual(home); expect(account(s)).toEqual(accountBefore);
    const instantRefund = structuredClone(s); instantRefund.space!.ship!.energy = energy; reject(instantRefund);
    refusePulse(s); frames(s, .6); refusePulse(s); frames(s, 2 / 30); expect(fireSpacePulse(s)).toBe(true); expect(battle(s).shots).toBe(2); expect(round(s)).toEqual(s);
    const unpaid = round(s); unpaid.space!.ship!.energy += 6; reject(unpaid);
  });

  it('refuses out-of-range and unfunded pulses atomically, while real movement outpaces the bounded pirate', () => {
    const s = started(); s.space!.location!.pos.x = -10; refusePulse(s); beacon(s);
    // Refusal-only energy setup; restore it before any persisted runtime continuation.
    const energy = s.space!.ship!.energy; s.space!.ship!.energy = 2; refusePulse(s); s.space!.ship!.energy = energy;
    const enemy = { ...battle(s).enemy.pos }, health = s.space!.ship!.health; frames(s, 2, { ...EMPTY_INPUT, x: -1 });
    expect(s.space!.location!.pos.x).toBeLessThan(-16); expect(battle(s).received).toBe(0); expect(s.space!.ship!.health).toBe(health);
    const distance = Math.hypot(battle(s).enemy.pos.x - enemy.x, battle(s).enemy.pos.y - enemy.y, battle(s).enemy.pos.z - enemy.z);
    expect(distance).toBeGreaterThan(0); expect(distance).toBeLessThanOrEqual(16 + 1e-8); refusePulse(s); expect(round(s)).toEqual(s);
  });

  it('wins with five real shots and one ordinary received hit, records no money reward and enforces ninety seconds of rest', () => {
    const s = started(), money = account(s).balance, health = s.space!.ship!.health; win(s);
    expect(battle(s)).toMatchObject({ shots: 5, received: 1, damage: 8, enemy: { health: 0 }, end: { outcome: 'won', health: health - 8 } });
    expect(s.space!.ship!.health).toBe(health - 8); expect(combatEnergySpent(s.space!)).toBe(15); expect(account(s).balance).toBe(money);
    refusePulse(s); refuseSignal(s); frames(s, 89); refuseSignal(s); frames(s, 1); expect(investigatePirates(s, 2)).toBe(true); expect(round(s)).toEqual(s);
  });

  it.each(['up', 'down'] as const)('ends by %s retreat only after an accepted transition and freezes battle, ship and ally throughout the leg', direction => {
    const s = started();
    if (direction === 'up') { const energy = s.space!.ship!.energy; s.space!.ship!.energy = 3; expect(changeSpaceScale(s, direction)).toBe(false); s.space!.ship!.energy = energy; }
    else { s.space!.location!.pos.x = 17; expect(changeSpaceScale(s, direction)).toBe(false); beacon(s); }
    expect(battle(s).end).toBeNull(); expect(changeSpaceScale(s, direction)).toBe(true); expect(battle(s).end?.outcome).toBe('retreated');
    const closed = structuredClone(battle(s)), ship = structuredClone(s.space!.ship), ally = structuredClone(s.space!.expansion!.allies); makeCheckpoint(s);
    frames(s, 1); expect(battle(s)).toEqual(closed); expect(s.space!.ship).toEqual(ship); expect(s.space!.expansion!.allies).toEqual(ally); refusePulse(s); expect(round(s)).toEqual(s);
    finish(s); expect(battle(s)).toEqual(closed); expect(s.space!.ship).toEqual(ship); expect(round(s)).toEqual(s);
  });

  it('keeps paused time outside combat cadence and health progression', () => {
    const s = started(), before = structuredClone(s), clock = new FixedStepClock(); clock.advance(0);
    expect(clock.advance(30000, false)).toBe(0); expect(clock.advance(60000, false)).toBe(0);
    expect(s).toEqual(before); expect(round(s)).toEqual(s);
    frames(s, 1.7); expect(battle(s).received).toBe(0); frames(s, .1); expect(battle(s).received).toBe(1); expect(battle(s).damage).toBe(8);
  });
});

describe('D3a persistent wreck, explicit twelve-second rescue and actual paid service', () => {
  it('preserves an actually depleted battery through defeat and twelve-second rescue without solar, ally or account grants', () => {
    const s = bareShip(); orbit(s); expect(investigatePirates(s, 1)).toBe(true);
    expect(s.space!.expansion!.allies).toEqual([]); const maximum = shipCapabilities(s.space!)!.energy;
    const cargo = structuredClone([account(s).cargo, s.space!.expedition!.cargo]); let direction = 1;
    // Ordinary sprint manoeuvres bounce around the beacon; no live position or
    // energy setter is used. Their real energy cost prevents idle solar gain.
    for (let i = 0; i < 1800 && !battle(s).end; i++) {
      if (s.space!.location!.pos.x >= 2) direction = -1;
      else if (s.space!.location!.pos.x <= -2) direction = 1;
      step(s, { ...EMPTY_INPUT, x: direction, sprint: true }, 1 / 30);
    }
    expect(battle(s).end?.outcome).toBe('lost'); expect(s.space!.ship!.health).toBe(0);
    expect(battle(s).shots).toBe(0); const deficit = s.space!.ship!.energy, place = structuredClone(s.space!.location), ledger = structuredClone(account(s).ledger);
    expect(deficit).toBeGreaterThan(0); expect(deficit).toBeLessThan(maximum - 5); expect(round(s)).toEqual(s);
    expect(rescueShip(s)).toBe(true); frames(s, 12); expect(s.space!.ship!.health).toBe(25);
    expect(s.space!.ship!.energy).toBe(deficit); expect(s.space!.location).toEqual(place);
    expect([account(s).cargo, s.space!.expedition!.cargo]).toEqual(cargo); expect(account(s).ledger).toEqual(ledger);
    expect(account(s).balance).toBe(0); expect(account(s).actions).toEqual([]); expect(round(s)).toEqual(s);
  });

  it('saves the actual zero-health wreck with unchanged body, address, cargo and inactive biology, then continues the same campaign', () => {
    const s = started(true), home = domestic(s), cargo = structuredClone(account(s).cargo), biology = structuredClone(s.space!.expedition), place = structuredClone(s.space!.location), ship = structuredClone(s.space!.ship);
    lose(s); expect(battle(s).damage).toBe(ship!.health); expect(s.player.health).toBe(home.player.health); expect(s.deathReason).toBeNull();
    expect(domestic(s)).toEqual(home); expect(account(s).cargo).toEqual(cargo); expect(s.space!.expedition).toEqual(biology); expect(s.space!.location).toEqual(place);
    expect(round(s)).toEqual(s); const local = new Map<string, string>(); vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState; imported.id += '-wreck-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    expect(round(imported).space).toEqual(s.space); expect(currentShipRescue(s)).toBeNull();
    const stopped = structuredClone(s.space!.location), energy = s.space!.ship!.energy, ally = structuredClone(s.space!.expansion!.allies);
    frames(s, 1, { ...EMPTY_INPUT, x: 1, vertical: 1, sprint: true }); expect(s.space!.location).toEqual(stopped); expect(s.space!.ship!.energy).toBe(energy); expect(s.space!.expansion!.allies).toEqual(ally);
    expect(changeSpaceScale(s, 'down')).toBe(false); refusePulse(s); refuseSignal(s); expect(specimenQuote(s, 'scan', 'missing').ok).toBe(false); expect(economyQuote(s, { kind: 'load' }, account(s).nextAction).ok).toBe(false);
    const payments = structuredClone(account(s).actions); expect(rescueShip(s)).toBe(true); expect(rescueShip(s)).toBe(false);
    frames(s, 6); makeCheckpoint(s); const pending = JSON.parse(s.checkpoint!) as GameState; expect(currentShipRescue(s)!.completedAt).toBeNull(); expect(round(s)).toEqual(s);
    frames(s, 5.9); expect(s.space!.ship!.health).toBe(0); frames(s, .1); expect(s.space!.ship!.health).toBe(25);
    expect(currentShipRescue(s)!.completedAt! - currentShipRescue(s)!.startedAt).toBeCloseTo(12, 7); expect(account(s).actions).toEqual(payments);
    expect(s.space!.ship!.energy).toBe(energy); expect(s.space!.ship!.creation).toEqual(ship!.creation); expect(s.space!.ship!.purchase).toEqual(ship!.purchase);
    expect(s.space!.location).toEqual(place); expect(account(s).cargo).toEqual(cargo); expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(restored.space!.combat).toEqual(pending.space!.combat); expect(restored.space!.ship).toEqual(pending.space!.ship);
    expect(currentShipRescue(restored)!.completedAt).toBeNull(); expect(round(restored)).toEqual(restored);
  });

  it('counts the second loss from twenty-five health as 25 damage across four hits, then keeps exact global health and paid repairs', () => {
    const s = started(); const originalHealth = s.space!.ship!.health; lose(s); expect(rescueShip(s)).toBe(true); frames(s, 12); expect(s.space!.ship!.health).toBe(25);
    frames(s, 90); expect(investigatePirates(s, 2)).toBe(true); lose(s);
    expect(battle(s)).toMatchObject({ startingHealth: 25, received: 4, damage: 25, end: { outcome: 'lost', health: 0 } });
    expect(combatTotals(s.space!)).toMatchObject({ defeats: 2, damage: originalHealth + 25, restored: 25 }); expect(round(s)).toEqual(s);
    expect(rescueShip(s)).toBe(true); frames(s, 12); expect(s.space!.ship!.health).toBe(25); expect(combatTotals(s.space!).restored).toBe(50);
    expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); s.space!.location!.pos = { x: 0, y: 3, z: 0 };
    const money = account(s).balance; expect(economyQuote(s, { kind: 'repair' }, account(s).nextAction)).toMatchObject({ ok: true, price: 5, amount: 40 });
    expect(applyEconomyOrder(s, { kind: 'repair' }, account(s).nextAction)).toBe(true); expect(account(s).balance).toBe(money - 5); expect(s.space!.ship!.health).toBe(65);
    expect(account(s).actions.at(-1)).toMatchObject({ kind: 'repair', paid: 5, before: 25, after: 65 }); expect(round(s)).toEqual(s);
    const forged = structuredClone(s); battle(forged).damage = 32; reject(forged);
  });

  it('rescues a genuinely empty space account and independently handles an explicitly activated historical dock wreck', () => {
    const s = bareShip(); orbit(s); expect(investigatePirates(s, 1)).toBe(true); lose(s); expect(account(s).balance).toBe(0);
    expect(rescueShip(s)).toBe(true); frames(s, 12); expect(s.space!.ship!.health).toBe(25); expect(account(s).balance).toBe(0); expect(account(s).actions).toEqual([]); expect(round(s)).toEqual(s);
    // Prepared historical zero-health dock BEFORE opt-in, not a fabricated battle.
    const dock = fixture(); dock.space!.ship!.health = 0; makeCheckpoint(dock); enableSpaceCombat(dock);
    expect(combat(dock).activated.health).toBe(0); expect(round(dock)).toEqual(dock); expect(launchShip(dock)).toBe(false);
    expect(rescueShip(dock)).toBe(true); const energy = dock.space!.ship!.energy; frames(dock, 12);
    expect(dock.space!.ship!.health).toBe(25); expect(dock.space!.ship!.energy).toBe(energy); expect(combat(dock).battles).toEqual([]);
    expect(combat(dock).legacyRescue!.completedAt).not.toBeNull(); expect(combatTotals(dock.space!)).toMatchObject({ battles: 0, restored: 25 }); expect(round(dock)).toEqual(dock);
  });
});

describe('D3a mutable encounter versus immutable checkpoint evidence', () => {
  it('does not reinterpret an already owned damaged ship as an unbuilt full-health baseline at the same purchase tick', () => {
    // Prepared historical damage BEFORE combat opt-in; no fictitious combat is
    // inserted. The original construction payment and its real tick stay intact.
    const s = recoverGeneration(fixture()); planetVehicle(s)!.pos = { ...machineHome(s) };
    expect(s.space!.combat).toBeUndefined();
    expect(buildShip(s, newShipCreation(initialShip(), 'Historical damaged same-tick ship', 'combat-old-damage', 100))).toBe(true);
    s.space!.ship!.health = 25; makeCheckpoint(s); expect(round(s)).toEqual(s);
    enableSpaceCombat(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(s.space!.ship!.purchase.tick).toBe(combat(s).activated.cut.tick);
    expect(combat(s).activated.health).toBe(25); expect(combat(cp).activated.health).toBe(25); expect(round(s)).toEqual(s);
    const forged = structuredClone(s); combat(forged).activated.health = null; forged.space!.ship!.health = shipCapabilities(forged.space!)!.health;
    const standalone = structuredClone(forged); standalone.checkpoint = null;
    expect(round(standalone)).toEqual(standalone); // The known checkpoint is essential to this regression.
    expect(combatCheckpointMatches(forged, cp)).toBe(false); reject(forged);
  });

  it('cannot replace an unrecovered wreck or pending rescue, and archives a known loss only with its real25 recovery', () => {
    const s = bareShip(); orbit(s); expect(investigatePirates(s, 1)).toBe(true); lose(s);
    frames(s, 90); refuseSignal(s); expect(combat(s).archive.battles).toBe(0); expect(combat(s).battles).toHaveLength(1);
    expect(rescueShip(s)).toBe(true); frames(s, 6); refuseSignal(s); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(currentShipRescue(cp)!.completedAt).toBeNull(); expect(round(s)).toEqual(s);
    frames(s, 6); expect(s.space!.ship!.health).toBe(25);
    for (let i = 2; i <= 33; i++) {
      if (i > 2) frames(s, 90);
      beacon(s); expect(investigatePirates(s, i)).toBe(true); win(s, true);
    }
    expect(combat(s).archive).toMatchObject({ battles: 1, defeats: 1, restored: 25, damage: battle(cp).damage });
    expect(combat(s).battles).toHaveLength(32); expect(s.space!.ship!.health).toBe(25); expect(round(s)).toEqual(s);
    expect(combatCheckpointMatches(s, cp)).toBe(true);
    const unpaidRecovery = structuredClone(s); combat(unpaidRecovery).archive.restored = 0;
    expect(combatCheckpointMatches(unpaidRecovery, cp)).toBe(false); reject(unpaidRecovery);
    const restored = recoverGeneration(round(s)); expect(restored.space!.combat).toEqual(cp.space!.combat);
    expect(restored.space!.ship!.health).toBe(0); expect(currentShipRescue(restored)!.completedAt).toBeNull();
  });

  it('continues a full live combat checkpoint and restores its exact enemy, pulses and player health', () => {
    const s = started(); expect(fireSpacePulse(s)).toBe(true); frames(s, 1); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(fireSpacePulse(s)).toBe(true); frames(s, 1); expect(battle(s).received).toBe(1); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(restored.space!.combat).toEqual(cp.space!.combat); expect(restored.space!.ship).toEqual(cp.space!.ship);
    expect(restored.space!.location).toEqual(cp.space!.location); expect(domestic(restored)).toEqual(domestic(cp)); expect(round(restored)).toEqual(restored);
  });

  it.each(['health', 'enemy', 'shots', 'damage', 'range'] as const)('rejects forged %s despite otherwise genuine active battle evidence', kind => {
    const s = started(); expect(fireSpacePulse(s)).toBe(true); frames(s, 2); expect(round(s)).toEqual(s);
    if (kind === 'health') s.space!.ship!.health++;
    if (kind === 'enemy') battle(s).enemy.health++;
    if (kind === 'shots') battle(s).shots++;
    if (kind === 'damage') battle(s).damage++;
    if (kind === 'range') battle(s).lastShot!.to.x += 50;
    reject(s);
  });

  it('rejects rescue completion before twelve seconds and reversal of already completed rescue in a checkpoint', () => {
    const s = started(); lose(s); expect(rescueShip(s)).toBe(true); frames(s, 6); expect(round(s)).toEqual(s);
    const early = structuredClone(s); currentShipRescue(early)!.completedAt = account(early).elapsed; early.space!.ship!.health = 25; reject(early);
    frames(s, 6); makeCheckpoint(s); const finished = structuredClone(s); currentShipRescue(finished)!.completedAt = null; finished.space!.ship!.health = 0; reject(finished);
  });

  it('rolls 33 ordinary kited victories into a one-battle archive while preserving the known checkpoint prefix and real costs', () => {
    const s = bareShip(); orbit(s); expect(investigatePirates(s, 1)).toBe(true); const health = s.space!.ship!.health; win(s, true); makeCheckpoint(s);
    for (let i = 2; i <= 33; i++) {
      frames(s, 90); beacon(s); expect(investigatePirates(s, i)).toBe(true); win(s, true);
    }
    expect(combat(s).battles).toHaveLength(32); expect(combat(s).battles[0].serial).toBe(2); expect(battle(s).serial).toBe(33);
    expect(combat(s).archive).toMatchObject({ battles: 1, victories: 1, retreats: 0, defeats: 0, shots: 5, received: 0, damage: 0, restored: 0 });
    expect(combatTotals(s.space!)).toMatchObject({ battles: 33, victories: 33, shots: 165, received: 0, damage: 0 });
    expect(combatEnergySpent(s.space!)).toBe(495); expect(s.space!.ship!.health).toBe(health); expect(account(s).balance).toBe(0); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(combat(restored).battles).toHaveLength(1); expect(combat(restored).archive.battles).toBe(0);
    const changed = structuredClone(s); combat(changed).archive.endedAt -= .1; const standalone = structuredClone(changed); standalone.checkpoint = null;
    expect(round(standalone)).toEqual(standalone); reject(changed);
  });
});
