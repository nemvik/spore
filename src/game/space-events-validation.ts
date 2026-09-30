import type { GameState } from './types';
import type { SpaceEconomyAction } from './space-economy-types';
import type { ColonyWatch, EventBattleProof, EventSnapshot, EventStamp, PirateCandidate, SpaceEventAction } from './space-events-types';
import { validateEmpireCut } from './space-empires-validation';
import { validateWarReceipt, historicalWarOwner, ownedColonySeconds } from './space-war-validation';
import { colonyExistedAt } from './space-expansion-content';
import { warStateAt } from './space-war-content';
import { combatTotals, MILITARY_RESULTS, WARDEN_RESULTS } from './space-combat-content';
import { eventBattleProof } from './space-events';
import { shipCapabilities } from './space-outfit-content';
import { applyEventAction, emptyEventSnapshot, eventActionCount, eventColonyOpen, eventStampOf, eventStateAt,
  quarantineAt, EVENT_TAIL, EVENT_REST, QUARANTINE_UNSTABLE, QUARANTINE_REARM } from './space-events-content';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
function fail(): never { throw new Error('Neplatná uložená karanténa nebo pirátská událost.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
function array(v: unknown, max: number): asserts v is unknown[] { if (!Array.isArray(v) || v.length > max) fail(); }
const stampKeys = ['cut', 'economyAt', 'warAction'];
const baseKeys = [...stampKeys, 'serial', 'kind'];
const nowStamp = (s: GameState): EventStamp => ({ cut: { at: s.space!.elapsed, tick: s.tick, travelAction: s.space!.nextSerial,
  lifeAction: s.space!.expedition!.nextAction, economyAction: s.space!.economy!.nextAction }, economyAt: s.space!.economy!.elapsed, warAction: s.space!.wars!.nextAction });
function before(a: EventStamp, b: EventStamp): boolean {
  return a.economyAt <= b.economyAt + 1e-6 && a.warAction <= b.warAction
    && Object.keys(a.cut).every(key => a.cut[key as keyof typeof a.cut] <= b.cut[key as keyof typeof b.cut] + 1e-6);
}
function stamp(v: EventStamp, s: GameState, ceiling: EventStamp): void {
  const p = s.space!, activated = p.events!.activated;
  validateEmpireCut(v.cut, s, activated.cut); number(v.economyAt, activated.economyAt, ceiling.economyAt + 1e-6, false);
  number(v.warAction, activated.warAction, ceiling.warAction);
  if (!before(v, ceiling) || v.economyAt - activated.economyAt + 1e-6 < v.cut.at - activated.cut.at) fail();
  const previous = p.wars!.actions.find(row => row.serial === v.warAction - 1), next = p.wars!.actions.find(row => row.serial === v.warAction);
  const compatible = (a: typeof previous, direction: 'before' | 'after') => !a || (direction === 'before'
    ? a.economyAt <= v.economyAt + 1e-6 && Object.keys(a.cut).every(k => a.cut[k as keyof typeof a.cut] <= v.cut[k as keyof typeof v.cut] + 1e-6)
    : a.economyAt >= v.economyAt - 1e-6 && Object.keys(a.cut).every(k => a.cut[k as keyof typeof a.cut] >= v.cut[k as keyof typeof v.cut] - 1e-6));
  if (!compatible(previous, 'before') || !compatible(next, 'after')) fail();
}
function colony(s: GameState, planetId: string) {
  const row = s.space!.economy!.colonies.find(row => row.planetId === planetId);
  if (typeof planetId !== 'string' || !row) fail(); return row;
}
function world(s: GameState, planetId: string) {
  const e = s.space!.expedition; if (e?.version !== 2) fail();
  const row = e.worlds.find(row => row.id === planetId); if (!row) fail(); return row;
}
function ownedAt(s: GameState, planetId: string, at: EventStamp): void {
  const p = s.space!, c = colony(s, planetId), state = warStateAt(p, at.warAction);
  if (!colonyExistedAt(p, c, at.cut.economyAction, at.economyAt) || state && historicalWarOwner(p, state, planetId, at) !== 'player') fail();
}
function watchShape(v: ColonyWatch, s: GameState, limit: number, ceiling: EventStamp): void {
  object(v, ['planetId', 'anchorSerial', 'observedElapsed', 'armedAt', 'unstableFor']);
  colony(s, v.planetId); const w = world(s, v.planetId);
  number(v.anchorSerial, 0, limit); number(v.observedElapsed, 0, w.elapsed + 1e-6, false); number(v.unstableFor, 0, v.observedElapsed, false);
  if (v.armedAt === null) { if (v.unstableFor !== 0) fail(); return; }
  object(v.armedAt, ['stamp', 'localAt']); object(v.armedAt.stamp, stampKeys); stamp(v.armedAt.stamp, s, ceiling);
  number(v.armedAt.localAt, 0, v.observedElapsed + 1e-6, false); ownedAt(s, v.planetId, v.armedAt.stamp);
  if (v.unstableFor > v.observedElapsed - v.armedAt.localAt + 1e-6
    || v.unstableFor > ceiling.cut.at - v.armedAt.stamp.cut.at + 1e-6) fail();
}
function candidateShape(v: PirateCandidate, s: GameState, ceiling: EventStamp, eventLimit: number): void {
  object(v, ['receipt', 'travelAction', 'sold']);
  const r = v.receipt, p = s.space!, activated = p.events!.activated;
  object(r, ['serial', 'at', 'tick', 'spaceAt', 'lifeAction', 'warAction', 'planetId', 'balanceBefore', 'balanceAfter', 'kind', 'paid', 'colonyId', 'product', 'amount', 'eventAction']);
  if (r.kind !== 'load' || r.paid !== 0 || r.balanceBefore !== r.balanceAfter) fail();
  number(r.serial, activated.cut.economyAction, ceiling.cut.economyAction - 1); number(r.at, activated.economyAt, ceiling.economyAt, false);
  number(r.spaceAt, activated.cut.at, ceiling.cut.at, false); number(r.tick, activated.cut.tick, ceiling.cut.tick);
  number(r.lifeAction, activated.cut.lifeAction, ceiling.cut.lifeAction); number(r.eventAction, 1, eventLimit);
  number(r.balanceBefore); number(r.balanceAfter); const c = colony(s, r.planetId);
  if (c.id !== r.colonyId || c.product !== r.product || c.foundedAt > r.at) fail();
  number(r.amount, 1, Math.min(c.loaded, shipCapabilities(p, { economyAction: r.serial, lifeAction: r.lifeAction })!.cargo));
  number(v.travelAction, activated.cut.travelAction, ceiling.cut.travelAction); number(v.sold, 0, p.economy!.sales.find(row => row.planetId === r.planetId)?.amount ?? 0);
  const retained = p.economy!.actions.find(row => row.serial === r.serial);
  if (retained ? !equal(retained, r) : r.serial >= p.economy!.nextAction - p.economy!.actions.length) fail();
  validateWarReceipt(s, r); validateEventReceipt(s, r);
  const prior = p.log.find(row => row.serial === v.travelAction - 1), next = p.log.find(row => row.serial === v.travelAction);
  if (prior && prior.at > r.spaceAt + 1e-6 || next && next.at < r.spaceAt - 1e-6) fail();
  const later = p.economy!.actions.filter(row => row.serial > r.serial);
  if (later.length === p.economy!.nextAction - r.serial - 1) {
    const soldSince = later.reduce((n, row) => n + (row.kind === 'sell' && row.originPlanetId === r.planetId ? row.amount : 0), 0);
    if ((p.economy!.sales.find(row => row.planetId === r.planetId)?.amount ?? 0) - soldSince !== v.sold) fail();
  }
}
function battleProof(v: EventBattleProof, s: GameState, ceiling: EventStamp, proofs: Map<number, EventBattleProof>): void {
  object(v, ['battleSerial', 'planetId', 'start', 'startedEconomyAt', 'outcome', 'endedAt', 'endedEconomyAt', 'shots', 'damage']);
  const p = s.space!, c = p.combat!;
  number(v.battleSerial, p.events!.activated.nextCombatSerial, c.archive.battles + c.battles.length);
  validateEmpireCut(v.start, s, p.events!.activated.cut); number(v.startedEconomyAt, p.events!.activated.economyAt, ceiling.economyAt + 1e-6, false);
  number(v.endedAt, v.start.at, ceiling.cut.at + 1e-6, false); number(v.endedEconomyAt, v.startedEconomyAt, ceiling.economyAt + 1e-6, false);
  number(v.shots, 0, 5); number(v.damage, 0, 10000, false);
  if (!['won', 'retreated', 'lost'].includes(v.outcome) || (v.outcome === 'won') !== (v.shots === 5)
    || !near(v.endedAt - v.start.at, v.endedEconomyAt - v.startedEconomyAt)) fail();
  const retained = c.battles.find(row => row.serial === v.battleSerial);
  if (retained ? retained.kind !== 'pirate' || !retained.end || !equal(eventBattleProof(retained), v) : v.battleSerial > c.archive.battles) fail();
  const known = proofs.get(v.battleSerial); if (known && !equal(known, v)) fail(); proofs.set(v.battleSerial, v);
}
function actionShape(a: SpaceEventAction, s: GameState, limit: number, ceiling: EventStamp, proofs: Map<number, EventBattleProof>): void {
  const extra = a?.kind === 'quarantine' ? ['planetId', 'colonyId', 'watch'] : a?.kind === 'resume' ? ['planetId', 'quarantineSerial', 'localAt']
    : a?.kind === 'pirate' ? ['planetId', 'candidate', 'arrival', 'battleSerial'] : a?.kind === 'pirate-result' ? ['openingSerial', 'battle'] : null;
  if (!extra) fail(); object(a, [...baseKeys, ...extra]); number(a.serial, 1, limit); stamp(a, s, ceiling);
  if (a.kind === 'quarantine' || a.kind === 'resume') {
    ownedAt(s, a.planetId, a);
    const last = s.space!.log.find(row => row.serial === a.cut.travelAction - 1);
    if (last && (last.to !== 'surface' || last.planetId !== a.planetId)) fail();
    if (a.kind === 'quarantine') {
      if (colony(s, a.planetId).id !== a.colonyId) fail(); watchShape(a.watch, s, a.serial - 1, a);
      if (!a.watch.armedAt || a.watch.planetId !== a.planetId || a.watch.unstableFor < QUARANTINE_UNSTABLE - 1e-6) fail();
    } else { number(a.quarantineSerial, 1, a.serial - 1); number(a.localAt, 0, world(s, a.planetId).elapsed, false); }
  } else if (a.kind === 'pirate') {
    const p = s.space!, c = p.combat!; candidateShape(a.candidate, s, a, a.serial);
    object(a.arrival, ['serial', 'at', 'from', 'to', 'planetId']); number(a.arrival.serial, a.candidate.travelAction, a.cut.travelAction - 1);
    number(a.arrival.at, a.candidate.receipt.spaceAt, a.cut.at, false);
    if (!['surface', 'system'].includes(a.arrival.from) || a.arrival.to !== 'orbit' || a.arrival.planetId !== a.planetId || a.planetId === p.homePlanetId) fail();
    const retainedArrival = p.log.find(row => row.serial === a.arrival.serial);
    if (retainedArrival ? !equal(retainedArrival, a.arrival) : a.arrival.serial >= p.nextSerial - p.log.length) fail();
    number(a.battleSerial, p.events!.activated.nextCombatSerial, c.archive.battles + c.battles.length);
    const retained = c.battles.find(row => row.serial === a.battleSerial);
    if (retained && (retained.kind !== 'pirate' || retained.planetId !== a.planetId || !equal(retained.start, a.cut) || retained.economyAt !== a.economyAt)) fail();
    const political = warStateAt(p, a.warAction); if (political && (political.raid || political.relations.some(row => row.active))) fail();
  } else {
    number(a.openingSerial, 1, a.serial - 1); battleProof(a.battle, s, a, proofs);
    if (a.cut.at !== a.battle.endedAt || !near(a.economyAt, a.battle.endedEconomyAt)) fail();
  }
}
function snapshot(v: EventSnapshot, s: GameState, limit: number, ceiling: EventStamp, proofs: Map<number, EventBattleProof>): void {
  object(v, ['colonies', 'pirate', 'lastPirateResult', 'lastAutomatic', 'usedLoadSerial', 'totals']);
  object(v.totals, Object.keys(emptyEventSnapshot().totals)); for (const n of Object.values(v.totals)) number(n, 0, limit);
  if (eventActionCount(v) !== limit || v.totals.pirates !== v.totals.victories + v.totals.retreats + v.totals.defeats + Number(v.pirate !== null)) fail();
  array(v.colonies, 31); const ids: string[] = []; let opens = 0, closes = 0;
  for (const row of v.colonies) {
    object(row, ['planetId', 'colonyId', 'quarantines', 'resumes', 'lastQuarantine', 'lastResume']);
    if (ids.includes(row.planetId) || colony(s, row.planetId).id !== row.colonyId) fail(); ids.push(row.planetId);
    number(row.quarantines, 1, v.totals.quarantines); number(row.resumes, row.quarantines - 1, row.quarantines);
    actionShape(row.lastQuarantine, s, limit, ceiling, proofs);
    if (row.lastQuarantine.kind !== 'quarantine' || row.lastQuarantine.planetId !== row.planetId || row.lastQuarantine.colonyId !== row.colonyId) fail();
    if (row.resumes === 0) { if (row.lastResume !== null || row.lastQuarantine.watch.anchorSerial !== 0) fail(); }
    else {
      if (!row.lastResume) fail(); actionShape(row.lastResume, s, limit, ceiling, proofs);
      if (row.lastResume.kind !== 'resume' || row.lastResume.planetId !== row.planetId) fail();
      if (eventColonyOpen(row)) {
        if (row.lastResume.serial >= row.lastQuarantine.serial || row.lastQuarantine.watch.anchorSerial !== row.lastResume.serial
          || row.lastQuarantine.watch.armedAt.localAt < row.lastResume.localAt + QUARANTINE_REARM - 1e-6) fail();
      } else if (row.lastResume.quarantineSerial !== row.lastQuarantine.serial || row.lastResume.serial <= row.lastQuarantine.serial
        || row.lastResume.localAt < row.lastQuarantine.watch.observedElapsed - 1e-6) fail();
    }
    opens += row.quarantines; closes += row.resumes;
  }
  if (!equal(ids, [...ids].sort((a, b) => a.localeCompare(b))) || opens !== v.totals.quarantines || closes !== v.totals.resumes) fail();
  const automatic = v.totals.quarantines + v.totals.pirates;
  if (!automatic) { if (v.lastAutomatic !== null || v.usedLoadSerial !== 0) fail(); }
  else {
    object(v.lastAutomatic, [...stampKeys, 'serial', 'kind']); stamp(v.lastAutomatic, s, ceiling); number(v.lastAutomatic.serial, 1, limit);
    if (!['quarantine', 'pirate'].includes(v.lastAutomatic.kind)
      || automatic > Math.floor((v.lastAutomatic.economyAt - s.space!.events!.activated.economyAt + 1e-6) / EVENT_REST) + 1) fail();
    const openActions = [...v.colonies.map(row => row.lastQuarantine), ...(v.pirate ? [v.pirate] : [])];
    for (const a of openActions) if (a.serial > v.lastAutomatic.serial || !before(a, v.lastAutomatic)
      || a.serial === v.lastAutomatic.serial && (!equal(eventStampOf(a), eventStampOf(v.lastAutomatic)) || a.kind !== v.lastAutomatic.kind)) fail();
  }
  number(v.usedLoadSerial, v.totals.pirates ? s.space!.events!.activated.cut.economyAction : 0, s.space!.economy!.nextAction - 1);
  if (!v.totals.pirates && v.usedLoadSerial !== 0) fail();
  if (v.pirate !== null) { actionShape(v.pirate, s, limit, ceiling, proofs); if (v.pirate.kind !== 'pirate' || v.usedLoadSerial !== v.pirate.candidate.receipt.serial) fail(); }
  const results = v.totals.victories + v.totals.retreats + v.totals.defeats;
  if (!results) { if (v.lastPirateResult !== null) fail(); }
  else { if (!v.lastPirateResult) fail(); actionShape(v.lastPirateResult, s, limit, ceiling, proofs); if (v.lastPirateResult.kind !== 'pirate-result') fail(); }
}
export function validateSpaceEvents(s: GameState): void {
  const p = s.space!, events = p.events;
  if (!Object.hasOwn(p, 'events')) { if ((p.economy?.version ?? 0) >= 6) fail(); return; }
  object(events, ['version', 'activated', 'archive', 'actions', 'nextAction', 'current', 'watches', 'candidate']);
  if (events.version !== 1 || !p.economy || p.economy.version < 6 || !p.wars || !p.combat || p.combat.version < 2) fail();
  object(events.activated, [...stampKeys, 'nextCombatSerial', 'loadCount']); validateEmpireCut(events.activated.cut, s, p.wars.activated.cut);
  number(events.activated.economyAt, p.wars.activated.economyAt, p.economy.elapsed, false); number(events.activated.warAction, 1, p.wars.nextAction);
  number(events.activated.nextCombatSerial, p.wars.activated.nextCombatSerial, p.combat.archive.battles + p.combat.battles.length + 1);
  number(events.activated.loadCount, 0, p.economy.counts.load);
  const newReceipts = p.economy.actions.filter(row => row.serial >= events.activated.cut.economyAction);
  if (newReceipts.length === p.economy.nextAction - events.activated.cut.economyAction
    && p.economy.counts.load - newReceipts.filter(row => row.kind === 'load').length !== events.activated.loadCount) fail();
  const ceiling = nowStamp(s); number(events.nextAction, 1); object(events.archive, ['through', 'stamp', 'state']);
  number(events.archive.through, 0, events.nextAction - 1); object(events.archive.stamp, stampKeys); stamp(events.archive.stamp, s, ceiling);
  array(events.actions, EVENT_TAIL);
  if (events.actions.length !== Math.min(EVENT_TAIL, events.nextAction - 1) || events.archive.through + events.actions.length !== events.nextAction - 1) fail();
  const proofs = new Map<number, EventBattleProof>(); snapshot(events.archive.state, s, events.archive.through, events.archive.stamp, proofs);
  if (!events.archive.through && (!equal(events.archive.state, emptyEventSnapshot()) || !equal(events.archive.stamp, eventStampOf(events.activated)))) fail();
  let previous: EventStamp = events.archive.stamp; const replay = structuredClone(events.archive.state);
  for (const [i, action] of events.actions.entries()) {
    actionShape(action, s, events.nextAction - 1, ceiling, proofs);
    if (action.serial !== events.archive.through + i + 1 || !before(previous, action)
      || action.economyAt - previous.economyAt + 1e-6 < action.cut.at - previous.cut.at) fail();
    applyEventAction(replay, action); previous = eventStampOf(action);
  }
  if (!equal(replay, events.current)) fail(); snapshot(events.current, s, events.nextAction - 1, ceiling, proofs);
  if (events.current.totals.pirates > p.economy.counts.load - events.activated.loadCount) fail();
  const total = combatTotals(p);
  for (const [key, military] of [['victories', 'Victories'], ['retreats', 'Retreats'], ['defeats', 'Defeats']] as const) {
    const available = total[key] - [...MILITARY_RESULTS, ...WARDEN_RESULTS].filter(k => k.endsWith(military)).reduce((n, k) => n + (total[k] ?? 0), 0);
    if (events.current.totals[key] > available) fail();
    const archived = [...proofs.values()].filter(b => b.battleSerial <= p.combat!.archive.battles && b.outcome === (key === 'victories' ? 'won' : key === 'retreats' ? 'retreated' : 'lost')).length;
    const archivedAvailable = p.combat.archive[key] - [...MILITARY_RESULTS, ...WARDEN_RESULTS].filter(k => k.endsWith(military)).reduce((n, k) => n + (p.combat!.archive[k] ?? 0), 0);
    if (archived > archivedAvailable) fail();
  }
  if (events.current.pirate) {
    const battle = p.combat.battles.find(row => row.serial === events.current.pirate!.battleSerial);
    if (!battle || battle.end) fail();
  }
  array(events.watches, 31); const ids: string[] = [];
  for (const watch of events.watches) {
    watchShape(watch, s, events.nextAction - 1, ceiling); if (ids.includes(watch.planetId)) fail(); ids.push(watch.planetId);
    const row = events.current.colonies.find(row => row.planetId === watch.planetId);
    if (watch.anchorSerial !== (row?.lastResume?.serial ?? 0)) fail();
    if (row && eventColonyOpen(row) && (watch.armedAt !== null || watch.unstableFor !== 0 || watch.observedElapsed !== row.lastQuarantine.watch.observedElapsed)) fail();
    if (row?.lastResume && (watch.observedElapsed < row.lastResume.localAt || watch.armedAt && watch.armedAt.localAt < row.lastResume.localAt + QUARANTINE_REARM - 1e-6)) fail();
  }
  if (!equal(ids, [...ids].sort((a, b) => a.localeCompare(b))) || events.current.colonies.some(row => !ids.includes(row.planetId))) fail();
  if (events.candidate !== null) {
    candidateShape(events.candidate, s, ceiling, events.nextAction);
    const candidate = events.candidate, cargo = p.economy.cargo.find(row => row.planetId === candidate.receipt.planetId);
    if (candidate.receipt.serial <= events.current.usedLoadSerial || !cargo || cargo.amount < candidate.receipt.amount
      || candidate.sold !== (p.economy.sales.find(row => row.planetId === candidate.receipt.planetId)?.amount ?? 0)) fail();
  }
}
/** Only loads use the event revision. Other economic operations stay available. */
export function validateEventReceipt(s: GameState, row: SpaceEconomyAction): void {
  const events = s.space!.events;
  if (row.kind !== 'load') { if (Object.hasOwn(row, 'eventAction')) fail(); return; }
  if (!events || row.serial < events.activated.cut.economyAction) { if (Object.hasOwn(row, 'eventAction')) fail(); return; }
  number(row.eventAction, 1, events.nextAction);
  const previous = events.actions.find(a => a.serial === row.eventAction! - 1), next = events.actions.find(a => a.serial === row.eventAction);
  if (previous && (previous.economyAt > row.at + 1e-6 || previous.cut.at > row.spaceAt + 1e-6 || previous.cut.economyAction > row.serial)
    || next && (next.economyAt < row.at - 1e-6 || next.cut.at < row.spaceAt - 1e-6 || next.cut.economyAction <= row.serial)) fail();
  if (quarantineAt(eventStateAt(events, row.eventAction) ?? undefined, row.planetId)) fail();
}

export function eventsCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space!, b = cp.space!, now = a.events, old = b.events;
  if (!now || !old) return !now && !old;
  const bootstrap = old.nextAction === 1 && !old.watches.length && !old.candidate
    && old.activated.cut.at === b.elapsed && old.activated.cut.economyAction === b.economy!.nextAction && old.activated.economyAt === b.economy!.elapsed;
  if (!bootstrap && !equal(now.activated, old.activated) || !before(old.activated, now.activated)
    || now.activated.nextCombatSerial < old.activated.nextCombatSerial || now.activated.loadCount < old.activated.loadCount
    || now.nextAction < old.nextAction || now.archive.through < old.archive.through) return false;
  if (now.current.totals.pirates - old.current.totals.pirates > a.economy!.counts.load - b.economy!.counts.load + Number(old.candidate !== null)) return false;
  const checkpointStamp = nowStamp(cp), since = now.actions.filter(row => row.serial >= old.nextAction);
  for (const row of old.actions) {
    const retained = now.actions.find(a => a.serial === row.serial);
    if (retained ? !equal(retained, row) : row.serial > now.archive.through) return false;
  }
  if (since.some(row => !before(checkpointStamp, row))) return false;
  if (now.archive.through < old.nextAction) {
    const bridge = structuredClone(old.archive.state);
    for (const row of old.actions) { if (row.serial > now.archive.through) break; applyEventAction(bridge, row); }
    const last = old.actions.find(row => row.serial === now.archive.through), expectedStamp = last ? eventStampOf(last) : old.archive.stamp;
    if (!(bootstrap && now.archive.through === 0) && (!equal(bridge, now.archive.state) || !equal(expectedStamp, now.archive.stamp))) return false;
    const continuation = structuredClone(old.current);
    try { for (const row of since) applyEventAction(continuation, row); } catch { return false; }
    if (!equal(continuation, now.current)) return false;
  } else {
    // The rolled prefix is already after this known checkpoint. Its own totals
    // must preserve the checkpoint; a later tail cannot replace known results.
    const archived = now.archive.state;
    for (const key of Object.keys(old.current.totals) as (keyof EventSnapshot['totals'])[])
      if (archived.totals[key] < old.current.totals[key]) return false;
    if (archived.usedLoadSerial < old.current.usedLoadSerial) return false;
    for (const prior of old.current.colonies) {
      const next = archived.colonies.find(row => row.planetId === prior.planetId);
      if (!next || next.quarantines < prior.quarantines || next.resumes < prior.resumes) return false;
      for (const [count, field] of [['quarantines', 'lastQuarantine'], ['resumes', 'lastResume']] as const)
        if (next[count] === prior[count] ? !equal(next[field], prior[field]) : !next[field] || next[field]!.serial < old.nextAction || !before(checkpointStamp, next[field]!)) return false;
    }
    const results = (snapshot: EventSnapshot) => snapshot.totals.victories + snapshot.totals.retreats + snapshot.totals.defeats;
    if (results(archived) === results(old.current) && !equal(archived.lastPirateResult, old.current.lastPirateResult)) return false;
    if (archived.pirate && archived.pirate.serial < old.nextAction && !equal(archived.pirate, old.current.pirate)) return false;
  }
  for (const key of Object.keys(old.current.totals) as (keyof EventSnapshot['totals'])[])
    if (now.current.totals[key] < old.current.totals[key]) return false;
  if (now.current.usedLoadSerial < old.current.usedLoadSerial) return false;
  for (const prior of old.current.colonies) {
    const current = now.current.colonies.find(row => row.planetId === prior.planetId);
    if (!current || current.colonyId !== prior.colonyId || current.quarantines < prior.quarantines || current.resumes < prior.resumes) return false;
    for (const [count, field] of [['quarantines', 'lastQuarantine'], ['resumes', 'lastResume']] as const) {
      if (current[count] === prior[count]) { if (!equal(current[field], prior[field])) return false; }
      else if (!current[field] || current[field]!.serial < old.nextAction || !before(checkpointStamp, current[field]!)) return false;
    }
  }
  for (const current of now.current.colonies) if (!old.current.colonies.some(row => row.planetId === current.planetId)
    && (current.lastQuarantine.serial < old.nextAction || !before(checkpointStamp, current.lastQuarantine))) return false;
  if (old.current.pirate && now.current.pirate?.serial === old.current.pirate.serial && !equal(now.current.pirate, old.current.pirate)) return false;
  if (old.current.lastPirateResult && now.current.lastPirateResult?.serial === old.current.lastPirateResult.serial
    && !equal(now.current.lastPirateResult, old.current.lastPirateResult)) return false;
  const nextCombat = b.combat!.archive.battles + b.combat!.battles.length + 1;
  const newPirates = [...since.filter(row => row.kind === 'pirate'), ...(now.current.pirate?.serial! >= old.nextAction ? [now.current.pirate!] : [])];
  if (newPirates.some(row => row.battleSerial < nextCombat)) return false;
  const lastResult = now.current.lastPirateResult;
  if (lastResult && lastResult.openingSerial >= old.nextAction && lastResult.battle.battleSerial < nextCombat) return false;
  if (a.economy!.elapsed === b.economy!.elapsed && (now.current.totals.quarantines !== old.current.totals.quarantines
    || now.current.totals.pirates !== old.current.totals.pirates)) return false;
  if (b.leg && a.nextSerial === b.nextSerial && (now.nextAction !== old.nextAction || !equal(now.watches, old.watches))) return false;
  for (const prior of old.watches) {
    const current = now.watches.find(row => row.planetId === prior.planetId); if (!current || current.observedElapsed < prior.observedElapsed) return false;
    const elapsed = world(s, prior.planetId).elapsed - world(cp, prior.planetId).elapsed;
    if (current.anchorSerial === prior.anchorSerial) {
      if (elapsed === 0 && !equal(current, prior) || current.unstableFor > prior.unstableFor + elapsed + 1e-6) return false;
      if (current.armedAt && !equal(current.armedAt, prior.armedAt) && (!before(checkpointStamp, current.armedAt.stamp)
        || current.armedAt.localAt < world(cp, prior.planetId).elapsed - 1e-6)) return false;
    } else if (current.anchorSerial < old.nextAction) return false;
  }
  for (const current of now.watches) if (!old.watches.some(row => row.planetId === current.planetId)) {
    const oldWorld = b.expedition!.worlds.find(row => row.id === current.planetId);
    if (oldWorld && world(s, current.planetId).elapsed <= oldWorld.elapsed || current.armedAt && !before(checkpointStamp, current.armedAt.stamp)) return false;
  }
  if (now.candidate && now.candidate.receipt.serial < b.economy!.nextAction && !equal(now.candidate, old.candidate)) return false;
  if (old.candidate && !equal(now.candidate, old.candidate)) {
    const origin = old.candidate.receipt.planetId, sold = a.economy!.sales.find(row => row.planetId === origin)?.amount ?? 0;
    let replaced = !!now.candidate && now.candidate.receipt.serial >= b.economy!.nextAction;
    if (!replaced) {
      const transactions = a.economy!.actions.filter(row => row.serial >= b.economy!.nextAction),
        load = transactions.filter(row => row.kind === 'load').at(-1);
      if (load) replaced = now.current.usedLoadSerial >= load.serial || transactions.some(row => row.kind === 'sell'
        && row.serial > load.serial && row.originPlanetId === load.planetId);
      else if (transactions.length < a.economy!.nextAction - b.economy!.nextAction) {
        // Beyond the retained economic window only cumulative new loading and
        // a subsequent disposal remain provable, not an invented old origin.
        replaced = a.economy!.counts.load > b.economy!.counts.load
          && (a.economy!.counts.sell > b.economy!.counts.sell || now.current.usedLoadSerial >= b.economy!.nextAction);
      }
    }
    if (!replaced && sold === old.candidate.sold && now.current.usedLoadSerial < old.candidate.receipt.serial) return false;
  }
  return true;
}

/** Intersection of retained political and quarantine intervals. Unknown rolled
 * changes keep a conservative upper bound; a known unbroken block stays zero. */
export function operatingColonySeconds(s: GameState, cp: GameState, planetId: string): number {
  const a = s.space!, b = cp.space!, now = a.events, old = b.events;
  if (!now || !old) return ownedColonySeconds(s, cp, planetId);
  const dt = a.economy!.elapsed - b.economy!.elapsed, eventRows = now.actions.filter(row => row.serial >= old.nextAction),
    warRows = a.wars!.actions.filter(row => row.serial >= b.wars!.nextAction);
  const startingOwner = historicalWarOwner(b, b.wars!.current, planetId, nowStamp(cp));
  const priorSite = old.current.colonies.find(row => row.planetId === planetId), site = now.current.colonies.find(row => row.planetId === planetId);
  if (eventRows.length !== now.nextAction - old.nextAction || warRows.length !== a.wars!.nextAction - b.wars!.nextAction) {
    if (priorSite && eventColonyOpen(priorSite) && equal(priorSite, site)) return 0;
    return Math.min(dt, ownedColonySeconds(s, cp, planetId));
  }
  const boundaries: { at: number; owned?: boolean; open?: boolean }[] = [];
  for (const row of eventRows) if ((row.kind === 'quarantine' || row.kind === 'resume') && row.planetId === planetId)
    boundaries.push({ at: row.economyAt, open: row.kind === 'quarantine' });
  for (const row of warRows) {
    if (row.kind === 'expire' && row.raid.planetId === planetId) boundaries.push({ at: row.economyAt, owned: false });
    if (row.kind === 'purchase' && row.planetId === planetId) boundaries.push({ at: row.economyAt, owned: true });
    if (row.kind === 'result' && row.battle.planetId === planetId) {
      if (row.battle.kind === 'invasion' && row.battle.outcome === 'won') boundaries.push({ at: row.economyAt, owned: true });
      if (row.battle.kind === 'defense' && row.battle.outcome !== 'won') boundaries.push({ at: row.economyAt, owned: false });
    }
  }
  boundaries.sort((x, y) => x.at - y.at);
  let time = b.economy!.elapsed, allowed = 0, owned = startingOwner === 'player', open = !!quarantineAt(old.current, planetId);
  for (const boundary of boundaries) {
    const at = Math.max(time, Math.min(a.economy!.elapsed, boundary.at));
    if (owned && !open) allowed += at - time;
    if (boundary.owned !== undefined) owned = boundary.owned;
    if (boundary.open !== undefined) open = boundary.open;
    time = at;
  }
  if (owned && !open) allowed += a.economy!.elapsed - time;
  return allowed;
}
