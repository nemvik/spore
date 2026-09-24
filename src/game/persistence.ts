import { validateChief, validateChiefContext } from './tribe-chief-validation';
import { validateDomestication, validateDomesticationContext } from './tribe-domestication-validation';
import { validateMusic, validateMusicContext } from './tribe-music-validation';
import { HISTORY_FOODS, HISTORY_METHODS, stageFacts, stageOutcome, type StageHistory } from './lineage-history';
import { CELL_PARTS, CELL_THRESHOLDS } from './cell-growth';
import { validateNpcDesigns } from './npc-genome';
import { DISCOVERY_PARTS } from './creature-discovery';
import { SAVE_ERRORS } from './errors.cs';
import type { GameState, Stage, World } from './types';
import { CREATURE_ADAPTATIONS, computeStats, genomeCost, has, initialGenome, validateGenome } from './genome';
import { SPECIES } from './content';
import { emptyJourney } from './journey-types';
import type { Journey } from './journey-types';
import { groundHeight } from './random';
import { WORLD_BOUND } from './world';
import { SITE_STORIES } from './journey-content';
import { ECOLOGY_CATALOG, ecologyTaxon } from './ecology-catalog';
import { planetTScore } from './planet';
import { worldStageFor } from './stage';
import type { ActiveMachineState, ActivePlanetState, ActiveTribeState } from './era-types';
import { validateCulture, validateOutfit } from './culture';
import { validateVehicle, vehicleStats } from './blueprint';
import type { VehicleBlueprint } from './blueprint';
import { MAX_UNIT_ORDERS, validOrderShape } from './unit-order';
import type { UnitOrder } from './unit-order';
import { CREATURE_SPECIES } from './creature-stage';
import { COMBAT_ACTIONS, SOCIAL_ACTIONS } from './creature-stage-types';

const FORMAT = 'lumavora';
const SAVE_PREFIX = 'lumavora:save:';
const MAX_BYTES = 8 * 1024 * 1024;
const UINT32 = 0xffffffff;
const MAX_COUNT = 1_000_000_000;
const foods = ['algae', 'mineral', 'nectar', 'meat', 'detritus'];
const adaptationIds: ReadonlySet<string> = new Set(CREATURE_ADAPTATIONS.map((item) => item.id));
const knownSpecies = new Map(SPECIES.map((item) => [item.id, item]));
type SavedEnvelope = { format: 'lumavora'; version: 3; savedAt: number; state: GameState };
export interface SaveSummary { id: string; name: string; stage: number; generation: number; seed: number; updatedAt: number }

function invalid(path: string, reason: string): never { throw new Error(SAVE_ERRORS.corrupted(path, reason)); }
function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, SAVE_ERRORS.objectRequired);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(result, key))) invalid(path, SAVE_ERRORS.invalidFields);
  return result;
}
function number(value: unknown, path: string, min = 0, max = MAX_COUNT, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(path, SAVE_ERRORS.invalidNumber);
  return value;
}
function string(value: unknown, path: string, max = 256, min = 1): string {
  if (typeof value !== 'string' || value.length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) invalid(path, SAVE_ERRORS.invalidText);
  return value;
}
function boolean(value: unknown, path: string): void { if (typeof value !== 'boolean') invalid(path, SAVE_ERRORS.booleanRequired); }
function oneOf(value: unknown, allowed: readonly unknown[], path: string): void { if (!allowed.includes(value)) invalid(path, SAVE_ERRORS.unknownValue); }
function array(value: unknown, path: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length > max || value.length < min) invalid(path, SAVE_ERRORS.invalidCount);
  return value;
}
function vector(value: unknown, path: string, limit = 1024): void {
  const v = object(value, path, ['x', 'y', 'z']);
  for (const axis of ['x', 'y', 'z']) number(v[axis], `${path}.${axis}`, -limit, limit);
}
function uniqueIds(values: number[], path: string): void { if (new Set(values).size !== values.length) invalid(path, SAVE_ERRORS.duplicateIds); }
function gameId(value: unknown, path: string): string {
  const id = string(value, path, 96);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) invalid(path, SAVE_ERRORS.invalidLineageId);
  return id;
}

function validateCreatureActions(value: unknown, path: string): void {
  const actions = object(value, path, ['version', 'jumpRecharge', 'communicationRecharge', 'communicationTime', 'communicationSerial']);
  oneOf(actions.version, [1], `${path}.version`);
  number(actions.jumpRecharge, `${path}.jumpRecharge`, 0, 1.2);
  number(actions.communicationRecharge, `${path}.communicationRecharge`, 0, 2);
  number(actions.communicationTime, `${path}.communicationTime`, 0, .8);
  number(actions.communicationSerial, `${path}.communicationSerial`, 0, MAX_COUNT, true);
}

function validateCreatureStage(value: unknown, stage: Stage, coast: World | null): void {
  const at = 'state.creatureStage';
  const hasDiscovery = !!value && typeof value === 'object' && Object.hasOwn(value, 'discovery');
  const life = object(value, at, [...(hasDiscovery ? ['discovery'] : []), 'version', 'nests', 'pack', 'encounter', 'recharge', 'attack', 'guards', 'cue', 'completed']);
  oneOf(life.version, [1], `${at}.version`);
  number(life.recharge, `${at}.recharge`, 0, 3.2);
  oneOf(life.completed, [null, 'social', 'predator', 'mixed'], `${at}.completed`);
  const residents: number[] = [], species: unknown[] = [], outcomes: unknown[] = [];
  const nests = array(life.nests, `${at}.nests`, stage < 2 ? 0 : 4, stage < 2 ? 0 : 4);
  const living = (value: unknown, path: string) => {
    const id = number(value, path, 1, MAX_COUNT, true), c = coast?.creatures.find(c => c.id === id && c.health > 0);
    if (!c) invalid(path, SAVE_ERRORS.unknownValue);
    return c;
  };
  nests.forEach((value, i) => {
    const path = `${at}.nests[${i}]`, n = object(value, path, ['species', 'pos', 'residents', 'relationship', 'outcome', 'defeats', 'discovered']);
    oneOf(n.species, CREATURE_SPECIES, `${path}.species`); species.push(n.species);
    vector(n.pos, `${path}.pos`, WORLD_BOUND);
    number(n.relationship, `${path}.relationship`, -100, 100); boolean(n.discovered, `${path}.discovered`);
    oneOf(n.outcome, [null, 'friend', 'predator'], `${path}.outcome`); outcomes.push(n.outcome);
    number(n.defeats, `${path}.defeats`, 0, 2, true);
    if (n.outcome === 'predator' && n.defeats !== 2 || n.outcome === null && n.defeats === 2) invalid(path, SAVE_ERRORS.unknownValue);
    array(n.residents, `${path}.residents`, 2).forEach((id, j) => {
      const c = living(id, `${path}.residents[${j}]`);
      if (c.species !== n.species) invalid(path, SAVE_ERRORS.unknownSpecies);
      residents.push(c.id);
    });
  });
  if (new Set(species).size !== species.length) invalid(`${at}.nests`, SAVE_ERRORS.duplicateIds);
  uniqueIds(residents, `${at}.nests.residents`);
  const resolved = outcomes.filter(o => o !== null).length;
  const pack = array(life.pack, `${at}.pack`, Math.min(3, resolved)).map((id, i) => {
    const c = living(id, `${at}.pack[${i}]`);
    if (!residents.includes(c.id) || !nests.some(value => { const n = value as Record<string, unknown>; return n.species === c.species && Number(n.relationship) >= 60; })) invalid(`${at}.pack`, SAVE_ERRORS.unknownValue);
    return c.id;
  });
  uniqueIds(pack, `${at}.pack`);
  if (life.completed !== null) {
    const friends=outcomes.filter(o=>o==='friend').length,defeated=outcomes.filter(o=>o==='predator').length;
    // Completion is history: resolving the fourth nest in sandbox cannot rewrite it.
    if (resolved < 3 || life.completed==='social'&&friends<3 || life.completed==='predator'&&defeated<3 || life.completed==='mixed'&&(!friends||!defeated)) invalid(`${at}.completed`, SAVE_ERRORS.invalidFinale);
  }
  if (life.encounter !== null) {
    const path = `${at}.encounter`, e = object(life.encounter, path, ['species', 'target', 'requested', 'round', 'progress', 'mistakes', 'remaining']);
    const c = living(e.target, `${path}.target`);
    if (!species.includes(e.species) || c.species !== e.species || pack.includes(c.id)) invalid(path, SAVE_ERRORS.unknownValue);
    oneOf(e.requested, SOCIAL_ACTIONS, `${path}.requested`);
    number(e.round, `${path}.round`, 0, 12, true); number(e.progress, `${path}.progress`, 0, hasDiscovery && (life.discovery as { alpha?: { id: number } })?.alpha?.id === e.target ? 9 : 6); number(e.mistakes, `${path}.mistakes`, 0, 2, true); number(e.remaining, `${path}.remaining`, 0, 12);
  }
  if (life.attack !== null) {
    const path = `${at}.attack`, a = object(life.attack, path, ['kind', 'target', 'remaining', 'pos', 'aim', 'damage']);
    oneOf(a.kind, ['charge', 'spit'], `${path}.kind`);
    // A projectile can survive its target for one tick; the ID must still be historic, never an arbitrary future ID.
    number(a.target, `${path}.target`, 1, (coast?.nextId ?? 1) - 1, true);
    number(a.remaining, `${path}.remaining`, 0, a.kind === 'charge' ? 1.4 : .8); number(a.damage, `${path}.damage`, 0, 16);
    vector(a.pos, `${path}.pos`); vector(a.aim, `${path}.aim`);
    if (life.encounter !== null) invalid(path, SAVE_ERRORS.unknownValue);
  }
  const guards = array(life.guards, `${at}.guards`, 8).map((value, i) => {
    const path = `${at}.guards[${i}]`, g = object(value, path, ['id', 'target', 'remaining', 'aim']);
    const c = living(g.id, `${path}.id`); if (!residents.includes(c.id) || pack.includes(c.id)) invalid(path, SAVE_ERRORS.unknownValue);
    if(g.target!==-1){const target=living(g.target,`${path}.target`);if(!residents.includes(target.id)||target.id===c.id)invalid(path,SAVE_ERRORS.unknownValue);}
    number(g.remaining, `${path}.remaining`, 0, .9); vector(g.aim, `${path}.aim`); return c.id;
  });
  uniqueIds(guards, `${at}.guards`);
  if (life.cue !== null) {
    const path = `${at}.cue`, cue = object(life.cue, path, ['action', 'target', 'remaining', 'success']);
    oneOf(cue.action, [...SOCIAL_ACTIONS, ...COMBAT_ACTIONS], `${path}.action`);
    number(cue.target, `${path}.target`, 1, (coast?.nextId ?? 1) - 1, true);
    number(cue.remaining, `${path}.remaining`, 0, 1.2); boolean(cue.success, `${path}.success`);
  }
  if (stage < 2 && (life.recharge !== 0 || life.encounter !== null || life.attack !== null || life.cue !== null || life.completed !== null)) invalid(at, SAVE_ERRORS.eraSliceMismatch);
}


