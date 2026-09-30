import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { speciesById } from '../src/game/content';
import { newCreation } from '../src/game/creature-library';
import { starSystems } from '../src/game/galaxy';
import { generatedNpcGenome } from '../src/game/npc-genome';
import { parseGame } from '../src/game/persistence';
import { enableExpedition, useSpecimenTool } from '../src/game/space-expedition';
import type { SpaceLife } from '../src/game/space-expedition-types';
import { createForeignPlanet, spaceLifeSpecies } from '../src/game/space-life';
import { createOrganism, disposeObject } from '../src/render/organism';
import { SpaceRenderer } from '../src/render/space';
import { createForeignGlobe, ForeignSurfaceView } from '../src/render/space-biome';
import { spaceHud, spaceJournal } from '../src/ui/space';
import { spaceBiology, spaceMap } from '../src/ui/space-expedition';

/** Prepared presentation-only locations; this is not native flight/reachability evidence. */
function fixture() {
  const s = parseGame(readFileSync('tests/fixtures/space/native-c1-in-flight.save.json', 'utf8'));
  enableExpedition(s);
  const systems = starSystems(s.space!.homePlanetId);
  const genome = generatedNpcGenome(speciesById('bell'), 7);
  genome.name = 'Zvon <cizí> & vlastní'; genome.width *= 1.5;
  const creation = newCreation(genome, '', 'presentation-origin', 1);
  const source = createForeignPlanet(systems[1], [creation]), destination = createForeignPlanet(systems[2]);
  s.space!.expedition!.worlds = [source, destination];
  s.space!.location = { systemId: source.systemId, planetId: source.id, scale: 'surface', pos: { x: 0, y: 3, z: 0 }, heading: 0 };
  return { s, systems, source, destination, creation };
}
type Resource = THREE.BufferGeometry | THREE.Material;
function resources(root: THREE.Object3D): Resource[] {
  const found = new Set<Resource>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      found.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) found.add(material);
    }
    for (const material of node.userData.ownedMaterials ?? []) found.add(material);
  });
  return [...found];
}
function trackDisposal(owned: Resource[]) {
  const counts = new Map(owned.map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  return () => { expect(counts.size).toBeGreaterThan(0); for (const count of counts.values()) expect(count).toBe(1); };
}
function bodyAt(view: ForeignSurfaceView, life: SpaceLife): THREE.Group {
  const candidates = view.group.children.filter(child => child instanceof THREE.Group && child.position.x === life.pos.x && child.position.z === life.pos.z);
  expect(candidates).toHaveLength(1); return candidates[0] as THREE.Group;
}
function renderHarness() {
  let scene: THREE.Scene | undefined;
  const renderer = {
    getSize: (size: THREE.Vector2) => size.set(1024, 720),
    render: (next: THREE.Scene) => { scene = next; },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, scene: () => { expect(scene).toBeDefined(); return scene!; } };
}

describe('C2 foreign surface presentation and ownership', () => {
  it('renders three visibly distinct plant sizes and the saved origin genome, without changing life', () => {
    const { s, systems, source, creation } = fixture(), e = s.space!.expedition!;
    const before = JSON.stringify(s), view = new ForeignSurfaceView(source, systems[1]);
    const ordinary = createOrganism(generatedNpcGenome(speciesById('bell'), 7));
    try {
      view.sync(e, null, 4, true);
      const plants = ['culture:7', 'culture:8', 'culture:6'].map(key => bodyAt(view, source.life.find(life => life.taxonKey === key)!));
      const heights = plants.map(body => new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y);
      expect(heights[0]).toBeGreaterThan(.2); expect(heights[0]).toBeLessThan(1);
      expect(heights[1]).toBeGreaterThan(heights[0] * 2); expect(heights[2]).toBeGreaterThan(heights[1] * 1.4);
      const animal = source.life.find(life => life.taxonKey === 'species:bell')!, body = bodyAt(view, animal);
      expect(body.userData.creatureGenome).toEqual(creation.genome);
      expect(body.name).toBe(creation.genome.name);
      const customSkin = body.userData.attachmentSurface as THREE.Mesh;
      const ordinarySkin = ordinary.userData.attachmentSurface as THREE.Mesh;
      customSkin.geometry.computeBoundingBox(); ordinarySkin.geometry.computeBoundingBox();
      const width = (mesh: THREE.Mesh) => mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).x;
      expect(width(customSkin) / width(ordinarySkin)).toBeCloseTo(1.5, 5);
      expect(body.position.y).toBeCloseTo(animal.pos.y + spaceLifeSpecies(e, animal)!.clearance!, 8);
      expect(body.rotation.y).toBe(animal.heading); expect(JSON.stringify(s)).toBe(before);
    } finally { view.dispose(); disposeObject(ordinary); }
  });

  it('removes the collected physical body, frees it, and recreates that same origin body after release elsewhere', () => {
    const { s, systems, source, destination } = fixture(), e = s.space!.expedition!;
    const from = new ForeignSurfaceView(source, systems[1]), to = new ForeignSurfaceView(destination, systems[2]);
    try {
      from.sync(e, null, 0, true); to.sync(e, null, 0, true);
      const fromCount = from.group.children.length, toCount = to.group.children.length;
      const item = source.life.find(life => life.taxonKey === 'species:bell')!, body = bodyAt(from, item);
      const genes = structuredClone(body.userData.creatureGenome), freed = trackDisposal(resources(body));
      s.space!.location!.pos = { x: item.pos.x, y: 3, z: item.pos.z };
      expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); expect(useSpecimenTool(s, 'collect', item.id)).toBe(true);
      expect(e.cargo[0]).toBe(item); const collected = JSON.stringify(s);
      from.sync(e, item.id, 1, true); to.sync(e, null, 1, true);
      expect(from.group.children).not.toContain(body); expect(body.parent).toBeNull(); freed();
      expect(from.group.children).toHaveLength(fromCount - 1); expect(to.group.children).toHaveLength(toCount);
      expect(JSON.stringify(s)).toBe(collected);
      s.space!.location = { ...s.space!.location!, systemId: destination.systemId, planetId: destination.id, pos: { x: 4, y: 3, z: -5 } };
      expect(useSpecimenTool(s, 'release', item.id)).toBe(true); expect(destination.life[0]).toBe(item);
      const released = JSON.stringify(s); from.sync(e, null, 2, true); to.sync(e, item.id, 2, true);
      expect(from.group.children).toHaveLength(fromCount - 1); expect(to.group.children).toHaveLength(toCount + 1);
      const transplanted = bodyAt(to, item); expect(transplanted).not.toBe(body);
      expect(transplanted.userData.creatureGenome).toEqual(genes); expect(item.originPlanetId).toBe(source.id);
      expect(JSON.stringify(s)).toBe(released); freed();
    } finally { from.dispose(); to.dispose(); }
  });

  it('reuses existing bodies across frames and releases all owned surface materials and geometry once', () => {
    const { s, source, systems } = fixture(), view = new ForeignSurfaceView(source, systems[1]), e = s.space!.expedition!;
    const before = JSON.stringify(s); view.sync(e, source.life[0].id, 0, true);
    const children = [...view.group.children], owned = resources(view.group), freed = trackDisposal(owned);
    for (let i = 0; i < 12; i++) view.sync(e, source.life[i].id, i / 3, true);
    expect(view.group.children).toEqual(children); expect(resources(view.group)).toEqual(owned);
    expect(JSON.stringify(s)).toBe(before); view.dispose(); view.dispose();
    expect(view.group.children).toHaveLength(0); freed();
  });

  it('creates distinct deterministic living and barren globes and releases their independent resources', () => {
    const systems = starSystems('home-presentation'), before = JSON.stringify(systems);
    const globes = [createForeignGlobe(systems[1]), createForeignGlobe(systems[1]), createForeignGlobe(systems[2])];
    const colors = globes.map(globe => (globe.children.find(child => child instanceof THREE.Mesh && child.geometry.hasAttribute('color')) as THREE.Mesh).geometry.getAttribute('color').array);
    expect(colors[0]).toEqual(colors[1]); expect(colors[0]).not.toEqual(colors[2]);
    for (const values of colors) expect([...values].every(Number.isFinite)).toBe(true);
    const owned = globes.map(resources), freed = owned.map(trackDisposal);
    expect(owned[0].every(resource => !owned[1].includes(resource) && !owned[2].includes(resource))).toBe(true);
    globes.forEach(disposeObject); freed.forEach(check => check()); expect(JSON.stringify(systems)).toBe(before);
  });

  it('rebuilds actual foreign scenes and disposes stellar Points, beam, ship and surface without mutating saves', () => {
    const { s, source, destination } = fixture(), view = new SpaceRenderer(), harness = renderHarness();
    let previous: (() => void) | undefined;
    for (const world of [source, destination, source]) {
      s.space!.location = { ...s.space!.location!, systemId: world.systemId, planetId: world.id, pos: { x: 0, y: 3, z: 0 } };
      const before = JSON.stringify(s); view.render(harness.renderer, s, .3, .7, 25, true);
      previous?.(); // A changed planet must release the entire preceding scene.
      expect(view.cameraState()).toMatchObject({ renderedHomeAtlas: false, foreignSurface: world.id });
      const scene = harness.scene(), points: THREE.Points[] = [];
      scene.traverse(node => { if (node instanceof THREE.Points) points.push(node); });
      expect(points.length).toBeGreaterThan(0);
      const owned = resources(scene), freed = trackDisposal(owned), particleFreed = trackDisposal(points.flatMap(resources));
      view.render(harness.renderer, s, .3, .7, 25, true);
      expect(resources(scene)).toEqual(owned); expect(JSON.stringify(s)).toBe(before);
      previous = () => { freed(); particleFreed(); };
    }
    view.dispose(); view.dispose(); expect(harness.scene().children).toHaveLength(0); previous!();
  });
});

