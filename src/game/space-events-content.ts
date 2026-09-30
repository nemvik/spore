import type { EventColony, EventSnapshot, EventStamp, QuarantineEvent, SpaceEventAction, SpaceEvents } from './space-events-types';

export const EVENT_TAIL = 128;
export const EVENT_REST = 300;
export const QUARANTINE_UNSTABLE = 12;
export const QUARANTINE_REARM = 60;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const eventStampOf = (action: EventStamp): EventStamp => ({ cut: { ...action.cut }, economyAt: action.economyAt, warAction: action.warAction });
function invalid(): never { throw new Error('Neplatná návaznost událostí výpravy.'); }
export function emptyEventSnapshot(): EventSnapshot {
  return { colonies: [], pirate: null, lastPirateResult: null, lastAutomatic: null, usedLoadSerial: 0,
    totals: { quarantines: 0, resumes: 0, pirates: 0, victories: 0, retreats: 0, defeats: 0 } };
}
export const eventColonyOpen = (colony: EventColony): boolean => colony.quarantines > colony.resumes;
export function quarantineAt(state: EventSnapshot | undefined, planetId: string): QuarantineEvent | null {
  const row = state?.colonies.find(row => row.planetId === planetId);
  return row && eventColonyOpen(row) ? row.lastQuarantine : null;
}
export const automaticEventReady = (state: EventSnapshot, economyAt: number): boolean =>
  !state.lastAutomatic || economyAt >= state.lastAutomatic.economyAt + EVENT_REST - 1e-6;
export const eventActionCount = (state: EventSnapshot): number => {
  const t = state.totals; return t.quarantines + t.resumes + t.pirates + t.victories + t.retreats + t.defeats;
};
/** Pure ordering and durable consequences. Actual biology, cargo, location and
 * physical combat are checked by runtime and validation at their boundaries. */
export function applyEventAction(state: EventSnapshot, action: SpaceEventAction): void {
  const totals = state.totals;
  if (action.kind === 'quarantine' || action.kind === 'pirate') {
    if (!automaticEventReady(state, action.economyAt)) invalid();
  }
  if (action.kind === 'quarantine') {
    const row = state.colonies.find(row => row.planetId === action.planetId), watch = action.watch;
    if (row && (eventColonyOpen(row) || row.colonyId !== action.colonyId)
      || watch.planetId !== action.planetId || watch.anchorSerial !== (row?.lastResume?.serial ?? 0)
      || watch.unstableFor < QUARANTINE_UNSTABLE - 1e-6
      || watch.observedElapsed < watch.armedAt.localAt + watch.unstableFor - 1e-6
      || row?.lastResume && watch.armedAt.localAt < row.lastResume.localAt + QUARANTINE_REARM - 1e-6) invalid();
    if (row) { row.lastQuarantine = structuredClone(action); row.quarantines++; }
    else {
      if (state.colonies.length >= 31) invalid();
      state.colonies.push({ planetId: action.planetId, colonyId: action.colonyId, quarantines: 1, resumes: 0,
        lastQuarantine: structuredClone(action), lastResume: null });
      state.colonies.sort((a, b) => a.planetId.localeCompare(b.planetId));
    }
    totals.quarantines++;
  } else if (action.kind === 'resume') {
    const row = state.colonies.find(row => row.planetId === action.planetId);
    if (!row || !eventColonyOpen(row) || row.lastQuarantine.serial !== action.quarantineSerial
      || action.localAt < row.lastQuarantine.watch.observedElapsed - 1e-6) invalid();
    row.lastResume = structuredClone(action); row.resumes++; totals.resumes++;
  } else if (action.kind === 'pirate') {
    const candidate = action.candidate, receipt = candidate.receipt;
    if (state.pirate || receipt.serial <= state.usedLoadSerial || receipt.eventAction > action.serial
      || action.planetId === receipt.planetId || action.arrival.to !== 'orbit'
      || action.arrival.planetId !== action.planetId || action.arrival.serial < candidate.travelAction
      || action.arrival.at < receipt.spaceAt || action.arrival.at >= action.cut.at
      || action.arrival.serial >= action.cut.travelAction
      || state.lastPirateResult && action.battleSerial <= state.lastPirateResult.battle.battleSerial) invalid();
    state.pirate = structuredClone(action); state.usedLoadSerial = receipt.serial; totals.pirates++;
  } else {
    const open = state.pirate, proof = action.battle;
    if (!open || action.openingSerial !== open.serial || proof.battleSerial !== open.battleSerial
      || proof.planetId !== open.planetId || !same(proof.start, open.cut)
      || proof.startedEconomyAt !== open.economyAt || proof.endedAt !== action.cut.at
      || Math.abs(proof.endedEconomyAt - action.economyAt) > 1e-6) invalid();
    totals[proof.outcome === 'won' ? 'victories' : proof.outcome === 'lost' ? 'defeats' : 'retreats']++;
    state.lastPirateResult = structuredClone(action); state.pirate = null;
  }
  if (action.kind === 'quarantine' || action.kind === 'pirate') {
    state.lastAutomatic = { ...eventStampOf(action), serial: action.serial, kind: action.kind };
  }
}
export function appendEventAction(events: SpaceEvents, action: SpaceEventAction): void {
  if (action.serial !== events.nextAction) invalid();
  const next = structuredClone(events.current); applyEventAction(next, action);
  if (events.actions.length === EVENT_TAIL) {
    const oldest = events.actions[0], archived = structuredClone(events.archive.state);
    applyEventAction(archived, oldest);
    events.archive = { through: oldest.serial, stamp: eventStampOf(oldest), state: archived };
    events.actions.shift();
  }
  events.current = next; events.actions.push(structuredClone(action)); events.nextAction++;
}
/** Revision means the next event serial, as on a load receipt. */
export function eventStateAt(events: SpaceEvents | undefined, revision: number): EventSnapshot | null {
  if (!events || revision <= events.archive.through || revision > events.nextAction) return null;
  const state = structuredClone(events.archive.state);
  for (const action of events.actions) { if (action.serial >= revision) break; applyEventAction(state, action); }
  return state;
}
