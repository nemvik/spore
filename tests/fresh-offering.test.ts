import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { initializeJourneyStage, journeyAction, journeyForageTarget } from '../src/game/journey';
import { parseGame, serializeGame } from '../src/game/persistence';
import { distance, horizontalDistance } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
import type { FoodKind, GameState, Resource, Vec3 } from '../src/game/types';

/** Prepared open-water scene, outside the canopy and its scent region. All
 * retained worlds and authored source/canopy references remain strict-save
 * valid. The main sequence creates its old pile with E, then uses only public
 * T, movement and E inputs; neither actor is repositioned during that sequence. */
function scene(version: 2 | 3 = 3, withRoot = false) {
  const s = createGame(481516, false);
  if (version === 2) { s.journey.version = 2; delete s.journey.canopy; }
  s.stage = 1; s.world = createWorld(s.seed, 1); s.worlds[1] = s.world; initializeJourneyStage(s);
  const retainedObstacles = new Set(s.journey.canopy ? [s.journey.canopy.capId, ...s.journey.canopy.roofIds] : []);
  s.world.obstacles = s.world.obstacles.filter(o => retainedObstacles.has(o.id));
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.stage === 1 && site.sourceId === r.id) || r.id === s.journey.canopy?.crustId);
  s.world.patches.forEach(patch => { patch.discovered = true; });
  const grazer = spawnCreature(s.world, 'sail', 1);
  Object.assign(grazer, { pos: { x: -15.5, y: 11, z: -42 }, hunger: 0, fear: 0, cooldown: 0,
    velocity: { x: 0, y: 0, z: 0 }, intent: 'rest', target: null });
  s.world.creatures = [grazer]; s.journey.hunters = [];
  s.player.pos = { x: -12, y: 11, z: -42 }; s.player.heading = Math.PI / 2;
  s.player.velocity = { x: 0, y: 0, z: 0 };
  s.journey.cargo = { site: 4, kind: 'algae', purpose: 'culture', vitality: 100, distance: 0 };
  s.checkpoint = null;
  const site = s.journey.sites.find(site => site.id === 3)!;
  const root: Resource | null = withRoot ? { id: s.world.nextId++, kind: 'nectar', pos: { x: 8, y: 11, z: -42 }, amount: 8, max: 12, patch: 0, regen: .09 } : null;
  if (root) { s.world.resources.push(root); site.plantedId = root.id; site.observed = true; site.phase = 3; }
  return { s, grazer, site, root };
}

function settleAction(s: GameState) {
  for (let i = 0; i < 90 && s.player.cooldown > 0; i++) step(s, EMPTY_INPUT);
}
function offer(s: GameState) {
  settleAction(s); expect(journeyAction(s, true)).toMatchObject({ operation: 'offer', ready: true });
  step(s, { ...EMPTY_INPUT, offer: true });
  return s.world.resources.find(r => r.id === s.journey.offerings.at(-1)!.id)!;
}
function move(s: GameState, goal: Vec3) {
  for (let i = 0; i < 900 && horizontalDistance(s.player.pos, goal) > .25; i++) {
    const dx = goal.x - s.player.pos.x, dz = goal.z - s.player.pos.z, d = Math.hypot(dx, dz), demand = Math.min(.8, d / 2);
    step(s, { ...EMPTY_INPUT, x: dx / d * demand, z: dz / d * demand });
  }
  expect(horizontalDistance(s.player.pos, goal)).toBeLessThan(.25);
}
function relocated(version: 2 | 3 = 3, withRoot = false) {
  const fixture = scene(version, withRoot), { s, grazer } = fixture, old = offer(s);
  expect(old.amount).toBe(5);
  settleAction(s);
  const beforeTake = old.amount;
  expect(journeyAction(s)).toMatchObject({ operation: 'take-food', resourceId: old.id, ready: true });
  step(s, { ...EMPTY_INPUT, tend: true });
  expect(old.amount).toBeCloseTo(beforeTake - 1);
  expect(s.journey.cargo).toMatchObject({ kind: 'algae', purpose: 'food' });
  move(s, { ...s.player.pos, x: -3 });
  expect(grazer.target).toBe(old.id);
  const newer = offer(s);
  expect(newer.amount).toBe(1);
  expect(distance(grazer.pos, old.pos)).toBeLessThan(distance(grazer.pos, newer.pos));
  return { ...fixture, old, newer };
}

