import { describe, expect, it } from 'vitest';
import type { ColonyWatch, EventBattleProof, EventSnapshot, EventStamp, PirateEvent, PirateResult,
  QuarantineEvent, ResumeEvent, SpaceEventAction, SpaceEvents } from '../src/game/space-events-types';
import { appendEventAction, applyEventAction, automaticEventReady, emptyEventSnapshot, eventActionCount,
  eventColonyOpen, eventStampOf, eventStateAt, quarantineAt, EVENT_REST, EVENT_TAIL,
  QUARANTINE_REARM, QUARANTINE_UNSTABLE } from '../src/game/space-events-content';

/** Prepared PURE snapshots and actions. These checks do not establish biology,
 * paid production, caller permissions, physical battles or native play. */
const stamp = (economyAt: number, at = economyAt): EventStamp => ({ economyAt, warAction: 1,
  cut: { at, tick: Math.round(at * 30), travelAction: 1, lifeAction: 1, economyAction: 1 } });
function fixture(): SpaceEvents {
  return { version: 1, activated: { ...stamp(0), nextCombatSerial: 1, loadCount: 0 },
    archive: { through: 0, stamp: stamp(0), state: emptyEventSnapshot() }, actions: [], nextAction: 1,
    current: emptyEventSnapshot(), watches: [], candidate: null };
}
function quarantine(events: SpaceEvents, economyAt: number, planetId = 'unit-colony-a', localAt = economyAt,
  at = economyAt): QuarantineEvent {
  const colony = events.current.colonies.find(row => row.planetId === planetId);
  return { ...stamp(economyAt, at), serial: events.nextAction, kind: 'quarantine', planetId,
    colonyId: `colony:${planetId}`, watch: { planetId, anchorSerial: colony?.lastResume?.serial ?? 0,
      observedElapsed: localAt, armedAt: { stamp: stamp(economyAt - 12, at - 12), localAt: localAt - 12 }, unstableFor: 12 } };
}
function resume(events: SpaceEvents, economyAt: number, planetId = 'unit-colony-a', localAt = economyAt): ResumeEvent {
  return { ...stamp(economyAt), serial: events.nextAction, kind: 'resume', planetId, localAt,
    quarantineSerial: events.current.colonies.find(row => row.planetId === planetId)!.lastQuarantine.serial };
}
function pirate(events: SpaceEvents, economyAt: number, loadSerial = events.current.usedLoadSerial + 1,
  battleSerial = (events.current.lastPirateResult?.battle.battleSerial ?? 0) + 1): PirateEvent {
  const base = stamp(economyAt), travelAction = events.nextAction * 3 + 3;
  base.cut.travelAction = travelAction; base.cut.economyAction = loadSerial + 1;
  return { ...base, serial: events.nextAction, kind: 'pirate', planetId: 'unit-orbit', battleSerial,
    candidate: { travelAction: travelAction - 3, sold: 8, receipt: { serial: loadSerial, kind: 'load',
      at: economyAt - 20, spaceAt: economyAt - 20, tick: Math.round((economyAt - 20) * 30), lifeAction: 1,
      warAction: 1, eventAction: events.nextAction, planetId: 'unit-production', colonyId: 'colony:unit-production',
      product: 'sun-resin', amount: 2, paid: 0, balanceBefore: 40, balanceAfter: 40 } },
    arrival: { serial: travelAction - 1, at: economyAt - 1, from: 'system', to: 'orbit', planetId: 'unit-orbit' } };
}
function result(events: SpaceEvents, economyAt: number, outcome: EventBattleProof['outcome'] = 'won'): PirateResult {
  const open = events.current.pirate!;
  return { ...stamp(economyAt), serial: events.nextAction, kind: 'pirate-result', openingSerial: open.serial,
    battle: { battleSerial: open.battleSerial, planetId: open.planetId, start: structuredClone(open.cut),
      startedEconomyAt: open.economyAt, outcome, endedAt: economyAt, endedEconomyAt: economyAt,
      shots: outcome === 'won' ? 5 : 1, damage: outcome === 'lost' ? 100 : 8 } };
}
function submit<T extends SpaceEventAction>(events: SpaceEvents, action: T): T {
  appendEventAction(events, action); return action;
}
function rejects(events: SpaceEvents, action: SpaceEventAction): void {
  const before = structuredClone(events);
  expect(() => appendEventAction(events, action)).toThrow('Neplatná návaznost'); expect(events).toEqual(before);
}
function accounting(state: EventSnapshot, count: number): void {
  const t = state.totals;
  expect(eventActionCount(state)).toBe(count);
  expect(t.quarantines).toBe(state.colonies.reduce((sum, row) => sum + row.quarantines, 0));
  expect(t.resumes).toBe(state.colonies.reduce((sum, row) => sum + row.resumes, 0));
  expect(t.quarantines - t.resumes).toBe(state.colonies.filter(eventColonyOpen).length);
  expect(t.pirates).toBe(t.victories + t.retreats + t.defeats + Number(state.pirate !== null));
}

