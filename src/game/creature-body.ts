import { CREATURE_ADAPTATIONS } from './adaptation-catalog';
import { neutralSpine, spineAxial } from './body-profile';
import { GENOME_ERRORS } from './errors.cs';
import type { CreatureGenome, LegacyGenome, SpineNode, Vec3 } from './types';

export interface CreatureSpineNode {
  id: string;
  axial: number;
  width: number;
  height: number;
  bend: number;
}
export interface LimbJoint { id: string; offset: Vec3; radius: number }
export type LimbEnd =
  | { kind: 'foot'; style: 'pad' | 'claw'; scale: number }
  | { kind: 'hand'; style: 'palm' | 'pincer'; scale: number }
  | { kind: 'none' };
export interface LimbGene { joints: LimbJoint[]; end: LimbEnd }
export interface CreatureBody {
  spine: CreatureSpineNode[];
  skin: { finish: 'smooth' | 'pebbled' | 'plated'; secondaryHue: number; contrast: number; patternScale: number };
}

const DEFAULT_LEG = {
  joints: [
    { offset: { x: .48, y: -.34, z: -.14 }, radius: .135 },
    { offset: { x: .77, y: -1.14, z: .16 }, radius: .1 },
  ],
  end: { kind: 'foot' as const, style: 'pad' as const, scale: 1 },
};

export function upgradeCreatureGenome(g: LegacyGenome): CreatureGenome {
  const sections = g.spine ?? neutralSpine();
  return {
    version: 2,
    name: g.name,
    length: g.length,
    width: g.width,
    hue: g.hue,
    pattern: g.pattern,
    parts: g.parts.map(part => ({
      ...structuredClone(part),
      ...(part.kind === 'legs' ? {
        limb: {
          joints: DEFAULT_LEG.joints.map((joint, index) => ({ id: `${part.id}-joint-${index}`, ...structuredClone(joint) })),
          end: { ...DEFAULT_LEG.end },
        },
      } : {}),
    })),
    body: {
      spine: sections.map((node, index) => ({ id: `spine-${index}`, axial: spineAxial(index), ...structuredClone(node) })),
      skin: { finish: 'smooth', secondaryHue: g.hue, contrast: .5, patternScale: 1 },
    },
  };
}

export function sampleCreatureSection(g: CreatureGenome, axial: number): SpineNode {
  const spine = g.body.spine;
  if (axial <= spine[0].axial) return { width: spine[0].width, height: spine[0].height, bend: spine[0].bend };
  const last = spine[spine.length - 1];
  if (axial >= last.axial) return { width: last.width, height: last.height, bend: last.bend };
  let index = 0;
  while (index + 1 < spine.length && axial > spine[index + 1].axial) index++;
  const a = spine[index], b = spine[index + 1];
  const linear = (axial - a.axial) / (b.axial - a.axial);
  const blend = linear * linear * (3 - 2 * linear);
  return {
    width: a.width + (b.width - a.width) * blend,
    height: a.height + (b.height - a.height) * blend,
    bend: a.bend + (b.bend - a.bend) * blend,
  };
}

