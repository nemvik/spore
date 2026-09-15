import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { actOnJourney, activeSites, initializeJourneyStage, journeyAction, journeyForageTarget, journeyHint, recordJourneyHunt, stepJourney } from '../src/game/journey';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createWorld, spawnCreature } from '../src/game/world';
import { tendTarget } from '../src/game/interactions';
import { stepHunters } from '../src/game/encounter-ai';
import { EMPTY_INPUT } from '../src/game/types';
import type { FoodKind, GameState, Stage, Vec3 } from '../src/game/types';

// Explicit prepared resource/actor fixtures exercise production actions and saves.
// They do not measure a human campaign or use ordinary food as a culture shortcut.
function scene(stage: Stage = 0) {
  const s = createGame(481516, false);
  for (let next = 1; next <= stage; next++) {
    s.stage = next as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.stage] = s.world;
    initializeJourneyStage(s);
  }
  s.world.creatures = []; s.world.obstacles = [];
  s.world.resources = s.world.resources.filter(r => activeSites(s).some(site => site.sourceId === r.id));
  s.player.pos = { x: 0, y: 1.1, z: 0 }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.heading = 0;
  makeCheckpoint(s); return s;
}
function at(s: GameState, pos: Vec3) { s.player.pos = { ...pos }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.cooldown = 0; }
function portion(s: GameState, kind: FoodKind, pos = s.player.pos, patch = 0) {
  const r = { id: s.world.nextId++, kind, pos: { ...pos }, amount: 3.5, max: 4, patch, regen: 0 };
  s.world.resources.push(r); return r;
}

