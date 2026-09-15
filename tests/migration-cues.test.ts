import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { groundHeight } from '../src/game/random';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import type { GameState } from '../src/game/types';
import { MigrationCues } from '../src/render/migration-cues';
import { disposeObject } from '../src/render/organism';

function following() {
  const state = createGame(481516, false);
  state.stage = 2; state.world = createWorld(state.seed, 2); state.worlds[2] = state.world;
  const creature = state.world.creatures.find(c => c.species === 'gloom')!;
  creature.intent = 'forage'; creature.target = -1;
  state.world.creatures = [creature];
  state.journey.cargo = { purpose: 'culture', site: 8, kind: 'detritus', vitality: 80, distance: 0 };
  return state;
}

describe('wild culture follower presentation', () => {
  it('appears only for an active wild follower and clears every losing condition immediately', () => {
    const cue = new MigrationCues();
    const stops: Array<(s: GameState) => void> = [
      s => { s.stage = 1; }, s => { s.journey.legacy = true; }, s => { s.campaign.won = true; },
      s => { s.journey.cargo = null; }, s => { s.journey.cargo!.purpose = 'food'; }, s => { s.journey.cargo!.site = 7; },
      s => { s.world.creatures[0].species = 'lantern'; }, s => { s.world.creatures[0].target = null; },
      s => { s.world.creatures[0].target = 42; }, s => { s.world.creatures[0].intent = 'flee'; },
      s => { s.world.creatures[0].intent = 'rest'; }, s => { s.world.creatures[0].intent = 'bonded'; },
      s => { s.world.creatures = []; },
    ];
    try {
      for (const stop of stops) {
        const state = following(); cue.update(state, 5);
        expect(cue.mesh.visible).toBe(true); expect(cue.mesh.count).toBeGreaterThan(0);
        stop(state); cue.update(state, 5);
        expect(cue.mesh.visible).toBe(false); expect(cue.mesh.count).toBe(0);
      }
    } finally { cue.dispose(); }
  });

  it('keeps the same small ground-local positions for a frozen phase and never changes a save', () => {
    const state = following(), cue = new MigrationCues(), matrix = new THREE.Matrix4(), position = new THREE.Vector3();
    const follower = state.world.creatures[0];
    try {
      for (const location of [{ x: -38, y: 3, z: 21 }, { x: 42, y: -1, z: -34 }]) {
        follower.pos = location;
        const before = JSON.stringify(state);
        cue.update(state, 0); const frozen = Array.from(cue.mesh.instanceMatrix.array);
        cue.update(state, 12); expect(Array.from(cue.mesh.instanceMatrix.array)).not.toEqual(frozen);
        cue.update(state, 0); expect(Array.from(cue.mesh.instanceMatrix.array)).toEqual(frozen);
        for (let i = 0; i < cue.mesh.count; i++) {
          cue.mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
          expect(Math.hypot(position.x - follower.pos.x, position.z - follower.pos.z)).toBeLessThan(.81);
          const height = position.y - groundHeight(position.x, position.z, 2);
          expect(height).toBeGreaterThan(.1); expect(height).toBeLessThan(.32);
        }
        expect(JSON.stringify(state)).toBe(before);
      }
      expect(cue.mesh.material.depthTest).toBe(true); expect(cue.mesh.material.depthWrite).toBe(false);
      cue.mesh.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(follower.pos.x, 20, follower.pos.z), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(cue.mesh)).toEqual([]);
    } finally { cue.dispose(); }
  });

  it('reuses bounded instance buffers across changing groups and disposes all owned resources once', () => {
    const state = following(), cue = new MigrationCues(), parent = new THREE.Group(); parent.add(cue.mesh);
    const geometry = cue.mesh.geometry, material = cue.mesh.material, matrices = cue.mesh.instanceMatrix, colors = cue.mesh.instanceColor;
    let meshDisposals = 0, geometryDisposals = 0, materialDisposals = 0;
    cue.mesh.addEventListener('dispose', () => meshDisposals++);
    geometry.addEventListener('dispose', () => geometryDisposals++); material.addEventListener('dispose', () => materialDisposals++);
    try {
      const follower = state.world.creatures[0];
      for (const count of [1, 3, 0, 128, 129, 1, 0]) {
        state.world.creatures = Array.from({ length: count }, (_, index) => ({ ...follower, id: index + 1 }));
        cue.update(state, 8);
        expect(cue.mesh.count).toBeLessThanOrEqual(matrices.count);
        expect(cue.mesh.visible).toBe(count > 0);
        expect(cue.mesh.geometry).toBe(geometry); expect(cue.mesh.material).toBe(material);
        expect(cue.mesh.instanceMatrix).toBe(matrices); expect(cue.mesh.instanceColor).toBe(colors);
      }
    } finally { cue.dispose(); cue.dispose(); disposeObject(parent); }
    expect(parent.children).toHaveLength(0);
    expect([meshDisposals, geometryDisposals, materialDisposals]).toEqual([1, 1, 1]);
  });
});
