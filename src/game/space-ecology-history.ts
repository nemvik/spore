import type { LivingAction, LivingExpedition } from './space-biosphere-types';
import { founderBand } from './space-biosphere';

export function lifeIdentity(e: LivingExpedition, id: string) {
  if (typeof id !== 'string') return null;
  const origin = e.biosphere.origins.find(entry => id.startsWith(`${entry.planetId}:`));
  if (!origin) return null;
  const suffix = id.slice(origin.planetId.length + 1);
  const founder = /^life-([1-9]\d*)$/.exec(suffix);
  if (founder) {
    const serial = Number(founder[1]);
    return serial <= 36 ? { origin, role: (serial - 1) % 6, serial, founder: true } : null;
  }
  const child = /^born-([0-5])-([1-9]\d*)$/.exec(suffix);
  if (!child) return null;
  const role = Number(child[1]), serial = Number(child[2]);
  return Number.isSafeInteger(serial) && serial <= origin.births[role] ? { origin, role, serial, founder: false } : null;
}
export interface LifePlace { planetId: string; band: number | null; }
export function lifeLocations(e: LivingExpedition): Map<string, LifePlace> {
  return new Map([...e.worlds.flatMap(world => world.life.map(item => [item.id, { planetId: world.id, band: item.habitat.band }] as const)),
    ...e.cargo.map(item => [item.id, { planetId: 'cargo', band: item.habitat.band }] as const)]);
}
export function scanReferences(e: LivingExpedition): Set<string> {
  const refs = new Set(lifeLocations(e).keys());
  for (const row of e.actions) { refs.add(row.lifeId); if (row.kind === 'birth') refs.add(row.parentId); }
  return refs;
}
const sameBand = (a: number | null, b: number | undefined) => a === null || b === undefined || a === b;

/** Reconstruct retained physical history, including bodies that died. Unknown
 * cargo bands remain unknown until a source collect proves them. */
export function rewindEcology(e: LivingExpedition, cargoLimit: number | ((nextAction: number) => number), rows: LivingAction[] = e.actions) {
  const where = lifeLocations(e);
  const counts = new Map(e.biosphere.origins.map(origin => [origin.planetId, { births: [...origin.births], deaths: [...origin.deaths] }]));
  let scans = e.biosphere.paidScans, transfers = e.biosphere.paidTransfers;
  const validCapacity = (nextAction: number) => {
    const population = new Map<string, number>();
    for (const place of where.values()) population.set(place.planetId, (population.get(place.planetId) ?? 0) + 1);
    return (population.get('cargo') ?? 0) <= (typeof cargoLimit === 'number' ? cargoLimit : cargoLimit(nextAction)) && [...population].every(([planet, amount]) => planet === 'cargo' || amount <= 96);
  };
  for (const row of [...rows].reverse()) {
    if (!validCapacity(row.serial)) return null;
    const identity = lifeIdentity(e, row.lifeId); if (!identity) return null;
    const place = where.get(row.lifeId), band = 'band' in row ? row.band : undefined;
    const demography = counts.get(identity.origin.planetId)!;
    if (row.kind === 'death') {
      if (place || !demography.deaths[identity.role]) return null;
      demography.deaths[identity.role]--;
      where.set(row.lifeId, { planetId: row.planetId, band: row.band });
    } else if (row.kind === 'birth') {
      if (!place || place.planetId !== row.planetId || !sameBand(place.band, row.band) || identity.founder
        || demography.births[identity.role] !== identity.serial) return null;
      const parent = where.get(row.parentId), parentIdentity = lifeIdentity(e, row.parentId);
      if (!parent || parent.planetId !== row.planetId || !sameBand(parent.band, row.band) || !parentIdentity
        || parentIdentity.origin.planetId !== identity.origin.planetId || parentIdentity.role !== identity.role
        || !parentIdentity.founder && parentIdentity.serial >= identity.serial) return null;
      where.delete(row.lifeId); demography.births[identity.role]--;
      const siblings = [...where].filter(([id, item]) => item.planetId === row.planetId && item.band === row.band
        && lifeIdentity(e, id)?.role === identity.role).length;
      if (siblings >= 3) return null;
    } else if (row.kind === 'collect') {
      if (!place || place.planetId !== 'cargo' || !sameBand(place.band, band)) return null;
      where.set(row.lifeId, { planetId: row.planetId, band: band ?? null }); transfers--;
    } else if (row.kind === 'release') {
      if (!place || place.planetId !== row.planetId || !sameBand(place.band, band)) return null;
      where.set(row.lifeId, { planetId: 'cargo', band: null }); transfers--;
    } else { if (!place || place.planetId !== row.planetId) return null; scans--; }
    if (scans < 0 || transfers < 0 || !validCapacity(row.serial)) return null;
  }
  return { where, counts, scans, transfers };
}
export function initialLocations(e: LivingExpedition, worlds = e.worlds) {
  const result = new Map<string, LifePlace>();
  for (const world of worlds) if (e.biosphere.origins.some(origin => origin.planetId === world.id)) for (let serial = 1; serial <= 36; serial++) {
    const id = `${world.id}:life-${serial}`;
    result.set(id, { planetId: world.id, band: founderBand({ id } as Parameters<typeof founderBand>[0]) });
  }
  return result;
}
export function sameLocations(actual: Map<string, LifePlace>, expected: Map<string, LifePlace>): boolean {
  return actual.size === expected.size && [...expected].every(([id, place]) => {
    const current = actual.get(id); return current?.planetId === place.planetId && (current.band === null || place.band === null || current.band === place.band);
  });
}

/** Timestamp equality is not action equality: scan must precede collection. */
export function scanOrderValid(rows: LivingAction[], initial: Iterable<string>): boolean {
  const known = new Set(initial);
  for (const row of rows) {
    if (row.kind === 'scan') known.add(row.lifeId);
    else if (row.kind === 'collect' && !known.has(row.lifeId)) return false;
  }
  return true;
}
