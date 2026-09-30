import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { starSystems, planetSystem, systemDistance } from '../src/game/galaxy';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { applyEconomyOrder, economyQuote, productCargoCount, shipCargoCount, spaceEconomy, type EconomyOrder } from '../src/game/space-economy';
import { enableSpaceEmpires } from '../src/game/space-empires';
import { jumpQuote, jumpToSystem, specimenQuote, useSpecimenTool } from '../src/game/space-expedition';
import { buyShipEquipment, enableSpaceOutfit, equipmentQuote } from '../src/game/space-outfit';
import { equipmentBadge, installedEquipment, shipCapabilities } from '../src/game/space-outfit-content';
import type { EquipmentReceipt, ShipEquipment } from '../src/game/space-outfit-types';
import { shipStats } from '../src/game/ship-design';
import { changeSpaceScale, launchShip } from '../src/game/space';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

// Explicit UNIT continuations of unchanged native D1 exports. Travel completes
// through public actions/ordinary steps, with prepared scanner/beacon positions.
// The single rollover treasury and refusal-only invalid inputs are labelled below.
const fixture = (branch = false) => parseGame(readFileSync(`tests/fixtures/space/native-d1-${branch ? 'survey-branch' : 'campaign'}.save.json`, 'utf8'));
const enabled = (branch = false) => { const s = fixture(branch); enableSpaceOutfit(s); return s; };
const account = (s: GameState) => spaceEconomy(s)!;
const outfit = (s: GameState) => s.space!.outfit!;
const round = (s: GameState) => parseGame(serializeGame(s));
const buy = (s: GameState, id: ShipEquipment) => buyShipEquipment(s, id, account(s).nextAction);
const transact = (s: GameState, cmd: EconomyOrder) => applyEconomyOrder(s, cmd, account(s).nextAction);
const noNotice = (s: GameState) => { const c = structuredClone(s); if (c.space) c.space.notice = ''; return c; };
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...rest } = s; return structuredClone(rest); };
const frames = (s: GameState, seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) step(s, EMPTY_INPUT, 1 / 30); };
function finish(s: GameState) { for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30); expect(s.space!.leg).toBeNull(); }
function recharge(s: GameState, energy = 30) {
  for (let i = 0; i < 900 && s.space!.ship!.energy < energy; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.ship!.energy).toBeGreaterThanOrEqual(energy);
}
const beacon = (s: GameState) => { s.space!.location!.pos = { x: 0, y: 3, z: 0 }; };
function system(s: GameState) {
  if (!s.space!.location) expect(launchShip(s)).toBe(true);
  if (s.space!.location!.scale === 'surface') { recharge(s); s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  if (s.space!.location!.scale === 'orbit') { recharge(s); beacon(s); expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
}
function travel(s: GameState, index: number) {
  system(s); const systems = starSystems(s.space!.homePlanetId);
  let current = planetSystem(s.space!.homePlanetId, s.space!.location!.planetId)!.index;
  while (current !== index) { current += Math.sign(index - current); recharge(s); expect(jumpToSystem(s, systems[current].id)).toBe(true); finish(s); }
  beacon(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s);
  if (index === 0) expect(changeSpaceScale(s, 'down')).toBe(true);
}
function collect(s: GameState, count: number) {
  recharge(s, count * 3 + 1);
  for (let i = 0; i < count; i++) {
    const life = livingPlanet(s)!.life[0]; s.space!.location!.pos = { x: life.pos.x, y: Math.max(2, life.pos.y + 1), z: life.pos.z };
    expect(useSpecimenTool(s, 'scan', life.id)).toBe(true); expect(useSpecimenTool(s, 'collect', life.id)).toBe(true);
  }
  beacon(s);
}
function refuse(s: GameState, id: ShipEquipment, revision = account(s).nextAction) {
  const before = noNotice(s); expect(equipmentQuote(s, id, revision).ok).toBe(false);
  expect(buyShipEquipment(s, id, revision)).toBe(false); expect(noNotice(s)).toEqual(before);
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
function mirror(s: GameState, row: EquipmentReceipt) {
  const i = account(s).actions.findIndex(r => r.serial === row.serial); if (i >= 0) account(s).actions[i] = structuredClone(row);
}
afterEach(() => vi.unstubAllGlobals());

describe('D2 explicit independent migration and actual earned badges', () => {
  it('preserves historical D1 bytes and activates each empty branch at its own cuts without grants', () => {
    const s = fixture(), before = structuredClone(s), oldCP = JSON.parse(s.checkpoint!) as GameState;
    expect(Object.hasOwn(s.space!, 'outfit')).toBe(false); enableSpaceOutfit(s);
    expect(outfit(s)).toEqual({ version: 1, catalog: 1, activated: { at: before.space!.elapsed, tick: before.tick,
      travelAction: before.space!.nextSerial, lifeAction: before.space!.expedition!.nextAction, economyAction: account(before).nextAction }, purchases: [] });
    expect(account(s)).toEqual({ ...account(before), version: 3, ledger: { ...account(before).ledger, equipment: 0 }, counts: { ...account(before).counts, equipment: 0 } });
    expect(domestic(s)).toEqual(domestic(before)); expect(s.space!.ship).toEqual(before.space!.ship); expect(s.space!.expedition).toEqual(before.space!.expedition);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(outfit(cp).activated).toEqual({ at: 0, tick: oldCP.tick, travelAction: 1, lifeAction: 1, economyAction: 1 });
    expect(account(cp).pricingActivatedAction).toBe(1); expect(account(cp).balance).toBe(0); expect(outfit(cp).purchases).toEqual([]);
    expect(account(s).pricingActivatedAction).toBe(15); expect(account(s).balance).toBe(425);
    const once = structuredClone(s); enableSpaceOutfit(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
  });

  it('requires explicit D1 before upgrading C3b and preserves both historical pricing boundaries', () => {
    const s = parseGame(readFileSync('tests/fixtures/space/native-c3b-campaign.save.json', 'utf8')), original = structuredClone(s);
    enableSpaceOutfit(s); expect(s).toEqual(original); enableSpaceEmpires(s); const v2 = structuredClone(s); enableSpaceOutfit(s);
    expect(account(s).pricingActivatedAction).toBe(15); expect(outfit(s).activated.economyAction).toBe(15);
    expect(account(s).actions).toEqual(account(v2).actions); expect(account(s).balance).toBe(249); expect(round(s)).toEqual(s);
  });

  it('retains fresh opt-ins after no-checkpoint recovery without copying late badges or paid modules', () => {
    const s = enabled(); expect(buy(s, 'hold')).toBe(true); s.checkpoint = null;
    const fresh = recoverGeneration(s); expect(fresh.stage).toBe(0); expect(fresh.space!.ship).toBeNull();
    expect(outfit(fresh).purchases).toEqual([]); expect(account(fresh)).toMatchObject({ version: 3, balance: 0, nextAction: 1 });
    expect(account(fresh).ledger.equipment).toBe(0); expect(equipmentBadge(fresh.space!, 'hold')).toBeNull(); expect(round(fresh)).toEqual(fresh);
  });

  it('uses actual completed mission kinds, including the roots survey alternative', () => {
    const main = enabled(), branch = enabled(true);
    expect(equipmentBadge(main.space!, 'hold')).toEqual({ empireId: 'resin', completedSerial: 3 });
    expect(equipmentBadge(main.space!, 'drive')).toEqual({ empireId: 'basalt', completedSerial: 11 });
    expect(equipmentBadge(main.space!, 'solar')).toEqual({ empireId: 'roots', completedSerial: 7 });
    expect(equipmentBadge(branch.space!, 'drive')).toEqual({ empireId: 'roots', completedSerial: 7 });
    expect(equipmentBadge(branch.space!, 'solar')).toBeNull(); refuse(branch, 'solar');
    expect(buy(branch, 'drive')).toBe(true); expect(outfit(branch).purchases[0].unlock).toEqual({ empireId: 'roots', completedSerial: 7 });
    expect(round(branch)).toEqual(branch);
  });
});

describe('D2 exact permanent purchases, capabilities and refusals', () => {
  it('pays 80/120/60 from the native 425 once without replacing the original model, ship receipt or physiology', () => {
    const s = enabled(), original = structuredClone(s.space!.ship), home = domestic(s), e = account(s);
    const before = structuredClone(e.actions), base = shipStats(s.space!.ship!.creation.blueprint);
    for (const [id, price, balance] of [['hold', 80, 345], ['drive', 120, 225], ['solar', 60, 165]] as const) {
      const revision = e.nextAction; expect(equipmentQuote(s, id, revision)).toMatchObject({ ok: true, price });
      expect(buyShipEquipment(s, id, revision)).toBe(true); expect(e.balance).toBe(balance);
      expect(outfit(s).purchases.at(-1)).toEqual(e.actions.at(-1)); expect(outfit(s).purchases.at(-1)).not.toBe(e.actions.at(-1));
      refuse(s, id, revision); refuse(s, id);
    }
    expect(e.ledger.equipment).toBe(260); expect(e.counts.equipment).toBe(3); expect(e.actions.slice(0, 18)).toEqual(before);
    expect(installedEquipment(s.space!)).toEqual(['hold', 'drive', 'solar']);
    expect(shipCapabilities(s.space!)).toEqual({ ...base, cargo: 12, solar: base.solar + 2, jumpRange: 32 });
    expect(s.space!.ship).toEqual(original); expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
  });

  it.each(['stale', 'funds', 'dead-player', 'dead-ship', 'stage', 'unknown', 'prototype'] as const)('refuses %s input atomically before touching the account', kind => {
    // Invalid refusal-only unit inputs; no such state is serialized or called native evidence.
    const s = enabled(); let id: ShipEquipment = 'hold', revision = account(s).nextAction;
    if (kind === 'stale') revision--;
    if (kind === 'funds') account(s).balance = 79;
    if (kind === 'dead-player') s.player.health = 0;
    if (kind === 'dead-ship') s.space!.ship!.health = 0;
    if (kind === 'stage') s.stage = 4;
    if (kind === 'unknown') id = 'unknown' as ShipEquipment;
    if (kind === 'prototype') id = '__proto__' as ShipEquipment;
    refuse(s, id, revision);
  });

  it('refuses a foreign capital, remote colony position and unfinished flight, then buys at its own colony', () => {
    const s = enabled(); travel(s, 1); refuse(s, 'hold');
    travel(s, 2); s.space!.location!.pos.x = 13; refuse(s, 'hold'); beacon(s); s.space!.location!.pos.y = 9; refuse(s, 'hold');
    s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); refuse(s, 'hold'); finish(s); refuse(s, 'hold');
    expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s); expect(buy(s, 'hold')).toBe(true);
    expect(outfit(s).purchases[0].planetId).toBe(account(s).colonies[0].planetId); expect(round(s)).toEqual(s);
  });

  it('applies economy cuts strictly after purchase and life/travel cuts inclusively at the recorded next actions', () => {
    const s = enabled(); expect(buy(s, 'hold')).toBe(true); const row = outfit(s).purchases[0], p = s.space!;
    expect(shipCapabilities(p, { economyAction: row.serial })!.cargo).toBe(8);
    expect(shipCapabilities(p, { economyAction: row.serial + 1, lifeAction: row.lifeAction })!.cargo).toBe(12);
    expect(shipCapabilities(p, { economyAction: row.serial + 1, lifeAction: row.lifeAction - 1 })!.cargo).toBe(8);
    expect(installedEquipment(p, { travelAction: row.travelAction - 1 })).toEqual([]);
    expect(installedEquipment(p, { travelAction: row.travelAction })).toEqual(['hold']);
  });

  it('adds exactly two solar energy per stationary second with no grant on mounting and no gain while moving', () => {
    const base = enabled(), upgraded = structuredClone(base); expect(buy(upgraded, 'solar')).toBe(true);
    expect(upgraded.space!.ship!.energy).toBe(base.space!.ship!.energy);
    expect(launchShip(base)).toBe(true); expect(launchShip(upgraded)).toBe(true);
    // Prepared equal depletion isolates the runtime rate below the clamp.
    base.space!.ship!.energy = upgraded.space!.ship!.energy = 10;
    frames(base, 1); frames(upgraded, 1);
    expect(upgraded.space!.ship!.energy - base.space!.ship!.energy).toBeCloseTo(2, 10);
    const first = base.space!.ship!.energy, second = upgraded.space!.ship!.energy;
    for (let i = 0; i < 30; i++) { step(base, { ...EMPTY_INPUT, x: 1 }, 1 / 30); step(upgraded, { ...EMPTY_INPUT, x: 1 }, 1 / 30); }
    expect(base.space!.ship!.energy - first).toBeCloseTo(-.05, 10); expect(upgraded.space!.ship!.energy - second).toBeCloseTo(-.05, 10);
  });

  it('actually completes a paid jump beyond eighteen and validates its historical drive cut', () => {
    const s = enabled(), base = structuredClone(s); expect(buy(s, 'drive')).toBe(true); system(base); system(s);
    const systems = starSystems(s.space!.homePlanetId), target = systems.find(x => systemDistance(systems[0], x) > 18 && systemDistance(systems[0], x) <= 32)!;
    recharge(s); recharge(base); expect(jumpQuote(base, target.id).ok).toBe(false); expect(jumpToSystem(base, target.id)).toBe(false);
    const q = jumpQuote(s, target.id), energy = s.space!.ship!.energy; expect(q.ok).toBe(true); expect(jumpToSystem(s, target.id)).toBe(true);
    expect(s.space!.ship!.energy).toBe(energy - q.price); finish(s); expect(s.space!.location!.systemId).toBe(target.id); expect(round(s)).toEqual(s);
    const jump = s.space!.log.at(-1)!, row = outfit(s).purchases[0]; row.travelAction = jump.serial + 1; mirror(s, row);
    s.checkpoint = null; reject(s);
  });
});

describe('D2 real shared cargo and historical boundaries', () => {
  it('loads eight before the hold, four after the same-clock purchase and rewinds to the true eight-slot checkpoint', () => {
    const s = enabled(); travel(s, 2); expect(transact(s, { kind: 'load' })).toBe(true); expect(productCargoCount(s)).toBe(8);
    makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, at = s.space!.elapsed, L = s.space!.expedition!.nextAction;
    expect(buy(s, 'hold')).toBe(true); const row = outfit(s).purchases[0];
    expect(economyQuote(s, { kind: 'load' }, account(s).nextAction)).toMatchObject({ ok: true, amount: 4 }); expect(transact(s, { kind: 'load' })).toBe(true);
    expect(s.space!.elapsed).toBe(at); expect(row.lifeAction).toBe(L); expect(account(s).actions.at(-1)).toMatchObject({ kind: 'load', serial: row.serial + 1, lifeAction: L, amount: 4 });
    expect(productCargoCount(s)).toBe(12); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(productCargoCount(restored)).toBe(8); expect(outfit(restored).purchases).toEqual([]); expect(account(restored)).toEqual(account(cp));
    const invalid = structuredClone(s), purchase = outfit(invalid).purchases[0], loadRow = account(invalid).actions.at(-1)!;
    // Forge an oversized loading before purchase; keep amount/stock conservation.
    const oldLoad = account(invalid).actions.find(r => r.serial === purchase.serial - 1)!;
    if (oldLoad.kind !== 'load' || loadRow.kind !== 'load') throw new Error('fixture loads'); oldLoad.amount++; loadRow.amount--;
    invalid.checkpoint = null; reject(invalid);
  });

  it('shares twelve slots between eight real bodies and four actual products, rejecting any thirteenth item', () => {
    const s = enabled(); travel(s, 2); collect(s, 8); expect(shipCargoCount(s)).toBe(8); expect(livingExpedition(s)!.cargo).toHaveLength(8);
    makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState; expect(buy(s, 'hold')).toBe(true); expect(transact(s, { kind: 'load' })).toBe(true);
    expect(productCargoCount(s)).toBe(4); expect(shipCargoCount(s)).toBe(12); expect(economyQuote(s, { kind: 'load' }, account(s).nextAction).ok).toBe(false);
    const ninth = livingPlanet(s)!.life[0]; s.space!.location!.pos = { x: ninth.pos.x, y: Math.max(2, ninth.pos.y + 1), z: ninth.pos.z };
    expect(useSpecimenTool(s, 'scan', ninth.id)).toBe(true); const before = noNotice(s); expect(specimenQuote(s, 'collect', ninth.id).ok).toBe(false);
    expect(useSpecimenTool(s, 'collect', ninth.id)).toBe(false); expect(noNotice(s)).toEqual(before); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(restored.space!.expedition).toEqual(cp.space!.expedition); expect(productCargoCount(restored)).toBe(0);
  });

  it('carries twelve actual bodies but rejects moving the paid hold cut after their collection', () => {
    const s = enabled(); travel(s, 2); expect(buy(s, 'hold')).toBe(true); collect(s, 12); expect(livingExpedition(s)!.cargo).toHaveLength(12);
    expect(round(s)).toEqual(s); const row = outfit(s).purchases[0]; row.lifeAction = s.space!.expedition!.nextAction; mirror(s, row);
    s.checkpoint = null; reject(s);
  });

  it('sells twelve units at the still-valid D1 treaty price and refuses expanding an older eight-slot sale', () => {
    const s = enabled(); expect(buy(s, 'hold')).toBe(true); travel(s, 2); expect(transact(s, { kind: 'load' })).toBe(true);
    expect(productCargoCount(s)).toBe(12); const originPlanetId = account(s).cargo[0].planetId; travel(s, 1);
    expect(economyQuote(s, { kind: 'sell', originPlanetId }, account(s).nextAction)).toMatchObject({ ok: true, amount: 12, price: 12 });
    const before = account(s).balance; expect(transact(s, { kind: 'sell', originPlanetId })).toBe(true);
    expect(account(s).balance).toBe(before + 144); expect(account(s).actions.at(-1)).toMatchObject({ kind: 'sell', amount: 12, earned: 144,
      priceBasis: { treatySerial: 4, relationRevision: 3, bonus: 2 } }); expect(round(s)).toEqual(s);
    const bad = enabled(); expect(buy(bad, 'hold')).toBe(true); const e = account(bad), old = e.actions.find(r => r.serial === 18)!;
    if (old.kind !== 'sell') throw new Error('old sale');
    // Conservation/payment-consistent forged nine-unit old sale plus its old load.
    const load = e.actions.find(r => r.serial === 17)!; if (load.kind !== 'load') throw new Error('old load'); load.amount++;
    old.amount++; old.earned += old.unitPrice; old.balanceAfter += old.unitPrice;
    e.colonies[0].loaded++; e.sales[0].amount++; e.sales[0].earned += old.unitPrice; e.ledger.revenue += old.unitPrice; e.balance += old.unitPrice;
    const gear = outfit(bad).purchases[0]; gear.balanceBefore += old.unitPrice; gear.balanceAfter += old.unitPrice; mirror(bad, gear);
    bad.checkpoint = null; reject(bad);
  });
});

describe('D2 persisted payments, bounded receipts and malformed imports', () => {
  it('roundtrips paid equipment through local/import rekey and restores the independently frozen before-purchase checkpoint', () => {
    const s = enabled(); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState; expect(buy(s, 'hold')).toBe(true); expect(buy(s, 'solar')).toBe(true);
    const local = new Map<string, string>(); vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), importedCp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-rekey'; importedCp.id = imported.id; imported.checkpoint = JSON.stringify(importedCp);
    expect(round(imported)).toEqual(imported); expect(round(imported).space).toEqual(s.space);
    const recovered = recoverGeneration(round(s)); expect(recovered.space!.outfit).toEqual(cp.space!.outfit); expect(account(recovered).balance).toBe(425);
    expect(recovered.space!.ship).toEqual(cp.space!.ship);
    // Same-clock cash refund cannot coexist with permanent paid receipts.
    account(s).balance += 80; reject(s);
  });

  it('keeps permanent paid receipts and their effective capacity after 129 actual deposits roll the source log', () => {
    const s = enabled();
    // Prepared unit treasury before CP, not earned native wealth. Every deposit
    // below really debits twenty; no balance or ledger is overwritten afterward.
    s.machines!.resource = 3000; makeCheckpoint(s); expect(buy(s, 'hold')).toBe(true); expect(buy(s, 'drive')).toBe(true); expect(buy(s, 'solar')).toBe(true);
    const purchases = structuredClone(outfit(s).purchases); makeCheckpoint(s);
    for (let i = 0; i < 129; i++) expect(transact(s, { kind: 'deposit' })).toBe(true);
    expect(s.machines!.resource).toBe(420); expect(account(s).balance).toBe(165 + 2580); expect(account(s).actions).toHaveLength(128);
    expect(account(s).actions.every(r => r.kind !== 'equipment')).toBe(true); expect(outfit(s).purchases).toEqual(purchases); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(outfit(restored).purchases).toEqual(purchases); expect(account(restored).balance).toBe(165); expect(restored.machines!.resource).toBe(3000);
    const changed = structuredClone(s); outfit(changed).purchases[0].unlock.completedSerial = 7; reject(changed);
    const erased = structuredClone(s); outfit(erased).purchases.shift(); reject(erased);
  });

  it('rejects changing a paid checkpoint prefix even when the altered receipt is independently valid', () => {
    const s = enabled(); expect(buy(s, 'hold')).toBe(true); makeCheckpoint(s); frames(s, 1);
    const row = outfit(s).purchases[0]; row.at += .1; mirror(s, row);
    const standalone = structuredClone(s); standalone.checkpoint = null;
    expect(round(standalone)).toEqual(standalone); reject(s);
  });

  it('rejects moving an otherwise balanced historical colony purchase into its already departing flight', () => {
    const s = enabled(); travel(s, 2); expect(buy(s, 'hold')).toBe(true);
    recharge(s); s.space!.location!.pos.y = 20; const start = s.space!.elapsed;
    expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); expect(round(s)).toEqual(s);
    const row = outfit(s).purchases[0], delay = start + .1 - row.spaceAt;
    row.spaceAt += delay; row.at += delay; mirror(s, row); s.checkpoint = null; reject(s);
  });

  it.each(['catalog', 'unknown-field', 'duplicate', 'price', 'ship', 'badge', 'copy', 'activation', 'timing'] as const)('rejects malformed %s equipment from both export and raw import', kind => {
    const s = enabled(); expect(buy(s, 'hold')).toBe(true); const row = outfit(s).purchases[0];
    if (kind === 'catalog') outfit(s).catalog = 2 as 1;
    if (kind === 'unknown-field') Object.assign(outfit(s), { grant: true });
    if (kind === 'duplicate') outfit(s).purchases.push(structuredClone(row));
    if (kind === 'price') { row.paid--; row.balanceAfter++; mirror(s, row); }
    if (kind === 'ship') { row.shipId += '-foreign'; mirror(s, row); }
    if (kind === 'badge') { row.unlock = { empireId: 'roots', completedSerial: 7 }; mirror(s, row); }
    if (kind === 'copy') row.at -= .01;
    if (kind === 'activation') outfit(s).activated.economyAction = row.serial + 1;
    if (kind === 'timing') { row.lifeAction = s.space!.expedition!.nextAction + 1; mirror(s, row); }
    reject(s);
  });
});
