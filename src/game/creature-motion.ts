import type { CreatureAnatomy } from './creature-anatomy';
import { resolveCreatureAnatomy } from './creature-anatomy';
import type { ResolvedLimb } from './creature-anatomy';
import type { CreatureGenome, Vec3 } from './types';

export interface CreaturePoseInput {
  time: number; speed: number; airborne: boolean; feeding: number;
  communication: number; position: Vec3; heading: number;
  groundAt: (x: number, z: number) => number;
}
export interface CreaturePose {
  limbs: { partId: string; side: -1 | 1; points: Vec3[] }[];
  bodyOffset: Vec3; mouthOpen: number; gesture: number;
}
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function atDistance(origin: Vec3, toward: Vec3, length: number, fallback: Vec3): Vec3 {
  let x=toward.x-origin.x,y=toward.y-origin.y,z=toward.z-origin.z;
  let d=Math.hypot(x,y,z);
  if(d<1e-10){x=fallback.x;y=fallback.y;z=fallback.z;d=Math.hypot(x,y,z)||1;}
  return {x:origin.x+x/d*length,y:origin.y+y/d*length,z:origin.z+z/d*length};
}

/** Deterministic FABRIK: at most eight backward/forward passes, fixed bone lengths. */
export function solveLimbPose(limb: ResolvedLimb, target: Vec3): Vec3[] {
  const points=limb.points.map(p=>({...p})),n=points.length-1;
  if(!n)return points;
  const directions=points.slice(1).map((p,i)=>({x:p.x-points[i].x,y:p.y-points[i].y,z:p.z-points[i].z}));
  const reach=limb.lengths.reduce((sum,l)=>sum+l,0);
  const goal=distance(limb.root,target)>reach?atDistance(limb.root,target,reach,directions[0]):target;
  if(distance(limb.root,goal)>=reach-1e-8){
    for(let i=1;i<=n;i++)points[i]=atDistance(points[i-1],goal,limb.lengths[i-1],directions[i-1]);
    return points;
  }
  // A perfectly straight authored chain has no bend plane. Seed one from its
  // rest direction and side so FABRIK cannot remain trapped on that line.
  const axis=atDistance({x:0,y:0,z:0},{x:goal.x-limb.root.x,y:goal.y-limb.root.y,z:goal.z-limb.root.z},1,directions[0]);
  const collinear=points.slice(1,-1).every(p=>{
    const x=p.x-limb.root.x,y=p.y-limb.root.y,z=p.z-limb.root.z;
    return Math.hypot(y*axis.z-z*axis.y,z*axis.x-x*axis.z,x*axis.y-y*axis.x)<1e-7;
  });
  if(collinear&&n>1){
    const perpendicular=Math.abs(axis.x)<.9?{x:0,y:axis.z,z:-axis.y}:{x:-axis.z,y:0,z:axis.x};
    const bend=atDistance({x:0,y:0,z:0},perpendicular,1,{x:0,y:0,z:1});
    const amplitude=.5*Math.sqrt(Math.max(0,reach*reach-distance(limb.root,goal)**2));
    for(let i=1;i<n;i++){
      const amount=Math.sin(i/n*Math.PI)*amplitude*limb.side;
      points[i].x+=bend.x*amount;points[i].y+=bend.y*amount;points[i].z+=bend.z*amount;
    }
  }
  for(let iteration=0;iteration<8;iteration++){
    points[n]={...goal};
    for(let i=n-1;i>=0;i--)points[i]=atDistance(points[i+1],points[i],limb.lengths[i],{x:-directions[i].x,y:-directions[i].y,z:-directions[i].z});
    points[0]={...limb.root};
    for(let i=1;i<=n;i++)points[i]=atDistance(points[i-1],points[i],limb.lengths[i-1],directions[i-1]);
    if(distance(points[n],goal)<=.001)break;
  }
  // Near a two-bone chain's inner reach limit, FABRIK converges too slowly
  // for the fixed pass budget. Intersect its two bone spheres in the resting
  // bend plane as a constant-time fallback; neither length nor root changes.
  if(n===2&&distance(points[n],goal)>.001){
    const [a,b]=limb.lengths,d=Math.max(Math.abs(a-b),Math.min(reach,distance(limb.root,goal)));
    if(d<1e-10){
      points[1]=atDistance(limb.root,limb.points[1],a,directions[0]);points[2]={...limb.root};
    }else{
      const rest=directions[0],projection=rest.x*axis.x+rest.y*axis.y+rest.z*axis.z;
      const perpendicular={x:rest.x-axis.x*projection,y:rest.y-axis.y*projection,z:rest.z-axis.z*projection};
      const fallback=Math.abs(axis.x)<.9?{x:0,y:axis.z*limb.side,z:-axis.y*limb.side}:{x:-axis.z*limb.side,y:0,z:axis.x*limb.side};
      const bend=atDistance({x:0,y:0,z:0},perpendicular,1,fallback);
      const along=Math.max(-a,Math.min(a,(a*a-b*b+d*d)/(2*d))),height=Math.sqrt(Math.max(0,a*a-along*along));
      points[1]={x:limb.root.x+axis.x*along+bend.x*height,y:limb.root.y+axis.y*along+bend.y*height,z:limb.root.z+axis.z*along+bend.z*height};
      points[2]={x:limb.root.x+axis.x*d,y:limb.root.y+axis.y*d,z:limb.root.z+axis.z*d};
    }
  }
  return points;
}

/** Joint positions are creature-local; only terrain queries use world coordinates. */
export function sampleCreaturePose(g: CreatureGenome, input: CreaturePoseInput, derived?: CreatureAnatomy): CreaturePose {
  const anatomy=derived??resolveCreatureAnatomy(g),movement=Math.min(1,Math.max(0,input.speed)/3);
  const gesture=Math.min(1,Math.max(0,input.communication));
  const legAxials=g.parts.filter(part=>part.kind==='legs').map(part=>part.axial);
  const stanceMidpoint=legAxials.length?(Math.min(...legAxials)+Math.max(...legAxials))/2:0;
  // Keep the root stable. Any later trunk bob must be subtracted from foot goals.
  const bodyOffset={x:0,y:0,z:0},c=Math.cos(input.heading),s=Math.sin(input.heading);
  const limbs=anatomy.limbs.map(limb=>{
    const rest=limb.points.at(-1)!,target={...rest};
    const part=g.parts.find(p=>p.id===limb.partId)!;
    const phase=input.time*7+(limb.side<0?Math.PI:0)+(part.axial>stanceMidpoint&&part.kind==='legs'?Math.PI:0);
    if(!anatomy.stanceErrors.length){
      if(part.kind==='legs'){
        if(input.airborne){target.y+=.34;target.z-=.18;target.x+=(limb.root.x-target.x)*.18;}
        else if(limb.end.kind==='foot'){
          target.z+=Math.cos(phase)*.12*movement;
          const x=input.position.x+c*target.x+s*target.z,z=input.position.z-s*target.x+c*target.z;
          target.y=input.groundAt(x,z)-input.position.y-bodyOffset.y+Math.max(0,Math.sin(phase))*.19*movement;
        }
      }else{
        target.z-=Math.cos(phase)*.10*movement;
        target.y+=gesture*(.30+.08*Math.sin(input.time*9));
        target.x+=limb.side*gesture*.10;
      }
    }
    return {partId:limb.partId,side:limb.side,points:anatomy.stanceErrors.length?limb.points.map(p=>({...p})):solveLimbPose(limb,target)};
  });
  return {limbs,bodyOffset,mouthOpen:Math.min(1,Math.max(0,input.feeding)),gesture};
}