describe('one ordinary portion can be carried and offered', () => {
  it.each(['algae', 'mineral', 'nectar', 'detritus', 'meat'] as const)('conserves one actual %s portion without rewarding DNA or requiring the host to digest it', kind => {
    const s = scene(), r = portion(s, kind), before = { dna: s.player.dna, total: s.player.totalDna, meals: s.player.meals, energy: s.player.energy };
    expect(journeyAction(s)).toMatchObject({ ready: true, resourceId: r.id });
    expect(tendTarget(s)).toMatchObject({ kind: 'food', id: r.id, ready: true });
    expect(actOnJourney(s)).toBe(true);
    expect(r.amount).toBe(2.5); expect(s.journey.cargo).toMatchObject({ kind, purpose: 'food' });
    actOnJourney(s); expect(r.amount).toBe(2.5);
    expect(journeyAction(s)).toMatchObject({ operation: 'plant', ready: false });
    expect(journeyHint(s)?.text).toContain('běžná potrava');
    at(s, { x: 12, y: 1.1, z: 5 }); expect(actOnJourney(s, true)).toBe(true);
    const bait = s.world.resources.find(item => item.id === s.journey.offerings[0].id)!;
    expect(bait).toMatchObject({ kind, amount: 1, max: 1, regen: 0 });
    expect(r.amount + bait.amount).toBe(3.5); expect(s.journey.cargo).toBeNull();
    expect({ dna: s.player.dna, total: s.player.totalDna, meals: s.player.meals, energy: s.player.energy }).toEqual(before);
    expect(activeSites(s).every(site => !site.observed && !site.resolved)).toBe(true);
  });

  it('never plants ordinary algae at the matching algae source or refuge', () => {
    const s = scene(), site = activeSites(s)[0]; portion(s, 'algae'); actOnJourney(s);
    for (const pos of [site.source, ...site.refuges]) {
      at(s, pos); expect(journeyAction(s)?.ready).toBe(false); actOnJourney(s);
      expect(site.plantedId).toBeNull(); expect(site.resolved).toBe(false); expect(site.observed).toBe(false);
      expect(s.journey.cargo?.purpose).toBe('food');
    }
    const before = { ...s.journey.cargo! }; stepJourney(s, 20, s.player.pos, true);
    expect(s.journey.cargo).toEqual(before); // Food is not a fragile living culture.
  });

  it('retains visible in-range source priority, including during the action cooldown', () => {
    const s = scene(), site = activeSites(s)[0]; at(s, site.source);
    const food = portion(s, 'detritus');
    expect(journeyAction(s)).toMatchObject({ operation: 'observe', ready: true }); actOnJourney(s);
    expect(journeyAction(s)).toMatchObject({ operation: 'take', ready: false });
    s.player.cooldown = 0; actOnJourney(s);
    expect(s.journey.cargo).toMatchObject({ purpose: 'culture', kind: 'algae', site: site.id });
    expect(food.amount).toBe(3.5);
  });

  it('collects reachable food beside a distant source and chooses an accessible portion over a closer occluded one', () => {
    const s = scene(), site = activeSites(s)[0]; at(s, { ...site.source, x: site.source.x + 8 });
    const food = portion(s, 'detritus'); expect(journeyAction(s)).toMatchObject({ operation: 'take-food', resourceId: food.id });
    at(s, { x: 0, y: 1.1, z: 0 });
    const hidden = portion(s, 'nectar', { x: 2, y: 1.1, z: 0 }), clear = portion(s, 'detritus', { x: 0, y: 1.1, z: 3 });
    s.world.obstacles = [{ id: s.world.nextId++, pos: { x: 1, y: -5, z: 0 }, radius: .5, height: 10, kind: 'rock' }];
    expect(journeyAction(s)).toMatchObject({ ready: true, resourceId: clear.id }); actOnJourney(s);
    expect(clear.amount).toBe(2.5); expect(hidden.amount).toBe(3.5);
  });

  it('does not collect through rock, above its reach, or from a depleted resource', () => {
    const s = scene(), r = portion(s, 'detritus', { x: 2, y: 1.1, z: 0 });
    s.world.obstacles = [{ id: s.world.nextId++, pos: { x: 1, y: -5, z: 0 }, radius: .5, height: 10, kind: 'rock' }];
    expect(journeyAction(s)?.ready).toBe(false); actOnJourney(s); expect(r.amount).toBe(3.5);
    s.world.obstacles = []; r.pos.y = 8; expect(journeyAction(s)).toBeNull();
    r.pos.y = 1.1; r.amount = .9; expect(journeyAction(s)).toBeNull();
    expect(s.journey.cargo).toBeNull();
  });

  it('places carried detritus in the receiving patch and attracts invaders without attracting native bells', () => {
    const s = scene(2), site = activeSites(s)[0];
    portion(s, 'detritus', s.player.pos, 2); actOnJourney(s);
    expect(s.journey.cargo?.site).toBe(8);
    at(s, { ...site.source, x: site.source.x + 6 }); actOnJourney(s, true);
    const offering = s.journey.offerings[0], bait = s.world.resources.find(r => r.id === offering.id)!;
    expect(bait.patch).toBe(0); expect(offering.site).toBe(8);
    const invader = spawnCreature(s.world, 'gnaw', 0), grazer = spawnCreature(s.world, 'bell', 0);
    for (const c of [invader, grazer]) { c.pos = { ...bait.pos }; c.hunger = 50; }
    expect(journeyForageTarget(s, invader)?.id).toBe(bait.id);
    expect(journeyForageTarget(s, grazer)).toBeNull();
  });

  it.each(['food', 'culture'] as const)('only an actual twilight culture expands its hunter’s pursuit (%s)', purpose => {
    const s = scene(), hunter = spawnCreature(s.world, 'needle', 2);
    hunter.pos = { x: 0, y: 1.1, z: 40 }; hunter.fear = 0; s.world.creatures = [hunter];
    s.player.pos = { x: 0, y: 1.1, z: 20 }; s.journey.cargo = { kind: 'detritus', purpose, site: 2, vitality: 100, distance: 0 };
    stepHunters(s, 1 / 60, () => {});
    expect(hunter.target === -1).toBe(purpose === 'culture');
  });
});