function validateDiscovery(value: unknown, stage: Stage, coast: World | null, generation: number, tick: number, genome: GameState['player']['genome']): void {
  const at = 'state.creatureStage.discovery';
  const d = object(value, at, ['version', 'parts', 'remains', 'alpha', 'birth', 'migration', 'migrations', 'socialAssists']);
  oneOf(d.version, [1], `${at}.version`); number(d.socialAssists, `${at}.socialAssists`, 0, MAX_COUNT, true);
  const historyTime = (v: Record<string, unknown>, path: string) => { number(v.generation, `${path}.generation`, 1, generation, true); number(v.tick, `${path}.tick`, 0, tick, true); };
  const parts = array(d.parts, `${at}.parts`, DISCOVERY_PARTS.length).map((value, i) => {
    const path = `${at}.parts[${i}]`, p = object(value, path, ['part', 'source', 'origin', 'generation', 'tick', 'usedGeneration']);
    oneOf(p.part, DISCOVERY_PARTS, `${path}.part`); oneOf(p.source, ['inherited', 'remains', 'friend', 'victory', 'alpha', 'cell'], `${path}.source`);
    string(p.origin, `${path}.origin`, 160); historyTime(p, path);
    if (p.usedGeneration !== null) number(p.usedGeneration, `${path}.usedGeneration`, Number(p.generation), generation, true);
    return p;
  });
  if (new Set(parts.map(p => p.part)).size !== parts.length) invalid(`${at}.parts`, SAVE_ERRORS.duplicateIds);
  const expected = { west: 'arms', south: 'recycler', east: 'toxin' };
  const remains = array(d.remains, `${at}.remains`, stage < 2 ? 0 : 3, stage < 2 ? 0 : 3).map((value, i) => {
    const path = `${at}.remains[${i}]`, r = object(value, path, ['id', 'part', 'pos', 'collected']);
    oneOf(r.id, Object.keys(expected), `${path}.id`); oneOf(r.part, [expected[r.id as keyof typeof expected]], `${path}.part`);
    vector(r.pos, `${path}.pos`, WORLD_BOUND); boolean(r.collected, `${path}.collected`);
    if (r.collected && !parts.some(p => p.part === r.part)) invalid(path, SAVE_ERRORS.unknownValue);
    return r;
  });
  if (new Set(remains.map(r => r.id)).size !== remains.length) invalid(`${at}.remains`, SAVE_ERRORS.duplicateIds);
  if (d.alpha !== null) {
    const a = object(d.alpha, `${at}.alpha`, ['id', 'resolved']); number(a.id, `${at}.alpha.id`, 1, (coast?.nextId ?? 1) - 1, true); boolean(a.resolved, `${at}.alpha.resolved`);
    const c = coast?.creatures.find(c => c.id === a.id); if (c && c.species !== 'crest') invalid(`${at}.alpha`, SAVE_ERRORS.unknownSpecies);
    if (a.resolved && !parts.some(p => p.part === 'toxin')) invalid(`${at}.alpha`, SAVE_ERRORS.unknownValue);
  } else if (stage >= 2) invalid(`${at}.alpha`, SAVE_ERRORS.unknownValue);
  if (d.birth !== null) {
    const b = object(d.birth, `${at}.birth`, ['generation', 'tick', 'nest']); historyTime(b, `${at}.birth`); number(b.generation, `${at}.birth.generation`, 2, generation, true); vector(b.nest, `${at}.birth.nest`, WORLD_BOUND);
  }
  const migrations = array(d.migrations, `${at}.migrations`, 3).map((value, i) => {
    const path = `${at}.migrations[${i}]`, m = object(value, path, ['site', 'from', 'to', 'generation', 'tick']);
    historyTime(m, path); vector(m.from, `${path}.from`, WORLD_BOUND); vector(m.to, `${path}.to`, WORLD_BOUND);
    const r = remains.find(r => r.id === m.site && r.collected);
    if (!r || JSON.stringify(r.pos) !== JSON.stringify(m.to) || d.birth === null) invalid(path, SAVE_ERRORS.unknownValue);
    return m;
  });
  if (new Set(migrations.map(m => m.site)).size !== migrations.length) invalid(`${at}.migrations`, SAVE_ERRORS.duplicateIds);
  for (let i = 1; i < migrations.length; i++) if (Number(migrations[i].tick) < Number(migrations[i-1].tick) || JSON.stringify(migrations[i].from) !== JSON.stringify(migrations[i-1].to)) invalid(`${at}.migrations`, SAVE_ERRORS.unknownValue);
  if (stage === 2 && migrations.length && JSON.stringify(coast?.landmarks.find(l => l.kind === 'nest')?.pos) !== JSON.stringify(migrations.at(-1)!.to)) invalid(`${at}.migrations`, SAVE_ERRORS.unknownValue);
  if (d.migration !== null) {
    const m = object(d.migration, `${at}.migration`, ['site', 'pos', 'heading']); number(m.heading, `${at}.migration.heading`, -Math.PI * 2, Math.PI * 2); vector(m.pos, `${at}.migration.pos`, WORLD_BOUND);
    if (stage !== 2 || d.birth === null || !remains.some(r => r.id === m.site && r.collected) || migrations.some(old => old.site === m.site)) invalid(`${at}.migration`, SAVE_ERRORS.unknownValue);
  }
  if (stage < 2 && (parts.length || d.alpha || d.birth || d.migration || migrations.length || d.socialAssists !== 0)) invalid(at, SAVE_ERRORS.eraSliceMismatch);
  if (stage >= 2 && genome.parts.some(p => (DISCOVERY_PARTS as readonly string[]).includes(p.kind) && !parts.some(found => found.part === p.kind))) invalid(`${at}.parts`, SAVE_ERRORS.unknownValue);
}

function validateCellGrowth(value: unknown, stage: Stage, generation: number, tick: number, genome: GameState['player']['genome']) {
  const at='state.cellGrowth',c=object(value,at,['version','nutrition','parts','sites','contact']);
  oneOf(c.version,[1],at+'.version');number(c.nutrition,at+'.nutrition',0,15,true);
  const parts=array(c.parts,at+'.parts',3).map((value,i)=>{
    const path=`${at}.parts[${i}]`,p=object(value,path,['part','source','origin','generation','tick','usedGeneration']);
    oneOf(p.part,CELL_PARTS,path+'.part');oneOf(p.source,['cell'],path+'.source');string(p.origin,path+'.origin',160);
    number(p.generation,path+'.generation',1,generation,true);number(p.tick,path+'.tick',0,tick,true);
    if(p.usedGeneration!==null)number(p.usedGeneration,path+'.usedGeneration',Number(p.generation)+1,generation,true);
    return p;
  });
  if(new Set(parts.map(p=>p.part)).size!==parts.length)invalid(at+'.parts',SAVE_ERRORS.duplicateIds);
  const sites=array(c.sites,at+'.sites',3,3).map((value,i)=>{
    const path=`${at}.sites[${i}]`,site=object(value,path,['part','pos','collected']);
    oneOf(site.part,[CELL_PARTS[i]],path+'.part');vector(site.pos,path+'.pos',WORLD_BOUND);boolean(site.collected,path+'.collected');
    if(site.collected!==parts.some(p=>p.part===site.part)||site.collected&&Number(c.nutrition)<CELL_THRESHOLDS[CELL_PARTS.indexOf(site.part as typeof CELL_PARTS[number])+1])invalid(path,SAVE_ERRORS.unknownValue);
    return site;
  });
  if(new Set(sites.map(p=>p.part)).size!==3)invalid(at+'.sites',SAVE_ERRORS.duplicateIds);
  if(c.contact!==null){const cue=object(c.contact,at+'.contact',['kind','pos','tick']);oneOf(cue.kind,['mouth','spines','shell','hurt','toxin','growth'],at+'.contact.kind');vector(cue.pos,at+'.contact.pos',WORLD_BOUND+20);number(cue.tick,at+'.contact.tick',0,tick,true);}
  if(stage<2&&genome.parts.some(p=>(CELL_PARTS as readonly string[]).includes(p.kind)&&!parts.some(found=>found.part===p.kind)))invalid(at+'.parts',SAVE_ERRORS.unknownValue);
}

function validateWorld(value: unknown, stage: Stage, seed: number, path: string): World {
  const hasDesigns = !!value && typeof value === 'object' && Object.hasOwn(value, 'creatureDesigns');
  if (hasDesigns) { if (stage !== 2) invalid(path, 'Katalog tvorů patří na souš.'); validateNpcDesigns((value as World).creatureDesigns); }
  const w = object(value, path, [...(hasDesigns ? ['creatureDesigns'] : []), 'seed', 'stage', 'rng', 'time', 'resources', 'creatures', 'patches', 'obstacles', 'landmarks', 'nextId', 'births', 'deaths']);
  if (w.stage !== stage || w.seed !== seed) invalid(path, SAVE_ERRORS.worldMismatch);
  number(w.rng, `${path}.rng`, 0, UINT32, true);
  for (const field of ['time', 'births', 'deaths']) number(w[field], `${path}.${field}`, 0, MAX_COUNT, field !== 'time');
  const nextId = number(w.nextId, `${path}.nextId`, 1, MAX_COUNT, true);
  const patches = array(w.patches, `${path}.patches`, 3, 3);
  patches.forEach((value, index) => {
    const p = object(value, `${path}.patches[${index}]`, ['id', 'name', 'subtitle', 'center', 'radius', 'fertility', 'pressure', 'hunted', 'harvested', 'restored', 'color', 'discovered']);
    if (p.id !== index) invalid(`${path}.patches`, SAVE_ERRORS.patchIds);
    string(p.name, `${path}.patch.name`, 80); string(p.subtitle, `${path}.patch.subtitle`, 160);
    vector(p.center, `${path}.patch.center`); number(p.radius, `${path}.patch.radius`, 1, 200);
    number(p.fertility, `${path}.patch.fertility`, 0.15, 1.5);
    number(p.pressure, `${path}.patch.pressure`, -1, MAX_COUNT);
    for (const field of ['hunted', 'harvested', 'restored']) number(p[field], `${path}.patch.${field}`, 0, MAX_COUNT, true);
    number(p.color, `${path}.patch.color`, 0, 0xffffff, true); boolean(p.discovered, `${path}.patch.discovered`);
  });
  const ids: number[] = [];
  array(w.resources, `${path}.resources`, 512).forEach((value, index) => {
    const at = `${path}.resources[${index}]`;
    const r = object(value, at, ['id', 'kind', 'pos', 'amount', 'max', 'patch', 'regen']);
    ids.push(number(r.id, `${at}.id`, 1, MAX_COUNT, true));
    oneOf(r.kind, foods, `${at}.kind`); vector(r.pos, `${at}.pos`);
    const capacity = number(r.max, `${at}.max`, 0.1, 1000);
    number(r.amount, `${at}.amount`, 0, capacity); number(r.regen, `${at}.regen`, 0, 10);
    number(r.patch, `${at}.patch`, 0, patches.length - 1, true);
  });
  array(w.creatures, `${path}.creatures`, 128).forEach((value, index) => {
    const at = `${path}.creatures[${index}]`;
    const c = object(value, at, ['id', 'species', 'pos', 'velocity', 'heading', 'health', 'hunger', 'age', 'fear', 'intent', 'target', 'cooldown', 'patch']);
    ids.push(number(c.id, `${at}.id`, 1, MAX_COUNT, true));
    const species = knownSpecies.get(string(c.species, `${at}.species`, 40));
    if (!species || species.stage !== stage) invalid(`${at}.species`, SAVE_ERRORS.unknownSpecies);
    vector(c.pos, `${at}.pos`); vector(c.velocity, `${at}.velocity`, 100);
    number(c.heading, `${at}.heading`, -1e9, 1e9); number(c.health, `${at}.health`, -1000, 10000);
    number(c.hunger, `${at}.hunger`, 0, 100);
    for (const field of ['age', 'fear', 'cooldown']) number(c[field], `${at}.${field}`);
    oneOf(c.intent, ['forage', 'flee', 'hunt', 'rest', 'bonded'], `${at}.intent`);
    if (c.target !== null) number(c.target, `${at}.target`, -1, MAX_COUNT, true);
    number(c.patch, `${at}.patch`, 0, patches.length - 1, true);
  });
  array(w.obstacles, `${path}.obstacles`, 256).forEach((value, index) => {
    const at = `${path}.obstacles[${index}]`;
    const o = object(value, at, ['id', 'pos', 'radius', 'height', 'kind']);
    ids.push(number(o.id, `${at}.id`, 1, MAX_COUNT, true)); vector(o.pos, `${at}.pos`);
    number(o.radius, `${at}.radius`, 0.05, 30); number(o.height, `${at}.height`, 0.05, 100);
    oneOf(o.kind, ['rock', 'coral', 'tree'], `${at}.kind`);
  });
  const landmarks = array(w.landmarks, `${path}.landmarks`, stage === 2 ? 5 : 2, stage === 2 ? 5 : 2);
  landmarks.forEach((value, index) => {
    const at = `${path}.landmarks[${index}]`;
    const l = object(value, at, ['id', 'kind', 'name', 'pos', 'charge']);
    const expectedId = index === 0 ? 'nest' : index === 1 ? 'gate' : `spring-${index - 2}`;
    if (l.id !== expectedId || l.kind !== (index === 0 ? 'nest' : index === 1 ? 'gate' : 'spring')) invalid(at, SAVE_ERRORS.missingLandmark);
    string(l.name, `${at}.name`, 80); vector(l.pos, `${at}.pos`); number(l.charge, `${at}.charge`, 0, 10);
  });
  uniqueIds(ids, path);
  if (ids.some((id) => id >= nextId)) invalid(`${path}.nextId`, SAVE_ERRORS.nextIdCollision);
  return value as World;
}

