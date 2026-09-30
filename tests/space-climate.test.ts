import { describe, expect, it } from 'vitest';
import {
  applyClimateTool, climateAtLimit, climateEnergySpent, climateMatchesWork,
  climaticTier, CLIMATE_ENERGY_RATE, CLIMATE_RATE, newClimateWork,
  type ClimateTool, type ForeignClimate,
} from '../src/game/space-climate';

const directions = [
  ['warm', 'temperature', 1], ['cool', 'temperature', -1],
  ['thicken', 'atmosphere', 1], ['thin', 'atmosphere', -1],
] as const;

describe('C3 effective climate work and real energy receipts', () => {
  it.each(directions)('%s changes only %s in direction %s and pays for actual work', (tool, axis, sign) => {
    const world = { temperature: .12, atmosphere: -.22 }, initial = { ...world }, work = newClimateWork();
    const cost = applyClimateTool(world, work, tool, 10, 1 / 30);
    expect(world[axis]).toBeCloseTo(initial[axis] + sign * CLIMATE_RATE / 30, 12);
    expect(world[axis === 'temperature' ? 'atmosphere' : 'temperature']).toBe(initial[axis === 'temperature' ? 'atmosphere' : 'temperature']);
    expect(work[tool]).toBeCloseTo(CLIMATE_RATE / 30, 12);
    for (const [other] of directions) if (other !== tool) expect(work[other]).toBe(0);
    expect(cost).toBeCloseTo(CLIMATE_ENERGY_RATE / 30, 12); expect(climateEnergySpent(work)).toBeCloseTo(cost, 12);
    expect(climateMatchesWork(world, initial, work)).toBe(true);
  });

  it.each(directions)('%s charges only the remaining distance to its boundary and then nothing', (tool, axis, sign) => {
    const world = { temperature: 0, atmosphere: 0 }; world[axis] = sign * .9998;
    const initial = { ...world }, work = newClimateWork();
    const cost = applyClimateTool(world, work, tool, 100, 10);
    expect(world[axis]).toBe(sign); expect(work[tool]).toBeCloseTo(.0002, 12);
    expect(cost).toBeCloseTo(.0002 * CLIMATE_ENERGY_RATE / CLIMATE_RATE, 12);
    expect(climateAtLimit(world, tool)).toBe(true); expect(climateMatchesWork(world, initial, work)).toBe(true);
    const finished = structuredClone({ world, work });
    expect(applyClimateTool(world, work, tool, 100, 1 / 30)).toBe(0); expect({ world, work }).toEqual(finished);
    const opposite = tool === 'warm' ? 'cool' : tool === 'cool' ? 'warm' : tool === 'thin' ? 'thicken' : 'thin';
    expect(climateAtLimit(world, opposite)).toBe(false);
    expect(applyClimateTool(world, work, opposite, 1, 1 / 30)).toBeGreaterThan(0);
    expect(climateMatchesWork(world, initial, work)).toBe(true);
  });

  it('never spends beyond available energy and cannot fast-forward a climate step with a large dt', () => {
    const world = { temperature: 0, atmosphere: 0 }, work = newClimateWork(), energy = .01;
    const cost = applyClimateTool(world, work, 'warm', energy, 1 / 30);
    expect(cost).toBeCloseTo(energy, 12); expect(world.temperature).toBeCloseTo(energy / CLIMATE_ENERGY_RATE * CLIMATE_RATE, 12);
    const a = { temperature: 0, atmosphere: 0 }, b = { ...a }, wa = newClimateWork(), wb = newClimateWork();
    expect(applyClimateTool(a, wa, 'thicken', 1000, 1000)).toBe(applyClimateTool(b, wb, 'thicken', 1000, 1 / 30));
    expect(a).toEqual(b); expect(wa).toEqual(wb);
  });

  it.each([
    ['off', 10, 1 / 30], ['unknown', 10, 1 / 30],
    ['warm', 0, 1 / 30], ['warm', -1, 1 / 30], ['warm', NaN, 1 / 30], ['warm', Infinity, 1 / 30],
    ['warm', 10, 0], ['warm', 10, -1], ['warm', 10, NaN], ['warm', 10, Infinity],
  ] as const)('does no work for tool=%s, energy=%s, dt=%s', (tool, energy, dt) => {
    const world = { temperature: .4, atmosphere: -.5 }, work = newClimateWork(), before = structuredClone({ world, work });
    expect(applyClimateTool(world, work, tool as ClimateTool, energy, dt)).toBe(0);
    expect({ world, work }).toEqual(before); expect(climateEnergySpent(work)).toBe(0);
  });

  it('uses both axes and inclusive boundaries for climatic T0–T3, independently of life', () => {
    const cases: [ForeignClimate, number][] = [
      [{ temperature: 0, atmosphere: 0 }, 3], [{ temperature: .3, atmosphere: 0 }, 3],
      [{ temperature: .300001, atmosphere: 0 }, 2], [{ temperature: 0, atmosphere: -.65 }, 2],
      [{ temperature: 0, atmosphere: -.650001 }, 1], [{ temperature: 1, atmosphere: 0 }, 1],
      [{ temperature: .8, atmosphere: -.7 }, 0], [{ temperature: -.75, atmosphere: .8 }, 0],
      [{ temperature: .25, atmosphere: .25 }, 2], [{ temperature: .5, atmosphere: .5 }, 1],
    ];
    for (const [world, tier] of cases) {
      expect(climaticTier(world)).toBe(tier); expect(climaticTier({ temperature: -world.temperature, atmosphere: -world.atmosphere })).toBe(tier);
    }
    expect(climateAtLimit({ temperature: 1, atmosphere: 1 }, 'off')).toBe(false);
  });

  it.each([
    [{ temperature: .8, atmosphere: -.7 }, 'cool', 'thicken'],
    [{ temperature: -.75, atmosphere: .8 }, 'warm', 'thin'],
  ] as const)('reaches T3 from %j with opposite tools %s and %s and preserves the complete receipt', (start, thermal, atmospheric) => {
    const world = { ...start }, work = newClimateWork(); let cost = 0;
    expect(climaticTier(world)).toBe(0);
    for (const tool of [thermal, atmospheric]) for (let i = 0; i < 600; i++) cost += applyClimateTool(world, work, tool, 10, 1 / 30);
    expect(climaticTier(world)).toBe(3); expect(climateMatchesWork(world, start, work)).toBe(true);
    expect(cost).toBeCloseTo(80, 9); expect(climateEnergySpent(work)).toBeCloseTo(cost, 9);
    const stable = structuredClone({ world, work });
    for (let i = 0; i < 600; i++) expect(applyClimateTool(world, work, 'off', 10, 1 / 30)).toBe(0);
    expect({ world, work }).toEqual(stable);
  });

  it('includes recorded drift in climate matching but never bills drift as tool work', () => {
    const initial = { temperature: .2, atmosphere: -.1 }, world = { ...initial }, work = newClimateWork();
    applyClimateTool(world, work, 'warm', 10, 1 / 30); const paid = climateEnergySpent(work);
    world.temperature += .04; world.atmosphere -= .07;
    expect(climateMatchesWork(world, initial, work)).toBe(false);
    work.temperatureDrift = .04; work.atmosphereDrift = -.07;
    expect(climateMatchesWork(world, initial, work)).toBe(true); expect(climateEnergySpent(work)).toBe(paid);
    const forged = structuredClone(work); forged.thicken += .01;
    expect(climateMatchesWork(world, initial, forged)).toBe(false);
  });
});
