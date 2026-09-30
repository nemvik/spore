import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialShip, shipStats } from '../src/game/ship-design';
import { initialVehicle } from '../src/game/blueprint';
import { newShipCreation, parseShipCreation, serializeShipCreation } from '../src/game/ship-library';
import { buildShip, changeSpaceScale, enableSpace, homeSystemId, inSpace, launchShip, shipQuote, stepSpace } from '../src/game/space';
import { enableHomePlanet } from '../src/game/home-planet';
import { FixedStepClock } from '../src/game/input-clock';
import { activeMachines, buildMachine, machineHome } from '../src/game/machines';
import { buyBoat, seaCommand } from '../src/game/maritime';
import {
  activePlanet, introducePlanetLife, planetVehicle, preparePlanetNursery, removePlanetLife,
  retirePlanetVehicle, samplePlanetLife, selectPlanetVehicle, togglePlanetTool,
} from '../src/game/planet';
import { enterField, openAtlas, returnHome } from '../src/game/planet-travel';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState, type Input } from '../src/game/types';

const fixtures = {
  historical: 'tests/fixtures/saves/stable-sandbox.save.json',
  military: 'tests/fixtures/civilization/native-military-campaign.save.json',
  conversion: 'tests/fixtures/civilization/native-conversion-campaign.save.json',
} as const;
const load = (kind: keyof typeof fixtures = 'military') => parseGame(readFileSync(fixtures[kind], 'utf8'));
const round = (s: GameState) => parseGame(serializeGame(s));
const creation = () => newShipCreation(initialShip(), 'Zaplacená expedice', 'own-starship', 100);
const homeSnapshot = (s: GameState) => {
  const { space: _space, checkpoint: _checkpoint, ...home } = s;
  return structuredClone(home);
};
function preparedDock(kind: keyof typeof fixtures = 'military') {
  const s = load(kind);
  enableHomePlanet(s); enableSpace(s);
  // Explicitly prepared unit regression: put the existing active carrier at its own
  // workshop. Keep earned stage, amber, B2 history and all source fixture bytes intact.
  planetVehicle(s)!.pos = { ...machineHome(s) };
  return s;
}
function flying() {
  const s = preparedDock(); expect(buildShip(s, creation())).toBe(true);
  expect(launchShip(s)).toBe(true); return s;
}
function advance(s: GameState, seconds: number, input: Input = EMPTY_INPUT) {
  for (let n = 0; n < Math.ceil(seconds * 30); n++) step(s, input, 1 / 30);
}
function climb(s: GameState) { advance(s, 2, { ...EMPTY_INPUT, vertical: 1 }); expect(s.space!.location!.pos.y).toBeGreaterThanOrEqual(20); }
function finishLeg(s: GameState) {
  for (let n = 0; n < 92 && s.space!.leg; n++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.leg).toBeNull();
}
function rejectBoth(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 100, state: s }))).toThrow();
}
afterEach(() => vi.unstubAllGlobals());

