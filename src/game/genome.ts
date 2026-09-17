import { attachmentAngles, attachmentPoint } from './anatomy';
import { creatureMouths, resolveCreatureAnatomy, validateCreatureStance } from './creature-anatomy';
import { bodyVolume, bodyWidth, neutralSpine, SPINE_COUNT, spineInvestment } from './body-shape';
import { GENOME_ERRORS } from './errors.cs';
import { ADAPTATIONS, CREATURE_ADAPTATIONS, getAdaptation } from './adaptation-catalog';
import { creatureInvestment, creatureMutationInvestment, upgradeCreatureGenome, validateCreatureStructure } from './creature-body';
import type { AdaptationId, CreatureGenome, Genome, LegacyGenome, Part, Stage, Stats, Vec3 } from './types';
export { ADAPTATIONS, CREATURE_ADAPTATIONS, adaptationsForGenome, getAdaptation } from './adaptation-catalog';

/** Costs are DNA; each paired attachment costs and contributes 1.6 times one part. */
const adaptationMap = new Map(ADAPTATIONS.map((adaptation) => [adaptation.id, adaptation]));
const GENOME_KEYS = ['version', 'name', 'length', 'width', 'hue', 'pattern', 'parts'];
const PART_KEYS = ['id', 'kind', 'axial', 'angle', 'scale', 'mirrored'];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundCost = (value: number) => Math.max(0, Math.ceil(value - 1e-8));

export function initialGenome(): LegacyGenome {
  return {
    version: 1, name: 'Luma', length: 1, width: 1, hue: 168, pattern: 0,
    parts: [
      { id: 'primordial-tail', kind: 'flagellum', axial: -0.9, angle: 0, scale: 1, mirrored: false },
      { id: 'primordial-mouth', kind: 'filter', axial: 0.92, angle: 0, scale: 1, mirrored: false },
    ],
  };
}

export const has = (genome: Genome, id: AdaptationId): boolean => genome.parts.some((part) => part.kind === id);
export const cloneGenome = <T extends Genome>(genome: T): T => structuredClone(genome);

/**
 * speed: world units/s; acceleration: units/s²; turn: radians/s; armor: damage fraction.
 * metabolism: energy-use multiplier; sense: world units; swim/walk: movement multipliers.
 * oxygen/moisture: resource capacity; mass: relative body mass. Abilities gate distinct
 * simulation actions (pulse, photosynthesis, bonding, reflection and diet), not cosmetics.
 * Attachment size and symmetry affect investment, mass and performance together.
 */
