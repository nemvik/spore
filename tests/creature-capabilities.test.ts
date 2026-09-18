import { groundHeight } from '../src/game/random';
import type * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { creatureCapabilities, queryCreatureBite } from '../src/game/creature-capabilities';
import { locomotionProfile } from '../src/game/physiology';
import { computeStats } from '../src/game/genome';
import { jawContacts } from '../src/game/anatomy';
import { mouthWorldPosition } from '../src/game/locomotion';
import { createCreaturePreviewCache } from '../src/ui/creature-editor';
import { feedTarget } from '../src/game/interactions';
import { createGame, statsFor, step } from '../src/game/simulation';
import { spawnCreature, createWorld } from '../src/game/world';
import { EMPTY_INPUT } from '../src/game/types';
import { creatureMouths, resolveCreatureAnatomy } from '../src/game/creature-anatomy';
import { createOrganism, animateOrganism, disposeObject } from '../src/render/organism';
import { bodyCollisionRadius } from '../src/game/body-shape';
import { organismGroundClearance } from '../src/game/anatomy';
import * as anatomyModule from '../src/game/creature-anatomy';
import { creatureAbilityRows } from '../src/ui/creature-editor';
import { initialGenome } from '../src/game/genome';
import { sampleCreaturePose } from '../src/game/creature-motion';

describe('constructed capabilities', () => {
 it('shares walking values with physiology, including legacy campaigns carrying v2', () => {
  const g=creatureBodyFixture('quadruped'),c=creatureCapabilities(g);
  for(const legacy of [false,true]) {const p=locomotionProfile(g,2,legacy);expect(p.speed).toBe(c.walk.speed);expect(p.turnRate).toBe(c.walk.turnRate);}
  expect(c.walk.enabled).toBe(true);expect(c.jump.enabled).toBe(true);
 });
 it('needs two reachable feet; arms and empty leg ends cannot walk', () => {
  const g=creatureBodyFixture('biped');g.parts=g.parts.filter(p=>p.kind!=='legs');expect(creatureCapabilities(g).walk.speed).toBe(0);
  const leg=creatureBodyFixture('biped').parts.find(p=>p.kind==='legs')!;g.parts.push(leg);leg.mirrored=false;expect(creatureCapabilities(g).walk.enabled).toBe(false);
  leg.mirrored=true;expect(creatureCapabilities(g).walk.enabled).toBe(true);leg.limb!.end={kind:'none'};expect(creatureCapabilities(g).jump.enabled).toBe(false);
 });
 it('derives stride from scaled bone lengths and load from real mass', () => {
  const g=creatureBodyFixture('biped'),base=creatureCapabilities(g);for(const p of g.parts.filter(p=>p.kind==='legs'))for(const j of p.limb!.joints){j.offset.x*=1.15;j.offset.y*=1.15;j.offset.z*=1.15;}
  const long=creatureCapabilities(g);expect(long.walk.stride).toBeGreaterThan(base.walk.stride);expect(long.walk.speed).toBeGreaterThan(base.walk.speed);
  g.parts.push({id:'shell',kind:'shell',scale:1.6,axial:0,angle:0,mirrored:true});expect(creatureCapabilities(g).walk.speed).toBeLessThan(long.walk.speed);
 });
 it('weights terminal bonuses once per physical foot', () => {
  const g=creatureBodyFixture('quadruped'),pad=creatureCapabilities(g);for(const p of g.parts.filter(p=>p.kind==='legs'))p.limb!.end={kind:'foot',style:'claw',scale:1};
  const claw=creatureCapabilities(g);expect(claw.walk.steeringGrip/pad.walk.steeringGrip).toBeCloseTo(1.1);expect(pad.jump.velocity/claw.jump.velocity).toBeCloseTo(1.05);
  g.parts.find(p=>p.kind==='legs')!.limb!.end={kind:'foot',style:'pad',scale:1};const mixed=creatureCapabilities(g);expect(mixed.walk.steeringGrip/pad.walk.steeringGrip).toBeCloseTo(1.05);expect(mixed.jump.velocity/claw.jump.velocity).toBeCloseTo(1.025);
 });
 it('uses exact action constants and diminishing jaw damage', () => {
  const g=creatureBodyFixture('biped'),one=creatureCapabilities(g);expect(one.bite).toMatchObject({damage:computeStats(g).damage,energy:1.6,duration:.5,recharge:.65});expect(one.jump).toMatchObject({energy:5,recharge:1.2});
  const jaw=g.parts.find(p=>p.kind==='jaw')!;g.parts.push({...jaw,id:'jaw2'});const two=computeStats(g).damage;g.parts.push({...jaw,id:'jaw3'});expect(computeStats(g).damage-two).toBeLessThan(two-one.bite.damage);
  g.parts=g.parts.filter(p=>p.kind!=='jaw');expect(creatureCapabilities(g).bite.enabled).toBe(false);
 });
 it('rotates actual jaw contacts, excludes proboscis reach and chooses an unblocked jaw', () => {
  const g=creatureBodyFixture('biped'),position={x:4,y:2,z:-3},heading=Math.PI/2,origin=mouthWorldPosition(jawContacts(g)[0],position,heading),target={pos:origin,radius:.2};
  expect(queryCreatureBite(g,position,heading,target,()=>false).ready).toBe(true);
  const jaw=g.parts.find(p=>p.kind==='jaw')!;jaw.axial=-.9;expect(queryCreatureBite(g,position,heading,target,()=>false).reason).toBe('distance');
  g.parts.push({...jaw,id:'sosna',kind:'proboscis',axial:.9,scale:1.65});expect(queryCreatureBite(g,position,heading,target,()=>false).reason).toBe('distance');
  g.parts.push({...jaw,id:'jaw2',axial:.82});expect(queryCreatureBite(g,position,heading,target,from=>from.z>origin.z+.1).ready).toBe(true);
  expect(queryCreatureBite(g,position,heading,target,()=>true).reason).toBe('blocked');
 });
 it('communicates with mouths or real hands and refreshes mutable drafts', () => {
  const g=creatureBodyFixture('biped');expect(creatureCapabilities(g).communicate).toMatchObject({mode:'voice',range:8,duration:.8,recharge:2});
  g.parts=g.parts.filter(p=>p.kind!=='jaw');expect(creatureCapabilities(g).communicate).toMatchObject({mode:'gesture',range:3});g.parts.find(p=>p.kind==='arms')!.limb!.end={kind:'none'};expect(creatureCapabilities(g).communicate.enabled).toBe(false);
 });
 it('includes capabilities in the same detached editor revision', () => {const g=creatureBodyFixture('biped'),cache=createCreaturePreviewCache(),a=cache(g);expect(a.capabilities).toEqual(creatureCapabilities(g));g.parts=g.parts.filter(p=>p.kind!=='legs');const b=cache(g);expect(a.capabilities!.walk.enabled).toBe(true);expect(b.capabilities!.walk.enabled).toBe(false);});
});