describe('C1 explicit migration and paid historical entry', () => {
  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])('activates %s live and checkpoint without grants or invented civilization facts', kind => {
    const originalBytes = readFileSync(fixtures[kind], 'utf8'), s = load(kind);
    enableHomePlanet(s);
    const before = homeSnapshot(s), oldCheckpoint = JSON.parse(s.checkpoint!) as GameState;
    expect(s.space).toBeUndefined(); enableSpace(s);
    expect(homeSnapshot(s)).toEqual(before);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(homeSnapshot(cp)).toEqual(homeSnapshot(oldCheckpoint));
    expect(cp.space).toEqual(s.space);
    expect(s.space).toMatchObject({ ship: null, location: null, leg: null, elapsed: 0, log: [], nextSerial: 1 });
    const activated = structuredClone(s); enableSpace(s);
    expect(s).toEqual(activated); expect(round(s).space).toEqual(s.space);
    if (kind === 'historical') { expect(s.civilization).toBeUndefined(); expect(cp.civilization).toBeUndefined(); }
    expect(readFileSync(fixtures[kind], 'utf8')).toBe(originalBytes);
  });

  it.each(Object.keys(fixtures) as (keyof typeof fixtures)[])('pays for a detached ship snapshot from earned %s amber', kind => {
    const s = preparedDock(kind), design = creation(), before = activeMachines(s)!.resource;
    const history = structuredClone(s.lineageHistory), civilization = structuredClone(s.civilization);
    const quote = shipQuote(s, design); expect(quote).toEqual({ ok: true, reason: '', price: 98 });
    expect(buildShip(s, parseShipCreation(serializeShipCreation(design)))).toBe(true);
    expect(activeMachines(s)!.resource).toBe(before - 98);
    expect(s.space!.ship).toMatchObject({ id: `${s.homePlanet!.id}:ship-1`, creation: design,
      health: 101, energy: 101, purchase: { tick: s.tick, before, paid: 98, after: before - 98 } });
    design.blueprint.parts[0].scale.x = .3; design.revision++;
    expect(s.space!.ship!.creation.blueprint.parts[0].scale.x).toBe(1.2);
    expect(s.space!.ship!.creation.revision).toBe(1);
    expect(s.lineageHistory).toEqual(history); expect(s.civilization).toEqual(civilization);
    expect(round(s).space).toEqual(s.space);
    const paid = activeMachines(s)!.resource, snapshot = structuredClone(s.space!.ship);
    expect(buildShip(s, creation())).toBe(false);
    expect(activeMachines(s)!.resource).toBe(paid); expect(s.space!.ship).toEqual(snapshot);
  });

  it('restores a genuinely older checkpoint with no ship and its own old balance, then charges anew once', () => {
    const s = preparedDock('historical'), cp = JSON.parse(s.checkpoint!) as GameState;
    const oldBalance = activeMachines(cp)!.resource;
    expect(buildShip(s, creation())).toBe(true);
    const restored = recoverGeneration(round(s));
    expect(restored.space!.ship).toBeNull(); expect(activeMachines(restored)!.resource).toBe(oldBalance);
    expect(restored.civilization).toBeUndefined();
    planetVehicle(restored)!.pos = { ...machineHome(restored) };
    expect(buildShip(restored, creation())).toBe(true);
    expect(activeMachines(restored)!.resource).toBe(oldBalance - 98);
    expect(round(restored).space!.ship!.purchase.before).toBe(oldBalance);
  });

  it('retains the opt-in on a checkpoint-free new generation without carrying a free ship or earned amber', () => {
    const s = flying(); s.checkpoint = null;
    const fresh = recoverGeneration(s);
    expect(fresh.stage).toBe(0); expect(activeMachines(fresh)).toBeNull();
    expect(fresh.space).toEqual({ version: 1, homePlanetId: fresh.homePlanet!.id, elapsed: 0,
      ship: null, location: null, leg: null, log: [], nextSerial: 1, notice: '' });
    expect((JSON.parse(fresh.checkpoint!) as GameState).space).toEqual(fresh.space);
    expect(round(fresh).space).toEqual(fresh.space);
  });

  it.each([
    ['insufficient amber', (s: GameState) => { activeMachines(s)!.resource = 97.99; }],
    ['outside workshop', (s: GameState) => { planetVehicle(s)!.pos.x = machineHome(s).x + 12.01; }],
    ['atlas open', (s: GameState) => { if (s.homePlanet?.version === 3) s.homePlanet.navigation.mode = 'global'; }],
    ['unfinished required civilization', (s: GameState) => { s.civilization!.completed = null; }],
    ['wrong stage', (s: GameState) => { s.stage = 4; }],
    ['dead lineage', (s: GameState) => { s.player.health = 0; }],
    ['disabled slice', (s: GameState) => { delete s.space; }],
  ] as const)('rejects %s without changing accounts, history or a ship', (_name, mutate) => {
    const s = preparedDock(); mutate(s);
    const home = homeSnapshot(s), ship = structuredClone(s.space?.ship);
    expect(shipQuote(s, creation()).ok).toBe(false); expect(buildShip(s, creation())).toBe(false);
    expect(launchShip(s)).toBe(false); expect(homeSnapshot(s)).toEqual(home); expect(s.space?.ship).toEqual(ship);
  });

  it('rejects malformed imported construction before charging even when amber is available', () => {
    const s = preparedDock(), design = creation(), before = activeMachines(s)!.resource;
    design.blueprint.parts = [];
    expect(buildShip(s, design)).toBe(false); expect(activeMachines(s)!.resource).toBe(before);
    expect(s.space!.ship).toBeNull();
  });
});

