import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { planetSystem, starSystems } from '../src/game/galaxy';
import { FixedStepClock } from '../src/game/input-clock';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import type { LivingSpecimen } from '../src/game/space-biosphere-types';
import { roleOf, stableBandCapacity } from '../src/game/space-ecology';
import { fireSpacePulse, investigatePirates, rescueShip } from '../src/game/space-combat';
import { activeSpaceBattle, latestBattle, PIRATE } from '../src/game/space-combat-content';
import { applyEconomyOrder, colonyCapacity, colonyStock, economyQuote, spaceEconomy, type EconomyOrder } from '../src/game/space-economy';
import { economyCheckpointMatches } from '../src/game/space-economy-validation';
import { enableSpaceEvents, eventBattleProof, resumeColony, resumeColonyQuote } from '../src/game/space-events';
import { eventStateAt, quarantineAt } from '../src/game/space-events-content';
import { eventsCheckpointMatches } from '../src/game/space-events-validation';
import { jumpToSystem, useSpecimenTool } from '../src/game/space-expedition';
import { ownerAt } from '../src/game/space-expansion-content';
import { shipCapabilities } from '../src/game/space-outfit-content';
import { changeSpaceScale, launchShip } from '../src/game/space';
import { applyWarOrder, enableSpaceWars } from '../src/game/space-war';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState, type Input } from '../src/game/types';

