import type { CoreAction, SpaceCore } from './space-core-types';
import { planetSystem, starSystems } from './galaxy';

export const CORE_FRONTIER = 23;
export const CORE_BOUNDARY = 24;
export const CORE_CENTER = 31;
export const CORE_POWER = 'Tichý val';
export const CORE_GIFT = 'Kořen jasu';
export const CORE_ROOT_ENERGY = 30;
export const CORE_ENCOUNTER_POSITION = { x: 9, z: -8 };
export function coreProgress(core: SpaceCore | undefined) {
  return {
    contact: core?.actions.find(a => a.kind === 'contact') ?? null,
    access: core?.actions.find((a): a is Extract<CoreAction, { kind: 'access' }> => a.kind === 'access') ?? null,
    encounter: core?.actions.find(a => a.kind === 'encounter') ?? null,
  };
}
export const coreRoot = (core: SpaceCore | undefined, planetId: string) => core?.actions.find((a): a is Extract<CoreAction, { kind: 'root' }> => a.kind === 'root' && a.planetId === planetId) ?? null;
export const coreEnergySpent = (core: SpaceCore | undefined) => (core?.actions.filter(a => a.kind === 'root').length ?? 0) * CORE_ROOT_ENERGY;
export function coreClimateOffset(core: SpaceCore | undefined, planetId: string) {
  const root = coreRoot(core, planetId);
  return root ? { temperature: -root.before.temperature, atmosphere: -root.before.atmosphere } : undefined;
}
/** Historical queries pass the accepted flight time and travel serial. No
 * current access can retroactively legalise an earlier unauthorised crossing. */
export function coreEntryProblem(core: SpaceCore | undefined, home: string, target: string, at = Infinity, travelAction = Infinity): string {
  const index = planetSystem(home, target)?.index;
  if (!core || index === undefined || index < CORE_BOUNDARY || core.legacyWorlds.length) return '';
  const access = coreProgress(core).access;
  if (access && access.cut.at <= at + 1e-7 && access.cut.travelAction <= travelAction) return '';
  return 'Vnitřní soustavy24–31 střeží Tichý val. Na orbitě Horkého jantaru23 vyjednej průchod s doporučením Kruhu prvních světel nebo překonej jeho hlídku.';
}
/** Finite progress; failed or retreated challenges stay in the existing combat
 * history. No second reward and no generic unbounded mission archive. */
export function appendCoreAction(core: SpaceCore, home: string, action: CoreAction): void {
  const progress = coreProgress(core), stars = starSystems(home);
  const fail = () => { throw new Error('Neplatná návaznost cesty k jádru.'); };
  if (action.serial !== core.nextAction || core.actions.length >= 34) fail();
  if (action.kind === 'contact') {
    if (progress.contact || action.planetId !== stars[CORE_FRONTIER].planetId) fail();
  } else if (action.kind === 'access') {
    if (!progress.contact || progress.access || action.planetId !== stars[CORE_FRONTIER].planetId) fail();
  } else if (action.kind === 'encounter') {
    if (progress.encounter || (!progress.access && !core.legacyWorlds.length) || action.planetId !== stars[CORE_CENTER].planetId) fail();
  } else if (action.kind === 'root') {
    if (!progress.encounter || coreRoot(core, action.planetId) || action.planetId === home || !planetSystem(home, action.planetId) || action.energyPaid !== CORE_ROOT_ENERGY) fail();
  } else fail();
  core.actions.push(structuredClone(action)); core.nextAction++;
}
