import { SAVE_ERRORS } from './errors.cs';
import type { GameState, Stage, World } from './types';
import { ADAPTATIONS, computeStats, genomeCost, has, initialGenome, validateGenome } from './genome';
import { SPECIES } from './content';
import { emptyJourney } from './journey-types';
import type { Journey } from './journey-types';
import { groundHeight } from './random';
import { WORLD_BOUND } from './world';
import { SITE_STORIES } from './journey-content';

const FORMAT = 'lumavora';
const SAVE_PREFIX = 'lumavora:save:';
const MAX_BYTES = 8 * 1024 * 1024;
const UINT32 = 0xffffffff;
const MAX_COUNT = 1_000_000_000;
const foods = ['algae', 'mineral', 'nectar', 'meat', 'detritus'];
const adaptationIds: ReadonlySet<string> = new Set(ADAPTATIONS.map((item) => item.id));
const knownSpecies = new Map(SPECIES.map((item) => [item.id, item]));
type SavedEnvelope = { format: 'lumavora'; version: 2; savedAt: number; state: GameState };
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

function validateWorld(value: unknown, stage: Stage, seed: number, path: string): World {
  const w = object(value, path, ['seed', 'stage', 'rng', 'time', 'resources', 'creatures', 'patches', 'obstacles', 'landmarks', 'nextId', 'births', 'deaths']);
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
  const j = object(value, 'journey', ['version', 'legacy', 'sites', 'cargo', 'insights', 'echoes', 'hunters', 'offerings', ...(version === 3 ? ['canopy'] : []), ...(hasDispersal ? ['rootDispersal'] : []), ...(hasReefEvolution ? ['reefEvolution'] : [])]);
  boolean(j.legacy, 'journey.legacy');
  if (version === 3 && j.legacy) invalid('journey.legacy', SAVE_ERRORS.unknownValue);
  if (hasReefEvolution) {
    const at = 'journey.reefEvolution', reefEvolution = object(j.reefEvolution, at, ['version', 'pumping']);
    oneOf(reefEvolution.version, [1], `${at}.version`);
    number(reefEvolution.pumping, `${at}.pumping`, 0, 1);
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

function validateState(value: unknown, nestedCheckpoint = false, expectedVersion?: 1 | 2): GameState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('state', SAVE_ERRORS.objectRequired);
  const version = (value as Record<string, unknown>).version;
  if ((version !== 1 && version !== 2) || (expectedVersion !== undefined && version !== expectedVersion)) invalid('state.version', SAVE_ERRORS.unsupportedStateVersion);
  const s = object(value, 'state', ['version', 'id', 'seed', 'stage', 'tick', 'rng', 'player', 'worlds', 'world', 'campaign', 'lineage', 'checkpoint', 'messages', 'deathReason', ...(version === 2 ? ['journey'] : [])]);
  gameId(s.id, 'state.id'); const seed = number(s.seed, 'state.seed', 0, UINT32, true);
  oneOf(s.stage, [0, 1, 2], 'state.stage'); const stage = s.stage as Stage;
  number(s.tick, 'state.tick', 0, MAX_COUNT, true); number(s.rng, 'state.rng', 0, UINT32, true);
  const worlds = array(s.worlds, 'state.worlds', 3, 3);
  worlds.forEach((world, index) => {
    if (world !== null) validateWorld(world, index as Stage, seed, `state.worlds[${index}]`);
    else if (index === stage) invalid('state.worlds', SAVE_ERRORS.missingActiveWorld);
  });
  // Saves carry the active alias for readability. Refuse conflicting duplicate states.
  validateWorld(s.world, stage, seed, 'state.world');
  if (JSON.stringify(s.world) !== JSON.stringify(worlds[stage])) invalid('state.world', SAVE_ERRORS.activeWorldMismatch);
  const journey = version === 1 ? emptyJourney(true) : validateJourney(s.journey, stage, worlds as (World | null)[]);
  // Historical legacy saves predate the explicit scan timer. Only this missing
  // field migrates; new journey saves require it, and unknown fields always fail.
  if ((version === 1 || journey.legacy) && s.player && typeof s.player === 'object' && !Array.isArray(s.player) && !Object.prototype.hasOwnProperty.call(s.player, 'scan')) (s.player as Record<string, unknown>).scan = 0;
  // Both legacy and early journey saves predate the independent ability timer.
  // Only its absence migrates; a present malformed timer or unknown field fails.
  const missingRecharge = !!s.player && typeof s.player === 'object' && !Array.isArray(s.player) && !Object.prototype.hasOwnProperty.call(s.player, 'abilityRecharge');
  if (missingRecharge) (s.player as Record<string, unknown>).abilityRecharge = 0;
  const p = object(s.player, 'player', ['pos', 'velocity', 'heading', 'health', 'energy', 'oxygen', 'moisture', 'genome', 'dna', 'totalDna', 'generation', 'meals', 'kills', 'bonds', 'cooldown', 'abilityRecharge', 'scan', 'invulnerable', 'feeding', 'distance']);
  const genomeErrors = validateGenome(p.genome, stage);
  if (genomeErrors.length) invalid('player.genome', genomeErrors.join(' '));
  const genome = p.genome as GameState['player']['genome'];
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
  if ((c.won && (stage !== 2 || c.finale === null)) || (!c.won && c.finale !== null) || (c.sandbox && !c.won)) invalid('campaign', SAVE_ERRORS.invalidFinale);
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
  if (s.checkpoint !== null) {
    if (nestedCheckpoint) invalid('checkpoint', SAVE_ERRORS.nestedCheckpoint);
    const checkpoint = string(s.checkpoint, 'checkpoint', MAX_BYTES);
    let decoded: unknown;
    try { decoded = JSON.parse(checkpoint); } catch { invalid('checkpoint', SAVE_ERRORS.invalidCheckpointJson); }
    const restored = validateState(decoded, true);
    if (restored.id !== s.id || restored.seed !== seed || restored.stage > stage || restored.player.generation > Number(p.generation) || restored.journey.legacy !== journey.legacy || restored.journey.version !== (journey.version === 1 ? 2 : journey.version)) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
    // The rule marker is fixed at birth; the earlier filter opening may differ.
    if (restored.journey.reefEvolution?.version !== journey.reefEvolution?.version) invalid('checkpoint', SAVE_ERRORS.checkpointMismatch);
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
  s.version = 2;
  s.journey = journey;
  const result = value as GameState;
  result.world = result.worlds[stage]!;
  return result;
}

function readEnvelope(text: string): SavedEnvelope {
  if (typeof text !== 'string' || text.length > MAX_BYTES || new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error(SAVE_ERRORS.tooLarge);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(SAVE_ERRORS.invalidJson); }
  const envelope = object(value, SAVE_ERRORS.envelopePath, ['format', 'version', 'savedAt', 'state']);
  if (envelope.format !== FORMAT) throw new Error(SAVE_ERRORS.invalidFormat);
  if (envelope.version !== 1 && envelope.version !== 2) throw new Error(SAVE_ERRORS.unsupportedVersion);
  number(envelope.savedAt, 'savedAt', 0, 8_640_000_000_000_000, true);
  validateState(envelope.state, false, envelope.version);
  envelope.version = 2;
  return value as SavedEnvelope;
}

export function serializeGame(state: GameState): string {
  let text: string;
  try { text = JSON.stringify({ format: FORMAT, version: 2, savedAt: Date.now(), state }); }
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
