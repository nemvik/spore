import type { DiscoveryStamp } from './space-discoveries-types';
import type { EmpireCut } from './space-empires-types';
import type { ClimateWork, ForeignClimate } from './space-climate';

export type CoreAction = DiscoveryStamp & { serial: number; planetId: string } & (
  | { kind: 'contact' }
  | { kind: 'access'; strategy: 'diplomacy'; supportSerial: number }
  | { kind: 'access'; strategy: 'force'; battle: CoreBattleProof }
  | { kind: 'encounter' }
  | { kind: 'root'; localAt: number; before: ForeignClimate; work: ClimateWork; energyPaid: 30 }
);
export interface CoreBattleProof {
  battleSerial: number; planetId: string; start: EmpireCut;
  economyAt: number; endedAt: number; endedEconomyAt: number;
  startingHealth: number; health: number; shots: number; received: number; damage: number;
}
export interface SpaceCore {
  version: 1;
  activated: DiscoveryStamp & { nextCombatSerial: number };
  /** Exact pre-existing inner-world reservations, shared by live/checkpoint.
   * Any such history preserves access; it does not invent contact or a gift. */
  legacyWorlds: string[];
  /** Contact, one access result, one encounter, at most one root per foreign world. */
  actions: CoreAction[];
  nextAction: number;
}
