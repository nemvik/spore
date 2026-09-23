import { worldSpecies } from '../game/npc-genome';
import * as THREE from 'three';
import type { GameState, Vec3 } from '../game/types';
import type { PlanetBiome, PlanetPopulation } from '../game/era-types';
import { speciesById } from '../game/content';
import { speciesGroundClearance } from '../game/anatomy';
import { ecologyTaxon } from '../game/ecology-catalog';
import type { EcologyTaxon } from '../game/ecology-catalog';
import { livingRootStrength } from '../game/climate';
import { biomeLife } from '../game/planet';
import { groundHeight } from '../game/random';
import { animateSpeciesModel, createSpeciesModel, disposeObject } from './organism';

const COLORS = { producer: 0x9bd292, herbivore: 0xe0c37e, predator: 0xe4957d, partner: 0xb5a3dc, empty: 0x667d76, alive: 0xc5edb1, waiting: 0xd6af72, lost: 0xa87769 };
type Role = EcologyTaxon['role'];
type Bar = { group: THREE.Group; fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; width: number };
type Marker = { group: THREE.Group; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; accent: THREE.MeshStandardMaterial; bar: Bar };
type BiomeView = { group: THREE.Group; ring: Marker['ring']; bar: Bar; slots: THREE.Mesh[]; levels: THREE.Mesh[] };
type PopulationView = Marker & { key: string; bodies: THREE.Group[] };

function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const node = new THREE.Mesh(geometry, material); parent.add(node); node.raycast = () => {}; return node;
}
function ring(parent: THREE.Group, radius: number, color: number): Marker['ring'] {
  const geometry = new THREE.RingGeometry(radius, radius + .14, 48); geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide });
  const node = mesh(parent, geometry, material) as Marker['ring']; node.name = 'ground-ring'; node.userData.groundOverlay = true; return node;
}
function drape(node: Marker['ring'], origin: Vec3): void {
  const vertices = node.geometry.getAttribute('position');
  for (let i = 0; i < vertices.count; i++) vertices.setY(i, groundHeight(origin.x + vertices.getX(i), origin.z + vertices.getZ(i), 2) + .065 - origin.y);
  vertices.needsUpdate = true; node.geometry.computeBoundingSphere();
}
function bar(parent: THREE.Group, width: number, color: number, z: number): Bar {
  const group = new THREE.Group(); group.name = 'vitality-bar'; group.userData.statusBar = true; group.position.z = z; parent.add(group);
  const back = mesh(group, new THREE.PlaneGeometry(width + .14, .3), new THREE.MeshBasicMaterial({ color: 0x233d35, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide }));
  back.rotation.x = -Math.PI / 2; back.renderOrder = 1;
  // Both layers use the transparent queue. renderOrder then keeps the fill last.
  const fill = mesh(group, new THREE.PlaneGeometry(width, .19), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide })) as Bar['fill'];
  fill.rotation.x = -Math.PI / 2; fill.position.y = .015; fill.renderOrder = 2;
  return { group, fill, width };
}
function updateBar(value: Bar, origin: Vec3, fraction: number): void {
  const amount = THREE.MathUtils.clamp(fraction, 0, 1);
  value.fill.scale.x = Math.max(.001, amount); value.fill.position.x = -(1 - amount) * value.width / 2; value.fill.visible = amount > 0;
  let high = -Infinity;
  for (const x of [-value.width / 2 - .07, 0, value.width / 2 + .07]) for (const z of [-.15, 0, .15]) high = Math.max(high, groundHeight(origin.x + x, origin.z + value.group.position.z + z, 2));
  value.group.position.y = high - origin.y + .09;
}
function symbol(parent: THREE.Group, role: Role, accent: THREE.MeshStandardMaterial): THREE.Mesh {
  const shape = role === 'predator' ? new THREE.ConeGeometry(.32, .64, 3)
    : role === 'herbivore' ? new THREE.OctahedronGeometry(.32)
    : new THREE.SphereGeometry(.32, 8, 6);
  const node = mesh(parent, shape, accent); node.name = `role-${role}`;
  if (role === 'producer') node.scale.set(1.5, .4, .75);
  return node;
}
function marker(role: Role, radius: number): Marker {
  const group = new THREE.Group(), accent = new THREE.MeshStandardMaterial({ color: COLORS[role], roughness: .75, emissive: COLORS[role], emissiveIntensity: .18 });
  const icon = symbol(group, role, accent); icon.position.set(0, .75, -radius);
  return { group, accent, ring: ring(group, radius, COLORS[role]), bar: bar(group, radius * 1.4, COLORS[role], radius + .35) };
}
function placeMarker(view: Marker, pos: Vec3, fraction: number): void {
  view.group.position.set(pos.x, groundHeight(pos.x, pos.z, 2), pos.z);
  drape(view.ring, view.group.position); updateBar(view.bar, view.group.position, fraction);
  view.accent.emissiveIntensity = .05 + .25 * THREE.MathUtils.clamp(fraction, 0, 1);
  view.ring.material.opacity = .25 + .55 * THREE.MathUtils.clamp(fraction, 0, 1);
  const icon = view.group.children[0]; icon.position.y = groundHeight(pos.x + icon.position.x, pos.z + icon.position.z, 2) - view.group.position.y + .75;
}
const populationStrength = (population: PlanetPopulation) => THREE.MathUtils.clamp(Math.min(population.vitality / 65, population.abundance / .65, population.nutrition / .35), 0, 1);

