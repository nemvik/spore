import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getClimate } from '../src/game/climate';
import { cloneGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint } from '../src/game/simulation';
import type { Stage } from '../src/game/types';
import { createWorld } from '../src/game/world';
import { createHabitat, updateHabitat } from '../src/render/habitat';

// Prepared states exercise actual scene transforms/materials without a GPU or browser.
function fixture(seed: number, stage: Stage) {
  const state = createGame(seed);
  state.stage = stage;
  state.world = createWorld(seed, stage);
  state.worlds[stage] = state.world;
  state.player.pos = { ...state.world.landmarks[0].pos };
  if (stage === 2) {
    state.player.genome = cloneGenome(state.player.genome);
    state.player.genome.parts.push(
      { id: 'habitat-legs', kind: 'legs', axial: -0.1, angle: 1.25, scale: 1, mirrored: true },
      { id: 'habitat-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
    );
  }
  makeCheckpoint(state);
  return state;
}

function appearance(group: THREE.Group) {
  const flora: { name: string; scale: number[]; colors: number[][] }[] = [];
  group.traverse((node) => {
    if (!node.name.startsWith('flora-')) return;
    const colors: number[][] = [];
    node.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (material instanceof THREE.MeshStandardMaterial) colors.push([...material.color.toArray(), material.emissiveIntensity]);
      }
    });
    flora.push({ name: node.name, scale: node.scale.toArray(), colors });
  });
  return flora;
}

function dispose(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

describe('visible ecological state remains live with reduced motion', () => {
  it.each([0, 1] as const)('updates fertility in aquatic stage %i while animation time stays zero', (stage) => {
    const state = fixture(481516, stage);
    const habitat = createHabitat(state.world, getClimate(state));
    try {
      const lush = appearance(habitat);
      state.world.patches[0].fertility = 0.2;
      state.world.time = 2;
      updateHabitat(habitat, state.world, 0, getClimate(state));
      const depleted = appearance(habitat);
      expect(depleted[0].scale[1]).toBeLessThan(lush[0].scale[1] * 0.5);
      expect(depleted[0].colors).not.toEqual(lush[0].colors);
      expect(depleted.find((plant) => plant.name === 'flora-1-0')).toEqual(lush.find((plant) => plant.name === 'flora-1-0'));
    } finally { dispose(habitat); }
  });

  it.each([481516, 20260913, 8675309])('retains drought and restoration appearance through save/load for seed %i', (seed) => {
    const state = fixture(seed, 2);
    const habitat = createHabitat(state.world, getClimate(state));
    const rebuilt: THREE.Group[] = [];
    try {
      const lush = appearance(habitat);
      state.campaign.drought = 1;
      state.world.patches[0].fertility = 0.4;
      state.world.time = 2;
      updateHabitat(habitat, state.world, 0, getClimate(state));
      const depleted = appearance(habitat);
      expect(depleted[0].scale[1]).toBeLessThan(lush[0].scale[1] * 0.4);
      expect(depleted[0].colors).not.toEqual(lush[0].colors);
      expect(habitat.getObjectByName('spring-water')!.visible).toBe(false);

      const dryLoaded = parseGame(serializeGame(state));
      const dryRebuilt = createHabitat(dryLoaded.world, getClimate(dryLoaded));
      rebuilt.push(dryRebuilt);
      expect(appearance(dryRebuilt)).toEqual(depleted);

      state.world.landmarks.find((landmark) => landmark.id === 'spring-0')!.charge = 10;
      state.world.patches[0].fertility = 1.1;
      state.world.time = 3;
      updateHabitat(habitat, state.world, 0, getClimate(state));
      const restored = appearance(habitat);
      expect(restored[0].scale[1]).toBeGreaterThan(depleted[0].scale[1] * 2);
      expect(habitat.getObjectByName('spring-water')!.visible).toBe(true);
      const restoredLoaded = parseGame(serializeGame(state));
      const restoredRebuilt = createHabitat(restoredLoaded.world, getClimate(restoredLoaded));
      rebuilt.push(restoredRebuilt);
      expect(appearance(restoredRebuilt)).toEqual(restored);
      expect(restoredRebuilt.getObjectByName('spring-water')!.visible).toBe(true);
      expect(restored.flatMap((plant) => [...plant.scale, ...plant.colors.flat()]).every(Number.isFinite)).toBe(true);
    } finally { [habitat, ...rebuilt].forEach(dispose); }
  });
});
