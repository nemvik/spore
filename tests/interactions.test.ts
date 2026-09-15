import { describe, expect, it } from 'vitest';
import { bondTarget, feedTarget, lineBlocked, tendTarget } from '../src/game/interactions';
import { cloneGenome, functionalProfile, initialGenome } from '../src/game/genome';
import { mouthWorldPosition } from '../src/game/locomotion';
import { organismGroundClearance } from '../src/game/anatomy';
import { createGame, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { EMPTY_INPUT } from '../src/game/types';
import type { AdaptationId, FoodKind, GameState, Stage, Vec3 } from '../src/game/types';

// Prepared unit encounters exercise ordinary public step/actions, not campaign progression.
function scenario(stage: Stage = 1, kinds: AdaptationId[] = []): GameState {
  const s = createGame(481516);
  s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
  s.world.resources = []; s.world.creatures = []; s.world.obstacles = [];
  s.world.patches.forEach(patch => { patch.discovered = true; });
  s.player.genome = initialGenome();
  if (kinds.includes('jaw')) s.player.genome.parts = s.player.genome.parts.filter(part => part.kind !== 'filter');
  for (const kind of [...(stage === 2 ? ['legs', 'lungs'] as const : []), ...kinds]) {
    s.player.genome.parts.push({ id: `scenario-${kind}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false });
  }
  s.player.pos = { x: 0, y: stage === 2 ? organismGroundClearance(s.player.genome) : stage === 0 ? 1.1 : 0, z: 0 };
  s.player.heading = 0; s.player.velocity = { x: 0, y: 0, z: 0 };
  s.player.energy = 70; s.player.cooldown = 0; s.player.invulnerable = 5;
  return s;
}
const mouth = (s: GameState) => mouthWorldPosition(functionalProfile(s.player.genome), s.player.pos, s.player.heading);
function food(s: GameState, pos: Vec3, kind: FoodKind = 'algae') {
  const item = { id: s.world.nextId++, pos, kind, amount: 5, max: 8, regen: 0, patch: 0 };
  s.world.resources.push(item); return item;
}
function creature(s: GameState, pos: Vec3, species = s.stage === 0 ? 'lantern' : s.stage === 2 ? 'gloom' : 'mender') {
  const item = spawnCreature(s.world, species, 0);
  Object.assign(item, { pos, velocity: { x: 0, y: 0, z: 0 }, health: 100, cooldown: 20, hunger: 0, intent: 'rest' });
  s.world.creatures.push(item); return item;
}
function obstacle(s: GameState, x: number, z: number, radius = .45) {
  s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x, y: -6, z }, radius, height: 20 });
}
function spring(s: GameState, id: string, pos: Vec3, charge = 0) {
  const item = { id, kind: 'spring' as const, name: id, pos, charge };
  s.world.landmarks.push(item); return item;
}
function perform(s: GameState, action: 'feed' | 'bond' | 'tend') {
  const control = structuredClone(s);
  step(control, EMPTY_INPUT); step(s, { ...EMPTY_INPUT, [action]: true });
  return control;
}

describe('feeding projection and actual action', () => {
  it('consumes exactly the highlighted compatible food and leaves a nearer incompatible food intact', () => {
    const s = scenario(), origin = mouth(s);
    const incompatible = food(s, { ...origin, x: origin.x + 1 }, 'nectar');
    const edible = food(s, { ...origin, x: origin.x + 2 });
    expect(feedTarget(s)).toMatchObject({ id: edible.id, kind: 'food', ready: true });
    const control = perform(s, 'feed');
    expect(edible.amount).toBe(4); expect(incompatible.amount).toBe(5);
    expect(s.player.energy - control.player.energy).toBeCloseTo(17);
    expect(s.player.meals).toBe(1);
  });

  it('attacks the projected prey with a jaw and does not consume a more distant meal', () => {
    const s = scenario(1, ['jaw']), origin = mouth(s);
    const prey = creature(s, { ...origin, x: origin.x + 1.5 });
    const edible = food(s, { ...origin, x: origin.x + 3 }, 'detritus');
    expect(feedTarget(s)).toMatchObject({ id: prey.id, kind: 'prey', ready: true });
    const control = perform(s, 'feed');
    expect(prey.health).toBeLessThan(100); expect(edible.amount).toBe(5);
    expect(s.player.energy - control.player.energy).toBeCloseTo(-1.6);
  });

  it('shows diet rejection when only incompatible food is nearby and cannot harvest it', () => {
    const s = scenario(), edible = food(s, mouth(s), 'nectar');
    expect(feedTarget(s)).toMatchObject({ id: edible.id, ready: false, reason: 'diet' });
    const control = perform(s, 'feed');
    expect(edible.amount).toBe(5); expect(s.player.meals).toBe(0);
    expect(s.player.energy).toBe(control.player.energy);
  });

  it('selects a reachable meal instead of a slightly nearer meal behind terrain', () => {
    const s = scenario(), origin = mouth(s);
    const blocked = food(s, { ...origin, z: origin.z + 2.4 });
    const reachable = food(s, { ...origin, x: origin.x + 3 });
    obstacle(s, origin.x, origin.z + 1.2);
    expect(feedTarget(s)).toMatchObject({ id: reachable.id, ready: true });
    perform(s, 'feed');
    expect(reachable.amount).toBe(4); expect(blocked.amount).toBe(5);
  });

  it('reports a nearby compatible blocked meal correctly even when distant compatible food exists', () => {
    const s = scenario(), origin = mouth(s);
    const blocked = food(s, { ...origin, z: origin.z + 2.4 });
    food(s, { ...origin, x: origin.x + 40 });
    obstacle(s, origin.x, origin.z + 1.2);
    expect(feedTarget(s)).toMatchObject({ id: blocked.id, ready: false, reason: 'blocked' });
    perform(s, 'feed'); expect(blocked.amount).toBe(5);
  });

  it('lets an exhausted predator eat ready detritus instead of selecting an unaffordable attack', () => {
    const s = scenario(1, ['jaw']), origin = mouth(s); s.player.energy = 1;
    const prey = creature(s, { ...origin, x: origin.x + 1 });
    const edible = food(s, { ...origin, x: origin.x + 2.5 }, 'detritus');
    expect(feedTarget(s)).toMatchObject({ id: edible.id, ready: true });
    perform(s, 'feed');
    expect(edible.amount).toBe(4); expect(prey.health).toBe(100); expect(s.player.energy).toBeGreaterThan(17);
  });

  it.each([['above', 1], ['below', -1]] as const)('reports food %s and permits it after actually swimming to its depth', (reason, direction) => {
    const s = scenario(); s.player.pos.y = 4;
    const origin = mouth(s), edible = food(s, { ...origin, y: origin.y + direction * 6 });
    expect(feedTarget(s)).toMatchObject({ id: edible.id, ready: false, reason });
    for (let i = 0; i < 40; i++) step(s, { ...EMPTY_INPUT, vertical: direction });
    expect(feedTarget(s)).toMatchObject({ id: edible.id, ready: true });
    perform(s, 'feed'); expect(edible.amount).toBe(4);
  });

  it('changes the reachable feeding area when the same organ is moved along the body', () => {
    const front = scenario(), rear = scenario(), origin = mouth(front);
    rear.player.genome = cloneGenome(rear.player.genome); rear.player.genome.parts[1].axial = -.92;
    const a = food(front, { x: 0, y: origin.y, z: 5 });
    const b = food(rear, { ...a.pos });
    expect(feedTarget(front)?.ready).toBe(true);
    expect(feedTarget(rear)).toMatchObject({ id: b.id, ready: false, reason: 'distance' });
    perform(front, 'feed'); perform(rear, 'feed');
    expect(a.amount).toBe(4); expect(b.amount).toBe(5);
  });

  it('does not let an anatomical mouth protruding beyond a thin wall eat through that wall', () => {
    const s = scenario(), origin = mouth(s);
    const edible = food(s, { ...origin, z: origin.z + 2 });
    obstacle(s, 0, 1.1, .2); // Clear of the player's .8 body radius, but between body and mouth.
    expect(feedTarget(s)).toMatchObject({ id: edible.id, ready: false, reason: 'blocked' });
    perform(s, 'feed'); expect(edible.amount).toBe(5);
  });
});

describe('partner and restoration projection', () => {
  it('bonds with the highlighted partner and charges exactly the shared action price', () => {
    const s = scenario(1, ['symbiote']); s.player.energy = 25.5;
    const partner = creature(s, { ...s.player.pos, x: 4 });
    expect(bondTarget(s)).toMatchObject({ id: partner.id, ready: true });
    const control = perform(s, 'bond');
    expect(s.player.bonds).toHaveLength(1); expect(s.world.creatures.some(c => c.id === partner.id)).toBe(false);
    expect(s.player.energy - control.player.energy).toBeCloseTo(-25);
  });

  it.each(['symbiote', 'energy', 'capacity'] as const)('blocks bonding for %s in both projection and simulation', reason => {
    const s = scenario(1, reason === 'symbiote' ? [] : ['symbiote']);
    const partner = creature(s, { ...s.player.pos, x: 3 });
    if (reason === 'energy') s.player.energy = 24;
    if (reason === 'capacity') s.player.bonds = Array.from({ length: 2 }, () => ({ species: 'mender', loyalty: 65, hunger: 10, benefit: 'shield', age: 10 }));
    const previousCount = s.player.bonds.length;
    expect(bondTarget(s)).toMatchObject({ id: partner.id, ready: false, reason });
    perform(s, 'bond');
    expect(s.player.bonds).toHaveLength(previousCount); expect(s.world.creatures.some(c => c.id === partner.id)).toBe(true);
  });

  it('finds a reachable partner when the nearest partner is behind terrain', () => {
    const s = scenario(1, ['symbiote']);
    const blocked = creature(s, { ...s.player.pos, x: 4 });
    const reachable = creature(s, { ...s.player.pos, z: 5 });
    obstacle(s, 2, 0);
    expect(bondTarget(s)).toMatchObject({ id: reachable.id, ready: true });
    perform(s, 'bond');
    expect(s.world.creatures.some(c => c.id === blocked.id)).toBe(true);
    expect(s.world.creatures.some(c => c.id === reachable.id)).toBe(false);
  });

  it('restores the projected reachable resource instead of a blocked nearer resource', () => {
    const s = scenario();
    const blocked = food(s, { ...s.player.pos, x: 4 });
    const reachable = food(s, { ...s.player.pos, z: 5 });
    obstacle(s, 2, 0);
    expect(tendTarget(s)).toMatchObject({ id: reachable.id, ready: true });
    const control = perform(s, 'tend');
    expect(s.player.energy - control.player.energy).toBeCloseTo(-10);
    expect(reachable.amount).toBeGreaterThan(5);
    // Nutrients restore the whole patch, not only the selected plant.
    expect(blocked.amount).toBeGreaterThan(5);
  });

  it('does not let an out-of-range spring hide a resource that can actually be restored', () => {
    const s = scenario(2);
    spring(s, 'near-but-unreachable', { ...s.player.pos, x: 10 });
    const reachable = food(s, { ...s.player.pos, z: 3 });
    expect(tendTarget(s)).toMatchObject({ id: reachable.id, kind: 'food', ready: true });
    perform(s, 'tend'); expect(reachable.amount).toBeGreaterThan(5);
  });

  it('shows a completed isolated spring without spending energy or increasing its charge', () => {
    const s = scenario(2), completed = spring(s, 'completed', { ...s.player.pos, x: 3 }, 10);
    expect(tendTarget(s)).toMatchObject({ id: completed.id, ready: false, reason: 'complete' });
    const control = perform(s, 'tend');
    expect(completed.charge).toBe(10); expect(s.player.energy).toBe(control.player.energy);
  });

  it('lets an unfinished reachable spring take priority over a closer completed spring', () => {
    const s = scenario(2);
    const completed = spring(s, 'completed', { ...s.player.pos, x: 2 }, 10);
    const unfinished = spring(s, 'unfinished', { ...s.player.pos, z: 4 }, 3);
    expect(tendTarget(s)).toMatchObject({ id: unfinished.id, ready: true });
    perform(s, 'tend'); expect(unfinished.charge).toBe(4); expect(completed.charge).toBe(10);
  });

  it.each(['feed', 'bond', 'tend'] as const)('agrees that %s is unavailable during cooldown', action => {
    const s = scenario(1, ['symbiote']); s.player.cooldown = .5;
    const item = action === 'bond' ? creature(s, { ...s.player.pos, x: 2 }) : food(s, { ...s.player.pos, x: 2 });
    const project = { feed: feedTarget, bond: bondTarget, tend: tendTarget }[action];
    expect(project(s)).toMatchObject({ id: item.id, ready: false, reason: 'cooldown' });
    const control = perform(s, action);
    expect(s.player.energy).toBe(control.player.energy); expect(s.player.meals).toBe(0); expect(s.player.bonds).toHaveLength(0);
  });
});

describe('obstacle volume used by the action query', () => {
  it('allows an underwater interaction over a low obstacle but keeps microscopic solids abstract', () => {
    const s = scenario(); s.world.obstacles = [{ id: 999, kind: 'coral', pos: { x: 2, y: -6, z: 0 }, radius: .6, height: 3 }];
    const start = { x: 0, y: 0, z: 0 }, end = { x: 4, y: 0, z: 0 };
    expect(lineBlocked(s, start, end)).toBe(false);
    s.stage = 0; s.world.stage = 0;
    expect(lineBlocked(s, start, end)).toBe(true);
  });

  it('blocks a rising ray that enters the side of a solid before passing above its center', () => {
    const s = scenario();
    s.world.obstacles = [{ id: 999, kind: 'coral', pos: { x: 2.2, y: -6, z: 0 }, radius: 1, height: 7.6 }];
    // At x=1.3, the line lies inside the cylinder and below its y=1.6 top.
    // Looking only at the closest horizontal point x=2.2 would incorrectly miss it.
    expect(lineBlocked(s, { x: 0, y: 0, z: 0 }, { x: 4, y: 4, z: 0 })).toBe(true);
  });
});