describe('D3c pure quarantine, local evidence and shared automatic rest', () => {
  it('starts independently empty, without an initial300-second incident delay or an assumed quarantine', () => {
    const events = fixture(), other = emptyEventSnapshot();
    expect([EVENT_REST, QUARANTINE_REARM, QUARANTINE_UNSTABLE, EVENT_TAIL]).toEqual([300, 60, 12, 128]);
    expect(automaticEventReady(events.current, 0)).toBe(true);
    expect(quarantineAt(undefined, 'unit-colony-a')).toBeNull(); expect(quarantineAt(events.current, 'unit-colony-a')).toBeNull();
    submit(events, quarantine(events, 12)); expect(other).toEqual(emptyEventSnapshot());
    expect(quarantineAt(events.current, 'unit-colony-a')?.serial).toBe(1); accounting(events.current, 1);
  });

  it('uses economic time for the shared300-second rest, while restoration does not reset the incident timer', () => {
    const events = fixture(); submit(events, quarantine(events, 100)); submit(events, resume(events, 110));
    expect(automaticEventReady(events.current, 399.999)).toBe(false);
    rejects(events, pirate(events, 399.999));
    expect(automaticEventReady(events.current, 400)).toBe(true); submit(events, pirate(events, 400));
    submit(events, result(events, 410, 'retreated'));
    rejects(events, quarantine(events, 699.999, 'unit-colony-b', 30, 45));
    submit(events, quarantine(events, 700, 'unit-colony-b', 30, 45));
    expect(events.current.lastAutomatic).toEqual({ ...stamp(700, 45), serial: 5, kind: 'quarantine' });
    accounting(events.current, 5);
  });

  it('requires12 local unstable seconds after arming, even when much more economic time has passed', () => {
    const events = fixture(), tooShort = quarantine(events, 900, 'unit-colony-a', 30);
    tooShort.watch.unstableFor = 11.999; rejects(events, tooShort);
    const insufficientLocal = quarantine(events, 900, 'unit-colony-a', 30);
    insufficientLocal.watch.armedAt.localAt = 18.001; rejects(events, insufficientLocal);
    const accepted = quarantine(events, 900, 'unit-colony-a', 30); submit(events, accepted);
    expect(quarantineAt(events.current, accepted.planetId)?.watch).toEqual(accepted.watch);
    expect(events.current.totals.quarantines).toBe(1);
  });

  it('restores the exact open crisis, then requires its new anchor and60 local seconds before rearming', () => {
    const events = fixture(); submit(events, quarantine(events, 100, 'unit-colony-a', 30));
    const wrong = resume(events, 110, 'unit-colony-a', 40); wrong.quarantineSerial++; rejects(events, wrong);
    rejects(events, resume(events, 110, 'unit-colony-a', 29.999));
    const restored = submit(events, resume(events, 110, 'unit-colony-a', 40));
    expect(quarantineAt(events.current, 'unit-colony-a')).toBeNull();
    const early = quarantine(events, 400, 'unit-colony-a', 111.999); rejects(events, early);
    const stale = quarantine(events, 400, 'unit-colony-a', 112); stale.watch.anchorSerial = 0; rejects(events, stale);
    const accepted = submit(events, quarantine(events, 400, 'unit-colony-a', 112));
    expect(accepted.watch.armedAt.localAt).toBe(restored.localAt + 60);
    expect(events.current.colonies[0]).toMatchObject({ quarantines: 2, resumes: 1,
      lastResume: restored, lastQuarantine: accepted }); accounting(events.current, 3);
  });

  it('rejects duplicate, mismatched-colony and foreign-watch actions without mutating accepted history', () => {
    const events = fixture(); submit(events, quarantine(events, 100));
    rejects(events, quarantine(events, 400)); submit(events, resume(events, 110));
    rejects(events, resume(events, 120));
    const colony = quarantine(events, 400); colony.colonyId = 'different-paid-colony'; rejects(events, colony);
    const watch = quarantine(events, 400); watch.watch.planetId = 'other-planet'; rejects(events, watch);
    const anchor = quarantine(events, 400, 'unit-new-colony'); anchor.watch.anchorSerial = 2; rejects(events, anchor);
    expect(events.current.colonies).toHaveLength(1); accounting(events.current, 2);
  });

  it('keeps immutable event evidence separate from mutable watches and from caller-owned action objects', () => {
    const events = fixture(), action = quarantine(events, 100);
    const watch: ColonyWatch = structuredClone(action.watch); events.watches.push(watch);
    const candidate = pirate(events, 500).candidate; events.candidate = structuredClone(candidate);
    const observation = structuredClone(events.watches), expected = structuredClone(action); submit(events, action);
    expect(events.watches).toEqual(observation); expect(events.candidate).toEqual(candidate);
    action.watch.armedAt.stamp.cut.at = 999; action.watch.unstableFor = 999;
    watch.observedElapsed = 999; watch.armedAt = null; watch.unstableFor = 0;
    expect(events.actions[0]).toEqual(expected); expect(events.current.colonies[0].lastQuarantine).toEqual(expected);
    const detached = eventStampOf(expected); detached.cut.at = 888; expect(expected.cut.at).toBe(100);
    const replay = emptyEventSnapshot(); applyEventAction(replay, expected); expect(replay).toEqual(events.current);
  });

  it('bounds distinct colony records at31 but permits repeated incidents on an existing restored colony', () => {
    const events = fixture();
    for (let i = 30; i >= 0; i--) submit(events, quarantine(events, (30 - i) * 300 + 100, `unit-colony-${String(i).padStart(2, '0')}`));
    expect(events.current.colonies.map(row => row.planetId)).toEqual(Array.from({ length: 31 }, (_, i) => `unit-colony-${String(i).padStart(2, '0')}`));
    rejects(events, quarantine(events, 9400, 'unit-colony-31'));
    submit(events, resume(events, 9110, 'unit-colony-00'));
    submit(events, quarantine(events, 9400, 'unit-colony-00'));
    expect(events.current.colonies).toHaveLength(31); expect(events.current.colonies[0].quarantines).toBe(2);
    accounting(events.current, 33);
  });
});

