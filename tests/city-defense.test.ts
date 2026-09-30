import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { activateDefenseEconomy, enableCityDefense, liveTowers, towerOnline, towerShotWorld, towerTarget, TOWER_HEALTH, TOWER_POWER, TOWER_RANGE, TOWER_REPAIR } from '../src/game/city-defense';
import { applyCityOrder, cityEconomyPreview, cityOrderQuote, stepCityEconomy, type CityBuilding, type CityOrder } from '../src/game/city-economy';
import { buildingSite, CITY_LOTS, cityLot, cityPositionClear } from '../src/game/city-spatial';
import { canOccupy, cityCommandRevision, enemyTarget, raids, stepDefense } from '../src/game/defense';
import { activeMachines, machineDesign, machineShot } from '../src/game/machines';
import { defenseDesign, militaryWorld, tankRadius } from '../src/game/military';
import { vehicleStats } from '../src/game/blueprint';
import { citySite, enterCity, foundCity, type City } from '../src/game/cities';
import { activeField, enterField, fieldGround, navigation, openAtlas, returnHome } from '../src/game/planet-travel';
import { planetAtlas } from '../src/game/planet-geography';
import { parseGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { initialBuildingDesign, type BuildingAppearance } from '../src/game/building-design';
import { importBuildingCreation, newBuildingCreation, parseBuildingCreation, readBuildingLibrary, saveBuildingCreation, serializeBuildingCreation } from '../src/game/building-library';
import { locationAddress } from '../src/game/home-planet';
import { stepStates } from '../src/game/states';
import { civilizationInheritance } from '../src/game/civilization';
import { EMPTY_INPUT, type GameState, type Vec3 } from '../src/game/types';

const file = 'tests/fixtures/geography/sp-009f-defense.save.json';
const bytes = readFileSync(file, 'utf8');
const round = (s: GameState) => parseGame(serializeGame(s));
const target = (s: GameState) => s.cities!.entries.find(c => c.capture)!;
const order = (s: GameState, c: City, value: CityOrder, revision = cityCommandRevision(c)) => applyCityOrder(s, c.id, value, revision);
const ledger = (s: GameState, c: City) => structuredClone({ economy: c.economy, machines: s.machines, states: s.states, capture: c.capture, transfers: c.transfers, fortification: c.fortification, guard: c.defense });
function base() { const s = parseGame(bytes); enableCityDefense(s); const c = target(s); expect(enterCity(s, c.id)).toBe(true); return { s, c }; }
function freeLot(s: GameState, c: City) {
  const lot = CITY_LOTS.find(l => !buildingSite(s, c, l.id, 'tower'));
  expect(lot, 'a valid tower parcel in the actual captured city').toBeDefined(); return lot!.id;
}
function built(appearance?: BuildingAppearance) {
  const { s, c } = base(), lot = freeLot(s, c);
  expect(order(s, c, { kind: 'build', building: 'tower', lot, ...(appearance ? { appearance } : {}) })).toBe(true);
  return { s, c, b: c.economy!.buildings.at(-1)! };
}
function cycle(s: GameState) { for (let i = 0; i < 300; i++) stepCityEconomy(s, 1 / 30); }
function maintained() { const v = built(); cycle(v.s); expect(towerOnline(v.c, v.b)).toBe(true); return v; }
function point(s: GameState, c: City, x: number, z: number): Vec3 {
  const f = navigation(s)!.fields.find(f => f.id === c.address.locationId)!;
  return { x, y: fieldGround(s.seed, planetAtlas(s.homePlanet!)!.cells[f.cellId], x, z) + .8, z };
}
function clearRay(s: GameState, c: City, b: CityBuilding, distance: number): Vec3 {
  const t = towerTarget(s, c, b), world = towerShotWorld(militaryWorld(s, c), c, b.id);
  for (let i = 0; i < 64; i++) {
    const a = i * Math.PI / 32, p = point(s, c, t.pos.x + Math.cos(a) * distance, t.pos.z + Math.sin(a) * distance);
    if (Math.abs(p.x) > 74 || Math.abs(p.z) > 74 || world.obstacles.some(o => Math.hypot(p.x - o.pos.x, p.z - o.pos.z) < o.radius + tankRadius(defenseDesign()))) continue;
    if (machineShot(world, { pos: t.pos, cooldown: 0 }, { pos: p, health: 100 }, 1, distance + .01)) return p;
  }
  throw new Error(`No open ray of ${distance} from tower lot ${b.lot}`);
}
function battle(distance = 20) {
  const v = maintained(), r = raids(v.s)[0];
  // Prepared encounter reuses the historical paid F unit. This isolates local combat,
  // never claims a new paid raid or a played campaign and is not persisted as evidence.
  r.phase = 'field'; r.unit.health = vehicleStats(r.blueprint).durability; r.unit.cooldown = 0;
  r.unit.pos = clearRay(v.s, v.c, v.b, distance); r.hold = 0; r.remaining = 0;
  return { ...v, r };
}

describe('SP-009.K1 explicit defensive economy migration', () => {
  it('migrates live and checkpoint economies to v4 exactly once while preserving E/F receipts and all money', () => {
    const s = parseGame(bytes), before = structuredClone(s), history = JSON.stringify(s.cities!.entries.map(c => [c.capture, c.transfers]));
    expect(s.cities!.entries.every(c => c.economy?.version !== 4)).toBe(true);
    enableCityDefense(s);
    for (const [i, c] of s.cities!.entries.entries()) expect(c.economy).toEqual({ ...before.cities!.entries[i].economy, version: 4, ledger: { ...before.cities!.entries[i].economy!.ledger, repairs: 0 } });
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.cities!.entries.every(c => !c.economy || c.economy.version === 4 && c.economy.ledger.repairs === 0)).toBe(true);
    expect(JSON.stringify(s.cities!.entries.map(c => [c.capture, c.transfers]))).toBe(history);
    expect(s.machines).toEqual(before.machines); expect(s.states).toEqual({ ...before.states, version: 4, entries: before.states!.entries.map(r => ({ ...r, tradeReserve: 0 })) });
    const once = structuredClone(s); enableCityDefense(s); expect(s).toEqual(once);
    expect(round(s).cities).toEqual(s.cities);
    expect(readFileSync(file, 'utf8')).toBe(bytes);
  });

  it('keeps native B2 frozen snapshots byte-exact through live economy upgrade, save and recovery', () => {
    const file = 'tests/fixtures/civilization/native-civic-campaign.save.json', text = readFileSync(file, 'utf8');
    const s = parseGame(text), completion = JSON.stringify(s.civilization), history = JSON.stringify(s.lineageHistory), inheritance = civilizationInheritance(s);
    enableCityDefense(s);
    expect(JSON.stringify(s.civilization)).toBe(completion); expect(JSON.stringify(s.lineageHistory)).toBe(history);
    expect(s.civilization!.completed!.governingCity.economy.version).toBe(3);
    expect(s.cities!.entries.every(c => c.economy?.version === 4)).toBe(true);
    expect(JSON.stringify(round(s).civilization)).toBe(completion);
    expect(civilizationInheritance(round(recoverGeneration(s)))).toEqual(inheritance);
    expect(readFileSync(file, 'utf8')).toBe(text);
  });

  it('uses v4 for a newly opened economy in an activated branch and keeps the older API unchanged', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009a-city.save.json', 'utf8')); enableCityDefense(s);
    const c = s.cities!.entries[0]; expect(enterCity(s, c.id)).toBe(true);
    expect(order(s, c, { kind: 'open' })).toBe(true);
    expect(c.economy!.version).toBe(4); expect(c.economy!.ledger.repairs).toBe(0);
    const old = parseGame(bytes), e = target(old).economy!, before = structuredClone(e);
    activateDefenseEconomy(old, e); expect(e).toEqual(before);
    expect(round(s).cities).toEqual(s.cities);
  });

  it('creates and funds new rival economies as v4 through actual state founding/open transactions', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009c-buildings.save.json', 'utf8')); enableCityDefense(s); navigation(s)!.mode = 'local';
    for (let i = 0; i < 900; i++) stepStates(s, 1 / 30);
    const cities = s.cities!.entries.filter(c => c.founded.source === 'state');
    expect(cities).toHaveLength(2);
    for (const c of cities) {
      expect(c.economy).toMatchObject({ version: 4, treasury: 80, cycle: 0, ledger: { repairs: 0, transfers: 80 } });
      expect(c.economy!.opened.source).toBe('state');
      expect(s.states!.entries.find(r => r.id === c.owner.id)!.reserve).toBe(220);
    }
    expect(round(s).cities).toEqual(s.cities);
  });

  it('opens v4 in an actually paid newly founded player city', () => {
    const { s } = base(); returnHome(s);
    for (let i = 0; i < 3000; i++) step(s, EMPTY_INPUT, 1 / 30);
    const f = navigation(s)!.fields.find(f => !s.cities!.entries.some(c => c.address.locationId === f.id))!;
    expect(enterField(s, f.cellId)).toBe(true);
    // Prepared surveyed site and actor positions isolate paid founding, not physical UI reachability.
    f.world.patches.forEach((p, i) => { p.discovered = true; f.world.landmarks[i + 2].charge = 1; });
    const cell = planetAtlas(s.homePlanet!)!.cells[f.cellId]; let placed = false;
    for (let z = -58; z <= 58 && !placed; z += 4) for (let x = -58; x <= 58 && !placed; x += 4) {
      const p = { x, y: fieldGround(s.seed, cell, x, z), z };
      if (!citySite(s, locationAddress(s, p)!)) { f.position = p; placed = true; }
    }
    expect(placed).toBe(true); const before = activeMachines(s)!.resource;
    expect(foundCity(s, 'Nová hlídka')).toBe(true);
    const c = s.cities!.entries.at(-1)!; expect(order(s, c, { kind: 'open' })).toBe(true);
    expect(activeMachines(s)!.resource).toBeCloseTo(before - 60 - 80, 10);
    expect(c.economy).toMatchObject({ version: 4, treasury: 80, ledger: { repairs: 0 } });
    expect(round(s).cities).toEqual(s.cities);
  });
});

