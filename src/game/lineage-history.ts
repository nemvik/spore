import type { FoodKind, GameState, Stage } from './types';
import { completeNeighbourRoster, requiredNeighbours } from './tribe-roster';

export const HISTORY_FOODS: readonly FoodKind[] = ['algae', 'mineral', 'nectar', 'meat', 'detritus'];
export const HISTORY_METHODS = ['cultivate', 'hunt', 'guide', 'friend', 'predator', 'allied', 'conquered', 'restoration', 'migration', 'stable'] as const;
export type HistoryMethod = typeof HISTORY_METHODS[number];
export type HistoryOutcome = 'passage' | 'social' | 'predator' | 'mixed' | 'restoration' | 'migration' | 'allied' | 'conquered' | 'stable';
export interface HistoryStamp { tick: number; generation: number }
export interface HistoryFact { key: string; method: HistoryMethod; source: 'action' | 'saved'; at: HistoryStamp | null }
export interface StageHistory {
  stage: Stage;
  coverage: 'complete' | 'partial' | 'unknown';
  started: HistoryStamp | null;
  // Null means unrecorded, never an assertion that the player ate/hunted nothing.
  counts: { meals: Record<FoodKind, number>; hunts: number } | null;
  facts: HistoryFact[];
  closed: { outcome: HistoryOutcome; source: 'action' | 'saved'; at: HistoryStamp | null } | null;
}
export interface LineageHistory { version: 1; stages: StageHistory[] }
const stamp = (s: GameState): HistoryStamp => ({ tick: s.tick, generation: s.player.generation });
const counts = (): NonNullable<StageHistory['counts']> => ({ meals: { algae: 0, mineral: 0, nectar: 0, meat: 0, detritus: 0 }, hunts: 0 });
function entry(s: GameState, stage: Stage, coverage: StageHistory['coverage']): StageHistory {
  return { stage, coverage, started: coverage === 'unknown' ? null : stamp(s), counts: stage <= 2 && coverage !== 'unknown' ? counts() : null, facts: [], closed: null };
}

/** Only existing resolved game records are evidence; never inspect anatomy or resource balances. */
export function stageFacts(s: GameState, stage: Stage): Pick<HistoryFact, 'key' | 'method'>[] {
  if (stage <= 2) return [
    ...s.journey.sites.filter(site => site.stage === stage && site.resolved && site.method).map(site => ({ key: `site:${site.id}`, method: site.method! })),
    ...(stage === 2 ? (s.creatureStage?.nests ?? []).filter(n => n.outcome).map(n => ({ key: `nest:${n.species}`, method: n.outcome! })) : []),
  ];
  if (stage === 3 && s.tribe?.version === 2) return s.tribe.neighbours.filter(n => n.resolved).map(n => ({ key: `neighbour:${n.identity}`, method: n.resolved! }));
  if (stage === 4 && s.machines?.version === 2) return s.machines.regions.filter(r => r.owner === 'player' && r.method).map(r => ({ key: `region:${r.identity}`, method: r.method! }));
  if (stage === 5 && s.planet?.version === 2 && s.planet.completed) return [{ key: 'planet:local-t3', method: 'stable' }];
  return [];
}
export function stageOutcome(s: GameState, stage: Stage): HistoryOutcome | null {
  if (stage < 2) return s.stage > stage ? 'passage' : null;
  if (stage === 2) return s.campaign.won ? s.creatureStage?.completed ?? s.campaign.finale : null;
  if (stage === 3 && s.tribe?.version === 2 && s.tribe.completed) {
    const methods = new Set(s.tribe.neighbours.map(n => n.resolved));
    return methods.size > 1 ? 'mixed' : methods.has('allied') ? 'allied' : 'conquered';
  }
  if (stage === 4 && s.machines?.version === 2 && s.machines.completed) {
    const methods = new Set(s.machines.regions.map(r => r.method));
    return methods.size > 1 ? 'mixed' : s.machines.regions[0].method;
  }
  return stage === 5 && s.planet?.version === 2 && s.planet.completed ? 'stable' : null;
}
function observe(s: GameState, row: StageHistory, source: HistoryFact['source']) {
  if (row.closed) return;
  for (const fact of stageFacts(s, row.stage)) if (!row.facts.some(f => f.key === fact.key)) {
    row.facts.push({ ...fact, source, at: source === 'action' ? stamp(s) : null });
  }
  const outcome = stageOutcome(s, row.stage);
  if (outcome) row.closed = { outcome, source, at: source === 'action' ? stamp(s) : null };
}

