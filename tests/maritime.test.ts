import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseGame, serializeGame, saveGame, loadGame } from '../src/game/persistence';
import { atSea, boatQuote, buyBoat, currentCoast, enableMaritime, homeCoast, isCoast, landBoat, maritimeLandReason, sail, sailingQuote, seaCommand, seaJourney, seaRoute, stepMaritime, turnBoat } from '../src/game/maritime';
import { planetAtlas, atlasNeighbours } from '../src/game/planet-geography';
import { activeField, enterField, navigation, openAtlas, returnHome, surveyField, fieldGround } from '../src/game/planet-travel';
import { deployMachine } from '../src/game/military';
import { activeMachines } from '../src/game/machines';
import { foundCity, foundingAvailability } from '../src/game/cities';
import { tribeInheritance } from '../src/game/lineage-history';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { sailingStatus, seaAction, resetSeaOffer } from '../src/ui/maritime';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixturePath = 'tests/fixtures/geography/sp-009h-conversion.save.json';
const bytes = readFileSync(fixturePath, 'utf8');
const round = (s: GameState) => parseGame(serializeGame(s));
const advance = (s: GameState, seconds: number) => { for (let n = 0; n < Math.ceil(seconds * 30); n++) step(s, EMPTY_INPUT, 1 / 30); };
function base() { const s = parseGame(bytes); enableMaritime(s); returnHome(s); return s; }
// Unit acquisition earns through unchanged home simulation. No resource injection.
function earned() { const s = base(); advance(s, 30); expect(s.machines!.resource).toBeGreaterThanOrEqual(56); return s; }
function bought() { const s = earned(); expect(buyBoat(s, seaCommand(s, 1171))).toBe(true); return s; }
function outbound() { const s = bought(); expect(sail(s, seaCommand(s, 1171))).toBe(true); return s; }
function arrive(s: GameState) { advance(s, seaJourney(s)!.route.length); expect(landBoat(s, s.maritime!.revision)).toBe(true); }
const accounts = (s: GameState) => structuredClone({ home: s.machines!.resource, states: s.states!.entries.map(r => [r.reserve, r.tradeReserve]), cities: s.cities!.entries.map(c => [c.owner, c.economy, c.transfers, c.conversion]) });
const original = (s: GameState) => structuredClone({ worlds: s.worlds, rng: s.rng, tick: s.tick, player: s.player, machines: s.machines, cities: s.cities, military: s.military, tribe: s.tribe, lineage: s.lineageHistory });
const branch = (s: GameState) => structuredClone({ maritime: s.maritime, machines: s.machines, cities: s.cities, states: s.states, military: s.military, homePlanet: s.homePlanet, worlds: s.worlds, rng: s.rng, tick: s.tick, lineage: s.lineageHistory });

