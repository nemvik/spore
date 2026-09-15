import type { Vec3,World } from './types';
import { groundHeight } from './random';
import { obstacleSegmentEntry, resolveObstacleMotion } from './obstacle-geometry';

/** A roof above the subject must constrain the eye on the subject's side.
 * Grounded scenery retains the existing overview/fade behavior. */
function belowRoofs(point:Vec3,focus:Vec3,world:World):Vec3 {
 if(world.stage!==1)return point;
 const roofs=world.obstacles.filter(o=>o.pos.y>focus.y);
 if(!roofs.length)return point;
 // The visual focus sits above the body's centre and can overlap camera padding
 // while remaining physically below a low roof. Start the camera sweep below
 // that padding; body-overlap escape must not send the eye through the ceiling.
 const anchor={...focus};
 for(const roof of roofs)if(Math.hypot(focus.x-roof.pos.x,focus.z-roof.pos.z)<roof.radius+.75)
  anchor.y=Math.min(anchor.y,roof.pos.y-.75);
 return resolveObstacleMotion({...world,obstacles:roofs},anchor,point,.75);
}
/** Pull the orbit in front of a solid obstruction; never put the eye below terrain. */
export function safeCameraPosition(focus:Vec3,desired:Vec3,world:World):Vec3 {
 const dx=desired.x-focus.x,dy=desired.y-focus.y,dz=desired.z-focus.z;
 let fraction=1;
 for(const obstacle of world.obstacles){
  const entry=obstacleSegmentEntry(focus,desired,obstacle,.65);
  if(entry!==null)fraction=Math.min(fraction,Math.max(.01,entry-.045));
 }
 const camera={x:focus.x+dx*fraction,y:focus.y+dy*fraction,z:focus.z+dz*fraction};
 camera.y=Math.max(camera.y,groundHeight(camera.x,camera.z,world.stage)+2.2,focus.y+2.5);
 // A focus immediately beside a trunk may start within its padded camera cylinder.
 for(const o of world.obstacles)if(!(world.stage===1&&o.pos.y>focus.y)&&Math.hypot(camera.x-o.pos.x,camera.z-o.pos.z)<o.radius+.7&&camera.y>=o.pos.y-.7&&camera.y<o.pos.y+o.height+.8)camera.y=o.pos.y+o.height+.8;
 return belowRoofs(camera,focus,world);
}

/** View blockers can fade; the camera itself must remain outside physical solids. */
export function keepCameraOutside(point:Vec3,focus:Vec3,world:World):Vec3 {
 const safe={...point};
 safe.y=Math.max(safe.y,groundHeight(safe.x,safe.z,world.stage)+2.2,focus.y+2.5);
 for(const obstacle of world.obstacles)if(!(world.stage===1&&obstacle.pos.y>focus.y)&&Math.hypot(safe.x-obstacle.pos.x,safe.z-obstacle.pos.z)<obstacle.radius+.75&&safe.y>=obstacle.pos.y-.75)
  safe.y=Math.max(safe.y,obstacle.pos.y+obstacle.height+.85);
 // Unlike plants and rocks, the terrain cannot be made transparent. Keep the
 // sightline above it as well as keeping the eye above its local ground height.
 for(let step=1;step<16;step++){
  const t=step/16,x=focus.x+(safe.x-focus.x)*t,z=focus.z+(safe.z-focus.z)*t;
  safe.y=Math.max(safe.y,focus.y+(groundHeight(x,z,world.stage)+.35-focus.y)/t);
 }
 return belowRoofs(safe,focus,world);
}

