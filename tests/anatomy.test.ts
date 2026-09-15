import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { attachmentAngles, organismGroundClearance } from '../src/game/anatomy';
import { createOrganism, animateOrganism, createSpeciesModel, disposeObject } from '../src/render/organism';
import { SPECIES } from '../src/game/content';
import type { Genome, Part } from '../src/game/types';

function genome(overrides: Partial<Genome> = {}, legOverrides: Partial<Part> = {}): Genome {
  return { version: 1, name: 'Anatomie', length: 1, width: 1, hue: 168, pattern: 0,
    parts: [{ id: 'limbs', kind: 'legs', axial: -.1, angle: 1.25, scale: 1, mirrored: true, ...legOverrides }], ...overrides };
}
function attachments(model: THREE.Group, id: string): THREE.Object3D[] {
  const roots: THREE.Object3D[] = [];
  model.traverse(object => { if (object.userData.partId === id) roots.push(object); });
  return roots;
}
function soleHeights(model: THREE.Group, id = 'limbs'): number[] {
  model.updateMatrixWorld(true);
  return attachments(model, id).map(root => new THREE.Box3().setFromObject(root, true).min.y);
}

describe('shared body anatomy and actual rendered contact', () => {
  it.each([0, Math.PI, -Math.PI])('renders two visibly separate symmetric attachment roots on seam %s', angle => {
    const g = genome({}, { kind: 'fins', angle });
    expect(attachmentAngles(g.parts[0])).toHaveLength(2);
    const model = createOrganism(g);
    try {
      const roots = attachments(model, 'limbs');
      expect(roots).toHaveLength(2);
      expect(roots[0].position.x).toBeCloseTo(-roots[1].position.x, 10);
      expect(roots[0].position.y).toBeCloseTo(roots[1].position.y, 10);
      expect(roots[0].position.z).toBe(roots[1].position.z);
      expect(roots[0].position.distanceTo(roots[1].position)).toBeGreaterThan(.25);
      expect(g.parts[0].angle).toBe(angle); // Rendered seam separation never mutates the genome.
    } finally { disposeObject(model); }
  });

  it('preserves one non-mirrored attachment and applies the normal side pair without offsets', () => {
    expect(attachmentAngles({ angle: 0, mirrored: false })).toEqual([0]);
    expect(attachmentAngles({ angle: 1.25, mirrored: true })).toEqual([1.25, -1.25]);
    const model = createOrganism(genome({}, { mirrored: false }));
    try { expect(attachments(model, 'limbs')).toHaveLength(1); }
    finally { disposeObject(model); }
  });

  it('places default rendered soles at the shared physics clearance and keeps idle feet still', () => {
    const g = genome(), clearance = organismGroundClearance(g), model = createOrganism(g);
    expect(clearance).toBeCloseTo(.9701503500085643, 10);
    model.position.y = clearance;
    try {
      for (const time of [0, .8, 2.3]) {
        animateOrganism(model, time, 0, 0, 2, 0);
        for (const height of soleHeights(model)) expect(Math.abs(height)).toBeLessThan(.00001);
      }
    } finally { disposeObject(model); }
  });

  it('keeps an actual walking support sole within .02 of the floor and lifts the swing foot', () => {
    const g = genome(), model = createOrganism(g); model.position.y = organismGroundClearance(g);
    let observedSwing = false;
    try {
      for (const time of [.1, .3, .5, .7]) {
        animateOrganism(model, time, 3, 0, 2, 0);
        const heights = soleHeights(model);
        expect(Math.min(...heights)).toBeGreaterThan(-.00001);
        expect(Math.min(...heights)).toBeLessThan(.02);
        expect(Math.max(...heights)).toBeLessThanOrEqual(.181); // .16 swing plus a .02 visual-contact tolerance.
        if (Math.max(...heights) > .08) observedSwing = true;
      }
      expect(observedSwing).toBe(true);
    } finally { disposeObject(model); }
  });

  it.each([
    { width: .55, scale: .55, angle: 0 },
    { width: 1.8, scale: .55, angle: 0 },
    { width: 1.8, scale: 1.65, angle: Math.PI },
  ])('keeps finite geometry and a common sole plane at representative limits %j', ({ width, scale, angle }) => {
    const g = genome({ width, length: 2.4 }, { scale, angle });
    g.parts.push({ id: 'shorter-limbs', kind: 'legs', axial: .5, angle: 1.4, scale: .55, mirrored: true });
    const model = createOrganism(g); model.position.y = organismGroundClearance(g);
    try {
      model.traverse(object => {
        if (!(object as THREE.Mesh).isMesh) return;
        const positions = (object as THREE.Mesh).geometry.getAttribute('position');
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      });
      animateOrganism(model, 1.2, 0, 0, 2, 0);
      for (const height of [...soleHeights(model), ...soleHeights(model, 'shorter-limbs')]) expect(Math.abs(height)).toBeLessThan(.00001);
      animateOrganism(model, .43, 3, 0, 2, 0);
      for (const height of [...soleHeights(model), ...soleHeights(model, 'shorter-limbs')]) expect(height).toBeGreaterThan(-.00001);
    } finally { disposeObject(model); }
  });


  it('gives the reef ribbon a distinct mantle, eight moving vanes and a forked tail', () => {
    const needle = createSpeciesModel(SPECIES.find(s => s.id === 'needle')!);
    const ribbon = createSpeciesModel(SPECIES.find(s => s.id === 'ribbon')!);
    try {
      const count = (model: THREE.Group, kind: string) => model.userData.motions.filter((m: { kind: string }) => m.kind === kind).length;
      expect(count(needle, 'fin')).toBe(2);
      expect(count(ribbon, 'fin')).toBe(8);
      expect(count(ribbon, 'tail')).toBe(1);
      needle.scale.setScalar(1); ribbon.scale.setScalar(1);
      const needleSize = new THREE.Box3().setFromObject(needle).getSize(new THREE.Vector3());
      const ribbonSize = new THREE.Box3().setFromObject(ribbon).getSize(new THREE.Vector3());
      expect(ribbonSize.z).toBeGreaterThan(needleSize.z * 1.3);
    } finally { disposeObject(needle); disposeObject(ribbon); }
  });

  it('closes the widened body poles with continuous normal and color instead of a pinched ring', () => {
    const model = createOrganism(genome({ width: 1.55, parts: [] }));
    try {
      let body: THREE.BufferGeometry | undefined;
      model.traverse(object => {
        if ((object as THREE.Mesh).isMesh && (object as THREE.Mesh).geometry.hasAttribute('color')) body = (object as THREE.Mesh).geometry;
      });
      expect(body).toBeDefined();
      const positions = body!.getAttribute('position'), normals = body!.getAttribute('normal'), colors = body!.getAttribute('color');
      const zValues = Array.from({ length: positions.count }, (_, i) => positions.getZ(i));
      for (const poleZ of [Math.min(...zValues), Math.max(...zValues)]) {
        const indices = zValues.flatMap((z, i) => z === poleZ ? [i] : []);
        expect(indices.length).toBeGreaterThan(10);
        const first = indices[0];
        for (const index of indices) {
          expect(positions.getX(index)).toBeCloseTo(0, 10);
          expect(positions.getY(index)).toBe(positions.getY(first));
          expect(normals.getX(index)).toBe(0); expect(normals.getY(index)).toBe(0);
          expect(normals.getZ(index)).toBe(Math.sign(poleZ));
          expect(colors.getX(index)).toBe(colors.getX(first));
          expect(colors.getY(index)).toBe(colors.getY(first));
          expect(colors.getZ(index)).toBe(colors.getZ(first));
        }
      }
    } finally { disposeObject(model); }
  });
});
