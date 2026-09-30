import { SpaceCoreView } from './space-core';
import { SpaceDiscoveriesView } from './space-discoveries';
import { SpaceCombatView } from './space-combat';
import { activeSpaceBattle } from '../game/space-combat-content';
import { ShipOutfitView } from './space-outfit';
import { SpaceAlliesView } from './space-allies';
import { SpaceEmbassyView } from './space-embassy';
import { empireAt } from '../game/space-empires';
import { SpaceColonyView } from './space-colony';
import { quarantineAt } from '../game/space-events-content';
import { colonyCapacity } from '../game/space-economy';
import { foreignGround } from '../game/space-life';
import * as THREE from 'three';
import type { GameState } from '../game/types';
import type { SpaceScale } from '../game/space-types';
import { planetAtlas } from '../game/planet-geography';
import { createShip, animateShip } from './ship';
import { disposeObject } from './organism';
import { planetSystem } from '../game/galaxy';
import { activeForeignPlanet, foreignSpecimenTargets } from '../game/space-expedition';
import { createForeignGlobe, ForeignSurfaceView, foreignClimateColors, updateForeignGlobe } from './space-biome';

const normal = (longitude: number, latitude: number) => { const a = longitude * Math.PI / 180, b = latitude * Math.PI / 180; return new THREE.Vector3(Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)); };
const views: Record<SpaceScale, { radius: number; center: THREE.Vector3; offset: THREE.Vector3; distance: number }> = {
  surface: { radius: 34, center: new THREE.Vector3(0, -34, 0), offset: new THREE.Vector3(), distance: 19 },
  orbit: { radius: 17, center: new THREE.Vector3(0, -18, -25), offset: new THREE.Vector3(0, 2, 0), distance: 23 },
  system: { radius: 5, center: new THREE.Vector3(0, -3, 0), offset: new THREE.Vector3(0, 3, 14), distance: 29 },
};
/** A single active scene in the existing WebGL context. The globe uses the real home atlas. */
export class SpaceRenderer {
  private scene = new THREE.Scene(); private camera = new THREE.PerspectiveCamera(48, 1, .1, 1600);
  private ship: THREE.Group | null = null; private globe: THREE.Group | null = null; private star: THREE.Group | null = null; private beacon: THREE.Mesh | null = null;
  private surface: ForeignSurfaceView | null = null; private beam: THREE.Line | null = null; private homeAtlas = false;
  private colony: SpaceColonyView | null = null;
  private embassy: SpaceEmbassyView | null = null;
  private outfit: ShipOutfitView | null = null;
  private allies: SpaceAlliesView | null = null;
  private combat: SpaceCombatView | null = null;
  private discoveries: SpaceDiscoveriesView | null = null;
  private core: SpaceCoreView | null = null;
  private key = ''; private focus = new THREE.Vector3(); private lastPos = new THREE.Vector3(); private size = new THREE.Vector2();
  dispose() { disposeObject(this.scene); this.scene.clear(); this.ship = null; this.globe = null; this.star = null; this.beacon = null; this.surface = null; this.beam = null; this.colony = null; this.embassy = null; this.outfit = null; this.allies = null; this.combat = null; this.discoveries = null; this.core = null; this.homeAtlas = false; this.key = ''; }
  cameraState() { return { position: this.camera.position.toArray(), focus: this.focus.toArray(), ship: this.ship?.position.toArray() ?? null, globe: this.globe?.position.toArray() ?? null, renderedHomeAtlas: this.homeAtlas, foreignSurface: this.surface?.world.id ?? null }; }
  private build(s: GameState) {
    const p = s.space!; this.dispose(); this.key = JSON.stringify([p.homePlanetId, p.location!.planetId, p.ship!.creation, !!p.discoveries, !!p.core]);
    this.scene.background = new THREE.Color('#071724'); this.scene.add(new THREE.HemisphereLight('#b9e5f5', '#16464f', 2.7));
    const sun = new THREE.DirectionalLight('#ffe0aa', 3.2); sun.position.set(-40, 50, -35); this.scene.add(sun);
    const stars: number[] = []; for (let i = 0; i < 450; i++) { const a = i * 2.399963, b = Math.acos(1 - 2 * (i + .5) / 450); stars.push(Math.sin(b) * Math.cos(a) * 500, Math.cos(b) * 500, Math.sin(b) * Math.sin(a) * 500); }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3)); this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#d5e5e9', size: 1.1, sizeAttenuation: true })));
    const system = planetSystem(p.homePlanetId, p.location!.planetId)!;
    this.homeAtlas = system.index === 0;
    if (!this.homeAtlas) { this.globe = createForeignGlobe(system); this.scene.add(this.globe); }
    else {
    this.globe = new THREE.Group(); this.scene.add(this.globe);
    const ocean = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshStandardMaterial({ color: '#206482', roughness: .6, metalness: .25 })); this.globe.add(ocean);
    const atlas = planetAtlas(s.homePlanet!), colors: Record<string, string> = { ocean: '#286588', shelf: '#479498', rainforest: '#387c66', grassland: '#8eaa72', desert: '#c4ab7a', tundra: '#d9dfcf', mountain: '#888d83' };
    if (atlas) {
      const points: number[] = [], shades: number[] = [];
      for (const cell of atlas.cells) {
        const color = new THREE.Color(colors[cell.biome]), r = 1.002 + Math.max(0, cell.elevationMeters) / 80000;
        const corners = [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]].map(([x, y]) => normal(cell.longitude + x, cell.latitude + y).multiplyScalar(r));
        for (const index of [0, 1, 2, 0, 2, 3]) { points.push(...corners[index].toArray()); shades.push(color.r, color.g, color.b); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3)); geometry.computeVertexNormals();
      this.globe.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, side: THREE.DoubleSide })));
      this.globe.quaternion.setFromUnitVectors(normal(atlas.anchors[2].longitude, atlas.anchors[2].latitude), new THREE.Vector3(0, 1, 0));
    }
    this.globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.025, 48, 24), new THREE.MeshBasicMaterial({ color: '#6fbac8', transparent: true, opacity: .08, depthWrite: false })));
    }
    this.star = new THREE.Group(); this.star.add(new THREE.Mesh(new THREE.SphereGeometry(8, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffce80' }))); this.star.position.set(-65, 8, -50); this.scene.add(this.star);
    this.beacon = new THREE.Mesh(new THREE.TorusGeometry(3.2, .08, 6, 48), new THREE.MeshBasicMaterial({ color: '#dce9a4' })); this.beacon.rotation.x = -Math.PI / 2; this.scene.add(this.beacon);
    this.ship = createShip(p.ship!.creation.blueprint); this.ship.scale.setScalar(.8); this.scene.add(this.ship);
    this.outfit = new ShipOutfitView(); this.ship.add(this.outfit.group);
    this.allies = new SpaceAlliesView(); this.scene.add(this.allies.group);
    this.combat = new SpaceCombatView(); this.scene.add(this.combat.group);
    if (p.discoveries) { this.discoveries = new SpaceDiscoveriesView(system, p.discoveries.society.planetId); this.scene.add(this.discoveries.group); }
    if (p.core) { this.core = new SpaceCoreView(system); this.scene.add(this.core.group); }
    this.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#97eddc',transparent:true,opacity:.8}));this.beam.visible=false;this.scene.add(this.beam);
  }
  render(renderer: THREE.WebGLRenderer, s: GameState, yaw: number, pitch: number, zoom: number, reducedMotion: boolean, selected: string | null = null) {
    const p = s.space, l = p?.location; if (!p?.ship || !l) return;
    const key = JSON.stringify([p.homePlanetId, l.planetId, p.ship.creation, !!p.discoveries, !!p.core]); if (this.key !== key) this.build(s);
    this.outfit!.sync(p, p.elapsed, reducedMotion);
    const world = activeForeignPlanet(s), system = planetSystem(p.homePlanetId, l.planetId)!;
    if (world && (!this.surface || this.surface.world !== world)) { if (this.surface) { this.scene.remove(this.surface.group); this.surface.dispose(); } this.surface = new ForeignSurfaceView(world,system); this.scene.add(this.surface.group); }
    if (!world && this.surface) { this.scene.remove(this.surface.group); this.surface.dispose(); this.surface = null; }
    if (this.surface && p.expedition) { const targets=foreignSpecimenTargets(s); this.surface.sync(p.expedition,targets.find(t=>t.life.id===selected)?.life.id ?? targets[0]?.life.id ?? null,world!.elapsed,reducedMotion); }
    const settlement = world ? p.economy?.colonies.find(item => item.planetId === world.id) : null;
    if (this.colony && this.colony.id !== settlement?.id) { this.scene.remove(this.colony.group); this.colony.dispose(); this.colony = null; }
    if (settlement && !this.colony) { this.colony = new SpaceColonyView(settlement.id, settlement, foreignGround(world!.seed, -7, -5)); this.scene.add(this.colony.group); }
    if (this.colony && settlement) { this.colony.sync(settlement, colonyCapacity(s, settlement), p.economy!.elapsed, reducedMotion, !!quarantineAt(p.events?.current, settlement.planetId)); this.colony.group.visible = !p.leg || p.leg.elapsed < p.leg.duration * .8; }
    const society = world ? empireAt(s, world.id) : null;
    if (this.embassy && this.embassy.id !== society?.id) { this.scene.remove(this.embassy.group); this.embassy.dispose(); this.embassy = null; }
    if (society && !this.embassy) { this.embassy = new SpaceEmbassyView(society.id, society, foreignGround(world!.seed, 7, -5)); this.scene.add(this.embassy.group); }
    if (this.embassy && society) { this.embassy.sync(society, p.elapsed, reducedMotion); this.embassy.group.visible = !p.leg || p.leg.elapsed < p.leg.duration * .8; }
    (this.scene.background as THREE.Color).set(world ? system.living ? '#315861' : system.temperature>0 ? '#76534c' : '#4b657d' : '#071724');
    if (p.expedition?.version === 2) {
      const climate = p.expedition.worlds.find(planet => planet.id === l.planetId);
      if (climate && !this.homeAtlas) updateForeignGlobe(this.globe!, system, climate);
      if (world) (this.scene.background as THREE.Color).copy(foreignClimateColors(world).sky);
    }
    const from = views[l.scale], to = p.leg ? views[p.leg.to.scale] : from;
    let t = p.leg ? p.leg.elapsed / p.leg.duration : 0; t = t * t * (3 - 2 * t);
    const offset = from.offset.clone().lerp(to.offset, t);
    const source = new THREE.Vector3(l.pos.x, l.pos.y, l.pos.z), destination = p.leg ? new THREE.Vector3(p.leg.to.pos.x, p.leg.to.pos.y, p.leg.to.pos.z) : source;
    this.ship!.position.copy(source.lerp(destination, t).add(offset)); this.ship!.rotation.y = l.heading;
    const moving = this.lastPos.distanceToSquared(this.ship!.position) > .00001 || !!p.leg;
    animateShip(this.ship!, p.elapsed, moving, reducedMotion, p.ship.health > 0); this.lastPos.copy(this.ship!.position);
    this.allies!.sync(p, offset, this.ship!.position, reducedMotion);
    this.combat!.sync(p, offset, this.ship!.position, reducedMotion);
    this.discoveries?.sync(p, reducedMotion);
    this.core?.sync(p, reducedMotion);
    this.globe!.position.copy(from.center).lerp(to.center, t); this.globe!.scale.setScalar(THREE.MathUtils.lerp(from.radius, to.radius, t));
    if (p.leg && p.leg.from.systemId !== p.leg.to.systemId) this.globe!.scale.multiplyScalar(1 - .85 * Math.sin(Math.PI * t));
    this.globe!.visible = !world;
    if (this.surface) { this.surface.group.visible = !p.leg || p.leg.elapsed < p.leg.duration * .8; this.globe!.visible = !this.surface.group.visible; }
    const last = p.expedition?.actions.at(-1), effect = world && last && last.planetId === world.id && p.elapsed - last.at < .65;
    this.beam!.visible = !!effect;
    if (effect) {
      const item = world.life.find(item=>item.id===last.lifeId) ?? p.expedition!.cargo.find(item=>item.id===last.lifeId);
      if (item) { const pos=this.beam!.geometry.getAttribute('position');pos.setXYZ(0,this.ship!.position.x,this.ship!.position.y,this.ship!.position.z);pos.setXYZ(1,item.pos.x,item.pos.y+.5,item.pos.z);pos.needsUpdate=true;this.beam!.geometry.computeBoundingSphere(); }
      else this.beam!.visible=false;
    }
    const climateTool = p.expedition?.version === 2 ? p.expedition.biosphere.tool : 'off';
    if (world && !p.leg && climateTool !== 'off') {
      this.beam!.visible = true;
      const position = this.beam!.geometry.getAttribute('position');
      position.setXYZ(0, this.ship!.position.x, this.ship!.position.y, this.ship!.position.z);
      position.setXYZ(1, this.ship!.position.x, .1, this.ship!.position.z);
      position.needsUpdate = true; this.beam!.geometry.computeBoundingSphere();
      (this.beam!.material as THREE.LineBasicMaterial).color.set(climateTool === 'warm' ? '#ffc275' : climateTool === 'cool' ? '#9aceff' : '#b9ecd3');
    } else (this.beam!.material as THREE.LineBasicMaterial).color.set('#97eddc');
    this.star!.visible = l.scale === 'system' || p.leg?.to.scale === 'system';
    this.beacon!.position.copy(offset); this.beacon!.position.y -= l.scale === 'surface' ? 0 : 1;
    this.focus.copy(this.ship!.position); const battle = activeSpaceBattle(p);
    if (battle) this.focus.lerp(this.combat!.enemy.position, .5);
    const distance = THREE.MathUtils.lerp(from.distance, to.distance, t) * THREE.MathUtils.clamp(zoom / 25, .7, 2) + (battle ? 20 : 0);
    const elevation = THREE.MathUtils.clamp(pitch, .12, 1.2);
    this.camera.position.set(this.focus.x + Math.sin(yaw) * distance * Math.cos(elevation), this.focus.y + Math.sin(elevation) * distance, this.focus.z + Math.cos(yaw) * distance * Math.cos(elevation)); this.camera.lookAt(this.focus);
    renderer.getSize(this.size); this.camera.aspect = this.size.x / Math.max(1, this.size.y); this.camera.updateProjectionMatrix(); renderer.render(this.scene, this.camera);
  }
}
