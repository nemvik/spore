import type { EmpireCut } from './space-empires-types';
import type { ExpeditionAction } from './space-expedition-types';

export type RelicId = 'passage' | 'memory';
export type SocietyAid = 'patronage' | 'ecology';
export interface DiscoveryStamp { cut: EmpireCut; economyAt: number; warAction: number; }
export interface SocietyScan { role: number; receipt: ExpeditionAction; }
/** A permanent copy of the actual account transaction, retained after rollover. */
export interface PatronageReceipt {
  kind: 'patronage'; serial: number; at: number; tick: number; spaceAt: number;
  lifeAction: number; travelAction: number; warAction: number; planetId: string;
  balanceBefore: number; balanceAfter: number; paid: 40;
  discoveryAction: number; shipId: string;
}
export type DiscoveryAction = DiscoveryStamp & { serial: number; planetId: string } & (
  { kind: 'relic'; relicId: RelicId }
  | { kind: 'contact' | 'share' }
  | { kind: 'accept'; aid: SocietyAid }
  | { kind: 'support'; aid: 'patronage'; receipt: PatronageReceipt }
  | { kind: 'support'; aid: 'ecology'; localAt: number }
);
export interface SpaceDiscoveries {
  version: 1; activated: DiscoveryStamp;
  /** Union of historical live/checkpoint reservations; never relocates later. */
  protectedPlanets: string[];
  society: { planetId: string; enclave: boolean };
  /** At most two relics and four society steps. No rolling history required. */
  actions: DiscoveryAction[]; nextAction: number;
  /** Six new paid role scans after accepting ecological aid, frozen on support. */
  scans: SocietyScan[];
}
/** Only this proven route bypasses the ordinary distance/cost calculation. */
export interface WormholePassage { kind: 'wormhole'; relicSerial: number; }
export interface SocietyService { supportSerial: number; travelAction: number; }
