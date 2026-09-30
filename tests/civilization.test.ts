import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  civicCut, civilizationFacts, civilizationInheritance, civilizationReadiness,
  completeCivilization, enableCivilization, functioningCity, type CivicMethod,
} from '../src/game/civilization';
import { applyCityOrder, cityEconomyPreview, stepCityEconomy } from '../src/game/city-economy';
import { enterCity, type City } from '../src/game/cities';
import { activeMachines, machineDesign, machineIncome } from '../src/game/machines';
import { vehicleStats } from '../src/game/blueprint';
import { activeField, navigation, openAtlas, returnHome } from '../src/game/planet-travel';
import { parseGame, serializeGame } from '../src/game/persistence';
import { activePlanet, planetVehicle, selectPlanetVehicle, stepPlanet, togglePlanetTool } from '../src/game/planet';
import { continueToPlanetEra, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { cityCommandRevision } from '../src/game/defense';
import { validateCommerce } from '../src/game/commerce-validation';
import { validateCivilization } from '../src/game/civilization-validation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixture = 'tests/fixtures/geography/sp-009h-conversion.save.json';
const bytes = readFileSync(fixture, 'utf8');
const historical = parseGame(bytes);
const neutral = { methods: [], power: 1, consumption: 1, recovery: 1 };
const tradeFixture = 'tests/fixtures/commerce/native-trade-campaign.save.json';
const tradeBytes = readFileSync(tradeFixture, 'utf8');
const round = (s: GameState) => parseGame(serializeGame(s));
type Transfer = NonNullable<City['transfers']>[number];
const transfer = (method: CivicMethod | 'loss'): Transfer => structuredClone(historical.cities!.entries.flatMap(c => c.transfers ?? []).find(t =>
  method === 'loss' ? t.to.kind === 'state' : t.to.kind === 'lineage' && (t.method ?? 'military') === method)!);

function ready() {
  const s = parseGame(bytes); enableCivilization(s); returnHome(s); return s;
}
function working(s: GameState) { return s.cities!.entries.find(c => c.capture)!; }
function denied(s: GameState, reason: string) {
  const before = structuredClone(s);
  expect(civilizationReadiness(s).ready).toBe(false);
  expect(civilizationReadiness(s).reasons.join(' ')).toContain(reason);
  expect(completeCivilization(s)).toBe(false);
  expect(s).toEqual(before);
}
function methodHistory(methods: CivicMethod[]) {
  const s = ready();
  // Isolated derivation inputs, not played or persistence-valid clean-route campaigns.
  // Actual mixed H transactions are tested independently below.
  for (const c of s.cities!.entries) { c.capture = null; c.transfers = []; }
  s.cities!.entries[1].transfers = methods.map(transfer);
  expect(completeCivilization(s)).toBe(true);
  return s;
}
function tradeEntry() {
  const s = parseGame(tradeBytes); enableCivilization(s); returnHome(s); return s;
}
function tradePlanet() {
  const s = tradeEntry(); expect(continueToPlanetEra(s)).toBe(true); return s;
}

describe('SP-007.B2 separate civilization evidence', () => {
  it('preserves exact frozen old region history while activating live and checkpoint only once', () => {
    const s = parseGame(bytes), history = JSON.stringify(s.lineageHistory), oldCp = JSON.parse(s.checkpoint!);
    expect(s.civilization).toBeUndefined();
    expect(s.lineageHistory!.stages[4].closed?.outcome).toBe('restoration');
    enableCivilization(s);
    expect(s.civilization).toEqual({ version: 1, entry: 'required', completed: null });
    expect(JSON.parse(s.checkpoint!).civilization).toEqual(s.civilization);
    expect(JSON.parse(s.checkpoint!).lineageHistory).toEqual(oldCp.lineageHistory);
    expect(JSON.stringify(s.lineageHistory)).toBe(history);
    const once = structuredClone(s); enableCivilization(s); expect(s).toEqual(once);
    returnHome(s); civilizationFacts(s); civilizationReadiness(s);
    expect(completeCivilization(s)).toBe(true);
    s.stage = 5; civilizationInheritance(s);
    expect(JSON.stringify(s.lineageHistory)).toBe(history);
    expect(readFileSync(fixture, 'utf8')).toBe(bytes);
  });

  it('derives actual founding, E capture with unknown time, military recapture, trade, conversion and loss', () => {
    const s = ready(), facts = civilizationFacts(s), c = working(s);
    expect(facts).toHaveLength(7);
    expect(new Set(facts.map(f => f.key)).size).toBe(facts.length);
    expect(facts.find(f => f.kind === 'founding')).toEqual({
      key: `${s.cities!.entries[0].id}:founding`, cityId: s.cities!.entries[0].id,
      kind: 'founding', method: null, tick: s.cities!.entries[0].founded.tick, turn: null,
    });
    expect(facts.find(f => f.key === `${c.id}:capture`)).toEqual({
      key: `${c.id}:capture`, cityId: c.id, kind: 'acquisition', method: 'military', tick: null, turn: null,
    });
    expect(facts.find(f => f.key === `${c.id}:transfer:0`)).toMatchObject({ kind: 'loss', method: null, tick: null, turn: 32 });
    expect(facts.find(f => f.key === `${c.id}:transfer:1`)).toMatchObject({ kind: 'acquisition', method: 'military', tick: null, turn: 38 });
    expect(facts.filter(f => f.method === 'trade').map(f => f.turn)).toEqual([54]);
    expect(facts.filter(f => f.method === 'conversion').map(f => f.turn).sort()).toEqual([74, 78]);
  });

  it('sorts the city cut independently of registry order and includes only actual capture/prefixes', () => {
    const s = ready(), cut = civicCut(s);
    expect(cut.map(c => c.cityId)).toEqual(s.cities!.entries.map(c => c.id).sort());
    expect(cut.find(c => c.cityId === working(s).id)).toEqual({ cityId: working(s).id, capture: true, transfers: 2 });
    s.cities!.entries.reverse(); expect(civicCut(s)).toEqual(cut);
  });

  it('records one immutable completion and snapshots the functioning acquired city without grants', () => {
    const s = ready(), q = civilizationReadiness(s), cut = civicCut(s);
    expect(q).toMatchObject({ ready: true, reasons: [] });
    expect(q.governingCity).toBe(working(s));
    const accounts = structuredClone({ machines: s.machines, cities: s.cities, states: s.states, player: s.player });
    expect(completeCivilization(s)).toBe(true);
    expect(s.civilization!.completed).toEqual({
      at: { tick: s.tick, turn: s.states!.clock.turn, generation: s.player.generation },
      cities: cut, governingCity: { cityId: q.governingCity!.id, economy: q.governingCity!.economy },
    });
    expect({ machines: s.machines, cities: s.cities, states: s.states, player: s.player }).toEqual(accounts);
    const frozen = structuredClone(s.civilization!.completed);
    q.governingCity!.economy!.treasury += 20;
    expect(s.civilization!.completed).toEqual(frozen);
    s.tick++; expect(completeCivilization(s)).toBe(false);
    expect(s.civilization!.completed).toEqual(frozen);
  });

  it('freezes facts at the completion prefix while later city founding and transfers remain outside it', () => {
    const s = ready(); expect(completeCivilization(s)).toBe(true);
    const before = civilizationFacts(s), cut = structuredClone(s.civilization!.completed!.cities);
    working(s).transfers!.push(transfer('loss'), transfer('trade'));
    s.cities!.entries.push({ ...structuredClone(s.cities!.entries[0]), id: 'later-city' });
    expect(civilizationFacts(s)).toEqual(before);
    expect(s.civilization!.completed!.cities).toEqual(cut);
    expect(civicCut(s)).not.toEqual(cut);
  });
});

describe('SP-007.B2 genuine unification gate', () => {
  it.each([
    ['unactivated civilization', (s: GameState) => { delete s.civilization; }, 'živá linie'],
    ['earlier stage', (s: GameState) => { s.stage = 3; }, 'živá linie'],
    ['later stage', (s: GameState) => { s.stage = 5; }, 'živá linie'],
    ['dead player', (s: GameState) => { s.player.health = 0; }, 'živá linie'],
    ['pending death', (s: GameState) => { s.deathReason = 'test'; }, 'živá linie'],
    ['incomplete original regions', (s: GameState) => { activeMachines(s)!.completed = false; }, 'tři domácí regiony'],
    ['lost original region', (s: GameState) => { activeMachines(s)!.regions[0].owner = 'neutral'; }, 'tři domácí regiony'],
    ['only one spring', (s: GameState) => { activeMachines(s)!.springs[1].owner = 'neutral'; }, 'alespoň dva prameny'],
    ['no living vehicle', (s: GameState) => { activeMachines(s)!.fleet.forEach(u => { u.health = 0; }); }, 'živé vozidlo'],
    ['missing state registry', (s: GameState) => { delete s.states; }, 'soupeřící stát'],
    ['unactivated states', (s: GameState) => { s.states!.activated = null; }, 'soupeřící stát'],
    ['zero states', (s: GameState) => { s.states!.entries = []; }, 'soupeřící stát'],
    ['one rival absent', (s: GameState) => { s.states!.entries.pop(); }, 'soupeřící stát'],
    ['empty city registry', (s: GameState) => { s.cities!.entries = []; }, 'soupeřící stát'],
    ['rival never founded', (s: GameState) => { s.states!.entries[1].transactions = []; }, 'soupeřící stát'],
    ['founding city evidence absent', (s: GameState) => {
      s.cities!.entries = s.cities!.entries.filter(c => c.foundingOwner?.id !== s.states!.entries[1].id);
    }, 'soupeřící stát'],
    ['foreign city remains', (s: GameState) => { s.cities!.entries.at(-1)!.owner = { kind: 'state', id: s.states!.entries[1].id }; }, 'zbývající soupeřova města: 1'],
    ['no functioning owned city', (s: GameState) => { s.cities!.entries.forEach(c => { c.economy = null; }); }, 'Rozviň vlastní město'],
  ] as const)('rejects %s without mutation', (_name, prepare, reason) => {
    const s = ready(); prepare(s); denied(s, reason);
  });

  it('does not count a transaction reference to another action as a founding', () => {
    const s = ready(), r = s.states!.entries[1];
    r.transactions = r.transactions.filter(t => t.action.kind !== 'found');
    for (const c of s.cities!.entries.filter(c => c.foundingOwner?.id === r.id)) {
      if (c.founded.source === 'state') c.founded.transactionId = r.transactions[0].id;
    }
    denied(s, 'soupeřící stát');
  });

  it('checks every current foreign city, including expansion, instead of only each founding capital', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009f-defense.save.json', 'utf8'));
    enableCivilization(s); returnHome(s);
    expect(s.states!.entries.every(r => r.transactions.some(t => t.action.kind === 'found'))).toBe(true);
    denied(s, 'zbývající soupeřova města: 3');
  });

  it('requires return to the original home instead of completing inside an acquired city', () => {
    const s = parseGame(bytes); enableCivilization(s);
    expect(activeField(s)).not.toBeNull(); denied(s, 'vrať do domácí dílny');
    returnHome(s); expect(civilizationReadiness(s).ready).toBe(true);
    openAtlas(s); denied(s, 'vrať do domácí dílny');
  });

  it('blocks a deployed own unit until it returns', () => {
    const s = ready(), u = activeMachines(s)!.fleet.find(u => u.health > 0)!;
    s.military!.deployment = { unitId: u.id, cityId: working(s).id, home: { ...u.pos }, route: [1, 2], phase: 'returning', remaining: 1, order: 'stop', hold: 0, elapsed: 1 };
    denied(s, 'Vrať všechny jednotky');
    s.military!.deployment = null; expect(civilizationReadiness(s).ready).toBe(true);
  });

  it.each(['preparing', 'outbound', 'waiting', 'field', 'occupying', 'garrison', 'retreat', 'returning'] as const)('blocks unresolved %s raid even when all cities currently belong to the lineage', phase => {
    const s = ready(); s.military!.raids![0].phase = phase; denied(s, 'vyřeš výpady');
  });
  it.each(['destroyed', 'returned', 'withdrawn'] as const)('allows terminal %s raid history', phase => {
    const s = ready(); s.military!.raids![0].phase = phase; expect(civilizationReadiness(s).ready).toBe(true);
  });

  it.each(['outbound', 'returning', 'landed', 'returned'] as const)('handles the %s sea commitment', phase => {
    const s = ready();
    // Isolate the pure commitment guard; route/payment validity belongs to maritime tests.
    s.maritime!.journeys.push({ id: 1, from: 1, to: 3, route: [1, 2, 3], phase, progress: 0, distance: 0, elapsed: 0, turn: 1 });
    if (phase === 'outbound' || phase === 'returning') denied(s, 'Vrať všechny jednotky a plavby');
    else expect(civilizationReadiness(s).ready).toBe(true);
  });

  it.each(['open', 'cancelled', 'settled'] as const)('handles %s commerce even without an active delivery', status => {
    const s = ready();
    s.commerce!.contracts.push({ id: 1, cityId: working(s).id, stateId: s.states!.entries[0].id, epoch: 0, turn: 1, status, deliveries: [], refund: null, receiptId: null });
    if (status === 'open') denied(s, 'obchodní kontrakty');
    else expect(civilizationReadiness(s).ready).toBe(true);
  });
});

