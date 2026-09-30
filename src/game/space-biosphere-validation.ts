import type { SpaceState } from './space-types';
import type { ExpeditionAction, SpaceExpeditionV1 } from './space-expedition-types';
import type { LivingExpedition, LivingPlanet } from './space-biosphere-types';
import { CLIMATE_RATE, climateAtLimit, climateMatchesWork } from './space-climate';
import { planetSystem } from './galaxy';
import { founderBand } from './space-biosphere';
import { validateExpedition as validateV1, expeditionCheckpointMatches as checkpointV1 } from './space-expedition-v1-validation';

function fail(): never { throw new Error('Neplatná uložená biosféra cizí planety.'); }
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
}
function number(value: unknown, min: number, max: number, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) fail();
}
const workKeys = ['warm', 'cool', 'thicken', 'thin'] as const;
const totalWork = (world: LivingPlanet) => workKeys.reduce((sum, key) => sum + world.biosphere.work[key], 0);
type LegacySpace = Omit<SpaceState, 'expedition'> & { expedition?: SpaceExpeditionV1 };

/** Reuses C2 transfer invariants after validating every new field. No save mutation. */
export function legacyProjection(p: SpaceState): LegacySpace {
  if (p.expedition?.version !== 2) return p as LegacySpace;
  const { biosphere: _biosphere, ...e } = p.expedition;
  const life = (item: LivingExpedition['cargo'][number]) => { const { habitat: _habitat, ...old } = item; return old; };
  const worlds = e.worlds.map(world => { const { biosphere: _bio, ...old } = world; return { ...old, life: old.life.map(life) }; });
  const actions = e.actions.map(row => { const { band: _band, ...old } = row as ExpeditionAction & { band?: number }; return old; });
  return { ...p, expedition: { ...e, version: 1, worlds, cargo: e.cargo.map(life), actions } };
}
export function validateBiosphere(p: SpaceState): void {
  const e = p.expedition as LivingExpedition;
  object(e, ['version', 'generator', 'worlds', 'cargo', 'scans', 'actions', 'nextAction', 'energySpent', 'biosphere']);
  if (e.version !== 2 || !Array.isArray(e.worlds) || !Array.isArray(e.cargo) || !Array.isArray(e.actions)) fail();
  const bio = e.biosphere;
  object(bio, ['version', 'activatedAt', 'activatedAction', 'tool', 'toolPlanetId', 'paidScans', 'paidTransfers', 'origins']);
  if (bio.version !== 1 || !['off', 'warm', 'cool', 'thicken', 'thin'].includes(bio.tool) || !Array.isArray(bio.origins)) fail();
  number(bio.activatedAt, 0, p.elapsed); number(bio.paidScans, 0, Number.MAX_SAFE_INTEGER, true); number(bio.paidTransfers, 0, Number.MAX_SAFE_INTEGER, true);
  number(bio.activatedAction, 1, e.nextAction, true);
  if (bio.paidScans + bio.paidTransfers !== e.nextAction - 1 || bio.paidScans + 2 * bio.paidTransfers !== e.energySpent) fail();
  if (bio.tool === 'off') { if (bio.toolPlanetId !== null) fail(); }
  else {
    const world = e.worlds.find(world => world.id === bio.toolPlanetId);
    if (!world || !p.ship || p.ship.energy <= 0 || !p.location || p.leg || p.location.scale !== 'surface'
      || p.location.planetId !== world.id || climateAtLimit(world, bio.tool)) fail();
  }
  const expectedOrigins = e.worlds.filter(world => planetSystem(p.homePlanetId, world.id)?.living).map(world => world.id);
  const origins = new Set<string>();
  for (const origin of bio.origins) {
    object(origin, ['planetId', 'births', 'deaths', 'founderDeaths']);
    if (!expectedOrigins.includes(origin.planetId) || origins.has(origin.planetId)) fail(); origins.add(origin.planetId);
    // C3a1 has climate and habitats; demographic events activate in the next slice.
    if (!Array.isArray(origin.births) || origin.births.length !== 6 || origin.births.some(value => value !== 0)
      || !Array.isArray(origin.deaths) || origin.deaths.length !== 6 || origin.deaths.some(value => value !== 0)
      || !Array.isArray(origin.founderDeaths) || origin.founderDeaths.length) fail();
  }
  if (origins.size !== expectedOrigins.length) fail();
  for (const world of e.worlds) {
    object(world, ['id', 'systemId', 'generator', 'seed', 'temperature', 'atmosphere', 'elapsed', 'designs', 'life', 'biosphere']);
    if (!Array.isArray(world.life)) fail();
    const b = world.biosphere;
    object(b, ['initial', 'activatedElapsed', 'work', 'stableFor']); object(b.initial, ['temperature', 'atmosphere']);
    number(b.initial.temperature, -1, 1); number(b.initial.atmosphere, -1, 1); number(b.activatedElapsed, 0, world.elapsed);
    object(b.work, [...workKeys, 'temperatureDrift', 'atmosphereDrift']);
    for (const key of workKeys) number(b.work[key], 0, 1e12);
    if (b.work.temperatureDrift !== 0 || b.work.atmosphereDrift !== 0) fail();
    if (!climateMatchesWork(world, b.initial, b.work) || totalWork(world) > CLIMATE_RATE * (world.elapsed - b.activatedElapsed) + 1e-7) fail();
    if (!Array.isArray(b.stableFor) || b.stableFor.length !== 3 || b.stableFor.some(time => time !== 0)) fail();
  }
  for (const item of [...e.cargo, ...e.worlds.flatMap(world => world.life)]) {
    object(item, ['id', 'originPlanetId', 'taxonKey', 'pos', 'heading', 'health', 'nutrition', 'habitat']);
    object(item.habitat, ['band', 'reproduction', 'sinceHunt', 'birth']); number(item.habitat.band, 1, 3, true);
    if (item.habitat.reproduction !== 0 || item.habitat.sinceHunt !== 120 || item.habitat.birth !== null) fail();
  }
  for (const row of e.actions) {
    if (!['scan', 'collect', 'release'].includes(row.kind)) fail();
    const releasedNow = row.kind === 'release' && row.serial >= bio.activatedAction;
    object(row, ['serial', 'at', 'kind', 'planetId', 'lifeId', 'energyPaid', ...(releasedNow ? ['band'] : [])]);
    if (releasedNow) number((row as { band: number }).band, 1, 3, true);
  }
  for (const item of [...e.cargo, ...e.worlds.flatMap(world => world.life)]) {
    const last = [...e.actions].reverse().find(row => row.lifeId === item.id && row.kind === 'release' && row.serial >= bio.activatedAction);
    if (last && 'band' in last) { if (item.habitat.band !== last.band) fail(); }
    else if (bio.activatedAction >= e.nextAction - e.actions.length && item.habitat.band !== founderBand(item)) fail();
  }
  validateV1(legacyProjection(p));
}
export function biosphereCheckpointMatches(a: SpaceState, b: SpaceState): boolean {
  const now = a.expedition, old = b.expedition;
  if (now?.version !== 2 || old?.version !== 2) return false;
  const migratedCheckpoint = old.biosphere.activatedAt === b.elapsed && old.biosphere.activatedAction === old.nextAction
    && old.worlds.every(world => totalWork(world) === 0 && world.biosphere.activatedElapsed === world.elapsed);
  if ((!migratedCheckpoint && (now.biosphere.activatedAt !== old.biosphere.activatedAt || now.biosphere.activatedAction !== old.biosphere.activatedAction))
    || now.biosphere.activatedAt < old.biosphere.activatedAt || now.biosphere.activatedAction < old.biosphere.activatedAction || now.biosphere.paidScans < old.biosphere.paidScans
    || now.biosphere.paidTransfers < old.biosphere.paidTransfers) return false;
  // The C2 projection intentionally omits the new band receipt. Its closed
  // history must still be immutable even after a later release of that body.
  if (!old.actions.every(row => {
    const current = now.actions.find(candidate => candidate.serial === row.serial);
    return current ? JSON.stringify(current) === JSON.stringify(row) : row.serial < now.nextAction - now.actions.length;
  })) return false;
  if (!old.worlds.every(world => {
    const current = now.worlds.find(candidate => candidate.id === world.id);
    if (!current || JSON.stringify(world.biosphere.initial) !== JSON.stringify(current.biosphere.initial)
      || !migratedCheckpoint && world.biosphere.activatedElapsed !== current.biosphere.activatedElapsed
      || current.biosphere.activatedElapsed < world.biosphere.activatedElapsed) return false;
    return workKeys.every(key => current.biosphere.work[key] >= world.biosphere.work[key])
      && totalWork(current) - totalWork(world) <= CLIMATE_RATE * (current.elapsed - world.elapsed) + 1e-7;
  })) return false;
  const priorLife = [...old.cargo, ...old.worlds.flatMap(world => world.life)];
  const newLife = [...now.cargo, ...now.worlds.flatMap(world => world.life)];
  for (const item of priorLife) {
    const current = newLife.find(candidate => candidate.id === item.id); if (!current) return false;
    const releases = now.actions.filter(row => row.serial >= old.nextAction && row.lifeId === item.id && row.kind === 'release');
    const last = releases.at(-1);
    if (last && 'band' in last) { if (current.habitat.band !== last.band) return false; }
    else if (now.nextAction - old.nextAction <= now.actions.length && current.habitat.band !== item.habitat.band) return false;
  }
  return checkpointV1(legacyProjection(a), legacyProjection(b));
}
