import * as THREE from 'three';
import type { Creature, GameState } from '../game/types';
import { animalStatus, domesticAnimal } from '../game/tribe-domestication';
import { groundHeight } from '../game/random';
import { worldSpecies } from '../game/npc-genome';
import { disposeObject } from './organism';
import type { CreatureVoiceRecipe } from './audio';

/** A decoration on the original world model, never a second animal mesh. */
export function syncAnimalMarker(body:THREE.Group,s:GameState,c:Creature,time:number,reducedMotion:boolean):void{
 const d=s.tribe?.version===2?s.tribe.domestication:null,a=domesticAnimal(s,c.id),e=d?.active?.creature===c.id?d.active:null;
 let marker=body.getObjectByName('animal-marker') as THREE.Group|undefined;
 if(s.stage!==3||(!a&&!e)){if(marker){marker.removeFromParent();disposeObject(marker);}return;}
 if(!marker){marker=new THREE.Group();marker.name='animal-marker';body.add(marker);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.35,.055,5,36),new THREE.MeshBasicMaterial({color:0xd8c186,depthWrite:false}));ring.rotation.x=Math.PI/2;ring.name='animal-owner-ring';marker.add(ring);
  const cargo=new THREE.Group();cargo.name='animal-cargo';marker.add(cargo);
  for(let i=0;i<6;i++){const parcel=new THREE.Mesh(new THREE.DodecahedronGeometry(.18),new THREE.MeshStandardMaterial({color:0xd7b16d,roughness:.8}));parcel.position.set(i%2?-.65:.65,.9,-.55+Math.floor(i/2)*.33);cargo.add(parcel);}
  const flag=new THREE.Mesh(new THREE.OctahedronGeometry(.23),new THREE.MeshBasicMaterial({color:0xcce9ac}));flag.name='animal-ownership';flag.position.y=2.2;marker.add(flag);
 }
 const status=a?animalStatus(s,a):e!.phase;marker.userData.status=status;
 const warning=['hungry','afraid','unattended','lost'].includes(status),color=warning?0xef9d72:a?0xc6e9a9:0xf4cf82;
 const ring=marker.getObjectByName('animal-owner-ring') as THREE.Mesh<THREE.TorusGeometry,THREE.MeshBasicMaterial>;ring.material.color.setHex(color);ring.position.y=(groundHeight(c.pos.x,c.pos.z,2)+.06-c.pos.y)/worldSpecies(s.world,c.species).size;
 marker.getObjectByName('animal-cargo')!.children.forEach((node,i)=>node.visible=i<Math.ceil(a?.cargo??0));
 const flag=marker.getObjectByName('animal-ownership') as THREE.Mesh<THREE.OctahedronGeometry,THREE.MeshBasicMaterial>;flag.material.color.setHex(color);flag.scale.setScalar(e?.phase==='lure'?.6+e.progress/8*.6:1);flag.position.y=2.2+(reducedMotion?0:Math.sin(time*3)*.08);
}
const voice=(frequency:number):CreatureVoiceRecipe=>({wave:'sine',frequency,gain:.07,duration:.35});
export class DomesticationObserver {
 private state:GameState|null=null;
 private phase='';private outcome:unknown=null;private animals=new Map<number,{hunger:number;cargo:number}>();
 observe(s:GameState):CreatureVoiceRecipe|null{
  const d=s.stage===3&&s.tribe?.version===2?s.tribe.domestication:null,phase=d?.active?.phase??'',outcome=d?.result??null;
  let cue:CreatureVoiceRecipe|null=null;
  if(this.state===s){
   if(outcome&&outcome!==this.outcome)cue=voice(outcome.reason==='success'?740:110);
   else if(phase!==this.phase&&phase==='lure')cue=voice(440);
   for(const a of d?.animals??[]){const c=s.world.creatures.find(c=>c.id===a.creature),before=this.animals.get(a.creature);if(before&&c){if(c.hunger<before.hunger-10)cue??=voice(520);else if(a.cargo<before.cargo)cue??=voice(620);}}
  }
  this.state=s;this.phase=phase;this.outcome=outcome;this.animals=new Map((d?.animals??[]).map(a=>[a.creature,{hunger:s.world.creatures.find(c=>c.id===a.creature)?.hunger??0,cargo:a.cargo}]));return cue;
 }
}