export function computeStats(genome: Genome): Stats {
  const strength = (id: AdaptationId) => genome.parts.reduce((sum, part) => sum + (part.kind === id ? part.scale * (part.mirrored ? 1.6 : 1) : 0), 0);
  const anatomy = genome.version === 2 ? resolveCreatureAnatomy(genome) : null;
  const body = anatomy ? anatomy.bodyVolume : genome.length * genome.width * genome.width * bodyVolume(genome);
  const baseMass = body + genome.parts.reduce((sum, part) => {
    const density = part.kind === 'shell' ? 0.72 : part.kind === 'reservoir' ? 0.42 : 0.11;
    return sum + density * part.scale * (part.mirrored ? 1.6 : 1);
  }, 0);
  const mass = anatomy ? baseMass + anatomy.limbMass : baseMass;
  const flagellum = strength('flagellum'), fins = strength('fins'), tail = strength('tail');
  const legs = strength('legs'), jet = strength('jet'), shell = strength('shell');
  const shapeDrag = Math.max(0, bodyWidth(genome) - 0.85) * 0.45;
  const movement = 4.8 + flagellum * 0.8 + fins * 0.4 + tail * 1.1 + jet * 0.5;
  const diet = new Set<string>(genome.version === 2 ? creatureMouths(genome).flatMap(m => m.diet) : has(genome, 'jaw') ? ['meat', 'detritus'] : ['algae', 'detritus']);
  if (genome.version === 1 && (has(genome, 'filter') || has(genome, 'recycler'))) diet.add('mineral');
  if (genome.version === 1 && has(genome, 'proboscis')) diet.add('nectar');
  return {
    speed: clamp(movement / (1 + Math.max(0, mass - 1) * 0.09 + shapeDrag + legs * 0.04), 1.8, 11),
    acceleration: clamp(7 + flagellum * 1.8 + fins * 1.5 + jet * 4 - mass * 0.45, 2, 22),
    turn: clamp(3.3 + fins * 0.5 + strength('antenna') * 0.08 - shell * 0.3 - tail * 0.2 - strength('recycler') * 0.12 - Math.max(0, genome.length - 1) * 0.4, 0.9, 6),
    maxHealth: Math.round(90 + genome.width * 15 + shell * 28 + legs * 6),
    damage: Math.round(7 + strength('jaw') * 24 + strength('spines') * 5 + strength('toxin') * 3),
    armor: clamp(shell * 0.18 + strength('spines') * 0.035 + strength('toxin') * 0.04, 0, 0.72),
    metabolism: clamp(0.85 + body * 0.08 + flagellum * 0.08 + fins * 0.05 + tail * 0.06 + legs * 0.06 + jet * 0.2 + strength('jaw') * 0.1 + strength('filter') * 0.03 + strength('proboscis') * 0.04 + strength('eyes') * 0.035 + strength('antenna') * 0.025 + strength('sonar') * 0.07 + shell * 0.035 + strength('spines') * 0.035 + strength('toxin') * 0.09 + strength('lungs') * 0.04 + strength('symbiote') * 0.05 - strength('chloroplast') * 0.12 - strength('recycler') * 0.12, 0.45, 3.6),
    sense: 15 + strength('eyes') * 10 + strength('antenna') * 7 + strength('sonar') * 15,
    swim: clamp(1 + fins * 0.13 + tail * 0.1 + strength('gills') * 0.1 + strength('bladder') * 0.18 - legs * 0.08, 0.55, 2.3),
    walk: legs > 0 ? clamp((0.62 + legs * 0.23) / (1 + Math.max(0, mass - 2) * 0.045), 0.3, 1.5) : 0,
    oxygen: Math.round(100 + strength('gills') * 60 + strength('lungs') * 30 + strength('bladder') * 15),
    moisture: Math.round(100 + strength('reservoir') * 80 + shell * 8),
    diet: [...diet], abilities: [...new Set(genome.parts.map((part) => part.kind))], mass,
  };
}

/** Derived action outputs, never serialized: existing genome prices and capacities stay stable. */
export interface FunctionalProfile {
  /** Local attachment coordinates; +Z is the head. Rotate this point with the organism. */
  mouthOrigin: Vec3;
  /** Distance from mouthOrigin, including a forgiving area around the body. */
  feedReach: number;
  /** Maximum turn at cruising speed, in radians/s. */
  turnRate: number;
  /** Forward speed response and lateral grip, in inverse seconds. */
  acceleration: number;
  steeringGrip: number;
  verticalThrust: number;
  gillExchange: number;
  toxinDamage: number;
  toxinRadius: number;
  /** Divide ambient current by this value; an unadapted body has resistance 1. */
  currentResistance: number;
  /** Energy/s in suitable light; lighting itself belongs to the world simulation. */
  photosynthesis: number;
  /** Care efficiency, not partner slots: 1 at normal size, 0 without a host organ. */
  partnerSupport: number;
}

/** Smooth diminishing returns, normalized so one ordinary organ retains its baseline output. */
const organOutput = (strength: number): number => -Math.expm1(-Math.max(0, strength) * .75) / -Math.expm1(-.75);