/** Length of the view passing through finite cylinders, not infinitely tall walls. */
function obstructionLength(focus:Vec3,eye:Vec3,world:World):number {
 const dx=eye.x-focus.x,dy=eye.y-focus.y,dz=eye.z-focus.z,a=dx*dx+dz*dz;
 let blocked=0;
 for(const obstacle of world.obstacles){
  const ox=focus.x-obstacle.pos.x,oz=focus.z-obstacle.pos.z,r=obstacle.radius+.45;
  let start=0,end=1;
  if(a<.0001){if(ox*ox+oz*oz>=r*r)continue;}
  else {
   const b=2*(ox*dx+oz*dz),c=ox*ox+oz*oz-r*r,disc=b*b-4*a*c;
   if(disc<=0)continue;
   const root=Math.sqrt(disc);start=Math.max(0,(-b-root)/(2*a));end=Math.min(1,(-b+root)/(2*a));
  }
  if(Math.abs(dy)>.0001){
   const bottom=(obstacle.pos.y-.2-focus.y)/dy,top=(obstacle.pos.y+obstacle.height+.5-focus.y)/dy;
   start=Math.max(start,Math.min(bottom,top));end=Math.min(end,Math.max(bottom,top));
  }else if(focus.y<obstacle.pos.y-.2||focus.y>obstacle.pos.y+obstacle.height+.5)continue;
  blocked+=Math.max(0,end-start);
 }
 return blocked*Math.hypot(dx,dy,dz);
}

/** Keep the chosen orbit distance and bearing, lifting gently for a clearer view. */
export function compositionCamera(focus:Vec3,yaw:number,pitch:number,zoom:number,world:World):Vec3 {
 let best:Vec3|null=null,bestScore=Infinity;
 for(const lift of [0,.12,.24,.36]){
  const elevation=Math.min(1.15,pitch+lift);
  const requested={x:focus.x+Math.sin(yaw)*zoom*Math.cos(elevation),y:focus.y+Math.max(6,zoom*Math.sin(elevation)),z:focus.z+Math.cos(yaw)*zoom*Math.cos(elevation)};
  // Start lifting before the eye reaches a trunk so entering its padding does
  // not cause a sudden upward correction during ordinary movement or orbiting.
  let height=requested.y;
  for(const obstacle of world.obstacles){
   if(world.stage===1&&obstacle.pos.y>focus.y)continue;
   const gap=Math.hypot(requested.x-obstacle.pos.x,requested.z-obstacle.pos.z)-obstacle.radius-.75;
   if(gap>=4)continue;
   const t=Math.max(0,Math.min(1,1-gap/4)),blend=t*t*(3-2*t);
   height=Math.max(height,requested.y+Math.max(0,obstacle.pos.y+obstacle.height+.85-requested.y)*blend);
  }
  const candidate=keepCameraOutside({...requested,y:height},focus,world);
  const score=obstructionLength(focus,candidate,world)*.7+lift*zoom*.6+Math.abs(candidate.y-requested.y)*.35;
  if(score<bestScore){best=candidate;bestScore=score;}
 }
 return best!;
}

/** Interpolate along the orbit: a fast turn must not cut a chord through the body. */
export function smoothCameraOrbit(current:Vec3,desired:Vec3,focus:Vec3,dt:number):Vec3 {
 if(dt<=0)return {...current};
 const cx=current.x-focus.x,cy=current.y-focus.y,cz=current.z-focus.z;
 const dx=desired.x-focus.x,dy=desired.y-focus.y,dz=desired.z-focus.z;
 const from=Math.hypot(cx,cy,cz),to=Math.hypot(dx,dy,dz);
 if(from<.001||to<.001)return {...desired};
 const alpha=1-Math.exp(-Math.max(0,dt)*5),radius=from+(to-from)*alpha;
 const yaw=Math.atan2(cx,cz),turn=Math.atan2(Math.sin(Math.atan2(dx,dz)-yaw),Math.cos(Math.atan2(dx,dz)-yaw));
 const pitch=Math.asin(Math.max(-1,Math.min(1,cy/from))),endPitch=Math.asin(Math.max(-1,Math.min(1,dy/to)));
 const angle=yaw+turn*alpha,elevation=pitch+(endPitch-pitch)*alpha;
 return {x:focus.x+Math.sin(angle)*radius*Math.cos(elevation),y:focus.y+Math.sin(elevation)*radius,z:focus.z+Math.cos(angle)*radius*Math.cos(elevation)};
}
