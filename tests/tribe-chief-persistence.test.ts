import { describe,it,expect } from 'vitest';
import { readdirSync,readFileSync } from 'node:fs';
import { chiefGame } from './fixtures/chief';
import { electChief,startChiefCouncil,stepChief,cancelChiefCouncil } from '../src/game/tribe-chief';
import { parseGame,serializeGame } from '../src/game/persistence';
import { makeCheckpoint,recoverGeneration,continueToMachinesEra } from '../src/game/simulation';
function active(){const g=chiefGame();electChief(g.s,[g.u.id]);startChiefCouncil(g.s,[g.u.id],g.n.id);return g;}
describe('chief campaign contract',()=>{
 it.each(['elected','travel','speak','interrupted','success'] as const)('roundtrips %s and resumes exactly including the checkpoint',phase=>{
  const g=chiefGame();electChief(g.s,[g.u.id]);
  if(phase!=='elected')startChiefCouncil(g.s,[g.u.id],g.n.id);
  if(['speak','success'].includes(phase)){g.u.pos={...g.n.pos};stepChief(g.s,.1);stepChief(g.s,2);}
  if(phase==='interrupted')cancelChiefCouncil(g.s);if(phase==='success')stepChief(g.s,4);
  makeCheckpoint(g.s);const loaded=parseGame(serializeGame(g.s));expect(loaded.tribe).toEqual(g.t);
  stepChief(g.s,5);stepChief(loaded,5);expect(loaded.tribe).toEqual(g.t);
  expect(recoverGeneration(loaded).tribe).toEqual(JSON.parse(g.s.checkpoint!).tribe);
 });
 it('reload at completion applies one relationship gain and retains paid fee and cooldown',()=>{
  const g=active();g.u.pos={...g.n.pos};stepChief(g.s,.1);stepChief(g.s,5.9);
  const loaded=parseGame(serializeGame(g.s));stepChief(loaded,.2);expect(loaded.tribe!.neighbours[0].relation).toBe(55);
  const again=parseGame(serializeGame(loaded));stepChief(again,1);expect(again.tribe!.neighbours[0].relation).toBe(55);expect(again.tribe!.food).toBe(g.t.food);
 });
 it.each(['member','host'] as const)('accepts a stale %s and ends safely on the next tick',kind=>{
  const g=active();if(kind==='member')g.t.members=g.t.members.filter(u=>u!==g.u);else g.n.society!.members=g.n.society!.members.filter(u=>u.id!==g.t.chief!.active!.host);
  const loaded=parseGame(serializeGame(g.s));stepChief(loaded,.1);const c=loaded.tribe!.version===2?loaded.tribe!.chief!:null;
  expect(c!.active).toBeNull();expect(c!.result!.reason).toBe(kind==='member'?'lost-member':'host-lost');expect(()=>parseGame(serializeGame(loaded))).not.toThrow();
 });
 it.each([
  (c:any)=>c.version=2,(c:any)=>c.extra=1,(c:any)=>c.cooldown=-1,(c:any)=>c.cooldown=61,
  (c:any)=>c.active.paid=0,(c:any)=>c.active.multiplier=1.25,(c:any)=>c.active.remaining=91,
  (c:any)=>c.active.phase='dance',(c:any)=>c.active.contactLost=1,(c:any)=>c.active.member++,
  (c:any)=>c.member=null,(c:any)=>c.active.neighbour=999,(c:any)=>c.active.host=c.member,
  (c:any)=>c.cooldown=0,
 ])('rejects malformed active state without normalizing it %s',mutate=>{
  const g=active();mutate(g.t.chief);expect(()=>parseGame(serializeGame(g.s))).toThrow();
 });
 it('rejects extant reference with wrong owner and conflicting activities',()=>{
  const g=active();g.t.chief!.member=g.t.chief!.active!.member=g.t.huts[0].id;expect(()=>parseGame(serializeGame(g.s))).toThrow();
  const h=active();h.t.chief!.active!.host=h.t.neighbours[1].society!.members[0].id;expect(()=>parseGame(serializeGame(h.s))).toThrow();
  const j=active();j.t.music={version:1,active:{neighbour:j.n.id,host:j.t.chief!.active!.host,members:[j.other.id],phase:'travel',remaining:90,contactLost:0,paid:0,rounds:[]},result:null,cooldowns:[]};expect(()=>parseGame(serializeGame(j.s))).toThrow();
 });
 it('rejects forged historical rewards and active state outside tribe',()=>{
  const g=active();cancelChiefCouncil(g.s);g.t.chief!.result!.delta=25;expect(()=>parseGame(serializeGame(g.s))).toThrow();
  const h=active();h.t.neighbours.forEach(n=>{n.resolved='allied';n.relation=100;});h.t.completed=true;const e=structuredClone(h.t.chief!.active);continueToMachinesEra(h.s);
  const valid=parseGame(serializeGame(h.s));expect(valid.tribe!.version===2&&valid.tribe!.chief!.result!.reason).toBe('stage');
  h.t.chief!.active=e;h.t.chief!.result=null;expect(()=>parseGame(serializeGame(h.s))).toThrow();
 });
 it('restores the branch before the first election together with stock',()=>{
  const g=chiefGame();makeCheckpoint(g.s);const before=structuredClone(g.t);electChief(g.s,[g.u.id]);startChiefCouncil(g.s,[g.u.id],g.n.id);cancelChiefCouncil(g.s);
  expect(recoverGeneration(parseGame(serializeGame(g.s))).tribe).toEqual(before);
 });
 it('leaves all historical saves and their checkpoints unchanged without inventing a chief',()=>{
  for(const file of readdirSync('tests/fixtures/saves').filter(f=>f.endsWith('.json')&&f!=='manifest.json')){
   const s=parseGame(readFileSync(`tests/fixtures/saves/${file}`,'utf8')),again=parseGame(serializeGame(s));expect(again.tribe).toEqual(s.tribe);expect(again.checkpoint).toEqual(s.checkpoint);if(again.tribe?.version===2)expect(again.tribe.chief).toBeUndefined();
  }
 });
});
