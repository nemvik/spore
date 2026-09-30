import { describe, expect, it } from 'vitest';
import type { EmpireId } from '../src/game/space-empires-types';
import type { SpaceState } from '../src/game/space-types';
import type { SuspendedEscort, WarAction, WarBattleProof, WarEngagement, WarSnapshot, WarTotals } from '../src/game/space-war-types';
import { allySuspendedTime, appendWarAction, applyWarAction, atWar, emptyWarSnapshot, emptyWarTotals,
  raidFromAction, warPenalty, warRelation, warStateAt, WAR_FIRST_RAID, WAR_PEACE_WAIT, WAR_RAID_REST,
  WAR_RAID_WINDOW, WAR_REDECLARE_WAIT, WAR_TAIL } from '../src/game/space-war-content';

/** Prepared PURE unit states/actions. This suite verifies the political kernel,
 * not physical battles, earned money, caller permissions or native play. */
type Order = { [K in WarAction['kind']]: Omit<Extract<WarAction, { kind: K }>, 'serial' | 'empireId' | 'cut' | 'economyAt'> }[WarAction['kind']];
const cut = (at: number) => ({ at, tick: Math.round(at * 30), travelAction: 1, lifeAction: 1, economyAction: 1 });
function fixture(): SpaceState {
  const stamp = { cut: cut(0), economyAt: 0 };
  return { version: 1, homePlanetId: 'unit-home', elapsed: 0, ship: null, location: null, leg: null,
    log: [], nextSerial: 1, notice: '', wars: { version: 1, activated: { ...stamp, nextCombatSerial: 1 },
      archive: { through: 0, stamp: structuredClone(stamp), state: emptyWarSnapshot() },
      actions: [], nextAction: 1, current: emptyWarSnapshot() } };
}
const state = (p: SpaceState) => p.wars!.current;
const relation = (p: SpaceState, empire: EmpireId = 'resin') => warRelation(p, empire)!;
function order(p: SpaceState, body: Order, economyAt: number, empireId: EmpireId = 'resin', at = economyAt): WarAction {
  return { serial: p.wars!.nextAction, empireId, cut: cut(at), economyAt, ...body } as WarAction;
}
function submit(p: SpaceState, action: WarAction): WarAction {
  appendWarAction(p, action); p.elapsed = action.cut.at; return action;
}
const declare = (p: SpaceState, economyAt = 0, empire: EmpireId = 'resin', escort: SuspendedEscort | null = null, at = economyAt) =>
  submit(p, order(p, { kind: 'declare', escort }, economyAt, empire, at));
const peace = (p: SpaceState, economyAt: number, empire: EmpireId = 'resin', at = economyAt) =>
  submit(p, order(p, { kind: 'peace' }, economyAt, empire, at));
function raid(p: SpaceState, economyAt: number, planetId = 'unit-colony', empire: EmpireId = 'resin') {
  return submit(p, order(p, { kind: 'raid', planetId, declarationSerial: relation(p, empire).declaration!.serial,
    deadline: economyAt + WAR_RAID_WINDOW }, economyAt, empire)) as Extract<WarAction, { kind: 'raid' }>;
}
function engage(p: SpaceState, economyAt: number, kind: WarEngagement['kind'] = 'invasion', planetId = 'unit-capital', empire: EmpireId = 'resin') {
  const t = state(p).totals, engagement: WarEngagement = { empireId: empire, declarationSerial: relation(p, empire).declaration!.serial,
    orderSerial: p.wars!.nextAction, raidSerial: kind === 'defense' ? state(p).raid!.serial : null,
    battleSerial: t.invasions + t.defenses + 1, kind, planetId };
  return submit(p, order(p, { kind: 'engage', engagement }, economyAt, empire)) as Extract<WarAction, { kind: 'engage' }>;
}
function result(p: SpaceState, economyAt: number, outcome: WarBattleProof['outcome'] = 'won') {
  const engagement = state(p).engagement!, start = p.wars!.actions.find(a => a.serial === engagement.orderSerial)!;
  const battle: WarBattleProof = { ...engagement, start: structuredClone(start.cut), startedEconomyAt: start.economyAt,
    outcome, endedAt: economyAt, endedEconomyAt: economyAt, shots: outcome === 'won' ? 5 : 1, damage: outcome === 'lost' ? 25 : 8 };
  return submit(p, order(p, { kind: 'result', battle }, economyAt, engagement.empireId)) as Extract<WarAction, { kind: 'result' }>;
}
function expire(p: SpaceState, economyAt: number) {
  const r = state(p).raid!;
  return submit(p, order(p, { kind: 'expire', raid: structuredClone(r) }, economyAt, r.empireId));
}
const purchase = (p: SpaceState, economyAt: number, planetId = 'unit-capital', empire: EmpireId = 'resin') =>
  submit(p, order(p, { kind: 'purchase', planetId, paymentSerial: p.wars!.nextAction + 10 }, economyAt, empire));
