import { spineAxial } from '../../src/game/body-shape';
import type { CreatureGenome, LimbGene, Part } from '../../src/game/types';

const leg = (): LimbGene => ({
  joints: [
    { id: 'knee', offset: { x: 0.48, y: -0.34, z: -0.14 }, radius: 0.135 },
    { id: 'ankle', offset: { x: 0.77, y: -1.14, z: 0.16 }, radius: 0.1 },
  ],
  end: { kind: 'foot', style: 'pad', scale: 1 },
});

const arm = (): LimbGene => ({
  joints: [
    { id: 'elbow', offset: { x: 0.3, y: -0.2, z: 0.08 }, radius: 0.11 },
    { id: 'wrist', offset: { x: 0.5, y: -0.48, z: 0.2 }, radius: 0.08 },
  ],
  end: { kind: 'hand', style: 'palm', scale: 0.8 },
});

const part = (id: string, kind: Part['kind'], axial: number, limb?: LimbGene): Part => ({
  id, kind, axial, angle: Math.PI / 2, scale: 1, mirrored: kind === 'legs' || kind === 'arms',
  ...(limb ? { limb } : {}),
});

export function creatureBodyFixture(kind: 'biped' | 'quadruped' | 'longneck'): CreatureGenome {
  const spine = Array.from({ length: 7 }, (_, index) => ({
    id: `spine-${index}`, axial: spineAxial(index), width: 1, height: 1, bend: 0,
  }));
  const parts: Part[] = [
    part('lungs', 'lungs', 0),
    { ...part('mouth', 'jaw', kind === 'longneck' ? 0.9 : 0.82), angle: 0, mirrored: false },
  ];
  if (kind === 'biped') {
    parts.push(part('hind-legs', 'legs', -0.2, leg()), part('arms', 'arms', 0.45, arm()));
  } else {
    parts.push(part('hind-legs', 'legs', -0.45, leg()), part('front-legs', 'legs', kind === 'longneck' ? 0.05 : 0.4, leg()));
  }
  if (kind === 'longneck') {
    Object.assign(spine[4], { width: 0.65, height: 0.65, bend: 0.65 });
    Object.assign(spine[5], { width: 0.4, height: 0.45, bend: 1.4 });
    Object.assign(spine[6], { width: 0.65, height: 0.65, bend: 2.1 });
  }
  return {
    version: 2, name: kind, length: 1, width: 1, hue: 168, pattern: 0, parts,
    body: { spine, skin: { finish: 'smooth', secondaryHue: 168, contrast: 0.5, patternScale: 1 } },
  };
}
