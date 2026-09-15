import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWorld, spawnCreature } from '../src/game/world';
import { groundHeight } from '../src/game/random';
import type { Obstacle, World } from '../src/game/types';
import { createGame } from '../src/game/simulation';
import { initializeJourneyStage, recordConsumption } from '../src/game/journey';
import { livingStreams, reefWater, streamPoint } from '../src/game/journey-network';
import { createHabitat } from '../src/render/habitat';
import { GameRenderer } from '../src/render/renderer';
import { ObstacleContours } from '../src/render/obstacle-contours';
import { disposeObject } from '../src/render/organism';
import { JourneyPresentation } from '../src/render/journey';

function fixture() {
  const world = createWorld(20260913, 1);
  const lid: Obstacle = { id: world.nextId++, kind: 'rock', pos: { x: 0, y: 1.5, z: 0 }, radius: 4.3, height: 1.4 };
  const shelf: Obstacle = { id: world.nextId++, kind: 'rock', pos: { x: 10, y: 1.5, z: 0 }, radius: 6, height: 1.4 };
  const grounded: Obstacle = { id: world.nextId++, kind: 'rock', pos: { x: -12, y: groundHeight(-12, 0, 1), z: 0 }, radius: 3, height: 7 };
  world.obstacles = [lid, shelf, grounded];
  return { world, lid, shelf, grounded };
}

