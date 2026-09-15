import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { attachmentPoint, jawContacts } from '../src/game/anatomy';
import { animateOrganism, createOrganism, disposeObject, selectOrganismPart } from '../src/render/organism';
import type { Genome } from '../src/game/types';

function jawGenome(angle: number, scale: number): Genome {
  return { version: 1, name: 'Čelistní kloub', length: 1.2, width: .8, hue: 138, pattern: 0,
    parts: [{ id: 'jaw', kind: 'jaw', axial: .9, angle, scale, mirrored: false }] };
}

/** A point is inside this actual convex mesh only when every outward face contains it. */
function containsPoint(mesh: THREE.Mesh, point: THREE.Vector3): boolean {
  const local = mesh.worldToLocal(point.clone()), positions = mesh.geometry.getAttribute('position');
  const indices = mesh.geometry.getIndex()!, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const plane = new THREE.Plane();
  for (let i = 0; i < indices.count; i += 3) {
    a.fromBufferAttribute(positions, indices.getX(i)); b.fromBufferAttribute(positions, indices.getX(i + 1)); c.fromBufferAttribute(positions, indices.getX(i + 2));
    if (new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).lengthSq() < 1e-12) continue;
    if (plane.setFromCoplanarPoints(a, b, c).distanceToPoint(local) > 1e-6) return false;
  }
  return true;
}

describe('visible jaw attachment', () => {
  it.each([0, Math.PI / 2, Math.PI].flatMap(angle => [.55, 1.5, 1.65].map(scale => ({ angle, scale }))))(
    'joins the body to both existing animated branches at %j without moving contact', ({ angle, scale }) => {
      const genome = jawGenome(angle, scale), before = JSON.stringify(genome), contacts = jawContacts(genome), model = createOrganism(genome);
      const root = model.children[0].children.find(child => child.userData.partId === 'jaw')!;
      try {
        expect(root.position.toArray()).toEqual(Object.values(attachmentPoint(.9, angle, 1.2, .8)));
        const socket = root.getObjectByName('jaw-socket') as THREE.Mesh;
        expect(socket?.isMesh).toBe(true);
        const branches = root.children.filter(child => child instanceof THREE.Group);
        expect(branches).toHaveLength(2);
        for (const time of [0, .08, .24, .4, .73]) {
          animateOrganism(model, time, 0, 0, 2, 1);
          model.updateMatrixWorld(true);
          const anchor = root.localToWorld(new THREE.Vector3());
          for (const branch of branches) {
            const horn = branch.children[0] as THREE.Mesh, ring = horn.geometry.getAttribute('position');
            const hinge = new THREE.Vector3();
            // The original horn's first ring is its physical base; no duplicated attachment formula.
            for (let vertex = 0; vertex < 8; vertex++) hinge.add(horn.localToWorld(new THREE.Vector3().fromBufferAttribute(ring, vertex)));
            hinge.divideScalar(8);
            for (const fraction of [0, .25, .5, .75, 1]) {
              const center = anchor.clone().lerp(hinge, fraction);
              expect(containsPoint(socket, center)).toBe(true);
              // Require a little actual tissue around the bridge, not only a touching point.
              for (const axis of ['x', 'y', 'z'] as const) for (const side of [-1, 1]) {
                const point = center.clone(); point[axis] += side * .015 * scale;
                expect(containsPoint(socket, point), JSON.stringify({ time, fraction, axis, side, point: socket.worldToLocal(point.clone()).toArray() })).toBe(true);
              }
            }
          }
        }
        expect(JSON.stringify(genome)).toBe(before);
        expect(jawContacts(genome)).toEqual(contacts);
      } finally { disposeObject(model); }
    },
  );

  it('releases the new geometry and its selected appearance exactly once', () => {
    const model = createOrganism(jawGenome(Math.PI, 1.5));
    const socket = model.getObjectByName('jaw-socket') as THREE.Mesh;
    expect(socket?.isMesh).toBe(true);
    let geometryDisposed = 0, originalDisposed = 0, selectedDisposed = 0;
    socket.geometry.addEventListener('dispose', () => geometryDisposed++);
    (socket.material as THREE.Material).addEventListener('dispose', () => originalDisposed++);
    selectOrganismPart(model, 'jaw');
    (socket.material as THREE.Material).addEventListener('dispose', () => selectedDisposed++);
    selectOrganismPart(model, null);
    expect(selectedDisposed).toBe(1); expect(originalDisposed).toBe(0); expect(geometryDisposed).toBe(0);
    disposeObject(model);
    expect(geometryDisposed).toBe(1); expect(originalDisposed).toBe(1); expect(selectedDisposed).toBe(1);
  });
});