describe('food carry save compatibility and causality', () => {
  it('credits the actual predator kill of a local invader drawn by food from another niche', () => {
    const s = scene(2), site = activeSites(s)[0]; portion(s, 'detritus', s.player.pos, 2); actOnJourney(s);
    at(s, site.source); actOnJourney(s, true);
    const bait = s.world.resources.find(r => r.id === s.journey.offerings[0].id)!;
    const invader = spawnCreature(s.world, 'gnaw', 0);
    Object.assign(invader, { pos: { ...bait.pos, x: bait.pos.x + 6 }, health: 1, hunger: 80, fear: 0, cooldown: 0 });
    site.threatIds = [invader.id]; s.world.creatures = [invader];
    s.player.pos = { ...s.world.landmarks[0].pos }; s.tick = 29;
    step(s, EMPTY_INPUT); expect(invader.target).toBe(bait.id);
    const predator = spawnCreature(s.world, 'crest', 0);
    // Disclosed close ambush isolates the kill/accounting chain. At three metres
    // this wary invader legitimately escapes the committed, non-steering lunge.
    Object.assign(predator, { pos: { ...invader.pos, x: invader.pos.x + 1 }, hunger: 70, fear: 0, cooldown: 0 });
    s.world.creatures.push(predator);
    for (let i = 0; i < 12 * 60 && !site.resolved; i++) step(s, EMPTY_INPUT);
    expect(s.world.creatures.some(c => c.id === invader.id)).toBe(false);
    expect(site).toMatchObject({ resolved: true, method: 'hunt' });
    expect(s.player.kills).toBe(0); expect(s.world.deaths).toBeGreaterThan(0);
  });

  it('round-trips food purpose in the main state and recoverable checkpoint with deterministic continuation', () => {
    const s = scene(); portion(s, 'algae'); actOnJourney(s); makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s));
    expect(loaded.journey.cargo?.purpose).toBe('food'); expect(recoverGeneration(loaded).journey.cargo?.purpose).toBe('food');
    for (let i = 0; i < 40; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded.player).toEqual(s.player); expect(loaded.journey).toEqual(s.journey); expect(loaded.world).toEqual(s.world);
  });

  it.each(['algae', 'meat'] as const)('explicitly migrates missing old %s purpose in both saved locations', kind => {
    const s = scene(); s.journey.cargo = { kind, purpose: kind === 'meat' ? 'food' : 'culture', site: 0, vitality: 61, distance: 12 }; makeCheckpoint(s);
    const old = JSON.parse(serializeGame(s)); delete old.state.journey.cargo.purpose;
    const checkpoint = JSON.parse(old.state.checkpoint); delete checkpoint.journey.cargo.purpose; old.state.checkpoint = JSON.stringify(checkpoint);
    const loaded = parseGame(JSON.stringify(old)), expected = kind === 'meat' ? 'food' : 'culture';
    expect(loaded.journey.cargo?.purpose).toBe(expected); expect(recoverGeneration(loaded).journey.cargo?.purpose).toBe(expected);
    expect(parseGame(serializeGame(loaded))).toEqual(loaded);
  });

  it.each([null, true, 'plant', 1])('rejects present invalid purpose %s in both saved locations', purpose => {
    const s = scene(); portion(s, 'detritus'); actOnJourney(s); makeCheckpoint(s);
    for (const nested of [false, true]) {
      const bad = JSON.parse(serializeGame(s)), target = nested ? JSON.parse(bad.state.checkpoint) : bad.state;
      target.journey.cargo.purpose = purpose; if (nested) bad.state.checkpoint = JSON.stringify(target);
      expect(() => parseGame(JSON.stringify(bad))).toThrow('journey.cargo.purpose');
    }
  });

  it.each(['combat', 'starvation', 'expired', 'unrelated', 'wrong-stage'] as const)('credits a local predator outcome only for actual live player-bait targeting (%s)', cause => {
    const s = scene(2), site = activeSites(s)[0]; portion(s, 'detritus', s.player.pos, 2); actOnJourney(s);
    at(s, site.source); actOnJourney(s, true);
    const offer = s.journey.offerings[0], invader = spawnCreature(s.world, 'gnaw', 0);
    site.threatIds = [invader.id]; invader.target = offer.id;
    if (cause === 'expired') offer.remaining = 0;
    if (cause === 'unrelated') invader.target = null;
    if (cause === 'wrong-stage') offer.stage = 1;
    // killCreature removes the actor before invoking this accounting boundary.
    recordJourneyHunt(s, invader, false, cause === 'starvation' ? 'starvation' : 'combat');
    expect(site.resolved).toBe(cause === 'combat');
    expect(s.player.kills).toBe(0); expect(s.player.totalDna).toBe(cause === 'combat' ? 42 : 14);
  });
});
