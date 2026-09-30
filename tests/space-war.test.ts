import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planetSystem, starSystems, systemDistance } from '../src/game/galaxy';
import { FixedStepClock } from '../src/game/input-clock';
import { machineHome } from '../src/game/machines';
import { planetVehicle } from '../src/game/planet';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { initialShip } from '../src/game/ship-design';
import { newShipCreation } from '../src/game/ship-library';
import { enableSpaceCombat, fireSpacePulse, rescueShip } from '../src/game/space-combat';
import { latestBattle, MILITARY_RESULTS, PIRATE } from '../src/game/space-combat-content';
import { livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { stableBandCapacity } from '../src/game/space-ecology';
import { applyEconomyOrder, colonyCapacity, colonyStock, economyQuote, spaceEconomy, type EconomyOrder } from '../src/game/space-economy';
import { economyCheckpointMatches } from '../src/game/space-economy-validation';
import { applyEmpireOrder, empireQuote, empireRelation, spaceSalePrice } from '../src/game/space-empires';
import type { EmpireId } from '../src/game/space-empires-types';
import { jumpToSystem } from '../src/game/space-expedition';
import { applyExpansionOrder, enableSpaceExpansion, expansionQuote } from '../src/game/space-expansion';
import { allyFormation, ownerAt, territoryTitle } from '../src/game/space-expansion-content';
import { buyShipEquipment, enableSpaceOutfit, equipmentQuote } from '../src/game/space-outfit';
import { shipCapabilities } from '../src/game/space-outfit-content';
import { buildShip, changeSpaceScale, launchShip } from '../src/game/space';
import { applyWarOrder, enableSpaceWars, warBattleProof, warQuote, type WarOrder } from '../src/game/space-war';
import { allySuspendedTime, warRelation, warStateAt } from '../src/game/space-war-content';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState, type Input } from '../src/game/types';