function meshes(node: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[] {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>[] = [];
  node.traverse(child => { if (child instanceof THREE.Mesh) result.push(child); }); return result;
}

function rendererFor(world: World, worldGroup: THREE.Group) {
  worldGroup.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(48, 1.6, .1, 260); camera.position.set(0, 10, 6); camera.lookAt(0, -3, 0);
  const contours = new ObstacleContours(world); worldGroup.add(contours.group);
  const fields = {
    worldGroup, worldRef: world, lastStage: 1, cameraReady: true, camera, presentationTime: 0, nextBoundsUpdate: 0,
    target: new THREE.Vector3(0, -3, 0), focus: new THREE.Vector3(0, -3, 0),
    occlusionRay: new THREE.Ray(), occlusionPoint: new THREE.Vector3(), occlusionRight: new THREE.Vector3(), occlusionUp: new THREE.Vector3(),
    occlusionTargets: Array.from({ length: 5 }, () => new THREE.Vector3()), playerOcclusionRadius: 2,
    occluders: worldGroup.children.filter(node => typeof node.userData.obstacleId === 'number').map(node => ({
      node, bounds: new THREE.Box3().setFromObject(node), opacity: 1,
      materials: null as { source: THREE.MeshStandardMaterial; display: THREE.MeshStandardMaterial }[] | null,
    })), obstacleContours: contours,
  };
  const renderer = Object.assign(Object.create(GameRenderer.prototype), fields) as typeof fields & {
    updateOcclusion(dt: number): void; syncObstacles(world: World): void;
  };
  return renderer;
}

describe('elevated reef canopy presentation', () => {
  it('has closed top and underside faces, exact collision rims, and leaves grounded rocks unchanged', () => {
    const { world, lid, shelf, grounded } = fixture(), before = JSON.stringify(world), group = createHabitat(world);
    try {
      group.updateMatrixWorld(true);
      for (const obstacle of [lid, shelf]) {
        const node = group.getObjectByName(`obstacle-rock-${obstacle.id}`)!;
        expect(node.getObjectByName('shelf-body')).toBeDefined();
        const body = node.getObjectByName('shelf-body') as THREE.Mesh;
        // Two material groups replace the former body + trim draws. Surface
        // relief stays within the previous total triangle budget per shelf.
        expect(body.geometry.groups).toHaveLength(2);
        expect(meshes(node).reduce((sum, child) => sum + child.geometry.index!.count / 3, 0)).toBeLessThanOrEqual(3328);
        for (const child of meshes(node)) {
          const positions = child.geometry.getAttribute('position');
          for (let i = 0; i < positions.count; i++) {
            expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThanOrEqual(obstacle.radius + 1e-5);
            expect(positions.getY(i)).toBeGreaterThanOrEqual(-1e-6); expect(positions.getY(i)).toBeLessThanOrEqual(obstacle.height + 1e-6);
          }
        }
        // Actual ray intersections cover the underside, upper face and full-width
        // side rim; a decorative fan with holes cannot satisfy these checks.
        for (const angle of [0, .9, 2.2, 4.1]) {
          for (const fraction of [.2, .65, .97]) {
            const x = obstacle.pos.x + Math.cos(angle) * obstacle.radius * fraction, z = obstacle.pos.z + Math.sin(angle) * obstacle.radius * fraction;
            for (const direction of [-1, 1]) {
              const ray = new THREE.Raycaster(new THREE.Vector3(x, direction > 0 ? obstacle.pos.y - 2 : obstacle.pos.y + obstacle.height + 2, z), new THREE.Vector3(0, direction, 0));
              const contacts = ray.intersectObject(body);
              expect(contacts.length).toBeGreaterThan(0);
              expect(contacts[0].face!.materialIndex).toBe(direction > 0 ? 1 : 0);
            }
          }
          const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
          const ray = new THREE.Raycaster(new THREE.Vector3(obstacle.pos.x, obstacle.pos.y + obstacle.height / 2, obstacle.pos.z).addScaledVector(radial, obstacle.radius + 1), radial.clone().negate());
          const contact = ray.intersectObject(body)[0].distance;
          expect(contact).toBeGreaterThanOrEqual(1 - 1e-5);
          expect(contact).toBeLessThanOrEqual(1 + obstacle.radius * (1 - Math.cos(Math.PI / 64)) + 1e-5);
        }
      }
      expect(group.getObjectByName(`obstacle-rock-${grounded.id}`)!.getObjectByName('shelf-body')).toBeUndefined();
      expect(JSON.stringify(world)).toBe(before);
    } finally { disposeObject(group); }
  });

  it('outlines a faded roof at its underside and releases its contour permanently when the solid is removed', () => {
    const { world, lid } = fixture(), contours = new ObstacleContours(world);
    contours.setFade(lid.id, .1);
    const mesh = contours.group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) expect(positions.getY(i) + mesh.position.y).toBeCloseTo(lid.pos.y, 6);
    expect(mesh.material.depthTest).toBe(true); expect(mesh.material.depthWrite).toBe(false); expect(mesh.material.side).toBe(THREE.DoubleSide);
    let geometryDisposals = 0, materialDisposals = 0;
    mesh.geometry.addEventListener('dispose', () => geometryDisposals++); mesh.material.addEventListener('dispose', () => materialDisposals++);
    contours.remove(lid.id); contours.remove(lid.id); contours.setFade(lid.id, .1);
    expect(contours.group.children).toHaveLength(0);
    disposeObject(contours.group); expect(geometryDisposals).toBe(1); expect(materialDisposals).toBe(1);
  });

  it('opens a removed lid in place, clears picking/occlusion and disposes original, faded and contour resources once', () => {
    const { world, lid, shelf } = fixture(), group = createHabitat(world), renderer = rendererFor(world, group);
    const removedNode = group.getObjectByName(`obstacle-rock-${lid.id}`)!, survivor = group.getObjectByName(`obstacle-rock-${shelf.id}`)!;
    const original = meshes(removedNode).flatMap(node => Array.isArray(node.material) ? node.material : [node.material]);
    const geometries = meshes(removedNode).map(node => node.geometry), survivorMeshes = meshes(survivor);
    const disposals = new Map<THREE.Material | THREE.BufferGeometry, number>();
    const watch = (resource: THREE.Material | THREE.BufferGeometry) => { disposals.set(resource, 0); resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1)); };
    for (const resource of [...original, ...geometries]) watch(resource);
    try {
      for (let frame = 0; frame < 24; frame++) renderer.updateOcclusion(1 / 60);
      const faded = meshes(removedNode).flatMap(node => Array.isArray(node.material) ? node.material : [node.material]);
      expect(faded.every(material => !original.includes(material))).toBe(true); faded.forEach(watch);
      for (let i = 0; i < original.length; i++) {
        const source = original[i] as THREE.MeshStandardMaterial, display = faded[i] as THREE.MeshStandardMaterial;
        expect(display.emissive.toArray()).toEqual(source.emissive.toArray());
        expect(display.emissiveIntensity).toBe(source.emissiveIntensity);
      }
      const contour = renderer.obstacleContours.group.getObjectByName(`collision-footprint-${lid.id}`) as THREE.Mesh;
      watch(contour.geometry); watch(contour.material as THREE.Material);
      const eye = renderer.camera.position.clone(), focus = renderer.focus.clone(), orientation = renderer.camera.quaternion.clone();
      world.obstacles = world.obstacles.filter(obstacle => obstacle.id !== lid.id);
      renderer.syncObstacles(world); renderer.syncObstacles(world);
      expect(group.getObjectByName(removedNode.name)).toBeUndefined();
      expect(renderer.occluders.some(item => item.node === removedNode)).toBe(false);
      expect(renderer.obstacleContours.group.getObjectByName(contour.name)).toBeUndefined();
      expect(group.getObjectByName(survivor.name)).toBe(survivor); expect(meshes(survivor)).toEqual(survivorMeshes);
      expect(renderer.worldGroup).toBe(group); expect(renderer.worldRef).toBe(world); expect(renderer.cameraReady).toBe(true);
      expect(renderer.camera.position).toEqual(eye); expect(renderer.camera.quaternion.toArray()).toEqual(orientation.toArray()); expect(renderer.focus).toEqual(focus);
      expect([...disposals.values()].every(count => count === 1)).toBe(true);
      expect(original.some(material => group.userData.ownedMaterials.includes(material))).toBe(false);
      for (let frame = 0; frame < 12; frame++) renderer.updateOcclusion(1 / 60);
      expect(renderer.obstacleContours.group.getObjectByName(contour.name)).toBeUndefined();
    } finally { disposeObject(group); }
    expect([...disposals.values()].every(count => count === 1)).toBe(true);
  });

  it('reveals the canonical oxygen route after a safe grazer meal, and updates its chemistry even with motion frozen', () => {
    const state = createGame(20260913, false); state.stage = 1; state.world = createWorld(state.seed, 1); state.worlds[1] = state.world; initializeJourneyStage(state);
    const site = state.journey.sites.find(site => site.id === 4)!;
    const plant = { id: state.world.nextId++, kind: 'algae' as const, pos: { ...site.refuges[1] }, amount: 8, max: 12, regen: .09, patch: 1 };
    site.plantedId = plant.id; state.world.resources.push(plant);
    const grazer = spawnCreature(state.world, 'sail', 1); grazer.pos = { ...plant.pos }; state.world.creatures = [grazer];
    const view = new JourneyPresentation(new THREE.Scene());
    try {
      expect(state.journey.canopy).toBeDefined(); view.update(state, 0, 0);
      const strand = view.group.getObjectByName('journey-strand-supply-4')!, ribbon = strand.children[0] as THREE.Mesh;
      expect(site.resolved).toBe(false); expect(strand.visible).toBe(false);
      recordConsumption(state, grazer, plant); view.update(state, 0, 0);
      const stream = livingStreams(state).find(stream => stream.id === 'supply-4')!;
      expect(stream.kind).toBe('oxygen'); expect(strand.visible).toBe(true);
      const vertices = ribbon.geometry.getAttribute('position');
      for (let i = 0; i <= 48; i += 8) {
        const point = streamPoint(stream.from, stream.to, i / 48);
        expect((vertices.getX(i * 2) + vertices.getX(i * 2 + 1)) / 2).toBeCloseTo(point.x, 5);
        expect(vertices.getY(i * 2)).toBeCloseTo(point.y, 5);
        expect((vertices.getZ(i * 2) + vertices.getZ(i * 2 + 1)) / 2).toBeCloseTo(point.z, 5);
      }
      // Prepared particle coordinates sample the real vent end of that route.
      // Time remains zero: only actual root state, not decorative animation, changes.
      const point = streamPoint(stream.from, stream.to, .99);
      const positions = (view as unknown as { flowPositions: Float32Array }).flowPositions;
      positions.set([point.x, point.y, point.z], 0);
      const flow = view.group.getObjectByName('journey-vent-flow') as THREE.InstancedMesh;
      const wet = reefWater(state, point).oxygenUse; view.update(state, 0, 0);
      const wetColor = new THREE.Color(); flow.getColorAt(0, wetColor);
      const beforePosition = positions.slice(0, 3), geometry = ribbon.geometry;
      plant.amount = 0; const before = JSON.stringify(state); view.update(state, 0, 0);
      const dryColor = new THREE.Color(); flow.getColorAt(0, dryColor);
      expect(reefWater(state, point).oxygenUse).toBeGreaterThan(wet + .1);
      expect(dryColor.b).toBeLessThan(wetColor.b); expect(strand.visible).toBe(false);
      expect(positions.slice(0, 3)).toEqual(beforePosition); expect(JSON.stringify(state)).toBe(before);
      plant.amount = 8; view.update(state, 0, 0); expect(strand.visible).toBe(true); expect(ribbon.geometry).toBe(geometry);
    } finally { view.dispose(); }
  });
});