export function functionalProfile(genome: Genome): FunctionalProfile {
  const stats = computeStats(genome);
  const strength = (kind: AdaptationId) => genome.parts.reduce((sum, part) => sum + (part.kind === kind ? part.scale * (part.mirrored ? 1.6 : 1) : 0), 0);
  let steering = 0, stabilizing = 0, finStrength = 0, tailStability = 0, leafExposure = 0;
  let mouthOrigin: Vec3 = { x: 0, y: 0, z: 0 }, feedReach = 3.3;
  for (const part of genome.parts) {
    const tissue = part.scale * (part.mirrored ? 1.6 : 1);
    if (part.kind === 'fins') {
      const lateral = .7 + .3 * Math.abs(Math.sin(part.angle));
      const forward = (part.axial + 1) / 2;
      // Fore fins steer; aft fins hold a line against the current. Both remain useful everywhere.
      steering += tissue * lateral * (.65 + .65 * forward) * (part.mirrored ? 1.12 : .95);
      stabilizing += tissue * lateral * (1.2 - .45 * forward);
      finStrength += tissue;
    }
    if (part.kind === 'tail') tailStability += tissue * (.7 + .6 * (1 - part.axial) / 2);
    if (part.kind === 'chloroplast') leafExposure += tissue * (.7 + .3 * (1 + Math.cos(part.angle)) / 2);
    if (genome.version === 1 && (part.kind === 'filter' || part.kind === 'jaw' || part.kind === 'proboscis')) {
      const reach = 3.1 + (part.kind === 'proboscis' ? 2.9 : 1.2) * organOutput(tissue);
      if (reach > feedReach) {
        const points = attachmentAngles(part).map(angle => attachmentPoint(part.axial, angle, genome.length, genome.width, genome.spine));
        mouthOrigin = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length, z: sum.z + point.z / points.length }), { x: 0, y: 0, z: 0 });
        feedReach = reach;
      }
    }
  }
  const mouths = genome.version === 2 ? creatureMouths(genome) : null;
  if (mouths) { mouthOrigin = mouths[0]?.mouthOrigin ?? { x: 0, y: 0, z: 0 }; feedReach = mouths[0]?.feedReach ?? 0; }
  const turningPlacement = 1 + .8 * (organOutput(steering) - organOutput(finStrength));
  const toxin = organOutput(strength('toxin'));
  return {
    mouthOrigin, feedReach: genome.version === 2 ? feedReach : Math.max(feedReach, Math.hypot(mouthOrigin.x, mouthOrigin.y, mouthOrigin.z) + .8),
    turnRate: clamp(stats.turn * 1.45 * turningPlacement / (1 + Math.max(0, stats.mass - 2) * .1), 1.35, 8),
    acceleration: stats.acceleration,
    steeringGrip: stats.acceleration + 2 * organOutput(stabilizing),
    verticalThrust: 3.2 + 2 * organOutput(strength('bladder')) + .45 * organOutput(finStrength),
    gillExchange: 6 * organOutput(strength('gills')),
    toxinDamage: 18 * toxin,
    toxinRadius: 10 * Math.sqrt(toxin),
    currentResistance: 1 + .85 * organOutput(tailStability) + .6 * organOutput(stabilizing),
    photosynthesis: .25 * organOutput(leafExposure),
    partnerSupport: organOutput(strength('symbiote')),
  };
}

const partInvestment = (part: Part): number => getAdaptation(part.kind).cost * part.scale * (part.mirrored ? 1.6 : 1);
const bodyInvestment = (genome: Genome): number => Math.abs(genome.length - 1) * 12 + Math.abs(genome.width - 1) * 10 + spineInvestment(genome);

export function genomeCost(genome: Genome): number {
  if (genome.version === 2) return roundCost(creatureInvestment(genome));
  return roundCost(genome.parts.reduce((sum, part) => sum + partInvestment(part), bodyInvestment(genome)));
}

