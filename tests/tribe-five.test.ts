import { NEIGHBOURS } from '../src/game/tribe-roster';
import { worldSpecies } from '../src/game/npc-genome';
import { describe, it, expect } from 'vitest';
import { fiveTribes } from './fixtures/five-tribes';
import { tribeReady, stepTribe, tribeHome, issueTribeOrder } from '../src/game/tribe';
import { continueToMachinesEra } from '../src/game/simulation';
import { meetNeighbour } from '../src/game/tribe-neighbours';
import { horizontalDistance } from '../src/game/random';
import { quoteMusic } from '../src/game/tribe-music';

const identities=['garden','terrace','sanctuary','reed','basalt'];
describe('five living neighbouring societies',()=>{
 it('requires the entire new roster and a living player before transition',()=>{
  const s=fiveTribes(); expect(s.tribe.neighbours.map(n=>n.identity)).toEqual(identities);
  expect(s.tribe).toMatchObject({roster:'five'});
  for(const n of s.tribe.neighbours.slice(0,3))n.resolved='allied';
  stepTribe(s,1/60);expect(s.tribe.completed).toBe(false);expect(tribeReady(s)).toBe(false);expect(continueToMachinesEra(s)).toBe(false);
  for(const n of s.tribe.neighbours)n.resolved='allied';
  stepTribe(s,1/60);expect(tribeReady(s)).toBe(true);expect(s.tribe.completed).toBe(true);
  const truncated=structuredClone(s);truncated.tribe.neighbours.splice(3);expect(tribeReady(truncated)).toBe(false);
  const dead=structuredClone(s);dead.tribe.members.forEach(u=>u.health=0);expect(tribeReady(dead)).toBe(false);
  expect(continueToMachinesEra(s)).toBe(true);
 });
 it.each([1,42,481516,20260913,8675309])('places distinct viable settlements in seed %i without rewriting the world',seed=>{
  const s=fiveTribes(seed),t=s.tribe, homes=[tribeHome(t),...t.neighbours.map(n=>n.pos)];
  expect(t.neighbours).toHaveLength(5);
  for(const [i,p] of homes.entries()){
   expect(s.world.obstacles.every(o=>horizontalDistance(p,o.pos)>o.radius+5)).toBe(true);
   expect(homes.slice(i+1).every(q=>horizontalDistance(p,q)>22)).toBe(true);
   expect(s.world.resources.filter(r=>r.amount>=1&&horizontalDistance(r.pos,p)<23).length).toBeGreaterThanOrEqual(2);
  }
  const units=[...t.members,...t.neighbours.flatMap(n=>n.society!.members)];
  expect(new Set(units.map(u=>u.id)).size).toBe(units.length);
  for(const n of t.neighbours){expect(n.society!.members).toHaveLength(3);expect(n.society!.members.every(u=>horizontalDistance(u.pos,n.pos)<14)).toBe(true);}
 });
 it('limits simultaneous hostile expeditions to two actual people',()=>{
  const s=fiveTribes();s.world.resources=[];s.tribe.food=100;
  for(const n of s.tribe.neighbours){n.relation=-35;n.society!.food=0;for(const u of n.society!.members){u.pos={...n.pos};u.hunger=0;}}
  stepTribe(s,1/60);
  expect(s.tribe.neighbours.filter(n=>n.society!.expedition)).toHaveLength(2);
  expect(s.tribe.neighbours.reduce((v,n)=>v+(n.society!.expedition?.members.length??0),0)).toBe(2);
 });
 it('does not socialize with extinct residents or mint an automatic resolution',()=>{
  const s=fiveTribes(),n=s.tribe.neighbours[0],u=s.tribe.members[0];n.society!.members=[];n.society!.food=48;
  const food=s.tribe.food,relation=n.relation;
  expect(issueTribeOrder(s,[u.id],'socialize',{kind:'neighbour',id:n.id}).ok).toBe(false);
  meetNeighbour(s.tribe,u,n,'socialize',1000);expect(n.relation).toBe(relation);expect(s.tribe.food).toBe(food);expect(n.resolved).toBeNull();
  expect(quoteMusic(s,[u.id],n.id).ok).toBe(false);
  expect(issueTribeOrder(s,[u.id],'attack',{kind:'neighbour',id:n.id}).ok).toBe(true);
 });
});

it('keeps new food preferences compatible with their native ecological bodies',()=>{
 const s=fiveTribes();for(const identity of ['reed','basalt'] as const){const p=NEIGHBOURS[identity];expect(worldSpecies(s.world,p.species).diet).toContain(p.preferred);}
});