const territory = (p: SpaceState, planetId: string) => state(p).territories.find(row => row.planetId === planetId);
function rejects(p: SpaceState, action: WarAction) {
  const saved = structuredClone(p); expect(() => appendWarAction(p, action)).toThrow('Neplatná návaznost'); expect(p).toEqual(saved);
}
function actionCount(t: WarTotals) {
  return t.declarations + t.peaces + t.invasions + t.defenses + t.invasionVictories + t.invasionRetreats + t.invasionDefeats
    + t.defenseVictories + t.defenseRetreats + t.defenseDefeats + t.raids + t.expired + t.purchases;
}
function accounting(s: WarSnapshot, count: number) {
  const t = s.totals;
  expect(actionCount(t)).toBe(count);
  expect(t.raids).toBe(t.defenseVictories + t.defenseRetreats + t.defenseDefeats + t.expired + t.cancelled + Number(s.raid !== null));
  expect(t.invasions).toBe(t.invasionVictories + t.invasionRetreats + t.invasionDefeats + Number(s.engagement?.kind === 'invasion'));
  expect(t.defenses).toBe(t.defenseVictories + t.defenseRetreats + t.defenseDefeats + Number(s.engagement?.kind === 'defense'));
  expect(t.declarations).toBe(s.relations.reduce((n, r) => n + r.declarations, 0));
  expect(t.peaces).toBe(s.relations.reduce((n, r) => n + r.peaces, 0));
}

describe('D3b pure political declaration, peace and escort transitions', () => {
  it('starts with three independent neutral records and safely handles an absent opt-in', () => {
    const p = fixture(), second = emptyWarSnapshot();
    expect(state(p).relations.map(r => r.empireId)).toEqual(['resin', 'roots', 'basalt']);
    expect(state(p).totals).toEqual(emptyWarTotals()); expect(state(p).territories).toEqual([]);
    state(p).relations[0].declarations = 9; expect(second.relations[0].declarations).toBe(0);
    delete p.wars; expect(warRelation(p, 'resin')).toBeNull(); expect(atWar(p, 'resin')).toBe(false);
    expect(warPenalty(p, 'resin')).toBe(0); expect(allySuspendedTime(p, 'resin')).toBe(0); expect(warStateAt(p, 1)).toBeNull();
  });

  it('requires sixty economic seconds for peace and a global180-second peace across different opponents', () => {
    const p = fixture(); declare(p, 100);
    expect(atWar(p, 'resin')).toBe(true); expect(warPenalty(p, 'resin')).toBe(30);
    expect(relation(p).nextRaidAt).toBe(100 + WAR_FIRST_RAID);
    rejects(p, order(p, { kind: 'declare', escort: null }, 110, 'roots'));
    rejects(p, order(p, { kind: 'peace' }, 100 + WAR_PEACE_WAIT - .001));
    const acceptedPeace = peace(p, 160); expect(warPenalty(p, 'resin')).toBe(10); expect(relation(p).nextRaidAt).toBeNull();
    expect(relation(p).peace).toEqual({ serial: acceptedPeace.serial, cut: cut(160), economyAt: 160 });
    rejects(p, order(p, { kind: 'declare', escort: null }, 160 + WAR_REDECLARE_WAIT - .001, 'roots'));
    declare(p, 340, 'roots'); peace(p, 400, 'roots');
    rejects(p, order(p, { kind: 'declare', escort: null }, 579.999, 'basalt'));
    declare(p, 580, 'basalt'); expect(atWar(p, 'basalt')).toBe(true); expect(atWar(p, 'resin')).toBe(false);
    accounting(state(p), 5);
  });

  it('caps only the permanent penalty, while repeat declarations remain possible without a campaign limit', () => {
    const p = fixture();
    for (let i = 0; i < 5; i++) {
      declare(p, i * 240); expect(warPenalty(p, 'resin')).toBe(Math.min(30, (i + 1) * 10) + 20);
      peace(p, i * 240 + 60); expect(warPenalty(p, 'resin')).toBe(Math.min(30, (i + 1) * 10));
    }
    expect(relation(p)).toMatchObject({ declarations: 5, peaces: 5, active: false }); accounting(state(p), 10);
  });

  it('counts only actual space time of wars that started with an existing paid escort and never edits its receipt values', () => {
    const p = fixture(), escort = { energy: 7, generated: 20, delivered: 25 };
    declare(p, 100, 'resin', null, 10); p.elapsed = 40; expect(allySuspendedTime(p, 'resin')).toBe(0);
    peace(p, 160, 'resin', 40); expect(relation(p).suspendedSeconds).toBe(0);
    declare(p, 340, 'resin', escort, 50); const captured = structuredClone(relation(p).declaration!.escort);
    escort.energy = 0; escort.generated = 999; p.elapsed = 70;
    expect(allySuspendedTime(p, 'resin')).toBe(20); expect(captured).toEqual({ energy: 7, generated: 20, delivered: 25 });
    peace(p, 400, 'resin', 70); expect(relation(p).suspendedSeconds).toBe(20); expect(relation(p).declaration!.escort).toEqual(captured);
    p.elapsed = 80; expect(allySuspendedTime(p, 'resin')).toBe(20);
    declare(p, 580, 'resin', captured, 80); p.elapsed = 85; expect(allySuspendedTime(p, 'resin')).toBe(25);
    peace(p, 640, 'resin', 85); expect(relation(p).suspendedSeconds).toBe(25); accounting(state(p), 6);
  });
});

