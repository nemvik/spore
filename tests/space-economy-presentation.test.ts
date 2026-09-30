import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { starSystems } from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { enableBiosphere, livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { enableForeignEcology, stableBandCapacity } from '../src/game/space-ecology';
import { colonyCapacity, colonyStock, enableSpaceEconomy, shipCargoCount } from '../src/game/space-economy';
import type { Colony, SpaceEconomyKind } from '../src/game/space-economy-types';
import { planetProduct, SPACE_PRODUCTS, SPACE_PRODUCT_KEYS, spaceMarketPrice } from '../src/game/space-products';
import { shipStats } from '../src/game/ship-design';
import { SpaceRenderer } from '../src/render/space';
import { SpaceColonyView } from '../src/render/space-colony';
import { spaceDock, spaceStatus } from '../src/ui/space';
import { spaceEconomyPanel } from '../src/ui/space-economy';
import { spaceBiology, spaceMap } from '../src/ui/space-expedition';

/** Prepared presentation inputs only: stock, accounts, location and stability
 * are isolated here. These tests do not claim paid history or native reachability. */
function fixture() {
  const s = parseGame(readFileSync('tests/fixtures/space/native-c2-carried-life.save.json', 'utf8'));
  enableBiosphere(s); enableForeignEcology(s); enableSpaceEconomy(s);
  const p = s.space!, life = livingExpedition(s)!, world = livingPlanet(s)!, economy = p.economy!;
  world.temperature = 0; world.atmosphere = 0; world.biosphere.stableFor = [10, 10, 10];
  for (const item of world.life) { item.health = 90; item.nutrition = .9; item.habitat.sinceHunt = 0; }
  p.leg = null; p.location!.pos = { x: 0, y: 3, z: 0 };
  const colony: Colony = { id: `${world.id}:colony`, planetId: world.id, product: planetProduct(p.homePlanetId, world.id)!,
    foundedAt: 0, paid: 40, level: 2, upgraded: 20, productiveElapsed: 42, produced: 7, loaded: 2 };
  economy.colonies = [colony]; economy.cargo = [{ planetId: world.id, product: colony.product, amount: 2 }];
  economy.balance = 40; economy.ledger.deposits = 100; economy.ledger.construction = 40; economy.ledger.upgrades = 20;
  s.machines!.resource = 60;
  expect(stableBandCapacity(life, world)).toBe(3);
  return { s, p, life, world, economy, colony, systems: starSystems(p.homePlanetId) };
}
function button(html: string, kind: SpaceEconomyKind) {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find(match => match[1].includes(`data-action="space-economy:${kind}|`));
  expect(found, `Missing ${kind} button`).toBeDefined();
  return { attributes: found![1], text: found![2] };
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '');
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
function disposal(owned: Resource[]) {
  const counts = new Map(owned.map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  return (expected: number) => { expect(counts.size).toBeGreaterThan(0); for (const count of counts.values()) expect(count).toBe(expected); };
}
function parts(view: SpaceColonyView) {
  const groups = view.group.children.filter(child => child instanceof THREE.Group);
  const pods = groups.filter(group => group.children.length === 2 && group.name !== 'colony-quarantine');
  const vane = groups.find(group => group.children.length === 3)!;
  const crates = view.group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && child.geometry.type === 'OctahedronGeometry');
  const lampMesh = view.group.children.find(child => child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial
    && child.material.emissive.getHex() !== 0) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  expect(pods).toHaveLength(3); expect(crates).toHaveLength(24); expect(vane).toBeDefined(); expect(lampMesh).toBeDefined();
  return { pods, vane, crates, lamp: lampMesh.material };
}

describe('C3b colony and market presentation', () => {
  it('shows purchased level, actual stock, ecological capacity and combined cargo without mutating the campaign', () => {
    const { s, p, life, colony } = fixture(), saved = JSON.stringify(s), stats = shipStats(p.ship!.creation.blueprint);
    const panel = spaceEconomyPanel(s), count = life.cargo.length + 2;
    expect(colonyCapacity(s, colony)).toBe(2); expect(colonyStock(colony)).toBe(5); expect(shipCargoCount(s)).toBe(count);
    expect(panel).toContain('Kolonie 2 · výroba 2/3'); expect(panel).toContain('Sklad 5 / 16'); expect(panel).toContain('Výroba 2 ks / 10 s');
    expect(panel).toContain('Další cyklus za 8.0 s výroby.'); expect(panel).toContain(`náklad ${count} / ${stats.cargo}`);
    expect(panel).toContain(`${SPACE_PRODUCTS[colony.product].name} ×2`); expect(panel).toContain(`--product-color:${SPACE_PRODUCTS[colony.product].color}`);
    expect(button(panel, 'load').attributes).not.toMatch(/\bdisabled\b/);
    expect(spaceStatus(s)).toContain(`Náklad ${count} / ${stats.cargo}`);
    expect(spaceBiology(s, null)).toContain(`Život a náklad · ${count} / ${stats.cargo}`);
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('keeps stock and purchased level visible after lost stability and explains how production can resume', () => {
    const { s, world, colony } = fixture(); world.biosphere.stableFor = [0, 0, 0];
    const saved = JSON.stringify(s), panel = spaceEconomyPanel(s);
    expect(colonyCapacity(s, colony)).toBe(0); expect(panel).toContain('Kolonie 2 · výroba 0/3');
    expect(panel).toContain('Sklad 5 / 16 · zachováno'); expect(panel).toContain('Výroba čeká na obnovu prvního stabilního pásu.');
    expect(panel).toContain('Pokles stability uchová kolonii i vyrobené zásoby.');
    expect(button(panel, 'load').attributes).not.toMatch(/\bdisabled\b/);
    expect(button(panel, 'upgrade').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Další úroveň potřebuje vyšší souvislý stabilní pás.');
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('renders actionable reasons for a remote beacon, full cargo and empty warehouse', () => {
    const { s, p, life, economy, colony } = fixture();
    p.location!.pos.x = 20;
    let panel = spaceEconomyPanel(s);
    expect(button(panel, 'load').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Přibliž se k povrchovému majáku do 12 kroků a klesni pod výšku 8.');
    p.location!.pos.x = 0;
    economy.cargo[0].amount = shipStats(p.ship!.creation.blueprint).cargo - life.cargo.length;
    panel = spaceEconomyPanel(s);
    expect(button(panel, 'load').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Živé exempláře a produkce sdílejí lodní kapacitu.');
    economy.cargo = []; colony.loaded = colony.produced;
    panel = spaceEconomyPanel(s);
    expect(button(panel, 'load').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Sklad je prázdný.');
    expect(plain(panel)).toContain('Stabilní pásy umožňují výrobu jednou za 10 aktivních sekund.');
  });

  it('requires living stability for founding and shows domestic payment and destination sale prices before an action', () => {
    const { s, p, world, economy, colony } = fixture();
    economy.colonies = []; economy.cargo = []; world.biosphere.stableFor = [0, 0, 0];
    let panel = spaceEconomyPanel(s);
    expect(button(panel, 'found').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Kolonie potřebuje skutečně stabilní první živý pás.');
    expect(plain(panel)).toContain('Klimatické T samo nestačí.');
    economy.colonies = [colony]; economy.cargo = [{ planetId: colony.planetId, product: colony.product, amount: 2 }];
    p.location = null; s.machines!.resource = 19;
    const saved = JSON.stringify(s); panel = spaceEconomyPanel(s);
    const price = spaceMarketPrice(p.homePlanetId, p.homePlanetId, colony.product)!;
    expect(button(panel, 'deposit').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('V domácí pokladně chybí 20 jantaru.');
    expect(plain(panel)).toContain(`Zde ${price} ◈/ks · celkem ${price * 2} ◈`);
    expect(button(panel, 'sell').attributes).not.toMatch(/\bdisabled\b/);
    expect(button(panel, 'sell').attributes).toContain(`|${colony.planetId}`);
    expect(spaceDock(s, null)).toContain('Pokladna a domácí trh'); expect(JSON.stringify(s)).toBe(saved);
    s.machines!.resource = 20; panel = spaceEconomyPanel(s);
    expect(button(panel, 'deposit').attributes).not.toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Vklad stojí stejných 20 ◈ doma.');
  });

  it('shows actual owned stock and all three local prices on the map without inventing a market on a barren planet', () => {
    const { s, p, colony, systems } = fixture(), saved = JSON.stringify(s);
    const entries = [...spaceMap(s).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(match => plain(match[1]));
    const home = entries.find(entry => entry.startsWith(`⌂ · ${systems[0].name}`))!;
    const source = entries.find(entry => entry.startsWith(`1 · ${systems[1].name}`))!;
    expect(source).toContain(`Vlastní kolonie 2 · ${SPACE_PRODUCTS[colony.product].name} · sklad 5`);
    for (const product of SPACE_PRODUCT_KEYS) {
      expect(home).toContain(`${SPACE_PRODUCTS[product].name} ${spaceMarketPrice(p.homePlanetId, systems[0].planetId, product)}`);
      expect(source).toContain(`${SPACE_PRODUCTS[product].name} ${spaceMarketPrice(p.homePlanetId, systems[1].planetId, product)}`);
    }
    const barren = systems.find(system => system.index > 0 && !system.living)!;
    expect(entries.find(entry => entry.startsWith(`${barren.index} · ${barren.name}`))).not.toContain('Trh · ◈ za kus');
    expect(JSON.stringify(s)).toBe(saved);
  });
});

describe('C3b colony geometry follows the existing paid colony', () => {
  it('updates the same pods, crates, geometry and materials for levels, real stock and inactive capacity', () => {
    const { colony } = fixture(), view = new SpaceColonyView(colony.id, colony, 1.25);
    try {
      const owned = resources(view.group), children = [...view.group.children], { pods, crates, lamp } = parts(view);
      const saved = JSON.stringify(colony); view.sync(colony, 2, 12, false);
      expect(view.group.position.toArray()).toEqual([-7, 1.25, -5]);
      expect(pods.filter(pod => pod.visible)).toHaveLength(2); expect(crates.filter(crate => crate.visible)).toHaveLength(5);
      expect(view.group.userData.colony).toEqual({ id: colony.id, level: 2, capacity: 2, stock: 5, product: colony.product, quarantined: false });
      const activeIntensity = lamp.emissiveIntensity, activeColor = lamp.color.getHex();
      expect(JSON.stringify(colony)).toBe(saved);
      colony.level = 3; colony.produced = 26; colony.loaded = 2; const grown = JSON.stringify(colony);
      view.sync(colony, 0, 20, false);
      expect(pods.filter(pod => pod.visible)).toHaveLength(3); expect(crates.filter(crate => crate.visible)).toHaveLength(24);
      expect(view.group.userData.colony).toMatchObject({ level: 3, capacity: 0, stock: 24 });
      expect(lamp.emissiveIntensity).toBeLessThan(activeIntensity); expect(lamp.color.getHex()).not.toBe(activeColor);
      expect(view.group.children).toEqual(children); expect(resources(view.group)).toEqual(owned); expect(JSON.stringify(colony)).toBe(grown);
      colony.loaded = colony.produced; view.sync(colony, 1, 30, false);
      expect(crates.filter(crate => crate.visible)).toHaveLength(0); expect(resources(view.group)).toEqual(owned);
    } finally { view.dispose(); }
  });

  it('stops decorative rotation for reduced motion and inactive production without hiding paid pods or stock', () => {
    const { colony } = fixture(), view = new SpaceColonyView(colony.id, colony, 0);
    try {
      const { vane, pods, crates } = parts(view), saved = JSON.stringify(colony);
      view.sync(colony, 2, 5, false); const first = vane.rotation.y;
      view.sync(colony, 2, 10, false); expect(vane.rotation.y).not.toBe(first);
      view.sync(colony, 2, 20, true); expect(vane.rotation.y).toBe(0);
      view.sync(colony, 2, 40, true); expect(vane.rotation.y).toBe(0);
      view.sync(colony, 0, 45, false); expect(vane.rotation.y).toBe(0);
      expect(pods.filter(pod => pod.visible)).toHaveLength(2); expect(crates.filter(crate => crate.visible)).toHaveLength(5);
      expect(JSON.stringify(colony)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('disposes shared crate geometry and shared materials exactly once, including repeated disposal', () => {
    const { colony } = fixture(), view = new SpaceColonyView(colony.id, colony, 0), { crates } = parts(view);
    const owned = resources(view.group), freed = disposal(owned);
    expect(new Set(crates.map(crate => crate.geometry)).size).toBe(1);
    expect(new Set(crates.map(crate => crate.material)).size).toBe(1);
    view.sync(colony, 2, 5, false); freed(0);
    view.dispose(); expect(view.group.children).toHaveLength(0); freed(1);
    view.dispose(); freed(1);
  });

  it('keeps the same colony in the space scene across updates and releases it once when leaving the surface', () => {
    const { s, p, colony, world } = fixture(), view = new SpaceRenderer();
    let scene: THREE.Scene | undefined;
    const renderer = { getSize: (size: THREE.Vector2) => size.set(1024, 720), render: (next: THREE.Scene) => { scene = next; } } as unknown as THREE.WebGLRenderer;
    try {
      view.render(renderer, s, .3, .7, 25, true);
      const model = scene!.getObjectByName('foreign-colony')!, owned = resources(model), freed = disposal(owned);
      expect(model).toBeDefined(); expect(model.userData.colony).toMatchObject({ id: colony.id, level: 2, capacity: 2, stock: 5 });
      colony.loaded = 5; world.biosphere.stableFor = [0, 0, 0]; const saved = JSON.stringify(s);
      view.render(renderer, s, .3, .7, 25, true);
      expect(scene!.getObjectByName('foreign-colony')).toBe(model); expect(resources(model)).toEqual(owned); freed(0);
      expect(model.userData.colony).toMatchObject({ id: colony.id, level: 2, capacity: 0, stock: 2 }); expect(JSON.stringify(s)).toBe(saved);
      p.location!.scale = 'orbit'; view.render(renderer, s, .3, .7, 25, true);
      expect(scene!.getObjectByName('foreign-colony')).toBeUndefined(); expect(model.parent).toBeNull(); freed(1);
      view.dispose(); view.dispose(); freed(1);
    } finally { view.dispose(); }
  });
});
