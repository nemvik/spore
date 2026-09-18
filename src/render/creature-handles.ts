import * as THREE from 'three';
import { type CreatureAnatomy, resolveCreatureAnatomy } from '../game/creature-anatomy';
import type { CreatureGenome, Vec3 } from '../game/types';
import type { CreatureSelection } from '../ui/creature-editor';
export interface CreatureHandle {selection:CreatureSelection;point:Vec3;side:number;label:string;}
export function creatureHandleDescriptors(g:CreatureGenome,derived?:CreatureAnatomy):CreatureHandle[]{
 const spine:CreatureHandle[]=g.body.spine.map((n,i)=>({selection:{kind:'spine',nodeId:n.id},point:{x:0,y:n.bend*g.width+.13*n.axial*n.axial,z:n.axial*1.76*g.length},side:1,label:`${i+1}`}));
 for(const limb of (derived??resolveCreatureAnatomy(g)).limbs){const p=g.parts.find(p=>p.id===limb.partId)!;p.limb!.joints.forEach((j,i)=>spine.push({selection:{kind:'joint',partId:p.id,jointId:j.id},point:limb.points[i+1],side:limb.side,label:`${p.kind==='legs'?'N':'P'}${i+1}`}));spine.push({selection:{kind:'end',partId:p.id},point:{...limb.points.at(-1)!,y:limb.points.at(-1)!.y-.18},side:limb.side,label:p.kind==='legs'?'Ch':'R'});}
 return spine;
}
export interface CreatureDrag {plane:THREE.Plane;origin:THREE.Vector3;inverse:THREE.Matrix4;side:number;}
export function startCreatureDrag(ray:THREE.Ray,point:THREE.Vector3,normal:THREE.Vector3,frame:THREE.Matrix4,side:number):CreatureDrag|null {const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal.clone().normalize(),point),hit=ray.intersectPlane(plane,new THREE.Vector3());return hit?{plane,origin:hit.clone().applyMatrix4(frame.clone().invert()),inverse:frame.clone().invert(),side}:null;}
export function creatureDragDelta(drag:CreatureDrag,ray:THREE.Ray):Vec3|null {const hit=ray.intersectPlane(drag.plane,new THREE.Vector3());if(!hit)return null;hit.applyMatrix4(drag.inverse).sub(drag.origin);return{x:hit.x*drag.side,y:hit.y,z:hit.z};}
export function createCreatureHandles(g:CreatureGenome,selection:CreatureSelection|null,derived?:CreatureAnatomy):THREE.Group {
 const group=new THREE.Group();group.name='creature-handles';
 for(const h of creatureHandleDescriptors(g,derived)){
  const active=JSON.stringify(h.selection)===JSON.stringify(selection),node=new THREE.Group();node.position.set(h.point.x,h.point.y,h.point.z);node.userData.creatureHandle=h;
  const ring=new THREE.Mesh(new THREE.TorusGeometry(active?.13:.10,.025,6,20),new THREE.MeshBasicMaterial({color:active?0xffdf91:0xc3eac4,depthTest:false,depthWrite:false}));ring.renderOrder=30;node.add(ring);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),new THREE.MeshBasicMaterial({visible:false}));node.add(ball);
  // Labels distinguish node numbers and terminal slots without relying on colour.
  if(typeof document!=='undefined'){const canvas=document.createElement('canvas');canvas.width=96;canvas.height=48;const context=canvas.getContext('2d')!;context.fillStyle='#112d38';context.fillRect(0,0,96,48);context.strokeStyle=active?'#ffdf91':'#c3eac4';context.strokeRect(1,1,94,46);context.fillStyle='#eff5e5';context.font='bold 28px sans-serif';context.textAlign='center';context.fillText(h.label,48,34);const texture=new THREE.CanvasTexture(canvas),label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));label.position.set(.17,.12,0);label.scale.set(.32,.16,1);label.renderOrder=31;label.raycast=()=>{};node.add(label);}
  group.add(node);
 }
 return group;
}