// Prepared UNIT continuations of immutable native D3a exports, not a native
// reachability claim. Beacon/ascent/scanner positions are explicit preconditions.
// Ecology changes only through real paid scan/collect/release and ordinary
// simulation: no life, stability, incident, combat result or clock is invented.
const fixture = (kind = 'campaign') => parseGame(readFileSync(`tests/fixtures/space/native-d3a-${kind}.save.json`, 'utf8'));
const enabled = () => { const s = fixture(); enableSpaceWars(s); enableSpaceEvents(s); return s; };
const events = (s: GameState) => s.space!.events!;
const account = (s: GameState) => spaceEconomy(s)!;
const battle = (s: GameState) => latestBattle(s.space!)!;
const colony = (s: GameState, index = 1) => account(s).colonies.find(c => c.planetId === starSystems(s.space!.homePlanetId)[index].planetId)!;
const watch = (s: GameState, index = 1) => events(s).watches.find(w => w.planetId === colony(s, index).planetId)!;
const quarantine = (s: GameState, index = 1) => quarantineAt(events(s).current, colony(s, index).planetId);
const round = (s: GameState) => parseGame(serializeGame(s));
const transact = (s: GameState, cmd: EconomyOrder) => applyEconomyOrder(s, cmd, account(s).nextAction);
const resume = (s: GameState, index = 1) => resumeColony(s, colony(s, index).planetId, events(s).nextAction);
const noNotice = (s: GameState) => { const copy = structuredClone(s); copy.space!.notice = ''; return copy; };
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...home } = s; return structuredClone(home); };
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
function orbit(s: GameState, index = 1) {
  const p = s.space!, systems = starSystems(p.homePlanetId); if (p.leg) finish(s);
  if (!p.location) expect(launchShip(s)).toBe(true);
  if (p.location!.scale === 'surface') { recharge(s); p.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  if (p.location!.scale === 'orbit' && p.location!.planetId === systems[index].planetId) { beacon(s); return; }
  if (p.location!.scale === 'orbit') { recharge(s); beacon(s); expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  let current = planetSystem(p.homePlanetId, p.location!.planetId)!.index;
  while (current !== index) { current += Math.sign(index - current); recharge(s); expect(jumpToSystem(s, systems[current].id)).toBe(true); finish(s); }
  beacon(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s);
}
function surface(s: GameState, index = 1) { orbit(s, index); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s); }
function home(s: GameState) { surface(s, 0); expect(changeSpaceScale(s, 'down')).toBe(true); }
function win(s: GameState, kite = false) {
  for (let i = 0; i < 5; i++) {
    expect(fireSpacePulse(s)).toBe(true);
    if (i < 4) frames(s, 2 / 3, kite ? { ...EMPTY_INPUT, x: -PIRATE.speed / shipCapabilities(s.space!)!.speed } : EMPTY_INPUT);
  }
  expect(battle(s).end?.outcome).toBe('won');
}
function source(index = 1, damaged = false) {
  const s = enabled();
  if (damaged) { orbit(s, index); cool(s); expect(investigatePirates(s, s.space!.combat!.archive.battles + s.space!.combat!.battles.length + 1)).toBe(true); win(s); }
  surface(s, index); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 180); frames(s, 1 / 30);
  expect(watch(s, index).armedAt).not.toBeNull(); return s;
}
function removePlants(s: GameState): LivingSpecimen[] {
  const plants = livingPlanet(s)!.life.filter(life => life.habitat.band === 1 && roleOf(life) === 0).map(life => structuredClone(life));
  expect(plants.length).toBeGreaterThan(0);
  for (const plant of plants) {
    s.space!.location!.pos = { x: plant.pos.x, y: 3, z: plant.pos.z };
    expect(useSpecimenTool(s, 'scan', plant.id)).toBe(true); expect(useSpecimenTool(s, 'collect', plant.id)).toBe(true);
  }
  beacon(s); expect(stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!)).toBe(0); return plants;
}
function restorePlants(s: GameState, plants: LivingSpecimen[]) {
  for (const plant of plants) {
    s.space!.location!.pos = { x: plant.pos.x, y: 3, z: plant.pos.z };
    expect(useSpecimenTool(s, 'release', plant.id, 1)).toBe(true);
  }
  beacon(s);
}
function crisis(index = 1, damaged = false) {
  const s = source(index, damaged), plants = removePlants(s); frames(s, 12);
  expect(quarantine(s, index)).not.toBeNull(); return { s, plants };
}
function cargoReady(index = 1, waitForCombat = true) {
  const s = source(index); if (waitForCombat) cool(s);
  expect(transact(s, { kind: 'load' })).toBe(true); expect(events(s).candidate).not.toBeNull(); return s;
}
function pirate() {
  const s = cargoReady(); orbit(s, 2); expect(events(s).current.pirate).toBeNull();
  step(s, EMPTY_INPUT, 1 / 30); expect(events(s).current.pirate).not.toBeNull(); return s;
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
function refuseResume(s: GameState, index = 1, revision = events(s).nextAction) {
  const before = noNotice(s); expect(resumeColonyQuote(s, colony(s, index).planetId, revision).ok).toBe(false);
  expect(resumeColony(s, colony(s, index).planetId, revision)).toBe(false); expect(noNotice(s)).toEqual(before);
}
function rekey(s: GameState) {
  const copy = structuredClone(s); copy.id += '-events-import';
  if (copy.checkpoint) { const cp = JSON.parse(copy.checkpoint) as GameState; cp.id = copy.id; copy.checkpoint = JSON.stringify(cp); }
  return round(copy);
}
afterEach(() => vi.unstubAllGlobals());

describe('D3c explicit historical activation and local ecological observation', () => {
  it.each(['campaign', 'battle', 'wreck', 'rescue'])('activates the exact %s history and its older checkpoint independently without retroactive events', kind => {
    const s = fixture(kind); expect(s.space!.events).toBeUndefined(); expect(round(s)).toEqual(s);
    enableSpaceWars(s); const before = structuredClone(s); enableSpaceEvents(s);
    expect(account(s)).toEqual({ ...account(before), version: 6 });
    for (const key of ['ship', 'expedition', 'empires', 'outfit', 'expansion', 'wars', 'combat'] as const) expect(s.space![key]).toEqual(before.space![key]);
    expect(domestic(s)).toEqual(domestic(before)); expect(events(s)).toMatchObject({ version: 1, actions: [], nextAction: 1, watches: [], candidate: null,
      activated: { cut: { at: before.space!.elapsed, tick: before.tick, travelAction: before.space!.nextSerial, lifeAction: before.space!.expedition!.nextAction, economyAction: account(before).nextAction }, economyAt: account(before).elapsed, warAction: 1 } });
    expect(events(s).activated.nextCombatSerial).toBe(before.space!.combat!.archive.battles + before.space!.combat!.battles.length + 1);
    expect(events(s).activated.loadCount).toBe(account(before).counts.load);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(events(cp)).toMatchObject({ actions: [], watches: [], candidate: null, activated: { cut: { at: 0, economyAction: 1 }, economyAt: 0, nextCombatSerial: 1 } });
    expect(account(cp).balance).toBe(0); expect(cp.space!.ship).toBeNull(); const once = structuredClone(s); enableSpaceEvents(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
  });

  it('observes a genuinely stable colony before arming and opens only after twelve local seconds of a real missing role', () => {
    const s = source(), homeBefore = domestic(s), original = structuredClone(colony(s)), plants = removePlants(s), startedAt = livingPlanet(s)!.elapsed;
    frames(s, 11.9); expect(quarantine(s)).toBeNull(); expect(watch(s).unstableFor).toBeCloseTo(11.9, 8);
    frames(s, .1); const open = quarantine(s)!; expect(open).not.toBeNull();
    expect(open.watch.unstableFor).toBeCloseTo(12, 8); expect(open.watch.observedElapsed - startedAt).toBeCloseTo(12, 8);
    expect(open.watch.armedAt.localAt).toBeLessThanOrEqual(startedAt); expect(events(s).current.totals.quarantines).toBe(1);
    expect(colony(s)).toEqual(original); expect(livingExpedition(s)!.cargo.map(life => life.id)).toEqual(plants.map(plant => plant.id));
    expect(domestic(s)).toEqual(homeBefore); expect(round(s)).toEqual(s);
  });

  it('does not invent an initial crisis for a historical colony already missing a role before explicit activation', () => {
    const s = fixture(); enableSpaceWars(s); surface(s); const plants = removePlants(s); enableSpaceEvents(s);
    frames(s, 20); expect(watch(s).armedAt).toBeNull(); expect(quarantine(s)).toBeNull();
    restorePlants(s, plants); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 60);
    expect(watch(s).armedAt).not.toBeNull(); removePlants(s); frames(s, 12); expect(quarantine(s)).not.toBeNull(); expect(round(s)).toEqual(s);
  });

  it('preserves a half-observed interruption through pause, flight, another world, home and rekey without simulating the absent biome', () => {
    let s = source(); removePlants(s); frames(s, 6); const id = colony(s).planetId, observed = structuredClone(watch(s));
    const world = structuredClone(livingPlanet(s)); const clock = new FixedStepClock(); clock.advance(0); expect(clock.advance(600000, false)).toBe(0); expect(watch(s)).toEqual(observed);
    orbit(s); frames(s, 310); expect(watch(s)).toEqual(observed); expect(quarantine(s)).toBeNull();
    expect(livingExpedition(s)!.worlds.find(w => w.id === id)).toEqual(world);
    surface(s, 2); frames(s, 1); expect(watch(s)).toEqual(observed); home(s); frames(s, 1); expect(watch(s)).toEqual(observed);
    s = rekey(s); surface(s); expect(watch(s)).toEqual(observed); frames(s, 6); expect(quarantine(s)).not.toBeNull(); expect(round(s)).toEqual(s);
  });

  it('blocks production and loading but permits actual paid repair and charging, preserving all existing stock and carried life', () => {
    const { s, plants } = crisis(1, true), original = structuredClone(colony(s)), held = structuredClone(livingExpedition(s)!.cargo);
    expect(colonyCapacity(s, colony(s))).toBe(0); frames(s, 10); expect(colony(s)).toEqual(original);
    const blocked = noNotice(s); expect(economyQuote(s, { kind: 'load' }, account(s).nextAction).ok).toBe(false); expect(transact(s, { kind: 'load' })).toBe(false); expect(noNotice(s)).toEqual(blocked);
    const balance = account(s).balance; expect(s.space!.ship!.health).toBeLessThan(shipCapabilities(s.space!)!.health); expect(transact(s, { kind: 'repair' })).toBe(true);
    const target = livingPlanet(s)!.life[0]; s.space!.location!.pos = { x: target.pos.x, y: 3, z: target.pos.z };
    expect(useSpecimenTool(s, 'scan', target.id)).toBe(true); beacon(s); expect(transact(s, { kind: 'charge' })).toBe(true);
    expect(account(s).balance).toBe(balance - 8); expect(colony(s)).toEqual(original); expect(livingExpedition(s)!.cargo).toEqual(held);
    expect(held.map(life => life.id)).toEqual(plants.map(plant => plant.id)); expect(quarantine(s)).not.toBeNull(); expect(round(s)).toEqual(s);
  });

  it('requires real restoration and ten-second stability followed by an explicit personal resume with no account or ship gift', () => {
    const { s, plants } = crisis(); refuseResume(s); restorePlants(s, plants); frames(s, 9.9); refuseResume(s);
    until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 60); expect(quarantine(s)).not.toBeNull();
    const ship = structuredClone(s.space!.ship), economy = structuredClone(account(s)), life = structuredClone(livingExpedition(s)), localAt = livingPlanet(s)!.elapsed;
    const serial = events(s).nextAction; expect(resume(s)).toBe(true);
    expect(events(s).actions.at(-1)).toMatchObject({ kind: 'resume', serial, quarantineSerial: 1, localAt });
    expect(s.space!.ship).toEqual(ship); expect(account(s)).toEqual(economy); expect(livingExpedition(s)).toEqual(life);
    expect(watch(s)).toMatchObject({ anchorSerial: serial, observedElapsed: localAt, armedAt: null, unstableFor: 0 }); expect(quarantine(s)).toBeNull();
    expect(resumeColony(s, colony(s).planetId, serial)).toBe(false); expect(colonyCapacity(s, colony(s))).toBeGreaterThan(0);
    expect(transact(s, { kind: 'load' })).toBe(true); expect(events(s).candidate!.receipt.eventAction).toBe(events(s).nextAction); expect(round(s)).toEqual(s);
  });

  it.each(['stale', 'far', 'high', 'orbit', 'dead', 'other-world'] as const)('refuses a %s resume atomically', reason => {
    const { s, plants } = crisis(); restorePlants(s, plants); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 60);
    // Dead and remote coordinates are refusal-only prepared inputs; never a
    // claimed valid save or substitute for the real crisis/restoration above.
    if (reason === 'far') s.space!.location!.pos.x = 13;
    if (reason === 'high') s.space!.location!.pos.y = 9;
    if (reason === 'orbit') orbit(s);
    if (reason === 'dead') s.space!.ship!.health = 0;
    if (reason === 'other-world') surface(s, 2);
    refuseResume(s, 1, events(s).nextAction - Number(reason === 'stale'));
  });

  it('rearms only after sixty local seconds and discards corrected deferred instability during the shared three-hundred-second rest', () => {
    const { s, plants } = crisis(), opening = quarantine(s)!.economyAt;
    restorePlants(s, plants); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 60); expect(resume(s)).toBe(true);
    frames(s, 59); expect(watch(s).armedAt).toBeNull(); frames(s, 1); expect(watch(s).armedAt).not.toBeNull();
    const missing = removePlants(s); frames(s, 12); expect(quarantine(s)).toBeNull(); expect(events(s).current.totals.quarantines).toBe(1);
    restorePlants(s, missing); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 60);
    time(s, opening + 301); expect(quarantine(s)).toBeNull(); expect(watch(s).unstableFor).toBe(0);
    removePlants(s); frames(s, 12); expect(quarantine(s)!.economyAt - opening).toBeGreaterThanOrEqual(300 - 1e-6); expect(events(s).current.totals.quarantines).toBe(2); expect(round(s)).toEqual(s);
  });

  it('intersects quarantine and military occupation without counting blocked production twice; recapture still needs personal resume', () => {
    const { s, plants } = crisis(3); orbit(s, 3); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, frozen = structuredClone(colony(s, 3));
    expect(applyWarOrder(s, 'declare', 'roots', s.space!.wars!.nextAction)).toBe(true);
    until(s, () => s.space!.wars!.current.raid !== null, 91); const raid = s.space!.wars!.current.raid!; expect(raid.planetId).toBe(colony(s, 3).planetId);
    time(s, raid.deadline + 1 / 30); expect(ownerAt(s.space!, raid.planetId)).toBe('roots'); frames(s, 10); expect(colony(s, 3)).toEqual(frozen);
    const poison = structuredClone(s); colony(poison, 3).productiveElapsed++; expect(economyCheckpointMatches(poison, cp)).toBe(false); reject(poison); expect(round(s)).toEqual(s);
    surface(s, 3); restorePlants(s, plants); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 60);
    refuseResume(s, 3); expect(economyQuote(s, { kind: 'repair' }, account(s).nextAction).ok).toBe(false);
    orbit(s, 3); cool(s); expect(applyWarOrder(s, 'invasion', 'roots', s.space!.wars!.nextAction)).toBe(true); win(s);
    surface(s, 3); expect(quarantine(s, 3)).not.toBeNull(); expect(colonyCapacity(s, colony(s, 3))).toBe(0); expect(resume(s, 3)).toBe(true);
    expect(colonyCapacity(s, colony(s, 3))).toBeGreaterThan(0); expect(account(s).balance).toBe(102); expect(round(s)).toEqual(s);
  });
});

