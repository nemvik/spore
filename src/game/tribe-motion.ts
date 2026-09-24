import type { GameState, Genome, Vec3 } from './types';
import type { TribeUnit } from './era-types';
import { bodyWidth } from './body-shape';
import { resolveCreatureAnatomy } from './creature-anatomy';
import { worldSpecies } from './npc-genome';
import { moveUnit } from './unit-motion';
import { horizontalDistance } from './random';

const footprints=new WeakMap<Genome,number>();
/** Conservative rotating footprint of the trunk/limbs; soft tails are not solid.
 * A held tool and pouches are included even when the body is narrow. */
export function tribeMemberRadius(s: GameState,u: Pick<TribeUnit,'species'|'tool'|'outfit'>): number {
  const spec=u.species?worldSpecies(s.world,u.species):null;
  if(spec&&!spec.genome)return Math.max(.8,spec.size*1.2);
  const g=spec?.genome??s.player.genome;
  let body=footprints.get(g);
  if(body===undefined){
    if(g.version===2){const b=resolveCreatureAnatomy(g).bounds;body=Math.hypot(Math.max(Math.abs(b.min.x),Math.abs(b.max.x)),Math.max(Math.abs(b.min.z),Math.abs(b.max.z)));}
    else body=Math.hypot(bodyWidth(g)*.85+(g.parts.some(p=>p.kind==='legs')?.5:0),g.length*1.76);
    footprints.set(g,body);
  }
  return Math.max(body,bodyWidth(g)*.85+(u.tool ? .82 : 0),u.outfit?.back==='pouches'?bodyWidth(g)+.6:0)+.12;
}

/** Only the new roster changes old command physics. Separation keeps its soft
 * RTS spacing; obstacle collision uses the complete rotating body footprint. */
export function moveTribeMember(s: GameState,u: TribeUnit,target: Vec3,positions: readonly {id:number;pos:Vec3}[],speed:number,dt:number,stop:number): boolean {
  if(s.tribe?.version!==2||s.tribe.roster!=='five')return moveUnit(s.world,u,target,positions,speed,dt,stop);
  const radius=tribeMemberRadius(s,u);
  let destination=target,arrival=stop;
  // A resource beside a rock may have a reachable contact point even though its
  // exact center cannot hold this body. Do not ask the route planner to enter it.
  if(s.world.obstacles.some(o=>horizontalDistance(o.pos,target)<o.radius+radius+.15)){
    const candidates:Vec3[]=[];
    for(let i=0;i<24;i++){const angle=i*Math.PI/12,p={x:target.x+Math.sin(angle)*stop*.95,y:target.y,z:target.z+Math.cos(angle)*stop*.95};
      if(s.world.obstacles.every(o=>horizontalDistance(o.pos,p)>o.radius+radius+.16))candidates.push(p);
    }
    candidates.sort((a,b)=>horizontalDistance(a,u.pos)-horizontalDistance(b,u.pos));
    if(candidates[0]){destination=candidates[0];arrival=.03;}
  }
  moveUnit(s.world,u,destination,positions,speed,dt,arrival,radius,.72,radius>6);
  return horizontalDistance(u.pos,target)<=stop+.05;
}
