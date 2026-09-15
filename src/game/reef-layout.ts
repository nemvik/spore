import type { EcologySite } from './journey-types';
import type { Obstacle, Resource, Vec3, World } from './types';
import { groundHeight, horizontalDistance } from './random';

type Column = readonly [x: number, z: number, radius: number, top: number, kind: 'rock' | 'coral'];

// Tops are world heights, not heights above the uneven seabed. Low stone baffles
// can be crossed above; branching pinnacles leave genuinely different high routes.
const RIBBON_COLUMNS: readonly Column[] = [
  [-6.8, -13, 2.7, 3.7, 'rock'], [-6.8, -6.8, 2.7, 7.1, 'coral'],
  [-6.8, -.6, 2.7, 10.7, 'coral'], [-6.8, 5.6, 2.7, 6, 'rock'],
  [6.8, -9, 2.7, 10.7, 'coral'], [6.8, -2.8, 2.7, 3.2, 'rock'],
  [6.8, 3.4, 2.7, 6.8, 'rock'], [6.8, 9.6, 2.7, 9.2, 'coral'],
  [-14, 11, 3, 12.8, 'coral'], [14, -15, 3.1, 12.6, 'coral'],
  [16.6, 15.4, 2.5, 9.3, 'rock'], [-19.6, -14.4, 2.2, 7.1, 'rock'],
];
const VENT_COLUMNS: readonly Column[] = [
  [-5.4, -16, 2.45, 7.5, 'coral'], [-5.4, -10, 2.45, 10.8, 'coral'],
  [-5.4, -4, 2.45, 5.5, 'rock'], [-5.4, 2, 2.45, 10.8, 'coral'],
  [-5.4, 8, 2.45, 8, 'coral'], [5.4, -13, 2.45, 10.8, 'coral'],
  [5.4, -7, 2.45, 5.5, 'rock'], [5.4, -1, 2.45, 10.8, 'coral'],
  [5.4, 5, 2.45, 6.7, 'rock'], [0, -10, 2.1, 3, 'rock'],
  [-14, -10, 2.8, 6.2, 'rock'], [-14, 3, 2.8, 8.7, 'rock'],
  [-14, 14, 2.8, 4.1, 'rock'], [13, 13, 3.1, 12.7, 'coral'],
  [13, -17, 3.1, 12.6, 'coral'],
];

const smooth = (value: number): number => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const neutral = () => ({ oxygenUse: 0, flow: { x: 0, y: 0, z: 0 } });

function local(center: Pick<Vec3, 'x' | 'z'>, x: number, y: number, z: number): Vec3 { return { x: center.x + x, y, z: center.z + z }; }
function sourceHeight(center: Pick<Vec3, 'x' | 'z'>): number { return groundHeight(center.x, center.z, 1) + 3; }

/** The persistent low mother colony identifies an authored room without save-only flags. */
function authoredSource(w: World, patch: number, movingSourceId?: number): Resource | undefined {
  const center = w.patches[patch]?.center; if (!center) return undefined;
  if (patch === 1 && movingSourceId !== undefined) return w.resources.find(r => r.id === movingSourceId && r.patch === 1 && r.kind === 'algae' && r.max >= 12);
  return w.resources.find(resource => resource.patch === patch && resource.kind === (patch === 1 ? 'algae' : 'mineral') && resource.max >= 12 && horizontalDistance(resource.pos, center) < .02 && Math.abs(resource.pos.y - sourceHeight(center)) < .02);
}

function clear(w: World, pos: Vec3, radius: number): boolean {
  return pos.x >= -77 && pos.x <= 77 && pos.z >= -77 && pos.z <= 77 && pos.y >= groundHeight(pos.x, pos.z, 1) + 1.3 && pos.y <= 12 &&
    w.obstacles.every(column => pos.y > column.pos.y + column.height + radius || pos.y < column.pos.y - radius || horizontalDistance(pos, column.pos) >= column.radius + radius);
}

/** Preserve food identities: a newly built terrace lifts food onto its real top. */
function accessiblePosition(w: World, position: Vec3): Vec3 {
  const radius = 1.5;
  if (clear(w, position, radius)) return position;
  const above = { ...position };
  for (const column of w.obstacles) if (horizontalDistance(above, column.pos) < column.radius + radius) above.y = Math.max(above.y, column.pos.y + column.height + radius + .08);
  if (clear(w, above, radius)) return above;
  for (let ring = 1; ring <= 32; ring++) for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI / 12, x = position.x + Math.cos(angle) * ring * 1.3, z = position.z + Math.sin(angle) * ring * 1.3;
    const candidate = { x, y: Math.max(position.y, groundHeight(x, z, 1) + 1.6), z };
    if (clear(w, candidate, radius)) return candidate;
  }
  // This is an authoring failure, not permission to silently bury a live resource.
  throw new Error('Authored reef has no accessible position for a living resource.');
}

