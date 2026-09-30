import type { SpaceState } from './space-types';
import type { LivingExpedition } from './space-biosphere-types';
import { CLIMATE_RATE } from './space-climate';
import { ECOLOGY_DRIFT_RATE } from './space-ecology';
import { totalClimateWork } from './space-ecology-validation';
import { lifeIdentity, lifeLocations, initialLocations, rewindEcology, sameLocations, scanReferences, scanOrderValid } from './space-ecology-history';
import { shipCapabilities } from './space-outfit-content';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const workKeys = ['warm', 'cool', 'thicken', 'thin'] as const;

export function ecologyCheckpointMatches(a: SpaceState, b: SpaceState): boolean {
  const now = a.expedition as LivingExpedition, old = b.expedition as LivingExpedition;
  if (now?.version !== 2 || old?.version !== 2 || now.biosphere.version !== 2 || old.biosphere.version !== 2) return false;
  const live = now.biosphere, cp = old.biosphere;
  if (now.nextAction < old.nextAction || now.energySpent < old.energySpent || live.paidScans < cp.paidScans || live.paidTransfers < cp.paidTransfers) return false;
  const climateBootstrap = cp.activatedAt === b.elapsed && cp.activatedAction === old.nextAction
    && old.worlds.every(world => totalClimateWork(world) === 0 && world.biosphere.activatedElapsed === world.elapsed);
  const ecologyBootstrap = cp.ecology!.activatedAt === b.elapsed && cp.ecology!.activatedAction === old.nextAction
    && old.worlds.every(world => world.biosphere.ecologyElapsed === world.elapsed);
  if ((!climateBootstrap && (live.activatedAt !== cp.activatedAt || live.activatedAction !== cp.activatedAction))
    || live.activatedAt < cp.activatedAt || live.activatedAction < cp.activatedAction
    || (!ecologyBootstrap && !equal(live.ecology, cp.ecology))
    || live.ecology!.activatedAt < cp.ecology!.activatedAt || live.ecology!.activatedAction < cp.ecology!.activatedAction) return false;
  let activeTime = 0;
  for (const prior of old.worlds) {
    const world = now.worlds.find(item => item.id === prior.id); if (!world || world.elapsed < prior.elapsed || !equal(world.designs, prior.designs)) return false;
    const before = prior.biosphere, after = world.biosphere, dt = world.elapsed - prior.elapsed; activeTime += dt;
    if (!equal(before.initial, after.initial) || !climateBootstrap && before.activatedElapsed !== after.activatedElapsed
      || after.activatedElapsed < before.activatedElapsed || !ecologyBootstrap && before.ecologyElapsed !== after.ecologyElapsed
      || after.ecologyElapsed! < before.ecologyElapsed!) return false;
    if (workKeys.some(key => after.work[key] < before.work[key]) || totalClimateWork(world) - totalClimateWork(prior) > CLIMATE_RATE * dt + 1e-7
      || Math.abs(after.work.temperatureDrift - before.work.temperatureDrift) > ECOLOGY_DRIFT_RATE * dt + 1e-7
      || Math.abs(after.work.atmosphereDrift - before.work.atmosphereDrift) > ECOLOGY_DRIFT_RATE * dt + 1e-7
      || after.stableFor.some((time, index) => time > before.stableFor[index] + dt + 1e-7)) return false;
  }
  const newWorlds = now.worlds.filter(world => !old.worlds.some(prior => prior.id === world.id));
  activeTime += newWorlds.reduce((sum, world) => sum + world.elapsed, 0);
  if (activeTime > a.elapsed - b.elapsed + 1e-6) return false;
  for (const prior of cp.origins) {
    const current = live.origins.find(origin => origin.planetId === prior.planetId);
    if (!current || prior.births.some((count, role) => current.births[role] < count)
      || prior.deaths.some((count, role) => current.deaths[role] < count)
      || prior.founderDeaths.some(serial => !current.founderDeaths.includes(serial))) return false;
  }
  if (!old.actions.every(row => {
    const current = now.actions.find(candidate => candidate.serial === row.serial);
    return current ? equal(current, row) : row.serial < now.nextAction - now.actions.length;
  })) return false;
  const since = now.actions.filter(row => row.serial >= old.nextAction), complete = since.length === now.nextAction - old.nextAction;
  if (since.some(row => row.at < b.elapsed || (row.kind === 'birth' || row.kind === 'death') && row.at <= b.elapsed)) return false;
  if (since.some(row => (row.kind === 'birth' || row.kind === 'death')
    && now.worlds.find(world => world.id === row.planetId)!.elapsed <= (old.worlds.find(world => world.id === row.planetId)?.elapsed ?? 0))) return false;
  if (activeTime === 0 && live.origins.some(origin => {
    const prior = cp.origins.find(item => item.planetId === origin.planetId);
    return origin.births.some((count, role) => count !== (prior?.births[role] ?? 0)) || origin.deaths.some((count, role) => count !== (prior?.deaths[role] ?? 0));
  })) return false;
  const oldLife = [...old.cargo, ...old.worlds.flatMap(world => world.life)], newLife = [...now.cargo, ...now.worlds.flatMap(world => world.life)];
  const oldPlaces = lifeLocations(old), newPlaces = lifeLocations(now);
  for (const item of newLife) if (!oldLife.some(prior => prior.id === item.id)) {
    const identity = lifeIdentity(now, item.id)!, priorOrigin = cp.origins.find(origin => origin.planetId === identity.origin.planetId);
    if (priorOrigin && !identity.founder && identity.serial <= priorOrigin.births[identity.role]) return false;
  }
  for (const origin of cp.origins) for (let role = 0; role < 6; role++) {
    const missing = oldLife.filter(item => { const identity = lifeIdentity(old, item.id)!;
      return identity.origin.planetId === origin.planetId && identity.role === role && !newLife.some(current => current.id === item.id); }).length;
    if (missing > live.origins.find(current => current.planetId === origin.planetId)!.deaths[role] - origin.deaths[role]) return false;
  }
  for (const prior of oldLife) {
    const current = newLife.find(item => item.id === prior.id); if (!current) continue;
    if (prior.originPlanetId !== current.originPlanetId || prior.taxonKey !== current.taxonKey || !equal(prior.habitat.birth, current.habitat.birth)) return false;
    const place = oldPlaces.get(prior.id)!, nextPlace = newPlaces.get(prior.id)!;
    if (live.paidTransfers === cp.paidTransfers && (!equal(place, nextPlace) || !equal(prior.pos, current.pos) || prior.heading !== current.heading)) return false;
    const visited = new Set([place.planetId, nextPlace.planetId, ...since.filter(row => row.lifeId === prior.id).map(row => row.planetId)]);
    const couldLive = [...visited].some(id => id !== 'cargo' && (now.worlds.find(world => world.id === id)?.elapsed ?? 0)
      > (old.worlds.find(world => world.id === id)?.elapsed ?? 0));
    if ((activeTime === 0 || complete && !couldLive)
      && (prior.health !== current.health || prior.nutrition !== current.nutrition || prior.habitat.reproduction !== current.habitat.reproduction || prior.habitat.sinceHunt !== current.habitat.sinceHunt)) return false;
  }
  const refs = scanReferences(now);
  if (!old.scans.every(scan => {
    const current = now.scans.find(item => item.lifeId === scan.lifeId);
    return current ? equal(current, scan) : !lifeIdentity(now, scan.lifeId)?.founder && !refs.has(scan.lifeId);
  })) return false;
  // Even a rolled suffix cannot spend counters already closed in the CP.
  const rewound = rewindEcology(now, lifeAction => shipCapabilities(a, { lifeAction })?.cargo ?? 0, since); if (!rewound) return false;
  if (rewound.scans < cp.paidScans || rewound.transfers < cp.paidTransfers) return false;
  let missingActions = rewound.scans - cp.paidScans + rewound.transfers - cp.paidTransfers;
  for (const origin of live.origins) {
    const prior = cp.origins.find(item => item.planetId === origin.planetId), counts = rewound.counts.get(origin.planetId)!;
    for (const key of ['births', 'deaths'] as const) for (let role = 0; role < 6; role++) {
      const difference = counts[key][role] - (prior?.[key][role] ?? 0); if (difference < 0) return false;
      missingActions += difference;
    }
  }
  if (missingActions !== now.nextAction - old.nextAction - since.length) return false;
  let minimumTransfers = 0;
  for (const [id, place] of oldPlaces) {
    const current = rewound.where.get(id); if (!current) continue;
    if (place.planetId !== current.planetId) minimumTransfers += place.planetId === 'cargo' || current.planetId === 'cargo' ? 1 : 2;
    else if (current.band !== null && current.band !== place.band) minimumTransfers += 2;
  }
  if (minimumTransfers > rewound.transfers - cp.paidTransfers) return false;
  if (complete) {
    if (!scanOrderValid(since, old.scans.map(scan => scan.lifeId))) return false;
    const expected = new Map([...oldPlaces, ...initialLocations(now, newWorlds)]);
    if (!sameLocations(rewound.where, expected) || rewound.scans !== cp.paidScans || rewound.transfers !== cp.paidTransfers) return false;
    for (const origin of live.origins) {
      const prior = cp.origins.find(item => item.planetId === origin.planetId), counts = rewound.counts.get(origin.planetId)!;
      if (!equal(counts.births, prior?.births ?? [0, 0, 0, 0, 0, 0]) || !equal(counts.deaths, prior?.deaths ?? [0, 0, 0, 0, 0, 0])) return false;
    }
    for (const scan of now.scans.filter(item => !old.scans.some(prior => prior.lifeId === item.lifeId))) {
      const first = since.find(row => row.kind === 'scan' && row.lifeId === scan.lifeId);
      if (!first || first.at !== scan.at || first.planetId !== scan.planetId) return false;
    }
  }
  return true;
}
