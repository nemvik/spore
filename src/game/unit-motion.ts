import type { UnitNavigation } from './era-types';
import type { Vec3, World } from './types';
import { steerToward } from './navigation';
import { resolveObstacleMotion } from './obstacle-geometry';
import { clamp, groundHeight, horizontalDistance } from './random';

export interface MovingUnit { id: number; pos: Vec3; heading: number; navigation: UnitNavigation; }
export const unitNavigation = (pos: Vec3): UnitNavigation => ({ waypoint: { ...pos }, target: { ...pos }, rethink: 0 });

/** Stable placement around an inherited landmark without rewriting its obstacles. */
export function openGround(world: World, center: Vec3, offset = 0, spacing = 2.5, clearance = 1.3): Vec3 {
  for (let ring = 0; ring < 22; ring++) for (let i = 0; i < 16; i++) {
    const angle = (i + offset * 3) * Math.PI / 8;
    const x = clamp(center.x + Math.sin(angle) * (spacing + ring * 1.4), -74, 74);
    const z = clamp(center.z + Math.cos(angle) * (spacing + ring * 1.4), -74, 74);
    if (world.obstacles.every(o => Math.hypot(o.pos.x - x, o.pos.z - z) > o.radius + clearance)) return { x, y: groundHeight(x, z, world.stage) + .8, z };
  }
  return { ...center, y: groundHeight(center.x, center.z, world.stage) + .8 };
}

/** Existing local obstacle steering + separation from one frozen position set.
 * Cache the expensive route, while applying swept collision every fixed step. */
export function moveUnit(world: World, unit: MovingUnit, target: Vec3, neighbours: readonly { id: number; pos: Vec3 }[], speed: number, dt: number, stop = 1.5, radius = .72, separationRadius = radius, completeGraph = false): boolean {
  const gap = horizontalDistance(unit.pos, target);
  if (gap <= stop) return true;
  const nav = unit.navigation;
  nav.rethink -= dt;
  if (nav.rethink <= 0 || horizontalDistance(nav.target, target) > 1) {
    nav.target = { ...target };
    nav.waypoint = steerToward(world, unit.pos, target, radius, unit.heading, completeGraph);
    nav.rethink = .45 + (unit.id % 5) * .025;
  }
  const dx = nav.waypoint.x - unit.pos.x, dz = nav.waypoint.z - unit.pos.z, distance = Math.hypot(dx, dz);
  // Match the route planner's arrival epsilon: stopping earlier can leave a
  // unit permanently requesting the same corner waypoint a few cm away.
  if (distance < .02) { nav.rethink = 0; return false; }
  let sx = 0, sz = 0;
  for (const other of neighbours) if (other.id !== unit.id) {
    const x = unit.pos.x - other.pos.x, z = unit.pos.z - other.pos.z, d = Math.hypot(x, z);
    if (d > 1e-5 && d < separationRadius * 2.8) { const strength = (separationRadius * 2.8 - d) / (separationRadius * 2.8); sx += x / d * strength; sz += z / d * strength; }
    else if (d <= 1e-5) sx += unit.id < other.id ? -1 : 1;
  }
  const travel = Math.min(speed, distance / Math.max(dt, .001), Math.max(0, gap - stop) / Math.max(dt, .001));
  const vx = dx / distance * travel + sx * speed * .48, vz = dz / distance * travel + sz * speed * .48;
  const from = { ...unit.pos }, to = { x: clamp(from.x + vx * dt, -76, 76), y: from.y, z: clamp(from.z + vz * dt, -76, 76) };
  unit.pos = resolveObstacleMotion(world, from, to, radius);
  unit.pos.y = groundHeight(unit.pos.x, unit.pos.z, world.stage) + .8;
  if (horizontalDistance(from, unit.pos) > .001) unit.heading = Math.atan2(unit.pos.x - from.x, unit.pos.z - from.z);
  return horizontalDistance(unit.pos, target) <= stop + .05;
}
