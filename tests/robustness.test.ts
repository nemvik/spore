import { afterEach, describe, expect, it, vi } from 'vitest';
import { cloneGenome, computeStats } from '../src/game/genome';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { createGame, evolve, makeCheckpoint, recoverGeneration, senseRange, statsFor, step } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { EMPTY_INPUT } from '../src/game/types';
import type { AdaptationId, GameState, Input, Part, Resource } from '../src/game/types';

// These are prepared regression fixtures. Direct fixture setup is not playthrough,
// elapsed play-time, population-soak or campaign-progression evidence.
function part(kind: AdaptationId): Part {
  return { id: `fixture-${kind}`, kind, axial: 0, angle: 0, scale: 1, mirrored: false };
}
function withParts(state: GameState, ...kinds: AdaptationId[]) {
  state.player.genome = cloneGenome(state.player.genome);
  state.player.genome.parts.push(...kinds.map(part));
  state.player.health = computeStats(state.player.genome).maxHealth;
}
function sonarFixture() {
  const state = createGame(481516);
  state.stage = 1;
  state.world = createWorld(state.seed, 1);
  state.worlds[1] = state.world;
  state.player.pos = { ...state.world.landmarks[0].pos };
  withParts(state, 'sonar', 'symbiote', 'gills');
  state.player.bonds = [{ species: 'lantern', benefit: 'light', loyalty: 70, hunger: 20, age: 130 }];
  makeCheckpoint(state);
  return state;
}
function jawFixture(energy: number) {
  const state = createGame(481516);
  state.player.genome = cloneGenome(state.player.genome);
  state.player.genome.parts = state.player.genome.parts.filter(p => p.kind !== 'filter');
  withParts(state, 'jaw');
  const prey = state.world.creatures.find(c => c.species === 'veil')!;
  prey.pos = { ...state.player.pos, x: state.player.pos.x + 1 };
  prey.velocity = { x: 0, y: 0, z: 0 };
  state.world.creatures = [prey]; state.world.resources = [];
  state.player.energy = energy;
  makeCheckpoint(state);
  return { state, prey };
}
afterEach(() => vi.unstubAllGlobals());

describe('editor draft and persistent generation regressions [prepared fixtures]', () => {
  it.each(['add', 'remove'] as const)('evolves a cached draft after %s armor and checkpoints the actual new health', (operation) => {
    const state = createGame(20260913);
    state.player.dna = 100; state.player.totalDna = 100;
    if (operation === 'remove') withParts(state, 'shell');
    makeCheckpoint(state);
    const draft = cloneGenome(state.player.genome);
    const previouslyRenderedHealth = statsFor(draft).maxHealth;
    if (operation === 'remove') draft.parts = draft.parts.filter((attachment) => attachment.kind !== 'shell');
    else draft.parts.push(part('shell'));
    const actualHealth = computeStats(draft).maxHealth;
    expect(actualHealth).not.toBe(previouslyRenderedHealth);
    expect(evolve(state, draft).ok).toBe(true);
    expect(state.player.genome).not.toBe(draft);
    expect(state.player.health).toBe(actualHealth);
    const loaded = parseGame(serializeGame(state));
    const restored = recoverGeneration(loaded);
    expect(restored.player.health).toBe(actualHealth);
    expect(restored.player.genome).toEqual(draft);
    expect(() => serializeGame(restored)).not.toThrow();
  });

  it('loading a late-session save retains both newer ecology and the older reproduction checkpoint', () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
    });
    const state = createGame(8675309);
    state.tick = 72_000; state.world.time = 1200; // Isolates late-session counters, not elapsed play.
    state.player.dna = 100; state.player.totalDna = 100;
    const draft = cloneGenome(state.player.genome); draft.parts.push(part('shell'));
    expect(evolve(state, draft).ok).toBe(true);
    const generation = JSON.parse(state.checkpoint!) as GameState;
    const source = state.world.resources.at(-1)!;
    state.player.pos = { ...source.pos };
    step(state, { ...EMPTY_INPUT, feed: true });
    expect(state.player.meals).toBe(generation.player.meals + 1);
    expect(saveGame(state)).toEqual({ ok: true });

    const loaded = loadGame(state.id);
    expect(loaded.tick).toBe(72_001);
    expect(loaded.world.resources).toEqual(state.world.resources);
    expect(loaded.checkpoint).toBe(state.checkpoint);
    const savedBytes = stored.get(`lumavora:save:${state.id}`);
    const recovered = recoverGeneration(loaded);
    expect(recovered.tick).toBe(72_000);
    expect(recovered.player.genome).toEqual(generation.player.genome);
    expect(recovered.world.resources).toEqual(generation.world.resources);
    expect(recovered.world.patches).toEqual(generation.world.patches);
    expect(recovered.world).toBe(recovered.worlds[recovered.stage]);
    expect(stored.get(`lumavora:save:${state.id}`)).toBe(savedBytes);
    expect(saveGame(recovered).ok).toBe(true);
    expect(loadGame(state.id).checkpoint).toBe(recovered.checkpoint);
  });
});

