import * as THREE from 'three';
import { activeCell, cellCanHunt, cellScale, cellTier } from '../game/cell-growth';
import type { GameState } from '../game/types';

const colors={mouth:0xf4db9b,spines:0xffac73,shell:0x9ddfff,hurt:0xeb6b68,toxin:0xc4a0fa,growth:0xbdf5aa};
/** A bounded set of reusable meshes; read-only presentation never changes saves. */
export class CellPresentation {
  group=new THREE.Group();
  private sites=Array.from({length:3},()=>{
    const g=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:0xf4db9b,wireframe:true});
    const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(1.1,0),mat);g.add(shell);
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.5,1.65,40),new THREE.MeshBasicMaterial({color:0xf4db9b,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=-.75;g.add(ring);this.group.add(g);return g;
  });
  private cue=new THREE.Mesh(new THREE.RingGeometry(.8,1,40),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  private threat=new THREE.Mesh(new THREE.RingGeometry(1.2,1.35,40),new THREE.MeshBasicMaterial({color:0xee8474,transparent:true,opacity:.8,side:THREE.DoubleSide}));
  constructor(){this.cue.rotation.x=this.threat.rotation.x=-Math.PI/2;this.group.add(this.cue,this.threat);}
  update(s:GameState,reducedMotion:boolean){
    const cell=activeCell(s);this.group.visible=!!cell;if(!cell)return;
    this.sites.forEach((g,i)=>{const site=cell.sites[i];g.visible=!site.collected;g.position.set(site.pos.x,site.pos.y+1,site.pos.z);g.rotation.y=reducedMotion?0:s.world.time*.35;const ready=cellTier(s)>=i+1;g.scale.setScalar(ready?1:.7);g.children.forEach(m=>(m as THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>).material.color.setHex(ready?0xf7df9d:0x929bab));});
    const age=cell.contact?(s.tick-cell.contact.tick)/60:Infinity;this.cue.visible=age<1.2;
    if(cell.contact&&this.cue.visible){const c=cell.contact;this.cue.position.set(c.pos.x,c.pos.y-.4,c.pos.z);this.cue.material.color.setHex(colors[c.kind]);this.cue.material.opacity=.85*(1-age/1.2);this.cue.scale.setScalar((c.kind==='growth'?3:1.6)*cellScale(s)*(reducedMotion?1:1+age));}
    const nearest=s.world.creatures.filter(c=>c.species==='needle'&&Math.hypot(c.pos.x-s.player.pos.x,c.pos.z-s.player.pos.z)<20).sort((a,b)=>Math.hypot(a.pos.x-s.player.pos.x,a.pos.z-s.player.pos.z)-Math.hypot(b.pos.x-s.player.pos.x,b.pos.z-s.player.pos.z))[0];
    this.threat.visible=!!nearest;if(nearest){this.threat.position.set(nearest.pos.x,nearest.pos.y-.5,nearest.pos.z);this.threat.material.color.setHex(cellCanHunt(s,nearest)?0xbdf5aa:0xee8474);}
  }
}
