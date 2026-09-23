import { describe, expect, it } from 'vitest';
import type { ActiveTribeState, ToolId } from '../src/game/era-types';
import { computeStats } from '../src/game/genome';
import { groundHeight, horizontalDistance } from '../src/game/random';
import { createGame } from '../src/game/simulation';
import {
  buildTribeHut, createTribe, equipTribeUnits, issueTribeOrder, memberDiet,
  recruitTribeMember, stepTribe, stopTribeUnits, tribeCapacity, tribeHome,
  tribeReady, TRIBE_COSTS, useTribeAbility,
} from '../src/game/tribe';
import type { Bond, FoodKind, GameState, Vec3 } from '../src/game/types';
import { MAX_UNIT_ORDERS } from '../src/game/unit-order';
import { createWorld, spawnCreature } from '../src/game/world';

type TribeGame = GameState & { tribe: ActiveTribeState };
const DT = 1 / 30;

/** Prepared completed coast isolates tribe behavior, not earned progression.
 * Only initial fixture preparation changes state directly; verified activities
 * use public actions and actual fixed simulation steps. */
function coast(seed = 481516, finale: NonNullable<GameState['campaign']['finale']> = 'restoration', jaw = false, bonds: Bond[] = []): GameState {
  const s = createGame(seed, true);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world;
  }
  if (jaw) s.player.genome.parts = s.player.genome.parts.filter(p => p.kind !== 'filter');
  for (const kind of [...(jaw ? ['jaw'] as const : []), 'legs', 'lungs', 'symbiote'] as const) {
    s.player.genome.parts.push({ id: `tribe-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  }
  s.player.health = computeStats(s.player.genome).maxHealth;
  s.player.bonds = structuredClone(bonds);
  Object.assign(s.campaign, { won: true, finale, drought: .42 });
  return s;
}

function game(seed = 481516, finale: NonNullable<GameState['campaign']['finale']> = 'restoration', jaw = false, bonds: Bond[] = []): TribeGame {
  const s = coast(seed, finale, jaw, bonds);
  // Isolated economy and encounter scenes; authored obstacle routing is covered
  // independently in unit-motion.test.ts and the deterministic scene below.
  s.world.obstacles = []; s.world.resources = []; s.world.creatures = [];
  s.tribe = createTribe(s); s.stage = 3;
  // Isolate the original player-economy cases from competing NPC harvests.
  // Active scarcity/competition is covered in tribe-society.test.ts.
  for(const n of s.tribe.neighbours){n.society!.food=48;n.society!.recruitCooldown=120;for(const u of n.society!.members)u.hunger=0;}
  return s as TribeGame;
}

function at(s: TribeGame, x: number, z: number): Vec3 {
  const home = tribeHome(s.tribe);
  return { x: home.x + x, y: groundHeight(home.x + x, home.z + z, 2) + .8, z: home.z + z };
}
function food(s: TribeGame, kind: FoodKind, amount = 4, pos = at(s, 13, 0)) {
  const r = { id: s.world.nextId++, kind, amount, max: amount, pos, patch: 0, regen: 0 };
  s.world.resources.push(r); return r;
}
function runUntil(s: TribeGame, done: () => boolean, seconds = 60) {
  for (let tick = 0; tick < seconds / DT && !done(); tick++) stepTribe(s, DT);
  expect(done(), `Condition not reached after ${seconds}s of actual tribe simulation`).toBe(true);
}
function workshop(s: TribeGame, tool: ToolId) {
  const ids = s.tribe.members.map(u => u.id);
  expect(buildTribeHut(s, 'workshop', tool, at(s, 9, 0), ids).ok).toBe(true);
  runUntil(s, () => s.tribe.unlocked.includes(tool), 25);
}

describe('tribe ancestry and food transport', () => {
  it.each(['restoration', 'predator', 'migration'] as const)('inherits %s and real partner identities without rewriting the coast', finale => {
    const bonds: Bond[] = [
      { species: 'gloom', benefit: 'recycle', hunger: 48, loyalty: 73, age: 90 },
      { species: 'mender', benefit: 'shield', hunger: 19, loyalty: 61, age: 30 },
    ];
    const s = coast(481516, finale, false, bonds), before = structuredClone(s);
    const t = createTribe(s);
    expect(s).toEqual(before);
    expect(t.version).toBe(2); expect(t.legacyAbility).toBe(finale);
    expect(t.members.filter(u => u.species === null)).toHaveLength(3);
    for (const b of bonds) expect(t.members.find(u => u.species === b.species)).toMatchObject({
      species: b.species, benefit: b.benefit, hunger: b.hunger, loyalty: b.loyalty,
    });
    expect(new Set([...t.members, ...t.huts, ...t.neighbours].map(x => x.id)).size).toBe(t.members.length + t.huts.length + t.neighbours.length);
  });

  it('depletes physical food, carries it home, and credits the stock only on delivery', () => {
    const s = game(), u = s.tribe.members[0], r = food(s, 'algae');
    const stock = s.tribe.food, dna = s.player.dna, harvested = s.world.patches[0].harvested;
    expect(issueTribeOrder(s, [u.id], 'gather', { kind: 'food', id: r.id }).ok).toBe(true);
    runUntil(s, () => u.cargo > 0, 12);
    expect(r.amount).toBeLessThan(r.max);
    expect(s.tribe.food).toBe(stock);
    expect(horizontalDistance(u.pos, tribeHome(s.tribe))).toBeGreaterThan(4);
    runUntil(s, () => r.amount === 0 && u.cargo === 0, 30);
    expect(s.tribe.food).toBe(stock + 16);
    expect(s.world.patches[0].harvested - harvested).toBe(4);
    expect(s.player.dna).toBe(dna);
    for (let i = 0; i < 120; i++) stepTribe(s, DT);
    expect(r.amount).toBe(0); expect(s.tribe.food).toBe(stock + 16);
  });

  it('returns a partially filled load after an explicit stop instead of destroying it', () => {
    const s = game(), u = s.tribe.members[0], r = food(s, 'detritus', 1);
    const stock = s.tribe.food;
    issueTribeOrder(s, [u.id], 'gather', { kind: 'food', id: r.id });
    runUntil(s, () => u.cargo === 1, 12);
    expect(stopTribeUnits(s, [u.id]).ok).toBe(true);
    runUntil(s, () => u.cargo === 0, 12);
    expect(s.tribe.food).toBe(stock + 4);
  });

  it('lets a hungry gatherer secure food for an empty camp instead of oscillating at its edge', () => {
    const s = game(), u = s.tribe.members[0], r = food(s, 'algae', 4, at(s, 13, 0));
    s.tribe.food = 0; u.hunger = 69;
    expect(issueTribeOrder(s, [u.id], 'gather', { kind: 'food', id: r.id }).ok).toBe(true);
    runUntil(s, () => u.cargo > 0, 15);
    expect(horizontalDistance(u.pos, tribeHome(s.tribe))).toBeGreaterThan(10);
    runUntil(s, () => u.hunger < 60 && s.tribe.food > 0, 20);
    expect(r.amount).toBeLessThan(r.max); expect(u.health).toBeGreaterThan(0);
    expect(s.deathReason).toBeNull();
  });

  it('does not let competing gatherers overdraw the last physical portion', () => {
    const s = game(), r = food(s, 'detritus', 1), stock = s.tribe.food;
    expect(issueTribeOrder(s, s.tribe.members.map(u => u.id), 'gather', { kind: 'food', id: r.id }).ok).toBe(true);
    runUntil(s, () => r.amount === 0 && s.tribe.members.every(u => u.cargo === 0), 30);
    expect(r.amount).toBe(0); expect(s.tribe.food).toBe(stock + 4);
  });

  it('makes an earned basket carry a larger physical load before its first delivery', () => {
    const s = game(); s.tribe.food = 100;
    workshop(s, 'basket');
    const u = s.tribe.members[0], r = food(s, 'algae', 5, at(s, 20, 0));
    expect(equipTribeUnits(s, [u.id], 'basket').ok).toBe(true);
    const stock = s.tribe.food;
    expect(issueTribeOrder(s, [u.id], 'gather', { kind: 'food', id: r.id }).ok).toBe(true);
    runUntil(s, () => u.cargo === 5, 25);
    expect(r.amount).toBe(0); expect(s.tribe.food).toBe(stock);
    runUntil(s, () => u.cargo === 0, 20);
    expect(s.tribe.food).toBe(stock + 20);
  });

  it('enforces inherited diets at order acceptance and prevents filter-lineage hunting', () => {
    const filter = game(), hunter = game(481516, 'predator', true);
    for (const s of [filter, hunter]) {
      const algae = food(s, 'algae'), meat = food(s, 'meat'), nectar = food(s, 'nectar');
      const id = s.tribe.members[0].id;
      expect(issueTribeOrder(s, [id], 'gather', { kind: 'food', id: algae.id }).ok).toBe(s === filter);
      expect(issueTribeOrder(s, [id], 'gather', { kind: 'food', id: meat.id }).ok).toBe(s === hunter);
      const before = structuredClone(s);
      expect(issueTribeOrder(s, [id], 'gather', { kind: 'food', id: nectar.id }).ok).toBe(false);
      expect(s).toEqual(before);
      const prey = spawnCreature(s.world, 'gloom', 0); s.world.creatures.push(prey);
      expect(issueTribeOrder(s, [id], 'attack', { kind: 'creature', id: prey.id }).ok).toBe(s === hunter);
    }
  });

  it('keeps a partner species diet and independent hunger rather than the host diet', () => {
    const s = game(481516, 'migration', true, [{ species: 'gloom', benefit: 'recycle', hunger: 48, loyalty: 73, age: 9 }]);
    const partner = s.tribe.members.find(u => u.species === 'gloom')!;
    const own = s.tribe.members.find(u => u.species === null)!, nectar = food(s, 'nectar');
    expect(memberDiet(s, partner)).toContain('nectar'); expect(memberDiet(s, own)).not.toContain('nectar');
    expect(issueTribeOrder(s, [partner.id], 'gather', { kind: 'food', id: nectar.id }).ok).toBe(true);
    expect(issueTribeOrder(s, [own.id], 'gather', { kind: 'food', id: nectar.id }).ok).toBe(false);
    const bond = structuredClone(s.player.bonds[0]);
    for (let i = 0; i < 90; i++) stepTribe(s, DT);
    expect(partner.hunger).not.toBe(bond.hunger);
    expect(s.player.bonds[0]).toEqual(bond);
  });

  it('turns an actual hunt into collectible meat instead of immediately minting food or DNA', () => {
    const s = game(481516, 'predator', true), u = s.tribe.members[0];
    const prey = spawnCreature(s.world, 'gloom', 0);
    prey.pos = at(s, 13, 0); prey.health = 3; s.world.creatures.push(prey);
    const stock = s.tribe.food, dna = s.player.dna, hunted = s.world.patches[0].hunted;
    expect(issueTribeOrder(s, [u.id], 'attack', { kind: 'creature', id: prey.id }).ok).toBe(true);
    runUntil(s, () => !s.world.creatures.some(c => c.id === prey.id), 20);
    const meat = s.world.resources.find(r => r.kind === 'meat')!;
    expect(meat).toBeDefined(); expect(meat.amount).toBeGreaterThan(0);
    expect(meat.pos).toEqual(prey.pos);
    expect(s.tribe.food).toBe(stock); expect(s.player.dna).toBe(dna);
    expect(s.world.patches[0].hunted - hunted).toBe(1);
    const portions = meat.amount;
    expect(issueTribeOrder(s, [u.id], 'gather', { kind: 'food', id: meat.id }).ok).toBe(true);
    runUntil(s, () => meat.amount === 0 && u.cargo === 0, 45);
    expect(s.tribe.food).toBe(stock + portions * 4); expect(s.player.dna).toBe(dna);
  });
});

describe('paid construction, equipment and population', () => {
  it('requires paid completed construction before equipping and never refunds a remove/re-equip cycle', () => {
    const s = game(); s.tribe.food = 100;
    const ids = s.tribe.members.map(u => u.id), pos = at(s, 9, 0);
    const before = structuredClone(s);
    expect(equipTribeUnits(s, ids, 'drum').ok).toBe(false); expect(s).toEqual(before);
    expect(buildTribeHut(s, 'workshop', 'drum', pos, ids).ok).toBe(true);
    const hut = s.tribe.huts.at(-1)!;
    expect(s.tribe.food).toBe(100 - TRIBE_COSTS.workshop); expect(hut.progress).toBe(0);
    expect(equipTribeUnits(s, ids, 'drum').ok).toBe(false);
    runUntil(s, () => hut.progress === 1, 25);
    expect(equipTribeUnits(s, ids, 'drum').ok).toBe(true);
    const equippedStock = s.tribe.food;
    expect(equippedStock).toBe(100 - TRIBE_COSTS.workshop - ids.length * TRIBE_COSTS.equip);
    expect(equipTribeUnits(s, ids, 'drum').ok).toBe(true); expect(s.tribe.food).toBe(equippedStock);
    expect(equipTribeUnits(s, ids, null).ok).toBe(true); expect(s.tribe.food).toBe(equippedStock);
    expect(equipTribeUnits(s, ids, 'drum').ok).toBe(true);
    expect(s.tribe.food).toBe(equippedStock - ids.length * TRIBE_COSTS.equip);
  });

  it('rejects blocked, overlapping, distant and unaffordable construction atomically', () => {
    const s = game(), ids = s.tribe.members.map(u => u.id);
    const blocked = at(s, 12, 0);
    s.world.obstacles.push({ id: 999, kind: 'rock', pos: blocked, radius: 3, height: 5 });
    for (const pos of [blocked, tribeHome(s.tribe), at(s, 30, 0), { ...at(s, 9, 0), x: NaN }]) {
      const before = structuredClone(s);
      expect(buildTribeHut(s, 'shelter', null, pos, ids).ok).toBe(false); expect(s).toEqual(before);
    }
    s.tribe.food = 0; const before = structuredClone(s);
    expect(buildTribeHut(s, 'shelter', null, at(s, -9, 0), ids).ok).toBe(false); expect(s).toEqual(before);
  });

  it('requires completed shelters, charges recruits, and caps the tribe at twelve', () => {
    const s = game(); s.tribe.food = 500;
    const ids = s.tribe.members.map(u => u.id), initialCapacity = tribeCapacity(s.tribe);
    for (const x of [9, -9]) {
      const oldCapacity = tribeCapacity(s.tribe);
      expect(buildTribeHut(s, 'shelter', null, at(s, x, 0), ids).ok).toBe(true);
      expect(tribeCapacity(s.tribe)).toBe(oldCapacity);
      const hut = s.tribe.huts.at(-1)!; runUntil(s, () => hut.progress === 1, 25);
    }
    expect(initialCapacity).toBeLessThan(12); expect(tribeCapacity(s.tribe)).toBe(12);
    while (s.tribe.members.length < 12) {
      const stock = s.tribe.food, count = s.tribe.members.length;
      expect(recruitTribeMember(s).ok).toBe(true);
      expect(s.tribe.food).toBe(stock - TRIBE_COSTS.recruit); expect(s.tribe.members).toHaveLength(count + 1);
    }
    const before = structuredClone(s);
    expect(recruitTribeMember(s).ok).toBe(false); expect(s).toEqual(before);
    expect(new Set(s.tribe.members.map(u => u.id)).size).toBe(12);
  });

  it('rejects unaffordable recruitment without consuming an ID or creating a member', () => {
    const s = game(); s.tribe.food = TRIBE_COSTS.recruit - 1;
    const before = structuredClone(s);
    expect(recruitTribeMember(s).ok).toBe(false); expect(s).toEqual(before);
  });
});

describe('tribe conflict, diplomacy and inherited abilities', () => {
  it.each([['socialize', 'drum', 'allied'], ['attack', 'spear', 'conquered']] as const)('can resolve all three real neighbours through %s', (kind, tool, resolution) => {
    const s = game(481516, 'predator'); s.tribe.food = 250;
    workshop(s, tool);
    expect(equipTribeUnits(s, s.tribe.members.map(u => u.id), tool).ok).toBe(true);
    for (const neighbour of s.tribe.neighbours) {
      expect(tribeReady(s)).toBe(false);
      const ids = s.tribe.members.map(u => u.id);
      expect(issueTribeOrder(s, ids, kind, { kind: 'neighbour', id: neighbour.id }).ok).toBe(true);
      runUntil(s, () => neighbour.resolved !== null, 90);
      expect(neighbour.resolved).toBe(resolution);
      expect(s.tribe.members.length).toBeGreaterThan(0);
      const before = structuredClone(s);
      expect(issueTribeOrder(s, ids.filter(id => s.tribe.members.some(u => u.id === id)), kind, { kind: 'neighbour', id: neighbour.id }).ok).toBe(false);
      expect(s).toEqual(before);
    }
    expect(tribeReady(s)).toBe(true); expect(s.tribe.completed).toBe(true);
    expect(s.deathReason).toBeNull();
  });

  it('does not charge or resolve a diplomatic meeting before the visitor arrives', () => {
    const s = game(), n = s.tribe.neighbours[0], stock = s.tribe.food, relation = n.relation;
    issueTribeOrder(s, [s.tribe.members[0].id], 'socialize', { kind: 'neighbour', id: n.id });
    stepTribe(s, DT);
    expect(s.tribe.food).toBe(stock); expect(n.relation).toBe(relation); expect(n.tribute).toBe(0);
    expect(n.resolved).toBeNull();
  });

  it.each(['restoration', 'predator', 'migration'] as const)('gives %s a physical effect and prevents free repeated activation', finale => {
    const s = game(481516, finale), u = s.tribe.members[0], n = s.tribe.neighbours[0];
    const r = food(s, 'algae', 5, { ...u.pos }); r.amount = 1;
    u.hunger = 45; u.health = 55; n.pos = { ...u.pos }; n.alarm = 10;
    const stock = s.tribe.food;
    expect(useTribeAbility(s, [u.id]).ok).toBe(true);
    expect(s.tribe.food).toBe(stock - TRIBE_COSTS.ability);
    if (finale === 'restoration') expect(r.amount).toBeGreaterThan(1);
    if (finale === 'predator') expect(n.alarm).toBe(0);
    if (finale === 'migration') { expect(u.health).toBeGreaterThan(55); expect(u.hunger).toBeLessThan(45); expect(n.relation).toBeGreaterThan(0); }
    const before = structuredClone(s);
    expect(useTribeAbility(s, [u.id]).ok).toBe(false); expect(s).toEqual(before);
  });

  it('keeps the tribe alive with one survivor, but ends it when the last hungry member dies', () => {
    const s = game(); s.tribe.food = 0;
    for (const [index, u] of s.tribe.members.entries()) {
      u.pos = at(s, 20 + index * 2, 0); u.health = index === 0 ? 100 : .01; u.hunger = index === 0 ? 8 : 100;
    }
    stepTribe(s, DT);
    expect(s.tribe.members).toHaveLength(1); expect(s.deathReason).toBeNull();
    const survivor = s.tribe.members[0]; survivor.health = .01; survivor.hunger = 100;
    stepTribe(s, DT);
    expect(s.tribe.members).toHaveLength(0); expect(s.deathReason).toBeTruthy(); expect(tribeReady(s)).toBe(false);
  });
});

describe('orders and deterministic tribe simulation', () => {
  it('executes an appended destination after reaching the first one', () => {
    const s = game(), u = s.tribe.members[0], first = at(s, 13, 0), second = at(s, 13, 12);
    expect(issueTribeOrder(s, [u.id], 'move', { kind: 'point', pos: first }).ok).toBe(true);
    expect(issueTribeOrder(s, [u.id], 'move', { kind: 'point', pos: second }, true).ok).toBe(true);
    expect(u.orders).toHaveLength(2);
    runUntil(s, () => u.orders.length === 1, 20);
    expect(horizontalDistance(u.pos, first)).toBeLessThanOrEqual(.55);
    expect(horizontalDistance(u.pos, second)).toBeGreaterThan(10);
    runUntil(s, () => u.orders.length === 0, 20);
    expect(horizontalDistance(u.pos, second)).toBeLessThanOrEqual(.55);
  });

  it('rejects stale units, incompatible targets, invalid destinations and full queues without partial changes', () => {
    const s = game(), u = s.tribe.members[0], target = { kind: 'point' as const, pos: at(s, 12, 0) };
    for (const attempt of [
      () => issueTribeOrder(s, [u.id, 999999], 'move', target),
      () => issueTribeOrder(s, [u.id], 'attack', target),
      () => issueTribeOrder(s, [u.id], 'move', { kind: 'point', pos: { x: 77, y: 0, z: 0 } }),
      () => issueTribeOrder(s, [u.id], 'gather', { kind: 'food', id: 999999 }),
    ]) { const before = structuredClone(s); expect(attempt().ok).toBe(false); expect(s).toEqual(before); }
    for (let i = 0; i < MAX_UNIT_ORDERS; i++) expect(issueTribeOrder(s, [u.id], 'move', target, true).ok).toBe(true);
    const before = structuredClone(s);
    expect(issueTribeOrder(s, [u.id], 'move', target, true).ok).toBe(false); expect(s).toEqual(before);
  });

  it.each([481516, 20260913, 8675309])('replays seed %i with stable per-unit results despite storage/selection order', seed => {
    const first = coast(seed); first.tribe = createTribe(first); first.stage = 3;
    const a = first as TribeGame, b = structuredClone(a);
    b.tribe.members.reverse(); b.tribe.neighbours.reverse();
    const ids = a.tribe.members.map(u => u.id), target = { kind: 'point' as const, pos: { x: 22, y: 0, z: -12 } };
    expect(issueTribeOrder(a, ids, 'move', target).ok).toBe(true);
    expect(issueTribeOrder(b, [...ids].reverse(), 'move', target).ok).toBe(true);
    for (let i = 0; i < 600; i++) { stepTribe(a, DT); stepTribe(b, DT); }
    const canonical = (s: TribeGame) => ({ ...s.tribe, members: [...s.tribe.members].sort((x, y) => x.id - y.id), neighbours: [...s.tribe.neighbours].sort((x, y) => x.id - y.id) });
    expect(canonical(b)).toEqual(canonical(a)); expect(b.world).toEqual(a.world);
    expect(a.tribe.members.some(u => horizontalDistance(u.pos, tribeHome(a.tribe)) > 5)).toBe(true);
  });
});
