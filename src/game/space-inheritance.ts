import type { GameState } from './types';
import { creatureInheritance, tribeInheritance } from './lineage-history';
import { civilizationInheritance, type CivicMethod } from './civilization';
import type { EmpireId } from './space-empires-types';

export type SpacePhilosophy = 'keeper' | 'broker' | 'vanguard' | 'weaver' | 'voyager';
export interface SpaceInheritance {
  version: 1;
  diet: { coverage: 'complete' | 'partial' | 'unknown'; kind: 'plants' | 'meat' | 'mixed' | 'unknown'; plants: number | null; meat: number | null; other: number | null };
  creature: 'social' | 'predator' | 'mixed' | null;
  tribe: 'allied' | 'conquered' | 'mixed' | null;
  civilization: CivicMethod[];
  scores: Record<'keeper' | 'broker' | 'vanguard', number>;
  philosophy: SpacePhilosophy;
}
export const PHILOSOPHY_NAMES: Record<SpacePhilosophy, string> = {
  keeper: 'Správce', broker: 'Prostředník', vanguard: 'Průkopník', weaver: 'Tkadlec cest', voyager: 'Poutník',
};
/** Four evidenced domains, six integer votes each. Unknown history gives no
 * votes, but never erases a different domain's real saved evidence. */
export function spaceInheritance(s: GameState): SpaceInheritance {
  const stages = s.lineageHistory?.stages.slice(0, 3) ?? [];
  const recorded = stages.filter(row => row.closed && row.counts);
  const coverage = recorded.length === 3 && recorded.every(row => row.coverage === 'complete') ? 'complete' : recorded.length ? 'partial' : 'unknown';
  const meals = recorded.map(row => row.counts!.meals);
  const plants = meals.reduce((sum, m) => sum + m.algae + m.nectar, 0), meat = meals.reduce((sum, m) => sum + m.meat, 0);
  const other = meals.reduce((sum, m) => sum + m.mineral + m.detritus, 0);
  const kind = coverage !== 'complete' || plants + meat === 0 ? 'unknown' : plants >= meat * 3 ? 'plants' : meat >= plants * 3 ? 'meat' : 'mixed';
  const creature = creatureInheritance(s).route as SpaceInheritance['creature'], tribe = tribeInheritance(s).route as SpaceInheritance['tribe'];
  const civilization = civilizationInheritance(s).methods;
  const scores = { keeper: 0, broker: 0, vanguard: 0 };
  if (kind === 'plants') scores.keeper += 6; else if (kind === 'meat') scores.vanguard += 6;
  else if (kind === 'mixed') { scores.keeper += 3; scores.vanguard += 3; }
  if (creature === 'social') scores.keeper += 6; else if (creature === 'predator') scores.vanguard += 6;
  else if (creature === 'mixed') { scores.keeper += 3; scores.vanguard += 3; }
  if (tribe === 'allied') scores.broker += 6; else if (tribe === 'conquered') scores.vanguard += 6;
  else if (tribe === 'mixed') { scores.broker += 3; scores.vanguard += 3; }
  for (const method of civilization) scores[method === 'trade' ? 'broker' : method === 'conversion' ? 'keeper' : 'vanguard'] += 6 / civilization.length;
  const highest = Math.max(...Object.values(scores));
  const leaders = (Object.keys(scores) as (keyof typeof scores)[]).filter(key => scores[key] === highest);
  return { version: 1, diet: { coverage, kind, plants: recorded.length ? plants : null, meat: recorded.length ? meat : null, other: recorded.length ? other : null },
    creature, tribe, civilization, scores, philosophy: !highest ? 'voyager' : leaders.length > 1 ? 'weaver' : leaders[0] };
}
export function empireAffinity(inheritance: SpaceInheritance | null, id: EmpireId): number {
  const philosophy = inheritance?.philosophy;
  return philosophy === 'weaver' ? 5 : philosophy === (id === 'resin' ? 'broker' : id === 'roots' ? 'keeper' : 'vanguard') ? 10 : 0;
}
