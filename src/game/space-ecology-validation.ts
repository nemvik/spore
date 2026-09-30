import { coreClimateOffset } from './space-core-content';
import type { ExpeditionAction } from './space-expedition-types';
import type { SpaceState } from './space-types';
import type { LivingExpedition, LivingPlanet, LivingSpecimen } from './space-biosphere-types';
import { GALAXY_SYSTEMS, planetSystem } from './galaxy';
import { shipCapabilities } from './space-outfit-content';
import { validateNpcDesigns } from './npc-genome';
import { LIFE_PROFILES, foreignGround } from './space-life';
import { CLIMATE_RATE, climateAtLimit, climateMatchesWork } from './space-climate';
import { ECOLOGY_DRIFT_RATE, ECOLOGY_STABLE_SECONDS, bandCondition } from './space-ecology';
import { lifeIdentity, rewindEcology, initialLocations, sameLocations, scanReferences, scanOrderValid } from './space-ecology-history';

function fail(): never { throw new Error('Neplatný uložený živý ekosystém.'); }
export function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
}
export function finite(value: unknown, min: number, max: number, integer = false): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) fail();
}
const workKeys = ['warm', 'cool', 'thicken', 'thin'] as const;
export const totalClimateWork = (world: LivingPlanet) => workKeys.reduce((sum, key) => sum + world.biosphere.work[key], 0);
const maxCounter = Number.MAX_SAFE_INTEGER;

