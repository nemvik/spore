import { GameRenderer } from '../src/render/renderer';
import { SettlementPresentation } from '../src/render/settlement';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { groundHeight } from '../src/game/random';
import type { ActiveTribeState } from '../src/game/era-types';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { creatureAttachment, creatureSurfacePoint, resolveCreatureAnatomy } from '../src/game/creature-anatomy';
import { createCreatureSurface } from '../src/render/creature-body';
import { animateOrganism, createOrganism, disposeObject } from '../src/render/organism';

describe('creature model presentation',()=>{
  it.each(['biped','quadruped','longneck'] as const)('%s uses the authoritative surface, UVs, physical feet and attachments',kind=>{
    const g=creatureBodyFixture(kind),geometry=createCreatureSurface(g),pos=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
    for(let i=0;i<pos.count;i++) {
      const point=creatureSurfacePoint(g,uv.getY(i)*2-1,uv.getX(i)*Math.PI*2);
      expect(new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).distanceTo(new THREE.Vector3(point.x,point.y,point.z))).toBeLessThan(.00001);
    }
    geometry.dispose();
    const model=createOrganism(g), feet:THREE.Object3D[]=[],eyes:THREE.Object3D[]=[];
    model.traverse(n=>{if(n.name==='creature-foot')feet.push(n);if(n.name==='creature-eye')eyes.push(n);if(n instanceof THREE.Mesh){for(const key of ['position','normal']){const attribute=n.geometry.getAttribute(key);if(attribute)expect([...attribute.array].every(Number.isFinite)).toBe(true);}}});
    expect(feet).toHaveLength(kind==='biped'?2:4);expect(eyes).toHaveLength(2);
    const mouth=model.getObjectByProperty('name','part-mouth')!;
    expect(mouth.position.distanceTo(new THREE.Vector3(...Object.values(creatureAttachment(g,.82+(kind==='longneck'?.08:0),0).point)))).toBeLessThan(.00001);
    expect(model.userData.motions.filter((m:{kind:string})=>m.kind==='jaw')).toHaveLength(2);
    for(const eye of eyes){expect(eye.position.y).toBeGreaterThan(kind==='longneck'?1.1:.1);if(kind==='longneck')expect(eye.position.z).toBeGreaterThan(1.55);else expect(eye.position.z).toBeLessThan(1.5);}
    disposeObject(model);
  });
  it('keeps three distinct silhouettes at the same scale',()=>{
    const sizes=['biped','quadruped','longneck'].map(kind=>{
      const model=createOrganism(creatureBodyFixture(kind as 'biped'));
      const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());disposeObject(model);return size;
    });
    expect(sizes[2].y).toBeGreaterThan(sizes[1].y*1.5);
    expect(sizes[0].z).toBeCloseTo(sizes[1].z,1);
  });
  it('poses scaled reflected chains once and releases every GPU resource on replacement',()=>{
    const g=creatureBodyFixture('biped');g.parts.find(p=>p.kind==='legs')!.scale=1.3;
    const model=createOrganism(g),a=resolveCreatureAnatomy(g),resources=new Set<THREE.BufferGeometry|THREE.Material>();
    model.traverse(n=>{if(n instanceof THREE.Mesh){resources.add(n.geometry);(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>resources.add(m));}});
    model.userData.ownedMaterials.forEach((m:THREE.Material)=>resources.add(m));
    let disposed=0;resources.forEach(r=>r.addEventListener('dispose',()=>disposed++));
    animateOrganism(model,.1,0,0,2,0);
    const limbs=model.userData.creatureLimbs as THREE.Group[];
    limbs.forEach((limb,i)=>{expect(limb.scale.toArray()).toEqual([1,1,1]);expect(limb.userData.points[0]).toEqual(a.limbs[i].root);});
    disposeObject(model);expect(disposed).toBe(resources.size);
  });
  it('end styles change the end silhouette and invalid stances expose their cause',()=>{
    const g=creatureBodyFixture('biped'),pad=createOrganism(g);
    g.parts.find(p=>p.kind==='legs')!.limb!.end={kind:'foot',style:'claw',scale:1};
    g.parts.find(p=>p.kind==='arms')!.limb!.end={kind:'hand',style:'pincer',scale:.8};
    const claw=createOrganism(g);
    expect(claw.getObjectByName('creature-claw')).toBeDefined();expect(claw.getObjectByName('creature-pincer')).toBeDefined();expect(pad.getObjectByName('creature-claw')).toBeUndefined();
    g.parts=g.parts.filter(p=>p.kind!=='legs');const invalid=createOrganism(g);
    expect(invalid.userData.stanceErrors.length).toBeGreaterThan(0);
    expect(invalid.getObjectByName('invalid-stance')).toBeDefined();
    [pad,claw,invalid].forEach(disposeObject);
  });
});


