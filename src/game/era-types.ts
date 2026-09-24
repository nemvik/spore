import type { TribeDomestication } from './tribe-domestication';
import type { TribeMusic } from './tribe-music';
import type { Bond, Creature, Vec3 } from './types';
import type { UnitOrder } from './unit-order';
import type { VehicleBlueprint } from './blueprint';
import type { EcologySite } from './journey-types';
import type { CulturalDesign, TribeCulture } from './culture';

export interface TribeMember { id: number; pos: Vec3; heading: number; health: number; hunger: number; tool: string | null; }
export interface Hut { id: number; kind: 'shelter' | 'workshop'; pos: Vec3; tool: string | null; }
export interface NeighbourTribe { id: number; pos: Vec3; relation: number; resolved: 'conquered' | 'allied' | null; }

/** P0 stores the foundation only; the tribe simulation is added in P1. */
export interface TribePreviewState {
  version: 1;
  food: number;
  members: TribeMember[];
  huts: Hut[];
  unlocked: string[];
  neighbours: NeighbourTribe[];
}

export type ToolId = 'basket' | 'spear' | 'drum' | 'flute' | 'rattle' | 'waterskin';
export type LegacyAbility = 'restoration' | 'predator' | 'migration';
export interface UnitNavigation { waypoint: Vec3; target: Vec3; rethink: number; }
export interface TribeUnit extends Omit<TribeMember, 'tool'> {
  outfit?: CulturalDesign;
  tool: ToolId | null;
  species: string | null;
  benefit: Bond['benefit'] | null;
  loyalty: number;
  cargo: number;
  cooldown: number;
  orders: UnitOrder[];
  intent: Creature['intent'] | 'build' | 'socialize';
  navigation: UnitNavigation;
}
export interface TribeBuilding extends Omit<Hut, 'tool'> {
  tool: ToolId | null;
  progress: number;
  health: number;
}
export interface TribeNeighbour extends NeighbourTribe {
  identity: 'garden' | 'terrace' | 'sanctuary';
  health: number;
  alarm: number;
  tribute: number;
  cooldown: number;
  society?: NeighbourSociety;
}
export interface NeighbourUnit {
  id: number;
  pos: Vec3;
  heading: number;
  health: number;
  hunger: number;
  cargo: number;
  cooldown: number;
  task: 'rest' | 'forage' | 'return' | 'defend' | 'raid';
  resource: number | null;
  navigation: UnitNavigation;
}
export interface NeighbourSociety {
  version: 1;
  food: number;
  members: NeighbourUnit[];
  recruitCooldown: number;
  raidCooldown: number;
  truce: number;
  expedition: { phase: 'warning' | 'outbound' | 'return'; members: number[]; time: number } | null;
}
export interface ActiveTribeState {
  version: 2;
  domestication?: TribeDomestication;
  culture?: TribeCulture;
  music?: TribeMusic;
  food: number;
  members: TribeUnit[];
  huts: TribeBuilding[];
  unlocked: ToolId[];
  neighbours: TribeNeighbour[];
  legacyAbility: LegacyAbility;
  abilityCooldown: number;
  abilityTime: number;
  nextId: number;
  elapsed: number;
  completed: boolean;
}
export type TribeState = TribePreviewState | ActiveTribeState;

/** Unspecified collections stay empty until their schema and simulation exist. */
export interface MachinePreviewState { version: 1; resource: number; blueprints: never[]; fleet: never[]; regions: never[]; }
export interface MachineDesign { id:number; blueprint:VehicleBlueprint; }
export interface MachineUnit { id:number; blueprint:number; pos:Vec3; heading:number; health:number; cooldown:number; cargo:number; orders:UnitOrder[]; navigation:UnitNavigation; intent:'rest'|'move'|'work'|'return'|'attack'; }
export interface MachineRegion { id:number; identity:'gardens'|'terraces'|'highlands'; pos:Vec3; airOnly:boolean; owner:'neutral'|'player'; method:LegacyAbility|null; health:number; soil:number; settlers:number; relation:number; deliveries:number; alarm:number; cooldown:number; }
export interface AmberSpring { id:number; pos:Vec3; owner:'neutral'|'player'; progress:number; rate:number; }
export interface ActiveMachineState {
  version:2;resource:number;blueprints:MachineDesign[];fleet:MachineUnit[];regions:MachineRegion[];springs:AmberSpring[];
  archetype:LegacyAbility;airUnlocked:boolean;barrierIds:number[];nextId:number;elapsed:number;completed:boolean;
}
export type MachineState=MachinePreviewState|ActiveMachineState;
export interface PlanetPreviewState { version: 1; temperature: number; atmosphere: number; tScore: 0 | 1 | 2 | 3; stabilizers: never[]; }
export type TScore=0|1|2|3;
export interface PlanetBiome {id:number;level:1|2|3;pos:Vec3;}
export interface PlanetRoot {id:number;biome:number;key:string;site:EcologySite;}
export interface PlanetPopulation {id:number;biome:number;key:string;pos:Vec3;vitality:number;abundance:number;nutrition:number;}
export interface PlanetNursery {pos:Vec3;sources:{key:string;resourceId:number}[];}
export interface ActivePlanetState {
  version:2;temperature:number;atmosphere:number;tScore:TScore;
  activeMachine:number;toolOn:boolean;biomes:PlanetBiome[];stabilizers:PlanetRoot[];populations:PlanetPopulation[];nursery:PlanetNursery;
  nextId:number;elapsed:number;stableTime:number;completed:boolean;sandbox:boolean;
}
export type PlanetState=PlanetPreviewState|ActivePlanetState;

export const emptyTribe = (): TribePreviewState => ({ version: 1, food: 0, members: [], huts: [], unlocked: [], neighbours: [] });
export const emptyMachines = (): MachinePreviewState => ({ version: 1, resource: 0, blueprints: [], fleet: [], regions: [] });
export const emptyPlanet = (): PlanetPreviewState => ({ version: 1, temperature: 0, atmosphere: 0, tScore: 0, stabilizers: [] });