/** Validate references against the retained worlds, never regenerating old seeds. */
function validateJourney(value: unknown, stage: Stage, worlds: (World | null)[]): Omit<Journey, 'version'> & { version: 1 | 2 | 3 } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('journey', SAVE_ERRORS.objectRequired);
  const version = (value as Record<string, unknown>).version;
  if (version !== 1 && version !== 2 && version !== 3) invalid('journey.version', SAVE_ERRORS.unsupportedStateVersion);
  const hasDispersal = version === 3 && Object.prototype.hasOwnProperty.call(value, 'rootDispersal');
  const hasReefEvolution = version === 3 && Object.prototype.hasOwnProperty.call(value, 'reefEvolution');
  const hasEcology = Object.prototype.hasOwnProperty.call(value, 'ecology');
  const j = object(value, 'journey', ['version', 'legacy', 'sites', 'cargo', 'insights', 'echoes', 'hunters', 'offerings', ...(version === 3 ? ['canopy'] : []), ...(hasDispersal ? ['rootDispersal'] : []), ...(hasReefEvolution ? ['reefEvolution'] : []), ...(hasEcology ? ['ecology'] : [])]);
  boolean(j.legacy, 'journey.legacy');
  if (version === 3 && j.legacy) invalid('journey.legacy', SAVE_ERRORS.unknownValue);
  if (hasReefEvolution) {
    const at = 'journey.reefEvolution', reefEvolution = object(j.reefEvolution, at, ['version', 'pumping']);
    oneOf(reefEvolution.version, [1], `${at}.version`);
    number(reefEvolution.pumping, `${at}.pumping`, 0, 1);
  }
  if (hasEcology) {
    const at = 'journey.ecology', ecology = object(j.ecology, at, ['version', 'contacts']);
    oneOf(ecology.version, [1], `${at}.version`);
    const keys = array(ecology.contacts, `${at}.contacts`, ECOLOGY_CATALOG.length).map((value, index) => {
      const path = `${at}.contacts[${index}]`, contact = object(value, path, ['key', 'stage', 'patch', 'method']);
      const key = string(contact.key, `${path}.key`, 64), taxon = ecologyTaxon(key);
      if (!taxon) invalid(`${path}.key`, SAVE_ERRORS.unknownValue);
      number(contact.stage, `${path}.stage`, 0, stage, true);
      if (contact.stage !== taxon.stage || !worlds[taxon.stage]) invalid(`${path}.stage`, SAVE_ERRORS.missingActiveWorld);
      oneOf(contact.patch, [null, 0, 1, 2], `${path}.patch`);
      if (taxon.site !== null && contact.patch !== null && contact.patch !== taxon.site % 3) invalid(`${path}.patch`, SAVE_ERRORS.invalidNiche);
      oneOf(contact.method, taxon.role === 'producer' ? ['culture'] : taxon.role === 'partner' ? ['feeding', 'hunt', 'bond'] : ['feeding', 'hunt'], `${path}.method`);
      return key;
    });
    if (new Set(keys).size !== keys.length) invalid(`${at}.contacts`, SAVE_ERRORS.duplicateIds);
  }
  const siteStages = new Map<number, number>();
  const siteIds: number[] = [];
  const worldFor = (value: unknown, path: string): World => {
    const index = number(value, `${path}.stage`, 0, stage, true);
    const world = worlds[index];
    if (!world) invalid(`${path}.stage`, SAVE_ERRORS.missingActiveWorld);
    return world;
  };
  const entityId = (value: unknown, path: string, world: World): number => number(value, path, 1, world.nextId - 1, true);
  const historicCreature = (value: unknown, path: string, world: World): number => {
    const id = entityId(value, path, world);
    if (world.resources.some(r => r.id === id) || world.obstacles.some(o => o.id === id)) invalid(path, SAVE_ERRORS.unknownValue);
    return id;
  };
  array(j.sites, 'journey.sites', 9).forEach((value, index) => {
    const at = `journey.sites[${index}]`;
    const site = object(value, at, ['id', 'stage', 'patch', 'source', 'refuges', 'sourceId', 'plantedId', 'vitality', 'observed', 'resolved', 'method', 'threatIds', 'phase']);
    const world = worldFor(site.stage, at);
    const patch = number(site.patch, `${at}.patch`, 0, 2, true);
    const id = number(site.id, `${at}.id`, 0, 8, true);
    if (id !== world.stage * 3 + patch) invalid(`${at}.id`, SAVE_ERRORS.invalidNiche);
    siteIds.push(id); siteStages.set(id, world.stage);
    vector(site.source, `${at}.source`);
    array(site.refuges, `${at}.refuges`, 8, 1).forEach((refuge, index) => vector(refuge, `${at}.refuges[${index}]`));
    for (const key of ['sourceId', 'plantedId'] as const) {
      if (key === 'plantedId' && site[key] === null) continue;
      const resourceId = entityId(site[key], `${at}.${key}`, world);
      if (!world.resources.some(r => r.id === resourceId)) invalid(`${at}.${key}`, SAVE_ERRORS.unknownValue);
    }
    number(site.vitality, `${at}.vitality`, 0, 100);
    boolean(site.observed, `${at}.observed`); boolean(site.resolved, `${at}.resolved`);
    oneOf(site.method, [null, 'cultivate', 'hunt', 'guide'], `${at}.method`);
    number(site.phase, `${at}.phase`, 0, 8, true);
    const threats = array(site.threatIds, `${at}.threatIds`, 128).map((id, index) => historicCreature(id, `${at}.threatIds[${index}]`, world));
    uniqueIds(threats, `${at}.threatIds`);
  });
  uniqueIds(siteIds, 'journey.sites');
  if (!j.legacy) {
    // Linear progression has visited every stage through the active one. A
    // truncated catalogue must not turn an empty requirements list into success.
    for (let visited = 0; visited <= stage; visited++) {
      if (!worlds[visited]) invalid(`state.worlds[${visited}]`, SAVE_ERRORS.missingActiveWorld);
      if ([0, 1, 2].some(patch => siteStages.get(visited * 3 + patch) !== visited)) invalid('journey.sites', SAVE_ERRORS.invalidCount);
    }
  }
  if (version === 3) {
    const reef = worlds[1], hasReefSite = siteStages.get(4) === 1;
    if (!reef && !hasReefSite) {
      if (j.canopy !== null) invalid('journey.canopy', SAVE_ERRORS.unknownValue);
    } else {
      if (!reef || !hasReefSite) invalid('journey.canopy', SAVE_ERRORS.missingActiveWorld);
      const at = 'journey.canopy', canopy = object(j.canopy, at, ['crustId', 'capId', 'roofIds', 'releasedAt']);
      const crustId = entityId(canopy.crustId, `${at}.crustId`, reef), capId = entityId(canopy.capId, `${at}.capId`, reef);
      const roofIds = array(canopy.roofIds, `${at}.roofIds`, 4, 4).map((id, index) => entityId(id, `${at}.roofIds[${index}]`, reef));
      uniqueIds([crustId, capId, ...roofIds], at);
      const crust = reef.resources.find(resource => resource.id === crustId);
      if (!crust || crust.kind !== 'mineral' || crust.patch !== 1 || crust.max !== 1 || crust.regen !== 0) invalid(`${at}.crustId`, SAVE_ERRORS.unknownValue);
      if (reef.resources.some(resource => resource.id === capId) || reef.creatures.some(creature => creature.id === capId)) invalid(`${at}.capId`, SAVE_ERRORS.unknownValue);
      const cap = reef.obstacles.find(obstacle => obstacle.id === capId);
      if (canopy.releasedAt === null) {
        if (!cap || cap.kind !== 'rock') invalid(`${at}.capId`, SAVE_ERRORS.unknownValue);
        if (crust.amount !== 1) invalid(`${at}.releasedAt`, SAVE_ERRORS.unknownValue);
      } else {
        number(canopy.releasedAt, `${at}.releasedAt`, 0, reef.time);
        if (cap) invalid(`${at}.capId`, SAVE_ERRORS.unknownValue);
        if (crust.amount >= 1) invalid(`${at}.releasedAt`, SAVE_ERRORS.unknownValue);
      }
      for (const [index, id] of roofIds.entries()) {
        const roof = reef.obstacles.find(obstacle => obstacle.id === id);
        if (!roof || roof.kind !== 'rock' || roof.pos.y <= groundHeight(roof.pos.x, roof.pos.z, 1)) invalid(`${at}.roofIds[${index}]`, SAVE_ERRORS.unknownValue);
      }
    }
  }
  if (hasDispersal) {
    const at = 'journey.rootDispersal', dispersal = object(j.rootDispersal, at, ['version', 'carried', 'roots']);
    oneOf(dispersal.version, [1], `${at}.version`);
    const carried = array(dispersal.carried, `${at}.carried`, 32), roots = array(dispersal.roots, `${at}.roots`, 32);
    if (carried.length + roots.length > 32) invalid(at, SAVE_ERRORS.invalidCount);
    const land = worlds[2];
    if (!land && (carried.length || roots.length)) invalid(at, SAVE_ERRORS.missingActiveWorld);
    const siteReference = (entry: Record<string, unknown>, path: string) => {
      const site = number(entry.site, `${path}.site`, 6, 7, true);
      if (siteStages.get(site) !== 2) invalid(`${path}.site`, SAVE_ERRORS.invalidNiche);
      number(entry.vitality, `${path}.vitality`, Number.MIN_VALUE, 12);
      return site;
    };
    const carriers = carried.map((value, index) => {
      const path = `${at}.carried[${index}]`, entry = object(value, path, ['carrierId', 'site', 'origin', 'vitality']);
      siteReference(entry, path); vector(entry.origin, `${path}.origin`, WORLD_BOUND);
      const id = entityId(entry.carrierId, `${path}.carrierId`, land!);
      const creature = land!.creatures.find(c => c.id === id);
      if (!creature || creature.health <= 0 || knownSpecies.get(creature.species)?.role !== 'invasive') invalid(`${path}.carrierId`, SAVE_ERRORS.unknownSpecies);
      return id;
    });
    uniqueIds(carriers, `${at}.carried`);
    const rootIds = roots.map((value, index) => {
      const path = `${at}.roots[${index}]`, entry = object(value, path, ['resourceId', 'site', 'vitality']);
      const site = siteReference(entry, path), id = entityId(entry.resourceId, `${path}.resourceId`, land!);
      const resource = land!.resources.find(r => r.id === id);
      if (!resource || resource.kind !== SITE_STORIES[site].kind || resource.max !== 1 || resource.regen !== 0) invalid(`${path}.resourceId`, SAVE_ERRORS.unknownValue);
      const mother = (j.sites as Record<string, unknown>[]).some(s => s.stage === 2 && (s.sourceId === id || s.plantedId === id));
      const offering = Array.isArray(j.offerings) && j.offerings.some(o => o?.stage === 2 && o.id === id);
      if (mother || offering) invalid(`${path}.resourceId`, SAVE_ERRORS.unknownValue);
      return id;
    });
    uniqueIds(rootIds, `${at}.roots`);
  }
  if (j.cargo !== null) {
    // Earlier saves carried mother cultures or meat only. Ordinary food must
    // never gain planting permission merely because its nutritional kind matches.
    if (j.cargo && typeof j.cargo === 'object' && !Array.isArray(j.cargo) && !Object.prototype.hasOwnProperty.call(j.cargo, 'purpose')) {
      const oldCargo = j.cargo as Record<string, unknown>;
      oldCargo.purpose = oldCargo.kind === 'meat' ? 'food' : 'culture';
    }
    const cargo = object(j.cargo, 'journey.cargo', ['kind', 'purpose', 'site', 'vitality', 'distance']);
    oneOf(cargo.kind, foods, 'journey.cargo.kind');
    oneOf(cargo.purpose, ['culture', 'food'], 'journey.cargo.purpose');
    if (cargo.purpose === 'culture' && cargo.kind === 'meat') invalid('journey.cargo.purpose', SAVE_ERRORS.unknownValue);
    const source = number(cargo.site, 'journey.cargo.site', 0, 8, true);
    // Stage transition clears the carried sample; runtime actions address active sites only.
    if (siteStages.get(source) !== stage) invalid('journey.cargo.site', SAVE_ERRORS.invalidNiche);
    number(cargo.vitality, 'journey.cargo.vitality', 0, 100);
    number(cargo.distance, 'journey.cargo.distance', 0, MAX_COUNT);
  }
  for (const key of ['insights', 'echoes'] as const) {
    const entries = array(j[key], `journey.${key}`, 128).map((entry, index) => string(entry, `journey.${key}[${index}]`, 256));
    if (new Set(entries).size !== entries.length) invalid(`journey.${key}`, SAVE_ERRORS.duplicateDiscoveries);
  }
  const hunterIds = new Set<string>();
  array(j.hunters, 'journey.hunters', 384).forEach((value, index) => {
    const at = `journey.hunters[${index}]`;
    const learned = version === 3 && value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'feedingHome');
    const hunter = object(value, at, ['stage', 'id', 'phase', 'time', 'aim', ...(learned ? ['feedingHome'] : [])]);
    const world = worldFor(hunter.stage, at), id = historicCreature(hunter.id, `${at}.id`, world);
    const key = `${world.stage}:${id}`;
    if (hunterIds.has(key)) invalid(`${at}.id`, SAVE_ERRORS.duplicateIds);
    hunterIds.add(key);
    const creature = world.creatures.find(c => c.id === id);
    if (creature && knownSpecies.get(creature.species)?.role !== 'predator') invalid(`${at}.id`, SAVE_ERRORS.unknownSpecies);
    oneOf(hunter.phase, ['stalk', 'windup', 'lunge', 'recover'], `${at}.phase`);
    number(hunter.time, `${at}.time`, 0, 30); vector(hunter.aim, `${at}.aim`);
    if (learned) {
      if (world.stage !== 2) invalid(`${at}.feedingHome`, SAVE_ERRORS.unknownValue);
      vector(hunter.feedingHome, `${at}.feedingHome`, WORLD_BOUND);
    }
  });
  const offeringIds = new Set<string>();
  array(j.offerings, 'journey.offerings', 128).forEach((value, index) => {
    const at = `journey.offerings[${index}]`, offering = object(value, at, ['stage', 'id', 'site', 'remaining']);
    const world = worldFor(offering.stage, at), id = entityId(offering.id, `${at}.id`, world);
    const site = number(offering.site, `${at}.site`, 0, 8, true);
    if (siteStages.get(site) !== world.stage) invalid(`${at}.site`, SAVE_ERRORS.invalidNiche);
    // A consumed/expired offering may already have been pruned. Live IDs must
    // still identify food, not a creature or obstacle created in another context.
    if (world.creatures.some(c => c.id === id) || world.obstacles.some(o => o.id === id)) invalid(`${at}.id`, SAVE_ERRORS.unknownValue);
    const key = `${world.stage}:${id}`;
    if (offeringIds.has(key)) invalid(`${at}.id`, SAVE_ERRORS.duplicateIds);
    offeringIds.add(key);
    number(offering.remaining, `${at}.remaining`, 0, 300);
  });
  return value as Omit<Journey, 'version'> & { version: 1 | 2 | 3 };
}

