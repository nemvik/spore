import type { ActiveTribeState, TribeNeighbour } from './era-types';
import type { FoodKind, Vec3, World } from './types';
import { groundHeight, horizontalDistance } from './random';

export const HISTORIC_NEIGHBOURS = ['garden', 'terrace', 'sanctuary'] as const;
export const FIVE_NEIGHBOURS = [...HISTORIC_NEIGHBOURS, 'reed', 'basalt'] as const;
export type NeighbourIdentity = typeof FIVE_NEIGHBOURS[number];
/** Existing coastal bodies and economy, with visible regional specialisms. */
export const NEIGHBOURS: Record<NeighbourIdentity, {
  health: number; gift: number; relation: number; speed: number; damage: number;
  social: number; species: string; preferred: FoodKind | null; center: { x: number; z: number };
}> = {
  garden: { health:160,gift:8,relation:30,speed:4,damage:4,social:1,species:'gloom',preferred:null,center:{x:-38,z:-24} },
  terrace: { health:220,gift:12,relation:-35,speed:3.6,damage:5,social:1,species:'mender',preferred:null,center:{x:40,z:4} },
  sanctuary: { health:180,gift:16,relation:0,speed:4,damage:4,social:1.2,species:'lantern',preferred:null,center:{x:-4,z:-46} },
  reed: { health:140,gift:12,relation:10,speed:4.6,damage:3,social:1,species:'bell',preferred:'algae',center:{x:-46,z:22} },
  basalt: { health:240,gift:16,relation:-10,speed:3.2,damage:6,social:1,species:'gnaw',preferred:'detritus',center:{x:26,z:42} },
};
export const requiredNeighbours = (t: Pick<ActiveTribeState,'roster'>): readonly NeighbourIdentity[] => t.roster === 'five' ? FIVE_NEIGHBOURS : HISTORIC_NEIGHBOURS;
export function completeNeighbourRoster(t: Pick<ActiveTribeState,'roster'|'neighbours'>): boolean {
  const expected = requiredNeighbours(t);
  return t.neighbours.length === expected.length && expected.every(id=>t.neighbours.some(n=>n.identity===id));
}
export const neighbourProfile = (n: Pick<TribeNeighbour,'identity'>) => NEIGHBOURS[n.identity];

/** Choose a clearing, not merely a free center. Keep the inherited ecology intact.
 * Resource density ranks equally nearby candidates; no resources are created. */
export function settlementGround(world: World, center: {x:number;z:number}, occupied: readonly Vec3[], clearance = 6, reachable: (point:Vec3)=>boolean = ()=>true): Vec3 {
  const candidates: { pos: Vec3; score: number }[] = [];
  for(let x=-18;x<=18;x+=2)for(let z=-18;z<=18;z+=2){
    const pos={x:center.x+x,y:0,z:center.z+z};
    if(Math.abs(pos.x)>66||Math.abs(pos.z)>66||occupied.some(p=>horizontalDistance(p,pos)<25))continue;
    if(world.obstacles.some(o=>horizontalDistance(o.pos,pos)<o.radius+clearance))continue;
    if(!reachable(pos))continue;
    const nearby=world.resources.filter(r=>r.kind!=='meat'&&horizontalDistance(r.pos,pos)<23).length;
    candidates.push({pos,score:Math.hypot(x,z)+(nearby<2?40:0)});
  }
  candidates.sort((a,b)=>a.score-b.score||a.pos.x-b.pos.x||a.pos.z-b.pos.z);
  const p=candidates[0]?.pos;
  if(!p)throw new Error('V krajině chybí průchodné místo pro osadu.');
  return {...p,y:groundHeight(p.x,p.z,world.stage)+.8};
}
