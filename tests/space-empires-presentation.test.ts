import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { planetSystem, starSystems } from '../src/game/galaxy';
import { parseGame } from '../src/game/persistence';
import { enableBiosphere } from '../src/game/space-biosphere';
import { enableForeignEcology } from '../src/game/space-ecology';
import { enableSpaceEconomy } from '../src/game/space-economy';
import { applyEmpireOrder, enableSpaceEmpires, type EmpireOrder } from '../src/game/space-empires';
import { EMPIRE_IDS, EMPIRE_PROFILES, empireSurveyTarget } from '../src/game/space-empires-content';
import type { EmpireId, SpaceEmpire } from '../src/game/space-empires-types';
import { visitForeignPlanet } from '../src/game/space-expedition';
import { spaceInheritance, type SpaceInheritance } from '../src/game/space-inheritance';
import { foreignGround, LIFE_PROFILES } from '../src/game/space-life';
import { SPACE_PRODUCTS, SPACE_PRODUCT_KEYS, spaceMarketPrice } from '../src/game/space-products';
import type { GameState } from '../src/game/types';
import { SpaceRenderer } from '../src/render/space';
import { SpaceEmbassyView } from '../src/render/space-embassy';
import { spaceStatus } from '../src/ui/space';
import { spaceEconomyPanel } from '../src/ui/space-economy';
import { spaceEmpiresPanel, spaceInheritanceMarkup } from '../src/ui/space-empires';
import { spaceMap } from '../src/ui/space-expedition';

/** Prepared presentation inputs only. Placement, completed mission snapshots and
 * cargo isolate UI/model behavior; they do not claim payment or reachability.
 * Actual actions, parser history and native travel are verified separately. */
