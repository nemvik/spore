import type { CreatureAnatomy } from './creature-anatomy';
import { resolveCreatureAnatomy } from './creature-anatomy';
import type { ContactSphere, ResolvedLimb } from './creature-anatomy';
import type { CreatureGenome, Vec3, World } from './types';
import { advanceLocomotion } from './locomotion';
import { creatureCapabilities } from './creature-capabilities';
import { advanceCreatureTimers, creatureCommunicationPhase, type CreatureActionState } from './creature-actions';
import { contactNormal, obstacleSegmentEntry } from './obstacle-geometry';

export interface CreaturePoseInput {
  time: number; speed: number; airborne: boolean; feeding: number;
  communication: number; position: Vec3; heading: number;
  groundAt: (x: number, z: number) => number;
}
export interface CreaturePose {
  limbs: { partId: string; side: -1 | 1; points: Vec3[]; gesture: number }[];
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
    // Default .8 hands retain the original amplitude; larger resolved hands
    // (including part scale exactly once) grow it smoothly, capped at 1.5×.
    const handGesture=limb.end.kind==='hand'?gesture*Math.min(1.5,Math.sqrt(limb.end.scale/.8)):0;
    const part=g.parts.find(p=>p.id===limb.partId)!;
    const phase=input.time*7+(limb.side<0?Math.PI:0)+(part.axial>stanceMidpoint&&part.kind==='legs'?Math.PI:0);
    const canPose=!anatomy.stanceErrors.length||part.kind==='arms'&&handGesture>0;
    if(canPose){
      if(part.kind==='legs'){
        if(input.airborne){target.y+=.34;target.z-=.18;target.x+=(limb.root.x-target.x)*.18;}
        else if(limb.end.kind==='foot'){
          target.z+=Math.cos(phase)*.12*movement;
          const x=input.position.x+c*target.x+s*target.z,z=input.position.z-s*target.x+c*target.z;
          target.y=input.groundAt(x,z)-input.position.y-bodyOffset.y+Math.max(0,Math.sin(phase))*.19*movement;
        }
      }else{
        target.z-=Math.cos(phase)*.10*movement;
        target.y+=handGesture*(.30+.08*Math.sin(input.time*9));
        target.x+=limb.side*handGesture*.10;
      }
    }
    return {partId:limb.partId,side:limb.side,gesture:handGesture,points:canPose?solveLimbPose(limb,target):limb.points.map(p=>({...p}))};
  });
  return {limbs,bodyOffset,mouthOpen:Math.min(1,Math.max(0,input.feeding)),gesture};
}

export interface CreatureRuntime {
  pos: Vec3; velocity: Vec3; heading: number; energy: number; actions: CreatureActionState;
}
/** jump/communicate are press edges, supplied by InputLatch (never held keys). */
export interface CreatureCommand { x: number; z: number; sprint: boolean; jump: boolean; communicate: boolean }
export interface CreatureStepEnvironment {
  groundAt: (x: number, z: number) => number; obstacles: World['obstacles']; bound: number;
}
const SUPPORT_EPSILON = .00001;
const worldPoint = (point: Vec3, position: Vec3, heading: number): Vec3 => ({
  x: position.x + Math.cos(heading) * point.x + Math.sin(heading) * point.z,
  y: position.y + point.y,
  z: position.z - Math.sin(heading) * point.x + Math.cos(heading) * point.z,
});
/** Finite tops are traversable only from above; a ceiling is never a floor. */
function supportGround(environment: CreatureStepEnvironment, maximum: number): (x: number, z: number) => number {
  return (x, z) => {
    let height = environment.groundAt(x, z);
    for (const obstacle of environment.obstacles) {
      const top = obstacle.pos.y + obstacle.height;
      if (top <= maximum + SUPPORT_EPSILON && top > height && Math.hypot(x - obstacle.pos.x, z - obstacle.pos.z) <= obstacle.radius) height = top;
    }
    return height;
  };
}
export function creatureSupport(
  g: CreatureGenome, runtime: Pick<CreatureRuntime, 'pos' | 'velocity' | 'heading'>,
  environment: CreatureStepEnvironment, derived = resolveCreatureAnatomy(g), maximum = runtime.pos.y - derived.groundClearance,
): { height: number; grounded: boolean; groundAt: (x: number, z: number) => number } {
  const groundAt = supportGround(environment, maximum);
  let height = -Infinity, footMaximum = maximum;
  for (const limb of derived.limbs) if (limb.end.kind === 'foot') {
    const foot = worldPoint(limb.points.at(-1)!, runtime.pos, runtime.heading);
    height = Math.max(height, groundAt(foot.x, foot.z) + derived.groundClearance);
  }
  // Keep the trunk out of terrain even when feet straddle a ridge. Limbs are
  // kinematic; the resolved conservative trunk spheres are the hard envelope.
  for (const sphere of derived.hull) {
    const center = worldPoint(sphere.center, runtime.pos, runtime.heading);
    height = Math.max(height, groundAt(center.x, center.z) + sphere.radius - sphere.center.y);
    // Narrow tops can support the belly while both feet overhang. Recognize
    // the very same padded cap used by the sweep, not just the foot plane.
    for (const obstacle of environment.obstacles) {
      const top = obstacle.pos.y + obstacle.height, resting = top + sphere.radius - sphere.center.y;
      if (resting <= maximum + derived.groundClearance + SUPPORT_EPSILON && Math.hypot(center.x-obstacle.pos.x,center.z-obstacle.pos.z) < obstacle.radius+sphere.radius) {
        height = Math.max(height, resting);
        if (Math.abs(runtime.pos.y-resting) <= SUPPORT_EPSILON) footMaximum = Math.max(footMaximum,top);
      }
    }
  }
  return { height, grounded: runtime.velocity.y <= 0 && runtime.pos.y <= height + SUPPORT_EPSILON, groundAt: supportGround(environment,footMaximum) };
}
/** The renderer and isolated preview consume exactly the runtime support rule. */
export function creaturePoseContext(g: CreatureGenome, runtime: CreatureRuntime, environment: CreatureStepEnvironment, derived = resolveCreatureAnatomy(g)) {
  const support = creatureSupport(g, runtime, environment, derived);
  return { position: runtime.pos, heading: runtime.heading, groundAt: support.groundAt,
    airborne: !support.grounded, communication: creatureCommunicationPhase(runtime.actions.communicationTime) };
}

