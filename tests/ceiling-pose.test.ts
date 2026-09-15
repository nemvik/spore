import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { initialGenome } from '../src/game/genome';
import { groundHeight } from '../src/game/random';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import type { Genome } from '../src/game/types';
import { animateOrganism, createOrganism, disposeObject } from '../src/render/organism';
import { playerSoftCeiling } from '../src/render/renderer';

// The actual native v9 probe anatomy, placed at its physical roof contact height.
function genome(): Genome {
  const result = initialGenome(); result.width = .85;
  result.parts.find(part => part.id === 'primordial-mouth')!.kind = 'filter';
  result.parts.push(
    { id: 'reef-fins', kind: 'fins', axial: -.1, angle: 1.25, scale: 1, mirrored: true },
    { id: 'reef-gills', kind: 'gills', axial: .1, angle: 0, scale: 1, mirrored: false },
    { id: 'reef-eyes', kind: 'eyes', axial: .8, angle: 1, scale: 1, mirrored: true },
  );
  return result;
}
function softParts(model: THREE.Group) {
  const parts: THREE.Object3D[] = [];
  model.traverse(node => { if (['fins', 'gills', 'filter'].includes(node.userData.kind)) parts.push(node); });
  return parts;
}
function highest(parts: THREE.Object3D[]): number {
  const point = new THREE.Vector3(); let top = -Infinity;
  for (const part of parts) part.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const points = node.geometry.getAttribute('position');
    for (let i = 0; i < points.count; i++) top = Math.max(top, point.fromBufferAttribute(points, i).applyMatrix4(node.matrixWorld).y);
  });
  return top;
}
function pose(model: THREE.Group) {
  const result: number[][] = [];
  model.traverse(node => result.push([...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]));
  return result;
}

describe('player soft appendages under a physical reef ceiling', () => {
  it('uses only overlapping elevated rock undersides and releases a removed lid immediately', () => {
    const state = createGame(20260913); state.stage = 1; state.world = createWorld(state.seed, 1);
    state.player.pos = { x: 0, y: .82, z: 0 };
    const roof = { id: 90001, kind: 'rock' as const, pos: { x: 0, y: 1.5, z: 0 }, radius: 6, height: 1.4 };
    state.world.obstacles = [roof];
    const before = JSON.stringify(state);
    expect(playerSoftCeiling(state)).toBe(1.5); expect(JSON.stringify(state)).toBe(before);
    state.player.pos.y = 3; expect(playerSoftCeiling(state)).toBeUndefined();
    state.player.pos = { x: 6.01, y: .82, z: 0 }; expect(playerSoftCeiling(state)).toBeUndefined();
    state.player.pos.x = 0;
    state.world.obstacles = [{ ...roof, pos: { x: 0, y: groundHeight(0, 0, 1), z: 0 }, height: 12 }];
    expect(playerSoftCeiling(state)).toBeUndefined();
    state.world.obstacles = [{ ...roof, kind: 'coral' }]; expect(playerSoftCeiling(state)).toBeUndefined();
    state.world.obstacles = [roof]; state.stage = 0; expect(playerSoftCeiling(state)).toBeUndefined();
    state.stage = 1; state.world.obstacles = []; expect(playerSoftCeiling(state)).toBeUndefined();
  });

  it('keeps the actual fins, dorsal gills and filter below the contact plane over moving poses', () => {
    const g = genome(), before = JSON.stringify(g), model = createOrganism(g);
    model.position.set(37, 1.5 - Math.max(.6, g.width * .8), -20); model.rotation.y = 1.4;
    try {
      animateOrganism(model, .43, 3, .4, 1, 0); model.updateMatrixWorld(true);
      expect(highest(softParts(model))).toBeGreaterThan(1.7); // Reproduces the unfurled penetration.
      for (const time of [0, .43, 1.2, 3.14]) for (const speed of [0, 3]) {
        animateOrganism(model, time, speed, .4, 1, 0, 0, 1.5); model.updateMatrixWorld(true);
        for (const part of softParts(model)) expect(highest([part]), `${part.userData.partId} time=${time} speed=${speed}`).toBeLessThanOrEqual(1.5);
      }
      expect(JSON.stringify(g)).toBe(before);
    } finally { disposeObject(model); }
  });

  it('restores ordinary animation without drift, resizing, or changes to rigid parts', () => {
    const g = genome(), model = createOrganism(g), ordinary = createOrganism(g);
    model.position.y = ordinary.position.y = .82;
    try {
      animateOrganism(ordinary, .43, 3, .4, 1, 0); const expected = pose(ordinary);
      for (let frame = 0; frame < 30; frame++) animateOrganism(model, .43, 3, .4, 1, 0, 0, 1.5);
      const folded = pose(model);
      expect(folded).not.toEqual(expected);
      let index = 0;
      model.traverse(node => {
        const kind = model.userData.motions.find((motion: { node: THREE.Object3D }) => motion.node === node)?.kind;
        if (kind !== 'fin' && kind !== 'gill') expect(folded[index]).toEqual(expected[index]);
        expect(node.scale.toArray()).toEqual(expected[index].slice(7)); index++;
      });
      animateOrganism(model, .43, 3, .4, 1, 0); expect(pose(model)).toEqual(expected);
      animateOrganism(model, .43, 3, .4, 0, 0, 0, 1.5);
      animateOrganism(ordinary, .43, 3, .4, 0, 0); expect(pose(model)).toEqual(pose(ordinary));
    } finally { disposeObject(model); disposeObject(ordinary); }
  });

  it('responds to clearance while animation time is frozen, then returns to the default preview pose', () => {
    const model = createOrganism(genome()), ordinary = createOrganism(genome());
    try {
      model.position.y = .82;
      animateOrganism(model, 0, 0, 0, 1, 0, 0, 1.5); model.updateMatrixWorld(true);
      expect(highest(softParts(model))).toBeLessThanOrEqual(1.5);
      const contact = pose(model);
      animateOrganism(model, 0, 0, 0, 1, 0, 0, 1.5); expect(pose(model)).toEqual(contact);
      model.position.y = ordinary.position.y = -1;
      animateOrganism(model, 0, 0, 0, 1, 0, 0, 1.5);
      animateOrganism(ordinary, 0, 0, 0, 1, 0); expect(pose(model)).toEqual(pose(ordinary));
    } finally { disposeObject(model); disposeObject(ordinary); }
  });
});