describe('SP-007.B2 functioning city evidence', () => {
  it('accepts the actual acquired H economy but rejects the original player city with operating loss', () => {
    const s = ready();
    expect(functioningCity(working(s))).toBe(true);
    const own = s.cities!.entries.find(c => c.founded.source === 'player')!;
    expect(own.economy!.last!.income).toBeGreaterThan(0);
    expect(cityEconomyPreview(own).net).toBe(-1);
    expect(functioningCity(own)).toBe(false);
  });

  it.each([
    ['no economy', (c: City) => { c.economy = null; }],
    ['no citizens', (c: City) => { c.economy!.residents = []; }],
    ['no played cycle', (c: City) => { c.economy!.last = null; }],
    ['unfunded cycle', (c: City) => { c.economy!.last!.funded = false; }],
    ['no earned income', (c: City) => { c.economy!.last!.income = 0; }],
    ['no production', (c: City) => { c.economy!.last!.produced = 0; }],
    ['hunger in completed cycle', (c: City) => { c.economy!.last!.hungry = 1; }],
    ['cannot finance next cycle', (c: City) => { c.economy!.treasury = 0; }],
    ['not enough staff for income', (c: City) => { c.economy!.residents.length = 2; }],
    ['insufficient food in next cycle', (c: City) => {
      c.economy!.food = 0;
      for (let i = 0; i < 5; i++) c.economy!.residents.push(structuredClone(c.economy!.residents[0]));
    }],
  ] as const)('rejects %s', (_name, prepare) => {
    const c = working(ready()); prepare(c); expect(functioningCity(c)).toBe(false);
  });
  it.each(['house', 'garden', 'workshop'] as const)('requires enabled %s', kind => {
    const c = working(ready()); c.economy!.buildings.filter(b => b.kind === kind).forEach(b => { b.enabled = false; });
    expect(functioningCity(c)).toBe(false);
  });

  it('requires and records a real paid city economy cycle rather than only a promising preview', () => {
    const s = ready(), c = working(s), e = c.economy!;
    e.last = null; e.elapsed = 0;
    expect(cityEconomyPreview(c).net).toBeGreaterThan(0); expect(functioningCity(c)).toBe(false);
    expect(enterCity(s, c.id)).toBe(true);
    const before = { treasury: e.treasury, cycle: e.cycle, upkeep: e.ledger.upkeep };
    for (let i = 0; i < 300; i++) stepCityEconomy(s, 1 / 30);
    expect(e.cycle).toBe(before.cycle + 1);
    expect(e.ledger.upkeep).toBeGreaterThan(before.upkeep);
    expect(e.treasury).toBe(before.treasury + e.last!.income - e.last!.upkeep);
    expect(functioningCity(c)).toBe(true);
  });
});

