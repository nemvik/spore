import { describe, expect, it } from 'vitest';
import { cloneGenome, computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage, journeyAction } from '../src/game/journey';
import { feedTarget, bondTarget } from '../src/game/interactions';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { abilityPulse } from '../src/render/renderer';
import { EMPTY_INPUT } from '../src/game/types';
import type { AdaptationId, GameState, Input } from '../src/game/types';

// Prepared quiet encounters isolate real action sequences and save behavior.
// They are not evidence of campaign completion or human play duration.
function fixture(kinds: AdaptationId[] = ['toxin'], legacy = false): GameState {
  const s = createGame(481516, legacy);
  if (kinds.includes('sonar')) {
    s.stage = 1; s.world = createWorld(s.seed, 1); s.worlds[1] = s.world;
    initializeJourneyStage(s);
  }
  s.player.genome = cloneGenome(s.player.genome);
  for (const kind of kinds) s.player.genome.parts.push({ id: `test-${kind}`, kind, axial: .3, angle: 1, scale: 1, mirrored: false });
  s.player.totalDna = 200 + genomeCost(s.player.genome) - genomeCost(initialGenome());
  s.player.dna = 200; s.player.health = computeStats(s.player.genome).maxHealth;
  s.player.energy = 90; s.world.creatures = []; s.world.obstacles = [];
  s.player.pos = { ...(s.journey.sites.find(site => site.stage === s.stage)?.source ?? s.world.resources[0].pos) };
  s.player.heading = 0; s.player.velocity = { x: 0, y: 0, z: 0 };
  makeCheckpoint(s);
  return s;
}
function advance(s: GameState, frames: number, input: Partial<Input> = {}) {
  for (let i = 0; i < frames; i++) step(s, { ...EMPTY_INPUT, ...input });
}
function food(s: GameState) {
  const item = { id: s.world.nextId++, pos: { ...s.player.pos }, amount: 12, max: 12, kind: 'algae' as const, patch: 0, regen: 0 };
  s.world.resources.push(item); return item;
}

describe('independent journey ability recharge', () => {
  it.each(['tend', 'feed', 'bond', 'offer'] as const)('allows %s after the short pulse lock while the toxin still recharges', action => {
    const s = fixture(['toxin', 'symbiote']), site = s.journey.sites[0];
    if (action === 'feed') food(s);
    if (action === 'bond') {
      const partner = spawnCreature(s.world, 'lantern', 0);
      Object.assign(partner, { pos: { ...s.player.pos }, health: 100, hunger: 0, cooldown: 20 });
      s.world.creatures.push(partner);
    }
    if (action === 'offer') s.journey.cargo = { site: site.id, kind: 'algae', purpose: 'culture', vitality: 100, distance: 0 };
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(s.player.abilityRecharge).toBe(7);
    expect(s.player.cooldown).toBe(.25);
    step(s, { ...EMPTY_INPUT, [action]: true });
    expect(site.observed).toBe(false); expect(s.player.meals).toBe(0);
    expect(s.player.bonds).toHaveLength(0); expect(s.journey.offerings).toHaveLength(0);
    advance(s, 15);
    if (action === 'tend') expect(journeyAction(s)?.ready).toBe(true);
    if (action === 'feed') expect(feedTarget(s)?.ready).toBe(true);
    if (action === 'bond') expect(bondTarget(s)?.ready).toBe(true);
    step(s, { ...EMPTY_INPUT, [action]: true });
    if (action === 'tend') expect(site.observed).toBe(true);
    if (action === 'feed') expect(s.player.meals).toBe(1);
    if (action === 'bond') expect(s.player.bonds).toHaveLength(1);
    if (action === 'offer') { expect(s.journey.cargo).toBeNull(); expect(s.journey.offerings).toHaveLength(1); }
    expect(s.player.abilityRecharge).toBeCloseTo(7 - 17 / 60);
    expect(abilityPulse(s)?.progress).toBeCloseTo(17 / 60 / 1.3);
  });

  it('casts a defensive pulse during eating and gives X precedence over held Space', () => {
    const s = fixture(); food(s);
    step(s, { ...EMPTY_INPUT, feed: true });
    expect(s.player.meals).toBe(1); expect(s.player.cooldown).toBe(1.1);
    const energy = s.player.energy;
    step(s, { ...EMPTY_INPUT, pulse: true, feed: true });
    expect(s.player.abilityRecharge).toBe(7);
    expect(s.player.energy).toBeCloseTo(energy - 15, 1);
    expect(s.player.meals).toBe(1);
    expect(s.player.cooldown).toBeCloseTo(1.1 - 1 / 60);
    const ready = fixture(); food(ready);
    step(ready, { ...EMPTY_INPUT, pulse: true, feed: true });
    expect(ready.player.abilityRecharge).toBe(7); expect(ready.player.meals).toBe(0);
  });

  it.each([['toxin', 7, 15], ['sonar', 4, 3]] as const)('retains the %s price and recharge and cannot repeat it early', (kind, duration, cost) => {
    const s = fixture([kind]);
    const energy = s.player.energy;
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(s.player.energy).toBeCloseTo(energy - cost, 1);
    expect(s.player.abilityRecharge).toBe(duration);
    advance(s, duration * 60 - 2, { pulse: true });
    expect(s.player.abilityRecharge).toBeCloseTo(2 / 60);
    expect(s.player.energy).toBeGreaterThan(energy - cost - 2);
    advance(s, 3, { pulse: true });
    expect(s.player.abilityRecharge).toBeGreaterThan(duration - .05);
    expect(s.player.energy).toBeLessThan(energy - cost * 2);
  });

  it('keeps the sonar fallback when toxin is unaffordable, without a false toxin ring', () => {
    const s = fixture(['toxin', 'sonar']); s.player.energy = 10;
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(s.player.abilityRecharge).toBe(4); expect(s.player.scan).toBe(5);
    expect(abilityPulse(s)).toMatchObject({ color: 0x93def0, progress: 0 });
    s.player.energy = 2; advance(s, 241, { pulse: true });
    expect(s.player.abilityRecharge).toBe(0);
    expect(s.player.scan).toBeLessThan(1);
  });

  it('ordinary actions never overwrite the seven-second recharge or restart its visual pulse', () => {
    const s = fixture(); food(s);
    step(s, { ...EMPTY_INPUT, pulse: true });
    advance(s, 120, { feed: true, pulse: true });
    expect(s.player.meals).toBeGreaterThan(0);
    expect(s.player.abilityRecharge).toBeCloseTo(5);
    expect(abilityPulse(s)).toBeNull();
    expect(s.player.cooldown).toBeLessThanOrEqual(1.1);
  });

  it('preserves legacy shared cooldowns and the old simultaneous input ordering', () => {
    const s = fixture(['toxin'], true); food(s);
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(s.player.cooldown).toBe(7); expect(s.player.abilityRecharge).toBe(0);
    advance(s, 60, { feed: true, pulse: true });
    expect(s.player.meals).toBe(0); expect(s.player.cooldown).toBeCloseTo(6);
    const ready = fixture(['toxin'], true); food(ready);
    step(ready, { ...EMPTY_INPUT, pulse: true, feed: true });
    expect(ready.player.meals).toBe(1); expect(ready.player.cooldown).toBe(1.1);
    expect(ready.player.abilityRecharge).toBe(0);
  });
});

