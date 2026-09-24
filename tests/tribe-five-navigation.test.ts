import { it, expect } from 'vitest';
import { fiveTribes } from './fixtures/five-tribes';
import { issueTribeOrder, stepTribe, tribeHome } from '../src/game/tribe';
import { horizontalDistance } from '../src/game/random';
import { upgradeCreatureGenome } from '../src/game/creature-body';
import { electChief, startChiefCouncil } from '../src/game/tribe-chief';
import { startMusic, answerMusic, musicRequest } from '../src/game/tribe-music';

it('keeps the inherited wide body and equipped tool clear of an obstacle during a real order',()=>{
 const s=fiveTribes(),u=s.tribe.members[0];s.player.genome={...s.player.genome,width:1.7,length:1.6};
 u.pos={x:-12,y:0,z:0};s.world.obstacles=[{id:90000,kind:'rock',radius:3,height:5,pos:{x:0,y:0,z:0}}];s.tribe.members=[u];
 u.tool='spear';issueTribeOrder(s,[u.id],'move',{kind:'point',pos:{x:12,y:0,z:0}});
 let clearance=Infinity;for(let i=0;i<1800&&u.orders.length;i++){stepTribe(s,1/60);clearance=Math.min(clearance,Math.hypot(u.pos.x,u.pos.z)-3);}
 expect(u.orders).toHaveLength(0);expect(clearance).toBeGreaterThanOrEqual(2.8);
});
it.each([1,42,481516,20260913,8675309])('physically visits every settlement and returns with v2 body and shell: seed %i',seed=>{
 const s=fiveTribes(seed),u=s.tribe.members[0];
 s.player.genome=upgradeCreatureGenome(s.player.genome as any);s.tribe.food=200;
 u.outfit={id:'route',revision:1,name:'Cestovní plášť',head:'plume',back:'shell',color:'jade'};
 for(const n of s.tribe.neighbours){
  const before=n.relation;expect(issueTribeOrder(s,[u.id],'socialize',{kind:'neighbour',id:n.id}).ok).toBe(true);
  let seconds=0;for(;seconds<80&&n.relation===before;seconds+=1/30)stepTribe(s,1/30);
  expect(n.relation,`${seed} ${n.identity} contact at ${JSON.stringify(u.pos)}`).toBeGreaterThan(before);
  expect(seconds).toBeLessThan(80);
  issueTribeOrder(s,[u.id],'move',{kind:'point',pos:tribeHome(s.tribe)});
  for(let i=0;i<2400&&u.orders.length;i++)stepTribe(s,1/30);
  expect(u.orders,`${seed} ${n.identity} return`).toHaveLength(0);expect(horizontalDistance(u.pos,tribeHome(s.tribe))).toBeLessThan(1);
 }
});
it.each(['garden','terrace','sanctuary','reed','basalt'])('reaches real %s hosts inside unchanged music and council deadlines',identity=>{
 const a=fiveTribes(20260913),n=a.tribe.neighbours.find(n=>n.identity===identity)!;
 expect(n).toBeDefined();a.tribe.food=200;
 const u=a.tribe.members[0];u.orders=[];u.pos={...tribeHome(a.tribe),x:tribeHome(a.tribe).x+3};
 expect(electChief(a,[u.id]).ok).toBe(true);expect(startChiefCouncil(a,[u.id],n.id).ok).toBe(true);
 for(let i=0;i<90*30&&a.tribe.chief!.active;i++)stepTribe(a,1/30);
 expect(a.tribe.chief!.result?.reason).toBe('success');expect(n.relation).toBeGreaterThan(-35);
 const b=fiveTribes(20260913),host=b.tribe.neighbours.find(n=>n.identity===identity)!;b.tribe.food=200;
 const own=b.tribe.members.filter(u=>!u.species);own.forEach((v,i)=>v.tool=['drum','flute','rattle'][i] as any);
 expect(startMusic(b,own.map(v=>v.id),host.id).ok).toBe(true);
 for(let i=0;i<90*30&&b.tribe.music!.active?.phase==='travel';i++)stepTribe(b,1/30);
 expect(b.tribe.music!.active?.phase).toBe('listen');expect(b.tribe.music!.active!.remaining).toBe(3);
});
