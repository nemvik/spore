import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getClimate, hydrationAt } from '../src/game/climate';
import { actOnJourney, activeSites, initializeJourneyStage } from '../src/game/journey';
import { genomeCost, initialGenome } from '../src/game/genome';
import { createGame, makeCheckpoint, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createHabitat, updateHabitat } from '../src/render/habitat';
import { disposeObject } from '../src/render/organism';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState, Vec3 } from '../src/game/types';

// Prepared land states isolate water consequences, not campaign travel or earnings.
// The root itself is planted through production observe/take/plant actions.
function land(seed = 481516) {
  const s = createGame(seed, false);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `wet-${kind}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false });
  s.player.totalDna = 100; s.player.dna = genomeCost(initialGenome()) + s.player.totalDna - genomeCost(s.player.genome);
  s.world.creatures = []; s.campaign.drought = 1; s.player.energy = 90; s.player.moisture = 40;
  makeCheckpoint(s); return s;
}
function at(s: GameState, pos: Vec3) { s.player.pos = { ...pos }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.cooldown = 0; }
function plant(s: GameState, refuge = 0) {
  const site = activeSites(s)[0];
  at(s, site.source); if (!site.observed) { actOnJourney(s); s.player.cooldown = 0; }
  actOnJourney(s);
  // In this deliberately empty world, returning to an existing pasture first
  // feeds its nursery. A second ordinary T samples the replanting culture.
  if (!s.journey.cargo) { s.player.cooldown = 0; actOnJourney(s); }
  at(s, site.refuges[refuge]); actOnJourney(s);
  return { site, resource: s.world.resources.find(r => r.id === site.plantedId)! };
}
function grazingMeal(s: GameState, species: 'bell' | 'gnaw', resource: ReturnType<typeof plant>['resource']) {
  const c = spawnCreature(s.world, species, resource.patch);
  Object.assign(c, { pos: { ...resource.pos, x: resource.pos.x + .7 }, velocity: { x: 0, y: 0, z: 0 }, hunger: 80, cooldown: 0, target: resource.id, intent: 'forage' });
  s.world.creatures = [c]; at(s, s.world.landmarks[0].pos); s.tick = 1; step(s, EMPTY_INPUT);
}

describe('living root pockets affect actual land water', () => {
  it('makes the chosen planting position immediately useful without moving the original spring', () => {
    const s = land(), site = activeSites(s)[0];
    expect(hydrationAt(s, site.refuges[0])).toBe(0);
    const { resource } = plant(s), pocket = getClimate(s).rootPockets![0];
    expect(pocket).toEqual({ id: 'roots-6', site: 6, x: resource.pos.x, z: resource.pos.z, water: 1, radius: 6.5 });
    expect(hydrationAt(s, resource.pos)).toBe(9); expect(site.resolved).toBe(false);
    expect(hydrationAt(s, site.source)).toBe(0);
    const moisture = s.player.moisture;
    for (let i = 0; i < 60; i++) step(s, EMPTY_INPUT);
    expect(s.player.moisture).toBeGreaterThan(moisture + 8);
  });

  it('uses one radius and strength for the inside and outside edge', () => {
    const s = land(), { site, resource } = plant(s); site.vitality = 40;
    const pocket = getClimate(s).rootPockets![0];
    expect(pocket).toMatchObject({ water: .4, radius: 3.5 });
    expect(hydrationAt(s, { ...resource.pos, x: resource.pos.x + pocket.radius })).toBeCloseTo(3.6);
    expect(hydrationAt(s, { ...resource.pos, x: resource.pos.x + pocket.radius + .01 })).toBe(0);
  });

  it('makes an actual invasive bite reduce the live pocket after historical restoration', () => {
    const s = land(), { site, resource } = plant(s);
    grazingMeal(s, 'bell', resource); expect(site.resolved).toBe(true); expect(site.method).toBe('guide');
    const before = getClimate(s).rootPockets![0], oldEdge = { ...resource.pos, x: resource.pos.x + 6.2 };
    expect(hydrationAt(s, oldEdge)).toBe(9);
    grazingMeal(s, 'gnaw', resource);
    const after = getClimate(s).rootPockets![0];
    expect(site.resolved).toBe(true); expect(site.method).toBe('guide'); expect(site.vitality).toBe(88);
    expect(after.water).toBeLessThan(before.water); expect(after.radius).toBeLessThan(before.radius);
    expect(hydrationAt(s, resource.pos)).toBeCloseTo(7.92); expect(hydrationAt(s, oldEdge)).toBe(0);
    expect(hydrationAt(s, site.source)).toBeCloseTo(7.92); // Historical reward is no longer an immortal water source.
    expect(getClimate(s).patchStress[0]).toBeGreaterThan(.08);
  });

  it('lets the final invasive bite dry a completed root without erasing its recorded outcome', () => {
    const s = land(), { site, resource } = plant(s); grazingMeal(s, 'bell', resource);
    site.vitality = 12; // Prepared previously damaged root, then one real grazing event.
    grazingMeal(s, 'gnaw', resource);
    expect(site.vitality).toBe(0); expect(site.resolved).toBe(true); expect(site.plantedId).toBeNull();
    expect(getClimate(s).rootPockets).toBeUndefined();
    expect(s.world.resources.some(r => r.id === resource.id)).toBe(false);
    expect(hydrationAt(s, resource.pos)).toBe(0);
    expect(hydrationAt(s, site.source)).toBe(0);
    expect(getClimate(s).patchStress[0]).toBe(1);
  });

  it('uses live root identity and position, while an exhausted food portion does not kill roots', () => {
    const s = land(), first = plant(s); first.resource.amount = 0;
    expect(hydrationAt(s, first.resource.pos)).toBe(9);
    const second = plant(s, 1);
    expect(getClimate(s).rootPockets).toHaveLength(1); expect(hydrationAt(s, second.resource.pos)).toBe(9);
    expect(hydrationAt(s, first.resource.pos)).toBe(0);
    s.world.resources = s.world.resources.filter(r => r.id !== second.resource.id);
    expect(getClimate(s).rootPockets).toBeUndefined(); expect(hydrationAt(s, second.resource.pos)).toBe(0);
  });

  it.each([481516, 20260913, 8675309])('retains exact root water and historical outcomes through save/load for seed %i', seed => {
    const s = land(seed), { resource } = plant(s); grazingMeal(s, 'bell', resource); grazingMeal(s, 'gnaw', resource);
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s));
    expect(getClimate(loaded)).toEqual(getClimate(s));
    expect(hydrationAt(loaded, resource.pos)).toBe(hydrationAt(s, resource.pos));
    expect(activeSites(loaded)[0]).toEqual(activeSites(s)[0]);
  });

  it('preserves legacy water behavior and does not serialize a second water ledger', () => {
    const legacy = createGame(481516); legacy.stage = 2; legacy.world = createWorld(legacy.seed, 2); legacy.worlds[2] = legacy.world;
    expect(getClimate(legacy).rootPockets).toBeUndefined();
    const s = land(); plant(s); const before = JSON.stringify(s);
    getClimate(s); hydrationAt(s, s.player.pos);
    expect(JSON.stringify(s)).toBe(before); expect(before).not.toContain('rootPockets');
  });
});

describe('visible root water shares the hydration projection', () => {
  it.each(['living', 'legacy', 'won'] as const)('renders numeric partial support for a %s spring without rounding it to protected', mode => {
    const s = land(), { site, resource } = plant(s); grazingMeal(s, 'bell', resource);
    site.vitality = 40;
    if (mode === 'legacy') s.journey.legacy = true;
    if (mode === 'won') { s.campaign.won = true; s.campaign.finale = 'predator'; }
    if (mode !== 'living') s.world.landmarks.find(l => l.id === 'spring-0')!.charge = 4;
    const climate = getClimate(s), habitat = createHabitat(s.world, climate);
    try {
      updateHabitat(habitat, s.world, 0, climate);
      const record = habitat.userData.habitat.landmarks.find((r: { id: string }) => r.id === 'spring-0');
      expect(climate.springs[0]).toMatchObject({ support: .4, water: .4, protected: false });
      expect(record.node.userData.charge).toBe(.4);
      expect(record.material.emissiveIntensity).toBeCloseTo(.64);
    } finally { disposeObject(habitat); }
  });

  it('adds a real terrain-following wet surface and floor region, then shrinks both while motion is reduced', () => {
    const s = land(), habitat = createHabitat(s.world, getClimate(s));
    try {
      const { site, resource } = plant(s); updateHabitat(habitat, s.world, 0, getClimate(s));
      const mesh = habitat.getObjectByName('root-wet-pocket-6') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const appearance = () => ({ opacity: mesh.material.opacity, vertices: Array.from(mesh.geometry.getAttribute('position').array) });
      expect(mesh.visible).toBe(true); expect(mesh.position.x).toBe(resource.pos.x); expect(mesh.position.z).toBe(resource.pos.z);
      const wet = appearance(); expect(mesh.userData).toMatchObject({ water: 1, radius: 6.5 });
      const region = habitat.userData.habitat.floorUniforms.lumavoraOases.value[4] as THREE.Vector4;
      expect(region.toArray()).toEqual([resource.pos.x, resource.pos.z, 6.5, 1]);
      grazingMeal(s, 'gnaw', resource); updateHabitat(habitat, s.world, 0, getClimate(s));
      const damaged = getClimate(s).rootPockets![0];
      expect(mesh.userData).toMatchObject({ water: damaged.water, radius: damaged.radius });
      expect(region.toArray()).toEqual([resource.pos.x, resource.pos.z, damaged.radius, damaged.water]);
      expect(appearance().opacity).toBeLessThan(wet.opacity); expect(appearance().vertices).not.toEqual(wet.vertices);
      expect(appearance().vertices.every(Number.isFinite)).toBe(true);
      site.vitality = 0; updateHabitat(habitat, s.world, 0, getClimate(s));
      expect(mesh.visible).toBe(false); expect(region.w).toBe(0); expect(region.z).toBe(0);
    } finally { disposeObject(habitat); }
  });

  it('reuses bounded meshes on replanting and rebuilds the exact wet appearance after loading', () => {
    const s = land(), { site } = plant(s); site.vitality = 64;
    const habitat = createHabitat(s.world, getClimate(s)), loaded = parseGame(serializeGame(s)), rebuilt = createHabitat(loaded.world, getClimate(loaded));
    try {
      const original = habitat.getObjectByName('root-wet-pocket-6') as THREE.Mesh;
      const copy = rebuilt.getObjectByName('root-wet-pocket-6') as THREE.Mesh;
      expect(copy.position.toArray()).toEqual(original.position.toArray());
      expect(Array.from(copy.geometry.getAttribute('position').array)).toEqual(Array.from(original.geometry.getAttribute('position').array));
      for (let i = 0; i < 8; i++) { plant(s, i % 2); updateHabitat(habitat, s.world, 0, getClimate(s)); }
      const pockets: THREE.Object3D[] = []; habitat.traverse(node => { if (node.name.startsWith('root-wet-pocket-')) pockets.push(node); });
      expect(pockets).toHaveLength(3); expect(habitat.getObjectByName('root-wet-pocket-6')).toBe(original);
    } finally { disposeObject(habitat); disposeObject(rebuilt); }
  });
});
