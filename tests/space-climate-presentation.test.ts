import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { starSystems } from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { activatePlanetBiosphere, enableBiosphere, livingExpedition, livingPlanet, setClimateTool } from '../src/game/space-biosphere';
import { useSpecimenTool } from '../src/game/space-expedition';
import { createForeignPlanet } from '../src/game/space-life';
import { disposeObject } from '../src/render/organism';
import { SpaceRenderer } from '../src/render/space';
import { createForeignGlobe, foreignClimateColors, updateForeignGlobe } from '../src/render/space-biome';
import { spaceClimate } from '../src/ui/space-climate';
import { spaceBiology, spaceMap } from '../src/ui/space-expedition';

// Explicit prepared presentation regressions. Climate values are isolated inputs,
// not claimed paid work or a native terraform/reachability demonstration.
function fixture() {
  const s = parseGame(readFileSync('tests/fixtures/space/native-c2-carried-life.save.json', 'utf8'));
  enableBiosphere(s); return s;
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
  }); return [...found];
}
function trackDisposal(owned: Resource[]) {
  const counts = new Map(owned.map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  return () => { expect(counts.size).toBeGreaterThan(0); for (const count of counts.values()) expect(count).toBe(1); };
}

describe('C3 saved climate presentation with stable render resources', () => {
  it('recolors both hot and cold globes toward temperate conditions using the same GPU attributes and materials', () => {
    for (const index of [2, 3]) {
      const system = starSystems('home-climate-presentation')[index], world = createForeignPlanet(system), globe = createForeignGlobe(system);
      const owned = resources(globe), freed = trackDisposal(owned);
      const surface = globe.children[0] as THREE.Mesh, atmosphere = globe.children[1] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
      const colors = surface.geometry.getAttribute('color') as THREE.BufferAttribute;
      const vertices = surface.geometry.getAttribute('position'), initialPositions = Array.from(vertices.array);
      const source = JSON.stringify(world); updateForeignGlobe(globe, system, world);
      expect(JSON.stringify(world)).toBe(source);
      const harshColors = Array.from(colors.array), harshAtmosphere = atmosphere.material.opacity, harshPalette = foreignClimateColors(world);
      world.temperature = 0; world.atmosphere = 0; const temperate = JSON.stringify(world);
      updateForeignGlobe(globe, system, world);
      expect(surface.geometry.getAttribute('color')).toBe(colors); expect(surface.geometry.getAttribute('position')).toBe(vertices);
      expect(Array.from(vertices.array)).toEqual(initialPositions); expect(Array.from(colors.array)).not.toEqual(harshColors);
      expect(atmosphere.material.opacity).not.toBe(harshAtmosphere); expect(foreignClimateColors(world).moisture).toBeGreaterThan(harshPalette.moisture);
      const version = colors.version; updateForeignGlobe(globe, system, world);
      expect(colors.version).toBe(version); expect(resources(globe)).toEqual(owned); expect(JSON.stringify(world)).toBe(temperate);
      disposeObject(globe); freed();
    }
  });

  it('shows current climatic T, all tools and actual per-band populations while the map abandons stale discovered climate labels', () => {
    const s = fixture(), e = livingExpedition(s)!, world = livingPlanet(s)!, systems = starSystems(s.space!.homePlanetId);
    expect(setClimateTool(s, 'cool')).toBe(true);
    const before = JSON.stringify(s), panel = spaceClimate(s);
    expect(panel).toContain('Klima T3'); expect(panel).toContain('Teplota 0.00, atmosféra 0.00, klimatické T3');
    for (const tool of ['warm', 'cool', 'thicken', 'thin', 'off']) expect(panel).toContain(`data-action="space-climate:${tool}"`);
    expect(panel).toContain('data-action="space-climate:cool" aria-pressed="true"');
    const bands = [...panel.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(match => match[1]);
    expect(bands).toHaveLength(3);
    expect(bands[0]).toContain('Býložravci A/B 2/2 · predátor 2');
    expect(bands[1]).toContain('Býložravci A/B 2/1 · predátor 2');
    expect(bands[2]).toContain('Býložravci A/B 2/2 · predátor 2');
    for (const band of bands) expect(band).toContain('Rostliny M/S/V 2/2/2');
    expect(JSON.stringify(s)).toBe(before);
    const item = e.cargo[0]; expect(useSpecimenTool(s, 'release', item.id, 3)).toBe(true);
    const updatedBands = [...spaceClimate(s).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(match => match[1]);
    expect(updatedBands[1]).toContain('Býložravci A/B 2/1'); expect(updatedBands[2]).toContain('Býložravci A/B 2/3');
    expect(spaceBiology(s, item.id, 3)).toContain('option value="3" selected');
    const visitedHot = activatePlanetBiosphere(createForeignPlanet(systems[2]));
    visitedHot.temperature = 0; visitedHot.atmosphere = 0; e.worlds.push(visitedHot);
    const visitedCold = activatePlanetBiosphere(createForeignPlanet(systems[3]));
    visitedCold.temperature = 0; visitedCold.atmosphere = 0; e.worlds.push(visitedCold);
    const saved = JSON.stringify(s), entries = [...spaceMap(s).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(match => match[1]);
    for (const system of [systems[2], systems[3]]) {
      const entry = entries.find(text => text.includes(system.name))!;
      expect(entry).toContain('Klima T3 · teplota 0.00 · atmosféra 0.00');
      expect(entry).not.toContain('Horko · řídká'); expect(entry).not.toContain('Chlad · hustá');
    }
    expect(entries.find(text => text.includes(systems[5].name))).toContain('Horko · řídká atmosféra');
    expect(JSON.stringify(s)).toBe(saved); expect(world.life).toContain(item);
  });

  it('keeps the same physical bodies, geometry and stellar Points across repeated v2 climate frames, then releases every resource', () => {
    const s = fixture(), world = livingPlanet(s)!, view = new SpaceRenderer();
    let scene: THREE.Scene | undefined;
    const renderer = { getSize: (size: THREE.Vector2) => size.set(1024, 720), render: (next: THREE.Scene) => { scene = next; } } as unknown as THREE.WebGLRenderer;
    expect(setClimateTool(s, 'warm')).toBe(true); view.render(renderer, s, .3, .7, 25, true);
    const owned = resources(scene!), freed = trackDisposal(owned), bodies: THREE.Object3D[] = [], points: THREE.Points[] = [];
    scene!.traverse(node => { if (node.userData.creatureGenome) bodies.push(node); if (node instanceof THREE.Points) points.push(node); });
    expect(bodies.length).toBeGreaterThan(0); expect(points.length).toBeGreaterThan(0);
    const bodiesGenes = bodies.map(body => structuredClone(body.userData.creatureGenome)), particleFreed = trackDisposal(points.flatMap(resources));
    const backgrounds: string[] = [];
    for (const [temperature, atmosphere] of [[.8, -.7], [-.75, .8], [0, 0], [.8, -.7], [0, 0]]) {
      world.temperature = temperature; world.atmosphere = atmosphere;
      const saved = JSON.stringify(s); view.render(renderer, s, .3, .7, 25, true);
      const currentBodies: THREE.Object3D[] = [], currentPoints: THREE.Points[] = [];
      scene!.traverse(node => { if (node.userData.creatureGenome) currentBodies.push(node); if (node instanceof THREE.Points) currentPoints.push(node); });
      expect(currentBodies).toEqual(bodies); expect(currentPoints).toEqual(points); expect(resources(scene!)).toEqual(owned);
      expect(currentBodies.map(body => body.userData.creatureGenome)).toEqual(bodiesGenes);
      expect(JSON.stringify(s)).toBe(saved); backgrounds.push((scene!.background as THREE.Color).getHexString());
    }
    expect(new Set(backgrounds).size).toBeGreaterThan(1);
    view.dispose(); view.dispose(); expect(scene!.children).toHaveLength(0); freed(); particleFreed();
  });
});
