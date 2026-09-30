import { starSystems, planetSystem, systemDistance } from './galaxy';
import type { EmpireId, EmpireMissionKind, SpaceEmpire } from './space-empires-types';

export const EMPIRE_IDS: EmpireId[] = ['resin', 'roots', 'basalt'];
export const EMPIRE_PROFILES: Record<EmpireId, { name: string; color: string; mission: EmpireMissionKind; primary: number; description: string; greeting: string }> = {
  resin: { name: 'Pryskyřičný spolek', color: '#e8b657', mission: 'trade', primary: 1,
    description: 'Spojuje dílny zásobovacími cestami. Důvěru získáš skutečným dovozem.',
    greeting: 'Naše pryskyřice drží města pohromadě. Přivez to, co tu neroste, a otevřeme ti lepší cenu.' },
  roots: { name: 'Kořenový sněm', color: '#82d3a0', mission: 'ecology', primary: 4,
    description: 'Chrání potravní řetězce. Zkoumá živé role bez nutnosti organismy odebírat.',
    greeting: 'Nezajímá nás počet vlajek. Ukaž nám, kdo na této planetě živí koho.' },
  basalt: { name: 'Čedičová stráž', color: '#b6abdc', mission: 'survey', primary: 7,
    description: 'Hlídá bezpečné přístupy. Žádá nové osobní mapování sousedního pustého světa.',
    greeting: 'Cizí mapě nevěříme, dokud se její nositel nevrátí. Prozkoumej přístup a přijď podat hlášení.' },
};
/** One allocator for both activation snapshots. Existing colony ownership wins.
 * Even a completely settled old galaxy can host a non-sovereign embassy. */
export function allocateEmpires(homePlanetId: string, protectedColonies: string[]): SpaceEmpire[] {
  const systems = starSystems(homePlanetId), living = systems.filter(system => system.living), used = new Set<string>();
  return EMPIRE_IDS.map(id => {
    const primary = systems[EMPIRE_PROFILES[id].primary];
    const ordered = living.filter(system => !used.has(system.planetId)).sort((a, b) => systemDistance(primary, a) - systemDistance(primary, b) || a.index - b.index);
    const capital = ordered.find(system => !protectedColonies.includes(system.planetId)) ?? ordered[0];
    used.add(capital.planetId);
    return { id, capitalId: capital.planetId, enclave: protectedColonies.includes(capital.planetId), contact: null, mission: null, treaty: null };
  });
}
export function empireSurveyTarget(homePlanetId: string, empire: SpaceEmpire): string {
  const capital = planetSystem(homePlanetId, empire.capitalId)!;
  return starSystems(homePlanetId).filter(system => system.index && !system.living)
    .sort((a, b) => systemDistance(capital, a) - systemDistance(capital, b) || a.index - b.index)[0].planetId;
}
