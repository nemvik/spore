import type { Genome, SpineNode, Stage } from './types';
import * as legacy from './body-profile';
import { creatureBodyVolume, resolveCreatureAnatomy } from './creature-anatomy';
export { bodySection, neutralSpine, spineAxial, spineIndex, spineInvestment, SPINE_COUNT } from './body-profile';

export const BODY_PRESETS = {
  original: { label: 'Původní', nodes: () => undefined },
  pear: { label: 'Hruška', nodes: () => [.55, .65, .8, 1, 1.5, 1.55, 1.3].map(width => ({ width, height: width, bend: 0 })) },
  ray: { label: 'Ploché', nodes: () => [.65, .85, 1.3, 1.65, 1.5, 1.1, .8].map(width => ({ width, height: .55, bend: 0 })) },
  arch: { label: 'Oblouk', nodes: () => [0, .15, .4, .6, .4, .1, -.15].map((bend, i) => ({ width: i === 4 ? .65 : 1, height: i === 4 ? .65 : 1, bend })) },
} satisfies Record<string, { label: string; nodes: () => SpineNode[] | undefined }>;

export const bodyWidth = (g: Genome): number => g.version === 2 ? g.width * Math.max(...g.body.spine.map(n => n.width)) : legacy.bodyWidth(g);
/** Relative shape volume, preserving the historical global-dimension convention. */
export const bodyVolume = (g: Genome): number => g.version === 2 ? creatureBodyVolume(g) / (g.length * g.width * g.width) : legacy.bodyVolume(g);
export function bodyCollisionRadius(g: Genome, stage: Stage): number {
  if (g.version === 1) return legacy.bodyCollisionRadius(g, stage);
  const { bounds } = resolveCreatureAnatomy(g);
  return Math.max(.6, Math.abs(bounds.min.x), Math.abs(bounds.max.x));
}
