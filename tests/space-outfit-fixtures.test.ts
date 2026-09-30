import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planetSystem, systemDistance } from '../src/game/galaxy';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { livingExpedition } from '../src/game/space-biosphere';
import { productCargoCount, shipCargoCount, spaceEconomy } from '../src/game/space-economy';
import { installedEquipment, shipCapabilities } from '../src/game/space-outfit-content';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  active: { name: 'native-d2a-campaign.save.json', sha: 'a2f91fe0d3123a35c7ecae4672476b01a90ea24268f2d0689cfc11e3a14e61d3' },
  flight: { name: 'native-d2a-flight.save.json', sha: 'e1ca13296bba32116b928385e2b7353199b0d7be7892524a8811079fcb3aeb16' },
} as const;
type Kind = keyof typeof fixtures;
const kinds = ['active', 'flight'] as const;
const bytes = (kind: Kind) => readFileSync(`tests/fixtures/space/${fixtures[kind].name}`);
const load = (kind: Kind) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const account = (s: GameState) => spaceEconomy(s)!;
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...home } = s; return structuredClone(home); };
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
afterEach(() => vi.unstubAllGlobals());

describe('D2a exact native paid equipment and loaded long-flight exports', () => {
  it.each(kinds)('preserves exact %s bytes and historical v3 without automatic D2b expansion', kind => {
    const raw = bytes(kind), s = parseGame(raw.toString());
    expect(createHash('sha256').update(raw).digest('hex')).toBe(fixtures[kind].sha);
    expect(s).toEqual(JSON.parse(raw.toString()).state); expect(round(s)).toEqual(s);
    expect(account(s).version).toBe(3); expect(account(s).pricingActivatedAction).toBe(15);
    expect(Object.hasOwn(s.space!, 'expansion')).toBe(false);
    expect(Object.hasOwn(account(s).ledger, 'alliance')).toBe(false); expect(Object.hasOwn(account(s).ledger, 'territory')).toBe(false);
    expect(bytes(kind)).toEqual(raw);
  });

  it.each(kinds)('keeps %s equipment, cash and physical cargo through local storage and rekeyed public import', kind => {
    const s = load(kind), local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-fixture-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    expect(round(imported)).toEqual(imported); expect(round(imported).space).toEqual(s.space);
    expect(imported.space!.homePlanetId).toBe('home-line-481516-1789565791150');
    expect(account(imported).balance).toBe(kind === 'active' ? 261 : 165); expect(imported.machines!.resource).toBe(s.machines!.resource);
  });

  it.each(kinds)('recovers the actual old %s checkpoint without granting later modules, badges, cash or ship', kind => {
    const s = load(kind), checkpoint = JSON.parse(bytes(kind).toString()).state.checkpoint as string;
    expect(s.checkpoint).toBe(checkpoint); const cp = JSON.parse(checkpoint) as GameState;
    expect(cp.tick).toBe(66066); expect(cp.machines!.resource).toBe(155.76499999940776); expect(cp.space!.ship).toBeNull();
    expect(cp.space!.outfit).toEqual({ version: 1, catalog: 1, activated: { at: 0, tick: 66066, travelAction: 1, lifeAction: 1, economyAction: 1 }, purchases: [] });
    expect(account(cp)).toMatchObject({ version: 3, pricingActivatedAction: 1, balance: 0, actions: [], nextAction: 1, ledger: { equipment: 0 }, counts: { equipment: 0 } });
    expect(cp.space!.empires!.inheritance).toBeNull(); expect(livingExpedition(cp)!.worlds).toEqual([]);
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines);
    expect(restored.civilization).toEqual(cp.civilization); expect(restored.lineageHistory).toEqual(cp.lineageHistory); expect(round(restored).space).toEqual(cp.space);
  });

  it.each(kinds)('retains all old %s price receipts and pays precisely 260 for detached copies of the three earned modules', kind => {
    const s = load(kind), d1 = parseGame(readFileSync('tests/fixtures/space/native-d1-campaign.save.json', 'utf8')), e = account(s), p = s.space!;
    expect(e.actions.slice(0, 18)).toEqual(account(d1).actions);
    expect(p.outfit!.activated).toEqual({ at: d1.space!.elapsed, tick: d1.tick, travelAction: 287, lifeAction: 292, economyAction: 19 });
    expect(p.outfit!.purchases.map(row => [row.serial, row.equipment, row.paid, row.balanceBefore, row.balanceAfter]))
      .toEqual([[19, 'hold', 80, 425, 345], [20, 'drive', 120, 345, 225], [21, 'solar', 60, 225, 165]]);
    expect(p.outfit!.purchases.map(row => row.unlock)).toEqual([{ empireId: 'resin', completedSerial: 3 }, { empireId: 'basalt', completedSerial: 11 }, { empireId: 'roots', completedSerial: 7 }]);
    expect(e.ledger.equipment).toBe(260); expect(e.counts.equipment).toBe(3);
    for (const row of p.outfit!.purchases) { expect(row).toEqual(e.actions.find(action => action.serial === row.serial)); expect(row).not.toBe(e.actions.find(action => action.serial === row.serial)); }
    expect(p.ship!.creation).toEqual(d1.space!.ship!.creation); expect(p.ship!.purchase).toEqual(d1.space!.ship!.purchase);
    expect(p.empires).toEqual(d1.space!.empires); expect(s.civilization).toEqual(d1.civilization); expect(s.lineageHistory).toEqual(d1.lineageHistory);
    expect(installedEquipment(p)).toEqual(['hold', 'drive', 'solar']); expect(shipCapabilities(p)).toMatchObject({ cargo: 12, jumpRange: 32 });
    expect(shipCapabilities(p)!.solar - shipCapabilities(d1.space!)!.solar).toBeCloseTo(2, 12);
  });

  it('retains twelve actual goods during a paid six-second jump beyond the original range', () => {
    const s = load('flight'), p = s.space!, e = account(s), leg = p.leg!;
    expect(s.tick).toBe(67336); expect(s.machines!.resource).toBe(19.184999999410145);
    expect(leg).toMatchObject({ duration: 6, energyPaid: 12, from: { scale: 'system', planetId: `${p.homePlanetId}:star-2:planet` }, to: { scale: 'system', planetId: p.homePlanetId } });
    expect(leg.elapsed).toBeCloseTo(.2, 12); expect(p.location).toEqual(leg.from); expect(p.nextSerial).toBe(305);
    const from = planetSystem(p.homePlanetId, leg.from.planetId)!, to = planetSystem(p.homePlanetId, leg.to.planetId)!;
    expect(systemDistance(from, to)).toBeGreaterThan(18); expect(systemDistance(from, to)).toBeLessThanOrEqual(32);
    expect(e.cargo).toEqual([{ planetId: `${p.homePlanetId}:star-2:planet`, product: 'moon-salt', amount: 12 }]);
    expect(productCargoCount(s)).toBe(12); expect(shipCargoCount(s)).toBe(12); expect(livingExpedition(s)!.cargo).toEqual([]);
    expect(e.actions.at(-1)).toMatchObject({ kind: 'load', serial: 22, amount: 12, paid: 0, balanceBefore: 165, balanceAfter: 165 });
    expect(e.balance).toBe(165); expect(e.ledger.revenue).toBe(488); expect(e.nextAction).toBe(23);
  });

  it('returns home and sells all twelve for the quoted domestic price without applying a foreign treaty bonus', () => {
    const s = load('active'), p = s.space!, e = account(s), flight = load('flight');
    expect(s.tick).toBe(67375); expect(s.machines!.resource).toBe(20.15999999941009);
    expect(p.location).toBeNull(); expect(p.leg).toBeNull(); expect(p.log.at(-1)).toMatchObject({ serial: 308, from: 'surface', to: 'dock', planetId: p.homePlanetId });
    expect(e.actions.slice(0, 22)).toEqual(account(flight).actions); expect(e.actions.at(-1)).toMatchObject({ kind: 'sell', serial: 23, amount: 12, unitPrice: 8, earned: 96,
      planetId: p.homePlanetId, balanceBefore: 165, balanceAfter: 261, priceBasis: { version: 1, base: 8, empireId: null, treatySerial: null, relationRevision: null, bonus: 0 } });
    expect(e.balance).toBe(261); expect(e.balance).toBe(60 + 584 - 80 - 40 - 3 - 260); expect(e.cargo).toEqual([]);
    expect(e.colonies.map(c => [c.level, c.produced, c.loaded, c.produced - c.loaded])).toEqual([[2, 60, 44, 16], [2, 24, 8, 16]]);
    expect(p.outfit).toEqual(flight.space!.outfit); expect(livingExpedition(s)!.actions).toEqual(livingExpedition(flight)!.actions);
  });

  it('separately prepares a full midflight checkpoint, finishes the already-paid leg and restores its exact partial progress', () => {
    // This full generation checkpoint is UNIT preparation, not the old native CP.
    // The continuation uses ordinary runtime steps; no coordinates or time are set.
    const s = load('flight'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, home = domestic(s), energy = s.space!.ship!.energy;
    const biology = structuredClone(s.space!.expedition), serial = s.space!.nextSerial;
    for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(s.space!.leg).toBeNull(); expect(s.space!.location).toEqual(cp.space!.leg!.to); expect(s.space!.nextSerial).toBe(serial + 1);
    expect(s.space!.ship!.energy).toBe(energy); expect(productCargoCount(s)).toBe(12); expect(account(s).balance).toBe(165);
    expect(s.space!.expedition).toEqual(biology); expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(restored.space!.leg).toEqual(cp.space!.leg); expect(restored.space!.location).toEqual(cp.space!.location);
    expect(restored.space!.outfit).toEqual(cp.space!.outfit); expect(account(restored)).toEqual(account(cp)); expect(restored.space!.ship).toEqual(cp.space!.ship);
    expect(domestic(restored)).toEqual(home); expect(round(restored).space!.leg).toEqual(cp.space!.leg);
  });

  it('separately prepares a full home checkpoint and recovers paid equipment and sale without granting money twice', () => {
    const s = load('active'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(s.space!.outfit).toEqual(cp.space!.outfit); expect(account(s).actions).toEqual(account(cp).actions); expect(account(s).balance).toBe(261);
    expect(round(s)).toEqual(s); const restored = recoverGeneration(round(s)); expect(account(restored)).toEqual(account(cp));
    expect(restored.space!.outfit).toEqual(cp.space!.outfit); expect(restored.machines).toEqual(cp.machines);
  });

  it.each(['copy', 'badge', 'cargo', 'leg'] as const)('rejects a tampered native %s without changing either fixture', kind => {
    const s = load('flight');
    if (kind === 'copy') s.space!.outfit!.purchases[0].balanceAfter++;
    if (kind === 'badge') { const row = s.space!.outfit!.purchases[2]; row.unlock = { empireId: 'resin', completedSerial: 3 }; account(s).actions[row.serial - 1] = structuredClone(row); }
    if (kind === 'cargo') { account(s).cargo[0].amount++; account(s).colonies[0].loaded++; const row = account(s).actions.at(-1)!; if (row.kind !== 'load') throw new Error('fixture load'); row.amount++; }
    if (kind === 'leg') s.space!.leg!.energyPaid--;
    reject(s); expect(createHash('sha256').update(bytes('flight')).digest('hex')).toBe(fixtures.flight.sha);
  });
});