describe('active perception and defense regressions [prepared fixtures]', () => {
  it('adds paid sonar range temporarily above both passive organs and a living light partner', () => {
    const state = sonarFixture();
    const passive = statsFor(state.player.genome).sense;
    expect(senseRange(state)).toBe(passive + 16);
    const beforeEnergy = state.player.energy;
    step(state, { ...EMPTY_INPUT, pulse: true });
    expect(beforeEnergy - state.player.energy).toBeGreaterThanOrEqual(3);
    expect(senseRange(state)).toBeGreaterThan(passive + 16);
    const savedDuringScan = parseGame(serializeGame(state));
    expect(senseRange(savedDuringScan)).toBe(senseRange(state));
    expect(state.player.scan).toBe(5);
    for (let i = 0; i < 330; i++) step(state, EMPTY_INPUT);
    expect(senseRange(state)).toBe(passive + 16);
    state.player.bonds[0].loyalty = 0;
    expect(senseRange(state)).toBe(passive);
  });

  it.each(['feed', 'tend'] as const)('%s cooldown does not impersonate an active sonar pulse', (interaction) => {
    const state = sonarFixture();
    const source = state.world.resources.at(-1)!;
    state.player.pos = { ...source.pos };
    const passiveRange = senseRange(state);
    const input: Input = { ...EMPTY_INPUT, [interaction]: true };
    step(state, input);
    expect(state.player.cooldown).toBeGreaterThan(0);
    if (interaction === 'feed') expect(state.player.meals).toBe(1);
    else expect(state.world.patches.reduce((sum, patch) => sum + patch.restored, 0)).toBe(1);
    expect(senseRange(state)).toBe(passiveRange);
    expect(state.player.energy).toBeGreaterThanOrEqual(0);
    expect(parseGame(serializeGame(state)).player.energy).toBe(state.player.energy);
  });

  it('uses affordable sonar below the toxin cost, and cannot scan without three energy', () => {
    const state = sonarFixture(); withParts(state, 'toxin');
    const passiveRange = senseRange(state);
    state.player.energy = 10;
    step(state, { ...EMPTY_INPUT, pulse: true });
    expect(state.player.scan).toBe(5);
    expect(state.player.energy).toBeLessThan(7);
    expect(senseRange(state)).toBeGreaterThan(passiveRange);

    const starved = sonarFixture(); starved.player.energy = 2.5;
    step(starved, { ...EMPTY_INPUT, pulse: true });
    expect(starved.player.scan).toBe(0);
    expect(senseRange(starved)).toBe(passiveRange);
    expect(starved.player.cooldown).toBe(0);
    for (const result of [state, starved]) {
      expect(result.player.energy).toBeGreaterThanOrEqual(0);
      expect(parseGame(serializeGame(result)).player.energy).toBe(result.player.energy);
    }
  });

  it('a toxin pulse reverses a predator from hunting toward the player to moving away', () => {
    const state = createGame(481516); withParts(state, 'toxin');
    const predator = state.world.creatures.find((creature) => creature.species === 'needle')!;
    predator.pos = { x: 6, y: state.player.pos.y, z: 0 };
    predator.velocity = { x: 0, y: 0, z: 0 }; predator.hunger = 70;
    state.world.creatures = [predator]; state.tick = 29;
    makeCheckpoint(state);
    const withoutPulse = parseGame(serializeGame(state));
    step(withoutPulse, EMPTY_INPUT);
    expect(withoutPulse.world.creatures[0].intent).toBe('hunt');
    expect(withoutPulse.world.creatures[0].velocity.x).toBeLessThan(0);

    step(state, { ...EMPTY_INPUT, pulse: true });
    expect(predator.health).toBeGreaterThan(0);
    expect(predator.intent).toBe('flee');
    expect(predator.velocity.x).toBeGreaterThan(0);
    expect(predator.pos.x).toBeGreaterThan(6);
    expect(predator.fear).toBeGreaterThan(9);
    expect(state.player.energy).toBeLessThan(75);
    expect(state.player.energy).toBeGreaterThanOrEqual(0);
    expect(parseGame(serializeGame(state)).player.energy).toBe(state.player.energy);
  });
});

