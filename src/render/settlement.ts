import { musicPerformance } from '../game/tribe-music';
import { worldSpecies } from '../game/npc-genome';
import { creaturePresentationBounds } from './creature-body';
import { bodyWidth } from '../game/body-shape';
import * as THREE from 'three';
import type { GameState, Vec3 } from '../game/types';
import type { ToolId, TribeBuilding, TribeNeighbour, TribeUnit } from '../game/era-types';
import { neighbourDisposition } from '../game/tribe-society';
import { neighbourMaxHealth } from '../game/tribe-neighbours';
import { groundHeight } from '../game/random';
import { speciesGroundClearance } from '../game/anatomy';
import { createOrganism, createSpeciesModel, animateOrganism, animateSpeciesModel, disposeObject, organismGroundClearance } from './organism';
import { applyLivingFinish, setPartnerActivity } from './world-style';
import type { CommandPickVolume, CommandUnitRef } from './command-picking';
import { syncCulturalOutfit } from './culture';

const COLORS = { timber: 0x72543e, roof: 0xb39d72, clay: 0x9e7054, pale: 0xf1dfb4, selected: 0xc8f2b0, food: 0xdcb777, hostile: 0xdb9276, ally: 0x96d0b2, conquered: 0xe8be78 };
type Bar = { group: THREE.Group; fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; width: number };
type MemberView = { group: THREE.Group; body: THREE.Group; equipment: THREE.Group; ring: THREE.Mesh; health: Bar; cargo: THREE.Group; key: string; tool: ToolId | null; time: number; previous: Vec3; heading: number; radius: number; speed: number };
type BuildingView = { group: THREE.Group; built: THREE.Group; scaffold: THREE.Group; progress: Bar; health: Bar; key: string };
type NeighbourView = { group: THREE.Group; accent: THREE.MeshStandardMaterial; relation: Bar; health: Bar; key: string };

function material(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .03 });
}
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const node = new THREE.Mesh(geometry, mat); node.position.set(x, y, z); node.castShadow = true; node.receiveShadow = true; parent.add(node); return node;
}
function groundRing(parent: THREE.Group, radius: number, color: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(radius, radius + .12, 40); geometry.rotateX(-Math.PI / 2);
  const node = mesh(parent, geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .92, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  node.castShadow = false; node.raycast = () => {}; return node;
}
function bar(parent: THREE.Group, width: number, color: number, z: number): Bar {
  const group = new THREE.Group(); group.position.set(0, .06, z); group.name = 'status-bar'; parent.add(group);
  const back = mesh(group, new THREE.PlaneGeometry(width + .1, .23), new THREE.MeshBasicMaterial({ color: 0x263b35, transparent: true, opacity: .86, depthWrite: false, side: THREE.DoubleSide }));
  back.rotation.x = -Math.PI / 2; back.castShadow = false; back.raycast = () => {}; back.renderOrder = 1;
  // Keep both layers in the transparent pass: its background otherwise covers an opaque fill.
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(width, .15), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  fill.rotation.x = -Math.PI / 2; fill.position.y = .012; fill.raycast = () => {}; fill.renderOrder = 2; group.add(fill);
  return { group, fill, width };
}
function fillBar(value: Bar, fraction: number): void {
  const amount = THREE.MathUtils.clamp(fraction, 0, 1); value.fill.scale.x = Math.max(.001, amount); value.fill.position.x = -(1 - amount) * value.width / 2;
}
function drapeGround(node: THREE.Mesh, origin: Vec3, heading: number, stage: number, offset: number): void {
  const vertices = node.geometry.getAttribute('position'), cos = Math.cos(heading), sin = Math.sin(heading);
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i) + node.position.x, z = vertices.getZ(i) + node.position.z;
    vertices.setY(i, groundHeight(origin.x + cos * x + sin * z, origin.z - sin * x + cos * z, stage) + offset - origin.y - node.position.y);
  }
  vertices.needsUpdate = true; node.geometry.computeBoundingSphere();
}
function alignBar(value: Bar, origin: Vec3, heading: number, stage: number): void {
  const cos = Math.cos(heading), sin = Math.sin(heading); let high = -Infinity;
  for (const x of [-value.width / 2 - .05, 0, value.width / 2 + .05]) for (const dz of [-.12, 0, .12]) {
    const z = value.group.position.z + dz;
    high = Math.max(high, groundHeight(origin.x + cos * x + sin * z, origin.z - sin * x + cos * z, stage));
  }
  value.group.position.y = high - origin.y + .065;
}

