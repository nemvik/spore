import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { planetSystem } from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { enableBiosphere } from '../src/game/space-biosphere';
import { enableForeignEcology } from '../src/game/space-ecology';
import { economyQuote, enableSpaceEconomy } from '../src/game/space-economy';
import { empireAt, empireRelation, enableSpaceEmpires, spaceSalePrice } from '../src/game/space-empires';
import { EMPIRE_IDS, EMPIRE_PROFILES } from '../src/game/space-empires-content';
import type { EmpireId } from '../src/game/space-empires-types';
import { applyExpansionOrder, enableSpaceExpansion, expansionQuote, placeSpaceAllies } from '../src/game/space-expansion';
import { allyFormation, ownerAt } from '../src/game/space-expansion-content';
import type { ExpansionKind } from '../src/game/space-expansion-types';
import { visitForeignPlanet } from '../src/game/space-expedition';
import { enableSpaceOutfit } from '../src/game/space-outfit';
import type { GameState } from '../src/game/types';
import { SpaceRenderer } from '../src/render/space';
import { SpaceAlliesView } from '../src/render/space-allies';
import { spaceDock, spaceStatus } from '../src/ui/space';
import { spaceAlliesPanel, spaceExpansionOffer } from '../src/ui/space-allies';
import { spaceEconomyPanel } from '../src/ui/space-economy';
import { spaceEmpiresPanel } from '../src/ui/space-empires';
import { spaceMap } from '../src/ui/space-expedition';

/** Prepared presentation inputs only: funds, treaty snapshots and positions do
 * not prove campaign earning or reachability. Purchases use the public API;
 * parser/payment history and native flight have their own independent suites. */
