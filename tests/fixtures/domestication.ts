import { cultureGame } from './culture';
import { spawnCreature } from '../../src/game/world';
import { groundHeight } from '../../src/game/random';
import { unitNavigation } from '../../src/game/unit-motion';
import { step } from '../../src/game/simulation';
import { EMPTY_INPUT } from '../../src/game/types';
export function domesticGame() {
  const s=cultureGame(), t=s.tribe, u=t.members.find(u=>!u.species)!;
  s.world.obstacles=[]; t.food=100;
  t.huts[0].pos={x:0,y:groundHeight(0,0,2)+.8,z:0};
  for(const [i,v] of t.members.entries()){v.pos={x:-5-i*3,y:groundHeight(-5-i*3,0,2)+.8,z:0};v.navigation=unitNavigation(v.pos);v.hunger=0;}
  u.pos={x:15,y:groundHeight(15,0,2)+.8,z:0};u.navigation=unitNavigation(u.pos);
  const c=spawnCreature(s.world,'bell',0); c.pos={x:18,y:groundHeight(18,0,2)+.8,z:0};c.velocity={x:0,y:0,z:0};c.hunger=20;c.fear=0;
  s.world.creatures=[c];t.neighbours.forEach(n=>{n.society!.truce=120;});
  return {s,t,u,c};
}
export function runDomestic(s: ReturnType<typeof domesticGame>['s'], seconds:number) { for(let i=0;i<Math.round(seconds*60);i++)step(s,EMPTY_INPUT,1/60); }