describe('D3b pure invasion, colony raid and permanent ownership overlay', () => {
  it.each(['won', 'retreated', 'lost'] as const)('an invasion %s changes ownership only for a victory, retaining the exact immutable proof', outcome => {
    const p = fixture(); declare(p); engage(p, 1); const receipt = result(p, 5, outcome);
    expect(state(p).engagement).toBeNull();
    if (outcome === 'won') {
      expect(territory(p, 'unit-capital')).toEqual({ planetId: 'unit-capital', owner: 'player', change: receipt });
      receipt.battle.damage = 999; expect((territory(p, 'unit-capital')!.change as typeof receipt).battle.damage).toBe(8);
    } else expect(territory(p, 'unit-capital')).toBeUndefined();
    expect(state(p).totals).toMatchObject({ invasions: 1, invasionVictories: Number(outcome === 'won'),
      invasionRetreats: Number(outcome === 'retreated'), invasionDefeats: Number(outcome === 'lost') });
    const beforePeace = structuredClone(state(p).territories); peace(p, 60); expect(state(p).territories).toEqual(beforePeace); accounting(state(p), 4);
  });

  it.each(['won', 'retreated', 'lost'] as const)('a defense %s resolves the pending raid and transfers the colony only for a loss or accepted retreat', outcome => {
    const p = fixture(); purchase(p, 0, 'unit-colony'); declare(p, 1); const original = structuredClone(territory(p, 'unit-colony'));
    raid(p, 91); engage(p, 100, 'defense', 'unit-colony'); const receipt = result(p, 110, outcome);
    expect(state(p).raid).toBeNull(); expect(state(p).engagement).toBeNull(); expect(relation(p).nextRaidAt).toBe(110 + WAR_RAID_REST);
    if (outcome === 'won') expect(territory(p, 'unit-colony')).toEqual(original);
    else expect(territory(p, 'unit-colony')).toEqual({ planetId: 'unit-colony', owner: 'resin', change: receipt });
    expect(state(p).totals).toMatchObject({ raids: 1, defenses: 1, defenseVictories: Number(outcome === 'won'),
      defenseRetreats: Number(outcome === 'retreated'), defenseDefeats: Number(outcome === 'lost'), expired: 0, cancelled: 0 });
    accounting(state(p), 5);
  });

  it('expires an ignored raid at its real deadline, then permits military recapture without changing the prior paid title', () => {
    const p = fixture(); const title = purchase(p, 0, 'unit-colony'); declare(p, 1); const announced = raid(p, 91);
    expect(state(p).raid).toEqual(raidFromAction(announced));
    rejects(p, order(p, { kind: 'expire', raid: structuredClone(state(p).raid!) }, 270.999));
    const expired = expire(p, 271); expect(territory(p, 'unit-colony')).toMatchObject({ owner: 'resin', change: expired });
    expect(relation(p).nextRaidAt).toBe(451); engage(p, 280, 'invasion', 'unit-colony'); const reclaimed = result(p, 285);
    expect(territory(p, 'unit-colony')).toMatchObject({ owner: 'player', change: reclaimed });
    expect(p.wars!.actions[0]).toEqual(title); expect(state(p).territories).toHaveLength(1); accounting(state(p), 6);
  });

  it('keeps a defense begun before the deadline playable afterwards, but does not accept a new defense at the deadline', () => {
    const p = fixture(); declare(p); raid(p, 90); const untouched = structuredClone(p);
    const engaged = { empireId: 'resin' as const, declarationSerial: 1, orderSerial: 3, raidSerial: 2,
      battleSerial: 1, kind: 'defense' as const, planetId: 'unit-colony' };
    rejects(p, order(p, { kind: 'engage', engagement: engaged }, 270));
    expect(p).toEqual(untouched); engage(p, 269.99, 'defense', 'unit-colony');
    rejects(p, order(p, { kind: 'expire', raid: structuredClone(state(p).raid!) }, 280));
    result(p, 300); expect(state(p).totals.defenseVictories).toBe(1); expect(state(p).totals.expired).toBe(0);
    expect(relation(p).nextRaidAt).toBe(480); accounting(state(p), 4);
  });

  it('expires a remote raid while an invasion is active, then preserves both independent results', () => {
    const p = fixture(); declare(p); raid(p, 90); engage(p, 100, 'invasion', 'unit-capital');
    const ongoing = structuredClone(state(p).engagement); expire(p, 270); expect(state(p).engagement).toEqual(ongoing);
    result(p, 280); expect(territory(p, 'unit-colony')!.owner).toBe('resin'); expect(territory(p, 'unit-capital')!.owner).toBe('player');
    expect(state(p).territories.map(row => row.planetId)).toEqual(['unit-capital', 'unit-colony']); accounting(state(p), 5);
  });

  it('peace cancels only a waiting raid and never rewinds an already lost colony or pays a new title', () => {
    const p = fixture(); declare(p); raid(p, 90); expire(p, 270); raid(p, 450, 'unit-second');
    const ownership = structuredClone(state(p).territories); peace(p, 451);
    expect(state(p).raid).toBeNull(); expect(state(p).territories).toEqual(ownership);
    expect(state(p).totals).toMatchObject({ raids: 2, expired: 1, cancelled: 1, purchases: 0 }); accounting(state(p), 5);
  });

  it('a later actual paid transfer supersedes an enemy overlay and survives another war and peace', () => {
    const p = fixture(); declare(p); raid(p, 90); expire(p, 270); peace(p, 271);
    const paid = purchase(p, 272, 'unit-colony'); expect(territory(p, 'unit-colony')).toMatchObject({ owner: 'player', change: paid });
    declare(p, 451); peace(p, 511); expect(territory(p, 'unit-colony')).toMatchObject({ owner: 'player', change: paid });
    expect(state(p).territories).toHaveLength(1); accounting(state(p), 7);
  });

  it('rejects early, mismatched and duplicate orders atomically without counting an unaccepted action', () => {
    const p = fixture(); declare(p);
    rejects(p, order(p, { kind: 'purchase', planetId: 'unit-capital', paymentSerial: 3 }, 1));
    rejects(p, order(p, { kind: 'raid', planetId: 'unit-colony', declarationSerial: 1, deadline: 269.999 }, 89.999));
    rejects(p, order(p, { kind: 'raid', planetId: 'unit-colony', declarationSerial: 9, deadline: 270 }, 90));
    rejects(p, order(p, { kind: 'raid', planetId: 'unit-colony', declarationSerial: 1, deadline: 271 }, 90));
    raid(p, 90); const duplicate = order(p, { kind: 'raid', planetId: 'unit-colony', declarationSerial: 1, deadline: 271 }, 91); rejects(p, duplicate);
    engage(p, 100, 'defense', 'unit-colony'); rejects(p, order(p, { kind: 'peace' }, 110));
    rejects(p, order(p, { kind: 'purchase', planetId: 'unit-neutral', paymentSerial: 4 }, 110, 'roots'));
    const valid = structuredClone(p); const accepted = result(valid, 110);
    const bad = structuredClone(accepted); bad.battle.battleSerial++; rejects(p, bad);
    const wrongTime = structuredClone(accepted); wrongTime.battle.endedAt++; rejects(p, wrongTime);
    submit(p, accepted); rejects(p, accepted); accounting(state(p), 4);
  });
});