function fixture(treaties = true) {
  const s = parseGame(readFileSync('tests/fixtures/space/native-c2-carried-life.save.json', 'utf8'));
  enableBiosphere(s); enableForeignEcology(s); enableSpaceEconomy(s); enableSpaceEmpires(s);
  enableSpaceOutfit(s); enableSpaceExpansion(s);
  const p = s.space!, economy = p.economy!, expansion = p.expansion!;
  economy.balance = 500;
  if (treaties) for (const [index, empire] of p.empires!.entries.entries()) {
    empire.contact = index * 4 + 1;
    empire.mission = { kind: EMPIRE_PROFILES[empire.id].mission, targetPlanetId: empire.capitalId,
      accepted: index * 4 + 2, completed: index * 4 + 3, evidence: [] };
    empire.treaty = index * 4 + 4;
  }
  const empire = p.empires!.entries.find(entry => entry.id === 'resin')!;
  place(s, empire.capitalId);
  return { s, p, economy, expansion, empire };
}
function place(s: GameState, planetId: string) {
  const p = s.space!, system = planetSystem(p.homePlanetId, planetId)!;
  p.leg = null;
  p.location = { scale: 'surface', planetId, systemId: system.id, pos: { x: 0, y: 3, z: 0 }, heading: 0 };
  visitForeignPlanet(s); placeSpaceAllies(s);
}
function buy(f: ReturnType<typeof fixture>, kind: ExpansionKind, id: EmpireId = 'resin') {
  expect(applyExpansionOrder(f.s, kind, id, f.economy.nextAction)).toBe(true);
}
function buyAllies(f: ReturnType<typeof fixture>) {
  for (const id of EMPIRE_IDS) {
    place(f.s, f.p.empires!.entries.find(empire => empire.id === id)!.capitalId); buy(f, 'alliance', id);
  }
  place(f.s, f.empire.capitalId);
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '');
function button(html: string, kind: ExpansionKind) {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find(row => row[1].includes(`data-action="space-expansion:${kind}|`));
  expect(found, `Missing ${kind} button`).toBeDefined();
  return { attributes: found![1], text: found![2] };
}
function mapEntry(s: GameState, planetId: string) {
  const system = planetSystem(s.space!.homePlanetId, planetId)!;
  return [...spaceMap(s).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(row => plain(row[1]))
    .find(row => row.startsWith(`${system.index || '⌂'} · ${system.name}`))!;
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
function model(view: SpaceAlliesView, id: EmpireId = 'resin') { return view.group.getObjectByName(`ally-${id}`)!; }
function beams(view: SpaceAlliesView) { return view.group.children.filter((node): node is THREE.Line => node instanceof THREE.Line); }
function sceneRenderer() {
  let scene: THREE.Scene | undefined;
  const renderer = { getSize: (size: THREE.Vector2) => size.set(1024, 640), render: (next: THREE.Scene) => { scene = next; } } as unknown as THREE.WebGLRenderer;
  return { renderer, scene: () => scene! };
}

describe('D2b offers distinguish treaties, paid support and territorial ownership', () => {
  it('shows explicit prices, support limits and a separate paid colony without granting anything from a preview', () => {
    const { s, p, empire, economy } = fixture(), saved = JSON.stringify(s), offer = spaceExpansionOffer(s, empire);
    expect(plain(offer)).toContain('Spojenectví a území');
    expect(button(offer, 'alliance').text).toContain('40 ◈'); expect(button(offer, 'territory').text).toContain('120 ◈');
    expect(plain(offer)).toMatch(/baterii\s*12/); expect(plain(offer)).toMatch(/solár\s*0,8\/s/);
    expect(plain(offer)).toMatch(/dosahu\s*6/); expect(plain(offer)).toMatch(/až\s*2 energie\/s/);
    expect(plain(offer)).toMatch(/vlastní kolonii potom založíš za\s*40 ◈ nad stabilním prvním pásem/);
    for (const kind of ['alliance', 'territory'] as const) {
      expect(button(offer, kind).attributes).not.toMatch(/\bdisabled\b/);
      expect(button(offer, kind).attributes).toContain(`|${empire.id}|${economy.nextAction}`);
    }
    expect(ownerAt(p, empire.capitalId)).toBe(empire.id); expect(spaceAlliesPanel(s)).toBe('');
    expect(plain(spaceEmpiresPanel(s))).toContain('Obchodní dohoda platí');
    expect(plain(offer)).not.toContain('Skutečný spojenec'); expect(JSON.stringify(s)).toBe(saved);
  });

  it('disables offers without a treaty or funds and shows concrete reasons', () => {
    const { s, p, empire, economy } = fixture(false);
    let offer = spaceExpansionOffer(s, empire);
    for (const kind of ['alliance', 'territory'] as const) expect(button(offer, kind).attributes).toMatch(/\bdisabled\b/);
    expect(plain(offer)).toContain('Nejprve odevzdej zakázku a uzavři obchodní dohodu.');
    empire.treaty = 4; economy.balance = 39; offer = spaceExpansionOffer(s, empire);
    expect(plain(offer)).toContain('Cena je 40 ◈; lodní pokladna má 39 ◈.');
    expect(plain(offer)).toContain('Cena je 120 ◈; lodní pokladna má 39 ◈.');
    expect(expansionQuote(s, 'alliance', empire.id, economy.nextAction - 1).reason).toContain('Nabídka už není aktuální.');
    p.ship!.health = 0; expect(plain(spaceExpansionOffer(s, empire))).toContain('Nabídka potřebuje živou vlastní loď.');
  });

  it('explains why distance, altitude, orbit, a different planet and an active transition prevent remote buying', () => {
    const { s, p, empire } = fixture(), original = structuredClone(p.location!);
    const remote = () => {
      const offer = spaceExpansionOffer(s, empire);
      for (const kind of ['alliance', 'territory'] as const) expect(button(offer, kind).attributes).toMatch(/\bdisabled\b/);
      expect(plain(offer)).toContain('Jednej osobně u vyslanectví: povrchový maják do 12 kroků a pod výškou 8.');
    };
    p.location!.pos.x = 13; remote(); p.location!.pos.x = 0;
    p.location!.pos.y = 9; remote(); p.location!.pos.y = 3;
    p.location!.scale = 'orbit'; remote(); p.location!.scale = 'surface';
    p.leg = { from: structuredClone(original), to: { ...structuredClone(original), scale: 'orbit' }, duration: 3, elapsed: 1, energyPaid: 4 };
    remote(); p.leg = null;
    place(s, p.empires!.entries.find(entry => entry.id === 'roots')!.capitalId); remote();
    expect(spaceEmpiresPanel(s)).not.toContain(`space-expansion:alliance|${empire.id}|`);
  });

  it('shows a paid escort and its actual relationship change without free player energy or territorial ownership', () => {
    const f = fixture(), { s, p, empire, economy, expansion } = f;
    p.ship!.energy = 23;
    const relation = empireRelation(s, empire), cash = economy.balance, ship = JSON.stringify(p.ship), diplomacy = JSON.stringify(p.empires);
    buy(f, 'alliance');
    expect(economy.balance).toBe(cash - 40); expect(economy.ledger.alliance).toBe(40);
    expect(expansion.allies[0]).toMatchObject({ empireId: empire.id, energy: 12, generated: 0, delivered: 0 });
    expect(empireRelation(s, empire)).toBe(relation + 10); expect(ownerAt(p, empire.capitalId)).toBe(empire.id);
    expect(JSON.stringify(p.ship)).toBe(ship); expect(JSON.stringify(p.empires)).toBe(diplomacy);
    const saved = JSON.stringify(s), offer = spaceExpansionOffer(s, empire);
    expect(plain(offer)).toContain('Skutečný spojenec · vztah +10');
    expect(offer).not.toContain('space-expansion:alliance|'); expect(button(offer, 'territory').attributes).not.toMatch(/\bdisabled\b/);
    expect(spaceStatus(s)).toContain('id="space-allies"'); expect(JSON.stringify(s)).toBe(saved);
  });

  it('changes the map and local ownership only after payment while retaining the embassy, prices and ecology gate', () => {
    const f = fixture(), { s, p, empire, economy } = f;
    const diplomacy = JSON.stringify(p.empires), colonies = JSON.stringify(economy.colonies), price = spaceSalePrice(s, empire.capitalId, 'sun-resin');
    expect(mapEntry(s, empire.capitalId)).toContain('Území cizí říše');
    expect(plain(spaceEconomyPanel(s))).toContain('Tato planeta patří cizí říši.');
    buy(f, 'territory');
    expect(economy.balance).toBe(380); expect(economy.ledger.territory).toBe(120);
    expect(ownerAt(p, empire.capitalId)).toBe('player'); expect(empireAt(s, empire.capitalId)).toBe(empire);
    expect(JSON.stringify(p.empires)).toBe(diplomacy); expect(JSON.stringify(economy.colonies)).toBe(colonies);
    expect(spaceSalePrice(s, empire.capitalId, 'sun-resin')).toEqual(price);
    const saved = JSON.stringify(s), offer = spaceExpansionOffer(s, empire);
    expect(mapEntry(s, empire.capitalId)).toContain('Tvoje soustava · diplomatické vyslanectví');
    expect(mapEntry(s, empire.capitalId)).not.toContain('Území cizí říše');
    expect(plain(offer)).toContain('Tvoje soustava · vyslanectví i dohody zůstávají.');
    expect(offer).not.toContain('space-expansion:territory|');
    expect(plain(spaceEmpiresPanel(s))).toContain('Tvoje soustava. Vyslanectví a dřívější dohody zůstávají; vlastní kolonii spravuj v panelu obchodu.');
    expect(plain(spaceEmpiresPanel(s))).not.toContain('osada i vlastnictví zůstávají tvoje');
    expect(economyQuote(s, { kind: 'found' }, economy.nextAction).reason).toBe('Kolonie potřebuje skutečně stabilní první živý pás.');
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('never offers to buy an existing player enclave but still offers a separately paid ally', () => {
    const { s, p, empire } = fixture(); empire.enclave = true;
    const saved = JSON.stringify(s), offer = spaceExpansionOffer(s, empire);
    expect(ownerAt(p, empire.capitalId)).toBe('player'); expect(offer).not.toContain('space-expansion:territory|');
    expect(button(offer, 'alliance').attributes).not.toMatch(/\bdisabled\b/);
    expect(plain(offer)).toContain('Tvoje soustava'); expect(mapEntry(s, empire.capitalId)).not.toContain('Území cizí říše');
    expect(mapEntry(s, empire.capitalId)).toContain('Diplomatická enkláva · tvoje planeta');
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('reports actual batteries, delivered totals, range, transition and home stasis without changing the simulation', () => {
    const f = fixture(); buyAllies(f);
    const { s, p, expansion } = f;
    expansion.allies[0].energy = 7.25; expansion.allies[0].delivered = 4.75;
    expansion.allies[1].location!.pos.x = 30;
    let saved = JSON.stringify(s), panel = plain(spaceAlliesPanel(s));
    expect(panel).toContain('Spojenecký doprovod · 3/3');
    for (const id of EMPIRE_IDS) expect(panel).toContain(EMPIRE_PROFILES[id].name);
    expect(panel).toContain('Baterie 7.3 /12 · předáno 4.8');
    expect(panel).toContain('v dosahu sdílení'); expect(panel).toContain('dohání formaci');
    expect(panel).toContain('V přechodu a doma nepředává.'); expect(JSON.stringify(s)).toBe(saved);
    p.leg = { from: structuredClone(p.location!), to: { ...structuredClone(p.location!), scale: 'orbit' }, duration: 3, elapsed: 1, energyPaid: 4 };
    saved = JSON.stringify(s); panel = plain(spaceAlliesPanel(s));
    expect(panel.match(/Společný let mezi měřítky/g)).toHaveLength(3); expect(panel).not.toContain('v dosahu sdílení');
    expect(JSON.stringify(s)).toBe(saved);
    p.leg = null; p.location = null; placeSpaceAllies(s); saved = JSON.stringify(s);
    expect(plain(spaceAlliesPanel(s)).match(/Zaparkovaný v domácí dílně/g)).toHaveLength(3);
    expect(spaceDock(s, null)).toContain('id="space-allies"'); expect(JSON.stringify(s)).toBe(saved);
  });
});

describe('D2b persistent physical escort presentation', () => {
  it('draws only paid companions with three distinct silhouettes, stable IDs and actual stored positions', () => {
    const f = fixture(), view = new SpaceAlliesView(), offset = new THREE.Vector3(2, 3, 4), player = new THREE.Vector3();
    try {
      view.sync(f.p, offset, player, true); expect(view.group.children).toHaveLength(0);
      buyAllies(f); const saved = JSON.stringify(f.s); view.sync(f.p, offset, player, true);
      expect(view.group.children).toHaveLength(6); expect(beams(view).every(beam => !beam.visible)).toBe(true);
      const shapes = new Set<string>();
      for (const ally of f.expansion.allies) {
        const ship = model(view, ally.empireId), kinds: string[] = [];
        ship.traverse(node => { if (node instanceof THREE.Mesh) kinds.push(node.geometry.type); }); shapes.add(kinds.sort().join(','));
        expect(ship.position.toArray()).toEqual([ally.location!.pos.x + 2, ally.location!.pos.y + 3, ally.location!.pos.z + 4]);
        expect(ship.userData.ally).toEqual({ id: ally.id, energy: ally.energy, delivered: ally.delivered });
        expect(ship.rotation.y).toBe(ally.location!.heading);
      }
      expect(shapes.size).toBe(3); expect(JSON.stringify(f.s)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('reuses models and resources for ordinary updates and suppresses only decorative motion when requested', () => {
    const f = fixture(), view = new SpaceAlliesView(), offset = new THREE.Vector3(), player = new THREE.Vector3(); buyAllies(f);
    try {
      view.sync(f.p, offset, player, false);
      const owned = resources(view.group), freed = disposal(owned), children = [...view.group.children], first = model(view).rotation.z;
      f.p.elapsed += .7; const saved = JSON.stringify(f.s); view.sync(f.p, offset, player, false);
      expect(model(view).rotation.z).not.toBe(first); expect(JSON.stringify(f.s)).toBe(saved);
      view.sync(f.p, offset, player, true);
      for (const id of EMPIRE_IDS) expect(model(view, id).rotation.z).toBe(0);
      expect(view.group.children).toEqual(children); expect(resources(view.group)).toEqual(owned); freed(0);
    } finally { view.dispose(); }
  });

  it('flashes a reused beam only after a real delivered-counter increase and uses the actual endpoints', () => {
    const f = fixture(), view = new SpaceAlliesView(), offset = new THREE.Vector3(2, 3, 4), player = new THREE.Vector3(5, 6, 7); buy(f, 'alliance');
    const ally = f.expansion.allies[0]; ally.delivered = 1; ally.energy = 11;
    try {
      view.sync(f.p, offset, player, true); const beam = beams(view)[0], geometry = beam.geometry;
      expect(beam.visible).toBe(false);
      f.p.elapsed += 1; ally.delivered += .5; ally.energy -= .5;
      const saved = JSON.stringify(f.s); view.sync(f.p, offset, player, true);
      expect(beam.visible).toBe(true); expect(beam.geometry).toBe(geometry);
      const positions = beam.geometry.getAttribute('position');
      expect([positions.getX(0), positions.getY(0), positions.getZ(0)]).toEqual(model(view).position.toArray().map(Math.fround));
      expect([positions.getX(1), positions.getY(1), positions.getZ(1)]).toEqual(player.toArray());
      expect(JSON.stringify(f.s)).toBe(saved);
      f.p.elapsed += .21; view.sync(f.p, offset, player, true); expect(beam.visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('clears a future transfer flash when an older checkpoint restores the same companion ID', () => {
    const f = fixture(), view = new SpaceAlliesView(), offset = new THREE.Vector3(), player = new THREE.Vector3(); buy(f, 'alliance');
    const ally = f.expansion.allies[0];
    try {
      f.p.elapsed = 100; ally.delivered = 1; ally.energy = 11; view.sync(f.p, offset, player, false);
      const ship = model(view), beam = beams(view)[0];
      f.p.elapsed = 101; ally.delivered = 2; ally.energy = 10; view.sync(f.p, offset, player, false); expect(beam.visible).toBe(true);
      f.p.elapsed = 90; ally.delivered = 1; ally.energy = 11; const saved = JSON.stringify(f.s);
      view.sync(f.p, offset, player, false); expect(beam.visible).toBe(false); expect(model(view)).toBe(ship); expect(JSON.stringify(f.s)).toBe(saved);
      f.p.elapsed = 90.1; view.sync(f.p, offset, player, false); expect(beam.visible).toBe(false);
      f.p.elapsed = 90.2; ally.delivered = 1.1; ally.energy = 10.9; view.sync(f.p, offset, player, false); expect(beam.visible).toBe(true);
    } finally { view.dispose(); }
  });

  it('interpolates the companion toward the same real destination during a transition and hides its transfer beam', () => {
    const f = fixture(), view = new SpaceAlliesView(), offset = new THREE.Vector3(0, 1, 0), player = new THREE.Vector3(); buy(f, 'alliance');
    const ally = f.expansion.allies[0];
    try {
      view.sync(f.p, offset, player, true);
      f.p.elapsed += .1; ally.delivered = .1; ally.energy = 11.9; view.sync(f.p, offset, player, true); expect(beams(view)[0].visible).toBe(true);
      f.p.leg = { from: structuredClone(f.p.location!), to: { ...structuredClone(f.p.location!), scale: 'orbit', pos: { x: 10, y: 4, z: 20 } }, duration: 3, elapsed: 1.5, energyPaid: 4 };
      const target = allyFormation(f.p.leg.to, ally.empireId).pos, source = ally.location!.pos;
      const expected = new THREE.Vector3(source.x, source.y, source.z).lerp(new THREE.Vector3(target.x, target.y, target.z), .5).add(offset), saved = JSON.stringify(f.s);
      view.sync(f.p, offset, player, true);
      expect(model(view).position.toArray()).toEqual(expected.toArray()); expect(beams(view)[0].visible).toBe(false); expect(JSON.stringify(f.s)).toBe(saved);
      f.p.location = null; f.p.leg = null; placeSpaceAllies(f.s); view.sync(f.p, offset, player, true);
      expect(model(view).visible).toBe(false); expect(beams(view)[0].visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('disposes removed ID resources once, retains other IDs and releases shared resources once on final disposal', () => {
    const f = fixture(), view = new SpaceAlliesView(), offset = new THREE.Vector3(), player = new THREE.Vector3(); buyAllies(f);
    view.sync(f.p, offset, player, true);
    const retained = model(view), retainedBeam = beams(view)[0];
    const retainedFreed = disposal([...resources(retained), ...resources(retainedBeam)]);
    const removed = view.group.children.filter(child => child !== retained && child !== retainedBeam), removedFreed = disposal(removed.flatMap(resources));
    try {
      f.expansion.allies = f.expansion.allies.slice(0, 1); const saved = JSON.stringify(f.s);
      view.sync(f.p, offset, player, true); expect(view.group.children).toEqual([retained, retainedBeam]);
      for (const child of removed) expect(child.parent).toBeNull(); removedFreed(1); retainedFreed(0);
      expect(JSON.stringify(f.s)).toBe(saved); view.sync(f.p, offset, player, true); removedFreed(1);
      view.dispose(); expect(view.group.children).toHaveLength(0); removedFreed(1); retainedFreed(1);
      view.dispose(); removedFreed(1); retainedFreed(1);
    } finally { view.dispose(); }
  });

  it('integrates paid companions into the existing scene, preserving the player and embassy across local and orbital updates', () => {
    const f = fixture(), view = new SpaceRenderer(), context = sceneRenderer();
    try {
      view.render(context.renderer, f.s, .3, .6, 25, true);
      const scene = context.scene(), original = [...scene.children], oldResources = resources(scene), oldFreed = disposal(oldResources);
      buyAllies(f); const saved = JSON.stringify(f.s);
      view.render(context.renderer, f.s, .5, .7, 25, true);
      for (const child of original) expect(scene.children).toContain(child);
      const ships = EMPIRE_IDS.map(id => scene.getObjectByName(`ally-${id}`)!);
      for (const ship of ships) expect(ship).toBeDefined(); oldFreed(0); expect(JSON.stringify(f.s)).toBe(saved);
      const allyFreed = disposal(resources(ships[0].parent!));
      f.p.location!.scale = 'orbit'; placeSpaceAllies(f.s);
      view.render(context.renderer, f.s, .3, .6, 25, true);
      for (const [index, id] of EMPIRE_IDS.entries()) {
        expect(scene.getObjectByName(`ally-${id}`)).toBe(ships[index]);
        expect(ships[index].position.y).toBe(f.expansion.allies[index].location!.pos.y + 2);
      }
      allyFreed(0); view.dispose(); allyFreed(1);
      view.dispose(); allyFreed(1);
    } finally { view.dispose(); }
  });
});
