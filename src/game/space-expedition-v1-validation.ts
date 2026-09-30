import type { SpaceState as AllSpaceState } from './space-types';
import type { SpaceExpeditionV1 as SpaceExpedition, SpaceLife } from './space-expedition-types';
import { GALAXY_SYSTEMS, planetSystem } from './galaxy';
import { validateNpcDesigns } from './npc-genome';
import { LIFE_PROFILES, foreignGround } from './space-life';
import { shipStats } from './ship-design';

type SpaceState = Omit<AllSpaceState, 'expedition'> & { expedition?: SpaceExpedition };

const costs = { scan: 1, collect: 2, release: 2 } as const;
function fail(): never { throw new Error('Neplatná uložená mezihvězdná výprava.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function num(v: unknown, min: number, max: number, integer = false) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
export function validateExpedition(p: SpaceState): void {
  if (!Object.hasOwn(p, 'expedition')) return;
  const e = p.expedition!; object(e, ['version', 'generator', 'worlds', 'cargo', 'scans', 'actions', 'nextAction', 'energySpent']);
  if (e.version !== 1 || e.generator !== 1 || !Array.isArray(e.worlds) || e.worlds.length > GALAXY_SYSTEMS - 1
    || !Array.isArray(e.cargo) || e.cargo.length > (p.ship ? shipStats(p.ship.creation.blueprint).cargo : 0)
    || !Array.isArray(e.scans) || e.scans.length > 36 * (GALAXY_SYSTEMS - 1) || !Array.isArray(e.actions)) fail();
  num(e.nextAction, 1, Number.MAX_SAFE_INTEGER, true);
  num(e.energySpent, 0, 1e12, true);
  if (e.actions.length !== Math.min(128, e.nextAction - 1)) fail();
  if (!p.ship && (e.worlds.length || e.cargo.length || e.scans.length || e.actions.length || e.nextAction !== 1 || e.energySpent)) fail();
  const worlds = new Set<string>(), life = new Map<string, SpaceLife>();
  for (const world of e.worlds) {
    object(world, ['id', 'systemId', 'generator', 'seed', 'temperature', 'atmosphere', 'elapsed', 'designs', 'life']);
    const address = planetSystem(p.homePlanetId, world.id);
    if (!address || !address.index || world.systemId !== address.id || world.generator !== 1 || world.seed !== address.seed || worlds.has(world.id)) fail();
    worlds.add(world.id); num(world.temperature, -1, 1); num(world.atmosphere, -1, 1); num(world.elapsed, 0, p.elapsed);
    validateNpcDesigns(world.designs);
    if (!Array.isArray(world.life) || world.life.length > 96) fail();
  }
  function specimen(item: SpaceLife, resident?: { seed: number }) {
    object(item, ['id', 'originPlanetId', 'taxonKey', 'pos', 'heading', 'health', 'nutrition']);
    const origin = planetSystem(p.homePlanetId, item.originPlanetId);
    if (!origin?.living || !worlds.has(item.originPlanetId) || typeof item.id !== 'string' || !item.id.startsWith(`${item.originPlanetId}:life-`) || life.has(item.id)) fail();
    const serial = Number(item.id.slice(`${item.originPlanetId}:life-`.length)); num(serial, 1, 36, true);
    if (item.id !== `${item.originPlanetId}:life-${serial}` || item.taxonKey !== LIFE_PROFILES[(serial - 1) % 6].key) fail();
    object(item.pos, ['x', 'y', 'z']); num(item.pos.x, -80, 80); num(item.pos.z, -80, 80); num(item.pos.y, -.35, .35);
    if (resident && Math.abs(item.pos.y - foreignGround(resident.seed, item.pos.x, item.pos.z)) > 1e-8) fail();
    num(item.heading, -Math.PI, Math.PI); num(item.health, .000001, 100); num(item.nutrition, 0, 1); life.set(item.id, item);
  }
  for (const world of e.worlds) for (const item of world.life) specimen(item, world);
  for (const item of e.cargo) specimen(item);
  // C2 only transports the generated residents: no silent copies or losses.
  for (const world of e.worlds) if (planetSystem(p.homePlanetId, world.id)!.living) {
    for (let serial = 1; serial <= 36; serial++) if (!life.has(`${world.id}:life-${serial}`)) fail();
  }
  const scans = new Set<string>();
  for (const scan of e.scans) {
    object(scan, ['lifeId', 'planetId', 'at']); num(scan.at, 0, p.elapsed);
    if (!life.has(scan.lifeId) || !worlds.has(scan.planetId) || scans.has(scan.lifeId)) fail(); scans.add(scan.lifeId);
  }
  for (const item of e.cargo) if (!scans.has(item.id)) fail();
  let lastTime = 0;
  for (const [index, action] of e.actions.entries()) {
    object(action, ['serial', 'at', 'kind', 'planetId', 'lifeId', 'energyPaid']);
    num(action.serial, 1, e.nextAction - 1, true); num(action.at, lastTime, p.elapsed); lastTime = action.at;
    if (action.serial !== e.nextAction - e.actions.length + index || !['scan', 'collect', 'release'].includes(action.kind)
      || action.energyPaid !== costs[action.kind] || !worlds.has(action.planetId) || !life.has(action.lifeId) || !scans.has(action.lifeId)) fail();
    if (e.scans.find(scan => scan.lifeId === action.lifeId)!.at > action.at) fail();
  }
  const retainedCost = e.actions.reduce((sum, row) => sum + row.energyPaid, 0);
  const omitted = e.nextAction - 1 - e.actions.length;
  if (e.energySpent < retainedCost + omitted || e.energySpent > retainedCost + omitted * 2) fail();
  // Validate the retained actions even when the save has no checkpoint. Rewind
  // the physical transfers from the real current placement, never from claims.
  const where = new Map<string, string>();
  const population = new Map(e.worlds.map(world => [world.id, world.life.length]));
  for (const world of e.worlds) for (const item of world.life) where.set(item.id, world.id);
  for (const item of e.cargo) where.set(item.id, 'cargo');
  let aboard = e.cargo.length;
  for (const row of [...e.actions].reverse()) {
    if (row.kind === 'collect') {
      if (where.get(row.lifeId) !== 'cargo') fail();
      where.set(row.lifeId, row.planetId); aboard--;
      population.set(row.planetId, population.get(row.planetId)! + 1);
    } else if (row.kind === 'release') {
      if (where.get(row.lifeId) !== row.planetId) fail();
      where.set(row.lifeId, 'cargo'); aboard++;
      population.set(row.planetId, population.get(row.planetId)! - 1);
    } else if (where.get(row.lifeId) !== row.planetId) fail();
    if (aboard < 0 || aboard > (p.ship ? shipStats(p.ship.creation.blueprint).cargo : 0)) fail();
    if ([...population.values()].some(count => count < 0 || count > 96)) fail();
  }
  if (e.nextAction - e.actions.length === 1) {
    if (e.energySpent !== retainedCost) fail();
    for (const item of life.values()) if (where.get(item.id) !== item.originPlanetId) fail();
    const firstScans = new Map<string, { planetId: string; at: number }>();
    for (const row of e.actions) if (row.kind === 'scan' && !firstScans.has(row.lifeId)) firstScans.set(row.lifeId, row);
    if (firstScans.size !== e.scans.length || e.scans.some(scan => {
      const first = firstScans.get(scan.lifeId); return !first || first.planetId !== scan.planetId || first.at !== scan.at;
    })) fail();
  }
  if (p.location?.scale === 'surface' && p.location.planetId !== p.homePlanetId && !worlds.has(p.location.planetId)) fail();
}
function specimens(e: SpaceExpedition) { return [...e.cargo, ...e.worlds.flatMap(world => world.life)]; }
export function expeditionCheckpointMatches(a: SpaceState, b: SpaceState): boolean {
  const current = a.expedition, before = b.expedition;
  if (!current || !before) return !current && !before;
  if (before.nextAction > current.nextAction || before.energySpent > current.energySpent) return false;
  if (!before.worlds.every(old => {
    const now = current.worlds.find(w => w.id === old.id);
    return now && now.elapsed >= old.elapsed && JSON.stringify(now.designs) === JSON.stringify(old.designs);
  })) return false;
  const oldLife = specimens(before), newLife = specimens(current);
  if (!oldLife.every(old => {
    const now = newLife.find(l => l.id === old.id);
    return now && now.originPlanetId === old.originPlanetId && now.taxonKey === old.taxonKey && now.health === old.health && now.nutrition === old.nutrition;
  })) return false;
  if (!before.scans.every(old => current.scans.some(scan => JSON.stringify(scan) === JSON.stringify(old)))) return false;
  const since = current.actions.filter(row => row.serial >= before.nextAction);
  const missing = current.nextAction - before.nextAction - since.length;
  const retainedPaid = since.reduce((sum, row) => sum + row.energyPaid, 0), paid = current.energySpent - before.energySpent;
  if (paid < retainedPaid + missing || paid > retainedPaid + missing * 2) return false;
  if (since.length === current.nextAction - before.nextAction) {
    if (current.energySpent - before.energySpent !== since.reduce((sum, row) => sum + row.energyPaid, 0)) return false;
    const where = new Map<string, string>();
    for (const world of before.worlds) for (const item of world.life) where.set(item.id, world.id);
    for (const item of before.cargo) where.set(item.id, 'cargo');
    // Newly visited source worlds start with their original physical residents.
    for (const item of newLife) if (!where.has(item.id)) where.set(item.id, item.originPlanetId);
    const population = new Map(current.worlds.map(world => [world.id, [...where.values()].filter(id => id === world.id).length]));
    let aboard = [...where.values()].filter(id => id === 'cargo').length;
    const scanned = new Set(before.scans.map(row => row.lifeId));
    for (const row of since) {
      if (row.kind === 'scan') {
        if (where.get(row.lifeId) !== row.planetId) return false;
        scanned.add(row.lifeId);
      } else if (row.kind === 'collect') {
        if (where.get(row.lifeId) !== row.planetId || !scanned.has(row.lifeId)) return false;
        where.set(row.lifeId, 'cargo');
        population.set(row.planetId, population.get(row.planetId)! - 1); aboard++;
      } else {
        if (where.get(row.lifeId) !== 'cargo') return false;
        where.set(row.lifeId, row.planetId);
        population.set(row.planetId, population.get(row.planetId)! + 1); aboard--;
      }
      if (aboard < 0 || aboard > (a.ship ? shipStats(a.ship.creation.blueprint).cargo : 0) || [...population.values()].some(count => count < 0 || count > 96)) return false;
    }
    for (const world of current.worlds) for (const item of world.life) if (where.get(item.id) !== world.id) return false;
    for (const item of current.cargo) if (where.get(item.id) !== 'cargo') return false;
    if (current.scans.some(row => !scanned.has(row.lifeId))) return false;
    for (const scan of current.scans.filter(row => !before.scans.some(old => old.lifeId === row.lifeId))) {
      const first = since.find(row => row.kind === 'scan' && row.lifeId === scan.lifeId);
      if (!first || first.planetId !== scan.planetId || first.at !== scan.at) return false;
    }
  }
  return before.actions.every(row => {
    const now = current.actions.find(action => action.serial === row.serial);
    return now ? JSON.stringify(now) === JSON.stringify(row) : row.serial < current.nextAction - current.actions.length;
  });
}
/** Cumulative receipt also covers >128 paid actions between two clock steps. */
export function expeditionEnergySince(a: SpaceState, b: SpaceState): number | null {
  if (!a.expedition || !b.expedition) return !a.expedition && !b.expedition ? 0 : null;
  const actions = a.expedition.actions.filter(row => row.serial >= b.expedition!.nextAction);
  if (actions.some(row => row.at !== a.elapsed)) return null;
  return a.expedition.energySpent - b.expedition.energySpent;
}