/** Read-only biological presentation. Resources and paid machines keep their existing renderer. */
export class PlanetPresentation {
  readonly group = new THREE.Group();
  private biomes = new Map<number, BiomeView>();
  private populations = new Map<number, PopulationView>();
  private roots = new Map<number, Marker>();
  private mothers = new Map<number, Marker>();
  private nursery: Marker | null = null;
  private disposed = false;

  constructor() { this.group.name = 'planet-life'; this.group.visible = false; }

  update(state: GameState, time: number, reducedMotion = false): void {
    if (this.disposed) return;
    const planet = state.planet;
    this.group.visible = state.stage === 5 && planet?.version === 2;
    if (!this.group.visible || !planet || planet.version !== 2) { this.clear(); return; }
    this.retire(this.biomes, new Set(planet.biomes.map(b => b.id)));
    const living = planet.populations.filter(c => c.vitality > 0 && c.abundance > 0 && ecologyTaxon(c.key)?.species);
    this.retire(this.populations, new Set(living.map(c => c.id)));
    this.retire(this.roots, new Set(planet.stabilizers.map(root => root.id)));
    const mothers = planet.nursery.sources.flatMap(source => {
      const resource = state.world.resources.find(r => r.id === source.resourceId);
      return resource ? [{ source, resource }] : [];
    });
    this.retire(this.mothers, new Set(mothers.map(mother => mother.resource.id)));
    for (const biome of planet.biomes) this.updateBiome(state, biome);
    for (const population of living) this.updatePopulation(state,population, time, reducedMotion);
    for (const root of planet.stabilizers) {
      let view = this.roots.get(root.id);
      if (!view) { view = marker('producer', 1.9); view.group.name = `planet-root-${root.id}`; this.group.add(view.group); this.roots.set(root.id, view); }
      const resource = state.world.resources.find(r => r.id === root.site.plantedId), strength = livingRootStrength(state, root.site);
      view.group.userData.key = root.key; view.group.userData.support = strength;
      placeMarker(view, resource?.pos ?? root.site.source, strength);
      view.accent.color.setHex(strength > 0 ? COLORS.producer : COLORS.lost);
      view.ring.material.color.setHex(strength > 0 ? COLORS.producer : COLORS.lost);
    }
    if (!this.nursery) {
      this.nursery = marker('producer', 4.6); this.nursery.group.name = 'planet-nursery'; this.group.add(this.nursery.group);
      const arch = mesh(this.nursery.group, new THREE.TorusGeometry(.8, .12, 6, 12, Math.PI), this.nursery.accent);
      arch.name = 'nursery-arch'; arch.position.set(0, 1.4, 0);
    }
    placeMarker(this.nursery, planet.nursery.pos, 1);
    this.nursery.bar.group.visible = false;
    for (const { source, resource } of mothers) {
      let view = this.mothers.get(resource.id);
      if (!view) { view = marker('producer', 1.2); view.group.name = `planet-mother-${resource.id}`; this.group.add(view.group); this.mothers.set(resource.id, view); }
      view.group.userData.key = source.key; placeMarker(view, resource.pos, resource.max > 0 ? resource.amount / resource.max : 0);
      view.ring.material.color.setHex(resource.amount >= 1 ? COLORS.producer : COLORS.waiting);
    }
  }

