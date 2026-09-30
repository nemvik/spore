import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { starSystems, planetSystem, systemDistance } from '../src/game/galaxy';
import { parseGame, serializeGame } from '../src/game/persistence';
import { creatureInheritance, tribeInheritance, type StageHistory } from '../src/game/lineage-history';
import { civilizationInheritance, type CivicMethod } from '../src/game/civilization';
import { livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { lifeIdentity } from '../src/game/space-ecology-history';
import { applyEconomyOrder, economyQuote, enableSpaceEconomy, spaceEconomy, type EconomyOrder } from '../src/game/space-economy';
import { applyEmpireOrder, empireQuote, enableSpaceEmpires, observeSpaceEmpires, empireRelation,
  missionProgress, spaceSalePrice, type EmpireOrder } from '../src/game/space-empires';
import { allocateEmpires, empireSurveyTarget } from '../src/game/space-empires-content';
import type { EmpireId } from '../src/game/space-empires-types';
import { validateSpaceEmpires } from '../src/game/space-empires-validation';
import { spaceInheritance, empireAffinity } from '../src/game/space-inheritance';
import { jumpToSystem, useSpecimenTool } from '../src/game/space-expedition';
import { changeSpaceScale, launchShip } from '../src/game/space';
import { spaceMarketPrice } from '../src/game/space-products';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

// Explicit UNIT continuations. The exported native campaign is immutable;
// prepared coordinates and the one labelled rollover treasury are not UI proof.
const fixture = (kind: 'active' | 'carried' = 'carried') => parseGame(readFileSync(`tests/fixtures/space/native-c3b-${kind === 'active' ? 'campaign' : 'carried-production'}.save.json`, 'utf8'));
const round = (s: GameState) => parseGame(serializeGame(s));
const account = (s: GameState) => spaceEconomy(s)!;
const registry = (s: GameState) => s.space!.empires!;
const empire = (s: GameState, id: EmpireId) => registry(s).entries.find(entry => entry.id === id)!;
const enabled = (kind: 'active' | 'carried' = 'carried') => { const s = fixture(kind); enableSpaceEmpires(s); return s; };
const transact = (s: GameState, order: EconomyOrder) => applyEconomyOrder(s, order, account(s).nextAction);
const order = (s: GameState, id: EmpireId, kind: EmpireOrder['kind']) => applyEmpireOrder(s, { empireId: id, kind }, registry(s).nextAction);
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...rest } = s; return structuredClone(rest); };
const withoutNotice = (s: GameState) => { const copy = structuredClone(s); copy.space!.notice = ''; return copy; };
const frames = (s: GameState, seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) step(s, EMPTY_INPUT, 1 / 30); };
function finish(s: GameState) {
  for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.leg).toBeNull();
}
function beacon(s: GameState) { s.space!.location!.pos = { x: 0, y: 3, z: 0 }; }
function recharge(s: GameState, required = 25) {
  for (let i = 0; i < 900 && s.space!.ship!.energy < required; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.ship!.energy).toBeGreaterThanOrEqual(required);
}
function travel(s: GameState, index: number) {
  const p = s.space!, systems = starSystems(p.homePlanetId);
  if (!p.location) expect(launchShip(s)).toBe(true);
  if (p.location!.planetId === systems[index].planetId && p.location!.scale === 'surface') { beacon(s); return; }
  if (p.location!.scale === 'surface') { recharge(s); p.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  if (p.location!.scale === 'orbit') { recharge(s); beacon(s); expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  let current = planetSystem(p.homePlanetId, p.location!.planetId)!.index;
  while (current !== index) {
    current += Math.sign(index - current); recharge(s);
    expect(jumpToSystem(s, systems[current].id)).toBe(true); finish(s);
  }
  beacon(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s);
  expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s);
  if (index === 0) expect(changeSpaceScale(s, 'down')).toBe(true);
}
function capital(s: GameState, id: EmpireId) { travel(s, planetSystem(s.space!.homePlanetId, empire(s, id).capitalId)!.index); }
function scan(s: GameState, id: string) {
  const body = livingPlanet(s)!.life.find(body => body.id === id)!;
  s.space!.location!.pos = { x: body.pos.x, y: Math.max(2, body.pos.y + 1), z: body.pos.z };
  expect(useSpecimenTool(s, 'scan', id)).toBe(true);
}
function refuse(s: GameState, id: EmpireId, kind: EmpireOrder['kind'], revision = registry(s).nextAction) {
  const before = withoutNotice(s), cmd = { empireId: id, kind };
  expect(empireQuote(s, cmd, revision).ok).toBe(false); expect(applyEmpireOrder(s, cmd, revision)).toBe(false);
  expect(withoutNotice(s)).toEqual(before);
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
function tradeTreaty() {
  const s = enabled(); expect(order(s, 'resin', 'contact')).toBe(true); expect(order(s, 'resin', 'accept')).toBe(true);
  expect(transact(s, { kind: 'sell', originPlanetId: account(s).cargo[0].planetId })).toBe(true);
  expect(missionProgress(empire(s, 'resin'))).toBe(8);
  expect(order(s, 'resin', 'complete')).toBe(true); expect(order(s, 'resin', 'treaty')).toBe(true); return s;
}

// Pure inheritance inputs deliberately isolate evidence domains. These prepared
// snapshots are not serialized as earned histories or used for flight proofs.
function pureEvidence() {
  const s = JSON.parse(readFileSync('tests/fixtures/space/native-c3b-campaign.save.json', 'utf8')).state as GameState;
  delete s.lineageHistory; delete s.tribe; delete s.civilization; return s;
}
function diet(s: GameState, plants: number, meat: number, other = 0) {
  const stages: StageHistory[] = ([0, 1, 2] as const).map(stage => ({ stage, coverage: 'complete', started: { tick: 0, generation: 1 },
    counts: { meals: { algae: stage === 0 ? plants : 0, nectar: 0, meat: stage === 0 ? meat : 0, mineral: other, detritus: 0 }, hunts: 0 },
    facts: [], closed: { outcome: 'passage', source: 'action', at: { tick: 1, generation: 1 } } }));
  s.lineageHistory = { version: 1, stages };
}

describe('D1 concrete inheritance evidence, four bounded domains', () => {
  it.each([
    [3, 1, 'plants', 'keeper'], [1, 3, 'meat', 'vanguard'], [2, 1, 'mixed', 'weaver'],
    [1, 2, 'mixed', 'weaver'], [1, 0, 'plants', 'keeper'], [0, 1, 'meat', 'vanguard'], [0, 0, 'unknown', 'voyager'],
  ] as const)('classifies complete diet %i:%i as %s without inferring anatomy', (plants, meat, kind, philosophy) => {
    const s = pureEvidence(); diet(s, plants, meat, 100); const result = spaceInheritance(s);
    expect(result.diet).toMatchObject({ coverage: 'complete', plants, meat, other: 300, kind }); expect(result.philosophy).toBe(philosophy);
    expect(Object.values(result.scores).reduce((a, b) => a + b, 0)).toBe(plants + meat ? 6 : 0);
    s.player.genome.parts = []; expect(spaceInheritance(s)).toEqual(result);
  });

  it('shows partial meals but never votes until every organism stage has a complete closed record', () => {
    const s = pureEvidence(); diet(s, 9, 1); s.lineageHistory!.stages[1].coverage = 'partial';
    expect(spaceInheritance(s)).toMatchObject({ diet: { coverage: 'partial', kind: 'unknown', plants: 9, meat: 1 }, philosophy: 'voyager' });
    s.lineageHistory!.stages[1].coverage = 'complete'; s.lineageHistory!.stages[2].closed = null;
    expect(spaceInheritance(s).philosophy).toBe('voyager');
    s.lineageHistory!.stages.forEach(row => { row.coverage = 'unknown'; row.counts = null; });
    expect(spaceInheritance(s).diet).toEqual({ coverage: 'unknown', kind: 'unknown', plants: null, meat: null, other: null });
  });

  it('shows known meals from closed partial records without claiming complete coverage or awarding any diet votes', () => {
    const s = pureEvidence(); diet(s, 9, 1, 100);
    s.lineageHistory!.stages.forEach(row => { row.coverage = 'partial'; });
    expect(spaceInheritance(s)).toMatchObject({ diet: { coverage: 'partial', kind: 'unknown', plants: 9, meat: 1, other: 300 },
      scores: { keeper: 0, broker: 0, vanguard: 0 }, philosophy: 'voyager' });
  });

  it.each(['social', 'predator', 'mixed'] as const)('uses a closed evidenced %s creature route once without a double stage-two budget', route => {
    const s = pureEvidence(); diet(s, 3, 1); const row = s.lineageHistory!.stages[2];
    row.closed!.outcome = route; row.facts = [0, 1, 2].map(n => ({ key: `nest:${n}`, method: route === 'social' ? 'friend' : 'predator', source: 'action', at: { tick: 1, generation: 1 } }));
    const result = spaceInheritance(s); expect(result.creature).toBe(route);
    expect(result.scores).toEqual(route === 'social' ? { keeper: 12, broker: 0, vanguard: 0 } : route === 'predator' ? { keeper: 6, broker: 0, vanguard: 6 } : { keeper: 9, broker: 0, vanguard: 3 });
    row.closed!.source = 'saved'; expect(spaceInheritance(s).creature).toBeNull();
    expect(spaceInheritance(s).scores).toEqual({ keeper: 6, broker: 0, vanguard: 0 });
  });

  it.each(['trade', 'military', 'conversion'] as const)('retains native %s B2 and the genuine saved allied tribe despite unknown food and region restoration', method => {
    const path = method === 'trade' ? 'native-civic' : `native-${method}`;
    const s = parseGame(readFileSync(`tests/fixtures/civilization/${path}-campaign.save.json`, 'utf8'));
    const result = spaceInheritance(s); expect(result.diet.kind).toBe('unknown'); expect(result.creature).toBeNull();
    expect(result.tribe).toBe('allied'); expect(result.civilization).toEqual([method]);
    expect(result.scores).toEqual({ keeper: method === 'conversion' ? 6 : 0, broker: method === 'trade' ? 12 : 6, vanguard: method === 'military' ? 6 : 0 });
    expect(result.philosophy).toBe(method === 'trade' ? 'broker' : 'weaver');
  });

  it('divides mixed B2 evidence into six integer votes and ignores current unfinished acquisition history', () => {
    const s = fixture('active'); delete s.lineageHistory; delete s.tribe;
    const acquisitions = s.cities!.entries.flatMap(city => city.transfers?.filter(row => row.to.kind === 'lineage') ?? []);
    expect(acquisitions.length).toBeGreaterThanOrEqual(3);
    const methods: CivicMethod[] = ['trade', 'conversion', 'military'];
    acquisitions.forEach((row, i) => { const method = methods[i % methods.length]; row.method = method === 'military' ? undefined : method; });
    expect(spaceInheritance(s)).toMatchObject({ scores: { keeper: 2, broker: 2, vanguard: 2 }, philosophy: 'weaver' });
    s.civilization!.completed = null;
    expect(spaceInheritance(s)).toMatchObject({ civilization: [], scores: { keeper: 0, broker: 0, vanguard: 0 }, philosophy: 'voyager' });
  });
});

describe('D1 explicit migration, existing addresses and old checkpoint prices', () => {
  it.each(['carried', 'active'] as const)('upgrades %s live and its original checkpoint without a contact, reward or rewritten v1 transaction', kind => {
    const s = fixture(kind), before = structuredClone(s), cpBefore = JSON.parse(s.checkpoint!) as GameState;
    expect(s.space!.empires).toBeUndefined(); expect(account(s).version).toBe(1); expect(round(s)).toEqual(s);
    enableSpaceEmpires(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(registry(s).inheritance).toBeNull(); expect(registry(cp).inheritance).toBeNull();
    expect(registry(s).entries.every(entry => entry.contact === null && entry.mission === null && entry.treaty === null)).toBe(true);
    expect(registry(s).entries).toEqual(registry(cp).entries);
    for (const [now, old] of [[s, before], [cp, cpBefore]]) {
      expect(account(now)).toEqual({ ...account(old), version: 2, pricingActivatedAction: account(old).nextAction });
      expect(now.space!.expedition).toEqual(old.space!.expedition); expect(now.space!.ship).toEqual(old.space!.ship); expect(domestic(now)).toEqual(domestic(old));
    }
    const once = structuredClone(s); enableSpaceEmpires(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
    expect(account(recoverGeneration(round(s))).balance).toBe(0);
    expect(registry(recoverGeneration(round(s))).inheritance).toBeNull();
  });

  it('keeps independent nonempty v1 checkpoint pricing cuts and reserves a newly founded old colony for both snapshots', () => {
    const s = fixture('active'); travel(s, 1); frames(s, 12); makeCheckpoint(s);
    const oldCp = JSON.parse(s.checkpoint!) as GameState;
    expect(transact(s, { kind: 'found' })).toBe(true); const before = structuredClone(account(s));
    enableSpaceEmpires(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(account(s).pricingActivatedAction).toBe(before.nextAction); expect(account(cp).pricingActivatedAction).toBe(account(oldCp).nextAction);
    expect(registry(s).protectedColonies).toContain(`${s.space!.homePlanetId}:star-1:planet`);
    expect(registry(s).entries).toEqual(registry(cp).entries); expect(empire(s, 'resin').capitalId).not.toBe(`${s.space!.homePlanetId}:star-1:planet`);
    expect(account(s).colonies).toEqual(before.colonies); expect(round(s)).toEqual(s);
  });

  it('allocates deterministic nearby free capitals or distinct non-sovereign enclaves when every living address is already owned', () => {
    const home = fixture().space!.homePlanetId, systems = starSystems(home), living = systems.filter(system => system.living);
    const base = allocateEmpires(home, []); expect(base.map(entry => entry.capitalId)).toEqual([1, 4, 7].map(index => systems[index].planetId));
    const blocked = [systems[1].planetId], moved = allocateEmpires(home, blocked);
    expect(moved[0].capitalId).toBe(living.filter(system => !blocked.includes(system.planetId)).sort((a, b) => systemDistance(systems[1], a) - systemDistance(systems[1], b) || a.index - b.index)[0].planetId);
    const all = living.map(system => system.planetId), enclaves = allocateEmpires(home, all);
    expect(enclaves.every(entry => entry.enclave)).toBe(true); expect(new Set(enclaves.map(entry => entry.capitalId)).size).toBe(3);
    expect(allocateEmpires(home, [...all].reverse())).toEqual(enclaves); expect(all).toEqual(living.map(system => system.planetId));
  });

  it('does not activate without the ecological economy dependency or freeze philosophy in an untouched registry', () => {
    const s = fixture(); delete s.space!.economy; const cp = JSON.parse(s.checkpoint!) as GameState; delete cp.space!.economy; s.checkpoint = JSON.stringify(cp);
    const before = structuredClone(s); enableSpaceEmpires(s); expect(s).toEqual(before);
    enableSpaceEconomy(s); enableSpaceEmpires(s); expect(registry(s).inheritance).toBeNull(); expect(registry(s).nextAction).toBe(1);
  });

  it('keeps the opt-in registry empty and philosophy unfrozen when no-checkpoint recovery begins a new lineage', () => {
    const s = tradeTreaty(); s.checkpoint = null; const fresh = recoverGeneration(s);
    expect(fresh.stage).toBe(0); expect(registry(fresh)).toMatchObject({ inheritance: null, actions: [], nextAction: 1 });
    expect(account(fresh).balance).toBe(0); expect(account(fresh).version).toBe(2);
    expect(registry(fresh).entries.every(entry => entry.contact === null && entry.mission === null && entry.treaty === null)).toBe(true);
    expect(round(fresh)).toEqual(fresh);
  });
});

describe('D1 real contact, delivery and historically priced treaty', () => {
  it('contacts an already visited planet, freezes actual inherited evidence and leaves every existing multiplier, world and pot unchanged', () => {
    const s = enabled(), previous = structuredClone(s.space!.expedition), money = structuredClone(account(s));
    const inherited = [creatureInheritance(s), tribeInheritance(s), civilizationInheritance(s)];
    expect(order(s, 'resin', 'contact')).toBe(true); expect(registry(s).inheritance).toEqual(spaceInheritance(s));
    expect(empireRelation(s, empire(s, 'resin'))).toBe(10); expect(s.space!.expedition).toEqual(previous); expect(account(s)).toEqual(money);
    expect([creatureInheritance(s), tribeInheritance(s), civilizationInheritance(s)]).toEqual(inherited);
    refuse(s, 'resin', 'contact'); expect(round(s)).toEqual(s);
  });

  it.each(['remote', 'height', 'orbit', 'dead-player', 'dead-ship', 'stale'] as const)('atomically refuses a %s contact', condition => {
    const s = enabled();
    if (condition === 'remote') s.space!.location!.pos.x = 13;
    else if (condition === 'height') s.space!.location!.pos.y = 9;
    else if (condition === 'orbit') s.space!.location!.scale = 'orbit';
    else if (condition === 'dead-player') s.player.health = 0;
    else if (condition === 'dead-ship') s.space!.ship!.health = 0;
    refuse(s, 'resin', 'contact', condition === 'stale' ? 0 : registry(s).nextAction);
  });

  it('requires contact, a new post-acceptance physical sale, personal completion and ratification with no cash grant', () => {
    const s = enabled(); refuse(s, 'resin', 'accept'); expect(order(s, 'resin', 'contact')).toBe(true);
    refuse(s, 'resin', 'treaty'); refuse(s, 'resin', 'accept-survey'); expect(order(s, 'resin', 'accept')).toBe(true);
    const accepted = registry(s).actions.at(-1)!, at = s.space!.elapsed, cash = account(s).balance;
    refuse(s, 'resin', 'complete'); refuse(s, 'resin', 'accept'); makeCheckpoint(s);
    const revision = account(s).nextAction, originPlanetId = account(s).cargo[0].planetId;
    expect(transact(s, { kind: 'sell', originPlanetId })).toBe(true);
    expect(s.space!.elapsed).toBe(at); expect(missionProgress(empire(s, 'resin'))).toBe(8);
    const evidence = empire(s, 'resin').mission!.evidence; expect(evidence).toHaveLength(1); expect(evidence[0].receipt.serial).toBe(accepted.cut.economyAction);
    expect(account(s).balance).toBe(cash + 80); expect(evidence[0].receipt).toEqual(account(s).actions.find(row => row.serial === revision));
    const firstSale = structuredClone(account(s).actions.at(-1)), accountBeforeDiplomacy = structuredClone(account(s));
    expect(order(s, 'resin', 'complete')).toBe(true); expect(empireRelation(s, empire(s, 'resin'))).toBe(40);
    expect(order(s, 'resin', 'treaty')).toBe(true); expect(account(s)).toEqual(accountBeforeDiplomacy);
    expect(spaceSalePrice(s, empire(s, 'resin').capitalId, 'moon-salt')).toMatchObject({ price: 12, basis: { base: 10, bonus: 2, treatySerial: 4, relationRevision: 3 } });
    expect(account(s).actions.at(-1)).toEqual(firstSale); refuse(s, 'resin', 'complete'); refuse(s, 'resin', 'treaty');
    expect(round(s)).toEqual(s); expect(registry(recoverGeneration(round(s))).entries[0].mission!.evidence).toEqual([]);
  });

  it('pays the treaty price for a second actually manufactured shipment while preserving the earlier same-clock base-price receipt', () => {
    const s = tradeTreaty(), initial = structuredClone(account(s).actions), originPlanetId = account(s).colonies[0].planetId;
    travel(s, 2); frames(s, 40); expect(transact(s, { kind: 'load' })).toBe(true); const amount = account(s).cargo[0].amount;
    capital(s, 'resin'); const before = account(s).balance;
    expect(economyQuote(s, { kind: 'sell', originPlanetId }, account(s).nextAction)).toMatchObject({ ok: true, price: 12, amount });
    expect(transact(s, { kind: 'sell', originPlanetId })).toBe(true); expect(account(s).balance).toBe(before + amount * 12);
    expect(account(s).actions.slice(0, initial.length)).toEqual(initial); expect(empire(s, 'resin').mission!.evidence).toHaveLength(1);
    expect(round(s)).toEqual(s);
  });

  it('does not credit the three native sales or repeated observations to a newly accepted mission', () => {
    const s = enabled('active'); capital(s, 'resin'); expect(order(s, 'resin', 'contact')).toBe(true); expect(order(s, 'resin', 'accept')).toBe(true);
    const before = structuredClone(s); for (let i = 0; i < 3; i++) observeSpaceEmpires(s);
    expect(s).toEqual(before); expect(missionProgress(empire(s, 'resin'))).toBe(0); expect(account(s).ledger.revenue).toBe(312);
    expect(round(s)).toEqual(s);
  });
});

describe('D1 source-log rollover and genuinely different mission actions', () => {
  it('retains a sale witness through 129 later real deposits and completes only after returning to its embassy', () => {
    const s = fixture();
    // Prepared unit treasury before the full checkpoint. Every later deposit
    // really pays20; this does not claim native reachability of3000 amber.
    s.machines!.resource = 3000; makeCheckpoint(s); enableSpaceEmpires(s);
    expect(order(s, 'resin', 'contact')).toBe(true); expect(order(s, 'resin', 'accept')).toBe(true);
    expect(transact(s, { kind: 'sell', originPlanetId: account(s).cargo[0].planetId })).toBe(true);
    const witness = structuredClone(empire(s, 'resin').mission!.evidence); makeCheckpoint(s);
    travel(s, 0); const domesticBefore = s.machines!.resource;
    for (let i = 0; i < 129; i++) expect(transact(s, { kind: 'deposit' })).toBe(true);
    expect(s.machines!.resource).toBe(domesticBefore - 2580); expect(account(s).actions.every(row => row.kind === 'deposit')).toBe(true);
    expect(empire(s, 'resin').mission!.evidence).toEqual(witness); refuse(s, 'resin', 'complete'); expect(round(s)).toEqual(s);
    capital(s, 'resin'); expect(order(s, 'resin', 'complete')).toBe(true); expect(order(s, 'resin', 'treaty')).toBe(true);
    const imported = round(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-d1-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    expect(round(imported).space).toEqual(s.space); expect(empire(recoverGeneration(round(imported)), 'resin').mission!.evidence).toEqual(witness);
    const bad = structuredClone(imported); empire(bad, 'resin').mission!.evidence[0].receipt.serial++;
    reject(bad);
    // Standalone omitted history still cannot claim more sale witnesses than
    // the account's one genuine sale, even using another rolled serial.
    const overspent = structuredClone(imported); overspent.checkpoint = null;
    const extra = structuredClone(empire(overspent, 'resin').mission!.evidence[0]);
    if (extra.kind !== 'trade') throw new Error('trade witness');
    extra.receipt.serial++; extra.receipt.amount = 1; extra.receipt.earned = extra.receipt.unitPrice;
    extra.receipt.balanceAfter = extra.receipt.balanceBefore + extra.receipt.earned;
    empire(overspent, 'resin').mission!.evidence.push(extra); reject(overspent);
  });

  it('counts new paid rescans by six distinct roles and keeps them after the original biological receipts roll away', () => {
    const s = enabled('active'); capital(s, 'roots'); const world = livingPlanet(s)!, life = livingExpedition(s)!;
    const bodies = [0, 1, 2, 3, 4, 5].map(role => world.life.find(body => lifeIdentity(life, body.id)!.role === role)!);
    scan(s, bodies[0].id); beacon(s); expect(order(s, 'roots', 'contact')).toBe(true); expect(order(s, 'roots', 'accept')).toBe(true);
    observeSpaceEmpires(s); expect(missionProgress(empire(s, 'roots'))).toBe(0);
    const firstKnown = structuredClone(life.scans.find(row => row.lifeId === bodies[0].id)), paidBefore = life.biosphere.paidScans;
    scan(s, bodies[0].id); scan(s, bodies[0].id); expect(missionProgress(empire(s, 'roots'))).toBe(1);
    expect(life.scans.find(row => row.lifeId === bodies[0].id)).toEqual(firstKnown);
    for (const body of bodies.slice(1)) scan(s, body.id);
    expect(life.biosphere.paidScans - paidBefore).toBe(7); expect(missionProgress(empire(s, 'roots'))).toBe(6);
    const proof = structuredClone(empire(s, 'roots').mission!.evidence); makeCheckpoint(s);
    for (let i = 0; i < 129; i++) { recharge(s, 1); scan(s, bodies[0].id); }
    expect(life.actions.every(row => !proof.some(old => old.receipt.serial === row.serial))).toBe(true);
    expect(empire(s, 'roots').mission!.evidence).toEqual(proof); expect(round(s)).toEqual(s);
    // The retained scans already consume this entire forged payment budget;
    // the six permanent older scans need their own real historical payments.
    const insufficient = structuredClone(s);
    livingExpedition(insufficient)!.biosphere.paidScans = life.actions.filter(row => row.kind === 'scan').length;
    expect(() => validateSpaceEmpires(s)).not.toThrow(); expect(() => validateSpaceEmpires(insufficient)).toThrow();
    beacon(s); expect(order(s, 'roots', 'complete')).toBe(true); expect(order(s, 'roots', 'treaty')).toBe(true);
    expect(empireRelation(s, empire(s, 'roots'))).toBe(30); expect(spaceSalePrice(s, world.id, 'moon-salt').basis!.bonus).toBe(1);
    expect(round(s)).toEqual(s);
    const corrupt = structuredClone(s), witness = empire(corrupt, 'roots').mission!.evidence[0];
    if (witness.kind !== 'ecology') throw new Error('ecology proof'); witness.role = 5; reject(corrupt);
  });

  it.each(['basalt', 'roots'] as const)('fulfils %s mapping from a new real descent and personal return, including the explicit ecological alternative', id => {
    const s = enabled('active'); capital(s, id); const target = empireSurveyTarget(s.space!.homePlanetId, empire(s, id)), index = planetSystem(s.space!.homePlanetId, target)!.index;
    travel(s, index); capital(s, id); // The old physical visit must not count.
    expect(order(s, id, 'contact')).toBe(true); expect(order(s, id, id === 'roots' ? 'accept-survey' : 'accept')).toBe(true);
    expect(empire(s, id).mission).toMatchObject({ kind: 'survey', targetPlanetId: target, evidence: [] });
    observeSpaceEmpires(s); expect(missionProgress(empire(s, id))).toBe(0); makeCheckpoint(s);
    travel(s, index); expect(missionProgress(empire(s, id))).toBe(1); refuse(s, id, 'complete');
    const evidence = structuredClone(empire(s, id).mission!.evidence); expect(evidence[0].receipt).toEqual(s.space!.log.at(-1));
    if (id === 'basalt') {
      makeCheckpoint(s);
      // Real completed legs, with prepared altitude only. The mission's one
      // arrival must survive beyond the bounded flight log, not be re-earned.
      for (let i = 0; i < 65; i++) {
        recharge(s, 4); s.space!.location!.pos.y = 20;
        expect(changeSpaceScale(s, 'up')).toBe(true); finish(s);
        expect(changeSpaceScale(s, 'down')).toBe(true); finish(s);
      }
      expect(s.space!.log.some(row => row.serial === evidence[0].receipt.serial)).toBe(false);
      expect(empire(s, id).mission!.evidence).toEqual(evidence); expect(round(s)).toEqual(s);
    }
    capital(s, id); expect(order(s, id, 'complete')).toBe(true); expect(order(s, id, 'treaty')).toBe(true);
    expect(empire(s, id).mission!.evidence).toEqual(evidence); expect(round(s)).toEqual(s);
  });
});

describe('D1 immutable cuts and receipt validation', () => {
  it('rejects an acceptance cut placed before an earlier scan serial but after that scan in clock time', () => {
    const s = enabled(); expect(order(s, 'resin', 'contact')).toBe(true);
    scan(s, livingPlanet(s)!.life[0].id); const prior = livingExpedition(s)!.actions.at(-1)!;
    frames(s, 1); beacon(s); expect(order(s, 'resin', 'accept')).toBe(true); expect(round(s)).toEqual(s);
    const accepted = registry(s).actions.at(-1)!; expect(accepted.cut.at).toBeGreaterThan(prior.at);
    accepted.cut.lifeAction = prior.serial; reject(s); s.checkpoint = null; reject(s);
  });

  it.each(['branch', 'price-cut', 'capital', 'inheritance', 'witness', 'completed-prefix'] as const)('rejects a forged %s against a completed treaty checkpoint', mutation => {
    const s = tradeTreaty(); makeCheckpoint(s); expect(round(s)).toEqual(s);
    if (mutation === 'branch') delete s.space!.empires;
    else if (mutation === 'price-cut') { account(s).pricingActivatedAction!++; registry(s).activated.economyAction++; }
    else if (mutation === 'capital') empire(s, 'resin').capitalId = empire(s, 'roots').capitalId;
    else if (mutation === 'inheritance') registry(s).inheritance!.scores.broker++;
    else if (mutation === 'witness') empire(s, 'resin').mission!.evidence = [];
    else registry(s).actions[0].cut.at -= .01;
    reject(s);
  });

  it('rejects granting the later treaty bonus to the earlier same-time sale even with exactly balanced forged accounts', () => {
    const s = tradeTreaty(), e = account(s), sale = e.actions.at(-1)!;
    if (sale.kind !== 'sell') throw new Error('sale');
    expect(sale.spaceAt).toBe(registry(s).actions.at(-1)!.cut.at);
    const price = spaceSalePrice(s, sale.planetId, sale.product); sale.priceBasis = price.basis!; sale.unitPrice = price.price!;
    const extra = sale.amount * 2; sale.earned += extra; sale.balanceAfter += extra; e.balance += extra; e.ledger.revenue += extra;
    e.sales.find(row => row.planetId === sale.originPlanetId)!.earned += extra;
    const proof = empire(s, 'resin').mission!.evidence[0]; if (proof.kind !== 'trade') throw new Error('trade'); proof.receipt = structuredClone(sale);
    reject(s); s.checkpoint = null; reject(s);
  });

  it('keeps affinity specific to the evidenced profile and gives a tied philosophy the stated smaller first-contact benefit', () => {
    const base = spaceInheritance(fixture()); expect(empireAffinity(base, 'resin')).toBe(10); expect(empireAffinity(base, 'roots')).toBe(0);
    const tied = { ...base, philosophy: 'weaver' as const }; expect(['resin', 'roots', 'basalt'].map(id => empireAffinity(tied, id as EmpireId))).toEqual([5, 5, 5]);
    expect(empireAffinity(null, 'resin')).toBe(0);
  });
});
