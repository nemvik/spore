import * as THREE from 'three';
import type { GameState, Vec3 } from '../game/types';
import type { AmberSpring, MachineRegion, MachineUnit } from '../game/era-types';
import type { VehicleBlueprint } from '../game/blueprint';
import { vehicleStats } from '../game/blueprint';
import { groundHeight } from '../game/random';
import { animateMachine, createMachine } from './machine';
import { disposeObject } from './organism';
import type { CommandPickVolume, CommandUnitRef } from './command-picking';

const COLOR = { amber: 0xe4bb70, metal: 0x76867c, dark: 0x33473f, stone: 0x949782, neutral: 0xc98c71, owned: 0xaadfb2, selected: 0xd5f6bb, plant: 0x85b77c };
type Bar = { group: THREE.Group; fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; width: number };
type UnitView = { group: THREE.Group; body: THREE.Group; ring: THREE.Mesh; shadow: THREE.Mesh; health: Bar; cargo: THREE.Group; key: string; radius: number; center: THREE.Vector3; time: number; previous: Vec3; speed: number };
type RegionView = { group: THREE.Group; accent: THREE.MeshStandardMaterial; ring: THREE.Mesh; progress: Bar; health: Bar; pips: THREE.Mesh[]; empty: THREE.MeshStandardMaterial; filled: THREE.MeshStandardMaterial; plants: THREE.Group; key: string };
type SpringView = { group: THREE.Group; accent: THREE.MeshStandardMaterial; glow: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>; ring: THREE.Mesh; progress: Bar };

const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: .72, metalness: .16 });
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const node = new THREE.Mesh(geometry, mat); node.position.set(x, y, z); node.castShadow = true; node.receiveShadow = true; parent.add(node); return node;
}
function ring(parent: THREE.Group, radius: number, color: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(radius, radius + .14, 40); geometry.rotateX(-Math.PI / 2);
  const node = mesh(parent, geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
  node.castShadow = false; node.raycast = () => {}; return node;
}
function bar(parent: THREE.Group, name: string, width: number, color: number, z: number): Bar {
  const group = new THREE.Group(); group.name = name; group.userData.statusBar = true; group.position.z = z; parent.add(group);
  const back = mesh(group, new THREE.PlaneGeometry(width + .12, .28), new THREE.MeshBasicMaterial({ color: 0x233d35, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }));
  back.rotation.x = -Math.PI / 2; back.castShadow = false; back.renderOrder = 1; back.raycast = () => {};
  // Both layers belong to the transparent queue, so Three's pass ordering cannot
  // draw the dark background over an opaque progress fill.
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(width, .18), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  fill.rotation.x = -Math.PI / 2; fill.position.y = .014; fill.renderOrder = 2; fill.raycast = () => {}; group.add(fill);
  return { group, fill, width };
}
function fillBar(bar: Bar, fraction: number): void {
  const value = THREE.MathUtils.clamp(fraction, 0, 1); bar.fill.scale.x = Math.max(.001, value); bar.fill.position.x = -(1 - value) * bar.width / 2;
}
function drape(node: THREE.Mesh, origin: Vec3, heading: number, offset: number): void {
  const vertices = node.geometry.getAttribute('position'), cos = Math.cos(heading), sin = Math.sin(heading);
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i) + node.position.x, z = vertices.getZ(i) + node.position.z;
    vertices.setY(i, groundHeight(origin.x + cos * x + sin * z, origin.z - sin * x + cos * z, 2) + offset - origin.y - node.position.y);
  }
  vertices.needsUpdate = true; node.geometry.computeBoundingSphere();
}
function alignGroundBar(bar: Bar, origin: Vec3, heading = 0): void {
  const cos = Math.cos(heading), sin = Math.sin(heading); let height = -Infinity;
  for (const x of [-bar.width / 2 - .06, 0, bar.width / 2 + .06]) for (const dz of [-.14, 0, .14]) {
    const z = bar.group.position.z + dz;
    height = Math.max(height, groundHeight(origin.x + cos * x + sin * z, origin.z - sin * x + cos * z, 2));
  }
  bar.group.position.y = height - origin.y + .07;
}