/** The same equipment geometry is mounted on members and marks its workshop. */
export function equipment(tool: ToolId): THREE.Group {
  const group = new THREE.Group(); group.name = `tool-${tool}`;
  const wood = material(COLORS.timber), reed = material(COLORS.food), hide = material(COLORS.clay), pale = material(COLORS.pale);
  group.userData.ownedMaterials = [wood, reed, hide, pale];
  if (tool === 'basket') {
    mesh(group, new THREE.CylinderGeometry(.43, .31, .6, 9, 1, true), reed, 0, .05);
    mesh(group, new THREE.CylinderGeometry(.31, .31, .07, 9), wood, 0, -.23);
    for (const y of [-.18, .02, .26]) { const band = mesh(group, new THREE.TorusGeometry(.39, .025, 4, 12), wood, 0, y); band.rotation.x = Math.PI / 2; }
    const handle = mesh(group, new THREE.TorusGeometry(.32, .04, 5, 12, Math.PI), wood, 0, .3); handle.rotation.z = 0;
  } else if (tool === 'spear') {
    mesh(group, new THREE.CylinderGeometry(.045, .055, 2.05, 6), wood, 0, .25);
    const head = mesh(group, new THREE.ConeGeometry(.18, .52, 4), pale, 0, 1.49); head.scale.z = .35;
    for (const y of [1.09, 1.18]) { const band = mesh(group, new THREE.TorusGeometry(.065, .018, 4, 8), hide, 0, y); band.rotation.x = Math.PI / 2; }
    group.rotation.z = -.22;
  } else if (tool === 'flute') {
    const pipe = mesh(group, new THREE.CylinderGeometry(.09,.12,1.5,8), reed, 0,.2); pipe.rotation.z = -.6;
    for(let i=0;i<4;i++) { const hole=mesh(group,new THREE.SphereGeometry(.035,6,4),wood,.08+i*.14,.31+i*.2,.095); hole.scale.z=.3; }
    mesh(group,new THREE.TorusGeometry(.105,.018,4,8),pale,-.36,-.32).rotation.x=Math.PI/2;
  } else if (tool === 'rattle') {
    for(const x of [-.22,.22]) { mesh(group,new THREE.CylinderGeometry(.04,.06,.75,6),wood,x,-.1); const bulb=mesh(group,new THREE.SphereGeometry(.24,9,6),reed,x,.4); bulb.scale.y=1.25; mesh(group,new THREE.TorusGeometry(.24,.025,4,9),hide,x,.4).rotation.x=Math.PI/2; }
  } else if (tool === 'drum') {
    mesh(group, new THREE.CylinderGeometry(.44, .32, .62, 10), hide);
    mesh(group, new THREE.CylinderGeometry(.45, .45, .045, 12), pale, 0, .33);
    mesh(group, new THREE.CylinderGeometry(.34, .34, .045, 12), reed, 0, -.32);
    for (let i = 0; i < 6; i++) { const angle = i * Math.PI / 3; mesh(group, new THREE.CylinderGeometry(.022, .022, .61, 4), pale, Math.sin(angle) * .36, 0, Math.cos(angle) * .36); }
  } else {
    const bag = mesh(group, new THREE.SphereGeometry(1, 10, 7), hide, 0, -.04); bag.scale.set(.36, .48, .24);
    mesh(group, new THREE.CylinderGeometry(.085, .16, .22, 7), reed, 0, .45);
    mesh(group, new THREE.CylinderGeometry(.1, .1, .06, 7), wood, 0, .59);
    const strap = mesh(group, new THREE.TorusGeometry(.4, .028, 4, 14), pale, 0, .1); strap.scale.x = .72;
  }
  return group;
}

