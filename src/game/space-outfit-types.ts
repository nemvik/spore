import type { EmpireCut, EmpireId } from './space-empires-types';

export type ShipEquipment = 'hold' | 'drive' | 'solar';
export interface EquipmentBadgeProof { empireId: EmpireId; completedSerial: number; }
/** A permanent copy of the actual economic payment, not a mutable loadout. */
export interface EquipmentReceipt {
  kind: 'equipment'; serial: number; at: number; tick: number; spaceAt: number;
  lifeAction: number; travelAction: number; planetId: string;
  warAction?: number;
  balanceBefore: number; balanceAfter: number; paid: number;
  catalog: 1; equipment: ShipEquipment; shipId: string; unlock: EquipmentBadgeProof;
}
export interface SpaceOutfit {
  version: 1; catalog: 1; activated: EmpireCut; purchases: EquipmentReceipt[];
}