it('selects food from its diet-compatible mouth rather than the first mouth',()=>{
 const s=createGame(92),g=creatureBodyFixture('biped');s.player.genome=g;s.player.heading=0;s.world.obstacles=[];s.world.resources=[];s.world.creatures=[];
 g.parts.push({id:'nectar-mouth',kind:'proboscis',axial:-.9,angle:0,scale:1.6,mirrored:false});
 const nose=creatureMouths(g).find(m=>m.diet.includes('nectar'))!,origin=mouthWorldPosition(nose,s.player.pos,s.player.heading);
 const food={id:999,kind:'nectar' as const,pos:{...origin,z:origin.z-5},amount:3,max:3,regen:0,patch:0};s.world.resources.push(food);
 expect(feedTarget(s,{kind:'food',id:999,stage:s.stage})).toMatchObject({ready:true});expect(feedTarget(s)).toMatchObject({id:999,ready:true});
 food.kind='meat' as 'nectar';expect(feedTarget(s,{kind:'food',id:999,stage:s.stage})?.ready).toBe(false);
 g.parts=g.parts.filter(p=>!['jaw','proboscis'].includes(p.kind));expect(feedTarget(s,{kind:'food',id:999,stage:s.stage})).toMatchObject({reason:'mouth'});
});
it('applies one actual hit and energy charge with three overlapping jaws',()=>{
 const s=createGame(93,true),g=creatureBodyFixture('biped');s.stage=2;s.world=createWorld(93,2);s.player.pos={x:0,y:groundHeight(0,0,2)+organismGroundClearance(g),z:0};const jaw=g.parts.find(p=>p.kind==='jaw')!;g.parts.push({...jaw,id:'jaw2'},{...jaw,id:'jaw3'});s.player.genome=g;s.world.obstacles=[];s.world.creatures=[];s.world.resources=[];s.player.energy=80;
 const c=spawnCreature(s.world,'bell',0);c.pos=mouthWorldPosition(jawContacts(g)[0],s.player.pos,s.player.heading);c.health=200;s.world.creatures.push(c);
 const selection={kind:'creature' as const,id:c.id,stage:s.stage};expect(feedTarget(s,selection)?.ready).toBe(true);const damage=computeStats(g).damage;
 step(s,{...EMPTY_INPUT,feed:true,feedSelection:selection});expect(c.health).toBe(200-damage);expect(s.player.energy).toBeCloseTo(78.4,1);expect(s.player.cooldown).toBe(.65);
});
it('reuses installed immutable anatomy while mutable pure calls remain fresh',()=>{
 const g=creatureBodyFixture('biped'),draft=structuredClone(g);statsFor(g);const a=resolveCreatureAnatomy(g);expect(resolveCreatureAnatomy(g)).toBe(a);
 expect(Object.isFrozen(g.parts[0])).toBe(true);expect(bodyCollisionRadius(g,2)).toBe(Math.max(.6,Math.abs(a.bounds.min.x),Math.abs(a.bounds.max.x)));expect(organismGroundClearance(g)).toBe(a.groundClearance);
 const before=resolveCreatureAnatomy(draft);draft.parts.find(p=>p.kind==='legs')!.scale=1.2;expect(resolveCreatureAnatomy(draft)).not.toEqual(before);
 const replacement=structuredClone(g);statsFor(replacement);expect(resolveCreatureAnatomy(replacement)).not.toBe(a);
});
it('poses the model from its stored anatomy without resolving again',()=>{
 const g=creatureBodyFixture('biped'),model=createOrganism(g);const spy=vi.spyOn(anatomyModule,'resolveCreatureAnatomy');try {animateOrganism(model,1,2,0,2,0);animateOrganism(model,2,2,0,2,0);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();disposeObject(model);}
});

