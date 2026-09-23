import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGame, serializeGame } from '../src/game/persistence';
import { continueToTribeEra, continueToMachinesEra, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { issueTribeOrder, stepTribe, tribeHome } from '../src/game/tribe';
import { enableNeighbourSocieties, neighbourDisposition, tribeContact } from '../src/game/tribe-society';
import { meetNeighbour } from '../src/game/tribe-neighbours';
import { enableLineageHistory, observeLineageHistory } from '../src/game/lineage-history';
import { unitNavigation } from '../src/game/unit-motion';
import { groundHeight, horizontalDistance } from '../src/game/random';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import type { ActiveTribeState } from '../src/game/era-types';
import { SettlementPresentation } from '../src/render/settlement';
import { tribeHudMarkup } from '../src/ui/tribe';

type TribeGame = GameState & { tribe: ActiveTribeState };
const point=(x:number,z:number)=>({x,y:groundHeight(x,z,2)+.8,z});
/** Prepared finite scene. Changes below are setup, never asserted as played actions. */
function scene() {
  const s=parseGame(readFileSync('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));
  enableLineageHistory(s); continueToTribeEra(s);
  const g=s as TribeGame;
  g.world.obstacles=[]; for(const r of g.world.resources)r.amount=0;
  for(const n of g.tribe.neighbours){n.society!.food=48;n.society!.recruitCooldown=120;for(const u of n.society!.members)u.hunger=0;}
  const n=g.tribe.neighbours[1];n.pos=point(26,0);n.relation=0;
  const a=n.society!;a.food=0;a.recruitCooldown=0;
  for(const [i,u] of a.members.entries()){u.pos=point(26,3+i);u.navigation=unitNavigation(u.pos);}
  makeCheckpoint(g);return g;
}
function food(s:TribeGame,amount=4,x=38,z=0){const r={id:s.world.nextId++,pos:point(x,z),kind:'algae' as const,amount,max:amount,regen:0,patch:1};s.world.resources.push(r);return r;}
function run(s:TribeGame,seconds:number){for(let i=0;i<seconds*30;i++)stepTribe(s,1/30);}
function until(s:TribeGame,done:()=>boolean,seconds=60){for(let i=0;i<seconds*30&&!done();i++)stepTribe(s,1/30);expect(done()).toBe(true);}

it('withdraws finite portions, visibly carries them and credits only an actual delivery; no player evidence',()=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!,r=food(s,2);
  const history=structuredClone(s.lineageHistory),player=structuredClone(s.player),own=s.tribe.food;
  until(s,()=>a.members.some(u=>u.cargo>0));
  expect(r.amount).toBeLessThan(2);expect(a.food).toBe(0);
  until(s,()=>r.amount===0&&a.members.every(u=>u.cargo===0));
  expect(a.food).toBe(8);expect(s.tribe.food).toBe(own);expect(s.player).toEqual(player);expect(s.lineageHistory).toEqual(history);
  run(s,10);expect(a.food).toBe(8);expect(r.amount).toBe(0);
});

it('feeds and restores population only from stored food with a living resident at home',()=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!;
  a.members=a.members.slice(0,2);for(const u of a.members)u.hunger=40;
  run(s,2);expect(a.food).toBe(0);expect(a.members).toHaveLength(2);
  food(s,8);const next=s.tribe.nextId;
  until(s,()=>a.members.length===3,45);
  expect(a.members.some(u=>u.id===next)).toBe(true);expect(a.members[0].hunger).toBeLessThan(40);
  // 32 possible food, minus recruitment and actual meals, never a free grant.
  expect(a.food+a.members.reduce((v,u)=>v+u.cargo*4,0)).toBeLessThanOrEqual(32-12-4);
});

it('does not resurrect extinction or mint food/health without resources',()=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!;a.members=[];n.health=40;
  for(const neighbour of s.tribe.neighbours)neighbour.society!.food=0;
  const next=s.tribe.nextId;run(s,180);
  expect(a.members).toEqual([]);expect(a.food).toBe(0);expect(n.health).toBe(40);expect(s.tribe.nextId).toBe(next);
  enableNeighbourSocieties(s);expect(a.members).toEqual([]);
});

it('never overdraws a final portion contested by player and neighbours',()=>{
  const s=scene(),a=s.tribe.neighbours[1].society!,r=food(s,1),u=s.tribe.members[0];
  u.pos=point(36,0);a.members[0].pos=point(38,2);
  const stock=s.tribe.food;issueTribeOrder(s,[u.id],'gather',{kind:'food',id:r.id});
  until(s,()=>r.amount===0);expect(r.amount).toBe(0);
  expect(u.cargo+a.members.reduce((v,u)=>v+u.cargo,0)).toBe(1);
  until(s,()=>u.cargo===0&&a.members.every(u=>u.cargo===0));expect(s.tribe.food-stock+a.food).toBe(4);
});

