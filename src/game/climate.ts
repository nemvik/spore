import type { GameState, Vec3 } from './types';
import type { EcologySite } from './journey-types';
import { clamp } from './random';
import { speciesById } from './content';

/** Learned history is permanent; the water it supports is alive in the world. */
export function livingRootStrength(state: GameState, site: EcologySite): number {
  if (site.plantedId === null || !state.world.resources.some(r => r.id === site.plantedId && r.kind !== 'meat')) return 0;
  return clamp(site.vitality / 100, 0, 1);
}

export function landSiteSupport(state: GameState, site: EcologySite): number {
  if (state.world.stage !== 2 || site.stage !== 2 || site.patch > 1) return 0;
  if (state.journey.legacy || state.campaign.won) return clamp((state.world.landmarks.find(l => l.id === `spring-${site.patch}`)?.charge ?? 0) / 10, 0, 1);
  if (!site.resolved) return 0;
  const roots = livingRootStrength(state, site);
  if (site.method !== 'hunt') return roots;
  // Selective hunting releases the surviving mother roots. Newly arriving or
  // born invaders count too; food can draw them away or satisfy their appetite.
  const nativeRemains = state.world.creatures.some(c => c.patch === site.patch && speciesById(c.species).role === 'grazer');
  const pressure = state.world.creatures.some(c => speciesById(c.species).role === 'invasive' && c.hunger > 28 && Math.hypot(c.pos.x - site.source.x, c.pos.z - site.source.z) < 12);
  return Math.max(roots, nativeRemains && !pressure ? 1 : 0);
}

export function livingLandNetwork(state: GameState): boolean {
  const roots = state.journey.sites.filter(site => site.stage === 2 && site.patch < 2);
  return roots.length === 2 && roots.every(site => site.resolved && landSiteSupport(state, site) > 0);
}

/** Derived environmental state shared by landscape rendering and survival rules. */
export interface ClimateView {
  drought: number;
  shorelineZ: number;
  springs: { id: string; x: number; z: number; water: number; protected: boolean; support?: number }[];
  patchStress: number[];
  sanctuary: { x: number; z: number; radius: number; active: boolean } | null;
  resolved: boolean;
  /** Living water at the chosen root location; absent in legacy/aquatic worlds. */
  rootPockets?: { id: string; site: number; x: number; z: number; water: number; radius: number; dispersed?: boolean }[];
}

/** Pure projection; legacy and completed campaigns retain their earned climate. */
export function getClimate(state: GameState): ClimateView {
  if (state.world.stage !== 2) {
    return { drought: 0, shorelineZ: 54, springs: [], patchStress: state.world.patches.map(() => 0), sanctuary: null, resolved: state.campaign.won };
  }
  const drought = clamp(state.campaign.drought, 0, 1);
  const planet = state.stage === 5 && state.planet?.version === 2 ? state.planet : null;
  const naturalWater = clamp(1 - drought * 1.5, 0, 1) * 0.6;
  const support = (id: string, charge: number) => {
    if (planet) {
      const biome = Number(id.slice('spring-'.length)) + 1;
      const roots = planet.stabilizers.filter(root => root.biome === biome);
      return roots.length === 2 ? Math.min(...roots.map(root => livingRootStrength(state, root.site))) : 0;
    }
    if (state.journey.legacy || state.campaign.won) return clamp(charge / 10, 0, 1);
    const site = state.journey.sites.find(site => site.stage === 2 && `spring-${site.patch}` === id);
    return site ? landSiteSupport(state, site) : 0;
  };
  const springs = state.world.landmarks.filter((landmark) => landmark.kind === 'spring').map((spring) => {
    const restoration = support(spring.id, spring.charge);
    return { id: spring.id, x: spring.pos.x, z: spring.pos.z, water: Math.max(naturalWater, restoration), protected: restoration >= 1, support: restoration };
  });
  const predatorRecovery = !planet && state.campaign.won && state.campaign.finale === 'predator' ? 0.45 : 1;
  const patchStress = state.world.patches.map((patch) => {
    const spring = state.world.landmarks.find((landmark) => landmark.id === `spring-${patch.id}` && landmark.kind === 'spring');
    const restoration = spring ? support(spring.id, spring.charge) : 0;
    return drought * (1 - restoration * 0.92) * predatorRecovery;
  });
  const gate = state.world.landmarks.find((landmark) => landmark.kind === 'gate');
  const sanctuary = state.campaign.won && state.campaign.finale === 'migration' && gate
    ? { x: gate.pos.x, z: gate.pos.z, radius: 12, active: true }
    : null;
  const rootPockets: NonNullable<ClimateView['rootPockets']> = [];
  if (!state.journey.legacy) for (const site of state.journey.sites) {
    if (site.stage !== 2 || site.plantedId === null) continue;
    const plant = state.world.resources.find(resource => resource.id === site.plantedId && resource.kind !== 'meat');
    if (!plant) continue;
    // Food amount and historical achievement are independent of living roots.
    // A grazed but surviving plant still holds water; destroyed roots do not.
    const water = clamp(site.vitality / 100, 0, 1);
    rootPockets.push({ id: `roots-${site.id}`, site: site.id, x: plant.pos.x, z: plant.pos.z, water, radius: water > 0 ? 1.5 + 5 * water : 0 });
  }
  rootPockets.sort((a, b) => a.site - b.site);
  if (!state.journey.legacy) for (const root of state.journey.rootDispersal?.roots ?? []) {
    const resource = state.world.resources.find(r => r.id === root.resourceId);
    if (!resource || root.vitality <= 0) continue;
    const water = clamp(root.vitality / 100, 0, 1);
    rootPockets.push({ id: `rootlet-${root.resourceId}`, site: root.site, x: resource.pos.x, z: resource.pos.z, water, radius: 1.5 + 5 * water, dispersed: true });
  }
  return { drought, shorelineZ: 54 + 22 * drought, springs, patchStress, sanctuary, resolved: state.campaign.won, ...(rootPockets.length ? { rootPockets } : {}) };
}

/** Hydration per second, using the same wet areas the renderer draws; never additive. */
export function hydrationAt(state: GameState, position: Vec3): number {
  // Microscopic and reef organisms are immersed. Land uses horizontal wet-area geometry.
  if (state.world.stage !== 2) return 9;
  const climate = getClimate(state);
  if (position.z >= climate.shorelineZ) return 9;
  if (climate.sanctuary?.active && Math.hypot(position.x - climate.sanctuary.x, position.z - climate.sanctuary.z) <= climate.sanctuary.radius) return 9;
  let hydration = 0;
  for (const spring of climate.springs) {
    const radius = 1.5 + 5 * spring.water;
    if (spring.water > 0 && Math.hypot(position.x - spring.x, position.z - spring.z) <= radius) hydration = Math.max(hydration, 9 * spring.water);
  }
  for (const pocket of climate.rootPockets ?? []) {
    if (pocket.water > 0 && Math.hypot(position.x - pocket.x, position.z - pocket.z) <= pocket.radius) hydration = Math.max(hydration, 9 * pocket.water);
  }
  return hydration;
}
