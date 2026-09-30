import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  civicCut, civilizationFacts, civilizationInheritance, civilizationReadiness,
  functioningCity,
} from '../src/game/civilization';
import { cityEconomyPreview } from '../src/game/city-economy';
import { vehicleCost, vehicleStats } from '../src/game/blueprint';
import { activeMachines, machineDesign, machineIncome } from '../src/game/machines';
import { unresolvedRaid } from '../src/game/defense';
import { atSea } from '../src/game/maritime';
import { inCommerce } from '../src/game/commerce';
import { activeField } from '../src/game/planet-travel';
import { parseGame, serializeGame } from '../src/game/persistence';
import { activePlanet, planetVehicle, stepPlanet, togglePlanetTool } from '../src/game/planet';
import { continueToPlanetEra, recoverGeneration } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const conversionFixtures = {
  beforeSpace: { file: 'native-conversion-before-space.save.json', sha256: 'e1edfa12e42284ec4518add042eae3bff04bb29c510555847a727778f388454d' },
  active: { file: 'native-conversion-campaign.save.json', sha256: 'f5cfd8b95ba9abea969bfa822e14acd524c7bba8648f97086807653d25f6b1c7' },
} as const;
type ConversionFixture = keyof typeof conversionFixtures;
const bytes = (kind: ConversionFixture) => readFileSync(`tests/fixtures/civilization/${conversionFixtures[kind].file}`);
const load = (kind: ConversionFixture) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
// The native pre-J paid-carriers source and its retained D ancestor have this exact frozen region history.
const preJRegionHistoryHash = 'dde95742870a07a2b3ac4a8f6c1746775824c1d5425b082b4e8b85cba28a37b3';
const baseline = parseGame(readFileSync('tests/fixtures/geography/sp-009d-states.save.json', 'utf8'));
const snapshot = (s: GameState) => structuredClone({
  stage: s.stage, machines: s.machines, cities: s.cities, states: s.states,
  military: s.military, mobilization: s.mobilization, commerce: s.commerce, maritime: s.maritime,
  civilization: s.civilization, history: s.lineageHistory, planet: s.planet,
});

const militaryFixtures = {
  beforeSpace: { file: 'native-military-before-space.save.json', sha256: '56aa2ea057f6baba58f9bb042f8f7e3e11f06863f98b479e50a63c4979e5a11c' },
  active: { file: 'native-military-campaign.save.json', sha256: '13b5b1cc96161b0412b4a3d97e070282952fff4c389e2ebceb7cec69d0c9df5d' },
} as const;
type MilitaryFixture = keyof typeof militaryFixtures;
const militaryBytes = (kind: MilitaryFixture) => readFileSync(`tests/fixtures/civilization/${militaryFixtures[kind].file}`);
const loadMilitary = (kind: MilitaryFixture) => parseGame(militaryBytes(kind).toString());