describe('SP-007.B2 fixed inheritance budget', () => {
  it('provides no benefit from a live unfinished ledger', () => {
    const s = ready(); expect(civilizationFacts(s).some(f => f.method === 'military')).toBe(true);
    expect(civilizationInheritance(s)).toEqual(neutral);
    s.stage = 5; expect(civilizationInheritance(s)).toEqual(neutral);
  });

  it.each([
    ['military'], ['trade'], ['conversion'], ['military', 'trade'],
    ['military', 'conversion'], ['trade', 'conversion'], ['military', 'trade', 'conversion'],
  ] as CivicMethod[][])('shares one 20 percent budget for %j', (...methods) => {
    const s = methodHistory(methods), sorted = [...methods].sort();
    expect(civilizationInheritance(s)).toEqual({ ...neutral, methods: sorted });
    s.stage = 5;
    const v = civilizationInheritance(s), share = .2 / methods.length;
    expect(v.methods).toEqual(sorted);
    expect(v.power).toBeCloseTo(1 + (methods.includes('military') ? share : 0));
    expect(v.consumption).toBeCloseTo(1 - (methods.includes('trade') ? share : 0));
    expect(v.recovery).toBeCloseTo(1 + (methods.includes('conversion') ? share : 0));
    expect(v.power - 1 + 1 - v.consumption + v.recovery - 1).toBeCloseTo(.2);
  });

  it('keeps the real mixed H military acquisition after later peaceful acquisitions', () => {
    const s = ready(); expect(completeCivilization(s)).toBe(true); s.stage = 5;
    const v = civilizationInheritance(s);
    expect(v.methods).toEqual(['conversion', 'military', 'trade']);
    expect(v.power).toBeCloseTo(1 + .2 / 3);
    expect(v.consumption).toBeCloseTo(1 - .2 / 3);
    expect(v.recovery).toBeCloseTo(1 + .2 / 3);
  });

  it.each(['military', 'trade', 'conversion'] as const)('does not farm a larger %s bonus from repeated losses and reacquisitions', method => {
    const s = methodHistory([method]); s.stage = 5; const first = civilizationInheritance(s);
    s.civilization!.completed = null; s.stage = 4;
    const c = s.cities!.entries[1];
    for (let i = 0; i < 12; i++) c.transfers!.push(transfer('loss'), transfer(method));
    expect(completeCivilization(s)).toBe(true); s.stage = 5;
    expect(civilizationFacts(s).filter(f => f.kind === 'loss')).toHaveLength(12);
    expect(civilizationInheritance(s)).toEqual(first);
  });

  it('does not grant method bonuses for founding or loss alone', () => {
    const s = methodHistory([]); s.stage = 5;
    expect(civilizationFacts(s).some(f => f.kind === 'founding')).toBe(true);
    expect(civilizationInheritance(s)).toEqual(neutral);
    // Pure history input: losses are not acquisitions even when the old method field is absent.
    s.civilization!.completed = null; s.stage = 4;
    s.cities!.entries[1].transfers = [transfer('loss')];
    expect(completeCivilization(s)).toBe(true); s.stage = 5;
    expect(civilizationFacts(s).some(f => f.kind === 'loss')).toBe(true);
    expect(civilizationInheritance(s)).toEqual(neutral);
  });

  it('keeps previously reached stage 5 neutral without fabricating unity or rewriting old progression', () => {
    const s = parseGame(readFileSync('tests/fixtures/saves/stable-sandbox.save.json', 'utf8'));
    expect(s.stage).toBe(5);
    const original = structuredClone({ stage: s.stage, planet: s.planet, machines: s.machines, history: s.lineageHistory, player: s.player });
    enableCivilization(s);
    expect(s.civilization).toEqual({ version: 1, entry: 'legacy-stage5', completed: null });
    expect(JSON.parse(s.checkpoint!).civilization.entry).toBe('legacy-stage5');
    expect(civilizationInheritance(s)).toEqual(neutral);
    expect(completeCivilization(s)).toBe(false);
    expect({ stage: s.stage, planet: s.planet, machines: s.machines, history: s.lineageHistory, player: s.player }).toEqual(original);
    expect(navigation(s)).not.toBeNull();
  });
});