export function validateForeignEcology(p: SpaceState): void {
  const e = p.expedition as LivingExpedition;
  exact(e, ['version', 'generator', 'worlds', 'cargo', 'scans', 'actions', 'nextAction', 'energySpent', 'biosphere']);
  if (e.version !== 2 || e.generator !== 1 || !Array.isArray(e.worlds) || e.worlds.length > GALAXY_SYSTEMS - 1
    || !Array.isArray(e.cargo) || e.cargo.length > (shipCapabilities(p)?.cargo ?? 0)
    || !Array.isArray(e.scans) || !Array.isArray(e.actions)) fail();
  finite(e.nextAction, 1, maxCounter, true); finite(e.energySpent, 0, 1e12, true);
  if (e.actions.length !== Math.min(128, e.nextAction - 1)) fail();
  if (!p.ship && (e.worlds.length || e.cargo.length || e.scans.length || e.nextAction !== 1 || e.energySpent)) fail();
  const b = e.biosphere;
  exact(b, ['version', 'activatedAt', 'activatedAction', 'tool', 'toolPlanetId', 'paidScans', 'paidTransfers', 'origins', 'ecology']);
  if (b.version !== 2 || !['off', 'warm', 'cool', 'thicken', 'thin'].includes(b.tool) || !Array.isArray(b.origins)) fail();
  exact(b.ecology, ['activatedAt', 'activatedAction']);
  finite(b.activatedAt, 0, p.elapsed); finite(b.activatedAction, 1, e.nextAction, true);
  finite(b.ecology.activatedAt, b.activatedAt, p.elapsed); finite(b.ecology.activatedAction, b.activatedAction, e.nextAction, true);
  finite(b.paidScans, 0, maxCounter, true); finite(b.paidTransfers, 0, maxCounter, true);
  if (b.paidScans + 2 * b.paidTransfers !== e.energySpent) fail();
  const worlds = new Set<string>(); let ecologicalTime = 0;
  for (const world of e.worlds) {
    exact(world, ['id', 'systemId', 'generator', 'seed', 'temperature', 'atmosphere', 'elapsed', 'designs', 'life', 'biosphere']);
    const system = planetSystem(p.homePlanetId, world.id);
    if (!system?.index || world.systemId !== system.id || world.seed !== system.seed || world.generator !== 1 || worlds.has(world.id)) fail();
    worlds.add(world.id); finite(world.temperature, -1, 1); finite(world.atmosphere, -1, 1); finite(world.elapsed, 0, p.elapsed);
    validateNpcDesigns(world.designs);
    if (!Array.isArray(world.life) || world.life.length > 96) fail();
    const bio = world.biosphere;
    exact(bio, ['initial', 'activatedElapsed', 'work', 'stableFor', 'ecologyElapsed']);
    exact(bio.initial, ['temperature', 'atmosphere']); finite(bio.initial.temperature, -1, 1); finite(bio.initial.atmosphere, -1, 1);
    finite(bio.activatedElapsed, 0, world.elapsed); finite(bio.ecologyElapsed, bio.activatedElapsed, world.elapsed);
    const active = world.elapsed - bio.ecologyElapsed!; ecologicalTime += active;
    exact(bio.work, [...workKeys, 'temperatureDrift', 'atmosphereDrift']);
    for (const key of workKeys) finite(bio.work[key], 0, 1e12);
    finite(bio.work.temperatureDrift, -ECOLOGY_DRIFT_RATE * active - 1e-7, ECOLOGY_DRIFT_RATE * active + 1e-7);
    finite(bio.work.atmosphereDrift, -ECOLOGY_DRIFT_RATE * active - 1e-7, ECOLOGY_DRIFT_RATE * active + 1e-7);
    if (!climateMatchesWork(world, bio.initial, bio.work, coreClimateOffset(p.core, world.id)) || totalClimateWork(world) > CLIMATE_RATE * (world.elapsed - bio.activatedElapsed) + 1e-7) fail();
    if (!Array.isArray(bio.stableFor) || bio.stableFor.length !== 3) fail();
    for (const time of bio.stableFor) finite(time, 0, Math.min(ECOLOGY_STABLE_SECONDS, active + 1e-7));
  }
  if (ecologicalTime > p.elapsed - b.ecology.activatedAt + 1e-6) fail();
  if (b.tool === 'off') { if (b.toolPlanetId !== null) fail(); }
  else {
    const world = e.worlds.find(candidate => candidate.id === b.toolPlanetId);
    if (!world || !p.ship || p.ship.energy <= 0 || !p.location || p.leg || p.location.scale !== 'surface'
      || p.location.planetId !== world.id || climateAtLimit(world, b.tool)) fail();
  }
  const origins = new Set<string>(); let births = 0, deaths = 0;
  for (const origin of b.origins) {
    exact(origin, ['planetId', 'births', 'deaths', 'founderDeaths']);
    if (!worlds.has(origin.planetId) || !planetSystem(p.homePlanetId, origin.planetId)?.living || origins.has(origin.planetId)) fail(); origins.add(origin.planetId);
    for (const key of ['births', 'deaths'] as const) {
      if (!Array.isArray(origin[key]) || origin[key].length !== 6) fail();
      for (const count of origin[key]) finite(count, 0, maxCounter, true);
    }
    if (!Array.isArray(origin.founderDeaths) || origin.founderDeaths.length > 36 || new Set(origin.founderDeaths).size !== origin.founderDeaths.length) fail();
    for (const serial of origin.founderDeaths) finite(serial, 1, 36, true);
    births += origin.births.reduce((sum, count) => sum + count, 0); deaths += origin.deaths.reduce((sum, count) => sum + count, 0);
    finite(births, 0, maxCounter, true); finite(deaths, 0, maxCounter, true);
  }
  if (e.worlds.some(world => planetSystem(p.homePlanetId, world.id)!.living && !origins.has(world.id))) fail();
  if (births + deaths > 0 && ecologicalTime <= 0) fail();
  const allActions = b.paidScans + b.paidTransfers + births + deaths;
  if (!Number.isSafeInteger(allActions) || allActions !== e.nextAction - 1) fail();
  const alive = new Map<string, LivingSpecimen>();
  function specimen(item: LivingSpecimen, resident?: LivingPlanet) {
    exact(item, ['id', 'originPlanetId', 'taxonKey', 'pos', 'heading', 'health', 'nutrition', 'habitat']);
    const identity = lifeIdentity(e, item.id);
    if (!identity || item.originPlanetId !== identity.origin.planetId || item.taxonKey !== LIFE_PROFILES[identity.role].key || alive.has(item.id)) fail();
    exact(item.pos, ['x', 'y', 'z']); finite(item.pos.x, -80, 80); finite(item.pos.z, -80, 80); finite(item.pos.y, -.35, .35);
    if (resident && Math.abs(item.pos.y - foreignGround(resident.seed, item.pos.x, item.pos.z)) > 1e-8) fail();
    finite(item.heading, -Math.PI, Math.PI); finite(item.health, 0, 100); if (item.health <= 0) fail(); finite(item.nutrition, 0, 1);
    exact(item.habitat, ['band', 'reproduction', 'sinceHunt', 'birth']); finite(item.habitat.band, 1, 3, true);
    finite(item.habitat.reproduction, 0, identity.role < 3 ? 40 : 60); finite(item.habitat.sinceHunt, 0, 120);
    if (identity.founder) { if (item.habitat.birth !== null || identity.origin.founderDeaths.includes(identity.serial)) fail(); }
    else {
      const birth = item.habitat.birth; exact(birth, ['parentId', 'planetId', 'at']);
      const parent = lifeIdentity(e, birth.parentId);
      if (!parent || parent.origin !== identity.origin || parent.role !== identity.role || !parent.founder && parent.serial >= identity.serial || !worlds.has(birth.planetId)) fail();
      finite(birth.at, b.ecology!.activatedAt, p.elapsed); if (birth.at === b.ecology!.activatedAt) fail();
    }
    alive.set(item.id, item);
  }
  for (const world of e.worlds) for (const item of world.life) specimen(item, world);
  for (const item of e.cargo) specimen(item);
  for (const origin of b.origins) for (let role = 0; role < 6; role++) {
    const living = [...alive.values()].filter(item => item.originPlanetId === origin.planetId && item.taxonKey === LIFE_PROFILES[role].key).length;
    const deadFounders = origin.founderDeaths.filter(serial => (serial - 1) % 6 === role).length;
    if (6 + origin.births[role] - origin.deaths[role] !== living || deadFounders > origin.deaths[role]) fail();
    for (let serial = role + 1; serial <= 36; serial += 6) if (alive.has(`${origin.planetId}:life-${serial}`) === origin.founderDeaths.includes(serial)) fail();
  }
  const refs = scanReferences(e), scans = new Map<string, LivingExpedition['scans'][number]>();
  if (e.scans.length > 36 * b.origins.length + alive.size + 256) fail();
  for (const scan of e.scans) {
    exact(scan, ['lifeId', 'planetId', 'at']); finite(scan.at, 0, p.elapsed);
    const identity = lifeIdentity(e, scan.lifeId);
    if (!identity || !worlds.has(scan.planetId) || scans.has(scan.lifeId) || !identity.founder && !refs.has(scan.lifeId)) fail();
    scans.set(scan.lifeId, scan);
  }
  for (const item of e.cargo) if (!scans.has(item.id)) fail();
  let lastTime = 0;
  for (const [index, row] of e.actions.entries()) {
    const biological = row.kind === 'birth' || row.kind === 'death';
    const withBand = biological || row.kind === 'release' && row.serial >= b.activatedAction || row.kind === 'collect' && row.serial >= b.ecology.activatedAction;
    exact(row, ['serial', 'at', 'kind', 'planetId', 'lifeId', 'energyPaid', ...(withBand ? ['band'] : []), ...(row.kind === 'birth' ? ['parentId'] : row.kind === 'death' ? ['cause'] : [])]);
    finite(row.serial, 1, e.nextAction - 1, true); finite(row.at, lastTime, p.elapsed); lastTime = row.at;
    if (row.serial !== e.nextAction - e.actions.length + index || !worlds.has(row.planetId) || !lifeIdentity(e, row.lifeId)) fail();
    if (withBand) finite((row as { band: number }).band, 1, 3, true);
    if (biological) {
      const eventWorld = e.worlds.find(world => world.id === row.planetId)!;
      if (row.serial < b.ecology.activatedAction || row.at <= b.ecology.activatedAt || row.energyPaid !== 0
        || eventWorld.elapsed <= eventWorld.biosphere.ecologyElapsed!) fail();
      if (row.kind === 'death' && !['climate', 'hunger', 'predation'].includes(row.cause)) fail();
      if (row.kind === 'birth') {
        const current = alive.get(row.lifeId);
        if (!lifeIdentity(e, row.parentId) || current && JSON.stringify(current.habitat.birth) !== JSON.stringify({ parentId: row.parentId, planetId: row.planetId, at: row.at })) fail();
      }
    } else {
      const paid = row as ExpeditionAction;
      if (!['scan', 'collect', 'release'].includes(paid.kind) || paid.energyPaid !== (paid.kind === 'scan' ? 1 : 2) || !scans.has(paid.lifeId) || scans.get(paid.lifeId)!.at > paid.at) fail();
    }
  }
  const rewound = rewindEcology(e, lifeAction => shipCapabilities(p, { lifeAction })?.cargo ?? 0); if (!rewound) fail();
  if (e.actions.length === e.nextAction - 1) {
    if (!scanOrderValid(e.actions, [])) fail();
    if (!sameLocations(rewound.where, initialLocations(e)) || rewound.scans || rewound.transfers
      || [...rewound.counts.values()].some(count => [...count.births, ...count.deaths].some(Boolean))) fail();
    for (const scan of e.scans) {
      const first = e.actions.find(row => row.kind === 'scan' && row.lifeId === scan.lifeId);
      if (!first || first.at !== scan.at || first.planetId !== scan.planetId) fail();
    }
  }
  for (const world of e.worlds) for (const band of [1, 2, 3] as const) if (world.biosphere.stableFor[band - 1] > 0 && !bandCondition(e, world, band).viable) fail();
  if (p.location?.scale === 'surface' && p.location.planetId !== p.homePlanetId && !worlds.has(p.location.planetId)) fail();
}