describe('SP-009.I actual H feasibility and paid maritime passage', () => {
  it('retains byte-identical actual H and migrates live/checkpoint once without past voyages, money or ownership', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('c2f0d211d71661671114f23bf8dc694124558bddac2763ddfbcd2d42ab3c88d4');
    const s = parseGame(bytes), before = original(s), oldPlanet = structuredClone(s.homePlanet), oldStates = structuredClone(s.states);
    expect(s.maritime).toBeUndefined(); expect(s.machines!.resource).toBeCloseTo(50.705, 7);
    expect(s.states!.entries.map(r => [r.reserve, r.tradeReserve])).toEqual([[0, 203], [40, 0]]);
    expect(s.cities!.entries.every(c => c.owner.kind === 'lineage')).toBe(true);
    enableMaritime(s);
    expect(s.maritime).toEqual({ version: 1, legacyAccess: [756, 776, 1470, 1542, 1543, 1615], revision: 0, vessel: null, journeys: [] });
    expect(original(s)).toEqual(before); expect(s.homePlanet).toEqual(oldPlanet); expect(s.states).toEqual(oldStates);
    const oldCheckpoint = JSON.parse(parseGame(bytes).checkpoint!) as GameState;
    expect(JSON.parse(s.checkpoint!).maritime).toEqual({ ...s.maritime, legacyAccess: navigation(oldCheckpoint)!.fields.map(f => f.cellId).sort((a, b) => a - b) });
    const once = JSON.stringify(s); enableMaritime(s); enableMaritime(s); expect(JSON.stringify(s)).toBe(once);
    expect(round(s).maritime).toEqual(s.maritime); expect(readFileSync(fixturePath, 'utf8')).toBe(bytes);
  });

  it('finds a deterministic shared-edge water route from actual home 1614 to foreign shore 1171', () => {
    const s = base(), atlas = planetAtlas(s.homePlanet!)!, route = seaRoute(s, 1614, 1171)!;
    expect(homeCoast(s)).toBe(1614); expect(currentCoast(s)).toBe(1614);
    expect(route[0]).toBe(1614); expect(route.at(-1)).toBe(1171); expect(route.length).toBeGreaterThan(2);
    expect(atlas.cells[1614].regionId).not.toBe(atlas.cells[1171].regionId);
    expect(route.slice(1, -1).every(id => atlas.cells[id].surface === 'water')).toBe(true);
    for (let n = 1; n < route.length; n++) expect(atlasNeighbours(route[n - 1])).toContain(route[n]);
    expect(seaRoute(base(), 1614, 1171)).toEqual(route); expect(seaRoute(s, 1171, 1614)).not.toBeNull();
    const water = atlas.cells.find(c => c.surface === 'water')!.id;
    const inland = atlas.cells.find(c => c.surface === 'land' && !isCoast(s, c.id))!.id;
    for (const bad of [-1, 2592, NaN, Infinity, 1.5, water, inland, 1614]) {
      expect(seaRoute(s, 1614, bad)).toBeNull(); expect(seaRoute(s, bad, 1614)).toBeNull();
    }
  });

  it('actual H starts short, earns at existing springs and spends exactly 56 once with a unique receipt', () => {
    const s = base(), before = accounts(s); expect(boatQuote(s)).toContain('56');
    expect(buyBoat(s, seaCommand(s, 1171))).toBe(false); expect(accounts(s)).toEqual(before);
    advance(s, 30); const available = s.machines!.resource, others = accounts(s), command = seaCommand(s, 1171);
    expect(buyBoat(s, command)).toBe(true); expect(s.machines!.resource).toBe(available - 56);
    const vessel = s.maritime!.vessel!;
    expect(vessel.payment).toMatchObject({ source: 'home', use: 'consumed', before: available, amount: 56, after: available - 56 });
    expect(vessel.payment.before - vessel.payment.amount).toBe(vessel.payment.after);
    expect(activeMachines(s)!.springs.some(p => p.id === vessel.payment.springId && p.owner === 'player')).toBe(true);
    expect(accounts(s).states).toEqual(others.states); expect(accounts(s).cities).toEqual(others.cities);
    expect(buyBoat(s, command)).toBe(false); expect(buyBoat(s, seaCommand(s, 1171))).toBe(false);
    expect(s.machines!.resource).toBe(available - 56); expect(s.maritime!.vessel).toEqual(vessel); expect(round(s).maritime).toEqual(s.maritime);
  });

  it.each(['revision', 'from', 'vesselId'] as const)('rejects stale purchase and departure %s without mutation', key => {
    const s = earned(), purchase = seaCommand(s, 1171);
    if (key === 'vesselId') purchase[key] = 'foreign-vessel'; else purchase[key]++;
    const before = accounts(s); expect(buyBoat(s, purchase)).toBe(false); expect(accounts(s)).toEqual(before);
    expect(buyBoat(s, seaCommand(s, 1171))).toBe(true); const command = seaCommand(s, 1171);
    if (key === 'vesselId') command[key] += '-stale'; else command[key]++;
    const after = structuredClone(s.maritime); expect(sail(s, command)).toBe(false); expect(s.maritime).toEqual(after);
  });

  it('rejects a pending UI purchase or departure after the selected coast changed', () => {
    const s = earned(); navigation(s)!.selectedCell = 1171;
    seaAction(s, 'offer-buy'); const amber = s.machines!.resource;
    navigation(s)!.selectedCell = 1541; expect(seaAction(s, 'confirm')).toBe(false);
    expect(s.machines!.resource).toBe(amber); expect(s.maritime!.vessel).toBeNull();
    expect(buyBoat(s, seaCommand(s, 1171))).toBe(true); navigation(s)!.selectedCell = 1171;
    seaAction(s, 'offer-sail'); navigation(s)!.selectedCell = 1541;
    expect(seaAction(s, 'confirm')).toBe(false); expect(s.maritime!.journeys).toEqual([]);
    resetSeaOffer();
  });

  it('explicit departure, actual progress and explicit landing preserve finance, history and a single passenger/vessel', () => {
    const s = bought(), home = original(s), finances = accounts(s), command = seaCommand(s, 1171), count = navigation(s)!.fields.length;
    expect(sailingQuote(s, 1171).reason).toBeNull(); expect(sail(s, command)).toBe(true); expect(sail(s, command)).toBe(false);
    expect(atSea(s)).toBe(true); expect(landBoat(s, s.maritime!.revision)).toBe(false); advance(s, 2);
    expect(seaJourney(s)!.progress).toBeCloseTo(2, 8); expect(original(s)).toEqual(home); expect(accounts(s)).toEqual(finances);
    expect(navigation(s)!.fields).toHaveLength(count); arrive(s);
    expect(currentCoast(s)).toBe(1171); expect(s.maritime!.vessel!.mooring).toBe(1171); expect(atSea(s)).toBe(false);
    expect(seaJourney(s)!.phase).toBe('landed'); expect(navigation(s)!.fields).toHaveLength(count + 1); expect(accounts(s)).toEqual(finances);
    expect(landBoat(s, s.maritime!.revision - 1)).toBe(false); expect(s.maritime!.journeys).toHaveLength(1);
    expect(foundCity(s, 'Bezplatný přístav')).toBe(false); expect(accounts(s)).toEqual(finances);
    // Explicit prepared spatial input: unit test positions at an existing survey marker; browser must walk.
    const field = activeField(s)!; field.position = { ...field.world.patches[0].center };
    expect(surveyField(s)).toBe(true); expect(accounts(s)).toEqual(finances);
    expect(sail(s, seaCommand(s, 1614))).toBe(true); arrive(s);
    expect(activeField(s)).toBeNull(); expect(s.maritime!.vessel!.mooring).toBe(1614); expect(s.maritime!.journeys).toHaveLength(2);
    expect(s.machines!.resource).toBe(finances.home); expect(round(s).maritime).toEqual(s.maritime);
  });

  it('a destination city still requires all surveys, a valid site and its original additional 60 home amber', () => {
    const s = base(); advance(s, 200); const before = s.machines!.resource;
    expect(before).toBeGreaterThanOrEqual(116); expect(buyBoat(s, seaCommand(s, 1171))).toBe(true);
    expect(sail(s, seaCommand(s, 1171))).toBe(true); arrive(s); const field = activeField(s)!;
    expect(foundCity(s, 'Přístav')).toBe(false);
    // Explicit prepared unit positions at the real survey markers and candidate sites. Browser verifies walking.
    for (const patch of field.world.patches) { field.position = { ...patch.center }; expect(surveyField(s)).toBe(true); }
    let found = false; const cell = planetAtlas(s.homePlanet!)!.cells[field.cellId];
    for (let x = -60; x <= 60 && !found; x += 10) for (let z = -60; z <= 60 && !found; z += 10) {
      field.position = { x, z, y: fieldGround(s.seed, cell, x, z) }; found = foundingAvailability(s).available;
    }
    expect(found).toBe(true); const count = s.cities!.entries.length; expect(foundCity(s, 'Přístav')).toBe(true);
    expect(s.cities!.entries).toHaveLength(count + 1); expect(s.cities!.entries.at(-1)!.founded).toMatchObject({ source: 'player', paidAmber: 60 });
    expect(s.machines!.resource).toBe(before - 56 - 60); expect(foundCity(s, 'Dvojí přístav')).toBe(false);
    expect(s.machines!.resource).toBe(before - 116); expect(() => round(s)).not.toThrow();
  });

  it('cancellation retraces only sailed distance and time, refunds nothing and survives reload', () => {
    let s = outbound(); advance(s, 3); const paid = accounts(s), travelled = seaJourney(s)!.progress, rev = s.maritime!.revision;
    expect(turnBoat(s, rev)).toBe(true); expect(turnBoat(s, rev)).toBe(false); expect(landBoat(s, s.maritime!.revision)).toBe(false);
    s = round(s); advance(s, 1); expect(seaJourney(s)!.progress).toBeCloseTo(travelled - 1, 8); expect(landBoat(s, s.maritime!.revision)).toBe(false);
    advance(s, 2); expect(landBoat(s, s.maritime!.revision)).toBe(true); expect(seaJourney(s)!.phase).toBe('returned');
    expect(seaJourney(s)!.elapsed).toBeCloseTo(2 * travelled, 8); expect(currentCoast(s)).toBe(1614); expect(accounts(s)).toEqual(paid);
    expect(navigation(s)!.fields.some(f => f.cellId === 1171)).toBe(false); expect(round(s).maritime).toEqual(s.maritime);
  });

  it('lands after exactly route-edges × 60 frames and saves the normalized completed endpoint', () => {
    const s = outbound(), edges = seaJourney(s)!.route.length - 1;
    for (let frame = 0; frame < edges * 60; frame++) step(s, EMPTY_INPUT, 1 / 60);
    expect(landBoat(s, s.maritime!.revision)).toBe(true);
    expect(seaJourney(s)).toMatchObject({ phase: 'landed', progress: edges, distance: edges, elapsed: edges });
    expect(round(s).maritime).toEqual(s.maritime);
    expect(sail(s, seaCommand(s, 1614))).toBe(true); const backEdges = seaJourney(s)!.route.length - 1;
    for (let frame = 0; frame < backEdges * 60; frame++) step(s, EMPTY_INPUT, 1 / 60);
    expect(landBoat(s, s.maritime!.revision)).toBe(true); expect(currentCoast(s)).toBe(1614);
    expect(seaJourney(s)).toMatchObject({ phase: 'landed', progress: backEdges, distance: backEdges, elapsed: backEdges });
    expect(round(s).maritime).toEqual(s.maritime);
  });

  it.each([1, 7, 119, 181])('normalizes an interrupted return after exactly %i outward and matching reverse frames', frames => {
    const s = outbound(), paid = accounts(s);
    for (let frame = 0; frame < frames; frame++) step(s, EMPTY_INPUT, 1 / 60);
    const distance = seaJourney(s)!.distance; expect(turnBoat(s, s.maritime!.revision)).toBe(true);
    for (let frame = 0; frame < frames; frame++) step(s, EMPTY_INPUT, 1 / 60);
    expect(landBoat(s, s.maritime!.revision)).toBe(true);
    expect(seaJourney(s)).toMatchObject({ phase: 'returned', progress: 0, distance, elapsed: 2 * distance });
    expect(currentCoast(s)).toBe(1614); expect(accounts(s)).toEqual(paid); expect(round(s).maritime).toEqual(s.maritime);
  });

  it('reserves voyage 128 for a finite return home and rejects cancellation that would strand its passenger', () => {
    const s = bought(), paid = accounts(s);
    for (let journey = 1; journey <= 127; journey++) {
      expect(sail(s, seaCommand(s, journey % 2 ? 1171 : 1614))).toBe(true);
      const edges = seaJourney(s)!.route.length - 1;
      for (let frame = 0; frame < edges * 30; frame++) step(s, EMPTY_INPUT, 1 / 30);
      expect(landBoat(s, s.maritime!.revision)).toBe(true);
    }
    expect(currentCoast(s)).toBe(1171); expect(s.maritime!.journeys).toHaveLength(127);
    expect(sailingQuote(s, 1615).reason).toContain('128'); expect(sailingQuote(s, 1614).reason).toBeNull();
    expect(sail(s, seaCommand(s, 1614))).toBe(true); expect(turnBoat(s, s.maritime!.revision)).toBe(false);
    expect(sailingStatus(s)).toContain('data-action="sea:turn" disabled'); expect(sailingStatus(s)).toContain('Poslední záznam');
    const edges = seaJourney(s)!.route.length - 1;
    for (let frame = 0; frame < edges * 30; frame++) step(s, EMPTY_INPUT, 1 / 30);
    expect(landBoat(s, s.maritime!.revision)).toBe(true); expect(currentCoast(s)).toBe(1614);
    expect(s.maritime!.journeys).toHaveLength(128); expect(sail(s, seaCommand(s, 1171))).toBe(false);
    expect(accounts(s)).toEqual(paid); expect(round(s).maritime).toEqual(s.maritime);
  });

  it('a later raid allows only the existing offshore boat to return home; player deployment still blocks it', () => {
    const s = outbound(); arrive(s);
    const alternative = planetAtlas(s.homePlanet!)!.cells.find(cell => cell.id !== 1614 && sailingQuote(s, cell.id).reason === null)!.id;
    // Explicit prepared concurrency input: clone the real H raid after arrival and mark unresolved.
    // This is not a recreated rival or paid browser result; H's original states remain defeated.
    const raid = structuredClone(s.military!.raids![0]); raid.phase = 'outbound'; s.military!.raids!.push(raid); const expectedRaid = structuredClone(raid);
    const paid = accounts(s); expect(sailingQuote(s, alternative).reason).not.toBeNull();
    expect(sail(s, seaCommand(s, alternative))).toBe(false); expect(sailingQuote(s, 1614).reason).toBeNull();
    // Explicit prepared deployment checks that the rescue exemption never transports military units.
    s.military!.deployment = { unitId: s.machines!.fleet[0].id, cityId: s.cities!.entries[0].id, home: { ...s.machines!.fleet[0].pos }, route: [1614, 1615], phase: 'outbound', remaining: 5, order: 'stop', hold: 0, elapsed: 0 };
    expect(sail(s, seaCommand(s, 1614))).toBe(false); s.military!.deployment = null;
    expect(sail(s, seaCommand(s, 1614))).toBe(true); const edges = seaJourney(s)!.route.length - 1;
    for (let frame = 0; frame < edges * 60; frame++) step(s, EMPTY_INPUT, 1 / 60);
    expect(landBoat(s, s.maritime!.revision)).toBe(true); expect(currentCoast(s)).toBe(1614); expect(accounts(s)).toEqual(paid);
    expect(s.maritime!.journeys).toHaveLength(2); expect(s.military!.raids!.at(-1)).toEqual(expectedRaid);
  });

  it('prevents free new ocean crossings, preserves exact historical 776 access and keeps the boat at its mooring', () => {
    const s = bought(); expect(enterField(s, 1171)).toBe(false); expect(enterField(s, 776)).toBe(true);
    expect(s.maritime!.vessel!.mooring).toBe(1614); expect(sailingQuote(s, 1171).reason).toContain('kotví');
    returnHome(s); expect(currentCoast(s)).toBe(1614); expect(sail(s, seaCommand(s, 1171))).toBe(true); arrive(s);
    returnHome(s); expect(currentCoast(s)).toBe(1171); expect(maritimeLandReason(s, 1614)).not.toBeNull(); expect(enterField(s, 776)).toBe(false);
    expect(sail(s, seaCommand(s, 1614))).toBe(true); arrive(s); expect(enterField(s, 1171)).toBe(false);
  });

  it('on-water actions cannot move localities, create a city or deploy a land tank', () => {
    const s = outbound(), id = s.homePlanet!.currentLocationId, before = accounts(s);
    expect(enterField(s, 776)).toBe(false); returnHome(s); expect(s.homePlanet!.currentLocationId).toBe(id);
    expect(surveyField(s)).toBe(false); expect(foundCity(s, 'Mořské město')).toBe(false);
    expect(deployMachine(s, s.cities!.entries[0], s.machines!.fleet[0].id)).toBe(false);
    expect(accounts(s)).toEqual(before); expect(s.maritime!.journeys).toHaveLength(1);
  });

  it.each(['preparing', 'outbound', 'waiting', 'field', 'occupying', 'garrison', 'retreat', 'returning'] as const)('unresolved %s raid blocks departure without payment or duplication', phase => {
    const s = bought();
    // Explicit prepared concurrency probe based on the real completed H raid, not a played or funded enemy.
    const raid = structuredClone(s.military!.raids![0]); raid.phase = phase; s.military!.raids!.push(raid);
    const before = accounts(s), sea = structuredClone(s.maritime); expect(sail(s, seaCommand(s, 1171))).toBe(false);
    expect(accounts(s)).toEqual(before); expect(s.maritime).toEqual(sea);
  });

  it('a prepared deployment blocks sailing; incompatible habitat and missing spring do not buy or sail', () => {
    const s = bought();
    // Explicit prepared player deployment; never described as earned gameplay.
    s.military!.deployment = { unitId: s.machines!.fleet[0].id, cityId: s.cities!.entries[0].id, home: { ...s.machines!.fleet[0].pos }, route: [1614, 1615], phase: 'outbound', remaining: 5, order: 'stop', hold: 0, elapsed: 0 };
    expect(sail(s, seaCommand(s, 1171))).toBe(false); s.military!.deployment = null;
    const anchor = planetAtlas(s.homePlanet!)!.anchors.find(a => a.cellId !== homeCoast(s))!;
    expect(sailingQuote(s, anchor.cellId).reason).not.toBeNull();
    const missing = earned(); for (const p of activeMachines(missing)!.springs) if (p.owner === 'player') p.owner = 'neutral';
    expect(() => buyBoat(missing, seaCommand(missing, 1171))).not.toThrow(); expect(missing.maritime!.vessel).toBeNull();
  });

  it('advances strategic and sea clocks while all local worlds, RNG and accounts stay frozen; global and death freeze both', () => {
    const s = outbound(), home = original(s), turn = s.states!.clock.turn, time = s.states!.clock.elapsed;
    advance(s, 3); expect(seaJourney(s)!.elapsed).toBeCloseTo(3, 8); expect(s.states!.clock.turn * 10 + s.states!.clock.elapsed).toBeCloseTo(turn * 10 + time + 3, 7);
    expect(original(s)).toEqual(home); openAtlas(s); const stopped = branch(s); advance(s, 40); expect(branch(s)).toEqual(stopped);
    navigation(s)!.mode = 'local'; s.player.health = 0; const dead = branch(s); advance(s, 40); expect(branch(s)).toEqual(dead);
  });

  it('clamps malformed elapsed input without creating offline progress and is deterministic', () => {
    const run = () => { const s = outbound(); advance(s, 2); turnBoat(s, s.maritime!.revision); advance(s, 2); landBoat(s, s.maritime!.revision); return JSON.stringify(s); };
    expect(run()).toBe(run()); const s = outbound(), before = structuredClone(s.maritime);
    for (const dt of [NaN, Infinity, -1]) stepMaritime(s, dt); expect(s.maritime).toEqual(before);
    stepMaritime(s, 10000); expect(seaJourney(s)!.progress).toBeCloseTo(1 / 30, 10);
    expect(round(s).maritime).toEqual(s.maritime);
  });
});