/** Removal salvages half its investment against this mutation only, never paying DNA. */
export function mutationCost(oldGenome: Genome, nextGenome: Genome): number {
  if (oldGenome.version === 2 || nextGenome.version === 2) return roundCost(creatureMutationInvestment(oldGenome.version === 2 ? oldGenome : upgradeCreatureGenome(oldGenome), nextGenome.version === 2 ? nextGenome : upgradeCreatureGenome(nextGenome)));
  const previous = new Map(oldGenome.parts.map((part) => [part.id, part]));
  let added = 0, removed = 0;
  for (const part of nextGenome.parts) {
    const old = previous.get(part.id);
    if (old && old.kind === part.kind) {
      const delta = partInvestment(part) - partInvestment(old);
      if (delta > 0) added += delta;
      else removed -= delta;
    } else {
      added += partInvestment(part);
      if (old) removed += partInvestment(old);
    }
    previous.delete(part.id);
  }
  for (const part of previous.values()) removed += partInvestment(part);
  // Reshaping spends energy even when the resulting body happens to be smaller.
  const oldSpine = oldGenome.spine ?? neutralSpine(), nextSpine = nextGenome.spine ?? neutralSpine();
  const sculpting = nextSpine.reduce((sum, node, i) => sum + Math.abs(node.width - oldSpine[i].width) + Math.abs(node.height - oldSpine[i].height) + Math.abs(node.bend - oldSpine[i].bend), 0) * 3 / SPINE_COUNT;
  const reshaping = sculpting + Math.abs(nextGenome.length - oldGenome.length) * 12 + Math.abs(nextGenome.width - oldGenome.width) * 10;
  return roundCost(Math.max(0, added - removed * 0.5) + reshaping);
}

const record = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const finiteRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

function validateLegacyGenome(value: unknown, stage: Stage): string[] {
  const errors: string[] = [];
  if (![0, 1, 2].includes(stage)) return [GENOME_ERRORS.invalidStage];
  if (!record(value)) return [GENOME_ERRORS.objectRequired];
  if (!exactKeys(value, Object.hasOwn(value, 'spine') ? [...GENOME_KEYS, 'spine'] : GENOME_KEYS)) errors.push(GENOME_ERRORS.invalidFields);
  if (Object.hasOwn(value, 'spine') && (!Array.isArray(value.spine) || value.spine.length !== SPINE_COUNT || Array.from(value.spine).some(node => !record(node) || !exactKeys(node, ['width', 'height', 'bend']) || !finiteRange(node.width, .5, 1.65) || !finiteRange(node.height, .5, 1.65) || !finiteRange(node.bend, -.65, .65)))) errors.push(GENOME_ERRORS.invalidSpine);
  if (value.version !== 1) errors.push(GENOME_ERRORS.unsupportedVersion);
  if (typeof value.name !== 'string' || value.name.trim().length < 1 || value.name.length > 32 || /[\u0000-\u001f\u007f]/.test(value.name)) errors.push(GENOME_ERRORS.invalidName);
  if (!finiteRange(value.length, 0.65, 2.4)) errors.push(GENOME_ERRORS.invalidLength);
  if (!finiteRange(value.width, 0.55, 1.8)) errors.push(GENOME_ERRORS.invalidWidth);
  if (!finiteRange(value.hue, 0, 360)) errors.push(GENOME_ERRORS.invalidHue);
  if (!finiteRange(value.pattern, 0, 3) || !Number.isInteger(value.pattern)) errors.push(GENOME_ERRORS.invalidPattern);
  if (!Array.isArray(value.parts)) return [...errors, GENOME_ERRORS.invalidParts];
  if (value.parts.length > 18) errors.push(GENOME_ERRORS.partLimit);
  const ids = new Set<string>();
  const counts = new Map<AdaptationId, number>();
  // Bound validation work for malicious imports, while retaining useful part errors.
  for (let index = 0; index < Math.min(value.parts.length, 19); index++) {
    const part: unknown = value.parts[index];
    if (!record(part)) { errors.push(GENOME_ERRORS.partObjectRequired(index + 1)); continue; }
    if (!exactKeys(part, PART_KEYS)) errors.push(GENOME_ERRORS.invalidPartFields(index + 1));
    if (typeof part.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(part.id)) errors.push(GENOME_ERRORS.invalidPartId);
    else { if (ids.has(part.id)) errors.push(GENOME_ERRORS.duplicatePartIds); ids.add(part.id); }
    const adaptation = typeof part.kind === 'string' ? adaptationMap.get(part.kind as AdaptationId) : undefined;
    if (!adaptation) errors.push(GENOME_ERRORS.unknownPartKind);
    else {
      counts.set(adaptation.id, (counts.get(adaptation.id) ?? 0) + 1);
      if (adaptation.stage > stage) errors.push(GENOME_ERRORS.stageRequired(adaptation.name, adaptation.stage + 1));
      if ((counts.get(adaptation.id) ?? 0) > adaptation.max) errors.push(GENOME_ERRORS.attachmentLimit(adaptation.name, adaptation.max));
    }
    if (!finiteRange(part.axial, -1, 1)) errors.push(GENOME_ERRORS.invalidAxial);
    if (!finiteRange(part.angle, -Math.PI, Math.PI)) errors.push(GENOME_ERRORS.invalidAngle);
    if (!finiteRange(part.scale, 0.55, 1.65)) errors.push(GENOME_ERRORS.invalidScale);
    if (typeof part.mirrored !== 'boolean') errors.push(GENOME_ERRORS.invalidSymmetry);
  }
  if (counts.has('filter') && counts.has('jaw')) errors.push(GENOME_ERRORS.incompatibleMouths);
  if (stage === 2 && !counts.has('legs')) errors.push(GENOME_ERRORS.legsRequired);
  if (stage === 2 && !counts.has('lungs')) errors.push(GENOME_ERRORS.lungsRequired);
  return [...new Set(errors)];
}