// Prepared UNIT continuations of immutable native exports, not native play proof.
// Beacon coordinates/ascent altitude are explicit navigation preconditions. All
// clocks, shots, victories, raids, payments, production and rescue below use
// public actions and ordinary 1/30-second simulation. No owner or receipt setter
// prepares a successful flow. Invalid clones are used only for refusal tests.
const fixture = (kind = 'campaign') => parseGame(readFileSync(`tests/fixtures/space/native-d3a-${kind}.save.json`, 'utf8'));
const enabled = () => { const s = fixture(); enableSpaceWars(s); return s; };
const wars = (s: GameState) => s.space!.wars!;
const account = (s: GameState) => spaceEconomy(s)!;
const battle = (s: GameState) => latestBattle(s.space!)!;
const empire = (s: GameState, id: EmpireId = 'roots') => s.space!.empires!.entries.find(e => e.id === id)!;
const ally = (s: GameState) => s.space!.expansion!.allies.find(a => a.empireId === 'resin')!;
const round = (s: GameState) => parseGame(serializeGame(s));
const order = (s: GameState, kind: WarOrder, id: EmpireId = 'roots') => applyWarOrder(s, kind, id, wars(s).nextAction);
const transact = (s: GameState, cmd: EconomyOrder) => applyEconomyOrder(s, cmd, account(s).nextAction);
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...home } = s; return structuredClone(home); };
const noNotice = (s: GameState) => { const copy = structuredClone(s); copy.space!.notice = ''; return copy; };
const frames = (s: GameState, seconds: number, input: Input = EMPTY_INPUT) => { for (let i = 0; i < Math.round(seconds * 30); i++) step(s, input, 1 / 30); };
const beacon = (s: GameState) => { s.space!.location!.pos = { x: 0, y: s.space!.location!.scale === 'surface' ? 3 : 0, z: 0 }; };
function until(s: GameState, done: () => boolean, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 30) && !done(); i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(done()).toBe(true);
}
function time(s: GameState, target: number) { until(s, () => account(s).elapsed >= target - 1e-7, Math.max(0, target - account(s).elapsed) + 1); }
function finish(s: GameState) { until(s, () => !s.space!.leg, 6.1); }
function recharge(s: GameState, energy = 30) { until(s, () => s.space!.ship!.energy >= energy, 30); }
function cool(s: GameState) { until(s, () => !battle(s)?.end || s.space!.elapsed >= battle(s).end!.at + 90 - 1e-7, 91); }
function orbit(s: GameState, index = 4) {
  const p = s.space!, systems = starSystems(p.homePlanetId); if (p.leg) finish(s);
  if (!p.location) expect(launchShip(s)).toBe(true);
  if (p.location!.scale === 'surface') { recharge(s); p.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  if (p.location!.scale === 'orbit' && p.location!.planetId === systems[index].planetId) { beacon(s); return; }
  if (p.location!.scale === 'orbit') { recharge(s); beacon(s); expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  let current = planetSystem(p.homePlanetId, p.location!.planetId)!.index;
  while (current !== index) { current += Math.sign(index - current); recharge(s); expect(jumpToSystem(s, systems[current].id)).toBe(true); finish(s); }
  beacon(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s);
}
function surface(s: GameState, index = 4) { orbit(s, index); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s); }
function home(s: GameState) { surface(s, 0); expect(changeSpaceScale(s, 'down')).toBe(true); expect(s.space!.location).toBeNull(); }
function win(s: GameState, kite = false) {
  for (let i = 0; i < 5; i++) {
    expect(fireSpacePulse(s)).toBe(true);
    if (i < 4) frames(s, 2 / 3, kite ? { ...EMPTY_INPUT, x: -PIRATE.speed / shipCapabilities(s.space!)!.speed } : EMPTY_INPUT);
  }
  expect(battle(s).end?.outcome).toBe('won');
}
function lose(s: GameState) { until(s, () => battle(s).end !== null, 60); expect(battle(s).end?.outcome).toBe('lost'); }
function invade(s: GameState) { orbit(s); cool(s); expect(order(s, 'invasion')).toBe(true); win(s); }
function captured() { const s = enabled(); expect(order(s, 'declare')).toBe(true); invade(s); return s; }
function founded() {
  const s = captured(); surface(s);
  until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 180);
  expect(transact(s, { kind: 'found' })).toBe(true); return s;
}
const rootColony = (s: GameState) => account(s).colonies.find(c => c.planetId === empire(s).capitalId)!;
function pending(s: GameState) {
  const target = warRelation(s.space!, 'roots')!.nextRaidAt!; time(s, target + 1 / 30);
  expect(wars(s).current.raid).not.toBeNull(); return wars(s).current.raid!;
}
function refuse(s: GameState, kind: WarOrder, id: EmpireId = 'roots', revision = wars(s).nextAction) {
  const before = noNotice(s); expect(warQuote(s, kind, id, revision).ok).toBe(false);
  expect(applyWarOrder(s, kind, id, revision)).toBe(false); expect(noNotice(s)).toEqual(before);
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
function rekey(s: GameState) {
  const copy = structuredClone(s); copy.id += '-war-import';
  if (copy.checkpoint) { const cp = JSON.parse(copy.checkpoint) as GameState; cp.id = copy.id; copy.checkpoint = JSON.stringify(cp); }
  return round(copy);
}
function bareShip() {
  // The actual old native checkpoint has zero colonies/account. Public ship
  // construction consumes its genuine amber; no prepared wealth is required.
  const s = recoverGeneration(fixture()); planetVehicle(s)!.pos = { ...machineHome(s) };
  expect(buildShip(s, newShipCreation(initialShip(), 'Unit war archive regression', 'war-regression', 100))).toBe(true);
  enableSpaceWars(s); expect(account(s).balance).toBe(0); expect(account(s).colonies).toEqual([]);
  surface(s, 1); expect(applyEmpireOrder(s, { kind: 'contact', empireId: 'resin' }, s.space!.empires!.nextAction)).toBe(true);
  orbit(s, 1); return s;
}
afterEach(() => vi.unstubAllGlobals());

describe('D3b independent historical activation and deliberate diplomacy', () => {
  it.each(['campaign', 'battle', 'wreck', 'rescue'])('opts in the actual %s export and old checkpoint without rewriting D3a evidence', kind => {
    const s = fixture(kind), before = structuredClone(s), cpBefore = JSON.parse(s.checkpoint!) as GameState;
    expect(s.space!.wars).toBeUndefined(); expect(account(s).version).toBe(4); expect(round(s)).toEqual(s);
    enableSpaceWars(s);
    expect(account(s)).toEqual({ ...account(before), version: 5 }); expect(s.space!.combat!.version).toBe(2);
    expect(s.space!.combat!.battles).toEqual(before.space!.combat!.battles);
    expect(s.space!.combat!.archive).toEqual({ ...before.space!.combat!.archive, ...Object.fromEntries(MILITARY_RESULTS.map(key => [key, 0])) });
    expect(wars(s).activated).toEqual({ cut: { at: before.space!.elapsed, tick: before.tick, travelAction: before.space!.nextSerial,
      lifeAction: before.space!.expedition!.nextAction, economyAction: account(before).nextAction }, economyAt: account(before).elapsed,
      nextCombatSerial: before.space!.combat!.archive.battles + before.space!.combat!.battles.length + 1 });
    expect(wars(s).actions).toEqual([]); expect(wars(s).nextAction).toBe(1); expect(wars(s).archive.through).toBe(0);
    expect(wars(s).current.territories).toEqual([]); expect(Object.values(wars(s).current.totals).every(n => n === 0)).toBe(true);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(wars(cp).activated).toMatchObject({ cut: { at: 0, tick: cpBefore.tick, travelAction: 1, lifeAction: 1, economyAction: 1 }, economyAt: 0, nextCombatSerial: 1 });
    expect(cp.space!.ship).toBeNull(); expect(account(cp).balance).toBe(0);
    for (const key of ['ship', 'expedition', 'empires', 'outfit', 'expansion'] as const) expect(s.space![key]).toEqual(before.space![key]);
    expect(domestic(s)).toEqual(domestic(before)); const once = structuredClone(s); enableSpaceWars(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
  });

  it('preserves opt-in on fresh no-checkpoint recovery without carrying declarations or military rights', () => {
    const s = captured(); s.checkpoint = null; const fresh = recoverGeneration(s);
    expect(fresh.stage).toBe(0); expect(fresh.space!.ship).toBeNull(); expect(account(fresh).version).toBe(5);
    expect(wars(fresh).actions).toEqual([]); expect(wars(fresh).current.territories).toEqual([]); expect(wars(fresh).activated.nextCombatSerial).toBe(1); expect(round(fresh)).toEqual(fresh);
  });

  it.each(['stale', 'unknown-kind', 'unknown-empire', 'uncontacted', 'dead'] as const)('refuses %s diplomacy atomically', kind => {
    const s = enabled(); let cmd: WarOrder = 'declare', id: EmpireId = 'roots', revision = wars(s).nextAction;
    // Invalid refusal-only inputs are not claimed as a valid historical save.
    if (kind === 'stale') revision++;
    if (kind === 'unknown-kind') cmd = '__proto__' as WarOrder;
    if (kind === 'unknown-empire') id = '__proto__' as EmpireId;
    if (kind === 'uncontacted') empire(s).contact = null;
    if (kind === 'dead') s.space!.ship!.health = 0;
    refuse(s, cmd, id, revision);
  });

  it('requires home or orbit, rejects concurrent wars and combat-time orders, and keeps the 60/180 waits global', () => {
    const s = enabled(); expect(launchShip(s)).toBe(true); refuse(s, 'declare');
    s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); refuse(s, 'declare'); finish(s);
    expect(order(s, 'declare')).toBe(true); const begun = account(s).elapsed; refuse(s, 'declare', 'basalt'); refuse(s, 'peace');
    time(s, begun + 59); refuse(s, 'peace'); time(s, begun + 60); expect(order(s, 'peace')).toBe(true);
    const peace = account(s).elapsed, money = account(s).balance;
    refuse(s, 'declare'); refuse(s, 'declare', 'basalt'); time(s, peace + 179); refuse(s, 'declare', 'basalt');
    time(s, peace + 180); expect(order(s, 'declare', 'basalt')).toBe(true); expect(account(s).balance).toBe(money);
    expect(wars(s).current.totals).toMatchObject({ declarations: 2, peaces: 1, invasions: 0 }); expect(round(s)).toEqual(s);
  });
});

describe('D3b actual military ownership, paid production and recovery of the same colony', () => {
  it('runs invasion, forty-unit founding, production, defense, expiration in flight, recapture, peace and a real home sale', () => {
    const s = founded(), p = s.space!, colony = rootColony(s), capital = empire(s).capitalId;
    const original = fixture(), originalReceipts = structuredClone(account(original).actions), originalColonyCount = account(original).colonies.length;
    expect(ownerAt(p, capital)).toBe('player'); expect(account(s).balance).toBe(62);
    expect(colony).toMatchObject({ id: `${capital}:colony`, paid: 40, level: 1, militaryPermission: { foundingSerial: 32 } });
    expect(colony.permission).toBeUndefined(); expect(colony.militaryPermission!.claim.battle).toEqual(warBattleProof(battle(s)));
    const permission = structuredClone(colony.militaryPermission), id = colony.id;
    const foundReceipt = account(s).actions.at(-1)!; expect(foundReceipt).toMatchObject({ kind: 'found', paid: 40, warAction: 4, balanceBefore: 102, balanceAfter: 62 });
    until(s, () => colonyStock(colony) > 0, 180); expect(transact(s, { kind: 'load' })).toBe(true);
    const cargo = structuredClone(account(s).cargo), amount = cargo[0].amount; expect(amount).toBeGreaterThan(0);
    expect(economyQuote(s, { kind: 'sell', originPlanetId: capital }, account(s).nextAction).reason).toContain('války');
    expect(expansionQuote(s, 'alliance', 'roots', account(s).nextAction).ok).toBe(false);
    expect(empireQuote(s, { kind: 'treaty', empireId: 'roots' }, p.empires!.nextAction).ok).toBe(false);
    orbit(s); const first = pending(s); expect(first.planetId).toBe(capital); cool(s);
    expect(order(s, 'defense')).toBe(true); const health = p.ship!.health; win(s); expect(p.ship!.health).toBe(health - 8);
    expect(ownerAt(p, capital)).toBe('player'); expect(wars(s).current.raid).toBeNull(); expect(round(s)).toEqual(s);
    const next = pending(s); expect(next.planetId).toBe(capital); time(s, next.deadline - 1);
    beacon(s); expect(changeSpaceScale(s, 'up')).toBe(true); makeCheckpoint(s);
    const flightEnergy = p.ship!.energy, escort = structuredClone(ally(s)), homeBefore = domestic(s), beforeLost = structuredClone(colony), nextEconomic = account(s).nextAction;
    frames(s, 1.5); expect(p.leg).not.toBeNull(); expect(ownerAt(p, capital)).toBe('roots');
    expect(wars(s).current.totals).toMatchObject({ raids: 2, defenses: 1, defenseVictories: 1, expired: 1 });
    expect(p.ship!.energy).toBe(flightEnergy); expect(ally(s)).toEqual(escort); expect(account(s).nextAction).toBe(nextEconomic);
    expect(domestic(s)).toEqual(homeBefore); expect(round(s)).toEqual(s); finish(s);
    surface(s); const occupied = structuredClone(colony); expect(colonyCapacity(s, colony)).toBe(0);
    for (const kind of ['load', 'upgrade', 'repair', 'charge'] as const) {
      const before = noNotice(s); expect(economyQuote(s, { kind }, account(s).nextAction).reason).toContain('obsadila');
      expect(transact(s, { kind })).toBe(false); expect(noNotice(s)).toEqual(before);
    }
    frames(s, 12); expect(colony).toEqual(occupied); expect(colony.loaded).toBe(beforeLost.loaded); expect(account(s).cargo).toEqual(cargo);
    invade(s); expect(ownerAt(p, capital)).toBe('player'); expect(rootColony(s)).toBe(colony); expect(colony.id).toBe(id);
    expect(colony.militaryPermission).toEqual(permission); expect(account(s).colonies).toHaveLength(originalColonyCount + 1); expect(account(s).balance).toBe(62);
    surface(s); expect(transact(s, { kind: 'found' })).toBe(false); expect(transact(s, { kind: 'repair' })).toBe(true);
    expect(account(s).balance).toBe(57); orbit(s); expect(order(s, 'peace')).toBe(true); expect(ownerAt(p, capital)).toBe('player');
    home(s); const offer = economyQuote(s, { kind: 'sell', originPlanetId: capital }, account(s).nextAction);
    expect(offer.ok).toBe(true); expect(offer.amount).toBe(amount); expect(transact(s, { kind: 'sell', originPlanetId: capital })).toBe(true);
    expect(account(s).balance).toBe(57 + amount * offer.price); expect(account(s).cargo).toEqual([]);
    expect(account(s).actions.slice(0, originalReceipts.length)).toEqual(originalReceipts);
    expect(p.empires).toEqual(original.space!.empires); expect(p.outfit).toEqual(original.space!.outfit);
    expect(s.lineageHistory).toEqual(original.lineageHistory); expect(s.civilization).toEqual(original.civilization); expect(round(s)).toEqual(s);
  });

  it.each(['retreated', 'lost'] as const)('an actual %s invasion grants no territory and keeps its result immutable through rescue or arrival', outcome => {
    const s = enabled(); expect(order(s, 'declare')).toBe(true); orbit(s); cool(s); expect(order(s, 'invasion')).toBe(true);
    refuse(s, 'peace'); refuse(s, 'invasion');
    if (outcome === 'retreated') { expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); }
    else lose(s);
    const proof = warBattleProof(battle(s)), result = structuredClone(wars(s).actions.find(a => a.kind === 'result'));
    expect(proof.outcome).toBe(outcome); expect(Object.hasOwn(proof, 'rescue')).toBe(false);
    expect(ownerAt(s.space!, empire(s).capitalId)).toBe('roots'); expect(wars(s).current.territories).toEqual([]);
    if (outcome === 'lost') { expect(rescueShip(s)).toBe(true); frames(s, 12); expect(s.space!.ship!.health).toBe(25); }
    expect(warBattleProof(battle(s))).toEqual(proof); expect(wars(s).actions.find(a => a.kind === 'result')).toEqual(result); expect(round(s)).toEqual(s);
  });

  it.each(['retreated', 'lost'] as const)('an actual %s defense transfers ownership but keeps paid buildings, stock and military permission', outcome => {
    const s = founded(); orbit(s); pending(s); cool(s); expect(order(s, 'defense')).toBe(true);
    const id = empire(s).capitalId, colony = structuredClone(rootColony(s)), money = account(s).balance;
    if (outcome === 'retreated') expect(changeSpaceScale(s, 'down')).toBe(true); else lose(s);
    expect(ownerAt(s.space!, id)).toBe('roots'); expect(wars(s).current.raid).toBeNull(); expect(rootColony(s).militaryPermission).toEqual(colony.militaryPermission);
    expect(rootColony(s).loaded).toBe(colony.loaded); expect(rootColony(s).paid).toBe(40); expect(account(s).balance).toBe(money);
    const frozen = structuredClone(rootColony(s)); if (outcome === 'retreated') finish(s); else { expect(rescueShip(s)).toBe(true); frames(s, 12); }
    frames(s, 10); expect(rootColony(s)).toEqual(frozen); expect(round(s)).toEqual(s);
  });

  it('a defense started before the deadline finishes physically, while paused time never expires a colony', () => {
    const s = founded(); orbit(s); const raid = pending(s); time(s, raid.deadline - 1);
    const clock = new FixedStepClock(), paused = structuredClone(s); clock.advance(0); expect(clock.advance(3600000, false)).toBe(0); expect(s).toEqual(paused);
    expect(order(s, 'defense')).toBe(true); frames(s, 1.2);
    expect(account(s).elapsed).toBeGreaterThan(raid.deadline); expect(wars(s).current.raid?.serial).toBe(raid.serial);
    expect(wars(s).current.totals.expired).toBe(0); expect(battle(s).end).toBeNull(); expect(round(s)).toEqual(s);
    win(s); expect(ownerAt(s.space!, raid.planetId)).toBe('player'); expect(wars(s).current.raid).toBeNull(); expect(round(s)).toEqual(s);
  });

  it('peace cancels an announced raid without returning earlier lost territory or altering either clock on import', () => {
    const s = founded(); orbit(s); const first = pending(s); time(s, first.deadline + 1 / 30);
    expect(ownerAt(s.space!, first.planetId)).toBe('roots'); const next = pending(s); expect(next.planetId).not.toBe(first.planetId);
    const clock = account(s).elapsed, before = structuredClone(rootColony(s)); expect(order(s, 'peace')).toBe(true);
    expect(wars(s).current.totals).toMatchObject({ expired: 1, cancelled: 1, peaces: 1 }); expect(wars(s).current.raid).toBeNull();
    expect(rootColony(s)).toEqual(before); expect(ownerAt(s.space!, first.planetId)).toBe('roots'); expect(round(s)).toEqual(s); expect(account(s).elapsed).toBe(clock);
    frames(s, 181); expect(wars(s).current.raid).toBeNull(); expect(wars(s).current.totals.raids).toBe(2); expect(round(s)).toEqual(s);
  });
});

