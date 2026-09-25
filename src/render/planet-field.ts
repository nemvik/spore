import { cityAt } from '../game/cities';
import { cityHall, fieldDecorations, CITY_SQUARE_RADIUS, cityLot } from '../game/city-spatial';
import { CITY_BUILDINGS, cityEconomyPreview } from '../game/city-economy';
import * as THREE from 'three';
import type { GameState } from '../game/types';
import { activeField, fieldActorPosition, fieldGround } from '../game/planet-travel';
import { planetAtlas } from '../game/planet-geography';
import { createOrganism, animateOrganism, disposeObject } from './organism';
import { biomeStyle } from '../ui/home-planet';

/** One disposable remote scene, shared WebGL renderer. Inactive fields retain data only. */
export class PlanetFieldRenderer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, .1, 400);
  private identity: unknown = null;
  private cityIdentity: unknown = null;
  private cityLayout = '';
  private lights: {id:number;mesh:THREE.Mesh}[]=[];
  private citizens: THREE.InstancedMesh|null=null;
  private citizenHeads: THREE.InstancedMesh|null=null;
  private matrix = new THREE.Object3D();
  private actor: THREE.Group | null = null;
  private markers: THREE.Mesh[] = [];
  private last = new THREE.Vector3();
  dispose(): void { this.citizens?.dispose();this.citizenHeads?.dispose();disposeObject(this.scene); this.scene.clear(); this.identity = null; this.cityIdentity = null; this.actor = null; this.markers = [];this.cityLayout='';this.lights=[];this.citizens=null;this.citizenHeads=null; }
  render(renderer: THREE.WebGLRenderer, s: GameState, yaw: number, pitch: number, zoom: number): void {
    const field = activeField(s)!; const cell = planetAtlas(s.homePlanet!)!.cells[field.cellId];
    const current=cityAt(s),layout=JSON.stringify([current?.economy?.buildings.map(b=>[b.id,b.kind,b.lot]),current?.economy?.residents.map(r=>r.id)]);
    if (this.identity !== field || this.cityIdentity !== current || this.cityLayout!==layout) {
      this.dispose(); this.identity = field; this.cityIdentity = current;this.cityLayout=layout;
      this.scene.background = new THREE.Color(cell.biome === 'tundra' ? '#bbcdd0' : '#a9c9cf');
      this.scene.fog = new THREE.Fog(this.scene.background, 85, 240);
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555f45, 2.8));
      const light = new THREE.DirectionalLight(0xffe3b4, 2.4); light.position.set(40, 80, 25); this.scene.add(light);
      const ground = new THREE.PlaneGeometry(156, 156, 64, 64); ground.rotateX(-Math.PI / 2);
      const vertices = ground.attributes.position;
      for (let i = 0; i < vertices.count; i++) vertices.setY(i, fieldGround(s.seed, cell, vertices.getX(i), vertices.getZ(i)));
      ground.computeVertexNormals();
      const terrain = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ color: biomeStyle[cell.biome].color, roughness: 1 })); this.scene.add(terrain);
      // Seeded visual geology/vegetation; no extra gameplay entities or ownership.
      for (const {x,z,radius,plants} of fieldDecorations(field,cell)) {
        const mesh = new THREE.Mesh(plants ? new THREE.ConeGeometry(radius, cell.biome === 'rainforest' ? 7 : 1.5, 6) : new THREE.DodecahedronGeometry(radius), new THREE.MeshStandardMaterial({ color: plants ? '#4c6c3d' : '#b1a698', roughness: 1 }));
        mesh.position.set(x, fieldGround(s.seed, cell, x, z) + (plants ? (cell.biome === 'rainforest' ? 3.5 : .75) : .6), z); this.scene.add(mesh);
      }
      const city=cityAt(s);
      if(city){
        const p=city.address.position,hall=cityHall(p),floor=fieldGround(s.seed,cell,hall.x,hall.z);
        const mesh=(g:THREE.BufferGeometry,color:string,x:number,y:number,z:number)=>{const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);this.scene.add(m);return m;};
        // Terrain-following square is traversable; only the circular hall is solid.
        const square=new THREE.CircleGeometry(CITY_SQUARE_RADIUS,32);square.rotateX(-Math.PI/2);
        const v=square.attributes.position;for(let i=0;i<v.count;i++)v.setY(i,fieldGround(s.seed,cell,p.x+v.getX(i),p.z+v.getZ(i))-p.y+.08);square.computeVertexNormals();
        mesh(square,'#d8c494',p.x,p.y,p.z);
        mesh(new THREE.CylinderGeometry(2.5,2.5,5,12),'#e6d9b3',hall.x,floor+2.5,hall.z);
        mesh(new THREE.ConeGeometry(2.5,3,12),'#418e83',hall.x,floor+6.5,hall.z);
        mesh(new THREE.CylinderGeometry(.12,.12,4,8),'#eddaa0',hall.x,floor+9,hall.z);
        mesh(new THREE.OctahedronGeometry(.8),'#ffda80',hall.x,floor+11,hall.z);
        const ring=mesh(new THREE.TorusGeometry(CITY_SQUARE_RADIUS,.1,6,48),'#ffda80',p.x,p.y+.15,p.z);ring.rotation.x=-Math.PI/2;
        for(const b of city.economy?.buildings??[]) {
          const q=cityLot(city,b.lot)!,def=CITY_BUILDINGS[b.kind],y=fieldGround(s.seed,cell,q.x,q.z);
          mesh(new THREE.CylinderGeometry(def.radius,def.radius,.45,12),'#728981',q.x,y+.1,q.z);
          if(b.kind==='house') {
            mesh(new THREE.CylinderGeometry(1.8,2,2.6,10),def.color,q.x,y+1.5,q.z);
            mesh(new THREE.SphereGeometry(1.95,12,8,0,Math.PI*2,0,Math.PI/2),'#619ca6',q.x,y+2.8,q.z);
            for(const dx of [-.7,.7])mesh(new THREE.SphereGeometry(.22,6,6),'#ffeab7',q.x+dx,y+1.8,q.z+1.75);
          } else if(b.kind==='garden') {
            mesh(new THREE.CylinderGeometry(2.1,2.3,.4,10),'#705b3e',q.x,y+.5,q.z);
            for(let i=0;i<5;i++){const a=i*Math.PI*2/5;mesh(new THREE.ConeGeometry(.6,1.6,7),def.color,q.x+Math.sin(a)*1.3,y+1.4,q.z+Math.cos(a)*1.3);}
            mesh(new THREE.SphereGeometry(.6,8,6),'#d9d381',q.x,y+1.3,q.z);
          } else if(b.kind==='workshop') {
            mesh(new THREE.CylinderGeometry(2,2.3,2.3,8),def.color,q.x,y+1.4,q.z);
            mesh(new THREE.CylinderGeometry(1.7,2.2,.7,8),'#3b6871',q.x,y+2.8,q.z);
            mesh(new THREE.CylinderGeometry(.5,.7,2.2,8),'#807b72',q.x+.8,y+3.6,q.z);
            mesh(new THREE.TorusGeometry(.8,.2,6,12),'#ffe1a1',q.x,y+1.5,q.z+2);
          } else {
            mesh(new THREE.CylinderGeometry(2,2.3,.5,12),def.color,q.x,y+.5,q.z);
            mesh(new THREE.CylinderGeometry(.2,.3,2,8),'#586b60',q.x,y+1.5,q.z);
            mesh(new THREE.SphereGeometry(1.9,12,8,0,Math.PI*2,0,Math.PI/2),'#b9a3df',q.x,y+2.3,q.z);
          }
          const lamp=mesh(new THREE.SphereGeometry(.3,8,6),'#9af0c2',q.x,y+4.9,q.z);this.lights.push({id:b.id,mesh:lamp});
        }
        if(city.economy?.residents.length){
          this.citizens=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.3,.65,3,6),new THREE.MeshStandardMaterial({color:'#e5deb5',roughness:.7}),32);
          this.citizenHeads=new THREE.InstancedMesh(new THREE.SphereGeometry(.35,8,6),new THREE.MeshStandardMaterial({color:'#77bdac',roughness:.6}),32);
          this.citizens.count=this.citizenHeads.count=city.economy.residents.length;this.citizens.frustumCulled=this.citizenHeads.frustumCulled=false;
          this.scene.add(this.citizens,this.citizenHeads);
        }
      }
      for (const patch of field.world.patches) {
        const marker = new THREE.Mesh(new THREE.TorusGeometry(2.1, .16, 8, 32), new THREE.MeshStandardMaterial({ color: '#ffe8a1', emissive: '#b58629', emissiveIntensity: .4 }));
        marker.rotation.x = -Math.PI / 2; marker.position.set(patch.center.x, patch.center.y + .3, patch.center.z); this.markers.push(marker); this.scene.add(marker);
        const post = new THREE.Mesh(new THREE.OctahedronGeometry(.8), new THREE.MeshStandardMaterial({ color: '#ffe8a1' })); post.position.set(patch.center.x, patch.center.y + 2, patch.center.z); this.scene.add(post);
      }
      this.actor = createOrganism(s.player.genome); this.scene.add(this.actor); const p = fieldActorPosition(s)!; this.last.set(p.x,p.y,p.z);
    }
    const p = fieldActorPosition(s)!;
    this.actor!.position.set(p.x, p.y, p.z); this.actor!.rotation.y = field.heading;
    const moved = this.last.distanceTo(this.actor!.position) > .001; this.last.copy(this.actor!.position);
    animateOrganism(this.actor!, field.world.time, moved ? 8 : 0, 0, 2, 0, 0, undefined, { position: p, heading: field.heading, groundAt: (x, z) => fieldGround(s.seed, cell, x, z) });
    this.markers.forEach((m, i) => { const mat = m.material as THREE.MeshStandardMaterial; mat.color.set(field.world.patches[i].discovered ? '#88f2bb' : '#ffe8a1'); mat.emissive.set(field.world.patches[i].discovered ? '#2a8460' : '#b58629'); });
    if(current?.economy){
      const preview=cityEconomyPreview(current);
      this.lights.forEach(({id,mesh})=>{const b=current.economy!.buildings.find(b=>b.id===id)!;(mesh.material as THREE.MeshStandardMaterial).color.set(!b.enabled?'#777979':!preview.funded?'#e67968':preview.staffed.includes(id)||b.kind==='house'?'#9af0c2':'#edca7c');});
      current.economy.residents.forEach((r,i)=>{
        if(!this.citizens||!this.citizenHeads)return;
        // Small civic figures represent the saved census. Their motion is visual,
        // never a second simulation or a movement of original tribal units.
        const a=r.id*2.4+field.world.time*.16,rad=1.3+(i%4)*.5,q=current.address.position;
        const x=q.x+Math.sin(a)*rad,z=q.z+Math.cos(a)*rad,y=fieldGround(s.seed,cell,x,z);
        this.matrix.position.set(x,y+.7,z);this.matrix.updateMatrix();this.citizens.setMatrixAt(i,this.matrix.matrix);
        this.matrix.position.y=y+1.4;this.matrix.updateMatrix();this.citizenHeads.setMatrixAt(i,this.matrix.matrix);
      });
      if(this.citizens)this.citizens.instanceMatrix.needsUpdate=true;if(this.citizenHeads)this.citizenHeads.instanceMatrix.needsUpdate=true;
    }
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    const city=cityAt(s),hall=city&&cityHall(city.address.position);
    const nearCity=city&&Math.hypot(p.x-city.address.position.x,p.z-city.address.position.z)<24;
    const focus=nearCity&&hall?{x:(p.x+hall.x)/2,y:p.y+2,z:(p.z+hall.z)/2}:p;
    const distance = nearCity&&city?.economy?Math.max(25,Math.min(100,65+(zoom-25)*1.6)):Math.max(nearCity?40:18,Math.min(45,zoom));
    this.camera.position.set(focus.x + Math.sin(yaw) * distance * Math.cos(pitch), focus.y + Math.max(12, distance * Math.sin(pitch)), focus.z + Math.cos(yaw) * distance * Math.cos(pitch));
    this.camera.lookAt(focus.x, focus.y, focus.z); renderer.render(this.scene, this.camera);
  }
}
