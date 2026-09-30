import type { LivingExpedition } from './space-biosphere-types';
import type { NpcDesign } from './npc-genome';
import type { Vec3 } from './types';

export type LifeRole = 'small-plant' | 'medium-plant' | 'large-plant' | 'herbivore-a' | 'herbivore-b' | 'predator';
export interface SpaceLife {
  id: string; originPlanetId: string; taxonKey: string;
  pos: Vec3; heading: number; health: number; nutrition: number;
}
export interface ForeignPlanet {
  id: string; systemId: string; generator: 1; seed: number;
  temperature: number; atmosphere: number; elapsed: number;
  /** Immutable origin models. Also retained when every original resident has left. */
  designs: NpcDesign[]; life: SpaceLife[];
}
export interface ExpeditionAction {
  serial: number; at: number; kind: 'scan' | 'collect' | 'release';
  planetId: string; lifeId: string; energyPaid: number;
}
export interface SpaceExpeditionV1 {
  version: 1; generator: 1; worlds: ForeignPlanet[]; cargo: SpaceLife[];
  /** Scanned physical instances; knowledge never manufactures a replacement. */
  scans: { lifeId: string; planetId: string; at: number }[];
  actions: ExpeditionAction[]; nextAction: number; energySpent: number;
}

export type SpaceExpedition = SpaceExpeditionV1 | LivingExpedition;