it('preserves the byte-identical native K1 defense, custom repaired tower and full earlier checkpoint through import/rekey', () => {
  const file = 'tests/fixtures/city-defense/native-defense-campaign.save.json', text = readFileSync(file, 'utf8');
  expect(createHash('sha256').update(text).digest('hex')).toBe('144ae370d542f42e1cb7babf228dfecc43b57296f4905db7279969c49a31d6ac');
  const s = parseGame(text), c = target(s), b = c.economy!.buildings.find(b => b.kind === 'tower')!;
  expect(s.stage).toBe(4); expect(c.owner.kind).toBe('lineage'); expect(s.military!.deployment).toBeNull();
  expect(raids(s)[0]).toMatchObject({ phase: 'destroyed', unit: { health: 0 } });
  expect(b).toMatchObject({ lot: 107, paidAmber: 40, defense: { health: 40, repaired: 10, builtCycle: 5, maintained: 7 }, appearance: { source: 'creation', creation: { name: 'Jantarová hláska', design: { kind: 'tower' } } } });
  expect(c.economy!.ledger.repairs).toBe(10); expect(c.economy!.ledger.construction).toBe(100);
  const originalE = parseGame(readFileSync('tests/fixtures/geography/sp-009e-military.save.json', 'utf8'));
  expect(c.capture).toEqual(target(originalE).capture); expect(c.transfers).toEqual([]);
  const original = structuredClone(s); enableCityDefense(s); expect(s).toEqual(original);
  expect(round(s).cities).toEqual(s.cities); expect(round(s).military).toEqual(s.military);
  s.id = 'line-native-defense-import'; const cp = JSON.parse(s.checkpoint!) as GameState; cp.id = s.id; s.checkpoint = JSON.stringify(cp);
  const rekeyed = round(s); expect(rekeyed.id).toBe(s.id); expect(rekeyed.cities).toEqual(original.cities);
  const restored = round(recoverGeneration(rekeyed));
  expect(restored.cities).toEqual(cp.cities); expect(restored.military).toEqual(cp.military); expect(restored.machines).toEqual(cp.machines);
  expect(restored.civilization).toEqual(cp.civilization);
  expect(restored.cities!.entries.every(c => !c.economy?.buildings.some(b => b.kind === 'tower'))).toBe(true);
  expect(readFileSync(file, 'utf8')).toBe(text);
});

