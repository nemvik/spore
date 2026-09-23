import type { CreatureDiscovery } from './creature-discovery';
import type { Vec3 } from './types';

export const SOCIAL_ACTIONS = ['sing', 'dance', 'charm', 'pose'] as const;
export const COMBAT_ACTIONS = ['bite', 'charge', 'strike', 'spit'] as const;
export type SocialAction = typeof SOCIAL_ACTIONS[number];
export type CombatAction = typeof COMBAT_ACTIONS[number];
export type SpeciesAction = SocialAction | CombatAction;
export type CreatureRoute = 'social' | 'predator' | 'mixed';
export interface SpeciesNest {
  species: string;
  pos: Vec3;
  residents: number[];
  relationship: number;
  outcome: 'friend' | 'predator' | null;
  defeats: number;
  discovered: boolean;
}
export interface SocialEncounter {
  species: string;
  target: number;
  requested: SocialAction;
  round: number;
  progress: number;
  mistakes: number;
  remaining: number;
}
export interface CreatureStageState {
  version: 1;
  discovery?: CreatureDiscovery;
  nests: SpeciesNest[];
  pack: number[];
  encounter: SocialEncounter | null;
  recharge: number;
  attack: { kind: 'charge' | 'spit'; target: number; remaining: number; pos: Vec3; aim: Vec3; damage: number } | null;
  guards: { id: number; target: number; remaining: number; aim: Vec3 }[];
  cue: { action: SpeciesAction; target: number; remaining: number; success: boolean } | null;
  completed: CreatureRoute | null;
}
