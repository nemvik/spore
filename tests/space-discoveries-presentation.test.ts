import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseGame } from '../src/game/persistence';
import { starSystems } from '../src/game/galaxy';
import { applyDiscoveryOrder, enableSpaceDiscoveries } from '../src/game/space-discoveries';
import { RELICS, SOCIETY_POSITION } from '../src/game/space-discoveries-content';
import { livingExpedition } from '../src/game/space-biosphere';
import { spaceDiscoveriesPanel, discoveryMapNote } from '../src/ui/space-discoveries';
import { spaceEconomyPanel } from '../src/ui/space-economy';
import { spaceDock, spaceStatus } from '../src/ui/space';
import { SpaceDiscoveriesView } from '../src/render/space-discoveries';

// Prepared presentation positions only, not saved fixtures or reachability.
function setup(index = 19) {
  const s = parseGame(readFileSync('tests/fixtures/space/native-d3c-campaign.save.json', 'utf8'));
  enableSpaceDiscoveries(s); const p = s.space!, d = p.discoveries!, systems = starSystems(p.homePlanetId);
  const place = (n: number, x: number, z: number) => {
    p.location = { planetId: systems[n].planetId, systemId: systems[n].id, scale: 'surface', pos: { x, y: 3, z }, heading: 0 }; p.leg = null;
  };
  const found = (id: 'memory' | 'passage') => { const r = RELICS[id]; place(r.index, r.x, r.z); expect(applyDiscoveryOrder(s, { kind: 'relic', relicId: id }, d.nextAction)).toBe(true); };
  const town = () => place(19, SOCIETY_POSITION.x, SOCIETY_POSITION.z);
  place(index, 0, 0);
  return { s, p, d, systems, place, found, town, action: (kind: 'contact' | 'share' | 'accept-patronage' | 'accept-ecology' | 'support') => applyDiscoveryOrder(s, { kind }, d.nextAction) };
}
const plain = (html: string) => html.replace(/<[^>]*>/g, '');
const disabled = (html: string, action: string) => {
  const button = [...html.matchAll(/<button\b([^>]*)>/g)].find(r => r[1].includes(`data-action="${action}`));
  expect(button).toBeDefined(); return /\bdisabled\b/.test(button![1]);
};
const geometries = (root: THREE.Object3D) => { const items = new Set<THREE.BufferGeometry>(); root.traverse(n => { if (n instanceof THREE.Mesh) items.add(n.geometry); }); return [...items]; };

