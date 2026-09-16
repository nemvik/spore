import * as THREE from 'three';
import { WebGLRenderList } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import { WebGLProperties } from 'three/src/renderers/webgl/WebGLProperties.js';
import { describe, expect, it, vi } from 'vitest';
import { initialVehicle } from '../src/game/blueprint';
import type { ActivePlanetState } from '../src/game/era-types';
import { emptyPlanet } from '../src/game/era-types';
import { ecologyTaxon } from '../src/game/ecology-catalog';
import { speciesById } from '../src/game/content';
import { buildMachine, createMachines } from '../src/game/machines';
import { biomeLife, createPlanet } from '../src/game/planet';
import { groundHeight } from '../src/game/random';
import { createGame } from '../src/game/simulation';
import { createTribe } from '../src/game/tribe';
import type { GameState } from '../src/game/types';
import { createWorld } from '../src/game/world';
import { animateSpeciesModel, createSpeciesModel, disposeObject } from '../src/render/organism';
import { PlanetPresentation } from '../src/render/planet';

type PlanetGame = GameState & { planet: ActivePlanetState };

/** Prepared P3 populations isolate read-only presentation, not progression. */
function fixture(): PlanetGame {
  const s = createGame(481516); s.stage = 2; s.world = createWorld(s.seed, 2); s.worlds[2] = s.world;
  s.campaign.finale = 'restoration'; s.campaign.won = true; s.tribe = createTribe(s);
  s.tribe.completed = true; s.tribe.neighbours.forEach(n => { n.resolved = 'allied'; });
  s.stage = 4; s.machines = createMachines(s); s.machines.resource = 1000;
  expect(buildMachine(s, initialVehicle('tank', 'restoration')).ok).toBe(true);
  s.planet = createPlanet(s); s.stage = 5; s.planet.temperature = .1; s.planet.atmosphere = -.1; s.planet.tScore = 3;
  for (const biome of s.planet.biomes) {
    for (let index = 0; index < 2; index++) {
      const id = s.planet.nextId++, resourceId = s.world.nextId++, key = `culture:${6 + index}`;
      const pos = { x: biome.pos.x - 3, y: biome.pos.y, z: biome.pos.z + (index * 2 - 1) * 3 };
      s.world.resources.push({ id: resourceId, kind: ecologyTaxon(key)!.food, pos, amount: 8, max: 12, patch: biome.id - 1, regen: 0 });
      s.planet.stabilizers.push({ id, biome: biome.id, key, site: { id, stage: 5, patch: biome.id - 1, source: { ...pos }, refuges: [{ ...pos }], sourceId: resourceId, plantedId: resourceId, vitality: 85, observed: true, resolved: false, method: null, threatIds: [], phase: 0 } });
    }
    for (const [index, species] of ['bell', 'gnaw', 'crest'].entries()) s.planet.populations.push({ id: s.planet.nextId++, biome: biome.id, key: `species:${species}`, pos: { x: biome.pos.x + 3, y: biome.pos.y, z: biome.pos.z + (index - 1) * 3 }, vitality: 80, abundance: 1, nutrition: .8 });
  }
  return s as PlanetGame;
}
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = []; root.traverse(node => { if (node instanceof THREE.Mesh) result.push(node); }); return result;
}
function resources(root: THREE.Object3D): (THREE.BufferGeometry | THREE.Material)[] {
  const result = new Set<THREE.BufferGeometry | THREE.Material>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh) { result.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => result.add(m)); }
    (node.userData.ownedMaterials as THREE.Material[] | undefined)?.forEach(m => result.add(m));
  }); return [...result];
}
function signature(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true); const inverse = root.matrixWorld.clone().invert();
  return meshes(root).map(mesh => ({ geometry: mesh.geometry.type, vertices: [...mesh.geometry.getAttribute('position').array], matrix: inverse.clone().multiply(mesh.matrixWorld).toArray().map(value => Math.round(value * 1e8) / 1e8 || 0), color: (mesh.material as THREE.MeshStandardMaterial).color.getHex() }));
}
function body(view: PlanetPresentation, id: number, index = 0): THREE.Group { return view.group.getObjectByName(`planet-population-${id}`)!.getObjectByName(`population-individual-${index}`) as THREE.Group; }
function bar(view: PlanetPresentation, name: string): THREE.Group { return view.group.getObjectByName(name)!.getObjectByName('vitality-bar') as THREE.Group; }
function fill(view: PlanetPresentation, name: string): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> { return bar(view, name).children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; }
function ring(view: PlanetPresentation, name: string): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> { return view.group.getObjectByName(name)!.getObjectByName('ground-ring') as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; }

