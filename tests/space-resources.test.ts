import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeObject } from '../src/render/organism';

it('releases shared stellar Points geometry and materials exactly once with meshes and lines', () => {
  const scene = new THREE.Scene(), pointsGeometry = new THREE.BufferGeometry(), pointsMaterial = new THREE.PointsMaterial();
  const meshGeometry = new THREE.BoxGeometry(), meshMaterial = new THREE.MeshBasicMaterial(), lineMaterial = new THREE.LineBasicMaterial();
  scene.add(new THREE.Points(pointsGeometry, pointsMaterial), new THREE.Points(pointsGeometry, pointsMaterial));
  scene.add(new THREE.Mesh(meshGeometry, meshMaterial), new THREE.Line(meshGeometry, lineMaterial));
  const resources = [pointsGeometry, pointsMaterial, meshGeometry, meshMaterial, lineMaterial];
  const spies = resources.map(resource => vi.spyOn(resource, 'dispose'));
  disposeObject(scene);
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
});
