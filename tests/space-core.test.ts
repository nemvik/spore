import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGame, serializeGame } from '../src/game/persistence';
import { applyCoreOrder, coreQuote, enableSpaceCore, type CoreOrder } from '../src/game/space-core';
import { coreProgress, coreRoot, CORE_ENCOUNTER_POSITION } from '../src/game/space-core-content';
import { planetSystem, starSystems } from '../src/game/galaxy';
import { jumpQuote, jumpToSystem } from '../src/game/space-expedition';
import { enterWormhole } from '../src/game/space-discoveries';
import { launchShip, changeSpaceScale } from '../src/game/space';
import { fireSpacePulse, rescueShip, investigatePirates } from '../src/game/space-combat';
import { applyEconomyOrder } from '../src/game/space-economy';
import { activeSpaceBattle, latestBattle, WARDEN } from '../src/game/space-combat-content';
import { livingPlanet, setClimateTool } from '../src/game/space-biosphere';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

// Prepared UNIT beacon/encounter positions only. Ordinary runtime pays and
// completes all flights, shots and roots; no claim of native reachability.
const load = (kind = 'campaign') => parseGame(readFileSync(`tests/fixtures/space/native-d4-${kind}.save.json`, 'utf8'));
const enabled = (kind = 'campaign') => { const s = load(kind); enableSpaceCore(s); return s; };
const round = (s: GameState) => parseGame(serializeGame(s));
const core = (s: GameState) => s.space!.core!;
const order = (s: GameState, kind: CoreOrder) => applyCoreOrder(s, kind, core(s).nextAction);
function until(s: GameState, check: () => boolean, seconds = 30) {
  for (let i = 0; i < Math.ceil(seconds * 30) && !check(); i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(check()).toBe(true);
}
const finish = (s: GameState) => until(s, () => !s.space!.leg, 6.1);
const charge = (s: GameState) => until(s, () => s.space!.ship!.energy >= 35);
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
    if (current === 5 && index >= 22 && p.discoveries!.actions.some(r => r.kind === 'relic' && r.relicId === 'passage')) {
      expect(enterWormhole(s, p.discoveries!.nextAction)).toBe(true); finish(s); current = 22; continue;
    }
    const next = jumpQuote(s, stars[index].id).ok ? index : current + Math.sign(index - current);
    expect(jumpToSystem(s, stars[next].id)).toBe(true); finish(s); current = next;
  }
  beacon(s);
}
function orbit(s: GameState, index = 23) { system(s, index); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); }
function surface(s: GameState, index: number) { orbit(s, index); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); beacon(s); }
function contact(s: GameState) { orbit(s); expect(order(s, 'contact')).toBe(true); }
function access() { const s = enabled(); contact(s); expect(order(s, 'diplomacy')).toBe(true); return s; }
function gift() {
  const s = access(); surface(s, 31); s.space!.location!.pos = { ...CORE_ENCOUNTER_POSITION, y: 3 };
  expect(order(s, 'encounter')).toBe(true); return s;
}
function win(s: GameState) {
  const b = activeSpaceBattle(s.space!)!;
  while (!b.end) {
    until(s, () => s.space!.ship!.energy >= 3 && (!b.lastShot || s.space!.elapsed - b.lastShot.at >= .65));
    expect(fireSpacePulse(s)).toBe(true);
  }
  expect(b.end?.outcome).toBe('won');
}
const reject = (s: GameState) => expect(() => serializeGame(s)).toThrow();

