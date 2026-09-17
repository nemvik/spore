import { resolveCreatureAnatomy, type CreatureAnatomy } from './creature-anatomy';
import { jawContacts } from './anatomy';
import { bodyWidth } from './body-shape';
import { computeStats } from './genome';
import { mouthWorldPosition } from './locomotion';
import type { CreatureGenome, Stats, Vec3 } from './types';

export interface CreatureCapabilities {
  walk: { enabled: boolean; speed: number; turnRate: number; acceleration: number; steeringGrip: number; stride: number };
  jump: { enabled: boolean; velocity: number; energy: number; recharge: number };
  bite: { enabled: boolean; damage: number; energy: number; duration: number; recharge: number; contacts: { mouthOrigin: Vec3; reach: number }[] };
  communicate: { enabled: boolean; mode: 'voice' | 'gesture' | 'none'; range: number; duration: number; recharge: number };
  reasons: Partial<Record<'walk' | 'jump' | 'bite' | 'communicate', string>>;
}
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
/** Pure by default; draft revision owners may supply their shared anatomy/stats. */
export function creatureCapabilities(g:CreatureGenome, derived?:CreatureAnatomy, stats?:Stats):CreatureCapabilities {
  const anatomy=derived??resolveCreatureAnatomy(g), phenotype=stats??computeStats(g,anatomy), mass=phenotype.mass;
  let strength=0,stance=0;
  for(const p of g.parts){
    if(p.kind!=='legs'||p.limb?.end.kind!=='foot')continue;
    const tissue=p.scale*(p.mirrored?1.6:1);strength+=tissue;
    stance+=tissue*(.82+.18*(1-Math.abs(p.axial)))*(.88+.12*Math.abs(Math.sin(p.angle)));
  }
  const feet=anatomy.limbs.filter(l=>l.end.kind==='foot'), meanLength=feet.reduce((sum,l)=>sum+l.lengths.reduce((a,b)=>a+b,0),0)/Math.max(1,feet.length);
  const stride=clamp(meanLength/1.16,.55,1.8),drive=-Math.expm1(-.65*strength)/-Math.expm1(-.65*1.6);
  const footing=strength?stance/strength:0,excessLoad=Math.max(0,mass-1.2),load=1+excessLoad*.15;
  const enabled=anatomy.supportCount>=2&&anatomy.stanceErrors.length===0;
  const acceleration=clamp((7+5*drive)*footing/(load+Math.max(0,bodyWidth(g)-1)*.12),2,18);
  const clawShare=feet.filter(l=>l.end.kind==='foot'&&l.end.style==='claw').length/Math.max(1,feet.length),padShare=feet.filter(l=>l.end.kind==='foot'&&l.end.style==='pad').length/Math.max(1,feet.length);
  const contacts=jawContacts(g),mouthStrength=g.parts.reduce((sum,p)=>sum+(['jaw','filter','proboscis'].includes(p.kind)?p.scale*(p.mirrored?1.6:1):0),0);
  const hands=anatomy.limbs.some(l=>l.end.kind==='hand'),mode=mouthStrength>0?'voice':hands?'gesture':'none';
  const reasons:CreatureCapabilities['reasons']={};
  if(!enabled){reasons.walk=anatomy.stanceErrors.join(' ')||'Chůze potřebuje alespoň dvě dosažitelná chodidla.';reasons.jump=reasons.walk;}
  if(!contacts.length)reasons.bite='Kousnutí potřebuje čelist.';
  if(mode==='none')reasons.communicate='Přidej ústa pro hlas nebo ruku pro gesto.';
  return {
    walk:{enabled,speed:enabled?clamp((3+2.15*drive)*Math.sqrt(stride)/load,1.6,6.8):0,turnRate:clamp((3.1+2.4*drive)*footing/(1+excessLoad*.24+Math.max(0,g.length-1)*.45),1.35,7),acceleration,steeringGrip:(acceleration+2.5*drive*footing)*(1+.1*clawShare),stride},
    jump:{enabled,velocity:enabled?clamp((3.8+1.2*drive)*Math.sqrt(stride)/Math.sqrt(load),3,7)*(1+.05*padShare):0,energy:5,recharge:1.2},
    bite:{enabled:contacts.length>0,damage:contacts.length?phenotype.damage:0,energy:1.6,duration:.5,recharge:.65,contacts},
    communicate:{enabled:mode!=='none',mode,range:mode==='voice'?6+2*Math.min(2,mouthStrength):mode==='gesture'?3:0,duration:.8,recharge:2},reasons,
  };
}
export interface CreatureBiteQuery {ready:boolean;distance:number;reason:'mouth'|'distance'|'blocked'|null;range:number;mouthOrigin?:Vec3;}
/** One best physical jaw contact. Callers apply one hit to the selected target. */
export function queryCreatureBite(g:CreatureGenome,position:Vec3,heading:number,target:{pos:Vec3;radius:number},blocked:(from:Vec3,to:Vec3)=>boolean):CreatureBiteQuery {
  const contacts=jawContacts(g).map(jaw=>{
    const mouthOrigin=mouthWorldPosition(jaw,position,heading),distance=Math.hypot(target.pos.x-mouthOrigin.x,target.pos.y-mouthOrigin.y,target.pos.z-mouthOrigin.z),range=jaw.reach+target.radius;
    const reason=distance>range?'distance':blocked(mouthOrigin,target.pos)?'blocked':null;
    return {ready:reason===null,distance,reason,range,mouthOrigin} as CreatureBiteQuery;
  });
  const rank=(c:CreatureBiteQuery)=>c.ready?0:c.reason==='blocked'?1:2;
  return contacts.sort((a,b)=>rank(a)-rank(b)||a.distance-b.distance)[0]??{ready:false,distance:Infinity,reason:'mouth',range:0};
}