describe('D3b paid escort suspension, services and preserved trade basis', () => {
  it('suspends the existing partial battery across import, CP and travel; peace resumes that same paid escort', () => {
    let s = enabled(); orbit(s, 1);
    const p = s.space!, money = account(s).balance, prices = spaceSalePrice(s, empire(s, 'resin').capitalId, 'moon-salt'), relation = empireRelation(s, empire(s, 'resin'));
    const before = structuredClone(ally(s)); expect(order(s, 'declare', 'resin')).toBe(true); expect(ally(s)).toEqual({ ...before, location: null });
    expect(empireRelation(s, empire(s, 'resin'))).toBe(relation - 40); expect(spaceSalePrice(s, empire(s, 'resin').capitalId, 'moon-salt')).toEqual(prices);
    expect(warRelation(p, 'resin')!.declaration!.escort).toEqual({ energy: before.energy, generated: before.generated, delivered: before.delivered });
    makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, frozen = structuredClone(ally(s));
    expect(changeSpaceScale(s, 'up')).toBe(true); frames(s, 1); expect(ally(s)).toEqual(frozen); expect(round(s)).toEqual(s); finish(s);
    expect(ally(s)).toEqual(frozen); s = rekey(s); orbit(s, 1); time(s, warRelation(s.space!, 'resin')!.declaration!.economyAt + 60);
    expect(ally(s)).toEqual(frozen); const elapsed = s.space!.elapsed - warRelation(s.space!, 'resin')!.declaration!.cut.at;
    expect(allySuspendedTime(s.space!, 'resin')).toBeCloseTo(elapsed, 9); expect(order(s, 'peace', 'resin')).toBe(true);
    expect(ally(s)).toEqual({ ...frozen, location: allyFormation(s.space!.location!, 'resin') });
    expect(warRelation(s.space!, 'resin')!.suspendedSeconds).toBeCloseTo(elapsed, 9); expect(empireRelation(s, empire(s, 'resin'))).toBe(relation - 10);
    expect(account(s).balance).toBe(money); expect(spaceSalePrice(s, empire(s, 'resin').capitalId, 'moon-salt')).toEqual(prices); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(wars(restored)).toEqual(wars(cp)); expect(ally(restored)).toEqual(ally(cp)); expect(round(restored)).toEqual(restored);
    const generated = ally(s).generated; frames(s, 1); expect(ally(s).generated).toBeGreaterThanOrEqual(generated); expect(ally(s).energy).toBeLessThanOrEqual(12); expect(round(s)).toEqual(s);
    const local = new Map<string, string>(); vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
  });

  it('an occupied real D1 colony cannot install an unpurchased unlocked module; recapture restores the facility without rebuilding', () => {
    // Earlier exact native D1 has all real badges but no modules, unlike D3a.
    // This avoids masking the ownership refusal with the duplicate-module guard.
    const s = parseGame(readFileSync('tests/fixtures/space/native-d1-campaign.save.json', 'utf8'));
    enableSpaceOutfit(s); enableSpaceExpansion(s); enableSpaceCombat(s); enableSpaceWars(s);
    expect(order(s, 'declare')).toBe(true); orbit(s, 3); const raid = pending(s); expect(raid.planetId).toBe(starSystems(s.space!.homePlanetId)[3].planetId);
    time(s, raid.deadline + 1 / 30); surface(s, 3);
    expect(equipmentQuote(s, 'hold', account(s).nextAction).reason).toContain('vlastní kolonie');
    const before = noNotice(s); expect(buyShipEquipment(s, 'hold', account(s).nextAction)).toBe(false); expect(noNotice(s)).toEqual(before);
    orbit(s, 3); expect(order(s, 'invasion')).toBe(true); win(s); surface(s, 3);
    expect(equipmentQuote(s, 'hold', account(s).nextAction).ok).toBe(true); const balance = account(s).balance;
    expect(buyShipEquipment(s, 'hold', account(s).nextAction)).toBe(true); expect(account(s).balance).toBe(balance - 80);
    expect(s.space!.outfit!.purchases.at(-1)).toMatchObject({ equipment: 'hold', paid: 80, warAction: wars(s).nextAction });
    expect(account(s).colonies).toHaveLength(2); expect(round(s)).toEqual(s);
  });

  it('a later paid title overrides a military loss with ordered economic and war cuts, retaining the original military founding', () => {
    const s = founded(); orbit(s); const raid = pending(s); time(s, raid.deadline + 1 / 30); expect(order(s, 'peace')).toBe(true);
    const colony = rootColony(s), permission = structuredClone(colony.militaryPermission); home(s);
    // Explicit prepared domestic treasury for this isolated purchase-order test;
    // each subsequent deposit really removes twenty and creates its paid receipt.
    s.machines!.resource = 100; makeCheckpoint(s);
    for (let i = 0; i < 3; i++) expect(transact(s, { kind: 'deposit' })).toBe(true);
    expect(account(s).balance).toBe(122); surface(s); const economic = account(s).nextAction, war = wars(s).nextAction;
    expect(applyExpansionOrder(s, 'territory', 'roots', economic)).toBe(true); expect(account(s).balance).toBe(2);
    expect(account(s).actions.at(-1)).toMatchObject({ kind: 'territory', serial: economic, warAction: war, paid: 120 });
    expect(wars(s).actions.at(-1)).toMatchObject({ kind: 'purchase', serial: war, paymentSerial: economic, cut: { economyAction: economic + 1 } });
    expect(ownerAt(s.space!, colony.planetId)).toBe('player'); expect(territoryTitle(s.space!, colony.planetId)).not.toBeNull();
    expect(rootColony(s).militaryPermission).toEqual(permission); expect(rootColony(s).permission).toBeUndefined();
    expect(applyExpansionOrder(s, 'territory', 'roots', account(s).nextAction)).toBe(false); expect(transact(s, { kind: 'found' })).toBe(false); expect(round(s)).toEqual(s);
  });
});

