import type { Obstacle, Vec3, World } from './types';
import { groundHeight } from './random';
import { WORLD_BOUND } from './world';
import { obstacleSegmentEntry } from './obstacle-geometry';

const MAX_LOCAL_OBSTACLES = 12;
const SIDES = 8;
const MARGIN = .14;
const EPSILON = 1e-7;
const ARRIVAL_DISTANCE = .02;
const length = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const finite = (p: Vec3) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

function segmentDistance2(a: Vec3, b: Vec3, p: Vec3): number {
  const dx = b.x - a.x, dz = b.z - a.z, squared = dx * dx + dz * dz;
  const t = squared > EPSILON ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / squared)) : 0;
  return (a.x + dx * t - p.x) ** 2 + (a.z + dz * t - p.z) ** 2;
}

function intersects(a: Vec3, b: Vec3, o: Obstacle, radius: number, stage: number): boolean {
  if (stage === 1) return obstacleSegmentEntry(a, b, o, radius) !== null;
  const dx = b.x - a.x, dz = b.z - a.z, squared = dx * dx + dz * dz, bound = o.radius + radius;
  let enter = 0, leave = 1;
  if (squared < EPSILON) {
    if ((a.x - o.pos.x) ** 2 + (a.z - o.pos.z) ** 2 >= bound * bound - EPSILON) return false;
  } else {
    const center = ((o.pos.x - a.x) * dx + (o.pos.z - a.z) * dz) / squared;
    const separation = (a.x + dx * center - o.pos.x) ** 2 + (a.z + dz * center - o.pos.z) ** 2;
    if (separation >= bound * bound - EPSILON) return false;
    const half = Math.sqrt((bound * bound - separation) / squared);
    enter = Math.max(0, center - half); leave = Math.min(1, center + half);
    if (enter > leave - EPSILON) return false;
  }
  return true;
}

function clear(world: World, a: Vec3, b: Vec3, radius: number): boolean {
  if (Math.abs(b.x) > WORLD_BOUND - radius || Math.abs(b.z) > WORLD_BOUND - radius) return false;
  if (world.stage === 1) {
    if (b.y > 12 || b.y < groundHeight(b.x, b.z, 1) + 1.3) return false;
    // The seabed is smooth; short samples reject a diagonal route through a ridge.
    for (const t of [.25, .5, .75]) {
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      if (a.y + (b.y - a.y) * t < groundHeight(x, z, 1) + 1.3) return false;
    }
  }
  return !world.obstacles.some(o => intersects(a, b, o, radius, world.stage));
}

/**
 * Return an absolute, currently visible next waypoint, never a position update.
 * Direct routes return immediately. Blocked routes
 * search at most twelve nearby obstacle rings, with finite-height reef shortcuts.
 * The caller moves normally and retains its collision constraint. At a 2 Hz think
 * rate, cap velocity to distance(waypoint) / .5 to avoid overshooting a corner.
 * No path returns start. Existing heading only breaks nearly equal route choices.
 */