describe('D3c actual cargo arrivals and automatic physical pirate encounters', () => {
  it('copies a new load receipt and opens only on the first ordinary frame after a different foreign orbit arrival', () => {
    const s = cargoReady(), receipt = structuredClone(account(s).actions.at(-1)), candidate = structuredClone(events(s).candidate), cargo = structuredClone(account(s).cargo), homeBefore = domestic(s), money = account(s).balance;
    expect(candidate!.receipt).toEqual(receipt); expect(candidate!.receipt).not.toBe(account(s).actions.at(-1)); expect(candidate!.receipt.eventAction).toBe(1);
    orbit(s); frames(s, 1); expect(events(s).current.pirate).toBeNull(); orbit(s, 2);
    expect(events(s).current.pirate).toBeNull(); expect(round(s)).toEqual(s); const arrival = structuredClone(s.space!.log.at(-1));
    step(s, EMPTY_INPUT, 1 / 30); const open = events(s).current.pirate!;
    expect(open).toMatchObject({ kind: 'pirate', serial: 1, candidate, arrival, battleSerial: 4 }); expect(open.cut.at).toBeGreaterThan(arrival!.at);
    expect(battle(s)).toMatchObject({ serial: 4, kind: 'pirate', end: null, shots: 0, start: open.cut, economyAt: open.economyAt });
    expect(events(s).candidate).toBeNull(); expect(account(s).cargo).toEqual(cargo); expect(account(s).balance).toBe(money); expect(domestic(s)).toEqual(homeBefore); expect(round(s)).toEqual(s);
  });

  it('does not reinterpret a real pre-activation load as a candidate and does not trigger on import', () => {
    const s = fixture(); enableSpaceWars(s); surface(s); expect(transact(s, { kind: 'load' })).toBe(true);
    const receipt = structuredClone(account(s).actions.at(-1)); expect(Object.hasOwn(receipt!, 'eventAction')).toBe(false); enableSpaceEvents(s);
    orbit(s, 2); frames(s, 100); expect(events(s).candidate).toBeNull(); expect(events(s).actions).toEqual([]); expect(account(s).actions.at(-1)).toEqual(receipt); expect(round(s)).toEqual(s);
  });

  it('preserves the ordinary ninety-second combat rest before opening the delayed cargo encounter', () => {
    const s = cargoReady(1, false), oldEnd = battle(s).end!.at; orbit(s, 2); frames(s, 1 / 30);
    expect(s.space!.elapsed).toBeLessThan(oldEnd + 90); expect(events(s).current.pirate).toBeNull();
    until(s, () => events(s).current.pirate !== null, 91); expect(events(s).current.pirate!.cut.at).toBeGreaterThanOrEqual(oldEnd + 90 - 1e-7); expect(round(s)).toEqual(s);
  });

  it('defers during war and its announced raid, then reassesses the still-carried origin after peace', () => {
    const s = source(); orbit(s); expect(applyWarOrder(s, 'declare', 'roots', s.space!.wars!.nextAction)).toBe(true);
    surface(s); expect(transact(s, { kind: 'load' })).toBe(true); orbit(s, 2); frames(s, 91);
    expect(s.space!.wars!.current.raid).not.toBeNull(); expect(events(s).candidate).not.toBeNull(); expect(events(s).current.pirate).toBeNull();
    expect(applyWarOrder(s, 'peace', 'roots', s.space!.wars!.nextAction)).toBe(true); step(s, EMPTY_INPUT, 1 / 30);
    expect(events(s).current.pirate).not.toBeNull(); expect(round(s)).toEqual(s);
  });

  it('a same-origin sale invalidates the candidate; a newer actual load replaces rather than duplicates it', () => {
    const s = cargoReady(), first = events(s).candidate!.receipt.serial; surface(s, 2);
    expect(transact(s, { kind: 'load' })).toBe(true); const second = structuredClone(events(s).candidate)!;
    expect(second.receipt.serial).toBeGreaterThan(first); expect(second.receipt.planetId).toBe(colony(s, 2).planetId);
    home(s); expect(transact(s, { kind: 'sell', originPlanetId: colony(s).planetId })).toBe(true); expect(events(s).candidate).toEqual(second);
    expect(transact(s, { kind: 'sell', originPlanetId: colony(s, 2).planetId })).toBe(true); expect(events(s).candidate).toBeNull();
    orbit(s, 2); frames(s, 310); expect(events(s).current.pirate).toBeNull(); expect(events(s).actions).toEqual([]); expect(round(s)).toEqual(s);
  });

  it('accepts candidate A at checkpoint followed by actual load B then sale B, without restoring the still-carried A candidate', () => {
    const s = cargoReady(); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, old = structuredClone(events(s).candidate)!;
    surface(s, 2); expect(transact(s, { kind: 'load' })).toBe(true); const newer = events(s).candidate!;
    expect(newer.receipt.planetId).not.toBe(old.receipt.planetId); home(s);
    expect(transact(s, { kind: 'sell', originPlanetId: colony(s, 2).planetId })).toBe(true);
    expect(account(s).cargo.some(row => row.planetId === old.receipt.planetId && row.amount === old.receipt.amount)).toBe(true);
    expect(events(s).candidate).toBeNull(); expect(eventsCheckpointMatches(s, cp)).toBe(true); expect(round(s)).toEqual(s);
  });

  it.each(['won', 'retreated', 'lost'] as const)('records a real %s outcome without deleting cargo, adding money or rewriting later rescue into the closed proof', outcome => {
    const s = pirate(), cargo = structuredClone(account(s).cargo), money = account(s).balance, biology = structuredClone(livingExpedition(s));
    if (outcome === 'won') win(s);
    else if (outcome === 'retreated') expect(changeSpaceScale(s, 'down')).toBe(true);
    else until(s, () => battle(s).end !== null, 60);
    const result = structuredClone(events(s).current.lastPirateResult)!; expect(result.battle.outcome).toBe(outcome); expect(result.battle).toEqual(eventBattleProof(battle(s)));
    expect(Object.hasOwn(result.battle, 'rescue')).toBe(false); expect(events(s).current.pirate).toBeNull(); expect(events(s).candidate).toBeNull();
    expect(account(s).cargo).toEqual(cargo); expect(account(s).balance).toBe(money); expect(livingExpedition(s)).toEqual(biology);
    if (outcome === 'lost') { expect(s.space!.ship!.health).toBe(0); expect(rescueShip(s)).toBe(true); frames(s, 12); expect(s.space!.ship!.health).toBe(25); }
    if (outcome === 'retreated') finish(s);
    expect(events(s).current.lastPirateResult).toEqual(result); expect(eventBattleProof(battle(s))).toEqual(result.battle); expect(round(s)).toEqual(s);
    orbit(s, 2); frames(s, 310); expect(events(s).current.totals.pirates).toBe(1); expect(events(s).current.pirate).toBeNull(); expect(account(s).cargo).toEqual(cargo);
  });

  it('shares the three-hundred-second automatic interval between ecological quarantine and the next new cargo pirate', () => {
    const { s, plants } = crisis(), openedAt = quarantine(s)!.economyAt;
    restorePlants(s, plants); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 60); expect(resume(s)).toBe(true);
    expect(transact(s, { kind: 'load' })).toBe(true); orbit(s, 2); cool(s); expect(events(s).current.pirate).toBeNull();
    time(s, openedAt + 299); expect(events(s).current.pirate).toBeNull(); time(s, openedAt + 300);
    expect(events(s).current.pirate).not.toBeNull(); expect(events(s).current.pirate!.economyAt - openedAt).toBeGreaterThanOrEqual(300 - 1e-6); expect(round(s)).toEqual(s);
  });

  it('keeps the actual candidate after its source load receipt rolls out and still requires a later real arrival', () => {
    const s = enabled(); s.machines!.resource = 3000; makeCheckpoint(s); // Explicit unit treasury, not earned wealth.
    surface(s); expect(transact(s, { kind: 'load' })).toBe(true); const candidate = structuredClone(events(s).candidate)!; home(s);
    for (let i = 0; i < 128; i++) expect(transact(s, { kind: 'deposit' })).toBe(true);
    expect(account(s).actions.some(row => row.serial === candidate.receipt.serial)).toBe(false); expect(events(s).candidate).toEqual(candidate); expect(round(s)).toEqual(s);
    orbit(s, 2); expect(events(s).current.pirate).toBeNull(); step(s, EMPTY_INPUT, 1 / 30);
    expect(events(s).current.pirate!.candidate).toEqual(candidate); expect(round(s)).toEqual(s);
  });
});

