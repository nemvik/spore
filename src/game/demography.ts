import type { Creature, GameState, Resource, Species, Vec3 } from './types';
import { speciesById } from './content';
import { speciesGroundClearance } from './anatomy';
import { distance, groundHeight, horizontalDistance } from './random';
import { obstacleSegmentEntry } from './obstacle-geometry';
import { spawnCreature, WORLD_BOUND } from './world';

/** Keep the former aggregate population budget, without refilling empty patches. */
function populationLimit(s: GameState, species: Species): number {
  return s.world.patches.reduce((total, patch) => {
    if (species.role === 'partner' && patch.id !== 2 && !(s.stage === 1 && patch.id === 1) || species.role === 'grazer' && patch.id === 2) return total;
    const local = species.role === 'predator' ? 1 : species.role === 'invasive'
      ? s.campaign.finale === 'predator' ? 1 : Math.max(1, 4 - Math.floor(patch.hunted / 3))
      : Math.max(1, Math.round(patch.fertility * 3));
    return total + local;
  }, 0);
}

function childPosition(s: GameState, parent: Creature, food: Resource, species: Species): Vec3 | null {
  const w = s.world, radius = species.size * .6;
  for (const ring of [radius * 2 + .4, radius * 2 + 1.6, radius * 2 + 3]) {
    for (let i = 0; i < 12; i++) {
      const angle = parent.heading + i * Math.PI / 6;
      const p = { x: food.pos.x + Math.sin(angle) * ring, y: food.pos.y, z: food.pos.z + Math.cos(angle) * ring };
      if (Math.abs(p.x) > WORLD_BOUND - radius || Math.abs(p.z) > WORLD_BOUND - radius) continue;
      if (s.stage === 0) p.y = 1.1;
      else if (s.stage === 2) p.y = groundHeight(p.x, p.z, 2) + speciesGroundClearance(species);
      else if (p.y < groundHeight(p.x, p.z, 1) + 1.3 || p.y > 12) continue;
      if (s.player.health > 0 && distance(s.player.pos, p) < radius + Math.max(.6, s.player.genome.width * .8) + .1) continue;
      if (w.creatures.some(c => c.health > 0 && distance(c.pos, p) < radius + speciesById(c.species).size * .6 + .1)) continue;
      const blocked = w.obstacles.some(o => {
        const overlaps = horizontalDistance(p, o.pos) < o.radius + radius;
        if (overlaps && (s.stage === 0 || p.y > o.pos.y - radius && p.y < o.pos.y + o.height + radius)) return true;
        // Microscopic obstacles fill its fixed movement plane. Other stages
        // retain finite caps, so a feeding parent can reproduce under a roof.
        const obstacle = s.stage === 0 ? { ...o, pos: { ...o.pos, y: 0 }, height: 2.2 } : o;
        return obstacleSegmentEntry(parent.pos, p, obstacle, radius) !== null;
      });
      if (!blocked) return p;
    }
  }
  return null;
}

/** Called after an actual compatible meal has already lowered the parent's
 * hunger and debited its ordinary portion. A spare portion funds one local
 * offspring; neither time nor a vacancy alone creates an animal.
 * Rejected births do not consume food, ids or the saved world RNG.
 */
export function reproduceAfterMeal(s: GameState, parent: Creature, food: Resource, hungerBefore: number): boolean {
  if (s.journey.version !== 3 || s.journey.legacy) return false;
  const w = s.world, species = speciesById(parent.species);
  const threshold = species.role === 'predator' ? 40 : 28;
  if (!w.creatures.includes(parent) || parent.health <= 0 || !w.resources.includes(food) || !species.diet.includes(food.kind)
    || !Number.isFinite(hungerBefore) || hungerBefore <= threshold || parent.hunger > threshold || food.amount < 1
    || w.creatures.length >= 48 || w.creatures.filter(c => c.species === parent.species).length >= populationLimit(s, species)) return false;
  const position = childPosition(s, parent, food, species);
  if (!position) return false;
  const child = spawnCreature(w, parent.species, parent.patch);
  child.pos = position; child.hunger = 70; child.velocity = { x: 0, y: 0, z: 0 };
  food.amount -= 1; w.creatures.push(child); w.births++;
  return true;
}