describe('paid attacks preserve valid energy and saves [prepared encounters]', () => {
  it('refuses an unaffordable jaw attack without damaging prey or invalidating a save', () => {
    for (const energy of [0, 0.5, 1.59, 1.6]) {
      const { state, prey } = jawFixture(energy);
      const health = prey.health;
      // Baseline metabolism is paid before the action, including at the 1.6 boundary.
      step(state, { ...EMPTY_INPUT, feed: true });
      expect(prey.health).toBe(health);
      expect(prey.fear).toBe(0);
      expect(state.player.kills).toBe(0);
      expect(state.player.cooldown).toBeGreaterThan(0);
      expect(state.messages.at(-1)?.text).toContain('energie');
      expect(state.player.energy).toBeGreaterThanOrEqual(0);
      const loaded = parseGame(serializeGame(state));
      expect(loaded.player.energy).toBe(state.player.energy);
      expect(loaded.world.creatures[0].health).toBe(health);
    }
  });

  it('a funded jaw attack damages prey, pays its cost and leaves a reloadable state', () => {
    for (const energy of [2, 90]) {
      const { state, prey } = jawFixture(energy);
      const health = prey.health;
      step(state, { ...EMPTY_INPUT, feed: true });
      expect(prey.health).toBe(health - statsFor(state.player.genome).damage);
      expect(prey.fear).toBeGreaterThan(4);
      expect(energy - state.player.energy).toBeGreaterThanOrEqual(1.6);
      expect(state.player.energy).toBeGreaterThanOrEqual(0);
      const loaded = parseGame(serializeGame(state));
      expect(loaded.player.energy).toBe(state.player.energy);
      expect(loaded.world.creatures[0].health).toBe(prey.health);
    }
  });
});

describe('explicit scan timer save compatibility', () => {
  it('migrates a missing v1 timer in both the player and the recoverable checkpoint', () => {
    const state = sonarFixture();
    const envelope = JSON.parse(serializeGame(state));
    delete envelope.state.player.scan;
    const checkpoint = JSON.parse(envelope.state.checkpoint);
    delete checkpoint.player.scan;
    envelope.state.checkpoint = JSON.stringify(checkpoint);
    const loaded = parseGame(JSON.stringify(envelope));
    expect(loaded.player.scan).toBe(0);
    expect(JSON.parse(loaded.checkpoint!).player.scan).toBe(0);
    const recovered = recoverGeneration(loaded);
    step(recovered, EMPTY_INPUT);
    expect(recovered.player.scan).toBe(0);
    expect(() => serializeGame(recovered)).not.toThrow();
  });

  it('rejects present invalid scan values and unrelated unknown fields instead of migrating them', () => {
    for (const scan of [-1, 5.1, null, '5']) {
      const envelope = JSON.parse(serializeGame(sonarFixture()));
      envelope.state.player.scan = scan;
      expect(() => parseGame(JSON.stringify(envelope))).toThrow('player.scan');
    }
    const envelope = JSON.parse(serializeGame(sonarFixture()));
    delete envelope.state.player.scan;
    envelope.state.player.scanDuration = 99;
    expect(() => parseGame(JSON.stringify(envelope))).toThrow('neznámá pole');
  });
});

describe('resource retention under repeated corpse pressure [prepared fixture]', () => {
  it('prunes old or empty meat across repeated cleanup cycles without deleting planted sources', () => {
    const state = createGame(20260913);
    const plantedIds = state.world.resources.map((resource) => resource.id);
    for (let cycle = 0; cycle < 6; cycle++) {
      const added: Resource[] = Array.from({ length: 220 }, (_, index) => ({
        id: state.world.nextId++, kind: 'meat', pos: { x: 70, y: 1.1, z: 70 },
        amount: index % 4 === 0 ? 0 : 3, max: 3, patch: index % 3, regen: 0,
      }));
      state.world.resources.push(...added);
      // Schedule one cleanup boundary; this is a stress fixture, not a wall-clock soak.
      state.tick = (cycle + 1) * 1800 - 1;
      step(state, EMPTY_INPUT);
      const planted = state.world.resources.filter((resource) => resource.kind !== 'meat');
      const remains = state.world.resources.filter((resource) => resource.kind === 'meat');
      expect(planted.map((resource) => resource.id)).toEqual(plantedIds);
      expect(remains).toHaveLength(40);
      expect(remains.every((resource) => resource.amount >= 0.2)).toBe(true);
      expect(remains.map((resource) => resource.id)).toEqual(added.filter((resource) => resource.amount >= 0.2).slice(-40).map((resource) => resource.id));
      expect(() => serializeGame(state)).not.toThrow();
    }
  });
});