function regionModel(identity: MachineRegion['identity']): RegionView {
  const group = new THREE.Group(), accent = material(COLOR.neutral), stone = material(COLOR.stone), metal = material(COLOR.metal), foliage = material(COLOR.plant);
  const empty = material(COLOR.dark), filled = material(COLOR.owned), plants = new THREE.Group(); plants.name = 'region-vegetation'; group.add(plants);
  group.userData.ownedMaterials = [accent, stone, metal, foliage, empty, filled];
  if (identity === 'gardens') {
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3, x = Math.sin(angle) * 2.6, z = Math.cos(angle) * 2.6;
      mesh(group, new THREE.CylinderGeometry(.8, 1, .3, 8), stone, x, .15, z);
      for (let j = 0; j < 3; j++) { const leaf = mesh(plants, new THREE.SphereGeometry(.32, 7, 5), foliage, x + (j - 1) * .34, .64, z); leaf.scale.set(.7, 1.8, .7); }
    }
    mesh(group, new THREE.CylinderGeometry(1.1, 1.4, 1.4, 8), stone, 0, .7);
    mesh(group, new THREE.ConeGeometry(1.55, 1, 8), accent, 0, 1.85);
  } else if (identity === 'terraces') {
    for (let i = 0; i < 3; i++) {
      mesh(group, new THREE.BoxGeometry(6.2 - i, .45, 1.4), stone, 0, .25 + i * .4, -1.6 + i * 1.5);
      mesh(group, new THREE.BoxGeometry(5.8 - i, .12, .9), metal, 0, .54 + i * .4, -1.6 + i * 1.5);
      for (const x of [-1.3, 1.3]) mesh(group, new THREE.BoxGeometry(.7, .8, .8), accent, x, 1 + i * .4, -1.6 + i * 1.5);
    }
  } else {
    mesh(group, new THREE.CylinderGeometry(2.7, 3.1, .55, 6), stone, 0, .28);
    for (const x of [-1.6, 1.6]) mesh(group, new THREE.CylinderGeometry(.3, .45, 3.3, 6), metal, x, 2);
    mesh(group, new THREE.BoxGeometry(4.2, .4, .65), accent, 0, 3.75);
    // This beacon marks the air destination above the actual cliff ring. The
    // sixteen collision rocks remain exclusively owned by the habitat renderer.
    mesh(group, new THREE.CylinderGeometry(.09, .16, 11, 6), metal, 0, 5.5);
    mesh(group, new THREE.OctahedronGeometry(.65), accent, 0, 11.3);
  }
  const flagX = -3.35; mesh(group, new THREE.CylinderGeometry(.08, .12, 5.2, 6), metal, flagX, 2.6, -1.8);
  const flag = mesh(group, new THREE.BoxGeometry(1.35, .8, .1), accent, flagX + .6, 4.65, -1.8); flag.name = 'ownership-flag';
  const outline = ring(group, 3.85, COLOR.neutral); outline.name = 'region-ring';
  const progress = bar(group, 'region-progress', 4, COLOR.plant, 4.35), health = bar(group, 'region-health', 4, COLOR.neutral, 4.78);
  const pips = Array.from({ length: 3 }, (_, i) => {
    const pip = mesh(group, new THREE.BoxGeometry(.5, .35, .5), empty, (i - 1) * .8, .45, 3.5); pip.name = `region-delivery-${i + 1}`; return pip;
  });
  return { group, accent, ring: outline, progress, health, pips, empty, filled, plants, key: identity };
}

function springModel(): SpringView {
  const group = new THREE.Group(), accent = material(COLOR.amber), metal = material(COLOR.metal), stone = material(COLOR.stone);
  accent.emissive.setHex(COLOR.amber); accent.emissiveIntensity = .25;
  group.userData.ownedMaterials = [accent, metal, stone];
  mesh(group, new THREE.CylinderGeometry(1.4, 1.75, .45, 8), stone, 0, .23);
  const crystal = mesh(group, new THREE.OctahedronGeometry(.85), accent, 0, 1.15); crystal.scale.y = 1.5; crystal.name = 'amber-crystal';
  for (let i = 0; i < 3; i++) { const angle = i * Math.PI * 2 / 3; mesh(group, new THREE.CylinderGeometry(.1, .18, 2.6, 6), metal, Math.sin(angle) * 1.1, 1.3, Math.cos(angle) * 1.1); }
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(.32, .66, 6.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: COLOR.amber, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide }));
  glow.name = 'spring-glow'; glow.position.y = 3.5; glow.raycast = () => {}; group.add(glow);
  mesh(group, new THREE.OctahedronGeometry(.38), accent, 0, 6.7);
  const outline = ring(group, 2, COLOR.amber); outline.name = 'spring-ring';
  return { group, accent, glow, ring: outline, progress: bar(group, 'spring-progress', 2.8, COLOR.amber, 2.5) };
}

/** Read-only view of paid machines, actual regions and actual amber sources. */
export class FleetPresentation {
  readonly group = new THREE.Group();
  private units = new Map<number, UnitView>();
  private regions = new Map<number, RegionView>();
  private springs = new Map<number, SpringView>();
  private volumes: CommandPickVolume[] = [];
  private disposed = false;

  constructor() { this.group.name = 'fleet'; this.group.visible = false; }

