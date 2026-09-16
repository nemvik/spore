import { bodySection } from './body-shape';
import type { Genome, Part, Vec3, Species, SpineNode } from './types';

/** The closed sole plane of an unscaled, relaxed limb, below its attachment. */
export const LEG_SOLE_REACH = 1.16;
const SEAM_HALF_ANGLE = .22;

/** Mirrored dorsal/ventral organs straddle the seam rather than occupying one slot. */
export function attachmentAngles(part: Pick<Part, 'angle' | 'mirrored'>): number[] {
  if (!part.mirrored) return [part.angle];
  const radial = Math.abs(Math.atan2(Math.sin(part.angle), Math.cos(part.angle)));
  const separated = Math.min(Math.PI - SEAM_HALF_ANGLE, Math.max(SEAM_HALF_ANGLE, radial));
  const first = Math.sin(part.angle) < 0 ? -separated : separated;
  return [first, -first];
}

/** Shared analytical attachment surface, independent of rendering or simulation. */
export function attachmentPoint(axial: number, angle: number, length: number, width: number, spine?: readonly SpineNode[]): Vec3 {
  const a = Math.min(.93, Math.max(-.93, axial));
  const profile = Math.pow(Math.max(.001, 1 - a * a), .48) * (1 + .15 * a);
  const section = bodySection(a, spine);
  return { x: Math.sin(angle) * .68 * width * profile * section.width, y: Math.cos(angle) * .61 * width * profile * section.height + .13 * a * a + section.bend * width, z: a * 1.76 * length };
}

/** A forgiving contact volume around each visible jaw, independent of other mouths.
 * The jaws project .82 local metres forward; centring on their middle permits
 * glancing contact without making a proboscis into a remote biting weapon.
 * Creature body size is added by the interaction query, not by the genome.
 */
export function jawContacts(genome: Genome): { mouthOrigin: Vec3; reach: number }[] {
  return genome.parts.filter(part => part.kind === 'jaw').flatMap(part => attachmentAngles(part).map(angle => {
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
  return genome.spine ? Math.max(...genome.spine.map(node => genome.width * (.66 * node.height - node.bend))) : .66 * genome.width;
}

/** Walking species share their rendered sole/body underside with terrain physics. */
export function speciesGroundClearance(species: Species): number {
  if(species.shape === 'worm') return .25 * species.size;
  if(species.shape === 'crab') return .818 * species.size;
  if(species.shape === 'strider') return LEG_SOLE_REACH * .95 * species.size;
  return 1.2; // Flying partners keep a small clearance above the soil.
}
