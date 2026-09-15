import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/game/simulation';
import { actOnJourney, activeSites } from '../src/game/journey';
import { hunterThreatening } from '../src/game/hunter-appetite';
import { HUNTER_TIMING } from '../src/game/encounter-ai';
import { lineBlocked } from '../src/game/interactions';
import { parseGame, serializeGame } from '../src/game/persistence';
import { distance } from '../src/game/random';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

/** Prepared ecological comparison, not campaign evidence. Observation/taking/
 * planting and a real one-portion meat pickup happen before the measurement.
 * Actor positions and removal of incidental scenery isolate this relationship.
 * Once the fixture returns, only public step(input) changes its world. */
function scene(version: 2 | 3 = 3, hunger = 70, alreadyAtRoot = false) {
  const s = createGame(481516, false); s.checkpoint = null;
  if (version === 2) { s.journey.version = 2; delete s.journey.canopy; }
  const site = activeSites(s)[0];
  for (const position of [site.source, site.source, site.refuges[0]]) {
    s.player.pos = { ...position }; s.player.cooldown = 0;
    expect(actOnJourney(s)).toBe(true);
  }
  const plant = s.world.resources.find(r => r.id === site.plantedId)!;
  const grazer = s.world.creatures.find(c => c.patch === 0 && c.species === 'veil')!;
  const hunter = s.world.creatures.find(c => c.patch === 0 && c.species === 'needle')!;
  s.world.creatures = [hunter, grazer]; s.world.obstacles = [];
  Object.assign(grazer, { pos: { ...plant.pos, x: plant.pos.x + (alreadyAtRoot ? 1 : 11) }, velocity: { x: 0, y: 0, z: 0 }, health: 32, hunger: 70, fear: 0, cooldown: 0, intent: 'forage', target: plant.id });
  Object.assign(hunter, { pos: { ...plant.pos, x: plant.pos.x + 4, z: plant.pos.z + 3 }, velocity: { x: 0, y: 0, z: 0 }, health: 55, hunger, fear: 0, cooldown: 0, intent: 'rest', target: null });
  s.player.pos = { ...hunter.pos, z: hunter.pos.z + 3.9 }; s.player.heading = 0;
  s.player.cooldown = 0; s.player.invulnerable = 0; s.player.velocity = { x: 0, y: 0, z: 0 };
  const carriedPortion = { id: s.world.nextId++, kind: 'meat' as const, pos: { ...s.player.pos }, amount: 1, max: 1, patch: 0, regen: 0 };
  s.world.resources.push(carriedPortion);
  expect(actOnJourney(s)).toBe(true);
  expect(carriedPortion.amount).toBe(0); expect(s.journey.cargo).toMatchObject({ purpose: 'food', kind: 'meat' });
  s.player.cooldown = 0; s.tick = alreadyAtRoot ? 0 : 29; s.world.time = s.tick / 60;
  expect(site.resolved).toBe(false);
  return { s, site, plant, grazer, hunter, carriedPortion };
}

function observe(s: GameState, grazerId: number, plantId: number, hunterId: number, frames: number) {
  let path = 0, firstMealTick: number | null = null, mealHunterDistance: number | null = null;
  let fled = false, approached = false, mealHunterAlive = false, mealVisible = false;
  for (let frame = 0; frame < frames; frame++) {
    const grazer = s.world.creatures.find(c => c.id === grazerId)!;
    const before = { pos: { ...grazer.pos }, hunger: grazer.hunger, cooldown: grazer.cooldown };
    step(s, EMPTY_INPUT);
    const plant = s.world.resources.find(r => r.id === plantId)!;
    const hunter = s.world.creatures.find(c => c.id === hunterId);
    path += distance(before.pos, grazer.pos); fled ||= grazer.intent === 'flee';
    approached ||= grazer.intent === 'forage' && grazer.target === plantId;
    if (firstMealTick === null && grazer.target === plantId && grazer.hunger < before.hunger - 20 && grazer.cooldown > before.cooldown && distance(grazer.pos, plant.pos) < 2) {
      firstMealTick = s.tick; mealHunterAlive = !!hunter && hunter.health > 0;
      mealHunterDistance = hunter ? distance(hunter.pos, plant.pos) : null;
      mealVisible = !!hunter && !lineBlocked(s, hunter.pos, plant.pos);
    }
  }
  return { path, firstMealTick, mealHunterDistance, mealHunterAlive, mealVisible, fled, approached };
}

