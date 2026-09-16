import { bodyWidth } from '../game/body-shape';
import * as THREE from 'three';
import { HUNTER_TIMING } from '../game/encounter-ai';
import type { FoodKind, GameState, Resource, Vec3, World } from '../game/types';
import type { EcologySite, HunterMemory } from '../game/journey-types';
import { SITE_STORIES } from '../game/journey-content';
import { environmentalFlow } from '../game/journey';
import { livingStreams, reefWater, streamPoint } from '../game/journey-network';
import { groundHeight } from '../game/random';
import { landSiteSupport } from '../game/climate';

const COLORS: Record<FoodKind, { root: number; leaf: number; heart: number }> = {
  algae: { root: 0x497f71, leaf: 0x83caa1, heart: 0xc4f2bd },
  mineral: { root: 0x496e81, leaf: 0x81c4cb, heart: 0xb7eeee },
  nectar: { root: 0x856c52, leaf: 0xd0a579, heart: 0xf5d39b },
  detritus: { root: 0x686581, leaf: 0xb3a5cd, heart: 0xdfc9f3 },
  meat: { root: 0x785457, leaf: 0xbc8a8f, heart: 0xf0bec1 },
};
const Y = new THREE.Vector3(0, 1, 0);
const DRY = new THREE.Color(0xa9684e);
const clamp01 = (value: number) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
const vitality = (value: number) => clamp01(value / 100);

type Colony = { node: THREE.Group; roots: THREE.Mesh; leaves: THREE.InstancedMesh; heart: THREE.Mesh; stem: THREE.Mesh | null; leafMaterial: THREE.MeshStandardMaterial; heartMaterial: THREE.MeshStandardMaterial };
type Refuge = { node: THREE.Group; roots: THREE.Mesh; material: THREE.MeshStandardMaterial; pos: Vec3 };
type SiteView = { site: EcologySite; source: Colony; growth: Colony; refuges: Refuge[] };
type Strand = { node: THREE.Group; ribbon: THREE.Mesh; motes: THREE.InstancedMesh; from: THREE.Vector3; to: THREE.Vector3; visible: boolean };
type HunterView = { node: THREE.Group; cue: THREE.InstancedMesh; path: THREE.Mesh; cueMaterial: THREE.MeshBasicMaterial; pathMaterial: THREE.MeshBasicMaterial };
type Assets = { roots: THREE.BufferGeometry; stems: THREE.BufferGeometry; leaf: THREE.BufferGeometry; seed: THREE.BufferGeometry; mote: THREE.BufferGeometry };

/** A single resource can be exhausted without making its rooted colony disappear. */
function supply(resource: Resource | undefined): number { return resource && resource.max > 0 ? clamp01(resource.amount / resource.max) : 0; }

function merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), offset = positions.length / 3;
    for (let i = 0; i < position.count; i++) { positions.push(position.getX(i), position.getY(i), position.getZ(i)); normals.push(normal.getX(i), normal.getY(i), normal.getZ(i)); }
    if (geometry.index) for (let i = 0; i < geometry.index.count; i++) indices.push(offset + geometry.index.getX(i));
    else for (let i = 0; i < position.count; i++) indices.push(offset + i);
    geometry.dispose();
  }
  const result = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)).setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setIndex(indices); result.computeBoundingSphere(); return result;
}

function tube(points: THREE.Vector3[], radius: number): THREE.BufferGeometry { return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, radius, 5, false); }

function rootGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = i / 5 * Math.PI * 2;
    const points = Array.from({ length: 7 }, (_, j) => {
      const t = j / 6, a = angle + t * 1.15, radius = .32 + Math.sin(t * Math.PI * .8) * 2.1;
      return new THREE.Vector3(Math.cos(a) * radius, Math.sin(t * Math.PI) * .18, Math.sin(a) * radius);
    });
    pieces.push(tube(points, .065));
  }
  return merge(pieces);
}