describe('ability recharge persistence', () => {
  it('retains an active recharge in the save and checkpoint, with deterministic continuation', () => {
    const s = fixture(); step(s, { ...EMPTY_INPUT, pulse: true }); advance(s, 36);
    makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s));
    expect(loaded.player.abilityRecharge).toBe(s.player.abilityRecharge);
    expect(JSON.parse(loaded.checkpoint!).player.abilityRecharge).toBe(s.player.abilityRecharge);
    advance(s, 120, { pulse: true }); advance(loaded, 120, { pulse: true });
    expect(loaded.player).toEqual(s.player); expect(loaded.world).toEqual(s.world);
    const recovered = recoverGeneration(loaded);
    expect(recovered.player.abilityRecharge).toBeCloseTo(6.4);
    step(recovered, { ...EMPTY_INPUT, pulse: true });
    expect(recovered.player.abilityRecharge).toBeCloseTo(6.4 - 1 / 60);
  });

  it.each([false, true])('explicitly migrates a missing timer and checkpoint (legacy = %s)', legacy => {
    const s = fixture(['toxin'], legacy); s.player.cooldown = 6.2; makeCheckpoint(s);
    const old = JSON.parse(serializeGame(s));
    delete old.state.player.abilityRecharge;
    const checkpoint = JSON.parse(old.state.checkpoint); delete checkpoint.player.abilityRecharge;
    old.state.checkpoint = JSON.stringify(checkpoint);
    const loaded = parseGame(JSON.stringify(old));
    const expected = legacy ? 0 : 6.2;
    expect(loaded.player.abilityRecharge).toBe(expected);
    expect(JSON.parse(loaded.checkpoint!).player.abilityRecharge).toBe(expected);
    expect(loaded.player.cooldown).toBe(legacy ? 6.2 : .25);
    expect(JSON.parse(loaded.checkpoint!).player.cooldown).toBe(legacy ? 6.2 : .25);
    expect(parseGame(serializeGame(loaded))).toEqual(loaded);
  });

  it('migrates a missing timer with no ability to ready, keeping an ordinary cooldown', () => {
    const s = fixture([]); s.player.cooldown = .8;
    const old = JSON.parse(serializeGame(s)); delete old.state.player.abilityRecharge;
    const loaded = parseGame(JSON.stringify(old));
    expect(loaded.player.abilityRecharge).toBe(0); expect(loaded.player.cooldown).toBe(.8);
  });

  it.each([-1, 7.01, null, '7'])('rejects a present malformed recharge %s including checkpoints', recharge => {
    const valid = serializeGame(fixture());
    const direct = JSON.parse(valid); direct.state.player.abilityRecharge = recharge;
    expect(() => parseGame(JSON.stringify(direct))).toThrow('player.abilityRecharge');
    const nested = JSON.parse(valid), checkpoint = JSON.parse(nested.state.checkpoint);
    checkpoint.player.abilityRecharge = recharge; nested.state.checkpoint = JSON.stringify(checkpoint);
    expect(() => parseGame(JSON.stringify(nested))).toThrow('player.abilityRecharge');
  });

  it('does not turn unrelated unknown fields into a compatible old save', () => {
    const old = JSON.parse(serializeGame(fixture())); delete old.state.player.abilityRecharge;
    old.state.player.pulseDuration = 99;
    expect(() => parseGame(JSON.stringify(old))).toThrow('player');
  });
});
