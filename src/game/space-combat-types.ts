import type { Vec3 } from './types';
import type { EmpireCut } from './space-empires-types';
import type { WarBattleLink } from './space-war-types';

export interface SpacePulse { at: number; from: Vec3; to: Vec3 }
/** Economy time advances during both ordinary flight and ordinary domestic play. */
export interface ShipRescue { startedAt: number; completedAt: number | null }
export interface SpaceBattle {
  serial: number; kind: 'pirate' | 'invasion' | 'defense' | 'warden'; start: EmpireCut; economyAt: number; planetId: string;
  war?: WarBattleLink;
  core?: { contactSerial: number };
  origin: Vec3; startingHealth: number; repaired: number;
  enemy: { pos: Vec3; health: number };
  shots: number; received: number; damage: number;
  lastShot: SpacePulse | null; lastHit: SpacePulse | null;
  end: { outcome: 'won' | 'retreated' | 'lost'; at: number; economyAt: number; health: number } | null;
  rescue: ShipRescue | null;
}
export interface CombatArchive {
  battles: number; victories: number; retreats: number; defeats: number;
  shots: number; received: number; damage: number; restored: number; endedAt: number;
  invasionVictories?: number; invasionRetreats?: number; invasionDefeats?: number;
  defenseVictories?: number; defenseRetreats?: number; defenseDefeats?: number;
  wardenVictories?: number; wardenRetreats?: number; wardenDefeats?: number;
}
export interface SpaceCombat {
  version: 1 | 2 | 3;
  activated: { cut: EmpireCut; economyAt: number; health: number | null; repaired: number };
  archive: CombatArchive;
  /** The latest32 encounters. An active battle or unrecovered wreck stays here. */
  battles: SpaceBattle[];
  /** An explicit repair of a historical zero-health dock, never an invented battle. */
  legacyRescue: ShipRescue | null;
}