function lodge(kind: TribeBuilding['kind'], tool: ToolId | null): { group: THREE.Group; built: THREE.Group; scaffold: THREE.Group } {
  const group = new THREE.Group(), built = new THREE.Group(), scaffold = new THREE.Group(); group.add(built, scaffold);
  const timber = material(COLORS.timber), roof = material(COLORS.roof), clay = material(COLORS.clay), pale = material(COLORS.pale);
  group.userData.ownedMaterials = [timber, roof, clay, pale];
  if (kind === 'shelter') {
    mesh(built, new THREE.CylinderGeometry(1.5, 1.8, 1.35, 10), clay, 0, .7);
    mesh(built, new THREE.ConeGeometry(2.15, 1.8, 10), roof, 0, 2.13);
    const entry = mesh(built, new THREE.BoxGeometry(.8, 1.1, .15), timber, 0, .6, 1.73); entry.rotation.z = 0;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; mesh(scaffold, new THREE.CylinderGeometry(.07, .1, 2.2, 5), timber, Math.sin(a) * 1.7, 1.1, Math.cos(a) * 1.7); }
  } else {
    mesh(built, new THREE.BoxGeometry(3.4, .16, 2.7), clay, 0, .12);
    for (const x of [-1.4, 1.4]) for (const z of [-1, 1]) mesh(built, new THREE.CylinderGeometry(.1, .13, 2.1, 6), timber, x, 1.12, z);
    const canopy = mesh(built, new THREE.ConeGeometry(2.55, 1.25, 4), roof, 0, 2.65); canopy.rotation.y = Math.PI / 4; canopy.scale.z = .83;
    mesh(built, new THREE.BoxGeometry(1.8, .16, .78), pale, 0, .88, .6);
    for (const x of [-.65, .65]) mesh(built, new THREE.BoxGeometry(.12, .8, .12), timber, x, .43, .6);
    for (const x of [-1.7, 1.7]) for (const z of [-1.2, 1.2]) mesh(scaffold, new THREE.CylinderGeometry(.065, .08, 2.7, 5), timber, x, 1.35, z);
    if (tool) { const sign = equipment(tool); sign.position.set(0, 3.1, 0); sign.scale.setScalar(.8); built.add(sign); }
  }
  return { group, built, scaffold };
}

function neighbourModel(identity: TribeNeighbour['identity']): NeighbourView {
  const group = new THREE.Group(), accent = material(COLORS.hostile), stone = material(0x8e9985), green = material(0x88a96d);
  group.userData.ownedMaterials = [accent, stone, green];
  const camp = lodge('shelter', null); camp.scaffold.visible = false; camp.group.position.z = -1.3; camp.group.scale.setScalar(.9); group.add(camp.group);
  if (identity === 'garden') {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5, x = Math.sin(angle) * 3.2, z = Math.cos(angle) * 3.2;
      mesh(group, new THREE.CylinderGeometry(.75, .9, .25, 8), stone, x, .13, z);
      for (let j = 0; j < 3; j++) { const leaf = mesh(group, new THREE.SphereGeometry(.32, 7, 5), green, x + (j - 1) * .3, .55, z); leaf.scale.set(.6, 1.5, .7); }
    }
  } else if (identity === 'terrace') {
    for (let i = 0; i < 3; i++) {
      mesh(group, new THREE.BoxGeometry(5.6 - i * .7, .28 + i * .15, .75), stone, 0, .2 + i * .15, 1.45 + i * .9);
      mesh(group, new THREE.BoxGeometry(4.8 - i * .6, .08, .55), green, 0, .39 + i * .23, 1.45 + i * .9);
    }
  } else {
    for (const x of [-2.45, 2.45]) { const pillar = mesh(group, new THREE.CylinderGeometry(.36, .53, 3.1, 6), stone, x, 1.55, 1.2); pillar.rotation.z = x > 0 ? -.07 : .07; }
    mesh(group, new THREE.BoxGeometry(5.4, .45, .65), stone, 0, 3.14, 1.2);
    const circle = groundRing(group, 1.3, COLORS.pale); circle.position.z = 2; circle.name = 'sanctuary-ring';
    mesh(group, new THREE.OctahedronGeometry(.5), accent, 0, .75, 2);
  }
  mesh(group, new THREE.CylinderGeometry(.075, .1, 4, 6), stone, -2.6, 2, -1.2);
  mesh(group, new THREE.BoxGeometry(1.25, .7, .09), accent, -2, 3.48, -1.2);
  const relation = bar(group, 3, COLORS.ally, 4.6), health = bar(group, 3, COLORS.hostile, 4.95);
  return { group, accent, relation, health, key: identity };
}

/** Read-only settlement presentation; all position, inventory and ownership comes from simulation. */
export class SettlementPresentation {
  readonly group = new THREE.Group();
  private members = new Map<number, MemberView>();
  private buildings = new Map<number, BuildingView>();
  private neighbours = new Map<number, NeighbourView>();
  private volumes: CommandPickVolume[] = [];
  private disposed = false;