  update(state: GameState, selected: readonly CommandUnitRef[], time: number, reducedMotion = false): void {
    if (this.disposed) return;
    const machines = state.machines; this.volumes = [];
    this.group.visible = state.stage >= 4 && machines?.version === 2;
    if (!this.group.visible || !machines || machines.version !== 2) { this.clear(); return; }
    const designs = new Map(machines.blueprints.map(design => [design.id, design.blueprint]));
    const living = machines.fleet.filter(unit => unit.health > 0 && designs.has(unit.blueprint)).sort((a, b) => a.id - b.id);
    const selectedIds = new Set(selected.filter(ref => ref.kind === 'machine').map(ref => ref.id));
    this.retire(this.units, new Set(living.map(unit => unit.id)));
    this.retire(this.regions, new Set(machines.regions.map(region => region.id)));
    this.retire(this.springs, new Set(machines.springs.map(spring => spring.id)));
    for (const unit of living) this.updateUnit(unit, designs.get(unit.blueprint)!, selectedIds.has(unit.id), time, reducedMotion);
    for (const region of [...machines.regions].sort((a, b) => a.id - b.id)) this.updateRegion(region, machines.archetype);
    for (const spring of [...machines.springs].sort((a, b) => a.id - b.id)) this.updateSpring(spring, time, reducedMotion);
  }