function validateTribePreview(value: unknown): void {
  const path = 'state.tribe', t = object(value, path, ['version', 'food', 'members', 'huts', 'unlocked', 'neighbours']);
  oneOf(t.version, [1], `${path}.version`);
  number(t.food, `${path}.food`);
  const tool = (value: unknown, at: string) => { if (value !== null) string(value, at, 64); };
  const members = array(t.members, `${path}.members`, 64).map((value, index) => {
    const at = `${path}.members[${index}]`, member = object(value, at, ['id', 'pos', 'heading', 'health', 'hunger', 'tool']);
    const id = number(member.id, `${at}.id`, 1, MAX_COUNT, true);
    vector(member.pos, `${at}.pos`); number(member.heading, `${at}.heading`, -1e9, 1e9);
    number(member.health, `${at}.health`, 0, 100); number(member.hunger, `${at}.hunger`, 0, 100);
    tool(member.tool, `${at}.tool`);
    return id;
  });
  uniqueIds(members, `${path}.members`);
  const huts = array(t.huts, `${path}.huts`, 64).map((value, index) => {
    const at = `${path}.huts[${index}]`, hut = object(value, at, ['id', 'kind', 'pos', 'tool']);
    const id = number(hut.id, `${at}.id`, 1, MAX_COUNT, true);
    oneOf(hut.kind, ['shelter', 'workshop'], `${at}.kind`); vector(hut.pos, `${at}.pos`);
    tool(hut.tool, `${at}.tool`);
    return id;
  });
  uniqueIds(huts, `${path}.huts`);
  const unlocked = array(t.unlocked, `${path}.unlocked`, 64).map((value, index) => string(value, `${path}.unlocked[${index}]`, 64));
  if (new Set(unlocked).size !== unlocked.length) invalid(`${path}.unlocked`, SAVE_ERRORS.duplicateIds);
  const neighbours = array(t.neighbours, `${path}.neighbours`, 16).map((value, index) => {
    const at = `${path}.neighbours[${index}]`, neighbour = object(value, at, ['id', 'pos', 'relation', 'resolved']);
    const id = number(neighbour.id, `${at}.id`, 1, MAX_COUNT, true);
    vector(neighbour.pos, `${at}.pos`); number(neighbour.relation, `${at}.relation`, -100, 100);
    oneOf(neighbour.resolved, [null, 'conquered', 'allied'], `${at}.resolved`);
    return id;
  });
  uniqueIds(neighbours, `${path}.neighbours`);
}

const tribeTools = ['basket', 'spear', 'drum', 'waterskin', 'flute', 'rattle'] as const;

function validateUnitOrder(value: unknown, owner: number, path: string): void {
  const order = object(value, path, ['unit', 'kind', 'target']);
  if (number(order.unit, `${path}.unit`, 1, MAX_COUNT, true) !== owner) invalid(`${path}.unit`, SAVE_ERRORS.unknownValue);
  oneOf(order.kind, ['move', 'gather', 'attack', 'socialize', 'build'], `${path}.kind`);
  const kind = order.target && typeof order.target === 'object' ? (order.target as Record<string, unknown>).kind : undefined;
  const target = object(order.target, `${path}.target`, kind === 'point' ? ['kind', 'pos'] : ['kind', 'id']);
  oneOf(target.kind, ['point', 'food', 'creature', 'hut', 'neighbour', 'neighbour-unit', 'region', 'spring'], `${path}.target.kind`);
  if (target.kind === 'point') vector(target.pos, `${path}.target.pos`);
  else number(target.id, `${path}.target.id`, 1, MAX_COUNT, true);
  if (!validOrderShape(value as UnitOrder)) invalid(path, SAVE_ERRORS.unknownValue);
  // A resource may be exhausted or a target killed before this order becomes
  // active. Its shape and ownership must be valid; existence is resolved by AI.
}

function validateNeighbourSociety(value: unknown, path: string, ids: number[], nextId: number, resolved: unknown): void {
  const a = object(value,path,['version','food','members','recruitCooldown','raidCooldown','truce','expedition']);
  oneOf(a.version,[1],`${path}.version`); number(a.food,`${path}.food`,0,48);
  for(const key of ['recruitCooldown','raidCooldown','truce']) number(a[key],`${path}.${key}`,0,120);
  const residents=array(a.members,`${path}.members`,4).map((value,index)=>{
    const at=`${path}.members[${index}]`,u=object(value,at,['id','pos','heading','health','hunger','cargo','cooldown','task','resource','navigation']);
    const id=number(u.id,`${at}.id`,1,nextId-1,true);ids.push(id);
    vector(u.pos,`${at}.pos`,80);number(u.heading,`${at}.heading`,-1e9,1e9);
    number(u.health,`${at}.health`,0,70);number(u.hunger,`${at}.hunger`,0,100);number(u.cargo,`${at}.cargo`,0,2);number(u.cooldown,`${at}.cooldown`,0,10);
    oneOf(u.task,['rest','forage','return','defend','raid'],`${at}.task`);
    if(u.resource!==null)number(u.resource,`${at}.resource`,1,MAX_COUNT,true);
    const nav=object(u.navigation,`${at}.navigation`,['waypoint','target','rethink']);
    vector(nav.waypoint,`${at}.navigation.waypoint`);vector(nav.target,`${at}.navigation.target`);number(nav.rethink,`${at}.navigation.rethink`,0,1);
    return id;
  });
  if(a.expedition!==null){
    const e=object(a.expedition,`${path}.expedition`,['phase','members','time']);
    oneOf(e.phase,['warning','outbound','return'],`${path}.expedition.phase`);number(e.time,`${path}.expedition.time`);
    const party=array(e.members,`${path}.expedition.members`,2,1).map((id,index)=>{
      number(id,`${path}.expedition.members[${index}]`,1,nextId-1,true);
      if(!residents.includes(Number(id)))invalid(`${path}.expedition.members`,SAVE_ERRORS.unknownValue);
      return Number(id);
    });
    uniqueIds(party,`${path}.expedition.members`);
    if(resolved!==null&&e.phase!=='return')invalid(`${path}.expedition.phase`,SAVE_ERRORS.unknownValue);
  }
}

