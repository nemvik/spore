import type { EmpireCut, EmpireId } from './space-empires-types';
import type { SpacePosition } from './space-types';

export type ExpansionKind = 'alliance' | 'territory';
/** The original economic receipt also survives the bounded account history. */
export interface ExpansionReceipt {
  kind: ExpansionKind; serial: number; at: number; tick: number; spaceAt: number;
  lifeAction: number; travelAction: number; planetId: string;
  warAction?: number;
  balanceBefore: number; balanceAfter: number; paid: number;
  empireId: EmpireId; treatySerial: number; shipId: string;
}
export interface AllianceEscort {
  id: string; empireId: EmpireId; paidSerial: number; location: SpacePosition | null;
  energy: number; generated: number; delivered: number;
}
export interface SpaceExpansion {
  version: 1; activated: EmpireCut; actions: ExpansionReceipt[]; allies: AllianceEscort[];
}