  private updateUnit(unit: MachineUnit, blueprint: VehicleBlueprint, selected: boolean, time: number, reducedMotion: boolean): void {
    const key = `${unit.blueprint}:${JSON.stringify(blueprint)}`; let view = this.units.get(unit.id);
    if (view && view.key !== key) { this.remove(view.group); this.units.delete(unit.id); view = undefined; }
    if (!view) {
      const group = new THREE.Group(), body = createMachine(blueprint); group.name = `machine-unit-${unit.id}`; group.add(body); this.group.add(group);
      const bounds = body.userData.bounds as THREE.Box3, size = bounds.getSize(new THREE.Vector3()), radius = Math.max(1, Math.hypot(size.x, size.z) * .5);
      const outline = ring(group, radius + .2, COLOR.selected); outline.name = 'selection-ring';
      const shadowGeometry = new THREE.CircleGeometry(radius * .72, 24); shadowGeometry.rotateX(-Math.PI / 2);
      const shadow = mesh(group, shadowGeometry, new THREE.MeshBasicMaterial({ color: 0x183329, transparent: true, opacity: blueprint.carrier === 'air' ? .12 : .22, depthWrite: false, side: THREE.DoubleSide }));
      shadow.name = 'ground-contact'; shadow.castShadow = false; shadow.raycast = () => {};
      const cargo = new THREE.Group(); cargo.name = 'paid-cargo'; group.add(cargo);
      mesh(cargo, new THREE.BoxGeometry(.65, .55, .65), material(COLOR.amber));
      view = { group, body, ring: outline, shadow, health: bar(group, 'machine-health', radius * 1.5, COLOR.selected, radius + .5), cargo, key, radius, center: bounds.getCenter(new THREE.Vector3()), time, previous: { ...unit.pos }, speed: 0 };
      this.units.set(unit.id, view);
    }
    const ground = groundHeight(unit.pos.x, unit.pos.z, 2), stats = vehicleStats(blueprint), air = blueprint.carrier === 'air';
    view.group.position.set(unit.pos.x, unit.pos.y, unit.pos.z); view.group.rotation.y = unit.heading;
    view.body.position.y = air ? 0 : ground - unit.pos.y + Number(view.body.userData.groundClearance);
    view.ring.visible = selected; drape(view.ring, unit.pos, unit.heading, .06); drape(view.shadow, unit.pos, unit.heading, .04);
    const top = (view.body.userData.bounds as THREE.Box3).max.y + view.body.position.y;
    if (air) view.health.group.position.y = top + .4; else alignGroundBar(view.health, unit.pos, unit.heading);
    view.health.group.visible = selected || unit.health < stats.durability;
    fillBar(view.health, unit.health / stats.durability); view.health.fill.material.color.setHex(unit.health < stats.durability * .3 ? COLOR.neutral : COLOR.selected);
    view.cargo.visible = unit.cargo > 0; view.cargo.position.set(0, top + .45, -.4);
    const elapsed = time - view.time;
    if (elapsed > 0) view.speed = Math.min(40, Math.hypot(unit.pos.x - view.previous.x, unit.pos.z - view.previous.z) / elapsed);
    animateMachine(view.body, reducedMotion ? 0 : time + unit.id * .17, reducedMotion ? 0 : view.speed, !reducedMotion && (unit.intent === 'work' || unit.intent === 'attack'));
    view.time = time; view.previous = { ...unit.pos };
    const center = view.center.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), unit.heading);
    center.add(new THREE.Vector3(unit.pos.x, unit.pos.y + view.body.position.y, unit.pos.z));
    this.volumes.push({ target: { kind: 'machine', id: unit.id }, center: { x: center.x, y: center.y, z: center.z }, radius: view.radius });
  }

  private updateRegion(region: MachineRegion, archetype: 'restoration' | 'predator' | 'migration'): void {
    let view = this.regions.get(region.id);
    if (view && view.key !== region.identity) { this.remove(view.group); this.regions.delete(region.id); view = undefined; }
    if (!view) { view = regionModel(region.identity); view.group.name = `machine-region-${region.id}`; this.group.add(view.group); this.regions.set(region.id, view); }
    const ground = groundHeight(region.pos.x, region.pos.z, 2), owned = region.owner === 'player', color = owned ? COLOR.owned : COLOR.neutral;
    view.group.position.set(region.pos.x, ground, region.pos.z); view.accent.color.setHex(color); view.accent.emissive.setHex(color); view.accent.emissiveIntensity = owned ? .2 : region.alarm > 0 ? .25 : 0;
    (view.ring.material as THREE.MeshBasicMaterial).color.setHex(color); drape(view.ring, view.group.position, 0, .06);
    const maxHealth = region.identity === 'terraces' ? 320 : 240;
    const progress = archetype === 'restoration' ? region.soil / 100 : archetype === 'predator' ? 1 - region.health / maxHealth : region.relation / 100;
    view.progress.group.userData.metric = archetype === 'restoration' ? 'soil' : archetype === 'predator' ? 'damage' : 'relation';
    fillBar(view.progress, owned ? 1 : progress); view.progress.fill.material.color.setHex(owned ? COLOR.owned : archetype === 'predator' ? COLOR.neutral : COLOR.amber);
    alignGroundBar(view.progress, view.group.position); alignGroundBar(view.health, view.group.position);
    view.health.group.visible = !owned && (archetype === 'predator' || region.health < maxHealth); fillBar(view.health, region.health / maxHealth);
    const count = archetype === 'restoration' ? region.settlers : region.deliveries, total = archetype === 'restoration' ? 2 : 3;
    view.pips.forEach((pip, index) => { pip.visible = archetype !== 'predator' && index < total; pip.material = index < count ? view.filled : view.empty;
      pip.position.x = (index - (total - 1) / 2) * .8; pip.position.y = groundHeight(region.pos.x + pip.position.x, region.pos.z + pip.position.z, 2) - ground + .28; });
    view.plants.scale.y = .25 + region.soil / 100 * .75;
    this.volumes.push({ target: { kind: 'region', id: region.id }, center: { x: region.pos.x, y: ground + (region.airOnly ? 10.8 : 1.7), z: region.pos.z }, radius: region.airOnly ? 1.7 : 3.6 });
  }

  private updateSpring(spring: AmberSpring, time: number, reducedMotion: boolean): void {
    let view = this.springs.get(spring.id);
    if (!view) { view = springModel(); view.group.name = `amber-spring-${spring.id}`; this.group.add(view.group); this.springs.set(spring.id, view); }
    const ground = groundHeight(spring.pos.x, spring.pos.z, 2), owned = spring.owner === 'player', color = owned ? COLOR.owned : COLOR.amber;
    view.group.position.set(spring.pos.x, ground, spring.pos.z);
    view.accent.color.setHex(color); view.accent.emissive.setHex(color); view.accent.emissiveIntensity = owned ? .5 : .25;
    view.glow.material.color.setHex(color); view.glow.material.opacity = (owned ? .24 : .14) + (reducedMotion ? 0 : .025 * Math.sin(time * 2 + spring.id));
    (view.ring.material as THREE.MeshBasicMaterial).color.setHex(color); drape(view.ring, view.group.position, 0, .06);
    alignGroundBar(view.progress, view.group.position); fillBar(view.progress, spring.progress); view.progress.fill.material.color.setHex(color);
    this.volumes.push({ target: { kind: 'spring', id: spring.id }, center: { x: spring.pos.x, y: ground + 1.5, z: spring.pos.z }, radius: 2 });
  }

  pickTargets(): readonly CommandPickVolume[] { return this.volumes; }
  private remove(group: THREE.Group): void { group.removeFromParent(); disposeObject(group); }
  private retire<T extends { group: THREE.Group }>(views: Map<number, T>, ids: Set<number>): void {
    for (const [id, view] of views) if (!ids.has(id)) { this.remove(view.group); views.delete(id); }
  }
  private clear(): void { for (const views of [this.units, this.regions, this.springs]) { for (const view of views.values()) this.remove(view.group); views.clear(); } }
  dispose(): void { if (this.disposed) return; this.clear(); this.volumes = []; this.group.removeFromParent(); this.group.visible = false; this.disposed = true; }
}
