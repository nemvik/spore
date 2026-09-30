import type { EmpireCut, EmpireId } from './space-empires-types';

export interface WarStamp { cut: EmpireCut; economyAt: number }
export interface SuspendedEscort { energy: number; generated: number; delivered: number }
export interface WarDeclaration extends WarStamp { serial: number; escort: SuspendedEscort | null }
export interface WarRelation {
  empireId: EmpireId; declarations: number; peaces: number;
  active: boolean; declaration: WarDeclaration | null; peace: (WarStamp & { serial: number }) | null;
  /** Completed suspensions measured in space seconds, not domestic time. */
  suspendedSeconds: number; nextRaidAt: number | null;
}
export interface WarBattleLink {
  empireId: EmpireId; declarationSerial: number; orderSerial: number; raidSerial: number | null;
}
export interface WarEngagement extends WarBattleLink {
  battleSerial: number; kind: 'invasion' | 'defense'; planetId: string;
}
/** Permanent compact political witness; detailed physical combat stays in its
 * own bounded history. Retained witnesses must match that history exactly. */
export interface WarBattleProof extends WarEngagement {
  start: EmpireCut; startedEconomyAt: number;
  outcome: 'won' | 'retreated' | 'lost'; endedAt: number; endedEconomyAt: number;
  shots: number; damage: number;
}
export interface ColonyRaid extends WarStamp {
  serial: number; empireId: EmpireId; declarationSerial: number;
  planetId: string; deadline: number;
}
interface WarActionBase extends WarStamp { serial: number; empireId: EmpireId }
export type WarAction = WarActionBase & (
  { kind: 'declare'; escort: SuspendedEscort | null }
  | { kind: 'peace' }
  | { kind: 'engage'; engagement: WarEngagement }
  | { kind: 'result'; battle: WarBattleProof }
  | { kind: 'raid'; planetId: string; declarationSerial: number; deadline: number }
  | { kind: 'expire'; raid: ColonyRaid }
  | { kind: 'purchase'; planetId: string; paymentSerial: number }
);
export type WarConquest = Extract<WarAction, { kind: 'result' }>;
export interface WarTerritory {
  planetId: string; owner: 'player' | EmpireId;
  change: Extract<WarAction, { kind: 'result' | 'expire' | 'purchase' }>;
}
export interface WarTotals {
  declarations: number; peaces: number; invasions: number; defenses: number;
  invasionVictories: number; invasionRetreats: number; invasionDefeats: number;
  defenseVictories: number; defenseRetreats: number; defenseDefeats: number;
  raids: number; expired: number; cancelled: number; purchases: number;
}
export interface WarSnapshot {
  relations: WarRelation[]; territories: WarTerritory[];
  raid: ColonyRaid | null; engagement: WarEngagement | null; totals: WarTotals;
}
export interface SpaceWars {
  version: 1; activated: WarStamp & { nextCombatSerial: number };
  /** State after `through`; the next retained action is through+1. */
  archive: { through: number; stamp: WarStamp; state: WarSnapshot };
  actions: WarAction[]; nextAction: number;
  /** Runtime cache is serialized and checked by replaying the bounded tail. */
  current: WarSnapshot;
}
