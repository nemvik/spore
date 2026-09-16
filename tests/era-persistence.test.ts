import { describe, expect, it } from 'vitest';
import { emptyMachines, emptyPlanet, emptyTribe } from '../src/game/era-types';
import { genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import type { GameState } from '../src/game/types';
import { createWorld } from '../src/game/world';

/** Prepared schema fixture, not evidence of a naturally completed campaign. */
function wonCoast(legacy = false): GameState {
  const state = createGame(481516, legacy, !legacy, !legacy);
  for (const stage of [1, 2] as const) {
    state.stage = stage;
    state.world = createWorld(state.seed, stage);
    state.worlds[stage] = state.world;
    initializeJourneyStage(state);
  }
  state.player.genome.parts.push(
    { id: 'era-legs', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: true },
    { id: 'era-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
  );
  state.player.totalDna = 200;
  state.player.dna = genomeCost(initialGenome()) + state.player.totalDna - genomeCost(state.player.genome);
  Object.assign(state.campaign, { won: true, finale: 'restoration' });
  if (!legacy) {
    const site = state.journey.sites.find(site => site.id === 8)!;
    state.journey.cargo = { kind: 'nectar', purpose: 'culture', site: site.id, vitality: 72, distance: 12 };
  }
  makeCheckpoint(state);
  return state;
}

function eraState(stage: 3 | 4 | 5 = 3, legacy = false): GameState {
  const state = wonCoast(legacy);
  state.stage = stage;
  state.tribe = emptyTribe();
  if (stage >= 4) state.machines = emptyMachines();
  if (stage === 5) state.planet = emptyPlanet();
  makeCheckpoint(state);
  return state;
}

function populatedTribe(): GameState {
  const state = eraState();
  state.tribe!.food = 35.5;
  state.tribe!.members = [{ id: 1, pos: { x: 1, y: 2, z: 3 }, heading: -Math.PI, health: 95, hunger: 12, tool: 'spear' }];
  state.tribe!.huts = [{ id: 1, kind: 'workshop', pos: { x: -1, y: 2, z: 3 }, tool: null }];
  state.tribe!.unlocked = ['spear'];
  state.tribe!.neighbours = [{ id: 1, pos: { x: 12, y: 2, z: -3 }, relation: -50, resolved: null }];
  makeCheckpoint(state);
  return state;
}

function changed(state: GameState, change: (state: Record<string, any>) => void): string {
  const envelope = JSON.parse(serializeGame(state));
  change(envelope.state);
  return JSON.stringify(envelope);
}

function oldSave(state: GameState, version: 1 | 2): string {
  const envelope = JSON.parse(serializeGame(state));
  const downgrade = (state: Record<string, any>) => {
    state.version = version;
    if (version === 1) delete state.journey;
    if (state.checkpoint) {
      const checkpoint = JSON.parse(state.checkpoint);
      downgrade(checkpoint);
      state.checkpoint = JSON.stringify(checkpoint);
    }
  };
  envelope.version = version;
  downgrade(envelope.state);
  return JSON.stringify(envelope);
}

describe('era save version and coastal world compatibility', () => {
  it.each([1, 2] as const)('migrates v%i state and checkpoint without adding an era or changing the earned coast victory', version => {
    const state = wonCoast(true), input = oldSave(state, version);
    const restored = parseGame(input);
    expect(restored.version).toBe(3);
    expect(JSON.parse(restored.checkpoint!).version).toBe(3);
    expect(restored.stage).toBe(2);
    expect(restored.tribe).toBeUndefined();
    expect(restored.machines).toBeUndefined();
    expect(restored.planet).toBeUndefined();
    for (const field of ['player', 'campaign', 'lineage', 'worlds'] as const) expect(restored[field]).toEqual(state[field]);
    expect(restored.world).toBe(restored.worlds[2]);
    const rewritten = JSON.parse(serializeGame(restored));
    expect(rewritten.version).toBe(3);
    expect(rewritten.state.version).toBe(3);
  });

  it('migrates a current journey v2 without changing its canopy, roots, physiology or carried culture', () => {
    const state = wonCoast(), restored = parseGame(oldSave(state, 2));
    expect(restored.journey).toEqual(state.journey);
    expect(restored.worlds).toEqual(state.worlds);
    expect(restored.tribe).toBeUndefined();
  });

  it.each([3, 4, 5] as const)('round-trips stage %i on the same three coastal worlds with all reached slices', stage => {
    const state = eraState(stage), restored = parseGame(serializeGame(state));
    expect(restored).toEqual(state);
    expect(restored.worlds).toHaveLength(3);
    expect(restored.world).toBe(restored.worlds[2]);
    expect(restored.world.stage).toBe(2);
    expect(restored.journey.cargo).toEqual(state.journey.cargo);
    expect(restored.campaign.finale).toBe('restoration');
  });

  it('recovers a tribe checkpoint with the coastal alias and inherited ecology intact', () => {
    const state = populatedTribe();
    const restored = recoverGeneration(parseGame(serializeGame(state)));
    expect(restored.stage).toBe(3);
    expect(restored.world).toBe(restored.worlds[2]);
    expect(restored.tribe).toEqual(state.tribe);
    expect(restored.journey).toEqual(state.journey);
    expect(restored.player.genome).toEqual(state.player.genome);
    expect(() => serializeGame(restored)).not.toThrow();
  });

  it.each([1, 2] as const)('rejects stage 3 injected into a v%i save even without new slice fields', version => {
    const envelope = JSON.parse(oldSave(wonCoast(true), version));
    envelope.state.stage = 3;
    expect(() => parseGame(JSON.stringify(envelope))).toThrow('state.stage');
  });

  it('rejects a mismatched envelope/state version and unknown versions', () => {
    const text = serializeGame(eraState());
    for (const version of [1, 2, 0, 4, 999, '3', null]) {
      const envelope = JSON.parse(text); envelope.version = version;
      expect(() => parseGame(JSON.stringify(envelope))).toThrow('verze');
    }
    expect(() => parseGame(changed(eraState(), state => { state.version = 4; }))).toThrow('verze');
  });

  it('requires an intact coastal alias, three worlds, and the inherited land anatomy', () => {
    const state = eraState();
    for (const mutate of [
      (s: Record<string, any>) => { s.worlds[2] = null; },
      (s: Record<string, any>) => { s.world.stage = 3; },
      (s: Record<string, any>) => { s.world.time += 1; },
      (s: Record<string, any>) => { s.worlds.push(s.world); },
      (s: Record<string, any>) => { s.player.genome.parts = s.player.genome.parts.filter((p: { kind: string }) => p.kind !== 'legs'); },
    ]) expect(() => parseGame(changed(state, mutate))).toThrow('Poškozená');
  });
});

describe('era slice validation', () => {
  it('accepts fully validated tribe records and nullable equipment', () => {
    const state = populatedTribe();
    expect(parseGame(serializeGame(state)).tribe).toEqual(state.tribe);
  });

  it.each(['tribe', 'machines', 'planet'] as const)('rejects a missing required %s, early slice, null slice and unknown slice version', key => {
    const reached = eraState(5), coast = wonCoast();
    expect(() => parseGame(changed(reached, state => { delete state[key]; }))).toThrow(`state.${key}`);
    expect(() => parseGame(changed(coast, state => { state[key] = reached[key]; }))).toThrow(`state.${key}`);
    expect(() => parseGame(changed(reached, state => { state[key] = null; }))).toThrow(`state.${key}`);
    expect(() => parseGame(changed(reached, state => { state[key].version = 3; }))).toThrow(`state.${key}.version`);
  });

  it('rejects future slices in the intermediate eras', () => {
    expect(() => parseGame(changed(eraState(3), state => { state.machines = emptyMachines(); }))).toThrow('state.machines');
    expect(() => parseGame(changed(eraState(4), state => { state.planet = emptyPlanet(); }))).toThrow('state.planet');
  });

  it('requires the completed organism finale throughout new eras', () => {
    for (const stage of [3, 4, 5] as const) {
      expect(() => parseGame(changed(eraState(stage), state => { state.campaign.won = false; state.campaign.finale = null; }))).toThrow('campaign');
      expect(() => parseGame(changed(eraState(stage), state => { state.campaign.finale = null; }))).toThrow('campaign');
    }
  });

  it('rejects unknown and missing tribe fields, invalid numbers, IDs, positions, text and enums', () => {
    const state = populatedTribe();
    const mutations: ((state: Record<string, any>) => void)[] = [
      s => { s.tribe.extra = true; },
      s => { delete s.tribe.food; },
      s => { s.tribe.food = -1; },
      s => { s.tribe.food = Infinity; },
      s => { s.tribe.members = [null]; },
      s => { delete s.tribe.members[0].tool; },
      s => { s.tribe.members[0].extra = 1; },
      s => { s.tribe.members[0].id = 0; },
      s => { s.tribe.members[0].id = 1.5; },
      s => { s.tribe.members.push(s.tribe.members[0]); },
      s => { s.tribe.members[0].pos.x = Infinity; },
      s => { s.tribe.members[0].pos.z = 1025; },
      s => { s.tribe.members[0].heading = '0'; },
      s => { s.tribe.members[0].health = 101; },
      s => { s.tribe.members[0].hunger = -1; },
      s => { s.tribe.members[0].tool = ''; },
      s => { s.tribe.members[0].tool = 'x'.repeat(65); },
      s => { s.tribe.huts[0].kind = 'castle'; },
      s => { s.tribe.huts[0].pos.y = null; },
      s => { s.tribe.huts.push(s.tribe.huts[0]); },
      s => { s.tribe.unlocked = ['spear', 'spear']; },
      s => { s.tribe.unlocked = [false]; },
      s => { s.tribe.unlocked = ['bad\u0000tool']; },
      s => { s.tribe.neighbours[0].relation = -101; },
      s => { s.tribe.neighbours[0].resolved = 'traded'; },
      s => { s.tribe.neighbours.push(s.tribe.neighbours[0]); },
      s => { s.tribe.members = Array.from({ length: 65 }, (_, i) => ({ ...s.tribe.members[0], id: i + 1 })); },
      s => { s.tribe.huts = Array.from({ length: 65 }, (_, i) => ({ ...s.tribe.huts[0], id: i + 1 })); },
      s => { s.tribe.neighbours = Array.from({ length: 17 }, (_, i) => ({ ...s.tribe.neighbours[0], id: i + 1 })); },
      s => { s.tribe.unlocked = Array.from({ length: 65 }, (_, i) => `tool-${i}`); },
    ];
    for (const mutate of mutations) expect(() => parseGame(changed(state, mutate)), mutate.toString()).toThrow('state.tribe');
  });

  it('rejects unimplemented machine and planet content and out-of-range scalar fields', () => {
    const state = eraState(5);
    for (const mutate of [
      (s: Record<string, any>) => { s.machines.resource = -1; },
      (s: Record<string, any>) => { s.machines.extra = 0; },
      (s: Record<string, any>) => { s.machines.blueprints = [{}]; },
      (s: Record<string, any>) => { s.machines.fleet = [{}]; },
      (s: Record<string, any>) => { s.machines.regions = [{}]; },
      (s: Record<string, any>) => { s.planet.temperature = 1.1; },
      (s: Record<string, any>) => { s.planet.atmosphere = -1.1; },
      (s: Record<string, any>) => { s.planet.tScore = 4; },
      (s: Record<string, any>) => { s.planet.stabilizers = [{}]; },
      (s: Record<string, any>) => { delete s.planet.stabilizers; },
    ]) expect(() => parseGame(changed(state, mutate))).toThrow('Poškozená');
  });
});

describe('era checkpoint boundaries', () => {
  it('rejects a coastal checkpoint carried into the tribe era', () => {
    const state = eraState();
    const coast = wonCoast(); coast.id = state.id; makeCheckpoint(coast);
    expect(() => parseGame(changed(state, s => { s.checkpoint = coast.checkpoint; }))).toThrow('checkpoint');
  });

  it('rejects a tribe checkpoint carried into a later era and a future checkpoint', () => {
    const later = eraState(4), tribe = eraState(3); tribe.id = later.id; makeCheckpoint(tribe);
    expect(() => parseGame(changed(later, s => { s.checkpoint = tribe.checkpoint; }))).toThrow('checkpoint');
    expect(() => parseGame(changed(tribe, s => { s.checkpoint = later.checkpoint; }))).toThrow('checkpoint');
  });

  it('validates malformed slice contents inside checkpoints', () => {
    expect(() => parseGame(changed(populatedTribe(), s => {
      const checkpoint = JSON.parse(s.checkpoint);
      checkpoint.tribe.members[0].health = -1;
      s.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('state.tribe.members[0].health');
  });
});
