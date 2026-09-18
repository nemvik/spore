import type { Obstacle, Vec3, World } from './types';

const EPSILON = 1e-10;
const finite = (p: Vec3) => Number.isFinite(p.x + p.y + p.z);

/** First entry into a finite, padded cylinder. Contact tangents remain passable.
 * An already overlapping body may move toward its nearest exit without a snap. */
export function obstacleSegmentEntry(from: Vec3, to: Vec3, obstacle: Obstacle, padding = 0): number | null {
  if (!finite(from) || !finite(to) || !finite(obstacle.pos) || !Number.isFinite(padding + obstacle.radius + obstacle.height) || padding < 0) return null;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const x = from.x - obstacle.pos.x, z = from.z - obstacle.pos.z, radius = obstacle.radius + padding;
  const bottom = obstacle.pos.y - padding, top = obstacle.pos.y + obstacle.height + padding;
  const radial2 = x * x + z * z, speed2 = dx * dx + dz * dz;
  // A rounded contact can be reported again at t=0 after its inward
  // component was removed. A tangent/outward ray cannot re-enter this convex
  // side; skip only this cylinder so other walls and finite caps still resolve.
  // Include the cancellation error of to - from: a projected tangent is first
  // added to world coordinates, then subtracted here. Its low bits can be lost
  // before the dot product, especially far from the origin.
  const dot = x * dx + z * dz;
  const tangentRoundoff = 8 * Number.EPSILON * (
    Math.abs(x * dx) + Math.abs(z * dz)
    + Math.abs(x) * (Math.abs(from.x) + Math.abs(to.x))
    + Math.abs(z) * (Math.abs(from.z) + Math.abs(to.z))
  );
  if (radial2 >= radius * radius - EPSILON && dot >= -tangentRoundoff) return null;
  let enter = 0, leave = 1;
  if (speed2 < EPSILON * EPSILON) {
    if (radial2 >= radius * radius - EPSILON) return null;
  } else {
    const dot = x * dx + z * dz, discriminant = dot * dot - speed2 * (radial2 - radius * radius);
    if (discriminant <= 0) return null;
    const root = Math.sqrt(discriminant);
    enter = Math.max(enter, (-dot - root) / speed2); leave = Math.min(leave, (-dot + root) / speed2);
  }
  if (Math.abs(dy) < EPSILON) {
    if (from.y <= bottom + EPSILON || from.y >= top - EPSILON) return null;
  } else {
    const a = (bottom - from.y) / dy, b = (top - from.y) / dy;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
  }
  if (leave - enter <= EPSILON || leave < 0 || enter > 1) return null;
  const inside = radial2 < radius * radius - EPSILON && from.y > bottom + EPSILON && from.y < top - EPSILON;
  if (inside) {
    const radialOutward = speed2 > EPSILON * EPSILON && x * dx + z * dz >= -EPSILON;
    const verticalOutward = Math.abs(dy) > EPSILON && (from.y - (bottom + top) / 2) * dy >= -EPSILON;
    if (radialOutward || verticalOutward) return null;
  }
  return Math.max(0, enter);
}

export function contactNormal(point: Vec3, obstacle: Obstacle, radius: number): Vec3 {
  const x = point.x - obstacle.pos.x, z = point.z - obstacle.pos.z, radial = Math.hypot(x, z);
  const below = Math.abs(point.y - obstacle.pos.y + radius), above = Math.abs(point.y - obstacle.pos.y - obstacle.height - radius);
  const side = Math.abs(radial - obstacle.radius - radius);
  if (below <= side + EPSILON && below <= above) return { x: 0, y: -1, z: 0 };
  if (above <= side + EPSILON) return { x: 0, y: 1, z: 0 };
  return radial > EPSILON ? { x: x / radial, y: 0, z: z / radial } : { x: Math.cos(obstacle.id), y: 0, z: Math.sin(obstacle.id) };
}

/** Sweep a circular body through finite columns, then slide along the contact.
 * Caps stop vertical movement; they never eject the body sideways to the rim.
 * World bounds and terrain clearance remain the caller's responsibility. */
export function resolveObstacleMotion(world: World, from: Vec3, to: Vec3, radius: number): Vec3 {
  if (!finite(from) || !finite(to) || !Number.isFinite(radius) || radius < 0) return { ...from };
  if (world.stage === 0) {
    // Preserve the microscopic endpoint projection, including its deterministic
    // exact-centre escape. Its obstacles have always filled the movement plane.
    const position = { ...to, y: 1.1 };
    for (const obstacle of world.obstacles) {
      const dx = position.x - obstacle.pos.x, dz = position.z - obstacle.pos.z, d = Math.hypot(dx, dz), bound = obstacle.radius + radius;
      if (d < bound) {
        const angle = d < .001 ? obstacle.id : Math.atan2(dz, dx);
        position.x = obstacle.pos.x + Math.cos(angle) * bound; position.z = obstacle.pos.z + Math.sin(angle) * bound;
      }
    }
    return position;
  }
  let position = { ...from }, remaining = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  for (let iteration = 0; iteration < 6; iteration++) {
    if (Math.hypot(remaining.x, remaining.y, remaining.z) < EPSILON) break;
    const destination = { x: position.x + remaining.x, y: position.y + remaining.y, z: position.z + remaining.z };
    let entry = Infinity, contact: Obstacle | null = null;
    for (const obstacle of world.obstacles) {
      const hit = obstacleSegmentEntry(position, destination, obstacle, radius);
      if (hit !== null && (hit < entry - EPSILON || Math.abs(hit - entry) <= EPSILON && (!contact || obstacle.id < contact.id))) { entry = hit; contact = obstacle; }
    }
    if (!contact) return destination;
    position = { x: position.x + remaining.x * entry, y: position.y + remaining.y * entry, z: position.z + remaining.z * entry };
    const normal = contactNormal(position, contact, radius);
    remaining = { x: remaining.x * (1 - entry), y: remaining.y * (1 - entry), z: remaining.z * (1 - entry) };
    const inward = remaining.x * normal.x + remaining.y * normal.y + remaining.z * normal.z;
    if (inward >= -EPSILON) break;
    remaining.x -= normal.x * inward; remaining.y -= normal.y * inward; remaining.z -= normal.z * inward;
  }
  return position;
}