describe('C2 map, cargo and foreign naming', () => {
  it('exposes named map destinations and paid cargo controls with safe source names', () => {
    const { s, source, systems } = fixture(), e = s.space!.expedition!;
    const item = source.life.find(life => life.taxonKey === 'species:bell')!;
    s.space!.location!.pos = { x: item.pos.x, y: 3, z: item.pos.z };
    const map = spaceMap(s); expect(map).toContain('id="space-star-map"'); expect(map).toContain('Hvězdná mapa');
    for (const system of systems) expect(map).toContain(system.name);
    expect(map).toContain(`data-action="space-jump:${systems[2].id}"`);
    expect(spaceHud(s, item.id)).toContain(`<h3>${systems[1].planetName}</h3>`);
    expect(spaceHud(s, item.id)).not.toContain('Přistát v dílně');
    const before = spaceBiology(s, item.id);
    expect(before).toContain('Zvon &lt;cizí&gt; &amp; vlastní'); expect(before).not.toContain('Zvon <cizí>');
    expect(before).toContain(`data-action="space-scan:${item.id}"`); expect(before).toContain(`data-action="space-collect:${item.id}" disabled`);
    expect(useSpecimenTool(s, 'scan', item.id)).toBe(true);
    expect(spaceBiology(s, item.id)).toContain(`data-action="space-collect:${item.id}" >`);
    expect(useSpecimenTool(s, 'collect', item.id)).toBe(true);
    const cargo = spaceBiology(s, item.id);
    expect(cargo).toContain('Život a náklad · 1 / 8'); expect(cargo).toContain(`data-action="space-release:${item.id}" >`);
    expect(cargo).not.toContain(`value="${item.id}"`); expect(e.cargo[0]).toBe(item);
    s.space!.location!.scale = 'system'; expect(spaceHud(s)).toContain(`<h3>${systems[1].name}</h3>`);
    const now = JSON.stringify(s); expect(spaceJournal(s)).toContain(systems[1].name); spaceHud(s);
    expect(JSON.stringify(s)).toBe(now);
  });
});