describe('D5 core activation and real guarded navigation', () => {
  it.each(['campaign', 'ecology', 'passage', 'workshop'])('preserves exact played %s history while opting in live/checkpoint without a gift', kind => {
    const s = load(kind), before = structuredClone(s); enableSpaceCore(s);
    expect(core(s)).toMatchObject({ version: 1, actions: [], nextAction: 1, legacyWorlds: [] });
    for (const key of ['ship', 'expedition', 'economy', 'empires', 'outfit', 'expansion', 'wars', 'events', 'discoveries', 'location', 'leg', 'log'] as const) expect(s.space![key]).toEqual(before.space![key]);
    expect(s.space!.combat).toEqual({ ...before.space!.combat, version: 3, archive: { ...before.space!.combat!.archive, wardenVictories: 0, wardenRetreats: 0, wardenDefeats: 0 } });
    expect(round(s)).toEqual(s); expect(JSON.parse(s.checkpoint!).space.core.actions).toEqual([]);
  });
  it('blocks every inner destination even with drive32 and requires a genuine local contact and recommendation', () => {
    const s = enabled('workshop'); system(s, 22); const p = s.space!, stars = starSystems(p.homePlanetId), energy = p.ship!.energy;
    for (let i = 24; i < 32; i++) { expect(jumpQuote(s, stars[i].id).reason).toContain('Tichý val'); expect(jumpToSystem(s, stars[i].id)).toBe(false); }
    expect(p.ship!.energy).toBe(energy); expect(order(s, 'contact')).toBe(false); contact(s);
    expect(order(s, 'diplomacy')).toBe(false); expect(coreQuote(s, 'challenge', core(s).nextAction).ok).toBe(true); expect(round(s)).toEqual(s);
  });
  it('uses actual D4 help to cross and preserves a paid pending flight, then reaches the gift physically', () => {
    const s = access(), p = s.space!; expect(coreProgress(core(s)).access).toMatchObject({ strategy: 'diplomacy', supportSerial: 6 });
    system(s, 23); expect(jumpToSystem(s, starSystems(p.homePlanetId)[31].id)).toBe(true); step(s, EMPTY_INPUT, 1 / 30); makeCheckpoint(s);
    expect(round(s)).toEqual(s); const copied = round(s); finish(copied); expect(coreProgress(core(copied)).encounter).toBeNull();
    expect(order(copied, 'encounter')).toBe(false); surface(copied, 31); copied.space!.location!.pos = { ...CORE_ENCOUNTER_POSITION, y: 3 };
    expect(order(copied, 'encounter')).toBe(true); expect(order(copied, 'encounter')).toBe(false); expect(round(copied)).toEqual(copied);
  });
  it('preserves actual historical inner access and pending travel without inventing an encounter or requiring a new battle', () => {
    const s = load(); system(s, 31); makeCheckpoint(s); enableSpaceCore(s);
    expect(core(s).legacyWorlds).toContain(starSystems(s.space!.homePlanetId)[31].planetId); expect(core(s).actions).toEqual([]); expect(round(s)).toEqual(s);
    system(s, 23); expect(jumpQuote(s, starSystems(s.space!.homePlanetId)[31].id).ok).toBe(true);
    expect(coreProgress(core(s)).access).toBeNull(); expect(coreProgress(core(s)).encounter).toBeNull(); expect(round(s)).toEqual(s);
  });
  it('keeps a historical already-paid inner flight valid at activation and throughout its existing checkpoint', () => {
    const s = load(); system(s, 23); expect(jumpToSystem(s, starSystems(s.space!.homePlanetId)[31].id)).toBe(true); step(s, EMPTY_INPUT, 1 / 30); makeCheckpoint(s);
    const leg = structuredClone(s.space!.leg), energy = s.space!.ship!.energy; enableSpaceCore(s);
    expect(s.space!.leg).toEqual(leg); expect(s.space!.ship!.energy).toBe(energy); expect(round(s)).toEqual(s);
    finish(s); expect(coreProgress(core(s)).encounter).toBeNull(); expect(round(s)).toEqual(s);
  });
});