describe('SP-009.I whole-branch persistence and historical compatibility', () => {
  it('save/load, import rekey and checkpoint restore the entire pending voyage without merging future money, land or history', () => {
    const s = outbound(); advance(s, 2); makeCheckpoint(s); const checkpoint = branch(s); arrive(s);
    const storage = new Map<string, string>(); vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => storage.set(k, v), getItem: (k: string) => storage.get(k) ?? null });
    try { expect(saveGame(s).ok).toBe(true); expect(branch(loadGame(s.id))).toEqual(branch(s)); } finally { vi.unstubAllGlobals(); }
    s.id = 'line-i-rekey'; const cp = JSON.parse(s.checkpoint!); cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    const loaded = round(s); expect(branch(loaded)).toEqual(branch(s)); const restored = recoverGeneration(loaded);
    expect(branch(restored)).toEqual(checkpoint); expect(atSea(restored)).toBe(true); expect(seaJourney(restored)!.progress).toBeCloseTo(2, 8);
    expect(navigation(restored)!.fields.some(f => f.cellId === 1171)).toBe(false); expect(round(restored).maritime).toEqual(restored.maritime);
  });

  it.each(['returning', 'returned'] as const)('rejects a changed turn-around distance in a %s live branch after a returning checkpoint', phase => {
    const s = outbound(); advance(s, 3); expect(turnBoat(s, s.maritime!.revision)).toBe(true);
    makeCheckpoint(s); const checkpointJourney = structuredClone(seaJourney(s)!);
    advance(s, phase === 'returned' ? 3 : 1);
    if (phase === 'returned') expect(landBoat(s, s.maritime!.revision)).toBe(true);
    expect(seaJourney(s)!.phase).toBe(phase); expect(() => round(s)).not.toThrow();
    // Explicit corrupt-save probe: arithmetic remains valid, but the saved decision to turn cannot move.
    const journey = seaJourney(s)!; journey.distance++;
    journey.elapsed = 2 * journey.distance - journey.progress;
    expect(journey.distance).toBeGreaterThan(checkpointJourney.distance);
    expect(journey.progress).toBeLessThanOrEqual(checkpointJourney.progress);
    expect(journey.elapsed).toBeGreaterThan(checkpointJourney.elapsed);
    const withoutCheckpoint = structuredClone(s); withoutCheckpoint.checkpoint = null;
    expect(() => round(withoutCheckpoint)).not.toThrow();
    expect(() => round(s)).toThrow();
  });

  it('pre-purchase checkpoint removes the whole later paid branch without an extra refund', () => {
    const s = earned(); makeCheckpoint(s); const before = branch(s); buyBoat(s, seaCommand(s, 1171)); sail(s, seaCommand(s, 1171)); advance(s, 1);
    const restored = recoverGeneration(round(s)); expect(branch(restored)).toEqual(before); expect(restored.maritime!.vessel).toBeNull(); expect(restored.maritime!.journeys).toEqual([]);
  });

  it.each(['version', 'keys', 'price', 'source', 'debit', 'spring', 'mooring', 'route', 'water', 'sequence', 'progress', 'future', 'checkpointPrefix'] as const)('rejects corrupted %s maritime meaning', kind => {
    const s = outbound(), m = s.maritime!, j = seaJourney(s)!; advance(s, 2);
    if (kind === 'version') m.version = 2 as 1;
    if (kind === 'keys') Object.assign(m, { free: true });
    if (kind === 'price') m.vessel!.payment.amount--;
    if (kind === 'source') m.vessel!.payment.source = 'city' as 'home';
    if (kind === 'debit') m.vessel!.payment.after++;
    if (kind === 'spring') m.vessel!.payment.springId = -1;
    if (kind === 'mooring') m.vessel!.mooring = 1171;
    if (kind === 'route') j.route.splice(1, 1);
    if (kind === 'water') j.route[1] = 776;
    if (kind === 'sequence') j.id++;
    if (kind === 'progress') j.progress = j.route.length + 1;
    if (kind === 'future') j.turn = s.states!.clock.turn + 1;
    if (kind === 'checkpointPrefix') { makeCheckpoint(s); m.vessel!.payment.before++; m.vessel!.payment.after++; }
    expect(() => round(s)).toThrow();
  });

  it.each(readdirSync('tests/fixtures/geography').filter(f => f.endsWith('.save.json')))('migrates historical geography A–H %s without invented sea history, before rekey', file => {
    const path = `tests/fixtures/geography/${file}`, data = readFileSync(path, 'utf8'), s = parseGame(data), inheritance = tribeInheritance(s);
    enableMaritime(s); const once = JSON.stringify(s); enableMaritime(s); expect(JSON.stringify(s)).toBe(once);
    expect(s.maritime!.journeys).toEqual([]); expect(s.maritime!.vessel).toBeNull(); expect(tribeInheritance(s)).toEqual(inheritance);
    s.id = 'line-i-history'; if (s.checkpoint) { const cp = JSON.parse(s.checkpoint); cp.id = s.id; s.checkpoint = JSON.stringify(cp); }
    expect(() => round(s)).not.toThrow(); if (s.checkpoint) expect(() => round(recoverGeneration(s))).not.toThrow(); expect(readFileSync(path, 'utf8')).toBe(data);
  });

  const historical = JSON.parse(readFileSync('tests/fixtures/saves/manifest.json', 'utf8')).files as { file: string; sha256: string }[];
  it.each(historical)('preserves original stage/B1 fixture $file, bytes and full checkpoint across repeated maritime activation', entry => {
    const data = readFileSync(`tests/fixtures/saves/${entry.file}`, 'utf8'); expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256);
    const s = parseGame(data), before = structuredClone({ worlds: s.worlds, player: s.player, machines: s.machines, tribe: s.tribe, rng: s.rng, tick: s.tick });
    const inherited = tribeInheritance(s); enableMaritime(s); const once = JSON.stringify(s); enableMaritime(s); expect(JSON.stringify(s)).toBe(once);
    expect({ worlds: s.worlds, player: s.player, machines: s.machines, tribe: s.tribe, rng: s.rng, tick: s.tick }).toEqual(before);
    expect(tribeInheritance(s)).toEqual(inherited); expect(s.maritime!.journeys).toEqual([]); expect(s.maritime!.vessel).toBeNull();
    expect(() => round(s)).not.toThrow(); if (s.checkpoint) expect(() => round(recoverGeneration(s))).not.toThrow();
  });
});
