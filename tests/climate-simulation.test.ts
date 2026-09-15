import { describe, expect, it } from 'vitest';
import { getClimate, hydrationAt } from '../src/game/climate';
import { cloneGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint, recoverGeneration, statsFor, step, tryWin } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';
import type { AdaptationId, GameState } from '../src/game/types';
import { createWorld } from '../src/game/world';

// Prepared terrestrial encounters isolate live climate consequences. These are not
// full campaign runs; finale prerequisites are explicit and won is never assigned.
function landFixture(...organs: AdaptationId[]): GameState {
  const state = createGame(20260913);
  state.stage = 2; state.world = createWorld(state.seed, 2); state.worlds[2] = state.world;
  state.world.creatures = []; state.world.obstacles = []; state.world.resources = [];
  state.world.patches.forEach(p => { p.discovered = true; });
  const genome = cloneGenome(state.player.genome);
  for (const kind of ['legs', 'lungs', ...organs] as AdaptationId[]) {
    genome.parts.push({ id: `fixture-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  }
  state.player.genome = genome; state.player.health = statsFor(genome).maxHealth;
  state.player.pos = { ...state.world.patches[0].center };
  state.campaign.drought = 1;
  makeCheckpoint(state);
  return state;
}
function advance(state: GameState, frames = 600): void {
  for (let frame = 0; frame < frames; frame++) step(state, EMPTY_INPUT);
}
function assertPersistedResolution(state: GameState): GameState {
  const loaded = parseGame(serializeGame(state));
  expect(loaded.campaign).toEqual(state.campaign);
  expect(loaded.world.landmarks).toEqual(state.world.landmarks);
  expect(loaded.world.patches).toEqual(state.world.patches);
  expect(getClimate(loaded)).toEqual(getClimate(state));
  const recovered = recoverGeneration(loaded);
  expect(recovered.campaign).toEqual(state.campaign);
  expect(getClimate(recovered)).toEqual(getClimate(state));
  expect(recovered.world).toBe(recovered.worlds[2]);
  return loaded;
}

describe('climate affects live survival and ecological resources', () => {
  it('a depleted spring causes dehydration damage while a restored spring protects the same organism', () => {
    const depleted = landFixture(), protectedState = landFixture();
    protectedState.world.landmarks.find(l => l.id === 'spring-0')!.charge = 10;
    depleted.player.moisture = 0; protectedState.player.moisture = 0;
    const fullHealth = depleted.player.health;
    advance(depleted); advance(protectedState);
    expect(depleted.player.moisture).toBe(0);
    expect(depleted.player.health).toBeLessThan(fullHealth - 10);
    expect(protectedState.player.moisture).toBeGreaterThan(80);
    expect(protectedState.player.health).toBe(fullHealth);
    expect(depleted.deathReason).toBeNull();
    expect(protectedState.deathReason).toBeNull();
  });

  it('a paid restoration input immediately makes a dry spring able to hydrate', () => {
    const state = landFixture(); state.player.moisture = 20;
    const spring = state.world.landmarks.find(l => l.id === 'spring-0')!;
    advance(state, 60);
    expect(state.player.moisture).toBeLessThan(20);
    expect(hydrationAt(state, state.player.pos)).toBe(0);
    const energy = state.player.energy;
    step(state, { ...EMPTY_INPUT, tend: true });
    expect(spring.charge).toBe(1);
    expect(state.player.energy).toBeLessThan(energy - 9);
    const afterTending = state.player.moisture;
    advance(state, 60);
    expect(state.player.moisture).toBeGreaterThan(afterTending);
    expect(state.campaign.won).toBe(false);
  });

  it('dry niches lose existing vegetation and fertility while restored ones sustain regrowth', () => {
    const depleted = landFixture(), protectedState = landFixture();
    protectedState.world.landmarks.find(l => l.id === 'spring-0')!.charge = 10;
    for (const state of [depleted, protectedState]) {
      state.player.moisture = 100;
      state.world.resources.push({ id: state.world.nextId++, kind: 'algae', pos: { ...state.world.patches[0].center }, amount: 4, max: 8, patch: 0, regen: 0.004 });
    }
    advance(depleted, 1200); advance(protectedState, 1200);
    expect(depleted.world.resources[0].amount).toBeLessThan(4);
    expect(protectedState.world.resources[0].amount).toBeGreaterThan(4);
    expect(protectedState.world.patches[0].fertility).toBeGreaterThan(depleted.world.patches[0].fertility);
    expect(depleted.campaign.drought).toBe(1);
  });

  it('the retreating coast changes actual player hydration at the same former shoreline', () => {
    const early = landFixture(), late = landFixture();
    early.campaign.drought = 0;
    for (const state of [early, late]) { state.player.pos = { x: 0, y: 1.2, z: 60 }; state.player.moisture = 40; }
    advance(early, 120); advance(late, 120);
    expect(early.player.moisture).toBeGreaterThan(50);
    expect(late.player.moisture).toBeLessThan(40);
    expect(getClimate(early).shorelineZ).toBeLessThan(60);
    expect(getClimate(late).shorelineZ).toBeGreaterThan(60);
  });
});

describe('tryWin applies and checkpoints each ecological resolution [prepared prerequisites]', () => {
  it('the final paid spring restoration restores fertility, ends the drought and survives reloading', () => {
    const state = landFixture();
    const springs = state.world.landmarks.filter(l => l.kind === 'spring');
    springs.forEach(l => { l.charge = 10; }); springs[0].charge = 9;
    state.world.patches.forEach(p => { p.fertility = 0.3; p.pressure = 0.8; });
    expect(tryWin(state, 'restoration')).toBe(false);
    step(state, { ...EMPTY_INPUT, tend: true });
    expect(state.campaign).toMatchObject({ won: true, finale: 'restoration', drought: 0.12 });
    expect(getClimate(state).springs.every(s => s.protected && s.water === 1)).toBe(true);
    expect(state.world.patches.every(p => p.fertility >= 1.1 && p.pressure <= 0.2)).toBe(true);
    const loaded = assertPersistedResolution(state);
    loaded.campaign.sandbox = true; advance(loaded);
    expect(loaded.campaign.drought).toBe(0.12);
    expect(getClimate(loaded).springs.every(s => s.water === 1)).toBe(true);
  });

  it('qualifying invasive control restores partial groundwater and preserves recovery in sandbox play', () => {
    const state = landFixture();
    state.player.kills = 12; state.campaign.stageKills = 12;
    state.world.patches.forEach(p => { p.fertility = 0.3; p.pressure = 0.8; });
    state.player.energy = 59;
    expect(tryWin(state, 'predator')).toBe(false);
    state.player.energy = 90;
    expect(tryWin(state, 'predator')).toBe(true);
    expect(state.campaign).toMatchObject({ won: true, finale: 'predator', drought: 0.4 });
    expect(getClimate(state).springs.every(s => s.water >= 0.4)).toBe(true);
    expect(getClimate(state).patchStress.every(stress => stress < 0.15)).toBe(true);
    expect(state.world.patches.every(p => p.fertility >= 0.9 && p.pressure < 0.33)).toBe(true);
    const loaded = assertPersistedResolution(state);
    loaded.campaign.sandbox = true; advance(loaded);
    expect(loaded.campaign.drought).toBe(0.4);
  });

  it('qualifying migration creates a persisted local sanctuary while drought continues outside it', () => {
    const state = landFixture('symbiote', 'reservoir');
    state.player.bonds = [
      { species: 'mender', benefit: 'shield', age: 121, hunger: 10, loyalty: 80 },
      { species: 'gloom', benefit: 'recycle', age: 121, hunger: 10, loyalty: 80 },
    ];
    state.campaign.stageBonds = 2; state.campaign.drought = 0.8;
    const gate = state.world.landmarks.find(l => l.kind === 'gate')!;
    expect(tryWin(state, 'migration')).toBe(false);
    state.player.pos = { ...gate.pos };
    expect(tryWin(state, 'migration')).toBe(true);
    expect(state.campaign).toMatchObject({ won: true, finale: 'migration', drought: 0.8 });
    expect(gate.charge).toBe(10);
    expect(hydrationAt(state, gate.pos)).toBe(9);
    expect(hydrationAt(state, state.world.patches[0].center)).toBe(0);
    const loaded = assertPersistedResolution(state);
    loaded.campaign.sandbox = true; loaded.player.moisture = 40; advance(loaded, 120);
    expect(loaded.player.moisture).toBeGreaterThan(50);
    expect(loaded.campaign.drought).toBeGreaterThan(0.8);
    expect(getClimate(loaded).sanctuary?.active).toBe(true);
  });
});
