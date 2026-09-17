import { attachmentAngles } from './body-profile';
import { limbTissue, sampleCreatureSection } from './creature-body';
import type { LimbEnd } from './creature-body';
import type { CreatureGenome, Vec3 } from './types';

export interface BodyFrame { point: Vec3; normal: Vec3; tangent: Vec3 }
export interface ResolvedLimb {
  partId: string; side: -1 | 1; root: Vec3; points: Vec3[];
  /** Points, lengths, radii and end.scale already include the source part scale. */
  lengths: number[]; radii: number[]; end: LimbEnd;
}
export interface ContactSphere { center: Vec3; radius: number }
export interface CreatureAnatomy {
  limbs: ResolvedLimb[]; hull: ContactSphere[];
  bounds: { min: Vec3; max: Vec3 };
  groundClearance: number; supportCount: number;
  bodyVolume: number; limbMass: number; stanceErrors: string[];
}
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const normalize = (a: Vec3): Vec3 => { const n = norm(a) || 1; return { x: a.x / n, y: a.y / n, z: a.z / n }; };
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const radialProfile = (a: number) => Math.pow(Math.max(0, 1 - a * a), .48) * (1 + .15 * a);

/** Authoritative ribbed render surface. Cross sections remain in XY planes. */
export function creatureSurfacePoint(g: CreatureGenome, axial: number, angle: number): Vec3 {
  const a = Math.max(-1, Math.min(1, axial)), section = sampleCreatureSection(g, a);
  const rib = 1 + .035 * Math.sin((a + 1) / 2 * 7 * Math.PI) * Math.cos(angle) ** 2;
  const profile = radialProfile(a) * rib;
  return { x: Math.sin(angle) * .69 * g.width * profile * section.width,
    y: Math.cos(angle) * .62 * g.width * profile * section.height + .13 * a * a + section.bend * g.width,
    z: a * 1.76 * g.length };
}

export function creatureAttachment(g: CreatureGenome, axial: number, angle: number): BodyFrame {
  // Clamp attachments away from the closed poles, just as historical organs do.
  const a = Math.max(-.93, Math.min(.93, axial)), epsilon = .001;
  const point = creatureSurfacePoint(g, a, angle);
  const tangent = normalize(subtract(creatureSurfacePoint(g, a + epsilon, angle), creatureSurfacePoint(g, a - epsilon, angle)));
  const angular = subtract(creatureSurfacePoint(g, a, angle + epsilon), creatureSurfacePoint(g, a, angle - epsilon));
  let normal = normalize(cross(tangent, angular));
  const section = sampleCreatureSection(g, a);
  if (normal.x * point.x + normal.y * (point.y - section.bend * g.width - .13 * a * a) < 0) normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  return { point, normal, tangent };
}

/** 64 midpoint cross sections; analytic angular integral includes the visible ribs. */
export function creatureBodyVolume(g: CreatureGenome): number {
  let volume = 0, neutral = 0;
  for (let i = 0; i < 64; i++) {
    const a = -1 + (i + .5) * 2 / 64, section = sampleCreatureSection(g, a);
    const rib = .035 * Math.sin((a + 1) / 2 * 7 * Math.PI);
    const area = radialProfile(a) ** 2 * (1 + rib + 3 / 8 * rib ** 2);
    neutral += area; volume += area * section.width * section.height;
  }
  return g.length * g.width * g.width * volume / neutral;
}

export function creatureBodyGroundClearance(g: CreatureGenome): number {
  // Split at authored nodes and fine radial-profile intervals. Refine each interval:
  // a fixed ring grid alone can miss a low bend and put the rendered trunk underground.
  const cuts = [...new Set([...Array.from({ length: 65 }, (_, i) => -1 + i / 32), ...g.body.spine.map(n => n.axial)])].sort((a, b) => a - b);
  const height = (axial: number) => creatureSurfacePoint(g, axial, Math.PI).y;
  let lowest = Math.min(...cuts.map(height));
  const ratio = (Math.sqrt(5) - 1) / 2;
  for (let i = 1; i < cuts.length; i++) {
    let left = cuts[i - 1], right = cuts[i];
    let a = right - ratio * (right - left), b = left + ratio * (right - left);
    let ya = height(a), yb = height(b);
    for (let iteration = 0; iteration < 32; iteration++) {
      if (ya < yb) { right = b; b = a; yb = ya; a = right - ratio * (right - left); ya = height(a); }
      else { left = a; a = b; ya = yb; b = left + ratio * (right - left); yb = height(b); }
    }
    lowest = Math.min(lowest, ya, yb);
  }
  return Math.max(0, -lowest);
}

const installedAnatomy = new WeakMap<CreatureGenome, CreatureAnatomy>();
/** Only simulation's installed generation boundary opts into identity reuse.
 * Deep protection is essential: plain mutable genomes must always derive afresh.
 * Replacing/cloning a genome starts a new generation cache entry automatically.
 */
export function prepareInstalledCreatureAnatomy(g: CreatureGenome): CreatureAnatomy {
  const existing = installedAnatomy.get(g); if (existing) return existing;
  const protect = (value: object): void => { for (const child of Object.values(value)) if (child && typeof child === 'object') protect(child); Object.freeze(value); };
  protect(g);
  const anatomy = resolveCreatureAnatomy(g); protect(anatomy); installedAnatomy.set(g, anatomy); return anatomy;
}