it('routes around real obstacles and cannot harvest or strike through them',()=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!,r=food(s,2,46);
  s.world.obstacles.push({id:900001,kind:'rock',pos:point(36,0),radius:3,height:9});
  until(s,()=>a.food===8,60);
  for(const u of a.members)expect(horizontalDistance(u.pos,s.world.obstacles[0].pos)).toBeGreaterThanOrEqual(3.7);
  expect(r.amount).toBe(0);
  const u=s.tribe.members[0],v=a.members[0];u.pos=point(32.9,0);v.pos=point(39.1,0);u.tool='spear';
  expect(tribeContact(s.world,u.pos,v.pos)).toBe(false);
  const health=v.health;issueTribeOrder(s,[u.id],'attack',{kind:'neighbour-unit',id:v.id});stepTribe(s,1/30);expect(v.health).toBe(health);
});

it.each(['friendly','neutral'] as const)('%s neighbours gather but do not dispatch raids',disposition=>{
  const s=scene(),n=s.tribe.neighbours[1];n.relation=disposition==='friendly'?30:0;
  expect(neighbourDisposition(n)).toBe(disposition);food(s,2);run(s,35);
  expect(n.society!.expedition).toBeNull();expect(s.tribe.members.every(u=>u.health===100)).toBe(true);
});

it('warns, sends a bounded physical raid and steals only on contact; cargo reaches the home later',()=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!;n.relation=-35;
  // Keep the camp unguarded for this contact/transport regression.
  for(const [i,u] of s.tribe.members.entries())u.pos=point(-40,i*3);
  const stock=s.tribe.food;
  const messages=stepTribe(s,1/30);expect(messages.some(m=>m.includes('Za 10 s'))).toBe(true);
  expect(a.expedition?.phase).toBe('warning');expect(a.expedition!.members.length).toBeLessThanOrEqual(2);
  run(s,8);expect(s.tribe.food).toBe(stock);expect(a.food).toBe(0);
  until(s,()=>a.expedition?.phase==='outbound');const start=structuredClone(a.members);
  run(s,1);expect(a.members.some((u,i)=>horizontalDistance(u.pos,start[i].pos)>1)).toBe(true);expect(s.tribe.food).toBe(stock);
  until(s,()=>s.tribe.food<stock);
  const courier=a.members.find(u=>u.cargo>0)!;expect(horizontalDistance(courier.pos,tribeHome(s.tribe))).toBeLessThan(4);
  expect(a.food).toBe(0);expect(stock-s.tribe.food).toBe(courier.cargo*4);expect(a.expedition?.phase).toBe('return');
  until(s,()=>a.expedition===null);expect(a.food).toBe(stock-s.tribe.food);
});

it('a real visitor can calm an outbound party and then earn alliance without a second gift',()=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!;n.relation=-35;
  until(s,()=>a.expedition?.phase==='outbound');
  const u=s.tribe.members[0],stock=s.tribe.food,id=a.expedition!.members[0];
  expect(issueTribeOrder(s,[u.id],'socialize',{kind:'neighbour-unit',id}).ok).toBe(true);
  until(s,()=>a.truce>0);expect(a.expedition?.phase).toBe('return');expect(s.tribe.food).toBe(stock-12);expect(n.tribute).toBe(12);
  issueTribeOrder(s,s.tribe.members.map(u=>u.id),'socialize',{kind:'neighbour',id:n.id});
  until(s,()=>n.resolved==='allied',120);expect(n.resolved).toBe('allied');expect(a.expedition?.phase??'return').toBe('return');
});

it('defenders move to an invader; retreat ends pursuit and attacks cannot cause remote damage',()=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!,u=s.tribe.members[0];
  issueTribeOrder(s,[u.id],'attack',{kind:'neighbour',id:n.id});
  const hp=u.health;stepTribe(s,1/30);expect(u.health).toBe(hp);
  until(s,()=>a.members.some(v=>v.task==='defend'));
  until(s,()=>u.health<hp);
  issueTribeOrder(s,[u.id],'move',{kind:'point',pos:tribeHome(s.tribe)});
  run(s,15);const health=u.health;run(s,2);expect(u.health).toBeGreaterThanOrEqual(health);expect(a.members.every(v=>v.task!=='defend')).toBe(true);
});