describe('SP-009.L unchanged resumed native military branch', () => {
  it.each(['beforeSpace', 'active'] as const)('keeps the exact %s export, original region history and complete economic branch through parse/serialize', kind => {
    const original = militaryBytes(kind);
    expect(sha256(original)).toBe(militaryFixtures[kind].sha256);
    const s = parseGame(original.toString()), imported = round(round(s));
    expect(snapshot(imported)).toEqual(snapshot(s));
    expect(sha256(JSON.stringify(s.lineageHistory!.stages[4]))).toBe(preJRegionHistoryHash);
    expect(s.lineageHistory!.stages[4]).toEqual(baseline.lineageHistory!.stages[4]);
    expect(militaryBytes(kind)).toEqual(original);
  });

  it.each(['beforeSpace', 'active'] as const)('preserves four military occupations and destroys both F raids and the paid K2 army in %s', kind => {
    const s = loadMilitary(kind), cities = s.cities!.entries;
    expect(cities).toHaveLength(5);
    expect(cities.every(c => c.owner.kind === 'lineage' && c.capture === null)).toBe(true);
    const occupied = cities.filter(c => c.transfers!.length > 0);
    expect(occupied).toHaveLength(4);
    for (const c of occupied) {
      expect(c.transfers).toHaveLength(1);
      expect(c.transfers![0]).toMatchObject({ from: { kind: 'state' }, to: { kind: 'lineage' }, unitId: 16, raidId: null });
      expect(Object.hasOwn(c.transfers![0], 'method')).toBe(false);
      expect(c.fortification).toBe(0); expect(c.defense!.health).toBe(0);
    }
    expect(cities.flatMap(c => c.conversion!.events)).toEqual([]);
    expect(s.commerce!.contracts).toEqual([]);
    expect(s.states!.entries.map(r => [r.reserve, r.tradeReserve])).toEqual([[0, 0], [0, 0]]);
    const raidIds = [`${s.homePlanet!.id}:state-0:tx-76`, `${s.homePlanet!.id}:state-1:tx-105`];
    expect(s.military!.raids!.map(r => r.id)).toEqual(raidIds);
    for (const raid of s.military!.raids!) {
      expect(raid).toMatchObject({ phase: 'destroyed', unit: { health: 0 } });
      const payment = s.states!.entries.flatMap(r => r.transactions).find(t => t.id === raid.id)!;
      expect(payment).toMatchObject({ account: 'reserve', cost: 40, action: { kind: 'raid', sourceCityId: raid.sourceCityId, cityId: raid.cityId } });
    }
    const armyId = `${s.homePlanet!.id}:state-0:army-1`;
    expect(s.mobilization!.raids).toHaveLength(1);
    expect(s.mobilization!.raids[0]).toMatchObject({ id: armyId, phase: 'destroyed', unit: { health: 0 } });
    expect(s.mobilization!.purchases).toHaveLength(1);
    expect(s.mobilization!.purchases[0]).toMatchObject({ id: armyId, turn: 88, cost: 40,
      economy: { cycle: 15, treasury: 49, income: 105, upkeep: 60, military: 0, operatingReserve: 8 } });
    expect(s.mobilization!.resolved.map(r => r.raidId).sort()).toEqual([...raidIds, armyId].sort());
    expect(s.military!.deployment).toBeNull(); expect(unresolvedRaid(s)).toBe(false);
    expect(atSea(s)).toBe(false); expect(inCommerce(s)).toBe(false); expect(activeField(s)).toBeNull();
  });

  it('retains the one new cannon tank and its fully repaired condition beside the unchanged pre-J designs', () => {
    const s = loadMilitary('active'), m = activeMachines(s)!, preJDesigns = load('beforeSpace').machines!.blueprints;
    // Actual build56 and seven repair10 payments are native report records, not a ledger invented in this legacy save schema.
    expect(m.blueprints.slice(0, preJDesigns.length)).toEqual(preJDesigns);
    expect(m.blueprints).toHaveLength(preJDesigns.length + 1);
    expect(m.fleet.map(u => u.id)).toEqual([8, 10, 12, 14, 16]);
    const tank = m.fleet.find(u => u.id === 16)!, design = machineDesign(m, tank), stats = vehicleStats(design);
    expect(tank.blueprint).toBe(15); expect(design.name).toBe('Strážce sjednocení');
    expect(stats.module).toBe('cannon'); expect(design.parts.some(p => p.kind === 'drill')).toBe(false);
    expect(vehicleCost(design)).toBe(56); expect(stats.durability).toBe(88); expect(tank.health).toBe(88);
    expect(round(s).machines).toEqual(s.machines);
  });

  it('crosses the ordinary gate with all commitments resolved and records the actual functioning governing city and military inheritance', () => {
    const s = loadMilitary('beforeSpace'), active = loadMilitary('active'), history = structuredClone(s.lineageHistory);
    expect(s.stage).toBe(4); expect(s.civilization!.completed).toBeNull();
    expect(civilizationReadiness(s)).toMatchObject({ ready: true, reasons: [] });
    expect(continueToPlanetEra(s)).toBe(true); expect(s.stage).toBe(5);
    const completion = s.civilization!.completed!;
    expect(completion).toEqual(active.civilization!.completed);
    expect(completion.at).toEqual({ tick: 71792, turn: 114, generation: 1 });
    expect(completion.cities).toEqual(civicCut(s)); expect(completion.cities).toHaveLength(5);
    const governing = s.cities!.entries.find(c => c.id === completion.governingCity.cityId)!;
    const historical = { ...governing, economy: completion.governingCity.economy };
    expect(functioningCity(historical)).toBe(true); expect(cityEconomyPreview(historical).net).toBeGreaterThanOrEqual(0);
    expect(historical.economy.last).toMatchObject({ funded: true, hungry: 0 });
    const facts = civilizationFacts(s).filter(f => f.kind === 'acquisition');
    expect(facts).toHaveLength(4); expect(facts.every(f => f.method === 'military')).toBe(true);
    expect(civilizationInheritance(s)).toEqual({ methods: ['military'], power: 1.2, consumption: 1, recovery: 1 });
    expect(s.lineageHistory!.stages.slice(0, history!.stages.length)).toEqual(history!.stages);
    const once = snapshot(s); expect(continueToPlanetEra(s)).toBe(false); expect(snapshot(s)).toEqual(once);
    expect(round(s).civilization).toEqual(s.civilization);
  });

  it('applies military power 1.2 and normal consumption to the actual retained drill through public planet controls', () => {
    const s = loadMilitary('active'), p = activePlanet(s)!, m = activeMachines(s)!, drill = planetVehicle(s)!;
    expect(drill.id).toBe(8); expect(machineDesign(m, drill).name).toBe('restoration tank');
    const stats = vehicleStats(machineDesign(m, drill)); expect(stats.module).toBe('drill');
    expect(p.toolOn).toBe(false); expect(p.stabilizers).toEqual([]); expect(p.populations).toEqual([]);
    expect(togglePlanetTool(s).ok).toBe(true);
    const before = { atmosphere: p.atmosphere, resource: m.resource }, dt = 1 / 60;
    // A unit consumer check over the played vehicle. It does not prepare climate or claim a second native run.
    stepPlanet(s, EMPTY_INPUT, dt);
    expect(p.atmosphere).toBeCloseTo(before.atmosphere + (-.88 - before.atmosphere) * .035 * dt + stats.power * 1.2 * .009 * dt, 12);
    expect(m.resource).toBeCloseTo(before.resource + machineIncome(m) * dt - .25 * dt, 12);
    expect(togglePlanetTool(s).ok).toBe(true); expect(p.toolOn).toBe(false);
    expect(round(s).planet).toEqual(p);
  });

  it.each(['beforeSpace', 'active'] as const)('rekeys %s and recovers its complete earlier checkpoint without mixing conquests, army payments or planet work', kind => {
    const s = loadMilitary(kind), checkpoint = JSON.parse(s.checkpoint!) as GameState, live = snapshot(s);
    s.id = `line-native-military-${kind}-reimport`; checkpoint.id = s.id; s.checkpoint = JSON.stringify(checkpoint);
    const imported = round(s), recovered = round(recoverGeneration(imported));
    expect(imported.id).toBe(s.id); expect(snapshot(imported)).toEqual(live);
    expect(recovered.id).toBe(s.id); expect(snapshot(recovered)).toEqual(snapshot(checkpoint));
    expect(snapshot(round(recoverGeneration(recovered)))).toEqual(snapshot(checkpoint));
    expect(recovered.machines!.resource).toBe(checkpoint.machines!.resource);
    if (kind === 'active') {
      expect(recovered.stage).toBe(5); expect(recovered.civilization!.completed).toEqual(s.civilization!.completed);
      expect(activePlanet(recovered)!.elapsed).toBe(0); expect(activePlanet(recovered)!.atmosphere).toBe(-.85);
      expect(civilizationInheritance(recovered)).toEqual({ methods: ['military'], power: 1.2, consumption: 1, recovery: 1 });
    } else {
      expect(recovered.stage).toBe(4); expect(recovered.civilization!.completed).toBeNull();
      expect(recovered.cities!.entries).toEqual([]); expect(recovered.mobilization!.purchases).toEqual([]);
      expect(recovered.machines!.fleet.some(u => u.id === 16)).toBe(false);
    }
  });
});

