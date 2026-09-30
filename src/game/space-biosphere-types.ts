import type { ClimateTool, ClimateWork, ForeignClimate } from './space-climate';
import type { ExpeditionAction, ForeignPlanet, SpaceExpeditionV1 as LegacyExpedition, SpaceLife } from './space-expedition-types';

export type HabitatBand = 1 | 2 | 3;
export interface LifeHabitat {
  band: HabitatBand;
  reproduction: number;
  /** Active ecological seconds since a real prey meal; cargo freezes it. */
  sinceHunt: number;
  birth: { parentId: string; planetId: string; at: number } | null;
}
export interface LivingSpecimen extends SpaceLife { habitat: LifeHabitat; }
export interface PlanetBiosphere {
  /** Activation preserves existing climate, including a historical C2 snapshot. */
  initial: ForeignClimate;
  activatedElapsed: number;
  work: ClimateWork;
  stableFor: [number, number, number];
  /** Present only after explicit ecological activation. */
  ecologyElapsed?: number;
}
export interface LivingPlanet extends Omit<ForeignPlanet, 'life'> {
  life: LivingSpecimen[];
  biosphere: PlanetBiosphere;
}
export interface OriginDemography {
  planetId: string;
  births: [number, number, number, number, number, number];
  deaths: [number, number, number, number, number, number];
  /** Only original IDs1–36 need permanent tombstones. Descendants use counters. */
  founderDeaths: number[];
}
export interface BiosphereState {
  version: 1 | 2; activatedAt: number; activatedAction: number;
  ecology?: { activatedAt: number; activatedAction: number };
  tool: ClimateTool; toolPlanetId: string | null;
  paidScans: number; paidTransfers: number;
  origins: OriginDemography[];
}
export type LivingAction = ExpeditionAction & { band?: HabitatBand } | {
  serial: number; at: number; planetId: string; lifeId: string; energyPaid: 0; band: HabitatBand;
} & ({ kind: 'birth'; parentId: string } | { kind: 'death'; cause: 'climate' | 'hunger' | 'predation' });
export interface LivingExpedition extends Omit<LegacyExpedition, 'version' | 'worlds' | 'cargo' | 'actions'> {
  version: 2;
  worlds: LivingPlanet[];
  cargo: LivingSpecimen[];
  actions: LivingAction[];
  biosphere: BiosphereState;
}