it.each(['allied','conquered'] as const)('population repair preserves %s, one reward and lineage provenance',resolved=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!,u=s.tribe.members[0];
  a.members=a.members.slice(0,1);a.food=40;n.relation=99.999;n.health=1;
  const stock=s.tribe.food;
  meetNeighbour(s.tribe,u,n,resolved==='allied'?'socialize':'attack',1);
  observeLineageHistory(s);const fact=structuredClone(s.lineageHistory!.stages[3].facts);
  const rewarded=s.tribe.food;expect(rewarded).toBe(stock+(resolved==='allied'?-12+8:12));
  until(s,()=>a.members.length>1);
  expect(n.resolved).toBe(resolved);expect(s.tribe.food).toBe(rewarded);
  meetNeighbour(s.tribe,u,n,resolved==='allied'?'socialize':'attack',1);observeLineageHistory(s);
  expect(s.tribe.food).toBe(rewarded);expect(s.lineageHistory!.stages[3].facts).toEqual(fact);
});

it('round trips an outbound expedition, cargo and navigation, then replays identically',()=>{
  const s=scene(),n=s.tribe.neighbours[1];n.relation=-35;food(s,2,48,12);
  until(s,()=>n.society!.expedition?.phase==='outbound');run(s,1);makeCheckpoint(s);
  const saved=serializeGame(s),loaded=parseGame(saved) as TribeGame;
  expect(loaded.tribe).toEqual(s.tribe);
  for(let i=0;i<600;i++){stepTribe(s,1/30);stepTribe(loaded,1/30);}
  expect(loaded.tribe).toEqual(s.tribe);expect(loaded.world).toEqual(s.world);
  const recovered=recoverGeneration(loaded);expect(recovered.tribe).toEqual(JSON.parse(JSON.parse(saved).state.checkpoint).tribe);
  expect(()=>serializeGame(recovered)).not.toThrow();
});

it('migrates old live/checkpoint state exactly once without rewriting prior results or preview/later eras',()=>{
  const old=parseGame(readFileSync('tests/fixtures/saves/alliance-completed.save.json','utf8')) as TribeGame;
  const before=old.tribe.neighbours.map(n=>({resolved:n.resolved,tribute:n.tribute,relation:n.relation}));
  expect(old.tribe.neighbours.every(n=>!n.society)).toBe(true);enableLineageHistory(old);const history=structuredClone(old.lineageHistory);
  enableNeighbourSocieties(old);const after=structuredClone(old);enableNeighbourSocieties(old);expect(old).toEqual(after);
  expect(old.tribe.neighbours.map(n=>({resolved:n.resolved,tribute:n.tribute,relation:n.relation}))).toEqual(before);expect(old.lineageHistory).toEqual(history);
  expect(parseGame(serializeGame(old)).tribe).toEqual(old.tribe);expect(recoverGeneration(old).tribe).toEqual(JSON.parse(old.checkpoint!).tribe);
  for(const file of ['tribe-preview.export.json','machines-restoration-completed.save.json']){const s=parseGame(readFileSync(`tests/fixtures/saves/${file}`,'utf8'));const before=structuredClone(s);enableNeighbourSocieties(s);expect(s).toEqual(before);}
});

it('freezes active society on the machines transition while retaining completed evidence',()=>{
  const s=scene();for(const n of s.tribe.neighbours)n.resolved='allied';s.tribe.completed=true;observeLineageHistory(s);makeCheckpoint(s);
  const before=structuredClone(s.tribe);expect(continueToMachinesEra(s)).toBe(true);
  for(let i=0;i<60;i++)step(s,EMPTY_INPUT);
  expect(s.tribe).toEqual(before);expect(parseGame(serializeGame(s)).tribe).toEqual(before);
});

