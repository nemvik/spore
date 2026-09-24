import { describe, it, expect } from 'vitest';
import { chiefGame } from './fixtures/chief';
import * as C from '../src/game/tribe-chief';
import { issueTribeOrder, stopTribeUnits, equipTribeUnits, stepTribe, buildTribeHut } from '../src/game/tribe';
import { startMusic } from '../src/game/tribe-music';
import { startDomestication, stepDomestication, assignAnimalCaretaker } from '../src/game/tribe-domestication';
import { spawnCreature } from '../src/game/world';
import { step, continueToMachinesEra } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';
import { quoteOutfit } from '../src/game/culture';

function elected(){const g=chiefGame();expect(C.electChief(g.s,[g.u.id]).ok).toBe(true);return g;}
function speaking(){const g=elected();expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(true);g.u.pos={...g.n.society!.members[0].pos,x:18};C.stepChief(g.s,.1);expect(g.t.chief!.active!.phase).toBe('speak');return g;}
describe('chief as a role of an existing member',()=>{
 it('elects explicitly without spawning, paying or changing body and equipment',()=>{
  const g=chiefGame(),before=structuredClone(g.t.members),genome=structuredClone(g.s.player.genome),food=g.t.food;
  expect(C.quoteChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(false);
  expect(C.electChief(g.s,[g.u.id]).ok).toBe(true);expect(C.chiefMember(g.s)).toBe(g.u);
  expect(g.t.members).toEqual(before);expect(g.s.player.genome).toEqual(genome);expect(g.t.food).toBe(food);
 });
 it('rejects a symbiont, distant/busy/hungry candidate and election through a rock atomically',()=>{
  const g=chiefGame(),sym=g.t.members.find(u=>u.species)!;
  expect(C.electChief(g.s,[sym.id]).ok).toBe(false);g.u.pos.x=50;expect(C.electChief(g.s,[g.u.id]).ok).toBe(false);
  g.u.pos.x=0;g.u.hunger=70;expect(C.electChief(g.s,[g.u.id]).ok).toBe(false);g.u.hunger=0;
  g.u.orders=[{unit:g.u.id,kind:'move',target:{kind:'point',pos:g.n.pos}}];expect(C.electChief(g.s,[g.u.id]).ok).toBe(false);g.u.orders=[];
  g.s.world.obstacles=[{id:999,kind:'rock',radius:.4,height:4,pos:{x:0,y:0,z:1}}];expect(C.electChief(g.s,[g.u.id]).ok).toBe(false);expect(g.t.chief).toBeUndefined();
 });
 it('mere presence does nothing; launching pays once and only completed physical speech changes relation',()=>{
  const g=elected(),food=g.t.food;g.u.pos={...g.n.pos};C.stepChief(g.s,7);expect(g.n.relation).toBe(30);
  expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(true);expect(g.t.food).toBe(food-8);
  expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(false);C.stepChief(g.s,.1);C.stepChief(g.s,5);expect(g.n.relation).toBe(30);
  C.stepChief(g.s,1);expect(g.n.relation).toBe(55);expect(g.n.society!.truce).toBe(45);expect(g.t.chief!.cooldown).toBe(60);
  C.stepChief(g.s,1);expect(g.n.relation).toBe(55);expect(g.t.food).toBe(food-8);
 });
 it('walks around a real obstacle to the real host before succeeding',()=>{
  const g=elected();g.s.world.obstacles=[{id:999,kind:'rock',radius:2,height:5,pos:{x:10,y:0,z:0}}];
  expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(true);
  for(let i=0;i<2400&&g.t.chief!.active;i++){stepTribe(g.s,1/60);expect(Math.hypot(g.u.pos.x-10,g.u.pos.z)).toBeGreaterThanOrEqual(2.7);}
  expect(g.t.chief!.result!.reason).toBe('success');expect(g.n.relation).toBe(55);
 });
 it('does not speak through a rock and times out without reward',()=>{
  const g=elected();g.u.pos={...g.n.pos,x:17};g.s.world.obstacles=[{id:999,kind:'rock',radius:.5,height:5,pos:{...g.n.pos,x:18.5}}];
  C.startChiefCouncil(g.s,[g.u.id],g.n.id);C.stepChief(g.s,90);expect(g.t.chief!.result!.reason).toBe('timeout');expect(g.n.relation).toBe(30);
 });
 it('pauses on lost contact, resumes within grace, then fails at the limit',()=>{
  const g=speaking();C.stepChief(g.s,2);g.u.pos.x=40;C.stepChief(g.s,2);expect(g.t.chief!.active!.remaining).toBe(4);
  g.u.pos.x=18;C.stepChief(g.s,1);expect(g.t.chief!.active!.remaining).toBe(3);g.u.pos.x=40;C.stepChief(g.s,3);
  expect(g.t.chief!.result!.reason).toBe('contact');expect(g.n.relation).toBe(30);
 });
 it.each(['move','append','stop'] as const)('ordinary %s interrupts without refund and preserves the new order',kind=>{
  const g=speaking(),stock=g.t.food;
  if(kind==='stop')stopTribeUnits(g.s,[g.u.id]);else issueTribeOrder(g.s,[g.u.id],'move',{kind:'point',pos:g.t.huts[0].pos},kind==='append');
  expect(g.t.chief!.active).toBeNull();expect(g.t.chief!.result!.reason).toBe('cancelled');expect(g.t.food).toBe(stock);expect(g.n.relation).toBe(30);
  expect(g.u.orders).toHaveLength(kind==='stop'?0:1);
 });
 it('excludes music, construction, outfits, tools and animal care from the occupied chief',()=>{
  const g=speaking();g.t.unlocked.push('spear');
  expect(equipTribeUnits(g.s,[g.u.id],'spear').ok).toBe(false);
  expect(startMusic(g.s,[g.u.id],g.t.neighbours[1].id).ok).toBe(false);
  expect(startMusic(g.s,[g.other.id],g.n.id).ok).toBe(false);
  const c=spawnCreature(g.s.world,'bell',0);c.fear=0;g.s.world.creatures.push(c);expect(startDomestication(g.s,[g.u.id],c.id).ok).toBe(false);
  expect(buildTribeHut(g.s,'shelter',null,{...g.t.huts[0].pos,x:10},[g.u.id]).ok).toBe(false);
  expect(quoteOutfit(g.s,[g.u.id],null).ok).toBe(false);
 });
 it('suppresses ordinary diplomacy at the same neighbour while other members can still move',()=>{
  const g=speaking();g.other.pos={...g.n.pos};g.n.tribute=8;
  issueTribeOrder(g.s,[g.other.id],'socialize',{kind:'neighbour',id:g.n.id});stepTribe(g.s,1);
  expect(g.n.relation).toBe(30);expect(g.t.chief!.active).not.toBeNull();
 });
 it('new attack on the host tribe cancels before any speech reward',()=>{
  const g=speaking();issueTribeOrder(g.s,[g.other.id],'attack',{kind:'neighbour',id:g.n.id});C.stepChief(g.s,6);
  expect(g.t.chief!.result!.reason).toBe('conflict');expect(g.n.relation).toBe(30);
 });
 it('real wildlife damage interrupts in the full simulation',()=>{
  const g=speaking(),p=spawnCreature(g.s.world,'crest',0);Object.assign(p,{pos:{...g.u.pos},target:null,intent:'hunt',hunger:80,cooldown:0});g.s.world.creatures.push(p);g.s.tick=1;
  const health=g.u.health;step(g.s,EMPTY_INPUT,1/60);expect(g.u.health).toBeLessThan(health);expect(g.t.chief!.result!.reason).toBe('attack');expect(g.n.relation).toBe(30);
 });
 it('a real strike from another society interrupts before the completion reward',()=>{
  const g=speaking(),other=g.t.neighbours[1],raider=other.society!.members[0];g.t.chief!.active!.remaining=.001;
  other.society!.food=0;other.society!.truce=0;other.relation=-35;other.society!.expedition={phase:'outbound',members:[raider.id],time:0};
  raider.pos={...g.u.pos};raider.cooldown=0;step(g.s,EMPTY_INPUT,1/60);
  expect(g.u.health).toBeLessThan(100);expect(g.t.chief!.active).toBeNull();expect(g.t.chief!.result!.reason).toBe('attack');expect(g.n.relation).toBe(30);
 });
 it.each(['member','host'] as const)('lost %s cancels; member loss leaves a vacant role without a new unit',what=>{
  const g=speaking();if(what==='member')g.t.members=g.t.members.filter(u=>u!==g.u);else g.n.society!.members=[];
  C.stepChief(g.s,6);expect(g.t.chief!.active).toBeNull();expect(g.t.chief!.result!.reason).toBe(what==='member'?'lost-member':'host-lost');expect(g.n.relation).toBe(30);
  if(what==='member'){expect(g.t.chief!.member).toBeNull();expect(C.electChief(g.s,[g.other.id]).ok).toBe(true);expect(g.t.chief!.cooldown).toBe(60);expect(g.t.members.some(u=>u.id===g.u.id)).toBe(false);}
 });
 it('replacement retains shared cooldown and cannot inherit an active speech',()=>{
  const g=speaking();expect(C.electChief(g.s,[g.other.id]).ok).toBe(false);C.cancelChiefCouncil(g.s);g.u.pos={...g.t.huts[0].pos};
  expect(C.electChief(g.s,[g.other.id]).ok).toBe(true);expect(g.t.chief!.cooldown).toBe(60);expect(C.startChiefCouncil(g.s,[g.other.id],g.n.id).ok).toBe(false);
  C.stepChief(g.s,60);expect(C.startChiefCouncil(g.s,[g.other.id],g.n.id).ok).toBe(true);
 });
 it('awards an alliance only once and recalls the real expedition',()=>{
  const g=speaking();g.n.relation=90;g.n.society!.expedition={phase:'outbound',members:[g.n.society!.members[1].id],time:2};const stock=g.t.food;
  C.stepChief(g.s,6);expect(g.n.resolved).toBe('allied');expect(g.t.food).toBe(stock+8);expect(g.n.society!.expedition!.phase).toBe('return');
  C.stepChief(g.s,60);expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(false);expect(g.t.food).toBe(stock+8);
 });
 it('stage transition terminates the speech without inventing civilizational inheritance',()=>{
  const g=speaking();g.t.neighbours.forEach(n=>{n.resolved='allied';n.relation=100;});g.t.completed=true;
  expect(continueToMachinesEra(g.s)).toBe(true);expect(g.t.chief!.active).toBeNull();expect(g.t.chief!.result!.reason).toBe('stage');expect(g.s.machines!.version===2&&g.s.machines!.archetype).toBe(g.t.legacyAbility);
 });
 it('requires explicit care handoff and lets the new caretaker keep feeding during the speech',()=>{
  const g=elected(),c=spawnCreature(g.s.world,'bell',0);Object.assign(c,{pos:{...g.u.pos,x:3},hunger:20,fear:0});g.s.world.creatures.push(c);
  expect(startDomestication(g.s,[g.u.id],c.id).ok).toBe(true);expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(false);
  stepDomestication(g.s,.1);stepDomestication(g.s,8);stepDomestication(g.s,.1);expect(g.t.domestication!.animals).toHaveLength(1);
  expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(false);expect(assignAnimalCaretaker(g.s,c.id,[g.other.id]).ok).toBe(true);
  expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(true);expect(assignAnimalCaretaker(g.s,c.id,[g.u.id]).ok).toBe(false);
  g.u.pos={...g.n.pos};C.stepChief(g.s,.1);c.hunger=40;const stock=g.t.food;stepDomestication(g.s,.1);expect(c.hunger).toBeLessThan(10);expect(g.t.food).toBe(stock-3);expect(g.t.chief!.active!.phase).toBe('speak');
 });
 it.each(['food','hunger','health','cargo'] as const)('refuses unavailable %s without spending or creating cooldown',what=>{
  const g=elected();if(what==='food')g.t.food=7;if(what==='hunger')g.u.hunger=65;if(what==='health')g.u.health=34;if(what==='cargo')g.u.cargo=1;
  const before=structuredClone(g.t);expect(C.startChiefCouncil(g.s,[g.u.id],g.n.id).ok).toBe(false);expect(g.t).toEqual(before);
 });
 it('stops on fatigue before reward and lets ordinary survival movement resume',()=>{
  const g=speaking();g.u.hunger=65;C.stepChief(g.s,6);expect(g.t.chief!.result!.reason).toBe('exhausted');expect(g.n.relation).toBe(30);
  g.u.hunger=70;const x=g.u.pos.x;stepTribe(g.s,1);expect(g.u.pos.x).toBeLessThan(x);
 });
});