describe('D5 actual alternative combat and surviving consequences', () => {
  it('wins against the stronger guardian with nine paid shots, persists the result and grants no ownership, cash, healing or cargo', () => {
    const s = enabled('workshop'); contact(s); const p = s.space!, oldMoney = p.economy!.balance, oldColonies = structuredClone(p.economy!.colonies);
    expect(order(s, 'challenge')).toBe(true); expect(activeSpaceBattle(p)?.enemy.health).toBe(WARDEN.health); step(s, EMPTY_INPUT, 1 / 30); makeCheckpoint(s); expect(round(s)).toEqual(s);
    win(s); expect(latestBattle(p)!.shots).toBe(9); expect(coreProgress(core(s)).access).toMatchObject({ strategy: 'force', battle: { shots: 9 } });
    expect(p.economy!.balance).toBe(oldMoney); expect(p.economy!.colonies.map(c => [c.id, c.planetId, c.paid, c.level, c.upgraded, c.permission, c.militaryPermission])).toEqual(oldColonies.map(c => [c.id, c.planetId, c.paid, c.level, c.upgraded, c.permission, c.militaryPermission])); expect(p.ship!.health).toBe(99 - latestBattle(p)!.damage);
    expect(order(s, 'challenge')).toBe(false); expect(round(s)).toEqual(s); system(s, 31); expect(round(s)).toEqual(s);
  });
  it('keeps retreat and loss recoverable without granting access', () => {
    const s = enabled('workshop'); contact(s); expect(order(s, 'challenge')).toBe(true); expect(changeSpaceScale(s, 'up')).toBe(true); finish(s);
    expect(latestBattle(s.space!)!.end?.outcome).toBe('retreated'); expect(coreProgress(core(s)).access).toBeNull(); expect(round(s)).toEqual(s);
    until(s, () => s.space!.elapsed >= latestBattle(s.space!)!.end!.at + 90, 100); orbit(s); expect(order(s, 'challenge')).toBe(true);
    until(s, () => s.space!.ship!.health === 0, 40); expect(coreProgress(core(s)).access).toBeNull(); expect(round(s)).toEqual(s);
    expect(rescueShip(s)).toBe(true); until(s, () => s.space!.ship!.health === 25, 13); expect(round(s)).toEqual(s); expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); expect(round(s)).toEqual(s);
  });
  it('retains the genuine access proof after32 further paid battles archive its source, with an early known checkpoint', () => {
    const s = enabled(); contact(s); expect(order(s, 'challenge')).toBe(true); win(s); makeCheckpoint(s);
    const access = structuredClone(coreProgress(core(s)).access!), p = s.space!;
    for (let i = 0; i < 32; i++) {
      if (p.ship!.health < 70) {
        surface(s, 19); expect(applyEconomyOrder(s, { kind: 'repair' }, p.economy!.nextAction)).toBe(true); orbit(s, 23);
      }
      until(s, () => p.elapsed >= latestBattle(p)!.end!.at + 90, 100);
      expect(investigatePirates(s, p.combat!.archive.battles + p.combat!.battles.length + 1)).toBe(true); win(s);
    }
    expect(p.combat!.battles.some(b => b.kind === 'warden')).toBe(false); expect(p.combat!.archive.wardenVictories).toBe(1);
    expect(coreProgress(core(s)).access).toEqual(access); expect(round(s)).toEqual(s);
    const forged = structuredClone(s), proof = coreProgress(core(forged)).access!;
    if (proof.strategy === 'force') proof.battle.shots--;
    reject(forged);
  }, 30000);
});

describe('D5 permanent usable planetary reward', () => {
  it('pays30 once, preserves real inhabitants and paid work, stops barren-world drift and survives zero-time CP, import and another expedition', () => {
    const s = gift(); surface(s, 24); charge(s); makeCheckpoint(s);
    const p = s.space!, world = livingPlanet(s)!, energy = p.ship!.energy, oldLife = structuredClone(world.life), work = structuredClone(world.biosphere.work);
    expect(order(s, 'root')).toBe(true); expect(p.ship!.energy).toBe(energy - 30); expect(world.temperature).toBe(0); expect(world.atmosphere).toBe(0);
    expect(world.life).toEqual(oldLife); expect(world.biosphere.work).toEqual(work); expect(world.biosphere.stableFor).toEqual([0, 0, 0]); expect(round(s)).toEqual(s);
    expect(setClimateTool(s, 'warm')).toBe(false); expect(order(s, 'root')).toBe(false);
    for (let i = 0; i < 30 * 60; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(world.temperature).toBe(0); expect(world.atmosphere).toBe(0); expect(world.biosphere.work).toEqual(work); expect(round(s)).toEqual(s);
    system(s, 22); expect(round(s)).toEqual(s); surface(s, 24); expect(coreRoot(core(s), world.id)).not.toBeNull(); expect(round(s)).toEqual(s);
    const recovered = recoverGeneration(round(s)); expect(coreRoot(core(recovered), world.id)).toBeNull(); expect(livingPlanet(recovered)!.temperature).not.toBe(0);
  });
  it.each(['energy', 'climate', 'work', 'gift', 'access'])('rejects forged %s on a genuine unit continuation', fault => {
    const s = gift(); surface(s, 24); charge(s); makeCheckpoint(s); expect(order(s, 'root')).toBe(true);
    if (fault === 'energy') s.space!.ship!.energy++;
    if (fault === 'climate') livingPlanet(s)!.temperature = .1;
    if (fault === 'work') livingPlanet(s)!.biosphere.work.cool += .1;
    if (fault === 'gift') core(s).actions.splice(2, 1);
    if (fault === 'access') { const a = coreProgress(core(s)).access!; if (a.strategy === 'diplomacy') a.supportSerial--; }
    reject(s);
  });
  it('does not replace or heal the actual inhabited society when using the gift there', () => {
    const s = gift(); surface(s, 19); charge(s); makeCheckpoint(s); const world = livingPlanet(s)!;
    expect(world.life.length).toBeGreaterThan(0); const life = structuredClone(world.life), colonies = structuredClone(s.space!.economy!.colonies);
    expect(order(s, 'root')).toBe(true); expect(world.life).toEqual(life); expect(s.space!.economy!.colonies).toEqual(colonies); expect(round(s)).toEqual(s);
  });
});
