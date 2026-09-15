import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGame } from '../src/game/simulation';
import { initializeJourneyStage, environmentalFlow, actOnJourney, recordConsumption } from '../src/game/journey';
import { createWorld, spawnCreature } from '../src/game/world';
import { groundHeight } from '../src/game/random';
import { landSiteSupport } from '../src/game/climate';
import { speciesById } from '../src/game/content';
import { JourneyPresentation } from '../src/render/journey';
import type { GameState, Stage } from '../src/game/types';

function stateFor(seed = 481516, stage: Stage = 0): GameState {
  const state = createGame(seed, false);
  if (stage !== 0) { state.stage = stage; state.world = createWorld(seed, stage); state.worlds[stage] = state.world; initializeJourneyStage(state); }
  return state;
}

function inventory(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(); let draws = 0;
  group.traverse(node => { if (node instanceof THREE.Mesh) { draws++; geometries.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material); } });
  return { geometries, materials, draws };
}

describe('journey landmarks express persistent world state', () => {
  it('tracks a moving mother source, reveals two refuges, and grows only an existing planted resource', () => {
    const state = stateFor(), scene = new THREE.Scene(), view = new JourneyPresentation(scene), site = state.journey.sites[1];
    try {
      const before = JSON.stringify(state); view.update(state, 0, 1 / 60); expect(JSON.stringify(state)).toBe(before);
      const source = view.group.getObjectByName('journey-source-1')!, refuge = view.group.getObjectByName('journey-refuge-1-0')!, other = view.group.getObjectByName('journey-refuge-1-1')!, growth = view.group.getObjectByName('journey-growth-1')!;
      expect(source.position).toMatchObject(site.source); expect(refuge.visible).toBe(false); expect(other.visible).toBe(false); expect(growth.visible).toBe(false);
      site.source.x += 4; site.observed = true; view.update(state, .1, .1);
      expect(source.position).toMatchObject(site.source); expect(refuge.visible).toBe(true); expect(other.visible).toBe(true);
      site.plantedId = state.world.nextId++; view.update(state, .2, .1); expect(growth.visible).toBe(false);
      const plant = { id: site.plantedId, kind: 'mineral' as const, pos: { ...site.refuges[1] }, amount: 8, max: 12, patch: 1, regen: .09 }; state.world.resources.push(plant);
      view.update(state, .3, .1); expect(growth.visible).toBe(true); expect(growth.position).toMatchObject(plant.pos); expect(other.userData.occupied).toBe(true); expect(refuge.userData.occupied).toBe(false);
      const size = growth.scale.y; site.resolved = true; view.update(state, .4, .1); expect(growth.scale.y).toBeGreaterThan(size);
      expect(view.group.getObjectByName('journey-strand-supply-1')!.visible).toBe(true); expect(view.group.getObjectByName('journey-strand-supply-0')!.visible).toBe(false);
      const reloaded = JSON.parse(JSON.stringify(state)) as GameState; reloaded.world = reloaded.worlds[reloaded.stage]!;
      // Restore the current world's identity as the normal loader does.
      reloaded.world = JSON.parse(JSON.stringify(state.world)); reloaded.worlds[reloaded.stage] = reloaded.world;
      const prior = { growth: growth.scale.y, source: source.position.toArray(), refuge: other.userData.occupied };
      view.update(reloaded, .4, 0);
      expect(view.group.getObjectByName('journey-growth-1')!.scale.y).toBe(prior.growth);
      expect(view.group.getObjectByName('journey-source-1')!.position.toArray()).toEqual(prior.source);
      expect(view.group.getObjectByName('journey-refuge-1-1')!.userData.occupied).toBe(prior.refuge);
    } finally { view.dispose(); }
    expect(scene.children).toHaveLength(0);
  });

  it('anchors mature land roots to terrain and changes cargo color with actual vitality', () => {
    const state = stateFor(481516, 2), scene = new THREE.Scene(), view = new JourneyPresentation(scene), site = state.journey.sites.find(site => site.stage === 2)!;
    site.resolved = true; site.observed = true; site.plantedId = state.world.nextId++;
    state.world.resources.push({ id: site.plantedId, kind: 'nectar', pos: { ...site.refuges[0] }, amount: 8, max: 12, patch: site.patch, regen: .09 });
    state.journey.cargo = { kind: 'nectar', purpose: 'culture', site: site.id, vitality: 100, distance: 0 };
    try {
      view.update(state, 1, .016); view.group.updateMatrixWorld(true);
      for (const name of [`journey-source-${site.id}`, `journey-growth-${site.id}`]) {
        const colony = view.group.getObjectByName(name)!, root = colony.children[0], pos = root.getWorldPosition(new THREE.Vector3());
        expect(pos.y).toBeCloseTo(groundHeight(pos.x, pos.z, 2) + .08, 5);
      }
      const cargo = view.group.getObjectByName('journey-cargo')!;
      const heart = cargo.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const healthy = heart.material.color.getHex(); state.journey.cargo.vitality = 10; view.update(state, 2, .016);
      expect(heart.material.color.getHex()).not.toBe(healthy); expect(cargo.userData.vitality).toBe(.1);
      expect(cargo.position.distanceTo(new THREE.Vector3(state.player.pos.x, state.player.pos.y, state.player.pos.z))).toBeLessThan(2);
      state.journey.cargo = null; view.update(state, 3, .016); expect(cargo.visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('keeps legacy worlds untouched and skips presentation allocations', () => {
    const state = createGame(481516, true), view = new JourneyPresentation(new THREE.Scene());
    try { const before = JSON.stringify(state); view.update(state, 10, .1); expect(view.group.visible).toBe(false); expect(view.group.children).toHaveLength(0); expect(JSON.stringify(state)).toBe(before); }
    finally { view.dispose(); }
  });
});

describe('unfinished land strands represent living support', () => {
  it('follows root death, repair and removal without erasing the learned flower or allocating new strands', () => {
    const state = stateFor(481516, 2), view = new JourneyPresentation(new THREE.Scene());
    const site = state.journey.sites.find(site => site.id === 6)!;
    state.player.pos = { ...site.source }; actOnJourney(state); state.player.cooldown = 0; actOnJourney(state);
    expect(state.journey.cargo?.purpose).toBe('culture');
    state.player.pos = { ...site.refuges[0] }; state.player.cooldown = 0; actOnJourney(state);
    const plant = state.world.resources.find(r => r.id === site.plantedId)!;
    expect(plant).toBeDefined();
    const native = spawnCreature(state.world, 'bell', site.patch); native.pos = { ...plant.pos }; state.world.creatures.push(native);
    recordConsumption(state, native, plant); expect(site.resolved).toBe(true);
    const earned = state.player.totalDna, echoes = [...state.journey.echoes];
    try {
      view.update(state, 0, 0);
      const strand = view.group.getObjectByName('journey-strand-supply-6')!, flower = view.group.getObjectByName('journey-source-6')!;
      const resources = inventory(strand);
      for (const strength of [40, 0, 65, 0, 100]) {
        site.vitality = strength; plant.amount = 0; // Eaten portions alone do not kill roots.
        const before = JSON.stringify(state); view.update(state, 0, .1);
        expect(strand.visible).toBe(landSiteSupport(state, site) > 0);
        expect(strand.visible).toBe(strength > 0);
        expect(flower.visible).toBe(true); expect(flower.userData.resolved).toBe(true);
        expect(inventory(strand)).toEqual(resources); expect(JSON.stringify(state)).toBe(before);
      }
      state.world.resources = state.world.resources.filter(r => r.id !== plant.id); view.update(state, 0, 0);
      expect(strand.visible).toBe(false); expect(site.resolved).toBe(true);
      expect(state.player.totalDna).toBe(earned); expect(state.journey.echoes).toEqual(echoes);
    } finally { view.dispose(); }
  });

  it('reacts to current invasive appetite and native survival after a historical hunting outcome', () => {
    const state = stateFor(481516, 2), view = new JourneyPresentation(new THREE.Scene()), site = state.journey.sites.find(site => site.id === 6)!;
    Object.assign(site, { observed: true, resolved: true, method: 'hunt', phase: 4 });
    state.world.landmarks.find(l => l.id === 'spring-0')!.charge = 10;
    const native = spawnCreature(state.world, 'bell', site.patch), invader = spawnCreature(state.world, 'gnaw', site.patch);
    native.pos = { ...site.source }; invader.pos = { ...site.source }; invader.hunger = 80;
    state.world.creatures = [native];
    try {
      view.update(state, 0, 0); const strand = view.group.getObjectByName('journey-strand-supply-6')!;
      expect(strand.visible).toBe(true);
      state.world.creatures.push(invader); view.update(state, 0, .1); expect(strand.visible).toBe(false);
      invader.hunger = 20; view.update(state, 0, .1); expect(strand.visible).toBe(true);
      invader.hunger = 80; invader.pos.x += 20; view.update(state, 0, .1); expect(strand.visible).toBe(true);
      state.world.creatures = [invader]; view.update(state, 0, .1); expect(strand.visible).toBe(false);
      expect(site.resolved).toBe(true); expect(state.world.landmarks.find(l => l.id === 'spring-0')!.charge).toBe(10);
    } finally { view.dispose(); }
  });

  it.each(['reef', 'won-land'] as const)('preserves the historical supply strand in %s presentation', mode => {
    const state = stateFor(481516, mode === 'reef' ? 1 : 2), view = new JourneyPresentation(new THREE.Scene());
    const site = state.journey.sites.find(site => site.stage === state.stage && site.patch === 0)!;
    site.resolved = true; site.vitality = 0; site.plantedId = null;
    if (mode === 'won-land') { state.campaign.won = true; state.campaign.finale = 'restoration'; }
    try {
      const before = JSON.stringify(state); view.update(state, 0, 0);
      expect(view.group.getObjectByName(`journey-strand-supply-${site.id}`)!.visible).toBe(true);
      expect(JSON.stringify(state)).toBe(before);
      state.journey.legacy = true; view.update(state, 1, .1); expect(view.group.visible).toBe(false);
    } finally { view.dispose(); }
  });
});

describe('journey current, telegraph and resource ownership', () => {
  it.each([0, 1] as const)('advects stage %i particles with the exact physical flow and freezes during pause', stage => {
    const state = stateFor(481516, stage), view = new JourneyPresentation(new THREE.Scene());
    state.world.time = 2;
    try {
      view.update(state, 2, 0);
      const flow = view.group.getObjectByName(stage === 0 ? 'journey-vortex-flow' : 'journey-vent-flow') as THREE.InstancedMesh;
      const matrix = new THREE.Matrix4(), origin = new THREE.Vector3(); let index = 0;
      for (; index < flow.count; index++) { flow.getMatrixAt(index, matrix); origin.setFromMatrixPosition(matrix); const vector = environmentalFlow(state, origin); if (Math.hypot(vector.x, vector.y, vector.z) > .1) break; }
      expect(index).toBeLessThan(flow.count); const force = environmentalFlow(state, origin);
      state.world.time += .05; const expected = environmentalFlow(state, origin); view.update(state, 2.05, .05); flow.getMatrixAt(index, matrix); const next = new THREE.Vector3().setFromMatrixPosition(matrix);
      expect(next.x).toBeCloseTo(origin.x + expected.x * .05, 5); expect(next.y).toBeCloseTo(origin.y + expected.y * .05, 5); expect(next.z).toBeCloseTo(origin.z + expected.z * .05, 5);
      expect(Math.hypot(force.x, force.y, force.z)).toBeGreaterThan(0);
      const frozen = Array.from(flow.instanceMatrix.array); view.update(state, 2.05, .1); expect(Array.from(flow.instanceMatrix.array)).toEqual(frozen);
      view.update(state, 0, 0); const reduced = Array.from(flow.instanceMatrix.array); view.update(state, 0, .1); expect(Array.from(flow.instanceMatrix.array)).toEqual(reduced);
    } finally { view.dispose(); }
  });

  it('uses the hunter’s locked aim, dims recovery and releases vanished hunter objects', () => {
    const state = stateFor(), creature = state.world.creatures.find(c => speciesById(c.species).role === 'predator')!, view = new JourneyPresentation(new THREE.Scene());
    const memory = { stage: state.stage, id: creature.id, phase: 'windup' as 'windup' | 'recover', time: .5, aim: { x: creature.pos.x + 7, y: creature.pos.y + 1, z: creature.pos.z + 3 } }; state.journey.hunters.push(memory);
    try {
      view.update(state, .1, .1); const hunter = view.group.getObjectByName(`journey-hunter-${creature.id}`)!;
      expect(hunter.userData.phase).toBe('windup'); expect(hunter.userData.aim).toEqual(memory.aim);
      expect(hunter.userData.committed).toBe(false);
      const trackingMaterials = hunter.children.map(child => (child as THREE.Mesh).material as THREE.MeshBasicMaterial);
      const trackingOpacity = trackingMaterials.map(material => material.opacity);
      memory.time = .25; view.update(state, 2, 0);
      expect(hunter.userData.committed).toBe(true); expect(hunter.userData.aim).toEqual(memory.aim);
      trackingMaterials.forEach((material, index) => expect(material.opacity).toBeGreaterThan(trackingOpacity[index]));
      const lockedOpacity = trackingMaterials.map(material => material.opacity);
      view.update(state, 2.15, 0);
      expect(trackingMaterials.map(material => material.opacity)).toEqual(lockedOpacity);
      const cue = hunter.children[0] as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>, bright = cue.material.opacity;
      memory.phase = 'recover'; view.update(state, .2, .1); expect(cue.material.opacity).toBeLessThan(bright);
      const path = hunter.children[1] as THREE.Mesh; let disposed = 0; path.geometry.addEventListener('dispose', () => disposed++);
      state.world.creatures = state.world.creatures.filter(c => c.id !== creature.id); view.update(state, .3, .1);
      expect(view.group.getObjectByName(`journey-hunter-${creature.id}`)).toBeUndefined(); expect(disposed).toBe(1);
    } finally { view.dispose(); }
  });

  it.each([481516, 20260913, 8675309])('keeps geometry bounded and finite through updates, reloads and all stages for seed %i', seed => {
    const scene = new THREE.Scene(), view = new JourneyPresentation(scene);
    try {
      for (const stage of [0, 1, 2] as const) {
        const state = stateFor(seed, stage); view.update(state, 0, 0); const baseline = inventory(view.group);
        expect(baseline.draws).toBeLessThan(65); expect(baseline.geometries.size).toBeLessThan(20); expect(baseline.materials.size).toBeLessThan(50);
        for (let frame = 1; frame <= 120; frame++) { state.world.time = frame / 60; view.update(state, state.world.time, 1 / 60); }
        expect(inventory(view.group)).toEqual(baseline);
        view.group.traverse(node => { if (node instanceof THREE.Mesh) { for (const value of node.geometry.getAttribute('position').array) expect(Number.isFinite(value)).toBe(true); if (node instanceof THREE.InstancedMesh) for (const value of node.instanceMatrix.array) expect(Number.isFinite(value)).toBe(true); } });
        const released = new Set<THREE.BufferGeometry>(); baseline.geometries.forEach(geometry => geometry.addEventListener('dispose', () => released.add(geometry)));
        const restored = JSON.parse(JSON.stringify(state)) as GameState; restored.world = restored.worlds[stage]!; view.update(restored, state.world.time, 0);
        expect(released.size).toBe(baseline.geometries.size); expect(inventory(view.group).geometries.size).toBe(baseline.geometries.size);
      }
    } finally { view.dispose(); }
    expect(scene.children).toHaveLength(0);
  });
});
