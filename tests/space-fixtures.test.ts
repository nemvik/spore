import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { civilizationInheritance } from '../src/game/civilization';
import { shipStats } from '../src/game/ship-design';
import { buildShip, changeSpaceScale, inSpace } from '../src/game/space';
import { jumpToSystem } from '../src/game/space-expedition';
import { spaceLifeSpecies } from '../src/game/space-life';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  flight: { file: 'native-c1-in-flight.save.json', sha256: 'e6046ab86cf64aeee2518c9fd9654d13f80071c560484fdd4887dbc8c5160861' },
  active: { file: 'native-c1-campaign.save.json', sha256: 'a1d2bfb8fc821621447f05d368252d8b62d79f7fdf5f9893580d4216806e7c34' },
} as const;
type Fixture = keyof typeof fixtures;
const bytes = (kind: Fixture) => readFileSync(`tests/fixtures/space/${fixtures[kind].file}`);
const load = (kind: Fixture) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const baseBytes = readFileSync('tests/fixtures/civilization/native-civic-campaign.save.json');
const baseline = parseGame(baseBytes.toString());
const home = (s: GameState) => {
  const { space: _space, checkpoint: _checkpoint, ...rest } = s;
  return structuredClone(rest);
};
afterEach(() => vi.unstubAllGlobals());

