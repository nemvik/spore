import * as anatomyModule from '../src/game/creature-anatomy';
import { createCreaturePreviewCache } from '../src/ui/creature-editor';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { emptyCreatureActions, creatureCommunicationPhase, creatureActionAvailability } from '../src/game/creature-actions';
import { advanceCreature, creatureSupport, type CreatureRuntime } from '../src/game/creature-motion';
import { prepareInstalledCreatureAnatomy } from '../src/game/creature-anatomy';
import { creatureCapabilities } from '../src/game/creature-capabilities';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createGame, evolve, step } from '../src/game/simulation';
import { genomeCost, initialGenome } from '../src/game/genome';
import { createWorld } from '../src/game/world';
import { groundHeight } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
const command={x:0,z:0,sprint:false,jump:false,communicate:false};
const environment={groundAt:()=>0,obstacles:[],bound:60};
describe('shared creature action execution',()=>{
 it.each(['biped','quadruped','longneck'] as const)('%s jumps once, crosses its apex and lands without a second charge',kind=>{
  const g=creatureBodyFixture(kind),a=prepareInstalledCreatureAnatomy(g),caps=creatureCapabilities(g);
  let r:CreatureRuntime={pos:{x:0,y:a.groundClearance,z:0},velocity:{x:0,y:0,z:0},heading:0,energy:20,actions:emptyCreatureActions()};const before=structuredClone(r);
  r=advanceCreature(g,r,{...command,jump:true},environment,1/60);expect(before.energy).toBe(20);expect(r.energy).toBe(15);expect(r.velocity.y).toBeCloseTo(caps.jump.velocity-16/60);expect(r.actions.jumpRecharge).toBe(1.2);
  const first=r.pos.y;let apex=first,descending=false;
  for(let i=0;i<120;i++){r=advanceCreature(g,r,{...command,jump:i===1},environment,1/60);apex=Math.max(apex,r.pos.y);descending ||= r.velocity.y<0;}
  expect(apex).toBeGreaterThan(first);expect(descending).toBe(true);expect(r.pos.y).toBeCloseTo(a.groundClearance);expect(r.energy).toBe(15);expect(creatureSupport(g,r,environment).grounded).toBe(true);
 });
 it('rejects unsupported, exhausted, recharging and footless jumps without charging',()=>{
  for(const reason of ['air','energy','recharge','feet']){const g=creatureBodyFixture('biped');if(reason==='feet')g.parts=g.parts.filter(p=>p.kind!=='legs');const a=prepareInstalledCreatureAnatomy(g);const r:CreatureRuntime={pos:{x:0,y:a.groundClearance+(reason==='air'?2:0),z:0},velocity:{x:0,y:0,z:0},heading:0,energy:reason==='energy'?4:20,actions:{...emptyCreatureActions(),jumpRecharge:reason==='recharge'?.5:0}};expect(advanceCreature(g,r,{...command,jump:true},environment,1/60).energy).toBe(r.energy);}
 });
 it('runs independent communication timers, serial wrap and the shared hold/fade phase',()=>{
  const g=creatureBodyFixture('biped'),a=prepareInstalledCreatureAnatomy(g);let r:CreatureRuntime={pos:{x:0,y:a.groundClearance,z:0},velocity:{x:0,y:0,z:0},heading:0,energy:20,actions:{...emptyCreatureActions(),communicationSerial:1_000_000_000}};
  r=advanceCreature(g,r,{...command,communicate:true},environment,.05);expect(r.actions).toMatchObject({communicationSerial:0,communicationTime:.8,communicationRecharge:2});expect(r.energy).toBe(20);
  r=advanceCreature(g,r,{...command,communicate:true},environment,.05);expect(r.actions.communicationTime).toBe(.75);expect(r.actions.communicationSerial).toBe(0);expect(creatureCommunicationPhase(.75)).toBe(1);expect(creatureCommunicationPhase(.15)).toBe(.5);
 });
 it('caps the step at .05 and does not mutate frozen runtime/anatomy',()=>{
  const g=creatureBodyFixture('biped'),a=prepareInstalledCreatureAnatomy(g),r:CreatureRuntime={pos:{x:0,y:a.groundClearance,z:0},velocity:{x:0,y:0,z:0},heading:0,energy:20,actions:emptyCreatureActions()};Object.freeze(r.pos);Object.freeze(r.velocity);Object.freeze(r.actions);Object.freeze(r);
  expect(advanceCreature(g,r,{...command,jump:true},environment,2)).toEqual(advanceCreature(g,r,{...command,jump:true},environment,.05));
 });
 it('continues the complete saved world for 120 ticks midway through jump and communication',()=>{
  const s=parseGame(readFileSync('tests/fixtures/saves/won-current-coast.fixture.json','utf8')),g=creatureBodyFixture('biped');g.parts.push({id:'bond',kind:'symbiote',axial:0,angle:0,scale:1,mirrored:false});s.player.totalDna=500;s.player.dna=genomeCost(initialGenome())+500-genomeCost(s.player.genome);s.player.pos={...s.world.landmarks.find(l=>l.kind==='nest')!.pos};expect(evolve(s,g).ok).toBe(true);
  s.campaign.sandbox=true;step(s,EMPTY_INPUT);step(s,{...EMPTY_INPUT,jump:true,communicate:true});for(let i=0;i<8;i++)step(s,EMPTY_INPUT);expect(s.player.velocity.y).toBeGreaterThan(0);const loaded=parseGame(serializeGame(s));
  for(let i=0;i<120;i++){const input={...EMPTY_INPUT,x:.2,z:.4};step(s,input);step(loaded,input);expect(loaded).toEqual(s);}
  expect(loaded.player.creatureActions!.communicationSerial).toBe(1);
 });
});

