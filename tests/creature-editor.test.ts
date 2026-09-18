import { describe, it, expect } from 'vitest';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { upgradeCreatureGenome, validateCreatureStructure } from '../src/game/creature-body';
import type { Genome, LegacyGenome } from '../src/game/types';
import { beginCreatureEdit, finishCreatureEdit, undoCreatureEdit, redoCreatureEdit, editCreatureSkeleton, createCreatureIds, insertCreatureSpine, removeCreatureSpine, insertCreatureJoint, removeCreatureJoint, canAddCreaturePart, defaultCreatureLimb, type CreatureEditState } from '../src/ui/creature-editor';
const state = (g:Genome=creatureBodyFixture('biped')):CreatureEditState => ({draft:structuredClone(g),selection:null,undo:[],redo:[],before:null});
describe('creature editor transactions',()=>{
 it('groups a whole drag, replaces history objects and keeps nested snapshots independent',()=>{const s=state(),original=structuredClone(s.draft);beginCreatureEdit(s);for(let n=0;n<4;n++)s.draft.parts[2].limb!.joints[0].offset.y-=.05;finishCreatureEdit(s);expect(s.undo).toEqual([original]);const after=structuredClone(s.draft),ref=s.draft;undoCreatureEdit(s);expect(s.draft).toEqual(original);expect(s.draft).not.toBe(ref);redoCreatureEdit(s);expect(s.draft).toEqual(after);s.draft.parts[2].limb!.end={kind:'none'};expect(s.undo[0]).toEqual(original);});
 it('selection and a stationary drag preserve redo and create no entry',()=>{const s=state();s.redo.push(structuredClone(s.draft));s.selection={kind:'part',partId:'arms'};beginCreatureEdit(s);finishCreatureEdit(s);expect(s.undo).toHaveLength(0);expect(s.redo).toHaveLength(1);});
 it('cancels a joint drag without consuming redo or changing the draft',()=>{const g=creatureBodyFixture('biped'),s=state(g);s.redo.push(structuredClone(g));beginCreatureEdit(s);s.draft.parts[2].limb!.joints[0].offset.y-=.1;finishCreatureEdit(s,true);expect(s.draft).toEqual(g);expect(s.undo).toHaveLength(0);expect(s.redo).toHaveLength(1);});
 it('commits before undo and caps history at forty',()=>{const s=state();for(let n=0;n<45;n++){beginCreatureEdit(s);s.draft.hue=n;finishCreatureEdit(s);}expect(s.undo).toHaveLength(40);beginCreatureEdit(s);s.draft.hue=99;undoCreatureEdit(s);expect(s.draft.hue).toBe(44);expect(s.before).toBeNull();});
 it('upgrades only with a real skeletal edit and undoes to exact v1',()=>{const g:LegacyGenome={version:1,name:'old',length:1,width:1,hue:180,pattern:0,parts:[]},s=state(g);editCreatureSkeleton(s,()=>{});expect(s.draft).toEqual(g);editCreatureSkeleton(s,g=>{g.body.spine[3].bend=.2;});expect(s.draft.version).toBe(2);expect(s.undo).toEqual([g]);undoCreatureEdit(s);expect(s.draft).toEqual(g);redoCreatureEdit(s);expect(s.draft).toEqual({...upgradeCreatureGenome(g),body:{...upgradeCreatureGenome(g).body,spine:upgradeCreatureGenome(g).body.spine.map((n,i)=>i===3?{...n,bend:.2}:n)}});});
});
describe('bounded construction with stable IDs',()=>{
 it('inserts interpolated nodes, preserves endpoints and stable IDs across undo',()=>{const s=state(),ids=createCreatureIds();editCreatureSkeleton(s,g=>{g.body.spine[3].bend=.5;});const g=s.draft;if(g.version!==2)throw Error();const id=insertCreatureSpine(g,g.body.spine[3].id,ids);expect(g.body.spine.find(n=>n.id===id)?.bend).toBe(.25);expect(removeCreatureSpine(g,g.body.spine[0].id)).toBe(false);expect(validateCreatureStructure(g)).toEqual([]);expect(ids(g,'spine')).not.toBe(id);while(g.body.spine.length>3)expect(removeCreatureSpine(g,g.body.spine[1].id)).toBe(true);expect(removeCreatureSpine(g,g.body.spine[1].id)).toBe(false);});
 it('refuses short subdivisions and long merged bones without changing data',()=>{const g=creatureBodyFixture('biped'),p=g.parts[2],ids=createCreatureIds();const first=insertCreatureJoint(p,p.limb!.joints[0].id,ids,g);expect(first).toBeTruthy();expect(p.limb!.joints).toHaveLength(3);expect(removeCreatureJoint(p,first!)).toBe(true);p.limb!.joints[0].offset={x:0,y:-1,z:0};p.limb!.joints[1].offset={x:0,y:-2,z:0};p.limb!.joints.push({id:'last',offset:{x:0,y:-3,z:0},radius:.1});const before=structuredClone(p);expect(removeCreatureJoint(p,p.limb!.joints[0].id)).toBe(false);expect(p).toEqual(before);});
 it('respects total, species and shared mouth limits without duplicating symmetry records',()=>{const g=creatureBodyFixture('biped');g.parts.push({...g.parts[1],id:'mouth2'},{...g.parts[1],id:'mouth3'});expect(canAddCreaturePart(g,'proboscis')).toBe(false);expect(canAddCreaturePart(g,'filter')).toBe(false);g.parts.push({...g.parts[3],id:'arms2'});expect(canAddCreaturePart(g,'arms')).toBe(false);expect(defaultCreatureLimb('arms').end.kind).toBe('hand');expect(g.parts.filter(p=>p.kind==='legs')).toHaveLength(1);});
});