describe('C1 surface, orbit and system flight through the public simulation', () => {
  it('rejects domestic production, planet actions and atlas travel while in flight without mutating the home', () => {
    const s = preparedDock(), draft = initialVehicle('tank', 'restoration');
    // A valid affordable design and a free fleet slot isolate the flight guard.
    expect(buildMachine(structuredClone(s), draft).ok).toBe(true);
    expect(buildShip(s, creation())).toBe(true); expect(launchShip(s)).toBe(true); makeCheckpoint(s);
    const home = homeSnapshot(s), flight = structuredClone(s.space), checkpoint = s.checkpoint;
    const p = activePlanet(s)!, target = s.homePlanet?.version === 3 ? s.homePlanet.navigation.fields[0]?.cellId : undefined;
    expect(target).toBeTypeOf('number');
    const mutations = [
      () => buildMachine(s, draft),
      () => selectPlanetVehicle(s, activeMachines(s)!.fleet.find(u => u.id !== p.activeMachine)!.id),
      () => togglePlanetTool(s),
      () => retirePlanetVehicle(s),
      () => samplePlanetLife(s, { kind: 'culture', id: p.nursery.sources[0].resourceId }),
      () => preparePlanetNursery(s, 'bell'),
      () => introducePlanetLife(s, p.biomes[0].id, p.nursery.sources[0].key),
      () => removePlanetLife(s, p.stabilizers[0]?.id ?? p.populations[0]?.id ?? p.nextId),
    ];
    for (const mutate of mutations) {
      expect(mutate().ok).toBe(false); expect(homeSnapshot(s)).toEqual(home);
    }
    expect(buyBoat(s, seaCommand(s, target!))).toBe(false); expect(homeSnapshot(s)).toEqual(home);
    openAtlas(s); expect(homeSnapshot(s)).toEqual(home);
    expect(enterField(s, target!)).toBe(false); expect(homeSnapshot(s)).toEqual(home);
    returnHome(s); expect(homeSnapshot(s)).toEqual(home);
    expect(s.space).toEqual({ ...flight, notice: expect.any(String) }); expect(s.checkpoint).toBe(checkpoint);
    expect(homeSnapshot(round(s))).toEqual(home);
  });

  it('switches the planet tool off, freezes the complete home, and returns through all three scales', () => {
    const s = preparedDock(); activePlanet(s)!.toolOn = true;
    expect(buildShip(s, creation())).toBe(true); expect(launchShip(s)).toBe(true);
    expect(activePlanet(s)!.toolOn).toBe(false);
    const home = homeSnapshot(s), p = s.space!;
    expect(p.location).toMatchObject({ scale: 'surface', systemId: homeSystemId(s.homePlanet!.id), planetId: s.homePlanet!.id, pos: { x: 0, y: 3, z: 0 } });
    expect(changeSpaceScale(s, 'up')).toBe(false); expect(p.leg).toBeNull();
    climb(s);
    for (const scale of ['orbit', 'system'] as const) {
      const energy = p.ship!.energy;
      expect(changeSpaceScale(s, 'up')).toBe(true); expect(p.ship!.energy).toBeCloseTo(energy - 4);
      expect(changeSpaceScale(s, 'up')).toBe(false); expect(p.ship!.energy).toBeCloseTo(energy - 4);
      finishLeg(s); expect(p.location!.scale).toBe(scale);
    }
    expect(changeSpaceScale(s, 'up')).toBe(false);
    advance(s, 1, { ...EMPTY_INPUT, x: 1 }); advance(s, 1, { ...EMPTY_INPUT, x: -1 });
    for (const scale of ['orbit', 'surface'] as const) {
      expect(changeSpaceScale(s, 'down')).toBe(true); expect(p.leg!.energyPaid).toBe(0);
      finishLeg(s); expect(p.location!.scale).toBe(scale);
    }
    expect(changeSpaceScale(s, 'down')).toBe(true); expect(inSpace(s)).toBe(false);
    expect(homeSnapshot(s)).toEqual(home); expect(homeSnapshot(round(s))).toEqual(home);
    expect(p.log.map(row => [row.from, row.to])).toEqual([
      ['dock', 'surface'], ['surface', 'orbit'], ['orbit', 'system'],
      ['system', 'orbit'], ['orbit', 'surface'], ['surface', 'dock'],
    ]);
  });

  it('resumes a paid mid-leg save, checkpoint and rekey without another debit or loss of flight progress', () => {
    let s = flying(); climb(s); expect(changeSpaceScale(s, 'up')).toBe(true); advance(s, 1);
    makeCheckpoint(s);
    const checkpointSpace = structuredClone(s.space), home = homeSnapshot(s), money = activeMachines(s)!.resource;
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => storage.set(key, value), getItem: (key: string) => storage.get(key) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); s = loadGame(s.id);
    expect(s.space).toEqual(checkpointSpace);
    advance(s, 1); const recovered = recoverGeneration(round(s));
    expect(recovered.space).toEqual({ ...checkpointSpace, notice: expect.any(String) });
    expect(recovered.space!.notice).not.toBe(checkpointSpace!.notice);
    expect(activeMachines(recovered)!.resource).toBe(money);
    expect(homeSnapshot(recovered)).toEqual(home); expect(round(recovered).space).toEqual(recovered.space);
    s = round(s); const id = `${s.id}-ship-import`; s.id = id;
    const cp = JSON.parse(s.checkpoint!) as GameState; cp.id = id; s.checkpoint = JSON.stringify(cp);
    s = round(s); expect(s.homePlanet!.id).toBe(home.homePlanet!.id);
    expect(s.space!.ship).toEqual(checkpointSpace!.ship); finishLeg(s);
    expect(s.space!.location!.scale).toBe('orbit'); expect(activeMachines(s)!.resource).toBe(money);
    expect(changeSpaceScale(s, 'down')).toBe(true); finishLeg(s); expect(changeSpaceScale(s, 'down')).toBe(true);
    expect(homeSnapshot(s)).toEqual({ ...home, id }); expect(round(s).space!.location).toBeNull();
  });

  it('uses normalized movement, finite clamped time, bounded positions and solar recovery', () => {
    const s = flying(), stats = shipStats(s.space!.ship!.creation.blueprint);
    const before = structuredClone(s.space);
    for (const dt of [0, -1, NaN, Infinity]) stepSpace(s, EMPTY_INPUT, dt);
    expect(s.space).toEqual(before);
    step(s, { ...EMPTY_INPUT, x: 1, z: 1, vertical: 1 }, 30);
    const p = s.space!.location!.pos;
    expect(Math.hypot(p.x, p.y - 3, p.z)).toBeCloseTo(stats.speed / 30, 10);
    expect(s.space!.elapsed).toBeCloseTo(1 / 30, 10);
    const energy = s.space!.ship!.energy;
    advance(s, 1, { ...EMPTY_INPUT, x: 1, sprint: true });
    expect(s.space!.ship!.energy).toBeCloseTo(energy - .8, 10);
    advance(s, 1); expect(s.space!.ship!.energy).toBe(stats.energy);
    advance(s, 30, { ...EMPTY_INPUT, x: 1, vertical: 1 });
    expect(s.space!.location!.pos).toMatchObject({ x: 80, y: 26 });
    const beforeBadInput = structuredClone(s.space!.location);
    step(s, { ...EMPTY_INPUT, x: NaN, z: Infinity, vertical: -Infinity }, 1 / 30);
    expect(s.space!.location).toEqual(beforeBadInput); expect(round(s).space).toEqual(s.space);
  });

  it('does not simulate paused or hidden time when driven by the same fixed-step clock contract as the UI', () => {
    const s = flying(), clock = new FixedStepClock();
    const frame = (time: number, active = true) => {
      const count = clock.advance(time, active);
      for (let i = 0; i < count; i++) step(s, { ...EMPTY_INPUT, vertical: 1 }, clock.stepSeconds);
    };
    frame(0); frame(100); const paused = structuredClone(s);
    frame(200, false); frame(60_200, false); frame(60_300);
    expect(s).toEqual(paused); frame(60_400);
    expect(s.space!.elapsed).toBeCloseTo(paused.space!.elapsed + .1, 10);
    expect(homeSnapshot(s)).toEqual(homeSnapshot(paused));
  });

  it('requires the home beacon, appropriate altitude and energy without charging denied transfers', () => {
    const s = flying(); climb(s); const p = s.space!;
    expect(changeSpaceScale(s, 'down')).toBe(false);
    p.ship!.energy = 3.99;
    expect(changeSpaceScale(s, 'up')).toBe(false); expect(p.ship!.energy).toBe(3.99);
    advance(s, 1); expect(changeSpaceScale(s, 'up')).toBe(true); finishLeg(s);
    advance(s, 2, { ...EMPTY_INPUT, x: 1 });
    const energy = p.ship!.energy;
    expect(changeSpaceScale(s, 'down')).toBe(false); expect(p.ship!.energy).toBe(energy);
    advance(s, 2, { ...EMPTY_INPUT, x: -1 });
    expect(changeSpaceScale(s, 'down')).toBe(true); finishLeg(s);
    advance(s, 1, { ...EMPTY_INPUT, x: 1 }); expect(changeSpaceScale(s, 'down')).toBe(false);
    advance(s, 1, { ...EMPTY_INPUT, x: -1 }); expect(changeSpaceScale(s, 'down')).toBe(true);
  });

  it('allows bounded log rollover without forgetting a paid checkpoint snapshot', () => {
    const s = flying(); makeCheckpoint(s);
    for (let n = 0; n < 65; n++) { expect(changeSpaceScale(s, 'down')).toBe(true); expect(launchShip(s)).toBe(true); }
    expect(s.space!.log).toHaveLength(128); expect(s.space!.log[0].serial).toBe(4);
    expect(round(s).space).toEqual(s.space);
    expect(recoverGeneration(round(s)).space).toEqual({ ...(JSON.parse(s.checkpoint!) as GameState).space, notice: expect.any(String) });
  });
});

