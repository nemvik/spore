import type { EmpireId } from './space-empires-types';
import type { SpaceState } from './space-types';
import type { ColonyRaid, WarAction, WarRelation, WarSnapshot, WarStamp, WarTerritory, WarTotals } from './space-war-types';
import { EMPIRE_IDS } from './space-empires-content';

export const WAR_TAIL = 128;
export const WAR_PEACE_WAIT = 60;
export const WAR_REDECLARE_WAIT = 180;
export const WAR_FIRST_RAID = 90;
export const WAR_RAID_REST = 180;
export const WAR_RAID_WINDOW = 180;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const stamp = (action: WarAction): WarStamp => ({ cut: { ...action.cut }, economyAt: action.economyAt });
function invalid(): never { throw new Error('Neplatná návaznost válečných událostí.'); }
export const emptyWarTotals = (): WarTotals => ({ declarations: 0, peaces: 0, invasions: 0, defenses: 0,
  invasionVictories: 0, invasionRetreats: 0, invasionDefeats: 0,
  defenseVictories: 0, defenseRetreats: 0, defenseDefeats: 0,
  raids: 0, expired: 0, cancelled: 0, purchases: 0 });
export function emptyWarSnapshot(): WarSnapshot {
  return { relations: EMPIRE_IDS.map(empireId => ({ empireId, declarations: 0, peaces: 0, active: false,
    declaration: null, peace: null, suspendedSeconds: 0, nextRaidAt: null })),
  territories: [], raid: null, engagement: null, totals: emptyWarTotals() };
}
export const warRelation = (p: SpaceState, id: EmpireId): WarRelation | null => p.wars?.current.relations.find(r => r.empireId === id) ?? null;
export const atWar = (p: SpaceState, id: EmpireId) => warRelation(p, id)?.active ?? false;
export const warPenalty = (p: SpaceState, id: EmpireId) => { const r = warRelation(p, id); return r ? Math.min(30, r.declarations * 10) + (r.active ? 20 : 0) : 0; };
export function allySuspendedTime(p: SpaceState, id: EmpireId): number {
  const r = warRelation(p, id);
  return r ? r.suspendedSeconds + (r.active && r.declaration?.escort ? p.elapsed - r.declaration.cut.at : 0) : 0;
}
export function raidFromAction(action: Extract<WarAction, { kind: 'raid' }>): ColonyRaid {
  return { ...stamp(action), serial: action.serial, empireId: action.empireId,
    declarationSerial: action.declarationSerial, planetId: action.planetId, deadline: action.deadline };
}
function transfer(state: WarSnapshot, change: WarTerritory['change'], planetId: string, owner: WarTerritory['owner']): void {
  const row = state.territories.find(row => row.planetId === planetId), value = { planetId, owner, change: structuredClone(change) };
  if (row) Object.assign(row, value); else state.territories.push(value);
  state.territories.sort((a, b) => a.planetId.localeCompare(b.planetId));
}
/** The one political state transition, shared by runtime and bounded replay.
 * Spatial permission, paid receipts and physical combat witnesses are checked
 * by callers; this function enforces ordering and political consequences. */