describe('C1 unchanged R2 native exports and historical continuation', () => {
  it.each(['flight', 'active'] as const)('keeps exact %s bytes, checkpoint and complete state across load/export', kind => {
    const original = bytes(kind), raw = JSON.parse(original.toString()).state as GameState;
    expect(hash(original)).toBe(fixtures[kind].sha256);
    const s = parseGame(original.toString()); expect(s).toEqual(raw);
    expect(round(round(s))).toEqual(s); expect(s.checkpoint).toBe(raw.checkpoint);
    expect(Object.hasOwn(s.space!, 'expedition')).toBe(false);
    expect(bytes(kind)).toEqual(original);
  });

  it.each(['flight', 'active'] as const)('preserves the single paid custom model and original B2 in %s', kind => {
    expect(hash(baseBytes)).toBe('03de64ca7924a541205f8d337b76989781573b13b7272b46f17f6e9a72f8e53f');
    const s = load(kind), p = s.space!, ship = p.ship!, blueprint = ship.creation.blueprint;
    expect(s.stage).toBe(5); expect(ship.creation.revision).toBe(1);
    expect(blueprint).toMatchObject({ name: 'Jantarová vážka', color: '#69c9bb' });
    expect(blueprint.parts).toHaveLength(7);
    expect(blueprint.parts.find(part => part.id === 'hull')!.scale).toEqual({ x: 1.5, y: .8, z: 2.1 });
    expect(blueprint.parts.find(part => part.id === 'left')).toMatchObject({ position: { x: -2.2 }, yaw: -25 });
    expect(blueprint.parts.find(part => part.id === 'right')).toMatchObject({ position: { x: 2.2 }, yaw: 25 });
    expect(blueprint.parts.find(part => part.id === 'part-1')).toMatchObject({ kind: 'fin', position: { x: 0, y: 1.5, z: .8 }, scale: { x: .6, y: 1, z: 1 } });
    expect(shipStats(blueprint)).toMatchObject({ cost: 108, health: 115, energy: 105, cargo: 8 });
    expect(ship.purchase).toEqual({ tick: 66244, before: 159.88499999940908, paid: 108, after: 51.884999999409075 });
    expect(ship.purchase.after).toBe(ship.purchase.before - 108);
    expect(ship.id).toBe(`${s.homePlanet!.id}:ship-1`); expect(ship.health).toBe(115);
    expect(s.civilization).toEqual(baseline.civilization); expect(s.lineageHistory).toEqual(baseline.lineageHistory);
    expect(civilizationInheritance(s)).toEqual(civilizationInheritance(baseline));
    expect(s.commerce).toEqual(baseline.commerce); expect(s.military).toEqual(baseline.military); expect(s.maritime).toEqual(baseline.maritime);
    // UI activation upgrades old city account versions with zero new expense ledgers.
    expect(s.cities!.entries).toEqual(baseline.cities!.entries.map(city => ({ ...city,
      economy: { ...city.economy!, version: 5, ledger: { ...city.economy!.ledger, repairs: 0, military: 0 } },
    })));
    expect(s.mobilization).toEqual({ version: 1, activated: null, baselines: [], purchases: [], raids: [], resolved: [] });
    // Real time at the workshop resumes after docking. The later export has one
    // more blocked state turn, while ownership, reserves and all transactions stay intact.
    const accounts = (v: GameState) => v.states!.entries.map(({ last: _last, ...entry }) => entry);
    expect(accounts(s)).toEqual(accounts(baseline));
    expect(s.states!.clock.turn).toBe(kind === 'flight' ? 77 : 78);
    if (kind === 'flight') expect(s.states!.entries.map(entry => entry.last)).toEqual(baseline.states!.entries.map(entry => entry.last));
    else for (const entry of s.states!.entries) expect(entry.last).toMatchObject({ turn: 78, action: null, outcome: 'blocked', transactionId: null });
    const balance = s.machines!.resource, paid = structuredClone(ship);
    expect(buildShip(s, ship.creation)).toBe(false);
    expect(s.machines!.resource).toBe(balance); expect(p.ship).toEqual(paid);
  });

  it('retains the native three-scale flight prefix and the twelve subsequent launch/dock cycles', () => {
    const flight = load('flight').space!, active = load('active').space!;
    expect(flight.location).toEqual({ scale: 'system', systemId: `${flight.homePlanetId}:system`, planetId: flight.homePlanetId,
      pos: { x: 7.052410204659157, y: 0, z: 7.507404411411366 }, heading: Math.PI / 2 });
    expect(flight.leg).toBeNull(); expect(flight.nextSerial).toBe(4);
    expect(flight.log.map(row => [row.from, row.to])).toEqual([['dock', 'surface'], ['surface', 'orbit'], ['orbit', 'system']]);
    expect(active.log.slice(0, 3)).toEqual(flight.log);
    expect(active.log.slice(3, 6).map(row => [row.from, row.to])).toEqual([['system', 'orbit'], ['orbit', 'surface'], ['surface', 'dock']]);
    expect(active.log).toHaveLength(30); expect(active.nextSerial).toBe(31);
    for (let i = 6; i < 30; i += 2) expect(active.log.slice(i, i + 2).map(row => [row.from, row.to])).toEqual([['dock', 'surface'], ['surface', 'dock']]);
    expect(active.location).toBeNull(); expect(active.leg).toBeNull();
    expect(active.ship!.creation).toEqual(flight.ship!.creation); expect(active.ship!.purchase).toEqual(flight.ship!.purchase);
  });

  it.each(['flight', 'active'] as const)('restores the actual older pre-purchase checkpoint from %s without granting a ship', kind => {
    const s = load(kind), cp = JSON.parse(s.checkpoint!) as GameState, restored = recoverGeneration(round(s));
    expect(cp.tick).toBe(66066); expect(cp.stage).toBe(5); expect(cp.space!.ship).toBeNull();
    expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines);
    expect(restored.machines!.resource).toBe(155.76499999940776);
    expect(restored.civilization).toEqual(cp.civilization); expect(restored.lineageHistory).toEqual(cp.lineageHistory);
    expect(round(restored).space!.ship).toBeNull();
  });

  it.each(['flight', 'active'] as const)('supports local save/load and public-import identity changes for %s without replacing paid identity', kind => {
    const s = load(kind), storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => storage.set(key, value), getItem: (key: string) => storage.get(key) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = round(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-rekey'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    const loaded = round(imported);
    expect(loaded.space).toEqual(s.space); expect(loaded.homePlanet).toEqual(s.homePlanet);
    expect(loaded.civilization).toEqual(s.civilization); expect(loaded.lineageHistory).toEqual(s.lineageHistory);
    expect(loaded.machines).toEqual(s.machines);
  });

  it('continues the real in-flight export through public runtime steps and a new checkpoint without advancing home', () => {
    // Unit continuation of immutable played bytes; these fast steps are not native RAF evidence.
    let s = load('flight'); const domestic = home(s), paid = structuredClone(s.space!.ship), prefix = structuredClone(s.space!.log);
    makeCheckpoint(s); const checkpoint = structuredClone(s.space);
    step(s, { ...EMPTY_INPUT, x: 1 }, 1 / 30);
    const recovered = recoverGeneration(round(s));
    expect(recovered.space).toEqual({ ...checkpoint, notice: expect.any(String) }); expect(home(recovered)).toEqual(domestic);
    s = recovered;
    for (const scale of ['orbit', 'surface'] as const) {
      expect(changeSpaceScale(s, 'down')).toBe(true);
      for (let i = 0; i < 92 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30);
      expect(s.space!.location!.scale).toBe(scale); expect(s.space!.leg).toBeNull();
    }
    expect(changeSpaceScale(s, 'down')).toBe(true); expect(inSpace(s)).toBe(false);
    expect(home(s)).toEqual(domestic); expect(s.space!.ship).toEqual(paid);
    expect(s.space!.log.slice(0, 3)).toEqual(prefix); expect(s.space!.log).toHaveLength(6);
    expect(round(s).space).toEqual(s.space);
  });
});

