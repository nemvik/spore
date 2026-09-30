import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { starSystems, planetSystem, systemDistance } from '../src/game/galaxy';
import { parseGame, serializeGame, saveGame, loadGame } from '../src/game/persistence';
import { applyDiscoveryOrder, discoveryQuote, enableSpaceDiscoveries, enterWormhole, wormholeQuote, type DiscoveryOrder } from '../src/game/space-discoveries';
import { allocateYoungSociety, RELICS, SOCIETY_POSITION, societyProgress, societyService } from '../src/game/space-discoveries-content';
import { applyEconomyOrder, economyQuote } from '../src/game/space-economy';
import { changeSpaceScale, launchShip } from '../src/game/space';
import { jumpQuote, jumpToSystem, useSpecimenTool } from '../src/game/space-expedition';
import { livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { roleOf, stableBandCapacity } from '../src/game/space-ecology';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

// Prepared UNIT positions at beacons, relics and specimens. All arrivals,
// payments, scans, ecology and flight time use ordinary runtime actions/steps.
// These fixtures and helpers do not claim native reachability.
const load = (kind = 'campaign') => parseGame(readFileSync(`tests/fixtures/space/native-d3c-${kind}.save.json`, 'utf8'));
const enabled = () => { const s = load(); enableSpaceDiscoveries(s); return s; };
const discovery = (s: GameState) => s.space!.discoveries!;
const account = (s: GameState) => s.space!.economy!;
const round = (s: GameState) => parseGame(serializeGame(s));
const order = (s: GameState, cmd: DiscoveryOrder) => applyDiscoveryOrder(s, cmd, discovery(s).nextAction);
function until(s: GameState, condition: () => boolean, seconds = 30) {
  for (let i = 0; i < Math.ceil(seconds * 30) && !condition(); i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(condition()).toBe(true);
}
const finish = (s: GameState) => until(s, () => !s.space!.leg, 6.1);
const charge = (s: GameState) => until(s, () => s.space!.ship!.energy >= 30);
const beacon = (s: GameState) => { s.space!.location!.pos = { x: 0, y: s.space!.location!.scale === 'surface' ? 3 : 0, z: 0 }; };
function system(s: GameState, index: number) {
  const p = s.space!, stars = starSystems(p.homePlanetId); if (p.leg) finish(s);
  if (!p.location) expect(launchShip(s)).toBe(true);
  while (p.location!.scale !== 'system') {
    charge(s); beacon(s); if (p.location!.scale === 'surface') p.location!.pos.y = 20;
    expect(changeSpaceScale(s, 'up')).toBe(true); finish(s);
  }
  let current = planetSystem(p.homePlanetId, p.location!.planetId)!.index;
  while (current !== index) {
    charge(s); beacon(s);
    const next = jumpQuote(s, stars[index].id).ok ? index : current + Math.sign(index - current);
    expect(jumpToSystem(s, stars[next].id)).toBe(true); finish(s); current = next;
  }
  beacon(s);
}
function surface(s: GameState, index: number) {
  system(s, index); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s);
  expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s);
}
function relic(s: GameState, id: 'passage' | 'memory') {
  const r = RELICS[id]; surface(s, r.index); s.space!.location!.pos = { x: r.x, y: 3, z: r.z };
  expect(order(s, { kind: 'relic', relicId: id })).toBe(true);
}
function atSociety(s: GameState) {
  surface(s, planetSystem(s.space!.homePlanetId, discovery(s).society.planetId)!.index);
  s.space!.location!.pos = { ...SOCIETY_POSITION, y: 3 };
}
function cooperation(aid: 'patronage' | 'ecology' = 'patronage') {
  const s = enabled(); relic(s, 'memory'); atSociety(s);
  expect(order(s, { kind: 'contact' })).toBe(true); expect(order(s, { kind: 'share' })).toBe(true);
  expect(order(s, { kind: aid === 'patronage' ? 'accept-patronage' : 'accept-ecology' })).toBe(true); return s;
}
function scans(s: GameState) {
  const world = livingPlanet(s)!;
  for (let role = 0; role < 6; role++) {
    const life = world.life.find(l => roleOf(l) === role)!;
    s.space!.location!.pos = { x: life.pos.x, y: 3, z: life.pos.z };
    expect(useSpecimenTool(s, 'scan', life.id)).toBe(true);
  }
  s.space!.location!.pos = { ...SOCIETY_POSITION, y: 3 };
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
afterEach(() => vi.unstubAllGlobals());

describe('D4 explicit discovery and preserved history', () => {
  it.each(['campaign', 'quarantine', 'battle', 'retreat'])('activates exact %s without changing existing state, funds or event history', kind => {
    const s = load(kind), before = structuredClone(s); enableSpaceDiscoveries(s);
    expect(account(s)).toEqual({ ...account(before), version: 7, ledger: { ...account(before).ledger, patronage: 0 }, counts: { ...account(before).counts, patronage: 0 } });
    for (const key of ['ship', 'expedition', 'events', 'wars', 'empires', 'outfit', 'expansion', 'combat', 'location', 'leg', 'log'] as const) expect(s.space![key]).toEqual(before.space![key]);
    expect(discovery(s)).toMatchObject({ version: 1, actions: [], scans: [], nextAction: 1, society: { planetId: `${s.space!.homePlanetId}:star-19:planet`, enclave: false } });
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(discovery(cp).society).toEqual(discovery(s).society); expect(discovery(cp).protectedPlanets).toEqual(discovery(s).protectedPlanets);
    expect(discovery(cp).actions).toEqual([]); expect(cp.space!.ship).toBeNull(); expect(account(cp).balance).toBe(0);
    expect(round(s)).toEqual(s); const once = structuredClone(s); enableSpaceDiscoveries(s); expect(s).toEqual(once);
    expect(recoverGeneration(round(s)).space).toEqual(cp.space);
  });

  it('allocates around protected colonies/capitals and uses a fixed enclave without replacing an old owner', () => {
    const stars = starSystems('test-home'), capitals = [1, 4, 7].map(i => stars[i].planetId);
    const first = allocateYoungSociety('test-home', capitals, capitals); expect(first.planetId).toBe(stars[19].planetId);
    const shifted = allocateYoungSociety('test-home', [...capitals, first.planetId], capitals);
    expect(shifted.planetId).not.toBe(first.planetId); expect(capitals).not.toContain(shifted.planetId); expect(shifted.enclave).toBe(false);
    const all = stars.filter(s => s.index).map(s => s.planetId), enclave = allocateYoungSociety('test-home', all, capitals);
    expect(enclave).toEqual({ planetId: first.planetId, enclave: true });
  });
});

describe('D4 actual paid navigation and permanent local knowledge', () => {
  it('requires the real relic site and rejects stale/repeated discovery without payment or cargo changes', () => {
    const s = enabled(); surface(s, 5); const p = s.space!, d = discovery(s), funds = account(s).balance, cargo = structuredClone(p.expedition!.cargo);
    expect(discoveryQuote(s, { kind: 'relic', relicId: 'passage' }, d.nextAction).ok).toBe(false);
    p.location!.pos = { x: RELICS.passage.x, y: 3, z: RELICS.passage.z };
    expect(applyDiscoveryOrder(s, { kind: 'relic', relicId: 'passage' }, 2)).toBe(false);
    const energy = p.ship!.energy; expect(order(s, { kind: 'relic', relicId: 'passage' })).toBe(true);
    expect(order(s, { kind: 'relic', relicId: 'passage' })).toBe(false); expect(account(s).balance).toBe(funds); expect(p.ship!.energy).toBe(energy); expect(p.expedition!.cargo).toEqual(cargo);
    expect(round(s)).toEqual(s);
  });

  it('crosses the actual beyond-range pair both ways and roundtrips a paid pending passage without advancing or healing it', () => {
    let s = enabled(); relic(s, 'passage'); system(s, 5); charge(s);
    const stars = starSystems(s.space!.homePlanetId); expect(systemDistance(stars[5], stars[22])).toBeGreaterThan(32);
    expect(jumpQuote(s, stars[22].id).ok).toBe(false); makeCheckpoint(s); const before = structuredClone(s.space!), energy = before.ship!.energy;
    expect(enterWormhole(s, discovery(s).nextAction)).toBe(true); expect(s.space!.ship!.energy).toBe(energy - 14);
    expect(s.space!.leg).toMatchObject({ duration: 6, energyPaid: 14, passage: { kind: 'wormhole', relicSerial: 1 } });
    for (let i = 0; i < 60; i++) step(s, EMPTY_INPUT, 1 / 30);
    const pending = structuredClone(s.space!); s = round(s); expect(s.space).toEqual(pending); expect(s.space!.expansion).toEqual(before.expansion);
    finish(s); expect(s.space!.location!.planetId).toBe(stars[22].planetId); expect(s.space!.log.at(-1)!.passage).toEqual({ kind: 'wormhole', relicSerial: 1 });
    expect(round(s)).toEqual(s); charge(s); expect(enterWormhole(s, discovery(s).nextAction)).toBe(true); finish(s);
    expect(s.space!.location!.planetId).toBe(stars[5].planetId); expect(round(s)).toEqual(s);
  });

  it.each(['pair', 'price', 'relic', 'ordinary-proof'])('rejects forged %s on a copied passage', fault => {
    const s = enabled(); relic(s, 'passage'); system(s, 5); charge(s); expect(enterWormhole(s, discovery(s).nextAction)).toBe(true);
    const p = s.space!;
    if (fault === 'pair') { const target = starSystems(p.homePlanetId)[21]; p.leg!.to.planetId = target.planetId; p.leg!.to.systemId = target.id; }
    if (fault === 'price') p.leg!.energyPaid = 1;
    if (fault === 'relic') p.leg!.passage!.relicSerial = 2;
    if (fault === 'ordinary-proof') delete p.leg!.passage;
    reject(s);
  });
});

describe('D4 young society, actual help and service entitlement', () => {
  it('develops contact→shared workshop→paid help, then pays for real repair and recharge with no colony grant', () => {
    const s = cooperation(), e = account(s), p = s.space!, oldColonies = structuredClone(e.colonies), before = e.balance;
    expect(order(s, { kind: 'support' })).toBe(true); expect(e.balance).toBe(before - 40); expect(e.ledger.patronage).toBe(40); expect(e.counts.patronage).toBe(1);
    expect(societyProgress(discovery(s)).supported).toMatchObject({ kind: 'support', aid: 'patronage', receipt: { serial: 42, paid: 40, discoveryAction: 5 } });
    expect(e.colonies).toEqual(oldColonies); expect(order(s, { kind: 'support' })).toBe(false);
    beacon(s); expect(societyService(p, p.location!.planetId)).not.toBeNull();
    expect(applyEconomyOrder(s, { kind: 'repair' }, e.nextAction)).toBe(true);
    const repair = e.actions.at(-1)!; expect(repair).toMatchObject({ kind: 'repair', paid: 5, before: 99, after: 115, societyService: { supportSerial: 5 } });
    const specimen = livingPlanet(s)!.life[0]; p.location!.pos = { x: specimen.pos.x, y: 3, z: specimen.pos.z };
    expect(useSpecimenTool(s, 'scan', specimen.id)).toBe(true); beacon(s);
    expect(applyEconomyOrder(s, { kind: 'charge' }, e.nextAction)).toBe(true); expect(e.balance).toBe(before - 48);
    expect(round(s)).toEqual(s); expect(e.colonies).toEqual(oldColonies);
  });

  it('requires new paid role scans and actual stability for ecological help without a patronage payment', () => {
    const s = enabled(); relic(s, 'memory'); atSociety(s); scans(s); expect(discovery(s).scans).toEqual([]);
    expect(order(s, { kind: 'contact' })).toBe(true); expect(order(s, { kind: 'share' })).toBe(true); expect(order(s, { kind: 'accept-ecology' })).toBe(true);
    expect(order(s, { kind: 'support' })).toBe(false); const balance = account(s).balance, paid = livingExpedition(s)!.biosphere.paidScans;
    scans(s); expect(discovery(s).scans).toHaveLength(6); expect(livingExpedition(s)!.biosphere.paidScans - paid).toBe(6);
    until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 120);
    expect(order(s, { kind: 'support' })).toBe(true); expect(account(s).balance).toBe(balance); expect(account(s).ledger.patronage).toBe(0);
    expect(round(s)).toEqual(s); const before = structuredClone(discovery(s).scans); scans(s); expect(discovery(s).scans).toEqual(before);
  });

  it('rejects missing knowledge, remote assistance, alternative duplicate assistance and unaffordable patronage', () => {
    const s = enabled(); atSociety(s); expect(order(s, { kind: 'contact' })).toBe(true); expect(order(s, { kind: 'share' })).toBe(false);
    relic(s, 'memory'); expect(order(s, { kind: 'share' })).toBe(false); atSociety(s); expect(order(s, { kind: 'share' })).toBe(true);
    expect(order(s, { kind: 'accept-patronage' })).toBe(true); expect(order(s, { kind: 'accept-ecology' })).toBe(false);
    // Deliberately prepared low-balance quote input, never a claimed valid save.
    account(s).balance = 39; expect(order(s, { kind: 'support' })).toBe(false); expect(account(s).balance).toBe(39);
  });

  it('preserves supported progression, permanent payment and service witnesses through storage, rekey and checkpoint', () => {
    const s = cooperation(); expect(order(s, { kind: 'support' })).toBe(true); makeCheckpoint(s); beacon(s);
    expect(applyEconomyOrder(s, { kind: 'repair' }, account(s).nextAction)).toBe(true);
    const local = new Map<string, string>(); vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const copied = round(s), cp = JSON.parse(copied.checkpoint!) as GameState; copied.id += '-discovery-import'; cp.id = copied.id; copied.checkpoint = JSON.stringify(cp);
    expect(round(copied).space).toEqual(s.space); expect(recoverGeneration(round(copied)).space!.discoveries).toEqual(discovery(cp));
  });

  it('keeps six genuine scan witnesses after the biological source log rolls out', () => {
    const s = cooperation('ecology'); scans(s);
    until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 120);
    expect(order(s, { kind: 'support' })).toBe(true); makeCheckpoint(s);
    const proofs = structuredClone(discovery(s).scans);
    for (let i = 0; i < 130; i++) {
      charge(s); const specimen = livingPlanet(s)!.life[0];
      s.space!.location!.pos = { x: specimen.pos.x, y: 3, z: specimen.pos.z };
      expect(useSpecimenTool(s, 'scan', specimen.id)).toBe(true);
    }
    expect(livingExpedition(s)!.actions.some(r => r.serial === proofs[0].receipt.serial)).toBe(false);
    expect(discovery(s).scans).toEqual(proofs); expect(round(s)).toEqual(s);
    const forged = structuredClone(s); discovery(forged).scans[0].receipt.serial++;
    reject(forged);
  });

  it('preserves patronage after 129 real deposits roll its source receipt beyond the retained account', () => {
    const s = enabled();
    // Prepared UNIT treasury before a checkpoint; deposits really debit it.
    s.machines!.resource = 3000; makeCheckpoint(s);
    relic(s, 'memory'); atSociety(s);
    for (const kind of ['contact', 'share', 'accept-patronage', 'support'] as const) expect(order(s, { kind })).toBe(true);
    const support = structuredClone(societyProgress(discovery(s)).supported!); makeCheckpoint(s);
    surface(s, 0); expect(changeSpaceScale(s, 'down')).toBe(true);
    for (let i = 0; i < 129; i++) expect(applyEconomyOrder(s, { kind: 'deposit' }, account(s).nextAction)).toBe(true);
    expect(s.machines!.resource).toBe(420); expect(account(s).actions.every(r => r.kind === 'deposit')).toBe(true);
    expect(societyProgress(discovery(s)).supported).toEqual(support); expect(round(s)).toEqual(s);
    const forged = structuredClone(s), altered = societyProgress(discovery(forged)).supported!;
    if (altered.aid === 'patronage') { altered.receipt.balanceBefore++; altered.receipt.balanceAfter++; }
    reject(forged);
  });

  it.each(['payment', 'service', 'society', 'progress'])('rejects forged %s on an otherwise genuine unit continuation', fault => {
    const s = cooperation(); expect(order(s, { kind: 'support' })).toBe(true); beacon(s); expect(applyEconomyOrder(s, { kind: 'repair' }, account(s).nextAction)).toBe(true);
    if (fault === 'payment') account(s).ledger.patronage = 0;
    if (fault === 'service') { const row = account(s).actions.at(-1)!; if (row.kind === 'repair') row.societyService!.supportSerial--; }
    if (fault === 'society') discovery(s).society.planetId = starSystems(s.space!.homePlanetId)[16].planetId;
    if (fault === 'progress') discovery(s).actions.splice(1, 1);
    reject(s);
  });
});
