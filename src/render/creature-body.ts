import * as THREE from 'three';
import { creatureSurfacePoint } from '../game/creature-anatomy';
import type { ResolvedLimb } from '../game/creature-anatomy';
import type { CreatureGenome, Vec3 } from '../game/types';

/** Same surface and UV convention used for anatomy and editor picking. */
export function createCreatureSurface(g: CreatureGenome): THREE.BufferGeometry {
  const positions:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
  const rings=96,sides=48,skin=g.body.skin;
  const primary=new THREE.Color().setHSL(g.hue/360,.60,.43),secondary=new THREE.Color().setHSL(skin.secondaryHue/360,.58,.61);
  for(let i=0;i<=rings;i++){
    const axial=-Math.cos(i/rings*Math.PI),v=(axial+1)/2;
    for(let j=0;j<=sides;j++){
      const u=j/sides,angle=u*Math.PI*2,point=creatureSurfacePoint(g,axial,angle);
      positions.push(point.x,point.y,point.z);uv.push(u,v);
      const stripes=Math.sin(v*(16+g.pattern*3)*skin.patternScale*Math.PI+Math.cos(angle*3));
      const pebble=Math.sin(angle*17*skin.patternScale)*Math.sin(v*83*skin.patternScale);
      const plates=Math.pow(Math.abs(Math.sin(angle*8*skin.patternScale)*Math.sin(v*36*skin.patternScale)),.3);
      const finish=skin.finish==='pebbled'?pebble*.18:skin.finish==='plated'?(plates-.5)*.36:0;
      const color=primary.clone().lerp(secondary,Math.max(0,stripes)*skin.contrast*.72).multiplyScalar(.87+.13*Math.cos(angle)+finish);
      colors.push(color.r,color.g,color.b);
      if(i<rings&&j<sides){const k=i*(sides+1)+j;indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.getAttribute('normal');
  for(let i=0;i<=rings;i++){
    const first=i*(sides+1),last=first+sides;
    const normal=i===0||i===rings?new THREE.Vector3(0,0,i===0?-1:1):new THREE.Vector3(normals.getX(first)+normals.getX(last),normals.getY(first)+normals.getY(last),normals.getZ(first)+normals.getZ(last)).normalize();
    if(i===0||i===rings)for(let j=first;j<=last;j++)normals.setXYZ(j,normal.x,normal.y,normal.z);
    else {normals.setXYZ(first,normal.x,normal.y,normal.z);normals.setXYZ(last,normal.x,normal.y,normal.z);}
  }
  return geometry;
}

type LimbMaterials={skin:THREE.Material;detail:THREE.Material;sole:THREE.Material};
function ellipsoid(parent:THREE.Object3D,material:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number):THREE.Mesh{
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),material);
  mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}

/** All coordinates and end sizes have already been scaled and reflected by anatomy. */
export function createCreatureLimb(limb: ResolvedLimb, materials: LimbMaterials): THREE.Group {
  const group=new THREE.Group();group.name='creature-limb';group.userData.partId=limb.partId;group.userData.side=limb.side;
  const bones:THREE.Mesh[]=[],joints:THREE.Mesh[]=[];
  for(let i=0;i<limb.points.length;i++){
    const radius=limb.radii[Math.max(0,i-1)];
    const joint=ellipsoid(group,materials.detail,0,0,0,radius,radius,radius);joint.name='creature-joint';joint.userData.jointIndex=i;joints.push(joint);
    if(i){const bone=new THREE.Mesh(new THREE.CylinderGeometry(i === limb.points.length-1 && limb.end.kind === 'foot' ? 0 : radius*.8,limb.radii[Math.max(0,i-2)],1,10),materials.skin);bone.name='creature-bone';bone.castShadow=true;group.add(bone);bones.push(bone);}
  }
  const end=new THREE.Group();group.add(end);
  if(limb.end.kind!=='none'){
    const size=limb.end.scale;
    if(limb.end.kind==='foot'){
      end.name='creature-foot';end.userData.style=limb.end.style;
      // The sole's lowest vertex is exactly the IK endpoint (Y=0).
      ellipsoid(end,materials.sole,0,.055*size,.07*size,.19*size,.055*size,.25*size);
      ellipsoid(end,materials.skin,0,.10*size,.025*size,.145*size,.07*size,.15*size);
      for(let i=-1;i<=1;i++){
        const claw=limb.end.style==='claw';
        const toe=ellipsoid(end,claw?materials.detail:materials.skin,i*.11*size,.045*size,(claw?.29:.23)*size,.052*size,.045*size,(claw?.18:.095)*size);
        toe.name=claw?'creature-claw':'creature-toe';toe.rotation.y=-i*.20;
      }
    }else if(limb.end.style==='palm'){
      end.name='creature-hand';ellipsoid(end,materials.skin,0,-.07*size,0,.15*size,.18*size,.075*size);
      for(let i=0;i<4;i++)ellipsoid(end,materials.detail,(i-1.5)*.067*size,-.25*size,.025*size,.035*size,.14*size,.04*size);
      ellipsoid(end,materials.detail,limb.side*.17*size,-.10*size,.04*size,.065*size,.10*size,.045*size);
    }else{
      end.name='creature-pincer';ellipsoid(end,materials.skin,0,-.05*size,0,.17*size,.13*size,.10*size);
      for(const side of [-1,1]){
        const finger=ellipsoid(end,materials.detail,side*.14*size,-.22*size,0,.085*size,.23*size,.09*size);finger.rotation.z=-side*.35;
      }
    }
  }
  group.userData.footRadius=limb.end.kind==='foot'?limb.radii.at(-1):0;
  group.userData.bones=bones;group.userData.joints=joints;group.userData.end=end;
  poseCreatureLimb(group,limb.points);return group;
}
const up=new THREE.Vector3(0,1,0);
export function poseCreatureLimb(group:THREE.Group,points:Vec3[]):void{
  const bones=group.userData.bones as THREE.Mesh[],joints=group.userData.joints as THREE.Mesh[];
  points.forEach((p,i)=>{
    joints[i].position.set(p.x,p.y+(i===points.length-1?group.userData.footRadius:0),p.z);
    if(i){const a=points[i-1],delta=new THREE.Vector3(p.x-a.x,p.y-a.y,p.z-a.z),bone=bones[i-1];bone.position.set((p.x+a.x)/2,(p.y+a.y)/2,(p.z+a.z)/2);bone.scale.y=delta.length();bone.quaternion.setFromUnitVectors(up,delta.normalize());}
  });
  const p=points.at(-1)!;(group.userData.end as THREE.Group).position.set(p.x,p.y,p.z);group.userData.points=points;
}

/** A conservative framing sphere around anatomy, with room for face and end details. */
export function creaturePresentationBounds(bounds:{min:Vec3;max:Vec3}):{center:THREE.Vector3;radius:number}{
  const box=new THREE.Box3(new THREE.Vector3(bounds.min.x,bounds.min.y,bounds.min.z),new THREE.Vector3(bounds.max.x,bounds.max.y,bounds.max.z));
  return {center:box.getCenter(new THREE.Vector3()),radius:box.getSize(new THREE.Vector3()).length()/2+.4};
}
