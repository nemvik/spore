import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { initialGenome } from '../src/game/genome';
import { groundHeight } from '../src/game/random';
import { safeCameraPosition } from '../src/game/camera';
import { createWorld, surfaceY } from '../src/game/world';
import { attachmentOnBody, createOrganism, disposeObject, selectOrganismPart } from '../src/render/organism';
import { abilityPulse, compositionCamera, GameRenderer, keepCameraOutside } from '../src/render/renderer';
import { createGame } from '../src/game/simulation';
import type { Vec3, World } from '../src/game/types';

describe('editor selection and camera-aware surface placement', () => {
  it('animates a walking preview on its own clock while simulation is paused', () => {
    const state=createGame(481516);state.stage=2;
    state.player.genome.parts.push({id:'walking-pair',kind:'legs',axial:0,angle:1.6,scale:1,mirrored:true});
    const renderer=Object.create(GameRenderer.prototype) as GameRenderer;
    const fields={presentationTime:0,settings:{reducedMotion:false},editorScene:new THREE.Scene(),editorModel:null as THREE.Group|null,editorKey:'',editorCamera:new THREE.PerspectiveCamera(40,1,.1,200),editorFloor:new THREE.Group(),renderer:{render:()=>{}},previewMode:'move',editorYaw:.65,editorPitch:.22,editorZoom:10,selectedPart:null};
    Object.assign(renderer,fields);
    const time=state.world.time;
    try {
      renderer.render(state,.1,'editor',state.player.genome);
      const model=(renderer as unknown as typeof fields).editorModel!;
      const leg=model.userData.motions.find((motion:{kind:string})=>motion.kind==='leg').node as THREE.Object3D;
      const first=leg.rotation.x;
      renderer.render(state,.1,'editor',state.player.genome);
      expect(leg.rotation.x).not.toBe(first);
      expect(state.world.time).toBe(time);
      renderer.previewMode='idle';renderer.render(state,.1,'editor',state.player.genome);
      const stationary=leg.rotation.x;
      renderer.render(state,.1,'editor',state.player.genome);
      expect(leg.rotation.x).toBe(stationary);
      state.stage=1;renderer.render(state,.1,'editor',state.player.genome);
      expect(leg.rotation.x).not.toBe(stationary);
      expect((renderer as unknown as typeof fields).editorFloor.position.y).toBe(-2);
    } finally { const model=(renderer as unknown as typeof fields).editorModel;if(model)disposeObject(model); }
  });

  it('highlights both copies without altering another part and releases selection materials', () => {
    const genome = initialGenome();
    genome.parts.push({ id: 'paired-fins', kind: 'fins', axial: 0, angle: 1.25, scale: 1, mirrored: true });
    const model = createOrganism(genome);
    const original = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    model.traverse(node => { if (node instanceof THREE.Mesh) original.set(node, node.material); });
    const ownedBefore = model.userData.ownedMaterials.length;
    try {
      selectOrganismPart(model, 'paired-fins');
      const selected: THREE.Object3D[] = [];
      model.traverse(node => { if (node.userData.selected) selected.push(node); });
      expect(selected).toHaveLength(2);
      for (const part of selected) part.traverse(node => {
        if (node instanceof THREE.Mesh) {
          expect(node.material).not.toBe(original.get(node));
          expect((node.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThanOrEqual(.72);
        }
      });
      const tail = model.getObjectByProperty('uuid', [...original.keys()].find(mesh => {
        let parent = mesh.parent;
        while (parent) { if (parent.userData.kind === 'flagellum') return true; parent = parent.parent; }
        return false;
      })!.uuid) as THREE.Mesh;
      expect(tail.material).toBe(original.get(tail));
      const selectedCount = model.userData.ownedMaterials.length;
      selectOrganismPart(model, 'paired-fins');
      expect(model.userData.ownedMaterials.length).toBe(selectedCount);
      for (let index = 0; index < 12; index++) {
        selectOrganismPart(model, 'primordial-tail');
        selectOrganismPart(model, 'paired-fins');
        selectOrganismPart(model, null);
        expect(model.userData.ownedMaterials.length).toBe(ownedBefore);
        for (const [mesh, material] of original) expect(mesh.material).toBe(material);
      }
    } finally { disposeObject(model); }
  });

  it.each([[-6, 2, 5], [6, 3, 4], [1, 5, -6]])('maps a rotated camera %j to the actual body surface', (x, y, z) => {
    const genome = initialGenome(); genome.length = 1.7; genome.width = 1.3;
    const model = createOrganism(genome);
    model.position.set(2, 1, -3); model.rotation.set(.1, .4, -.2); model.scale.setScalar(1.3);
    const camera = new THREE.PerspectiveCamera(40, 4 / 3, .1, 100);
    camera.position.set(x + 2, y + 1, z - 3); camera.lookAt(model.position); camera.updateMatrixWorld(true);
    model.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    try {
      const placement = attachmentOnBody(model, ray)!;
      const surface = model.userData.attachmentSurface as THREE.Mesh;
      const hit = ray.intersectObject(surface, false)[0];
      const local = surface.worldToLocal(hit.point.clone());
      const axial = local.z / (1.76 * genome.length);
      const angle = Math.atan2(local.x / .69, (local.y - .13 * axial * axial) / .62);
      expect(placement.axial).toBeCloseTo(axial, 5);
      expect(Math.abs(Math.atan2(Math.sin(placement.angle-angle), Math.cos(placement.angle-angle)))).toBeLessThan(.025);

      // Exercise the public client-coordinate API with an offset canvas, no WebGL context.
      const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
      Object.assign(renderer, { editorModel: model, editorCamera: camera, pointer: new THREE.Vector2(), raycaster: new THREE.Raycaster(), renderer: { domElement: { getBoundingClientRect: () => ({ left: 40, top: 20, width: 800, height: 600 }) } } });
      expect(renderer.attachmentAt(440, 320)).toEqual(placement);
      expect(renderer.attachmentAt(40, 20)).toBeNull();
    } finally { disposeObject(model); }
  });
});

describe('ability-only world pulses', () => {
  it.each([.5,.65,.8])('does not put a generic ring around ordinary feeding/care %f', feeding=>{
    const state=createGame(481516);state.player.feeding=feeding;state.player.cooldown=2;
    state.player.genome.parts.push({id:'toxin',kind:'toxin',axial:0,angle:0,scale:1,mirrored:false});
    expect(abilityPulse(state)).toBeNull();
  });
  it('uses a bounded phase and the actual toxin radius, then expires',()=>{
    const state=createGame(481516);state.player.genome.parts.push({id:'toxin',kind:'toxin',axial:0,angle:0,scale:1,mirrored:false});
    state.player.feeding=1.3;state.player.cooldown=7;
    expect(abilityPulse(state)).toMatchObject({progress:0,radius:10});
    state.player.feeding=.65;state.player.cooldown=6.35;
    expect(abilityPulse(state)!.progress).toBeCloseTo(.5);
    state.player.feeding=0;state.player.cooldown=5.7;expect(abilityPulse(state)).toBeNull();
    state.player.scan=4.5;expect(abilityPulse(state)!.progress).toBe(.5);
    state.player.scan=4;expect(abilityPulse(state)).toBeNull();
  });
});

function expectClear(point: Vec3, focus: Vec3, world: World) {
  expect(Object.values(point).every(Number.isFinite)).toBe(true);
  expect(point.y).toBeGreaterThanOrEqual(groundHeight(point.x, point.z, world.stage) + 2.2 - 1e-9);
  expect(point.y).toBeGreaterThanOrEqual(focus.y + 2.5 - 1e-9);
  for (const obstacle of world.obstacles) if (Math.hypot(point.x-obstacle.pos.x, point.z-obstacle.pos.z) < obstacle.radius + .75) expect(point.y).toBeGreaterThanOrEqual(obstacle.pos.y + obstacle.height + .85 - 1e-9);
}

describe('camera composition preserves scale and solid clearance', () => {
  it('uses a full-distance elevated view instead of pushing into the player beside a trunk', () => {
    const world = createWorld(481516, 2);
    world.obstacles = [{ id: 9999, kind: 'tree', pos: { x: 0, y: 0, z: 5 }, radius: 2, height: 10 }];
    const focus = { x: 0, y: 1.7, z: 0 }, zoom = 25, pitch = .55;
    const original = safeCameraPosition(focus, { x: 0, y: focus.y + zoom * Math.sin(pitch), z: zoom * Math.cos(pitch) }, world);
    const candidate = compositionCamera(focus, 0, pitch, zoom, world);
    expect(Math.hypot(original.x-focus.x,original.y-focus.y,original.z-focus.z)).toBeLessThan(12);
    expect(Math.hypot(candidate.x-focus.x,candidate.y-focus.y,candidate.z-focus.z)).toBeGreaterThan(22);
    expectClear(keepCameraOutside(candidate, focus, world), focus, world);
  });

  it.each([481516, 20260913, 8675309])('keeps smoothed views outside terrain and obstacle volumes for seed %i', seed => {
    for (const stage of [0, 1, 2] as const) {
      const world = createWorld(seed, stage);
      for (const obstacle of world.obstacles.slice(0, 6)) {
        const focus = { x: obstacle.pos.x, y: surfaceY(stage, obstacle.pos.x, obstacle.pos.z-obstacle.radius-1) + .5, z: obstacle.pos.z-obstacle.radius-1 };
        const candidate = compositionCamera(focus, 0, .55, 25, world);
        const previous = new THREE.Vector3(focus.x + 19, focus.y + 13, focus.z + 12);
        for (let frame = 0; frame < 60; frame++) {
          previous.lerp(new THREE.Vector3(candidate.x, candidate.y, candidate.z), 1-Math.exp(-5/60));
          const safe = keepCameraOutside(previous, focus, world);
          expectClear(safe, focus, world);
          previous.set(safe.x, safe.y, safe.z);
        }
      }
    }
  });
});

describe('camera foliage transparency', () => {
  it.each([0, 2])('clears foliage and stage %i solids appropriately, restores both, and reuses owned materials', stage => {
    const source=new THREE.MeshStandardMaterial({color:0x559977,side:THREE.DoubleSide});
    const geometry=new THREE.BoxGeometry(.5,1,1),worldGroup=new THREE.Group();
    const foreground=new THREE.Mesh(geometry,source);foreground.position.set(.95,2,5);
    const background=new THREE.Mesh(geometry,source);background.position.set(0,2,-4);
    const solid=new THREE.Mesh(geometry,source);solid.position.set(-.95,2,5);solid.userData.obstacleId=123;
    worldGroup.add(foreground,background,solid);worldGroup.updateMatrixWorld(true);
    const camera=new THREE.PerspectiveCamera(48,1,.1,260);camera.position.set(0,2,10);camera.lookAt(0,2,0);
    const fields={lastStage:stage,worldGroup,presentationTime:0,nextBoundsUpdate:0,camera,target:new THREE.Vector3(0,2,0),occlusionRay:new THREE.Ray(),occlusionPoint:new THREE.Vector3(),occlusionRight:new THREE.Vector3(),occlusionUp:new THREE.Vector3(),occlusionTargets:Array.from({length:5},()=>new THREE.Vector3()),playerOcclusionRadius:2,occluders:[foreground,background,solid].map(node=>({node,bounds:new THREE.Box3().setFromObject(node),opacity:1,materials:null}))};
    const renderer=Object.create(GameRenderer.prototype) as {updateOcclusion(dt:number):void};Object.assign(renderer,fields);
    const centre=new THREE.Ray(camera.position.clone(),new THREE.Vector3(0,0,-1));
    expect(centre.intersectsBox(fields.occluders[0].bounds)).toBe(false);
    let sourceDisposals=0,displayDisposals=0,geometryDisposals=0;
    source.addEventListener('dispose',()=>sourceDisposals++);geometry.addEventListener('dispose',()=>geometryDisposals++);
    try {
      for(let frame=0;frame<24;frame++)renderer.updateOcclusion(1/60);
      const display=foreground.material;
      expect(foreground.userData.cameraOccluded).toBe(true);expect(display).not.toBe(source);
      expect(display.opacity).toBeLessThan(.12);expect(display.depthWrite).toBe(false);expect(display.forceSinglePass).toBe(true);
      const solidDisplay=solid.material;
      expect(solid.userData.cameraOccluded).toBe(true);expect(solidDisplay).not.toBe(source);
      if(stage===0){expect(solidDisplay.opacity).toBeGreaterThan(.25);expect(solidDisplay.opacity).toBeLessThan(.35);expect(solidDisplay.opacity).toBeGreaterThan(display.opacity);}
      else{expect(solidDisplay.opacity).toBeLessThan(.12);expect(solidDisplay.opacity).toBeCloseTo(display.opacity);}
      expect(solidDisplay.depthWrite).toBe(false);
      expect(background.userData.cameraOccluded).toBe(false);expect(background.material).toBe(source);expect(source.opacity).toBe(1);
      display.addEventListener('dispose',()=>displayDisposals++);
      solidDisplay.addEventListener('dispose',()=>displayDisposals++);
      const owned=worldGroup.userData.ownedMaterials.length;
      for(let round=0;round<4;round++){
        camera.position.set(15,2,10);camera.lookAt(fields.target);
        for(let frame=0;frame<90;frame++)renderer.updateOcclusion(1/60);
        expect(foreground.userData.cameraOccluded).toBe(false);expect(display.opacity).toBeGreaterThan(.99);expect(display.depthWrite).toBe(true);
        expect(solid.userData.cameraOccluded).toBe(false);expect(solidDisplay.opacity).toBeGreaterThan(.99);expect(solidDisplay.depthWrite).toBe(true);
        camera.position.set(0,2,10);camera.lookAt(fields.target);
        for(let frame=0;frame<30;frame++)renderer.updateOcclusion(1/60);
        expect(foreground.material).toBe(display);expect(worldGroup.userData.ownedMaterials.length).toBe(owned);
        expect(solid.material).toBe(solidDisplay);
      }
      // Drought/restoration can still update the shared habitat material while it fades.
      source.color.setHex(0xbb8844);renderer.updateOcclusion(1/60);expect(display.color).toEqual(source.color);
    }finally{disposeObject(worldGroup);}
    expect(sourceDisposals).toBe(1);expect(displayDisposals).toBe(2);expect(geometryDisposals).toBe(1);
  });
});
