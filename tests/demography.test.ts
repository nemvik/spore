import type { WorldStage as Stage } from '../src/game/stage';
import { describe, expect, it } from 'vitest';
import { reproduceAfterMeal } from '../src/game/demography';
import { createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import { createWorld, spawnCreature, WORLD_BOUND } from '../src/game/world';
import { initializeJourneyStage } from '../src/game/journey';
import { parseGame, serializeGame } from '../src/game/persistence';
import { distance, groundHeight, horizontalDistance } from '../src/game/random';
import { speciesById } from '../src/game/content';
import { speciesGroundClearance } from '../src/game/anatomy';
import type { Creature, GameState, Resource, } from '../src/game/types';

/** Isolated post-meal scenes: the caller has already consumed its normal bite.
 * These verify the demographic transaction, not a played campaign or AI route. */
function scene(stage: Stage = 0, species = stage === 0 ? 'veil' : stage === 1 ? 'sail' : 'bell') {
  const s = createGame(481516, false);
  for (let next = 1; next <= stage; next++) {
    s.stage = next as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.world.stage] = s.world; initializeJourneyStage(s);
  }
  s.world.obstacles = []; s.world.creatures = []; s.checkpoint = null;
  const parent = spawnCreature(s.world, species, 0);
  parent.pos = { x: 0, y: stage === 0 ? 1.1 : stage === 1 ? 0 : speciesGroundClearance(speciesById(species)), z: 0 };
  parent.heading = 0; parent.hunger = 20; s.world.creatures.push(parent);
  const food: Resource = { id: s.world.nextId++, kind: speciesById(species).diet[0], pos: { ...parent.pos }, amount: 2, max: 4, regen: 0, patch: 0 };
  s.world.resources.push(food);
  return { s, parent, food };
}

function add(s: GameState, species: string, patch: number, x: number): Creature {
  const c = spawnCreature(s.world, species, patch); c.pos = { x, y: s.stage === 0 ? 1.1 : 0, z: 30 }; s.world.creatures.push(c); return c;
}