function fixture(id: EmpireId = 'resin') {
  const s = parseGame(readFileSync('tests/fixtures/space/native-c2-carried-life.save.json', 'utf8'));
  enableBiosphere(s); enableForeignEcology(s); enableSpaceEconomy(s); enableSpaceEmpires(s);
  const p = s.space!, registry = p.empires!, empire = registry.entries.find(entry => entry.id === id)!;
  place(s, empire.capitalId);
  return { s, p, registry, empire };
}
function place(s: GameState, planetId: string) {
  const p = s.space!, system = planetSystem(p.homePlanetId, planetId)!;
  p.leg = null;
  p.location = { scale: 'surface', planetId, systemId: system.id, pos: { x: 0, y: 3, z: 0 }, heading: 0 };
  visitForeignPlanet(s);
}
function act(s: GameState, empire: SpaceEmpire, kind: EmpireOrder['kind']) {
  expect(applyEmpireOrder(s, { kind, empireId: empire.id }, s.space!.empires!.nextAction)).toBe(true);
}
function button(html: string, kind: EmpireOrder['kind']) {
  const match = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .find(row => row[1].includes(`data-action="space-empire:${kind}|`));
  expect(match, `Missing ${kind} button`).toBeDefined();
  return { attributes: match![1], text: match![2] };
}
const plain = (html: string) => html.replace(/<[^>]+>/g, '');
function mapEntry(s: GameState, planetId: string) {
  const system = planetSystem(s.space!.homePlanetId, planetId)!;
  return [...spaceMap(s).matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].map(row => plain(row[1]))
    .find(row => row.startsWith(`${system.index || '⌂'} · ${system.name}`))!;
}
function treatySnapshot(s: GameState, empire: SpaceEmpire, philosophy: SpaceInheritance['philosophy']) {
  act(s, empire, 'contact'); act(s, empire, 'accept');
  s.space!.empires!.inheritance = { ...spaceInheritance(s), philosophy };
  empire.mission!.completed = 3; empire.treaty = 4;
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
function lamp(view: SpaceEmbassyView) {
  return resources(view.group).find(resource => resource instanceof THREE.MeshStandardMaterial
    && resource.emissive.getHex() !== 0) as THREE.MeshStandardMaterial;
}
function sceneRenderer() {
  let scene: THREE.Scene | undefined;
  const renderer = { getSize: (size: THREE.Vector2) => size.set(1024, 640), render: (next: THREE.Scene) => { scene = next; } } as unknown as THREE.WebGLRenderer;
  return { renderer, scene: () => scene! };
}

describe('D1 empire, mission and inherited-price presentation', () => {
  it('offers a local first contact while keeping unknown remote signals and territory explicit', () => {
    const { s, empire, registry } = fixture(), saved = JSON.stringify(s), panel = spaceEmpiresPanel(s);
    expect(panel).toContain('Říše a zakázky · 0/3 kontaktů'); expect(panel).toContain(EMPIRE_PROFILES.resin.name);
    expect(panel).toContain('Vlastní území této společnosti.'); expect(panel.match(/Neznámý signál/g)).toHaveLength(2);
    expect(button(panel, 'contact').attributes).toContain(`|${empire.id}|${registry.nextAction}`);
    expect(button(panel, 'contact').attributes).not.toMatch(/\bdisabled\b/);
    expect(spaceStatus(s)).toContain('id="space-diplomacy"');
    expect(mapEntry(s, empire.capitalId)).toContain('Vysílající společnost · osobní kontakt u majáku');
    expect(mapEntry(s, empire.capitalId)).toContain('Území cizí říše');
    expect(plain(spaceEconomyPanel(s))).toContain('Tato planeta patří cizí říši.');
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('explains inaccessible contacts at distance, altitude, orbit and during an unfinished ascent', () => {
    const { s, p } = fixture();
    const expectRemote = () => {
      const panel = spaceEmpiresPanel(s);
      expect(button(panel, 'contact').attributes).toMatch(/\bdisabled\b/);
      expect(plain(panel)).toContain('Vrať se k vyslanectví: povrchový maják do 12 kroků, výška nejvýše 8.');
    };
    p.location!.pos.x = 13; expectRemote();
    p.location!.pos.x = 0; p.location!.pos.y = 9; expectRemote();
    p.location!.pos.y = 3; p.location!.scale = 'orbit'; expectRemote();
    p.location!.scale = 'surface';
    p.leg = { from: structuredClone(p.location!), to: { ...structuredClone(p.location!), scale: 'orbit' }, duration: 3, elapsed: 1, energyPaid: 4 };
    expectRemote(); p.leg = null;
    p.ship!.health = 0;
    expect(plain(spaceEmpiresPanel(s))).toContain('Kontakt potřebuje živou vlastní loď.');
  });

  it('shows the eight-unit trade goal, incomplete hand-in reason and a bounded progress label', () => {
    const { s, empire } = fixture(); act(s, empire, 'contact');
    expect(plain(spaceEmpiresPanel(s))).toContain('První kontrakt: 8 nově dovezených a prodaných kusů.');
    act(s, empire, 'accept');
    let panel = spaceEmpiresPanel(s);
    expect(plain(panel)).toContain('Přijatá zakázka · 0/8');
    expect(plain(panel)).toContain('Prodej zde nejméně 8 kusů skutečné produkce dovezené z jiné planety.');
    expect(button(panel, 'complete').attributes).toMatch(/\bdisabled\b/);
    expect(plain(panel)).toContain('Nejprve dokonči nové činnosti uvedené v zakázce.');
    empire.mission!.evidence = [{ kind: 'trade', receipt: { kind: 'sell', serial: 1, at: 0, tick: s.tick, spaceAt: s.space!.elapsed,
      lifeAction: 1, planetId: empire.capitalId, balanceBefore: 0, balanceAfter: 72, originPlanetId: 'prepared-origin', product: 'sun-resin', amount: 9, unitPrice: 8, earned: 72 } }];
    const saved = JSON.stringify(s); panel = spaceEmpiresPanel(s);
    expect(plain(panel)).toContain('Přijatá zakázka · 8/8');
    expect(button(panel, 'complete').attributes).not.toMatch(/\bdisabled\b/);
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('offers the ecological alternative before acceptance even when all local organisms are gone', () => {
    const { s, empire, p } = fixture('roots'); act(s, empire, 'contact');
    p.expedition!.worlds.find(world => world.id === empire.capitalId)!.life = [];
    const panel = spaceEmpiresPanel(s);
    expect(plain(panel)).toContain('První katalog: nové placené skeny všech šesti živých rolí zde.');
    expect(plain(panel)).toContain('Vyber jednu cestu:');
    expect(plain(panel)).toContain('katalog odemkne odznak Správce života a solární listy');
    expect(plain(panel)).toContain('mapování Hvězdného zvěda a skokovou cívku');
    expect(button(panel, 'accept').attributes).not.toMatch(/\bdisabled\b/);
    expect(button(panel, 'accept-survey').attributes).not.toMatch(/\bdisabled\b/);
    act(s, empire, 'accept-survey');
    const target = planetSystem(p.homePlanetId, empireSurveyTarget(p.homePlanetId, empire))!;
    const accepted = plain(spaceEmpiresPanel(s));
    expect(accepted).toContain(`osobně sestup na povrch ${target.name} (soustava ${target.index}) a vrať se sem`);
    expect(accepted).toContain('Počítá se i nová návštěva známého světa.'); expect(accepted).toContain('0/1');
    expect(spaceEmpiresPanel(s)).not.toContain('data-action="space-empire:accept-survey|');
  });

  it('names the six ecological roles and distinguishes newly paid scans from retained knowledge', () => {
    const { s, p, empire } = fixture('roots'); act(s, empire, 'contact'); act(s, empire, 'accept');
    empire.mission!.evidence = LIFE_PROFILES.map((_, role) => ({ kind: 'ecology', role,
      receipt: { serial: role + 1, at: p.elapsed, kind: 'scan', planetId: empire.capitalId, lifeId: `${empire.capitalId}:life-${role + 1}`, energyPaid: 1 } }));
    const saved = JSON.stringify(s), panel = spaceEmpiresPanel(s);
    expect(plain(panel)).toContain('Přijatá zakázka · 6/6');
    expect(plain(panel)).toContain('Známý organismus můžeš znovu placeně skenovat');
    expect(plain(panel)).toContain('chybějící role můžeš přivézt');
    for (const role of LIFE_PROFILES) expect(plain(panel)).toContain(role.label);
    expect(button(panel, 'complete').attributes).not.toMatch(/\bdisabled\b/); expect(JSON.stringify(s)).toBe(saved);
  });

  it('shows the exact survey destination and carries unfinished progress in the remote overview', () => {
    const { s, p, empire, registry } = fixture('basalt'); act(s, empire, 'contact'); act(s, empire, 'accept');
    const target = planetSystem(p.homePlanetId, empire.mission!.targetPlanetId)!;
    expect(target.living).toBe(false);
    expect(plain(spaceEmpiresPanel(s))).toContain(`${target.name} (soustava ${target.index})`);
    empire.mission!.evidence = [{ kind: 'survey', receipt: { serial: 1, at: p.elapsed, from: 'orbit', to: 'surface', planetId: target.planetId } }];
    place(s, registry.entries.find(entry => entry.id === 'resin')!.capitalId);
    const saved = JSON.stringify(s), panel = plain(spaceEmpiresPanel(s));
    expect(panel).toContain(EMPIRE_PROFILES.basalt.name); expect(panel).toContain('Zakázka 1/1');
    expect(JSON.stringify(s)).toBe(saved);
  });

  it('shows treaty prices on the map and cargo offer and adds the larger proven-affinity bonus without repricing home', () => {
    const { s, p, empire } = fixture(); treatySnapshot(s, empire, 'vanguard');
    const origin = starSystems(p.homePlanetId).find(system => system.living && system.planetId !== empire.capitalId)!;
    p.economy!.cargo = [{ planetId: origin.planetId, product: 'moon-salt', amount: 3 }];
    for (const bonus of [1, 2]) {
      if (bonus === 2) p.empires!.inheritance!.philosophy = 'broker';
      const saved = JSON.stringify(s), panel = plain(spaceEmpiresPanel(s)), entry = mapEntry(s, empire.capitalId);
      expect(panel).toContain(`Obchodní dohoda platí · +${bonus} ◈/ks`);
      expect(panel).toContain('Dřívější obchod se nepřepočítává.'); expect(entry).toContain('smluvní ceny');
      for (const product of SPACE_PRODUCT_KEYS) {
        expect(entry).toContain(`${SPACE_PRODUCTS[product].name} ${spaceMarketPrice(p.homePlanetId, empire.capitalId, product)! + bonus}`);
        expect(mapEntry(s, p.homePlanetId)).toContain(`${SPACE_PRODUCTS[product].name} ${spaceMarketPrice(p.homePlanetId, p.homePlanetId, product)}`);
      }
      const price = spaceMarketPrice(p.homePlanetId, empire.capitalId, 'moon-salt')! + bonus;
      expect(plain(spaceEconomyPanel(s))).toContain(`Zde ${price} ◈/ks · celkem ${price * 3} ◈`);
      expect(JSON.stringify(s)).toBe(saved);
    }
  });

  it('distinguishes an enclave from ownership and preserves the visible paid colony', () => {
    const { s, p, empire } = fixture(); empire.enclave = true;
    p.economy!.colonies = [{ id: `${empire.capitalId}:colony`, planetId: empire.capitalId, product: 'sun-resin', foundedAt: 0,
      paid: 40, level: 2, upgraded: 20, productiveElapsed: 20, produced: 4, loaded: 0 }];
    const saved = JSON.stringify(s), panel = plain(spaceEmpiresPanel(s)), entry = mapEntry(s, empire.capitalId);
    expect(panel).toContain('Vyslanectví na tvé planetě; osada i vlastnictví zůstávají tvoje.');
    expect(entry).toContain('Diplomatická enkláva · tvoje planeta');
    expect(entry).toContain('Vlastní kolonie 2'); expect(entry).toContain('sklad 4');
    expect(entry).not.toContain('Území cizí říše'); expect(JSON.stringify(s)).toBe(saved);
  });

  it('explains unknown history and displays saved first-contact provenance instead of a later live preview', () => {
    const { s, registry } = fixture(); s.lineageHistory = undefined; s.tribe = undefined; s.civilization = undefined;
    let markup = plain(spaceInheritanceMarkup(s));
    expect(markup).toContain('Poutník · dosavadní doložená linie'); expect(markup).toContain('nedostatek úplných dokladů');
    expect(markup).toContain('Chybějící minulost nepovažujeme za nulu.'); expect(markup).toContain('Poutník může všechny zakázky i dohody získat běžným hraním.');
    registry.inheritance = { version: 1, diet: { coverage: 'complete', kind: 'mixed', plants: 12, meat: 10, other: 3 },
      creature: 'social', tribe: 'allied', civilization: ['conversion', 'trade'], scores: { keeper: 12, broker: 9, vanguard: 3 }, philosophy: 'keeper' };
    const saved = JSON.stringify(s); markup = plain(spaceInheritanceMarkup(s));
    expect(markup).toContain('Správce · dědictví prvního kontaktu'); expect(markup).toContain('rostliny 12, maso 10, ostatní 3');
    expect(markup).toContain('Tvor: přátelství. Kmen: spojenectví.'); expect(markup).toContain('Sjednocení civilizace: víra, obchod.');
    expect(markup).toContain('Správce 12 · Prostředník 9 · Průkopník 3'); expect(markup).toContain('Tento doklad je zachovaný.');
    expect(JSON.stringify(s)).toBe(saved);
  });
});

describe('D1 embassy models represent actual saved relations', () => {
  it('uses three distinct exchange, council and watch silhouettes rather than recoloring one model', () => {
    const { registry } = fixture(), signatures: string[] = [];
    for (const id of EMPIRE_IDS) {
      const empire = registry.entries.find(entry => entry.id === id)!, view = new SpaceEmbassyView(id, empire, 1.25);
      try {
        const kinds: string[] = []; view.group.traverse(node => { if (node instanceof THREE.Mesh) kinds.push(node.geometry.type); });
        signatures.push(kinds.sort().join(','));
        expect(view.group.position.toArray()).toEqual([7, 1.25, -5]); expect(view.group.name).toBe('foreign-embassy');
        if (id === 'resin') expect(kinds.filter(kind => kind === 'OctahedronGeometry')).toHaveLength(3);
        if (id === 'roots') expect(kinds.filter(kind => kind === 'SphereGeometry')).toHaveLength(4);
        if (id === 'basalt') { expect(kinds.filter(kind => kind === 'BoxGeometry')).toHaveLength(1); expect(kinds.filter(kind => kind === 'TorusGeometry')).toHaveLength(2); }
      } finally { view.dispose(); }
    }
    expect(new Set(signatures).size).toBe(3);
  });

  it.each(EMPIRE_IDS)('%s updates contact, treaty and reduced motion on the same objects and disposes shared resources once', id => {
    const { registry } = fixture(), empire = registry.entries.find(entry => entry.id === id)!, view = new SpaceEmbassyView(id, empire, 0);
    const owned = resources(view.group), freed = disposal(owned), children = [...view.group.children], glow = lamp(view);
    const signal = view.group.children.find(child => child instanceof THREE.Group)!;
    try {
      const before = JSON.stringify(empire); view.sync(empire, 5, false);
      expect(view.group.userData.empire).toEqual({ id, contact: false, treaty: false, enclave: false }); expect(glow.emissiveIntensity).toBe(.2);
      expect(JSON.stringify(empire)).toBe(before); const firstRotation = signal.rotation.y;
      empire.contact = 1; view.sync(empire, 10, false);
      expect(glow.emissiveIntensity).toBe(.4); expect(signal.rotation.y).not.toBe(firstRotation);
      empire.treaty = 4; empire.enclave = true; const saved = JSON.stringify(empire);
      view.sync(empire, 20, true); expect(glow.emissiveIntensity).toBe(.7); expect(signal.rotation.y).toBe(0);
      view.sync(empire, 40, true); expect(signal.rotation.y).toBe(0);
      expect(view.group.userData.empire).toEqual({ id, contact: true, treaty: true, enclave: true });
      expect(view.group.children).toEqual(children); expect(resources(view.group)).toEqual(owned); expect(JSON.stringify(empire)).toBe(saved); freed(0);
      view.dispose(); expect(view.group.children).toHaveLength(0); freed(1); view.dispose(); freed(1);
    } finally { view.dispose(); }
  });

  it('reuses the active embassy in the space scene and removes it once on orbit while retaining campaign data', () => {
    const { s, p, empire } = fixture(), view = new SpaceRenderer(), context = sceneRenderer();
    try {
      view.render(context.renderer, s, .3, .7, 25, true);
      const model = context.scene().getObjectByName('foreign-embassy')!, owned = resources(model), freed = disposal(owned);
      const world = p.expedition!.worlds.find(world => world.id === empire.capitalId)!;
      expect(model.position.toArray()).toEqual([7, foreignGround(world.seed, 7, -5), -5]);
      expect(model.userData.empire).toMatchObject({ id: 'resin', contact: false, treaty: false });
      empire.contact = 1; empire.treaty = 4; const saved = JSON.stringify(s);
      view.render(context.renderer, s, .6, .6, 25, true);
      expect(context.scene().getObjectByName('foreign-embassy')).toBe(model); expect(resources(model)).toEqual(owned);
      expect(model.userData.empire).toMatchObject({ contact: true, treaty: true }); expect(JSON.stringify(s)).toBe(saved); freed(0);
      p.location!.scale = 'orbit'; view.render(context.renderer, s, .3, .7, 25, true);
      expect(context.scene().getObjectByName('foreign-embassy')).toBeUndefined(); expect(model.parent).toBeNull(); freed(1);
      view.dispose(); view.dispose(); freed(1);
    } finally { view.dispose(); }
  });

  it('replaces a destination embassy and frees its old resources without touching a player enclave colony', () => {
    const { s, p, empire, registry } = fixture(), view = new SpaceRenderer(), context = sceneRenderer();
    empire.enclave = true;
    p.economy!.colonies = [{ id: `${empire.capitalId}:colony`, planetId: empire.capitalId, product: 'sun-resin', foundedAt: 0,
      paid: 40, level: 1, upgraded: 0, productiveElapsed: 20, produced: 2, loaded: 0 }];
    try {
      view.render(context.renderer, s, .3, .7, 25, true);
      const old = context.scene().getObjectByName('foreign-embassy')!, freed = disposal(resources(old));
      expect(context.scene().getObjectByName('foreign-colony')).toBeDefined(); expect(old.userData.empire.enclave).toBe(true);
      const preserved = JSON.stringify(p.economy!.colonies), roots = registry.entries.find(entry => entry.id === 'roots')!;
      place(s, roots.capitalId); view.render(context.renderer, s, .3, .7, 25, true);
      const current = context.scene().getObjectByName('foreign-embassy')!;
      expect(current).not.toBe(old); expect(current.userData.empire.id).toBe('roots'); expect(old.parent).toBeNull(); freed(1);
      expect(context.scene().getObjectByName('foreign-colony')).toBeUndefined(); expect(JSON.stringify(p.economy!.colonies)).toBe(preserved);
      view.dispose(); freed(1);
    } finally { view.dispose(); }
  });
});