describe('D3c pure loaded-cargo incident and immutable physical battle links', () => {
  it.each(['won', 'retreated', 'lost'] as const)('records the exact %s result once, without changing the cargo proof or prior quarantine', outcome => {
    const events = fixture(); const crisis = submit(events, quarantine(events, 100));
    const open = pirate(events, 400), original = structuredClone(open); submit(events, open);
    open.candidate.receipt.amount = 12; open.arrival.at = 999;
    expect(events.current.pirate).toEqual(original); expect(events.current.usedLoadSerial).toBe(original.candidate.receipt.serial);
    const finished = result(events, 410, outcome), expected = structuredClone(finished); submit(events, finished);
    finished.battle.damage = 999;
    expect(events.current.pirate).toBeNull(); expect(events.current.lastPirateResult).toEqual(expected);
    expect(quarantineAt(events.current, crisis.planetId)).toEqual(crisis);
    expect(events.current.lastAutomatic).toMatchObject({ serial: original.serial, kind: 'pirate', economyAt: 400 });
    expect(events.current.totals).toEqual({ quarantines: 1, resumes: 0, pirates: 1,
      victories: Number(outcome === 'won'), retreats: Number(outcome === 'retreated'), defeats: Number(outcome === 'lost') });
    rejects(events, { ...expected, serial: events.nextAction }); accounting(events.current, 3);
  });

  it('requires a subsequent other-planet orbit arrival strictly before the automatic opening frame', () => {
    const events = fixture();
    const mutations: ((action: PirateEvent) => void)[] = [
      action => { action.planetId = action.candidate.receipt.planetId; action.arrival.planetId = action.planetId; },
      action => { action.arrival.to = 'surface'; },
      action => { action.arrival.planetId = 'wrong-orbit'; },
      action => { action.arrival.serial = action.candidate.travelAction - 1; },
      action => { action.arrival.at = action.candidate.receipt.spaceAt - .001; },
      action => { action.arrival.at = action.cut.at; },
      action => { action.arrival.serial = action.cut.travelAction; },
      action => { action.candidate.receipt.eventAction = action.serial + 1; },
    ];
    for (const mutate of mutations) { const action = pirate(events, 100); mutate(action); rejects(events, action); }
    const accepted = pirate(events, 100); accepted.arrival.at = accepted.cut.at - 1 / 60;
    submit(events, accepted); expect(events.current.pirate).toEqual(accepted); accounting(events.current, 1);
  });

  it('allows one ongoing pirate and never reuses an old load or an already completed battle serial', () => {
    const events = fixture(); submit(events, pirate(events, 100, 40, 8));
    rejects(events, pirate(events, 400, 41, 9)); submit(events, result(events, 110));
    rejects(events, pirate(events, 400, 40, 9)); rejects(events, pirate(events, 400, 39, 9));
    rejects(events, pirate(events, 400, 41, 8)); submit(events, pirate(events, 400, 41, 9));
    expect(events.current.usedLoadSerial).toBe(41); expect(events.current.pirate?.battleSerial).toBe(9); accounting(events.current, 3);
  });

  it('rejects result mismatches for opening, battle, destination and every copied start/end cut atomically', () => {
    const events = fixture(); submit(events, pirate(events, 100));
    const mutations: ((action: PirateResult) => void)[] = [
      action => { action.openingSerial++; }, action => { action.battle.battleSerial++; },
      action => { action.battle.planetId = 'other-planet'; }, action => { action.battle.start.at++; },
      action => { action.battle.start.economyAction++; }, action => { action.battle.start.lifeAction++; },
      action => { action.battle.start.travelAction++; }, action => { action.battle.start.tick++; },
      action => { action.battle.startedEconomyAt++; }, action => { action.battle.endedAt++; },
      action => { action.battle.endedEconomyAt += .001; },
    ];
    for (const mutate of mutations) { const action = result(events, 110); mutate(action); rejects(events, action); }
    submit(events, result(events, 110)); accounting(events.current, 2);
  });
});