  constructor() { this.group.name = 'settlement'; this.group.visible = false; }

  update(state: GameState, selected: readonly CommandUnitRef[], time: number, reducedMotion = false): void {
    if (this.disposed) return;
    const tribe = state.tribe;
    this.group.visible = state.stage >= 3 && tribe?.version === 2;
    this.volumes = [];
    if (!this.group.visible || !tribe || tribe.version !== 2) { this.clear(); return; }
    const selectedIds = new Set(selected.filter(ref => ref.kind === 'member').map(ref => ref.id));
    const genomeKey = JSON.stringify(state.player.genome);
    const living = tribe.members.filter(unit => unit.health > 0).sort((a, b) => a.id - b.id);
    // Machine regions replace these settlements at the inherited locations.
    const neighbours = state.stage === 3 ? tribe.neighbours : [];
    this.retire(this.members, new Set([...living.map(unit => unit.id),...neighbours.flatMap(n=>n.society?.members.filter(u=>u.health>0).map(u=>u.id)??[])]));
    this.retire(this.buildings, new Set(tribe.huts.map(hut => hut.id)));
    this.retire(this.neighbours, new Set(neighbours.map(neighbour => neighbour.id)));
    for (const unit of living) this.updateMember(state, unit, selectedIds.has(unit.id), genomeKey, time, reducedMotion);
    for (const hut of [...tribe.huts].sort((a, b) => a.id - b.id)) this.updateBuilding(state, hut);
    for (const neighbour of [...neighbours].sort((a, b) => a.id - b.id)) {
      this.updateNeighbour(state, neighbour);
      for(const u of neighbour.society?.members??[])if(u.health>0)this.updateMember(state,{
        ...u,health:u.health/70*100,species:neighbour.identity==='garden'?'gloom':neighbour.identity==='terrace'?'mender':'lantern',
        benefit:null,loyalty:100,orders:[],tool:musicPerformance(state,u.id)?.instrument??(u.task==='raid'||u.task==='defend'?'spear':u.task==='forage'||u.cargo>0?'basket':null),
        intent:u.task==='forage'?'forage':u.task==='raid'||u.task==='defend'?'hunt':'rest',
      },false,genomeKey,time,reducedMotion,neighbour);
    }
  }

