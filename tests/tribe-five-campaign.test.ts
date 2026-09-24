import { it, expect } from 'vitest';
import { fiveTribes } from './fixtures/five-tribes';
import { step, continueToMachinesEra, makeCheckpoint } from '../src/game/simulation';
import { issueTribeOrder, stopTribeUnits, buildTribeHut, equipTribeUnits, recruitTribeMember, tribeHome, memberDiet, tribeReady, stepTribe } from '../src/game/tribe';
import { EMPTY_INPUT } from '../src/game/types';
import { horizontalDistance } from '../src/game/random';
import { openGround } from '../src/game/unit-motion';
import { parseGame, serializeGame } from '../src/game/persistence';
import { meetNeighbour } from '../src/game/tribe-neighbours';
import { NEIGHBOURS } from '../src/game/tribe-roster';

type Campaign=ReturnType<typeof fiveTribes>;
const tick=(s:Campaign)=>step(s,EMPTY_INPUT,1/30);
function until(s:Campaign,p:()=>boolean,seconds:number,label:string){for(let i=0;i<seconds*30&&!p()&&!s.deathReason;i++)tick(s);expect(s.deathReason,label).toBeNull();expect(p(),`${label}; time ${s.tribe.elapsed}; ${JSON.stringify(s.tribe.members.map(u=>({id:u.id,h:u.health,hunger:u.hunger,pos:u.pos,order:u.orders[0]})))}`).toBe(true);}
function home(s:Campaign){const ids=s.tribe.members.map(u=>u.id);stopTribeUnits(s,ids);issueTribeOrder(s,ids,'move',{kind:'point',pos:tribeHome(s.tribe)});until(s,()=>s.tribe.members.every(u=>!u.orders.length),75,'return home');}
function gather(s:Campaign,desired:number){
 for(let round=0;s.tribe.food<desired&&round<30;round++){
  const units=s.tribe.members,origin=tribeHome(s.tribe);
  for(const u of units){const r=s.world.resources.filter(r=>r.amount>=2&&memberDiet(s,u).includes(r.kind)).sort((a,b)=>horizontalDistance(a.pos,origin)-horizontalDistance(b.pos,origin)||a.id-b.id)[0];expect(r,'physical food source').toBeDefined();issueTribeOrder(s,[u.id],'gather',{kind:'food',id:r.id});}
  for(let i=0;i<30*18;i++)tick(s);
  home(s);
 }
 expect(s.tribe.food).toBeGreaterThanOrEqual(desired);
}
it.each([['socialize','drum'],['attack','spear']] as const)('finishes five neighbours by %s with earned finite food, paid construction, return and save/load', (kind,tool)=>{
 let s=fiveTribes();const inherited=structuredClone(s.player.genome),original=s.world.resources.reduce((v,r)=>v+r.amount,0);
 // Actual founding stock 36. No prepared army, tools, huts, healing or outcomes.
 gather(s,150);expect(s.world.patches.reduce((v,p)=>v+p.harvested,0)).toBeGreaterThan(0);
 const ids=s.tribe.members.map(u=>u.id),p=openGround(s.world,tribeHome(s.tribe),6,12,3);
 expect(buildTribeHut(s,'workshop',tool,p,ids).ok).toBe(true);until(s,()=>s.tribe.unlocked.includes(tool),30,'workshop');home(s);
 while(s.tribe.members.length<6)expect(recruitTribeMember(s).ok).toBe(true);
 expect(equipTribeUnits(s,s.tribe.members.map(u=>u.id),tool).ok).toBe(true);
 for(const [index,identity] of s.tribe.neighbours.map(n=>n.identity).entries()){
  const n=s.tribe.neighbours.find(n=>n.identity===identity)!;
  if(s.tribe.food<30)gather(s,60);
  const people=s.tribe.members.map(u=>u.id);
  expect(issueTribeOrder(s,people,kind,{kind:'neighbour',id:n.id}).ok).toBe(true);
  until(s,()=>!!n.resolved,120,`${kind} ${n.identity}`);
  expect(n.resolved).toBe(kind==='attack'?'conquered':'allied');expect(tribeReady(s)).toBe(index===4);
  const stock=s.tribe.food,before=structuredClone(n);meetNeighbour(s.tribe,s.tribe.members[0],n,kind,100);expect(n).toEqual(before);expect(s.tribe.food).toBe(stock);
  home(s);until(s,()=>s.tribe.members.every(u=>u.health>92&&u.hunger<35),60,'rest with food');
  makeCheckpoint(s);s=parseGame(serializeGame(s)) as Campaign;
 }
 expect(s.tribe.completed).toBe(true);expect(s.lineageHistory!.stages[3].facts).toHaveLength(5);expect(s.player.genome).toEqual(inherited);
 expect(continueToMachinesEra(s)).toBe(true);expect(parseGame(serializeGame(s)).stage).toBe(4);
},30000);

