import type { SpaceCombat } from './space-combat-types';
import type { SpaceCore } from './space-core-types';
import type { SpaceWars } from './space-war-types';
import type { SpaceEvents } from './space-events-types';
import type { SpaceDiscoveries, WormholePassage } from './space-discoveries-types';
import type { SpaceOutfit } from './space-outfit-types';
import type { SpaceExpansion } from './space-expansion-types';
import type { SpaceEconomy } from './space-economy-types';
import type { SpaceEmpires } from './space-empires-types';
import type { ShipCreation } from './ship-library';
import type { Vec3 } from './types';
import type { SpaceExpedition } from './space-expedition-types';

export type SpaceScale = 'surface' | 'orbit' | 'system';
export interface SpacePosition { scale: SpaceScale; systemId: string; planetId: string; pos: Vec3; heading: number; }
export interface SpaceLeg { from: SpacePosition; to: SpacePosition; elapsed: number; duration: number; energyPaid: number; passage?: WormholePassage; }
export interface OwnedShip {
  id: string; creation: ShipCreation; health: number; energy: number;
  purchase: { tick: number; before: number; paid: number; after: number; };
}
export interface SpaceState {
  version: 1; homePlanetId: string; elapsed: number; ship: OwnedShip | null;
  location: SpacePosition | null; leg: SpaceLeg | null;
  log: { serial: number; at: number; from: 'dock' | SpaceScale; to: 'dock' | SpaceScale; planetId: string; fromPlanetId?: string; passage?: WormholePassage; }[];
  nextSerial: number; notice: string;
  expedition?: SpaceExpedition;
  economy?: SpaceEconomy;
  empires?: SpaceEmpires;
  outfit?: SpaceOutfit;
  expansion?: SpaceExpansion;
  combat?: SpaceCombat;
  wars?: SpaceWars;
  events?: SpaceEvents;
  discoveries?: SpaceDiscoveries;
  core?: SpaceCore;
}
