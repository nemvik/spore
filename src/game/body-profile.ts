import type { Genome, Part, SpineNode, Stage, Vec3 } from './types';

export const SPINE_COUNT = 7;
export const spineAxial = (index: number) => -.9 + index * 1.8 / (SPINE_COUNT - 1);
export const spineIndex = (axial: number) => Math.max(0, Math.min(SPINE_COUNT - 1, Math.round((axial + .9) / .3)));
export const neutralSpine = (): SpineNode[] => Array.from({ length: SPINE_COUNT }, () => ({ width: 1, height: 1, bend: 0 }));

export function bodySection(axial: number, spine?: readonly SpineNode[]): SpineNode {
  if (!spine) return { width: 1, height: 1, bend: 0 };
  const position = Math.max(0, Math.min(SPINE_COUNT - 1, (axial + .9) / 1.8 * (SPINE_COUNT - 1)));
  const index = Math.min(SPINE_COUNT - 2, Math.floor(position));
  const t = position - index, blend = t * t * (3 - 2 * t), a = spine[index], b = spine[index + 1];
  return { width: a.width + (b.width - a.width) * blend, height: a.height + (b.height - a.height) * blend, bend: a.bend + (b.bend - a.bend) * blend };
}

export const bodyWidth = (g: Genome) => g.width * (g.version === 1 && g.spine ? Math.max(...g.spine.map(n => n.width)) : 1);
export function bodyCollisionRadius(g: Genome, stage: Stage): number {
  const horizontal = Math.max(.6, bodyWidth(g) * .8);
  return stage === 1 && g.version === 1 && g.spine ? Math.max(horizontal, ...g.spine.map(n => g.width * (.66 * n.height + Math.abs(n.bend)) + .13)) : horizontal;
}
export function bodyVolume(g: Genome): number {
  const weights = [1, 3, 5, 6, 5, 3, 1];
  return g.version === 1 && g.spine ? g.spine.reduce((sum, n, i) => sum + n.width * n.height * weights[i], 0) / 24 : 1;
}
export const spineInvestment = (g: Genome) => g.version === 1 && g.spine ? g.spine.reduce((sum, n) => sum + Math.abs(n.width - 1) + Math.abs(n.height - 1) + Math.abs(n.bend), 0) * 3 / SPINE_COUNT : 0;

const SEAM_HALF_ANGLE = .22;
export function attachmentAngles(part: Pick<Part, 'angle' | 'mirrored'>): number[] {
  if (!part.mirrored) return [part.angle];
  const radial = Math.abs(Math.atan2(Math.sin(part.angle), Math.cos(part.angle)));
  const separated = Math.min(Math.PI - SEAM_HALF_ANGLE, Math.max(SEAM_HALF_ANGLE, radial));
  const first = Math.sin(part.angle) < 0 ? -separated : separated;
  return [first, -first];
}

export function attachmentPoint(axial: number, angle: number, length: number, width: number, spine?: readonly SpineNode[]): Vec3 {
  const a = Math.min(.93, Math.max(-.93, axial));
  const profile = Math.pow(Math.max(.001, 1 - a * a), .48) * (1 + .15 * a);
  const section = bodySection(a, spine);
  return { x: Math.sin(angle) * .68 * width * profile * section.width, y: Math.cos(angle) * .61 * width * profile * section.height + .13 * a * a + section.bend * width, z: a * 1.76 * length };
}
