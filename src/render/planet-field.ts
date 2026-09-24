import { cityAt } from '../game/cities';
import { cityHall, fieldDecorations, CITY_SQUARE_RADIUS } from '../game/city-spatial';
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
  private actor: THREE.Group | null = null;
  private markers: THREE.Mesh[] = [];
  private last = new THREE.Vector3();
  dispose(): void { disposeObject(this.scene); this.scene.clear(); this.identity = null; this.cityIdentity = null; this.actor = null; this.markers = []; }
  render(renderer: THREE.WebGLRenderer, s: GameState, yaw: number, pitch: number, zoom: number): void {
    const field = activeField(s)!; const cell = planetAtlas(s.homePlanet!)!.cells[field.cellId];
    if (this.identity !== field || this.cityIdentity !== cityAt(s)) {
      this.dispose(); this.identity = field; this.cityIdentity = cityAt(s);
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
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    const city=cityAt(s),hall=city&&cityHall(city.address.position);
    const nearCity=city&&Math.hypot(p.x-city.address.position.x,p.z-city.address.position.z)<24;
    const focus=nearCity&&hall?{x:(p.x+hall.x)/2,y:p.y+2,z:(p.z+hall.z)/2}:p;
    const distance = Math.max(nearCity?40:18, Math.min(45, zoom));
    this.camera.position.set(focus.x + Math.sin(yaw) * distance * Math.cos(pitch), focus.y + Math.max(12, distance * Math.sin(pitch)), focus.z + Math.cos(yaw) * distance * Math.cos(pitch));
    this.camera.lookAt(focus.x, focus.y, focus.z); renderer.render(this.scene, this.camera);
  }
}
