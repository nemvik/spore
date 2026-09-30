import { coreRoot } from './space-core-content';
import { stepForeignEcology } from './space-ecology';
import type { SpaceExpeditionV1 as LegacyExpedition, ForeignPlanet, SpaceLife } from './space-expedition-types';
import type { HabitatBand, LifeHabitat, LivingExpedition, LivingPlanet, OriginDemography } from './space-biosphere-types';
import { LIFE_PROFILES } from './space-life';
import { newClimateWork } from './space-climate';
import { planetSystem } from './galaxy';
import type { GameState } from './types';
import { applyClimateTool, climateAtLimit, CLIMATE_TOOL_NAMES, type ClimateTool } from './space-climate';
import { clamp } from './random';

export const LIFE_ROLES = LIFE_PROFILES.map(profile => profile.role);
const sixZeros = (): OriginDemography['births'] => [0, 0, 0, 0, 0, 0];
export const newLifeHabitat = (band: HabitatBand): LifeHabitat => ({ band, reproduction: 0, sinceHunt: 120, birth: null });
export const founderBand = (specimen: SpaceLife): HabitatBand => (1 + Math.floor((Number(specimen.id.split(':life-').at(-1)) - 1) / 6) % 3) as HabitatBand;

/** Adds habitat metadata in place without moving, healing or replacing an organism. */
export function activatePlanetBiosphere(world: ForeignPlanet): LivingPlanet {
  if ('biosphere' in world) return world as LivingPlanet;
  for (const specimen of world.life) {
    Object.assign(specimen, { habitat: newLifeHabitat(founderBand(specimen)) });
  }
  return Object.assign(world, { biosphere: {
    initial: { temperature: world.temperature, atmosphere: world.atmosphere },
    activatedElapsed: world.elapsed,
    work: newClimateWork(), stableFor: [0, 0, 0] as [number, number, number],
  } }) as LivingPlanet;
}
export function newOriginDemography(planetId: string): OriginDemography {
  return { planetId, births: sixZeros(), deaths: sixZeros(), founderDeaths: [] };
}
/** Explicit upgrade only. A parser must not call this or manufacture past ecology. */
export function activateBiosphere(expedition: LegacyExpedition | LivingExpedition, homePlanetId: string, elapsed: number): LivingExpedition {
  if (expedition.version === 2) return expedition;
  const actions = expedition.nextAction - 1, spent = expedition.energySpent;
  for (const world of expedition.worlds) activatePlanetBiosphere(world);
  for (const specimen of expedition.cargo) Object.assign(specimen, { habitat: newLifeHabitat(founderBand(specimen)) });
  return Object.assign(expedition, { version: 2 as const, biosphere: {
    version: 1 as const, activatedAt: elapsed, activatedAction: expedition.nextAction, tool: 'off' as const, toolPlanetId: null,
    paidScans: 2 * actions - spent, paidTransfers: spent - actions,
    origins: expedition.worlds.filter(world => planetSystem(homePlanetId, world.id)?.living).map(world => newOriginDemography(world.id)),
  } }) as unknown as LivingExpedition;
}
export function roleIndex(specimen: Pick<SpaceLife, 'taxonKey'>): number {
  return LIFE_PROFILES.findIndex(profile => profile.key === specimen.taxonKey);
}

export function enableBiosphere(s: GameState): void {
  const enable = (state: GameState) => {
    if (!state.space?.expedition || state.space.expedition.version === 2) return false;
    state.space.expedition = activateBiosphere(state.space.expedition, state.space.homePlanetId, state.space.elapsed); return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
export const livingExpedition = (s: GameState) => s.space?.expedition?.version === 2 ? s.space.expedition : null;
export const livingPlanet = (s: GameState) => s.space?.location?.scale === 'surface'
  ? livingExpedition(s)?.worlds.find(world => world.id === s.space!.location!.planetId) ?? null : null;
export function climateToolQuote(s: GameState, tool: ClimateTool) {
  const e = livingExpedition(s), world = livingPlanet(s), p = s.space;
  const reason = !Object.hasOwn(CLIMATE_TOOL_NAMES, tool) ? 'Neznámý klimatický nástroj.' : !e ? 'Nejprve otevři lodní výpravu.'
    : tool === 'off' ? '' : !world || !p?.ship || p.leg ? 'Klimatické nástroje použij nad cizím povrchem po dokončení letu.'
      : p.ship.health <= 0 || s.deathReason || s.player.health <= 0 ? 'Loď nemůže použít nástroj.'
        : coreRoot(p.core, world.id) ? 'Kořen jasu drží klima trvale v obyvatelném středu. Další klimatický zásah není potřeba.'
        : p.ship.energy <= 0 ? 'Zastav motory a nech loď dobít.' : climateAtLimit(world, tool) ? 'Tato osa už dosáhla meze.' : '';
  return { ok: !reason, reason };
}
export function stopClimateTool(s: GameState): void {
  const e = livingExpedition(s); if (!e) return;
  e.biosphere.tool = 'off'; e.biosphere.toolPlanetId = null;
}
export function setClimateTool(s: GameState, tool: ClimateTool): boolean {
  const q = climateToolQuote(s, tool), p = s.space; if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const e = livingExpedition(s)!;
  e.biosphere.tool = tool; e.biosphere.toolPlanetId = tool === 'off' ? null : livingPlanet(s)!.id;
  p.notice = tool === 'off' ? 'Klimatické nástroje vypnuté.' : `${CLIMATE_TOOL_NAMES[tool]} · 2 energie za sekundu účinného zásahu.`;
  return true;
}
export function stepPlanetBiosphere(s: GameState, dt: number): void {
  const e = livingExpedition(s), p = s.space, world = livingPlanet(s);
  if (!e || !p?.ship) return;
  if (!world || p.leg) { stopClimateTool(s); return; }
  if (s.deathReason || s.player.health <= 0 || p.ship.health <= 0) return;
  if (e.biosphere.tool !== 'off') {
    if (e.biosphere.toolPlanetId !== world.id) stopClimateTool(s);
    else {
      const tool = e.biosphere.tool;
      const paid = applyClimateTool(world, world.biosphere.work, tool, p.ship.energy, dt);
      p.ship.energy = clamp(p.ship.energy - paid, 0, Number.MAX_VALUE);
      if (p.ship.energy <= 1e-10 || climateAtLimit(world, tool)) {
        stopClimateTool(s);
        p.notice = p.ship.energy <= 1e-10 ? 'Klimatický nástroj se vypnul: energie je vyčerpaná.' : 'Klimatický nástroj se vypnul na mezi osy.';
      }
    }
  }
  stepForeignEcology(e, world, p.elapsed, dt, !!coreRoot(p.core, world.id));
}
export function bandPopulation(world: LivingPlanet, band: HabitatBand): number[] {
  return LIFE_PROFILES.map(profile => world.life.filter(life => life.habitat.band === band && life.taxonKey === profile.key && life.health > 0).length);
}