describe('appetite changes the complete grazing and safe-pasture simulation', () => {
  it('an actual meat offer ends flight and allows the original grazer to walk and eat beside the same living hunter', () => {
    const { s, site, plant, grazer, hunter } = scene();
    step(s, EMPTY_INPUT);
    expect(grazer.intent).toBe('flee'); expect(hunterThreatening(s, hunter)).toBe(true);
    expect(site.resolved).toBe(false); expect(grazer.cooldown).toBe(0);
    step(s, { ...EMPTY_INPUT, offer: true });
    const offered = s.world.resources.find(r => r.id === s.journey.offerings[0].id)!;
    const feedingTick = s.tick;
    expect(offered.amount).toBe(0); expect(s.journey.cargo).toBeNull(); expect(hunter.hunger).toBeLessThan(40);
    expect(hunterThreatening(s, hunter)).toBe(false);
    const result = observe(s, grazer.id, plant.id, hunter.id, 6 * 60);
    expect(result.fled).toBe(true); expect(result.approached).toBe(true); expect(result.path).toBeGreaterThan(8);
    expect(result.firstMealTick).not.toBeNull();
    expect((result.firstMealTick! - feedingTick) / 60).toBeGreaterThan(HUNTER_TIMING.feeding);
    expect(result.mealHunterAlive).toBe(true); expect(result.mealHunterDistance).toBeLessThan(12); expect(result.mealVisible).toBe(true);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate' });
    expect(hunter.health).toBe(55); expect(grazer.health).toBe(32); expect(s.player.kills).toBe(0);
    expect(s.world.creatures).toHaveLength(2); expect(s.deathReason).toBeNull();
  });

  it('the same approach without the meat keeps the nearby original hunter threatening and the pasture unresolved', () => {
    const { s, site, plant, grazer, hunter, carriedPortion } = scene();
    step(s, EMPTY_INPUT); expect(grazer.intent).toBe('flee');
    step(s, EMPTY_INPUT);
    const result = observe(s, grazer.id, plant.id, hunter.id, 6 * 60);
    expect(result.fled).toBe(true); expect(result.firstMealTick).toBeNull(); expect(site.resolved).toBe(false);
    expect(hunterThreatening(s, hunter)).toBe(true); expect(hunter.hunger).toBeGreaterThan(70);
    expect(carriedPortion.amount).toBe(0); expect(s.journey.cargo).toMatchObject({ purpose: 'food', kind: 'meat' });
  });

  it('one real portion does not open the native route if the predator remains hungry afterward', () => {
    const { s, site, plant, grazer, hunter } = scene(3, 100);
    step(s, EMPTY_INPUT); step(s, { ...EMPTY_INPUT, offer: true });
    expect(hunter.hunger).toBeGreaterThan(40); expect(hunterThreatening(s, hunter)).toBe(true);
    expect(s.world.resources.find(r => r.id === s.journey.offerings[0].id)!.amount).toBe(0);
    const result = observe(s, grazer.id, plant.id, hunter.id, 3 * 60);
    expect(result.fled).toBe(true); expect(result.firstMealTick).toBeNull(); expect(site.resolved).toBe(false);
    expect(distance(hunter.pos, plant.pos)).toBeLessThan(12);
  });

  it('the actual safe-meal check independently rejects a hungry hunter even before the grazer next reconsiders its route', () => {
    const unsafe = scene(3, 70, true), safe = scene(3, 70, true);
    const unsafeHunger = unsafe.grazer.hunger, safeHunger = safe.grazer.hunger;
    step(unsafe.s, EMPTY_INPUT); step(safe.s, { ...EMPTY_INPUT, offer: true });
    for (const pair of [unsafe, safe]) {
      expect(pair.grazer.target).toBe(pair.plant.id); expect(pair.grazer.cooldown).toBe(10);
      expect(pair.plant.amount).toBeLessThan(7.7); expect(distance(pair.hunter.pos, pair.plant.pos)).toBeLessThan(12);
      expect(pair.hunter.health).toBe(55);
    }
    expect(unsafe.grazer.hunger).toBeLessThan(unsafeHunger - 20); expect(safe.grazer.hunger).toBeLessThan(safeHunger - 20);
    expect(unsafe.site.resolved).toBe(false); expect(safe.site).toMatchObject({ resolved: true, method: 'cultivate' });
  });

  it('historical v2 keeps its former native flight and unsafe-meal semantics despite consuming the same real bait', () => {
    const { s, site, plant, grazer, hunter } = scene(2);
    step(s, EMPTY_INPUT); step(s, { ...EMPTY_INPUT, offer: true });
    expect(hunter.hunger).toBeLessThan(40); expect(hunterThreatening(s, hunter)).toBe(true);
    const result = observe(s, grazer.id, plant.id, hunter.id, 3 * 60);
    expect(result.fled).toBe(true); expect(result.firstMealTick).toBeNull(); expect(site.resolved).toBe(false);
    const atRoot = scene(2, 70, true);
    step(atRoot.s, { ...EMPTY_INPUT, offer: true });
    expect(atRoot.hunter.hunger).toBeLessThan(40); expect(atRoot.grazer.cooldown).toBe(10);
    expect(atRoot.plant.amount).toBeLessThan(7.7); expect(atRoot.site.resolved).toBe(false);
  });

  it('resumes the fed hunter and the still-fleeing grazer identically through a strict save before their actual safe meal', () => {
    const { s, site, plant, grazer, hunter } = scene();
    step(s, EMPTY_INPUT); step(s, { ...EMPTY_INPUT, offer: true });
    expect(grazer.intent).toBe('flee'); expect(site.resolved).toBe(false);
    const loaded = parseGame(serializeGame(s));
    const uninterrupted = observe(s, grazer.id, plant.id, hunter.id, 6 * 60);
    const resumed = observe(loaded, grazer.id, plant.id, hunter.id, 6 * 60);
    expect(resumed).toEqual(uninterrupted); expect(loaded).toEqual(s);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate' }); expect(resumed.mealHunterAlive).toBe(true);
    expect(parseGame(serializeGame(loaded))).toEqual(loaded);
  });
});
