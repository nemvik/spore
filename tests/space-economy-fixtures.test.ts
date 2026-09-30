import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { livingExpedition } from '../src/game/space-biosphere';
import { applyEconomyOrder, colonyStock, economyQuote, productCargoCount, spaceEconomy } from '../src/game/space-economy';
import { spaceMarketPrice } from '../src/game/space-products';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  carried: { name: 'native-c3b-carried-production.save.json', sha: '70e080b7bc57671a4ab06dae6c4919f1c105d5123bc546ce743e29699dab4f87' },
  active: { name: 'native-c3b-campaign.save.json', sha: '01f1c07ae53847a4b4a2d4938d1d22782bb5529ea1696a7e5f05268f242aff5a' },
} as const;
type Kind = keyof typeof fixtures;
const kinds = ['carried', 'active'] as const;
const bytes = (kind: Kind) => readFileSync(`tests/fixtures/space/${fixtures[kind].name}`);
const load = (kind: Kind) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const account = (s: GameState) => spaceEconomy(s)!;
const domestic = (s: GameState) => { const { checkpoint: _cp, space: _space, ...home } = s; return structuredClone(home); };
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
afterEach(() => vi.unstubAllGlobals());

describe('C3b unchanged native production and complete transaction exports', () => {
  it.each(kinds)('preserves exact %s bytes, v1 prices and all state without activating later registries', kind => {
    const raw = bytes(kind), s = parseGame(raw.toString());
    expect(createHash('sha256').update(raw).digest('hex')).toBe(fixtures[kind].sha);
    expect(s).toEqual(JSON.parse(raw.toString()).state); expect(round(s)).toEqual(s);
    expect(account(s).version).toBe(1); expect(Object.hasOwn(account(s), 'pricingActivatedAction')).toBe(false);
    expect(Object.hasOwn(s.space!, 'empires')).toBe(false);
    for (const row of account(s).actions) if (row.kind === 'sell') {
      expect(Object.hasOwn(row, 'pricing')).toBe(false);
      expect(row.unitPrice).toBe(spaceMarketPrice(s.space!.homePlanetId, row.planetId, row.product));
      expect(row.earned).toBe(row.amount * row.unitPrice);
    }
    expect(bytes(kind)).toEqual(raw);
  });

  it.each(kinds)('loads and rekeys %s without receiving money, moving cargo or changing the stable home address', kind => {
    const s = load(kind), local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => local.set(key, value), getItem: (key: string) => local.get(key) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-fixture-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    const loaded = round(imported); expect(loaded).toEqual(imported); expect(loaded.space).toEqual(s.space);
    expect(loaded.lineageHistory).toEqual(s.lineageHistory); expect(loaded.civilization).toEqual(s.civilization);
    expect(account(loaded).balance).toBe(account(s).balance); expect(loaded.machines!.resource).toBe(s.machines!.resource);
  });

  it.each(kinds)('restores the actual old pre-purchase checkpoint in %s with its own empty account', kind => {
    const s = load(kind), checkpoint = JSON.parse(bytes(kind).toString()).state.checkpoint as string;
    expect(s.checkpoint).toBe(checkpoint); const cp = JSON.parse(checkpoint) as GameState;
    expect(cp.tick).toBe(66066); expect(cp.machines!.resource).toBe(155.76499999940776);
    expect(cp.space!.ship).toBeNull(); expect(cp.space!.elapsed).toBe(0); expect(livingExpedition(cp)!.worlds).toEqual([]);
    expect(account(cp)).toMatchObject({ version: 1, activated: { spaceAt: 0, planetAt: 0, tick: 66066 }, elapsed: 0,
      balance: 0, colonies: [], cargo: [], sales: [], actions: [], nextAction: 1 });
    expect(Object.values(account(cp).ledger).every(value => value === 0)).toBe(true);
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual(cp.space);
    expect(restored.machines).toEqual(cp.machines); expect(restored.civilization).toEqual(cp.civilization);
    expect(restored.lineageHistory).toEqual(cp.lineageHistory); expect(round(restored).space).toEqual(cp.space);
  });

  it('keeps the carried eight physical units and paid source colony before the first sale', () => {
    const s = load('carried'), e = account(s), hot = `${s.space!.homePlanetId}:star-2:planet`;
    expect(s.tick).toBe(67103); expect(s.machines!.resource).toBe(13.359999999410288);
    expect(s.space!.location).toMatchObject({ scale: 'surface', planetId: `${s.space!.homePlanetId}:star-1:planet` });
    expect(e.balance).toBe(20); expect(e.ledger.deposits).toBe(60); expect(e.ledger.construction).toBe(40); expect(e.ledger.revenue).toBe(0);
    expect(e.colonies).toHaveLength(1); expect(e.colonies[0]).toMatchObject({ planetId: hot, paid: 40, level: 1, produced: 10, loaded: 8 });
    expect(colonyStock(e.colonies[0])).toBe(2); expect(e.cargo).toEqual([{ planetId: hot, product: 'moon-salt', amount: 8 }]);
    expect(productCargoCount(s)).toBe(8); expect(livingExpedition(s)!.cargo).toEqual([]); expect(e.sales).toEqual([]);
    expect(e.actions.map(row => row.kind)).toEqual(['deposit', 'deposit', 'deposit', 'found', 'load']);
    for (const row of e.actions) if (row.kind === 'deposit') expect(row.homeAfter).toBeCloseTo(row.homeBefore - 20, 9);
  });

  it('accounts for both level-two colonies, all three real sales and the paid recharge after the native return', () => {
    const s = load('active'), e = account(s), home = s.space!.homePlanetId;
    expect(s.tick).toBe(67140); expect(s.machines!.resource).toBe(14.284999999410301);
    expect(s.space!.location).toBeNull(); expect(s.space!.leg).toBeNull(); expect(s.space!.log.at(-1)).toMatchObject({ serial: 214, from: 'surface', to: 'dock', planetId: home });
    expect(e.balance).toBe(249); expect(e.ledger).toEqual({ deposits: 60, construction: 80, upgrades: 40, repairs: 0, charging: 3,
      revenue: 312, healthRestored: 0, energyRestored: 15.791666666667709 });
    expect(e.balance).toBe(60 + 312 - 80 - 40 - 3);
    expect(e.counts).toEqual({ deposit: 3, found: 2, upgrade: 2, load: 3, sell: 3, repair: 0, charge: 1 });
    expect(e.colonies.map(c => [c.product, c.level, c.produced, c.loaded, colonyStock(c)])).toEqual([
      ['moon-salt', 2, 32, 16, 16], ['spore-silk', 2, 24, 8, 16],
    ]);
    expect(e.actions.filter(row => row.kind === 'sell').map(row => [row.amount, row.unitPrice, row.earned])).toEqual([[8, 10, 80], [8, 10, 80], [8, 19, 152]]);
    expect(e.cargo).toEqual([]); expect(e.actions).toHaveLength(14); expect(e.nextAction).toBe(15);
    const a2 = parseGame(readFileSync('tests/fixtures/space/native-c3a2-campaign.save.json', 'utf8'));
    expect(s.space!.ship!.creation).toEqual(a2.space!.ship!.creation); expect(s.space!.ship!.purchase).toEqual(a2.space!.ship!.purchase);
    expect(s.civilization).toEqual(a2.civilization); expect(s.lineageHistory).toEqual(a2.lineageHistory); expect(s.cities).toEqual(a2.cities);
    expect(livingExpedition(s)!.worlds.map(w => w.life.length)).toEqual([49, 54, 54]);
  });

  it('separately prepares a full carried checkpoint, sells actual cargo once and restores the exact unpaid alternative', () => {
    // Public runtime continuation of native bytes; this new checkpoint is a unit
    // preparation, not the much older checkpoint observed in the browser run.
    const s = load('carried'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, before = domestic(s);
    const originPlanetId = account(s).cargo[0].planetId, revision = account(s).nextAction;
    expect(economyQuote(s, { kind: 'sell', originPlanetId }, revision)).toMatchObject({ ok: true, amount: 8, price: 10 });
    expect(applyEconomyOrder(s, { kind: 'sell', originPlanetId }, revision)).toBe(true);
    expect(account(s).balance).toBe(100); expect(account(s).ledger.revenue).toBe(80); expect(productCargoCount(s)).toBe(0);
    expect(domestic(s)).toEqual(before); expect(s.space!.expedition).toEqual(cp.space!.expedition);
    expect(applyEconomyOrder(s, { kind: 'sell', originPlanetId }, revision)).toBe(false); expect(account(s).balance).toBe(100);
    expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(account(restored)).toEqual(account(cp)); expect(productCargoCount(restored)).toBe(8);
    expect(restored.space!.ship).toEqual(cp.space!.ship); expect(restored.space!.expedition).toEqual(cp.space!.expedition); expect(domestic(restored)).toEqual(before);
  });

  it('separately prepares a full home checkpoint and advances colony time while full stocks and inactive bodies remain unchanged', () => {
    const s = load('active'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, before = structuredClone(account(s));
    const biology = structuredClone(s.space!.expedition);
    for (let i = 0; i < 300; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(account(s).elapsed - before.elapsed).toBeCloseTo(10, 8);
    for (const [i, colony] of account(s).colonies.entries()) {
      expect(colony.productiveElapsed - before.colonies[i].productiveElapsed).toBeCloseTo(10, 8);
      expect(colony.produced).toBe(before.colonies[i].produced); expect(colonyStock(colony)).toBe(16);
    }
    expect(s.space!.expedition).toEqual(biology); expect(account(s).ledger).toEqual(before.ledger); expect(account(s).actions).toEqual(before.actions);
    expect(round(s)).toEqual(s); const restored = recoverGeneration(round(s));
    expect(account(restored)).toEqual(account(cp)); expect(restored.machines).toEqual(cp.machines); expect(restored.space!.expedition).toEqual(cp.space!.expedition);
  });

  it('rejects repricing a real v1 sale even when all cash and cumulative revenue are adjusted consistently', () => {
    const s = load('active'), e = account(s), sale = e.actions.at(-1)!; expect(sale.kind).toBe('sell');
    if (sale.kind !== 'sell') throw new Error('fixture sale');
    sale.unitPrice++; sale.earned += sale.amount; sale.balanceAfter += sale.amount; e.balance += sale.amount; e.ledger.revenue += sale.amount;
    e.sales.find(row => row.planetId === sale.originPlanetId)!.earned += sale.amount;
    reject(s); s.checkpoint = null; reject(s);
  });

  it.each(['deposit', 'load', 'upgrade', 'charge'] as const)('rejects a forged native %s receipt without altering the source fixture', kind => {
    const s = load('active'), row = account(s).actions.find(row => row.kind === kind)!;
    if (row.kind === 'deposit') row.homeAfter += 20;
    else if (row.kind === 'load') row.amount++;
    else if (row.kind === 'upgrade') row.produced += 100;
    else if (row.kind === 'charge') row.after++;
    else throw new Error('fixture receipt');
    reject(s);
  });
});