it('compares actual v1 performance without silently upgrading the original',()=>{
 const old=initialGenome(),g=creatureBodyFixture('biped'),preview=createCreaturePreviewCache()(g),rows=creatureAbilityRows(preview,old,true);
 expect(rows[0].previous).toBe(locomotionProfile(old,2,true).speed);expect(rows[0].value).toBe(preview.capabilities!.walk.speed);expect(rows[1].previous).toBe(0);expect(rows[2].previous).toBe(0);expect(rows[3].previous).toBe(0);
 const legacy=createCreaturePreviewCache()(old);expect(creatureAbilityRows(legacy,old,true).map(r=>r.key)).toEqual(['walk','bite']);
});
it('keeps preview snapshots unregistered and original runtime genomes protected deeply',()=>{
 const g=creatureBodyFixture('biped');statsFor(g);expect(Object.isFrozen(g.body.spine[0])).toBe(true);expect(Object.isFrozen(g.parts.find(p=>p.limb)!.limb!.joints[0].offset)).toBe(true);
 const draft=structuredClone(g),preview=createCreaturePreviewCache()(draft);expect(Object.isFrozen(draft)).toBe(false);expect(Object.isFrozen(preview.genome)).toBe(false);
 const before=computeStats(draft).mass,cap=creatureCapabilities(draft).walk.speed;draft.parts.push({id:'load',kind:'shell',scale:1.6,mirrored:true,axial:0,angle:0});expect(computeStats(draft).mass).toBeGreaterThan(before);expect(creatureCapabilities(draft).walk.speed).toBeLessThan(cap);
});