function stemGeometry(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    pieces.push(tube([new THREE.Vector3(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25), new THREE.Vector3(Math.cos(a) * .54, .85, Math.sin(a) * .54), new THREE.Vector3(Math.cos(a + .35) * .3, 1.8, Math.sin(a + .35) * .3), new THREE.Vector3(Math.cos(a) * .75, 2.45, Math.sin(a) * .75)], .085));
  }
  return merge(pieces);
}

function leafGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [], indices: number[] = [], rows = 12, columns = 6;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const t = row / rows, side = column / columns * 2 - 1;
    vertices.push(side * Math.pow(Math.sin(t * Math.PI), .72) * .43, t * 1.8, Math.sin(t * Math.PI) * .29 + side * side * .16 * Math.sin(t * Math.PI));
    if (row < rows && column < columns) { const a = row * (columns + 1) + column, b = a + columns + 1; indices.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}

/** Scene-only biological landmarks. Persistent truth remains in journey.ts and World. */
export class JourneyPresentation {
  readonly group = new THREE.Group();
  private world: World | null = null;
  private signature = '';
  private sites: SiteView[] = [];
  private strands = new Map<string, Strand>();
  private hunters = new Map<number, HunterView>();
  private seenHunters = new Set<number>();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private assets: Assets | null = null;
  private cargo: Colony | null = null;
  private flow: THREE.InstancedMesh | null = null;
  private gasFlow: THREE.InstancedMesh | null = null;
  private bodyStreamIds = new Set<string>();
  private flowReady = false;
  private flowPositions = new Float32Array(0);
  private flowAges = new Float32Array(0);
  private flowCycles = new Uint16Array(0);
  private flowCenter = new THREE.Vector3();
  private lastTime = 0;
  private transform = new THREE.Object3D();
  private point = new THREE.Vector3();
  private nextPoint = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private color = new THREE.Color();

  constructor(private scene: THREE.Scene) { this.group.name = 'journey-presentation'; scene.add(this.group); }

