import { BODY_PRESETS, neutralSpine } from '../../src/game/body-shape';
import { initialGenome } from '../../src/game/genome';
import type { Genome } from '../../src/game/types';

/** All five use exactly the original filter and flagellum, including attachments. */
export const BODY_SILHOUETTES: { id: string; label: string; genome: Genome }[] = [
  { id: 'needle', label: 'Jehla', genome: { ...initialGenome(), length: 1.65, width: .65, spine: neutralSpine().map(() => ({ width: .6, height: .6, bend: 0 })) } },
  { id: 'round', label: 'Oblázek', genome: { ...initialGenome(), length: .7, width: 1.4, spine: neutralSpine().map(() => ({ width: 1.2, height: 1.2, bend: 0 })) } },
  { id: 'pear', label: 'Hruška', genome: { ...initialGenome(), spine: BODY_PRESETS.pear.nodes() } },
  { id: 'ray', label: 'Plochý rejnok', genome: { ...initialGenome(), length: .9, width: 1.2, spine: BODY_PRESETS.ray.nodes() } },
  { id: 'arch', label: 'Prohnutý krk', genome: { ...initialGenome(), length: 1.35, width: .9, spine: [-.6, -.55, -.4, -.05, .5, .65, .55].map((bend, i) => ({ width: i === 4 ? .5 : i === 5 ? .65 : 1, height: i === 4 ? .5 : i === 5 ? .65 : 1, bend })) } },
];