/** UI opt-in. The parser alone keeps historical fixtures/rules unchanged. */
export function enableLineageHistory(s: GameState, fromBirth = false): void {
  if (s.lineageHistory) return;
  s.lineageHistory = { version: 1, stages: [] };
  for (let stage = 0; stage <= s.stage; stage++) {
    const row = entry(s, stage as Stage, fromBirth && stage === 0 ? 'complete' : stage === s.stage && !stageOutcome(s, stage as Stage) ? 'partial' : 'unknown');
    observe(s, row, 'saved'); s.lineageHistory.stages.push(row);
  }
  if (s.checkpoint) {
    const checkpoint = JSON.parse(s.checkpoint) as GameState;
    enableLineageHistory(checkpoint);
    s.checkpoint = JSON.stringify(checkpoint);
  }
}

/** Idempotent snapshots, frozen at completion, including before every checkpoint. */
export function observeLineageHistory(s: GameState): void {
  const history = s.lineageHistory; if (!history) return;
  for (const row of history.stages) observe(s, row, 'action');
  while (history.stages.length <= s.stage) {
    const row = entry(s, history.stages.length as Stage, 'complete');
    observe(s, row, 'action'); history.stages.push(row);
  }
}
export function recordLineageMeal(s: GameState, food: FoodKind): void {
  const row = s.lineageHistory?.stages[s.stage];
  if (row?.counts && !row.closed) row.counts.meals[food] = Math.min(1_000_000_000, row.counts.meals[food] + 1);
}
export function recordLineageHunt(s: GameState): void {
  const row = s.lineageHistory?.stages[s.stage];
  if (row?.counts && !row.closed) row.counts.hunts = Math.min(1_000_000_000, row.counts.hunts + 1);
}

/** No grant flags or accumulated rewards: the immutable result determines the rate. */
export function creatureInheritance(s: GameState) {
  const row = s.lineageHistory?.stages[2], route = row?.closed?.outcome;
  const known = row?.closed?.source === 'action' && row.facts.filter(f => f.key.startsWith('nest:')).length >= 3;
  const social = known && route === 'social' ? .15 : known && route === 'mixed' ? .075 : 0;
  const combat = known && route === 'predator' ? .15 : known && route === 'mixed' ? .075 : 0;
  return { social: 1 + social, combat: 1 + combat, route: social || combat ? route! : null };
}

/** Frozen, evidenced result only. Saved resolutions are evidence, not guessed choices.
 * Rates are derived, never deposited or written back to machine designs/springs. */
export function tribeInheritance(s: GameState) {
  const neutral = { income: 1, power: 1, route: null, allies: 0, conquests: 0 } as const;
  const t = s.tribe, row = s.lineageHistory?.stages[3];
  if (t?.version !== 2 || !t.completed || !completeNeighbourRoster(t) || !row?.closed) return neutral;
  const roster = requiredNeighbours(t);
  if (row.facts.length !== roster.length || !roster.every(id => {
    const neighbour = t.neighbours.find(n => n.identity === id)!;
    return !!neighbour.resolved && row.facts.filter(f => f.key === `neighbour:${id}` && f.method === neighbour.resolved).length === 1;
  })) return neutral;
  const allies = row.facts.filter(f => f.method === 'allied').length, conquests = row.facts.length - allies;
  const route = allies === roster.length ? 'allied' : conquests === roster.length ? 'conquered' : 'mixed';
  if (row.closed.outcome !== route) return neutral;
  return { income: route === 'allied' ? 1.2 : route === 'mixed' ? 1.1 : 1,
    power: route === 'conquered' ? 1.2 : route === 'mixed' ? 1.1 : 1, route, allies, conquests };
}