it.each([
  ['version',(s:any):void=>{s.tribe.neighbours[1].society.version=2;}],
  ['unknown field',(s:any):void=>{s.tribe.neighbours[1].society.extra=1;}],
  ['negative food',(s:any):void=>{s.tribe.neighbours[1].society.food=-1;}],
  ['overfull food',(s:any):void=>{s.tribe.neighbours[1].society.food=49;}],
  ['missing member field',(s:any):void=>{delete s.tribe.neighbours[1].society.members[0].cargo;}],
  ['overfull cargo',(s:any):void=>{s.tribe.neighbours[1].society.members[0].cargo=3;}],
  ['collision',(s:any):void=>{s.tribe.neighbours[1].society.members[0].id=s.tribe.members[0].id;}],
  ['nextId',(s:any):void=>{s.tribe.nextId=s.tribe.neighbours[2].society.members[2].id;}],
  ['foreign party',(s:any):void=>{s.tribe.neighbours[1].society.expedition={phase:'warning',time:0,members:[s.tribe.members[0].id]};}],
  ['duplicate party',(s:any):void=>{const a=s.tribe.neighbours[1].society;a.expedition={phase:'warning',time:0,members:[a.members[0].id,a.members[0].id]};}],
  ['resolved raid',(s:any):void=>{const n=s.tribe.neighbours[1];n.resolved='allied';n.society.expedition={phase:'outbound',time:0,members:[n.society.members[0].id]};}],
  ['partial activation',(s:any):void=>{delete s.tribe.neighbours[1].society;}],
  ['checkpoint activation',(s:any):void=>{const c=JSON.parse(s.checkpoint);for(const n of c.tribe.neighbours)delete n.society;s.checkpoint=JSON.stringify(c);}],
] as const)('rejects malformed society: %s',(_name,mutate)=>{const value=JSON.parse(serializeGame(scene()));mutate(value.state);expect(()=>parseGame(JSON.stringify(value))).toThrow();});

it('renders/picks residents and cargo from state without mutating it; retires them in later eras',()=>{
  const s=scene(),n=s.tribe.neighbours[1],u=n.society!.members[0];u.cargo=1;u.task='forage';
  const before=structuredClone(s),view=new SettlementPresentation();
  try{view.update(s,[],0);expect(view.group.getObjectByName(`neighbour-unit-${u.id}`)?.getObjectByName('carried-food')?.visible).toBe(true);expect(view.pickTargets().some(v=>v.target.kind==='neighbour-unit'&&v.target.id===u.id)).toBe(true);expect(s).toEqual(before);expect(tribeHudMarkup(s,[],null)).toContain('3 / 4 členů');s.stage=4;view.update(s,[],1);expect(view.group.getObjectByName(`neighbour-unit-${u.id}`)).toBeUndefined();}finally{view.dispose();}
});

it('walks around a blocked corner even when an enemy home is already inside spear reach',()=>{
  const s=scene(),n=s.tribe.neighbours[1],u=s.tribe.members[0];
  n.pos=point(2.91,0);n.society!.members=[];u.pos=point(-1.05,2.09);u.tool='spear';
  s.world.obstacles=[{id:900001,kind:'rock',pos:point(0,0),radius:1.6,height:9}];
  expect(tribeContact(s.world,u.pos,n.pos)).toBe(false);
  const origin={...u.pos},health=n.health;
  issueTribeOrder(s,[u.id],'attack',{kind:'neighbour',id:n.id});
  until(s,()=>n.health<health,15);expect(horizontalDistance(origin,u.pos)).toBeGreaterThan(.5);
});

it('fills only the remaining space in a legitimate fractional cargo after a partial delivery',()=>{
  const s=scene(),n=s.tribe.neighbours[1],u=n.society!.members[0],r=food(s,2);
  u.pos=point(37,0);u.cargo=1.5;u.resource=r.id;
  makeCheckpoint(s);expect(()=>serializeGame(s)).not.toThrow();
  stepTribe(s,1/30);
  expect(u.cargo).toBe(2);expect(r.amount).toBe(1.5);expect(()=>serializeGame(s)).not.toThrow();
});

it('recalls a warning when real gatherers have already filled the shortage',()=>{
  const s=scene(),n=s.tribe.neighbours[1],a=n.society!;n.relation=-35;a.recruitCooldown=120;
  // Two couriers arrive with their previously harvested finite loads.
  for(const u of a.members.slice(1)){u.cargo=2;u.pos={...n.pos};}
  stepTribe(s,1/30);expect(a.food).toBe(16);expect(a.expedition?.phase).toBe('warning');
  stepTribe(s,1/30);expect(a.expedition?.phase??'return').toBe('return');
  const stock=s.tribe.food;run(s,12);expect(s.tribe.food).toBe(stock);
});

it('replays the same active economy despite reversed resident and neighbour storage order',()=>{
  const s=scene();food(s,8);const copy=structuredClone(s);copy.tribe.neighbours.reverse();for(const n of copy.tribe.neighbours)n.society!.members.reverse();
  for(let i=0;i<900;i++){stepTribe(s,1/30);stepTribe(copy,1/30);}
  const canonical=(s:TribeGame)=>({...s.tribe,neighbours:[...s.tribe.neighbours].sort((a,b)=>a.id-b.id).map(n=>({...n,society:{...n.society,members:[...n.society!.members].sort((a,b)=>a.id-b.id)}}))});
  expect(canonical(copy)).toEqual(canonical(s));expect(copy.world).toEqual(s.world);
});
