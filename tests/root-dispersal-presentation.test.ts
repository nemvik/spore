import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { initializeJourneyStage } from '../src/game/journey';
import { groundHeight } from '../src/game/random';
import { getClimate } from '../src/game/climate';
import { RootDispersalPresentation } from '../src/render/root-dispersal';
import { disposeObject } from '../src/render/organism';

/** Prepared records isolate scene projection; gameplay acquisition/deposition
 * and persistence are covered by the root-dispersal simulation tests. */
function scene() {
  const s = createGame(8675309, false, true);
  s.stage = 2; s.world = createWorld(s.seed, 2); s.worlds[2] = s.world; initializeJourneyStage(s);
  const carrier = s.world.creatures.find(c => c.species === 'gnaw')!;
  carrier.pos = { x: 9, y: groundHeight(9, -14, 2) + .275, z: -14 }; carrier.heading = .8; carrier.velocity = { x: 0, y: 0, z: 0 };
  const resource = { id: s.world.nextId++, kind: 'algae' as const, pos: { x: -12, y: groundHeight(-12, 24, 2) + .275, z: 24 }, amount: 1, max: 1, regen: 0, patch: 1 };
  s.world.resources.push(resource);
  s.journey.rootDispersal = {
    version: 1, carried: [{ carrierId: carrier.id, site: 6, origin: { x: -50, y: 0, z: -50 }, vitality: 12 }],
    roots: [{ resourceId: resource.id, site: 7, vitality: 12 }],
  };
  const canvas = new THREE.Scene(), view = new RootDispersalPresentation(canvas);
  return { s, carrier, resource, canvas, view };
}
function meshes(node: THREE.Object3D) {
  const result: THREE.Mesh[] = []; node.traverse(child => { if (child instanceof THREE.Mesh) result.push(child); }); return result;
}