export function resolveCreatureAnatomy(g: CreatureGenome): CreatureAnatomy {
  const installed = installedAnatomy.get(g); if (installed) return installed;
  const limbs: ResolvedLimb[] = [], hull: ContactSphere[] = [];
  const bounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  const include = (p: Vec3, radius = 0) => {
    for (const key of ['x', 'y', 'z'] as const) { bounds.min[key] = Math.min(bounds.min[key], p[key] - radius); bounds.max[key] = Math.max(bounds.max[key], p[key] + radius); }
  };
  for (let i = 0; i <= 64; i++) {
    const a = -1 + i / 32, section = sampleCreatureSection(g, a);
    const center = { x: 0, y: section.bend * g.width + .13 * a * a, z: a * 1.76 * g.length };
    let radius = 0;
    for (let j = 0; j < 24; j++) { const point = creatureSurfacePoint(g, a, j * Math.PI / 12); include(point); radius = Math.max(radius, norm(subtract(point, center))); }
    hull.push({ center, radius });
  }
  let limbMass = 0;
  for (const part of g.parts) {
    if (!part.limb || part.kind !== 'legs' && part.kind !== 'arms') continue;
    const limb = part.limb;
    limbMass += (.08 * limbTissue(limb) + (limb.end.kind === 'none' ? 0 : .05 * limb.end.scale)) * part.scale * (part.mirrored ? 1.6 : 1);
    for (const angle of attachmentAngles(part)) {
      const root = creatureAttachment(g, part.axial, angle).point, side = Math.sin(angle) < 0 ? -1 : 1;
      const points = [{ ...root }, ...limb.joints.map(j => ({ x: root.x + j.offset.x * part.scale * side, y: root.y + j.offset.y * part.scale, z: root.z + j.offset.z * part.scale }))];
      const radii = limb.joints.map(j => j.radius * part.scale);
      const lengths = points.slice(1).map((p, i) => norm(subtract(p, points[i])));
      points.forEach((p, i) => include(p, radii[Math.max(0, i - 1)]));
      limbs.push({ partId: part.id, side, root, points, lengths, radii, end: limb.end.kind === 'none' ? { kind: 'none' } : { ...limb.end, scale: limb.end.scale * part.scale } });
    }
  }
  const feet = limbs.filter(l => l.end.kind === 'foot'), stanceErrors: string[] = [];
  const trunkClearance = creatureBodyGroundClearance(g);
  const heights = feet.map(l => -l.points.at(-1)!.y).sort((a, b) => a - b);
  const mid = Math.floor(heights.length / 2);
  const median = heights.length ? heights.length % 2 ? heights[mid] : (heights[mid - 1] + heights[mid]) / 2 : 0;
  let lower = trunkClearance, upper = Infinity;
  const intervals = feet.map(limb => {
    const foot = limb.points.at(-1)!, horizontal = Math.hypot(foot.x - limb.root.x, foot.z - limb.root.z);
    const sum = limb.lengths.reduce((a, b) => a + b, 0), min = Math.max(0, 2 * Math.max(...limb.lengths) - sum);
    const lo = Math.sqrt(Math.max(0, min * min - horizontal * horizontal)) - limb.root.y;
    const hi = horizontal > sum + 1e-8 ? -Infinity : Math.sqrt(Math.max(0, sum * sum - horizontal * horizontal)) - limb.root.y;
    lower = Math.max(lower, lo); upper = Math.min(upper, hi);
    return { limb, lo, hi };
  });
  if (feet.length < 2) stanceErrors.push('Postoj potřebuje alespoň dvě chodidla; přidej nohu s chodidlem.');
  if (lower > upper + 1e-8) {
    for (const { limb, lo, hi } of intervals) if (hi < lower - 1e-8 || lo > upper + 1e-8) stanceErrors.push(`Noha ${limb.partId} (${limb.side < 0 ? 'levá' : 'pravá'}) nedosáhne společného postoje; prodluž kosti nebo přesuň úchyt.`);
  }
  const initial = Math.max(trunkClearance, median);
  const groundClearance = lower <= upper + 1e-8 ? Math.max(lower, Math.min(upper, initial)) : initial;
  return { limbs, hull, bounds, groundClearance, supportCount: feet.length, bodyVolume: creatureBodyVolume(g), limbMass, stanceErrors };
}
export const validateCreatureStance = (g: CreatureGenome): string[] => resolveCreatureAnatomy(g).stanceErrors;

export interface CreatureMouth { partId: string; mouthOrigin: Vec3; feedReach: number; diet: string[] }
/** Independent physical mouths; a recycler modifies digestion, never supplies an implicit mouth. */
export function creatureMouths(g: CreatureGenome): CreatureMouth[] {
  return g.parts.flatMap(part => {
    const diet = part.kind === 'jaw' ? ['meat', 'detritus'] : part.kind === 'filter' ? ['algae', 'detritus', 'mineral'] : part.kind === 'proboscis' ? ['nectar'] : [];
    if (!diet.length) return [];
    if (g.parts.some(p => p.kind === 'recycler') && !diet.includes('mineral')) diet.push('mineral');
    const output = -Math.expm1(-part.scale * .75) / -Math.expm1(-.75);
    return attachmentAngles(part).map(angle => ({ partId: part.id, mouthOrigin: creatureAttachment(g, part.axial, angle).point,
      feedReach: 3.1 + (part.kind === 'proboscis' ? 2.9 : 1.2) * output, diet: [...diet] }));
  });
}
/** Target and occlusion callback use creature-local coordinates. Nearest eligible clear mouth wins. */
export function reachableCreatureMouth(g: CreatureGenome, target: Vec3, food: string, blocked: (from: Vec3, to: Vec3) => boolean, targetRadius = 0): CreatureMouth | null {
  return creatureMouths(g).filter(m => m.diet.includes(food) && norm(subtract(target, m.mouthOrigin)) <= m.feedReach + targetRadius)
    .sort((a, b) => norm(subtract(target, a.mouthOrigin)) - norm(subtract(target, b.mouthOrigin)))
    .find(m => !blocked(m.mouthOrigin, target)) ?? null;
}
