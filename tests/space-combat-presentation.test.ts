import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { starSystems } from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { enableSpaceCombat, fireSpacePulse, investigatePirates, pirateQuote, rescueShip } from '../src/game/space-combat';
import { latestBattle, RESCUE_HEALTH, RESCUE_SECONDS } from '../src/game/space-combat-content';
import { placeSpaceAllies } from '../src/game/space-expansion';
import { changeSpaceScale } from '../src/game/space';
import { step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { SpaceRenderer } from '../src/render/space';
import { SpaceCombatView } from '../src/render/space-combat';
import { animateShip, createShip } from '../src/render/ship';
import { disposeObject } from '../src/render/organism';
import { spaceDock, spaceStatus } from '../src/ui/space';
import { spaceCombatPanel } from '../src/ui/space-combat';

/** Prepared presentation positions and vitals isolate UI/model behavior. They
 * are not native travel, campaign earning or parser-history evidence. Battles,
 * pulses, cooldowns and recovery below otherwise use public ordinary actions. */
function fixture(orbit = true) {
  const s = parseGame(readFileSync('tests/fixtures/space/native-d2b-campaign.save.json', 'utf8'));
  enableSpaceCombat(s);
  const p = s.space!;
  if (orbit) {
    const target = starSystems(p.homePlanetId)[1];
    p.leg = null; p.location = { planetId: target.planetId, systemId: target.id, scale: 'orbit', pos: { x: 0, y: 0, z: 0 }, heading: 0 };
    placeSpaceAllies(s);
  }
  return { s, p, combat: p.combat! };
}
function started() {
  const f = fixture(); expect(investigatePirates(f.s, 1)).toBe(true); return { ...f, battle: latestBattle(f.p)! };
}
function frames(s: GameState, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 30); i++) step(s, EMPTY_INPUT, 1 / 30);
}
function won() {
  const f = started();
  for (let i = 0; i < 5; i++) { expect(fireSpacePulse(f.s)).toBe(true); if (i < 4) frames(f.s, 2 / 3); }
  expect(f.battle.end?.outcome).toBe('won'); return f;
}
function lost() {
  const f = started();
  for (let i = 0; i < 3600 && !f.battle.end; i++) step(f.s, EMPTY_INPUT, 1 / 30);
  expect(f.battle.end?.outcome).toBe('lost'); expect(f.p.ship!.health).toBe(0); return f;
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '');
function button(html: string, action: string) {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(row => row[1].includes(`data-action="${action}"`));
  expect(found, `Missing ${action} button`).toBeDefined(); return { attributes: found![1], text: found![2] };
}
type Resource = THREE.BufferGeometry | THREE.Material;
function resources(root: THREE.Object3D): Resource[] {
  const found = new Set<Resource>();
  root.traverse(node => {
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
const beam = (view: SpaceCombatView, own = true) => view.group.getObjectByName(own ? 'ship-defense-pulse' : 'pirate-pulse') as THREE.Line;
const exhausts = (ship: THREE.Object3D) => { const result: THREE.Object3D[] = []; ship.traverse(node => { if (node.userData.exhaust) result.push(node); }); return result; };
function sceneRenderer() {
  let scene: THREE.Scene | undefined;
  const renderer = { getSize: (size: THREE.Vector2) => size.set(1024, 640), render: (next: THREE.Scene) => { scene = next; } } as unknown as THREE.WebGLRenderer;
  return { renderer, scene: () => scene! };
}

describe('D3a deliberately invoked combat UI', () => {
  it('offers a real optional foreign-orbit signal without earning a result from a preview', () => {
    const { s, p } = fixture(), saved = JSON.stringify(s), panel = spaceCombatPanel(s);
    expect(plain(panel)).toContain('Obrana lodi · 0 vítězství'); expect(plain(panel)).toContain('Můžeš také pokračovat bez boje.');
    expect(button(panel, 'space-pirate:1').attributes).not.toMatch(/\bdisabled\b/);
    expect(plain(panel)).toMatch(/3 energie, zásah\s*12 do\s*24 kroků/);
    expect(plain(panel)).toMatch(/nejméně o\s*90s letu/); expect(spaceStatus(s)).toContain('id="space-combat"');
    expect(JSON.stringify(s)).toBe(saved); expect(latestBattle(p)).toBeNull();
    expect(investigatePirates(s, 1)).toBe(true); expect(latestBattle(p)).not.toBeNull();
    expect(button(spaceCombatPanel(s), 'space-pulse').attributes).not.toMatch(/\bdisabled\b/);
  });

  it('keeps dock hints neutral because Space there controls the planet tool, and explains inaccessible signals', () => {
    const { s, p } = fixture(false), saved = JSON.stringify(s), panel = spaceCombatPanel(s);
    expect(p.location).toBeNull(); expect(button(panel, 'space-pirate:1').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Pirátské signály prověříš na cizí orbitě.');
    expect(plain(panel)).not.toContain('pulz/mezerník'); expect(plain(panel)).not.toContain('ústup/R nebo V');
    expect(spaceDock(s, null)).toContain('id="space-combat"'); expect(JSON.stringify(s)).toBe(saved);
    const target = starSystems(p.homePlanetId)[1];
    p.location = { planetId: target.planetId, systemId: target.id, scale: 'surface', pos: { x: 0, y: 3, z: 0 }, heading: 0 };
    expect(button(spaceCombatPanel(s), 'space-pirate:1').attributes).toMatch(/\bdisabled\b/);
    p.location.scale = 'orbit'; p.location.pos.x = 25;
    expect(plain(spaceCombatPanel(s))).toMatch(/orbitálnímu majáku do\s*24 kroků/);
    p.location.pos.x = 0;
    p.leg = { from: structuredClone(p.location), to: { ...structuredClone(p.location), scale: 'system' }, duration: 3, elapsed: 1, energyPaid: 4 };
    expect(button(spaceCombatPanel(s), 'space-pirate:1').attributes).toMatch(/\bdisabled\b/);
  });

  it('shows exact weapon price, range, cadence, enemy danger and both actionable retreat routes', () => {
    const { s, p, battle } = started(), saved = JSON.stringify(s), panel = spaceCombatPanel(s);
    expect(plain(panel)).toContain('Odolnost 60/60'); expect(plain(panel)).toMatch(/Cíl 22\.0 kroků · tvůj dosah\s*24/);
    expect(button(panel, 'space-pulse').text).toContain('3 energie');
    expect(plain(panel)).toMatch(/Zásah\s*12 · další pulz po\s*0,65s/);
    expect(plain(panel)).toMatch(/Pirát střílí za\s*8 po\s*1,8s do\s*18 kroků/);
    expect(plain(panel)).toMatch(/R ustoupí do soustavy za\s*4 energie/); expect(plain(panel)).toMatch(/V sestoupí zdarma u majáku do\s*16/);
    expect(JSON.stringify(s)).toBe(saved);
    const energy = p.ship!.energy; expect(fireSpacePulse(s)).toBe(true);
    expect(p.ship!.energy).toBe(energy - 3); expect(battle.enemy.health).toBe(48);
    expect(button(spaceCombatPanel(s), 'space-pulse').attributes).toMatch(/\bdisabled\b/);
    expect(plain(spaceCombatPanel(s))).toMatch(/Pulz se dobíjí\s*0,65s/);
    frames(s, 2 / 3); expect(button(spaceCombatPanel(s), 'space-pulse').attributes).not.toMatch(/\bdisabled\b/);
  });

  it('explains out-of-range and depleted-energy pulses without firing or awarding victory', () => {
    const { s, p, battle } = started(); p.location!.pos.x = -20;
    let saved = JSON.stringify(s), panel = spaceCombatPanel(s);
    expect(button(panel, 'space-pulse').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toMatch(/Cíl je mimo dosah\s*24/); expect(JSON.stringify(s)).toBe(saved);
    expect(fireSpacePulse(s)).toBe(false);
    expect(p.notice).toMatch(/^Poslední pulz odmítnut: Cíl je mimo dosah\s*24/);
    p.location!.pos.x = 0; p.ship!.energy = 2; saved = JSON.stringify(s); panel = spaceCombatPanel(s);
    expect(button(panel, 'space-pulse').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toMatch(/Pulz potřebuje\s*3 energie/); expect(JSON.stringify(s)).toBe(saved);
    expect(fireSpacePulse(s)).toBe(false);
    expect(p.notice).toMatch(/^Poslední pulz odmítnut: Pulz potřebuje\s*3 energie/);
    expect(battle.shots).toBe(0); expect(battle.enemy.health).toBe(60); expect(battle.end).toBeNull();
    for (let i = 0; i < 300 && p.ship!.energy < 3; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(button(spaceCombatPanel(s), 'space-pulse').attributes).not.toMatch(/\bdisabled\b/);
    expect(plain(spaceStatus(s))).toContain('Poslední pulz odmítnut:');
    expect(fireSpacePulse(s)).toBe(true);
    expect(battle.shots).toBe(1); expect(battle.enemy.health).toBe(48); expect(battle.end).toBeNull();
    expect(p.notice).toMatch(/^Pulz zasáhl cíl za\s*12\. Zbývá\s*48 odolnosti\./);
    expect(plain(spaceStatus(s))).not.toContain('Poslední pulz odmítnut:');
  });

  it('shows only the real victory or retreat result and the remaining repeat delay', () => {
    const f = won(), saved = JSON.stringify(f.s), panel = spaceCombatPanel(f.s);
    expect(plain(panel)).toContain('Obrana lodi · 1 vítězství'); expect(plain(panel)).toContain('Poslední střet: vítězství');
    expect(button(panel, 'space-pirate:2').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toMatch(/Další signál za\s*90s letu/); expect(panel).not.toContain('data-action="space-pulse"');
    expect(JSON.stringify(f.s)).toBe(saved);
    const other = started(); expect(changeSpaceScale(other.s, 'down')).toBe(true);
    expect(plain(spaceCombatPanel(other.s))).toContain('Poslední střet: ústup');
    expect(plain(spaceCombatPanel(other.s))).toContain('0 vítězství · 1 ústupů · 0 proher');
    expect(pirateQuote(other.s, 2).ok).toBe(false);
  });

  it('shows real defeat and an affordable explicit 12-second rescue, then returns to a 25-health ship', () => {
    const { s, p, battle } = lost(); p.economy!.balance = 0;
    let saved = JSON.stringify(s), panel = spaceCombatPanel(s);
    expect(plain(panel)).toContain('Vrak · kabina přežila'); expect(plain(panel)).toMatch(/vrátí\s*25 odolnosti za\s*12 herních sekund/);
    expect(plain(panel)).toContain('nepotřebuje peníze'); expect(plain(panel)).toMatch(/servis u vlastní kolonie obnoví dalších\s*40 za\s*5 ◈/);
    expect(button(panel, 'space-rescue').attributes).not.toMatch(/\bdisabled\b/);
    expect(panel).not.toContain('space-pulse'); expect(panel).not.toContain('vítězství'); expect(JSON.stringify(s)).toBe(saved);
    const hud = spaceStatus(s), footer = hud.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)![1];
    expect(plain(hud)).toContain('Motory i solár jsou vypnuté. Spusť nouzovou opravu vpravo.');
    expect(plain(hud)).toContain('Let, motory i solár čekají na nouzovou opravu.');
    expect(plain(hud)).not.toMatch(/Zastavení dobíjí \+/);
    expect(plain(footer)).toContain('Vrak · oprava vpravo'); expect(plain(footer)).toContain('Myš · kamera');
    expect(plain(footer)).not.toMatch(/WASD|Q \/ C|R \/ V/);
    expect(button(hud, 'space-up').attributes).toMatch(/\bdisabled\b/);
    expect(button(hud, 'space-down').attributes).toMatch(/\bdisabled\b/);
    expect(JSON.stringify(s)).toBe(saved); expect(fireSpacePulse(s)).toBe(false);
    expect(p.notice).toContain('Poslední pulz odmítnut: Loď je vrak. Nouzovou opravu najdeš vpravo.');
    expect(battle.end!.outcome).toBe('lost'); expect(p.ship!.health).toBe(0);
    expect(rescueShip(s)).toBe(true); const energy = p.ship!.energy;
    frames(s, 3); saved = JSON.stringify(s); panel = spaceCombatPanel(s);
    expect(plain(panel)).toContain('zbývá 9.0s'); expect(panel).not.toContain('data-action="space-rescue"');
    expect(JSON.stringify(s)).toBe(saved); frames(s, RESCUE_SECONDS - 3);
    expect(p.ship!.health).toBe(RESCUE_HEALTH); expect(p.ship!.energy).toBe(energy); expect(p.economy!.balance).toBe(0);
    expect(battle.rescue!.completedAt).not.toBeNull(); expect(plain(spaceCombatPanel(s))).toContain('0 vítězství · 0 ústupů · 1 proher');
    expect(plain(spaceCombatPanel(s))).not.toContain('Vrak · kabina přežila');
    expect(plain(spaceStatus(s))).toContain('WASD / šipky · let');
    expect(plain(spaceStatus(s))).toMatch(/Zastavení dobíjí \+/);
  });
});

describe('D3a reusable combat model and saved effects', () => {
  it('keeps the pirate hidden before a real encounter and places its distinct model at the saved coordinates', () => {
    const { s, p } = fixture(), view = new SpaceCombatView(), offset = new THREE.Vector3(2, 3, 4), ship = new THREE.Vector3();
    try {
      view.sync(p, offset, ship, true); expect(view.enemy.visible).toBe(false); expect(view.rescue.visible).toBe(false);
      expect(beam(view).visible).toBe(false); expect(beam(view, false).visible).toBe(false);
      expect(investigatePirates(s, 1)).toBe(true); const saved = JSON.stringify(s), battle = latestBattle(p)!;
      view.sync(p, offset, ship, true); expect(view.group.name).toBe('space-combat'); expect(view.enemy.name).toBe('pirate-shard');
      expect(view.enemy.visible).toBe(true); expect(view.enemy.position.toArray()).toEqual([battle.enemy.pos.x + 2, battle.enemy.pos.y + 3, battle.enemy.pos.z + 4]);
      const kinds: string[] = []; view.enemy.traverse(node => { if (node instanceof THREE.Mesh) kinds.push(node.geometry.type); });
      expect(kinds).toContain('OctahedronGeometry'); expect(kinds.filter(kind => kind === 'ConeGeometry')).toHaveLength(4);
      expect(kinds.filter(kind => kind === 'BoxGeometry')).toHaveLength(2); expect(JSON.stringify(s)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('renders actual saved shot and hit endpoints with age limits, never the current moving positions', () => {
    const { s, p, battle } = started(), view = new SpaceCombatView(), offset = new THREE.Vector3(2, 3, 4), ship = new THREE.Vector3();
    try {
      frames(s, 2); expect(battle.lastHit).not.toBeNull(); expect(fireSpacePulse(s)).toBe(true);
      // Prepared recent hit time keeps both independent saved effects visible.
      battle.lastHit!.at = p.elapsed; const saved = JSON.stringify(s);
      view.sync(p, offset, ship, true);
      for (const [own, pulse] of [[true, battle.lastShot!], [false, battle.lastHit!]] as const) {
        const line = beam(view, own), positions = line.geometry.getAttribute('position'); expect(line.visible).toBe(true);
        expect([positions.getX(0), positions.getY(0), positions.getZ(0)]).toEqual([pulse.from.x + 2, pulse.from.y + 3, pulse.from.z + 4].map(Math.fround));
        expect([positions.getX(1), positions.getY(1), positions.getZ(1)]).toEqual([pulse.to.x + 2, pulse.to.y + 3, pulse.to.z + 4].map(Math.fround));
      }
      expect(JSON.stringify(s)).toBe(saved); const original = Array.from(beam(view).geometry.getAttribute('position').array);
      p.location!.pos.x += 3; view.sync(p, offset, ship, true);
      expect(Array.from(beam(view).geometry.getAttribute('position').array)).toEqual(original);
      p.elapsed += .19; view.sync(p, offset, ship, true); expect(beam(view).visible).toBe(false); expect(beam(view, false).visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('does not flash future effects after rollback and reuses the same beams after restoring the earlier battle', () => {
    const { s, p, battle } = started(), view = new SpaceCombatView(), offset = new THREE.Vector3(), ship = new THREE.Vector3();
    try {
      const before = structuredClone(p); expect(fireSpacePulse(s)).toBe(true); view.sync(p, offset, ship, false);
      const own = beam(view), enemy = beam(view, false); expect(own.visible).toBe(true);
      p.elapsed = battle.lastShot!.at - .01; view.sync(p, offset, ship, false); expect(own.visible).toBe(false);
      const future = structuredClone(battle.lastShot!); battle.lastHit = { ...future, from: future.to, to: future.from };
      view.sync(p, offset, ship, false); expect(enemy.visible).toBe(false);
      view.sync(before, offset, ship, false); expect(own.visible).toBe(false); expect(enemy.visible).toBe(false);
      expect(beam(view)).toBe(own); expect(beam(view, false)).toBe(enemy);
    } finally { view.dispose(); }
  });

  it('suppresses decorative motion while preserving state, models and resources through repeated sync', () => {
    const { s, p } = started(), view = new SpaceCombatView(), offset = new THREE.Vector3(), ship = new THREE.Vector3();
    try {
      view.sync(p, offset, ship, false); const children = [...view.group.children], owned = resources(view.group), freed = disposal(owned), roll = view.enemy.rotation.z;
      frames(s, .5); const saved = JSON.stringify(s); view.sync(p, offset, ship, false);
      expect(view.enemy.rotation.z).not.toBe(roll); view.sync(p, offset, ship, true);
      expect(view.enemy.rotation.z).toBe(0); expect(view.rescue.rotation.z).toBe(0);
      expect(view.group.children).toEqual(children); expect(resources(view.group)).toEqual(owned); freed(0); expect(JSON.stringify(s)).toBe(saved);
    } finally { view.dispose(); }
  });

  it('shows a brief real victory effect but hides a lost enemy and displays the rescue ring on a wreck', () => {
    const victory = won(), defeat = lost(), view = new SpaceCombatView(), offset = new THREE.Vector3(), ship = new THREE.Vector3(3, 4, 5);
    try {
      view.sync(victory.p, offset, ship, true); expect(view.enemy.visible).toBe(true); expect(view.enemy.scale.x).toBe(.8);
      victory.p.elapsed += .41; view.sync(victory.p, offset, ship, true); expect(view.enemy.visible).toBe(false);
      const saved = JSON.stringify(defeat.s); view.sync(defeat.p, offset, ship, true);
      expect(view.enemy.visible).toBe(false); expect(view.rescue.visible).toBe(true); expect(view.rescue.position.toArray()).toEqual(ship.toArray());
      expect(view.rescue.rotation.z).toBe(0); expect(JSON.stringify(defeat.s)).toBe(saved);
      expect(rescueShip(defeat.s)).toBe(true); frames(defeat.s, 12); view.sync(defeat.p, offset, ship, true); expect(view.rescue.visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('hides old combat effects on another planet or inside a real transition', () => {
    const { s, p } = started(), view = new SpaceCombatView(), offset = new THREE.Vector3(), ship = new THREE.Vector3();
    try {
      expect(fireSpacePulse(s)).toBe(true); view.sync(p, offset, ship, true); expect(beam(view).visible).toBe(true);
      expect(changeSpaceScale(s, 'up')).toBe(true); view.sync(p, offset, ship, true);
      expect(view.enemy.visible).toBe(false); expect(beam(view).visible).toBe(false); expect(beam(view, false).visible).toBe(false);
      p.leg = null; p.location!.planetId = starSystems(p.homePlanetId)[2].planetId;
      view.sync(p, offset, ship, true); expect(view.enemy.visible).toBe(false); expect(beam(view).visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('releases shared pirate materials and all line geometries exactly once', () => {
    const { p } = started(), view = new SpaceCombatView(); view.sync(p, new THREE.Vector3(), new THREE.Vector3(), true);
    const owned = resources(view.group), freed = disposal(owned); expect(owned.length).toBeGreaterThan(10);
    view.dispose(); expect(view.group.children).toHaveLength(0); freed(1);
    view.dispose(); freed(1);
  });

  it('turns exhaust off for an unpowered paid ship and restores it without rebuilding the construction', () => {
    const { p } = fixture(), ship = createShip(p.ship!.creation.blueprint), owned = resources(ship), freed = disposal(owned), flames = exhausts(ship);
    expect(flames.length).toBeGreaterThan(0);
    try {
      animateShip(ship, 1, true, true, true); expect(flames.every(flame => flame.visible)).toBe(true);
      expect(flames.every(flame => flame.scale.y === 1.2)).toBe(true);
      animateShip(ship, 2, false, true, false); expect(flames.every(flame => !flame.visible)).toBe(true);
      animateShip(ship, 3, false, true, true); expect(flames.every(flame => flame.visible)).toBe(true);
      expect(resources(ship)).toEqual(owned); freed(0);
    } finally { disposeObject(ship); freed(1); }
  });

  it('frames the player and enemy together and retains the scene across battle, wreck and recovery rendering', () => {
    const { s, p } = fixture(), view = new SpaceRenderer(), context = sceneRenderer();
    try {
      view.render(context.renderer, s, .3, .6, 25, true);
      const scene = context.scene(), group = scene.getObjectByName('space-combat')!, enemy = scene.getObjectByName('pirate-shard')!, old = resources(group), freed = disposal(old);
      const ordinary = view.cameraState(); expect(ordinary.focus).toEqual(ordinary.ship);
      expect(investigatePirates(s, 1)).toBe(true); const saved = JSON.stringify(s);
      view.render(context.renderer, s, .3, .6, 25, true);
      const camera = view.cameraState(), midpoint = new THREE.Vector3().fromArray(camera.ship!).lerp(enemy.position, .5);
      expect(camera.focus).toEqual(midpoint.toArray());
      expect(new THREE.Vector3().fromArray(camera.position).distanceTo(midpoint)).toBeCloseTo(43);
      expect(scene.getObjectByName('space-combat')).toBe(group); expect(resources(group)).toEqual(old); freed(0); expect(JSON.stringify(s)).toBe(saved);
      // Prepared render-only wreck: runtime loss/recovery is independently tested above.
      p.ship!.health = 0; latestBattle(p)!.end = { outcome: 'lost', at: p.elapsed, economyAt: p.economy!.elapsed, health: 0 };
      view.render(context.renderer, s, .3, .6, 25, true);
      expect((scene.getObjectByName('ship-rescue-ring') as THREE.Mesh).visible).toBe(true);
      expect(exhausts(scene).every(flame => !flame.visible)).toBe(true);
      p.ship!.health = 25; view.render(context.renderer, s, .3, .6, 25, true);
      expect(exhausts(scene).every(flame => flame.visible)).toBe(true);
      expect(scene.getObjectByName('space-combat')).toBe(group); freed(0);
      view.dispose(); freed(1); view.dispose(); freed(1);
    } finally { view.dispose(); }
  });
});