/** Validate untrusted save/editor input before using it for prices or simulation. */
export function validateGenome(value: unknown, stage: Stage): string[] {
  if (record(value) && value.version === 2) {
    if (![0, 1, 2, 3, 4, 5].includes(stage)) return [GENOME_ERRORS.invalidStage];
    const errors = validateCreatureStructure(value);
    if (!errors.length) errors.push(...validateCreatureStance(value as unknown as CreatureGenome));
    if (stage < 2) errors.push(GENOME_ERRORS.stageRequired('Kloubové tělo', 3));
    if (Array.isArray(value.parts)) {
      for (let index = 0; index < Math.min(value.parts.length, 19); index++) {
        const part = value.parts[index];
        if (!record(part) || typeof part.kind !== 'string') continue;
        const adaptation = CREATURE_ADAPTATIONS.find(item => item.id === part.kind);
        if (!adaptation) continue;
        if (adaptation.stage > stage) errors.push(GENOME_ERRORS.stageRequired(adaptation.name, adaptation.stage + 1));
      }
    }
    return [...new Set(errors)];
  }
  return validateLegacyGenome(value, stage);
}

export function validateMutation(oldGenome: Genome, nextGenome: Genome, stage: Stage, budget: number): { ok: boolean; errors: string[]; cost: number } {
  const errors = validateGenome(nextGenome, stage);
  // Refuse invalid trusted-state assumptions too, instead of deriving NaN/negative prices.
  if (validateGenome(oldGenome, stage).length) errors.push(GENOME_ERRORS.invalidOriginal);
  if (!Number.isFinite(budget) || budget < 0) errors.push(GENOME_ERRORS.invalidBudget);
  if (errors.length) return { ok: false, errors, cost: 0 };
  const cost = mutationCost(oldGenome, nextGenome);
  if (cost > budget) errors.push(GENOME_ERRORS.missingDna(Math.ceil(cost - budget)));
  return { ok: errors.length === 0, errors, cost };
}