it.each([1,42,8675309])('sustains all five economies with shared ecology for 5 minutes in seed %i',seed=>{
 const s=fiveTribes(seed),born=s.tribe.nextId,harvests=s.world.patches.reduce((v,p)=>v+p.harvested,0);
 // Player stays at its supplied home; this is ecology pressure, not a played campaign.
 for(let i=0;i<300*30;i++)tick(s);
 expect(s.deathReason).toBeNull();expect(s.tribe.nextId).toBeGreaterThan(born);
 expect(s.world.patches.reduce((v,p)=>v+p.harvested,0)).toBeGreaterThan(harvests+30);
 for(const n of s.tribe.neighbours){expect(n.society!.members.length,n.identity).toBeGreaterThanOrEqual(3);expect(n.society!.food,n.identity).toBeGreaterThan(0);expect(n.society!.food).toBeLessThanOrEqual(48);expect(n.society!.members.every(u=>u.cargo<=2&&u.hunger<90)).toBe(true);}
 expect(s.world.resources.every(r=>r.amount>=0&&r.amount<=r.max)).toBe(true);
},15000);

it.each(['reed','basalt'] as const)('makes %s physically prefer its local food and pay for population recovery',identity=>{
 const s=fiveTribes(),n=s.tribe.neighbours.find(n=>n.identity===identity)!,a=n.society!;
 s.world.obstacles=[];s.world.resources=[];for(const other of s.tribe.neighbours){other.society!.food=48;other.society!.members.forEach(u=>u.hunger=0);}
 a.members=a.members.slice(0,2);a.food=0;a.recruitCooldown=0;for(const u of a.members){u.pos={...n.pos};u.hunger=0;}
 const preferred={id:s.world.nextId++,kind:NEIGHBOURS[identity].preferred!,amount:8,max:8,regen:0,patch:0,pos:{...n.pos,x:n.pos.x+9}};
 const other={...preferred,id:s.world.nextId++,kind:'nectar' as const,pos:{...n.pos,x:n.pos.x-7}};s.world.resources.push(preferred,other);
 stepTribe(s,1/60);expect(a.members.every(u=>u.resource===preferred.id)).toBe(true);
 for(let i=0;i<1800&&a.members.length===2;i++)stepTribe(s,1/30);
 expect(a.members).toHaveLength(3);expect(preferred.amount).toBeLessThan(8);
 expect(a.food+a.members.reduce((v,u)=>v+u.cargo*4,0)).toBeLessThanOrEqual((16-preferred.amount-other.amount)*4-12);
});

it('cycles concurrent warned expeditions through physical theft and return without exceeding the common force limit',()=>{
 const s=fiveTribes(),t=s.tribe;t.food=100;s.world.resources=[];s.world.creatures=[];
 // Leave the camp undefended to observe theft, rather than local self-defence.
 for(const u of t.members){u.pos={x:65,y:0,z:-65};u.hunger=0;}
 for(const n of t.neighbours){n.relation=-35;n.society!.food=0;for(const u of n.society!.members){u.pos={...n.pos};u.hunger=0;}}
 const launched=new Set<string>(),returned=new Set<string>();let stolen=false;
 for(let i=0;i<150*30;i++){
  stepTribe(s,1/30);
  expect(t.neighbours.reduce((sum,n)=>sum+(n.society!.expedition?.members.length??0),0)).toBeLessThanOrEqual(2);
  for(const n of t.neighbours){const a=n.society!;if(a.expedition?.phase==='outbound')launched.add(n.identity);if(a.expedition?.phase==='return'&&a.members.some(u=>u.cargo>0))stolen=true;if(launched.has(n.identity)&&!a.expedition&&a.food>0)returned.add(n.identity);}
 }
 expect(stolen).toBe(true);expect(launched.size).toBeGreaterThanOrEqual(3);expect(returned.size).toBeGreaterThanOrEqual(2);expect(t.food).toBeLessThan(100);
});