import * as THREE from 'three';
import { creatureHandleDescriptors, startCreatureDrag, creatureDragDelta } from '../src/render/creature-handles';
it('describes both symmetry handles from one chain and stores the drag frame independently of later camera motion',()=>{
 const g=creatureBodyFixture('biped'),before=structuredClone(g),handles=creatureHandleDescriptors(g),knees=handles.filter(h=>h.selection.kind==='joint'&&h.selection.partId==='hind-legs'&&h.selection.jointId==='knee');expect(knees).toHaveLength(2);expect(knees[0].point.x).toBeCloseTo(-knees[1].point.x);
 const ray=new THREE.Ray(new THREE.Vector3(0,0,10),new THREE.Vector3(0,0,-1));const frame=new THREE.Matrix4().makeRotationY(.4),drag=startCreatureDrag(ray,new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,1),frame,1)!;frame.makeRotationY(1.2);
 const moved=new THREE.Ray(new THREE.Vector3(1,2,10),new THREE.Vector3(0,0,-1));expect(creatureDragDelta(drag,moved)).toEqual({x:expect.closeTo(Math.cos(.4),6),y:2,z:expect.closeTo(Math.sin(.4),6)});expect(g).toEqual(before);
});

import { createCreaturePreviewCache } from '../src/ui/creature-editor';
import { computeStats } from '../src/game/genome';
it('reuses one content-revision anatomy for editor consumers and never retains a mutated or cancelled draft',()=>{
 const s=state(),preview=createCreaturePreviewCache(),first=preview(s.draft);expect(preview(s.draft)).toBe(first);
 beginCreatureEdit(s);s.draft.parts[2].limb!.joints[0].radius=.2;const changed=preview(s.draft);expect(changed.revision).toBe(first.revision+1);expect(changed.anatomy).not.toBe(first.anatomy);expect(changed.stats.mass).toBeGreaterThan(first.stats.mass);expect(changed.stats).toEqual(computeStats(s.draft));expect(preview(s.draft).anatomy).toBe(changed.anatomy);
 s.draft.width=1.1;const wider=preview(s.draft);expect(wider.stats.mass).toBeGreaterThan(changed.stats.mass);expect(first.genome.width).toBe(1);finishCreatureEdit(s,true);const restored=preview(s.draft);expect(restored.genome).toEqual(first.genome);expect(restored.stats).toEqual(first.stats);expect(restored.revision).toBe(wider.revision+1);
});

