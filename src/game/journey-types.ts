import type { FoodKind, Stage, Vec3 } from './types';

/** Persistent ecological situations. Presentation effects do not live in a save. */
export interface EcologySite {
  id: number;
  stage: Stage;
  patch: number;
  source: Vec3;
  refuges: Vec3[];
  sourceId: number;
  plantedId: number | null;
  vitality: number;
  observed: boolean;
  resolved: boolean;
  method: 'cultivate' | 'hunt' | 'guide' | null;
  threatIds: number[];
  phase: number;
}

export interface LivingCargo {
  kind: FoodKind;
  /** Only a culture taken from its mother can found a new living colony. */
  purpose: 'culture' | 'food';
  site: number;
  vitality: number;
  distance: number;
}

export interface HunterMemory {
  stage: Stage;
  id: number;
  phase: 'stalk' | 'windup' | 'lunge' | 'recover';
  time: number;
  aim: Vec3;
  /** A land hunter remembers where it personally consumed real meat. */
  feedingHome?: Vec3;
}

export interface FoodOffering { stage: Stage; id: number; site: number; remaining: number }

/** The canopy's food and collision records live in the retained reef world. */
export interface ReefCanopy {
  crustId: number;
  capId: number;
  roofIds: number[];
  releasedAt: number | null;
}

/** A real grazer carries living tissue lost by one planted mother root. */
export interface RootFragment { carrierId: number; site: number; origin: Vec3; vitality: number; }
/** A cutting is represented by an ordinary, non-regenerating food resource. */
export interface DispersedRoot { resourceId: number; site: number; vitality: number; }
export interface RootDispersal { version: 1; carried: RootFragment[]; roots: DispersedRoot[]; }
/** Opted-in reef physiology keeps the current continuous filter opening. */
export interface ReefEvolution { version: 1; pumping: number; }

export interface Journey {
  /** Version 2 uses reversible construction allocation for non-legacy campaigns. */
  version: 2 | 3;
  /** Old campaigns retain their earned progress and original completion rules. */
  legacy: boolean;
  sites: EcologySite[];
  cargo: LivingCargo | null;
  insights: string[];
  echoes: string[];
  hunters: HunterMemory[];
  offerings: FoodOffering[];
  /** Absent in pre-canopy campaigns: importing a save never rebuilds its rooms. */
  canopy?: ReefCanopy | null;
  /** Explicit opt-in for new lineages; old saves retain their original ecology. */
  rootDispersal?: RootDispersal;
  /** Absent in older lineages, including saves made before entering their reef. */
  reefEvolution?: ReefEvolution;
}

export function emptyJourney(legacy = false, dispersal = false, reefEvolution = false): Journey {
  return { version: legacy ? 2 : 3, legacy, sites: [], cargo: null, insights: [], echoes: [], hunters: [], offerings: [], ...(!legacy ? {
    canopy: null,
    ...(dispersal ? { rootDispersal: { version: 1 as const, carried: [], roots: [] } } : {}),
    ...(reefEvolution ? { reefEvolution: { version: 1 as const, pumping: 0 } } : {}),
  } : {}) };
}
