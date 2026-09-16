import * as THREE from 'three';
import type { GameState } from '../game/types';
import { groundHeight } from '../game/random';
import { speciesById } from '../game/content';
/** A single instanced draw anchors life to the terrain at every quality setting. */
export class ContactShadows {
 readonly mesh:THREE.InstancedMesh;
 private matrix=new THREE.Matrix4();private position=new THREE.Vector3();private size=new THREE.Vector3();private rotation=new THREE.Quaternion();
 constructor(){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const c=canvas.getContext('2d')!;
  const falloff=c.createRadialGradient(32,32,2,32,32,31);falloff.addColorStop(0,'rgba(7,24,21,.55)');falloff.addColorStop(.45,'rgba(7,24,21,.3)');falloff.addColorStop(1,'rgba(7,24,21,0)');c.fillStyle=falloff;c.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
  this.mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,fog:true}),220);
  this.mesh.frustumCulled=false;this.mesh.renderOrder=0;this.mesh.name='soft-ground-contact';
 }
 update(s:GameState,showPlayer=true){this.mesh.visible=s.stage===2;if(s.stage!==2)return;let count=0;
  const add=(x:number,z:number,width:number,length:number,heading=0)=>{if(count>=220)return;this.position.set(x,groundHeight(x,z,2)+.035,z);this.size.set(width,1,length);this.rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,heading);this.matrix.compose(this.position,this.rotation,this.size);this.mesh.setMatrixAt(count++,this.matrix);};
  if(showPlayer)add(s.player.pos.x,s.player.pos.z,s.player.genome.width*2.5,s.player.genome.length*4.2,s.player.heading);
  for(const c of s.world.creatures){const spec=speciesById(c.species);add(c.pos.x,c.pos.z,spec.size*2,spec.size*3,c.heading);}
  for(const r of s.world.resources){if(r.amount<.2)continue;const scale=.3+.7*r.amount/r.max;add(r.pos.x,r.pos.z,1.8*scale,1.8*scale);}
  for(const o of s.world.obstacles)add(o.pos.x,o.pos.z,o.radius*2.7,o.radius*2.7);
  this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;
 }
}