  private updateBiome(state: GameState, biome: PlanetBiome): void {
    let view = this.biomes.get(biome.id);
    if (!view) {
      const group = new THREE.Group(); group.name = `planet-biome-${biome.id}`;
      const slots = (['producer', 'producer', 'herbivore', 'herbivore', 'predator'] as const).map((role, index) => {
        const icon = symbol(group, role, new THREE.MeshStandardMaterial({ color: COLORS.empty, roughness: .8 })); icon.position.set((index - 2) * 1.1, .5, 8); return icon;
      });
      const levels = Array.from({ length: 3 }, (_, index) => {
        const pip = mesh(group, new THREE.CylinderGeometry(.18, .24, .6, 6), new THREE.MeshStandardMaterial({ color: COLORS.waiting }));
        pip.name = `biome-level-${index + 1}`; pip.position.set((index - 1) * .7, .4, -9); return pip;
      });
      view = { group, ring: ring(group, 9, COLORS.waiting), bar: bar(group, 5, COLORS.alive, 10), slots, levels };
      this.biomes.set(biome.id, view); this.group.add(group);
    }
    const life = biomeLife(state, biome), suitable = state.planet!.version === 2 && state.planet!.tScore >= biome.level;
    const strengths = [0, 1].map(i => life.roots[i] ? livingRootStrength(state, life.roots[i].site) : 0)
      .concat([0, 1].map(i => life.herbs[i] ? populationStrength(life.herbs[i]) : 0), life.predators[0] ? populationStrength(life.predators[0]) : 0);
    view.group.position.set(biome.pos.x, groundHeight(biome.pos.x, biome.pos.z, 2), biome.pos.z);
    view.group.userData.support = life.support; view.group.userData.suitable = suitable;
    view.ring.material.color.setHex(!suitable ? COLORS.lost : life.support ? COLORS.alive : COLORS.waiting);
    drape(view.ring, view.group.position); updateBar(view.bar, view.group.position, strengths.reduce((a, b) => a + b, 0) / 5);
    view.slots.forEach((slot, index) => {
      const material = slot.material as THREE.MeshStandardMaterial, color = index < 2 ? COLORS.producer : index < 4 ? COLORS.herbivore : COLORS.predator;
      material.color.setHex(COLORS.empty).lerp(new THREE.Color(color), strengths[index]);
      slot.position.y = groundHeight(biome.pos.x + slot.position.x, biome.pos.z + slot.position.z, 2) - view!.group.position.y + .6;
    });
    view.levels.forEach((pip, index) => { pip.visible = index < biome.level; pip.position.y = groundHeight(biome.pos.x + pip.position.x, biome.pos.z + pip.position.z, 2) - view!.group.position.y + .4; });
  }

  private updatePopulation(state: GameState, population: PlanetPopulation, time: number, reducedMotion: boolean): void {
    const taxon = ecologyTaxon(population.key)!, species = worldSpecies(state.world,taxon.species!);
    let view = this.populations.get(population.id);
    if (view && view.key !== population.key) { this.remove(view.group); this.populations.delete(population.id); view = undefined; }
    if (!view) {
      view = { ...marker(taxon.role, 2), key: population.key, bodies: [] }; view.group.name = `planet-population-${population.id}`;
      view.group.userData.key = population.key; this.populations.set(population.id, view); this.group.add(view.group);
    }
    const count = Math.min(3, Math.ceil(population.abundance));
    while (view.bodies.length > count) { const body = view.bodies.pop()!; this.remove(body); }
    while (view.bodies.length < count) { const body = createSpeciesModel(species); body.name = `population-individual-${view.bodies.length}`; view.group.add(body); view.bodies.push(body); }
    placeMarker(view, population.pos, population.vitality / 100);
    view.group.userData.nutrition = population.nutrition; view.group.userData.abundance = population.abundance;
    view.ring.material.color.setHex(populationStrength(population) >= 1 ? COLORS[taxon.role] : COLORS.lost);
    view.bodies.forEach((body, index) => {
      const x = (index - (count - 1) / 2) * 1.8, z = index % 2 ? .6 : -.3;
      body.position.set(x, groundHeight(population.pos.x + x, population.pos.z + z, 2) - view!.group.position.y + speciesGroundClearance(species), z);
      body.rotation.y = population.id * .73 + index * .6;
      animateSpeciesModel(body, reducedMotion ? 0 : time + population.id * .19 + index, 0, species);
    });
  }

  private remove(group: THREE.Group): void { group.removeFromParent(); disposeObject(group); }
  private retire<T extends { group: THREE.Group }>(views: Map<number, T>, ids: Set<number>): void {
    for (const [id, view] of views) if (!ids.has(id)) { this.remove(view.group); views.delete(id); }
  }
  private clear(): void {
    for (const views of [this.biomes, this.populations, this.roots, this.mothers]) { for (const view of views.values()) this.remove(view.group); views.clear(); }
    if (this.nursery) { this.remove(this.nursery.group); this.nursery = null; }
  }
  dispose(): void { if (this.disposed) return; this.clear(); this.group.removeFromParent(); this.group.visible = false; this.disposed = true; }
}