describe('SP-009.L unchanged native conversion branch', () => {
  it.each(['beforeSpace', 'active'] as const)('keeps the exact %s export and pre-J regional history through parse/serialize', kind => {
    const original = bytes(kind);
    expect(sha256(original)).toBe(conversionFixtures[kind].sha256);
    const s = parseGame(original.toString()), imported = round(round(s));
    expect(snapshot(imported)).toEqual(snapshot(s));
    const region = s.lineageHistory!.stages[4];
    expect(sha256(JSON.stringify(region))).toBe(preJRegionHistoryHash);
    expect(region).toEqual(baseline.lineageHistory!.stages[4]);
    expect(region.closed).toMatchObject({ outcome: 'restoration', source: 'saved' });
    expect(bytes(kind)).toEqual(original);
  });

  it.each(['beforeSpace', 'active'] as const)('retains four exclusively paid conversions, including both last cities, in %s', kind => {
    const s = load(kind), converted = s.cities!.entries.filter(c => c.transfers!.length > 0);
    expect(s.cities!.entries).toHaveLength(5); expect(converted).toHaveLength(4);
    expect(s.cities!.entries.every(c => c.owner.kind === 'lineage' && !c.capture)).toBe(true);
    expect(converted.map(c => c.transfers!.length)).toEqual([1, 1, 1, 1]);
    const transfers = converted.map(c => c.transfers![0]);
    expect(transfers.every(t => t.method === 'conversion')).toBe(true);
    expect(transfers.map(t => t.method === 'conversion' ? t.spent : null)).toEqual([80, 80, 100, 100]);
    for (const c of converted) {
      const receipt = c.transfers![0];
      if (receipt.method !== 'conversion') throw Error('The fixture must contain only conversion receipts');
      const events = c.conversion!.events;
      expect(events).toHaveLength(receipt.spent / 20);
      expect(events.slice(0, -1).every(e => e.action === 'rite')).toBe(true);
      expect(events.at(-1)).toMatchObject({ id: receipt.eventId, action: 'complete', turn: receipt.turn });
      expect(events.reduce((sum, e) => sum + (e.payment?.amount ?? 0), 0)).toBe(receipt.spent);
      for (const e of events) {
        expect(e.payment).toMatchObject({ source: 'home', use: 'consumed', amount: 20 });
        expect(e.payment!.after).toBe(e.payment!.before - 20);
      }
      expect(receipt.defenseHealth).toBe(62); expect(receipt.fortification).toBe(80);
    }
    expect(converted.map(c => c.conversion!.events.at(-1)!.situation.cities)).toEqual([2, 2, 1, 1]);
    expect(s.states!.entries.map(r => [r.reserve, r.tradeReserve])).toEqual([[40, 0], [40, 0]]);
    expect(s.military!.deployment).toBeNull(); expect(s.military!.raids).toEqual([]);
    expect(s.mobilization!.purchases).toEqual([]); expect(s.mobilization!.raids).toEqual([]);
    expect(s.commerce!.contracts).toEqual([]);
  });

  it('records all five actual cities and a funded functioning governing city in the completed B2 snapshot', () => {
    const s = load('active'), completion = s.civilization!.completed!;
    expect(s.stage).toBe(5); expect(s.civilization!.entry).toBe('required'); expect(completion).not.toBeNull();
    expect(activeField(s)).toBeNull(); expect(completion.cities).toEqual(civicCut(s));
    expect(completion.at).toEqual({ tick: 66122, turn: 85, generation: 1 });
    const governing = s.cities!.entries.find(c => c.id === completion.governingCity.cityId)!;
    const historicalGoverning = { ...governing, economy: completion.governingCity.economy };
    expect(functioningCity(historicalGoverning)).toBe(true);
    expect(cityEconomyPreview(historicalGoverning).net).toBeGreaterThanOrEqual(0);
    expect(historicalGoverning.economy.last).toMatchObject({ funded: true, hungry: 0 });
    expect(historicalGoverning.economy.last!.income).toBeGreaterThan(0);
    expect(historicalGoverning.economy.last!.produced).toBeGreaterThan(0);
    const facts = civilizationFacts(s);
    expect(facts.filter(f => f.kind === 'founding')).toHaveLength(1);
    expect(facts.filter(f => f.kind === 'acquisition')).toHaveLength(4);
    expect(facts.filter(f => f.kind === 'acquisition').every(f => f.method === 'conversion')).toBe(true);
    expect(facts.some(f => f.kind === 'loss')).toBe(false);
    expect(civilizationInheritance(s)).toEqual({ methods: ['conversion'], power: 1, consumption: 1, recovery: 1.2 });
  });

  it('passes the ordinary runtime gate from the actual before-space export without fabricating cities or rewriting history', () => {
    const s = load('beforeSpace'), completed = load('active').civilization!.completed;
    expect(s.stage).toBe(4); expect(s.civilization!.completed).toBeNull();
    expect(civilizationReadiness(s)).toMatchObject({ ready: true, reasons: [] });
    expect(civilizationInheritance(s)).toEqual({ methods: [], power: 1, consumption: 1, recovery: 1 });
    const cities = structuredClone(s.cities), history = structuredClone(s.lineageHistory);
    // Unit regression of the same public transition used by G, not another browser playthrough.
    expect(continueToPlanetEra(s)).toBe(true);
    expect(s.stage).toBe(5); expect(s.civilization!.completed).toEqual(completed);
    expect(s.cities).toEqual(cities);
    expect(s.lineageHistory!.stages.slice(0, history!.stages.length)).toEqual(history!.stages);
    expect(s.lineageHistory!.stages.at(-1)).toMatchObject({ stage: 5, started: { tick: 66122, generation: 1 }, closed: null });
    expect(civilizationInheritance(s)).toEqual({ methods: ['conversion'], power: 1, consumption: 1, recovery: 1.2 });
    const once = snapshot(s); expect(continueToPlanetEra(s)).toBe(false); expect(snapshot(s)).toEqual(once);
    expect(round(s).civilization).toEqual(s.civilization);
  });

  it('retains the actually introduced culture:6 root and applies recovery 1.2 in the real planet consumer', () => {
    const s = load('active'), p = activePlanet(s)!, root = p.stabilizers.find(r => r.key === 'culture:6')!;
    expect(p.toolOn).toBe(false); expect(p.tScore).toBeGreaterThanOrEqual(1);
    expect(p.stabilizers).toHaveLength(1); expect(root).toMatchObject({ id: 4, biome: 1, key: 'culture:6' });
    expect(root.site).toMatchObject({ stage: 5, observed: true, sourceId: 206, plantedId: 206 });
    expect(root.site.vitality).toBeCloseTo(75.54, 9);
    const resource = s.world.resources.find(r => r.id === root.site.plantedId)!;
    expect(resource.amount).toBeGreaterThan(0); expect(p.nursery!.sources.some(r => r.key === 'culture:6')).toBe(true);
    const before = root.site.vitality, completion = structuredClone(s.civilization!.completed);
    // Only public simulation on the played input; no prepared vitality, climate, resource or progress.
    stepPlanet(s, EMPTY_INPUT, .25);
    expect(p.tScore).toBeGreaterThanOrEqual(1);
    expect(root.site.vitality - before).toBeCloseTo(.25 * 1.2 * .25, 10);
    expect(s.civilization!.completed).toEqual(completion);
    expect(round(s).planet!.stabilizers).toEqual(p.stabilizers);
  });

  it.each(['beforeSpace', 'active'] as const)('rekeys %s and restores its complete original generation checkpoint without mixing later funds or ecology', kind => {
    const s = load(kind), checkpoint = JSON.parse(s.checkpoint!) as GameState, live = snapshot(s);
    // Mirrors the public import convention: campaign ID changes; persistent world/receipt identities remain intact.
    s.id = `line-native-conversion-${kind}-reimport`; checkpoint.id = s.id; s.checkpoint = JSON.stringify(checkpoint);
    const imported = round(s), recovered = round(recoverGeneration(imported));
    expect(imported.id).toBe(s.id); expect(snapshot(imported)).toEqual(live);
    expect(recovered.id).toBe(s.id); expect(snapshot(recovered)).toEqual(snapshot(checkpoint));
    expect(recovered.machines!.resource).toBe(checkpoint.machines!.resource);
    expect(snapshot(round(recoverGeneration(recovered)))).toEqual(snapshot(checkpoint));
    expect(sha256(JSON.stringify(imported.lineageHistory!.stages[4]))).toBe(preJRegionHistoryHash);
    if (kind === 'active') {
      expect(recovered.stage).toBe(5); expect(recovered.civilization!.completed).toEqual(s.civilization!.completed);
      expect(recovered.planet!.stabilizers).toEqual([]);
      expect(civilizationInheritance(recovered)).toEqual({ methods: ['conversion'], power: 1, consumption: 1, recovery: 1.2 });
    } else {
      expect(recovered.stage).toBe(4); expect(recovered.civilization!.completed).toBeNull();
      expect(recovered.cities!.entries).toEqual([]);
    }
  });
});
