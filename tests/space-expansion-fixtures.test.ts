import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { livingExpedition } from '../src/game/space-biosphere';
import { productCargoCount, spaceEconomy } from '../src/game/space-economy';
import { empireAt } from '../src/game/space-empires';
import { allyFormation, ownerAt, territoryTitle } from '../src/game/space-expansion-content';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  active: { name: 'native-d2b-campaign.save.json', sha: '94f06db656b31db2de2fb720668dcfb725b0d25899da87fcd52338bb7d8faa3c' },
  flight: { name: 'native-d2b-flight.save.json', sha: '21493206083b9b3e3b1ccc505d5e47d6c1166a50b4b0cc306a55610475ab1a1d' },
} as const;
type Kind = keyof typeof fixtures;
const kinds = ['active', 'flight'] as const;
const bytes = (kind: Kind) => readFileSync(`tests/fixtures/space/${fixtures[kind].name}`);
const load = (kind: Kind) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const account = (s: GameState) => spaceEconomy(s)!;
const expansion = (s: GameState) => s.space!.expansion!;
const ally = (s: GameState) => expansion(s).allies[0];
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...home } = s; return structuredClone(home); };
function nativeHome(s: GameState) {
  // Same full domestic projection used by the native driver; import IDs alone differ.
  const home = structuredClone(s) as unknown as Record<string, unknown>; delete home.id; delete home.space;
  if (typeof home.checkpoint === 'string') { const cp = JSON.parse(home.checkpoint); delete cp.id; home.checkpoint = cp; }
  return home;
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
afterEach(() => vi.unstubAllGlobals());

describe('D2b exact native paid escort, sovereign colony and shared-flight exports', () => {
  it.each(kinds)('preserves exact %s bytes, full v4 state and independent historical checkpoint', kind => {
    const raw = bytes(kind), s = parseGame(raw.toString());
    expect(createHash('sha256').update(raw).digest('hex')).toBe(fixtures[kind].sha);
    expect(s).toEqual(JSON.parse(raw.toString()).state); expect(round(s)).toEqual(s);
    expect(account(s).version).toBe(4); expect(account(s).pricingActivatedAction).toBe(15);
    expect(s.checkpoint).toBe(JSON.parse(raw.toString()).state.checkpoint); expect(bytes(kind)).toEqual(raw);
  });

  it.each(kinds)('loads and rekeys %s without duplicating ownership, escort, funds or cargo', kind => {
    const s = load(kind), local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-fixture-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    expect(round(imported)).toEqual(imported); expect(round(imported).space).toEqual(s.space);
    expect(account(imported).balance).toBe(kind === 'active' ? 117 : 61); expect(ally(imported).id).toBe(`${s.space!.homePlanetId}:ally-resin`);
  });

  it.each(kinds)('recovers the actual old %s checkpoint without copying the late alliance or title backward', kind => {
    const s = load(kind), cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.tick).toBe(66066); expect(cp.machines!.resource).toBe(155.76499999940776); expect(cp.space!.ship).toBeNull();
    expect(expansion(cp)).toEqual({ version: 1, activated: { at: 0, tick: 66066, travelAction: 1, lifeAction: 1, economyAction: 1 }, actions: [], allies: [] });
    expect(account(cp)).toMatchObject({ version: 4, balance: 0, colonies: [], cargo: [], actions: [], nextAction: 1,
      ledger: { alliance: 0, territory: 0, equipment: 0 }, counts: { alliance: 0, territory: 0, equipment: 0 } });
    expect(cp.space!.outfit!.purchases).toEqual([]); expect(livingExpedition(cp)!.worlds).toEqual([]);
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines);
    expect(restored.civilization).toEqual(cp.civilization); expect(restored.lineageHistory).toEqual(cp.lineageHistory); expect(round(restored).space).toEqual(cp.space);
  });

  it.each(kinds)('keeps prior %s outfit, diplomacy and old receipts while recording the real24–26 purchases and colony permission', kind => {
    const s = load(kind), old = parseGame(readFileSync('tests/fixtures/space/native-d2a-campaign.save.json', 'utf8')), p = s.space!, e = account(s), capital = `${p.homePlanetId}:star-1:planet`;
    expect(e.actions.slice(0, 23)).toEqual(account(old).actions); expect(p.outfit).toEqual(old.space!.outfit); expect(p.empires).toEqual(old.space!.empires);
    expect(p.ship!.creation).toEqual(old.space!.ship!.creation); expect(p.ship!.purchase).toEqual(old.space!.ship!.purchase);
    expect(s.civilization).toEqual(old.civilization); expect(s.lineageHistory).toEqual(old.lineageHistory);
    expect(expansion(s).activated).toEqual({ at: old.space!.elapsed, tick: old.tick, travelAction: 309, lifeAction: 292, economyAction: 24 });
    expect(expansion(s).actions.map(r => [r.serial, r.kind, r.paid, r.balanceBefore, r.balanceAfter, r.treatySerial]))
      .toEqual([[24, 'alliance', 40, 261, 221, 4], [25, 'territory', 120, 221, 101, 4]]);
    for (const row of expansion(s).actions) { expect(row).toEqual(e.actions.find(r => r.serial === row.serial)); expect(row).not.toBe(e.actions.find(r => r.serial === row.serial)); }
    expect(e.actions[25]).toMatchObject({ serial: 26, kind: 'found', paid: 40, balanceBefore: 101, balanceAfter: 61, planetId: capital });
    expect(e.colonies.at(-1)).toMatchObject({ planetId: capital, paid: 40, level: 1, permission: { titleSerial: 25, foundingSerial: 26 } });
    expect(e.colonies.slice(0, 2).every(c => !Object.hasOwn(c, 'permission'))).toBe(true);
    expect(ownerAt(p, capital)).toBe('player'); expect(territoryTitle(p, capital)).toEqual(expansion(s).actions[1]);
    expect(empireAt(s, capital)).toEqual(old.space!.empires!.entries[0]); expect(e.ledger).toMatchObject({ equipment: 260, alliance: 40, territory: 120 });
  });

  it('carries eight produced units and the real companion through its already-paid nine-energy jump', () => {
    const s = load('flight'), p = s.space!, capital = `${p.homePlanetId}:star-1:planet`;
    expect(s.tick).toBe(67413); expect(s.machines!.resource).toBe(21.109999999410036);
    expect(p.leg).toMatchObject({ duration: 6, energyPaid: 9, from: { scale: 'system', planetId: capital }, to: { scale: 'system', planetId: p.homePlanetId } });
    expect(p.leg!.elapsed).toBeCloseTo(.2, 12); expect(p.nextSerial).toBe(327); expect(p.location).toEqual(p.leg!.from);
    expect(account(s).cargo).toEqual([{ planetId: capital, product: 'sun-resin', amount: 8 }]); expect(account(s).balance).toBe(61);
    expect(account(s).actions.at(-1)).toMatchObject({ serial: 27, kind: 'load', amount: 8, paid: 0, balanceAfter: 61 });
    expect(ally(s)).toMatchObject({ paidSerial: 24, energy: 11.086666666666686, generated: 25.11249999999834, delivered: 26.025833333333313 });
    expect(ally(s).energy).toBeCloseTo(12 + ally(s).generated - ally(s).delivered, 9); expect(ally(s).location!.planetId).toBe(capital);
    expect(createHash('sha256').update(JSON.stringify(nativeHome(s))).digest('hex')).toBe('c57a53448666faf1e9c7400091ea56d40832486c3af13e3e1f9391c8c7fc54ec');
  });

  it('keeps the parked companion and receives exactly56 from the actual eighth-unit domestic sale', () => {
    const s = load('active'), flight = load('flight'), p = s.space!, e = account(s);
    expect(s.tick).toBe(67526); expect(s.machines!.resource).toBe(23.934999999409875); expect(p.location).toBeNull(); expect(p.leg).toBeNull();
    expect(p.log.at(-1)).toMatchObject({ serial: 330, from: 'surface', to: 'dock', planetId: p.homePlanetId });
    expect(e.actions.slice(0, 27)).toEqual(account(flight).actions); expect(e.actions.at(-1)).toMatchObject({ serial: 28, kind: 'sell', amount: 8, unitPrice: 7, earned: 56,
      balanceBefore: 61, balanceAfter: 117, priceBasis: { version: 1, base: 7, empireId: null, treatySerial: null, relationRevision: null, bonus: 0 } });
    expect(e.balance).toBe(117); expect(e.balance).toBe(60 + 640 - 120 - 40 - 3 - 260 - 40 - 120); expect(e.cargo).toEqual([]);
    expect(e.colonies.map(c => [c.level, c.produced, c.loaded])).toEqual([[2, 60, 44], [2, 24, 8], [1, 10, 8]]);
    expect(expansion(s).actions).toEqual(expansion(flight).actions); expect(ally(s)).toMatchObject({ location: null, energy: 9.406666666666721,
      generated: 26.23249999999822, delivered: 28.825833333333453 });
    expect(ally(s).energy).toBeCloseTo(12 + ally(s).generated - ally(s).delivered, 9);
  });

  it('separately prepares a full actual midleg checkpoint and completes arrival without generating or transferring energy', () => {
    // Explicit UNIT checkpoint; native exports retain the old tick66066 CP.
    // Ordinary runtime steps continue the actual saved partial leg with no setters.
    const s = load('flight'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, home = domestic(s), ship = structuredClone(s.space!.ship), companion = structuredClone(ally(s));
    const biology = structuredClone(s.space!.expedition); for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(ally(s)).toEqual(companion); expect(s.space!.ship).toEqual(ship); expect(round(s)).toEqual(s);
    for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(s.space!.leg).toBeNull(); expect(s.space!.location).toEqual(cp.space!.leg!.to); expect(s.space!.nextSerial).toBe(328);
    expect(ally(s)).toEqual({ ...companion, location: allyFormation(s.space!.location!, 'resin') });
    expect(s.space!.ship).toEqual(ship); expect(productCargoCount(s)).toBe(8); expect(account(s).balance).toBe(61);
    expect(account(s).actions).toEqual(account(cp).actions); expect(s.space!.expedition).toEqual(biology); expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(expansion(restored)).toEqual(expansion(cp)); expect(account(restored)).toEqual(account(cp));
    expect(restored.space!.leg).toEqual(cp.space!.leg); expect(restored.space!.ship).toEqual(cp.space!.ship); expect(domestic(restored)).toEqual(home);
  });

  it('separately prepares a full docked checkpoint and freezes companion accounting through genuine domestic time', () => {
    const s = load('active'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, companion = structuredClone(ally(s));
    for (let i = 0; i < 60; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(s.tick).toBeGreaterThan(cp.tick); expect(ally(s)).toEqual(companion); expect(s.space!.ship).toEqual(cp.space!.ship);
    expect(account(s).balance).toBe(117); expect(account(s).actions).toEqual(account(cp).actions); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(expansion(restored)).toEqual(expansion(cp)); expect(account(restored)).toEqual(account(cp)); expect(restored.machines).toEqual(cp.machines);
  });

  it.each(['ship', 'escort'] as const)('rejects fake %s energy inside the same checkpointed native leg', kind => {
    const s = load('flight'); makeCheckpoint(s); for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT, 1 / 30); expect(round(s)).toEqual(s);
    if (kind === 'ship') s.space!.ship!.energy += .1;
    else { ally(s).generated += .1; ally(s).delivered += .1; }
    reject(s);
  });

  it.each(['payment', 'permission', 'sale'] as const)('rejects forged native %s without modifying fixture bytes', kind => {
    const s = load('active');
    if (kind === 'payment') expansion(s).actions[0].paid = 0;
    if (kind === 'permission') account(s).colonies.at(-1)!.permission!.foundingSerial = 25;
    if (kind === 'sale') { const row = account(s).actions.at(-1)!; if (row.kind !== 'sell') throw new Error('fixture sale'); row.priceBasis!.bonus = 2; }
    reject(s); expect(createHash('sha256').update(bytes('active')).digest('hex')).toBe(fixtures.active.sha);
  });
});
