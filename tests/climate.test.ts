import { describe, expect, it } from 'vitest';
import { getClimate, hydrationAt } from '../src/game/climate';
import { cloneGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import type { GameState, Stage } from '../src/game/types';

// Prepared environmental fixtures isolate climate rules. They are not campaign runs.
function habitatFixture(stage: Stage = 2): GameState {
  const state = createGame(20260913);
  state.stage = stage;
  state.world = createWorld(state.seed, stage);
  state.worlds[stage] = state.world;
  state.player.pos = { ...state.world.landmarks[0].pos };
  if (stage === 2) {
    state.player.genome = cloneGenome(state.player.genome);
    state.player.genome.parts.push(
      { id: 'fixture-legs', kind: 'legs', axial: -0.1, angle: 1.25, scale: 1, mirrored: true },
      { id: 'fixture-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
    );
  }
  makeCheckpoint(state);
  return state;
}

describe('climate derives visible water and ecological stress from saved state', () => {
  it.each([0, 1] as const)('keeps aquatic stage%i hydrated and free of terrestrial drought', (stage) => {
    const state = habitatFixture(stage);
    state.campaign.drought = 1;
    expect(getClimate(state)).toEqual({ drought: 0, shorelineZ: 54, springs: [], patchStress: [0, 0, 0], sanctuary: null, resolved: false });
    expect(hydrationAt(state, state.player.pos)).toBe(9);
  });

  it('exposes real drying and local protection, rather than only changing a message', () => {
    const state = habitatFixture();
    const spring = state.world.landmarks.find((landmark) => landmark.id === 'spring-0')!;
    const wet = getClimate(state);
    expect(wet.springs[0].water).toBeCloseTo(0.6);
    expect(hydrationAt(state, spring.pos)).toBeCloseTo(5.4);
    state.campaign.drought = 1;
    const dry = getClimate(state);
    expect(dry.springs[0]).toMatchObject({ water: 0, protected: false });
    expect(dry.patchStress[0]).toBe(1);
    expect(hydrationAt(state, spring.pos)).toBe(0);

    spring.charge = 10;
    const restored = getClimate(state);
    expect(restored.springs[0]).toMatchObject({ water: 1, protected: true });
    expect(restored.patchStress[0]).toBeCloseTo(0.08);
    expect(restored.patchStress[1]).toBe(1);
    expect(hydrationAt(state, spring.pos)).toBe(9);
  });

  it('makes partial restoration set both the watering radius and hydration rate', () => {
    const state = habitatFixture(); state.campaign.drought = 1;
    const spring = state.world.landmarks.find((landmark) => landmark.id === 'spring-1')!;
    spring.charge = 4;
    const radius = 1.5 + 5 * 0.4;
    expect(getClimate(state).springs[1]).toMatchObject({ water: 0.4, protected: false });
    expect(hydrationAt(state, { ...spring.pos, x: spring.pos.x + radius })).toBeCloseTo(3.6);
    expect(hydrationAt(state, { ...spring.pos, x: spring.pos.x + radius + 0.01 })).toBe(0);
  });

  it('moves the coast south so former shallow water no longer hydrates', () => {
    const state = habitatFixture();
    const formerWater = { x: 0, y: 1.2, z: 60 };
    expect(getClimate(state).shorelineZ).toBe(54);
    expect(hydrationAt(state, formerWater)).toBe(9);
    state.campaign.drought = 1;
    expect(getClimate(state).shorelineZ).toBe(76);
    expect(hydrationAt(state, formerWater)).toBe(0);
    expect(hydrationAt(state, { ...formerWater, z: 75.99 })).toBe(0);
    expect(hydrationAt(state, { ...formerWater, z: 76 })).toBe(9);
  });

  it('is repeatable and never changes world, campaign, checkpoint or RNG state', () => {
    const state = habitatFixture(); state.campaign.drought = 0.73;
    state.world.landmarks.find((landmark) => landmark.id === 'spring-2')!.charge = 6;
    const before = JSON.stringify(state);
    const first = getClimate(state);
    for (let i = 0; i < 10; i++) {
      expect(getClimate(state)).toEqual(first);
      hydrationAt(state, { x: i, y: 1, z: i * 8 });
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('retains exact drought, water, protection and hydration through a valid terrestrial save', () => {
    const state = habitatFixture(); state.campaign.drought = 0.86;
    state.world.landmarks.find((landmark) => landmark.id === 'spring-0')!.charge = 10;
    state.world.landmarks.find((landmark) => landmark.id === 'spring-1')!.charge = 3;
    makeCheckpoint(state);
    const loaded = parseGame(serializeGame(state));
    expect(getClimate(loaded)).toEqual(getClimate(state));
    for (const point of state.world.landmarks) expect(hydrationAt(loaded, point.pos)).toBe(hydrationAt(state, point.pos));
    expect(loaded.world).toBe(loaded.worlds[2]);
    expect(loaded.player.genome).toEqual(state.player.genome);
  });
});

describe('three persistent ecological resolutions [prepared finale states]', () => {
  it('restoration leaves all three protected springs wet after the global drought subsides', () => {
    const state = habitatFixture();
    Object.assign(state.campaign, { won: true, finale: 'restoration', drought: 0.12 });
    state.world.landmarks.filter((landmark) => landmark.kind === 'spring').forEach((spring) => { spring.charge = 10; });
    const climate = getClimate(state);
    expect(climate.resolved).toBe(true);
    expect(climate.springs.every((spring) => spring.protected && spring.water === 1)).toBe(true);
    climate.patchStress.forEach((stress) => expect(stress).toBeCloseTo(0.0096));
    expect(getClimate(parseGame(serializeGame(state)))).toEqual(climate);
  });

  it('predator balance reduces ecological stress while preserving its partial water recovery', () => {
    const state = habitatFixture(); state.campaign.drought = 0.4;
    state.world.landmarks.filter((landmark) => landmark.kind === 'spring').forEach((spring) => { spring.charge = 4; });
    const before = getClimate(state);
    Object.assign(state.campaign, { won: true, finale: 'predator' });
    const balanced = getClimate(state);
    expect(balanced.resolved).toBe(true);
    expect(balanced.springs.every((spring) => spring.water === 0.4)).toBe(true);
    balanced.patchStress.forEach((stress, index) => expect(stress).toBeCloseTo(before.patchStress[index] * 0.45));
    expect(getClimate(parseGame(serializeGame(state)))).toEqual(balanced);
  });

  it('migration shelters the destination while the abandoned landscape stays dry', () => {
    const state = habitatFixture(); state.campaign.drought = 1;
    const gate = state.world.landmarks.find((landmark) => landmark.kind === 'gate')!;
    expect(hydrationAt(state, gate.pos)).toBe(0);
    Object.assign(state.campaign, { won: true, finale: 'migration' });
    const climate = getClimate(state);
    expect(climate.sanctuary).toEqual({ x: gate.pos.x, z: gate.pos.z, radius: 12, active: true });
    expect(climate.drought).toBe(1);
    expect(climate.patchStress).toEqual([1, 1, 1]);
    expect(climate.springs.every((spring) => spring.water === 0)).toBe(true);
    expect(hydrationAt(state, gate.pos)).toBe(9);
    expect(hydrationAt(state, { ...gate.pos, x: gate.pos.x + 12 })).toBe(9);
    expect(hydrationAt(state, { ...gate.pos, x: gate.pos.x + 12.01 })).toBe(0);
    expect(getClimate(parseGame(serializeGame(state)))).toEqual(climate);
  });
});