import { GameRenderer } from '../src/render/renderer';
import { createGame } from '../src/game/simulation';
import { disposeObject } from '../src/render/organism';
it('returns posed preview limbs to the authored handle points when switching back to construction',()=>{
 const g=creatureBodyFixture('biped'),preview=createCreaturePreviewCache()(g),game=createGame(67),renderer=Object.create(GameRenderer.prototype) as GameRenderer;
 const fields={presentationTime:.3,settings:{reducedMotion:false},editorScene:new THREE.Scene(),previewTarget:new THREE.Mesh(new THREE.SphereGeometry(.24),new THREE.MeshStandardMaterial()),editorLights:[new THREE.HemisphereLight(),new THREE.DirectionalLight(),new THREE.DirectionalLight()],editorModel:null as THREE.Group|null,editorKey:'',editorCamera:new THREE.PerspectiveCamera(40,16/9,.1,200),editorFloor:new THREE.Group(),renderer:{render:()=>{}},previewMode:'move',editorYaw:.65,editorPitch:.22,editorZoom:10,selectedPart:null,selectedSpine:null,creatureConstruction:false,creatureHandles:null,creatureHandleKey:'',creatureSelection:null,editorAnatomy:preview.anatomy};Object.assign(renderer,fields);renderer.previewStage=2;
 renderer.render(game,.1,'editor',g);renderer.creatureConstruction=true;renderer.render(game,.1,'editor',g);const actual=renderer as unknown as typeof fields;for(const [i,limb] of (actual.editorModel!.userData.creatureLimbs as THREE.Group[]).entries())expect(limb.userData.points).toEqual(preview.anatomy!.limbs[i].points);disposeObject(actual.editorModel!);
});
it('does not mistake imported property order for a selection edit',()=>{const g=creatureBodyFixture('biped'),s=state({...g,parts:g.parts.map(p=>({limb:p.limb,...p}))});beginCreatureEdit(s);s.draft={version:g.version,name:g.name,length:g.length,width:g.width,hue:g.hue,pattern:g.pattern,parts:g.parts,body:g.body};finishCreatureEdit(s);expect(s.undo).toHaveLength(0);});

import { vi } from 'vitest';
import * as anatomyModule from '../src/game/creature-anatomy';
import { functionalProfile } from '../src/game/genome';
import { locomotionProfile } from '../src/game/physiology';
import { quoteJourneyEvolution } from '../src/game/journey-evolution';
import { createOrganism } from '../src/render/organism';
import { sampleCreaturePose } from '../src/game/creature-motion';
it('shares one real anatomy derivation across pricing, stats, motion, model, pose and handles per content revision',()=>{
 const spy=vi.spyOn(anatomyModule,'resolveCreatureAnatomy');try{
  const g=creatureBodyFixture('biped'),preview=createCreaturePreviewCache(),p=preview(g),game=createGame(67);game.stage=2;
  functionalProfile(p.genome,p.anatomy);locomotionProfile(p.genome,2,false,p.anatomy);quoteJourneyEvolution(game,p.genome,p.anatomy);const model=createOrganism(p.genome,p.anatomy);sampleCreaturePose(g,{time:0,speed:0,airborne:false,feeding:0,communication:0,position:{x:0,y:0,z:0},heading:0,groundAt:()=>-p.anatomy!.groundClearance},p.anatomy);creatureHandleDescriptors(g,p.anatomy);expect(spy).toHaveBeenCalledTimes(1);disposeObject(model);
  expect(preview(g)).toBe(p);expect(spy).toHaveBeenCalledTimes(1);g.body.spine[3].bend=.2;preview(g);expect(spy).toHaveBeenCalledTimes(2);
 }finally{spy.mockRestore();}
});