describe('D3c bounded event archive and historical load-permission revisions', () => {
  it('queries the state before the requested serial, including closure followed by a later quarantine', () => {
    const events = fixture(); submit(events, quarantine(events, 100)); submit(events, resume(events, 110)); submit(events, quarantine(events, 400));
    expect(eventStateAt(undefined, 1)).toBeNull(); expect(eventStateAt(events, 0)).toBeNull(); expect(eventStateAt(events, 5)).toBeNull();
    expect(quarantineAt(eventStateAt(events, 1)!, 'unit-colony-a')).toBeNull();
    expect(quarantineAt(eventStateAt(events, 2)!, 'unit-colony-a')?.serial).toBe(1);
    expect(quarantineAt(eventStateAt(events, 3)!, 'unit-colony-a')).toBeNull();
    expect(quarantineAt(eventStateAt(events, 4)!, 'unit-colony-a')?.serial).toBe(3);
    const detached = eventStateAt(events, 4)!; detached.colonies[0].lastQuarantine.watch.unstableFor = 999;
    expect(events.current.colonies[0].lastQuarantine.watch.unstableFor).toBe(12);
  });

  it('replays171 mixed actions exactly through128-row rollover, including an archived ongoing pirate', () => {
    const events = fixture(), history: SpaceEventAction[] = [], after = new Map<number, EventSnapshot>([[0, emptyEventSnapshot()]]);
    const remember = (action: SpaceEventAction) => {
      submit(events, action); history.push(structuredClone(action)); after.set(action.serial, structuredClone(events.current));
      expect(events.actions).toHaveLength(Math.min(EVENT_TAIL, action.serial));
      expect(events.archive.through).toBe(Math.max(0, action.serial - EVENT_TAIL));
      expect(events.archive.state).toEqual(after.get(events.archive.through));
      accounting(events.current, action.serial); accounting(events.archive.state, events.archive.through);
    };
    for (let cycle = 0; cycle < 42; cycle++) {
      const at = 100 + cycle * 600, planetId = `unit-colony-${cycle % 3}`;
      remember(quarantine(events, at, planetId)); remember(resume(events, at + 10, planetId));
      remember(pirate(events, at + 300)); remember(result(events, at + 310, (['won', 'retreated', 'lost'] as const)[cycle % 3]));
    }
    remember(quarantine(events, 25300, 'unit-colony-0')); remember(resume(events, 25310, 'unit-colony-0')); remember(pirate(events, 25600));
    expect(events.nextAction).toBe(172); expect(events.archive.through).toBe(43);
    expect(events.archive.state.pirate?.serial).toBe(43); expect(events.current.pirate?.serial).toBe(171);
    expect(events.actions).toEqual(history.slice(-128)); expect(events.archive.stamp).toEqual(eventStampOf(history[42]));
    expect(events.current.totals).toEqual({ quarantines: 43, resumes: 43, pirates: 43, victories: 14, retreats: 14, defeats: 14 });
    const replay = structuredClone(events.archive.state); for (const action of events.actions) applyEventAction(replay, action);
    expect(replay).toEqual(events.current);
    for (let revision = events.archive.through + 1; revision <= events.nextAction; revision++)
      expect(eventStateAt(events, revision)).toEqual(after.get(revision - 1));
    expect(eventStateAt(events, events.archive.through)).toBeNull();
    expect(eventStateAt(events, events.nextAction + 1)).toBeNull();
    const archivedBoundary = eventStateAt(events, events.archive.through + 1)!;
    archivedBoundary.pirate!.candidate.receipt.amount = 12; expect(events.archive.state).toEqual(after.get(43));
  });

  it('never evicts accepted history or changes the serial/cache when a full-tail append is refused', () => {
    const events = fixture();
    for (let cycle = 0; cycle < 32; cycle++) {
      const at = 100 + cycle * 600; submit(events, quarantine(events, at)); submit(events, resume(events, at + 10));
      submit(events, pirate(events, at + 300)); submit(events, result(events, at + 310));
    }
    expect(events.actions).toHaveLength(128); expect(events.archive.through).toBe(0);
    rejects(events, quarantine(events, 19299.999));
    const wrongSerial = quarantine(events, 19300); wrongSerial.serial++; rejects(events, wrongSerial);
    submit(events, quarantine(events, 19300));
    expect(events.archive.through).toBe(1); expect(quarantineAt(events.archive.state, 'unit-colony-a')?.serial).toBe(1);
    accounting(events.current, 129); accounting(events.archive.state, 1);
  });
});