const record = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const finiteRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const adaptationMap = new Map(CREATURE_ADAPTATIONS.map(adaptation => [adaptation.id, adaptation]));
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Strict, bounded validation for untrusted v2 save/editor data. */
export function validateCreatureStructure(value: unknown): string[] {
  const errors: string[] = [];
  if (!record(value)) return [GENOME_ERRORS.creatureObjectRequired];
  if (!exactKeys(value, ['version', 'name', 'length', 'width', 'hue', 'pattern', 'parts', 'body'])) errors.push(GENOME_ERRORS.invalidCreatureFields);
  if (value.version !== 2) errors.push(GENOME_ERRORS.invalidCreatureVersion);
  if (typeof value.name !== 'string' || value.name.trim().length < 1 || value.name.length > 32 || /[\u0000-\u001f\u007f]/.test(value.name)) errors.push('Neplatné jméno tvora.');
  if (!finiteRange(value.length, .65, 2.4)) errors.push('Neplatná délka těla.');
  if (!finiteRange(value.width, .55, 1.8)) errors.push('Neplatná šířka těla.');
  if (!finiteRange(value.hue, 0, 360)) errors.push('Neplatný odstín těla.');
  if (!finiteRange(value.pattern, 0, 3) || !Number.isInteger(value.pattern)) errors.push('Neplatný vzor těla.');

  if (!record(value.body) || !exactKeys(value.body, ['spine', 'skin'])) {
    errors.push(GENOME_ERRORS.invalidCreatureBody);
  } else {
    const spine = value.body.spine;
    if (!Array.isArray(spine) || spine.length < 3 || spine.length > 15) {
      errors.push(GENOME_ERRORS.invalidCreatureSpine);
    } else {
      const ids = new Set<string>();
      let previousAxial: number | undefined;
      for (let index = 0; index < Math.min(spine.length, 16); index++) {
        const node: unknown = spine[index];
        if (!record(node) || !exactKeys(node, ['id', 'axial', 'width', 'height', 'bend'])) { errors.push(GENOME_ERRORS.invalidCreatureNode); continue; }
        if (!validId(node.id) || ids.has(node.id)) errors.push(GENOME_ERRORS.invalidCreatureNodeId);
        else ids.add(node.id);
        if (!finiteRange(node.axial, -.9, .9)) errors.push('Neplatná podélná poloha obratle.');
        else if (previousAxial !== undefined && node.axial - previousAxial < .08) errors.push(GENOME_ERRORS.invalidCreatureNodeOrder);
        if (!finiteRange(node.width, .35, 2) || !finiteRange(node.height, .35, 2) || !finiteRange(node.bend, -2.5, 2.5)) errors.push('Neplatný profil obratle.');
        if (typeof node.axial === 'number' && Number.isFinite(node.axial)) previousAxial = node.axial;
      }
      if (record(spine[0]) && spine[0].axial !== -.9 || record(spine[spine.length - 1]) && spine[spine.length - 1].axial !== .9) errors.push(GENOME_ERRORS.invalidCreatureEndpoints);
    }
    const skin = value.body.skin;
    if (!record(skin) || !exactKeys(skin, ['finish', 'secondaryHue', 'contrast', 'patternScale']) || !['smooth', 'pebbled', 'plated'].includes(skin.finish as string) || !finiteRange(skin.secondaryHue, 0, 360) || !finiteRange(skin.contrast, 0, 1) || !finiteRange(skin.patternScale, .5, 2)) errors.push(GENOME_ERRORS.invalidCreatureSkin);
  }

  if (!Array.isArray(value.parts)) return [...new Set([...errors, 'Neplatný seznam částí těla.'])];
  if (value.parts.length > 18) errors.push('Tělo může mít nejvýše 18 částí.');
  const partIds = new Set<string>(), counts = new Map<string, number>();
  let mouths = 0, physicalFeet = 0;
  for (let index = 0; index < Math.min(value.parts.length, 19); index++) {
    const part: unknown = value.parts[index];
    if (!record(part)) { errors.push(GENOME_ERRORS.invalidCreaturePart); continue; }
    const limbKind = part.kind === 'legs' || part.kind === 'arms';
    if (!exactKeys(part, limbKind ? ['id', 'kind', 'axial', 'angle', 'scale', 'mirrored', 'limb'] : ['id', 'kind', 'axial', 'angle', 'scale', 'mirrored'])) errors.push(GENOME_ERRORS.invalidCreaturePartFields);
    if (!validId(part.id) || partIds.has(part.id)) errors.push(GENOME_ERRORS.invalidCreaturePartId);
    else partIds.add(part.id);
    const adaptation = typeof part.kind === 'string' ? adaptationMap.get(part.kind as never) : undefined;
    if (!adaptation) errors.push('Neznámý typ adaptace.');
    else {
      const count = (counts.get(adaptation.id) ?? 0) + 1;
      counts.set(adaptation.id, count);
      if (count > adaptation.max) errors.push(`${adaptation.name}: příliš mnoho úchytů.`);
      if (['filter', 'jaw', 'proboscis'].includes(adaptation.id)) mouths++;
    }
    if (!finiteRange(part.axial, -1, 1) || !finiteRange(part.angle, -Math.PI, Math.PI) || !finiteRange(part.scale, .55, 1.65) || typeof part.mirrored !== 'boolean') errors.push('Neplatné umístění nebo měřítko části.');
    if (limbKind) {
      if (!record(part.limb) || !exactKeys(part.limb, ['joints', 'end']) || !Array.isArray(part.limb.joints) || part.limb.joints.length < 2 || part.limb.joints.length > 4) {
        errors.push(GENOME_ERRORS.invalidLimb);
        continue;
      }
      const jointIds = new Set<string>();
      let previous: Vec3 = { x: 0, y: 0, z: 0 }, total = 0;
      for (let jointIndex = 0; jointIndex < Math.min(part.limb.joints.length, 5); jointIndex++) {
        const joint: unknown = part.limb.joints[jointIndex];
        if (!record(joint) || !exactKeys(joint, ['id', 'offset', 'radius']) || !validId(joint.id) || jointIds.has(joint.id) || !finiteRange(joint.radius, .06, .3) || !record(joint.offset) || !exactKeys(joint.offset, ['x', 'y', 'z']) || !finiteRange(joint.offset.x, -4.5, 4.5) || !finiteRange(joint.offset.y, -4.5, 4.5) || !finiteRange(joint.offset.z, -4.5, 4.5)) {
          errors.push(GENOME_ERRORS.invalidJoint);
          continue;
        }
        jointIds.add(joint.id);
        const offset = joint.offset as unknown as Vec3, bone = distance(previous, offset);
        if (bone < .2 || bone > 1.5) errors.push(GENOME_ERRORS.invalidBone);
        total += bone; previous = offset;
      }
      if (total > 4.5) errors.push(GENOME_ERRORS.limbTooLong);
      const end = part.limb.end;
      if (!record(end) || (end.kind === 'none' ? !exactKeys(end, ['kind']) : !exactKeys(end, ['kind', 'style', 'scale']) || !finiteRange(end.scale, .55, 1.65)) || part.kind === 'legs' && end.kind !== 'none' && (end.kind !== 'foot' || !['pad', 'claw'].includes(end.style as string)) || part.kind === 'arms' && end.kind !== 'none' && (end.kind !== 'hand' || !['palm', 'pincer'].includes(end.style as string))) {
        errors.push(GENOME_ERRORS.invalidLimbEnd);
      } else if (part.kind === 'legs' && end.kind === 'foot') {
        physicalFeet += part.mirrored === true ? 2 : 1;
      }
    } else if (Object.hasOwn(part, 'limb')) errors.push(GENOME_ERRORS.limbOnOrgan);
  }
  if (mouths > 3) errors.push(GENOME_ERRORS.mouthLimit);
  if (counts.has('filter') && counts.has('jaw')) errors.push('Filtrační věnec a čelist se vylučují.');
  if (!counts.has('lungs')) errors.push('Suchozemský tvor potřebuje plíce.');
  if (physicalFeet < 2) errors.push(GENOME_ERRORS.physicalFeetRequired);
  return [...new Set(errors)];
}
