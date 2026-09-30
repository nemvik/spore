import type { EmpireCut } from './space-empires-types';
import type { SpaceEconomyAction } from './space-economy-types';
import type { SpaceState } from './space-types';

export interface EventStamp { cut: EmpireCut; economyAt: number; warAction: number }
export interface EventArm { stamp: EventStamp; localAt: number }
/** Local observation is separate from the immutable incident history. */
export interface ColonyWatch {
  planetId: string; anchorSerial: number; observedElapsed: number;
  armedAt: EventArm | null; unstableFor: number;
}
export interface PirateCandidate {
  receipt: Extract<SpaceEconomyAction, { kind: 'load' }> & { eventAction: number };
  travelAction: number;
  /** Cumulative sales of this origin at loading, not sales of its product. */
  sold: number;
}
export interface EventBattleProof {
  battleSerial: number; planetId: string; start: EmpireCut; startedEconomyAt: number;
  outcome: 'won' | 'retreated' | 'lost'; endedAt: number; endedEconomyAt: number;
  shots: number; damage: number;
}
interface EventActionBase extends EventStamp { serial: number }
export type SpaceEventAction = EventActionBase & (
  { kind: 'quarantine'; planetId: string; colonyId: string;
    watch: Omit<ColonyWatch, 'armedAt'> & { armedAt: EventArm } }
  | { kind: 'resume'; planetId: string; quarantineSerial: number; localAt: number }
  | { kind: 'pirate'; planetId: string; candidate: PirateCandidate;
    arrival: SpaceState['log'][number]; battleSerial: number }
  | { kind: 'pirate-result'; openingSerial: number; battle: EventBattleProof }
);
export type QuarantineEvent = Extract<SpaceEventAction, { kind: 'quarantine' }>;
export type ResumeEvent = Extract<SpaceEventAction, { kind: 'resume' }>;
export type PirateEvent = Extract<SpaceEventAction, { kind: 'pirate' }>;
export type PirateResult = Extract<SpaceEventAction, { kind: 'pirate-result' }>;
export interface EventColony {
  planetId: string; colonyId: string; quarantines: number; resumes: number;
  lastQuarantine: QuarantineEvent; lastResume: ResumeEvent | null;
}
export interface EventSnapshot {
  colonies: EventColony[]; pirate: PirateEvent | null; lastPirateResult: PirateResult | null;
  lastAutomatic: (EventStamp & { serial: number; kind: 'quarantine' | 'pirate' }) | null;
  usedLoadSerial: number;
  totals: { quarantines: number; resumes: number; pirates: number;
    victories: number; retreats: number; defeats: number };
}
export interface SpaceEvents {
  version: 1; activated: EventStamp & { nextCombatSerial: number; loadCount: number };
  archive: { through: number; stamp: EventStamp; state: EventSnapshot };
  actions: SpaceEventAction[]; nextAction: number; current: EventSnapshot;
  watches: ColonyWatch[]; candidate: PirateCandidate | null;
}