describe('mobile root cuttings and their actual wet roots', () => {
  it('puts a living cutting on the real carrier’s back, follows heading, and never uses its old origin as a pin', () => {
    const { s, carrier, view } = scene();
    try {
      view.update(s, 3);
      const cutting = view.group.getObjectByName(`dispersed-cutting-${carrier.id}`)!;
      expect(cutting.userData).toMatchObject({ carrierId: carrier.id, siteId: 6, dispersalRole: 'cutting', vitality: .12 });
      expect(cutting.position.toArray()).toEqual([carrier.pos.x, carrier.pos.y, carrier.pos.z]); expect(cutting.rotation.y).toBe(carrier.heading);
      const heart = cutting.getObjectByName('cutting-heart')!; view.group.updateMatrixWorld(true);
      const p = heart.getWorldPosition(new THREE.Vector3());
      expect(p.y).toBeGreaterThan(carrier.pos.y + .6); expect(p.y).toBeLessThan(carrier.pos.y + 1.2);
      expect(Math.hypot(p.x - carrier.pos.x, p.z - carrier.pos.z)).toBeLessThan(.5);
      carrier.pos = { x: 17, y: 3, z: 10 }; carrier.heading = -1.7;
      view.update(s, 3);
      expect(cutting.position.toArray()).toEqual([17, 3, 10]); expect(cutting.rotation.y).toBe(-1.7);
      expect(view.group.children).toHaveLength(2);
    } finally { view.dispose(); }
  });

  it('anchors the small child shoot to its actual resource and follows the exact climate radius over terrain', () => {
    const { s, resource, view } = scene();
    try {
      view.update(s, 0); const root = view.group.getObjectByName(`dispersed-root-${resource.id}`)!;
      expect(root.position.toArray()).toEqual([resource.pos.x, resource.pos.y, resource.pos.z]);
      expect(root.userData).toMatchObject({ resourceId: resource.id, siteId: 7, dispersalRole: 'root' });
      const wet = root.getObjectByName(`dispersed-wet-${resource.id}`) as THREE.Mesh;
      const pocket = getClimate(s).rootPockets!.find(p => p.id === `rootlet-${resource.id}`)!;
      expect(wet.visible).toBe(true); expect(wet.userData.radius).toBe(pocket.radius); expect(wet.userData.water).toBe(pocket.water);
      root.updateMatrixWorld(true); const positions = wet.geometry.getAttribute('position'), colors = wet.geometry.getAttribute('color');
      let farthest = 0, highest = -Infinity, lowest = Infinity;
      for (let i = 0; i < positions.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(wet.matrixWorld);
        const d = Math.hypot(p.x - pocket.x, p.z - pocket.z); farthest = Math.max(farthest, d);
        expect(p.y).toBeCloseTo(groundHeight(p.x, p.z, 2) + .025, 5);
        expect(d).toBeLessThanOrEqual(pocket.radius + 1e-5);
        highest = Math.max(highest, p.y); lowest = Math.min(lowest, p.y);
        if (d > pocket.radius - 1e-5) expect(colors.getW(i)).toBe(0);
      }
      expect(farthest).toBeCloseTo(pocket.radius, 5); expect(highest - lowest).toBeGreaterThan(.01);
      const wetMaterial = wet.material as THREE.MeshBasicMaterial;
      expect(wetMaterial.transparent).toBe(true); expect(wetMaterial.depthWrite).toBe(false); expect(wetMaterial.depthTest).toBe(true);
      expect(colors.itemSize).toBe(4);
      // Even the actual twelve-point fragment must read as wet ground, while
      // remaining translucent and fading to zero at its true effect boundary.
      expect(colors.getW(0) * wetMaterial.opacity).toBeGreaterThan(.22);
      expect(colors.getW(0) * wetMaterial.opacity).toBeLessThan(.4);
      const bounds = new THREE.Box3().setFromObject(root.children[0]);
      expect(bounds.max.y - bounds.min.y).toBeGreaterThan(.8);
      expect(bounds.max.y - bounds.min.y).toBeLessThan(1.5);
    } finally { view.dispose(); }
  });

  it('keeps an exhausted but living root visible, then shrinks its actual water and shoot with vitality', () => {
    const { s, resource, view } = scene();
    try {
      view.update(s, 0); const root = view.group.getObjectByName(`dispersed-root-${resource.id}`)!;
      const wet = root.getObjectByName(`dispersed-wet-${resource.id}`) as THREE.Mesh, geometry = wet.geometry, beforeScale = root.children[0].scale.x, beforeRadius = wet.userData.radius;
      resource.amount = 0; view.update(s, 0);
      expect(view.group.getObjectByName(root.name)).toBe(root); expect(wet.visible).toBe(true);
      s.journey.rootDispersal!.roots[0].vitality = 6; view.update(s, 0);
      expect(root.children[0].scale.x).toBeLessThan(beforeScale); expect(wet.userData.radius).toBeLessThan(beforeRadius);
      expect(wet.geometry).toBe(geometry); expect(wet.userData.water).toBe(.06);
    } finally { view.dispose(); }
  });

  it.each(['missing carrier', 'dead carrier', 'non-invasive carrier', 'lost cutting', 'missing root', 'dead root', 'lost root'] as const)
  ('removes %s immediately without retaining a detached signal', change => {
    const { s, carrier, resource, view } = scene();
    try {
      view.update(s, 2);
      if (change === 'missing carrier') s.world.creatures = s.world.creatures.filter(c => c.id !== carrier.id);
      if (change === 'dead carrier') carrier.health = 0;
      if (change === 'non-invasive carrier') carrier.species = 'bell';
      if (change === 'lost cutting') s.journey.rootDispersal!.carried = [];
      if (change === 'missing root') s.world.resources = s.world.resources.filter(r => r.id !== resource.id);
      if (change === 'dead root') s.journey.rootDispersal!.roots[0].vitality = 0;
      if (change === 'lost root') s.journey.rootDispersal!.roots = [];
      view.update(s, 2);
      const removed = change.includes('root') ? `dispersed-root-${resource.id}` : `dispersed-cutting-${carrier.id}`;
      expect(view.group.getObjectByName(removed)).toBeUndefined(); expect(view.group.children).toHaveLength(1);
    } finally { view.dispose(); }
  });

  it.each(['old save', 'v2', 'legacy', 'other stage', 'other world stage'] as const)('clears previous visuals in an %s context', change => {
    const { s, view } = scene();
    try {
      view.update(s, 0);
      if (change === 'old save') delete s.journey.rootDispersal;
      if (change === 'v2') s.journey.version = 2;
      if (change === 'legacy') s.journey.legacy = true;
      if (change === 'other stage') s.stage = 1;
      if (change === 'other world stage') s.world.stage = 1;
      const before = JSON.stringify(s); view.update(s, 0);
      expect(view.group.visible).toBe(false); expect(view.group.children).toHaveLength(0); expect(JSON.stringify(s)).toBe(before);
    } finally { view.dispose(); }
  });

  it('has repeatable live motion, no state/RNG writes, and no decorative click interception', () => {
    const { s, carrier, view } = scene();
    try {
      const before = JSON.stringify(s); view.update(s, 3);
      const cutting = view.group.getObjectByName(`dispersed-cutting-${carrier.id}`)!;
      const leaf = cutting.getObjectByName('cutting-leaves')!, pose = leaf.rotation.toArray();
      view.update(s, 4); expect(leaf.rotation.toArray()).not.toEqual(pose);
      view.update(s, 3); expect(leaf.rotation.toArray()).toEqual(pose);
      expect(JSON.stringify(s)).toBe(before);
      view.group.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(carrier.pos.x, 20, carrier.pos.z), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(view.group)).toEqual([]);
      expect(meshes(view.group).every(mesh => !mesh.castShadow)).toBe(true);
    } finally { view.dispose(); }
  });

  it('shares shoot assets, reuses wet buffers and disposes every resource exactly once across removal and world changes', () => {
    const { s, resource, carrier, canvas, view } = scene();
    const disposals = new Map<THREE.BufferGeometry | THREE.Material, number>();
    const watch = () => meshes(view.group).forEach(mesh => {
      for (const asset of [mesh.geometry, ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material])]) if (!disposals.has(asset)) {
        disposals.set(asset, 0); asset.addEventListener('dispose', () => disposals.set(asset, disposals.get(asset)! + 1));
      }
    });
    view.update(s, 0); watch();
    const other = spawnCreature(s.world, 'gnaw', 1); s.world.creatures.push(other);
    s.journey.rootDispersal!.carried.push({ carrierId: other.id, site: 7, origin: { ...other.pos }, vitality: 12 });
    view.update(s, 0);
    const first = view.group.getObjectByName(`dispersed-cutting-${carrier.id}`)!, second = view.group.getObjectByName(`dispersed-cutting-${other.id}`)!;
    expect(meshes(first).map(m => m.geometry)).toEqual(meshes(second).map(m => m.geometry));
    expect(meshes(first).map(m => m.material)).toEqual(meshes(second).map(m => m.material));
    const wet = view.group.getObjectByName(`dispersed-wet-${resource.id}`) as THREE.Mesh, positions = wet.geometry.getAttribute('position');
    for (let i = 0; i < 20; i++) { view.update(s, i); expect(wet.geometry.getAttribute('position')).toBe(positions); }
    s.world.resources = s.world.resources.filter(r => r.id !== resource.id); view.update(s, 20);
    expect(disposals.get(wet.geometry)).toBe(1);
    s.world = createWorld(s.seed, 2); s.worlds[2] = s.world;
    s.journey.rootDispersal = { version: 1, carried: [], roots: [] }; view.update(s, 21);
    expect(view.group.children).toHaveLength(0);
    view.dispose(); view.dispose(); disposeObject(canvas); view.update(s, 22);
    expect(canvas.children).toHaveLength(0); expect([...disposals.values()].every(count => count === 1)).toBe(true);
  });
});
