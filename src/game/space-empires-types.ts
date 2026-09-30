import type { SpaceEconomyAction } from './space-economy-types';
import type { ExpeditionAction } from './space-expedition-types';
import type { SpaceState } from './space-types';
import type { SpaceInheritance } from './space-inheritance';

export type EmpireId = 'resin' | 'roots' | 'basalt';
export type EmpireMissionKind = 'trade' | 'ecology' | 'survey';
export interface EmpireCut { at: number; tick: number; travelAction: number; lifeAction: number; economyAction: number }
export type EmpireAction = { serial: number; empireId: EmpireId; cut: EmpireCut } & (
  { kind: 'contact' | 'complete' | 'treaty' }
  | { kind: 'accept'; missionKind: EmpireMissionKind; targetPlanetId: string }
);
export type EmpireWitness =
  { kind: 'trade'; receipt: Extract<SpaceEconomyAction, { kind: 'sell' }> }
  | { kind: 'ecology'; receipt: ExpeditionAction; role: number }
  | { kind: 'survey'; receipt: SpaceState['log'][number] };
export interface EmpireMission {
  kind: EmpireMissionKind; targetPlanetId: string; accepted: number;
  completed: number | null; evidence: EmpireWitness[];
}
export interface SpaceEmpire {
  id: EmpireId; capitalId: string; enclave: boolean;
  contact: number | null; mission: EmpireMission | null; treaty: number | null;
}
export interface SpaceEmpires {
  version: 1; activated: EmpireCut;
  /** Shared activation reservations, not invented historical ownership. */
  protectedColonies: string[];
  inheritance: SpaceInheritance | null;
  entries: SpaceEmpire[]; actions: EmpireAction[]; nextAction: number;
}
/** The treaty's permanent action supplies the historical relationship revision.
 * Never reprice a receipt from today's relationship. */
export interface SpacePriceBasis {
  version: 1; base: number; empireId: EmpireId | null;
  treatySerial: number | null; relationRevision: number | null; bonus: number;
}
