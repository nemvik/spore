import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import * as galaxy from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { livingExpedition } from '../src/game/space-biosphere';
import { stableBandCapacity } from '../src/game/space-ecology';
import { colonyCapacity, colonyStock } from '../src/game/space-economy';
import { appendEventAction } from '../src/game/space-events-content';
import { enableSpaceEvents, eventStamp, resumeColony } from '../src/game/space-events';
import type { PirateEvent, QuarantineEvent } from '../src/game/space-events-types';
import { ownerAt } from '../src/game/space-expansion-content';
import { SPACE_PRODUCTS } from '../src/game/space-products';
import { applyWarOrder, enableSpaceWars, stepSpaceWars } from '../src/game/space-war';
import type { GameState } from '../src/game/types';
import { SpaceRenderer } from '../src/render/space';
import { SpaceColonyView } from '../src/render/space-colony';
import { spaceDock, spaceStatus } from '../src/ui/space';
import { spaceEconomyPanel } from '../src/ui/space-economy';
import { spaceEventsPanel } from '../src/ui/space-events';
import { spaceMap } from '../src/ui/space-expedition';

/** Prepared PRESENTATION variants only: clocks, health, positions and event
 * evidence isolate UI/models. They are not parser or native campaign proof. */
function fixture() {
  const s = parseGame(readFileSync('tests/fixtures/space/native-d3a-campaign.save.json', 'utf8'));
  enableSpaceWars(s); enableSpaceEvents(s);
  const p = s.space!, events = p.events!, economy = p.economy!, life = livingExpedition(s)!;
  return { s, p, events, economy, life };
}
function target(s: GameState, planetId = s.space!.economy!.colonies[0].planetId) {
  const p = s.space!, life = livingExpedition(s)!, colony = p.economy!.colonies.find(row => row.planetId === planetId)!,
    world = life.worlds.find(row => row.id === planetId)!;
  world.temperature = 0; world.atmosphere = 0; world.biosphere.stableFor = [10, 10, 10];
  for (const item of world.life) { item.health = 90; item.nutrition = .9; item.habitat.sinceHunt = 0; }
  expect(stableBandCapacity(life, world)).toBe(3);
  return { colony, world, address: galaxy.planetSystem(p.homePlanetId, planetId)! };
}
function place(s: GameState, planetId: string, scale: 'surface' | 'orbit' = 'surface') {
  const system = galaxy.planetSystem(s.space!.homePlanetId, planetId)!;
  s.space!.leg = null; s.space!.location = { planetId, systemId: system.id, scale,
    pos: { x: 0, y: scale === 'surface' ? 3 : 0, z: 0 }, heading: 0 };
}
function open(s: GameState, planetId?: string) {
  const selected = target(s, planetId), { colony, world } = selected, events = s.space!.events!, at = eventStamp(s);
  const action: QuarantineEvent = { ...at, serial: events.nextAction, kind: 'quarantine', planetId: colony.planetId,
    colonyId: colony.id, watch: { planetId: colony.planetId, anchorSerial: 0, observedElapsed: world.elapsed,
      unstableFor: 12, armedAt: { stamp: structuredClone(at), localAt: world.elapsed - 12 } } };
  appendEventAction(events, action); events.watches.push({ ...structuredClone(action.watch), armedAt: null, unstableFor: 0 });
  events.watches.sort((a, b) => a.planetId.localeCompare(b.planetId));
  return selected;
}
function quarantine() { const f = fixture(); return { ...f, ...open(f.s) }; }
function pirate(s: GameState): PirateEvent {
  const p = s.space!, e = p.economy!, origin = e.colonies[0], address = galaxy.starSystems(p.homePlanetId)[4], stamp = eventStamp(s);
  const action: PirateEvent = { ...stamp, serial: p.events!.nextAction, kind: 'pirate', planetId: address.planetId,
    battleSerial: p.combat!.archive.battles + p.combat!.battles.length + 1,
    candidate: { sold: e.sales.find(row => row.planetId === origin.planetId)?.amount ?? 0, travelAction: p.nextSerial - 1,
      receipt: { serial: e.nextAction, at: e.elapsed, spaceAt: p.elapsed, tick: s.tick, lifeAction: p.expedition!.nextAction,
        warAction: p.wars!.nextAction, eventAction: p.events!.nextAction, planetId: origin.planetId,
        balanceBefore: e.balance, balanceAfter: e.balance, kind: 'load', paid: 0, colonyId: origin.id, product: origin.product, amount: 2 } },
    arrival: { serial: p.nextSerial - 1, at: p.elapsed - 1, from: 'system', to: 'orbit', planetId: address.planetId } };
  p.events!.current.pirate = action; return action;
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '');
function button(html: string, prefix: string) {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(row => row[1].includes(`data-action="${prefix}`));
  expect(found, `Missing ${prefix} button`).toBeDefined(); return { attributes: found![1], text: found![2] };
}
function mapRow(s: GameState, planetId: string): string {
  const system = galaxy.planetSystem(s.space!.homePlanetId, planetId)!;
  const found = [...spaceMap(s).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)]
    .find(row => plain(row[1]).startsWith(`${system.index} · ${system.name}`));
  expect(found).toBeDefined(); return found![1];
}
type Resource = THREE.BufferGeometry | THREE.Material;
function resources(root: THREE.Object3D): Resource[] {
  const found = new Set<Resource>(); root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      found.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) found.add(material);
    }
    for (const material of node.userData.ownedMaterials ?? []) found.add(material);
  }); return [...found];
}
function disposal(owned: Resource[]) {
  const counts = new Map(owned.map(resource => [resource, 0]));
  for (const resource of owned) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource)! + 1));
  return (expected: number) => { expect(counts.size).toBeGreaterThan(0); for (const count of counts.values()) expect(count).toBe(expected); };
}
const warning = (group: THREE.Object3D) => group.getObjectByName('colony-quarantine')!;

