import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { speciesById } from '../game/content';
import { getClimate } from '../game/climate';
import { groundHeight } from '../game/random';
import type { GameState, World } from '../game/types';

type Shoot = { node: THREE.Group; body: THREE.Group; leaves: THREE.Mesh; heart: THREE.Mesh; wet?: THREE.Mesh };
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const health = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value / 100, 0, 1) : 0;
const WET_SEGMENTS = 32, WET_RINGS = 4;

function joined(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const result = mergeGeometries(parts)!; parts.forEach(part => part.dispose()); return result;
}
function stem(rooted: boolean): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    v(0, 0, 0), v(-.08, .28, .04), v(.07, .54, 0), v(.02, .77, -.05),
  ]), 12, .035, 5, false)];
  for (let i = 0; i < 3; i++) {
    const angle = i * Math.PI * 2 / 3, reach = rooted ? .55 : .26;
    pieces.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      v(0, .08, 0), v(Math.cos(angle) * reach * .5, rooted ? .08 : -.05, Math.sin(angle) * reach * .5),
      v(Math.cos(angle + .3) * reach, rooted ? .025 : -.12, Math.sin(angle + .3) * reach),
    ]), 8, .024, 4, false));
  }
  return joined(pieces);
}
function leaf(): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [], rows = 10, columns = 4;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const t = row / rows, side = column / columns * 2 - 1, width = Math.pow(Math.sin(t * Math.PI), .7);
    positions.push(side * width * .23, t * .78, Math.sin(t * Math.PI) * .16 + t * t * .2);
    if (row < rows && column < columns) { const a = row * (columns + 1) + column, b = a + columns + 1; indices.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
function leaves(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const transform = new THREE.Object3D();
    transform.position.set(0, .38 + i * .09, 0); transform.rotation.set(.25 + i * .08, i * Math.PI * 2 / 3, -.65);
    transform.scale.setScalar(1 - i * .12); transform.updateMatrix();
    pieces.push(leaf().applyMatrix4(transform.matrix));
  }
  return joined(pieces);
}
function wetGeometry(): THREE.BufferGeometry {
  const count = (WET_RINGS + 1) * (WET_SEGMENTS + 1), positions = new Float32Array(count * 3), colors = new Float32Array(count * 4), indices: number[] = [];
  for (let ring = 0; ring <= WET_RINGS; ring++) for (let slice = 0; slice <= WET_SEGMENTS; slice++) {
    const i = ring * (WET_SEGMENTS + 1) + slice;
    colors.set([1, 1, 1, 1 - (ring / WET_RINGS) ** 2], i * 4);
    if (ring < WET_RINGS && slice < WET_SEGMENTS) { const b = i + WET_SEGMENTS + 1; indices.push(i, i + 1, b, i + 1, b + 1, b); }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4)); geometry.setIndex(indices); return geometry;
}

/** Actual mobile cuttings and their young roots. No quest pins, world writes,
 * random sampling, lights or per-root shader arrays are needed. */
export class RootDispersalPresentation {
  readonly group = new THREE.Group();
  private readonly carried = new Map<number, Shoot>();
  private readonly roots = new Map<number, Shoot>();
  private readonly geometries = [stem(false), stem(true), leaves(), new THREE.SphereGeometry(.13, 10, 6)];
  private readonly materials = [
    new THREE.MeshStandardMaterial({ color: 0x3f785d, emissive: 0x306947, emissiveIntensity: .15, roughness: .75 }),
    new THREE.MeshStandardMaterial({ color: 0x7adb9b, emissive: 0x65c88b, emissiveIntensity: .42, side: THREE.DoubleSide, roughness: .52 }),
    new THREE.MeshStandardMaterial({ color: 0xd6f4ac, emissive: 0xc7f7a0, emissiveIntensity: 1.05, roughness: .38 }),
    new THREE.MeshBasicMaterial({ color: 0x398a72, vertexColors: true, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide }),
  ];
  private world: World | null = null;
  private disposed = false;