describe('SP-009.K1 paid tower construction and maintenance', () => {
  it('charges precisely 40 local amber once without creating citizens, healing guards or altering old receipts', () => {
    const { s, c } = base(), e = c.economy!, lot = freeLot(s, c), before = ledger(s, c), rev = cityCommandRevision(c);
    const command: CityOrder = { kind: 'build', building: 'tower', lot };
    expect(cityOrderQuote(s, c, command, rev)).toMatchObject({ ok: true, cost: 40 });
    expect(order(s, c, command, rev)).toBe(true);
    const b = e.buildings.at(-1)!;
    expect(b).toMatchObject({ kind: 'tower', paidAmber: 40, enabled: true, defense: { health: TOWER_HEALTH, cooldown: 0, repaired: 0, maintained: null } });
    expect(b.defense!.builtCycle).toBe(before.economy!.cycle);
    expect(e.treasury).toBe(before.economy!.treasury - 40); expect(e.ledger.construction).toBe(before.economy!.ledger.construction + 40);
    expect(e.residents).toEqual(before.economy!.residents); expect(s.machines).toEqual(before.machines);
    expect(c.capture).toEqual(before.capture); expect(c.transfers).toEqual(before.transfers); expect(c.defense).toEqual(before.guard); expect(c.fortification).toBe(before.fortification);
    const after = ledger(s, c); expect(order(s, c, command, rev)).toBe(false); expect(ledger(s, c)).toEqual(after);
    expect(towerOnline(c, b)).toBe(false); expect(round(s).cities).toEqual(s.cities);
  });

  it('does not reuse a previous paid cycle and activates only after paying its own upkeep', () => {
    const { s, c, b } = built(), e = c.economy!, before = structuredClone(e), preview = cityEconomyPreview(c);
    expect(e.last!.funded).toBe(true); expect(towerOnline(c, b)).toBe(false);
    expect(preview.upkeep).toBe(5); expect(preview.workers).toBe(4);
    cycle(s);
    expect(e.cycle).toBe(before.cycle + 1); expect(e.ledger.upkeep).toBe(before.ledger.upkeep + 5);
    expect(e.treasury).toBe(before.treasury + preview.income - preview.upkeep);
    expect(b.defense!.maintained).toBe(e.cycle); expect(towerOnline(c, b)).toBe(true);
    expect(round(s).cities).toEqual(s.cities);
  });

  it('does not fire during disabled or unfunded operation; a disabled cycle cancels paid maintenance', () => {
    const { s, c, b } = maintained();
    expect(order(s, c, { kind: 'enable', id: b.id, enabled: false })).toBe(true); expect(towerOnline(c, b)).toBe(false);
    expect(cityEconomyPreview(c).upkeep).toBe(4); cycle(s); expect(b.defense!.maintained).toBeNull();
    expect(order(s, c, { kind: 'enable', id: b.id, enabled: true })).toBe(true); expect(towerOnline(c, b)).toBe(false);
    cycle(s); expect(towerOnline(c, b)).toBe(true);
    const workshop = c.economy!.buildings.find(b => b.kind === 'workshop')!;
    expect(order(s, c, { kind: 'enable', id: workshop.id, enabled: false })).toBe(true);
    for (let i = 0; i < 15; i++) cycle(s);
    expect(c.economy!.last!.funded).toBe(false); expect(b.defense!.maintained).toBeNull(); expect(towerOnline(c, b)).toBe(false);
    expect(round(s).cities).toEqual(s.cities);
  });

  it('cannot operate an isolated tower merely by paying upkeep in an empty economy', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009a-city.save.json', 'utf8')); enableCityDefense(s);
    const c = s.cities!.entries[0]; expect(enterCity(s, c.id)).toBe(true); expect(order(s, c, { kind: 'open' })).toBe(true);
    expect(order(s, c, { kind: 'build', building: 'tower', lot: freeLot(s, c) })).toBe(true);
    const b = c.economy!.buildings.at(-1)!; cycle(s);
    expect(c.economy!.last).toMatchObject({ funded: true, upkeep: 1, income: 0, produced: 0 });
    expect(b.defense!.maintained).toBe(c.economy!.cycle); expect(towerOnline(c, b)).toBe(false);
    expect(round(s).cities).toEqual(s.cities);
  });

  it('rechecks local money after a quote and rejects a stale price without touching the paid tower or home balance', () => {
    const { s, c } = base(), lot = freeLot(s, c), command: CityOrder = { kind: 'build', building: 'tower', lot };
    expect(cityOrderQuote(s, c, command, cityCommandRevision(c)).ok).toBe(true);
    // Focused insufficient-balance input, no save validity or campaign earning claim.
    c.economy!.treasury = 39; const before = ledger(s, c);
    expect(order(s, c, command)).toBe(false); expect(ledger(s, c)).toEqual(before);
  });

  it.each([-1, 60, 121, NaN])('rejects invalid tower parcel %s without payment', lot => {
    const { s, c } = base(), before = ledger(s, c);
    expect(order(s, c, { kind: 'build', building: 'tower', lot })).toBe(false); expect(ledger(s, c)).toEqual(before);
  });

  it('keeps tower bodies solid and reserves the occupied parcel for both motion and construction', () => {
    const { s, c, b } = built(), p = cityLot(c, b.lot)!;
    expect(cityPositionClear(s, activeField(s)!, { ...p, y: 0 })).toBe(false);
    expect(buildingSite(s, c, b.lot, 'tower')).not.toBeNull();
    const before = ledger(s, c); expect(order(s, c, { kind: 'build', building: 'tower', lot: b.lot })).toBe(false); expect(ledger(s, c)).toEqual(before);
    for (let i = 0; i <= 20; i++) expect(cityPositionClear(s, activeField(s)!, { x: c.address.position.x * i / 20, y: 0, z: c.address.position.z * i / 20 })).toBe(true);
  });

  it('keeps custom tower appearance cosmetic and snapshots the submitted design', () => {
    const appearance: BuildingAppearance = { version: 1, source: 'creation', creation: {
      format: 'lumavora-building', version: 1, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: 1, createdAt: 1, updatedAt: 1, name: 'Tichá věž', design: initialBuildingDesign('tower'),
    } };
    const { s, c, b } = built(appearance), original = structuredClone(b.appearance);
    appearance.creation.design.parts[0].color = '#112233';
    expect(b.appearance).toEqual(original); expect(b.paidAmber).toBe(40); expect(b.defense!.health).toBe(100);
    cycle(s); expect(towerOnline(c, b)).toBe(true); expect(round(s).cities).toEqual(s.cities);
  });

  it('exports/imports a tower through the real building library and keeps a built revision after edits', () => {
    const map = new Map<string, string>(), storage = { get length() { return map.size; }, key: (i: number) => [...map.keys()][i] ?? null, getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
    const creation = newBuildingCreation(initialBuildingDesign('tower'), 'Pobřežní hlídka', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1);
    const text = serializeBuildingCreation(creation), imported = importBuildingCreation(storage, text);
    expect(parseBuildingCreation(text)).toEqual(creation); expect(imported).toEqual({ creation, duplicate: false });
    expect(importBuildingCreation(storage, text).duplicate).toBe(true);
    const { s, c, b } = built({ version: 1, source: 'creation', creation: imported.creation });
    const old = structuredClone(b.appearance), design = structuredClone(creation.design); design.parts[0].color = '#112233';
    const revised = saveBuildingCreation(storage, design, 'Pobřežní hlídka II', imported.creation);
    expect(revised.revision).toBe(2); expect(readBuildingLibrary(storage).entries).toEqual([revised]);
    expect(b.appearance).toEqual(old); expect(b.defense!.health).toBe(100); expect(b.paidAmber).toBe(40);
    const copied = importBuildingCreation(storage, text, () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(copied.creation.id).not.toBe(creation.id); expect(readBuildingLibrary(storage).entries).toHaveLength(2);
    expect(round(s).cities).toEqual(s.cities); expect(c.economy!.ledger.construction).toBe(100);
  });
});

describe('SP-009.K1 spatial combat through stepDefense', () => {
  it('fires a real four-power shot, respects cooldown and removes the solid target body only for its combat ray', () => {
    const { s, c, b, r } = battle(), health = r.unit.health, target = towerTarget(s, c, b), world = militaryWorld(s, c);
    expect(machineShot(world, { pos: r.unit.pos, cooldown: 0 }, { pos: target.pos, health: 100 }, 1, TOWER_RANGE)).toBe(false);
    expect(machineShot(towerShotWorld(world, c, b.id), { pos: r.unit.pos, cooldown: 0 }, { pos: target.pos, health: 100 }, 1, TOWER_RANGE)).toBe(true);
    const before = world.obstacles.length;
    expect(towerShotWorld(world, c, b.id).obstacles).toHaveLength(before - 1); expect(world.obstacles).toHaveLength(before);
    stepDefense(s, 1 / 30);
    expect(r.unit.health).toBe(health - 2 * TOWER_POWER); expect(b.defense!.cooldown).toBe(1.2); expect(b.defense!.health).toBe(100);
    stepDefense(s, 1 / 30); expect(r.unit.health).toBe(health - 2 * TOWER_POWER);
  });

  it.each([{ distance: 23.99, hit: true }, { distance: 24.01, hit: false }])('uses the actual 24-unit range at $distance', ({ distance, hit }) => {
    const { s, b, r } = battle(distance), health = r.unit.health;
    stepDefense(s, 1 / 30); expect(r.unit.health).toBe(health - (hit ? 8 : 0)); expect(b.defense!.cooldown > 0).toBe(hit);
  });

  it('keeps real intervening cover and resumes fire after the blocker is removed', () => {
    const { s, c, b, r } = battle(), t = towerTarget(s, c, b), f = activeField(s)!, health = r.unit.health;
    // One explicit diagnostic obstacle separates physical cover from target selection.
    f.world.obstacles.push({ id: 987654, kind: 'rock', pos: point(s, c, (t.pos.x + r.unit.pos.x) / 2, (t.pos.z + r.unit.pos.z) / 2), radius: 1, height: 24 });
    stepDefense(s, 1 / 30); expect(r.unit.health).toBe(health); expect(b.defense!.cooldown).toBe(0);
    f.world.obstacles = f.world.obstacles.filter(o => o.id !== 987654);
    stepDefense(s, 1 / 30); expect(r.unit.health).toBe(health - 8);
  });

  it.each(['disabled', 'unpaid', 'destroyed'] as const)('does not fire an %s tower', mode => {
    const { s, b, r } = battle(), health = r.unit.health;
    if (mode === 'disabled') b.enabled = false;
    if (mode === 'unpaid') b.defense!.maintained = null;
    if (mode === 'destroyed') b.defense!.health = 0;
    stepDefense(s, 1 / 30); expect(r.unit.health).toBe(health); expect(b.defense!.cooldown).toBe(0);
  });

  it.each(['income', 'production', 'hunger'] as const)('stops tower shots when the maintained city lacks functioning %s', reason => {
    const { s, c, b, r } = battle(), health = r.unit.health;
    if (reason === 'income') c.economy!.last!.income = 0;
    if (reason === 'production') c.economy!.last!.produced = 0;
    if (reason === 'hunger') c.economy!.last!.hungry = 1;
    expect(towerOnline(c, b)).toBe(false); stepDefense(s, 1 / 30); expect(r.unit.health).toBe(health);
  });

  it('pauses local tower combat on atlas, death and departure without remote cooldown progress', () => {
    const { s, c, b, r } = battle(); b.defense!.cooldown = .5;
    const freeze = () => structuredClone([c.economy, r]);
    openAtlas(s); const atlas = freeze(); stepDefense(s, 1 / 30); expect(freeze()).toEqual(atlas);
    navigation(s)!.mode = 'local'; s.player.health = 0; const dead = freeze(); stepDefense(s, 1 / 30); expect(freeze()).toEqual(dead);
    s.player.health = 1; returnHome(s); const away = freeze(); stepDefense(s, 1 / 30); expect(freeze()).toEqual(away);
    expect(b.defense!.cooldown).toBe(.5);
  });

  it('allows a raider to hit and destroy a tower, then physically occupy the unfortified city', () => {
    const { s, c, b, r } = battle(8); b.enabled = false; c.fortification = 0;
    const history = c.transfers!.length, owner = { kind: 'state' as const, id: r.stateId };
    expect(canOccupy(s, c, owner)).toBe(false);
    stepDefense(s, 1 / 30); expect(b.defense!.health).toBeCloseTo(100 - vehicleStats(r.blueprint).power * 2, 10);
    for (let i = 0; i < 1200 && b.defense!.health > 0; i++) stepDefense(s, 1 / 30);
    expect(b.defense!.health).toBe(0); expect(liveTowers(c)).toEqual([]); expect(canOccupy(s, c, owner)).toBe(true);
    for (let i = 0; i < 1800 && c.owner.kind === 'lineage'; i++) stepDefense(s, 1 / 30);
    expect(c.owner).toEqual(owner); expect(c.transfers).toHaveLength(history + 1);
    expect(c.economy!.buildings).toContain(b); expect(b.defense!.health).toBe(0);
  });

  it('allows a player tank to target a rival-owned tower and makes destruction unblock occupation', () => {
    const { s, c, b } = maintained(), m = activeMachines(s)!, u = m.fleet.find(u => vehicleStats(machineDesign(m, u)).module === 'cannon')!;
    expect(u).toBeDefined(); c.owner = { kind: 'state', id: c.foundingOwner!.id }; c.fortification = 0; b.enabled = false;
    u.pos = clearRay(s, c, b, 8); u.cooldown = 0;
    s.military!.deployment = { unitId: u.id, cityId: c.id, home: { ...u.pos }, route: [1, 2], phase: 'field', remaining: 0, order: 'attack', hold: 0, elapsed: 0 };
    expect(enemyTarget(s, c)).toMatchObject({ buildingId: b.id, health: 100 });
    expect(canOccupy(s, c, { kind: 'lineage', id: s.homePlanet!.id })).toBe(false);
    stepDefense(s, 1 / 30); expect(b.defense!.health).toBeCloseTo(100 - vehicleStats(machineDesign(m, u)).power * 2, 10);
    for (let i = 0; i < 1200 && b.defense!.health > 0; i++) stepDefense(s, 1 / 30);
    expect(b.defense!.health).toBe(0); expect(enemyTarget(s, c)).toBeNull();
    expect(canOccupy(s, c, { kind: 'lineage', id: s.homePlanet!.id })).toBe(true);
  });

  it('removes the paid player tank exactly once when a tower kills it before the player turn', () => {
    const { s, c, b } = maintained(), m = activeMachines(s)!, u = m.fleet.find(u => vehicleStats(machineDesign(m, u)).module === 'cannon')!;
    c.owner = { kind: 'state', id: c.foundingOwner!.id }; u.pos = clearRay(s, c, b, 20); u.health = 1;
    const others = structuredClone(m.fleet.filter(v => v !== u)), owner = structuredClone(c.owner), history = structuredClone(c.transfers), money = m.resource;
    s.military!.deployment = { unitId: u.id, cityId: c.id, home: { ...u.pos }, route: [1, 2], phase: 'field', remaining: 0, order: 'stop', hold: 0, elapsed: 0 };
    stepDefense(s, 1 / 30);
    expect(m.fleet).toEqual(others); expect(m.fleet.some(v => v.id === u.id)).toBe(false);
    expect(s.military!.deployment).toBeNull(); expect(c.owner).toEqual(owner); expect(c.transfers).toEqual(history); expect(m.resource).toBe(money);
    stepDefense(s, 1 / 30); expect(m.fleet).toEqual(others); expect(m.resource).toBe(money);
  });

  it('rejects repairs during a local raid or deployed unit without paying or healing', () => {
    const { s, c, b, r } = battle(); b.defense!.health = 20;
    const before = ledger(s, c); expect(order(s, c, { kind: 'repair', id: b.id })).toBe(false); expect(ledger(s, c)).toEqual(before);
    r.phase = 'destroyed'; r.unit.health = 0;
    const u = activeMachines(s)!.fleet[0];
    s.military!.deployment = { unitId: u.id, cityId: c.id, home: { ...u.pos }, route: [1, 2], phase: 'returning', remaining: 1, order: 'stop', hold: 0, elapsed: 1 };
    const deployed = ledger(s, c); expect(order(s, c, { kind: 'repair', id: b.id })).toBe(false); expect(ledger(s, c)).toEqual(deployed);
    s.military!.deployment = null; expect(order(s, c, { kind: 'repair', id: b.id })).toBe(true); expect(b.defense!.health).toBe(60);
  });

  it('resets an unfinished enemy occupation synchronously when a paid new tower blocks it', () => {
    const { s, c } = base(), r = raids(s)[0]; s.checkpoint = null;
    // Prepared legal occupation context isolates the build transaction/instant save boundary.
    r.phase = 'occupying'; r.unit.health = vehicleStats(r.blueprint).durability; r.remaining = 0; r.hold = 4.9;
    r.unit.pos = point(s, c, c.address.position.x, c.address.position.z); c.fortification = 0;
    expect(() => round(s)).not.toThrow();
    expect(order(s, c, { kind: 'build', building: 'tower', lot: freeLot(s, c) })).toBe(true);
    expect(r.hold).toBe(0); expect(r.phase).toBe('field'); expect(c.owner.kind).toBe('lineage');
    expect(round(s).military).toEqual(s.military);
    r.phase = 'occupying'; r.hold = 4.9;
    expect(() => round(s)).toThrow();
  });

  it.each(['destroyed', 'returning'] as const)('allows later construction over the saved position of a %s raid while preserving static terrain checks', phase => {
    const { s, c } = base(), r = raids(s)[0], lot = freeLot(s, c), p = cityLot(c, lot)!; s.checkpoint = null;
    r.phase = phase; r.unit.health = phase === 'destroyed' ? 0 : vehicleStats(r.blueprint).durability; r.remaining = phase === 'returning' ? 1 : 0; r.hold = 0;
    r.unit.pos = point(s, c, p.x, p.z);
    expect(() => round(s)).not.toThrow();
    expect(order(s, c, { kind: 'build', building: 'tower', lot })).toBe(true);
    expect(round(s).cities).toEqual(s.cities);
    // Returning/dead poses remain historical, but still cannot occupy immutable map obstacles.
    const staticObstacle = militaryWorld(s, { ...c, economy: null }).obstacles[0];
    r.unit.pos = point(s, c, staticObstacle.pos.x, staticObstacle.pos.z);
    expect(() => round(s)).toThrow();
  });

  it('persists an actual paid E raid destroying a tower and rejects a military capture snapshot claiming the tower survived', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009e-military.save.json', 'utf8')); enableCityDefense(s); returnHome(s);
    for (let i = 0; i < 130; i++) step(s, EMPTY_INPUT, 1 / 30);
    const c = target(s), r = raids(s)[0]; expect(r).toBeDefined(); expect(enterCity(s, c.id)).toBe(true);
    expect(order(s, c, { kind: 'fund' })).toBe(true);
    expect(order(s, c, { kind: 'build', building: 'tower', lot: freeLot(s, c) })).toBe(true);
    const b = c.economy!.buildings.at(-1)!; cycle(s); expect(order(s, c, { kind: 'enable', id: b.id, enabled: false })).toBe(true);
    // Prepared encounter position and breached square isolate the tower battle/receipt.
    // The raid, tower, funding and maintenance all retain their actual public payments.
    r.phase = 'field'; r.remaining = 0; r.unit.pos = clearRay(s, c, b, 8); c.fortification = 0; s.checkpoint = null;
    expect(() => round(s)).not.toThrow();
    for (let i = 0; i < 1800 && c.owner.kind === 'lineage'; i++) stepDefense(s, 1 / 30);
    expect(c.owner.kind).toBe('state'); expect(b.defense!.health).toBe(0); expect(c.transfers).toHaveLength(1);
    const receipt = c.transfers![0]; expect(receipt.method).toBeUndefined();
    expect(receipt.economy!.buildings.find(v => v.id === b.id)!.defense!.health).toBe(0);
    expect(round(s).cities).toEqual(s.cities);
    receipt.economy!.buildings.find(v => v.id === b.id)!.defense!.health = 1;
    expect(() => round(s)).toThrow();
  });
});