describe('D3c expedition-event panel and actionable colony status', () => {
  it('keeps old campaigns and missing ships neutral, and describes quiet opt-in without creating an incident', () => {
    const { s, p, events } = fixture(), saved = JSON.stringify(s), panel = spaceEventsPanel(s);
    expect(plain(panel)).toContain('Události výpravy · klid'); expect(plain(panel)).toContain('nejméně 5 minut spuštěné hry');
    expect(plain(panel)).toContain('osobní zprovoznění'); expect(plain(panel)).toContain('Obnovené kolonie 0 · pirátská setkání 0');
    expect(panel).not.toContain('<button'); expect(spaceDock(s, null)).toContain('id="space-events"');
    expect(JSON.stringify(s)).toBe(saved); expect(events.actions).toHaveLength(0);
    delete p.events; expect(spaceEventsPanel(s)).toBe(''); p.events = events; p.ship = null; expect(spaceEventsPanel(s)).toBe('');
  });

  it('shows a remote persistent quarantine with its real target and a disabled personal-restoration command', () => {
    const { s, events, colony, world, address } = quarantine(); world.biosphere.stableFor = [0, 0, 0];
    const saved = JSON.stringify(s), panel = spaceEventsPanel(s);
    expect(panel).toContain('aria-label="Události výpravy"'); expect(plain(panel)).toContain(`Karanténa · ${address.name}`);
    expect(plain(panel)).toContain(`Soustava ${address.index}`); expect(plain(panel)).toContain('Ekosystém se ustaluje');
    expect(plain(panel)).toContain('Výroba a nakládka stojí; původní stavby i zásoby zůstávají.');
    expect(plain(panel)).toContain('Přileť k povrchovému majáku postižené kolonie do 12 kroků');
    const restore = button(panel, `space-event:resume|${colony.planetId}|${events.nextAction}`);
    expect(restore.attributes).toMatch(/\bdisabled\b/); expect(plain(restore.text)).toContain('bez platby');
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('distinguishes actual missing life from restored stability and never reopens production just by drawing the panel', () => {
    const { s, p, colony, world, events } = quarantine(); place(s, colony.planetId);
    const members = world.life; world.life = [];
    let panel = spaceEventsPanel(s); expect(plain(panel)).toContain('Chybí ekologická role');
    expect(button(panel, 'space-event:resume|').attributes).toMatch(/\bdisabled\b/);
    world.life = members; const saved = JSON.stringify(s); panel = spaceEventsPanel(s);
    expect(plain(panel)).toContain('První pás je stabilní. Provoz čeká na osobní zprovoznění.');
    expect(button(panel, `space-event:resume|${colony.planetId}|${events.nextAction}`).attributes).not.toMatch(/\bdisabled\b/);
    expect(spaceStatus(s)).toContain('id="space-events"'); expect(colonyCapacity(s, colony)).toBe(0);
    expect(JSON.stringify(s)).toBe(saved);
    const ship = structuredClone(p.ship), balance = p.economy!.balance, stock = colonyStock(colony);
    expect(resumeColony(s, colony.planetId, events.nextAction)).toBe(true);
    expect(plain(spaceEventsPanel(s))).toContain('Obnovené kolonie 1'); expect(spaceEventsPanel(s)).not.toContain('space-event:resume|');
    expect(p.ship).toEqual(ship); expect(p.economy!.balance).toBe(balance); expect(colonyStock(colony)).toBe(stock);
  });

  it('explains distance, active travel and a wreck instead of offering a usable restoration button', () => {
    const { s, p, colony } = quarantine(); place(s, colony.planetId); p.location!.pos.x = 13;
    expect(button(spaceEventsPanel(s), 'space-event:resume|').attributes).toMatch(/\bdisabled\b/);
    expect(plain(spaceEventsPanel(s))).toContain('do 12 kroků'); p.location!.pos.x = 0;
    p.leg = { from: structuredClone(p.location!), to: { ...structuredClone(p.location!), scale: 'orbit' }, duration: 3, elapsed: 0, energyPaid: 4 };
    expect(button(spaceEventsPanel(s), 'space-event:resume|').attributes).toMatch(/\bdisabled\b/); p.leg = null; p.ship!.health = 0;
    expect(plain(spaceEventsPanel(s))).toContain('Nejprve připrav živou vlastní loď.');
    expect(button(spaceEventsPanel(s), 'space-event:resume|').attributes).toMatch(/\bdisabled\b/);
  });

  it('escapes displayed addresses and command attributes rather than turning a supplied name or ID into HTML', () => {
    const { s, events, colony, world, address } = quarantine(), original = galaxy.planetSystem;
    const malicious = '"><img src=x onerror=alert(1)>&', unsafeId = colony.planetId + malicious;
    const row = events.current.colonies[0]; row.planetId = unsafeId; row.lastQuarantine.planetId = unsafeId;
    colony.planetId = unsafeId; world.id = unsafeId;
    const lookup = vi.spyOn(galaxy, 'planetSystem').mockImplementation((home, id) => id === unsafeId
      ? { ...address, planetId: unsafeId, name: malicious } : original(home, id));
    try {
      const saved = JSON.stringify(s), panel = spaceEventsPanel(s);
      expect(panel).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&amp;');
      expect(panel).not.toContain('<img'); expect(panel).not.toContain(`data-planet="${unsafeId}"`);
      expect(panel).toContain(`space-event:resume|${colony.planetId.replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/&$/, '&amp;')}|`);
      expect(JSON.stringify(s)).toBe(saved);
    } finally { lookup.mockRestore(); }
  });

  it('identifies the actual production origin of an automatic pirate without inventing a reward or changing cargo', () => {
    const { s, p } = fixture(), incident = pirate(s), origin = galaxy.planetSystem(p.homePlanetId, incident.candidate.receipt.planetId)!;
    const saved = JSON.stringify(s), panel = spaceEventsPanel(s);
    expect(plain(panel)).toContain('Piráti sledují tvůj náklad');
    expect(plain(panel)).toContain(`${SPACE_PRODUCTS[incident.candidate.receipt.product].name} z ${origin.name}`);
    expect(plain(panel)).toContain('R/V ustup'); expect(plain(panel)).toContain('Náklad zůstává tvůj.');
    expect(panel).not.toContain('space-pirate:'); expect(panel).not.toContain('vítězství'); expect(JSON.stringify(s)).toBe(saved);
  });

  it('blocks quarantined loading while preserving actual warehouse capacity and access to paid ship service', () => {
    const { s, p, colony } = quarantine(); place(s, colony.planetId); p.ship!.health = 25; p.ship!.energy = 20;
    const stock = colonyStock(colony), saved = JSON.stringify(s), panel = spaceEconomyPanel(s);
    expect(plain(panel)).toContain(`Sklad ${stock} / ${colony.level * 8} · zachováno`);
    expect(plain(panel)).toContain('Ekologická karanténa zastavila výrobu i nakládku.');
    expect(plain(panel)).toContain('servis zůstává dostupný');
    expect(button(panel, 'space-economy:load|').attributes).toMatch(/\bdisabled\b/);
    expect(button(panel, 'space-economy:repair|').attributes).not.toMatch(/\bdisabled\b/);
    expect(button(panel, 'space-economy:charge|').attributes).not.toMatch(/\bdisabled\b/);
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('shows quarantine and a simultaneous raid separately on the same map target, then explains occupation', () => {
    const { s, p, events, economy } = fixture(); expect(applyWarOrder(s, 'declare', 'roots', p.wars!.nextAction)).toBe(true);
    p.elapsed += 90; economy.elapsed += 90; stepSpaceWars(s); const raid = p.wars!.current.raid!; expect(raid).not.toBeNull();
    const { colony } = open(s, raid.planetId); place(s, colony.planetId, 'orbit');
    const marked = mapRow(s, colony.planetId), map = spaceMap(s);
    expect(marked).toContain('space-quarantine-target'); expect(marked).toContain('space-raid-target');
    expect(plain(marked)).toContain('Ekologická karanténa'); expect(plain(marked)).toContain('Napadená kolonie');
    expect(map).toContain('stroke="#ffc978"'); expect(map).toContain('stroke="#ff967d"');
    const untouched = p.economy!.colonies.find(row => row.planetId !== colony.planetId)!;
    expect(mapRow(s, untouched.planetId)).not.toContain('space-quarantine-target');
    p.elapsed += 180; economy.elapsed += 180; stepSpaceWars(s); place(s, colony.planetId); p.ship!.health = 25;
    expect(ownerAt(p, colony.planetId)).toBe('roots'); const saved = JSON.stringify(s), panel = spaceEventsPanel(s), account = spaceEconomyPanel(s);
    expect(plain(panel)).toContain('Kolonie je také obsazená.');
    expect(button(panel, `space-event:resume|${colony.planetId}|${events.nextAction}`).attributes).toMatch(/\bdisabled\b/);
    expect(plain(account)).toContain('Výroba a služby čekají na zpětné získání');
    expect(button(account, 'space-economy:repair|').attributes).toMatch(/\bdisabled\b/);
    expect(JSON.stringify(s)).toBe(saved);
  });
});

describe('D3c persistent colony quarantine marker', () => {
  it('updates the same amber ring and workshop in place, preserving paid pods, stock and input', () => {
    const { colony } = quarantine(), view = new SpaceColonyView(colony.id, colony, 2);
    try {
      const marker = warning(view.group), children = [...view.group.children], owned = resources(view.group), freed = disposal(owned), saved = JSON.stringify(colony);
      expect(marker.children).toHaveLength(2);
      const ring = marker.children.find(child => child instanceof THREE.Mesh && child.geometry.type === 'TorusGeometry') as THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
      expect(ring.material.color.getHexString()).toBe('ffc978');
      view.sync(colony, 2, 5, false); expect(marker.visible).toBe(false);
      view.sync(colony, 0, 10, false, true); expect(marker.visible).toBe(true);
      expect(view.group.userData.colony).toMatchObject({ id: colony.id, level: colony.level, capacity: 0, stock: colonyStock(colony), quarantined: true });
      const crates = view.group.children.filter(child => child instanceof THREE.Mesh && child.geometry.type === 'OctahedronGeometry');
      expect(crates.filter(crate => crate.visible)).toHaveLength(colonyStock(colony));
      view.sync(colony, 0, 11, false, true); expect(resources(view.group)).toEqual(owned); expect(view.group.children).toEqual(children); freed(0);
      expect(JSON.stringify(colony)).toBe(saved); view.sync(colony, 2, 12, false, false);
      expect(marker.visible).toBe(false); expect(view.group.userData.colony.quarantined).toBe(false);
    } finally { view.dispose(); }
  });

  it('keeps the warning visible and static for reduced motion, and recomputes rotation from a restored earlier clock', () => {
    const { colony } = quarantine(), view = new SpaceColonyView(colony.id, colony, 0);
    try {
      const marker = warning(view.group); view.sync(colony, 0, 5, false, true); const earlier = marker.rotation.y;
      view.sync(colony, 0, 11, false, true); expect(marker.rotation.y).not.toBe(earlier);
      view.sync(colony, 0, 5, false, true); expect(marker.rotation.y).toBe(earlier);
      view.sync(colony, 0, 12, true, true); expect(marker.rotation.y).toBe(0); expect(marker.visible).toBe(true);
      view.sync(colony, 0, 60, true, true); expect(marker.rotation.y).toBe(0); expect(marker.visible).toBe(true);
    } finally { view.dispose(); }
  });

  it('disposes the shared warning material and all workshop resources exactly once', () => {
    const { colony } = quarantine(), view = new SpaceColonyView(colony.id, colony, 0), marker = warning(view.group);
    const meshes = marker.children as THREE.Mesh[], owned = resources(view.group), freed = disposal(owned);
    expect(meshes[0].material).toBe(meshes[1].material);
    view.sync(colony, 0, 10, false, true); freed(0); view.dispose(); freed(1); expect(view.group.children).toHaveLength(0);
    view.dispose(); freed(1);
  });

  it('integrates quarantine into the actual space scene without rebuilding, and releases the marker when leaving the surface', () => {
    const { s, p, colony, events } = quarantine(); place(s, colony.planetId); const view = new SpaceRenderer();
    let scene: THREE.Scene | undefined;
    const renderer = { getSize: (size: THREE.Vector2) => size.set(1024, 640), render: (next: THREE.Scene) => { scene = next; } } as unknown as THREE.WebGLRenderer;
    try {
      const saved = JSON.stringify(s); view.render(renderer, s, .3, .7, 25, true);
      const workshop = scene!.getObjectByName('foreign-colony')!, marker = warning(workshop), owned = resources(workshop), freed = disposal(owned);
      expect(marker.visible).toBe(true); expect(workshop.userData.colony.quarantined).toBe(true); expect(JSON.stringify(s)).toBe(saved);
      view.render(renderer, s, .3, .7, 25, true); expect(scene!.getObjectByName('foreign-colony')).toBe(workshop); freed(0);
      expect(resumeColony(s, colony.planetId, events.nextAction)).toBe(true); view.render(renderer, s, .3, .7, 25, true);
      expect(scene!.getObjectByName('foreign-colony')).toBe(workshop); expect(marker.visible).toBe(false); expect(resources(workshop)).toEqual(owned); freed(0);
      p.location!.scale = 'orbit'; view.render(renderer, s, .3, .7, 25, true);
      expect(scene!.getObjectByName('foreign-colony')).toBeUndefined(); expect(workshop.parent).toBeNull(); freed(1);
      view.dispose(); view.dispose(); freed(1);
    } finally { view.dispose(); }
  });
});
