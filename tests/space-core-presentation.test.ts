import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseGame } from '../src/game/persistence';
import { applyCoreOrder, enableSpaceCore } from '../src/game/space-core';
import { starSystems } from '../src/game/galaxy';
import { spaceCorePanel, coreMapNote } from '../src/ui/space-core';
import { spaceCombatPanel } from '../src/ui/space-combat';
import { spaceDock, spaceStatus } from '../src/ui/space';
import { SpaceCoreView } from '../src/render/space-core';
import { SpaceCombatView } from '../src/render/space-combat';

// Prepared positions/visual variants only. Not parser or played route evidence.
function setup(index = 23, scale: 'orbit' | 'surface' = 'orbit') {
  const s = parseGame(readFileSync('tests/fixtures/space/native-d4-campaign.save.json', 'utf8')); enableSpaceCore(s);
  const p = s.space!, stars = starSystems(p.homePlanetId);
  p.location = { scale, planetId: stars[index].planetId, systemId: stars[index].id, pos: { x: 0, y: 3, z: 0 }, heading: 0 };
  return { s, p, stars, order: (kind: 'contact' | 'diplomacy' | 'challenge') => applyCoreOrder(s, kind, p.core!.nextAction) };
}
const plain = (html: string) => html.replace(/<[^>]*>/g, '');
const button = (html: string, action: string) => {
  const found = [...html.matchAll(/<button\b([^>]*)>/g)].find(r => r[1].includes(`data-action="${action}`)); expect(found).toBeDefined(); return found![1];
};
function resources(root: THREE.Object3D) {
  const found = new Set<THREE.BufferGeometry | THREE.Material>(); root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) { found.add(node.geometry); for (const m of Array.isArray(node.material) ? node.material : [node.material]) found.add(m); }
  }); return [...found];
}
describe('D5 understandable route, alternative and reward', () => {
  it('shows the core goal, whole boundary and concrete next step without mutating the save', () => {
    const { s, p, stars } = setup(), before = JSON.stringify(s), panel = spaceCorePanel(s);
    expect(plain(panel)).toContain('Srdce světla'); expect(plain(panel)).toContain('oblast 24–31'); expect(plain(panel)).toContain('orbitálnímu majáku');
    expect(plain(coreMapNote(s, stars[31].planetId))).toContain('Nejprve vyřeš průchod'); expect(spaceStatus(s)).toContain('id="space-core"');
    expect(JSON.stringify(s)).toBe(before); p.location = null; expect(spaceDock(s, null)).toContain('id="space-core"');
    delete p.core; expect(spaceCorePanel(s)).toBe(''); expect(coreMapNote(s, stars[31].planetId)).toBe('');
  });
  it('presents both usable alternatives, their concrete risks and a real earned access result', () => {
    const { s, p, stars, order } = setup(); expect(order('contact')).toBe(true); let panel = spaceCorePanel(s);
    expect(button(panel, 'space-core:diplomacy|')).not.toMatch(/\bdisabled\b/); expect(button(panel, 'space-core:challenge|')).not.toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('108 odolnosti'); expect(plain(panel)).toContain('za 12 po 1,4 s do 22');
    expect(order('diplomacy')).toBe(true); panel = spaceCorePanel(s); expect(plain(panel)).toContain('Diplomatické doporučení bylo uznáno');
    expect(plain(coreMapNote(s, stars[31].planetId))).toContain('Průchod zachován'); expect(p.economy!.balance).toBe(263);
  });
  it('uses the warden profile in both the battle HUD and its distinct persistent model', () => {
    const { s, p, order } = setup(); order('contact'); expect(order('challenge')).toBe(true);
    const panel = plain(spaceCombatPanel(s)); expect(panel).toContain('Tichý val'); expect(panel).toContain('108/108'); expect(panel).toContain('za12 po1,4s do22');
    const view = new SpaceCombatView(); view.sync(p, new THREE.Vector3(), new THREE.Vector3(), true);
    expect(view.enemy.name).toBe('silent-warden'); expect(view.group.getObjectByName('warden-crown')!.visible).toBe(true); view.dispose();
  });
  it('keeps a distant contact disabled with an actionable physical approach', () => {
    const { s, p } = setup(); p.location!.pos.x = 30;
    expect(button(spaceCorePanel(s), 'space-core:contact|')).toMatch(/\bdisabled\b/); expect(plain(spaceCorePanel(s))).toContain('do24 kroků');
  });
});
describe('D5 original scene ownership', () => {
  it.each([23, 24, 31])('updates scene%i without new geometry and releases every owned resource once', index => {
    const { p, stars } = setup(index, index === 23 ? 'orbit' : 'surface'), view = new SpaceCoreView(stars[index]), owned = resources(view.group);
    const disposed = new Map(owned.map(r => [r, 0])); for (const r of owned) r.addEventListener('dispose', () => disposed.set(r, disposed.get(r)! + 1));
    for (let i = 0; i < 30; i++) { p.elapsed++; view.sync(p, i % 2 === 0); expect(resources(view.group)).toEqual(owned); }
    if (index === 23) expect(view.group.getObjectByName('silent-wall')!.visible).toBe(true);
    if (index === 31) expect(view.group.getObjectByName('heart-encounter')!.visible).toBe(true);
    expect(view.group.getObjectByName('climate-root')!.visible).toBe(false); view.dispose(); expect(view.group.children).toHaveLength(0);
    expect(owned.length).toBeGreaterThan(0); expect([...disposed.values()].every(n => n === 1)).toBe(true);
  });
});