function validateActiveTribe(value: unknown): void {
  const path = 'state.tribe';
  const hasChief = !!value && typeof value === 'object' && Object.hasOwn(value, 'chief');
  const hasDomestication = !!value && typeof value === 'object' && Object.hasOwn(value, 'domestication');
  const hasMusic = !!value && typeof value === 'object' && Object.hasOwn(value, 'music');
  const hasCulture = !!value && typeof value === 'object' && Object.hasOwn(value, 'culture');
  const t = object(value, path, ['version', 'food', 'members', 'huts', 'unlocked', 'neighbours', 'legacyAbility', 'abilityCooldown', 'abilityTime', 'nextId', 'elapsed', 'completed', ...(hasCulture ? ['culture'] : []), ...(hasMusic ? ['music'] : []), ...(hasDomestication ? ['domestication'] : []), ...(hasChief ? ['chief'] : [])]);
  if (hasCulture) validateCulture(t.culture);
  oneOf(t.version, [2], `${path}.version`);
  number(t.food, `${path}.food`);
  const nextId = number(t.nextId, `${path}.nextId`, 1, MAX_COUNT, true);
  oneOf(t.legacyAbility, ['restoration', 'predator', 'migration'], `${path}.legacyAbility`);
  for (const key of ['abilityCooldown', 'abilityTime', 'elapsed']) number(t[key], `${path}.${key}`);
  boolean(t.completed, `${path}.completed`);
  const ids: number[] = [];
  const members = array(t.members, `${path}.members`, 12).map((value, index) => {
    const at = `${path}.members[${index}]`;
    const hasOutfit = !!value && typeof value === 'object' && Object.hasOwn(value, 'outfit');
    const member = object(value, at, ['id', 'pos', 'heading', 'health', 'hunger', 'tool', 'species', 'benefit', 'loyalty', 'cargo', 'cooldown', 'orders', 'intent', 'navigation', ...(hasOutfit ? ['outfit'] : [])]);
    if (hasOutfit) { validateOutfit(member.outfit); if (member.species !== null || !hasCulture) invalid(`${at}.outfit`, SAVE_ERRORS.invalidPartner); }
    const id = number(member.id, `${at}.id`, 1, nextId - 1, true); ids.push(id);
    vector(member.pos, `${at}.pos`); number(member.heading, `${at}.heading`, -1e9, 1e9);
    for (const key of ['health', 'hunger', 'loyalty']) number(member[key], `${at}.${key}`, 0, 100);
    oneOf(member.tool, [null, ...tribeTools], `${at}.tool`);
    if (member.species === null) oneOf(member.benefit, [null], `${at}.benefit`);
    else {
      const species = knownSpecies.get(string(member.species, `${at}.species`, 40));
      if (!species || species.role !== 'partner') invalid(`${at}.species`, SAVE_ERRORS.invalidPartner);
      const benefit = species.id === 'lantern' ? 'light' : species.id === 'mender' ? 'shield' : 'recycle';
      if (member.benefit !== benefit) invalid(`${at}.benefit`, SAVE_ERRORS.partnerBenefitMismatch);
    }
    // Removing a basket does not destroy the larger load already being carried.
    number(member.cargo, `${at}.cargo`, 0, hasCulture && member.species === null ? 7 : 5); number(member.cooldown, `${at}.cooldown`);
    oneOf(member.intent, ['forage', 'flee', 'hunt', 'rest', 'bonded', 'build', 'socialize'], `${at}.intent`);
    array(member.orders, `${at}.orders`, MAX_UNIT_ORDERS).forEach((order, index) => validateUnitOrder(order, id, `${at}.orders[${index}]`));
    const navigation = object(member.navigation, `${at}.navigation`, ['waypoint', 'target', 'rethink']);
    vector(navigation.waypoint, `${at}.navigation.waypoint`); vector(navigation.target, `${at}.navigation.target`);
    number(navigation.rethink, `${at}.navigation.rethink`);
    return member;
  });
  const huts = array(t.huts, `${path}.huts`, 24).map((value, index) => {
    const at = `${path}.huts[${index}]`, hut = object(value, at, ['id', 'kind', 'pos', 'tool', 'progress', 'health']);
    ids.push(number(hut.id, `${at}.id`, 1, nextId - 1, true));
    oneOf(hut.kind, ['shelter', 'workshop'], `${at}.kind`); vector(hut.pos, `${at}.pos`);
    oneOf(hut.tool, hut.kind === 'shelter' ? [null] : tribeTools, `${at}.tool`);
    number(hut.progress, `${at}.progress`, 0, 1); number(hut.health, `${at}.health`, 0, 100);
    return hut;
  });
  const unlocked = array(t.unlocked, `${path}.unlocked`, tribeTools.length).map((value, index) => {
    oneOf(value, tribeTools, `${path}.unlocked[${index}]`);
    if (!huts.some(hut => hut.kind === 'workshop' && hut.tool === value && hut.progress === 1 && Number(hut.health) > 0)) invalid(`${path}.unlocked[${index}]`, SAVE_ERRORS.unknownValue);
    return value;
  });
  if (new Set(unlocked).size !== unlocked.length) invalid(`${path}.unlocked`, SAVE_ERRORS.duplicateIds);
  members.forEach((member, index) => {
    if (member.tool !== null && !unlocked.includes(member.tool)) invalid(`${path}.members[${index}].tool`, SAVE_ERRORS.unknownValue);
  });
  const shelters = huts.filter(hut => hut.kind === 'shelter' && hut.progress === 1 && Number(hut.health) > 0);
  // Every active tribe starts with a home and buildings cannot be demolished.
  // Cargo delivery and recruitment both require this persistent home reference.
  if (!shelters.length) invalid(`${path}.huts`, SAVE_ERRORS.invalidCount);
  const capacity = Math.min(12, 2 + 4 * shelters.length);
  if (members.filter(member => Number(member.health) > 0).length > capacity) invalid(`${path}.members`, SAVE_ERRORS.invalidCount);
  const identities: unknown[] = [];
  const neighbours = array(t.neighbours, `${path}.neighbours`, 3, 3).map((value, index) => {
    const at = `${path}.neighbours[${index}]`;
    const hasSociety=!!value&&typeof value==='object'&&Object.prototype.hasOwnProperty.call(value,'society');
    const neighbour = object(value, at, ['id', 'pos', 'relation', 'resolved', 'identity', 'health', 'alarm', 'tribute', 'cooldown',...(hasSociety?['society']:[])]);
    ids.push(number(neighbour.id, `${at}.id`, 1, nextId - 1, true)); vector(neighbour.pos, `${at}.pos`);
    number(neighbour.relation, `${at}.relation`, -100, 100);
    oneOf(neighbour.resolved, [null, 'conquered', 'allied'], `${at}.resolved`);
    oneOf(neighbour.identity, ['garden', 'terrace', 'sanctuary'], `${at}.identity`); identities.push(neighbour.identity);
    number(neighbour.health, `${at}.health`, 0, 250); number(neighbour.alarm, `${at}.alarm`, 0, 100);
    number(neighbour.tribute, `${at}.tribute`); number(neighbour.cooldown, `${at}.cooldown`);
    if(hasSociety)validateNeighbourSociety(neighbour.society,`${at}.society`,ids,nextId,neighbour.resolved);
    return neighbour;
  });
  if(neighbours.some(n=>n.society)&&neighbours.some(n=>!n.society))invalid(`${path}.neighbours`,SAVE_ERRORS.invalidFields);
  uniqueIds(ids, path);
  if (new Set(identities).size !== identities.length) invalid(`${path}.neighbours`, SAVE_ERRORS.duplicateIds);
  if (hasDomestication) validateDomestication(t.domestication, t as unknown as ActiveTribeState);
  if (hasMusic) validateMusic(t.music, t as unknown as ActiveTribeState);
  if (hasChief) validateChief(t.chief, t as unknown as ActiveTribeState);
  if (t.completed && neighbours.some(neighbour => neighbour.resolved === null)) invalid(`${path}.completed`, SAVE_ERRORS.unknownValue);
}

function validateTribe(value: unknown): void {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).version === 2) validateActiveTribe(value);
  else validateTribePreview(value);
}

function validateMachinePreview(value: unknown): void {
  const path = 'state.machines', m = object(value, path, ['version', 'resource', 'blueprints', 'fleet', 'regions']);
  oneOf(m.version, [1], `${path}.version`); number(m.resource, `${path}.resource`);
  // Historical P0 previews retain their empty schema; loading is not activation.
  for (const key of ['blueprints', 'fleet', 'regions']) array(m[key], `${path}.${key}`, 0);
}

function validateActiveMachines(value: unknown): void {
  const path = 'state.machines';
  const m = object(value, path, ['version', 'resource', 'blueprints', 'fleet', 'regions', 'springs', 'archetype', 'airUnlocked', 'barrierIds', 'nextId', 'elapsed', 'completed']);
  oneOf(m.version, [2], `${path}.version`); number(m.resource, `${path}.resource`);
  const nextId = number(m.nextId, `${path}.nextId`, 1, MAX_COUNT, true), ids: number[] = [];
  oneOf(m.archetype, ['restoration', 'predator', 'migration'], `${path}.archetype`);
  boolean(m.airUnlocked, `${path}.airUnlocked`); boolean(m.completed, `${path}.completed`); number(m.elapsed, `${path}.elapsed`);
  const designs = new Map<number, VehicleBlueprint>();
  array(m.blueprints, `${path}.blueprints`, 64).forEach((value, index) => {
    const at = `${path}.blueprints[${index}]`, design = object(value, at, ['id', 'blueprint']);
    const id = number(design.id, `${at}.id`, 1, nextId - 1, true); ids.push(id);
    const errors = validateVehicle(design.blueprint);
    if (errors.length) invalid(`${at}.blueprint`, errors.join(' '));
    const blueprint = design.blueprint as VehicleBlueprint;
    if (blueprint.carrier === 'air' && !m.airUnlocked) invalid(`${at}.blueprint.carrier`, SAVE_ERRORS.unknownValue);
    designs.set(id, blueprint);
  });
  array(m.fleet, `${path}.fleet`, 8).forEach((value, index) => {
    const at = `${path}.fleet[${index}]`;
    const unit = object(value, at, ['id', 'blueprint', 'pos', 'heading', 'health', 'cooldown', 'cargo', 'orders', 'navigation', 'intent']);
    const id = number(unit.id, `${at}.id`, 1, nextId - 1, true); ids.push(id);
    const blueprintId = number(unit.blueprint, `${at}.blueprint`, 1, nextId - 1, true), blueprint = designs.get(blueprintId);
    if (!blueprint) invalid(`${at}.blueprint`, SAVE_ERRORS.unknownValue);
    vector(unit.pos, `${at}.pos`); number(unit.heading, `${at}.heading`, -1e9, 1e9);
    number(unit.health, `${at}.health`, 0, vehicleStats(blueprint).durability);
    number(unit.cooldown, `${at}.cooldown`); number(unit.cargo, `${at}.cargo`, 0, 1, true);
    oneOf(unit.intent, ['rest', 'move', 'work', 'return', 'attack'], `${at}.intent`);
    array(unit.orders, `${at}.orders`, MAX_UNIT_ORDERS).forEach((order, index) => validateUnitOrder(order, id, `${at}.orders[${index}]`));
    const navigation = object(unit.navigation, `${at}.navigation`, ['waypoint', 'target', 'rethink']);
    vector(navigation.waypoint, `${at}.navigation.waypoint`); vector(navigation.target, `${at}.navigation.target`);
    number(navigation.rethink, `${at}.navigation.rethink`);
  });
  const identities: unknown[] = [];
  const regions = array(m.regions, `${path}.regions`, 3, 3).map((value, index) => {
    const at = `${path}.regions[${index}]`;
    const region = object(value, at, ['id', 'identity', 'pos', 'airOnly', 'owner', 'method', 'health', 'soil', 'settlers', 'relation', 'deliveries', 'alarm', 'cooldown']);
    ids.push(number(region.id, `${at}.id`, 1, nextId - 1, true)); vector(region.pos, `${at}.pos`);
    oneOf(region.identity, ['gardens', 'terraces', 'highlands'], `${at}.identity`); identities.push(region.identity);
    boolean(region.airOnly, `${at}.airOnly`);
    if (region.airOnly !== (region.identity === 'highlands')) invalid(`${at}.airOnly`, SAVE_ERRORS.unknownValue);
    oneOf(region.owner, ['neutral', 'player'], `${at}.owner`);
    oneOf(region.method, region.owner === 'neutral' ? [null] : [m.archetype], `${at}.method`);
    number(region.health, `${at}.health`, 0, 400);
    for (const key of ['soil', 'relation', 'alarm']) number(region[key], `${at}.${key}`, 0, 100);
    number(region.settlers, `${at}.settlers`, 0, 2, true); number(region.deliveries, `${at}.deliveries`, 0, 3, true);
    number(region.cooldown, `${at}.cooldown`);
    return region;
  });
  if (new Set(identities).size !== identities.length) invalid(`${path}.regions`, SAVE_ERRORS.duplicateIds);
  const springs = array(m.springs, `${path}.springs`, 3, 3).map((value, index) => {
    const at = `${path}.springs[${index}]`, spring = object(value, at, ['id', 'pos', 'owner', 'progress', 'rate']);
    ids.push(number(spring.id, `${at}.id`, 1, nextId - 1, true)); vector(spring.pos, `${at}.pos`);
    oneOf(spring.owner, ['neutral', 'player'], `${at}.owner`);
    number(spring.progress, `${at}.progress`, 0, 1); number(spring.rate, `${at}.rate`, .5, 2);
    if (spring.owner === 'player' && spring.progress !== 1) invalid(`${at}.progress`, SAVE_ERRORS.unknownValue);
    return spring;
  });
  uniqueIds(ids, path);
  const ownedRegions = regions.filter(region => region.owner === 'player').length;
  if (m.airUnlocked !== (ownedRegions > 0)) invalid(`${path}.airUnlocked`, SAVE_ERRORS.unknownValue);
  if (m.completed && (ownedRegions !== 3 || springs.filter(spring => spring.owner === 'player').length < 2)) invalid(`${path}.completed`, SAVE_ERRORS.unknownValue);
  // Barrier IDs belong to the retained world, independently of machine IDs.
  const barriers = array(m.barrierIds, `${path}.barrierIds`, 16, 16).map((id, index) => number(id, `${path}.barrierIds[${index}]`, 1, MAX_COUNT, true));
  uniqueIds(barriers, `${path}.barrierIds`);
}

