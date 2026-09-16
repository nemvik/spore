import { describe, expect, it } from 'vitest';
import type { ActiveTribeState, TribeUnit } from '../src/game/era-types';
import { emptyTribe } from '../src/game/era-types';
import { genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import type { GameState } from '../src/game/types';
import type { UnitOrder } from '../src/game/unit-order';
import { createWorld } from '../src/game/world';

type TribeGame = GameState & { tribe: ActiveTribeState };

function member(id: number): TribeUnit {
  const pos = { x: id * 2, y: .8, z: 0 };
  return { id, pos, heading: .25, health: 80, hunger: 37, tool: null, species: null, benefit: null,
    loyalty: 100, cargo: 0, cooldown: .7, orders: [], intent: 'rest',
    navigation: { waypoint: { x: 12, y: .8, z: -8 }, target: { x: 20, y: .8, z: -12 }, rethink: .225 } };
}

/** Explicit incomplete tribe fixture; no assertion of earned campaign progress. */
function fixture(legacy = true): TribeGame {
  const state = createGame(481516, legacy, !legacy, !legacy);
  for (const stage of [1, 2] as const) {
    state.stage = stage; state.world = createWorld(state.seed, stage); state.worlds[stage] = state.world;
    initializeJourneyStage(state);
  }
  for (const kind of ['legs', 'lungs', 'symbiote'] as const) {
    state.player.genome.parts.push({ id: `tribe-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  }
  state.player.totalDna = 300;
  state.player.dna = genomeCost(initialGenome()) + state.player.totalDna - genomeCost(state.player.genome);
  state.player.bonds = [{ species: 'gloom', benefit: 'recycle', loyalty: 78, hunger: 45, age: 130 }];
  Object.assign(state.campaign, { won: true, finale: 'restoration' });
  state.stage = 3;
  state.tribe = {
    version: 2, food: 57.5,
    members: [
      { ...member(1), tool: 'basket', cargo: 4.5, intent: 'forage', orders: [{ unit: 1, kind: 'gather', target: { kind: 'food', id: 999999 } }] },
      { ...member(2), species: 'gloom', benefit: 'recycle', hunger: 88, loyalty: 29, orders: [{ unit: 2, kind: 'build', target: { kind: 'hut', id: 6 } }] },
      { ...member(3), cargo: 5, orders: [{ unit: 3, kind: 'move', target: { kind: 'point', pos: { x: 20, y: .8, z: 12 } } }] },
    ],
    huts: [
      { id: 4, kind: 'shelter', pos: { x: 0, y: .8, z: 0 }, tool: null, progress: 1, health: 100 },
      { id: 5, kind: 'workshop', pos: { x: 8, y: .8, z: 0 }, tool: 'basket', progress: 1, health: 100 },
      { id: 6, kind: 'workshop', pos: { x: -8, y: .8, z: 0 }, tool: 'waterskin', progress: .37, health: 100 },
    ],
    unlocked: ['basket'],
    neighbours: [
      { id: 7, pos: { x: -30, y: .8, z: -20 }, relation: 32, resolved: null, identity: 'garden', health: 160, alarm: 12, tribute: 3, cooldown: .25 },
      { id: 8, pos: { x: 30, y: .8, z: -20 }, relation: -13, resolved: null, identity: 'terrace', health: 220, alarm: 47, tribute: 0, cooldown: 5 },
      { id: 9, pos: { x: 0, y: .8, z: 36 }, relation: 80, resolved: 'allied', identity: 'sanctuary', health: 180, alarm: 0, tribute: 8, cooldown: 0 },
    ],
    legacyAbility: 'restoration', abilityCooldown: 23.2, abilityTime: 2.3, nextId: 10, elapsed: 75.5, completed: false,
  };
  makeCheckpoint(state);
  return state as TribeGame;
}

function corrupt(mutate: (state: Record<string, any>) => void): string {
  const envelope = JSON.parse(serializeGame(fixture()));
  mutate(envelope.state);
  return JSON.stringify(envelope);
}

describe('active tribe save round trips and checkpoints', () => {
  it.each([true, false])('preserves construction, cargo, hungry partner, orders, navigation and inherited ecology (legacy=%s)', legacy => {
    const state = fixture(legacy), source = JSON.stringify(state), loaded = parseGame(serializeGame(state));
    expect(loaded).toEqual(state);
    expect(JSON.stringify(state)).toBe(source);
    expect(loaded.world).toBe(loaded.worlds[2]);
    expect(JSON.parse(loaded.checkpoint!).tribe).toEqual(state.tribe);
    const recovered = recoverGeneration(loaded);
    expect(recovered.tribe).toEqual(state.tribe);
    expect(recovered.world).toBe(recovered.worlds[2]);
    expect(recovered.journey).toEqual(state.journey);
    expect(() => serializeGame(recovered)).not.toThrow();
  });

  it('preserves P0 v1 without activating or adding v2 fields', () => {
    const state: GameState = fixture(); state.tribe = emptyTribe(); makeCheckpoint(state);
    const loaded = parseGame(serializeGame(state));
    expect(loaded).toEqual(state);
    expect(loaded.tribe).toEqual(emptyTribe());
    expect(loaded.tribe).not.toHaveProperty('nextId');
  });

  it.each([1, 2] as const)('rejects preview/active checkpoint version mismatches with live tribe v%i', version => {
    expect(() => parseGame(corrupt(state => {
      const checkpoint = JSON.parse(state.checkpoint);
      if (version === 2) checkpoint.tribe = emptyTribe();
      else state.tribe = emptyTribe();
      state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('checkpoint');
  });

  it('rejects malformed active fields nested inside a checkpoint', () => {
    expect(() => parseGame(corrupt(state => {
      const checkpoint = JSON.parse(state.checkpoint); checkpoint.tribe.members[0].orders[0].unit = 2;
      state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('orders[0].unit');
  });

  it('allows extinction and completed history after extinction to remain recoverable', () => {
    for (const completed of [false, true]) {
      const state = fixture(); state.tribe.members = []; state.deathReason = 'Kmen zanikl.';
      state.tribe.completed = completed;
      if (completed) state.tribe.neighbours.forEach(neighbour => { neighbour.resolved = 'allied'; });
      expect(() => serializeGame(state)).not.toThrow();
    }
  });
});

describe('tribe inheritance and equipment', () => {
  it.each(['restoration', 'predator', 'migration'] as const)('requires matching %s coastal inheritance', finale => {
    const state = fixture(); state.campaign.finale = finale; state.tribe.legacyAbility = finale; makeCheckpoint(state);
    expect(() => serializeGame(state)).not.toThrow();
    state.tribe.legacyAbility = finale === 'restoration' ? 'predator' : 'restoration';
    expect(() => serializeGame(state)).toThrow('legacyAbility');
  });

  it('allows two same-species symbionts only when two actual inherited bonds exist', () => {
    const state = fixture(); state.player.bonds.push({ ...state.player.bonds[0] });
    state.tribe.members[2] = { ...member(3), species: 'gloom', benefit: 'recycle' }; makeCheckpoint(state);
    expect(parseGame(serializeGame(state)).tribe).toEqual(state.tribe);
    state.player.bonds.pop();
    expect(() => serializeGame(state)).toThrow('members[2].species');
  });

  it.each([
    ['unearned partner', (s: Record<string, any>) => { s.tribe.members[1].species = 'lantern'; s.tribe.members[1].benefit = 'light'; }],
    ['wrong benefit', (s: Record<string, any>) => { s.tribe.members[1].benefit = 'shield'; }],
    ['ordinary member with benefit', (s: Record<string, any>) => { s.tribe.members[0].benefit = 'light'; }],
    ['unknown species', (s: Record<string, any>) => { s.tribe.members[1].species = 'invented'; }],
    ['undocumented tool', (s: Record<string, any>) => { s.tribe.members[0].tool = 'axe'; }],
    ['locked tool', (s: Record<string, any>) => { s.tribe.members[0].tool = 'spear'; }],
    ['duplicate unlock', (s: Record<string, any>) => { s.tribe.unlocked.push('basket'); }],
    ['unknown unlock', (s: Record<string, any>) => { s.tribe.unlocked.push('axe'); }],
    ['unfinished workshop', (s: Record<string, any>) => { s.tribe.huts[1].progress = .999; }],
    ['dead workshop', (s: Record<string, any>) => { s.tribe.huts[1].health = 0; }],
    ['missing workshop', (s: Record<string, any>) => { s.tribe.huts.splice(1, 1); }],
    ['workshop without tool', (s: Record<string, any>) => { s.tribe.huts[1].tool = null; }],
    ['shelter with tool', (s: Record<string, any>) => { s.tribe.huts[0].tool = 'basket'; }],
  ] as const)('rejects %s', (_name, mutate) => {
    expect(() => parseGame(corrupt(mutate))).toThrow('state.tribe');
  });

  it('accepts all four tools with a corresponding living completed workshop', () => {
    const state = fixture();
    const tools = ['basket', 'spear', 'drum', 'waterskin'] as const;
    state.tribe.huts = [state.tribe.huts[0], ...tools.map((tool, index) => ({ id: 10 + index, kind: 'workshop' as const, pos: { x: index * 4, y: .8, z: 8 }, tool, progress: 1, health: 100 }))];
    state.tribe.nextId = 14; state.tribe.unlocked = [...tools];
    for (const tool of tools) {
      state.tribe.members[0].tool = tool; makeCheckpoint(state);
      expect(() => serializeGame(state)).not.toThrow();
    }
  });
});

describe('tribe orders', () => {
  it.each([
    ['gather', 'food'], ['attack', 'creature'], ['attack', 'neighbour'], ['attack', 'region'],
    ['build', 'hut'], ['socialize', 'neighbour'], ['socialize', 'region'],
  ] as const)('accepts a stale %s %s target without retargeting or dropping the order', (kind, targetKind) => {
    const state = fixture();
    const order: UnitOrder = { unit: 1, kind, target: { kind: targetKind, id: 999999 } };
    state.tribe.members[0].orders = [order]; makeCheckpoint(state);
    expect((parseGame(serializeGame(state)).tribe as ActiveTribeState).members[0].orders).toEqual([order]);
  });

  it('retains the queue order and accepts the 12-command boundary', () => {
    const state = fixture();
    state.tribe.members[0].orders = Array.from({ length: 12 }, (_, index) => ({ unit: 1, kind: 'move', target: { kind: 'point', pos: { x: index, y: .8, z: 0 - index } } }));
    makeCheckpoint(state);
    expect((parseGame(serializeGame(state)).tribe as ActiveTribeState).members[0].orders).toEqual(state.tribe.members[0].orders);
    state.tribe.members[0].orders.push(state.tribe.members[0].orders[0]);
    expect(() => serializeGame(state)).toThrow('orders');
  });

  it.each([
    ['foreign owner', (o: any) => { o.unit = 2; }],
    ['missing owner', (o: any) => { delete o.unit; }],
    ['negative target', (o: any) => { o.target.id = -1; }],
    ['fractional target', (o: any) => { o.target.id = 1.5; }],
    ['nonfinite target', (o: any) => { o.target.id = Infinity; }],
    ['wrong action target', (o: any) => { o.kind = 'build'; }],
    ['invented kind', (o: any) => { o.kind = 'teleport'; }],
    ['invented target', (o: any) => { o.target.kind = 'planet'; }],
    ['null target', (o: any) => { o.target = null; }],
    ['move needs point', (o: any) => { o.kind = 'move'; }],
    ['point outside play area', (o: any) => { o.kind = 'move'; o.target = { kind: 'point', pos: { x: 77, y: 0, z: 0 } }; }],
    ['point without axis', (o: any) => { o.kind = 'move'; o.target = { kind: 'point', pos: { x: 1, y: 0 } }; }],
  ] as const)('rejects %s', (_name, mutate) => {
    expect(() => parseGame(corrupt(s => mutate(s.tribe.members[0].orders[0])))).toThrow('orders');
  });
});

describe('tribe schema limits', () => {
  it.each(['tribe', 'member', 'order', 'target', 'navigation', 'hut', 'neighbour'] as const)('requires exact %s keys', kind => {
    const at = (s: any): Record<string, any> => kind === 'tribe' ? s.tribe : kind === 'member' ? s.tribe.members[0]
      : kind === 'order' ? s.tribe.members[0].orders[0] : kind === 'target' ? s.tribe.members[0].orders[0].target
        : kind === 'navigation' ? s.tribe.members[0].navigation : kind === 'hut' ? s.tribe.huts[0] : s.tribe.neighbours[0];
    expect(() => parseGame(corrupt(s => { at(s).extra = true; }))).toThrow('state.tribe');
    expect(() => parseGame(corrupt(s => { const obj = at(s); delete obj[Object.keys(obj).at(-1)!]; }))).toThrow('state.tribe');
  });

  it.each([
    ['unknown slice version', (t: any) => { t.version = 3; }],
    ['negative food', (t: any) => { t.food = -1; }],
    ['nonfinite elapsed', (t: any) => { t.elapsed = Infinity; }],
    ['negative ability time', (t: any) => { t.abilityTime = -1; }],
    ['wrong cooldown type', (t: any) => { t.abilityCooldown = '0'; }],
    ['nonboolean completion', (t: any) => { t.completed = 1; }],
    ['premature completion', (t: any) => { t.completed = true; }],
    ['next ID collision', (t: any) => { t.nextId = 9; }],
    ['cross-collection ID collision', (t: any) => { t.huts[0].id = 1; }],
    ['duplicate member ID', (t: any) => { t.members[2].id = 1; t.members[2].orders = []; }],
    ['fractional entity ID', (t: any) => { t.members[0].id = 1.5; }],
    ['invalid health', (t: any) => { t.members[0].health = 101; }],
    ['invalid hunger', (t: any) => { t.members[0].hunger = -1; }],
    ['invalid loyalty', (t: any) => { t.members[0].loyalty = 101; }],
    ['invalid cargo', (t: any) => { t.members[0].cargo = 5.01; }],
    ['invalid intent', (t: any) => { t.members[0].intent = 'fly'; }],
    ['invalid position', (t: any) => { t.members[0].pos.x = Infinity; }],
    ['invalid heading', (t: any) => { t.members[0].heading = null; }],
    ['invalid navigation', (t: any) => { t.members[0].navigation.waypoint.x = 1025; }],
    ['negative rethink timer', (t: any) => { t.members[0].navigation.rethink = -1; }],
    ['invalid building progress', (t: any) => { t.huts[0].progress = 1.001; }],
    ['invalid building health', (t: any) => { t.huts[0].health = -1; }],
    ['invalid neighbour health', (t: any) => { t.neighbours[0].health = 251; }],
    ['invalid relation', (t: any) => { t.neighbours[0].relation = -101; }],
    ['negative tribute', (t: any) => { t.neighbours[0].tribute = -1; }],
    ['invalid neighbour alarm', (t: any) => { t.neighbours[0].alarm = 101; }],
    ['duplicate neighbour identity', (t: any) => { t.neighbours[0].identity = 'terrace'; }],
    ['missing neighbour', (t: any) => { t.neighbours.pop(); }],
    ['extra neighbour', (t: any) => { t.neighbours.push({ ...t.neighbours[0], id: 10 }); t.nextId = 11; }],
    ['unfinished capacity', (t: any) => { t.huts[0].progress = .5; }],
    ['dead capacity', (t: any) => { t.huts[0].health = 0; }],
  ] as const)('rejects %s', (_name, mutate) => {
    expect(() => parseGame(corrupt(s => mutate(s.tribe)))).toThrow('state.tribe');
  });

  it('accepts 12 members with enough completed shelters, and rejects overflow', () => {
    const state = fixture();
    state.tribe.members.push(...Array.from({ length: 9 }, (_, index) => member(10 + index)));
    state.tribe.huts.push(...[19, 20].map(id => ({ id, kind: 'shelter' as const, pos: { x: id, y: .8, z: 0 }, tool: null, progress: 1, health: 100 })));
    state.tribe.nextId = 21; makeCheckpoint(state);
    expect(() => serializeGame(state)).not.toThrow();
    state.tribe.members.push(member(21)); state.tribe.nextId = 22;
    expect(() => serializeGame(state)).toThrow('members');
  });

  it('accepts 24 buildings and rejects overflow', () => {
    const state = fixture();
    state.tribe.huts.push(...Array.from({ length: 21 }, (_, index) => ({ id: index + 10, kind: 'shelter' as const, pos: { x: index, y: .8, z: 0 }, tool: null, progress: 1, health: 100 })));
    state.tribe.nextId = 31; makeCheckpoint(state);
    expect(() => serializeGame(state)).not.toThrow();
    state.tribe.huts.push({ ...state.tribe.huts[0], id: 31 }); state.tribe.nextId = 32;
    expect(() => serializeGame(state)).toThrow('huts');
  });

  it('requires a completed living home even below the member capacity or after extinction', () => {
    for (const count of [0, 1, 2]) {
      expect(() => parseGame(corrupt(s => {
        s.tribe.members = s.tribe.members.slice(0, count);
        s.tribe.huts = s.tribe.huts.filter((hut: { kind: string }) => hut.kind !== 'shelter');
      }))).toThrow('state.tribe.huts');
    }
  });
});
