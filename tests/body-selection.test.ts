import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { selectBodySection } from '../src/render/body-selection';
import { animateOrganism, attachmentOnBody, createOrganism, disposeObject } from '../src/render/organism';
import { bodyCollisionRadius, spineAxial, spineIndex } from '../src/game/body-shape';
import { attachmentAngles, attachmentPoint, organismGroundClearance } from '../src/game/anatomy';
import { ADAPTATIONS, initialGenome, validateGenome } from '../src/game/genome';
import { createGame, evolve, recoverGeneration } from '../src/game/simulation';
import { parseGame, serializeGame } from '../src/game/persistence';
import { resolveObstacleMotion } from '../src/game/obstacle-geometry';
import { BODY_SILHOUETTES } from './fixtures/body-silhouettes';

describe('surface selection', () => {
  it('maps poles and all seven cross sections to their nearest slider', () => {
    expect(spineIndex(-1)).toBe(0); expect(spineIndex(1)).toBe(6);
    for (let i = 0; i < 7; i++) for (const offset of [-.149, 0, .149]) expect(spineIndex(spineAxial(i) + offset)).toBe(i);
  });
  it.each([initialGenome(), ...BODY_SILHOUETTES.map(s => s.genome)])('keeps picking stable under rotation, movement and highlighting for $length/$width', genome => {
    const model = createOrganism(genome), body = model.userData.attachmentSurface as THREE.Mesh;
    const original = Array.from(body.geometry.getAttribute('position').array);
    try {
      for (let i = 0; i < 7; i++) {
        selectBodySection(model, i);
        const band = body.getObjectByName('body-section-selection')!;
        expect(band.parent).toBe(body);
        const bandId = band.uuid; selectBodySection(model, i);
        expect(body.getObjectByName('body-section-selection')!.uuid).toBe(bandId);
        model.rotation.set(.2, 1.4, -.15); animateOrganism(model, .8, 3, .2, 1, .7); model.updateMatrixWorld(true);
        const point = attachmentPoint(spineAxial(i), Math.PI / 2, genome.length, genome.width, genome.spine);
        const target = body.localToWorld(new THREE.Vector3(point.x, point.y, point.z));
        const outward = new THREE.Vector3(1, 0, 0).transformDirection(body.matrixWorld);
        const ray = new THREE.Raycaster(target.clone().addScaledVector(outward, 8), outward.negate());
        const hit = attachmentOnBody(model, ray)!;
        expect(hit).not.toBeNull(); expect(spineIndex(hit.axial)).toBe(i);
        expect(ray.intersectObject(band, true)).toHaveLength(0);
      }
      selectBodySection(model, null); expect(body.getObjectByName('body-section-selection')).toBeUndefined();
      expect(Array.from(body.geometry.getAttribute('position').array)).toEqual(original);
    } finally { disposeObject(model); }
  });
});

