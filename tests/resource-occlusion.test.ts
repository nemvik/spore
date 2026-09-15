import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGame } from '../src/game/simulation';
import type { FeedSelection, GameState, Resource } from '../src/game/types';
import { GameRenderer } from '../src/render/renderer';
import { disposeObject } from '../src/render/organism';

/** CPU presentation fixture: actual resource mesh construction and fade methods,
 * with no WebGL context, simulation stepping, or campaign claims. */
function scene() {
  const s = createGame(20260913, false); s.stage = 1;
  const foreground: Resource = { id: 701, kind: 'mineral', pos: { x: 0, y: 2, z: 8.5 }, amount: 4, max: 4, regen: 0, patch: 0 };
  const background: Resource = { ...foreground, id: 702, pos: { x: 0, y: 2, z: -4 } };
  s.world.resources = [foreground, background];
  const worldGroup = new THREE.Group(), stageScene = new THREE.Scene(); stageScene.add(worldGroup);
  const camera = new THREE.PerspectiveCamera(48, 1.6, .1, 260); camera.position.set(0, 2, 10); camera.lookAt(0, 2, 0);
  const fields = {
    scene: stageScene, worldGroup, lastStage: 1, presentationTime: 0, nextBoundsUpdate: 0, camera,
    target: new THREE.Vector3(0, 2, 0), resources: new Map<number, THREE.Group>(),
    occlusionRay: new THREE.Ray(), occlusionPoint: new THREE.Vector3(), occlusionRight: new THREE.Vector3(), occlusionUp: new THREE.Vector3(),
    occlusionTargets: Array.from({ length: 5 }, () => new THREE.Vector3()), playerOcclusionRadius: 2,
    occluders: [] as { node: THREE.Object3D; bounds: THREE.Box3; opacity: number; resource?: true; materials: unknown }[],
  };
  const renderer = Object.assign(Object.create(GameRenderer.prototype), fields) as typeof fields & {
    updateResources(s: GameState, time: number): void; updateOcclusion(dt: number): void;
    pickWorld(s: GameState, x: number, y: number): FeedSelection | null;
  };
  renderer.updateResources(s, 0);
  const frames = (count: number) => { for (let i = 0; i < count; i++) { renderer.presentationTime += 1 / 60; renderer.updateOcclusion(1 / 60); } };
  return { s, foreground, background, renderer, frames, stageScene, worldGroup, camera };
}

function crystals(group: THREE.Group) { return group.children as THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>[]; }

