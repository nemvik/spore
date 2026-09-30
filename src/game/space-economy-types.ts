import type { EquipmentReceipt } from './space-outfit-types';
import type { ExpansionReceipt } from './space-expansion-types';
import type { SpacePriceBasis } from './space-empires-types';
import type { WarConquest } from './space-war-types';
import type { PatronageReceipt, SocietyService } from './space-discoveries-types';
/** Versioned colony accounts; historical campaigns opt in explicitly. */
export type SpaceProduct = 'sun-resin' | 'moon-salt' | 'spore-silk';
export interface Colony {
  id: string; planetId: string; product: SpaceProduct;
  foundedAt: number; paid: 40; level: 1 | 2 | 3; upgraded: number;
  /** Active production time; full storage still consumes cycles. */
  productiveElapsed: number; produced: number; loaded: number;
  /** Only a new settlement of purchased sovereign territory needs this proof. */
  permission?: { titleSerial: number; foundingSerial: number };
  militaryPermission?: { claim: WarConquest; foundingSerial: number };
}
export interface ProductCargo { planetId: string; product: SpaceProduct; amount: number; }
export type SpaceEconomyKind = 'deposit' | 'found' | 'upgrade' | 'load' | 'sell' | 'repair' | 'charge';
interface EconomyReceipt {
  serial: number; at: number; tick: number; spaceAt: number;
  /** This economic row precedes the biological action with this serial. */
  lifeAction: number;
  warAction?: number;
  planetId: string; balanceBefore: number; balanceAfter: number;
}
export type SpaceEconomyAction = EquipmentReceipt | ExpansionReceipt | PatronageReceipt | EconomyReceipt & (
  { kind: 'deposit'; paid: 20; homeBefore: number; homeAfter: number }
  | { kind: 'found'; paid: 40; colonyId: string }
  | { kind: 'upgrade'; paid: 20; colonyId: string; level: 2 | 3; productiveElapsed: number; produced: number }
  | { kind: 'load'; paid: 0; colonyId: string; product: SpaceProduct; amount: number; eventAction?: number }
  | { kind: 'sell'; originPlanetId: string; product: SpaceProduct; amount: number; unitPrice: number; earned: number; priceBasis?: SpacePriceBasis }
  | { kind: 'repair' | 'charge'; paid: number; before: number; after: number; societyService?: SocietyService }
);
export interface SpaceEconomy {
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Present in v2 and newer. Earlier receipts retain the exact v1 rules. */
  pricingActivatedAction?: number;
  activated: { spaceAt: number; planetAt: number; tick: number };
  /** Advances only in the ordinary simulation, including flight and the home workshop. */
  elapsed: number; balance: number;
  colonies: Colony[]; cargo: ProductCargo[];
  sales: { planetId: string; product: SpaceProduct; amount: number; earned: number }[];
  ledger: { deposits: number; construction: number; upgrades: number; repairs: number; charging: number; revenue: number; healthRestored: number; energyRestored: number; equipment?: number; alliance?: number; territory?: number; patronage?: number };
  counts: Record<SpaceEconomyKind, number> & { equipment?: number; alliance?: number; territory?: number; patronage?: number };
  actions: SpaceEconomyAction[]; nextAction: number;
}