describe('SP-007.B2 played J transition and persisted completion', () => {
  it('round-trips the unchanged native J branch before and after its actual planet transition', () => {
    const s = tradeEntry(), history = JSON.stringify(s.lineageHistory!.stages[4]);
    expect(round(s).civilization).toEqual(s.civilization);
    expect(civilizationReadiness(s).ready).toBe(true);
    expect(civilizationFacts(s).filter(f => f.kind === 'acquisition').map(f => f.method)).toEqual(['trade', 'trade', 'trade', 'trade']);
    expect(continueToPlanetEra(s)).toBe(true);
    expect(s.stage).toBe(5); expect(activePlanet(s)).not.toBeNull();
    expect(civilizationInheritance(s)).toEqual({ methods: ['trade'], power: 1, consumption: .8, recovery: 1 });
    expect(JSON.stringify(s.lineageHistory!.stages[4])).toBe(history);
    expect(round(s).civilization).toEqual(s.civilization);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.stage).toBe(5); expect(cp.civilization).toEqual(s.civilization);
    expect(cp.planet).toEqual(s.planet);
    const once = structuredClone(s.civilization);
    expect(continueToPlanetEra(s)).toBe(false); expect(s.civilization).toEqual(once);
    expect(readFileSync(tradeFixture, 'utf8')).toBe(tradeBytes);
  });

  it('uses the same completion gate through simulation, including the previously sufficient region-only branch', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009d-states.save.json', 'utf8'));
    enableCivilization(s); returnHome(s);
    expect(activeMachines(s)!.completed).toBe(true);
    const before = structuredClone({ stage: s.stage, machines: s.machines, cities: s.cities, states: s.states, checkpoint: s.checkpoint });
    expect(continueToPlanetEra(s)).toBe(false); expect(s.civilization!.completed).toBeNull();
    expect(s.planet).toBeUndefined();
    expect({ stage: s.stage, machines: s.machines, cities: s.cities, states: s.states, checkpoint: s.checkpoint }).toEqual(before);
  });

  it('recovers the entire pre-transition branch and then the new completed checkpoint', () => {
    const s = tradeEntry(); makeCheckpoint(s);
    const before = round(recoverGeneration(s));
    expect(before.stage).toBe(4); expect(before.civilization!.completed).toBeNull();
    expect(civilizationInheritance(before)).toEqual(neutral);
    expect(continueToPlanetEra(before)).toBe(true);
    const completed = structuredClone(before.civilization), ecology = structuredClone(before.planet);
    step(before, EMPTY_INPUT, 1 / 30);
    const recovered = round(recoverGeneration(round(before)));
    expect(recovered.stage).toBe(5); expect(recovered.civilization).toEqual(completed);
    expect(recovered.planet).toEqual(ecology);
    expect(civilizationInheritance(recovered).consumption).toBe(.8);
  });

  it('keeps the civilization references stable when the imported campaign slot is rekeyed', () => {
    const s = tradePlanet(), result = structuredClone(s.civilization);
    s.id = 'line-civilization-import';
    const cp = JSON.parse(s.checkpoint!); cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    const restored = round(s);
    expect(restored.id).toBe('line-civilization-import');
    expect(restored.civilization).toEqual(result);
    expect(round(recoverGeneration(restored)).civilization).toEqual(result);
  });

  it('retains required rules when recovery must create a fresh lineage without a checkpoint', () => {
    const s = tradePlanet(); s.checkpoint = null;
    const fresh = recoverGeneration(s);
    expect(fresh.stage).toBe(0);
    expect(fresh.civilization).toEqual({ version: 1, entry: 'required', completed: null });
    expect(JSON.parse(fresh.checkpoint!).civilization).toEqual(fresh.civilization);
    expect(round(fresh).civilization).toEqual(fresh.civilization);
    expect(civilizationInheritance(fresh)).toEqual(neutral);
  });

  it('persists historical stage 5 without adding completion or changing its sandbox', () => {
    const old = parseGame(readFileSync('tests/fixtures/saves/stable-sandbox.save.json', 'utf8'));
    const planet = structuredClone(old.planet); enableCivilization(old);
    const restored = round(old);
    expect(restored.civilization).toEqual({ version: 1, entry: 'legacy-stage5', completed: null });
    expect(restored.planet).toEqual(planet); expect(activePlanet(restored)!.sandbox).toBe(true);
    expect(round(recoverGeneration(restored)).civilization).toEqual(restored.civilization);
  });

  it.each([
    ['unknown version', (s: GameState) => { Object.assign(s.civilization!, { version: 2 }); }],
    ['unknown key', (s: GameState) => { Object.assign(s.civilization!, { bonus: .2 }); }],
    ['unknown entry', (s: GameState) => { Object.assign(s.civilization!, { entry: 'completed' }); }],
    ['legacy exemption with completion', (s: GameState) => { s.civilization!.entry = 'legacy-stage5'; }],
    ['required stage 5 without completion', (s: GameState) => { s.civilization!.completed = null; }],
    ['future tick', (s: GameState) => { s.civilization!.completed!.at.tick = s.tick + 1; }],
    ['future turn', (s: GameState) => { s.civilization!.completed!.at.turn = s.states!.clock.turn + 1; }],
    ['future generation', (s: GameState) => { s.civilization!.completed!.at.generation = s.player.generation + 1; }],
    ['missing generation', (s: GameState) => { s.civilization!.completed!.at.generation = 0; }],
    ['tick before cities existed', (s: GameState) => { s.civilization!.completed!.at.tick = 0; }],
    ['turn before acquisitions', (s: GameState) => { s.civilization!.completed!.at.turn = 0; }],
    ['empty city cut', (s: GameState) => { s.civilization!.completed!.cities = []; }],
    ['omitted city', (s: GameState) => { s.civilization!.completed!.cities.pop(); }],
    ['duplicate city', (s: GameState) => { s.civilization!.completed!.cities[1] = structuredClone(s.civilization!.completed!.cities[0]); }],
    ['unsorted cities', (s: GameState) => { s.civilization!.completed!.cities.reverse(); }],
    ['unknown city', (s: GameState) => { s.civilization!.completed!.cities[0].cityId = 'absent'; }],
    ['fabricated E capture', (s: GameState) => { s.civilization!.completed!.cities[0].capture = true; }],
    ['future transfer count', (s: GameState) => { s.civilization!.completed!.cities[0].transfers = 99; }],
    ['fractional transfer count', (s: GameState) => { s.civilization!.completed!.cities[0].transfers = .5; }],
    ['cut before peaceful ownership', (s: GameState) => { s.civilization!.completed!.cities.find(c => c.transfers > 0)!.transfers = 0; }],
    ['unknown governing city', (s: GameState) => { s.civilization!.completed!.governingCity.cityId = 'absent'; }],
    ['unfunded snapshot', (s: GameState) => { s.civilization!.completed!.governingCity.economy.treasury = 0; }],
    ['altered treasury', (s: GameState) => { s.civilization!.completed!.governingCity.economy.treasury++; }],
    ['missing played cycle', (s: GameState) => { s.civilization!.completed!.governingCity.economy.last = null; }],
    ['altered building lot', (s: GameState) => { s.civilization!.completed!.governingCity.economy.buildings[0].lot++; }],
    ['snapshot opened after live branch', (s: GameState) => { s.civilization!.completed!.governingCity.economy.opened.tick = s.tick + 1; }],
    ['future snapshot revision', (s: GameState) => { s.civilization!.completed!.governingCity.economy.revision++; }],
    ['same-cycle receipt rewritten', (s: GameState) => { s.civilization!.completed!.governingCity.economy.last!.happiness--; }],
  ] as const)('rejects poisoned completion: %s', (_name, mutate) => {
    const s = tradePlanet(); s.checkpoint = null; mutate(s);
    expect(() => round(s)).toThrow();
  });

  it('rejects a legacy-stage5 exemption on an unfinished stage 4 save', () => {
    const s = tradeEntry(); s.checkpoint = null; s.civilization!.entry = 'legacy-stage5';
    expect(() => round(s)).toThrow();
  });

  it.each(['removed', 'entry', 'tick', 'economy'] as const)('rejects checkpoint completion divergence: %s', kind => {
    const s = tradePlanet(), cp = JSON.parse(s.checkpoint!) as GameState;
    if (kind === 'removed') delete cp.civilization;
    if (kind === 'entry') { cp.civilization!.entry = 'legacy-stage5'; cp.civilization!.completed = null; }
    if (kind === 'tick') cp.civilization!.completed!.at.tick--;
    if (kind === 'economy') cp.civilization!.completed!.governingCity.economy.last!.happiness--;
    s.checkpoint = JSON.stringify(cp); expect(() => round(s)).toThrow();
  });

  it('round-trips the actual mixed H completion without dropping its older E capture', () => {
    const s = ready(); expect(continueToPlanetEra(s)).toBe(true);
    const saved = round(s);
    expect(saved.civilization).toEqual(s.civilization);
    expect(civilizationInheritance(saved).methods).toEqual(['conversion', 'military', 'trade']);
    expect(civilizationFacts(saved).find(f => f.key.endsWith(':capture'))?.tick).toBeNull();
  });

  it('allows later real city operations and cycles without rewriting the earlier governing snapshot', () => {
    const s = tradePlanet(), completion = structuredClone(s.civilization!.completed!);
    const c = s.cities!.entries.find(c => c.id === completion.governingCity.cityId)!;
    expect(enterCity(s, c.id)).toBe(true);
    const workshop = c.economy!.buildings.find(b => b.kind === 'workshop')!;
    expect(applyCityOrder(s, c.id, { kind: 'enable', id: workshop.id, enabled: false }, cityCommandRevision(c))).toBe(true);
    expect(c.economy!.cycle).toBe(completion.governingCity.economy.cycle);
    expect(round(s).civilization!.completed).toEqual(completion);
    for (let i = 0; i < 300; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(c.economy!.cycle).toBeGreaterThan(completion.governingCity.economy.cycle);
    expect(c.economy!.last!.income).toBe(0);
    expect(round(s).civilization!.completed).toEqual(completion);
    expect(civilizationInheritance(s).consumption).toBe(.8);
    returnHome(s); expect(round(s).civilization!.completed).toEqual(completion);
  });

  it('rejects an otherwise well-formed stale open contract forged into completed stage 5', () => {
    const s = tradePlanet(); s.checkpoint = null;
    const last = s.commerce!.contracts.at(-1)!;
    s.commerce!.contracts.push({ ...structuredClone(last), id: last.id + 1, status: 'open', deliveries: [], refund: null, receiptId: null });
    s.commerce!.revision++;
    const stage4 = structuredClone(s); stage4.stage = 4;
    expect(() => validateCommerce(stage4)).not.toThrow();
    expect(() => validateCommerce(s)).toThrow();
    expect(() => validateCivilization(s)).toThrow();
    expect(() => round(s)).toThrow();
  });

  it.each(['raid', 'deployment', 'sea'] as const)('rejects an unresolved %s commitment forged after completion', kind => {
    const s = ready(); expect(continueToPlanetEra(s)).toBe(true); s.checkpoint = null;
    if (kind === 'raid') s.military!.raids![0].phase = 'returning';
    if (kind === 'deployment') {
      const u = activeMachines(s)!.fleet[0];
      s.military!.deployment = { unitId: u.id, cityId: working(s).id, home: { ...u.pos }, route: [1, 2], phase: 'returning', remaining: 1, order: 'stop', hold: 0, elapsed: 1 };
    }
    if (kind === 'sea') s.maritime!.journeys.push({ id: 1, from: 1, to: 3, route: [1, 2, 3], phase: 'outbound', progress: 0, distance: 0, elapsed: 0, turn: 1 });
    expect(() => validateCivilization(s)).toThrow();
    expect(() => round(s)).toThrow();
  });
});

