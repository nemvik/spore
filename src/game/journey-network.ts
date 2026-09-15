import type { GameState, Genome, Part, Vec3 } from './types';
import { clamp, distance } from './random';
import { reefConditions } from './reef-layout';
import { reefBodyProfile } from './reef-body';

type WaterBodyPart = Pick<Part, 'kind' | 'scale' | 'axial' | 'angle' | 'mirrored'>;
interface WaterBodySnapshot {
  width: number; length: number; pumping: number; parts: WaterBodyPart[];
  profile: ReturnType<typeof reefBodyProfile>;
}
const waterBodies = new WeakMap<Genome, WaterBodySnapshot>();

/** Particles share this private derivation, but editing a genome in place must
 * take effect on the very next sample. Compare scalars without allocating a
 * signature on each query; retain a new snapshot only when an input changed. */
function waterBody(genome: Genome, pumping: number) {
  const cached = waterBodies.get(genome);
  if (cached && cached.width === genome.width && cached.length === genome.length && cached.pumping === pumping && cached.parts.length === genome.parts.length) {
    let same = true;
    for (let i = 0; i < genome.parts.length; i++) {
      const a = cached.parts[i], b = genome.parts[i];
      if (a.kind !== b.kind || a.scale !== b.scale || a.axial !== b.axial || a.angle !== b.angle || a.mirrored !== b.mirrored) { same = false; break; }
    }
    if (same) return cached.profile;
  }
  const profile = reefBodyProfile(genome, pumping);
  waterBodies.set(genome, { width: genome.width, length: genome.length, pumping,
    parts: genome.parts.map(({ kind, scale, axial, angle, mirrored }) => ({ kind, scale, axial, angle, mirrored })), profile });
  return profile;
}

export interface LivingStream { id: string; from: Vec3; to: Vec3; kind: 'nutrient' | 'current' | 'oxygen' | 'lift' }

/** These are the same curved paths drawn as drifting, living strands. */
export function streamPoint(from: Vec3, to: Vec3, t: number): Vec3 {
  const dx = to.x - from.x, dz = to.z - from.z, length = Math.max(.01, Math.hypot(dx, dz));
  const bow = Math.sin(t * Math.PI) * Math.min(3.5, length * .08);
  return { x: from.x + dx * t - dz / length * bow, y: from.y + (to.y - from.y) * t + Math.sin(t * Math.PI) * .7, z: from.z + dz * t + dx / length * bow };
}

/** A choice of planting location determines the useful return route. No new save flags. */
export function livingStreams(s: GameState): LivingStream[] {
  if (s.journey.legacy || s.stage === 2) return [];
  if (s.stage === 1) {
    const site = s.journey.sites.find(site => site.id === 4), home = s.journey.sites.find(site => site.id === 5);
    const plant = site?.plantedId === null ? undefined : s.world.resources.find(r => r.id === site?.plantedId);
    if (!s.journey.canopy || !site?.resolved || site.vitality <= 0 || !plant || plant.amount < .5 || !home) return [];
    // A deep pasture carries partially filtered water into the gorge. A pasture
    // near the surface draws an outlet up through its centre instead. Both need
    // the same actual consumer-fed living plant; neither is a completion buff.
    if (s.journey.reefEvolution && plant.pos.y > 6) return [{ id: 'supply-4', from: home.source, to: { ...home.source, y: 11.8 }, kind: 'lift' }];
    return [{ id: 'supply-4', from: plant.pos, to: home.source, kind: 'oxygen' }];
  }
  const home = s.journey.sites.find(site => site.id === 2);
  if (!home) return [];
  const streams: LivingStream[] = [];
  for (const site of s.journey.sites.filter(site => site.stage === 0 && site.patch < 2 && site.resolved)) {
    const plant = s.world.resources.find(r => r.id === (site.plantedId ?? site.sourceId));
    if (!plant || plant.amount < .5 || site.vitality <= 0) continue;
    if (site.patch === 0) streams.push({ id: `supply-${site.id}`, from: plant.pos, to: home.source, kind: 'nutrient' });
    else {
      streams.push({ id: `supply-${site.id}`, from: home.source, to: plant.pos, kind: 'current' });
      const outlet = [...home.refuges].sort((a, b) => distance(plant.pos, a) - distance(plant.pos, b))[0];
      if (outlet) streams.push({ id: 'return-current', from: plant.pos, to: outlet, kind: 'current' });
    }
  }
  return streams;
}

export function streamEffect(s: GameState, pos: Vec3): { flow: Vec3; nourishment: number } {
  const flow = { x: 0, y: 0, z: 0 }; let nourishment = 0;
  for (const stream of livingStreams(s)) {
    const { weight, tangent } = streamProximity(stream, pos, s.stage === 1);
    if (stream.kind === 'nutrient') nourishment = Math.max(nourishment, weight * 4);
    else { const speed = stream.kind === 'lift' ? 6 : 2.2; flow.x += tangent.x * weight * speed; flow.y += tangent.y * weight * speed; flow.z += tangent.z * weight * speed; }
  }
  return { flow, nourishment };
}

function streamProximity(stream: LivingStream, pos: Vec3, spatial: boolean) {
  let closest = Infinity, tangent = { x: 0, y: 0, z: 0 }, a = stream.from;
  for (let i = 1; i <= 12; i++) {
    const b = streamPoint(stream.from, stream.to, i / 12), dx = b.x - a.x, dy = spatial ? b.y - a.y : 0, dz = b.z - a.z;
    const py = spatial ? pos.y - a.y : 0;
    const t = clamp(((pos.x - a.x) * dx + py * dy + (pos.z - a.z) * dz) / Math.max(.001, dx * dx + dy * dy + dz * dz), 0, 1);
    const d = Math.hypot(pos.x - a.x - dx * t, py - dy * t, pos.z - a.z - dz * t);
    if (d < closest) { closest = d; const length = Math.max(.001, Math.hypot(dx, dy, dz)); tangent = { x: dx / length, y: dy / length, z: dz / length }; }
    a = b;
  }
  return { weight: clamp(1 - closest / 4.5, 0, 1), tangent };
}

/** Rendering, HUD and respiration all sample this same living water chemistry. */
export function reefWater(s: GameState, pos: Vec3) {
  const water = reefConditions(s.world, pos, s.journey.canopy ? s.journey.sites.find(site => site.id === 4)?.sourceId : undefined);
  let filtration = 0;
  for (const stream of livingStreams(s)) if (stream.kind === 'oxygen') filtration = Math.max(filtration, streamProximity(stream, pos, true).weight);
  let oxygenUse = water.oxygenUse * (1 - filtration * (s.journey.reefEvolution ? .55 : .9));
  if (s.stage === 1 && s.journey.reefEvolution && s.journey.reefEvolution.pumping > 0) {
    const body = waterBody(s.player.genome, s.journey.reefEvolution.pumping);
    // Chemistry is local and continuous. The whole body sits in its crown's
    // wake; beyond that core the clearing fades rather than forming a wall.
    const gap = distance(pos, s.player.pos), core = Math.min(1.5, body.filterRadius * .5);
    const weight = body.filterRadius > 0 ? clamp((body.filterRadius - gap) / Math.max(.001, body.filterRadius - core), 0, 1) : 0;
    oxygenUse *= 1 - body.purification * weight;
  }
  return { ...water, oxygenUse };
}