function extraOffer(s: GameState, kind: FoodKind, pos: Vec3): Resource {
  const food = { id: s.world.nextId++, kind, pos: { ...pos }, amount: 1, max: 1, regen: 0, patch: 0 };
  s.world.resources.push(food); s.journey.offerings.push({ stage: 1, site: 3, id: food.id, remaining: 120 });
  return food;
}

describe('a fresh compatible offering redirects an existing invitation', () => {
  it('actual T, swimming and E pull the grazer away from a still-edible five-portion pile to a real new meal', () => {
    const { s, grazer, old, newer } = relocated(), dna = s.player.dna, start = { ...grazer.pos };
    expect(journeyForageTarget(s, grazer)?.id).toBe(newer.id);
    for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT);
    expect(grazer.target).toBe(newer.id); expect(grazer.intent).toBe('forage');
    const oldAmount = old.amount;
    for (let i = 0; i < 900 && newer.amount === 1; i++) step(s, EMPTY_INPUT);
    expect(newer.amount).toBeCloseTo(.65); expect(distance(grazer.pos, newer.pos)).toBeLessThan(2);
    expect(distance(grazer.pos, start)).toBeGreaterThan(4);
    expect(old.amount).toBe(oldAmount); expect(old.amount).toBeGreaterThan(3);
    expect(s.world.resources).toContain(old); expect(s.world.creatures).toHaveLength(1);
    expect(s.player.dna).toBe(dna); expect(s.journey.sites.every(site => !site.resolved)).toBe(true);
  });

  it('preserves v2 nearest-offering behavior under the same actual carry sequence', () => {
    const { s, grazer, old, newer } = relocated(2);
    expect(journeyForageTarget(s, grazer)?.id).toBe(old.id);
    for (let i = 0; i < 120; i++) step(s, EMPTY_INPUT);
    expect(grazer.target).toBe(old.id); expect(newer.amount).toBe(1);
    s.journey.legacy = true; expect(journeyForageTarget(s, grazer)).toBeNull();
  });

  it.each(['incompatible', 'out of scent', 'expired', 'other stage'] as const)('keeps the previous useful invitation when the newest offer is %s', reason => {
    const { s, grazer } = scene(); const old = offer(s);
    const newer = extraOffer(s, reason === 'incompatible' ? 'meat' : 'algae', { ...grazer.pos, x: grazer.pos.x + 8 });
    if (reason === 'out of scent') newer.pos.x = grazer.pos.x + 31;
    if (reason === 'expired') s.journey.offerings.at(-1)!.remaining = 0;
    if (reason === 'other stage') s.journey.offerings.at(-1)!.stage = 0;
    const before = JSON.stringify(s);
    expect(journeyForageTarget(s, grazer)?.id).toBe(old.id);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('retains a visible older invitation when the new food is screened off', () => {
    const { s, grazer } = scene(); const old = offer(s);
    extraOffer(s, 'algae', { ...grazer.pos, z: grazer.pos.z + 8 });
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { ...grazer.pos, y: 8, z: grazer.pos.z + 4 }, radius: 1, height: 5 });
    expect(journeyForageTarget(s, grazer)?.id).toBe(old.id);
  });

  it('does not supersede an invitation when E is attempted during its ordinary action cooldown', () => {
    const { s, grazer } = scene(); const old = offer(s);
    s.journey.cargo = { site: 4, kind: 'algae', purpose: 'food', vitality: 100, distance: 0 };
    const amount = old.amount, count = s.world.resources.length;
    step(s, { ...EMPTY_INPUT, offer: true });
    expect(s.journey.offerings).toHaveLength(1); expect(s.world.resources).toHaveLength(count);
    expect(s.journey.cargo).not.toBeNull(); expect(old.amount).toBe(amount);
    expect(journeyForageTarget(s, grazer)?.id).toBe(old.id);
  });

  it('retains real danger and nutrition requirements after a new invitation', () => {
    const { s, grazer, newer } = relocated();
    // Explicit danger fixture after the carry regression: fresh food cannot
    // override the same physical nearby predator that causes ordinary flight.
    const hunter = spawnCreature(s.world, 'ribbon', 1);
    hunter.pos = { ...grazer.pos, z: grazer.pos.z + 3 }; hunter.hunger = 70;
    s.world.creatures.push(hunter);
    for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT);
    expect(grazer.intent).toBe('flee'); expect(newer.amount).toBe(1);
  });

  it('preserves offer order and identical physical continuation through a strict save', () => {
    const { s, grazer, newer } = relocated(), loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s);
    expect(journeyForageTarget(loaded, loaded.world.creatures.find(c => c.id === grazer.id)!)?.id).toBe(newer.id);
    for (let i = 0; i < 600; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded).toEqual(s);
    expect(s.world.resources.find(r => r.id === newer.id)!.amount).toBeLessThan(1);
  });

  it('hands the animal to a real root after the newer meal, instead of reviving an older edible lure', () => {
    const { s, grazer, site, root, old, newer } = relocated(3, true);
    expect(site.resolved).toBe(false);
    for (let i = 0; i < 1500 && newer.amount >= .5; i++) step(s, EMPTY_INPUT);
    expect(newer.amount).toBeCloseTo(.3); expect(distance(grazer.pos, newer.pos)).toBeLessThan(2);
    expect(site.resolved).toBe(false); expect(old.amount).toBeGreaterThan(3);
    expect(s.world.resources).toContain(newer); expect(s.journey.offerings.some(o => o.id === newer.id && o.remaining > 0)).toBe(true);
    expect(journeyForageTarget(s, grazer)?.id).toBe(root!.id);
    const oldAmount = old.amount, dna = s.player.dna;
    for (let i = 0; i < 1500 && !site.resolved; i++) step(s, EMPTY_INPUT);
    expect(site.resolved).toBe(true); expect(site.method).toBe('cultivate');
    expect(grazer.target).toBe(root!.id); expect(distance(grazer.pos, root!.pos)).toBeLessThan(2);
    expect(s.player.dna).toBe(dna + 28); expect(old.amount).toBe(oldAmount);
    expect(s.world.resources).toContain(old); // The earlier food was not deleted.
  });

  it('preserves an imported nonmonotonic lifetime order, using the older signal only after the newer marker really expires', () => {
    const { s, grazer, root, old, newer } = relocated(3, true);
    for (let i = 0; i < 1500 && newer.amount >= .5; i++) step(s, EMPTY_INPUT);
    expect(newer.amount).toBeLessThan(.5);
    // Explicit valid import edge case. Runtime-created invitations normally
    // expire oldest first; the parser permits this different remaining order.
    s.journey.offerings.find(o => o.id === old.id)!.remaining = 80;
    s.journey.offerings.find(o => o.id === newer.id)!.remaining = .01;
    const loaded = parseGame(serializeGame(s)), before = JSON.stringify(loaded);
    expect(loaded).toEqual(s);
    const animal = loaded.world.creatures.find(c => c.id === grazer.id)!;
    expect(journeyForageTarget(loaded, animal)?.id).toBe(root!.id);
    expect(JSON.stringify(loaded)).toBe(before);
    step(loaded, EMPTY_INPUT);
    expect(loaded.world.resources.some(r => r.id === newer.id)).toBe(false);
    expect(loaded.journey.offerings.some(o => o.id === old.id && o.remaining > 0)).toBe(true);
    expect(journeyForageTarget(loaded, animal)?.id).toBe(old.id);
    expect(loaded.world.resources.find(r => r.id === old.id)!.amount).toBe(old.amount);
  });
});