it('gestures only with real hands and scales their visible motion',()=>{
 const input={time:0,speed:0,airborne:false,feeding:0,communication:1,position:{x:0,y:1.2,z:0},heading:0,groundAt:()=>0};
 const g=creatureBodyFixture('biped'),arm=g.parts.find(p=>p.kind==='arms')!,rest=sampleCreaturePose(g,{...input,communication:0});
 const small=sampleCreaturePose(g,input);arm.limb!.end={kind:'hand',style:'palm',scale:1.6};const large=sampleCreaturePose(g,input);
 expect(large.limbs[2].points.at(-1)!.y-rest.limbs[2].points.at(-1)!.y).toBeGreaterThan(small.limbs[2].points.at(-1)!.y-rest.limbs[2].points.at(-1)!.y);
 arm.limb!.end={kind:'none'};expect(sampleCreaturePose(g,input).limbs[2].points).toEqual(sampleCreaturePose(g,{...input,communication:0}).limbs[2].points);
});
it.each(['palm','pincer'] as const)('animates and resets the %s terminal from the shared communication phase',style=>{
 const g=creatureBodyFixture('biped');g.parts.find(p=>p.kind==='arms')!.limb!.end={kind:'hand',style,scale:1};const model=createOrganism(g);
 try{const end=model.userData.creatureLimbs[2].userData.end,initial=end.children.map((n:{rotation:{z:number}})=>n.rotation.z);
  const spread=()=>{const tips=end.children.filter((n:THREE.Object3D)=>n.userData.finger!==undefined).map((n:THREE.Object3D)=>n.position.x+Math.sin(n.rotation.z)*n.scale.y);return Math.max(...tips)-Math.min(...tips);},before=spread();
  animateOrganism(model,0,0,0,2,0,0,undefined,{communication:1});if(style==='palm')expect(spread()).toBeGreaterThan(before);else expect(spread()).toBeLessThan(before);
  animateOrganism(model,0,0,0,2,0,0,undefined,{communication:0});expect(end.children.map((n:{rotation:{z:number}})=>n.rotation.z)).toEqual(initial);
 }finally{disposeObject(model);}
});
it('gestures with hands even while an incomplete draft cannot stand',()=>{
 const g=creatureBodyFixture('biped');g.parts=g.parts.filter(p=>p.kind!=='legs');const input={time:0,speed:0,airborne:false,feeding:0,communication:0,position:{x:0,y:1,z:0},heading:0,groundAt:()=>0};
 expect(creatureCapabilities(g).walk.enabled).toBe(false);expect(sampleCreaturePose(g,{...input,communication:1}).limbs[0].points).not.toEqual(sampleCreaturePose(g,input).limbs[0].points);
});
it('uses world mouth rays for food obstruction and still reports energy/recharge for bites',()=>{
 const s=createGame(94),g=creatureBodyFixture('biped');s.player.genome=g;s.player.heading=0;s.world.obstacles=[];s.world.resources=[];s.world.creatures=[];
 const mouth=creatureMouths(g)[0],origin=mouthWorldPosition(mouth,s.player.pos,0),food={id:999,kind:'meat' as const,pos:{...origin,z:origin.z+1},amount:3,max:3,regen:0,patch:0};s.world.resources.push(food);
 s.world.obstacles.push({id:999,kind:'rock',pos:{x:0,y:-5,z:s.player.pos.z+.5},radius:.1,height:15});expect(feedTarget(s,{kind:'food',id:999,stage:s.stage})?.ready).toBe(true);
 s.world.obstacles[0].pos.z=origin.z+.5;expect(feedTarget(s,{kind:'food',id:999,stage:s.stage})?.reason).toBe('blocked');
 s.world.obstacles=[];const prey=spawnCreature(s.world,'veil',0);prey.pos=mouthWorldPosition(jawContacts(g)[0],s.player.pos,0);s.world.creatures.push(prey);const selection={kind:'creature' as const,id:prey.id,stage:s.stage};
 s.player.energy=1;expect(feedTarget(s,selection)?.reason).toBe('energy');s.player.energy=80;s.player.cooldown=.4;expect(feedTarget(s,selection)?.reason).toBe('cooldown');
});
it('keeps rendered anatomy and its source genome in the same detached model snapshot',()=>{
 const g=creatureBodyFixture('biped'),model=createOrganism(g),snapshot=structuredClone(g);try{g.parts=[];expect(model.userData.creatureGenome).toEqual(snapshot);expect(()=>animateOrganism(model,1,2,0,2,0)).not.toThrow();}finally{disposeObject(model);}
});
