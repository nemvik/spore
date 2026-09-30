import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { activateArmyEconomy, armyBaseline, armyBudget, armyOpportunity, cityEpoch, enableMobilization, MOBILIZATION_LIMIT, purchaseArmies, stepRivalEconomies } from '../src/game/mobilization';
import { stateCities, stepStates } from '../src/game/states';
import { enterCity, type City } from '../src/game/cities';
import { cityEconomyPreview, stepCityEconomy } from '../src/game/city-economy';
import { functioningCity } from '../src/game/civilization';
import { cityEntry, enableDefense, raids, stepDefense } from '../src/game/defense';
import { navigation, openAtlas, returnHome } from '../src/game/planet-travel';
import { parseGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { unitNavigation } from '../src/game/unit-motion';
import { atSea, buyBoat, sail, seaCommand } from '../src/game/maritime';
import { commerceRoute, contractFor, dispatchDelivery, inCommerce, openTradeContract } from '../src/game/commerce';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const k1File = 'tests/fixtures/city-defense/native-defense-campaign.save.json';
const k1Bytes = readFileSync(k1File, 'utf8');
const round = (s: GameState) => parseGame(serializeGame(s));
const frozen = (s: GameState) => structuredClone({ worlds: s.worlds, machines: s.machines, player: s.player, tick: s.tick, rng: s.rng, history: s.lineageHistory });
const turns = (s: GameState, n: number) => { for (let i = 0; i < n * 300; i++) stepStates(s, 1 / 30); };
function base() { const s = parseGame(k1Bytes); enableMobilization(s); returnHome(s); return s; }
function source(s: GameState): City { return s.cities!.entries.find(c => c.id === s.mobilization!.purchases[0].sourceCityId)!; }
function target(s: GameState): City { return s.cities!.entries.find(c => c.id === s.mobilization!.purchases[0].cityId)!; }
let paidCache: GameState | undefined;
function paid() {
  if (!paidCache) {
    const s = base();
    for (let i = 0; i < 300 * 100 && !s.mobilization!.purchases.length; i++) stepStates(s, 1 / 30);
    expect(s.mobilization!.purchases).toHaveLength(1);
    paidCache = s;
  }
  return structuredClone(paidCache);
}
function endPreparedRaid(s: GameState) {
  // Prepared combat outcome isolates the next actual payment. It is not a played
  // victory: the source income, first purchase and later simulation remain real.
  const r = s.mobilization!.raids.at(-1)!, c = s.cities!.entries.find(c => c.id === r.cityId)!;
  r.phase = 'destroyed'; r.remaining = 0; r.hold = 0; r.elapsed = 1;
  r.unit.health = 0; r.unit.pos = cityEntry(s, c, true); r.unit.navigation = unitNavigation(r.unit.pos); r.unit.intent = 'rest';
}

describe('SP-009.K2 explicit activation and historical state', () => {
  it('upgrades only live/checkpoint economies, keeps the native K1 bytes and receipts exact, and is idempotent', () => {
    expect(createHash('sha256').update(k1Bytes).digest('hex')).toBe('144ae370d542f42e1cb7babf228dfecc43b57296f4905db7279969c49a31d6ac');
    const s = parseGame(k1Bytes), before = structuredClone(s);
    expect(s.mobilization).toBeUndefined(); enableMobilization(s);
    expect(s.mobilization).toEqual({ version: 1, activated: null, baselines: [], purchases: [], raids: [], resolved: [] });
    for (const [i, c] of s.cities!.entries.entries()) {
      const old = before.cities!.entries[i];
      expect(c.capture).toEqual(old.capture); expect(c.transfers).toEqual(old.transfers);
      if (old.economy) expect(c.economy).toEqual({ ...old.economy, version: 5, ledger: { ...old.economy.ledger, military: 0 } });
    }
    expect(frozen(s)).toEqual(frozen(before)); expect(s.military).toEqual(before.military); expect(s.states).toEqual(before.states);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.mobilization?.activated).toBeNull(); expect(cp.cities!.entries.every(c => !c.economy || c.economy.version === 5 && c.economy.ledger.military === 0)).toBe(true);
    const once = structuredClone(s); enableMobilization(s); expect(s).toEqual(once); expect(round(s).cities).toEqual(s.cities);
    expect(readFileSync(k1File, 'utf8')).toBe(k1Bytes);
  });

  it('keeps completed B2 history and inheritance snapshots exact and never produces in stage five', () => {
    const file = 'tests/fixtures/civilization/native-civic-campaign.save.json', text = readFileSync(file, 'utf8');
    const s = parseGame(text), history = structuredClone(s.civilization), old = structuredClone(s.lineageHistory);
    enableMobilization(s); expect(s.civilization).toEqual(history); expect(s.lineageHistory).toEqual(old);
    const before = structuredClone(s); turns(s, 3); stepRivalEconomies(s, 1 / 30); purchaseArmies(s);
    expect(s.cities).toEqual(before.cities); expect(s.mobilization).toEqual(before.mobilization); expect(s.military).toEqual(before.military);
    expect(s.states!.entries.map(r => [r.reserve, r.tradeReserve, r.transactions])).toEqual(before.states!.entries.map(r => [r.reserve, r.tradeReserve, r.transactions]));
    expect(round(s).civilization).toEqual(history); expect(round(recoverGeneration(s)).civilization).toEqual(history);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });

  it('does not opt old API callers into remote production or v5', () => {
    const s = parseGame(k1Bytes), c = s.cities!.entries.find(c => c.owner.kind === 'state')!, e = structuredClone(c.economy);
    activateArmyEconomy(s, c.economy!); stepRivalEconomies(s, 1 / 30); turns(s, 2);
    expect(s.mobilization).toBeUndefined(); expect(c.economy).toEqual(e); expect(round(s).mobilization).toBeUndefined();
  });

  it('enrolls current post-recapture legacy income at activation without counting it as a new army budget', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009e-military.save.json', 'utf8')); enableDefense(s);
    const c = s.cities!.entries.find(c => c.capture)!; expect(enterCity(s, c.id)).toBe(true);
    for (let i = 0; i < 3300; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(c.owner.kind).toBe('state'); expect(c.transfers).toHaveLength(1);
    const incoming = c.transfers![0].economy!, current = structuredClone(c.economy!);
    expect(current.cycle).toBeGreaterThan(incoming.cycle); expect(current.ledger.income).toBeGreaterThan(incoming.ledger.income);
    expect(() => round(s)).not.toThrow(); const receipt = structuredClone(c.transfers);
    enableMobilization(s); stepRivalEconomies(s, 1 / 30);
    expect(armyBaseline(s, c)).toMatchObject({ entry: 'activation', epoch: cityEpoch(c), cycle: current.cycle, income: current.ledger.income, upkeep: current.ledger.upkeep, military: 0 });
    expect(armyBudget(s, c)).toBe(0); expect(c.transfers).toEqual(receipt); expect(round(s).mobilization).toEqual(s.mobilization);
  });
});

