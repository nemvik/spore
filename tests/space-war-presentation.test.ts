import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { planetSystem } from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { fireSpacePulse } from '../src/game/space-combat';
import { latestBattle } from '../src/game/space-combat-content';
import { colonyCapacity, colonyStock } from '../src/game/space-economy';
import { EMPIRE_IDS, EMPIRE_PROFILES } from '../src/game/space-empires-content';
import type { EmpireId } from '../src/game/space-empires-types';
import { placeSpaceAllies, stepSpaceAllies } from '../src/game/space-expansion';
import { ownerAt } from '../src/game/space-expansion-content';
import { applyWarOrder, enableSpaceWars, stepSpaceWars, type WarOrder } from '../src/game/space-war';
import { warRelation } from '../src/game/space-war-content';
import type { GameState } from '../src/game/types';
import { SpaceRenderer } from '../src/render/space';
import { SpaceAlliesView } from '../src/render/space-allies';
import { SpaceCombatView } from '../src/render/space-combat';
import { spaceDock, spaceStatus } from '../src/ui/space';
import { spaceAlliesPanel, spaceExpansionOffer } from '../src/ui/space-allies';
import { spaceCombatPanel } from '../src/ui/space-combat';
import { spaceEconomyPanel } from '../src/ui/space-economy';
import { spaceEmpiresPanel } from '../src/ui/space-empires';
import { spaceMap } from '../src/ui/space-expedition';
import { spaceOutfitPanel } from '../src/ui/space-outfit';
import { spaceWarPanel } from '../src/ui/space-war';

/** Prepared PRESENTATION preconditions: positions, clocks, a cargo sample and
 * explicitly marked variants isolate UI/models. They are not valid-save or
 * native campaign evidence. Political actions use the public runtime API. */
