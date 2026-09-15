import { describe, expect, it } from 'vitest';
import { authorLandCrossing } from '../src/game/land-crossing';
import { createGame, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { actOnJourney, initializeJourneyStage, journeyAction } from '../src/game/journey';
import { lineBlocked } from '../src/game/interactions';
import { speciesById } from '../src/game/content';
import { speciesGroundClearance } from '../src/game/anatomy';
import { genomeCost, initialGenome } from '../src/game/genome';
import { distance, groundHeight, horizontalDistance } from '../src/game/random';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState, Vec3 } from '../src/game/types';

const SEEDS = [481516, 20260913, 8675309];
function point(x: number, z: number, species = 'bell'): Vec3 {
  return { x, y: groundHeight(x, z, 2) + speciesGroundClearance(speciesById(species)), z };
}

/** Fresh authored scene with the ordinary actor placement completed first.
 * Temporarily using v2 for that placement delays only the new v3 crossing so
 * before/after invariants stay meaningful once initializeJourneyStage wires it.
 * Route fixtures explicitly remove other actors and add one offered meal;
 * they are CPU navigation evidence, not a human campaign. */
function scene(seed = 20260913, author = true) {
  const s = createGame(seed, false);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world;
    if (stage === 2) s.journey.version = 2;
    initializeJourneyStage(s); s.journey.version = 3;
  }
  s.player.genome = structuredClone(s.player.genome);
  s.player.genome.parts.push(
    { id: 'crossing-legs', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: true },
    { id: 'crossing-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
  );
  s.player.totalDna = 100; s.player.dna = genomeCost(initialGenome()) + 100 - genomeCost(s.player.genome);
  s.checkpoint = null;
  if (author) authorLandCrossing(s);
  return { s, site: s.journey.sites.find(site => site.id === 7)! };
}

function bareFood(resource: GameState['world']['resources'][number]) {
  const { pos, ...food } = resource; return food;
}
function bareActor(creature: GameState['world']['creatures'][number]) {
  const { pos, ...actor } = creature; return actor;
}
function at(s: GameState, position: Vec3) {
  s.player.pos = { ...position }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.cooldown = 0;
}

