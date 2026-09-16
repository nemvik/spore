import type { Genome, SpineNode, Stage } from './types';

export const SPINE_COUNT = 7;
export const spineAxial = (index: number) => -.9 + index * 1.8 / (SPINE_COUNT - 1);
/** Same nearest cross section for body picking and the visible editing band. */
export const spineIndex = (axial: number) => Math.max(0, Math.min(SPINE_COUNT - 1, Math.round((axial + .9) / .3)));
export const neutralSpine = (): SpineNode[] => Array.from({ length: SPINE_COUNT }, () => ({ width: 1, height: 1, bend: 0 }));

/** Bounded interpolation cannot overshoot a narrow neck or create a folded surface. */
export function bodySection(axial: number, spine?: readonly SpineNode[]): SpineNode {
  if (!spine) return { width: 1, height: 1, bend: 0 };
  const position = Math.max(0, Math.min(SPINE_COUNT - 1, (axial + .9) / 1.8 * (SPINE_COUNT - 1)));
  const index = Math.min(SPINE_COUNT - 2, Math.floor(position));
  const t = position - index, blend = t * t * (3 - 2 * t), a = spine[index], b = spine[index + 1];
  return { width: a.width + (b.width - a.width) * blend, height: a.height + (b.height - a.height) * blend, bend: a.bend + (b.bend - a.bend) * blend };
}

export const bodyWidth = (g: Genome) => g.width * (g.spine ? Math.max(...g.spine.map(n => n.width)) : 1);
/** Aquatic collision spheres must also enclose a tall or bent trunk under ceilings. */
export function bodyCollisionRadius(g: Genome, stage: Stage): number {
  const horizontal = Math.max(.6, bodyWidth(g) * .8);
  return stage === 1 && g.spine ? Math.max(horizontal, ...g.spine.map(n => g.width * (.66 * n.height + Math.abs(n.bend)) + .13)) : horizontal;
}
/** Weighted cross sections approximate relative tissue volume; old bodies stay exactly 1. */
export function bodyVolume(g: Genome): number {
  const weights = [1, 3, 5, 6, 5, 3, 1];
  return g.spine ? g.spine.reduce((sum, n, i) => sum + n.width * n.height * weights[i], 0) / 24 : 1;
}
export const spineInvestment = (g: Genome) => g.spine ? g.spine.reduce((sum, n) => sum + Math.abs(n.width - 1) + Math.abs(n.height - 1) + Math.abs(n.bend), 0) * 3 / SPINE_COUNT : 0;

export const BODY_PRESETS = {
  original: { label: 'Původní', nodes: () => undefined },
  pear: { label: 'Hruška', nodes: () => [.55, .65, .8, 1, 1.5, 1.55, 1.3].map(width => ({ width, height: width, bend: 0 })) },
  ray: { label: 'Ploché', nodes: () => [.65, .85, 1.3, 1.65, 1.5, 1.1, .8].map(width => ({ width, height: .55, bend: 0 })) },
  arch: { label: 'Oblouk', nodes: () => [0, .15, .4, .6, .4, .1, -.15].map((bend, i) => ({ width: i === 4 ? .65 : 1, height: i === 4 ? .65 : 1, bend })) },
} satisfies Record<string, { label: string; nodes: () => SpineNode[] | undefined }>;