const c2Fixtures = {
  carried: { file: 'native-c2-carried-life.save.json', sha256: '05ff632e1e378ce209cc9308ee4152ecca09a63f6fd114290b0d3c823f92c9b2' },
  active: { file: 'native-c2-campaign.save.json', sha256: '1392669d44ae620b5b89603074aec461ee551745a4f911306733396612bba14c' },
} as const;
type C2Fixture = keyof typeof c2Fixtures;
const c2Bytes = (kind: C2Fixture) => readFileSync(`tests/fixtures/space/${c2Fixtures[kind].file}`);
const c2Load = (kind: C2Fixture) => parseGame(c2Bytes(kind).toString());

describe('C2 unchanged native foreign-life exports', () => {
  it.each(['carried', 'active'] as const)('preserves %s bytes and exact content through import, local load and rekey', kind => {
    const original = c2Bytes(kind), s = parseGame(original.toString());
    expect(hash(original)).toBe(c2Fixtures[kind].sha256); expect(s).toEqual(JSON.parse(original.toString()).state);
    expect(round(s)).toEqual(s);
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => storage.set(key, value), getItem: (key: string) => storage.get(key) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-rekey'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    const loaded = round(imported);
    expect(loaded).toEqual(imported); expect(loaded.space).toEqual(s.space); expect(loaded.homePlanet).toEqual(s.homePlanet);
    expect(c2Bytes(kind)).toEqual(original);
  });

  it.each(['carried', 'active'] as const)('retains one physical cargo and its paid C1 ship, B2 and origin model in %s', kind => {
    const s = c2Load(kind), p = s.space!, e = p.expedition!, c1 = load('active');
    const origin = `${p.homePlanetId}:star-1:planet`, specimen = `${origin}:life-11`;
    expect(e.cargo).toHaveLength(1); expect(e.cargo[0]).toMatchObject({ id: specimen, originPlanetId: origin,
      taxonKey: 'species:gnaw', heading: 1.2000000000000002, health: 100, nutrition: 1 });
    expect(e.worlds[0].life).toHaveLength(35);
    expect(e.worlds.flatMap(world => world.life).filter(life => life.id === specimen)).toEqual([]);
    expect(e.scans).toEqual([{ lifeId: specimen, planetId: origin, at: 53.533333333331576 }]);
    const model = e.worlds[0].designs.find(design => design.species === 'gnaw')!;
    expect(hash(JSON.stringify(model))).toBe('e965fce5a2976203ed2fc40743379d79d88b8d4b7286625082287f827d41f8b8');
    expect(spaceLifeSpecies(e, e.cargo[0])!.genome).toEqual(model.creation.genome);
    expect(p.ship!.creation).toEqual(c1.space!.ship!.creation); expect(p.ship!.purchase).toEqual(c1.space!.ship!.purchase);
    expect(p.log.slice(0, 30)).toEqual(c1.space!.log);
    expect(s.civilization).toEqual(c1.civilization); expect(s.lineageHistory).toEqual(c1.lineageHistory);
    expect(s.cities).toEqual(c1.cities); expect(s.commerce).toEqual(c1.commerce);
    expect(s.military).toEqual(c1.military); expect(s.maritime).toEqual(c1.maritime); expect(s.homePlanet).toEqual(c1.homePlanet);
    expect(e.energySpent).toBe(kind === 'carried' ? 3 : 8);
    expect(e.actions.map(action => action.kind)).toEqual(kind === 'carried' ? ['scan', 'collect'] : ['scan', 'collect', 'release', 'scan', 'collect']);
    expect(e.actions.reduce((sum, action) => sum + action.energyPaid, 0)).toBe(e.energySpent);
    expect(e.actions.every(action => action.lifeId === specimen)).toBe(true);
  });

  it.each(['carried', 'active'] as const)('restores the actual older checkpoint from %s without inventing paid content', kind => {
    const s = c2Load(kind), cp = JSON.parse(s.checkpoint!) as GameState, restored = recoverGeneration(round(s));
    expect(cp.tick).toBe(66066); expect(cp.space!.ship).toBeNull(); expect(cp.space!.location).toBeNull();
    expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines);
    expect(restored.space!.expedition).toEqual({ version: 1, generator: 1, worlds: [], cargo: [], scans: [], actions: [], nextAction: 1, energySpent: 0 });
    expect(restored.civilization).toEqual(cp.civilization); expect(restored.lineageHistory).toEqual(cp.lineageHistory);
    expect(round(restored).space).toEqual(cp.space);
  });

  it('keeps the native outbound history and conserved origin life through rediscovery and docking', () => {
    const a = c2Load('carried'), b = c2Load('active'), ap = a.space!, bp = b.space!, ae = ap.expedition!, be = bp.expedition!;
    expect(a.id).not.toBe(b.id); expect(ap.location).toMatchObject({ scale: 'surface', planetId: ae.worlds[0].id });
    expect(bp.location).toBeNull(); expect(bp.leg).toBeNull(); expect(bp.nextSerial).toBe(61);
    expect(bp.log.slice(0, ap.log.length)).toEqual(ap.log); expect(be.actions.slice(0, 2)).toEqual(ae.actions);
    expect(be.worlds).toHaveLength(2); expect(be.worlds[1].life).toEqual([]);
    expect(be.worlds[0].life).toEqual(ae.worlds[0].life); expect(be.worlds[0].designs).toEqual(ae.worlds[0].designs);
    const identity = ({ pos: _pos, ...item }: typeof ae.cargo[number]) => item;
    expect(identity(be.cargo[0])).toEqual(identity(ae.cargo[0]));
    expect(be.cargo[0].pos).toEqual({ x: 0, z: 0, y: 0.049392002820953525 });
    expect(be.actions.slice(2).every(action => action.planetId === be.worlds[1].id)).toBe(true);
    // The browser exported after ordinary home simulation resumed: these are
    // real 35 domestic ticks and 0.875 amber, not frozen-flight differences.
    expect(b.tick - a.tick).toBe(35); expect(b.machines!.resource - a.machines!.resource).toBeCloseTo(.875, 8);
    expect(b.cities).toEqual(a.cities); expect(b.states!.entries).toEqual(a.states!.entries);
  });

  it('restores a complete new flight checkpoint and returns the carried native animal to the exact frozen home', () => {
    // Public runtime unit continuation of played bytes; this is not extra native RAF proof.
    let s = c2Load('carried'); const domestic = home(s), cargo = structuredClone(s.space!.expedition!.cargo),
      worlds = structuredClone(s.space!.expedition!.worlds), paid = structuredClone(s.space!.ship!.purchase);
    makeCheckpoint(s); const checkpoint = structuredClone(s.space);
    step(s, { ...EMPTY_INPUT, x: 1 }, 1 / 30); s = recoverGeneration(round(s));
    expect(s.space).toEqual({ ...checkpoint, notice: expect.any(String) }); expect(home(s)).toEqual(domestic);
    const finishLeg = () => {
      for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30);
      expect(s.space!.leg).toBeNull();
    };
    for (let i = 0; i < 90; i++) step(s, { ...EMPTY_INPUT, vertical: 1 }, 1 / 30);
    for (const _scale of ['orbit', 'system']) { expect(changeSpaceScale(s, 'up')).toBe(true); finishLeg(); }
    expect(jumpToSystem(s, `${s.space!.homePlanetId}:system`)).toBe(true); finishLeg();
    for (const _scale of ['orbit', 'surface']) { expect(changeSpaceScale(s, 'down')).toBe(true); finishLeg(); }
    expect(changeSpaceScale(s, 'down')).toBe(true); expect(inSpace(s)).toBe(false); expect(home(s)).toEqual(domestic);
    expect(s.space!.ship!.purchase).toEqual(paid); expect(s.space!.expedition!.cargo).toEqual(cargo);
    expect(s.space!.expedition!.worlds[0].life).toEqual(worlds[0].life);
    expect(s.space!.expedition!.worlds[0].designs).toEqual(worlds[0].designs);
    expect(round(s).space).toEqual(s.space);
  });
});
