import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { initializeJourneyStage } from '../src/game/journey';
import { reefWater } from '../src/game/journey-network';
import { createOrganism, disposeObject } from '../src/render/organism';
import { ReefFilterCues, setReefFilterOpening } from '../src/render/reef-filter-cues';
import { JourneyPresentation } from '../src/render/journey';

function fixture() {
  const s = createGame(20260913, false, true);
  s.stage = 1; s.world = createWorld(s.seed, 1); s.worlds[1] = s.world;
  initializeJourneyStage(s); s.world.obstacles = [];
  s.journey.reefEvolution = { version: 1, pumping: 1 };
  return s;
}

describe('local living filter presentation', () => {
  it('follows the actual placed organ and body transform without moving simulated tissue', () => {
    const s = fixture(), cue = new ReefFilterCues();
    const filter = s.player.genome.parts.find(p => p.kind === 'filter')!;
    filter.axial = -.7; filter.angle = 1.2; filter.scale = 1.5;
    const model = createOrganism(s.player.genome); model.position.set(8, -2, 7); model.rotation.y = .8;
    const before = JSON.stringify(s);
    try {
      cue.update(s, .3, model); expect(cue.group.visible).toBe(true);
      const motes = cue.group.children[0] as THREE.InstancedMesh, first = new THREE.Matrix4(), after = new THREE.Matrix4();
      motes.getMatrixAt(0, first);
      model.position.x += 10; cue.update(s, .3, model); motes.getMatrixAt(0, after);
      expect(after.elements[12] - first.elements[12]).toBeCloseTo(10, 5);
      expect(after.elements[13]).toBeCloseTo(first.elements[13], 5);
      expect(motes.count).toBeLessThanOrEqual(24);
      const materials = motes.material as THREE.MeshBasicMaterial;
      expect(materials.depthTest).toBe(true); expect(materials.depthWrite).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    } finally { cue.dispose(); disposeObject(model); }
  });

  it('closes when released, restores old poses and hides cues without the opt-in or filter', () => {
    const s = fixture(), cue = new ReefFilterCues(), model = createOrganism(s.player.genome);
    const fan = (model.userData.visual as THREE.Group).children.find(n => n.userData.kind === 'filter')!.children[0];
    try {
      setReefFilterOpening(model, 1); const open = fan.scale.clone();
      setReefFilterOpening(model, 0); expect(fan.scale.x).toBeLessThan(open.x);
      setReefFilterOpening(model, null); expect(fan.scale.toArray()).toEqual([1, 1, 1]);
      cue.update(s, 0, model); expect(cue.group.visible).toBe(true);
      s.journey.reefEvolution!.pumping = 0; cue.update(s, 0, model); expect(cue.group.visible).toBe(false);
      s.journey.reefEvolution!.pumping = 1; s.stage = 2; cue.update(s, 0, model); expect(cue.group.visible).toBe(false);
      s.stage = 1; delete s.journey.reefEvolution; cue.update(s, 0, model); expect(cue.group.visible).toBe(false);
      s.journey.reefEvolution = { version: 1, pumping: 1 }; s.player.health = 0; cue.update(s, 0, model); expect(cue.group.visible).toBe(false);
      s.player.health = 100; s.player.genome.parts = s.player.genome.parts.filter(part => part.kind !== 'filter');
      const withoutFilter = createOrganism(s.player.genome);
      cue.update(s, 0, withoutFilter); expect(cue.group.visible).toBe(false); disposeObject(withoutFilter);
    } finally { cue.dispose(); disposeObject(model); }
  });

  it('retains bounded geometry during updates and disposes it once', () => {
    const s = fixture(), cue = new ReefFilterCues(), model = createOrganism(s.player.genome);
    const meshes = cue.group.children as THREE.InstancedMesh[];
    const owned = meshes.map(mesh => ({ mesh, geometry: mesh.geometry, material: mesh.material as THREE.Material, disposals: [0, 0, 0] }));
    for (const resource of owned) {
      resource.mesh.addEventListener('dispose', () => resource.disposals[0]++);
      resource.geometry.addEventListener('dispose', () => resource.disposals[1]++);
      resource.material.addEventListener('dispose', () => resource.disposals[2]++);
    }
    for (let i = 0; i < 20; i++) cue.update(s, i / 60, model);
    for (const resource of owned) { expect(resource.mesh.geometry).toBe(resource.geometry); expect(resource.mesh.material).toBe(resource.material); }
    cue.dispose(); cue.dispose();
    for (const resource of owned) expect(resource.disposals).toEqual([1, 1, 1]);
    expect(cue.group.children).toHaveLength(0); disposeObject(model);
  });

  it('shows bounded local gas while closed and shrinks the actual cleaned pocket with a frozen clock', () => {
    const s = fixture(), cue = new ReefFilterCues();
    s.player.pos = { ...s.journey.sites.find(site => site.id === 5)!.source };
    s.player.genome.parts.find(part => part.kind === 'filter')!.scale = 1.65;
    s.journey.reefEvolution!.pumping = 0;
    const model = createOrganism(s.player.genome), gas = cue.group.getObjectByName('filter-local-gas') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
    try {
      cue.update(s, 0, model);
      expect(gas.visible).toBe(true); expect(cue.group.getObjectByName('filter-intake')!.visible).toBe(false);
      expect(gas.count).toBeGreaterThanOrEqual(24); expect(gas.count).toBeLessThanOrEqual(36);
      const before = Array.from({ length: gas.count }, (_, i) => { gas.getMatrixAt(i, matrix); return matrix.clone(); });
      s.journey.reefEvolution!.pumping = 1;
      const state = JSON.stringify(s); cue.update(s, 0, model);
      let innerShrunk = 0;
      for (let i = 0; i < gas.count; i++) {
        gas.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); scale.setFromMatrixScale(matrix);
        expect(position.distanceTo(new THREE.Vector3(s.player.pos.x, s.player.pos.y, s.player.pos.z))).toBeLessThan(6);
        expect(position.toArray()).toEqual(new THREE.Vector3().setFromMatrixPosition(before[i]).toArray());
        expect(scale.x).toBeCloseTo(Math.min(1, reefWater(s, position).oxygenUse / 5), 5);
        const previousScale = new THREE.Vector3().setFromMatrixScale(before[i]).x;
        if (i < 12 && scale.x < previousScale * .6) innerShrunk++;
      }
      expect(innerShrunk).toBe(12); expect(JSON.stringify(s)).toBe(state);
      expect((gas.material as THREE.Material).depthTest).toBe(true); expect((gas.material as THREE.Material).depthWrite).toBe(false);
    } finally { cue.dispose(); disposeObject(model); }
  });

  it('shows no fictitious gas in clear water and hides samples behind solid obstacles', () => {
    const s = fixture(), cue = new ReefFilterCues(); s.journey.reefEvolution!.pumping = 0;
    const model = createOrganism(s.player.genome), gas = cue.group.getObjectByName('filter-local-gas') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
    try {
      s.player.pos = { x: 0, y: 10, z: 0 }; cue.update(s, 0, model);
      expect(gas.visible).toBe(false);
      for (let i = 0; i < gas.count; i++) { gas.getMatrixAt(i, matrix); expect(scale.setFromMatrixScale(matrix).length()).toBe(0); }
      s.player.pos = { ...s.journey.sites.find(site => site.id === 5)!.source }; cue.update(s, 0, model);
      gas.getMatrixAt(0, matrix); expect(scale.setFromMatrixScale(matrix).x).toBeGreaterThan(0);
      s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: s.player.pos.x + .7, y: s.player.pos.y - 2, z: s.player.pos.z }, radius: .25, height: 4 });
      cue.update(s, 0, model); gas.getMatrixAt(0, matrix); expect(scale.setFromMatrixScale(matrix).length()).toBe(0);
      s.stage = 2; cue.update(s, 0, model); expect(cue.group.visible).toBe(false); expect(gas.visible).toBe(false);
    } finally { cue.dispose(); disposeObject(model); }
  });

  it('keeps local water readable for an air body without claiming an active intake', () => {
    const s = fixture(), cue = new ReefFilterCues(); s.journey.reefEvolution!.pumping = 0;
    s.player.pos = { ...s.journey.sites.find(site => site.id === 5)!.source };
    s.player.genome.parts = s.player.genome.parts.filter(part => part.kind !== 'filter');
    const model = createOrganism(s.player.genome);
    try {
      cue.update(s, 0, model);
      expect(cue.group.getObjectByName('filter-local-gas')!.visible).toBe(true);
      expect(cue.group.getObjectByName('filter-intake')!.visible).toBe(false);
      s.journey.legacy = true; cue.update(s, 0, model); expect(cue.group.visible).toBe(false);
    } finally { cue.dispose(); disposeObject(model); }
  });

  it('changes gas clumps into clear directional pairs from real local chemistry, even with frozen motion', () => {
    const s = fixture(), view = new JourneyPresentation(new THREE.Scene());
    s.player.genome.parts.find(p => p.kind === 'filter')!.scale = 1.65;
    s.player.pos = { ...s.journey.sites.find(site => site.id === 5)!.source };
    s.journey.reefEvolution!.pumping = 0;
    try {
      view.update(s, 0, 0);
      const data = view as unknown as { flowPositions: Float32Array };
      for (let i = 0; i < data.flowPositions.length; i += 3) data.flowPositions.set([s.player.pos.x, s.player.pos.y, s.player.pos.z], i);
      view.update(s, 0, 0);
      const gas = view.group.getObjectByName('reef-gas-clusters') as THREE.InstancedMesh;
      const clean = view.group.getObjectByName('journey-vent-flow') as THREE.InstancedMesh;
      const beforeGas = new THREE.Matrix4(), afterGas = new THREE.Matrix4(), beforeClean = new THREE.Matrix4(), afterClean = new THREE.Matrix4();
      gas.getMatrixAt(0, beforeGas); clean.getMatrixAt(0, beforeClean);
      const raw = reefWater(s, s.player.pos).oxygenUse;
      s.journey.reefEvolution!.pumping = 1;
      const filtered = reefWater(s, s.player.pos).oxygenUse, beforeState = JSON.stringify(s), positions = data.flowPositions.slice();
      expect(filtered).toBeLessThan(raw);
      view.update(s, 0, 0); gas.getMatrixAt(0, afterGas); clean.getMatrixAt(0, afterClean);
      const scale = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixScale(m).length();
      expect(scale(afterGas)).toBeLessThan(scale(beforeGas));
      expect(scale(afterClean)).toBeGreaterThan(scale(beforeClean));
      expect(data.flowPositions).toEqual(positions); expect(JSON.stringify(s)).toBe(beforeState);
    } finally { view.dispose(); }
  });

  it('leaves historical reef scenes without the new chemical particle layer', () => {
    const s = fixture(), view = new JourneyPresentation(new THREE.Scene()); delete s.journey.reefEvolution;
    try { view.update(s, 0, 0); expect(view.group.getObjectByName('reef-gas-clusters')).toBeUndefined(); }
    finally { view.dispose(); }
  });

  it('releases the added chemistry instances and their owned geometry/material', () => {
    const s = fixture(), view = new JourneyPresentation(new THREE.Scene()); view.update(s, 0, 0);
    const gas = view.group.getObjectByName('reef-gas-clusters') as THREE.InstancedMesh;
    const disposed = [0, 0, 0];
    gas.addEventListener('dispose', () => disposed[0]++);
    gas.geometry.addEventListener('dispose', () => disposed[1]++);
    (gas.material as THREE.Material).addEventListener('dispose', () => disposed[2]++);
    view.dispose(); view.dispose(); expect(disposed).toEqual([1, 1, 1]);
  });
});