describe('ordinary food between the camera and organism', () => {
  it('keeps camera-faded food pickable while a real solid between the lens and food still blocks selection', () => {
    const { s, foreground, renderer, frames, stageScene, worldGroup, camera } = scene();
    Object.assign(renderer, {
      pointer: new THREE.Vector2(), raycaster: new THREE.Raycaster(), creatureMeshes: new Map(),
      journey: { group: new THREE.Group() }, player: null,
      renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }) } },
    });
    const front = renderer.resources.get(foreground.id)!;
    const before = JSON.stringify(s), expected = { kind: 'food', id: foreground.id, stage: s.stage };
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(.65, .65, 2, 16), new THREE.MeshStandardMaterial());
    wall.position.set(0, 2, 9.25);
    try {
      expect(renderer.pickWorld(s, 300, 300)).toEqual(expected);
      frames(30); const display = crystals(front)[0].material;
      expect(display.opacity).toBeLessThan(.15);
      expect(renderer.pickWorld(s, 300, 300)).toEqual(expected);
      worldGroup.add(wall);
      expect(Math.hypot(camera.position.x - wall.position.x, camera.position.z - wall.position.z)).toBeGreaterThan(.65);
      expect(renderer.pickWorld(s, 300, 300)).toBeNull();
      wall.visible = false; expect(renderer.pickWorld(s, 300, 300)).toEqual(expected);
      display.visible = false; expect(renderer.pickWorld(s, 300, 300)?.id).not.toBe(foreground.id);
      display.visible = true; foreground.amount = .1; renderer.updateResources(s, 0);
      expect(renderer.pickWorld(s, 300, 300)?.id).not.toBe(foreground.id);
      foreground.amount = 4; renderer.updateResources(s, 0);
      expect(JSON.stringify(s)).toBe(before);
    } finally { if (!wall.parent) worldGroup.add(wall); disposeObject(stageScene); }
  });

  it('fades the actual near-lens crystal group and restores it after orbit without changing food or geometry', () => {
    const { s, foreground, background, renderer, frames, stageScene, worldGroup, camera } = scene();
    const front = renderer.resources.get(foreground.id)!, back = renderer.resources.get(background.id)!;
    const meshes = crystals(front), original = meshes[0].material, backOriginal = crystals(back)[0].material;
    const geometry = meshes.map(mesh => mesh.geometry), before = JSON.stringify(s);
    const bounds = new THREE.Box3().setFromObject(front), transform = front.matrix.clone();
    expect(meshes).toHaveLength(3);
    try {
      frames(30);
      const display = meshes[0].material;
      expect(front.userData.cameraOccluded).toBe(true);
      expect(display).not.toBe(original); expect(display.opacity).toBeGreaterThan(0); expect(display.opacity).toBeLessThan(.15);
      expect(display.depthTest).toBe(true); expect(display.depthWrite).toBe(false);
      expect(meshes.every(mesh => mesh.material === display)).toBe(true);
      expect(back.userData.cameraOccluded).toBe(false); expect(crystals(back)[0].material).toBe(backOriginal); expect(backOriginal.opacity).toBe(1);
      expect(original.opacity).toBe(1); expect(front.visible).toBe(true);
      expect(new THREE.Box3().setFromObject(front)).toEqual(bounds); expect(meshes.map(mesh => mesh.geometry)).toEqual(geometry);
      expect(front.matrix).toEqual(transform); expect(JSON.stringify(s)).toBe(before);
      expect(front.userData.ownedMaterials).toEqual([original]); expect(worldGroup.userData.ownedMaterials).toBeUndefined();
      for (let round = 0; round < 3; round++) {
        camera.position.set(15, 2, 10); camera.lookAt(renderer.target); frames(90);
        expect(front.userData.cameraOccluded).toBe(false); expect(display.opacity).toBeGreaterThan(.99); expect(display.depthWrite).toBe(true);
        camera.position.set(0, 2, 10); camera.lookAt(renderer.target); frames(30);
        expect(meshes[0].material).toBe(display); expect(front.userData.ownedMaterials).toEqual([original]);
      }
    } finally { disposeObject(stageScene); }
  });

  it('removes a faded resource and its occluder together, disposing all owned GPU objects once', () => {
    const { s, foreground, renderer, frames, stageScene } = scene();
    const front = renderer.resources.get(foreground.id)!, meshes = crystals(front), original = meshes[0].material;
    let originals = 0, displays = 0, geometries = 0;
    original.addEventListener('dispose', () => originals++);
    for (const mesh of meshes) mesh.geometry.addEventListener('dispose', () => geometries++);
    frames(30); meshes[0].material.addEventListener('dispose', () => displays++);
    s.world.resources = s.world.resources.filter(food => food.id !== foreground.id);
    renderer.updateResources(s, 1);
    expect(front.parent).toBeNull(); expect(renderer.resources.has(foreground.id)).toBe(false);
    expect(renderer.occluders.some(item => item.node === front)).toBe(false);
    expect(originals).toBe(1); expect(displays).toBe(1); expect(geometries).toBe(3);
    frames(30); renderer.updateResources(s, 2); disposeObject(stageScene);
    expect(originals).toBe(1); expect(displays).toBe(1); expect(geometries).toBe(3);
  });

  it('uses live food visibility and refreshed moving bounds, without fading food behind the organism', () => {
    const { s, foreground, renderer, frames, stageScene } = scene();
    const front = renderer.resources.get(foreground.id)!, original = crystals(front)[0].material;
    try {
      foreground.amount = .1; renderer.updateResources(s, 0); frames(30);
      expect(front.visible).toBe(false); expect(front.userData.cameraOccluded).toBe(false);
      expect(crystals(front)[0].material).toBe(original); expect(front.userData.ownedMaterials).toBeUndefined();
      foreground.amount = 4; renderer.updateResources(s, 0); frames(30);
      const display = crystals(front)[0].material;
      expect(front.visible).toBe(true); expect(front.userData.cameraOccluded).toBe(true); expect(display.opacity).toBeLessThan(.15);
      foreground.pos.z = -4; renderer.updateResources(s, 0); frames(110);
      expect(front.userData.cameraOccluded).toBe(false); expect(display.opacity).toBeGreaterThan(.99); expect(display.depthWrite).toBe(true);
      expect(renderer.resources.get(foreground.id)).toBe(front);
    } finally { disposeObject(stageScene); }
  });
});
