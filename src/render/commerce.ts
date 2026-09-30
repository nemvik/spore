import * as THREE from 'three';
import type { GameState } from '../game/types';
import { activeDelivery } from '../game/commerce';
import { planetAtlas, wrapLongitude } from '../game/planet-geography';
import { createMachine, animateMachine } from './machine';
import { disposeObject } from './organism';

/** Actual saved atlas path, compressed for a readable transport camera. */
export class CommerceRenderer {
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(45,1,.1,800);
  private identity='';private vehicle:THREE.Group|null=null;private cargo:THREE.Group|null=null;
  private points:THREE.Vector3[]=[];private size=new THREE.Vector2();private focus=new THREE.Vector3();
  private progress=0;
  dispose(){if(!this.identity)return;disposeObject(this.scene);this.scene.clear();this.identity='';this.vehicle=null;this.cargo=null;this.points=[];}
  cameraState(){return {commerce:true,progress:this.progress,position:this.camera.position.toArray(),focus:this.focus.toArray(),vehicle:this.vehicle?.position.toArray()??null,cargo:this.cargo?.visible??false};}
  render(renderer:THREE.WebGLRenderer,s:GameState,yaw:number,pitch:number,zoom:number,reducedMotion=false):void {
    const a=activeDelivery(s);if(!a){this.dispose();return;}const d=a.delivery,air=d.blueprint.carrier==='air',boat=d.blueprint.carrier==='boat';
    const key=JSON.stringify([s.id,a.contract.id,d.id,d.blueprint,d.route]);
    if(this.identity!==key){
      this.dispose();this.identity=key;this.scene.background=new THREE.Color('#c1d7c8');this.scene.fog=new THREE.Fog('#c1d7c8',85,260);
      this.scene.add(new THREE.HemisphereLight('#f1ffdd','#304b45',2.7));const sun=new THREE.DirectionalLight('#fff0c9',3);sun.position.set(-20,35,20);this.scene.add(sun);
      const atlas=planetAtlas(s.homePlanet!)!;
      this.points=d.route.map((id,i)=>{if(!i)return new THREE.Vector3();const p=atlas.cells[d.route[i-1]],n=atlas.cells[id];return new THREE.Vector3(wrapLongitude(n.longitude-p.longitude)*2.4,0,(p.latitude-n.latitude)*2.4);});
      for(let i=1;i<this.points.length;i++)this.points[i].add(this.points[i-1]);
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(1400,1400),new THREE.MeshStandardMaterial({color:boat?'#267784':'#83937a',roughness:.85}));ground.rotation.x=-Math.PI/2;ground.position.y=-.15;this.scene.add(ground);
      for(const [i,p] of this.points.entries()){
        const cell=atlas.cells[d.route[i]],water=cell.surface==='water';
        const tile=new THREE.Mesh(new THREE.BoxGeometry(4.7,.1,4.7),new THREE.MeshStandardMaterial({color:water?'#438c9a':cell.biome==='mountain'?'#a2a193':cell.biome==='desert'?'#c8ba88':'#9baf7c',roughness:.9}));tile.position.copy(p);tile.position.y=-.08;this.scene.add(tile);
        if(i===0||i===this.points.length-1){
          const gate=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:i===0?'#edc679':'#c4ded0',roughness:.75});
          for(const x of [-4.8,4.8]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.16,.3,1.8,8),material);post.position.set(x,.9,0);gate.add(post);const beacon=new THREE.Mesh(new THREE.OctahedronGeometry(.36),material);beacon.position.set(x,2.1,0);gate.add(beacon);}
          gate.position.copy(p);this.scene.add(gate);
        }
      }
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.points.map(p=>p.clone().setY(.02))),new THREE.LineDashedMaterial({color:'#ffe3a1',dashSize:.8,gapSize:.5}));line.computeLineDistances();this.scene.add(line);
      this.vehicle=createMachine(d.blueprint);this.vehicle.name='paid-commerce-carrier';this.scene.add(this.vehicle);
      // Amber crystals on a visible carrier rack; no replacement vehicle geometry.
      this.cargo=new THREE.Group();const amber=new THREE.MeshStandardMaterial({color:'#ffbe53',emissive:'#a74e08',emissiveIntensity:.3,roughness:.4});
      for(const x of [-.35,.35]){const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.28),amber);crystal.position.set(x,1.65,-.5);this.cargo.add(crystal);}
      this.cargo.position.y=(this.vehicle.userData.bounds as THREE.Box3).max.y-1.35;this.vehicle.add(this.cargo);
    }
    const total=this.points.length-1,p=THREE.MathUtils.clamp(d.progress,0,total),i=Math.min(total-1,Math.floor(p)),from=this.points[i],to=this.points[i+1],back=d.phase==='returning';
    this.vehicle!.position.lerpVectors(from,to,p-i);this.vehicle!.position.y=air?5:boat?.08:Number(this.vehicle!.userData.groundClearance)+.04;
    this.vehicle!.rotation.y=Math.atan2(to.x-from.x,to.z-from.z)+(back?Math.PI:0);
    const moving=back?p>1e-8:p<total-1e-8;animateMachine(this.vehicle!,reducedMotion?0:d.elapsed,moving&&!reducedMotion?3:0,moving&&!reducedMotion);this.cargo!.visible=!d.delivered;
    this.progress=p;this.focus.copy(this.vehicle!.position);this.focus.y+=.7;renderer.getSize(this.size);
    const w=Math.max(1,this.size.x),h=Math.max(1,this.size.y);this.camera.aspect=w/h;this.camera.setViewOffset(w,h,-Math.min(350,w*.35)/2,0,w,h);
    const distance=THREE.MathUtils.clamp(Number.isFinite(zoom)?zoom*.6:15,9,36),angle=Number.isFinite(yaw)?yaw:0,elevation=THREE.MathUtils.clamp(Number.isFinite(pitch)?pitch:.65,.22,1.25);
    this.camera.position.set(this.focus.x+Math.sin(angle)*distance*Math.cos(elevation),this.focus.y+distance*Math.sin(elevation),this.focus.z+Math.cos(angle)*distance*Math.cos(elevation));this.camera.lookAt(this.focus);this.camera.updateProjectionMatrix();renderer.render(this.scene,this.camera);
  }
}