describe('D3b bounded128-action history and exact archived political state', () => {
  it('replays350 mixed actions exactly across active battle and pending raid boundaries, without limiting repeated wars', () => {
    const p = fixture(), history: WarAction[] = [], after = new Map<number, WarSnapshot>([[0, emptyWarSnapshot()]]);
    const remember = (action: WarAction) => { history.push(structuredClone(action)); after.set(action.serial, structuredClone(state(p))); accounting(state(p), action.serial); };
    for (let cycle = 0; cycle < 35; cycle++) {
      const t = cycle * 641, colony = `unit-colony-${cycle % 3}`, outcome = (['won', 'retreated', 'lost'] as const)[cycle % 3];
      remember(declare(p, t)); remember(engage(p, t + 1)); remember(result(p, t + 5));
      remember(raid(p, t + 90, colony)); remember(engage(p, t + 91, 'defense', colony)); remember(result(p, t + 100, outcome));
      remember(raid(p, t + 280, colony)); remember(expire(p, t + 460)); remember(peace(p, t + 461)); remember(purchase(p, t + 462, colony));
      expect(p.wars!.actions.length).toBe(Math.min(WAR_TAIL, history.length));
      expect(p.wars!.archive.through).toBe(Math.max(0, history.length - WAR_TAIL));
      expect(p.wars!.archive.state).toEqual(after.get(p.wars!.archive.through));
      accounting(p.wars!.archive.state, p.wars!.archive.through);
    }
    const w = p.wars!, boundary = history[w.archive.through - 1];
    expect(w.nextAction).toBe(351); expect(w.archive.through).toBe(222); expect(w.actions).toEqual(history.slice(-128));
    expect(w.archive.stamp).toEqual({ cut: boundary.cut, economyAt: boundary.economyAt });
    expect(w.archive.state.engagement?.kind).toBe('invasion'); expect(state(p).totals).toMatchObject({ declarations: 35, peaces: 35, invasions: 35, defenses: 35,
      invasionVictories: 35, raids: 70, expired: 35, cancelled: 0, purchases: 35, defenseVictories: 12, defenseRetreats: 12, defenseDefeats: 11 });
    const replay = structuredClone(w.archive.state); for (const action of w.actions) applyWarAction(replay, action); expect(replay).toEqual(w.current);
    for (let revision = w.archive.through + 1; revision <= w.nextAction; revision++) expect(warStateAt(p, revision)).toEqual(after.get(revision - 1));
    expect(warStateAt(p, 0)).toBeNull(); expect(warStateAt(p, w.archive.through)).toBeNull(); expect(warStateAt(p, w.nextAction + 1)).toBeNull();
    const query = warStateAt(p, w.nextAction)!; query.territories[0].owner = 'basalt'; query.relations[0].declarations = 0;
    expect(w.current).toEqual(after.get(350)); expect(w.archive.state).toEqual(after.get(222));
  });

  it('a rejected append at the full tail cannot roll away the oldest accepted action or damage the cache', () => {
    const p = fixture();
    for (let cycle = 0; cycle < 64; cycle++) { declare(p, cycle * 240); peace(p, cycle * 240 + 60); }
    expect(p.wars!.actions).toHaveLength(128); expect(p.wars!.archive.through).toBe(0);
    rejects(p, order(p, { kind: 'declare', escort: null }, 63 * 240 + 239.999));
    declare(p, 64 * 240); expect(p.wars!.archive.through).toBe(1); expect(p.wars!.archive.state.relations[0].active).toBe(true);
    accounting(state(p), 129); accounting(p.wars!.archive.state, 1);
  });
});