function fixture() {
  const s = parseGame(readFileSync('tests/fixtures/space/native-d3a-campaign.save.json', 'utf8'));
  enableSpaceWars(s); const p = s.space!;
  p.elapsed += 100; p.economy!.elapsed += 100; // Prepared expired pirate cooldown.
  return { s, p, w: p.wars!, e: p.economy! };
}
const empire = (s: GameState, id: EmpireId = 'roots') => s.space!.empires!.entries.find(e => e.id === id)!;
function place(s: GameState, planetId: string, scale: 'surface' | 'orbit' = 'orbit') {
  const p = s.space!, system = planetSystem(p.homePlanetId, planetId)!;
  p.leg = null; p.location = { planetId, systemId: system.id, scale, pos: { x: 0, y: scale === 'surface' ? 3 : 0, z: 0 }, heading: 0 };
  placeSpaceAllies(s);
}
const time = (s: GameState, dt: number) => { s.space!.elapsed += dt; s.space!.economy!.elapsed += dt; };
const order = (s: GameState, kind: WarOrder, id: EmpireId = 'roots') => applyWarOrder(s, kind, id, s.space!.wars!.nextAction);
function invade() {
  const f = fixture(); expect(order(f.s, 'declare')).toBe(true); place(f.s, empire(f.s).capitalId);
  expect(order(f.s, 'invasion')).toBe(true); return { ...f, battle: latestBattle(f.p)! };
}
function pending(id: EmpireId = 'roots', enclave = false) {
  const f = fixture(); if (enclave) empire(f.s, id).enclave = true; // Historical enclave presentation variant.
  expect(order(f.s, 'declare', id)).toBe(true); time(f.s, 90); stepSpaceWars(f.s);
  expect(f.w.current.raid).not.toBeNull(); return { ...f, raid: f.w.current.raid! };
}
function occupied(enclave = false) {
  const f = pending('resin', enclave); time(f.s, 180); stepSpaceWars(f.s); place(f.s, f.raid.planetId, 'surface');
  expect(ownerAt(f.p, f.raid.planetId)).toBe('resin');
  return { ...f, colony: f.e.colonies.find(c => c.planetId === f.raid.planetId)! };
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '');
function button(html: string, prefix: string) {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(row => row[1].includes(`data-action="${prefix}`));
  expect(found, `Missing ${prefix} button`).toBeDefined(); return { attributes: found![1], text: found![2] };
}
function mapEntry(s: GameState, planetId: string) {
  const system = planetSystem(s.space!.homePlanetId, planetId)!;
  return [...spaceMap(s).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(row => plain(row[1]))
    .find(row => row.startsWith(`${system.index || '⌂'} · ${system.name}`))!;
}
type Resource = THREE.BufferGeometry | THREE.Material;
function resources(root: THREE.Object3D): Resource[] {
  const result = new Set<Resource>(); root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      result.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) result.add(m);
    }
    for (const m of node.userData.ownedMaterials ?? []) result.add(m);
  }); return [...result];
}
function disposal(owned: Resource[]) {
  const counts = new Map(owned.map(r => [r, 0]));
  for (const r of owned) r.addEventListener('dispose', () => counts.set(r, counts.get(r)! + 1));
  return (expected: number) => { expect(counts.size).toBeGreaterThan(0); for (const n of counts.values()) expect(n).toBe(expected); };
}
const enemyBeam = (view: SpaceCombatView) => view.group.getObjectByName('pirate-pulse') as THREE.Line;
const ownBeam = (view: SpaceCombatView) => view.group.getObjectByName('ship-defense-pulse') as THREE.Line;
const shield = (view: SpaceCombatView) => view.group.getObjectByName('empire-guard-shield')!;
const shieldMaterial = (view: SpaceCombatView) => (shield(view).children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;

describe('D3b contextual diplomacy, raid and ownership presentation', () => {
  it('offers only known contacts, a deliberate embargo and free60-second peace without mutating the dock campaign', () => {
    const { s, p, w } = fixture(), saved = JSON.stringify(s), panel = spaceWarPanel(s);
    expect(plain(panel)).toContain('Válka a příměří · mír'); expect(plain(panel)).toContain('Domov zůstává v bezpečí');
    expect(plain(panel)).toMatch(/Příměří lze sjednat po\s*60s bez peněz/); expect(plain(panel)).toMatch(/180s společného klidu/);
    for (const id of EMPIRE_IDS) expect(button(panel, `space-war:declare|${id}|${w.nextAction}`).attributes).not.toMatch(/\bdisabled\b/);
    expect(spaceDock(s, null)).toContain('id="space-war"'); expect(JSON.stringify(s)).toBe(saved);
    for (const e of p.empires!.entries) e.contact = null;
    expect(plain(spaceWarPanel(s))).toContain('Nejprve osobně kontaktuj některou říši.');
    expect(spaceWarPanel(s)).not.toContain('data-action="space-war:declare'); delete p.wars; expect(spaceWarPanel(s)).toBe('');
  });

  it('explains unavailable surface/transition diplomacy, then exposes current-revision60/180-second offers', () => {
    const { s, p, w, e } = fixture(); place(s, empire(s).capitalId, 'surface');
    expect(button(spaceWarPanel(s), 'space-war:declare|roots|').attributes).toMatch(/\bdisabled\b/);
    expect(plain(spaceWarPanel(s))).toContain('Rádiovou diplomacii použij doma nebo na orbitě.');
    p.location!.scale = 'orbit'; p.leg = { from: structuredClone(p.location!), to: { ...structuredClone(p.location!), scale: 'system' }, duration: 3, elapsed: 1, energyPaid: 4 };
    expect(plain(spaceWarPanel(s))).toContain('Nejprve dokonči skutečný let nebo probíhající boj.'); p.leg = null;
    const money = e.balance; expect(order(s, 'declare')).toBe(true);
    expect(plain(spaceWarPanel(s))).toContain('Válka · Kořenový sněm'); expect(plain(spaceWarPanel(s))).toContain('Vyjednávání potrvá ještě 60s.');
    expect(button(spaceWarPanel(s), 'space-war:peace|roots|').attributes).toMatch(/\bdisabled\b/);
    time(s, 60); expect(button(spaceWarPanel(s), `space-war:peace|roots|${w.nextAction}`).attributes).not.toMatch(/\bdisabled\b/);
    expect(order(s, 'peace')).toBe(true); expect(e.balance).toBe(money);
    expect(plain(spaceWarPanel(s))).toContain('Příměří chrání klid ještě 180s.');
    for (const id of EMPIRE_IDS) expect(button(spaceWarPanel(s), `space-war:declare|${id}|`).attributes).toMatch(/\bdisabled\b/);
  });

  it('shows the actual enemy invasion target, range and usable pulse instead of a pirate label', () => {
    const { s, p } = fixture(); expect(order(s, 'declare')).toBe(true); place(s, empire(s, 'resin').capitalId);
    expect(plain(spaceWarPanel(s))).toContain('Invaze patří na orbitu skutečně nepřátelského území.');
    place(s, empire(s).capitalId); p.location!.pos.x = 25;
    expect(plain(spaceWarPanel(s))).toMatch(/Přibliž se k orbitálnímu majáku do\s*24/); p.location!.pos.x = 0;
    expect(button(spaceWarPanel(s), 'space-war:invasion|roots|').attributes).not.toMatch(/\bdisabled\b/);
    expect(order(s, 'invasion')).toBe(true); const saved = JSON.stringify(s), panel = spaceCombatPanel(s);
    expect(plain(panel)).toContain('Invaze · Kořenový sněm'); expect(plain(panel)).not.toContain('Pirátský střep');
    expect(plain(panel)).toMatch(/Říšská hlídka střílí za\s*8 po\s*1,8s do\s*18/);
    expect(button(panel, 'space-pulse').text).toContain('3 energie'); expect(JSON.stringify(s)).toBe(saved);
    expect(fireSpacePulse(s)).toBe(true); expect(latestBattle(p)!.enemy.health).toBe(48);
  });

  it('names the real raid address and remaining180-second deadline, with a disabled remote defense offer', () => {
    const { s, p, raid } = pending(), system = planetSystem(p.homePlanetId, raid.planetId)!;
    let saved = JSON.stringify(s), panel = spaceWarPanel(s);
    expect(plain(panel)).toContain(`Protiútok: ${system.name}`); expect(plain(panel)).toContain(`Soustava ${system.index}`);
    expect(plain(panel)).toContain('Na zahájení obrany zbývá 180s.'); expect(plain(panel)).toContain('Stavby a zásoby přežijí.');
    expect(button(panel, 'space-war:defense|roots|').attributes).toMatch(/\bdisabled\b/); expect(JSON.stringify(s)).toBe(saved);
    place(s, raid.planetId); time(s, 17); saved = JSON.stringify(s); panel = spaceWarPanel(s);
    expect(plain(panel)).toContain('Na zahájení obrany zbývá 163s.');
    expect(button(panel, 'space-war:defense|roots|').attributes).not.toMatch(/\bdisabled\b/);
    const map = spaceMap(s); expect(map.match(/class="tiny space-raid-target"/g)).toHaveLength(1);
    expect(map.match(/font-size="10">!<\/text>/g)).toHaveLength(1);
    expect(mapEntry(s, raid.planetId)).toContain('Napadená kolonie · 163s na obranu');
    expect(JSON.stringify(s)).toBe(saved); expect(spaceStatus(s)).toContain('id="space-war"');
  });

  it('keeps an already started defense visibly active after its administrative deadline', () => {
    const { s, raid } = pending(); place(s, raid.planetId); expect(order(s, 'defense')).toBe(true);
    time(s, 181); stepSpaceWars(s); const saved = JSON.stringify(s), panel = spaceWarPanel(s);
    expect(plain(panel)).toContain('Probíhá skutečný obranný boj.'); expect(plain(panel)).not.toContain('Na zahájení obrany zbývá');
    expect(button(panel, 'space-war:defense|roots|').attributes).toMatch(/\bdisabled\b/);
    expect(button(panel, 'space-war:peace|roots|').attributes).toMatch(/\bdisabled\b/);
    expect(plain(spaceCombatPanel(s))).toContain('Obrana · Kořenový sněm');
    expect(mapEntry(s, raid.planetId)).not.toContain('0s na obranu');
    expect(mapEntry(s, raid.planetId)).toMatch(/probíhá|Probíhá/); expect(JSON.stringify(s)).toBe(saved);
  });

  it('marks an occupied colony, preserved stock and disabled load/upgrade/service/mounting without charging a preview', () => {
    const { s, p, e, colony } = occupied(), stock = colonyStock(colony);
    p.outfit!.purchases = p.outfit!.purchases.filter(row => row.equipment !== 'solar'); // Uninstalled presentation slot.
    const saved = JSON.stringify(s), panel = spaceEconomyPanel(s), outfitting = spaceOutfitPanel(s);
    expect(colonyCapacity(s, colony)).toBe(0); expect(plain(panel)).toContain(`Sklad ${stock} / ${colony.level * 8} · zachováno`);
    expect(plain(panel)).toContain('Kolonie je obsazená. Výroba a služby čekají na zpětné získání; zásoby zůstávají.');
    for (const kind of ['load', 'upgrade', 'repair', 'charge']) expect(button(panel, `space-economy:${kind}|${e.nextAction}`).attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Kolonii obsadila protistrana. Získej ji zpět; stavby i zásoby čekají.');
    expect(button(outfitting, 'space-equipment:solar|').attributes).toMatch(/\bdisabled\b/);
    expect(plain(outfitting)).toContain('Montáž nabízí domácí dílna nebo vlastní kolonie');
    const entry = mapEntry(s, colony.planetId); expect(entry).toContain(`Obsazená kolonie · výroba a služby stojí ${colony.level}`);
    expect(entry).not.toContain('Vlastní kolonie'); expect(spaceMap(s)).not.toContain('space-raid-target'); expect(JSON.stringify(s)).toBe(saved);
  });

  it('shows an embargo at a paid player-owned capital without displaying an executable sale price or rewriting the treaty', () => {
    const { s, p, e } = fixture(), local = empire(s, 'resin'), origin = e.colonies.find(c => c.planetId !== local.capitalId)!;
    const treaty = structuredClone(local), title = structuredClone(p.expansion!.actions);
    e.cargo = [{ planetId: origin.planetId, product: origin.product, amount: 1 }]; // Prepared visible cargo sample.
    expect(order(s, 'declare', 'resin')).toBe(true); place(s, local.capitalId, 'surface'); const saved = JSON.stringify(s);
    expect(ownerAt(p, local.capitalId)).toBe('player'); const panel = spaceEconomyPanel(s), entry = mapEntry(s, local.capitalId);
    expect(plain(panel)).toContain('Válečné embargo'); expect(plain(panel)).not.toMatch(/Zde \d+ ◈\/ks/);
    expect(button(panel, 'space-economy:sell|').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Prodej náklad doma nebo u jiné říše.'); expect(entry).toContain('Tvoje soustava');
    expect(entry).toContain('Trh uzavřený válečným embargem.'); expect(entry).not.toContain('Trh · ◈ za kus');
    expect(plain(spaceEmpiresPanel(s))).toContain('Dohoda pozastavena válkou');
    expect(local).toEqual(treaty); expect(p.expansion!.actions).toEqual(title); expect(JSON.stringify(s)).toBe(saved);
  });

  it('does not call a captured historical enclave player-owned in either the map or local diplomacy', () => {
    const { s, p, colony } = occupied(true), local = empire(s, 'resin'), saved = JSON.stringify(s);
    const entry = mapEntry(s, colony.planetId), panel = plain(spaceEmpiresPanel(s));
    expect(local.enclave).toBe(true); expect(ownerAt(p, local.capitalId)).toBe('resin');
    expect(entry).toContain('Historická diplomatická enkláva'); expect(entry).toContain('Vlastník: Pryskyřičný spolek');
    expect(entry).not.toContain('tvoje planeta'); expect(panel).toContain('Území nyní ovládá Pryskyřičný spolek');
    expect(panel).not.toContain('osada i vlastnictví zůstávají tvoje'); expect(JSON.stringify(s)).toBe(saved);
  });

  it('suspends an already paid escort visibly and restores the same model/battery after peace without phantom delivery', () => {
    const { s, p } = fixture(), local = empire(s, 'resin'), view = new SpaceAlliesView(); place(s, local.capitalId);
    const ally = p.expansion!.allies[0], paid = structuredClone(p.expansion!.actions), energy = ally.energy, generated = ally.generated, delivered = ally.delivered;
    try {
      view.sync(p, new THREE.Vector3(), new THREE.Vector3(), true); const model = view.group.getObjectByName('ally-resin')!, owned = resources(view.group), freed = disposal(owned);
      expect(model.visible).toBe(true); expect(order(s, 'declare', 'resin')).toBe(true); expect(ally.location).toBeNull();
      stepSpaceAllies(s, 1 / 30); const saved = JSON.stringify(s); view.sync(p, new THREE.Vector3(), new THREE.Vector3(), true);
      expect(model.visible).toBe(false); expect(view.group.children.filter(n => n instanceof THREE.Line).every(n => !n.visible)).toBe(true);
      expect(plain(spaceAlliesPanel(s))).toContain('Služba pozastavená válkou. Stejná baterie se vrátí po příměří.');
      expect(plain(spaceAlliesPanel(s))).toContain(`Baterie ${energy.toFixed(1)} /12 · předáno ${delivered.toFixed(1)}`);
      const offer = plain(spaceExpansionOffer(s, local)); expect(offer).toContain('Zaplacený doprovod pozastaven'); expect(offer).not.toContain('vztah +10');
      expect(JSON.stringify(s)).toBe(saved); expect(ally).toMatchObject({ energy, generated, delivered });
      time(s, 60); expect(order(s, 'peace', 'resin')).toBe(true); view.sync(p, new THREE.Vector3(), new THREE.Vector3(), true);
      expect(model.visible).toBe(true); expect(view.group.getObjectByName('ally-resin')).toBe(model); expect(ally).toMatchObject({ energy, generated, delivered });
      expect(p.expansion!.actions).toEqual(paid); expect(resources(view.group)).toEqual(owned); freed(0);
      expect(plain(spaceExpansionOffer(s, local))).toContain('Skutečný spojenec · vztah +10');
    } finally { view.dispose(); }
  });
});

describe('D3b distinct reusable military guard and saved effects', () => {
  it.each(EMPIRE_IDS)('shows the %s guard shield/armor and its actual profile color without mutating the battle', id => {
    const { s, p, battle } = invade(), view = new SpaceCombatView(), offset = new THREE.Vector3(3, 4, 5);
    battle.war!.empireId = id; // Prepared model profile, not a second political result.
    try {
      const saved = JSON.stringify(s); view.sync(p, offset, new THREE.Vector3(), true);
      expect(view.enemy.name).toBe('empire-guard'); expect(view.enemy.visible).toBe(true); expect(shield(view).visible).toBe(true);
      expect(shield(view).children.map(n => (n as THREE.Mesh).geometry.type)).toEqual(['TorusGeometry', 'OctahedronGeometry', 'OctahedronGeometry']);
      expect(shieldMaterial(view).color.getHexString()).toBe(new THREE.Color(EMPIRE_PROFILES[id].color).getHexString());
      expect(shieldMaterial(view).emissive.getHexString()).toBe(new THREE.Color(EMPIRE_PROFILES[id].color).getHexString());
      expect((enemyBeam(view).material as THREE.LineBasicMaterial).color.getHexString()).toBe(new THREE.Color(EMPIRE_PROFILES[id].color).getHexString());
      expect(view.enemy.position.toArray()).toEqual([battle.enemy.pos.x + 3, battle.enemy.pos.y + 4, battle.enemy.pos.z + 5]);
      expect(view.enemy.rotation.z).toBe(0); expect(JSON.stringify(s)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('restores pirate silhouette/color on historical rollback while reusing all military resources', () => {
    const { s, p } = fixture(), old = structuredClone(p), view = new SpaceCombatView();
    expect(order(s, 'declare')).toBe(true); place(s, empire(s).capitalId); expect(order(s, 'invasion')).toBe(true);
    try {
      view.sync(p, new THREE.Vector3(), new THREE.Vector3(), false); const own = resources(view.group), nodes = [...view.group.children], freed = disposal(own);
      expect(shield(view).visible).toBe(true); view.sync(old, new THREE.Vector3(), new THREE.Vector3(), true);
      expect(view.enemy.name).toBe('pirate-shard'); expect(shield(view).visible).toBe(false); expect(shieldMaterial(view).color.getHexString()).toBe('e7685e');
      expect(shieldMaterial(view).emissive.getHexString()).toBe('722f2b'); expect(view.enemy.visible).toBe(false);
      view.sync(p, new THREE.Vector3(), new THREE.Vector3(), true); expect(view.enemy.name).toBe('empire-guard'); expect(view.enemy.rotation.z).toBe(0);
      expect(resources(view.group)).toEqual(own); expect(view.group.children).toEqual(nodes); freed(0);
    } finally { view.dispose(); }
  });

  it('uses saved military beam endpoints and hides future flashes after rollback, including reduced-motion rendering', () => {
    const { s, p, battle } = invade(), view = new SpaceCombatView(), offset = new THREE.Vector3(2, 3, 4);
    expect(fireSpacePulse(s)).toBe(true);
    battle.lastHit = { at: p.elapsed, from: { ...battle.enemy.pos }, to: { ...p.location!.pos } }; // Saved-effect presentation sample.
    try {
      const saved = JSON.stringify(s); view.sync(p, offset, new THREE.Vector3(), true);
      for (const [line, pulse] of [[ownBeam(view), battle.lastShot!], [enemyBeam(view), battle.lastHit]] as const) {
        expect(line.visible).toBe(true); const points = line.geometry.getAttribute('position');
        expect([points.getX(0), points.getY(0), points.getZ(0)]).toEqual([pulse.from.x + 2, pulse.from.y + 3, pulse.from.z + 4].map(Math.fround));
        expect([points.getX(1), points.getY(1), points.getZ(1)]).toEqual([pulse.to.x + 2, pulse.to.y + 3, pulse.to.z + 4].map(Math.fround));
      }
      expect(JSON.stringify(s)).toBe(saved); const first = ownBeam(view), second = enemyBeam(view); p.elapsed -= .01;
      view.sync(p, offset, new THREE.Vector3(), true); expect(first.visible).toBe(false); expect(second.visible).toBe(false);
      p.elapsed += .2; view.sync(p, offset, new THREE.Vector3(), false); expect(first.visible).toBe(false); expect(second.visible).toBe(false);
      expect(ownBeam(view)).toBe(first); expect(enemyBeam(view)).toBe(second);
    } finally { view.dispose(); }
  });

  it('disposes shield, armor and their materials shared with the hull exactly once', () => {
    const { p } = invade(), view = new SpaceCombatView(); view.sync(p, new THREE.Vector3(), new THREE.Vector3(), true);
    const owned = resources(view.group), freed = disposal(owned), trim = shieldMaterial(view), references: THREE.Mesh[] = [];
    view.enemy.traverse(node => { if (node instanceof THREE.Mesh && node.material === trim) references.push(node); });
    expect(references.length).toBeGreaterThan(3); view.dispose(); freed(1); expect(view.group.children).toHaveLength(0); view.dispose(); freed(1);
  });

  it('integrates the military model into the existing SpaceRenderer scene and camera without editing game state', () => {
    const { s, p, battle } = invade(); let scene: THREE.Scene | undefined;
    const renderer = { getSize: (v: THREE.Vector2) => v.set(1024, 640), render: (value: THREE.Scene) => { scene = value; } } as unknown as THREE.WebGLRenderer;
    const view = new SpaceRenderer(), saved = JSON.stringify(s);
    try {
      view.render(renderer, s, .3, .6, 25, true); const firstScene = scene!, guard = firstScene.getObjectByName('empire-guard')!;
      expect(guard).toBeDefined(); expect(guard.visible).toBe(true); expect(guard.getObjectByName('empire-guard-shield')!.visible).toBe(true);
      expect(view.cameraState().focus[0]).toBeCloseTo((p.location!.pos.x + battle.enemy.pos.x) / 2);
      view.render(renderer, s, .3, .6, 25, true); expect(scene).toBe(firstScene); expect(scene!.getObjectByName('empire-guard')).toBe(guard); expect(JSON.stringify(s)).toBe(saved);
    } finally { view.dispose(); }
  });
});
