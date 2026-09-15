import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPECIES } from '../src/game/content';
import { initialGenome } from '../src/game/genome';
import type { InteractionTarget } from '../src/game/interactions';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { initializeJourneyStage } from '../src/game/journey';
import { createHabitat } from '../src/render/habitat';
import { createOrganism, createSpeciesModel, disposeObject } from '../src/render/organism';
import { GameRenderer } from '../src/render/renderer';
import { applyLivingFinish, setLivingDanger, setPartnerActivity, targetBracketGeometry } from '../src/render/world-style';

describe('scenery keeps the playable collision contract', () => {
  it.each([481516, 20260913, 8675309])('keeps every rendered obstacle inside its actual cylinder for seed %i', seed => {
    for (const stage of [0, 1, 2] as const) {
      const state = createGame(seed, false);
      state.stage = stage; state.world = createWorld(seed, stage); state.worlds[stage] = state.world;
      initializeJourneyStage(state);
      const before = JSON.stringify(state.world), habitat = createHabitat(state.world);
      try {
        habitat.updateMatrixWorld(true);
        for (const obstacle of state.world.obstacles) {
          const node = habitat.getObjectByName(`obstacle-${obstacle.kind}-${obstacle.id}`)!;
          expect(node).toBeDefined();
          let radial = 0, low = Infinity, high = -Infinity, finite = true;
          const vertex = new THREE.Vector3();
          node.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            const position = child.geometry.getAttribute('position');
            for (let i = 0; i < position.count; i++) {
              vertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld).sub(node.position);
              finite &&= Number.isFinite(vertex.x + vertex.y + vertex.z);
              radial = Math.max(radial, Math.hypot(vertex.x, vertex.z));
              low = Math.min(low, vertex.y); high = Math.max(high, vertex.y);
            }
          });
          expect(finite).toBe(true);
          expect(radial).toBeLessThanOrEqual(obstacle.radius + 1e-5);
          expect(low).toBeGreaterThanOrEqual(-1e-5);
          expect(high).toBeLessThanOrEqual(obstacle.height + 1e-5);
        }
        expect(JSON.stringify(state.world)).toBe(before);
      } finally { disposeObject(habitat); }
    }
  });
});

function meshMaterials(model: THREE.Group): THREE.MeshStandardMaterial[] {
  const materials = new Set<THREE.MeshStandardMaterial>();
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) if (mat instanceof THREE.MeshStandardMaterial) materials.add(mat);
  });
  return [...materials];
}

describe('living material lifecycle', () => {
  it('reuses the body materials and uniform objects through repeated warning states', () => {
    const model = createOrganism(initialGenome());
    const materials = meshMaterials(model), ids = materials.map(mat => mat.uuid);
    const disposed = new Map(materials.map(mat => [mat, 0]));
    materials.forEach(mat => mat.addEventListener('dispose', () => disposed.set(mat, disposed.get(mat)! + 1)));
    try {
      applyLivingFinish(model, 'player');
      const finish = model.userData.livingFinish;
      const callbacks = materials.map(mat => mat.onBeforeCompile);
      for (let i = 0; i < 20; i++) {
        applyLivingFinish(model, 'player');
        setLivingDanger(model, { phase: 'windup', progress: .7, aim: { x: 0, y: 0, z: 0 }, targetPlayer: true, feeding: false });
        expect(finish.danger.value).toBeGreaterThan(0);
        setLivingDanger(model, { phase: 'recover', progress: .1, aim: { x: 0, y: 0, z: 0 }, targetPlayer: false, feeding: true });
        expect(finish.danger.value).toBe(0);
      }
      expect(model.userData.livingFinish).toBe(finish);
      expect(meshMaterials(model).map(mat => mat.uuid)).toEqual(ids);
      expect(materials.map(mat => mat.onBeforeCompile)).toEqual(callbacks);
    } finally { disposeObject(model); }
    expect([...disposed.values()].every(count => count === 1)).toBe(true);
  });

  it('restores the same partner colours and glow after repeated hunger/recovery cycles', () => {
    const model = createSpeciesModel(SPECIES.find(species => species.id === 'lantern')!);
    const materials = meshMaterials(model), before = materials.map(mat => ({ id: mat.uuid, color: mat.color.clone(), glow: mat.emissiveIntensity }));
    try {
      for (let i = 0; i < 20; i++) {
        setPartnerActivity(model, false);
        expect(materials.some((mat, index) => mat.emissiveIntensity < before[index].glow)).toBe(true);
        setPartnerActivity(model, true);
        expect(materials.map(mat => ({ id: mat.uuid, color: mat.color, glow: mat.emissiveIntensity }))).toEqual(before);
      }
      expect(meshMaterials(model)).toEqual(materials);
    } finally { disposeObject(model); }
  });
});

describe('selected target depth cue', () => {
  it('connects the selected target to the player plane and points toward its actual height', () => {
    const marker = new THREE.Group(), markerBrackets = new THREE.Mesh(targetBracketGeometry(), new THREE.MeshBasicMaterial());
    const markerStem = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3)).setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, 1], 1)));
    const markerTip = new THREE.Mesh(), markerArrow = new THREE.Mesh(); marker.add(markerBrackets, markerStem, markerTip, markerArrow);
    const renderer = Object.create(GameRenderer.prototype) as { updateInteractionMarker(target: InteractionTarget | null, player: { x: number; y: number; z: number }): void };
    Object.assign(renderer, { marker, markerBrackets, markerStem, markerTip, markerArrow });
    const player = { x: 0, y: 4, z: 0 };
    const target: InteractionTarget = { action: 'tend', kind: 'culture', id: 4, pos: { x: 3, y: -2, z: 5 }, distance: 8, range: 4, ready: false, reason: 'below' };
    try {
      for (const height of [-2, 11]) {
        target.pos.y = height; renderer.updateInteractionMarker(target, player);
        expect(marker.position.toArray()).toEqual([3, height, 5]);
        expect(marker.position.y + markerTip.position.y).toBe(player.y);
        expect(markerStem.geometry.getAttribute('position').getY(1)).toBe(player.y - height);
        const direction = new THREE.Vector3(0, 1, 0).applyEuler(markerArrow.rotation);
        expect(Math.sign(direction.y)).toBe(Math.sign(height - player.y));
      }
      target.pos.y = player.y; renderer.updateInteractionMarker(target, player); expect(markerArrow.visible).toBe(false); expect(markerStem.visible).toBe(false);
      renderer.updateInteractionMarker(null, player); expect(marker.visible).toBe(false);
    } finally { disposeObject(marker); markerStem.geometry.dispose(); (markerStem.material as THREE.Material).dispose(); }
  });
});
