import { describe, expect, it } from 'vitest';
import { getClimate } from '../src/game/climate';
import { CHAPTERS } from '../src/game/content';
import { emptyMachines, emptyPlanet, emptyTribe } from '../src/game/era-types';
import type { TribePreviewState } from '../src/game/era-types';
import { cloneGenome, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { parseGame, serializeGame } from '../src/game/persistence';
import {
  awaitingOrganismVictory, continueToTribeEra, createGame, evolve, foundTribeFromPreview, makeCheckpoint,
  recoverGeneration, returnToCoast, statsFor, step, transitionRequirements, transitionStatus, tryTransition,
} from '../src/game/simulation';
import type { WorldStage } from '../src/game/stage';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState } from '../src/game/types';
import { createWorld } from '../src/game/world';

/** Prepared completed campaigns isolate the opt-in boundary, not earned play.
 * Authored worlds and journey references stay intact and the fixture is a valid
 * save, including installed-body DNA accounting and its existing partner. */
function completedCoast(legacy: boolean): GameState {
  const state = createGame(481516, legacy, !legacy, !legacy);
  for (const stage of [1, 2] as const) {
    state.stage = stage;
    state.world = createWorld(state.seed, stage);
    state.worlds[stage] = state.world;
    initializeJourneyStage(state);
    state.lineage.push({ ...structuredClone(state.lineage[0]), stage, event: CHAPTERS[stage].title });
  }
  state.player.genome = cloneGenome(state.player.genome);
  for (const kind of ['legs', 'lungs', 'symbiote'] as const) {
    state.player.genome.parts.push({ id: `era-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  }
  state.player.health = statsFor(state.player.genome).maxHealth;
  state.player.totalDna = 300;
  state.player.dna = genomeCost(initialGenome()) + state.player.totalDna - genomeCost(state.player.genome);
  state.player.pos = { ...state.world.landmarks[0].pos };
  state.player.bonds.push({ species: 'gloom', benefit: 'recycle', loyalty: 68, hunger: 29, age: 150 });
  state.world.resources[0].amount = .25;
  state.world.patches[1].fertility = .52;
  Object.assign(state.campaign, { won: true, finale: 'migration', drought: .61 });
  state.lineage.push({ ...structuredClone(state.lineage[0]), stage: 2, event: 'Dokončené pobřeží' });
  makeCheckpoint(state);
  return state;
}

function retainedCoast(state: GameState) {
  return structuredClone({ player: state.player, worlds: state.worlds, world: state.world,
    journey: state.journey, campaign: state.campaign, rng: state.rng, tick: state.tick, climate: getClimate(state) });
}

type PreviewGame = GameState & { tribe: TribePreviewState };

/** Explicit historical P0 fixture: normal P1 entry must never manufacture v1. */
function historicalPreview(coast: GameState): PreviewGame {
  const state = Object.assign(coast, { stage: 3 as const, tribe: emptyTribe() });
  state.lineage.push({ generation: state.player.generation, stage: 3, time: state.tick / 60,
    name: state.player.genome.name, parts: state.player.genome.parts.map(part => part.kind), event: CHAPTERS[3].title });
  makeCheckpoint(state);
  return state;
}

describe.each([true, false])('explicit playable tribe entry, legacy=%s', legacy => {
  it('waits at the earned organism ending until explicit entry, then retains the entire coast', () => {
    const state = parseGame(serializeGame(completedCoast(legacy)));
    const before = retainedCoast(state), history = structuredClone(state.lineage), world = state.world;
    expect(awaitingOrganismVictory(state)).toBe(true);
    step(state, { ...EMPTY_INPUT, x: 1, feed: true });
    expect(retainedCoast(state)).toEqual(before);
    expect(state.stage).toBe(2);
    expect(state).not.toHaveProperty('tribe');

    expect(continueToTribeEra(state)).toBe(true);
    expect(state.stage).toBe(3);
    expect(state.tribe).toMatchObject({ version: 2, legacyAbility: 'migration', elapsed: 0, completed: false });
    expect(state.tribe!.members).toHaveLength(3 + before.player.bonds.length);
    expect(state.tribe!.huts).toHaveLength(1);
    expect(state.tribe!.neighbours).toHaveLength(5);
    expect(state.tribe!.food).toBeGreaterThan(0);
    expect(state.tribe!.members.at(-1)).toMatchObject({ species: 'gloom', benefit: 'recycle', hunger: 29, loyalty: 68 });
    expect(state).not.toHaveProperty('machines');
    expect(state).not.toHaveProperty('planet');
    expect(awaitingOrganismVictory(state)).toBe(false);
    expect(state.world).toBe(world);
    expect(state.world).toBe(state.worlds[2]);
    expect(state.worlds).toHaveLength(3);
    expect(retainedCoast(state)).toEqual(before);
    expect(state.lineage.slice(0, -1)).toEqual(history);
    expect(state.lineage.at(-1)).toMatchObject({ stage: 3, event: CHAPTERS[3].title });

    const after = structuredClone(state);
    expect(continueToTribeEra(state)).toBe(false);
    expect(state).toEqual(after);
  });

  it.each([false, true])('runs the tribe while all direct body controls stay locked, sandbox=%s', sandbox => {
    const state = completedCoast(legacy); state.campaign.sandbox = sandbox;
    expect(continueToTribeEra(state)).toBe(true);
    const before = structuredClone(state), withoutBodyInput = structuredClone(state);
    for (let frame = 0; frame < 180; frame++) {
      step(state, { x: 1, z: -1, vertical: 1, sprint: true, feed: true, bond: true, tend: true, pulse: true, offer: true }, 1 / 30);
      step(withoutBodyInput, EMPTY_INPUT, 1 / 30);
    }
    expect(state).toEqual(withoutBodyInput);
    expect(state.tick).toBe(before.tick + 180);
    expect(state.world.time).toBeCloseTo(before.world.time + 6, 8);
    expect(state.tribe).toMatchObject({ version: 2, elapsed: expect.closeTo(6, 8) });
    expect(state.tribe!.members[0].hunger).toBeGreaterThan(before.tribe!.members[0].hunger);
    expect(state.player).toEqual(before.player);
    expect(state.journey).toEqual(before.journey);
    expect(awaitingOrganismVictory(state)).toBe(false);
    const after = structuredClone(state), draft = cloneGenome(state.player.genome);
    draft.hue = (draft.hue + 30) % 360;
    expect(evolve(state, draft)).toMatchObject({ ok: false, cost: 0 });
    expect(returnToCoast(state)).toBe(false);
    expect(tryTransition(state)).toBe(false);
    expect(state).toEqual(after);
  });

  it.each([false, true])('keeps the historical v1 preview frozen even with sandbox=%s', sandbox => {
    const state = historicalPreview(completedCoast(legacy));
    state.campaign.sandbox = sandbox;
    const before = structuredClone(state);
    for (let frame = 0; frame < 180; frame++) {
      step(state, { x: 1, z: -1, vertical: 1, sprint: true, feed: true, bond: true, tend: true, pulse: true, offer: true }, 1 / 30);
    }
    expect(state).toEqual(before);
    expect(awaitingOrganismVictory(state)).toBe(false);
    const draft = cloneGenome(state.player.genome); draft.hue = (draft.hue + 30) % 360;
    expect(evolve(state, draft)).toMatchObject({ ok: false, cost: 0 });
    expect(transitionRequirements(state)).toEqual([]);
    expect(transitionStatus(state)).toMatchObject({ kind: 'era', ready: false });
    expect(tryTransition(state)).toBe(false);
    expect(state).toEqual(before);
  });

  it('round-trips playable entry and restores its tribe, coast alias and complete journey checkpoint', () => {
    const state = completedCoast(legacy);
    expect(continueToTribeEra(state)).toBe(true);
    const saved = parseGame(serializeGame(state));
    expect(saved).toEqual(state);
    expect(saved.world).toBe(saved.worlds[2]);
    const restored = recoverGeneration(saved);
    expect(restored.stage).toBe(3);
    expect(restored.world).toBe(restored.worlds[2]);
    expect(restored.worlds).toEqual(state.worlds);
    expect(restored.journey).toEqual(state.journey);
    expect(restored.tribe).toEqual(state.tribe);
    expect(restored.player.genome).toEqual(state.player.genome);
    expect(restored.player.bonds).toEqual(state.player.bonds);
    expect(getClimate(restored)).toEqual(getClimate(state));
    expect(awaitingOrganismVictory(restored)).toBe(false);
    const before = structuredClone(restored);
    step(restored, { ...EMPTY_INPUT, x: 1, feed: true });
    expect(restored.tick).toBe(before.tick + 1);
    expect(restored.world.time).toBeGreaterThan(before.world.time);
    expect(restored.player).toEqual(before.player);
    expect(restored.journey).toEqual(before.journey);
    expect(restored.tribe).toMatchObject({ version: 2, elapsed: expect.closeTo(1 / 60, 8) });
    expect(returnToCoast(restored)).toBe(false);
  });

  it('loads the historical preview unchanged and founds a playable tribe only on explicit request', () => {
    const fixture = historicalPreview(completedCoast(legacy));
    const state = parseGame(serializeGame(fixture));
    expect(state).toEqual(fixture);
    expect(state.tribe).toEqual(emptyTribe());
    const restored = recoverGeneration(state), frozen = structuredClone(restored);
    step(restored, { ...EMPTY_INPUT, x: 1, feed: true });
    expect(restored).toEqual(frozen);
    const before = retainedCoast(restored), history = structuredClone(restored.lineage), world = restored.world;
    expect(foundTribeFromPreview(restored)).toBe(true);
    expect(restored.stage).toBe(3);
    expect(restored.tribe).toMatchObject({ version: 2, legacyAbility: 'migration', elapsed: 0 });
    expect(restored.tribe!.members).toHaveLength(3 + before.player.bonds.length);
    expect(restored.world).toBe(world);
    expect(retainedCoast(restored)).toEqual(before);
    expect(restored.lineage).toEqual(history);
    expect(JSON.parse(restored.checkpoint!).tribe).toEqual(restored.tribe);
    const saved = parseGame(serializeGame(restored));
    expect(saved).toEqual(restored);
    const after = structuredClone(restored);
    expect(foundTribeFromPreview(restored)).toBe(false);
    expect(returnToCoast(restored)).toBe(false);
    expect(restored).toEqual(after);
  });

  it('returns only the preview to coast sandbox without losing history or replacing the coast', () => {
    const state = completedCoast(legacy), before = retainedCoast(state), world = state.world;
    // Existing organism history may contain the same prose as the new chapter.
    state.lineage.push({ ...structuredClone(state.lineage[0]), stage: 2, event: CHAPTERS[3].title });
    const history = structuredClone(state.lineage);
    historicalPreview(state);
    expect(returnToCoast(state)).toBe(true);
    expect(state.stage).toBe(2);
    expect(state.world).toBe(world);
    expect(state.world).toBe(state.worlds[2]);
    expect(state).not.toHaveProperty('tribe');
    expect(state.lineage).toEqual(history);
    expect(retainedCoast(state)).toEqual({ ...before, campaign: { ...before.campaign, sandbox: true } });
    expect(awaitingOrganismVictory(state)).toBe(false);
    const saved = parseGame(serializeGame(state)), restored = recoverGeneration(saved);
    expect(saved).toEqual(state);
    expect(restored.stage).toBe(2);
    expect(restored.world).toBe(restored.worlds[2]);
    expect(restored).not.toHaveProperty('tribe');
    expect(restored.lineage).toEqual(history);
    expect(restored.campaign.sandbox).toBe(true);
    step(state, { ...EMPTY_INPUT, x: 1 });
    expect(state.tick).toBe(before.tick + 1);
    expect(state.world.time).toBeGreaterThan(before.world.time);
    expect(state.player.pos).not.toEqual(before.player.pos);
    expect(state.campaign.won).toBe(true);
    expect(state.campaign.finale).toBe('migration');
    expect(continueToTribeEra(state)).toBe(true);
    expect(state.tribe?.version).toBe(2);
    expect(returnToCoast(state)).toBe(false);
    expect(state.lineage.slice(0, -1)).toEqual(history);
  });
});

describe('tribe entry and return preconditions', () => {
  it.each([0, 1] as const)('does not start a tribe before coast stage (stage %i)', stage => {
    const state = createGame(481516);
    state.stage = stage; state.world = createWorld(state.seed, stage); state.worlds[stage] = state.world;
    const before = structuredClone(state);
    expect(continueToTribeEra(state)).toBe(false);
    expect(state).toEqual(before);
  });

  it.each([
    ['unfinished campaign', (state: GameState) => { state.campaign.won = false; state.campaign.finale = null; }],
    ['missing finale', (state: GameState) => { state.campaign.finale = null; }],
    ['dead body', (state: GameState) => { state.player.health = 0; }],
    ['death screen', (state: GameState) => { state.deathReason = 'fixture death'; }],
    ['existing tribe', (state: GameState) => { state.tribe = emptyTribe(); }],
  ] as const)('rejects entry for %s without mutating state', (_name, change) => {
    const state = completedCoast(false); change(state);
    const before = structuredClone(state);
    expect(continueToTribeEra(state)).toBe(false);
    expect(state).toEqual(before);
  });

  it.each([
    ['food', (state: PreviewGame) => { state.tribe.food = 1; }],
    ['member', (state: PreviewGame) => { state.tribe.members.push({ id: 1, pos: { x: 0, y: 0, z: 0 }, heading: 0, health: 100, hunger: 0, tool: null }); }],
    ['hut', (state: PreviewGame) => { state.tribe.huts.push({ id: 1, kind: 'shelter', pos: { x: 0, y: 0, z: 0 }, tool: null }); }],
    ['unlocked tool', (state: PreviewGame) => { state.tribe.unlocked.push('gathering'); }],
    ['neighbour', (state: PreviewGame) => { state.tribe.neighbours.push({ id: 1, pos: { x: 0, y: 0, z: 0 }, relation: 0, resolved: null }); }],
    ['machines', (state: PreviewGame) => { state.machines = emptyMachines(); }],
    ['planet', (state: PreviewGame) => { state.planet = emptyPlanet(); }],
    ['later era', (state: PreviewGame) => { state.stage = 4; state.machines = emptyMachines(); }],
  ] as const)('never deletes developed progress when the tribe contains %s', (_name, change) => {
    const state = historicalPreview(completedCoast(false));
    change(state);
    const before = structuredClone(state);
    expect(returnToCoast(state)).toBe(false);
    expect(foundTribeFromPreview(state)).toBe(false);
    expect(state).toEqual(before);
  });

  it.each([
    ['missing inherited finale', (state: PreviewGame) => { state.campaign.finale = null; }],
    ['dead inherited body', (state: PreviewGame) => { state.player.health = 0; }],
    ['active death screen', (state: PreviewGame) => { state.deathReason = 'fixture death'; }],
  ] as const)('rejects explicit preview founding with %s without mutation', (_name, change) => {
    const state = historicalPreview(completedCoast(false)); change(state);
    const before = structuredClone(state);
    expect(foundTribeFromPreview(state)).toBe(false);
    expect(state).toEqual(before);
  });

  it.each([0, 1, 2] as const)('leaves organism stage %i untouched when returning without a preview', (stage: WorldStage) => {
    const state = createGame(481516);
    state.stage = stage; state.world = createWorld(state.seed, stage); state.worlds[stage] = state.world;
    const before = structuredClone(state);
    expect(returnToCoast(state)).toBe(false);
    expect(foundTribeFromPreview(state)).toBe(false);
    expect(state).toEqual(before);
  });
});
