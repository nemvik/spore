import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { groundHeight } from '../src/game/random';
import { createWorld } from '../src/game/world';
import { ObstacleContours } from '../src/render/obstacle-contours';
import { disposeObject } from '../src/render/organism';

describe('faded solid obstacle footprints', () => {
  it.each([0, 1, 2] as const)('traces actual collision radii at the swimming plane or floor in stage %i without changing the world', stage => {
    const world = createWorld(481516, stage), before = JSON.stringify(world), contours = new ObstacleContours(world);
    try {
      expect(contours.group.children).toHaveLength(0);
      for (const obstacle of world.obstacles) {
        contours.setFade(obstacle.id, .1);
        const mesh = contours.group.getObjectByName(`collision-footprint-${obstacle.id}`) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
        const positions = mesh.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i), radius = Math.hypot(x, z);
          expect(radius).toBeLessThanOrEqual(obstacle.radius + 1e-5);
          if (i % 2 === 1) expect(radius).toBeCloseTo(obstacle.radius, 5);
          const expectedHeight = stage === 0 ? 1.1 : groundHeight(x + mesh.position.x, z + mesh.position.z, stage) + .065;
          expect(y + mesh.position.y).toBeCloseTo(expectedHeight, 5);
        }
        expect(mesh.material.depthTest).toBe(true);
        expect(mesh.material.depthWrite).toBe(false);
      }
      expect(JSON.stringify(world)).toBe(before);
    } finally { disposeObject(contours.group); }
  });

  it('allocates only for real faded colliders, reuses contours through fade cycles and disposes owned resources once', () => {
    const world = createWorld(20260913, 2), contours = new ObstacleContours(world), obstacle = world.obstacles[0];
    contours.setFade(undefined, .1); contours.setFade(world.resources[0].id, .1); contours.setFade(obstacle.id, 1);
    expect(contours.group.children).toHaveLength(0);
    contours.setFade(obstacle.id, .1);
    const mesh = contours.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const geometry = mesh.geometry, material = mesh.material;
    let geometryDisposals = 0, materialDisposals = 0;
    geometry.addEventListener('dispose', () => geometryDisposals++); material.addEventListener('dispose', () => materialDisposals++);
    for (let i = 0; i < 30; i++) {
      contours.setFade(obstacle.id, .5); const halfwayOpacity = material.opacity;
      contours.setFade(obstacle.id, .1); expect(mesh.visible).toBe(true); expect(material.opacity).toBeGreaterThan(halfwayOpacity);
      contours.setFade(obstacle.id, 1); expect(mesh.visible).toBe(false);
      expect(contours.group.children).toEqual([mesh]); expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
    }
    disposeObject(contours.group);
    expect(geometryDisposals).toBe(1); expect(materialDisposals).toBe(1);
  });
});