describe('D4 readable discovery, navigation and cooperation', () => {
  it('keeps historical saves neutral and exposes both targets without mutating state', () => {
    const f = setup(), before = JSON.stringify(f.s), panel = spaceDiscoveriesPanel(f.s);
    expect(plain(panel)).toContain('Soustava 5'); expect(plain(panel)).toContain('Soustava 20'); expect(plain(panel)).toContain('Soustava 19');
    expect(plain(panel)).toContain('nezabírají náklad'); expect(spaceStatus(f.s)).toContain('id="space-discoveries"');
    f.p.location = null; expect(spaceDock(f.s, null)).toContain('id="space-discoveries"'); f.town();
    // Restore the prepared initial location, then prove rendering has no writes.
    f.place(19, 0, 0); expect(JSON.stringify(f.s)).toBe(before);
    delete f.p.discoveries; expect(spaceDiscoveriesPanel(f.s)).toBe('');
  });
  it('explains local distance and turns the actual relic result into a priced wormhole command', () => {
    const f = setup(5); let panel = spaceDiscoveriesPanel(f.s);
    expect(disabled(panel, 'space-discovery:relic|1|passage')).toBe(true); expect(plain(panel)).toContain('12, -12');
    f.found('passage'); f.p.location!.scale = 'system'; f.p.location!.pos = { x: 0, y: 0, z: 0 };
    panel = spaceDiscoveriesPanel(f.s); expect(disabled(panel, 'space-wormhole:2')).toBe(false); expect(plain(panel)).toContain('14 energie');
    expect(plain(discoveryMapNote(f.s, f.systems[22].planetId))).toContain('Červí díra ↔ 5');
    f.p.ship!.energy = 0; expect(disabled(spaceDiscoveriesPanel(f.s), 'space-wormhole:2')).toBe(true);
  });
  it('shows both assistance choices and real paid services without a fictitious colony', () => {
    const f = setup(); f.found('memory'); f.town(); expect(f.action('contact')).toBe(true); expect(f.action('share')).toBe(true);
    let panel = spaceDiscoveriesPanel(f.s); expect(disabled(panel, 'space-discovery:accept-patronage|')).toBe(false); expect(disabled(panel, 'space-discovery:accept-ecology|')).toBe(false);
    expect(f.action('accept-patronage')).toBe(true); expect(f.action('support')).toBe(true); f.place(19, 0, 0);
    // A prepared visited-world presentation projection, not a campaign save.
    const life = livingExpedition(f.s)!;
    life.worlds.push({ ...structuredClone(life.worlds[0]), id: f.systems[19].planetId });
    panel = spaceEconomyPanel(f.s); expect(disabled(panel, 'space-economy:repair|')).toBe(false); expect(plain(panel)).toContain('5');
    expect(f.p.economy!.colonies.some(c => c.planetId === f.systems[19].planetId)).toBe(false);
    expect(plain(discoveryMapNote(f.s, f.systems[19].planetId))).toContain('spolupráce a servis');
  });
  it('explains the alternative catalogue and keeps unearned support disabled', () => {
    const f = setup(); f.found('memory'); f.town(); f.action('contact'); f.action('share'); f.action('accept-ecology');
    const panel = spaceDiscoveriesPanel(f.s); expect(plain(panel)).toContain('0/6'); expect(disabled(panel, 'space-discovery:support|')).toBe(true);
  });
});

describe('D4 persistent original models', () => {
  it.each([5, 20, 19, 22])('updates without geometry allocation and disposes scene %i', index => {
    const f = setup(index), view = new SpaceDiscoveriesView(f.systems[index], f.d.society.planetId), all = geometries(view.group);
    expect(all.length).toBeGreaterThan(0); const disposed = new Map(all.map(g => [g, 0]));
    for (const g of all) g.addEventListener('dispose', () => disposed.set(g, disposed.get(g)! + 1));
    for (let i = 0; i < 30; i++) { f.p.elapsed++; view.sync(f.p, i % 2 === 0); expect(geometries(view.group)).toEqual(all); }
    if (index === 5 || index === 20) expect(view.group.getObjectByName(`relic-${index === 5 ? 'passage' : 'memory'}`)).toBeDefined();
    view.dispose(); expect(view.group.children).toHaveLength(0); expect([...disposed.values()].every(n => n === 1)).toBe(true);
  });
  it('makes the workshop, service and portal reflect real local progress with reduced motion', () => {
    const f = setup(), town = new SpaceDiscoveriesView(f.systems[19], f.d.society.planetId), portal = new SpaceDiscoveriesView(f.systems[5], f.d.society.planetId);
    town.sync(f.p, true); expect(town.group.userData.discovery).toMatchObject({ shared: false, supported: false });
    f.found('memory'); f.town(); f.action('contact'); f.action('share'); town.sync(f.p, true);
    expect(town.group.userData.discovery.shared).toBe(true); f.action('accept-patronage'); f.action('support'); town.sync(f.p, true);
    expect(town.group.userData.discovery.supported).toBe(true); f.found('passage'); f.p.location!.scale = 'system';
    portal.sync(f.p, true); expect(portal.group.getObjectByName('wormhole')!.visible).toBe(true); expect(portal.group.getObjectByName('wormhole')!.rotation.z).toBe(0);
    f.p.location!.scale = 'surface'; portal.sync(f.p, false); expect(portal.group.getObjectByName('wormhole')!.visible).toBe(false); town.dispose(); portal.dispose();
  });
});