describe('five bodies with identical equipment', () => {
  it.each(BODY_SILHOUETTES)('$label: attachment, eyes, animation, floor/roof/wall and save recovery', ({ genome }) => {
    expect(genome.parts).toEqual(initialGenome().parts); expect(validateGenome(genome, 0)).toEqual([]);
    const model = createOrganism(genome), body = model.userData.attachmentSurface as THREE.Mesh;
    try {
      for (const part of genome.parts) {
        const roots = model.children[0].children.filter(c => c.userData.partId === part.id);
        attachmentAngles(part).forEach((angle, i) => {
          const point = attachmentPoint(part.axial, angle, genome.length, genome.width, genome.spine);
          expect(roots[i].position.toArray()).toEqual([point.x, point.y, point.z]);
        });
      }
      const eyeMotions = model.userData.motions.filter((m: { kind: string }) => m.kind === 'eye');
      const [left, right] = eyeMotions.map((m: { node: THREE.Group }) => m.node);
      const diameter = (left.children[1] as THREE.Mesh).scale.x * 2;
      expect(left.position.distanceTo(right.position)).toBeGreaterThan(diameter);
      model.updateMatrixWorld(true);
      for(const eye of [left,right]) {
        const pupil = eye.children[3].getWorldPosition(new THREE.Vector3());
        const outward = new THREE.Vector3(0,0,1).transformDirection(eye.matrixWorld);
        expect(new THREE.Raycaster(pupil,outward).intersectObject(body)).toHaveLength(0);
      }
      const rest = model.children[0].children.filter(c => c.userData.partId).map(c => c.position.clone());
      for (const stage of [0, 1, 2] as const) for (const t of [0, .25, .75, 1.4]) {
        animateOrganism(model, t, 3, .2, stage, .8); model.updateMatrixWorld(true);
        model.traverse(o => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
        model.children[0].children.filter(c => c.userData.partId).forEach((c, i) => expect(c.position).toEqual(rest[i]));
      }
      animateOrganism(model, 0, 0, 0, 2, 0); model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(body);
      expect(bounds.min.y + organismGroundClearance(genome)).toBeGreaterThanOrEqual(0);
      const radius = bodyCollisionRadius(genome, 1), state = createGame(67, false, true, true, true);
      const world = { ...state.world, stage: 1 as const, obstacles: [{ id: 9001, kind: 'rock' as const, pos: { x: 0, y: 3, z: 0 }, radius: 4, height: 1 }] };
      const ceiling = resolveObstacleMotion(world, { x: 0, y: -2, z: 0 }, { x: 0, y: 5, z: 0 }, radius);
      expect(ceiling.y + bounds.max.y).toBeLessThanOrEqual(3);
      let wall = { x: 8, y: 3.5, z: 0 };
      for (let i = 0; i < 80; i++) wall = resolveObstacleMotion(world, wall, { ...wall, x: wall.x - .1 }, radius);
      expect(wall.x + bounds.min.x).toBeGreaterThanOrEqual(4);
      expect(evolve(state, genome)).toMatchObject({ ok: true });
      const loaded = parseGame(serializeGame(state)); expect(loaded.player.genome).toEqual(genome);
      expect(recoverGeneration(loaded).player.genome).toEqual(genome);
    } finally { disposeObject(model); }
  });
});


describe('all existing organ attachments on the five profiles', () => {
  it.each(BODY_SILHOUETTES)('$label supports every existing organ during swimming and walking', ({genome}) => {
    for(const adaptation of ADAPTATIONS) {
      const part = {id:'probe',kind:adaptation.id,axial:.3,angle:1.2,scale:1,mirrored:true};
      const model=createOrganism({...genome,parts:[part]});
      try {
        const roots=model.children[0].children.filter(c=>c.userData.partId==='probe');
        expect(roots).toHaveLength(2);
        attachmentAngles(part).forEach((angle,i)=>{
          const point=attachmentPoint(part.axial,angle,genome.length,genome.width,genome.spine);
          expect(roots[i].position.toArray()).toEqual([point.x,point.y,point.z]);
        });
        for(const stage of [1,2] as const) for(const time of [.2,.8,1.6]) {
          animateOrganism(model,time,3,.1,stage,.7);model.updateMatrixWorld(true);
          model.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
        }
      } finally {disposeObject(model);}
    }
  });
  it('disposes the highlight fill and both boundary lines with their model',()=>{
    const model=createOrganism(initialGenome());selectBodySection(model,3);
    let geometries=0,materials=0;
    model.getObjectByName('body-section-selection')!.traverse(node=>{
      if(node instanceof THREE.Mesh||node instanceof THREE.Line){
        node.geometry.addEventListener('dispose',()=>geometries++);
        (node.material as THREE.Material).addEventListener('dispose',()=>materials++);
      }
    });
    disposeObject(model);expect(geometries).toBe(3);expect(materials).toBe(3);
  });
});
