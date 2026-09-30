import type { EmpireMissionKind } from './space-empires-types';
import type { EquipmentBadgeProof, ShipEquipment } from './space-outfit-types';
import type { SpaceState } from './space-types';
import { shipStats } from './ship-design';
import { BASIC_JUMP_RANGE } from './galaxy';

export const EQUIPMENT_IDS: ShipEquipment[] = ['hold', 'drive', 'solar'];
export const SHIP_EQUIPMENT: Record<ShipEquipment, { name: string; badge: string; mission: EmpireMissionKind; price: number; effect: string }> = {
  hold: { name: 'Nákladní věnec', badge: 'Kupec cest', mission: 'trade', price: 80, effect: '+4 společná místa pro život a produkci.' },
  drive: { name: 'Skoková cívka', badge: 'Hvězdný zvěd', mission: 'survey', price: 120, effect: 'Mezihvězdný dosah 18 → 32.' },
  solar: { name: 'Fotosyntetické listy', badge: 'Správce života', mission: 'ecology', price: 60, effect: '+2 energie/s při stání; montáž energii nedoplní.' },
};
export type OutfittedSpace = SpaceState;
export interface CapabilityCut { economyAction?: number; lifeAction?: number; travelAction?: number; }
export function installedEquipment(p: OutfittedSpace, cut: CapabilityCut = {}): ShipEquipment[] {
  return (p.outfit?.purchases ?? []).filter(row => (cut.economyAction === undefined || row.serial < cut.economyAction)
    && (cut.lifeAction === undefined || row.lifeAction <= cut.lifeAction)
    && (cut.travelAction === undefined || row.travelAction <= cut.travelAction)).map(row => row.equipment);
}
/** Original geometry and purchase price stay immutable. Historical callers must
 * provide the relevant next-action cuts, including economic order at equal time. */
export function shipCapabilities(p: OutfittedSpace, cut: CapabilityCut = {}) {
  if (!p.ship) return null;
  const stats = shipStats(p.ship.creation.blueprint), installed = installedEquipment(p, cut);
  return { ...stats, cargo: stats.cargo + (installed.includes('hold') ? 4 : 0),
    solar: stats.solar + (installed.includes('solar') ? 2 : 0), jumpRange: installed.includes('drive') ? 32 : BASIC_JUMP_RANGE };
}
/** A badge records the completed kind, even when roots chose its survey alternative. */
export function equipmentBadge(p: SpaceState, equipment: ShipEquipment): EquipmentBadgeProof | null {
  const missionKind = SHIP_EQUIPMENT[equipment].mission;
  const empire = p.empires?.entries.find(entry => entry.mission?.kind === missionKind && entry.mission.completed !== null);
  return empire ? { empireId: empire.id, completedSerial: empire.mission!.completed! } : null;
}
