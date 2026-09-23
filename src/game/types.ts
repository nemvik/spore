import type { CreatureStageState, SpeciesAction } from './creature-stage-types';
import type { WorldStage } from './stage';
import type { Journey } from './journey-types';
import type { TribeState, MachineState, PlanetState } from './era-types';
import type { CreatureBody, LimbGene } from './creature-body';
import type { CreatureActionState } from './creature-actions';
export type { CreatureBody, CreatureSpineNode, LimbEnd, LimbGene, LimbJoint } from './creature-body';

export type Stage = 0 | 1 | 2 | 3 | 4 | 5;
export type AdaptationId = 'flagellum'|'fins'|'tail'|'legs'|'arms'|'jet'|'filter'|'jaw'|'proboscis'|'eyes'|'antenna'|'sonar'|'shell'|'spines'|'toxin'|'gills'|'lungs'|'bladder'|'reservoir'|'chloroplast'|'symbiote'|'recycler';
export type Category = 'movement'|'feeding'|'senses'|'defense'|'metabolism'|'symbiosis';
export interface Part { id: string; kind: AdaptationId; axial: number; angle: number; scale: number; mirrored: boolean; limb?: LimbGene; }
export interface SpineNode { width: number; height: number; bend: number; }
export interface GenomeFields { name: string; length: number; width: number; hue: number; pattern: number; parts: Part[]; }
export interface LegacyGenome extends GenomeFields { version: 1; spine?: SpineNode[]; body?: never; }
export interface CreatureGenome extends GenomeFields { version: 2; body: CreatureBody; spine?: never; }
export type Genome = LegacyGenome | CreatureGenome;
export interface Stats { speed: number; acceleration: number; turn: number; maxHealth: number; damage: number; armor: number; metabolism: number; sense: number; swim: number; walk: number; oxygen: number; moisture: number; diet: string[]; abilities: AdaptationId[]; mass: number; }
export interface Adaptation { id: AdaptationId; name: string; category: Category; description: string; tradeoff: string; cost: number; stage: Stage; max: number; }
export interface Vec3 { x: number; y: number; z: number; }
export type FoodKind = 'algae'|'mineral'|'nectar'|'meat'|'detritus';
export interface Resource { id: number; kind: FoodKind; pos: Vec3; amount: number; max: number; patch: number; regen: number; }
export interface Species { id: string; name: string; stage: Stage; role: 'grazer'|'predator'|'partner'|'invasive'; shape: 'ray'|'stalker'|'jelly'|'grazer'|'spiral'|'strider'|'moth'|'crab'|'worm'; color: number; size: number; speed: number; diet: FoodKind[]; description: string; }
export interface Creature { id: number; species: string; pos: Vec3; velocity: Vec3; heading: number; health: number; hunger: number; age: number; fear: number; intent: 'forage'|'flee'|'hunt'|'rest'|'bonded'; target: number|null; cooldown: number; patch: number; }
export interface Patch { id: number; name: string; subtitle: string; center: Vec3; radius: number; fertility: number; pressure: number; hunted: number; harvested: number; restored: number; color: number; discovered: boolean; }
export interface Obstacle { id: number; pos: Vec3; radius: number; height: number; kind: 'rock'|'coral'|'tree'; }
export interface Landmark { id: string; kind: 'nest'|'gate'|'spring'; name: string; pos: Vec3; charge: number; }
export interface World { creatureDesigns?: import('./npc-genome').NpcDesign[]; seed: number; stage: WorldStage; rng: number; time: number; resources: Resource[]; creatures: Creature[]; patches: Patch[]; obstacles: Obstacle[]; landmarks: Landmark[]; nextId: number; births: number; deaths: number; }
export interface Bond { species: string; loyalty: number; hunger: number; benefit: 'shield'|'recycle'|'light'; age: number; }
export interface Player { pos: Vec3; velocity: Vec3; heading: number; health: number; energy: number; oxygen: number; moisture: number; genome: Genome; creatureActions?: CreatureActionState; dna: number; totalDna: number; generation: number; meals: number; kills: number; bonds: Bond[]; cooldown: number; abilityRecharge: number; scan: number; invulnerable: number; feeding: number; distance: number; }
export interface LineageEntry { generation: number; stage: Stage; time: number; name: string; parts: AdaptationId[]; event: string; }
export interface Campaign { stageMeals: number; stageKills: number; stageBonds: number; stageReproductions: number; discoveries: string[]; journals: string[]; drought: number; finale: 'restoration'|'predator'|'migration'|null; won: boolean; sandbox: boolean; }
export interface GameState { version: 3; cellGrowth?: import('./cell-growth').CellGrowth; creatureStage?: CreatureStageState; tribe?: TribeState; machines?: MachineState; planet?: PlanetState; id: string; seed: number; stage: Stage; tick: number; rng: number; player: Player; worlds: [World|null,World|null,World|null]; world: World; campaign: Campaign; journey: Journey; lineage: LineageEntry[]; checkpoint: string|null; messages: {id:number; text:string; time:number}[]; deathReason: string|null; }
/** Deliberate pointer intent belongs to an input command, never to a saved world. */
export interface FeedSelection { kind: 'creature' | 'food'; id: number; stage: Stage; }
export interface Input { x: number; z: number; vertical: number; sprint: boolean; feed: boolean; bond: boolean; tend: boolean; pulse: boolean; jump?: boolean; communicate?: boolean; speciesAction?: SpeciesAction; offer?: boolean; feedSelection?: FeedSelection | null; }
export const EMPTY_INPUT: Input = { x: 0, z: 0, vertical: 0, sprint: false, feed: false, bond: false, tend: false, pulse: false };
export interface Settings { master: number; ambience: number; effects: number; muted: boolean; quality: 'low'|'medium'|'high'; sensitivity: number; reducedMotion: boolean; }