describe('SP-009.K1 repair ledger, checkpoints and strict imports', () => {
  it.each([0, 35, 90])('pays ten amber for up to forty health from initial damage %i and rejects retry', health => {
    const { s, c, b } = maintained(); b.defense!.health = health; makeCheckpoint(s);
    const before = ledger(s, c), revision = cityCommandRevision(c);
    expect(order(s, c, { kind: 'repair', id: b.id }, revision)).toBe(true);
    expect(b.defense!.health).toBe(Math.min(100, health + 40)); expect(b.defense!.repaired).toBe(10);
    expect(c.economy!.treasury).toBe(before.economy!.treasury - 10); expect(c.economy!.ledger.repairs).toBe(10);
    expect(c.defense).toEqual(before.guard); expect(c.fortification).toBe(before.fortification); expect(s.machines).toEqual(before.machines);
    const paid = ledger(s, c); expect(order(s, c, { kind: 'repair', id: b.id }, revision)).toBe(false); expect(ledger(s, c)).toEqual(paid);
    expect(round(s).cities).toEqual(s.cities);
    expect(target(round(recoverGeneration(s))).economy).toEqual(before.economy);
  });

  it('refuses full health, a non-tower and insufficient funds without consuming a repair', () => {
    const { s, c, b } = maintained(); const before = ledger(s, c);
    expect(order(s, c, { kind: 'repair', id: b.id })).toBe(false);
    expect(order(s, c, { kind: 'repair', id: c.economy!.buildings[0].id })).toBe(false);
    expect(ledger(s, c)).toEqual(before);
    b.defense!.health = 1; c.economy!.treasury = 9; const poor = ledger(s, c);
    expect(order(s, c, { kind: 'repair', id: b.id })).toBe(false); expect(ledger(s, c)).toEqual(poor);
  });

  it('retains spent repairs when the destroyed tower is demolished, without refund or reusing its ID', () => {
    const { s, c, b } = maintained(); b.defense!.health = 0;
    expect(order(s, c, { kind: 'repair', id: b.id })).toBe(true); b.defense!.health = 0;
    const money = c.economy!.treasury; expect(order(s, c, { kind: 'demolish', id: b.id })).toBe(true);
    expect(c.economy!.treasury).toBe(money); expect(c.economy!.ledger.repairs).toBe(10);
    expect(c.economy!.buildings.some(v => v.id === b.id)).toBe(false); expect(c.economy!.nextId).toBeGreaterThan(b.id);
    expect(round(s).cities).toEqual(s.cities);
  });

  it('restores damaged health, fractional cooldown and repair accounting exactly after rekey', () => {
    const { s, c, b } = maintained(); b.defense!.health = 25; b.defense!.cooldown = .7; makeCheckpoint(s);
    const before = structuredClone(c.economy); expect(order(s, c, { kind: 'repair', id: b.id })).toBe(true);
    s.id = 'line-city-defense-import'; const cp = JSON.parse(s.checkpoint!); cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    const saved = round(s), restored = round(recoverGeneration(saved));
    expect(target(saved).economy!.buildings.at(-1)!.defense).toMatchObject({ health: 65, cooldown: .7, repaired: 10 });
    expect(target(restored).economy).toEqual(before); expect(restored.id).toBe(s.id);
  });

  it.each([
    ['negative health', (s: GameState, c: City, b: CityBuilding) => { b.defense!.health = -1; }],
    ['excess health', (s: GameState, c: City, b: CityBuilding) => { b.defense!.health = 101; }],
    ['invalid cooldown', (s: GameState, c: City, b: CityBuilding) => { b.defense!.cooldown = 1.21; }],
    ['fractional repair price', (s: GameState, c: City, b: CityBuilding) => { b.defense!.repaired = 1; }],
    ['repair absent from total', (s: GameState, c: City, b: CityBuilding) => { b.defense!.repaired = 10; }],
    ['repair without payment', (s: GameState, c: City) => { c.economy!.ledger.repairs = 10; }],
    ['missing repair account', (s: GameState, c: City) => { delete c.economy!.ledger.repairs; }],
    ['future maintenance', (s: GameState, c: City, b: CityBuilding) => { b.defense!.maintained = c.economy!.cycle + 1; }],
    ['stale maintenance', (s: GameState, c: City, b: CityBuilding) => { b.defense!.maintained = c.economy!.cycle - 1; }],
    ['future build cycle', (s: GameState, c: City, b: CityBuilding) => { b.defense!.builtCycle = c.economy!.cycle + 1; }],
    ['negative build cycle', (s: GameState, c: City, b: CityBuilding) => { b.defense!.builtCycle = -1; }],
    ['fractional build cycle', (s: GameState, c: City, b: CityBuilding) => { b.defense!.builtCycle = .5; }],
    ['maintenance in construction cycle', (s: GameState, c: City, b: CityBuilding) => { b.defense!.builtCycle = c.economy!.cycle; }],
    ['free construction', (s: GameState, c: City, b: CityBuilding) => { b.paidAmber = 0; }],
    ['missing defense state', (s: GameState, c: City, b: CityBuilding) => { delete b.defense; }],
    ['old economy with tower', (s: GameState, c: City) => { c.economy!.version = 3; delete c.economy!.ledger.repairs; }],
    ['defense attached to a house', (s: GameState, c: City, b: CityBuilding) => { c.economy!.buildings[0].defense = structuredClone(b.defense); }],
  ] as const)('rejects poisoned %s', (_name, poison) => {
    const { s, c, b } = maintained(); s.checkpoint = null; poison(s, c, b); expect(() => round(s)).toThrow();
  });

  it('rejects a health increase after checkpoint without paid repairs while allowing subsequent actual damage', () => {
    const { s, c, b } = maintained(); b.defense!.health = 40; makeCheckpoint(s);
    b.defense!.health = 30; expect(round(s).cities).toEqual(s.cities);
    b.defense!.health = 41; expect(() => round(s)).toThrow();
    expect(c.economy!.ledger.repairs).toBe(0);
  });

  it.each(['new tower', 'surviving tower'] as const)('cannot reuse repair credit from a demolished tower for a %s after checkpoint', kind => {
    const { s, c, b } = maintained(); b.defense!.health = 50;
    expect(order(s, c, { kind: 'repair', id: b.id })).toBe(true);
    expect(order(s, c, { kind: 'demolish', id: b.id })).toBe(true);
    returnHome(s); for (let i = 0; i < 600; i++) step(s, EMPTY_INPUT, 1 / 30); expect(enterCity(s, c.id)).toBe(true);
    expect(order(s, c, { kind: 'fund' })).toBe(true);
    if (kind === 'new tower') makeCheckpoint(s);
    expect(order(s, c, { kind: 'build', building: 'tower', lot: freeLot(s, c) })).toBe(true);
    const newer = c.economy!.buildings.at(-1)!; newer.defense!.health = 40;
    if (kind === 'surviving tower') makeCheckpoint(s);
    expect(round(s).cities).toEqual(s.cities); expect(c.economy!.ledger.repairs).toBe(10);
    newer.defense!.repaired = 10; newer.defense!.health = 80;
    expect(() => round(s)).toThrow();
  });

  it.each(['new', 'existing unpaid'] as const)('rejects a forged paid-maintenance claim for a %s tower in the same checkpoint cycle', kind => {
    const { s, c } = base(); if (kind === 'new') makeCheckpoint(s);
    expect(order(s, c, { kind: 'build', building: 'tower', lot: freeLot(s, c) })).toBe(true);
    const b = c.economy!.buildings.at(-1)!;
    if (kind === 'existing unpaid') makeCheckpoint(s);
    expect(round(s).cities).toEqual(s.cities); expect(b.defense!.maintained).toBeNull();
    b.defense!.maintained = c.economy!.cycle;
    expect(() => round(s)).toThrow();
  });

  it('rejects rewritten construction time across the checkpoint and unpaid same-cycle activation even without a checkpoint', () => {
    const v = maintained(); makeCheckpoint(v.s); v.b.defense!.builtCycle--;
    expect(() => round(v.s)).toThrow();
    const { s, c, b } = built(); s.checkpoint = null; b.defense!.maintained = c.economy!.cycle;
    expect(() => round(s)).toThrow();
  });
});