function validateMachines(value: unknown): void {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).version === 2) validateActiveMachines(value);
  else validateMachinePreview(value);
}

function validatePlanetPreview(value: unknown): void {
  const path = 'state.planet', p = object(value, path, ['version', 'temperature', 'atmosphere', 'tScore', 'stabilizers']);
  oneOf(p.version, [1], `${path}.version`);
  number(p.temperature, `${path}.temperature`, -1, 1); number(p.atmosphere, `${path}.atmosphere`, -1, 1);
  oneOf(p.tScore, [0, 1, 2, 3], `${path}.tScore`); array(p.stabilizers, `${path}.stabilizers`, 0);
}

function validateActivePlanet(value: unknown): void {
  const path = 'state.planet';
  const p = object(value, path, ['version', 'temperature', 'atmosphere', 'tScore', 'activeMachine', 'toolOn', 'biomes', 'stabilizers', 'populations', 'nursery', 'nextId', 'elapsed', 'stableTime', 'completed', 'sandbox']);
  oneOf(p.version, [2], `${path}.version`);
  const temperature = number(p.temperature, `${path}.temperature`, -1, 1), atmosphere = number(p.atmosphere, `${path}.atmosphere`, -1, 1);
  oneOf(p.tScore, [planetTScore(temperature, atmosphere)], `${path}.tScore`);
  number(p.activeMachine, `${path}.activeMachine`, 1, MAX_COUNT, true); boolean(p.toolOn, `${path}.toolOn`);
  const nextId = number(p.nextId, `${path}.nextId`, 4, MAX_COUNT, true), ids: number[] = [];
  number(p.elapsed, `${path}.elapsed`); number(p.stableTime, `${path}.stableTime`, 0, 30);
  boolean(p.completed, `${path}.completed`); boolean(p.sandbox, `${path}.sandbox`);
  if (p.sandbox && !p.completed) invalid(`${path}.sandbox`, SAVE_ERRORS.unknownValue);
  array(p.biomes, `${path}.biomes`, 3, 3).forEach((value, index) => {
    const at = `${path}.biomes[${index}]`, biome = object(value, at, ['id', 'level', 'pos']);
    const id = number(biome.id, `${at}.id`, 1, 3, true); ids.push(id);
    oneOf(biome.level, [id], `${at}.level`); vector(biome.pos, `${at}.pos`);
  });
  const rootKeys: string[] = [], producerCounts = [0, 0, 0];
  array(p.stabilizers, `${path}.stabilizers`, 6).forEach((value, index) => {
    const at = `${path}.stabilizers[${index}]`, root = object(value, at, ['id', 'biome', 'key', 'site']);
    const id = number(root.id, `${at}.id`, 4, nextId - 1, true); ids.push(id);
    const biome = number(root.biome, `${at}.biome`, 1, 3, true), key = string(root.key, `${at}.key`, 64), taxon = ecologyTaxon(key);
    if (!taxon || taxon.role !== 'producer') invalid(`${at}.key`, SAVE_ERRORS.unknownValue);
    rootKeys.push(`${biome}:${key}`); producerCounts[biome - 1]++;
    const site = object(root.site, `${at}.site`, ['id', 'stage', 'patch', 'source', 'refuges', 'sourceId', 'plantedId', 'vitality', 'observed', 'resolved', 'method', 'threatIds', 'phase']);
    oneOf(site.id, [id], `${at}.site.id`); oneOf(site.stage, [5], `${at}.site.stage`); oneOf(site.patch, [biome - 1], `${at}.site.patch`);
    vector(site.source, `${at}.site.source`); array(site.refuges, `${at}.site.refuges`, 1, 1).forEach((pos, i) => vector(pos, `${at}.site.refuges[${i}]`));
    const sourceId = number(site.sourceId, `${at}.site.sourceId`, 1, MAX_COUNT, true); oneOf(site.plantedId, [sourceId], `${at}.site.plantedId`);
    number(site.vitality, `${at}.site.vitality`, 0, 100);
    oneOf(site.observed, [true], `${at}.site.observed`); oneOf(site.resolved, [false], `${at}.site.resolved`); oneOf(site.method, [null], `${at}.site.method`);
    array(site.threatIds, `${at}.site.threatIds`, 0); oneOf(site.phase, [0], `${at}.site.phase`);
  });
  if (new Set(rootKeys).size !== rootKeys.length) invalid(`${path}.stabilizers`, SAVE_ERRORS.duplicateIds);
  if (producerCounts.some(count => count > 2)) invalid(`${path}.stabilizers`, SAVE_ERRORS.invalidCount);
  const populationKeys: string[] = [], herbivores = [0, 0, 0], predators = [0, 0, 0];
  array(p.populations, `${path}.populations`, 9).forEach((value, index) => {
    const at = `${path}.populations[${index}]`, population = object(value, at, ['id', 'biome', 'key', 'pos', 'vitality', 'abundance', 'nutrition']);
    ids.push(number(population.id, `${at}.id`, 4, nextId - 1, true));
    const biome = number(population.biome, `${at}.biome`, 1, 3, true), key = string(population.key, `${at}.key`, 64), taxon = ecologyTaxon(key);
    if (!taxon || taxon.role !== 'herbivore' && taxon.role !== 'predator') invalid(`${at}.key`, SAVE_ERRORS.unknownValue);
    populationKeys.push(`${biome}:${key}`); (taxon.role === 'herbivore' ? herbivores : predators)[biome - 1]++;
    vector(population.pos, `${at}.pos`); number(population.vitality, `${at}.vitality`, 0, 100);
    number(population.abundance, `${at}.abundance`, 0, 3); number(population.nutrition, `${at}.nutrition`, 0, 1);
  });
  if (new Set(populationKeys).size !== populationKeys.length) invalid(`${path}.populations`, SAVE_ERRORS.duplicateIds);
  if (herbivores.some(count => count > 2) || predators.some(count => count > 1)) invalid(`${path}.populations`, SAVE_ERRORS.invalidCount);
  uniqueIds(ids, path);
  const nursery = object(p.nursery, `${path}.nursery`, ['pos', 'sources']); vector(nursery.pos, `${path}.nursery.pos`);
  const sourceKeys = array(nursery.sources, `${path}.nursery.sources`, 2, 2).map((value, index) => {
    const at = `${path}.nursery.sources[${index}]`, source = object(value, at, ['key', 'resourceId']);
    oneOf(source.key, ['culture:6', 'culture:7'], `${at}.key`); number(source.resourceId, `${at}.resourceId`, 1, MAX_COUNT, true);
    return source.key;
  });
  if (new Set(sourceKeys).size !== sourceKeys.length) invalid(`${path}.nursery.sources`, SAVE_ERRORS.duplicateIds);
}

function validatePlanet(value: unknown): void {
  if (value && typeof value === 'object' && (value as Record<string, unknown>).version === 2) validateActivePlanet(value);
  else validatePlanetPreview(value);
}

function validateLineageHistory(value: unknown, state: GameState): void {
  const path = 'state.lineageHistory', h = object(value, path, ['version', 'stages']);
  oneOf(h.version, [1], `${path}.version`);
  const stamp = (value: unknown, at: string) => {
    const t = object(value, at, ['tick', 'generation']);
    number(t.tick, `${at}.tick`, 0, state.tick, true);
    number(t.generation, `${at}.generation`, 1, state.player.generation, true);
    return t as unknown as { tick: number; generation: number };
  };
  let totalMeals = 0, totalHunts = 0;
  array(h.stages, `${path}.stages`, state.stage + 1, state.stage + 1).forEach((value, index) => {
    const at = `${path}.stages[${index}]`, row = object(value, at, ['stage', 'coverage', 'started', 'counts', 'facts', 'closed']);
    oneOf(row.stage, [index], `${at}.stage`);
    oneOf(row.coverage, ['complete', 'partial', 'unknown'], `${at}.coverage`);
    const start = row.started === null ? null : stamp(row.started, `${at}.started`);
    if ((row.coverage === 'unknown') !== (start === null)) invalid(at, SAVE_ERRORS.unknownValue);
    if ((index <= 2 && start !== null) !== (row.counts !== null)) invalid(`${at}.counts`, SAVE_ERRORS.unknownValue);
    if (row.counts !== null) {
      const c = object(row.counts, `${at}.counts`, ['meals', 'hunts']);
      const meals = object(c.meals, `${at}.counts.meals`, [...HISTORY_FOODS]);
      for (const food of HISTORY_FOODS) totalMeals += number(meals[food], `${at}.counts.meals.${food}`, 0, MAX_COUNT, true);
      totalHunts += number(c.hunts, `${at}.counts.hunts`, 0, MAX_COUNT, true);
    }
    const known = stageFacts(state, index as Stage), keys = new Set<string>();
    const evidence = (record: Record<string, unknown>, at: string) => {
      oneOf(record.source, ['action', 'saved'], `${at}.source`);
      if (record.source === 'saved') { if (record.at !== null) invalid(at, SAVE_ERRORS.unknownValue); return null; }
      const t = stamp(record.at, `${at}.at`);
      if (!start || t.tick < start.tick || t.generation < start.generation) invalid(at, SAVE_ERRORS.unknownValue);
      return t;
    };
    const times: { tick: number; generation: number }[] = [];
    array(row.facts, `${at}.facts`, 12).forEach((value, i) => {
      const where = `${at}.facts[${i}]`, fact = object(value, where, ['key', 'method', 'source', 'at']);
      const key = string(fact.key, `${where}.key`, 80);
      oneOf(fact.method, HISTORY_METHODS, `${where}.method`);
      if (keys.has(key) || !known.some(f => f.key === key && f.method === fact.method)) invalid(where, SAVE_ERRORS.unknownValue);
      keys.add(key); const t = evidence(fact, where); if (t) times.push(t);
    });
    const outcome = stageOutcome(state, index as Stage);
    if ((row.closed !== null) !== (outcome !== null)) invalid(`${at}.closed`, SAVE_ERRORS.unknownValue);
    if (row.closed !== null) {
      const closed = object(row.closed, `${at}.closed`, ['outcome', 'source', 'at']);
      oneOf(closed.outcome, [outcome], `${at}.closed.outcome`);
      const end = evidence(closed, `${at}.closed`);
      if (end && times.some(t => t.tick > end.tick || t.generation > end.generation)) invalid(at, SAVE_ERRORS.unknownValue);
      // The frozen three-nest route may precede a fourth sandbox resolution.
      const nests = (value as StageHistory).facts.filter(f => f.key.startsWith('nest:'));
      if (index === 2 && closed.source === 'action' && state.creatureStage?.completed) {
        const friends = nests.filter(f => f.method === 'friend').length, predators = nests.length - friends;
        if (nests.length < 3 || closed.outcome !== (friends && predators ? 'mixed' : friends ? 'social' : 'predator')) invalid(at, SAVE_ERRORS.invalidFinale);
      }
    } else if (known.some(f => !keys.has(f.key))) invalid(`${at}.facts`, SAVE_ERRORS.unknownValue);
  });
  if (totalMeals > state.player.meals || totalHunts > state.player.kills) invalid(path, SAVE_ERRORS.unknownValue);
}

