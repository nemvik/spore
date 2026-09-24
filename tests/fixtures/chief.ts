import { cultureGame } from './culture';
import { groundHeight } from '../../src/game/random';
export function chiefGame() {
  const s = cultureGame(), t = s.tribe, n = t.neighbours[0], u = t.members.find(u => !u.species)!;
  s.world.obstacles = []; s.world.creatures = []; s.checkpoint = null;
  t.huts[0].pos = { x: 0, y: groundHeight(0,0,2)+.8, z: 0 };
  t.members.forEach((m,i) => { m.pos = {x:i*2,y:groundHeight(i*2,2,2)+.8,z:2}; m.orders=[];m.hunger=8;m.tool=null; });
  n.pos={x:20,y:groundHeight(20,0,2)+.8,z:0};
  n.society!.members.forEach((m,i)=>{m.pos={...n.pos,z:i*2};m.hunger=0;});
  return {s,t,n,u,other:t.members.filter(u=>!u.species)[1]};
}