describe('SP-009.K2 rival scheduling and independent startup', () => {
  it('runs remote income without player visits, home income, world time or duplicate local cycles', () => {
    const s = base(), before = frozen(s), own = structuredClone(s.cities!.entries.filter(c => c.owner.kind === 'lineage'));
    const rivals = s.cities!.entries.filter(c => c.owner.kind === 'state'), cycles = rivals.map(c => c.economy!.cycle);
    turns(s, 2);
    expect(frozen(s)).toEqual(before); expect(s.cities!.entries.filter(c => c.owner.kind === 'lineage')).toEqual(own);
    rivals.forEach((c, i) => { expect(c.economy!.cycle).toBe(cycles[i] + 2); expect(c.economy!.ledger.income).toBeGreaterThan(0); expect(armyBaseline(s, c)).toBeDefined(); });
    expect(enterCity(s, rivals[0].id)).toBe(true); const visitedCycle = rivals[0].economy!.cycle;
    for (let i = 0; i < 300; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(rivals[0].economy!.cycle).toBe(visitedCycle + 1);
    const e = structuredClone(rivals[0].economy); for (let i = 0; i < 300; i++) stepCityEconomy(s, 1 / 30);
    expect(rivals[0].economy).toEqual(e); expect(round(s).mobilization).toEqual(s.mobilization);
  });

  it('develops four funded v5 cities from pre-D startup without visiting or bankrupting either state', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009c-buildings.save.json', 'utf8')); enableMobilization(s); returnHome(s);
    const home = frozen(s), visits = structuredClone(navigation(s)!.visits); turns(s, 60);
    expect(s.states!.entries).toHaveLength(2); expect(frozen(s)).toEqual(home); expect(navigation(s)!.visits).toEqual(visits);
    for (const r of s.states!.entries) {
      const cities = stateCities(s, r); expect(cities).toHaveLength(2); expect(r.reserve).toBeGreaterThanOrEqual(0);
      expect(r.reserve + r.transactions.filter(t => t.account === 'reserve').reduce((v, t) => v + t.cost, 0)).toBe(400);
      for (const c of cities) {
        expect(c.economy!.version).toBe(5); expect(c.economy!.ledger.military).toBe(0); expect(functioningCity(c)).toBe(true);
        expect(c.economy!.treasury).toBeGreaterThanOrEqual(2 * cityEconomyPreview(c).requestedUpkeep);
        expect(c.economy!.ledger.income).toBeGreaterThan(c.economy!.ledger.upkeep);
        expect(navigation(s)!.visits.some(v => v.locationId === c.address.locationId)).toBe(false);
        expect(armyBaseline(s, c)).toMatchObject({ entry: 'future', cycle: 0, income: 0, upkeep: 0, military: 0 });
      }
    }
    expect(s.mobilization!.purchases).toEqual([]); expect(round(s).cities).toEqual(s.cities);
  });

  it.each(['atlas', 'dead', 'zero health'] as const)('freezes production and strategic purchases while %s', mode => {
    const s = base(); turns(s, 2);
    if (mode === 'atlas') openAtlas(s); else if (mode === 'dead') s.deathReason = 'regression'; else s.player.health = 0;
    const before = structuredClone({ cities: s.cities, states: s.states, mobilization: s.mobilization });
    for (let i = 0; i < 300; i++) { stepStates(s, 1 / 30); stepRivalEconomies(s, 1 / 30); purchaseArmies(s); }
    expect({ cities: s.cities, states: s.states, mobilization: s.mobilization }).toEqual(before);
    if (mode === 'atlas') { const all = structuredClone(s); for (let i = 0; i < 300; i++) step(s, EMPTY_INPUT); expect(s).toEqual(all); }
  });

  it('rejects absent simulation time and clamps a large step instead of accumulating offline income', () => {
    const s = base(), before = structuredClone(s);
    for (const dt of [0, -1, NaN, Infinity]) { stepStates(s, dt); stepRivalEconomies(s, dt); }
    expect(s).toEqual(before);
    stepStates(s, 3600); expect(s.states!.clock.elapsed).toBeCloseTo(before.states!.clock.elapsed + 1 / 30, 10);
    for (const c of s.cities!.entries.filter(c => c.owner.kind === 'state')) expect(c.economy!.elapsed).toBeCloseTo(before.cities!.entries.find(v => v.id === c.id)!.economy!.elapsed + 1 / 30, 10);
  });

  it.each(['sea', 'commerce'] as const)('continues rival production during actual %s travel without ticking home income', travel => {
    const s = base();
    for (let i = 0; i < 3000 && s.machines!.resource < (travel === 'sea' ? 56 : 20); i++) step(s, EMPTY_INPUT, 1 / 30);
    if (travel === 'sea') {
      expect(buyBoat(s, seaCommand(s, 1171))).toBe(true); expect(sail(s, seaCommand(s, 1171))).toBe(true); expect(atSea(s)).toBe(true);
    } else {
      const c = s.cities!.entries.find(c => c.owner.kind === 'state' && commerceRoute(s, c, 'tank'))!;
      expect(enterCity(s, c.id)).toBe(true); expect(openTradeContract(s, c)).toBe(true);
      expect(dispatchDelivery(s, contractFor(s, c)!.id, { kind: 'fleet', id: 12 }, s.commerce!.revision)).toBe(true); expect(inCommerce(s)).toBe(true);
    }
    const before = frozen(s), rival = s.cities!.entries.find(c => c.owner.kind === 'state')!, cycle = rival.economy!.cycle;
    for (let i = 0; i < 300; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(rival.economy!.cycle).toBe(cycle + 1); expect(frozen(s)).toEqual(before); expect(() => round(s)).not.toThrow();
  });

  it.each(['state to lineage', 'lineage to state'] as const)('schedules one city step across a same-frame %s change', direction => {
    const s = base(), c = s.cities!.entries.find(c => c.owner.kind === (direction === 'state to lineage' ? 'state' : 'lineage'))!;
    expect(enterCity(s, c.id)).toBe(true); const e = c.economy!, elapsed = e.elapsed, cycle = e.cycle;
    stepRivalEconomies(s, 1 / 30);
    // Prepared ownership event between the real scheduler phases isolates the
    // per-frame accounting guard; it is not persisted as a battle receipt.
    c.owner = direction === 'state to lineage' ? { kind: 'lineage', id: s.homePlanet!.id } : { kind: 'state', id: s.states!.entries[0].id };
    stepCityEconomy(s, 1 / 30);
    expect((e.cycle - cycle) * 10 + e.elapsed - elapsed).toBeCloseTo(1 / 30, 10);
  });

  it('retains the incoming baseline when a real recapture and city cycle finish in the same step', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009e-military.save.json', 'utf8')); enableMobilization(s);
    const c = s.cities!.entries.find(c => c.capture)!; expect(enterCity(s, c.id)).toBe(true);
    for (let i = 0; i < 3300 && !(raids(s)[0]?.phase === 'occupying' && raids(s)[0].hold >= 4.95); i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(c.owner.kind).toBe('lineage'); expect(raids(s)[0].hold).toBeGreaterThanOrEqual(4.95);
    // Prepared fractional cycle aligns an actual battle-result ownership transfer
    // with a real paid economy cycle, to exercise their shared frame boundary.
    c.economy!.elapsed = 9.99; step(s, EMPTY_INPUT, 1 / 30);
    expect(c.owner.kind).toBe('state'); const incoming = c.transfers!.at(-1)!.economy!;
    expect(c.economy!.cycle).toBe(incoming.cycle + 1);
    step(s, EMPTY_INPUT, 1 / 30);
    expect(armyBaseline(s, c)).toMatchObject({ entry: 'future', cycle: incoming.cycle, income: incoming.ledger.income, upkeep: incoming.ledger.upkeep });
    expect(() => round(s)).not.toThrow();
  });
});

describe('SP-009.K2 actual recurrent city payments', () => {
  it('requires six real strategic turns after the legacy terminal raid and forty new net income', () => {
    const s = base(), r = s.states!.entries[0], old = structuredClone(s.military!.raids);
    stepStates(s, 1 / 30); const at = s.states!.clock.turn;
    expect(s.mobilization!.resolved).toEqual([{ raidId: old![0].id, turn: at }]);
    expect(armyOpportunity(s, r).reason).toContain('6 strategických');
    turns(s, 5); expect(s.mobilization!.purchases).toEqual([]); expect(armyOpportunity(s, r).reason).toContain('1 strategických');
    turns(s, 1); expect(s.mobilization!.purchases).toEqual([]); expect(armyOpportunity(s, r).reason).toContain('40 nového');
    expect(s.military!.raids).toEqual(old);
  });

  it('pays exactly forty from one city while retaining two upkeep cycles and the finite old reserves', () => {
    const s = paid(), p = s.mobilization!.purchases[0], c = source(s), b = armyBaseline(s, c)!;
    expect(p.cost).toBe(40); expect(p.sourceEpoch).toBe(cityEpoch(c)); expect(p.targetEpoch).toBe(cityEpoch(target(s)));
    expect(p.economy.income - b.income - (p.economy.upkeep - b.upkeep) - (p.economy.military - b.military)).toBeGreaterThanOrEqual(40);
    expect(c.economy!.treasury).toBe(p.economy.treasury - 40); expect(c.economy!.treasury).toBeGreaterThanOrEqual(2 * cityEconomyPreview(c).requestedUpkeep);
    expect(c.economy!.ledger.military).toBe(40); expect(c.economy!.revision).toBe(p.economy.revision + 1);
    expect(armyBudget(s, c)).toBe(p.economy.income - b.income - (p.economy.upkeep - b.upkeep) - 40);
    const initial = base(); expect(s.states!.entries.map(r => [r.reserve, r.tradeReserve])).toEqual(initial.states!.entries.map(r => [r.reserve, r.tradeReserve]));
    expect(s.military!.raids).toEqual(initial.military!.raids); expect(s.mobilization!.raids[0]).toMatchObject({ id: p.id, phase: 'preparing', remaining: 15 });
    expect(round(s).mobilization).toEqual(s.mobilization);
    const before = structuredClone(s); purchaseArmies(s); purchaseArmies(s); expect(s).toEqual(before);
  });

  it('cannot buy while an army is unresolved and must earn and pay again after its end', () => {
    const s = paid(), old = structuredClone(s.military!.raids), first = structuredClone(s.mobilization!.purchases[0]);
    turns(s, 2); expect(s.mobilization!.purchases).toHaveLength(1);
    expect(armyOpportunity(s, s.states!.entries[0]).reason).toContain('vyřešit');
    endPreparedRaid(s); expect(() => round(s)).not.toThrow();
    stepStates(s, 1 / 30); turns(s, 5); expect(s.mobilization!.purchases).toHaveLength(1);
    for (let i = 0; i < 300 * 100 && s.mobilization!.purchases.length < 2; i++) stepStates(s, 1 / 30);
    expect(s.mobilization!.purchases).toHaveLength(2); expect(s.mobilization!.purchases[0]).toEqual(first);
    const second = s.mobilization!.purchases[1]; expect(second.id).not.toBe(first.id); expect(second.economy.military).toBe(40); expect(source(s).economy!.ledger.military).toBe(80);
    const b = armyBaseline(s, source(s))!;
    expect(second.economy.income - b.income - (second.economy.upkeep - b.upkeep) - second.economy.military).toBeGreaterThanOrEqual(40);
    expect(armyBudget(s, source(s))).toBe(second.economy.income - b.income - (second.economy.upkeep - b.upkeep) - 80);
    expect(s.military!.raids).toEqual(old); expect(round(s).mobilization).toEqual(s.mobilization);
  });

  it.each(['new net', 'running reserve', 'unfunded', 'hunger', 'production'] as const)('does not use treasury alone when %s is insufficient', reason => {
    const s = paid(); endPreparedRaid(s); turns(s, 6);
    // Prepared accounting cuts isolate quote guards; no altered save is claimed valid.
    const c = source(s), e = c.economy!, b = armyBaseline(s, c)!; e.treasury = 1000; e.ledger.income += 1000;
    if (reason === 'new net') b.income = e.ledger.income - (e.ledger.upkeep - b.upkeep) - (e.ledger.military! - b.military) - 39;
    else if (reason === 'running reserve') e.treasury = 40 + 2 * cityEconomyPreview(c).requestedUpkeep - 1;
    else if (reason === 'unfunded') e.last!.funded = false;
    else if (reason === 'hunger') e.last!.hungry = 1;
    else e.last!.produced = 0;
    const before = structuredClone(s); expect(armyOpportunity(s, s.states!.entries[0]).source).toBeNull(); purchaseArmies(s); expect(s).toEqual(before);
  });

  it.each(['source', 'target'] as const)('stops a paid preparing raid after losing its %s without refunding or healing history', side => {
    const s = paid(), p = s.mobilization!.purchases[0], c = side === 'source' ? source(s) : target(s), treasury = source(s).economy!.treasury;
    // Prepared ownership change isolates transport response. Full ownership receipts
    // are covered by the existing E/F/trade/conversion suites, not forged here.
    c.owner = side === 'source' ? { kind: 'lineage', id: s.homePlanet!.id } : { kind: 'state', id: p.stateId };
    stepDefense(s, 1 / 30);
    expect(s.mobilization!.raids[0].phase).toBe(side === 'source' ? 'withdrawn' : 'returned');
    expect(source(s).economy!.treasury).toBe(treasury); expect(source(s).economy!.ledger.military).toBe(40);
    expect(s.mobilization!.purchases[0]).toEqual(p); expect(s.military!.raids).toEqual(base().military!.raids);
  });

  it.each(['arrival blocked', 'last source lost', 'history limit'] as const)('refuses a funded new purchase when %s without spending', reason => {
    const s = paid(); endPreparedRaid(s); turns(s, 6); const c = source(s);
    // Prepared quote-boundary inputs isolate geometry, ownership and history caps.
    c.economy!.treasury += 1000; c.economy!.ledger.income += 1000;
    if (reason === 'arrival blocked') navigation(s)!.fields.find(f => f.id === c.address.locationId)!.world.obstacles.push({ id: 999999, kind: 'rock', pos: cityEntry(s, c, true), radius: 20, height: 24 });
    else if (reason === 'last source lost') c.owner = { kind: 'lineage', id: s.homePlanet!.id };
    else s.mobilization!.purchases = Array.from({ length: MOBILIZATION_LIMIT }, () => structuredClone(s.mobilization!.purchases[0]));
    const before = structuredClone(s), q = armyOpportunity(s, s.states!.entries[0]);
    expect(q.source).toBeNull(); if (reason === 'history limit') expect(q.reason).toContain('256');
    purchaseArmies(s); expect(s).toEqual(before);
  });
});

describe('SP-009.K2 save prefixes and strict finance validation', () => {
  it('preserves the byte-identical native two-attack campaign, rekeys it and restores its earlier complete checkpoint', () => {
    const bytes = readFileSync('tests/fixtures/mobilization/native-renewal-campaign.save.json', 'utf8');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('144cf05598e3cdfe136511dd1aca89a82e0eae8497d37c383b3c147708452000');
    const s = parseGame(bytes), cp = JSON.parse(s.checkpoint!) as GameState;
    expect(s.mobilization!.purchases.map(p => [p.turn, p.cost, p.economy.treasury])).toEqual([[48, 40, 49], [61, 40, 48]]);
    expect(s.mobilization!.raids.every(r => r.phase === 'destroyed' && r.unit.health === 0)).toBe(true);
    expect(round(s).cities).toEqual(s.cities); expect(round(s).mobilization).toEqual(s.mobilization);
    s.id = 'line-k2-native-import'; cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    const imported = round(s), restored = round(recoverGeneration(imported));
    expect(imported.mobilization).toEqual(s.mobilization); expect(imported.cities).toEqual(s.cities);
    expect(restored.id).toBe(s.id); expect(restored.mobilization).toEqual(cp.mobilization);
    expect(restored.mobilization!.purchases).toHaveLength(0); expect(restored.cities).toEqual(cp.cities);
  });

  it('roundtrips and rekeys the full live branch while recovering the earlier baseline checkpoint', () => {
    const s = base(); turns(s, 2); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    for (let i = 0; i < 300 * 100 && !s.mobilization!.purchases.length; i++) stepStates(s, 1 / 30);
    expect(s.mobilization!.purchases).toHaveLength(1); expect(round(s).mobilization).toEqual(s.mobilization);
    s.id = 'line-k2-import'; cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    const imported = round(s), restored = round(recoverGeneration(imported));
    expect(imported.id).toBe(s.id); expect(imported.mobilization).toEqual(s.mobilization);
    expect(restored.mobilization).toEqual(cp.mobilization); expect(restored.cities).toEqual(cp.cities); expect(restored.states).toEqual(cp.states); expect(restored.military).toEqual(cp.military);
  });

  it('restores the already paid army, finance and activation after a later branch and rejects a plausible rewritten activation prefix', () => {
    const s = paid(); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    turns(s, 2); expect(round(recoverGeneration(round(s))).mobilization).toEqual(cp.mobilization);
    const restored = recoverGeneration(round(s)); expect(restored.cities).toEqual(cp.cities); expect(restored.states).toEqual(cp.states); expect(restored.military).toEqual(cp.military);
    s.mobilization!.activated!.tick--; for (const b of s.mobilization!.baselines) if (b.entry === 'activation') b.tick--;
    const independent = structuredClone(s); independent.checkpoint = null;
    expect(() => round(independent)).not.toThrow(); expect(() => round(s)).toThrow();
  });

  it.each([
    ['activation in future', (s: GameState) => { s.mobilization!.activated!.turn = s.states!.clock.turn + 1; }],
    ['activation removed', (s: GameState) => { s.mobilization!.activated = null; }],
    ['duplicate baseline', (s: GameState) => { s.mobilization!.baselines.push(structuredClone(s.mobilization!.baselines[0])); }],
    ['foreign baseline owner', (s: GameState) => { s.mobilization!.baselines[0].stateId = 'foreign'; }],
    ['future baseline', (s: GameState) => { s.mobilization!.baselines[0].tick = s.tick + 1; }],
    ['baseline income beyond current', (s: GameState) => { armyBaseline(s, source(s))!.income = source(s).economy!.ledger.income + 1; }],
    ['baseline military fraction', (s: GameState) => { armyBaseline(s, source(s))!.military = 1; }],
    ['baseline spent military credit', (s: GameState) => { armyBaseline(s, source(s))!.military = 40; }],
    ['baseline unknown entry', (s: GameState) => { Object.assign(armyBaseline(s, source(s))!, { entry: 'free' }); }],
    ['baseline delayed activation', (s: GameState) => { armyBaseline(s, source(s))!.turn++; }],
    ['baseline epoch', (s: GameState) => { armyBaseline(s, source(s))!.epoch++; }],
    ['wrong purchase cost', (s: GameState) => { (s.mobilization!.purchases[0] as { cost: number }).cost = 0; }],
    ['missing payment', (s: GameState) => { s.mobilization!.purchases = []; }],
    ['missing raid', (s: GameState) => { s.mobilization!.raids = []; }],
    ['purchase wrong source', (s: GameState) => { s.mobilization!.purchases[0].sourceCityId = target(s).id; }],
    ['purchase target epoch', (s: GameState) => { s.mobilization!.purchases[0].targetEpoch++; }],
    ['purchase before cooldown', (s: GameState) => { s.mobilization!.purchases[0].turn = s.mobilization!.resolved[0].turn + 5; }],
    ['counter removed with balanced treasury', (s: GameState) => { source(s).economy!.ledger.military = 0; source(s).economy!.treasury += 40; }],
    ['counter doubled with balanced treasury', (s: GameState) => { source(s).economy!.ledger.military = 80; source(s).economy!.treasury -= 40; }],
    ['snapshot payment counter', (s: GameState) => { s.mobilization!.purchases[0].economy.military = 40; }],
    ['snapshot poor treasury', (s: GameState) => { s.mobilization!.purchases[0].economy.treasury = 39; }],
    ['snapshot reserve', (s: GameState) => { s.mobilization!.purchases[0].economy.operatingReserve = 0; }],
    ['snapshot unfunded', (s: GameState) => { s.mobilization!.purchases[0].economy.last.funded = false; }],
    ['snapshot no production', (s: GameState) => { s.mobilization!.purchases[0].economy.last.produced = 0; }],
    ['snapshot extra key', (s: GameState) => { Object.assign(s.mobilization!.purchases[0].economy, { grant: 40 }); }],
    ['missing baseline', (s: GameState) => { s.mobilization!.baselines = []; }],
  ] as const)('rejects poisoned %s', (_name, mutate) => {
    const s = paid(); s.checkpoint = null; mutate(s); expect(() => round(s)).toThrow();
  });

  it.each(['revision', 'cycle', 'treasury', 'income', 'upkeep', 'military', 'operatingReserve'] as const)('rejects string and null snapshot %s fields', field => {
    for (const invalid of ['0', null]) {
      const s = paid(); s.checkpoint = null; Object.assign(s.mobilization!.purchases[0].economy, { [field]: invalid });
      expect(() => round(s)).toThrow();
    }
  });

  it.each(['0', null])('rejects non-numeric last cycle %s', invalid => {
    const s = paid(); s.checkpoint = null; Object.assign(s.mobilization!.purchases[0].economy.last, { cycle: invalid });
    expect(() => round(s)).toThrow();
  });

  it.each(['baseline', 'payment', 'activation', 'resolution'] as const)('rejects rewriting a checkpoint %s prefix', item => {
    const s = paid(); makeCheckpoint(s);
    if (item === 'baseline') armyBaseline(s, source(s))!.tick++;
    else if (item === 'payment') s.mobilization!.purchases[0].economy.treasury++;
    else if (item === 'activation') s.mobilization!.activated!.tick--;
    else s.mobilization!.resolved[0].turn++;
    expect(() => round(s)).toThrow();
  });

  it.each(['treasury', 'upkeep', 'last income'] as const)('rejects a changed same-cycle purchase snapshot %s even without checkpoint', field => {
    const s = paid(); s.checkpoint = null; const e = s.mobilization!.purchases[0].economy;
    if (field === 'treasury') e.treasury++; else if (field === 'upkeep') e.upkeep--; else e.last.income--;
    expect(() => round(s)).toThrow();
  });
});