describe('C1 hostile live and checkpoint space saves', () => {
  it.each([
    ['extra slice key', (p: any) => { p.money = 999; }],
    ['wrong version', (p: any) => { p.version = 2; }],
    ['wrong home', (p: any) => { p.homePlanetId = 'other'; }],
    ['negative clock', (p: any) => { p.elapsed = -1; }],
    ['fractional serial', (p: any) => { p.nextSerial = 1.5; }],
    ['invalid notice', (p: any) => { p.notice = 'a\nb'; }],
    ['missing purchased ship', (p: any) => { p.ship = null; }],
    ['wrong ship identity', (p: any) => { p.ship.id = 'other'; }],
    ['inflated energy', (p: any) => { p.ship.energy = 999; }],
    ['free purchase', (p: any) => { p.ship.purchase.paid = 0; p.ship.purchase.after = p.ship.purchase.before; }],
    ['inconsistent receipt', (p: any) => { p.ship.purchase.after += 1; }],
    ['future receipt', (p: any) => { p.ship.purchase.tick = 1e12; }],
    ['unsafe blueprint', (p: any) => { p.ship.creation.blueprint.parts[0].kind = '__proto__'; }],
    ['wrong system', (p: any) => { p.location.systemId = 'other'; }],
    ['wrong planet', (p: any) => { p.location.planetId = 'other'; }],
    ['invalid scale', (p: any) => { p.location.scale = 'galaxy'; }],
    ['oversized position', (p: any) => { p.location.pos.x = 80.01; }],
    ['underground', (p: any) => { p.location.pos.y = 1.99; }],
    ['extra vector key', (p: any) => { p.location.pos.w = 0; }],
    ['heading', (p: any) => { p.location.heading = 4; }],
    ['empty log', (p: any) => { p.log = []; }],
    ['nonadjacent log', (p: any) => { p.log[0].from = 'system'; }],
    ['future log', (p: any) => { p.log[0].at = 1; }],
  ] as const)('rejects %s in both live state and independently decoded checkpoint', (_name, mutate) => {
    const s = flying(); makeCheckpoint(s);
    const live = structuredClone(s); mutate(live.space); rejectBoth(live);
    const badCheckpoint = structuredClone(s), cp = JSON.parse(badCheckpoint.checkpoint!) as GameState;
    mutate(cp.space); badCheckpoint.checkpoint = JSON.stringify(cp); rejectBoth(badCheckpoint);
  });

  it.each([
    ['nonadjacent destination', (p: any) => { p.leg.to.scale = 'system'; }],
    ['altered departure', (p: any) => { p.leg.from.pos.y -= 1; }],
    ['free lift', (p: any) => { p.leg.energyPaid = 0; }],
    ['shortened transfer', (p: any) => { p.leg.duration = .1; }],
    ['completed pending transfer', (p: any) => { p.leg.elapsed = 3; }],
    ['nonbeacon destination', (p: any) => { p.leg.to.pos.x = 1; }],
  ] as const)('rejects mid-leg corruption: %s', (_name, mutate) => {
    const s = flying(); climb(s); changeSpaceScale(s, 'up'); mutate(s.space); rejectBoth(s);
  });

  it('rejects simultaneous planet tools, global navigation and dead in-flight crews', () => {
    const s = flying();
    const tool = structuredClone(s); activePlanet(tool)!.toolOn = true; rejectBoth(tool);
    const atlas = structuredClone(s); if (atlas.homePlanet?.version === 3) atlas.homePlanet.navigation.mode = 'global'; rejectBoth(atlas);
    const dead = structuredClone(s); dead.player.health = 0; rejectBoth(dead);
  });

  it('rejects paid snapshot replacement, missing slices and elapsed rollback across a checkpoint', () => {
    const s = flying(); advance(s, 1); makeCheckpoint(s);
    const changed = structuredClone(s); changed.space!.ship!.creation.blueprint.name = 'Jiná zaplacená loď'; rejectBoth(changed);
    const missing = structuredClone(s); delete missing.space; rejectBoth(missing);
    const missingCP = structuredClone(s), cp = JSON.parse(s.checkpoint!) as GameState; delete cp.space;
    missingCP.checkpoint = JSON.stringify(cp); rejectBoth(missingCP);
    const rollback = structuredClone(s); rollback.space!.elapsed = .5; rejectBoth(rollback);
    const rewritten = structuredClone(s); rewritten.space!.log[0].at = .5; rejectBoth(rewritten);
  });

  it('rejects changes to the frozen home until a recorded landing, then permits actual domestic simulation', () => {
    const s = flying(); makeCheckpoint(s);
    for (const mutate of [
      (bad: GameState) => { activeMachines(bad)!.resource += 1; },
      (bad: GameState) => { bad.player.invulnerable += 1; },
      (bad: GameState) => { bad.messages[0].text += ' changed'; },
    ]) {
      const bad = structuredClone(s); mutate(bad); rejectBoth(bad);
    }
    const before = activeMachines(s)!.resource;
    expect(changeSpaceScale(s, 'down')).toBe(true); advance(s, 1);
    expect(activeMachines(s)!.resource).toBeGreaterThan(before);
    expect(launchShip(s)).toBe(true); expect(round(s).space).toEqual(s.space);
  });

  it('rejects energy changes at unchanged checkpoint time while allowing a genuinely paid new transfer', () => {
    const s = flying(); climb(s); makeCheckpoint(s);
    const before = s.space!.ship!.energy;
    for (const delta of [-.1, .01]) {
      const bad = structuredClone(s); bad.space!.ship!.energy += delta; rejectBoth(bad);
    }
    expect(changeSpaceScale(s, 'up')).toBe(true);
    expect(s.space!.ship!.energy).toBeCloseTo(before - 4, 10);
    expect(round(s).space).toEqual(s.space);
    const unpaid = structuredClone(s); unpaid.space!.ship!.energy = before;
    rejectBoth(unpaid);
  });

  it('rejects a fabricated initial flight record without a dock launch', () => {
    const s = flying(); s.checkpoint = null;
    s.space!.log[0].from = 'surface'; s.space!.log[0].to = 'orbit';
    s.space!.location!.scale = 'orbit'; s.space!.location!.pos.y = 0;
    rejectBoth(s);
  });

  it('rejects deletion of an unexpired checkpoint log prefix before reaching the 128-entry bound', () => {
    const s = flying(); makeCheckpoint(s); climb(s); changeSpaceScale(s, 'up'); finishLeg(s);
    expect(s.space!.log).toHaveLength(2); s.space!.log.shift(); rejectBoth(s);
  });
});