export function applyWarAction(state: WarSnapshot, action: WarAction): void {
  const r = state.relations.find(row => row.empireId === action.empireId);
  if (!r) invalid();
  const totals = state.totals;
  if (action.kind === 'declare') {
    if (state.relations.some(row => row.active) || state.engagement || state.raid
      || state.relations.some(row => row.peace && action.economyAt < row.peace.economyAt + WAR_REDECLARE_WAIT - 1e-6)) invalid();
    r.active = true; r.declarations++; r.declaration = { ...stamp(action), serial: action.serial, escort: structuredClone(action.escort) };
    r.nextRaidAt = action.economyAt + WAR_FIRST_RAID; totals.declarations++; return;
  }
  if (action.kind === 'purchase') {
    if (r.active || state.engagement) invalid();
    transfer(state, action, action.planetId, 'player'); totals.purchases++; return;
  }
  if (!r.active || !r.declaration) invalid();
  if (action.kind === 'peace') {
    if (state.engagement || action.economyAt < r.declaration.economyAt + WAR_PEACE_WAIT - 1e-6) invalid();
    if (r.declaration.escort) r.suspendedSeconds += action.cut.at - r.declaration.cut.at;
    r.active = false; r.peaces++; r.peace = { ...stamp(action), serial: action.serial }; r.nextRaidAt = null;
    if (state.raid) totals.cancelled++;
    state.raid = null; totals.peaces++; return;
  }
  if (action.kind === 'raid') {
    if (state.raid || r.nextRaidAt === null || action.economyAt < r.nextRaidAt - 1e-6
      || action.declarationSerial !== r.declaration.serial || action.deadline !== action.economyAt + WAR_RAID_WINDOW) invalid();
    state.raid = raidFromAction(action); totals.raids++; return;
  }
  if (action.kind === 'engage') {
    const battle = action.engagement;
    if (state.engagement || battle.empireId !== r.empireId || battle.declarationSerial !== r.declaration.serial
      || battle.orderSerial !== action.serial) invalid();
    if (battle.kind === 'defense') {
      if (!state.raid || state.raid.serial !== battle.raidSerial || state.raid.planetId !== battle.planetId
        || action.economyAt >= state.raid.deadline) invalid();
      totals.defenses++;
    } else { if (battle.raidSerial !== null) invalid(); totals.invasions++; }
    state.engagement = structuredClone(battle); return;
  }
  if (action.kind === 'expire') {
    if (!state.raid || !same(state.raid, action.raid) || action.economyAt < state.raid.deadline - 1e-6
      || state.engagement?.kind === 'defense' && state.engagement.raidSerial === state.raid.serial) invalid();
    transfer(state, action, state.raid.planetId, r.empireId); state.raid = null;
    r.nextRaidAt = action.economyAt + WAR_RAID_REST; totals.expired++; return;
  }
  const result = action.battle, engaged = state.engagement;
  if (!engaged || Object.keys(engaged).some(key => engaged[key as keyof typeof engaged] !== result[key as keyof typeof engaged])
    || result.endedAt !== action.cut.at || Math.abs(result.endedEconomyAt - action.economyAt) > 1e-6) invalid();
  const resultKey = `${result.kind}${result.outcome === 'won' ? 'Victories' : result.outcome === 'lost' ? 'Defeats' : 'Retreats'}` as keyof WarTotals;
  totals[resultKey]++;
  if (result.kind === 'invasion') {
    if (result.outcome === 'won') transfer(state, action, result.planetId, 'player');
  } else {
    if (!state.raid || state.raid.serial !== result.raidSerial) invalid();
    if (result.outcome !== 'won') transfer(state, action, result.planetId, r.empireId);
    state.raid = null; r.nextRaidAt = action.economyAt + WAR_RAID_REST;
  }
  state.engagement = null;
}
/** No gameplay limit: discard only a replayed prefix, preserving its state. */
export function appendWarAction(p: SpaceState, action: WarAction): void {
  const wars = p.wars;
  if (!wars || action.serial !== wars.nextAction) invalid();
  const next = structuredClone(wars.current); applyWarAction(next, action);
  if (wars.actions.length === WAR_TAIL) {
    const oldest = wars.actions[0], archived = structuredClone(wars.archive.state);
    applyWarAction(archived, oldest);
    wars.archive = { through: oldest.serial, stamp: stamp(oldest), state: archived };
    wars.actions.shift();
  }
  wars.current = next; wars.actions.push(structuredClone(action)); wars.nextAction++;
}
/** Historical revision is the next action at the economic receipt. Unknown
 * rolled prefixes return null, never today's ownership masquerading as past. */
export function warStateAt(p: SpaceState, revision: number): WarSnapshot | null {
  const w = p.wars; if (!w || revision <= w.archive.through || revision > w.nextAction) return null;
  const state = structuredClone(w.archive.state);
  for (const action of w.actions) { if (action.serial >= revision) break; applyWarAction(state, action); }
  return state;
}