it('exposes structural and transient action reasons without using bite/pulse cooldown',()=>{
 const g=creatureBodyFixture('biped'),caps=creatureCapabilities(g),a=emptyCreatureActions();
 expect(creatureActionAvailability(caps,a,5,true)).toEqual({jump:null,communicate:null});
 expect(creatureActionAvailability(caps,a,4,true).jump).toBe('energy');expect(creatureActionAvailability(caps,a,10,false).jump).toBe('support');
 expect(creatureActionAvailability(caps,{...a,jumpRecharge:.1},10,true)).toEqual({jump:'recharge',communicate:null});
 expect(creatureActionAvailability(caps,{...a,communicationRecharge:.1},10,true)).toEqual({jump:null,communicate:'recharge'});
 g.parts=[];expect(creatureActionAvailability(creatureCapabilities(g),a,10,true)).toEqual({jump:'structure',communicate:'structure'});
});
it.each([false,true])('keeps V2 communication independent of existing feed/pulse phase order (legacy=%s)',legacy=>{
 const s=createGame(932,legacy),g=creatureBodyFixture('biped');g.parts.push({id:'sonar',kind:'sonar',axial:0,angle:0,scale:1,mirrored:false});const a=prepareInstalledCreatureAnatomy(g);
 s.stage=2;s.world=createWorld(932,2);s.world.obstacles=[];s.world.creatures=[];s.world.resources=[];s.player.genome=g;s.player.creatureActions=emptyCreatureActions();s.player.energy=80;s.player.pos={x:0,y:groundHeight(0,0,2)+a.groundClearance,z:0};
 const other=structuredClone(s);step(s,{...EMPTY_INPUT,feed:true,pulse:true,communicate:true});step(other,{...EMPTY_INPUT,feed:true,pulse:true});
 expect(s.player.creatureActions!.communicationSerial).toBe(1);s.player.creatureActions=other.player.creatureActions;expect(s).toEqual(other);
});
it('charges sprint physiology only once and charges jumping independently',()=>{
 const s=createGame(932,true),g=creatureBodyFixture('biped'),a=prepareInstalledCreatureAnatomy(g);s.stage=2;s.world=createWorld(932,2);s.world.obstacles=[];s.world.creatures=[];s.world.resources=[];s.player.genome=g;s.player.creatureActions=emptyCreatureActions();s.player.energy=80;s.player.pos={x:0,y:groundHeight(0,0,2)+a.groundClearance,z:0};step(s,EMPTY_INPUT);
 const sprint=structuredClone(s),jump=structuredClone(s);step(s,{...EMPTY_INPUT,z:1});step(sprint,{...EMPTY_INPUT,z:1,sprint:true});step(jump,{...EMPTY_INPUT,z:1,sprint:true,jump:true});
 expect(s.player.energy-sprint.player.energy).toBeCloseTo(.7/60,10);expect(sprint.player.energy-jump.player.energy).toBeCloseTo(5,10);
});

it('uses the detached preview revision anatomy without registering or deriving each step',()=>{
 const g=creatureBodyFixture('biped'),snapshot=createCreaturePreviewCache()(g),before=structuredClone(snapshot.genome);
 const r:CreatureRuntime={pos:{x:0,y:snapshot.anatomy!.groundClearance,z:0},velocity:{x:0,y:0,z:0},heading:0,energy:20,actions:emptyCreatureActions()};
 const spy=vi.spyOn(anatomyModule,'resolveCreatureAnatomy');try{
  advanceCreature(g,r,command,environment,1/60,snapshot.anatomy);
  advanceCreature(g,r,command,environment,1/60,snapshot.anatomy);
  expect(spy).not.toHaveBeenCalled();expect(snapshot.genome).toEqual(before);expect(Object.isFrozen(g)).toBe(false);
 }finally{spy.mockRestore();}
});
