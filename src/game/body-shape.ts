import type { SpineNode } from './types';
export { bodyCollisionRadius, bodySection, bodyVolume, bodyWidth, neutralSpine, spineAxial, spineIndex, spineInvestment, SPINE_COUNT } from './body-profile';

export const BODY_PRESETS = {
  original: { label: 'Původní', nodes: () => undefined },
  pear: { label: 'Hruška', nodes: () => [.55, .65, .8, 1, 1.5, 1.55, 1.3].map(width => ({ width, height: width, bend: 0 })) },
  ray: { label: 'Ploché', nodes: () => [.65, .85, 1.3, 1.65, 1.5, 1.1, .8].map(width => ({ width, height: .55, bend: 0 })) },
  arch: { label: 'Oblouk', nodes: () => [0, .15, .4, .6, .4, .1, -.15].map((bend, i) => ({ width: i === 4 ? .65 : 1, height: i === 4 ? .65 : 1, bend })) },
} satisfies Record<string, { label: string; nodes: () => SpineNode[] | undefined }>;