  private geometry<T extends THREE.BufferGeometry>(value: T): T { this.geometries.add(value); return value; }
  private material<T extends THREE.Material>(value: T): T { this.materials.add(value); return value; }
  private organic(color: number, glow: number, opacity = 1) { return this.material(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, roughness: .72, metalness: .05, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })); }

  private clear() {
    this.flow?.dispose(); this.gasFlow?.dispose();
    this.group.clear();
    this.geometries.forEach(value => value.dispose()); this.geometries.clear();
    this.materials.forEach(value => value.dispose()); this.materials.clear();
    this.sites = []; this.strands.clear(); this.hunters.clear(); this.seenHunters.clear();
    this.cargo = null; this.flow = null; this.gasFlow = null; this.bodyStreamIds.clear(); this.flowReady = false; this.assets = null; this.flowPositions = new Float32Array(0); this.flowAges = new Float32Array(0); this.flowCycles = new Uint16Array(0);
  }

  dispose() { this.clear(); this.scene.remove(this.group); this.world = null; this.signature = ''; }

  private colony(kind: FoodKind, growth: boolean): Colony {
    const a = this.assets!, colors = COLORS[kind], node = new THREE.Group();
    const roots = new THREE.Mesh(a.roots, this.organic(colors.root, .12)); node.add(roots);
    const leafMaterial = this.organic(colors.leaf, growth ? .14 : .12, growth ? .65 : .86);
    const leaves = new THREE.InstancedMesh(a.leaf, leafMaterial, growth ? 8 : 7); leaves.frustumCulled = false;
    const heartMaterial = this.organic(colors.heart, .65), heart = new THREE.Mesh(a.seed, heartMaterial); node.add(heart, leaves);
    const stem = growth ? new THREE.Mesh(a.stems, roots.material) : null; if (stem) node.add(stem);
    for (let i = 0; i < leaves.count; i++) {
      const angle = i / leaves.count * Math.PI * 2;
      this.transform.position.set(Math.cos(angle) * (growth ? .52 : .84), growth ? 2.15 + (i % 2) * .22 : -.45, Math.sin(angle) * (growth ? .52 : .84));
      this.transform.rotation.set(growth ? .12 : -.18, -angle, growth ? -1.25 : -.38);
      this.transform.scale.setScalar(growth ? 1.25 : .78 + (i % 3) * .07); this.transform.updateMatrix(); leaves.setMatrixAt(i, this.transform.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true; heart.scale.setScalar(growth ? .85 : .65); heart.position.y = growth ? 2.12 : .22;
    roots.receiveShadow = true; if (stem) { stem.castShadow = true; stem.receiveShadow = true; }
    this.group.add(node); return { node, roots, leaves, heart, stem, leafMaterial, heartMaterial };
  }

  private build(s: GameState, signature: string) {
    this.clear(); this.world = s.world; this.signature = signature; this.lastTime = 0;
    this.assets = {
      roots: this.geometry(rootGeometry()), stems: this.geometry(stemGeometry()), leaf: this.geometry(leafGeometry()),
      seed: this.geometry(new THREE.LatheGeometry([new THREE.Vector2(0, -.48), new THREE.Vector2(.18, -.38), new THREE.Vector2(.31, -.15), new THREE.Vector2(.34, .08), new THREE.Vector2(.2, .42), new THREE.Vector2(0, .59)], 16)),
      mote: this.geometry(new THREE.ConeGeometry(.047, .5, 4)),
    };
    for (const site of s.journey.sites) {
      if (site.stage !== s.stage || !SITE_STORIES[site.id]) continue;
      const kind = SITE_STORIES[site.id].kind, source = this.colony(kind, false), growth = this.colony(kind, true);
      source.node.name = `journey-source-${site.id}`; source.node.userData.siteId = site.id; source.node.userData.journeyRole = 'source';
      growth.node.name = `journey-growth-${site.id}`; growth.node.userData.siteId = site.id; growth.node.userData.journeyRole = 'growth';
      const refuges = site.refuges.map((pos, index) => {
        const node = new THREE.Group(), material = this.organic(COLORS[kind].leaf, .3, .56), roots = new THREE.Mesh(this.assets!.roots, material);
        roots.scale.setScalar(1.3); node.add(roots); node.position.set(pos.x, pos.y, pos.z); node.name = `journey-refuge-${site.id}-${index}`;
        node.userData.siteId = site.id; node.userData.refugeIndex = index; node.userData.journeyRole = 'refuge'; this.group.add(node); return { node, roots, material, pos };
      });
      this.sites.push({ site, source, growth, refuges });
      this.makeStrand(`plant-${site.id}`, COLORS[kind].heart);
      if (site.id === 4) site.refuges.forEach((_, i) => this.makeStrand(`vertical-${i}`, COLORS.algae.leaf));
    }
    for (const view of this.sites) if (view.site.patch < 2) this.makeStrand(`supply-${view.site.id}`, COLORS[SITE_STORIES[view.site.id].kind].heart);
    this.makeStrand('return-current', COLORS.mineral.heart);
    this.cargo = this.colony('algae', false); this.cargo.node.name = 'journey-cargo'; this.cargo.node.userData.journeyRole = 'cargo'; this.cargo.roots.visible = false; this.cargo.node.scale.setScalar(.48);
    if (s.stage < 2) {
      const center = s.world.patches[s.stage === 0 ? 1 : 2].center; this.flowCenter.set(center.x, s.stage === 0 ? 1.1 : 6.5, center.z);
      const reefBody = s.stage === 1 && !!s.journey.reefEvolution;
      const flowGeometry = reefBody ? this.geometry(merge([-1, 1].map(side => new THREE.ConeGeometry(.04, .36, 4).translate(side * .09, 0, 0)))) : this.assets.mote;
      this.flow = new THREE.InstancedMesh(flowGeometry, this.material(new THREE.MeshBasicMaterial({ color: s.stage === 0 ? 0xb8d8d7 : 0xb2e4dd, transparent: true, opacity: .56, depthWrite: false })), s.stage === 0 ? 96 : 144);
      this.flow.name = s.stage === 0 ? 'journey-vortex-flow' : 'journey-vent-flow'; this.flow.frustumCulled = false; this.flow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.flow);
      if (reefBody) {
        const clumps = this.geometry(merge([new THREE.IcosahedronGeometry(.1, 0), new THREE.IcosahedronGeometry(.073, 0).translate(.13, .035, .02), new THREE.IcosahedronGeometry(.066, 0).translate(-.08, -.085, .04)]));
        this.gasFlow = new THREE.InstancedMesh(clumps, this.material(new THREE.MeshBasicMaterial({ color: 0xd0a07c, transparent: true, opacity: .68, depthTest: true, depthWrite: false })), this.flow.count);
        this.gasFlow.name = 'reef-gas-clusters'; this.gasFlow.frustumCulled = false; this.gasFlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.gasFlow);
      }
      this.flowPositions = new Float32Array(this.flow.count * 3);
      this.flowAges = new Float32Array(this.flow.count); this.flowCycles = new Uint16Array(this.flow.count);
      for (let i = 0; i < this.flow.count; i++) this.resetMote(i, s.stage);
    }
  }

  private floorOffset(s: GameState, pos: Vec3): number { return s.stage === 2 ? groundHeight(pos.x, pos.z, 2) - pos.y + .08 : -.65; }

  private updateColony(view: Colony, s: GameState, pos: Vec3, health: number, resolved: boolean, resource: Resource | undefined, time: number) {
    const floor = this.floorOffset(s, pos), scale = view.stem ? (resolved ? 1.15 : .72) * (.58 + health * .42) : resolved ? 1.16 : 1;
    view.node.position.set(pos.x, pos.y, pos.z); view.node.scale.setScalar(scale); view.roots.position.y = floor / scale;
    if (view.stem) {
      view.stem.position.y = floor / scale; view.leaves.position.y = floor / scale; view.heart.position.y = floor / scale + 2.12;
    } else { view.leaves.position.y = floor / scale + .65; }
    view.leaves.rotation.y = Math.sin(time * .42 + pos.x * .1) * .04;
    view.heart.scale.setScalar((view.stem ? .8 : .65) * (.72 + supply(resource) * .28) * (1 + Math.sin(time * 1.4) * .035));
    view.heartMaterial.emissiveIntensity = (resolved ? .78 : .38) + supply(resource) * .25;
    view.node.userData.vitality = health; view.node.userData.resolved = resolved;
  }

  update(s: GameState, time: number, dt: number) {
    if (!s.journey || s.journey.legacy) { this.group.visible = false; return; }
    this.group.visible = true;
    const signature = s.journey.sites.filter(site => site.stage === s.stage).map(site => `${site.id}:${site.refuges.length}`).join('|');
    if (this.world !== s.world || signature !== this.signature) this.build(s, signature);
    const elapsed = time === this.lastTime ? 0 : Math.max(0, Math.min(.1, dt)); this.lastTime = time;
    const third = this.sites.find(view => view.site.patch === 2);
    for (const view of this.sites) {
      const site = s.journey.sites.find(site => site.id === view.site.id)!; view.site = site;
      const kind = SITE_STORIES[site.id].kind, source = s.world.resources.find(r => r.id === site.sourceId), planted = site.plantedId === null ? undefined : s.world.resources.find(r => r.id === site.plantedId);
      this.updateColony(view.source, s, site.source, 1, site.resolved, source, time);
      view.source.heartMaterial.color.setHex(COLORS[kind].heart); view.source.heartMaterial.emissive.setHex(COLORS[kind].heart);
      view.growth.node.visible = !!planted && site.vitality > 0; view.growth.node.userData.resourceId = planted?.id ?? null;
      if (planted) {
        const health = vitality(site.vitality); this.updateColony(view.growth, s, planted.pos, health, site.resolved, planted, time);
        view.growth.leafMaterial.color.copy(DRY).lerp(this.color.setHex(COLORS[kind].leaf), health); view.growth.heartMaterial.color.copy(DRY).lerp(this.color.setHex(COLORS[kind].heart), health); view.growth.heartMaterial.emissive.copy(view.growth.heartMaterial.color);
      }
      for (const refuge of view.refuges) {
        refuge.node.visible = site.observed; refuge.roots.position.y = this.floorOffset(s, refuge.pos);
        const occupied = !!planted && Math.hypot(planted.pos.x-refuge.pos.x, planted.pos.y-refuge.pos.y, planted.pos.z-refuge.pos.z) < 2;
        const carriedCulture = s.journey.cargo?.purpose === 'culture' && s.journey.cargo.site === site.id;
        refuge.material.opacity = occupied ? .22 : carriedCulture ? .83 : .49;
        refuge.material.emissiveIntensity = occupied ? .12 : carriedCulture ? .55 : .25;
        refuge.node.userData.occupied = occupied;
      }
      this.updateStrand(`plant-${site.id}`, site.source, planted?.pos, !!planted, time, site.resolved ? .11 : .055);
      if (site.patch < 2 && !(site.id === 4 && s.journey.canopy) && !(s.stage === 1 && s.journey.reefEvolution)) {
        const supported = s.stage === 2 && !s.campaign.won ? landSiteSupport(s, site) > 0 : site.resolved;
        this.updateStrand(`supply-${site.id}`, planted?.pos ?? site.source, third?.site.source, supported && !!third, time, .075);
      }
      if (site.id === 4) site.refuges.forEach((pos, i) => this.updateStrand(`vertical-${i}`, site.source, pos, site.observed && !planted, time, .035));
    }
    if (s.stage === 0 || s.stage === 1 && s.journey.canopy) {
      const streams = livingStreams(s);
      if (s.stage === 1 && s.journey.reefEvolution) {
        const live = new Set(streams.map(stream => stream.id));
        for (const id of this.bodyStreamIds) if (!live.has(id)) this.updateStrand(id, s.player.pos, undefined, false, time, .1);
        for (const stream of streams) {
          const lift = stream.kind === 'lift';
          if (!this.strands.has(stream.id)) this.makeStrand(stream.id, lift ? 0xf0dfb9 : 0xbcebdd);
          this.bodyStreamIds.add(stream.id);
          const strand = this.strands.get(stream.id)!; strand.node.userData.kind = stream.kind;
          (strand.motes.material as THREE.MeshBasicMaterial).color.setHex(lift ? 0xf0dfb9 : 0xbcebdd); (strand.ribbon.material as THREE.MeshBasicMaterial).color.setHex(lift ? 0xf0dfb9 : 0xbcebdd);
          this.updateStrand(stream.id, stream.from, stream.to, true, time, lift ? .17 : .1);
        }
      } else for (const id of s.stage === 0 ? ['supply-0', 'supply-1', 'return-current'] : ['supply-4']) { const stream = streams.find(x => x.id === id); this.updateStrand(id, stream?.from ?? s.player.pos, stream?.to, !!stream, time, stream?.kind === 'current' ? .14 : .1); }
    }
    this.updateCargo(s, time); this.updateFlow(s, elapsed); this.updateHunters(s, time);
  }

  private updateCargo(s: GameState, time: number) {
    const view = this.cargo!, cargo = s.journey.cargo; view.node.visible = !!cargo; if (!cargo) return;
    const p = s.player, side = p.genome.spine ? .65 + bodyWidth(p.genome) * .68 : .65 + p.genome.width * .25, front = .15 * p.genome.length, health = vitality(cargo.vitality);
    view.node.position.set(p.pos.x + Math.cos(p.heading) * side + Math.sin(p.heading) * front, p.pos.y + .36 + Math.sin(time * 2) * .035, p.pos.z - Math.sin(p.heading) * side + Math.cos(p.heading) * front);
    view.node.rotation.set(0, p.heading, -.22); view.node.scale.setScalar(.4 + health * .08);
    view.heartMaterial.color.copy(DRY).lerp(this.color.setHex(COLORS[cargo.kind].heart), health); view.heartMaterial.emissive.copy(view.heartMaterial.color); view.heartMaterial.emissiveIntensity = .15 + health * .75;
    view.leafMaterial.color.copy(DRY).lerp(this.color.setHex(COLORS[cargo.kind].leaf), health); view.leafMaterial.opacity = .55 + health * .3;
    view.node.userData.vitality = health; view.node.userData.siteId = cargo.site;
  }

  private makeStrand(id: string, color: number) {
    const node = new THREE.Group(), vertices = new Float32Array(49 * 2 * 3), indices: number[] = [];
    for (let i = 0; i < 48; i++) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); }
    const geometry = this.geometry(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage))); geometry.setIndex(indices);
    const ribbon = new THREE.Mesh(geometry, this.material(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .18, depthWrite: false })));
    const motes = new THREE.InstancedMesh(this.assets!.mote, this.material(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .65, depthWrite: false })), 9); motes.frustumCulled = false; motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    node.name = `journey-strand-${id}`; node.add(ribbon, motes); this.group.add(node); node.visible = false;
    this.strands.set(id, { node, ribbon, motes, from: new THREE.Vector3(), to: new THREE.Vector3(), visible: false });
  }

  private strandPoint(from: Vec3, to: Vec3, phase: number, out: THREE.Vector3) {
    const point = streamPoint(from, to, phase); return out.set(point.x, point.y, point.z);
  }

  private updateStrand(id: string, from: Vec3, to: Vec3 | undefined, visible: boolean, time: number, width: number) {
    const strand = this.strands.get(id); if (!strand) return; strand.node.visible = visible && !!to; if (!strand.node.visible || !to) { strand.visible = false; return; }
    if (!strand.visible || strand.from.distanceToSquared(from) > .0001 || strand.to.distanceToSquared(to) > .0001 || strand.node.userData.width !== width) {
      const positions = strand.ribbon.geometry.getAttribute('position') as THREE.BufferAttribute, dx = to.x-from.x, dz = to.z-from.z, length = Math.max(.01, Math.hypot(dx, dz));
      for (let i = 0; i <= 48; i++) { this.strandPoint(from, to, i / 48, this.point); const taper = width * Math.sin(i / 48 * Math.PI), lateral = strand.node.userData.kind === 'lift' && Math.hypot(dx, dz) < .001 ? 1 : -dz / length; positions.setXYZ(i * 2, this.point.x + lateral * taper, this.point.y, this.point.z + dx / length * taper); positions.setXYZ(i * 2 + 1, this.point.x - lateral * taper, this.point.y, this.point.z - dx / length * taper); }
      positions.needsUpdate = true; strand.ribbon.geometry.computeBoundingSphere(); strand.from.set(from.x, from.y, from.z); strand.to.set(to.x, to.y, to.z); strand.node.userData.width = width;
    }
    strand.visible = true;
    for (let i = 0; i < strand.motes.count; i++) { const phase = (time * .055 + i / strand.motes.count) % .995; this.strandPoint(from, to, phase, this.point); this.strandPoint(from, to, phase + .005, this.nextPoint); this.direction.subVectors(this.nextPoint, this.point).normalize(); this.transform.position.copy(this.point); this.transform.quaternion.setFromUnitVectors(Y, this.direction); this.transform.scale.setScalar(.6 + Math.sin(phase * Math.PI) * .4); if (strand.node.userData.kind === 'lift') this.transform.scale.y *= 2.5; this.transform.updateMatrix(); strand.motes.setMatrixAt(i, this.transform.matrix); }
    strand.motes.instanceMatrix.needsUpdate = true;
  }

  private moteCenter(index: number, stage: number) {
    return stage === 1 ? this.world!.patches[index % 2 ? 1 : 2].center : this.flowCenter;
  }

  private resetMote(index: number, stage: number) {
    const angle = index * 2.3999632297 + this.flowCycles[index] * .71, radius = 4 + ((index * 17) % 89) / 89 * 19, center = this.moteCenter(index, stage);
    this.flowPositions[index * 3] = center.x + Math.cos(angle) * radius;
    this.flowPositions[index * 3 + 2] = center.z + Math.sin(angle) * radius;
    const floor = stage === 1 ? groundHeight(this.flowPositions[index * 3], this.flowPositions[index * 3 + 2], 1) + 1.3 : .5;
    this.flowPositions[index * 3 + 1] = stage === 0 ? .6 + index % 9 * .24 : floor + (index * 7 % 43) / 43 * (12 - floor);
    this.flowAges[index] = 0; this.flowCycles[index]++;
  }

  private updateFlow(s: GameState, elapsed: number) {
    if (!this.flow) return;
    const animate = elapsed > 0 || !this.flowReady;
    for (let i = 0; i < this.flow.count; i++) {
      const offset = i * 3, center = this.moteCenter(i, s.stage); this.point.fromArray(this.flowPositions, offset);
      if (animate) {
        this.flowAges[i] += elapsed;
        if (this.flowAges[i] > 9 + i % 7 || Math.hypot(this.point.x-center.x, this.point.z-center.z) > 27 || this.point.y < (s.stage === 1 ? groundHeight(this.point.x, this.point.z, 1) + 1.3 : .5) || this.point.y > 13) { this.resetMote(i, s.stage); this.point.fromArray(this.flowPositions, offset); }
      }
      // Root filtration remains visible with reduced motion. Paused/frozen
      // particles retain their exact transforms, even if water chemistry changes.
      const oxygenUse = s.stage === 1 ? reefWater(s, this.point).oxygenUse : 0;
      this.color.setHex(0xb2e4dd).lerp(DRY, Math.min(1, oxygenUse / 5)); this.flow.setColorAt(i, this.color);
      if (!animate && !this.gasFlow) continue;
      const flow = environmentalFlow(s, this.point), speed = Math.hypot(flow.x, flow.y, flow.z);
      if (animate) { this.point.x += flow.x * elapsed; this.point.y += flow.y * elapsed; this.point.z += flow.z * elapsed; this.point.toArray(this.flowPositions, offset); }
      this.transform.position.copy(this.point); this.direction.set(flow.x, flow.y, flow.z).normalize();
      if (speed > .001) this.transform.quaternion.setFromUnitVectors(Y, this.direction); else this.transform.quaternion.identity();
      // A still pocket genuinely has no directional streak, instead of a decorative false current.
      this.transform.scale.set(speed > .01 ? 1 : .28, speed > .01 ? .45 + speed * .17 : .08, speed > .01 ? 1 : .28);
      if (this.gasFlow) this.transform.scale.multiplyScalar(1 - Math.min(1, oxygenUse / 2));
      this.transform.updateMatrix(); this.flow.setMatrixAt(i, this.transform.matrix);
      if (this.gasFlow) { this.transform.scale.setScalar(Math.min(1, oxygenUse / 2) * (1 + (i % 3) * .12)); this.transform.updateMatrix(); this.gasFlow.setMatrixAt(i, this.transform.matrix); }
    }
    if (animate || this.gasFlow) this.flow.instanceMatrix.needsUpdate = true;
    if (this.gasFlow) this.gasFlow.instanceMatrix.needsUpdate = true;
    if (this.flow.instanceColor) this.flow.instanceColor.needsUpdate = true; this.flowReady = true;
  }

  private hunter(): HunterView {
    const node = new THREE.Group(), cueMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0xf5b287, transparent: true, opacity: .9, depthWrite: false }));
    const cue = new THREE.InstancedMesh(this.assets!.leaf, cueMaterial, 2); cue.frustumCulled = false; node.add(cue);
    const pathMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0xe5a77c, side: THREE.DoubleSide, transparent: true, opacity: .2, depthWrite: false }));
    const geometry = this.geometry(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3).setUsage(THREE.DynamicDrawUsage))); geometry.setIndex([0, 2, 1, 2, 3, 1]);
    const path = new THREE.Mesh(geometry, pathMaterial); path.frustumCulled = false; node.add(path); this.group.add(node); return { node, cue, path, cueMaterial, pathMaterial };
  }

  private updateHunter(view: HunterView, memory: HunterMemory, pos: Vec3, heading: number, time: number) {
    const recovering = memory.phase === 'recover', committed = memory.phase === 'lunge' || memory.phase === 'windup' && memory.time <= HUNTER_TIMING.commit + 1e-8;
    view.node.visible = memory.phase !== 'stalk'; view.node.userData.phase = memory.phase; view.node.userData.committed = committed;
    if (!view.node.visible) return;
    view.cueMaterial.color.setHex(recovering ? 0x8aadae : committed ? 0xffe8b4 : 0xffb78b);
    view.cueMaterial.opacity = recovering ? .22 : committed ? 1 : .72 + Math.sin(time * 14) * .18;
    view.pathMaterial.opacity = recovering ? .035 : committed ? .4 : .16;
    const aim = (view.node.userData.aim ??= { x: 0, y: 0, z: 0 }) as Vec3; aim.x = memory.aim.x; aim.y = memory.aim.y; aim.z = memory.aim.z;
    for (let i = 0; i < 2; i++) { const side = i ? 1 : -1; this.transform.position.set(pos.x + Math.cos(heading) * .42 * side, pos.y + .22, pos.z - Math.sin(heading) * .42 * side); this.transform.rotation.set(Math.PI / 2, heading, side * -.2); this.transform.scale.set(.2, recovering ? .33 : .62, .2); this.transform.updateMatrix(); view.cue.setMatrixAt(i, this.transform.matrix); } view.cue.instanceMatrix.needsUpdate = true;
    const dx = memory.aim.x-pos.x, dz = memory.aim.z-pos.z, length = Math.max(.001, Math.hypot(dx, dz)), x = -dz/length, z = dx/length, points = view.path.geometry.getAttribute('position') as THREE.BufferAttribute;
    points.setXYZ(0, pos.x+x*.35, pos.y+.12, pos.z+z*.35); points.setXYZ(1, pos.x-x*.35, pos.y+.12, pos.z-z*.35); points.setXYZ(2, memory.aim.x+x*.035, memory.aim.y+.12, memory.aim.z+z*.035); points.setXYZ(3, memory.aim.x-x*.035, memory.aim.y+.12, memory.aim.z-z*.035); points.needsUpdate = true;
  }

  private updateHunters(s: GameState, time: number) {
    this.seenHunters.clear();
    for (const memory of s.journey.hunters) {
      if (memory.stage !== s.stage) continue; const creature = s.world.creatures.find(c => c.id === memory.id); if (!creature) continue;
      this.seenHunters.add(memory.id); let view = this.hunters.get(memory.id);
      if (!view && memory.phase !== 'stalk') { view = this.hunter(); view.node.name = `journey-hunter-${memory.id}`; this.hunters.set(memory.id, view); }
      if (view) this.updateHunter(view, memory, creature.pos, creature.heading, time);
    }
    for (const [id, view] of this.hunters) if (!this.seenHunters.has(id)) {
      this.group.remove(view.node); view.path.geometry.dispose(); this.geometries.delete(view.path.geometry); this.materials.delete(view.cueMaterial); this.materials.delete(view.pathMaterial); view.cueMaterial.dispose(); view.pathMaterial.dispose(); this.hunters.delete(id);
    }
  }
}
