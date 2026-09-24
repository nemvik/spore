import * as THREE from 'three';
import type { GameState } from '../game/types';
import type { TribeUnit } from '../game/era-types';
import { CHIEF, chiefContact, chiefMember } from '../game/tribe-chief';
import { groundHeight } from '../game/random';
import { disposeObject } from './organism';
import type { CreatureVoiceRecipe } from './audio';

export function chiefSpeaking(s:GameState,id:number):boolean {
  return s.stage===3&&s.tribe?.version===2&&s.tribe.chief?.active?.member===id&&s.tribe.chief.active.phase==='speak'&&chiefContact(s);
}
/** An overhead office emblem on the original unit; never a replacement body or outfit. */
export function syncChiefMarker(group:THREE.Group,s:GameState,u:TribeUnit,height:number,time:number,reducedMotion:boolean):void {
  let marker=group.getObjectByName('chief-marker') as THREE.Group|undefined;
  if(s.stage!==3||chiefMember(s)?.id!==u.id){if(marker){marker.removeFromParent();disposeObject(marker);}return;}
  if(!marker){
    marker=new THREE.Group();marker.name='chief-marker';group.add(marker);
    const badge=new THREE.Group();badge.name='chief-badge';marker.add(badge);
    const gold=new THREE.MeshBasicMaterial({color:0xffd68e});
    for(let i=-1;i<=1;i++){const ray=new THREE.Mesh(new THREE.ConeGeometry(.15,i===0?.75:.5,5),gold);ray.position.set(i*.31,i===0?.22:.1,0);badge.add(ray);}
    const band=new THREE.Mesh(new THREE.TorusGeometry(.43,.07,5,24,Math.PI),gold);band.rotation.z=Math.PI;band.position.y=.02;badge.add(band);
    const reach=new THREE.Mesh(new THREE.RingGeometry(CHIEF.reach-.04,CHIEF.reach,64),new THREE.MeshBasicMaterial({color:0xf5d79e,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false}));reach.rotation.x=-Math.PI/2;reach.name='chief-reach';reach.raycast=()=>{};marker.add(reach);
    const progress=new THREE.Group();progress.name='chief-progress';marker.add(progress);
    for(let i=0;i<24;i++){const arc=new THREE.Mesh(new THREE.RingGeometry(1.05,1.15,3,1,i*Math.PI/12,.21),new THREE.MeshBasicMaterial({color:0xc9f2af,side:THREE.DoubleSide,depthWrite:false}));arc.rotation.x=-Math.PI/2;arc.raycast=()=>{};progress.add(arc);}
  }
  const t=s.tribe!;if(t.version!==2)return;const e=t.chief!.active,contact=chiefContact(s),speaking=chiefSpeaking(s,u.id);
  marker.userData.status=e?e.phase==='travel'?'travel':contact?'speaking':'contact':t.chief!.cooldown>0?'cooldown':'ready';
  const badge=marker.getObjectByName('chief-badge')!;badge.position.y=height+(speaking&&!reducedMotion?Math.sin(time*5)*.08:0);
  badge.rotation.y=-group.rotation.y;badge.scale.setScalar(e&&!contact&&e.phase==='speak'?.8:1);
  const ground=groundHeight(u.pos.x,u.pos.z,2)-u.pos.y+.07,reach=marker.getObjectByName('chief-reach') as THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
  reach.position.y=ground;reach.visible=!!e;reach.material.color.setHex(contact?0xc9f2af:0xf5d79e);
  const progress=marker.getObjectByName('chief-progress')!;progress.position.y=ground+.02;
  progress.children.forEach((arc,i)=>arc.visible=e?.phase==='speak'&&i<Math.floor((1-e.remaining/CHIEF.speak)*24));
}
export class ChiefObserver {
  private state:GameState|null=null;private phase='';private member:number|null=null;private outcome:unknown=null;
  observe(s:GameState):CreatureVoiceRecipe|null {
    const c=s.stage===3&&s.tribe?.version===2?s.tribe.chief:null,e=c?.active,r=c?.result;
    let frequency:number|null=null;
    if(this.state===s){
      if(r&&r!==this.outcome)frequency=r.reason==='success'?880:98;
      else if(e?.phase==='speak'&&this.phase!=='speak'&&chiefContact(s))frequency=330;
      else if(c?.member&&c.member!==this.member)frequency=392;
    }
    this.state=s;this.phase=e?.phase??'';this.member=c?.member??null;this.outcome=r??null;
    return frequency===null?null:{wave:frequency===98?'triangle':'sine',frequency,gain:.08,duration:.5};
  }
}