describe('creature framing and installed presentation',()=>{
  it.each(['biped','quadruped','longneck'] as const)('%s renders planted limbs above the flat sole plane',kind=>{
    const g=creatureBodyFixture(kind),model=createOrganism(g),a=resolveCreatureAnatomy(g);
    animateOrganism(model,.1,0,0,2,0);model.updateMatrixWorld(true);
    for(const limb of model.userData.creatureLimbs as THREE.Group[]){
      if(limb.userData.kind!=='legs')continue;
      const bounds=new THREE.Box3().setFromObject(limb,true);
      expect(Math.abs(bounds.min.y+a.groundClearance)).toBeLessThan(.03);
    }
    disposeObject(model);
  });
  it.each(['editor','menu'] as const)('frames long-neck anatomy in the %s camera, including narrow viewports',mode=>{
    const game=createGame(481516);game.stage=2;game.player.genome=creatureBodyFixture('longneck');
    const renderer=Object.create(GameRenderer.prototype) as GameRenderer;
    const fields={presentationTime:0,settings:{reducedMotion:false},editorScene:new THREE.Scene(),editorModel:null as THREE.Group|null,editorKey:'',editorCamera:new THREE.PerspectiveCamera(40,.65,.1,200),editorFloor:new THREE.Group(),renderer:{render:()=>{}},previewMode:'idle',editorYaw:.65,editorPitch:.22,editorZoom:4,selectedPart:null,portraitScene:new THREE.Scene(),portraitCamera:new THREE.PerspectiveCamera(36,.65,.1,80),portraitModel:null as THREE.Group|null,portraitKey:'',portraitTime:{value:0}};
    Object.assign(renderer,fields);renderer.render(game,.1,mode,mode==='editor'?game.player.genome:undefined);
    const actual=renderer as unknown as typeof fields,model=(mode==='editor'?actual.editorModel:actual.portraitModel)!,camera=mode==='editor'?actual.editorCamera:actual.portraitCamera;
    camera.updateMatrixWorld(true);model.updateMatrixWorld(true);
    const surface=model.userData.attachmentSurface as THREE.Mesh,vertices=surface.geometry.getAttribute('position');
    for(let i=0;i<vertices.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(surface.matrixWorld).project(camera);
      expect(Math.abs(p.x)).toBeLessThan(.95);expect(Math.abs(p.y)).toBeLessThan(.95);
    }
    disposeObject(model);
  });
  it('poses tribe descendants on world terrain with the same V2 limbs and genome',()=>{
    const game=createGame(481516);game.stage=3;game.world=createWorld(game.seed,2);game.player.genome=creatureBodyFixture('longneck');
    const pos={x:3,y:groundHeight(3,0,2)+.8,z:0};
    const tribe:ActiveTribeState={version:2,food:40,members:[{id:1,pos,heading:.7,health:100,hunger:12,tool:null,species:null,benefit:null,loyalty:88,cargo:0,cooldown:0,orders:[],intent:'rest',navigation:{waypoint:{...pos},target:{...pos},rethink:0}}],huts:[],neighbours:[],unlocked:[],legacyAbility:'restoration',abilityCooldown:0,abilityTime:0,nextId:2,elapsed:0,completed:false};
    game.tribe=tribe;const before=JSON.stringify(game),view=new SettlementPresentation();view.update(game,[],.2);view.group.updateMatrixWorld(true);
    const body=view.group.getObjectByName('tribe-member-1')!.children[0] as THREE.Group;
    expect(body.userData.creatureGenome).toEqual(game.player.genome);
    for(const limb of body.userData.creatureLimbs as THREE.Group[]){
      const end=limb.getObjectByName('creature-foot')!,p=end.getWorldPosition(new THREE.Vector3());
      expect(Math.abs(p.y-groundHeight(p.x,p.z,2))).toBeLessThan(.03);
    }
    expect(JSON.stringify(game)).toBe(before);view.dispose();
  });
});
