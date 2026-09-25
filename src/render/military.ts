import { fieldRaid } from '../game/defense';
import * as THREE from 'three';
import type { GameState } from '../game/types';
import { cityAt, cityGuard } from '../game/cities';
import { activeMachines, machineDesign } from '../game/machines';
import { vehicleStats, type VehicleBlueprint } from '../game/blueprint';
import { createMachine, animateMachine } from './machine';
import { disposeObject } from './organism';
export class MilitaryPresentation {
  group=new THREE.Group();private control:THREE.Mesh|null=null;private signature='';private models:{root:THREE.Group;bar:THREE.Mesh;model:THREE.Group;ring:THREE.Mesh}[]=[];
  dispose(){disposeObject(this.group);this.group.clear();this.signature='';this.models=[];this.control=null;}
  update(s:GameState){
    const c=cityAt(s),d=s.military?.deployment,m=activeMachines(s),u=d?.cityId===c?.id&&d?.phase==='field'?m?.fleet.find(u=>u.id===d.unitId):null;
    const rows:{blueprint:VehicleBlueprint;pos:{x:number;y:number;z:number};health:number;heading:number;cooldown:number;moving:boolean;color:string}[]=[];
    if(c&&cityGuard(c))rows.push({...c.defense!,heading:0,moving:false,color:'#ef827e'});
    const raid=c&&fieldRaid(s,c);if(raid)rows.push({...raid.unit,blueprint:raid.blueprint,moving:raid.unit.intent==='move',color:'#ef827e'});
    if(u&&m)rows.push({...u,blueprint:machineDesign(m,u),moving:u.intent==='move',color:'#ffda80'});
    const key=JSON.stringify([c?.id,rows.map(r=>[r.blueprint,r.color])]);
    if(key!==this.signature){this.dispose();this.signature=key;for(const r of rows){
      const root=new THREE.Group(),model=createMachine(r.blueprint);root.add(model);
      const ring=new THREE.Mesh(new THREE.RingGeometry(11.88,12,64),new THREE.MeshBasicMaterial({color:r.color,side:THREE.DoubleSide,transparent:true,opacity:.6}));ring.rotation.x=-Math.PI/2;ring.position.y=-.5;root.add(ring);
      const bar=new THREE.Mesh(new THREE.BoxGeometry(4,.3,.3),new THREE.MeshBasicMaterial({color:r.color}));bar.position.y=4;root.add(bar);
      this.models.push({root,model,bar,ring});this.group.add(root);
    }}
    if(c?.fortification!==undefined&&!this.control){this.control=new THREE.Mesh(new THREE.RingGeometry(2.8,3,48),new THREE.MeshBasicMaterial({color:'#8dcfff',side:THREE.DoubleSide}));this.control.rotation.x=-Math.PI/2;this.control.position.set(c.address.position.x,c.address.position.y+.2,c.address.position.z);this.group.add(this.control);}
    rows.forEach((r,i)=>{const v=this.models[i];v.root.position.set(r.pos.x,r.pos.y,r.pos.z);v.model.rotation.y=r.heading;
      v.bar.scale.x=Math.max(.01,r.health/vehicleStats(r.blueprint).durability);v.ring.visible=r.health>0;v.model.rotation.z=r.health===0?.65:0;
      v.model.scale.setScalar(r.health===0?.7:1);v.model.position.y=(v.model.userData.groundClearance as number)*(r.health===0?.7:1)-.8;(v.bar.material as THREE.MeshBasicMaterial).color.set(r.cooldown>1?'#ffffff':r.color);
      animateMachine(v.model,s.world.time,r.moving?3:0,r.cooldown>1);
    });
  }
}