describe('the land terrace has two actual crossings and distinct cover', () => {
  it.each(SEEDS)('preserves seed %i food, population, sites and RNG while keeping new trunks physically clear', seed => {
    const { s, site } = scene(seed, false), w = s.world;
    const food = w.resources.map(bareFood), actors = w.creatures.map(bareActor), sites = structuredClone(s.journey.sites);
    const worldsBefore = structuredClone(s.worlds.slice(0, 2)), player = structuredClone(s.player), rng = w.rng;
    const oldObstacles = new Set(w.obstacles.map(o => o.id));
    authorLandCrossing(s);
    expect(w.resources.map(bareFood)).toEqual(food); expect(w.creatures.map(bareActor)).toEqual(actors);
    expect(s.journey.sites).toEqual(sites); expect(s.worlds.slice(0, 2)).toEqual(worldsBefore); expect(s.player).toEqual(player); expect(w.rng).toBe(rng);
    const trees = w.obstacles.filter(o => !oldObstacles.has(o.id)); expect(trees).toHaveLength(7);
    for (const tree of trees) {
      expect(tree.kind).toBe('tree'); expect(tree.pos.y).toBe(groundHeight(tree.pos.x, tree.pos.z, 2));
      expect(horizontalDistance(tree.pos, site.source)).toBeLessThan(22);
      for (const r of w.resources) expect(horizontalDistance(tree.pos, r.pos), `food ${r.id}`).toBeGreaterThanOrEqual(tree.radius + 1.2 - 1e-8);
      for (const c of w.creatures) expect(horizontalDistance(tree.pos, c.pos), `creature ${c.id}`).toBeGreaterThanOrEqual(tree.radius + speciesById(c.species).size * .6 - 1e-8);
      for (const other of s.journey.sites.filter(other => other.stage === 2 && other.id !== 7)) expect(horizontalDistance(tree.pos, other.source)).toBeGreaterThan(35);
    }
    const ids = [...w.obstacles, ...w.resources, ...w.creatures].map(entity => entity.id);
    expect(new Set(ids).size).toBe(ids.length); expect(w.nextId).toBeGreaterThan(Math.max(...ids));
    expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it.each(SEEDS)('seed %i shelters the western refuge without closing the eastern approach or either mouth', seed => {
    const { s, site } = scene(seed), west = site.refuges[1], east = site.refuges[0];
    expect(west).toMatchObject({ x: 22, z: -36 }); expect(east).toMatchObject({ x: 53, z: -3 });
    expect(site.source).toMatchObject({ x: 37, z: -20 });
    expect(lineBlocked(s, site.source, west)).toBe(true);
    expect(lineBlocked(s, site.source, east)).toBe(false);
    for (const z of [-30, -12]) {
      const expanded = { ...s, world: { ...s.world, obstacles: s.world.obstacles.map(o => ({ ...o, radius: o.radius + 1.44 })) } };
      expect(lineBlocked(expanded, point(25, z), point(35, z)), `mouth at ${z}`).toBe(false);
    }
    for (const position of [site.source, ...site.refuges]) {
      expect(s.world.obstacles.every(o => horizontalDistance(o.pos, position) >= o.radius + 1.44)).toBe(true);
    }
  });

  it.each(SEEDS.flatMap(seed => [-30, -12].flatMap(z => ['bell', 'gnaw', 'gloom'].map(species => ({ seed, z, species })))))
  ('routes a real $species across seed $seed mouth $z into an actual meal', ({ seed, z, species }) => {
    const { s } = scene(seed);
    s.world.creatures = []; s.journey.hunters = []; s.world.resources.forEach(r => { r.regen = 0; });
    const child = spawnCreature(s.world, species, 1); child.pos = point(25, z, species);
    Object.assign(child, { hunger: 70, cooldown: 0, fear: 0, target: null, velocity: { x: 0, y: 0, z: 0 } }); s.world.creatures = [child];
    const food = { id: s.world.nextId++, kind: species === 'gloom' ? 'detritus' as const : 'algae' as const,
      pos: point(35, z, species), amount: 1, max: 1, regen: 0, patch: 1 };
    s.world.resources.push(food); s.journey.offerings.push({ id: food.id, site: 7, stage: 2, remaining: 120 });
    at(s, point(0, 0));
    for (let i = 0; i < 600 && food.amount > .7; i++) {
      const before = { ...child.pos }; step(s, EMPTY_INPUT);
      expect(horizontalDistance(child.pos, before)).toBeLessThanOrEqual(speciesById(species).speed / 60 + 1e-6);
      expect(s.world.obstacles.every(o => horizontalDistance(child.pos, o.pos) >= o.radius + speciesById(species).size * .6 - 1e-6)).toBe(true);
    }
    expect(food.amount).toBeLessThan(.7); expect(distance(child.pos, food.pos)).toBeLessThan(2); expect(child.pos.x).toBeGreaterThan(33);
  });

  it.each(SEEDS)('a native can navigate from the seed %i mother around the screen and establish the western pasture', seed => {
    const { s, site } = scene(seed); s.world.creatures = []; s.journey.hunters = [];
    at(s, site.source); actOnJourney(s); s.player.cooldown = 0; actOnJourney(s);
    at(s, site.refuges[1]); expect(journeyAction(s)).toMatchObject({ operation: 'plant', ready: true }); actOnJourney(s);
    const plant = s.world.resources.find(r => r.id === site.plantedId)!;
    const child = spawnCreature(s.world, 'bell', 1); child.pos = point(38, -20);
    Object.assign(child, { hunger: 70, cooldown: 0, fear: 0, target: null, velocity: { x: 0, y: 0, z: 0 } }); s.world.creatures = [child];
    expect(lineBlocked(s, child.pos, plant.pos)).toBe(true); expect(site.resolved).toBe(false);
    at(s, point(0, 0)); let beforeMeal = plant.amount, crossedAt: number | null = null;
    for (let i = 0; i < 1500 && !site.resolved; i++) {
      const before = { ...child.pos }; beforeMeal = plant.amount; step(s, EMPTY_INPUT);
      expect(horizontalDistance(child.pos, before)).toBeLessThanOrEqual(3.4 / 60 + 1e-6);
      if (before.x >= 30 && child.pos.x < 30) crossedAt = child.pos.z;
    }
    expect(crossedAt).not.toBeNull(); expect(crossedAt!).toBeGreaterThan(-33); expect(crossedAt!).toBeLessThan(-27);
    expect(site.resolved).toBe(true); expect(plant.amount).toBeLessThan(beforeMeal - .3); expect(distance(child.pos, plant.pos)).toBeLessThan(2);
  });

  it.each(SEEDS)('seed %i cover changes actual hunter and grazer decisions at the same ten-metre separation', seed => {
    const outcomes = [true, false].map(sheltered => {
      const { s } = scene(seed); s.world.creatures = []; s.journey.hunters = [];
      const hunter = spawnCreature(s.world, 'crest', 1), grazer = spawnCreature(s.world, 'bell', 1);
      hunter.pos = point(35, -21, 'crest'); hunter.hunger = 70;
      grazer.pos = point(sheltered ? 25 : 35, sheltered ? -21 : -11); grazer.hunger = 70;
      s.world.creatures = [hunter, grazer]; at(s, point(0, 0)); s.tick = 29;
      expect(horizontalDistance(hunter.pos, grazer.pos)).toBe(10);
      expect(lineBlocked(s, hunter.pos, grazer.pos)).toBe(sheltered);
      step(s, EMPTY_INPUT);
      return { hunter: hunter.intent, grazer: grazer.intent };
    });
    expect(outcomes[0].hunter).not.toBe('hunt'); expect(outcomes[0].grazer).not.toBe('flee');
    expect(outcomes[1]).toEqual({ hunter: 'hunt', grazer: 'flee' });
  });

  it('moves only intersecting ordinary food and residents rather than dropping quantities into new trunks', () => {
    const { s } = scene(20260913, false);
    const meal = s.world.resources.find(r => r.patch === 1 && !s.journey.sites.some(site => site.sourceId === r.id))!;
    meal.pos = point(30, -25);
    const actor = s.world.creatures.find(c => c.patch === 1)!; actor.pos = point(30, -21, actor.species);
    const originalFood = bareFood(meal), originalActor = bareActor(actor), foodStart = { ...meal.pos }, actorStart = { ...actor.pos };
    authorLandCrossing(s);
    expect(bareFood(meal)).toEqual(originalFood); expect(bareActor(actor)).toEqual(originalActor);
    expect(horizontalDistance(meal.pos, foodStart)).toBeGreaterThan(2.3); expect(horizontalDistance(meal.pos, foodStart)).toBeLessThan(13);
    expect(horizontalDistance(actor.pos, actorStart)).toBeGreaterThan(2.3); expect(horizontalDistance(actor.pos, actorStart)).toBeLessThan(13);
    expect(s.world.obstacles.every(o => horizontalDistance(meal.pos, o.pos) >= o.radius + 1.2)).toBe(true);
    expect(s.world.obstacles.every(o => horizontalDistance(actor.pos, o.pos) >= o.radius + speciesById(actor.species).size * .6)).toBe(true);
  });

  it.each(['v2', 'legacy', 'observed', 'resolved', 'planted', 'won', 'other stage'] as const)('does not reconstruct the %s world', mode => {
    const { s, site } = scene(20260913, false);
    if (mode === 'v2') s.journey.version = 2;
    if (mode === 'legacy') s.journey.legacy = true;
    if (mode === 'observed') site.observed = true;
    if (mode === 'resolved') site.resolved = true;
    if (mode === 'planted') site.plantedId = site.sourceId;
    if (mode === 'won') s.campaign.won = true;
    if (mode === 'other stage') s.stage = 1;
    const before = structuredClone(s); authorLandCrossing(s); expect(s).toEqual(before);
  });

  it('does not replace its physical records or consume IDs when called twice, including after strict save/load', () => {
    const { s } = scene(), before = structuredClone(s);
    authorLandCrossing(s); expect(s).toEqual(before);
    const loaded = parseGame(serializeGame(s)); authorLandCrossing(loaded); expect(loaded).toEqual(s);
  });
});
