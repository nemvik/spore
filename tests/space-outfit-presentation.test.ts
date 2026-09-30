import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { planetSystem, starSystems } from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { shipStats } from '../src/game/ship-design';
import { enableBiosphere } from '../src/game/space-biosphere';
import { enableForeignEcology } from '../src/game/space-ecology';
import { enableSpaceEconomy } from '../src/game/space-economy';
import { enableSpaceEmpires } from '../src/game/space-empires';
import { EMPIRE_PROFILES } from '../src/game/space-empires-content';
import { visitForeignPlanet } from '../src/game/space-expedition';
import { buyShipEquipment, enableSpaceOutfit, equipmentQuote } from '../src/game/space-outfit';
import { equipmentBadge, EQUIPMENT_IDS, installedEquipment, SHIP_EQUIPMENT, shipCapabilities } from '../src/game/space-outfit-content';
import type { ShipEquipment } from '../src/game/space-outfit-types';
import { planetProduct } from '../src/game/space-products';
import { SpaceRenderer } from '../src/render/space';
import { ShipOutfitView } from '../src/render/space-outfit';
import { spaceDock, spaceStatus } from '../src/ui/space';
import { spaceBiology, spaceMap } from '../src/ui/space-expedition';
import { spaceOutfitPanel } from '../src/ui/space-outfit';

/** Presentation-only prepared colony, funds and completed mission snapshots.
 * Purchases call the public API, but these inputs do not prove campaign earning
 * or reachability. Core/fixture/native suites own history and payment evidence. */