describe('D3b historical payment cuts and bounded political evidence', () => {
  it('keeps an announced raid on its original target when a closer military colony is founded later in the same frame', () => {
    const s = captured(); surface(s);
    expect(stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!)).toBeGreaterThan(0);
    until(s, () => wars(s).current.raid !== null, 100);
    const raid = structuredClone(wars(s).current.raid!), originalTarget = raid.planetId;
    expect(originalTarget).not.toBe(empire(s).capitalId); expect(account(s).elapsed).toBe(raid.economyAt);
    expect(transact(s, { kind: 'found' })).toBe(true);
    expect(rootColony(s).foundedAt).toBe(raid.economyAt);
    expect(rootColony(s).militaryPermission!.foundingSerial).toBe(raid.cut.economyAction);
    expect(wars(s).current.raid).toEqual(raid); expect(round(s)).toEqual(s);
  });

  it('preserves an older raid after a same-frame neutral founding receipt rolls out of the economic tail', () => {
    const s = enabled();
    // Explicit initial unit treasury, not earned-wealth proof. Every one of the
    // later 128 deposits consumes twenty through the real public payment API.
    s.machines!.resource = 3000; makeCheckpoint(s);
    surface(s, 10); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 180);
    orbit(s, 10); expect(order(s, 'declare', 'basalt')).toBe(true); surface(s, 10);
    until(s, () => wars(s).current.raid !== null, 100);
    const raid = structuredClone(wars(s).current.raid!), target = s.space!.location!.planetId;
    const capital = planetSystem(s.space!.homePlanetId, empire(s, 'basalt').capitalId)!;
    expect(ownerAt(s.space!, target)).toBeNull(); expect(account(s).elapsed).toBe(raid.economyAt);
    expect(systemDistance(capital, planetSystem(s.space!.homePlanetId, target)!)).toBeLessThan(systemDistance(capital, planetSystem(s.space!.homePlanetId, raid.planetId)!));
    expect(transact(s, { kind: 'found' })).toBe(true);
    const colony = account(s).colonies.find(c => c.planetId === target)!, foundSerial = account(s).nextAction - 1;
    expect(colony.foundedAt).toBe(raid.economyAt); expect(colony.permission).toBeUndefined(); expect(colony.militaryPermission).toBeUndefined();
    expect(round(s)).toEqual(s); home(s);
    const amber = s.machines!.resource;
    for (let i = 0; i < 128; i++) expect(transact(s, { kind: 'deposit' })).toBe(true);
    expect(s.machines!.resource).toBeCloseTo(amber - 2560, 8); expect(account(s).actions.some(row => row.serial === foundSerial)).toBe(false);
    expect(wars(s).actions.find(row => row.serial === raid.serial)).toMatchObject({ kind: 'raid', planetId: raid.planetId, economyAt: colony.foundedAt });
    expect(round(s)).toEqual(s);
  });

  it('does not teleport or refill an unrelated escort when declaring war or peace and cannot use that revision to bypass a CP speed bound', () => {
    const s = enabled(); orbit(s, 1); frames(s, .2, { ...EMPTY_INPUT, x: 1, sprint: true });
    expect(ally(s).location).not.toEqual(allyFormation(s.space!.location!, 'resin'));
    makeCheckpoint(s); const beforeWar = structuredClone(ally(s)); expect(order(s, 'declare')).toBe(true);
    expect(ally(s)).toEqual(beforeWar); expect(round(s)).toEqual(s);
    const forged = structuredClone(s); ally(forged).location!.pos.x += 5; reject(forged);
    time(s, warRelation(s.space!, 'roots')!.declaration!.economyAt + 60);
    frames(s, .2, { ...EMPTY_INPUT, x: -1, sprint: true }); expect(ally(s).location).not.toEqual(allyFormation(s.space!.location!, 'resin'));
    makeCheckpoint(s); const beforePeace = structuredClone(ally(s)); expect(order(s, 'peace')).toBe(true);
    expect(ally(s)).toEqual(beforePeace); expect(round(s)).toEqual(s);
  });

  it('rejects production invented during a known occupied checkpoint interval and accepts production after actual recapture', () => {
    const s = founded(); until(s, () => colonyStock(rootColony(s)) === 8, 180);
    expect(transact(s, { kind: 'load' })).toBe(true); orbit(s); pending(s); cool(s);
    expect(order(s, 'defense')).toBe(true); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s);
    expect(ownerAt(s.space!, empire(s).capitalId)).toBe('roots'); expect(colonyStock(rootColony(s))).toBeLessThan(8);
    makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, frozen = structuredClone(rootColony(s)); frames(s, 10);
    expect(rootColony(s)).toEqual(frozen); expect(round(s)).toEqual(s);
    const poison = structuredClone(s); rootColony(poison).productiveElapsed += 10; rootColony(poison).produced++;
    expect(economyCheckpointMatches(poison, cp)).toBe(false); reject(poison);
    invade(s); surface(s); const afterReturn = structuredClone(rootColony(s));
    until(s, () => rootColony(s).produced > afterReturn.produced, 180);
    expect(rootColony(s).militaryPermission).toEqual(frozen.militaryPermission); expect(economyCheckpointMatches(s, cp)).toBe(true); expect(round(s)).toEqual(s);
  });

  it('archives all six military outcomes through forty real encounters while preserving the paid founding proof and original checkpoint', () => {
    const s = enabled(); expect(order(s, 'declare')).toBe(true); orbit(s); cool(s);
    expect(order(s, 'invasion')).toBe(true); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); // 1: invasion retreat
    orbit(s); cool(s); expect(order(s, 'invasion')).toBe(true); lose(s); // 2: invasion loss
    expect(rescueShip(s)).toBe(true); frames(s, 12); cool(s); beacon(s);
    expect(order(s, 'invasion')).toBe(true); win(s, true); // 3: invasion victory
    surface(s); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 180);
    expect(transact(s, { kind: 'found' })).toBe(true); orbit(s); makeCheckpoint(s);
    const cp = s.checkpoint, permission = structuredClone(rootColony(s).militaryPermission), paid = account(s).balance;
    // An earlier raid may still target the old star-3 colony. Let its real
    // deadline pass; the next actual target is the newly paid root colony.
    if (wars(s).current.raid && wars(s).current.raid!.planetId !== empire(s).capitalId) time(s, wars(s).current.raid!.deadline + 1 / 30);
    pending(s); cool(s); beacon(s); expect(order(s, 'defense')).toBe(true);
    expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); // 4: defense retreat
    orbit(s); cool(s); expect(order(s, 'invasion')).toBe(true); win(s, true); // 5: recapture
    pending(s); cool(s); beacon(s); expect(order(s, 'defense')).toBe(true); lose(s); // 6: defense loss
    expect(rescueShip(s)).toBe(true); frames(s, 12); cool(s); beacon(s);
    expect(order(s, 'invasion')).toBe(true); win(s, true); // 7: recapture
    for (let i = 0; i < 33; i++) {
      pending(s); cool(s); beacon(s); expect(order(s, 'defense')).toBe(true); win(s, true); // 8–40: defense victories
    }
    const combat = s.space!.combat!;
    expect(combat.battles).toHaveLength(32); expect(combat.archive.battles).toBe(11); // three historical pirates + forty military
    expect(combat.battles.every(row => row.kind === 'defense' && row.end?.outcome === 'won')).toBe(true);
    expect(combat.archive).toMatchObject({ invasionVictories: 3, invasionRetreats: 1, invasionDefeats: 1, defenseVictories: 1, defenseRetreats: 1, defenseDefeats: 1 });
    expect(wars(s).current.totals).toMatchObject({ invasions: 5, defenses: 35, invasionVictories: 3, invasionRetreats: 1, invasionDefeats: 1, defenseVictories: 33, defenseRetreats: 1, defenseDefeats: 1 });
    expect(permission!.claim.battle.battleSerial).toBeLessThanOrEqual(combat.archive.battles);
    expect(combat.battles.some(row => row.serial === permission!.claim.battle.battleSerial)).toBe(false);
    expect(rootColony(s).militaryPermission).toEqual(permission); expect(account(s).balance).toBe(paid);
    expect(s.space!.ship!.health).toBe(25); expect(s.checkpoint).toBe(cp);
    const nextRaid = warRelation(s.space!, 'roots')!.nextRaidAt!;
    // End-of-combat and economy clocks use equivalent floating-point sums.
    // Their measured 1.82e-12 difference must not invalidate the actual save.
    expect(nextRaid - account(s).elapsed).toBeCloseTo(180, 8);
    expect(round(s)).toEqual(s);
    const delayed = structuredClone(s); warRelation(delayed.space!, 'roots')!.nextRaidAt! += .001; reject(delayed);
    for (const key of MILITARY_RESULTS) { const bad = structuredClone(s); bad.space!.combat!.archive[key]!++; reject(bad); }
    const changed = structuredClone(s); rootColony(changed).militaryPermission!.claim.battle.shots++;
    const retained = wars(changed).actions.find(row => row.kind === 'result' && row.battle.battleSerial === permission!.claim.battle.battleSerial);
    if (retained?.kind === 'result') retained.battle.shots++;
    reject(changed); const restored = recoverGeneration(round(s));
    expect(wars(restored)).toEqual((JSON.parse(cp!) as GameState).space!.wars); expect(rootColony(restored).militaryPermission).toEqual(permission); expect(round(restored)).toEqual(restored);
  // Forty real encounters plus all six archived-proof mutations and CP parses
  // measured 5.33s; this new sustained case alone has an explicit 15s budget.
  }, 15000);

  it('requires new warAction fields while keeping every original D3a economic, outfit and expansion receipt byte-shape intact', () => {
    const s = enabled(), old = structuredClone(account(s).actions); expect(transact(s, { kind: 'deposit' })).toBe(true);
    expect(account(s).actions.slice(0, old.length)).toEqual(old); expect(account(s).actions.at(-1)).toMatchObject({ kind: 'deposit', paid: 20, warAction: 1 });
    expect(round(s)).toEqual(s);
    for (const change of ['missing', 'future', 'past-on-old'] as const) {
      const bad = structuredClone(s);
      if (change === 'missing') delete account(bad).actions.at(-1)!.warAction;
      else if (change === 'future') account(bad).actions.at(-1)!.warAction = wars(bad).nextAction + 1;
      else account(bad).actions[0].warAction = 1;
      reject(bad);
    }
  });

  it('rejects forged military receipts and a second planet claimed from the same actual battle', () => {
    const s = founded(); expect(round(s)).toEqual(s);
    for (const change of ['shots', 'battle-id', 'wrong-kind', 'unpaid', 'second-world'] as const) {
      const bad = structuredClone(s), permission = rootColony(bad).militaryPermission!;
      if (change === 'shots') permission.claim.battle.shots++;
      else if (change === 'battle-id') permission.claim.battle.battleSerial = 1;
      else if (change === 'wrong-kind') permission.claim.battle.kind = 'defense';
      else if (change === 'unpaid') permission.foundingSerial--;
      else {
        const claim = structuredClone(wars(bad).current.territories[0]); claim.planetId = empire(bad, 'basalt').capitalId;
        if (claim.change.kind === 'result') claim.change.battle.planetId = claim.planetId;
        wars(bad).current.territories.push(claim); wars(bad).current.territories.sort((a, b) => a.planetId.localeCompare(b.planetId));
      }
      reject(bad);
    }
  });

  it('keeps closed result prefixes and active escort counters immutable relative to a real full checkpoint', () => {
    const s = captured(); makeCheckpoint(s); frames(s, 1); expect(round(s)).toEqual(s);
    const wrongTime = structuredClone(s), result = wars(wrongTime).actions.find(a => a.kind === 'result')!;
    result.cut.tick--; reject(wrongTime);
    const wrongArchive = structuredClone(s); wrongArchive.space!.combat!.archive.invasionVictories!++; reject(wrongArchive);
    const suspended = enabled(); orbit(suspended, 1); expect(order(suspended, 'declare', 'resin')).toBe(true); makeCheckpoint(suspended); frames(suspended, 1);
    const forged = structuredClone(suspended); ally(forged).generated += 1; ally(forged).energy += 1;
    warRelation(forged.space!, 'resin')!.declaration!.escort!.generated += 1; warRelation(forged.space!, 'resin')!.declaration!.escort!.energy += 1;
    const declaration = wars(forged).actions[0]; if (declaration.kind === 'declare') { declaration.escort!.generated += 1; declaration.escort!.energy += 1; }
    reject(forged); expect(round(suspended)).toEqual(suspended);
  });

  it('rolls more than 128 actual diplomacy actions into a bounded archive and protects a known checkpoint bridge', () => {
    const s = bareShip();
    for (let i = 0; i < 65; i++) {
      if (i > 0) time(s, warRelation(s.space!, 'resin')!.peace!.economyAt + 180);
      expect(order(s, 'declare', 'resin')).toBe(true); time(s, warRelation(s.space!, 'resin')!.declaration!.economyAt + 60);
      expect(order(s, 'peace', 'resin')).toBe(true); if (i === 63) makeCheckpoint(s);
    }
    expect(wars(s).nextAction).toBe(131); expect(wars(s).actions).toHaveLength(128); expect(wars(s).archive.through).toBe(2);
    expect(wars(s).archive.state.totals).toMatchObject({ declarations: 1, peaces: 1, raids: 0 });
    expect(wars(s).current.totals).toMatchObject({ declarations: 65, peaces: 65, invasions: 0, raids: 0 });
    expect(warStateAt(s.space!, 2)).toBeNull(); expect(warStateAt(s.space!, 3)).toEqual(wars(s).archive.state);
    expect(warRelation(s.space!, 'resin')!.suspendedSeconds).toBe(0); expect(account(s).balance).toBe(0); expect(round(s)).toEqual(s);
    const bad = structuredClone(s); wars(bad).archive.stamp.cut.tick++; reject(bad);
    const count = structuredClone(s); wars(count).archive.state.totals.cancelled++; reject(count);
    const prefix = structuredClone(s), historical = wars(prefix).actions[0]; historical.cut.at += .25; reject(prefix);
    const restored = recoverGeneration(round(s)); expect(wars(restored).nextAction).toBe(129); expect(round(restored)).toEqual(restored);
  });
});