describe('planet biological presentation', () => {
  it('uses actual species models, three local biomes and real mother references without changing saves', () => {
    const s = fixture(), saved = JSON.stringify(s), view = new PlanetPresentation();
    try {
      view.update(s, 7, true);
      expect(view.group.visible).toBe(true); expect(view.group.children).toHaveLength(21);
      for (const biome of s.planet.biomes) {
        const group = view.group.getObjectByName(`planet-biome-${biome.id}`)!;
        expect(group.userData.support).toBe(biomeLife(s, biome).support);
        expect(group.children.filter(child => child.name.startsWith('biome-level-') && child.visible)).toHaveLength(biome.level);
      }
      for (const population of s.planet.populations) {
        const species = speciesById(ecologyTaxon(population.key)!.species!), expected = createSpeciesModel(species);
        try { animateSpeciesModel(expected, 0, 0, species); expect(signature(body(view, population.id))).toEqual(signature(expected)); }
        finally { disposeObject(expected); }
      }
      expect(view.group.getObjectByName('planet-nursery')).toBeDefined();
      for (const mother of s.planet.nursery.sources) expect(view.group.getObjectByName(`planet-mother-${mother.resourceId}`)!.userData.key).toBe(mother.key);
      expect(meshes(view.group).every(node => !node.name.startsWith('machine-') && !node.name.startsWith('resource-'))).toBe(true);
      expect(JSON.stringify(s)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('retains geometry across frames and movement, while reduced motion is stable', () => {
    const s = fixture(), view = new PlanetPresentation(), population = s.planet.populations[1];
    try {
      view.update(s, 0); const first = body(view, population.id), owned = resources(view.group), resting = signature(first);
      view.update(s, .8); expect(body(view, population.id)).toBe(first); expect(signature(first)).not.toEqual(resting); expect(resources(view.group)).toEqual(owned);
      population.pos.x += 4; view.update(s, 1, true);
      expect(body(view, population.id)).toBe(first); expect(view.group.getObjectByName(`planet-population-${population.id}`)!.position.x).toBe(population.pos.x);
      const frozen = signature(view.group); view.update(s, 90, true); expect(signature(view.group)).toEqual(frozen);
      expect(resources(view.group)).toEqual(owned);
    } finally { view.dispose(); }
  });

  it('reflects actual abundance with at most three individuals and disposes lost individuals', () => {
    const s = fixture(), view = new PlanetPresentation(), population = s.planet.populations[0];
    try {
      population.abundance = 3; view.update(s, 0, true);
      const group = view.group.getObjectByName(`planet-population-${population.id}`)!, first = body(view, population.id);
      expect(group.children.filter(child => child.name.startsWith('population-individual-'))).toHaveLength(3);
      const retired = resources(body(view, population.id, 2)).map(resource => vi.spyOn(resource, 'dispose'));
      population.abundance = 1.8; view.update(s, 1, true);
      expect(group.children.filter(child => child.name.startsWith('population-individual-'))).toHaveLength(2); expect(body(view, population.id)).toBe(first);
      retired.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
      population.abundance = .2; view.update(s, 2, true); expect(group.children.filter(child => child.name.startsWith('population-individual-'))).toHaveLength(1);
      population.abundance = 3; view.update(s, 3, true); expect(group.children.filter(child => child.name.startsWith('population-individual-'))).toHaveLength(3);
      const deaths = resources(group).map(resource => vi.spyOn(resource, 'dispose')); population.vitality = 0; view.update(s, 4);
      expect(view.group.getObjectByName(group.name)).toBeUndefined(); deaths.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
      view.dispose(); retired.forEach(spy => expect(spy).toHaveBeenCalledTimes(1)); deaths.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    } finally { view.dispose(); }
  });

  it('retires a zero-abundance population even when its vitality remains positive', () => {
    const s = fixture(), view = new PlanetPresentation(), population = s.planet.populations[0];
    try { view.update(s, 0); population.abundance = 0; view.update(s, 1); expect(view.group.getObjectByName(`planet-population-${population.id}`)).toBeUndefined(); }
    finally { view.dispose(); }
  });

  it('rebuilds a changed imported taxon without retaining the previous species', () => {
    const s = fixture(), view = new PlanetPresentation(), population = s.planet.populations[0];
    try {
      view.update(s, 0); const old = view.group.getObjectByName(`planet-population-${population.id}`)!, disposed = resources(old).map(resource => vi.spyOn(resource, 'dispose'));
      population.key = 'species:veil'; view.update(s, 1, true);
      expect(view.group.getObjectByName(old.name)).not.toBe(old); expect(body(view, population.id).userData.species).toBe('veil'); disposed.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    } finally { view.dispose(); }
  });

  it('loses biome support when a real root disappears, even if historical vitality stays high', () => {
    const s = fixture(), view = new PlanetPresentation(), biome = s.planet.biomes[0], root = s.planet.stabilizers[0];
    try {
      view.update(s, 0); const node = view.group.getObjectByName(`planet-biome-${biome.id}`)!, supportedColor = ring(view, node.name).material.color.getHex();
      expect(node.userData.support).toBe(true); expect(fill(view, `planet-root-${root.id}`).scale.x).toBe(.85);
      s.world.resources = s.world.resources.filter(resource => resource.id !== root.site.plantedId);
      view.update(s, 1); expect(root.site.vitality).toBe(85); expect(node.userData.support).toBe(false);
      expect(ring(view, node.name).material.color.getHex()).not.toBe(supportedColor); expect(fill(view, `planet-root-${root.id}`).visible).toBe(false);
      expect(view.group.getObjectByName(`planet-root-${root.id}`)!.userData.support).toBe(0);
    } finally { view.dispose(); }
  });

  it('shows biological weakness separately from a regressed climatic tier', () => {
    const s = fixture(), view = new PlanetPresentation(), biome = s.planet.biomes[2], population = s.planet.populations.find(c => c.biome === biome.id)!;
    try {
      view.update(s, 0); const name = `planet-biome-${biome.id}`, group = view.group.getObjectByName(name)!, before = fill(view, name).scale.x;
      population.nutrition = .1; view.update(s, 1);
      expect(group.userData.support).toBe(false); expect(fill(view, name).scale.x).toBeLessThan(before); expect(group.userData.suitable).toBe(true);
      population.nutrition = .8; s.planet.tScore = 2; s.planet.temperature = .4; s.planet.atmosphere = -.4;
      view.update(s, 2); expect(group.userData.support).toBe(true); expect(group.userData.suitable).toBe(false);
      const unsuitable = ring(view, name).material.color.getHex(); s.planet.tScore = 3; view.update(s, 3);
      expect(ring(view, name).material.color.getHex()).not.toBe(unsuitable);
    } finally { view.dispose(); }
  });

  it('marks source exhaustion and removes an absent mother without duplicating its resource', () => {
    const s = fixture(), view = new PlanetPresentation(), mother = s.planet.nursery.sources[0];
    try {
      view.update(s, 0); const name = `planet-mother-${mother.resourceId}`, group = view.group.getObjectByName(name)!, owned = resources(group).map(resource => vi.spyOn(resource, 'dispose'));
      s.world.resources.find(r => r.id === mother.resourceId)!.amount = 0; view.update(s, 1);
      expect(fill(view, name).visible).toBe(false); expect(view.group.getObjectByName(name)).toBe(group);
      s.world.resources = s.world.resources.filter(r => r.id !== mother.resourceId); view.update(s, 2);
      expect(view.group.getObjectByName(name)).toBeUndefined(); owned.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    } finally { view.dispose(); }
  });

  it('keeps all ground overlays and status bars above the actual sloped soil', () => {
    const s = fixture(), view = new PlanetPresentation(), point = new THREE.Vector3();
    try {
      view.update(s, 0, true); view.group.updateMatrixWorld(true);
      const overlays: THREE.Mesh[] = [];
      view.group.traverseVisible(node => { if (node.userData.groundOverlay) overlays.push(node as THREE.Mesh); if (node.userData.statusBar) overlays.push(...node.children as THREE.Mesh[]); });
      expect(overlays.length).toBeGreaterThan(30);
      for (const overlay of overlays) {
        const vertices = overlay.geometry.getAttribute('position');
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(overlay.matrixWorld);
          expect(point.y).toBeGreaterThan(groundHeight(point.x, point.z, 2) + .025);
        }
      }
    } finally { view.dispose(); }
  });

  it('draws translucent status backgrounds before their colored fills in the real Three queues', () => {
    const s = fixture(), view = new PlanetPresentation();
    try {
      view.update(s, 0); view.group.updateMatrixWorld(true);
      const barGroup = bar(view, `planet-population-${s.planet.populations[0].id}`), list = new WebGLRenderList(new WebGLProperties());
      for (const node of barGroup.children as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]) list.push(node, node.geometry, node.material, 0, node.position.y, null);
      Reflect.apply(list.sort, list, []);
      const order = [...list.opaque, ...list.transmissive, ...list.transparent]; expect(order.at(-1)?.object).toBe(barGroup.children[1]);
      expect((barGroup.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.transparent).toBe(true);
      expect((barGroup.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.depthWrite).toBe(false);
    } finally { view.dispose(); }
  });

  it('renders a JSON-restored snapshot identically without altering either state', () => {
    const s = fixture(), bytes = JSON.stringify(s), loaded = JSON.parse(bytes) as PlanetGame;
    loaded.world = loaded.worlds[2]!;
    const first = new PlanetPresentation(), second = new PlanetPresentation();
    try {
      first.update(s, 5, true); second.update(loaded, 5, true);
      expect(signature(second.group)).toEqual(signature(first.group)); expect(JSON.stringify(s)).toBe(bytes); expect(JSON.stringify(loaded)).toBe(bytes);
    } finally { first.dispose(); second.dispose(); }
  });

  it('disposes removed IDs and every remaining owned resource once, with inert repeated teardown', () => {
    const s = fixture(), view = new PlanetPresentation(); view.update(s, 0);
    const old = view.group.getObjectByName(`planet-root-${s.planet.stabilizers[0].id}`)!, retired = resources(old).map(resource => vi.spyOn(resource, 'dispose'));
    s.planet.stabilizers.shift(); view.update(s, 1); expect(view.group.getObjectByName(old.name)).toBeUndefined();
    retired.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    const rest = resources(view.group).map(resource => vi.spyOn(resource, 'dispose'));
    view.dispose(); view.dispose(); view.update(s, 2);
    expect(view.group.children).toHaveLength(0); expect(view.group.visible).toBe(false); [...retired, ...rest].forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('clears active content outside stage five and for the historical P0 planet preview', () => {
    const s = fixture(), view = new PlanetPresentation();
    try {
      view.update(s, 0); s.stage = 4; view.update(s, 1); expect(view.group.visible).toBe(false); expect(view.group.children).toHaveLength(0);
      s.stage = 5; view.update(s, 2); expect(view.group.visible).toBe(true);
      view.update({ ...s, planet: emptyPlanet() }, 3); expect(view.group.visible).toBe(false); expect(view.group.children).toHaveLength(0);
      view.update({ ...s, planet: undefined }, 4); expect(view.group.visible).toBe(false); expect(view.group.children).toHaveLength(0);
    } finally { view.dispose(); }
  });
});