describe('selection across restored drafts',()=>{
 it('selects a nearest surviving spine after insertion undo and keeps a valid selection on redo',()=>{
  const g=creatureBodyFixture('biped'),s=state(g),ids=createCreatureIds();let inserted='';
  editCreatureSkeleton(s,g=>{inserted=insertCreatureSpine(g,g.body.spine[3].id,ids)!;s.selection={kind:'spine',nodeId:inserted};});
  undoCreatureEdit(s);expect(s.selection).toEqual({kind:'spine',nodeId:g.body.spine[4].id});
  redoCreatureEdit(s);expect(s.draft.version===2&&s.draft.body.spine.some(n=>s.selection?.kind==='spine'&&n.id===s.selection.nodeId)).toBe(true);
  expect(s.draft.version===2&&s.draft.body.spine.some(n=>n.id===inserted)).toBe(true);
  editCreatureSkeleton(s,g=>{removeCreatureSpine(g,inserted);});undoCreatureEdit(s);s.selection={kind:'spine',nodeId:inserted};redoCreatureEdit(s);expect(s.selection).toEqual({kind:'spine',nodeId:g.body.spine[4].id});
  beginCreatureEdit(s);if(s.draft.version!==2)throw Error();const cancelled=insertCreatureSpine(s.draft,g.body.spine[3].id,ids)!;s.selection={kind:'spine',nodeId:cancelled};finishCreatureEdit(s,true);expect(s.selection).toEqual({kind:'spine',nodeId:g.body.spine[4].id});
 });
 it('selects a surviving joint after insertion undo, redo removal and cancelled insertion',()=>{
  const s=state(),ids=createCreatureIds(),partId=s.draft.parts[2].id,jointId=s.draft.parts[2].limb!.joints[0].id;
  const insert=()=>editCreatureSkeleton(s,g=>{const p=g.parts.find(p=>p.id===partId)!;s.selection={kind:'joint',partId,jointId:insertCreatureJoint(p,jointId,ids,g)!};});
  insert();undoCreatureEdit(s);expect(s.selection).toEqual({kind:'joint',partId,jointId});redoCreatureEdit(s);expect(s.selection).toEqual({kind:'joint',partId,jointId});
  const inserted=s.draft.parts[2].limb!.joints[0].id;editCreatureSkeleton(s,g=>{removeCreatureJoint(g.parts[2],inserted);});undoCreatureEdit(s);s.selection={kind:'joint',partId,jointId:inserted};redoCreatureEdit(s);expect(s.selection).toEqual({kind:'joint',partId,jointId});
  beginCreatureEdit(s);const p=s.draft.parts[2];s.selection={kind:'joint',partId,jointId:insertCreatureJoint(p,jointId,ids,s.draft)!};finishCreatureEdit(s,true);expect(s.selection).toEqual({kind:'joint',partId,jointId});
 });
 it('clears skeletal selection on exact v1 restoration and removed-part selection on cancel',()=>{
  const g:LegacyGenome={version:1,name:'old',length:1,width:1,hue:180,pattern:0,parts:[]},s=state(g),ids=createCreatureIds();
  const insert=(finish=true)=>editCreatureSkeleton(s,g=>{s.selection={kind:'spine',nodeId:insertCreatureSpine(g,g.body.spine[3].id,ids)!};},finish);
  insert();undoCreatureEdit(s);expect(s.draft).toEqual(g);expect(s.selection).toBeNull();redoCreatureEdit(s);expect(s.selection).toBeNull();undoCreatureEdit(s);insert(false);finishCreatureEdit(s,true);expect(s.draft).toEqual(g);expect(s.selection).toBeNull();
  beginCreatureEdit(s);s.draft.parts.push({id:'new',kind:'eyes',axial:0,angle:0,scale:1,mirrored:false});s.selection={kind:'part',partId:'new'};finishCreatureEdit(s,true);expect(s.selection).toBeNull();
 });
});
