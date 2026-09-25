import * as THREE from 'three';
import type { BuildingCreation } from '../game/building-design';
import { createBuilding } from './building';
import { disposeObject } from './organism';

/** Shares the game's renderer/context. No RAF, DOM listeners, campaign or GPU cache ownership. */
export class BuildingPreview {
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(38,1,.1,80);
  private model:THREE.Group|null=null;
  private selection:THREE.BoxHelper|null=null;
  private key='';
  private selected:string|null=null;
  yaw=.65; pitch=.28; zoom=14;
  constructor(){this.scene.background=new THREE.Color('#c2d6d5');this.scene.add(new THREE.HemisphereLight(0xffffff,0x536257,3));const sun=new THREE.DirectionalLight(0xffe7bd,3);sun.position.set(5,12,8);this.scene.add(sun);}
  dispose(){disposeObject(this.scene);this.scene.clear();this.model=null;this.selection=null;this.key='';}
  render(renderer:THREE.WebGLRenderer,c:BuildingCreation,selected:string|null,viewport:{x:number;y:number;width:number;height:number}) {
    const key=JSON.stringify(c.design);
    const changed=key!==this.key;
    if(changed){if(this.model){disposeObject(this.model);this.scene.remove(this.model);}this.model=createBuilding(c.design.kind,{version:1,source:'creation',creation:c});this.scene.add(this.model);this.key=key;}
    if(changed||selected!==this.selected){
    this.selected=selected;
    if(this.selection){disposeObject(this.selection);this.scene.remove(this.selection);this.selection=null;}
    const part=this.model!.children.find(p=>p.userData.buildingPart===selected);
    if(part){this.selection=new THREE.BoxHelper(part,0xf8e2a0);this.scene.add(this.selection);}
    }
    const w=Math.max(1,viewport.width),h=Math.max(1,viewport.height);
    this.camera.aspect=w/h;this.camera.position.set(Math.sin(this.yaw)*this.zoom*Math.cos(this.pitch),2.8+Math.sin(this.pitch)*this.zoom,Math.cos(this.yaw)*this.zoom*Math.cos(this.pitch));this.camera.lookAt(0,2.8,0);this.camera.updateProjectionMatrix();
    renderer.setClearColor('#b9cdcc');renderer.clear();
    renderer.setViewport(viewport.x,innerHeight-viewport.y-h,w,h);renderer.setScissor(viewport.x,innerHeight-viewport.y-h,w,h);renderer.setScissorTest(true);renderer.render(this.scene,this.camera);renderer.setScissorTest(false);renderer.setViewport(0,0,innerWidth,innerHeight);
  }
  pick(x:number,y:number,rect:DOMRect):string|null {
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x-rect.x)/rect.width*2-1,-(y-rect.y)/rect.height*2+1),this.camera);
    return ray.intersectObjects(this.model?.children??[]).find(hit=>hit.object.userData.buildingPart)?.object.userData.buildingPart??null;
  }
  targets(rect:DOMRect){return this.model?.children.filter(m=>m.userData.buildingPart).map(m=>{const p=m.position.clone().project(this.camera);return {id:m.userData.buildingPart,x:rect.x+(p.x+1)*rect.width/2,y:rect.y+(1-p.y)*rect.height/2};})??[];}
}
