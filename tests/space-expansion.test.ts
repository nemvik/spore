import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planetSystem, starSystems } from '../src/game/galaxy';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { stableBandCapacity } from '../src/game/space-ecology';
import { applyEconomyOrder, colonyStock, economyQuote, spaceEconomy, type EconomyOrder } from '../src/game/space-economy';
import { empireAt, empireRelation, spaceSalePrice } from '../src/game/space-empires';
import type { EmpireId } from '../src/game/space-empires-types';
import { jumpToSystem } from '../src/game/space-expedition';
import { applyExpansionOrder, enableSpaceExpansion, expansionQuote, placeSpaceAllies, stepSpaceAllies } from '../src/game/space-expansion';
import { alliedEmpire, allyFormation, ownerAt, territoryTitle } from '../src/game/space-expansion-content';
import type { ExpansionKind, ExpansionReceipt } from '../src/game/space-expansion-types';
import { equipmentQuote } from '../src/game/space-outfit';
import { shipCapabilities } from '../src/game/space-outfit-content';
import { changeSpaceScale, launchShip } from '../src/game/space';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

// Explicit prepared UNIT continuations of byte-identical native D2a. Beacon
// positions/altitude, labelled energy depletion and the rollover treasury below
// are test preconditions, not proof of native reachability or earned wealth.
const fixture = (flight = false) => parseGame(readFileSync(`tests/fixtures/space/native-d2a-${flight ? 'flight' : 'campaign'}.save.json`, 'utf8'));
const enabled = () => { const s = fixture(); enableSpaceExpansion(s); return s; };
const account = (s: GameState) => spaceEconomy(s)!;
const expansion = (s: GameState) => s.space!.expansion!;
const empire = (s: GameState, id: EmpireId) => s.space!.empires!.entries.find(e => e.id === id)!;
const ally = (s: GameState, id: EmpireId = 'resin') => expansion(s).allies.find(a => a.empireId === id)!;
const round = (s: GameState) => parseGame(serializeGame(s));
const pay = (s: GameState, kind: ExpansionKind, id: EmpireId = 'resin') => applyExpansionOrder(s, kind, id, account(s).nextAction);
const transact = (s: GameState, cmd: EconomyOrder) => applyEconomyOrder(s, cmd, account(s).nextAction);
const noNotice = (s: GameState) => { const c = structuredClone(s); c.space!.notice = ''; return c; };
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...home } = s; return structuredClone(home); };
const frames = (s: GameState, seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) step(s, EMPTY_INPUT, 1 / 30); };
const beacon = (s: GameState) => { s.space!.location!.pos = { x: 0, y: 3, z: 0 }; };
function finish(s: GameState) { for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30); expect(s.space!.leg).toBeNull(); }
function recharge(s: GameState, energy = 30) {
  for (let i = 0; i < 900 && s.space!.ship!.energy < energy; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.ship!.energy).toBeGreaterThanOrEqual(energy);
}
function travel(s: GameState, index: number) {
  const p = s.space!, systems = starSystems(p.homePlanetId);
  if (!p.location) expect(launchShip(s)).toBe(true);
  if (p.location!.scale === 'surface') { recharge(s); p.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  if (p.location!.scale === 'orbit') { recharge(s); beacon(s); expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  let current = planetSystem(p.homePlanetId, p.location!.planetId)!.index;
  while (current !== index) { current += Math.sign(index - current); recharge(s); expect(jumpToSystem(s, systems[current].id)).toBe(true); finish(s); }
  beacon(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s);
  if (index === 0) expect(changeSpaceScale(s, 'down')).toBe(true);
}
function capital(s: GameState, id: EmpireId = 'resin') { travel(s, planetSystem(s.space!.homePlanetId, empire(s, id).capitalId)!.index); }
function recruited(id: EmpireId = 'resin') { const s = enabled(); capital(s, id); expect(pay(s, 'alliance', id)).toBe(true); return s; }
function refuse(s: GameState, kind: ExpansionKind, id: EmpireId = 'resin', revision = account(s).nextAction) {
  const before = noNotice(s); expect(expansionQuote(s, kind, id, revision).ok).toBe(false);
  expect(applyExpansionOrder(s, kind, id, revision)).toBe(false); expect(noNotice(s)).toEqual(before);
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
function mirror(s: GameState, row: ExpansionReceipt) {
  const index = account(s).actions.findIndex(r => r.serial === row.serial); if (index >= 0) account(s).actions[index] = structuredClone(row);
}
function sourceReady(s: GameState) {
  const e = livingExpedition(s)!, w = livingPlanet(s)!;
  // Wait for actual physiology/stability; never set stableFor or insert life.
  for (let i = 0; i < 5400 && stableBandCapacity(e, w) < 1; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(stableBandCapacity(e, w)).toBeGreaterThanOrEqual(1);
}
afterEach(() => vi.unstubAllGlobals());

describe('D2b independent explicit account activation and paid alliances', () => {
  it('preserves historical v3 and every paid receipt while live and old checkpoint get independent empty v4 cuts', () => {
    const s = fixture(), before = structuredClone(s), oldCp = JSON.parse(s.checkpoint!) as GameState;
    expect(Object.hasOwn(s.space!, 'expansion')).toBe(false); enableSpaceExpansion(s);
    expect(expansion(s)).toEqual({ version: 1, activated: { at: before.space!.elapsed, tick: before.tick, travelAction: 309, lifeAction: 292, economyAction: 24 }, actions: [], allies: [] });
    expect(account(s)).toEqual({ ...account(before), version: 4, ledger: { ...account(before).ledger, alliance: 0, territory: 0 }, counts: { ...account(before).counts, alliance: 0, territory: 0 } });
    expect(account(s).balance).toBe(261); expect(account(s).pricingActivatedAction).toBe(15); expect(domestic(s)).toEqual(domestic(before));
    expect(s.space!.outfit).toEqual(before.space!.outfit); expect(s.space!.expedition).toEqual(before.space!.expedition); expect(s.space!.empires).toEqual(before.space!.empires);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(expansion(cp)).toEqual({ version: 1, activated: { at: 0, tick: oldCp.tick, travelAction: 1, lifeAction: 1, economyAction: 1 }, actions: [], allies: [] });
    expect(account(cp)).toMatchObject({ version: 4, balance: 0, pricingActivatedAction: 1 }); expect(cp.space!.ship).toBeNull();
    const once = structuredClone(s); enableSpaceExpansion(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
  });

  it('does not silently upgrade a D1 account without outfit and retains fresh opt-ins without copying purchases', () => {
    const d1 = parseGame(readFileSync('tests/fixtures/space/native-d1-campaign.save.json', 'utf8')), before = structuredClone(d1);
    enableSpaceExpansion(d1); expect(d1).toEqual(before);
    const s = recruited(); s.checkpoint = null; const fresh = recoverGeneration(s);
    expect(fresh.stage).toBe(0); expect(account(fresh)).toMatchObject({ version: 4, balance: 0, nextAction: 1 });
    expect(expansion(fresh).actions).toEqual([]); expect(expansion(fresh).allies).toEqual([]); expect(fresh.space!.ship).toBeNull(); expect(round(fresh)).toEqual(fresh);
  });

  it.each(['resin', 'roots', 'basalt'] as const)('pays forty once for a distinct %s escort and preserves the embassy and historical prices', id => {
    const s = enabled(); capital(s, id); const e = account(s), p = s.space!, revision = e.nextAction, ship = structuredClone(p.ship), registry = structuredClone(p.empires), relation = empireRelation(s, empire(s, id));
    const oldPrices = structuredClone(e.actions), price = spaceSalePrice(s, empire(s, id).capitalId, 'moon-salt');
    expect(expansionQuote(s, 'alliance', id, revision)).toMatchObject({ ok: true, price: 40 }); expect(pay(s, 'alliance', id)).toBe(true);
    const receipt = expansion(s).actions[0]; expect(receipt).toMatchObject({ kind: 'alliance', serial: revision, empireId: id, paid: 40, balanceBefore: 261, balanceAfter: 221, treatySerial: empire(s, id).treaty });
    expect(e.actions.slice(0, -1)).toEqual(oldPrices); expect(e.actions.at(-1)).toEqual(receipt); expect(e.actions.at(-1)).not.toBe(receipt);
    expect(ally(s, id)).toEqual({ id: `${p.homePlanetId}:ally-${id}`, empireId: id, paidSerial: revision, location: allyFormation(p.location!, id), energy: 12, generated: 0, delivered: 0 });
    expect(p.ship).toEqual(ship); expect(p.empires).toEqual(registry); expect(empireRelation(s, empire(s, id))).toBe(relation + 10);
    expect(spaceSalePrice(s, empire(s, id).capitalId, 'moon-salt')).toEqual(price); expect(ownerAt(p, empire(s, id).capitalId)).toBe(id);
    refuse(s, 'alliance', id, revision); refuse(s, 'alliance', id); expect(round(s)).toEqual(s);
  });

  it.each(['stale', 'remote', 'high', 'funds', 'no-treaty', 'dead', 'unknown-kind', 'unknown-empire'] as const)('refuses %s offer atomically', kind => {
    const s = enabled(); capital(s); let order: ExpansionKind = 'alliance', id: EmpireId = 'resin', revision = account(s).nextAction;
    // Invalid refusal-only unit inputs are never serialized as legitimate play.
    if (kind === 'stale') revision--;
    if (kind === 'remote') s.space!.location!.pos.x = 13;
    if (kind === 'high') s.space!.location!.pos.y = 9;
    if (kind === 'funds') account(s).balance = 39;
    if (kind === 'no-treaty') empire(s, id).treaty = null;
    if (kind === 'dead') s.space!.ship!.health = 0;
    if (kind === 'unknown-kind') order = '__proto__' as ExpansionKind;
    if (kind === 'unknown-empire') id = '__proto__' as EmpireId;
    refuse(s, order, id, revision);
  });

  it('rejects home, a foreign unowned surface and both active and finished orbital travel', () => {
    const s = enabled(); refuse(s, 'alliance'); travel(s, 2); refuse(s, 'territory');
    capital(s); s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); refuse(s, 'alliance'); finish(s); refuse(s, 'alliance');
  });
});

describe('D2b physical companion energy, following and stasis', () => {
  it('transfers two per second from its own battery and records only accepted solar generation', () => {
    const s = recruited(), p = s.space!;
    p.ship!.energy = 20; makeCheckpoint(s); // Explicitly prepared depletion before the regression checkpoint.
    frames(s, 1); const a = ally(s);
    expect(p.ship!.energy).toBeCloseTo(20 + shipCapabilities(p)!.solar + 2, 10);
    expect(a.delivered).toBeCloseTo(2, 10); expect(a.generated).toBeCloseTo(.8 * 29 / 30, 10);
    expect(a.energy).toBeCloseTo(12 + a.generated - a.delivered, 10); expect(round(s)).toEqual(s);
    frames(s, 10); expect(a.energy).toBeGreaterThanOrEqual(0); expect(a.energy).toBeLessThanOrEqual(12);
    expect(a.delivered).toBeLessThanOrEqual(12 + a.generated + 1e-8); expect(round(s)).toEqual(s);
  });

  it('does not generate overflow when both batteries are full and follows a remote ship at bounded speed before helping', () => {
    const s = recruited(), p = s.space!, a = ally(s); p.ship!.energy = shipCapabilities(p)!.energy; makeCheckpoint(s);
    frames(s, 1); expect(a).toMatchObject({ energy: 12, generated: 0, delivered: 0 });
    p.ship!.energy = 20; p.location!.pos.x = 70; makeCheckpoint(s); const position = structuredClone(a.location!.pos), before = p.ship!.energy;
    step(s, EMPTY_INPUT, 1 / 30);
    expect(a.delivered).toBe(0); expect(p.ship!.energy - before).toBeCloseTo(shipCapabilities(p)!.solar / 30, 10);
    const distance = Math.hypot(a.location!.pos.x - position.x, a.location!.pos.y - position.y, a.location!.pos.z - position.z);
    expect(distance).toBeGreaterThan(0); expect(distance).toBeLessThanOrEqual((shipCapabilities(p)!.speed * 1.6 + 2) / 30 + 1e-8);
    expect(round(s)).toEqual(s);
    for (const invalid of [0, -1, NaN, Infinity]) { const snapshot = structuredClone(s); stepSpaceAllies(s, invalid); expect(s).toEqual(snapshot); }
  });

  it('freezes the entire companion during a transition and repositions only on actual arrival, then parks and relaunches', () => {
    const s = recruited(); s.space!.ship!.energy = 30; s.space!.location!.pos.y = 20; placeSpaceAllies(s); expect(changeSpaceScale(s, 'up')).toBe(true);
    const energy = s.space!.ship!.energy, companion = structuredClone(ally(s)); frames(s, 1); makeCheckpoint(s);
    const cp = JSON.parse(s.checkpoint!) as GameState; frames(s, 1); expect(ally(s)).toEqual(companion); expect(s.space!.ship!.energy).toBe(energy); expect(round(s)).toEqual(s);
    finish(s); expect(ally(s).generated).toBe(companion.generated); expect(ally(s).delivered).toBe(companion.delivered);
    expect(ally(s).location).toEqual(allyFormation(s.space!.location!, 'resin')); expect(round(s)).toEqual(s);
    const recovered = recoverGeneration(round(s)); expect(recovered.space!.leg).toEqual(cp.space!.leg); expect(expansion(recovered)).toEqual(expansion(cp));
    travel(s, 0); expect(ally(s).location).toBeNull(); makeCheckpoint(s); const parked = structuredClone(ally(s)); frames(s, 2);
    expect(ally(s)).toEqual(parked); expect(round(s)).toEqual(s); expect(launchShip(s)).toBe(true); expect(ally(s).location).toEqual(allyFormation(s.space!.location!, 'resin')); expect(round(s)).toEqual(s);
  });

  it('preserves all three separately paid stable IDs across a real interstellar transition', () => {
    const s = enabled(); for (const id of ['resin', 'roots', 'basalt'] as const) { capital(s, id); expect(pay(s, 'alliance', id)).toBe(true); }
    expect(account(s).balance).toBe(141); expect(expansion(s).allies).toHaveLength(3);
    const ids = expansion(s).allies.map(a => a.id), payments = structuredClone(expansion(s).actions); travel(s, 2);
    expect(expansion(s).allies.map(a => a.id)).toEqual(ids); expect(expansion(s).actions).toEqual(payments);
    for (const a of expansion(s).allies) expect(a.location!.planetId).toBe(s.space!.location!.planetId);
    expect(new Set(ids).size).toBe(3); expect(round(s)).toEqual(s);
  });

  it.each(['ally-generation', 'ally-delivery', 'ship-energy'] as const)('rejects forged %s while the same checkpointed leg is still in progress', kind => {
    const s = recruited(); s.space!.ship!.energy = 30; s.space!.location!.pos.y = 20; placeSpaceAllies(s); expect(changeSpaceScale(s, 'up')).toBe(true);
    frames(s, .5); makeCheckpoint(s); frames(s, .5); expect(round(s)).toEqual(s);
    if (kind === 'ally-generation') { ally(s).generated += .1; ally(s).delivered += .1; }
    if (kind === 'ally-delivery') { ally(s).delivered += .1; ally(s).energy -= .1; }
    if (kind === 'ship-energy') s.space!.ship!.energy += .1;
    reject(s);
  });

  it.each(['clock', 'destination'] as const)('rejects replacing the %s of an already checkpointed pending leg', kind => {
    const s = recruited(); s.space!.location!.pos.y = 20; placeSpaceAllies(s); expect(changeSpaceScale(s, 'up')).toBe(true);
    frames(s, .5); makeCheckpoint(s); frames(s, .5); expect(round(s)).toEqual(s);
    if (kind === 'clock') s.space!.leg!.elapsed -= .1;
    else s.space!.leg!.to.heading += .1;
    const standalone = structuredClone(s); standalone.checkpoint = null; expect(round(standalone)).toEqual(standalone); reject(s);
  });

  it('rejects zero-time energy even across real dock and launch serials, and rejects energy above actual solar plus transfer', () => {
    const s = recruited(); travel(s, 0); s.space!.ship!.energy = 20; makeCheckpoint(s);
    expect(launchShip(s)).toBe(true); expect(changeSpaceScale(s, 'down')).toBe(true); expect(launchShip(s)).toBe(true); expect(round(s)).toEqual(s);
    const zeroTime = structuredClone(s); zeroTime.space!.ship!.energy++; reject(zeroTime);
    frames(s, 1); expect(round(s)).toEqual(s); s.space!.ship!.energy += 1; reject(s);
  });
});

describe('D2b paid sovereignty and ecological colonization permissions', () => {
  it('buys a capital for120 without giving a free colony, preserving the immutable embassy and treaty', () => {
    const s = enabled(); capital(s); sourceReady(s); const p = s.space!, e = account(s), before = structuredClone(p.empires), colonies = structuredClone(e.colonies);
    expect(ownerAt(p, p.homePlanetId)).toBe('player'); expect(ownerAt(p, e.colonies[0].planetId)).toBe('player'); expect(ownerAt(p, empire(s, 'resin').capitalId)).toBe('resin');
    expect(economyQuote(s, { kind: 'found' }, e.nextAction).ok).toBe(false);
    const revision = e.nextAction; expect(expansionQuote(s, 'territory', 'resin', revision)).toMatchObject({ ok: true, price: 120 }); expect(pay(s, 'territory')).toBe(true);
    expect(e.balance).toBe(141); expect(e.ledger.territory).toBe(120); expect(ownerAt(p, empire(s, 'resin').capitalId)).toBe('player');
    expect(e.colonies).toEqual(colonies); expect(expansion(s).allies).toEqual([]); expect(p.empires).toEqual(before); expect(empireAt(s, empire(s, 'resin').capitalId)).toEqual(before!.entries[0]);
    expect(territoryTitle(p, empire(s, 'resin').capitalId)).toEqual(expansion(s).actions[0]); refuse(s, 'territory', 'resin', revision); refuse(s, 'territory');
    expect(transact(s, { kind: 'found' })).toBe(true); const colony = e.colonies.at(-1)!;
    expect(colony).toMatchObject({ level: 1, paid: 40, produced: 0, loaded: 0, permission: { titleSerial: revision, foundingSerial: revision + 1 } });
    expect(e.balance).toBe(101); expect(round(s)).toEqual(s);
    const forged = structuredClone(s); account(forged).colonies.at(-1)!.permission!.foundingSerial = revision; reject(forged);
  });

  it('keeps an already-player enclave off the sale list without changing the original protected colonies', () => {
    // Pure quote branch preparation; it is not serialized as a earned sovereign history.
    const s = enabled(); capital(s); empire(s, 'resin').enclave = true;
    expect(ownerAt(s.space!, empire(s, 'resin').capitalId)).toBe('player'); refuse(s, 'territory');
    expect(expansionQuote(s, 'alliance', 'resin', account(s).nextAction).ok).toBe(true);
  });

  it('produces paid colony goods, sells on a different market and retains v4 equipment and historical pricing', () => {
    const s = recruited(); sourceReady(s); expect(pay(s, 'territory')).toBe(true); expect(transact(s, { kind: 'found' })).toBe(true);
    const e = account(s), colony = e.colonies.at(-1)!; expect(e.balance).toBe(61); frames(s, 10);
    expect(colonyStock(colony)).toBe(1); expect(transact(s, { kind: 'load' })).toBe(true); const originPlanetId = colony.planetId;
    travel(s, 0); const q = economyQuote(s, { kind: 'sell', originPlanetId }, e.nextAction), before = e.balance;
    expect(q.ok).toBe(true); expect(q.amount).toBe(1); expect(transact(s, { kind: 'sell', originPlanetId })).toBe(true); expect(e.balance).toBe(before + q.price);
    expect(shipCapabilities(s.space!)).toMatchObject({ cargo: 12, jumpRange: 32 }); expect(equipmentQuote(s, 'hold', e.nextAction).reason).toContain('namontovaný');
    expect(s.space!.outfit!.purchases).toHaveLength(3); expect(round(s)).toEqual(s);
  });
});

describe('D2b persistence, permanent witnesses and bounded-history chronology', () => {
  it('preserves paid allies and titles through local/import rekey and recovers the independently frozen pre-purchase choice', () => {
    const s = enabled(); capital(s); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(pay(s, 'alliance')).toBe(true); expect(pay(s, 'territory')).toBe(true); const local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), importedCp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-rekey'; importedCp.id = imported.id; imported.checkpoint = JSON.stringify(importedCp); expect(round(imported)).toEqual(imported);
    expect(round(imported).space).toEqual(s.space); const recovered = recoverGeneration(round(s));
    expect(expansion(recovered)).toEqual(expansion(cp)); expect(account(recovered)).toEqual(account(cp)); expect(ownerAt(recovered.space!, empire(s, 'resin').capitalId)).toBe('resin');
    expect(domestic(recovered)).toEqual(domestic(cp));
  });

  it('preserves territory/founding order after129 real deposits and rejects moving new founding behind its checkpoint cut', () => {
    const s = enabled(); s.machines!.resource = 3000; makeCheckpoint(s); // Explicit prepared treasury before any tested payment.
    capital(s); expect(pay(s, 'alliance')).toBe(true); expect(pay(s, 'territory')).toBe(true); const title = expansion(s).actions[1];
    travel(s, 2); s.space!.ship!.energy = 20; makeCheckpoint(s); expect(transact(s, { kind: 'charge' })).toBe(true);
    capital(s); sourceReady(s); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(transact(s, { kind: 'found' })).toBe(true); const colonyId = account(s).colonies.at(-1)!.id; const permission = structuredClone(account(s).colonies.at(-1)!.permission);
    travel(s, 0); for (let i = 0; i < 6; i++) expect(transact(s, { kind: 'deposit' })).toBe(true);
    capital(s, 'roots'); sourceReady(s); expect(pay(s, 'territory', 'roots')).toBe(true); expect(transact(s, { kind: 'found' })).toBe(true);
    const secondId = account(s).colonies.at(-1)!.id;
    travel(s, 0); for (let i = 0; i < 129; i++) expect(transact(s, { kind: 'deposit' })).toBe(true);
    expect(account(s).actions).toHaveLength(128); expect(account(s).actions.every(r => r.kind === 'deposit')).toBe(true);
    expect(territoryTitle(s.space!, title.planetId)).toEqual(title); expect(account(s).colonies.find(c => c.id === colonyId)!.permission).toEqual(permission);
    expect(round(s)).toEqual(s); const recovered = recoverGeneration(round(s)); expect(expansion(recovered)).toEqual(expansion(cp)); expect(account(recovered).colonies).toEqual(account(cp).colonies);
    const bad = structuredClone(s), colony = account(bad).colonies.find(c => c.id === colonyId)!;
    colony.permission!.foundingSerial = account(cp).nextAction - 1;
    expect(colony.permission!.foundingSerial).toBeGreaterThan(title.serial);
    const standalone = structuredClone(bad); standalone.checkpoint = null; expect(round(standalone)).toEqual(standalone); reject(bad);
    const duplicate = structuredClone(s); duplicate.checkpoint = null;
    account(duplicate).colonies.find(c => c.id === colonyId)!.permission!.foundingSerial = account(duplicate).colonies.find(c => c.id === secondId)!.permission!.foundingSerial;
    reject(duplicate);
    const paymentCollision = structuredClone(s); paymentCollision.checkpoint = null;
    account(paymentCollision).colonies.find(c => c.id === colonyId)!.permission!.foundingSerial = expansion(paymentCollision).actions.at(-1)!.serial;
    reject(paymentCollision);
    const gearCollision = structuredClone(s); gearCollision.checkpoint = null;
    expansion(gearCollision).activated.economyAction = 19;
    expansion(gearCollision).actions[0].serial = 19; ally(gearCollision).paidSerial = 19;
    reject(gearCollision);
  });

  it.each(['price', 'treaty', 'duplicate', 'battery', 'copy', 'free-title'] as const)('rejects malformed %s proof without accepting a free or duplicated action', kind => {
    const s = recruited(), row = expansion(s).actions[0];
    if (kind === 'price') { row.paid--; row.balanceAfter++; mirror(s, row); }
    if (kind === 'treaty') { row.treatySerial = 8; mirror(s, row); }
    if (kind === 'duplicate') expansion(s).actions.push(structuredClone(row));
    if (kind === 'battery') ally(s).energy++;
    if (kind === 'copy') row.at -= .01;
    if (kind === 'free-title') { row.kind = 'territory'; mirror(s, row); }
    reject(s);
  });
});
