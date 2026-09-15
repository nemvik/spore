import type { EcologySite } from './journey-types';
import type { Obstacle, Vec3, World } from './types';
import { groundHeight, horizontalDistance } from './random';

const CENTER = { x: 37, z: -20 };
const WALL_RADIUS = 14.6;
const ROCK_RADIUS = 2.6;
const WEST_GAP = 2.1;
const point = (x: number, z: number): Vec3 => ({ x: CENTER.x + x, y: 1.1, z: CENTER.z + z });

/** The colony circulates in the clear annulus, never through the central rock or wall. */
export function vortexSourceAt(time: number): Vec3 {
  const angle = time * .19;
  return point(Math.cos(angle) * 8.5, Math.sin(angle) * 8.5);
}

/**
 * Fresh microscopic vortex only; call after generic node shelters are authored.
 * A western 2.1 m slit fits the initial 1.6 m body. The broad eastern mouth stays
 * accessible to every legal body, with a visible outer lip for long-mouth pickup.
 * No RNG is consumed: random scenery cannot change these physical alternatives.
 */
export function authorVortex(w: World, site: EcologySite): void {
  if (w.stage !== 0 || site.stage !== 0 || site.id !== 1 || site.patch !== 1) return;
  const mother = w.resources.find(resource => resource.id === site.sourceId);
  if (!mother) return;

  // Clear the room and its approach band, without touching distant habitats.
  w.obstacles = w.obstacles.filter(rock => horizontalDistance(rock.pos, CENTER) >= 28.5 + rock.radius);
  const authored: Obstacle[] = [];
  const stone = (x: number, z: number, radius: number, height: number) => {
    const pos = point(x, z); pos.y = groundHeight(pos.x, pos.z, 0);
    authored.push({ id: w.nextId++, pos, radius, height, kind: 'rock' });
  };
  const arc = (from: number, to: number) => {
    // Adjacent disks overlap, so their visual seams cannot become accidental exits.
    for (let index = 0; index <= 8; index++) {
      const angle = from + (to - from) * index / 8;
      stone(Math.cos(angle) * WALL_RADIUS, Math.sin(angle) * WALL_RADIUS, ROCK_RADIUS, 7 + index % 3);
    }
  };
  const narrowHalfAngle = Math.asin((ROCK_RADIUS + WEST_GAP / 2) / WALL_RADIUS);
  arc(25 * Math.PI / 180, Math.PI - narrowHalfAngle);
  arc(Math.PI + narrowHalfAngle, 335 * Math.PI / 180);
  // The centre prevents a straight cut between opposite openings: follow the living ring.
  stone(0, 0, 4.2, 9);

  site.refuges = [point(-21, -8), point(22, 7)];
  // Western landing is in the real still-water band; eastern landing remains exposed.
  stone(-23.5, -4.8, 2.4, 7);
  stone(-17.5, -11, 2.4, 6);
  w.obstacles.push(...authored);
  Object.assign(site.source, vortexSourceAt(w.time));
  Object.assign(mother.pos, site.source);

  const nursery = w.landmarks.find(landmark => landmark.kind === 'nest')?.pos;
  // Remove only this patch's ordinary food embedded in a new wall. The live
  // mother, planted identity, other patches and guaranteed nursery food survive.
  w.resources = w.resources.filter(resource =>
    resource.patch !== site.patch || resource.id === site.sourceId || resource.id === site.plantedId ||
    nursery && horizontalDistance(resource.pos, nursery) < 18 ||
    !authored.some(rock => horizontalDistance(resource.pos, rock.pos) < rock.radius + 1),
  );
}
