import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { starSystems } from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { enableBiosphere, livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import type { LivingExpedition, LivingPlanet, LivingSpecimen } from '../src/game/space-biosphere-types';
import { enableForeignEcology, stableBandCapacity, stepForeignEcology } from '../src/game/space-ecology';
import { useSpecimenTool } from '../src/game/space-expedition';
import { foreignLifeLabel, spaceLifeSpecies } from '../src/game/space-life';
import { ForeignSurfaceView } from '../src/render/space-biome';
import { spaceClimate } from '../src/ui/space-climate';
import { spaceBiology } from '../src/ui/space-expedition';

/** Prepared unit inputs isolate presentation. Native reachability is recorded
 * independently by space-ecology-browser, never inferred from these fixtures. */
function fixture() {
  const s = parseGame(readFileSync('tests/fixtures/space/native-c2-carried-life.save.json', 'utf8'));
  enableBiosphere(s); enableForeignEcology(s);
  const e = livingExpedition(s)!, w = livingPlanet(s)!;
  expect(useSpecimenTool(s, 'release', e.cargo[0].id, 2)).toBe(true);
  return { s, e, w, system: starSystems(s.space!.homePlanetId)[1] };
}
function advance(e: LivingExpedition, w: LivingPlanet, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 30); i++) { w.elapsed += 1 / 30; stepForeignEcology(e, w, w.elapsed, 1 / 30); }
}
function bodyAt(view: ForeignSurfaceView, life: LivingSpecimen): THREE.Group {
  const bodies = view.group.children.filter(body => body instanceof THREE.Group && body.position.x === life.pos.x && body.position.z === life.pos.z);
  expect(bodies).toHaveLength(1); return bodies[0] as THREE.Group;
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
function disposal(owned: Resource[]) {
  const count = new Map(owned.map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => count.set(resource, count.get(resource)! + 1));
  return () => { expect(count.size).toBeGreaterThan(0); for (const value of count.values()) expect(value).toBe(1); };
}

describe('C3 ecology presentation follows saved physical life', () => {
  it('scales actual producer biomass and reacts to a real meal without rebuilding the animal genome or animating reduced motion', () => {
    const { e, w, system } = fixture(), view = new ForeignSurfaceView(w, system);
    // Prepared hungry grazers make the next real physiology step observably feed.
    for (const life of w.life) life.nutrition = life.taxonKey.startsWith('culture:') ? .55 : .5;
    const grazer = w.life.find(life => life.taxonKey === 'species:bell')!;
    try {
      view.sync(e, grazer.id, 0, false);
      const body = bodyAt(view, grazer), genome = structuredClone(body.userData.creatureGenome), owned = resources(view.group);
      const plantsBefore = w.life.filter(life => life.taxonKey.startsWith('culture:')).map(life => ({ life, nutrition: life.nutrition, body: bodyAt(view, life) }));
      advance(e, w, 1 / 30);
      const consumed = plantsBefore.find(({ life, nutrition }) => life.nutrition < nutrition + .024 / 30 - 1e-8)!;
      expect(consumed).toBeDefined(); expect(grazer.nutrition).toBeGreaterThan(.5);
      const saved = JSON.stringify(e); view.sync(e, grazer.id, w.elapsed, false);
      expect(bodyAt(view, grazer)).toBe(body); expect(body.userData.creatureGenome).toEqual(genome);
      expect(bodyAt(view, consumed.life)).toBe(consumed.body);
      expect(consumed.body.scale.x).toBeCloseTo(.55 + .45 * Math.sqrt(consumed.life.nutrition), 12);
      expect(body.userData.ecology.feeding).toBe(true); expect(body.rotation.x).not.toBe(0);
      expect(resources(view.group)).toEqual(owned); expect(JSON.stringify(e)).toBe(saved);
      view.sync(e, grazer.id, w.elapsed + .01, true);
      expect(body.userData.ecology.feeding).toBe(false); expect(body.rotation.x).toBe(0);
      for (const { body: plant } of plantsBefore) expect(plant.rotation.z).toBe(0);
      expect(body.userData.creatureGenome).toEqual(genome); expect(resources(view.group)).toEqual(owned); expect(JSON.stringify(e)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('renders a real birth with its parent origin genome and disposes that exact body once after an actual ecological death', () => {
    const { e, w, system } = fixture(), view = new ForeignSurfaceView(w, system);
    try {
      view.sync(e, null, 0, true); const originalBodies = [...view.group.children];
      advance(e, w, 61);
      const child = w.life.find(life => life.habitat.birth && life.taxonKey === 'species:bell')!;
      expect(child).toBeDefined(); expect(e.actions.some(row => row.kind === 'birth' && row.lifeId === child.id)).toBe(true);
      const parent = w.life.find(life => life.id === child.habitat.birth!.parentId)!;
      const parentBody = bodyAt(view, parent), parentOwned = resources(parentBody), parentFreed = disposal(parentOwned);
      const saved = JSON.stringify(e); view.sync(e, child.id, w.elapsed, true);
      expect(originalBodies.every(body => view.group.children.includes(body))).toBe(true);
      const childBody = bodyAt(view, child), childFreed = disposal(resources(childBody));
      expect(childBody).not.toBe(parentBody); expect(childBody.userData.creatureGenome).toEqual(parentBody.userData.creatureGenome);
      expect(childBody.userData.creatureGenome).toEqual(spaceLifeSpecies(e, parent)!.genome);
      expect(childBody.userData.ecology.descendant).toBe(true); expect(JSON.stringify(e)).toBe(saved);
      // A prepared near-death state still uses the real climate/death transaction.
      child.health = .001; w.temperature = 1; w.atmosphere = 1; advance(e, w, 1 / 30);
      expect(e.actions.at(-1)).toMatchObject({ kind: 'death', lifeId: child.id, cause: 'climate', energyPaid: 0 });
      const afterDeath = JSON.stringify(e); view.sync(e, null, w.elapsed, true);
      expect(childBody.parent).toBeNull(); expect(view.group.children).not.toContain(childBody); childFreed();
      expect(bodyAt(view, parent)).toBe(parentBody); expect(resources(parentBody)).toEqual(parentOwned); expect(JSON.stringify(e)).toBe(afterDeath);
      view.dispose(); view.dispose(); childFreed(); parentFreed();
    } finally { view.dispose(); }
  });

  it('separates climatic T3 from lost stable capacity and exposes real hunger, descendant labels and nutrition without changing saves', () => {
    // The new predator must first hunt, then maintain ten continuous seconds.
    const { s, e, w } = fixture(); advance(e, w, 72);
    expect(stableBandCapacity(e, w)).toBe(3);
    let saved = JSON.stringify(s), panel = spaceClimate(s);
    expect(panel).toContain('Klima T3'); expect(panel).toContain('Stabilní kapacita: 3 / 3 pásy'); expect(panel).toContain('Stabilní');
    const child = w.life.find(life => life.habitat.birth && life.taxonKey === 'species:bell')!;
    const biology = spaceBiology(s, child.id, 2), label = foreignLifeLabel(child);
    expect(label).toMatch(/^odnož \d+$/); expect(biology).toContain(label);
    expect(biology).toContain(`výživa ${(child.nutrition * 100).toFixed(0)} %`); expect(biology).toContain('Původ: Jantarový háj · I');
    expect(biology.replace(/<[^>]+>/g, '')).not.toContain(':born-'); expect(JSON.stringify(s)).toBe(saved);
    // Prepared starvation triggers real death receipts and immediate capacity loss.
    const victims = w.life.filter(life => life.taxonKey === 'culture:7' && life.habitat.band === 2);
    for (const life of victims) { life.health = .001; life.nutrition = 0; }
    advance(e, w, 1 / 30); expect(victims.every(life => !w.life.includes(life))).toBe(true);
    expect(stableBandCapacity(e, w)).toBe(1); saved = JSON.stringify(s); panel = spaceClimate(s);
    expect(panel).toContain('Klima T3'); expect(panel).toContain('Stabilní kapacita: 1 / 3 pásy');
    expect(panel).toContain('Pás 2 · 5 / 6 rolí'); expect(panel).toContain('Chybí ekologická role'); expect(panel).toContain('Ztráta života: hlad');
    expect(JSON.stringify(s)).toBe(saved);
  });
});
