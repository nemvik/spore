import * as THREE from 'three';
import { CITY_BUILDINGS, type CityBuildingKind } from '../game/city-economy';
import type { BuildingAppearance, BuildingPart } from '../game/building-design';

export function buildingPartGeometry(p:BuildingPart):THREE.BufferGeometry {
  if(p.shape==='box')return new THREE.BoxGeometry(p.size.x,p.size.y,p.size.z);
  const g=p.shape==='dome'?new THREE.SphereGeometry(.5,20,12,0,Math.PI*2,0,Math.PI/2):p.shape==='cone'?new THREE.ConeGeometry(.5,1,20):new THREE.CylinderGeometry(.5,.5,1,20);
  if(p.shape==='dome'){g.scale(p.size.x,p.size.y*2,p.size.z);g.translate(0,-p.size.y/2,0);}else g.scale(p.size.x,p.size.y,p.size.z);
  return g;
}
/** One owned model for the editor and the actual city. Default branch is the exact B model. */
export function createBuilding(kind:CityBuildingKind,appearance?:BuildingAppearance,ground:(x:number,z:number)=>number=()=>0):THREE.Group {
  const group=new THREE.Group(),def=CITY_BUILDINGS[kind];
  const mesh=(g:THREE.BufferGeometry,color:string,x:number,y:number,z:number)=>{const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);group.add(m);return m;};
  if(!appearance||appearance.source==='default') {
    mesh(new THREE.CylinderGeometry(def.radius,def.radius,.45,12),'#728981',0,.1,0);
    if(kind==='house') {
      mesh(new THREE.CylinderGeometry(1.8,2,2.6,10),def.color,0,1.5,0);
      mesh(new THREE.SphereGeometry(1.95,12,8,0,Math.PI*2,0,Math.PI/2),'#619ca6',0,2.8,0);
      for(const dx of [-.7,.7])mesh(new THREE.SphereGeometry(.22,6,6),'#ffeab7',dx,1.8,1.75);
    } else if(kind==='garden') {
      mesh(new THREE.CylinderGeometry(2.1,2.3,.4,10),'#705b3e',0,.5,0);
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;mesh(new THREE.ConeGeometry(.6,1.6,7),def.color,Math.sin(a)*1.3,1.4,Math.cos(a)*1.3);}
      mesh(new THREE.SphereGeometry(.6,8,6),'#d9d381',0,1.3,0);
    } else if(kind==='workshop') {
      mesh(new THREE.CylinderGeometry(2,2.3,2.3,8),def.color,0,1.4,0);
      mesh(new THREE.CylinderGeometry(1.7,2.2,.7,8),'#3b6871',0,2.8,0);
      mesh(new THREE.CylinderGeometry(.5,.7,2.2,8),'#807b72',.8,3.6,0);
      mesh(new THREE.TorusGeometry(.8,.2,6,12),'#ffe1a1',0,1.5,2);
    } else {
      mesh(new THREE.CylinderGeometry(2,2.3,.5,12),def.color,0,.5,0);
      mesh(new THREE.CylinderGeometry(.2,.3,2,8),'#586b60',0,1.5,0);
      mesh(new THREE.SphereGeometry(1.9,12,8,0,Math.PI*2,0,Math.PI/2),'#b9a3df',0,2.3,0);
    }
  } else {
    // Full visible foundation occupies the unchanged circular collision footprint.
    // Top is above the maximum allowed relief; bottom follows the actual terrain.
    const base=new THREE.CylinderGeometry(def.radius,def.radius,1,48),v=base.attributes.position;
    for(let i=0;i<v.count;i++)v.setY(i,v.getY(i)>0?.7:ground(v.getX(i),v.getZ(i))-.15);
    base.computeVertexNormals();mesh(base,'#6c857f',0,0,0);
    for(const p of appearance.creation.design.parts){const m=mesh(buildingPartGeometry(p),p.color,p.position.x,p.position.y,p.position.z);m.rotation.y=p.yaw*Math.PI/180;m.userData.buildingPart=p.id;}
    // Reserved front band carries a fixed, non-colour-only economic sign.
    const z=def.radius-.3;
    mesh(new THREE.BoxGeometry(.8,.8,.12),def.color,0,1.12,z);
    if(kind==='house'){mesh(new THREE.BoxGeometry(.24,.42,.06),'#243f48',0,1.07,z+.09);const roof=mesh(new THREE.ConeGeometry(.3,.22,3),'#243f48',0,1.4,z+.09);roof.rotation.y=Math.PI;}
    else if(kind==='workshop')mesh(new THREE.TorusGeometry(.24,.085,6,10),'#243f48',0,1.12,z+.1);
    else if(kind==='garden'){for(const dx of [-.22,0,.22])mesh(new THREE.ConeGeometry(.13,.45,6),'#243f48',dx,1.13,z+.1);}
    else {mesh(new THREE.BoxGeometry(.07,.5,.06),'#243f48',0,1.07,z+.1);mesh(new THREE.SphereGeometry(.19,8,6),'#243f48',0,1.28,z+.1);}
  }
  return group;
}