/** Sweep all trunk spheres together. A cap/side correction translates the whole
 * body. A blocked angular substep is clipped, never applied through an obstacle. */
function sweepTrunk(hull: readonly ContactSphere[], from: Vec3, heading: number, translation: Vec3, turn: number, environment: CreatureStepEnvironment): { pos: Vec3; heading: number; ceiling: boolean; floor: boolean } {
  let pos = { ...from }, remaining = { ...translation };
  const angle = turn;
  let ceiling = false, floor = false;
  for (let iteration = 0; iteration < 6; iteration++) {
    const to = { x: pos.x + remaining.x, y: pos.y + remaining.y, z: pos.z + remaining.z };
    let entry = 1, normal: Vec3 | null = null, contactId = Infinity;
    for (const sphere of hull) {
      const start = worldPoint(sphere.center, pos, heading), end = worldPoint(sphere.center, to, heading + angle);
      const padding = sphere.radius + Math.hypot(sphere.center.x, sphere.center.z) * (1 - Math.cos(angle / 2));
      for (const obstacle of environment.obstacles) {
        const hit = obstacleSegmentEntry(start, end, obstacle, padding);
        if (hit !== null && (hit < entry - 1e-10 || Math.abs(hit - entry) <= 1e-10 && obstacle.id < contactId)) {
          entry = hit; contactId = obstacle.id;
          normal = contactNormal({ x: start.x + (end.x - start.x) * hit, y: start.y + (end.y - start.y) * hit, z: start.z + (end.z - start.z) * hit }, obstacle, padding);
        }
      }
      // Bounds apply to every rotated sphere, not only the origin.
      for (const key of ['x', 'z'] as const) for (const side of [-1, 1]) {
        const limit = environment.bound - padding, delta = (end[key] - start[key]) * side;
        if (delta > 0 && end[key] * side > limit) {
          const hit = Math.max(0, (limit - start[key] * side) / delta);
          if (hit < entry) { entry = hit; normal = { x: 0, y: 0, z: 0 }; normal[key] = -side; contactId = -Infinity; }
        }
      }
    }
    if (!normal) return { pos: to, heading: heading + angle, ceiling, floor };
    if (angle !== 0) return { pos: { ...from }, heading, ceiling: false, floor: false };
    // Translation and rotation are swept separately in every small substep.
    // Never accept a translation at a different orientation than the one swept.
    const fraction = Math.max(0, entry - 1e-7);
    pos = { x: pos.x + remaining.x * fraction, y: pos.y + remaining.y * fraction, z: pos.z + remaining.z * fraction };
    ceiling ||= normal.y < 0; floor ||= normal.y > 0;
    remaining = { x: remaining.x * (1 - fraction), y: remaining.y * (1 - fraction), z: remaining.z * (1 - fraction) };
    const inward = remaining.x * normal.x + remaining.y * normal.y + remaining.z * normal.z;
    if (inward < 0) { remaining.x -= normal.x * inward; remaining.y -= normal.y * inward; remaining.z -= normal.z * inward; }
    else break;
  }
  return { pos, heading, ceiling, floor };
}

