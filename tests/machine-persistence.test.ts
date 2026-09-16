import { describe, expect, it, vi } from 'vitest';
import { initialVehicle, vehicleStats } from '../src/game/blueprint';
import type { ActiveMachineState, ActiveTribeState, LegacyAbility } from '../src/game/era-types';
import { emptyMachines, emptyTribe } from '../src/game/era-types';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { buildMachine, createMachines, issueMachineOrder, stepMachines } from '../src/game/machines';
import { parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import { createTribe } from '../src/game/tribe';
import type { GameState } from '../src/game/types';
import type { UnitOrder } from '../src/game/unit-order';
import { createWorld } from '../src/game/world';

type MachineGame = GameState & { tribe: ActiveTribeState; machines: ActiveMachineState };

/** Prepared complete coast/tribe, not evidence of earned campaign progression.
 * The actual machine factory adds its collision ring and buildMachine pays for
 * both designs. A prepared owned region unlocks flight; in-flight state tests
 * intentionally prepare cargo and partially completed regional work. */
function fixture(legacy = false, archetype: LegacyAbility = 'restoration'): MachineGame {
  const s = createGame(481516, legacy, !legacy, !legacy);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `machine-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  s.player.health = computeStats(s.player.genome).maxHealth;
  s.player.totalDna = 300; s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  Object.assign(s.campaign, { won: true, finale: archetype });
  s.tribe = createTribe(s); s.tribe.neighbours.forEach(n => { n.resolved = 'allied'; }); s.tribe.completed = true;
  s.stage = 4; s.machines = createMachines(s); const m = s.machines;
  m.resource = 250;
  expect(buildMachine(s, initialVehicle('tank', archetype)).ok).toBe(true);
  Object.assign(m.regions[0], { owner: 'player', method: archetype, soil: 100, settlers: 2, relation: 100, deliveries: 3 });
  m.airUnlocked = true;
  expect(buildMachine(s, initialVehicle('air', archetype)).ok).toBe(true);
  Object.assign(m.regions[1], { soil: 46, settlers: 1, relation: 37, deliveries: 1, alarm: 12.5, cooldown: .6 });
  Object.assign(m.springs[0], { owner: 'player', progress: 1 }); m.springs[1].progress = .37;
  const [tank, air] = m.fleet;
  tank.health -= 3.5; tank.cargo = 1; tank.cooldown = .7; tank.intent = 'work';
  tank.orders = [
    { unit: tank.id, kind: 'gather', target: { kind: 'spring', id: m.springs[1].id } },
    { unit: tank.id, kind: 'build', target: { kind: 'region', id: m.regions[1].id } },
    { unit: tank.id, kind: 'move', target: { kind: 'point', pos: { x: 17, y: .8, z: -6 } } },
  ];
  tank.navigation = { waypoint: { x: 5, y: .8, z: 7 }, target: { ...m.springs[1].pos }, rethink: .225 };
  air.intent = 'return'; air.navigation.rethink = .35;
  m.elapsed = 63.25;
  makeCheckpoint(s); return s as MachineGame;
}

function corrupt(change: (state: Record<string, any>) => void): string {
  const envelope = JSON.parse(serializeGame(fixture())); change(envelope.state); return JSON.stringify(envelope);
}

describe('active machine saves and history', () => {
  it.each([true, false])('preserves paid designs, physical coast, cargo, queues and partial work (legacy=%s)', legacy => {
    const s = fixture(legacy), bytes = JSON.stringify(s), loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s); expect(JSON.stringify(s)).toBe(bytes);
    expect(loaded.world).toBe(loaded.worlds[2]); expect(loaded.worlds).toHaveLength(3);
    expect(JSON.parse(loaded.checkpoint!).machines).toEqual(s.machines);
    const recovered = recoverGeneration(loaded);
    expect(recovered.machines).toEqual(s.machines); expect(recovered.tribe).toEqual(s.tribe);
    expect(recovered.world).toBe(recovered.worlds[2]); expect(recovered.journey).toEqual(s.journey);
    expect(parseGame(serializeGame(recovered))).toEqual(recovered);
  });

  it.each(['restoration', 'predator', 'migration'] as const)('preserves the actual %s factory and deterministic movement after load', archetype => {
    const s = fixture(false, archetype), u = s.machines.fleet[0];
    expect(issueMachineOrder(s, [u.id], 'move', { kind: 'point', pos: { x: 18, y: .8, z: -10 } }).ok).toBe(true);
    for (let i = 0; i < 37; i++) stepMachines(s, 1 / 60);
    const loaded = parseGame(serializeGame(s));
    for (let i = 0; i < 180; i++) { stepMachines(s, 1 / 60); stepMachines(loaded, 1 / 60); }
    expect(loaded).toEqual(s); expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('retains an unactivated historical P0 v1 preview and never manufactures active fields', () => {
    const s: GameState = fixture(); s.machines = emptyMachines(); s.tribe = emptyTribe(); makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s)); expect(loaded).toEqual(s);
    expect(loaded.machines).toEqual(emptyMachines()); expect(loaded.machines).not.toHaveProperty('springs');
  });

  it.each([1, 2] as const)('rejects a preview/active checkpoint mismatch for live v%i', version => {
    expect(() => parseGame(corrupt(s => {
      if (version === 1) s.machines = emptyMachines();
      else { const cp = JSON.parse(s.checkpoint); cp.machines = emptyMachines(); s.checkpoint = JSON.stringify(cp); }
    }))).toThrow('checkpoint');
  });

  it('validates machine fields inside the checkpoint too', () => {
    expect(() => parseGame(corrupt(s => { const cp = JSON.parse(s.checkpoint); cp.machines.fleet[0].cargo = 2; s.checkpoint = JSON.stringify(cp); }))).toThrow('cargo');
  });

  it('allows complete territorial history to survive fleet extinction and remain recoverable', () => {
    const s = fixture();
    s.machines.regions.forEach(r => { r.owner = 'player'; r.method = s.machines.archetype; });
    s.machines.springs.slice(0, 2).forEach(p => { p.owner = 'player'; p.progress = 1; });
    s.machines.completed = true; s.machines.fleet = []; s.deathReason = 'Flotila zanikla.';
    const loaded = parseGame(serializeGame(s)); expect(loaded.machines).toEqual(s.machines);
    expect(recoverGeneration(loaded).machines).toEqual(JSON.parse(s.checkpoint!).machines);
  });

  it('uses a separate world ID domain for the physical barrier', () => {
    const s = fixture(), design = s.machines.blueprints[0], oldId = design.id;
    design.id = s.machines.barrierIds[0]; s.machines.fleet.filter(u => u.blueprint === oldId).forEach(u => { u.blueprint = design.id; });
    s.machines.nextId = Math.max(s.machines.nextId, design.id + 1); makeCheckpoint(s);
    expect(parseGame(serializeGame(s)).machines).toEqual(s.machines);
  });
});

describe('machine relationships and schema', () => {
  it.each([
    ['preview tribe', (s: any) => { s.tribe = emptyTribe(); }],
    ['unfinished tribe', (s: any) => { s.tribe.completed = false; }],
    ['wrong archetype', (s: any) => { s.machines.archetype = 'migration'; s.machines.regions[0].method = 'migration'; }],
    ['missing barrier rock', (s: any) => { s.machines.barrierIds[0] = 999999; }],
    ['barrier points at resource', (s: any) => { s.machines.barrierIds[0] = s.world.resources[0].id; }],
    ['non-rock barrier', (s: any) => { const id = s.machines.barrierIds[0]; for (const world of [s.world, s.worlds[2]]) world.obstacles.find((o: any) => o.id === id).kind = 'tree'; }],
  ] as const)('rejects %s', (_name, change) => { expect(() => parseGame(corrupt(change))).toThrow('state.machines'); });

  it.each(['machines', 'design', 'blueprint', 'part', 'unit', 'order', 'target', 'navigation', 'region', 'spring'] as const)('requires exact %s keys', kind => {
    const at = (s: any) => kind === 'machines' ? s.machines : kind === 'design' ? s.machines.blueprints[0]
      : kind === 'blueprint' ? s.machines.blueprints[0].blueprint : kind === 'part' ? s.machines.blueprints[0].blueprint.parts[0]
        : kind === 'unit' ? s.machines.fleet[0] : kind === 'order' ? s.machines.fleet[0].orders[0]
          : kind === 'target' ? s.machines.fleet[0].orders[0].target : kind === 'navigation' ? s.machines.fleet[0].navigation
            : kind === 'region' ? s.machines.regions[0] : s.machines.springs[0];
    for (const missing of [false, true]) expect(() => parseGame(corrupt(s => {
      const value = at(s); if (missing) delete value[Object.keys(value).at(-1)!]; else value.extra = true;
    }))).toThrow('state.machines');
  });

  it.each([
    ['unknown version', (m: any) => { m.version = 3; }],
    ['negative resource', (m: any) => { m.resource = -1; }],
    ['resource overflow', (m: any) => { m.resource = 1_000_000_001; }],
    ['nonfinite elapsed', (m: any) => { m.elapsed = Infinity; }],
    ['nonboolean completed', (m: any) => { m.completed = 1; }],
    ['nonboolean unlock', (m: any) => { m.airUnlocked = 1; }],
    ['unearned completion', (m: any) => { m.completed = true; }],
    ['next ID collision', (m: any) => { m.nextId = m.fleet[1].id; }],
    ['cross-collection collision', (m: any) => { m.regions[0].id = m.fleet[0].id; }],
    ['duplicate design', (m: any) => { m.blueprints.push(m.blueprints[0]); }],
    ['missing blueprint', (m: any) => { m.fleet[0].blueprint = m.regions[0].id; }],
    ['fractional design ID', (m: any) => { m.blueprints[0].id = 1.5; }],
    ['overhealed machine', (m: any) => { m.fleet[0].health = vehicleStats(m.blueprints[0].blueprint).durability + .01; }],
    ['negative machine health', (m: any) => { m.fleet[0].health = -1; }],
    ['fractional paid cargo', (m: any) => { m.fleet[0].cargo = .5; }],
    ['extra paid cargo', (m: any) => { m.fleet[0].cargo = 2; }],
    ['negative cooldown', (m: any) => { m.fleet[0].cooldown = -1; }],
    ['unknown intent', (m: any) => { m.fleet[0].intent = 'teleport'; }],
    ['nonfinite position', (m: any) => { m.fleet[0].pos.x = Infinity; }],
    ['nonfinite heading', (m: any) => { m.fleet[0].heading = NaN; }],
    ['invalid navigation', (m: any) => { m.fleet[0].navigation.target.z = 1025; }],
    ['negative rethink', (m: any) => { m.fleet[0].navigation.rethink = -1; }],
    ['missing region', (m: any) => { m.regions.pop(); }],
    ['duplicate region identity', (m: any) => { m.regions[0].identity = m.regions[1].identity; }],
    ['ground highlands', (m: any) => { m.regions[2].airOnly = false; }],
    ['air-only gardens', (m: any) => { m.regions[0].airOnly = true; }],
    ['invalid region owner', (m: any) => { m.regions[0].owner = 'enemy'; }],
    ['neutral region with method', (m: any) => { m.regions[1].method = m.archetype; }],
    ['owned region without method', (m: any) => { m.regions[0].method = null; }],
    ['wrong owned method', (m: any) => { m.regions[0].method = 'predator'; }],
    ['region health overflow', (m: any) => { m.regions[0].health = 400.1; }],
    ['region soil overflow', (m: any) => { m.regions[0].soil = 100.1; }],
    ['fractional settlers', (m: any) => { m.regions[0].settlers = 1.5; }],
    ['too many settlers', (m: any) => { m.regions[0].settlers = 3; }],
    ['negative relation', (m: any) => { m.regions[0].relation = -1; }],
    ['fractional deliveries', (m: any) => { m.regions[0].deliveries = 1.5; }],
    ['too many deliveries', (m: any) => { m.regions[0].deliveries = 4; }],
    ['region alarm overflow', (m: any) => { m.regions[0].alarm = 101; }],
    ['missing spring', (m: any) => { m.springs.pop(); }],
    ['spring owner', (m: any) => { m.springs[0].owner = 'enemy'; }],
    ['uncompleted owned spring', (m: any) => { m.springs[0].progress = .99; }],
    ['spring progress overflow', (m: any) => { m.springs[0].progress = 1.01; }],
    ['spring rate below minimum', (m: any) => { m.springs[0].rate = .49; }],
    ['spring rate above maximum', (m: any) => { m.springs[0].rate = 2.01; }],
    ['missing ring segment', (m: any) => { m.barrierIds.pop(); }],
    ['duplicate ring segment', (m: any) => { m.barrierIds[0] = m.barrierIds[1]; }],
    ['noninteger ring ID', (m: any) => { m.barrierIds[0] = 1.5; }],
  ] as const)('rejects %s', (_name, change) => { expect(() => parseGame(corrupt(s => change(s.machines)))).toThrow('state.machines'); });

  it('requires a real owned region for flight and forbids an already built air design before unlock', () => {
    expect(() => parseGame(corrupt(s => { s.machines.regions[0].owner = 'neutral'; s.machines.regions[0].method = null; }))).toThrow('airUnlocked');
    expect(() => parseGame(corrupt(s => { s.machines.airUnlocked = false; }))).toThrow('state.machines');
    expect(() => parseGame(corrupt(s => { s.machines.airUnlocked = false; s.machines.regions[0].owner = 'neutral'; s.machines.regions[0].method = null; }))).toThrow('blueprints');
    const s = fixture(); s.machines.blueprints.pop(); s.machines.fleet.pop(); s.machines.airUnlocked = false;
    s.machines.regions[0].owner = 'neutral'; s.machines.regions[0].method = null; makeCheckpoint(s);
    expect(() => serializeGame(s)).not.toThrow();
    s.machines.regions[0].owner = 'player'; s.machines.regions[0].method = 'restoration';
    expect(() => serializeGame(s)).toThrow('airUnlocked');
  });

  it('requires two owned springs as well as all regions for completed history', () => {
    const s = fixture(); s.machines.regions.forEach(r => { r.owner = 'player'; r.method = 'restoration'; }); s.machines.completed = true;
    expect(() => serializeGame(s)).toThrow('completed');
    Object.assign(s.machines.springs[1], { owner: 'player', progress: 1 }); makeCheckpoint(s);
    expect(() => serializeGame(s)).not.toThrow();
  });
});

describe('machine queues and collection limits', () => {
  it('preserves stale targets, spring/build-region shapes, and all 12 ordered commands', () => {
    const s = fixture(), u = s.machines.fleet[0];
    u.orders = Array.from({ length: 12 }, (_, i): UnitOrder => ({ unit: u.id, kind: i % 2 ? 'build' : 'gather', target: { kind: i % 2 ? 'region' : 'spring', id: 999999 - i } }));
    makeCheckpoint(s); expect((parseGame(serializeGame(s)).machines as ActiveMachineState).fleet[0].orders).toEqual(u.orders);
    u.orders.push(u.orders[0]); expect(() => serializeGame(s)).toThrow('orders');
  });

  it.each([
    ['wrong owner', (o: any) => { o.unit += 1; }],
    ['missing owner', (o: any) => { delete o.unit; }],
    ['unknown action', (o: any) => { o.kind = 'teleport'; }],
    ['wrong target kind for action', (o: any) => { o.kind = 'attack'; }],
    ['negative target', (o: any) => { o.target.id = -1; }],
    ['fractional target', (o: any) => { o.target.id = .5; }],
    ['invented target', (o: any) => { o.target.kind = 'planet'; }],
    ['null target', (o: any) => { o.target = null; }],
    ['out of range destination', (o: any) => { o.kind = 'move'; o.target = { kind: 'point', pos: { x: 77, y: 0, z: 0 } }; }],
  ] as const)('rejects %s', (_name, change) => { expect(() => parseGame(corrupt(s => change(s.machines.fleet[0].orders[0])))).toThrow('orders'); });

  it('accepts eight machines and rejects a ninth without loosening blueprint references', () => {
    const s = fixture(), model = s.machines.fleet[0];
    while (s.machines.fleet.length < 8) s.machines.fleet.push({ ...structuredClone(model), id: s.machines.nextId++, orders: [] });
    makeCheckpoint(s); expect(() => serializeGame(s)).not.toThrow();
    s.machines.fleet.push({ ...structuredClone(model), id: s.machines.nextId++, orders: [] });
    expect(() => serializeGame(s)).toThrow('fleet');
  });

  it('accepts 64 paid design records and rejects the 65th', () => {
    const s = fixture(), blueprint = s.machines.blueprints[0].blueprint;
    while (s.machines.blueprints.length < 64) s.machines.blueprints.push({ id: s.machines.nextId++, blueprint: structuredClone(blueprint) });
    makeCheckpoint(s); expect(() => serializeGame(s)).not.toThrow();
    s.machines.blueprints.push({ id: s.machines.nextId++, blueprint: structuredClone(blueprint) });
    expect(() => serializeGame(s)).toThrow('blueprints');
  });

  it('rejects physically invalid saved designs instead of trusting their computed stats', () => {
    for (const change of [
      (b: any) => { b.parts = b.parts.filter((p: any) => p.kind !== 'hull'); },
      (b: any) => { b.parts = b.parts.filter((p: any) => p.kind !== 'cabin'); },
      (b: any) => { b.parts = b.parts.filter((p: any) => p.kind !== 'tracks'); },
      (b: any) => { b.parts = b.parts.filter((p: any) => p.kind !== 'drill'); },
      (b: any) => { b.parts[0].mirrored = true; },
      (b: any) => { b.parts[0].scale = Infinity; },
      (b: any) => { b.parts[0].id = b.parts[1].id; },
      (b: any) => { b.parts[0].kind = 'filter'; },
      (b: any) => { b.carrier = 'submarine'; },
    ]) expect(() => parseGame(corrupt(s => change(s.machines.blueprints[0].blueprint)))).toThrow('blueprint');
  });

  it('refuses malformed replacement atomically and leaves the caller state and old slot untouched', () => {
    const slots = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => slots.set(key, value), getItem: (key: string) => slots.get(key) ?? null });
    try {
      const s = fixture(); expect(saveGame(s)).toEqual({ ok: true });
      const previous = slots.get(`lumavora:save:${s.id}`);
      s.machines.fleet[0].cargo = 2; const invalidState = JSON.stringify(s);
      expect(saveGame(s)).toMatchObject({ ok: false });
      expect(JSON.stringify(s)).toBe(invalidState); expect(slots.size).toBe(1); expect(slots.get(`lumavora:save:${s.id}`)).toBe(previous);
    } finally { vi.unstubAllGlobals(); }
  });
});
