import { describe, expect, it } from 'vitest';
import { getClimate } from '../src/game/climate';
import { emptyMachines, emptyPlanet, emptyTribe } from '../src/game/era-types';
import { awaitingOrganismVictory, createGame, evolve, step, summary, tryTransition } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';
import { createWorld } from '../src/game/world';

describe('era state ownership', () => {
  it('does not opt organism campaigns into future era slices', () => {
    for (const legacy of [true, false]) {
      const state = createGame(481516, legacy, !legacy, !legacy);
      for (const key of ['tribe', 'machines', 'planet']) {
        expect(state).not.toHaveProperty(key);
        expect(summary(state)).not.toHaveProperty(key);
        expect(JSON.parse(state.checkpoint!)).not.toHaveProperty(key);
      }
    }
  });

  it('gives each campaign independent tribe collections', () => {
    const first = emptyTribe(), second = emptyTribe();
    first.food = 4;
    first.members.push({ id: 1, pos: { x: 1, y: 0, z: 2 }, heading: 0, health: 100, hunger: 10, tool: null });
    first.huts.push({ id: 2, kind: 'shelter', pos: { x: 0, y: 0, z: 0 }, tool: null });
    first.unlocked.push('gathering');
    first.neighbours.push({ id: 3, pos: { x: 2, y: 0, z: 3 }, relation: 0, resolved: null });
    expect(second).toEqual({ version: 1, food: 0, members: [], huts: [], unlocked: [], neighbours: [] });
  });

  it('gives later era placeholders independent collections and zero initial resources', () => {
    const first = emptyMachines(), second = emptyMachines();
    first.resource = 4;
    expect(second).toEqual({ version: 1, resource: 0, blueprints: [], fleet: [], regions: [] });
    for (const field of ['blueprints', 'fleet', 'regions'] as const) expect(first[field]).not.toBe(second[field]);
    const planet = emptyPlanet(), other = emptyPlanet();
    planet.temperature = .5; planet.atmosphere = -.2; planet.tScore = 1;
    expect(other).toEqual({ version: 1, temperature: 0, atmosphere: 0, tScore: 0, stabilizers: [] });
    expect(planet.stabilizers).not.toBe(other.stabilizers);
  });

  it.each([3, 4, 5] as const)('keeps stage %i on coast ecology and prevents accidental organism simulation', stage => {
    // P0 has no gameplay entry to later eras. These prepared slices verify the
    // simulation boundary before later phases add their own control models.
    const state = createGame(481516);
    state.stage = stage; state.world = createWorld(state.seed, 2); state.worlds[2] = state.world;
    state.tribe = emptyTribe();
    if (stage >= 4) state.machines = emptyMachines();
    if (stage === 5) state.planet = emptyPlanet();
    Object.assign(state.campaign, { won: true, finale: 'migration', sandbox: true, drought: .72 });
    const coastClimate = getClimate({ ...state, stage: 2 });
    expect(getClimate(state)).toEqual(coastClimate);
    expect(awaitingOrganismVictory(state)).toBe(false);
    const before = structuredClone(state);
    step(state, { ...EMPTY_INPUT, x: 1, z: 1, sprint: true, feed: true, tend: true });
    expect(evolve(state, state.player.genome).ok).toBe(false);
    expect(tryTransition(state)).toBe(false);
    expect(state).toEqual(before);
    expect(summary(state)).toMatchObject({ stage, tribe: state.tribe, climate: coastClimate });
    if (stage >= 4) expect(summary(state)).toHaveProperty('machines', state.machines);
    else expect(summary(state)).not.toHaveProperty('machines');
    if (stage === 5) expect(summary(state)).toHaveProperty('planet', state.planet);
    else expect(summary(state)).not.toHaveProperty('planet');
  });
});