describe('food-funded reproduction for version-three journeys', () => {
  it('does not create a hungry predator inside the player at the first otherwise clear candidate', () => {
    const { s, parent, food } = scene(0, 'needle'); parent.hunger = 28;
    s.player.pos = { x: 0, y: 1.1, z: 1.42 };
    expect(reproduceAfterMeal(s, parent, food, 70)).toBe(true);
    const child = s.world.creatures.at(-1)!;
    expect(distance(child.pos, s.player.pos)).toBeGreaterThan(speciesById(child.species).size * .6 + s.player.genome.width * .8);
  });

  it('turns exactly one spare portion into one local hungry animal while preserving the parent and player', () => {
    const { s, parent, food } = scene();
    const originalPlayer = structuredClone(s.player), originalJourney = structuredClone(s.journey), beforeParent = structuredClone(parent);
    const nextId = s.world.nextId, births = s.world.births;
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(true);
    expect(food.amount).toBe(1); expect(s.world.births).toBe(births + 1);
    expect(s.world.nextId).toBe(nextId + 1); expect(s.world.creatures).toHaveLength(2);
    const child = s.world.creatures[1];
    expect(child).toMatchObject({ id: nextId, species: parent.species, patch: parent.patch, hunger: 70, age: 0, health: 32 });
    expect(distance(child.pos, food.pos)).toBeLessThan(5); expect(distance(child.pos, parent.pos)).toBeGreaterThan(1);
    expect(parent).toEqual(beforeParent); expect(s.player).toEqual(originalPlayer); expect(s.journey).toEqual(originalJourney);
  });

  it('keeps a one-portion meat lure a meal; only a real corpse with surplus can also support offspring', () => {
    const lure = scene(0, 'needle'), corpse = scene(0, 'needle');
    lure.parent.hunger = corpse.parent.hunger = 28;
    lure.food.amount = 0; corpse.food.amount = 2; // Both hunters already ate one actual portion.
    const before = structuredClone(lure.s);
    expect(reproduceAfterMeal(lure.s, lure.parent, lure.food, 70)).toBe(false);
    expect(lure.s).toEqual(before);
    expect(reproduceAfterMeal(corpse.s, corpse.parent, corpse.food, 70)).toBe(true);
    expect(corpse.parent.hunger).toBe(28); expect(corpse.food.amount).toBe(1);
    expect(corpse.s.world.creatures[1]).toMatchObject({ species: 'needle', health: 55, hunger: 70 });
  });

  it.each(['legacy', 'historical journey'] as const)('leaves the %s world, RNG and food completely unchanged', mode => {
    const { s, parent, food } = scene(); s.journey.version = 2; delete s.journey.canopy;
    s.journey.legacy = mode === 'legacy';
    const before = structuredClone(s);
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(false); expect(s).toEqual(before);
  });

  it.each([
    ['already full', (s: GameState, parent: Creature, food: Resource): number => 28],
    ['still hungry', (s: GameState, parent: Creature, food: Resource): number => { parent.hunger = 29; return 51; }],
    ['no spare portion', (s: GameState, parent: Creature, food: Resource): number => { food.amount = .99; return 42; }],
    ['wrong diet', (s: GameState, parent: Creature, food: Resource): number => { food.kind = 'meat'; return 42; }],
    ['dead parent', (s: GameState, parent: Creature, food: Resource): number => { parent.health = 0; return 42; }],
    ['removed parent', (s: GameState, parent: Creature, food: Resource): number => { s.world.creatures = []; return 42; }],
    ['removed food', (s: GameState, parent: Creature, food: Resource): number => { s.world.resources = s.world.resources.filter(r => r !== food); return 42; }],
  ] as const)('rejects %s without consuming food, ids, RNG or any other state', (_label, prepare) => {
    const { s, parent, food } = scene(), hungerBefore = prepare(s, parent, food), before = structuredClone(s), beforeFood = structuredClone(food);
    expect(reproduceAfterMeal(s, parent, food, hungerBefore)).toBe(false);
    expect(s).toEqual(before); expect(food).toEqual(beforeFood);
  });

  it('uses a species budget across the world rather than rebuilding a hunted patch', () => {
    const { s, parent, food } = scene(0, 'needle'); parent.patch = 1; parent.hunger = 28;
    add(s, 'needle', 1, 30); // Two surviving predators share one patch; another is empty.
    expect(reproduceAfterMeal(s, parent, food, 70)).toBe(true);
    expect(s.world.creatures.every(c => c.patch === 1)).toBe(true);
    const before = structuredClone(s);
    expect(reproduceAfterMeal(s, parent, food, 70)).toBe(false);
    expect(s).toEqual(before); // The former three-patch predator maximum is full.
  });

  it('retains the old aggregate fertile-grazer budget and does not borrow a forbidden third patch', () => {
    const { s, parent, food } = scene();
    s.world.patches[0].fertility = .2; s.world.patches[1].fertility = .2; s.world.patches[2].fertility = 1.5;
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(true);
    const before = structuredClone(s);
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(false); expect(s).toEqual(before);
  });

  it('retains the old aggregate invader ceiling without treating other deaths as new food', () => {
    const { s, parent, food } = scene(2, 'gnaw');
    s.world.patches.forEach(patch => { patch.hunted = 9; });
    add(s, 'gnaw', 0, 30);
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(true);
    const before = structuredClone(s);
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(false); expect(s).toEqual(before);
  });

  it('honors the world safety budget even when this particular species has room', () => {
    const { s, parent, food } = scene();
    while (s.world.creatures.length < 48) add(s, 'lantern', 2, 40);
    const before = structuredClone(s);
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(false); expect(s).toEqual(before);
  });

  it('can reproduce beneath a suspended reef roof while a solid enclosure prevents the transaction', () => {
    const open = scene(1), closed = scene(1);
    open.s.world.obstacles.push({ id: open.s.world.nextId++, kind: 'rock', pos: { x: 0, y: 1.5, z: 0 }, radius: 8, height: 1.4 });
    closed.s.world.obstacles.push({ id: closed.s.world.nextId++, kind: 'rock', pos: { x: 0, y: -3, z: 0 }, radius: 8, height: 6 });
    const before = structuredClone(closed.s);
    expect(reproduceAfterMeal(open.s, open.parent, open.food, 42)).toBe(true);
    expect(open.s.world.creatures[1].pos.y).toBe(0);
    expect(reproduceAfterMeal(closed.s, closed.parent, closed.food, 42)).toBe(false); expect(closed.s).toEqual(before);
  });

  it.each([0, 1, 2] as const)('places stage %i offspring inside the world and at its real terrain clearance', stage => {
    const { s, parent, food } = scene(stage); parent.pos.x = food.pos.x = WORLD_BOUND - .1;
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(true);
    const child = s.world.creatures[1], radius = speciesById(child.species).size * .6;
    expect(Math.abs(child.pos.x)).toBeLessThanOrEqual(WORLD_BOUND - radius);
    expect(Math.abs(child.pos.z)).toBeLessThanOrEqual(WORLD_BOUND - radius);
    if (stage === 0) expect(child.pos.y).toBe(1.1);
    if (stage === 1) expect(child.pos.y).toBeGreaterThanOrEqual(groundHeight(child.pos.x, child.pos.z, 1) + 1.3);
    if (stage === 2) expect(child.pos.y).toBeCloseTo(groundHeight(child.pos.x, child.pos.z, 2) + speciesGroundClearance(speciesById(child.species)));
  });

  it('finds another local opening instead of placing offspring inside another animal or a rock', () => {
    const { s, parent, food } = scene();
    const other = add(s, 'lantern', 2, 0); other.pos = { x: 0, y: 1.1, z: 1.2 };
    const rock = { id: s.world.nextId++, kind: 'rock' as const, pos: { x: 1.5, y: -6, z: 0 }, radius: 1, height: 12 };
    s.world.obstacles.push(rock);
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(true);
    const child = s.world.creatures.at(-1)!;
    expect(distance(child.pos, other.pos)).toBeGreaterThan(.7);
    expect(horizontalDistance(child.pos, rock.pos)).toBeGreaterThan(rock.radius + speciesById(child.species).size * .6);
  });

  it('keeps meal-funded children, food and RNG deterministic through strict saves and generation checkpoints', () => {
    const { s, parent, food } = scene();
    const loaded = parseGame(serializeGame(s));
    const loadedParent = loaded.world.creatures.find(c => c.id === parent.id)!, loadedFood = loaded.world.resources.find(r => r.id === food.id)!;
    expect(reproduceAfterMeal(s, parent, food, 42)).toBe(true);
    expect(reproduceAfterMeal(loaded, loadedParent, loadedFood, 42)).toBe(true);
    expect(loaded).toEqual(s); expect(parseGame(serializeGame(s))).toEqual(s);
    makeCheckpoint(s);
    const recovered = recoverGeneration(parseGame(serializeGame(s)));
    expect(recovered.world.creatures).toEqual(s.world.creatures);
    expect(recovered.world.resources).toEqual(s.world.resources);
    expect(recovered.world.rng).toBe(s.world.rng); expect(recovered.world.births).toBe(s.world.births);
    expect(recovered.journey.version).toBe(3);
  });
});
