import type { GameState } from './types';
import type { HabitatBand, LivingExpedition, LivingPlanet, LivingSpecimen, LivingAction } from './space-biosphere-types';
import { LIFE_PROFILES, foreignGround, spaceLifeSpecies } from './space-life';
import { ecologyTaxon } from './ecology-catalog';
import { climaticTier } from './space-climate';
import { FOREIGN_FOOD, stepForeignFood } from './space-food';
import { clamp } from './random';

export const ECOLOGY_STABLE_SECONDS = 10;
export const ECOLOGY_DRIFT_RATE = .0004;
export const roleOf = (life: Pick<LivingSpecimen, 'taxonKey'>) => LIFE_PROFILES.findIndex(profile => profile.key === life.taxonKey);
export const isEcological = (e: LivingExpedition) => e.biosphere.version === 2;

/** Explicit opt-in; never simulate, heal, replace a model or move a specimen. */
export function activateForeignEcology(e: LivingExpedition, elapsed: number): void {
  if (isEcological(e)) return;
  e.biosphere.version = 2;
  e.biosphere.ecology = { activatedAt: elapsed, activatedAction: e.nextAction };
  for (const world of e.worlds) world.biosphere.ecologyElapsed = world.elapsed;
}
export function enableForeignEcology(s: GameState): void {
  const enable = (state: GameState) => {
    const e = state.space?.expedition;
    if (e?.version !== 2 || isEcological(e)) return false;
    activateForeignEcology(e, state.space!.elapsed); return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}

/** Founder knowledge is permanent. Dead descendant scans are bounded by the
 * live population and receipt window; payment counters never decrease. */
export function pruneForeignScans(e: LivingExpedition): void {
  if (!isEcological(e)) return;
  const retained = new Set([...e.cargo, ...e.worlds.flatMap(world => world.life)].map(life => life.id));
  for (const action of e.actions) { retained.add(action.lifeId); if (action.kind === 'birth') retained.add(action.parentId); }
  e.scans = e.scans.filter(scan => /:life-[1-9]\d*$/.test(scan.lifeId) || retained.has(scan.lifeId));
}
export function recordLifeAction(e: LivingExpedition, row: Omit<Extract<LivingAction, { kind: 'birth' }>, 'serial'> | Omit<Extract<LivingAction, { kind: 'death' }>, 'serial'>): void {
  e.actions.push({ ...row, serial: e.nextAction++ } as LivingAction);
  if (e.actions.length > 128) e.actions.shift();
  pruneForeignScans(e);
}

export function bandCondition(e: LivingExpedition, world: LivingPlanet, band: HabitatBand) {
  const life = world.life.filter(item => item.habitat.band === band && item.health > 0);
  const counts = LIFE_PROFILES.map(profile => life.filter(item => item.taxonKey === profile.key).length);
  const healthy = life.filter(item => item.health >= 40 && item.nutrition >= .2);
  const hasRoles = LIFE_PROFILES.every(profile => healthy.some(item => item.taxonKey === profile.key));
  const fed = healthy.filter(item => roleOf(item) >= 3).every(item => {
    const diet = spaceLifeSpecies(e, item)?.diet ?? [];
    return roleOf(item) === 5
      ? item.habitat.sinceHunt < 20 && diet.includes('meat') && healthy.some(prey => [3, 4].includes(roleOf(prey)))
      : healthy.some(plant => roleOf(plant) < 3 && plant.nutrition > .1 && diet.includes(ecologyTaxon(plant.taxonKey)!.food));
  });
  const supported = climaticTier(world) >= band;
  const viable = supported && hasRoles && fed;
  const reason = !supported ? 'Nevhodné klima' : !counts.every(Boolean) ? 'Chybí ekologická role'
    : !hasRoles ? 'Slabé zdraví nebo výživa' : !fed ? 'Chybí potrava nebo skutečný lov'
      : world.biosphere.stableFor[band - 1] < ECOLOGY_STABLE_SECONDS ? 'Ekosystém se ustaluje' : 'Stabilní';
  return { counts, viable, reason, stable: viable && world.biosphere.stableFor[band - 1] >= ECOLOGY_STABLE_SECONDS };
}
export function stableBandCapacity(e: LivingExpedition, world: LivingPlanet): number {
  let capacity = 0;
  for (const band of [1, 2, 3] as HabitatBand[]) { if (!bandCondition(e, world, band).stable) break; capacity++; }
  return capacity;
}

/** One serial transaction per active surface frame. Candidates are rechecked
 * after each birth, so simultaneous parents cannot exceed either population cap. */
export function stepForeignEcology(e: LivingExpedition, world: LivingPlanet, elapsed: number, duration: number, climateAnchored = false): void {
  if (!isEcological(e) || !Number.isFinite(duration) || duration <= 0) return;
  const dt = Math.min(duration, 1 / 30), outcome = stepForeignFood(e, world, dt);
  for (const { life, cause } of outcome.deaths) {
    const index = world.life.indexOf(life); if (index < 0) continue;
    const origin = e.biosphere.origins.find(entry => entry.planetId === life.originPlanetId)!;
    origin.deaths[roleOf(life)]++;
    if (!life.habitat.birth) origin.founderDeaths.push(Number(life.id.split(':life-').at(-1)));
    world.life.splice(index, 1);
    recordLifeAction(e, { kind: 'death', at: elapsed, planetId: world.id, lifeId: life.id, energyPaid: 0, cause, band: life.habitat.band });
  }
  for (const parent of outcome.parents) {
    const role = roleOf(parent), period = role < 3 ? FOREIGN_FOOD.plantBirthSeconds : FOREIGN_FOOD.animalBirthSeconds;
    if (!world.life.includes(parent) || parent.health < 75 || parent.nutrition < .7 || parent.habitat.reproduction < period
      || parent.habitat.band > climaticTier(world) || world.life.length >= 96
      || world.life.filter(item => item.taxonKey === parent.taxonKey && item.habitat.band === parent.habitat.band).length >= FOREIGN_FOOD.targetPerRole
      || role === 5 && parent.habitat.sinceHunt >= 20) continue;
    const origin = e.biosphere.origins.find(entry => entry.planetId === parent.originPlanetId)!;
    const serial = ++origin.births[role], angle = serial * 2.39996 + role;
    const x = clamp(parent.pos.x + Math.cos(angle) * 2.5, -79, 79), z = clamp(parent.pos.z + Math.sin(angle) * 2.5, -79, 79);
    const child: LivingSpecimen = { id: `${parent.originPlanetId}:born-${role}-${serial}`, originPlanetId: parent.originPlanetId,
      taxonKey: parent.taxonKey, pos: { x, y: foreignGround(world.seed, x, z), z }, heading: parent.heading, health: 70, nutrition: .45,
      habitat: { band: parent.habitat.band, reproduction: 0, sinceHunt: 120, birth: { parentId: parent.id, planetId: world.id, at: elapsed } } };
    parent.nutrition -= .2; parent.health -= 5; parent.habitat.reproduction = 0;
    world.life.push(child);
    recordLifeAction(e, { kind: 'birth', at: elapsed, planetId: world.id, lifeId: child.id, energyPaid: 0, parentId: parent.id, band: child.habitat.band });
  }
  for (const band of [1, 2, 3] as HabitatBand[]) world.biosphere.stableFor[band - 1] = bandCondition(e, world, band).viable
    ? Math.min(ECOLOGY_STABLE_SECONDS, world.biosphere.stableFor[band - 1] + dt) : 0;
  if (!climateAnchored && !world.biosphere.stableFor.some(time => time >= ECOLOGY_STABLE_SECONDS)) {
    for (const axis of ['temperature', 'atmosphere'] as const) {
      const change = clamp(world.biosphere.initial[axis] - world[axis], -ECOLOGY_DRIFT_RATE * dt, ECOLOGY_DRIFT_RATE * dt);
      world[axis] += change; world.biosphere.work[axis === 'temperature' ? 'temperatureDrift' : 'atmosphereDrift'] += change;
    }
    // A boundary crossed by this frame's drift immediately invalidates stability.
    for (const band of [1, 2, 3] as HabitatBand[]) if (!bandCondition(e, world, band).viable) world.biosphere.stableFor[band - 1] = 0;
  }
}

/** Immediate transfers can invalidate a stable band before the next frame. */
export function refreshForeignStability(e: LivingExpedition, world: LivingPlanet): void {
  if (!isEcological(e)) return;
  for (const band of [1, 2, 3] as HabitatBand[]) if (!bandCondition(e, world, band).viable) world.biosphere.stableFor[band - 1] = 0;
}