  private updateMember(state: GameState, unit: TribeUnit, selected: boolean, genomeKey: string, time: number, reducedMotion: boolean, neighbour?: TribeNeighbour): void {
    const key = unit.species ?? genomeKey;
    let view = this.members.get(unit.id);
    if (view && view.key !== key) { this.remove(view.group); this.members.delete(unit.id); view = undefined; }
    const spec = unit.species ? worldSpecies(state.world,unit.species) : null;
    if (!view) {
      const group = new THREE.Group(), body = spec ? createSpeciesModel(spec) : createOrganism(state.player.genome);
      group.name = neighbour ? `neighbour-unit-${unit.id}` : `tribe-member-${unit.id}`; group.add(body); this.group.add(group);
      if (!spec) applyLivingFinish(body, 'player');
      const radius = spec ? Math.max(.75, spec.size * 1.2) : state.player.genome.version === 2 ? creaturePresentationBounds(body.userData.creatureAnatomy.bounds).radius : Math.max(1, bodyWidth(state.player.genome), state.player.genome.length * 1.5);
      const ring = groundRing(group, radius + .2, COLORS.selected); ring.name = 'selection-ring';
      const shadowGeometry = new THREE.CircleGeometry(radius * .72, 24); shadowGeometry.rotateX(-Math.PI / 2);
      const shadow = mesh(group, shadowGeometry, new THREE.MeshBasicMaterial({ color: 0x152c22, transparent: true, opacity: .2, depthWrite: false, side: THREE.DoubleSide }));
      shadow.name = 'ground-contact'; shadow.castShadow = false; shadow.raycast = () => {};
      const equipmentGroup = new THREE.Group(); group.add(equipmentGroup);
      const cargo = new THREE.Group(); cargo.name = 'carried-food'; group.add(cargo);
      const food = material(COLORS.food); mesh(cargo, new THREE.DodecahedronGeometry(.29, 0), food); mesh(cargo, new THREE.DodecahedronGeometry(.2, 0), food, .24, .11, 0);
      view = { group, body, equipment: equipmentGroup, ring, health: bar(group, radius * 1.6, COLORS.selected, radius + .55), cargo, key, tool: null, time, previous: { ...unit.pos }, heading: unit.heading, radius, speed: 0 };
      this.members.set(unit.id, view);
    }
    const ground = groundHeight(unit.pos.x, unit.pos.z, state.world.stage), localGround = ground - unit.pos.y;
    view.group.position.set(unit.pos.x, unit.pos.y, unit.pos.z); view.group.rotation.y = unit.heading;
    view.body.position.y = localGround + (spec ? speciesGroundClearance(spec) : organismGroundClearance(state.player.genome));
    if (!spec) syncCulturalOutfit(view.body, state.player.genome, unit.outfit);
    const performance = musicPerformance(state,unit.id);
    view.ring.visible = selected || !!neighbour || !!performance;
    if(!neighbour)(view.ring.material as THREE.MeshBasicMaterial).color.setHex(performance ? performance.success ? COLORS.ally : COLORS.hostile : COLORS.selected);
    if(neighbour)(view.ring.material as THREE.MeshBasicMaterial).color.setHex(neighbourDisposition(neighbour)==='hostile'?COLORS.hostile:neighbourDisposition(neighbour)==='friendly'?COLORS.ally:COLORS.pale);
    drapeGround(view.ring, unit.pos, unit.heading, state.world.stage, .055);
    drapeGround(view.group.getObjectByName('ground-contact') as THREE.Mesh, unit.pos, unit.heading, state.world.stage, .035);
    alignBar(view.health, unit.pos, unit.heading, state.world.stage); view.health.group.visible = selected || unit.health < 75 || unit.hunger > 70;
    fillBar(view.health, unit.health / 100); view.health.fill.material.color.setHex(unit.health < 30 ? COLORS.hostile : COLORS.selected);
    if (view.tool !== unit.tool) {
      for (const child of [...view.equipment.children]) { child.removeFromParent(); disposeObject(child); }
      if (unit.tool) view.equipment.add(equipment(unit.tool));
      view.tool = unit.tool;
    }
    view.equipment.position.set(spec ? .65 : bodyWidth(state.player.genome) * .85, view.body.position.y + .35, .2);
    view.equipment.scale.setScalar(.82);
    view.equipment.rotation.z = performance && !reducedMotion ? Math.sin(time*(performance.instrument==='rattle'?28:performance.instrument==='drum'?12:4))*.22 : 0;
    view.equipment.position.y += performance && !reducedMotion ? Math.abs(Math.sin(time*6))*.15 : 0;
    let cue=view.group.getObjectByName('music-cue');
    const cueKey=performance?`${performance.role}:${performance.instrument}:${performance.success}`:'';
    if(cue?.userData.key!==cueKey){if(cue){cue.removeFromParent();disposeObject(cue);}cue=undefined;
      if(performance){cue=equipment(performance.instrument);cue.name='music-cue';cue.userData.key=cueKey;cue.scale.setScalar(.55);view.group.add(cue);}
    }
    if(cue)cue.position.set(0,view.body.position.y+2.5,0);
    view.cargo.visible = unit.cargo > 0; view.cargo.position.set(0, view.body.position.y + .75, -.45); view.cargo.scale.setScalar(.75 + Math.min(1, unit.cargo / 6) * .5);
    const elapsed = time - view.time;
    if (elapsed > 0) view.speed = Math.min(10, Math.hypot(unit.pos.x - view.previous.x, unit.pos.z - view.previous.z) / elapsed);
    const animationTime = reducedMotion ? 0 : time + unit.id * .37;
    if (spec) { animateSpeciesModel(view.body, animationTime, view.speed, spec); setPartnerActivity(view.body, unit.hunger < 70 && unit.loyalty > 0); }
    else animateOrganism(view.body, animationTime, view.speed, unit.heading - view.heading, 2, unit.intent === 'forage' && unit.cooldown > 0 ? .65 : 0, 0, undefined, state.player.genome.version === 2 ? { position: { x: unit.pos.x, y: unit.pos.y + view.body.position.y, z: unit.pos.z }, heading: unit.heading, groundAt: (x, z) => groundHeight(x, z, state.world.stage) } : undefined);
    view.previous = { ...unit.pos }; view.heading = unit.heading; view.time = time;
    this.volumes.push({ target: { kind: neighbour ? 'neighbour-unit' : 'member', id: unit.id }, center: { x: unit.pos.x, y: unit.pos.y + view.body.position.y, z: unit.pos.z }, radius: view.radius });
  }

