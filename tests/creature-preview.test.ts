import { describe, expect, it, vi } from 'vitest';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { createCreaturePreview, stepCreaturePreview, creaturePreviewTarget, PREVIEW_ENVIRONMENT } from '../src/ui/creature-preview';
import { advanceCreature, creaturePoseContext, sampleCreaturePose } from '../src/game/creature-motion';
import { createCreaturePreviewCache } from '../src/ui/creature-editor';
import { creatureCapabilities, queryCreatureBite } from '../src/game/creature-capabilities';
import { createGame } from '../src/game/simulation';
import * as anatomy from '../src/game/creature-anatomy';
const idle={x:0,z:0,sprint:false,jump:false,communicate:false,attack:false};
describe('isolated creature preview',()=>{
 it.each(['biped','quadruped','longneck'] as const)('%s matches 180 shared world-runtime steps and joints on level ground',kind=>{
  const g=creatureBodyFixture(kind),a=anatomy.resolveCreatureAnatomy(g);let p=createCreaturePreview(g,a),r=structuredClone(p.runtime);
  expect(p.runtime).toMatchObject({pos:{x:0,y:a.groundClearance,z:0},energy:100,velocity:{x:0,y:0,z:0}});
  // Both consumers here receive the same external physiology (none); world
  // beginStep metabolism/movement fees remain outside advanceCreature exactly once.
  for(let i=0;i<180;i++){
   const input={...idle,z:1,jump:i===20||i===110,communicate:i===40};
   p=stepCreaturePreview(p,input,1/60,a);r=advanceCreature(g,r,input,PREVIEW_ENVIRONMENT,1/60,a);
   expect(p.runtime).toEqual(r);
   const pose=(runtime:typeof r)=>sampleCreaturePose(g,{time:p.time,speed:Math.hypot(runtime.velocity.x,runtime.velocity.z),feeding:p.feeding,...creaturePoseContext(g,runtime,PREVIEW_ENVIRONMENT,a)},a);
   expect(pose(p.runtime)).toEqual(pose(r));
  }
 });
 it('detaches genome, keeps campaign DNA/checkpoint/RNG byte-identical and shares revision anatomy',()=>{
  const campaign=createGame(481516),before=JSON.stringify(campaign),g=creatureBodyFixture('biped'),revision=createCreaturePreviewCache()(g);
  let p=createCreaturePreview(revision.genome as typeof g,revision.anatomy);const spy=vi.spyOn(anatomy,'resolveCreatureAnatomy');
  for(let i=0;i<180;i++)p=stepCreaturePreview(p,{...idle,z:1,jump:i===0,communicate:i===60,attack:i===90},1/60,revision.anatomy);
  expect(spy).not.toHaveBeenCalled();spy.mockRestore();expect(JSON.stringify(campaign)).toBe(before);
  p.genome.body.spine[0].bend=.3;expect(g.body.spine[0].bend).toBe(0);expect(revision.genome.body!.spine[0].bend).toBe(0);expect(Object.isFrozen(g)).toBe(false);
 });
 it('uses actual jaw contact, energy, recharge and feeding duration for one reachable target',()=>{
  const g=creatureBodyFixture('biped'),caps=creatureCapabilities(g);let p=createCreaturePreview(g);
  expect(queryCreatureBite(g,p.runtime.pos,0,creaturePreviewTarget(g),()=>false).ready).toBe(true);
  p=stepCreaturePreview(p,{...idle,attack:true},1/60);expect(p.feeding).toBe(caps.bite.duration);expect(p.interactionRecharge).toBe(caps.bite.recharge);expect(p.runtime.energy).toBe(100-caps.bite.energy);
  p=stepCreaturePreview(p,{...idle,attack:true},1/60);expect(p.runtime.energy).toBe(100-caps.bite.energy);
  p.runtime.pos.z=-30;p.interactionRecharge=0;p.feeding=0;const energy=p.runtime.energy;p=stepCreaturePreview(p,{...idle,attack:true},1/60);expect(p.feeding).toBe(0);expect(p.runtime.energy).toBe(energy);
 });
 it('cannot demonstrate footless jumps or filter attacks; nonpositive time freezes all state',()=>{
  const g=creatureBodyFixture('biped');g.parts=g.parts.filter(p=>p.kind!=='legs');g.parts.find(p=>p.kind==='jaw')!.kind='filter';const p=createCreaturePreview(g);
  const after=stepCreaturePreview(p,{...idle,jump:true,attack:true},1/60);expect(after.runtime.energy).toBe(100);expect(after.feeding).toBe(0);expect(after.runtime.actions.jumpRecharge).toBe(0);
  for(const dt of [0,-1,NaN])expect(stepCreaturePreview(p,{...idle,jump:true,communicate:true,attack:true},dt)).toEqual(p);
 });
});

import { CreaturePreviewSession } from '../src/ui/creature-preview';
it('preserves selection/panel state, resets changed/undone revisions, freezes inactive time and drops queued actions',()=>{
 const g=creatureBodyFixture('biped'),cache=createCreaturePreviewCache(),session=new CreaturePreviewSession();
 let revision=cache(g);session.sync(g,revision.revision,revision.anatomy!);session.advance(0,true,revision.anatomy!);session.request('walk');session.request('communicate');session.advance(100,true,revision.anatomy!);
 const running=JSON.stringify(session.preview);session.sync(g,revision.revision,revision.anatomy!);expect(JSON.stringify(session.preview)).toBe(running);
 session.request('jump');session.advance(200,false,revision.anatomy!);session.advance(20000,false,revision.anatomy!);expect(JSON.stringify(session.preview)).toBe(running);
 session.advance(20100,true,revision.anatomy!);expect(JSON.stringify(session.preview)).toBe(running);session.advance(20120,true,revision.anatomy!);expect(session.preview!.runtime.actions.jumpRecharge).toBe(0);
 const changed=structuredClone(g);changed.width=1.1;revision=cache(changed);session.sync(changed,revision.revision,revision.anatomy!);expect(session.preview!.time).toBe(0);expect(session.walking).toBe(false);expect(session.preview!.genome.width).toBe(1.1);
 revision=cache(g);session.sync(g,revision.revision,revision.anatomy!);expect(session.preview!.genome.width).toBe(1);expect(session.preview!.runtime.pos.y).toBe(revision.anatomy!.groundClearance);
 session.clear();expect(session.preview).toBeNull();
});
