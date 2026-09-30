import { clamp } from './random';

export type ClimateTool = 'off' | 'warm' | 'cool' | 'thicken' | 'thin';
export interface ForeignClimate { temperature: number; atmosphere: number; }
/** Effective changes only: reaching a bound never consumes energy. */
export interface ClimateWork {
  warm: number; cool: number; thicken: number; thin: number;
  temperatureDrift: number; atmosphereDrift: number;
}
export const CLIMATE_RATE = .03;
export const CLIMATE_ENERGY_RATE = 2;
export const CLIMATE_TOOL_NAMES: Record<ClimateTool, string> = {
  off: 'Vypnuto', warm: 'Zahřívat', cool: 'Ochlazovat', thicken: 'Zahušťovat atmosféru', thin: 'Ředit atmosféru',
};
export const newClimateWork = (): ClimateWork => ({ warm: 0, cool: 0, thicken: 0, thin: 0, temperatureDrift: 0, atmosphereDrift: 0 });

/** Climate alone opens bands; it says nothing about their ecological support. */
export function climaticTier(world: ForeignClimate): 0 | 1 | 2 | 3 {
  const distance = Math.hypot(world.temperature, world.atmosphere);
  return distance <= .3 ? 3 : distance <= .65 ? 2 : distance <= 1 ? 1 : 0;
}
export function climateAxis(tool: Exclude<ClimateTool, 'off'>): { axis: keyof ForeignClimate; sign: 1 | -1 } {
  return { axis: tool === 'warm' || tool === 'cool' ? 'temperature' : 'atmosphere', sign: tool === 'warm' || tool === 'thicken' ? 1 : -1 };
}
export function climateAtLimit(world: ForeignClimate, tool: ClimateTool): boolean {
  if (tool === 'off') return false;
  const { axis, sign } = climateAxis(tool);
  return sign * world[axis] >= 1 - 1e-10;
}
/** Called once per active surface step. No solar refill, offline time or hidden state. */
export function applyClimateTool(world: ForeignClimate, work: ClimateWork, tool: ClimateTool, availableEnergy: number, dt: number): number {
  if (tool === 'off' || !['warm', 'cool', 'thicken', 'thin'].includes(tool)
    || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(availableEnergy) || availableEnergy <= 0) return 0;
  const { axis, sign } = climateAxis(tool);
  const effectiveTime = Math.min(dt, 1 / 30, availableEnergy / CLIMATE_ENERGY_RATE);
  const before = world[axis], after = clamp(before + sign * CLIMATE_RATE * effectiveTime, -1, 1);
  const amount = Math.abs(after - before);
  world[axis] = after; work[tool] += amount;
  return amount * CLIMATE_ENERGY_RATE / CLIMATE_RATE;
}
export function climateEnergySpent(work: ClimateWork): number {
  return (work.warm + work.cool + work.thicken + work.thin) * CLIMATE_ENERGY_RATE / CLIMATE_RATE;
}
/** Includes recorded ecological drift so climate and receipts cannot diverge. */
export function climateMatchesWork(world: ForeignClimate, initial: ForeignClimate, work: ClimateWork, offset?: ForeignClimate): boolean {
  return Math.abs(world.temperature - (initial.temperature + work.warm - work.cool + work.temperatureDrift + (offset?.temperature ?? 0))) < 1e-7
    && Math.abs(world.atmosphere - (initial.atmosphere + work.thicken - work.thin + work.atmosphereDrift + (offset?.atmosphere ?? 0))) < 1e-7;
}
