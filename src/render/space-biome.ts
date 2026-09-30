import type { LivingSpecimen } from '../game/space-biosphere-types';
import * as THREE from 'three';
import type { ForeignPlanet, SpaceExpedition, SpaceLife } from '../game/space-expedition-types';
import type { StarSystem } from '../game/galaxy';
import { foreignGround, lifeProfile, spaceLifeSpecies } from '../game/space-life';
import { createSpeciesModel, animateSpeciesModel, disposeObject } from './organism';

const ecologicalStressTint = new THREE.Color('#a64522');

export function foreignClimateColors(world: Pick<ForeignPlanet, 'temperature' | 'atmosphere' | 'life'>) {
  const heat = THREE.MathUtils.clamp(world.temperature, -1, 1);
  const base = new THREE.Color('#879990').lerp(new THREE.Color(heat > 0 ? '#d6a46e' : '#d4e4ee'), Math.abs(heat));
  const moisture = THREE.MathUtils.clamp(1 - Math.hypot(world.temperature, world.atmosphere) / 1.2, 0, 1);
  const plants = world.life.filter(life => lifeProfile(life.taxonKey)!.role.endsWith('plant')).length;
  const ground = base.clone().lerp(new THREE.Color('#387b64'), moisture * Math.min(1, plants / 9));
  const sky = new THREE.Color(heat > 0 ? '#806052' : '#466d82').lerp(new THREE.Color('#15222e'), THREE.MathUtils.clamp(-world.atmosphere, 0, 1) * .7);
  return { ground, sky, moisture, atmosphere: THREE.MathUtils.clamp((world.atmosphere + 1) / 2, 0, 1) };
}
/** Updates saved climate in place, preserving the globe's GPU allocations. */
export function updateForeignGlobe(group: THREE.Group, system: StarSystem, world: ForeignPlanet): void {
  const key = `${world.temperature.toFixed(2)}:${world.atmosphere.toFixed(2)}:${world.life.filter(item => lifeProfile(item.taxonKey)!.role.endsWith('plant')).length}`;
  if (group.userData.climateKey === key) return; group.userData.climateKey = key;
  const body = group.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  const positions = body.geometry.getAttribute('position'), colors = body.geometry.getAttribute('color');
  const palette = foreignClimateColors(world);
  for (let i = 0; i < positions.count; i++) {
    const continent = Math.sin(positions.getX(i) * 7 + system.seed % 13) + Math.sin(positions.getZ(i) * 9) * .6 + Math.cos(positions.getY(i) * 8) * .5;
    const color = continent < .2 && palette.moisture > .45 ? new THREE.Color('#397f9e') : palette.ground.clone();
    color.multiplyScalar(.72 + .23 * (continent + 2) / 4); colors.setXYZ(i, color.r, color.g, color.b);
  }
  colors.needsUpdate = true;
  const atmosphere = (group.children[1] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>).material;
  atmosphere.color.copy(palette.sky); atmosphere.opacity = .03 + palette.atmosphere * .18;
}
export function createForeignGlobe(system: StarSystem): THREE.Group {
  const group = new THREE.Group(), geometry = new THREE.SphereGeometry(1, 48, 32), positions = geometry.getAttribute('position'), colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const continent = Math.sin(x * 7 + system.seed % 13) + Math.sin(z * 9) * .6 + Math.cos(y * 8) * .5;
    const color = new THREE.Color(system.living ? continent > .2 ? '#75a77b' : '#346f91' : system.color);
    color.multiplyScalar(.72 + .23 * (continent + 2) / 4);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86 })));
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1.025, 32, 24), new THREE.MeshBasicMaterial({ color: system.color, transparent: true, opacity: .12, depthWrite: false })));
  return group;
}
function plant(life: SpaceLife): THREE.Group {
  const group = new THREE.Group(), role = lifeProfile(life.taxonKey)!.role;
  const color = role === 'small-plant' ? '#73cab4' : role === 'medium-plant' ? '#baa0d8' : '#cddc88';
  const material = new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: .08 });
  if (role === 'small-plant') {
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), material);
      leaf.scale.set(.3, .18 + i % 3 * .11, 1); leaf.rotation.y = i * 2.4; leaf.position.y = .22; group.add(leaf);
    }
  } else if (role === 'medium-plant') {
    for (let i = 0; i < 3; i++) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.07, .13, 1.5, 6), material);
      stem.position.set(Math.sin(i * 2.4) * .45, .75, Math.cos(i * 2.4) * .45); group.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.5, 8, 6), material); cap.scale.y = .5; cap.position.copy(stem.position); cap.position.y = 1.55; group.add(cap);
    }
  } else {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.16, .28, 2.5, 7), material); stalk.position.y = 1.25; group.add(stalk);
    for (let i = 0; i < 5; i++) {
      const bough = new THREE.Mesh(new THREE.SphereGeometry(.9, 8, 6), material);
      bough.position.set(Math.sin(i * 2.4) * .9, 1.8 + i * .2, Math.cos(i * 2.4) * .9); bough.scale.set(1, .45, .65); group.add(bough);
    }
  }
  return group;
}
/** One active detailed foreign surface; it owns and releases all its GPU objects. */
export class ForeignSurfaceView {
  readonly group = new THREE.Group(); private bodies = new Map<string, THREE.Group>();
  private selection: THREE.Mesh;
  private groundMaterial: THREE.MeshStandardMaterial;
  constructor(readonly world: ForeignPlanet, system: StarSystem) {
    const terrain = new THREE.PlaneGeometry(170, 170, 40, 40); terrain.rotateX(-Math.PI / 2);
    const positions = terrain.getAttribute('position');
    for (let i = 0; i < positions.count; i++) positions.setY(i, foreignGround(world.seed, positions.getX(i), positions.getZ(i)));
    terrain.computeVertexNormals();
    this.groundMaterial = new THREE.MeshStandardMaterial({ color: system.living ? '#3b756b' : system.color, roughness: 1 });
    this.group.add(new THREE.Mesh(terrain, this.groundMaterial));
    const seed = world.seed;
    for (let i = 0; i < 18; i++) {
      const angle = i * 2.4 + seed % 17, radius = 25 + i * 2.5, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + i % 3, 0), new THREE.MeshStandardMaterial({ color: system.living ? '#6c9790' : '#c6b299', roughness: 1 }));
      stone.position.set(x, foreignGround(seed, x, z), z); stone.scale.y = .6; this.group.add(stone);
    }
    this.selection = new THREE.Mesh(new THREE.TorusGeometry(1.9, .055, 5, 36), new THREE.MeshBasicMaterial({ color: '#ffe0a3' }));
    this.selection.rotation.x = -Math.PI / 2; this.selection.visible = false; this.group.add(this.selection);
  }
  sync(expedition: SpaceExpedition, selected: string | null, time: number, reducedMotion: boolean) {
    if (expedition.version === 2) this.groundMaterial.color.copy(foreignClimateColors(this.world).ground);
    const alive = new Set(this.world.life.map(item => item.id));
    for (const [id, body] of this.bodies) if (!alive.has(id)) { this.group.remove(body); disposeObject(body); this.bodies.delete(id); }
    for (const life of this.world.life) {
      const species = spaceLifeSpecies(expedition, life);
      let body = this.bodies.get(life.id);
      if (!body) { body = species ? createSpeciesModel(species) : plant(life); this.bodies.set(life.id, body); this.group.add(body); }
      body.position.set(life.pos.x, life.pos.y + (species?.clearance ?? 0), life.pos.z); body.rotation.y = life.heading;
      if (species) animateSpeciesModel(body, reducedMotion ? 0 : time, 0, species);
      else body.rotation.z = reducedMotion ? 0 : Math.sin(time * .8 + life.pos.x) * .025;
      if (expedition.version === 2 && expedition.biosphere.version === 2) {
        // Observe real nutrition changes; this visual never invents a meal or moves a saved body.
        if (species && life.nutrition > (body.userData.lastNutrition ?? life.nutrition) + 1e-8) body.userData.fedUntil = time + .3;
        body.userData.lastNutrition = life.nutrition;
        const feeding = !reducedMotion && (body.userData.fedUntil ?? 0) > time;
        body.rotation.x = feeding ? -.12 * Math.sin(time * 9) : 0;
        if (!species) body.scale.setScalar(.55 + .45 * Math.sqrt(life.nutrition));
        const stress = Math.max(1 - life.health / 100, 1 - life.nutrition) * .32;
        if (!body.userData.ecologyMaterials) {
          const materials = new Set<THREE.MeshStandardMaterial>();
          body.traverse(node => { if (!(node as THREE.Mesh).isMesh) return;
            const mesh = node as THREE.Mesh; for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
              if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) materials.add(material as THREE.MeshStandardMaterial);
          });
          body.userData.ecologyMaterials = [...materials].map(material => ({ material, emissive: material.emissive.clone() }));
        }
        for (const entry of body.userData.ecologyMaterials as { material: THREE.MeshStandardMaterial; emissive: THREE.Color }[]) {
          entry.material.emissive.copy(entry.emissive).lerp(ecologicalStressTint, stress);
        }
        const habitat = (life as LivingSpecimen).habitat;
        body.userData.ecology = { band: habitat.band, health: life.health, nutrition: life.nutrition, feeding, descendant: !!habitat.birth };
      }
    }
    const target = this.world.life.find(life => life.id === selected); this.selection.visible = !!target;
    if (target) this.selection.position.set(target.pos.x, target.pos.y + .09, target.pos.z);
  }
  dispose() { disposeObject(this.group); this.group.clear(); this.bodies.clear(); }
}