  constructor(scene: THREE.Scene) { this.group.name = 'root-dispersal-presentation'; this.group.visible = false; scene.add(this.group); }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material); mesh.raycast = () => {}; parent.add(mesh); return mesh;
  }
  private shoot(id: number, site: number, rooted: boolean): Shoot {
    const node = new THREE.Group(), body = new THREE.Group(); node.add(body);
    node.name = `dispersed-${rooted ? 'root' : 'cutting'}-${id}`;
    Object.assign(node.userData, { dispersalRole: rooted ? 'root' : 'cutting', siteId: site, [rooted ? 'resourceId' : 'carrierId']: id });
    const stems = this.mesh(this.geometries[rooted ? 1 : 0], this.materials[0], body); stems.name = rooted ? 'young-root-stems' : 'carried-cutting-stem';
    const leaves = this.mesh(this.geometries[2], this.materials[1], body); leaves.name = 'cutting-leaves';
    if (rooted) leaves.scale.set(1.22, 1.08, 1.22);
    const heart = this.mesh(this.geometries[3], this.materials[2], body); heart.name = 'cutting-heart'; heart.position.set(.025, .72, -.045); heart.scale.set(.7, 1.15, .7);
    let wet: THREE.Mesh | undefined;
    if (rooted) { wet = this.mesh(wetGeometry(), this.materials[3], node); wet.name = `dispersed-wet-${id}`; wet.visible = false; wet.renderOrder = 1; wet.userData.resourceId = id; }
    this.group.add(node); return { node, body, leaves, heart, wet };
  }
  private remove(view: Shoot): void { view.node.removeFromParent(); view.wet?.geometry.dispose(); }
  private clear(): void { for (const views of [this.carried, this.roots]) { views.forEach(view => this.remove(view)); views.clear(); } }
  private animate(view: Shoot, vitality: number, time: number, id: number): void {
    view.node.userData.vitality = vitality;
    view.body.scale.setScalar((.72 + vitality * .28) * (view.wet ? 1.2 : 1));
    view.leaves.rotation.z = Math.sin(time * 2.7 + id) * .075;
    view.leaves.rotation.x = Math.sin(time * 1.8 + id * .7) * .055;
    view.heart.scale.set(.7, 1.15 + Math.sin(time * 3 + id) * .08, .7);
  }

  update(s: GameState, time = s.world.time): void {
    if (this.disposed) return;
    if (this.world !== s.world) { this.clear(); this.world = s.world; }
    const truth = s.journey.rootDispersal;
    const active = s.stage === 2 && s.world.stage === 2 && s.journey.version === 3 && !s.journey.legacy && truth?.version === 1;
    this.group.visible = !!active;
    if (!active) { this.clear(); return; }
    const phase = Number.isFinite(time) ? time : 0, carriedIds = new Set<number>(), rootIds = new Set<number>();
    for (const cutting of truth.carried) {
      const creature = s.world.creatures.find(c => c.id === cutting.carrierId && c.health > 0);
      const vitality = health(cutting.vitality);
      if (!creature || speciesById(creature.species).role !== 'invasive' || vitality <= 0) continue;
      carriedIds.add(creature.id);
      const view = this.carried.get(creature.id) ?? this.shoot(creature.id, cutting.site, false); this.carried.set(creature.id, view);
      const size = speciesById(creature.species).size, movement = Math.min(1, Math.hypot(creature.velocity.x, creature.velocity.z) / 3);
      view.node.position.set(creature.pos.x, creature.pos.y, creature.pos.z);
      view.node.rotation.set(0, creature.heading + Math.sin(phase * 4.4) * .035 * movement, 0);
      view.body.position.set(0, .32 * size, -.22 * size); view.node.userData.siteId = cutting.site;
      this.animate(view, vitality, phase, creature.id);
    }
    const pockets = getClimate(s).rootPockets ?? [];
    for (const root of truth.roots) {
      const resource = s.world.resources.find(r => r.id === root.resourceId), vitality = health(root.vitality);
      if (!resource || vitality <= 0) continue;
      rootIds.add(resource.id);
      const view = this.roots.get(resource.id) ?? this.shoot(resource.id, root.site, true); this.roots.set(resource.id, view);
      view.node.position.set(resource.pos.x, resource.pos.y, resource.pos.z); view.node.userData.siteId = root.site;
      view.body.position.y = groundHeight(resource.pos.x, resource.pos.z, 2) - resource.pos.y + .035;
      view.body.rotation.y = resource.id * 2.399; this.animate(view, vitality, phase, resource.id);
      const pocket = pockets.find(p => p.dispersed && p.id === `rootlet-${resource.id}`), wet = view.wet!;
      wet.visible = !!pocket && pocket.water > 0;
      if (pocket && wet.visible) {
        const shape = `${pocket.x}:${pocket.z}:${pocket.radius}:${pocket.water}:${resource.pos.x}:${resource.pos.y}:${resource.pos.z}`;
        Object.assign(wet.userData, { radius: pocket.radius, water: pocket.water, siteId: pocket.site });
        if (wet.userData.shape !== shape) {
          wet.userData.shape = shape;
          const position = wet.geometry.getAttribute('position'), color = wet.geometry.getAttribute('color');
          for (let ring = 0; ring <= WET_RINGS; ring++) for (let slice = 0; slice <= WET_SEGMENTS; slice++) {
            const t = ring / WET_RINGS, angle = slice / WET_SEGMENTS * Math.PI * 2, x = pocket.x + Math.cos(angle) * t * pocket.radius, z = pocket.z + Math.sin(angle) * t * pocket.radius, i = ring * (WET_SEGMENTS + 1) + slice;
            position.setXYZ(i, x - resource.pos.x, groundHeight(x, z, 2) - resource.pos.y + .025, z - resource.pos.z);
            color.setW(i, (1 - t * t) * (.45 + .55 * Math.min(1, pocket.water)));
          }
          position.needsUpdate = true; color.needsUpdate = true; wet.geometry.computeBoundingSphere();
        }
      }
    }
    for (const [id, view] of this.carried) if (!carriedIds.has(id)) { this.remove(view); this.carried.delete(id); }
    for (const [id, view] of this.roots) if (!rootIds.has(id)) { this.remove(view); this.roots.delete(id); }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clear(); this.group.removeFromParent();
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
    this.world = null;
  }
}