export function steerToward(world: World, start: Vec3, target: Vec3, bodyRadius: number, previousHeading: number): Vec3 {
  if (!finite(start) || !finite(target) || !Number.isFinite(bodyRadius) || bodyRadius < 0) {
    return { x: Number.isFinite(start.x) ? start.x : 0, y: Number.isFinite(start.y) ? start.y : 0, z: Number.isFinite(start.z) ? start.z : 0 };
  }
  const physicalRadius = Math.max(.05, bodyRadius);
  const radius = physicalRadius + MARGIN;
  const goal = { x: Math.max(-WORLD_BOUND + radius, Math.min(WORLD_BOUND - radius, target.x)), y: world.stage === 1 ? Math.max(groundHeight(target.x, target.z, 1) + 1.3, Math.min(12, target.y)) : start.y, z: Math.max(-WORLD_BOUND + radius, Math.min(WORLD_BOUND - radius, target.z)) };
  if (length(start, goal) < ARRIVAL_DISTANCE) return { ...start };
  if (clear(world, start, goal, radius)) return goal;

  // Spawns and imported valid saves can begin against a collision shell. Let them
  // leave it by a short outward step, without ever snapping to a perimeter.
  const containing = world.obstacles.filter(o => intersects(start, start, o, radius, world.stage));
  if (containing.length) {
    let best: Vec3 | null = null, bestPenetration = Infinity;
    for (let i = 0; i < 16; i++) {
      const angle = (Number.isFinite(previousHeading) ? previousHeading : 0) + i * Math.PI / 8;
      const point = { x: start.x + Math.sin(angle), y: start.y, z: start.z + Math.cos(angle) };
      if (Math.abs(point.x) > WORLD_BOUND - radius || Math.abs(point.z) > WORLD_BOUND - radius) continue;
      if (world.obstacles.some(o => {
        if (!intersects(start, point, o, physicalRadius, world.stage)) return false;
        // A clearance-margin escape must not cut across the physical obstacle.
        if (!intersects(start, start, o, physicalRadius, world.stage)) return true;
        return (start.x - o.pos.x) * (point.x - start.x) + (start.z - o.pos.z) * (point.z - start.z) < -EPSILON;
      })) continue;
      const penetration = containing.reduce((sum, o) => sum + Math.max(0, o.radius + radius - Math.hypot(point.x - o.pos.x, point.z - o.pos.z)), 0);
      if (penetration < bestPenetration) { best = point; bestPenetration = penetration; }
    }
    return best ?? { ...start };
  }

  const relevant = world.obstacles.filter(o => segmentDistance2(start, goal, o.pos) < (o.radius + radius + 8) ** 2 || Math.hypot(o.pos.x - start.x, o.pos.z - start.z) < o.radius + radius + 12)
    .sort((a, b) => Math.hypot(a.pos.x - start.x, a.pos.z - start.z) - Math.hypot(b.pos.x - start.x, b.pos.z - start.z) || a.id - b.id).slice(0, MAX_LOCAL_OBSTACLES);
  const nodes: Vec3[] = [{ ...start }, goal];
  // A ring vertex already reached is the start node, not another first hop.
  // Otherwise its zero-length edge can evade the initial turn cost and win the
  // search forever, leaving a forager beside a tree with food still ahead.
  const add = (point: Vec3) => { if (length(start, point) >= ARRIVAL_DISTANCE && clear(world, point, point, radius)) nodes.push(point); };
  const lineX = goal.x - start.x, lineZ = goal.z - start.z, line2 = lineX * lineX + lineZ * lineZ;
  for (const obstacle of relevant) {
    // Circumscribed rings keep every edge outside the expanded body collision,
    // including the chord between adjacent vertices around the same rock.
    const ring = (obstacle.radius + radius) / Math.cos(Math.PI / SIDES) + .03;
    const t = line2 < EPSILON ? 0 : Math.max(0, Math.min(1, ((obstacle.pos.x - start.x) * lineX + (obstacle.pos.z - start.z) * lineZ) / line2));
    const y = start.y + (goal.y - start.y) * t;
    for (let i = 0; i < SIDES; i++) {
      const angle = i * Math.PI * 2 / SIDES;
      add({ x: obstacle.pos.x + Math.sin(angle) * ring, y, z: obstacle.pos.z + Math.cos(angle) * ring });
    }
    const over = obstacle.pos.y + obstacle.height + radius + .12;
    if (world.stage === 1 && over < 12 && over > Math.min(start.y, goal.y) + .2) {
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        add({ x: obstacle.pos.x + Math.sin(angle) * ring, y: over, z: obstacle.pos.z + Math.cos(angle) * ring });
      }
    }
    const under = obstacle.pos.y - radius - .12;
    if (world.stage === 1 && under < Math.max(start.y, goal.y) - .2) {
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        add({ x: obstacle.pos.x + Math.sin(angle) * ring, y: under, z: obstacle.pos.z + Math.cos(angle) * ring });
      }
    }
  }

  const count = nodes.length, costs = new Float64Array(count).fill(Infinity), parents = new Int16Array(count).fill(-1), visited = new Uint8Array(count), visibility = new Uint8Array(count * count);
  const heading = Number.isFinite(previousHeading) ? previousHeading : 0;
  costs[0] = 0;
  let reached = -1;
  for (let iteration = 0; iteration < count; iteration++) {
    let current = -1, priority = Infinity;
    for (let i = 0; i < count; i++) if (!visited[i]) {
      const score = costs[i] + length(nodes[i], goal);
      if (score < priority - EPSILON) { priority = score; current = i; }
    }
    if (current < 0) break;
    if (current === 1) { reached = current; break; }
    visited[current] = 1;
    for (let next = 1; next < count; next++) {
      if (visited[next] || next === current) continue;
      const edge = length(nodes[current], nodes[next]);
      const initialTurn = current === 0 ? .1 * (1 - Math.cos(Math.atan2(nodes[next].x - start.x, nodes[next].z - start.z) - heading)) : 0;
      const cost = costs[current] + edge + initialTurn;
      if (cost >= costs[next] - EPSILON) continue;
      const key = current * count + next;
      if (!visibility[key]) visibility[key] = visibility[next * count + current] = clear(world, nodes[current], nodes[next], radius) ? 1 : 2;
      if (visibility[key] !== 1) continue;
      costs[next] = cost; parents[next] = current;
    }
  }
  if (reached < 0) {
    // On a long route, an obstacle outside this local graph may hide the final
    // target. Continue to a reachable frontier only if it makes real progress.
    let nearest = length(start, goal) - .2;
    for (let i = 2; i < count; i++) if (Number.isFinite(costs[i]) && length(nodes[i], goal) < nearest) { nearest = length(nodes[i], goal); reached = i; }
  }
  if (reached < 0) return { ...start };
  while (parents[reached] > 0) reached = parents[reached];
  return parents[reached] === 0 ? { ...nodes[reached] } : { ...start };
}