// Compare semantic fields, not imported JSON property ordering.
function historyRowSignature(row: StageHistory): string {
  const time = (t: StageHistory['started']) => t ? [t.tick, t.generation] : null;
  return JSON.stringify([row.stage, row.coverage, time(row.started), row.counts ? [HISTORY_FOODS.map(f => row.counts!.meals[f]), row.counts.hunts] : null,
    [...row.facts].sort((a,b) => a.key.localeCompare(b.key)).map(f => [f.key, f.method, f.source, time(f.at)]),
    row.closed ? [row.closed.outcome, row.closed.source, time(row.closed.at)] : null]);
}

function validateState(value: unknown, nestedCheckpoint = false, expectedVersion?: 1 | 2 | 3): GameState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('state', SAVE_ERRORS.objectRequired);
  const version = (value as Record<string, unknown>).version;
  if ((version !== 1 && version !== 2 && version !== 3) || (expectedVersion !== undefined && version !== expectedVersion)) invalid('state.version', SAVE_ERRORS.unsupportedStateVersion);
  const sliceKeys = (['tribe', 'machines', 'planet'] as const).filter(key => version === 3 && Object.prototype.hasOwnProperty.call(value, key));
  const hasLineageHistory = version === 3 && Object.hasOwn(value, 'lineageHistory');
  const hasCellGrowth = version === 3 && Object.hasOwn(value, 'cellGrowth');
  const hasCreatureStage = version === 3 && Object.prototype.hasOwnProperty.call(value, 'creatureStage');
  const s = object(value, 'state', ['version', 'id', 'seed', 'stage', 'tick', 'rng', 'player', 'worlds', 'world', 'campaign', 'lineage', 'checkpoint', 'messages', 'deathReason', ...(version >= 2 ? ['journey'] : []), ...sliceKeys, ...(hasLineageHistory ? ['lineageHistory'] : []), ...(hasCellGrowth ? ['cellGrowth'] : []), ...(hasCreatureStage ? ['creatureStage'] : [])]);
  gameId(s.id, 'state.id'); const seed = number(s.seed, 'state.seed', 0, UINT32, true);
  oneOf(s.stage, version === 3 ? [0, 1, 2, 3, 4, 5] : [0, 1, 2], 'state.stage'); const stage = s.stage as Stage;
  const worldStage = worldStageFor(stage);
  for (const [key, firstStage, validate] of [['tribe', 3, validateTribe], ['machines', 4, validateMachines], ['planet', 5, validatePlanet]] as const) {
    const present = sliceKeys.includes(key);
    if (present !== (stage >= firstStage)) invalid(`state.${key}`, SAVE_ERRORS.eraSliceMismatch);
    if (present) validate(s[key]);
  }
  number(s.tick, 'state.tick', 0, MAX_COUNT, true); number(s.rng, 'state.rng', 0, UINT32, true);
  const worlds = array(s.worlds, 'state.worlds', 3, 3);
  worlds.forEach((world, index) => {
    if (world !== null) validateWorld(world, index as Stage, seed, `state.worlds[${index}]`);
    else if (index === worldStage) invalid('state.worlds', SAVE_ERRORS.missingActiveWorld);
  });
  // Saves carry the active alias for readability. Refuse conflicting duplicate states.
  validateWorld(s.world, worldStage, seed, 'state.world');
  if (JSON.stringify(s.world) !== JSON.stringify(worlds[worldStage])) invalid('state.world', SAVE_ERRORS.activeWorldMismatch);
  const journey = version === 1 ? emptyJourney(true) : validateJourney(s.journey, worldStage, worlds as (World | null)[]);
  if (hasCreatureStage) {
    if (journey.legacy) invalid('state.creatureStage', SAVE_ERRORS.eraSliceMismatch);
    validateCreatureStage(s.creatureStage, stage, worlds[2] as World | null);
  }
  // Historical legacy saves predate the explicit scan timer. Only this missing
  // field migrates; new journey saves require it, and unknown fields always fail.
  if ((version === 1 || journey.legacy) && s.player && typeof s.player === 'object' && !Array.isArray(s.player) && !Object.prototype.hasOwnProperty.call(s.player, 'scan')) (s.player as Record<string, unknown>).scan = 0;
  // Both legacy and early journey saves predate the independent ability timer.
  // Only its absence migrates; a present malformed timer or unknown field fails.
  if (!s.player || typeof s.player !== 'object' || Array.isArray(s.player)) invalid('player', SAVE_ERRORS.objectRequired);
  const rawPlayer = s.player as Record<string, unknown>;
  const genomeErrors = validateGenome(rawPlayer.genome, worldStage);
  if (genomeErrors.length) invalid('player.genome', genomeErrors.join(' '));
  const genome = rawPlayer.genome as GameState['player']['genome'];
  const missingRecharge = !Object.prototype.hasOwnProperty.call(rawPlayer, 'abilityRecharge');
  if (missingRecharge) rawPlayer.abilityRecharge = 0;
  const basePlayerKeys = ['pos', 'velocity', 'heading', 'health', 'energy', 'oxygen', 'moisture', 'genome', 'dna', 'totalDna', 'generation', 'meals', 'kills', 'bonds', 'cooldown', 'abilityRecharge', 'scan', 'invulnerable', 'feeding', 'distance'];
  const requiredPlayerKeys = genome.version === 2 ? [...basePlayerKeys, 'creatureActions'] : basePlayerKeys;
  const p = object(s.player, 'player', requiredPlayerKeys);
  if (genome.version === 2) validateCreatureActions(p.creatureActions, 'player.creatureActions');
  const stats = computeStats(genome);
  vector(p.pos, 'player.pos'); vector(p.velocity, 'player.velocity', 100);
  number(p.heading, 'player.heading', -1e9, 1e9); number(p.health, 'player.health', 0, stats.maxHealth);
  number(p.energy, 'player.energy', 0, 100); number(p.oxygen, 'player.oxygen', 0, stats.oxygen); number(p.moisture, 'player.moisture', 0, stats.moisture);
  number(p.dna, 'player.dna');
  number(p.totalDna, 'player.totalDna', journey.legacy ? Number(p.dna) : 0);
  if (!journey.legacy) {
    const available = genomeCost(initialGenome()) + Number(p.totalDna) - genomeCost(genome);
    if (journey.version >= 2) {
      if (available < 0 || p.dna !== available) invalid('player.dna', SAVE_ERRORS.invalidNumber);
    } else if (Number(p.dna) > Number(p.totalDna) && p.dna !== available) {
      // Both emitted j1 shapes remain readable: the original spending rule and
      // the short-lived allocation prototype, where a cheaper body could free more DNA.
      invalid('player.totalDna', SAVE_ERRORS.invalidNumber);
    }
  }
  number(p.generation, 'player.generation', 1, MAX_COUNT, true);
  if(hasCellGrowth){if(journey.legacy||!hasCreatureStage||!(s.creatureStage as GameState['creatureStage'])?.discovery)invalid('state.cellGrowth',SAVE_ERRORS.eraSliceMismatch);validateCellGrowth(s.cellGrowth,stage,Number(p.generation),Number(s.tick),genome);}
  if (hasCreatureStage && Object.hasOwn(s.creatureStage as object, 'discovery')) validateDiscovery((s.creatureStage as Record<string, unknown>).discovery, stage, worlds[2] as World | null, Number(p.generation), Number(s.tick), genome);
  for (const field of ['meals', 'kills']) number(p[field], `player.${field}`, 0, MAX_COUNT, true);
  for (const field of ['cooldown', 'invulnerable', 'feeding', 'distance']) number(p[field], `player.${field}`);
  if (missingRecharge && !journey.legacy && (has(genome, 'toxin') || has(genome, 'sonar'))) {
    // Old short cooldowns are ambiguous: conservatively retain their remaining
    // recharge. A cooldown over two seconds could only be an ability, so release
    // its old interaction lock without granting another free pulse after import.
    p.abilityRecharge = Math.min(Number(p.cooldown), has(genome, 'toxin') ? 7 : 4);
    if (Number(p.cooldown) > 2) p.cooldown = .25;
  }
  number(p.abilityRecharge, 'player.abilityRecharge', 0, 7);
  number(p.scan, 'player.scan', 0, 5);
  const bonds = array(p.bonds, 'player.bonds', 2);
  if (bonds.length && !has(genome, 'symbiote')) invalid('player.bonds', SAVE_ERRORS.symbioteRequired);
  bonds.forEach((value, index) => {
    const at = `player.bonds[${index}]`, b = object(value, at, ['species', 'loyalty', 'hunger', 'benefit', 'age']);
    const species = knownSpecies.get(string(b.species, `${at}.species`, 40));
    if (!species || species.role !== 'partner' || species.stage > stage) invalid(`${at}.species`, SAVE_ERRORS.invalidPartner);
    const benefit = species.id === 'lantern' ? 'light' : species.id === 'mender' ? 'shield' : 'recycle';
    if (b.benefit !== benefit) invalid(`${at}.benefit`, SAVE_ERRORS.partnerBenefitMismatch);
    number(b.loyalty, `${at}.loyalty`, 0, 100); number(b.hunger, `${at}.hunger`, 0, 10000); number(b.age, `${at}.age`);
  });
  const c = object(s.campaign, 'campaign', ['stageMeals', 'stageKills', 'stageBonds', 'stageReproductions', 'discoveries', 'journals', 'drought', 'finale', 'won', 'sandbox']);
  number(c.stageMeals, 'campaign.stageMeals', 0, Number(p.meals), true);
  number(c.stageKills, 'campaign.stageKills', 0, Number(p.kills), true);
  number(c.stageBonds, 'campaign.stageBonds', 0, MAX_COUNT, true);
  number(c.stageReproductions, 'campaign.stageReproductions', 0, Number(p.generation) - 1, true);
  const discoveries = array(c.discoveries, 'campaign.discoveries', 9);
  discoveries.forEach((item) => { if (!/^[0-2]:[0-2]$/.test(string(item, 'campaign.discovery', 3))) invalid('campaign.discoveries', SAVE_ERRORS.invalidNiche); });
  if (new Set(discoveries).size !== discoveries.length) invalid('campaign.discoveries', SAVE_ERRORS.duplicateDiscoveries);
  array(c.journals, 'campaign.journals', 128).forEach((item) => string(item, 'campaign.journal', 512));
  number(c.drought, 'campaign.drought', 0, 1); boolean(c.won, 'campaign.won'); boolean(c.sandbox, 'campaign.sandbox');
  oneOf(c.finale, [null, 'restoration', 'predator', 'migration'], 'campaign.finale');
  if ((c.won && (stage < 2 || c.finale === null)) || (!c.won && c.finale !== null) || (c.sandbox && !c.won) || (stage >= 3 && !c.won)) invalid('campaign', SAVE_ERRORS.invalidFinale);
  const creatureCompletion = (s.creatureStage as GameState['creatureStage'])?.completed;
  if (creatureCompletion && (!c.won || c.finale !== (creatureCompletion === 'social' ? 'restoration' : creatureCompletion === 'predator' ? 'predator' : 'migration'))) invalid('state.creatureStage.completed', SAVE_ERRORS.invalidFinale);
  if (s.tribe && (s.tribe as ActiveTribeState).version === 2) {
    const tribe = s.tribe as ActiveTribeState;
    if (tribe.legacyAbility !== c.finale) invalid('state.tribe.legacyAbility', SAVE_ERRORS.invalidFinale);
    const inherited = [...bonds] as GameState['player']['bonds'];
    tribe.members.forEach((member, index) => {
      if (member.species === null) return;
      const bondIndex = inherited.findIndex(bond => bond.species === member.species && bond.benefit === member.benefit);
      if (bondIndex < 0) invalid(`state.tribe.members[${index}].species`, SAVE_ERRORS.invalidPartner);
      inherited.splice(bondIndex, 1);
    });
  }
  if (s.machines && (s.machines as ActiveMachineState).version === 2) {
    const machines = s.machines as ActiveMachineState, tribe = s.tribe as GameState['tribe'];
    if (tribe?.version !== 2 || !tribe.completed) invalid('state.machines', SAVE_ERRORS.eraSliceMismatch);
    if (machines.archetype !== c.finale) invalid('state.machines.archetype', SAVE_ERRORS.invalidFinale);
    const coast = worlds[2] as World;
    machines.barrierIds.forEach((id, index) => {
      if (!coast.obstacles.some(obstacle => obstacle.id === id && obstacle.kind === 'rock')) invalid(`state.machines.barrierIds[${index}]`, SAVE_ERRORS.unknownValue);
    });
  }
  if (s.planet && (s.planet as ActivePlanetState).version === 2) {
    const planet = s.planet as ActivePlanetState, machines = s.machines as GameState['machines'], coast = worlds[2] as World;
    if (machines?.version !== 2 || !machines.completed || !journey.ecology) invalid('state.planet', SAVE_ERRORS.eraSliceMismatch);
    if (!machines.fleet.some(unit => unit.id === planet.activeMachine && unit.health > 0)) invalid('state.planet.activeMachine', SAVE_ERRORS.unknownValue);
    const contacts = new Set(journey.ecology.contacts.map(contact => contact.key)), resourceIds: number[] = [];
    const samePosition = (a: GameState['player']['pos'], b: GameState['player']['pos']) => a.x === b.x && a.y === b.y && a.z === b.z;
    planet.stabilizers.forEach((root, index) => {
      const at = `state.planet.stabilizers[${index}]`, taxon = ecologyTaxon(root.key)!;
      if (!contacts.has(root.key)) invalid(`${at}.key`, SAVE_ERRORS.unknownValue);
      const resource = coast.resources.find(resource => resource.id === root.site.sourceId); resourceIds.push(root.site.sourceId);
      if (!resource || resource.kind !== taxon.food || resource.patch !== root.biome - 1 || resource.regen !== 0 || resource.max !== 12) invalid(`${at}.site.sourceId`, SAVE_ERRORS.unknownValue);
      if (!samePosition(root.site.source, resource.pos) || !samePosition(root.site.refuges[0], resource.pos)) invalid(`${at}.site.source`, SAVE_ERRORS.invalidNiche);
    });
    planet.populations.forEach((population, index) => {
      if (!contacts.has(population.key)) invalid(`state.planet.populations[${index}].key`, SAVE_ERRORS.unknownValue);
    });
    planet.nursery.sources.forEach((source, index) => {
      const taxon = ecologyTaxon(source.key)!, resource = coast.resources.find(resource => resource.id === source.resourceId); resourceIds.push(source.resourceId);
      if (!resource || resource.kind !== taxon.food || resource.patch !== taxon.site! - 6) invalid(`state.planet.nursery.sources[${index}].resourceId`, SAVE_ERRORS.unknownValue);
    });
    uniqueIds(resourceIds, 'state.planet');
  }
  array(s.lineage, 'lineage', 10000, 1).forEach((value, index) => {
    const at = `lineage[${index}]`, l = object(value, at, ['generation', 'stage', 'time', 'name', 'parts', 'event']);
    number(l.generation, `${at}.generation`, 1, Number(p.generation), true); number(l.stage, `${at}.stage`, 0, stage, true);
    number(l.time, `${at}.time`); string(l.name, `${at}.name`, 32); string(l.event, `${at}.event`, 512);
    array(l.parts, `${at}.parts`, 18).forEach((kind) => { if (typeof kind !== 'string' || !adaptationIds.has(kind)) invalid(`${at}.parts`, SAVE_ERRORS.unknownLineageAdaptation); });
  });
  array(s.messages, 'messages', 16).forEach((value, index) => {
    const at = `messages[${index}]`, message = object(value, at, ['id', 'text', 'time']);
    number(message.id, `${at}.id`, 0, MAX_COUNT + 16, true); string(message.text, `${at}.text`, 1024); number(message.time, `${at}.time`);
  });
  if (s.deathReason !== null) string(s.deathReason, 'deathReason', 1024);
  if (hasLineageHistory) validateLineageHistory(s.lineageHistory, { ...s, journey } as unknown as GameState);
  validateMusicContext(s as unknown as GameState);
  validateChiefContext(s as unknown as GameState);
  validateDomesticationContext(s as unknown as GameState);
  if (s.checkpoint !== null) {
    if (nestedCheckpoint) invalid('checkpoint', SAVE_ERRORS.nestedCheckpoint);
    const checkpoint = string(s.checkpoint, 'checkpoint', MAX_BYTES);
    let decoded: unknown;
    try { decoded = JSON.parse(checkpoint); } catch { invalid('checkpoint', SAVE_ERRORS.invalidCheckpointJson); }
    const restored = validateState(decoded, true);
    if (restored.id !== s.id || restored.seed !== seed || restored.stage > stage || restored.player.generation > Number(p.generation) || restored.journey.legacy !== journey.legacy || restored.journey.version !== (journey.version === 1 ? 2 : journey.version)) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    for (const key of ['tribe', 'machines', 'planet'] as const) {
      if (Object.prototype.hasOwnProperty.call(restored, key) !== sliceKeys.includes(key)) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    }
    if (restored.tribe?.version !== (s.tribe as GameState['tribe'])?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    if(restored.tribe?.version===2&&(s.tribe as ActiveTribeState)?.version===2){
      const live=s.tribe as ActiveTribeState;
      for(const n of restored.tribe.neighbours)if(n.society?.version!==live.neighbours.find(v=>v.identity===n.identity)?.society?.version)invalid('checkpoint.tribe.neighbours',SAVE_ERRORS.checkpointMismatch);
    }
    if (restored.machines?.version !== (s.machines as GameState['machines'])?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    if (restored.planet?.version !== (s.planet as GameState['planet'])?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    // The rule marker is fixed at birth; the earlier filter opening may differ.
    if (restored.journey.reefEvolution?.version !== journey.reefEvolution?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    if (restored.lineageHistory?.version !== (s.lineageHistory as GameState['lineageHistory'])?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    for (const prior of restored.lineageHistory?.stages ?? []) {
      const current = (s.lineageHistory as GameState['lineageHistory'])!.stages[prior.stage];
      if (prior.closed && (prior.closed.source === 'action' || current.closed?.source === 'action') && historyRowSignature(prior) !== historyRowSignature(current)) invalid('checkpoint.lineageHistory', SAVE_ERRORS.checkpointMismatch);
      if (prior.counts && current.counts && (prior.counts.hunts > current.counts.hunts || HISTORY_FOODS.some(f => prior.counts!.meals[f] > current.counts!.meals[f]))) invalid('checkpoint.lineageHistory', SAVE_ERRORS.checkpointMismatch);
    }
    if (restored.cellGrowth?.version !== (s.cellGrowth as GameState['cellGrowth'])?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    if (restored.creatureStage?.version !== (s.creatureStage as GameState['creatureStage'])?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    if (restored.creatureStage?.discovery?.version !== (s.creatureStage as GameState['creatureStage'])?.discovery?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    if (JSON.stringify(restored.worlds[2]?.creatureDesigns) !== JSON.stringify((worlds[2] as World | null)?.creatureDesigns)) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    // Recovery consumes this string later, so persist migrated fields inside it as well.
    s.checkpoint = JSON.stringify(restored);
  }
  if (journey.version === 1 && !journey.legacy) {
    const initial = genomeCost(initialGenome()), installed = genomeCost(genome);
    // Reclaim old edit fees without reducing knowledge, changing the body, or
    // taking already available DNA. This explicit migration runs only for j1.
    const learned = Math.max(Number(p.totalDna), installed - initial + Number(p.dna));
    const available = initial + learned - installed;
    number(learned, 'player.totalDna'); number(available, 'player.dna');
    p.totalDna = learned; p.dna = available;
  }
  if (journey.version === 1) journey.version = 2;
  s.version = 3;
  s.journey = journey;
  const result = value as GameState;
  result.world = result.worlds[worldStage]!;
  return result;
}

function readEnvelope(text: string): SavedEnvelope {
  if (typeof text !== 'string' || text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error(SAVE_ERRORS.tooLarge);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(SAVE_ERRORS.invalidJson); }
  const envelope = object(value, SAVE_ERRORS.envelopePath, ['format', 'version', 'savedAt', 'state']);
  if (envelope.format !== FORMAT) throw new Error(SAVE_ERRORS.invalidFormat);
  if (envelope.version !== 1 && envelope.version !== 2 && envelope.version !== 3) throw new Error(SAVE_ERRORS.unsupportedVersion);
  number(envelope.savedAt, 'savedAt', 0, 8_640_000_000_000_000, true);
  validateState(envelope.state, false, envelope.version);
  envelope.version = 3;
  return value as SavedEnvelope;
}

export function serializeGame(state: GameState): string {
  let text: string;
  try { text = JSON.stringify({ format: FORMAT, version: 3, savedAt: Date.now(), state }); }
  catch { throw new Error(SAVE_ERRORS.unserializableState); }
  const normalized = JSON.stringify(readEnvelope(text));
  // Migrating an older checkpoint can add fields after the input size check.
  if (new TextEncoder().encode(normalized).byteLength > MAX_BYTES) throw new Error(SAVE_ERRORS.tooLarge);
  return normalized;
}

export function parseGame(text: string): GameState { return readEnvelope(text).state; }

export function saveGame(state: GameState): { ok: boolean; error?: string } {
  let text: string;
  try { text = serializeGame(state); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : SAVE_ERRORS.cannotSave }; }
  try {
    // A single setItem is atomic; a quota error leaves the previous slot untouched.
    // Slots are their own index, so interrupted writes cannot desynchronize metadata.
    localStorage.setItem(SAVE_PREFIX + state.id, text);
    return { ok: true };
  } catch { return { ok: false, error: SAVE_ERRORS.writeFailed }; }
}

export function loadGames(): SaveSummary[] {
  const slots: SaveSummary[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(SAVE_PREFIX)) continue;
      try {
        const text = localStorage.getItem(key);
        if (!text) continue;
        const { state, savedAt } = readEnvelope(text);
        if (key !== SAVE_PREFIX + state.id) continue;
        slots.push({ id: state.id, name: state.player.genome.name, stage: state.stage, generation: state.player.generation, seed: state.seed, updatedAt: savedAt });
      } catch { /* One corrupt slot must not hide or overwrite any other lineage. */ }
    }
  } catch { return slots; }
  return slots.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

export function loadGame(id: string): GameState {
  gameId(id, 'id');
  let text: string | null;
  try { text = localStorage.getItem(SAVE_PREFIX + id); }
  catch { throw new Error(SAVE_ERRORS.readFailed); }
  if (!text) throw new Error(SAVE_ERRORS.notFound);
  const state = parseGame(text);
  if (state.id !== id) throw new Error(SAVE_ERRORS.slotIdMismatch);
  return state;
}

export function deleteGame(id: string): void {
  gameId(id, 'id');
  try { localStorage.removeItem(SAVE_PREFIX + id); }
  catch { throw new Error(SAVE_ERRORS.deleteFailed); }
}