/**
 * Fresh stage-1 authoring, after the generic source/refuge shelters. The ribbon
 * room has a low central well and alternating-height side aisles. The vent has
 * a short submerged gorge, an overpass above its low baffle, and a longer western
 * flank with rising coral cover. Every column is a normal finite collider.
 * No RNG, currencies, populations, regeneration rates or old saves are changed.
 */
export function authorReef(w: World, sites: EcologySite[]): void {
  if (w.stage !== 1) return;
  let changed = false;
  for (const id of [4, 5]) {
    const site = sites.find(site => site.id === id && site.stage === 1);
    if (!site || site.patch !== id - 3 || site.observed || site.resolved || site.plantedId !== null) continue;
    const mother = w.resources.find(resource => resource.id === site.sourceId), center = w.patches[site.patch]?.center;
    if (!mother || !center || authoredSource(w, site.patch)?.id === mother.id) continue;
    const radius = id === 4 ? 29 : 26;
    w.obstacles = w.obstacles.filter(column => horizontalDistance(column.pos, center) >= radius + column.radius);
    const columns = id === 4 ? RIBBON_COLUMNS : VENT_COLUMNS;
    for (const [x, z, radius, top, kind] of columns) {
      const position = local(center, x, 0, z); position.y = groundHeight(position.x, position.z, 1);
      const column: Obstacle = { id: w.nextId++, kind, pos: position, radius, height: top - position.y };
      w.obstacles.push(column);
    }
    Object.assign(site.source, local(center, 0, sourceHeight(center), 0)); Object.assign(mother.pos, site.source);
    if (id === 4) site.refuges = [local(center, 13, 10.8, 16), local(center, -16, 8.6, -14)];
    else site.refuges = [{ x: -9, y: 9, z: -57 }, { x: 9, y: 10.8, z: -57 }];
    changed = true;
  }
  if (!changed) return;
  // Generic node shelters can also intersect ordinary food. Keep every resource,
  // including the nursery and other patches, and repair only an actual overlap.
  for (const resource of w.resources) {
    const accessible = accessiblePosition(w, resource.pos);
    if (accessible !== resource.pos) Object.assign(resource.pos, accessible);
  }
  for (const creature of w.creatures) {
    const accessible = accessiblePosition(w, creature.pos);
    if (accessible !== creature.pos) { Object.assign(creature.pos, accessible); creature.velocity = { x: 0, y: 0, z: 0 }; }
  }
}

/**
 * Additional oxygen points/s and the full local flow in metres/s. The caller keeps
 * normal respiration and gill exchange; outside these rooms oxygenUse is exactly
 * zero. This query never consumes RNG or alters world/site/actor state.
 */
export function reefConditions(w: World, pos: Vec3, movingSourceId?: number): { oxygenUse: number; flow: Vec3 } {
  if (w.stage !== 1 || !Number.isFinite(pos.x + pos.y + pos.z) || pos.y >= 10.5 || pos.y < groundHeight(pos.x, pos.z, 1)) return neutral();
  let patch = -1, radial = 0;
  for (const candidate of [1, 2]) {
    const center = w.patches[candidate]?.center; if (!center) continue;
    const radius = horizontalDistance(pos, center), extent = candidate === 1 ? 18 : 24;
    if (radius < extent && authoredSource(w, candidate, movingSourceId)) { patch = candidate; radial = smooth(1 - radius / extent); break; }
  }
  if (patch < 0) return neutral();
  const center = w.patches[patch].center, dx = pos.x - center.x, dz = pos.z - center.z, radius = Math.max(.001, Math.hypot(dx, dz));
  let exposure = 1;
  for (const column of w.obstacles) {
    // A short terrace shelters water beside it, never the open water above it.
    if (pos.y > column.pos.y + column.height + .5 || pos.y < column.pos.y) continue;
    const gap = horizontalDistance(pos, column.pos) - column.radius;
    if (gap < 0 && pos.y <= column.pos.y + column.height) return neutral();
    if (gap < 3) exposure = Math.min(exposure, smooth((gap - .3) / 2.7));
  }
  const depth = smooth((10.5 - pos.y) / 12), force = radial * depth * exposure;
  if (patch === 1) return { oxygenUse: 1.5 * radial * smooth((6 - pos.y) / 9) * (.18 + .82 * exposure), flow: { x: -dx / radius * .55 * force, y: -2.1 * force, z: -dz / radius * .55 * force } };
  const pulse = Math.sin((Number.isFinite(w.time) ? w.time : 0) * .55);
  const gas = radial * smooth((5.5 - pos.y) / 8.5) * (.18 + .82 * exposure);
  return { oxygenUse: gas * (5 + 1.6 * pulse), flow: { x: -dz / radius * 1.8 * force, y: (1.35 + 2.65 * pulse) * force, z: dx / radius * 1.8 * force } };
}
