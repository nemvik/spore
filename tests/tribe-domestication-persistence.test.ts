import {it,expect,describe} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import {domesticGame,runDomestic} from './fixtures/domestication';
import {startDomestication,stepDomestication} from '../src/game/tribe-domestication';
import {parseGame,serializeGame} from '../src/game/persistence';
import {makeCheckpoint,recoverGeneration,continueToMachinesEra,step} from '../src/game/simulation';
import {EMPTY_INPUT} from '../src/game/types';
function game(phase='approach'){const g=domesticGame();startDomestication(g.s,[g.u.id],g.c.id);if(phase!=='approach')stepDomestication(g.s,.1);if(phase==='escort')stepDomestication(g.s,8);if(phase==='care')runDomestic(g.s,22);return g;}
describe('animal ownership and campaign contract',()=>{
 it.each(['approach','lure','escort','care'])('roundtrips %s and checkpoint with deterministic continuation',phase=>{
  const {s}=game(phase);makeCheckpoint(s);const loaded=parseGame(serializeGame(s));expect(loaded.tribe).toEqual(s.tribe);
  step(s,EMPTY_INPUT,1/60);step(loaded,EMPTY_INPUT,1/60);expect(loaded.tribe).toEqual(s.tribe);expect(loaded.world.creatures).toEqual(s.world.creatures);
  expect(recoverGeneration(loaded).tribe).toEqual(JSON.parse(loaded.checkpoint!).tribe);
 });
 it.each([
  (d:any)=>d.version=2,(d:any)=>d.extra=true,(d:any)=>d.active.extra=1,(d:any)=>d.active.phase='owned',
  (d:any)=>d.active.paid=6,(d:any)=>d.active.progress=9,(d:any)=>d.active.remaining=91,(d:any)=>d.active.contactLost=-1,
  (d:any)=>d.active.navigation.rethink=Infinity,(d:any)=>d.active.creature=1e9,
 ])('rejects malformed acquisition %s',mutate=>{const {s,t}=game();mutate(t.domestication);expect(()=>parseGame(serializeGame(s))).toThrow();});
 it.each([
  (a:any)=>a.cargo=7,(a:any)=>a.trust=-1,(a:any)=>a.mode='hunt',(a:any)=>a.resource=123,(a:any)=>a.navigation.extra=1,
 ])('rejects malformed care %s',mutate=>{const {s,t}=game('care');mutate(t.domestication!.animals[0]);expect(()=>parseGame(serializeGame(s))).toThrow();});
 it('rejects duplicate ownership, acquisition of owned animal and wrong extant ID domains',()=>{
  const g=game('care');g.t.domestication!.animals.push(structuredClone(g.t.domestication!.animals[0]));expect(()=>parseGame(serializeGame(g.s))).toThrow();
  g.t.domestication!.animals.pop();g.t.domestication!.animals[0].caretaker=g.t.huts[0].id;expect(()=>parseGame(serializeGame(g.s))).toThrow();
  const h=game();h.t.domestication!.active!.creature=h.s.world.resources[0].id;expect(()=>parseGame(serializeGame(h.s))).toThrow();
 });
 it.each(['animal','member'] as const)('accepts stale %s then terminates without reward',lost=>{
  const g=game('lure');if(lost==='animal')g.s.world.creatures=[];else g.t.members=g.t.members.filter(u=>u!==g.u);
  const loaded=parseGame(serializeGame(g.s));stepDomestication(loaded,.1);expect(loaded.tribe?.version===2&&loaded.tribe.domestication!.active).toBeNull();expect(loaded.tribe?.food).toBe(94);
 });
 it('restores a checkpoint before the purchase without carrying spent branch/cargo',()=>{
  const g=domesticGame();makeCheckpoint(g.s);const old=structuredClone(g.t);startDomestication(g.s,[g.u.id],g.c.id);runDomestic(g.s,22);expect(recoverGeneration(parseGame(serializeGame(g.s))).tribe).toEqual(old);
 });
 it('freezes care after machine entry; active acquisition terminates before checkpoint',()=>{
  for(const phase of ['care','escort']){const g=game(phase);g.t.neighbours.forEach(n=>{n.resolved='allied';n.relation=100;n.society!.expedition=null;});g.t.completed=true;
   expect(continueToMachinesEra(g.s)).toBe(true);expect(g.t.domestication!.active).toBeNull();const animal=structuredClone(g.c),d=structuredClone(g.t.domestication);
   const loaded=parseGame(serializeGame(g.s));for(let i=0;i<60;i++)step(loaded,EMPTY_INPUT,1/60);
   expect(loaded.tribe?.version===2&&loaded.tribe.domestication).toEqual(d);if(phase==='care')expect(loaded.world.creatures.find(c=>c.id===g.c.id)).toEqual(animal);
  }
 });
 it('historical fixtures remain unchanged and optional marker stays absent',()=>{
  const files=readdirSync('tests/fixtures/saves').filter(f=>f.endsWith('.json')&&f!=='manifest.json');expect(files).toHaveLength(11);
  for(const f of files){const s=parseGame(readFileSync(`tests/fixtures/saves/${f}`,'utf8'));const loaded=parseGame(serializeGame(s));expect(loaded.tribe).toEqual(s.tribe);expect(loaded.checkpoint).toEqual(s.checkpoint);if(loaded.tribe?.version===2)expect(loaded.tribe.domestication).toBeUndefined();}
 });
});
it('care with cargo and stale references recovers without granting a missing animal load',()=>{
 const g=game('care'),a=g.t.domestication!.animals[0];a.cargo=4;makeCheckpoint(g.s);const loaded=parseGame(serializeGame(g.s));expect(loaded.tribe?.version===2&&loaded.tribe.domestication!.animals[0].cargo).toBe(4);
 g.s.world.creatures=[];const missing=parseGame(serializeGame(g.s)),food=missing.tribe!.food;stepDomestication(missing,.1);expect(missing.tribe?.version===2&&missing.tribe.domestication!.animals).toEqual([]);expect(missing.tribe!.food).toBe(food);
 const restored=recoverGeneration(missing);expect(restored.tribe?.version===2&&restored.tribe.domestication!.animals[0].cargo).toBe(4);expect(restored.world.creatures.some(c=>c.id===g.c.id)).toBe(true);
});
it('stale caretaker and exhausted saved target detach safely after care load',()=>{
 const g=game('care'),a=g.t.domestication!.animals[0];a.mode='gather';a.resource=g.s.world.resources.find(r=>r.kind==='nectar')!.id;
 g.t.members=g.t.members.filter(u=>u!==g.u);g.s.world.resources=g.s.world.resources.filter(r=>r.id!==a.resource);
 const loaded=parseGame(serializeGame(g.s));stepDomestication(loaded,.1);const after=loaded.tribe?.version===2&&loaded.tribe.domestication!.animals[0];expect(after&&after.caretaker).toBeNull();expect(after&&after.mode).toBe('rest');expect(after&&after.resource).toBeNull();
});
it('a domestic animal and active attempt cannot claim the same world identity',()=>{
 const g=game('care'),h=game('lure');g.t.domestication!.active=structuredClone(h.t.domestication!.active);expect(()=>parseGame(serializeGame(g.s))).toThrow();
});
