import type { GameState, Obstacle, Vec3 } from './types';
import { speciesById } from './content';
import { speciesGroundClearance } from './anatomy';
import { groundHeight, horizontalDistance } from './random';
import { WORLD_BOUND } from './world';

/** A tree screen west of the mother separates the sheltered northern pasture
 * from the open eastern feeding ground. Its two 5.4 m mouths are ordinary
 * walkable openings, not doors, species gates or new completion conditions. */
const TREE_RADIUS = 2.3;
const TREE_OFFSETS = [-19, -15, -5, -1, 3, 13, 17] as const;

function clear(obstacles: Obstacle[], point: Vec3, radius: number): boolean {
  return Math.abs(point.x) <= WORLD_BOUND - radius && Math.abs(point.z) <= WORLD_BOUND - radius
    && obstacles.every(tree => horizontalDistance(tree.pos, point) >= tree.radius + radius);
}

function segmentDistance(point: Vec3, from: Vec3, to: Vec3): number {
  const dx = to.x - from.x, dz = to.z - from.z, length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / length2)) : 0;
  return Math.hypot(point.x - from.x - dx * t, point.z - from.z - dz * t);
}

function nearby(origin: Vec3, obstacles: Obstacle[], radius: number, clearance: number,
  occupied: (point: Vec3) => boolean = () => false): Vec3 {
  const closest = [...obstacles].sort((a, b) => horizontalDistance(a.pos, origin) - horizontalDistance(b.pos, origin) || a.id - b.id)[0];
  const outward = closest ? Math.atan2(origin.z - closest.pos.z, origin.x - closest.pos.x) : 0;
  for (let ring = 1; ring <= 16; ring++) for (let i = 0; i < 16; i++) {
    const angle = outward + i * Math.PI / 8;
    const x = origin.x + Math.cos(angle) * ring * .8, z = origin.z + Math.sin(angle) * ring * .8;
    const point = { x, y: groundHeight(x, z, 2) + clearance, z };
    if (clear(obstacles, point, radius) && !occupied(point)) return point;
  }
  throw new Error('The land crossing needs a clear local position for an existing resident.');
}

/** Call after fresh land actor placement. No RNG, population, food quantity,
 * site identity, water rate or old-world reconstruction belongs to authoring. */
export function authorLandCrossing(s: GameState): void {
  if (s.stage !== 2 || s.world.stage !== 2 || s.journey.version !== 3 || s.journey.legacy || s.campaign.won) return;
  const site = s.journey.sites.find(site => site.id === 7 && site.stage === 2 && site.patch === 1);
  if (!site || site.observed || site.resolved || site.plantedId !== null) return;
  const w = s.world, wallX = site.source.x - 7;
  const trees = TREE_OFFSETS.map((offset, i): Obstacle => {
    const z = site.source.z + offset;
    return { id: w.nextId + i, kind: 'tree', radius: TREE_RADIUS, height: 7.5 + i % 3 * .6,
      pos: { x: wallX, y: groundHeight(wallX, z, 2), z } };
  });
  // Physical records identify this completed authoring pass. Re-entry cannot
  // replace scenery or consume IDs before the player has observed the place.
  if (trees.every(tree => w.obstacles.some(o => o.kind === tree.kind && o.radius === tree.radius && o.height === tree.height
    && Math.hypot(o.pos.x - tree.pos.x, o.pos.y - tree.pos.y, o.pos.z - tree.pos.z) < .001))) return;

  // Clear the screen/mouths and the short eastern approach. In particular the
  // generic refuge shelter must not turn both alternatives into hidden pasture.
  // Distant habitats and the independent western migration bypass remain intact.
  const easternRefuge = site.refuges[0];
  const retained = w.obstacles.filter(o => (Math.abs(o.pos.x - wallX) >= 6 + o.radius
    || o.pos.z < site.source.z - 23 - o.radius || o.pos.z > site.source.z + 21 + o.radius)
    && (!easternRefuge || segmentDistance(o.pos, site.source, easternRefuge) >= o.radius + 1.6));
  const obstacles = [...retained, ...trees];
  const fixedPlaces = s.journey.sites.filter(other => other.stage === 2).flatMap(other => [other.source, ...other.refuges]);
  if (fixedPlaces.some(point => trees.some(tree => horizontalDistance(tree.pos, point) < tree.radius + 2))) {
    throw new Error('The land crossing must leave every existing mother and refuge accessible.');
  }
  // New cover cannot bury a previously reachable meal. Keep every identity and
  // portion, moving only intersecting ordinary resources to a nearby free edge.
  const foodMoves = w.resources.filter(food => trees.some(tree => horizontalDistance(tree.pos, food.pos) < tree.radius + 1.2))
    .map(food => ({ food, pos: nearby(food.pos, obstacles, 1.2, 1.2) }));
  const actorMoves: { actor: GameState['world']['creatures'][number]; pos: Vec3 }[] = [];
  for (const actor of w.creatures) {
    const species = speciesById(actor.species), radius = species.size * .6;
    if (!trees.some(tree => horizontalDistance(tree.pos, actor.pos) < tree.radius + radius)) continue;
    const pos = nearby(actor.pos, obstacles, radius, speciesGroundClearance(species), point =>
      w.creatures.some(other => other !== actor && other.health > 0
        && horizontalDistance(actorMoves.find(move => move.actor === other)?.pos ?? other.pos, point) < radius + speciesById(other.species).size * .6 + .1));
    actorMoves.push({ actor, pos });
  }
  w.obstacles = obstacles; w.nextId += trees.length;
  for (const { food, pos } of foodMoves) food.pos = pos;
  for (const { actor, pos } of actorMoves) actor.pos = pos;
}
