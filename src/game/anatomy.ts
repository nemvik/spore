import type { Genome, Species, SpineNode, Vec3 } from './types';
import { attachmentAngles, attachmentPoint as legacyAttachmentPoint } from './body-profile';
import { creatureAttachment, creatureBodyGroundClearance, resolveCreatureAnatomy } from './creature-anatomy';
export { attachmentAngles } from './body-profile';

export function attachmentPoint(axial: number, angle: number, genome: Genome): Vec3;
export function attachmentPoint(axial: number, angle: number, length: number, width: number, spine?: readonly SpineNode[]): Vec3;
export function attachmentPoint(axial: number, angle: number, genomeOrLength: Genome | number, width?: number, spine?: readonly SpineNode[]): Vec3 {
  if (typeof genomeOrLength === 'number') return legacyAttachmentPoint(axial, angle, genomeOrLength, width!, spine);
  const g = genomeOrLength;
  return g.version === 2 ? creatureAttachment(g, axial, angle).point : legacyAttachmentPoint(axial, angle, g.length, g.width, g.spine);
}

/** The closed sole plane of an unscaled, relaxed limb, below its attachment. */
export const LEG_SOLE_REACH = 1.16;

/** A forgiving contact volume around each visible jaw, independent of other mouths.
 * The jaws project .82 local metres forward; centring on their middle permits
 * glancing contact without making a proboscis into a remote biting weapon.
 * Creature body size is added by the interaction query, not by the genome.
 */
export function jawContacts(genome: Genome): { mouthOrigin: Vec3; reach: number }[] {
  return genome.parts.filter(part => part.kind === 'jaw').flatMap(part => attachmentAngles(part).map(angle => {
    if (genome.version === 2) {
      const { point, tangent } = creatureAttachment(genome, part.axial, angle), advance = .41 * part.scale;
      return { mouthOrigin: { x: point.x + tangent.x * advance, y: point.y + tangent.y * advance, z: point.z + tangent.z * advance }, reach: .55 * part.scale + .45 };
    }
    const origin = attachmentPoint(part.axial, angle, genome.length, genome.width, genome.spine);
    return { mouthOrigin: { ...origin, z: origin.z + .41 * part.scale }, reach: .55 * part.scale + .45 };
  }));
}

/**
 * Ground-to-body-origin distance. Shorter limbs extend to this common sole plane;
 * the largest natural leg reach and the underside of the body determine it.
 * Physics and the rendered stance must both use this same function.
 */
export function organismGroundClearance(genome: Genome): number {
  if (genome.version === 2) return resolveCreatureAnatomy(genome).groundClearance;
  let clearance = bodyGroundClearance(genome);
  for (const part of genome.parts) {
    if (part.kind !== 'legs') continue;
    for (const angle of attachmentAngles(part)) {
      const attachmentY = attachmentPoint(part.axial, angle, genome.length, genome.width, genome.spine).y;
      clearance = Math.max(clearance, LEG_SOLE_REACH * part.scale - attachmentY);
    }
  }
  return clearance;
}

/** Soft trunk clearance, independent of long legs that fold while swimming. */
export function bodyGroundClearance(genome: Genome): number {
  if (genome.version === 2) return creatureBodyGroundClearance(genome);
  return genome.spine ? Math.max(...genome.spine.map(node => genome.width * (.66 * node.height - node.bend))) : .66 * genome.width;
}

/** Walking species share their rendered sole/body underside with terrain physics. */
export function speciesGroundClearance(species: Species & { clearance?: number }): number {
  if (species.clearance !== undefined) return species.clearance;
  if(species.shape === 'worm') return .25 * species.size;
  if(species.shape === 'crab') return .818 * species.size;
  if(species.shape === 'strider') return LEG_SOLE_REACH * .95 * species.size;
  return 1.2; // Flying partners keep a small clearance above the soil.
}

export function speciesCollisionRadius(species: Species & { radius?: number }): number {
  return species.radius ?? species.size * .6;
}