describe('D3c checkpoint evidence, persistence and bounded event history', () => {
  it('preserves a true local quarantine checkpoint and explicit restoration through storage, rekey and recovery', () => {
    const { s, plants } = crisis(); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    restorePlants(s, plants); until(s, () => stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!) >= 1, 60); expect(resume(s)).toBe(true);
    const local = new Map<string, string>(); vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s); expect(rekey(s).space).toEqual(s.space);
    const recovered = recoverGeneration(round(s)); expect(events(recovered)).toEqual(events(cp)); expect(livingExpedition(recovered)).toEqual(livingExpedition(cp)); expect(quarantine(recovered)).not.toBeNull(); expect(round(recovered)).toEqual(recovered);
  });

  it('recovers a true two-pulse automatic battle checkpoint and preserves its closed outcome prefix', () => {
    const s = pirate(); expect(fireSpacePulse(s)).toBe(true); frames(s, 2 / 3); expect(fireSpacePulse(s)).toBe(true); makeCheckpoint(s);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    for (let i = 0; i < 3; i++) { frames(s, 2 / 3); expect(fireSpacePulse(s)).toBe(true); }
    expect(events(s).current.totals.victories).toBe(1); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(events(restored)).toEqual(events(cp)); expect(battle(restored).shots).toBe(2); expect(activeSpaceBattle(restored.space!)).not.toBeNull(); expect(round(restored)).toEqual(restored);
    makeCheckpoint(s); const poison = structuredClone(s); events(poison).actions[0].cut.tick--; reject(poison);
  });

  it('does not permit watch progress at unchanged local time or a shortened permanent twelve-second opening proof', () => {
    const s = source(); makeCheckpoint(s); const sameTime = structuredClone(s); watch(sameTime).unstableFor = 12; reject(sameTime);
    const { s: open } = crisis(); makeCheckpoint(open); const short = structuredClone(open), action = events(short).actions[0];
    if (action.kind !== 'quarantine') throw new Error('Expected actual quarantine'); action.watch.unstableFor = 11;
    events(short).current.colonies[0].lastQuarantine.watch.unstableFor = 11; reject(short);
    const future = structuredClone(open); events(future).current.colonies[0].lastQuarantine.warAction = future.space!.wars!.nextAction + 1; reject(future);
  });

  it('rejects changed candidate receipts, false battle identity, future load cuts and retrospectively annotated pre-activation loads', () => {
    const s = cargoReady(); expect(round(s)).toEqual(s);
    const changed = structuredClone(s); events(changed).candidate!.receipt.amount++; reject(changed);
    const future = structuredClone(s), load = account(future).actions.at(-1)!;
    if (load.kind !== 'load') throw new Error('Expected load'); load.eventAction = events(future).nextAction + 1; events(future).candidate!.receipt.eventAction = load.eventAction; reject(future);
    const old = structuredClone(s), legacyLoad = account(old).actions.find(row => row.kind === 'load')!;
    if (legacyLoad.kind !== 'load') throw new Error('Expected historical load'); legacyLoad.eventAction = 1; reject(old);
    const fighting = pirate(); makeCheckpoint(fighting); const falseBattle = structuredClone(fighting); events(falseBattle).current.pirate!.battleSerial = 1; reject(falseBattle);
  });

  it('retains opt-in on no-checkpoint recovery without importing previous crises, candidates or automatic victories', () => {
    const s = pirate(); win(s); s.checkpoint = null; const fresh = recoverGeneration(s);
    expect(fresh.stage).toBe(0); expect(account(fresh).version).toBe(6); expect(events(fresh)).toMatchObject({ actions: [], nextAction: 1, watches: [], candidate: null });
    expect(events(fresh).current.totals).toEqual({ quarantines: 0, resumes: 0, pirates: 0, victories: 0, retreats: 0, defeats: 0 }); expect(round(fresh)).toEqual(fresh);
  });

  it('rolls 67 actual newly loaded pirate encounters through event, combat and economic histories while keeping a known early checkpoint', () => {
    const s = enabled(); let cp: string | null = null, firstLoad = 0;
    for (let i = 0; i < 67; i++) {
      orbit(s, 2); if (events(s).current.lastAutomatic) time(s, events(s).current.lastAutomatic!.economyAt + 300); cool(s);
      surface(s, 2); expect(transact(s, { kind: 'load' })).toBe(true);
      if (!i) firstLoad = events(s).candidate!.receipt.serial;
      orbit(s, 1); expect(events(s).current.pirate).toBeNull(); step(s, EMPTY_INPUT, 1 / 30); expect(events(s).current.pirate).not.toBeNull(); win(s, true);
      if (i === 1) { makeCheckpoint(s); cp = s.checkpoint; }
      surface(s, 1); expect(transact(s, { kind: 'sell', originPlanetId: colony(s, 2).planetId })).toBe(true);
    }
    expect(events(s).nextAction).toBe(135); expect(events(s).actions).toHaveLength(128); expect(events(s).archive.through).toBe(6);
    expect(events(s).archive.state.totals).toMatchObject({ pirates: 3, victories: 3 }); expect(events(s).current.totals).toMatchObject({ pirates: 67, victories: 67, quarantines: 0, resumes: 0 });
    expect(s.space!.combat!.battles).toHaveLength(32); expect(s.space!.combat!.archive.battles).toBe(38); expect(account(s).actions.some(row => row.serial === firstLoad)).toBe(false);
    expect(events(s).candidate).toBeNull(); expect(account(s).cargo).toEqual([]); expect(s.checkpoint).toBe(cp); expect(eventStateAt(events(s), 2)).toBeNull(); expect(round(s)).toEqual(s);
    const prefix = structuredClone(s); events(prefix).archive.stamp.cut.tick++; reject(prefix);
    const proof = structuredClone(s); events(proof).archive.state.lastPirateResult!.battle.shots++; reject(proof);
    const borrowed = structuredClone(s), archived = events(borrowed).archive.state.totals, current = events(borrowed).current.totals;
    // Current totals still exceed the CP's two wins. Only the rolled archive
    // exposes that two already-known victories were relabelled as other outcomes.
    archived.victories -= 2; archived.retreats++; archived.defeats++; current.victories -= 2; current.retreats++; current.defeats++;
    expect(eventsCheckpointMatches(borrowed, JSON.parse(cp!) as GameState)).toBe(false); reject(borrowed);
    const restored = recoverGeneration(round(s)); expect(events(restored)).toEqual(events(JSON.parse(cp!) as GameState)); expect(round(restored)).toEqual(restored);
  // 67 real load/battle/sale cycles and more than 20,000 ordinary simulated
  // seconds measured 15.10s; only this new sustained case gets a 30s budget.
  }, 30000);
});