  private updateBuilding(state: GameState, hut: TribeBuilding): void {
    const key = `${hut.kind}:${hut.tool ?? ''}`;
    let view = this.buildings.get(hut.id);
    if (view && view.key !== key) { this.remove(view.group); this.buildings.delete(hut.id); view = undefined; }
    if (!view) {
      const building = lodge(hut.kind, hut.tool); building.group.name = `tribe-hut-${hut.id}`; this.group.add(building.group);
      view = { ...building, progress: bar(building.group, 2.6, COLORS.food, 2.4), health: bar(building.group, 2.6, COLORS.hostile, 2.75), key }; this.buildings.set(hut.id, view);
    }
    const ground = groundHeight(hut.pos.x, hut.pos.z, state.world.stage), progress = THREE.MathUtils.clamp(hut.progress, 0, 1);
    view.group.position.set(hut.pos.x, ground, hut.pos.z); view.built.scale.y = Math.max(.08, progress); view.scaffold.visible = progress < 1;
    alignBar(view.progress, view.group.position, 0, state.world.stage); alignBar(view.health, view.group.position, 0, state.world.stage);
    view.progress.group.visible = progress < 1; fillBar(view.progress, progress);
    view.health.group.visible = hut.health < 100; fillBar(view.health, hut.health / 100);
    this.volumes.push({ target: { kind: 'hut', id: hut.id }, center: { x: hut.pos.x, y: ground + 1.3, z: hut.pos.z }, radius: 2.2 });
  }

  private updateNeighbour(state: GameState, neighbour: TribeNeighbour): void {
    let view = this.neighbours.get(neighbour.id);
    if (view && view.key !== neighbour.identity) { this.remove(view.group); this.neighbours.delete(neighbour.id); view = undefined; }
    if (!view) { view = neighbourModel(neighbour.identity); view.group.name = `tribe-neighbour-${neighbour.id}`; this.group.add(view.group); this.neighbours.set(neighbour.id, view); }
    const ground = groundHeight(neighbour.pos.x, neighbour.pos.z, state.world.stage);
    view.group.position.set(neighbour.pos.x, ground, neighbour.pos.z);
    alignBar(view.relation, view.group.position, 0, state.world.stage); alignBar(view.health, view.group.position, 0, state.world.stage);
    const ring = view.group.getObjectByName('sanctuary-ring'); if (ring) drapeGround(ring as THREE.Mesh, view.group.position, 0, state.world.stage, .055);
    const color = neighbour.resolved === 'allied' ? COLORS.ally : neighbour.resolved === 'conquered' ? COLORS.conquered : neighbourDisposition(neighbour)==='friendly' ? COLORS.ally : neighbourDisposition(neighbour)==='neutral' ? COLORS.pale : COLORS.hostile;
    view.accent.color.setHex(color); view.accent.emissive.setHex(color); view.accent.emissiveIntensity = neighbour.resolved ? .18 : Math.min(.28, neighbour.alarm / 12 * .28);
    fillBar(view.relation, (neighbour.relation + 100) / 200); view.relation.fill.material.color.setHex(neighbour.resolved ? color : COLORS.ally);
    const maxHealth = neighbourMaxHealth(neighbour);
    view.health.group.visible = neighbour.resolved === null && neighbour.health < maxHealth; fillBar(view.health, neighbour.health / maxHealth);
    this.volumes.push({ target: { kind: 'neighbour', id: neighbour.id }, center: { x: neighbour.pos.x, y: ground + 1.5, z: neighbour.pos.z }, radius: 3.4 });
  }

  pickTargets(): readonly CommandPickVolume[] { return this.volumes; }

  private remove(group: THREE.Group): void { group.removeFromParent(); disposeObject(group); }
  private retire<T extends { group: THREE.Group }>(views: Map<number, T>, ids: Set<number>): void {
    for (const [id, view] of views) if (!ids.has(id)) { this.remove(view.group); views.delete(id); }
  }
  private clear(): void {
    for (const views of [this.members, this.buildings, this.neighbours]) { for (const view of views.values()) this.remove(view.group); views.clear(); }
  }
  dispose(): void { if (this.disposed) return; this.clear(); this.volumes = []; this.group.removeFromParent(); this.group.visible = false; this.disposed = true; }
}
