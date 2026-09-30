import type { SpaceState, SpacePosition } from './space-types';
import type { EmpireId } from './space-empires-types';
import type { ExpansionKind } from './space-expansion-types';
import type { Colony } from './space-economy-types';
import { EMPIRE_IDS } from './space-empires-content';
import { clamp } from './random';

export const EXPANSION_PRICE: Record<ExpansionKind, number> = { alliance: 40, territory: 120 };
export const ALLY_BATTERY = 12;
export const ALLY_SOLAR = .8;
export const ALLY_TRANSFER = 2;
export const ALLY_REACH = 6;
export const territoryTitle = (p: SpaceState, planetId: string) => p.expansion?.actions.find(row => row.kind === 'territory' && row.planetId === planetId) ?? null;
export const alliedEmpire = (p: SpaceState, id: EmpireId) => p.expansion?.actions.some(row => row.kind === 'alliance' && row.empireId === id) ?? false;
/** Diplomatic anchors remain in empires; this is effective political ownership. */
export function ownerAt(p: SpaceState, planetId: string): 'player' | EmpireId | null {
  const military = p.wars?.current.territories.find(row => row.planetId === planetId);
  if (military && planetId !== p.homePlanetId) return military.owner;
  return baseOwnerAt(p, planetId);
}
/** Historical political replay must exclude purchases/settlements after its cut. */
export function baseOwnerAt(p: SpaceState, planetId: string, economyAction = Infinity, economyAt = Infinity): 'player' | EmpireId | null {
  const title = territoryTitle(p, planetId);
  if (planetId === p.homePlanetId || title && title.serial < economyAction) return 'player';
  const empire = p.empires?.entries.find(entry => entry.capitalId === planetId);
  if (empire && !empire.enclave) return empire.id;
  return empire?.enclave || p.economy?.colonies.some(colony => colony.planetId === planetId && colonyExistedAt(p, colony, economyAction, economyAt)) ? 'player' : null;
}
/** Same-frame founding is ordered by its economic receipt, not just its clock.
 * Permanent paid/military permissions retain that order after receipt rollover. */
export function colonyExistedAt(p: SpaceState, colony: Colony, economyAction: number, economyAt: number): boolean {
  const serial = colony.permission?.foundingSerial ?? colony.militaryPermission?.foundingSerial
    ?? p.economy?.actions.find(row => row.kind === 'found' && row.colonyId === colony.id)?.serial;
  return colony.foundedAt <= economyAt && (serial === undefined || serial < economyAction);
}
export function allyFormation(location: SpacePosition, empireId: EmpireId): SpacePosition {
  const index = EMPIRE_IDS.indexOf(empireId), side = (index - 1) * 2.6, behind = index === 1 ? 4 : 2.8;
  const sin = Math.sin(location.heading), cos = Math.cos(location.heading);
  return { ...location, pos: {
    x: clamp(location.pos.x + side * cos + behind * sin, -80, 80),
    y: clamp(location.pos.y + 1, location.scale === 'surface' ? 2 : -40, location.scale === 'surface' ? 26 : 40),
    z: clamp(location.pos.z - side * sin + behind * cos, -80, 80),
  } };
}