describe('SP-007.B2 actual planetary consumers', () => {
  const dt = 1 / 30;
  function consumer(methods: CivicMethod[]) {
    const s = methodHistory(methods); s.civilization!.completed = null;
    expect(continueToPlanetEra(s)).toBe(true); return s;
  }
  function tool(s: GameState, module: 'drill' | 'seeder') {
    const m = activeMachines(s)!, u = m.fleet.find(u => vehicleStats(machineDesign(m, u)).module === module)!;
    expect(u).toBeDefined(); expect(selectPlanetVehicle(s, u.id).ok).toBe(true);
    expect(togglePlanetTool(s).ok).toBe(true);
  }
  function livingConsumer(methods: CivicMethod[]) {
    const s = parseGame(readFileSync('tests/fixtures/saves/stable-sandbox.save.json', 'utf8'));
    // Prepared ecology plus a separately tested history isolates consumer arithmetic.
    // This does not claim a complete clean-route campaign or a portable combined save.
    const history = methodHistory(methods); s.civilization = history.civilization; s.cities = history.cities;
    const p = activePlanet(s)!; p.temperature = .1; p.atmosphere = -.1;
    for (const root of p.stabilizers) root.site.vitality = 75;
    for (const c of p.populations) { c.vitality = 75; c.nutrition = .8; c.abundance = 1; }
    for (const root of p.stabilizers) s.world.resources.find(r => r.id === root.site.plantedId)!.amount = 6;
    return s;
  }

  it.each(['drill', 'seeder'] as const)('applies 20 percent military power to the real %s climate delta without changing tool cost', module => {
    const s = consumer(['military']); tool(s, module);
    const plain = structuredClone(s), off = structuredClone(s);
    delete plain.civilization; activePlanet(off)!.toolOn = false;
    const health = planetVehicle(s)!.health, player = structuredClone(s.player), history = structuredClone(s.civilization);
    stepPlanet(off, EMPTY_INPUT, dt); stepPlanet(plain, EMPTY_INPUT, dt); stepPlanet(s, EMPTY_INPUT, dt);
    const a = activePlanet(s)!, b = activePlanet(plain)!, c = activePlanet(off)!;
    expect(a.temperature - c.temperature).toBeCloseTo((b.temperature - c.temperature) * 1.2, 12);
    expect(a.atmosphere - c.atmosphere).toBeCloseTo((b.atmosphere - c.atmosphere) * 1.2, 12);
    expect(activeMachines(s)!.resource).toBeCloseTo(activeMachines(plain)!.resource, 12);
    expect(planetVehicle(s)!.health).toBe(health); expect(s.player).toEqual(player);
    expect(s.civilization).toEqual(history);
  });

  it.each(['drill', 'seeder'] as const)('reduces the actual native J %s cost from .25 to .20 amber per second without free income or extra power', module => {
    const s = tradePlanet(); tool(s, module); const plain = structuredClone(s); delete plain.civilization;
    const m = activeMachines(s)!, before = m.resource, income = machineIncome(m) * dt;
    stepPlanet(s, EMPTY_INPUT, dt); stepPlanet(plain, EMPTY_INPUT, dt);
    expect(before + income - m.resource).toBeCloseTo(.2 * dt, 12);
    expect(before + income - activeMachines(plain)!.resource).toBeCloseTo(.25 * dt, 12);
    expect(activePlanet(s)!.temperature).toBe(activePlanet(plain)!.temperature);
    expect(activePlanet(s)!.atmosphere).toBe(activePlanet(plain)!.atmosphere);
    expect(round(s).civilization).toEqual(s.civilization);
  });

  it('splits the actual mixed tool effects instead of granting three full bonuses', () => {
    const s = consumer(['military', 'trade', 'conversion']); tool(s, 'seeder');
    const plain = structuredClone(s), off = structuredClone(s); delete plain.civilization; activePlanet(off)!.toolOn = false;
    const m = activeMachines(s)!, before = m.resource, income = machineIncome(m) * dt;
    stepPlanet(off, EMPTY_INPUT, dt); stepPlanet(plain, EMPTY_INPUT, dt); stepPlanet(s, EMPTY_INPUT, dt);
    expect(activePlanet(s)!.temperature - activePlanet(off)!.temperature)
      .toBeCloseTo((activePlanet(plain)!.temperature - activePlanet(off)!.temperature) * (1 + .2 / 3), 12);
    expect(before + income - m.resource).toBeCloseTo(.25 * (1 - .2 / 3) * dt, 12);
  });

  it('does not change passive climate or resource income while the tool is off', () => {
    const s = consumer(['military', 'trade', 'conversion']), plain = structuredClone(s); delete plain.civilization;
    stepPlanet(s, EMPTY_INPUT, dt); stepPlanet(plain, EMPTY_INPUT, dt);
    expect(s.planet).toEqual(plain.planet); expect(s.machines).toEqual(plain.machines);
  });

  it.each([
    { methods: ['conversion'] as CivicMethod[], factor: 1.2 },
    { methods: ['conversion', 'military', 'trade'] as CivicMethod[], factor: 1 + .2 / 3 },
  ])('applies recovery factor $factor to living roots, herbivores and predators with suitable climate and nutrition', ({ methods, factor }) => {
    const s = livingConsumer(methods), plain = structuredClone(s); delete plain.civilization;
    stepPlanet(s, EMPTY_INPUT, dt); stepPlanet(plain, EMPTY_INPUT, dt);
    const p = activePlanet(s)!, base = activePlanet(plain)!;
    expect(p.tScore).toBe(3);
    p.stabilizers.forEach((root, i) => {
      expect(root.site.vitality - 75).toBeCloseTo((base.stabilizers[i].site.vitality - 75) * factor, 12);
      expect(root.site.vitality).toBeCloseTo(75 + .25 * factor * dt, 12);
    });
    p.populations.forEach((c, i) => {
      expect(c.vitality - 75).toBeCloseTo((base.populations[i].vitality - 75) * factor, 12);
      expect(c.vitality).toBeCloseTo(75 + .12 * factor * dt, 12);
      expect(c.nutrition).toBe(base.populations[i].nutrition);
      expect(c.abundance).toBe(base.populations[i].abundance);
    });
    expect(activeMachines(s)!.resource).toBe(activeMachines(plain)!.resource);
  });

  it('does not soften the ecological loss from unsuitable climate', () => {
    const s = livingConsumer(['conversion']), p = activePlanet(s)!;
    p.temperature = .95; p.atmosphere = -.95;
    const plain = structuredClone(s); delete plain.civilization;
    stepPlanet(s, EMPTY_INPUT, dt); stepPlanet(plain, EMPTY_INPUT, dt);
    expect(p.tScore).toBe(0);
    expect(p.stabilizers).toEqual(activePlanet(plain)!.stabilizers);
    expect(p.populations).toEqual(activePlanet(plain)!.populations);
    expect(p.stabilizers[0].site.vitality).toBeCloseTo(75 - .6 * dt, 12);
    expect(p.populations[0].vitality).toBeCloseTo(75 - .65 * dt, 12);
  });

  it('does not create food, recover missing cultures or rescue starving populations', () => {
    const s = livingConsumer(['conversion']), p = activePlanet(s)!;
    const resources = new Set(p.stabilizers.map(r => r.site.plantedId));
    s.world.resources = s.world.resources.filter(r => !resources.has(r.id));
    for (const c of p.populations) { c.nutrition = .1; c.abundance = .5; }
    const plain = structuredClone(s); delete plain.civilization;
    stepPlanet(s, EMPTY_INPUT, dt); stepPlanet(plain, EMPTY_INPUT, dt);
    expect(s.world.resources).toEqual(plain.world.resources);
    expect(p.stabilizers).toEqual(activePlanet(plain)!.stabilizers);
    expect(p.populations).toEqual(activePlanet(plain)!.populations);
    expect(p.populations.every(c => c.vitality < 75 && c.nutrition < .1)).toBe(true);
  });

  it('keeps recovery bounded at 100 without multiplying growth or nutrition', () => {
    const s = livingConsumer(['conversion']), p = activePlanet(s)!;
    for (const root of p.stabilizers) root.site.vitality = 99.9999;
    for (const c of p.populations) c.vitality = 99.9999;
    stepPlanet(s, EMPTY_INPUT, dt);
    expect(p.stabilizers.every(root => root.site.vitality === 100)).toBe(true);
    expect(p.populations.every(c => c.vitality === 100)).toBe(true);
  });

  it('keeps the activated historical stage 5 tool and ecology numerically identical to the original save', () => {
    const s = parseGame(readFileSync('tests/fixtures/saves/stable-sandbox.save.json', 'utf8'));
    const plain = structuredClone(s); enableCivilization(s);
    tool(s, 'seeder'); tool(plain, 'seeder');
    for (let i = 0; i < 30; i++) { stepPlanet(s, EMPTY_INPUT, dt); stepPlanet(plain, EMPTY_INPUT, dt); }
    expect(s.planet).toEqual(plain.planet); expect(s.machines).toEqual(plain.machines);
    expect(s.world.resources).toEqual(plain.world.resources);
    expect(civilizationInheritance(s)).toEqual(neutral);
  });
});

it('preserves the actual native B2 campaign export, completion and tool inheritance', () => {
  const text = readFileSync('tests/fixtures/civilization/native-civic-campaign.save.json', 'utf8');
  expect(createHash('sha256').update(text).digest('hex')).toBe('03de64ca7924a541205f8d337b76989781573b13b7272b46f17f6e9a72f8e53f');
  const s = parseGame(text), round = parseGame(serializeGame(s));
  expect(s.stage).toBe(5);
  expect(s.civilization!.completed!.cities).toHaveLength(5);
  expect(civilizationFacts(s).filter(f=>f.kind==='acquisition')).toHaveLength(4);
  expect(civilizationInheritance(s)).toEqual({methods:['trade'],power:1,consumption:.8,recovery:1});
  expect(round.civilization).toEqual(s.civilization);
  expect(round.lineageHistory).toEqual(s.lineageHistory);
});