/** One bounded fixed step, without world/RNG ownership or locomotion energy fees. */
export function advanceCreature(g: CreatureGenome, runtime: CreatureRuntime, input: CreatureCommand, environment: CreatureStepEnvironment, dt: number, derived?: CreatureAnatomy): CreatureRuntime {
  const result: CreatureRuntime = { ...runtime, pos: { ...runtime.pos }, velocity: { ...runtime.velocity }, actions: { ...runtime.actions } };
  if (!Number.isFinite(dt) || dt <= 0) return result;
  const step = Math.min(.05, dt), anatomy = derived ?? resolveCreatureAnatomy(g), caps = creatureCapabilities(g, anatomy), hull = anatomy.hull;
  result.actions = advanceCreatureTimers(runtime.actions, step);
  const support = creatureSupport(g, result, environment, anatomy);
  if (input.jump && support.grounded && caps.jump.enabled && result.actions.jumpRecharge === 0 && result.energy >= caps.jump.energy) {
    result.velocity.y = caps.jump.velocity; result.energy -= caps.jump.energy; result.actions.jumpRecharge = caps.jump.recharge;
  }
  if (input.communicate && caps.communicate.enabled && result.actions.communicationRecharge === 0) {
    result.actions.communicationTime = caps.communicate.duration; result.actions.communicationRecharge = caps.communicate.recharge;
    result.actions.communicationSerial = (result.actions.communicationSerial + 1) % 1_000_000_001;
  }
  const speed = caps.walk.speed * (input.sprint && runtime.energy > 8 ? 1.55 : 1) * (runtime.energy < 8 ? .55 : 1);
  const motion = advanceLocomotion(result, input, speed, caps.walk, step);
  result.velocity.x = motion.velocity.x; result.velocity.z = motion.velocity.z;
  if (!support.grounded || result.velocity.y > 0) result.velocity.y -= 16 * step;
  else result.velocity.y = 0;
  const turn = Math.atan2(Math.sin(motion.heading - result.heading), Math.cos(motion.heading - result.heading));
  const reach = Math.max(...hull.map(s => Math.hypot(s.center.x, s.center.z)));
  const count = Math.max(1, Math.ceil(Math.abs(turn) / .05), Math.ceil((Math.hypot(result.velocity.x, result.velocity.y, result.velocity.z) * step + reach * Math.abs(turn)) / .1));
  for (let i = 0; i < count; i++) {
    const before = { ...result.pos }, substep = step / count;
    let translation = { x: result.velocity.x * substep, y: result.velocity.y * substep, z: result.velocity.z * substep };
    const destination = { ...result, pos: { x: before.x + translation.x, y: before.y + translation.y, z: before.z + translation.z }, heading: result.heading + turn / count };
    const floor = creatureSupport(g, destination, environment, anatomy, before.y - anatomy.groundClearance);
    if (result.velocity.y <= 0 && destination.pos.y < floor.height) translation.y = floor.height - before.y;
    const swept = sweepTrunk(hull, before, result.heading, translation, 0, environment);
    result.pos = swept.pos;
    result.heading = sweepTrunk(hull, result.pos, result.heading, {x:0,y:0,z:0}, turn / count, environment).heading;
    if (translation.y > 0 && result.velocity.y <= 0) {
      const actualFloor = creatureSupport(g, result, environment, anatomy, before.y - anatomy.groundClearance);
      if (actualFloor.height < result.pos.y) result.pos = sweepTrunk(hull, result.pos, result.heading, {x:0,y:actualFloor.height-result.pos.y,z:0}, 0, environment).pos;
    }
    if (swept.ceiling && result.velocity.y > 0 || swept.floor && result.velocity.y < 0) result.velocity.y = 0;
    if (result.velocity.y <= 0 && result.pos.y >= floor.height - SUPPORT_EPSILON && destination.pos.y <= floor.height + SUPPORT_EPSILON) result.velocity.y = 0;
  }
  result.heading = Math.atan2(Math.sin(result.heading), Math.cos(result.heading));
  return result;
}