function fixture(badges = true, rootsSurvey = false) {
  const s = parseGame(readFileSync('tests/fixtures/space/native-c2-carried-life.save.json', 'utf8'));
  enableBiosphere(s); enableForeignEcology(s); enableSpaceEconomy(s);
  const p = s.space!, world = p.expedition!.worlds.find(world => world.id === p.location!.planetId)!;
  p.leg = null; p.location!.pos = { x: 0, y: 3, z: 0 };
  p.economy!.colonies = [{ id: `${world.id}:colony`, planetId: world.id, product: planetProduct(p.homePlanetId, world.id)!,
    foundedAt: 0, paid: 40, level: 1, upgraded: 0, productiveElapsed: 0, produced: 0, loaded: 0 }];
  p.economy!.balance = 300;
  enableSpaceEmpires(s); enableSpaceOutfit(s);
  if (badges) for (const [index, empire] of p.empires!.entries.entries()) {
    const kind = empire.id === 'roots' && rootsSurvey ? 'survey' : EMPIRE_PROFILES[empire.id].mission;
    empire.contact = index * 4 + 1;
    empire.mission = { kind, targetPlanetId: empire.capitalId, accepted: index * 4 + 2, completed: index * 4 + 3, evidence: [] };
  }
  return { s, p, world, economy: p.economy!, outfit: p.outfit!, base: shipStats(p.ship!.creation.blueprint) };
}
function buyAll(f: ReturnType<typeof fixture>) {
  for (const id of EQUIPMENT_IDS) expect(buyShipEquipment(f.s, id, f.economy.nextAction)).toBe(true);
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '');
function section(html: string, id: ShipEquipment) {
  const found = [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].find(row => row[1].includes(SHIP_EQUIPMENT[id].name));
  expect(found, `Missing ${id} section`).toBeDefined(); return found![1];
}
function button(html: string, id: ShipEquipment) {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(row => row[1].includes(`data-action="space-equipment:${id}|`));
  expect(found, `Missing ${id} button`).toBeDefined(); return { attributes: found![1], text: found![2] };
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
function disposal(owned: Resource[]) {
  const counts = new Map(owned.map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  return (expected: number) => { expect(counts.size).toBeGreaterThan(0); for (const count of counts.values()) expect(count).toBe(expected); };
}
function pulses(view: ShipOutfitView) {
  return resources(view.group).filter((resource): resource is THREE.MeshStandardMaterial => resource instanceof THREE.MeshStandardMaterial && resource.emissive.getHex() !== 0);
}
function sceneRenderer() {
  let scene: THREE.Scene | undefined;
  const renderer = { getSize: (size: THREE.Vector2) => size.set(1024, 640), render: (next: THREE.Scene) => { scene = next; } } as unknown as THREE.WebGLRenderer;
  return { renderer, scene: () => scene! };
}

describe('D2a paid equipment presentation', () => {
  it('shows all fixed prices, useful effects and missing mission badges without granting them from presentation', () => {
    const { s, p, base } = fixture(false), saved = JSON.stringify(s), panel = spaceOutfitPanel(s);
    expect(plain(panel)).toContain('Odznaky a výbava · 0/3 modulů');
    expect(plain(panel)).toContain(`Náklad ${base.cargo} · dosah 18 · stání +${base.solar.toFixed(1)} energie/s.`);
    for (const id of EQUIPMENT_IDS) {
      const spec = SHIP_EQUIPMENT[id], own = section(panel, id);
      expect(plain(own)).toContain(`${spec.name} · ${spec.price} ◈`); expect(plain(own)).toContain(spec.effect);
      expect(plain(own)).toContain(`Nejprve získej odznak ${spec.badge} odevzdáním odpovídající zakázky.`);
      expect(button(panel, id).attributes).toMatch(/\bdisabled\b/); expect(equipmentBadge(p, id)).toBeNull();
    }
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('shows a roots survey as explorer provenance and leaves the ecology module locked', () => {
    const { s, p } = fixture(true, true), saved = JSON.stringify(s), panel = spaceOutfitPanel(s);
    expect(equipmentBadge(p, 'drive')).toEqual({ empireId: 'roots', completedSerial: 7 });
    expect(plain(section(panel, 'drive'))).toContain('◆ Hvězdný zvěd · Kořenový sněm: odevzdaná zakázka.');
    expect(button(panel, 'drive').attributes).not.toMatch(/\bdisabled\b/);
    expect(plain(section(panel, 'solar'))).toContain('◇ Správce života · odevzdej ekologickou zakázku.');
    expect(button(panel, 'solar').attributes).toMatch(/\bdisabled\b/); expect(equipmentBadge(p, 'solar')).toBeNull();
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('does not show an accepted but uncompleted mission as an earned badge', () => {
    const { s, p } = fixture();
    p.empires!.entries.find(empire => empire.id === 'resin')!.mission!.completed = null;
    const saved = JSON.stringify(s), panel = spaceOutfitPanel(s);
    expect(button(panel, 'hold').attributes).toMatch(/\bdisabled\b/);
    expect(plain(section(panel, 'hold'))).toContain('◇ Kupec cest');
    expect(equipmentBadge(p, 'hold')).toBeNull(); expect(JSON.stringify(s)).toBe(saved);
  });

  it('keeps the paid badge source when a different society later completes another mission of the same kind', () => {
    const { s, p, economy, outfit } = fixture();
    const roots = p.empires!.entries.find(empire => empire.id === 'roots')!;
    roots.contact = null; roots.mission = null;
    expect(buyShipEquipment(s, 'drive', economy.nextAction)).toBe(true);
    expect(outfit.purchases[0].unlock).toEqual({ empireId: 'basalt', completedSerial: 11 });
    roots.contact = 13;
    roots.mission = { kind: 'survey', targetPlanetId: roots.capitalId, accepted: 14, completed: 15, evidence: [] };
    expect(equipmentBadge(p, 'drive')).toEqual({ empireId: 'roots', completedSerial: 15 });
    const saved = JSON.stringify(s), paid = plain(section(spaceOutfitPanel(s), 'drive'));
    expect(paid).toContain('◆ Hvězdný zvěd · Čedičová stráž: odevzdaná zakázka.');
    expect(paid).not.toContain('Kořenový sněm'); expect(JSON.stringify(s)).toBe(saved);
  });

  it('explains insufficient funds and binds the displayed purchase to the current economy revision', () => {
    const { s, economy } = fixture(); economy.balance = 59;
    const saved = JSON.stringify(s), panel = spaceOutfitPanel(s);
    for (const id of EQUIPMENT_IDS) {
      expect(button(panel, id).attributes).toMatch(/\bdisabled\b/);
      expect(button(panel, id).attributes).toContain(`|${economy.nextAction}`);
      expect(plain(section(panel, id))).toContain(`Modul stojí ${SHIP_EQUIPMENT[id].price} ◈; lodní pokladna má 59 ◈.`);
      expect(equipmentQuote(s, id, economy.nextAction - 1).reason).toContain('Nabídka už není aktuální.');
    }
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('requires an owned local workshop and explains distance, altitude, orbit, active leg and a dead ship', () => {
    const { s, p, economy } = fixture(), colony = economy.colonies[0];
    const remote = () => {
      const panel = spaceOutfitPanel(s);
      expect(button(panel, 'hold').attributes).toMatch(/\bdisabled\b/);
      expect(plain(section(panel, 'hold'))).toContain('Montáž nabízí domácí dílna nebo vlastní kolonie u majáku do 12 kroků a pod výškou 8.');
    };
    economy.colonies = []; remote(); economy.colonies = [colony];
    p.location!.pos.x = 13; remote(); p.location!.pos.x = 0;
    p.location!.pos.y = 9; remote(); p.location!.pos.y = 3;
    p.location!.scale = 'orbit'; remote(); p.location!.scale = 'surface';
    p.leg = { from: structuredClone(p.location!), to: { ...structuredClone(p.location!), scale: 'orbit' }, duration: 3, elapsed: 1, energyPaid: 4 };
    remote(); p.leg = null;
    expect(button(spaceOutfitPanel(s), 'hold').attributes).not.toMatch(/\bdisabled\b/);
    p.ship!.health = 0;
    expect(plain(section(spaceOutfitPanel(s), 'hold'))).toContain('Výbavu potřebuje živá vlastní loď.');
  });

  it('offers mounting in the real home workshop and keeps the dock integration visible', () => {
    const { s, p } = fixture(); p.location = null;
    const saved = JSON.stringify(s), panel = spaceOutfitPanel(s);
    expect(button(panel, 'hold').attributes).not.toMatch(/\bdisabled\b/);
    expect(spaceDock(s, null)).toContain('id="space-outfit"'); expect(JSON.stringify(s)).toBe(saved);
  });

  it('shows actually paid modules and new capacities without free refill or changes to the original paid ship', () => {
    const f = fixture(), { s, p, economy, base } = f;
    p.ship!.health = 41; p.ship!.energy = 23;
    const original = JSON.stringify([p.ship!.creation, p.ship!.purchase]), cash = economy.balance;
    buyAll(f);
    expect(economy.balance).toBe(cash - 260); expect(economy.ledger.equipment).toBe(260); expect(economy.counts.equipment).toBe(3);
    expect(p.ship!.health).toBe(41); expect(p.ship!.energy).toBe(23);
    expect(JSON.stringify([p.ship!.creation, p.ship!.purchase])).toBe(original);
    expect(shipCapabilities(p)).toMatchObject({ cost: base.cost, health: base.health, energy: base.energy, cargo: base.cargo + 4, jumpRange: 32, solar: base.solar + 2 });
    const saved = JSON.stringify(s), panel = spaceOutfitPanel(s);
    expect(plain(panel)).toContain('Odznaky a výbava · 3/3 modulů');
    for (const id of EQUIPMENT_IDS) {
      expect(plain(section(panel, id))).toContain(`${SHIP_EQUIPMENT[id].name} · namontováno`);
      expect(plain(section(panel, id))).toContain(`Zaplaceno ${SHIP_EQUIPMENT[id].price} ◈ z lodní pokladny. Trvalý modul.`);
      expect(section(panel, id)).not.toContain('data-action="space-equipment:');
    }
    expect(plain(spaceStatus(s))).toContain(`ODOLNOST 41 / ${base.health}`);
    expect(plain(spaceStatus(s))).toContain(`ENERGIE 23.0 / ${base.energy}`);
    expect(plain(spaceStatus(s))).toContain(`Náklad ${p.expedition!.cargo.length} / ${base.cargo + 4}`);
    expect(plain(spaceBiology(s, null))).toContain(`/ ${base.cargo + 4}`);
    expect(plain(spaceMap(s))).toContain('Dosah lodi 32;'); expect(spaceMap(s)).toContain('r="64" fill="#8ed5c111"');
    expect(plain(panel)).toContain(`stání +${(base.solar + 2).toFixed(1)} energie/s`);
    expect(plain(panel)).toContain('montáž energii nedoplní.');
    expect(JSON.stringify(s)).toBe(saved);
  });
});

describe('D2a attachments follow paid receipt snapshots', () => {
  it('does not draw badges or unpaid catalogue modules and creates three different paid shapes', () => {
    const f = fixture(), view = new ShipOutfitView();
    try {
      view.sync(f.p, 1, false); expect(view.group.children).toHaveLength(0);
      buyAll(f); const saved = JSON.stringify(f.s); view.sync(f.p, 2, false);
      expect(view.group.name).toBe('paid-ship-equipment'); expect(view.group.children).toHaveLength(3);
      const shapes = new Map<ShipEquipment, string[]>();
      for (const id of EQUIPMENT_IDS) {
        const module = view.group.getObjectByName(`ship-equipment-${id}`)!, kinds: string[] = [];
        module.traverse(node => { if (node instanceof THREE.Mesh) kinds.push(node.geometry.type); }); shapes.set(id, kinds);
        expect(module.userData.paymentSerial).toBe(f.outfit.purchases.find(row => row.equipment === id)!.serial);
      }
      expect(shapes.get('hold')!.filter(kind => kind === 'CylinderGeometry')).toHaveLength(4);
      expect(shapes.get('drive')!.filter(kind => kind === 'OctahedronGeometry')).toHaveLength(6);
      expect(shapes.get('drive')!.filter(kind => kind === 'TorusGeometry')).toHaveLength(1);
      expect(shapes.get('solar')!.filter(kind => kind === 'SphereGeometry')).toHaveLength(2);
      expect(new Set([...shapes.values()].map(kinds => kinds.sort().join(','))).size).toBe(3);
      expect(JSON.stringify(f.s)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('reuses modules, meshes and shared materials through animation and holds their pulse still for reduced motion', () => {
    const f = fixture(), view = new ShipOutfitView(); buyAll(f);
    try {
      view.sync(f.p, 0, false); const owned = resources(view.group), freed = disposal(owned), children = [...view.group.children], lights = pulses(view);
      expect(lights).toHaveLength(3); const first = lights.map(light => light.emissiveIntensity), saved = JSON.stringify(f.s);
      view.sync(f.p, 1, false); expect(lights.map(light => light.emissiveIntensity)).not.toEqual(first);
      view.sync(f.p, 2, true); expect(lights.map(light => light.emissiveIntensity)).toEqual([.35, .35, .35]);
      view.sync(f.p, 10, true); expect(lights.map(light => light.emissiveIntensity)).toEqual([.35, .35, .35]);
      expect(view.group.children).toEqual(children); expect(resources(view.group)).toEqual(owned); freed(0);
      expect(JSON.stringify(f.s)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('removes modules absent in an earlier restored snapshot and only disposes the removed resources', () => {
    const f = fixture(), view = new ShipOutfitView(); buyAll(f); view.sync(f.p, 0, true);
    const hold = view.group.getObjectByName('ship-equipment-hold')!, holdFreed = disposal(resources(hold));
    const drive = view.group.getObjectByName('ship-equipment-drive')!, driveFreed = disposal(resources(drive));
    const solar = view.group.getObjectByName('ship-equipment-solar')!, solarFreed = disposal(resources(solar));
    try {
      f.outfit.purchases = f.outfit.purchases.filter(row => row.equipment === 'hold');
      const saved = JSON.stringify(f.s); view.sync(f.p, 1, true);
      expect(view.group.children).toEqual([hold]); expect(drive.parent).toBeNull(); expect(solar.parent).toBeNull();
      holdFreed(0); driveFreed(1); solarFreed(1); expect(JSON.stringify(f.s)).toBe(saved);
      view.sync(f.p, 2, true); driveFreed(1); solarFreed(1);
      view.dispose(); holdFreed(1); driveFreed(1); solarFreed(1);
    } finally { view.dispose(); }
  });

  it('disposes each shared geometry/material exactly once and cannot rebuild after disposal', () => {
    const f = fixture(), view = new ShipOutfitView(); buyAll(f); view.sync(f.p, 0, true);
    const owned = resources(view.group), freed = disposal(owned); expect(owned.length).toBeGreaterThan(6);
    view.dispose(); expect(view.group.children).toHaveLength(0); freed(1);
    view.dispose(); view.sync(f.p, 1, false); expect(view.group.children).toHaveLength(0); freed(1);
  });

  it('attaches new purchases to the same original ship and retains them across surface and orbit updates', () => {
    const f = fixture(), view = new SpaceRenderer(), context = sceneRenderer();
    try {
      view.render(context.renderer, f.s, .3, .6, 25, true);
      const outfit = context.scene().getObjectByName('paid-ship-equipment')!, ship = outfit.parent!, original = ship.children.filter(child => child !== outfit);
      const baseResources = resources(ship), baseFreed = disposal(baseResources), blueprint = JSON.stringify(f.p.ship!.creation);
      expect(outfit.children).toHaveLength(0); expect(ship.scale.x).toBe(.8);
      buyAll(f); const saved = JSON.stringify(f.s);
      view.render(context.renderer, f.s, .7, .4, 25, true);
      expect(context.scene().getObjectByName('paid-ship-equipment')).toBe(outfit); expect(outfit.parent).toBe(ship);
      expect(ship.children.filter(child => child !== outfit)).toEqual(original); expect(outfit.children).toHaveLength(3); baseFreed(0);
      expect(JSON.stringify(f.p.ship!.creation)).toBe(blueprint); expect(JSON.stringify(f.s)).toBe(saved);
      const gearResources = resources(outfit), gearFreed = disposal(gearResources);
      f.p.location!.scale = 'orbit'; view.render(context.renderer, f.s, .7, .4, 25, true);
      expect(context.scene().getObjectByName('paid-ship-equipment')).toBe(outfit); expect(resources(outfit)).toEqual(gearResources); gearFreed(0);
      view.dispose(); view.dispose(); gearFreed(1); baseFreed(1);
    } finally { view.dispose(); }
  });

  it('rebuilds attachments once for a new destination while keeping immutable purchases and all installed effects', () => {
    const f = fixture(), view = new SpaceRenderer(), context = sceneRenderer(); buyAll(f);
    try {
      view.render(context.renderer, f.s, .3, .6, 25, true);
      const old = context.scene().getObjectByName('paid-ship-equipment')!, oldFreed = disposal(resources(old));
      const target = starSystems(f.p.homePlanetId).find(system => system.index > 0 && system.planetId !== f.world.id)!;
      f.p.location = { scale: 'surface', planetId: target.planetId, systemId: target.id, pos: { x: 0, y: 3, z: 0 }, heading: 0 };
      visitForeignPlanet(f.s); const saved = JSON.stringify(f.s);
      view.render(context.renderer, f.s, .3, .6, 25, true);
      const current = context.scene().getObjectByName('paid-ship-equipment')!;
      expect(current).not.toBe(old); expect(current.children).toHaveLength(3); oldFreed(1);
      expect(installedEquipment(f.p)).toEqual(EQUIPMENT_IDS); expect(JSON.stringify(f.s)).toBe(saved);
      const newFreed = disposal(resources(current)); view.dispose(); newFreed(1); oldFreed(1);
      expect(planetSystem(f.p.homePlanetId, target.planetId)).not.toBeNull();
    } finally { view.dispose(); }
  });
});
