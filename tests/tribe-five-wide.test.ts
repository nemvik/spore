import { connectedGround } from '../src/game/navigation';
import { buildNpcDesigns, validateNpcDesigns } from '../src/game/npc-genome';
import { newCreation } from '../src/game/creature-library';
import { NEIGHBOURS } from '../src/game/tribe-roster';
import { it, expect } from 'vitest';
import { fiveTribes } from './fixtures/five-tribes';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { validateGenome } from '../src/game/genome';
import { createTribe, tribeHome } from '../src/game/tribe';
import { tribeMemberRadius, moveTribeMember } from '../src/game/tribe-motion';
import { horizontalDistance } from '../src/game/random';

function wideBody(){const g=creatureBodyFixture('biped');g.length=2.4;g.width=1.8;const arms=g.parts.find(p=>p.kind==='arms')!;arms.scale=1.65;arms.limb!.joints=Array.from({length:3},(_,i)=>({id:`wide-${i}`,offset:{x:1.4*(i+1),y:0,z:0},radius:.1}));expect(validateGenome(g,2)).toEqual([]);return g;}
it.each([1,42,481516,20260913,8675309])('places and routes a valid extreme body to all five settlements and home: %i',seed=>{
 const s=fiveTribes(seed);s.player.genome=wideBody();s.tribe=createTribe(s);const u=s.tribe.members[0],radius=tribeMemberRadius(s,u);expect(radius).toBeGreaterThan(9);
 for(const member of s.tribe.members){const r=tribeMemberRadius(s,member);for(const o of s.world.obstacles)expect(horizontalDistance(o.pos,member.pos)-o.radius).toBeGreaterThanOrEqual(r);}
 for(const n of s.tribe.neighbours){expect(s.world.obstacles.every(o=>horizontalDistance(o.pos,n.pos)>=o.radius+radius+.5)).toBe(true);
  for(const target of [n.pos,tribeHome(s.tribe)]){let arrived=false;for(let i=0;i<2700&&!arrived;i++)arrived=moveTribeMember(s,u,target,[],2.5,1/30,3.5);expect(arrived,`${seed} ${n.identity} target=${JSON.stringify(target)} at=${JSON.stringify(u.pos)}`).toBe(true);}
 }
});

it('uses actual library bodies for the two new societies and places residents clear of rocks',()=>{
 const s=fiveTribes(20260913),hunter=wideBody(),grazer=wideBody();
 grazer.parts.find(p=>p.kind==='jaw')!.kind='filter';grazer.parts.push({id:'nectar',kind:'proboscis',axial:.8,angle:0,scale:1,mirrored:false});
 s.world.creatureDesigns=buildNpcDesigns([newCreation(hunter,'','wide-hunter',0),newCreation(grazer,'','wide-grazer',0)],20260913);validateNpcDesigns(s.world.creatureDesigns);
 s.tribe=createTribe(s);
 for(const identity of ['reed','basalt']){const n=s.tribe.neighbours.find(n=>n.identity===identity)!;const radius=tribeMemberRadius(s,{species:NEIGHBOURS[n.identity].species,tool:null});expect(radius).toBeGreaterThan(9);
  const reachable=connectedGround(s.world,n.pos,radius+.16);expect(n.society!.members.every(u=>reachable(u.pos))).toBe(true);
  for(const u of n.society!.members)for(const o of s.world.obstacles)expect(horizontalDistance(u.pos,o.pos)-o.radius).toBeGreaterThanOrEqual(radius);
 }
});
