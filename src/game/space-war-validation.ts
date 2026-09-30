import type { GameState } from './types';
import type { SpaceState } from './space-types';
import type { EmpireId } from './space-empires-types';
import type { SpaceEconomyAction } from './space-economy-types';
import type { WarAction, WarBattleProof, WarSnapshot, WarStamp, WarTerritory, ColonyRaid, WarEngagement } from './space-war-types';
import { EMPIRE_IDS } from './space-empires-content';
import { validateEmpireCut } from './space-empires-validation';
import { baseOwnerAt, colonyExistedAt, ALLY_BATTERY, ALLY_SOLAR, ALLY_TRANSFER } from './space-expansion-content';
import { planetSystem, systemDistance } from './galaxy';
import { combatTotals, MILITARY_RESULTS, activeSpaceBattle } from './space-combat-content';
import { warBattleProof } from './space-war';
import { applyWarAction, emptyWarSnapshot, emptyWarTotals, warStateAt, WAR_TAIL, WAR_FIRST_RAID, WAR_PEACE_WAIT, WAR_REDECLARE_WAIT, WAR_RAID_REST, WAR_RAID_WINDOW } from './space-war-content';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
function fail(): never { throw new Error('Neplatná uložená válka, obrana kolonie nebo vojenské vlastnictví.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
function array(v: unknown, max: number): asserts v is unknown[] { if (!Array.isArray(v) || v.length > max) fail(); }
function empire(v: unknown): asserts v is EmpireId { if (!EMPIRE_IDS.includes(v as EmpireId)) fail(); }
const stampKeys = ['cut', 'economyAt'];
const actionKeys = ['serial', 'empireId', ...stampKeys, 'kind'];
const engagementKeys = ['kind', 'empireId', 'declarationSerial', 'orderSerial', 'raidSerial', 'battleSerial', 'planetId'];
const proofKeys = [...engagementKeys, 'start', 'startedEconomyAt', 'outcome', 'endedAt', 'endedEconomyAt', 'shots', 'damage'];
const raidKeys = [...stampKeys, 'serial', 'empireId', 'declarationSerial', 'planetId', 'deadline'];
const actionStamp = (a: WarAction): WarStamp => ({ cut: a.cut, economyAt: a.economyAt });
function before(a: WarStamp, b: WarStamp) {
  return a.economyAt <= b.economyAt + 1e-6 && Object.keys(a.cut).every(k => a.cut[k as keyof typeof a.cut] <= b.cut[k as keyof typeof b.cut] + 1e-6);
}
function stamp(v: WarStamp, s: GameState, ceiling?: WarStamp): void {
  validateEmpireCut(v.cut, s, s.space!.wars!.activated.cut); number(v.economyAt, s.space!.wars!.activated.economyAt, s.space!.economy!.elapsed + 1e-6, false);
  if (v.economyAt - s.space!.wars!.activated.economyAt + 1e-6 < v.cut.at - s.space!.wars!.activated.cut.at || ceiling && !before(v, ceiling)) fail();
}
function foreign(p: SpaceState, id: string): void { if (typeof id !== 'string' || !planetSystem(p.homePlanetId, id)?.index) fail(); }
function engagement(v: WarEngagement, s: GameState, limit: number): void {
  const p = s.space!, w = p.wars!;
  empire(v.empireId); foreign(p, v.planetId);
  if (!['invasion', 'defense'].includes(v.kind)) fail();
  number(v.declarationSerial, 1, limit); number(v.orderSerial, v.declarationSerial + 1, limit);
  number(v.battleSerial, w.activated.nextCombatSerial, p.combat!.archive.battles + p.combat!.battles.length);
  if (v.kind === 'invasion') { if (v.raidSerial !== null) fail(); }
  else number(v.raidSerial, v.declarationSerial + 1, v.orderSerial - 1);
}
function raid(v: ColonyRaid, s: GameState, limit: number, ceiling: WarStamp): void {
  object(v, raidKeys); stamp(v, s, ceiling); empire(v.empireId); foreign(s.space!, v.planetId);
  number(v.serial, 1, limit); number(v.declarationSerial, 1, v.serial - 1);
  if (v.deadline !== v.economyAt + WAR_RAID_WINDOW || !s.space!.economy!.colonies.some(c => c.planetId === v.planetId && c.foundedAt < v.economyAt)) fail();
}
function proof(v: WarBattleProof, s: GameState, limit: number, ceiling: WarStamp, proofs: Map<number, WarBattleProof>): void {
  object(v, proofKeys); engagement(v, s, limit); validateEmpireCut(v.start, s, s.space!.wars!.activated.cut);
  number(v.startedEconomyAt, s.space!.wars!.activated.economyAt, v.endedEconomyAt, false);
  number(v.endedAt, v.start.at, ceiling.cut.at + 1e-6, false); number(v.endedEconomyAt, v.startedEconomyAt, ceiling.economyAt + 1e-6, false);
  number(v.shots, 0, 5); number(v.damage, 0, 10000, false);
  if (!['won', 'retreated', 'lost'].includes(v.outcome) || (v.outcome === 'won') !== (v.shots === 5)
    || !near(v.endedAt - v.start.at, v.endedEconomyAt - v.startedEconomyAt)) fail();
  const retained = s.space!.combat!.battles.find(b => b.serial === v.battleSerial);
  if (retained ? !retained.end || !equal(warBattleProof(retained), v) : v.battleSerial > s.space!.combat!.archive.battles) fail();
  const known = proofs.get(v.battleSerial); if (known && !equal(known, v)) fail(); proofs.set(v.battleSerial, v);
}
function actionShape(a: WarAction, s: GameState, limit: number, ceiling: WarStamp, proofs: Map<number, WarBattleProof>): void {
  const extra = a?.kind === 'declare' ? ['escort'] : a?.kind === 'peace' ? [] : a?.kind === 'engage' ? ['engagement']
    : a?.kind === 'result' ? ['battle'] : a?.kind === 'raid' ? ['planetId', 'declarationSerial', 'deadline']
      : a?.kind === 'expire' ? ['raid'] : a?.kind === 'purchase' ? ['planetId', 'paymentSerial'] : null;
  if (!extra) fail(); object(a, [...actionKeys, ...extra]); number(a.serial, 1, limit); empire(a.empireId); stamp(a, s, ceiling);
  const p = s.space!;
  if (a.kind === 'declare' && a.escort !== null) {
    object(a.escort, ['energy', 'generated', 'delivered']); number(a.escort.energy, 0, ALLY_BATTERY, false);
    number(a.escort.generated, 0, ALLY_SOLAR * a.cut.at + 1e-6, false); number(a.escort.delivered, 0, ALLY_TRANSFER * a.cut.at + 1e-6, false);
    const paid = p.expansion!.actions.find(row => row.kind === 'alliance' && row.empireId === a.empireId);
    if (!paid || paid.serial >= a.cut.economyAction || !near(a.escort.energy, ALLY_BATTERY + a.escort.generated - a.escort.delivered)) fail();
  }
  if (a.kind === 'engage') { object(a.engagement, engagementKeys); engagement(a.engagement, s, a.serial); if (a.engagement.orderSerial !== a.serial || a.engagement.empireId !== a.empireId) fail(); }
  if (a.kind === 'result') { proof(a.battle, s, a.serial - 1, a, proofs); if (a.battle.empireId !== a.empireId || !near(a.battle.endedAt, a.cut.at) || !near(a.battle.endedEconomyAt, a.economyAt)) fail(); }
  if (a.kind === 'raid') raid({ cut: a.cut, economyAt: a.economyAt, serial: a.serial, empireId: a.empireId, declarationSerial: a.declarationSerial, planetId: a.planetId, deadline: a.deadline }, s, a.serial, a);
  if (a.kind === 'expire') { raid(a.raid, s, a.serial - 1, a); if (a.raid.empireId !== a.empireId || a.economyAt < a.raid.deadline - 1e-6) fail(); }
  if (a.kind === 'purchase') {
    foreign(p, a.planetId); number(a.paymentSerial, p.wars!.activated.cut.economyAction, p.economy!.nextAction - 1);
    const paid = p.expansion!.actions.find(row => row.kind === 'territory' && row.serial === a.paymentSerial);
    if (!paid || paid.empireId !== a.empireId || paid.planetId !== a.planetId || paid.warAction !== a.serial
      || a.cut.economyAction !== paid.serial + 1 || a.cut.at !== paid.spaceAt || a.cut.tick !== paid.tick
      || a.cut.travelAction !== paid.travelAction || a.cut.lifeAction !== paid.lifeAction || a.economyAt !== paid.at) fail();
  }
}
function snapshot(v: WarSnapshot, s: GameState, limit: number, ceiling: WarStamp, proofs: Map<number, WarBattleProof>): void {
  object(v, ['relations', 'territories', 'raid', 'engagement', 'totals']); array(v.relations, 3); if (v.relations.length !== 3) fail();
  object(v.totals, Object.keys(emptyWarTotals())); for (const n of Object.values(v.totals)) number(n, 0, limit);
  const t = v.totals, results = MILITARY_RESULTS.reduce((n, k) => n + t[k], 0);
  if (t.declarations + t.peaces + t.invasions + t.defenses + results + t.raids + t.expired + t.purchases !== limit
    || t.raids !== t.defenseVictories + t.defenseRetreats + t.defenseDefeats + t.expired + t.cancelled + (v.raid ? 1 : 0)
    || t.invasions !== t.invasionVictories + t.invasionRetreats + t.invasionDefeats + (v.engagement?.kind === 'invasion' ? 1 : 0)
    || t.defenses !== t.defenseVictories + t.defenseRetreats + t.defenseDefeats + (v.engagement?.kind === 'defense' ? 1 : 0)) fail();
  let declarations = 0, peaces = 0, active = 0;
  for (const [i, r] of v.relations.entries()) {
    object(r, ['empireId', 'declarations', 'peaces', 'active', 'declaration', 'peace', 'suspendedSeconds', 'nextRaidAt']);
    if (r.empireId !== EMPIRE_IDS[i] || typeof r.active !== 'boolean') fail();
    number(r.declarations, 0, t.declarations); number(r.peaces, 0, r.declarations); number(r.suspendedSeconds, 0, ceiling.cut.at - s.space!.wars!.activated.cut.at + 1e-6, false);
    if (r.declarations - r.peaces !== Number(r.active)) fail(); declarations += r.declarations; peaces += r.peaces; active += Number(r.active);
    if (!r.declarations) { if (r.declaration !== null || r.suspendedSeconds !== 0) fail(); }
    else {
      object(r.declaration, [...stampKeys, 'serial', 'escort']); number(r.declaration.serial, 1, limit); stamp(r.declaration, s, ceiling);
      actionShape({ ...r.declaration, empireId: r.empireId, kind: 'declare' }, s, limit, ceiling, proofs);
    }
    if (!r.peaces) { if (r.peace !== null) fail(); }
    else { object(r.peace, [...stampKeys, 'serial']); number(r.peace.serial, 1, limit); stamp(r.peace, s, ceiling); }
    if (r.active) {
      number(r.nextRaidAt, r.declaration!.economyAt + WAR_FIRST_RAID, ceiling.economyAt + WAR_RAID_REST + 1e-6, false);
      if (r.peace && (r.peace.serial >= r.declaration!.serial || r.declaration!.economyAt < r.peace.economyAt + WAR_REDECLARE_WAIT - 1e-6)) fail();
    } else if (r.nextRaidAt !== null || r.peace && (r.peace.serial <= r.declaration!.serial || r.peace.economyAt < r.declaration!.economyAt + WAR_PEACE_WAIT - 1e-6)) fail();
  }
  const elapsed = ceiling.economyAt - s.space!.wars!.activated.economyAt;
  if (t.declarations > Math.floor((elapsed + 1e-6) / (WAR_PEACE_WAIT + WAR_REDECLARE_WAIT)) + 1
    || t.raids && (elapsed < WAR_FIRST_RAID - 1e-6 || t.raids > Math.floor((elapsed - WAR_FIRST_RAID + 1e-6) / WAR_RAID_REST) + 1)) fail();
  if (declarations !== t.declarations || peaces !== t.peaces || active > 1) fail();
  array(v.territories, 31); const ids: string[] = [];
  for (const row of v.territories) {
    object(row, ['planetId', 'owner', 'change']); foreign(s.space!, row.planetId); if (ids.includes(row.planetId)) fail(); ids.push(row.planetId);
    actionShape(row.change, s, limit, ceiling, proofs);
    const c = row.change;
    if (c.kind === 'result') {
      if (c.battle.planetId !== row.planetId) fail();
      if (c.battle.kind === 'invasion' ? c.battle.outcome !== 'won' || row.owner !== 'player' : c.battle.outcome === 'won' || row.owner !== c.empireId) fail();
    } else if (c.kind === 'expire') { if (row.planetId !== c.raid.planetId || row.owner !== c.empireId) fail(); }
    else if (c.kind === 'purchase') { if (row.planetId !== c.planetId || row.owner !== 'player') fail(); }
    else fail();
  }
  if (!equal(ids, [...ids].sort((a, b) => a.localeCompare(b)))) fail();
  if (v.raid !== null) {
    raid(v.raid, s, limit, ceiling); const r = v.relations.find(r => r.empireId === v.raid!.empireId)!;
    if (!r.active || r.declaration!.serial !== v.raid.declarationSerial) fail();
  }
  if (v.engagement !== null) {
    object(v.engagement, engagementKeys); engagement(v.engagement, s, limit);
    const r = v.relations.find(r => r.empireId === v.engagement!.empireId)!;
    if (!r.active || r.declaration!.serial !== v.engagement.declarationSerial || v.engagement.kind === 'defense' && v.raid?.serial !== v.engagement.raidSerial) fail();
  }
}
export function historicalWarOwner(p: SpaceState, state: WarSnapshot, planetId: string, at: WarStamp): WarTerritory['owner'] | null {
  return state.territories.find(row => row.planetId === planetId)?.owner ?? baseOwnerAt(p, planetId, at.cut.economyAction, at.economyAt);
}
export function validateSpaceWars(s: GameState): void {
  const p = s.space!, w = p.wars;
  if (!Object.hasOwn(p, 'wars')) { if ((p.economy?.version ?? 0) >= 5 || (p.combat?.version ?? 0) >= 2) fail(); return; }
  object(w, ['version', 'activated', 'archive', 'actions', 'nextAction', 'current']);
  if (w.version !== 1 || !p.economy || p.economy.version < 5 || !p.combat || p.combat.version < 2 || !p.expansion || !p.empires) fail();
  object(w.activated, [...stampKeys, 'nextCombatSerial']); validateEmpireCut(w.activated.cut, s, p.combat.activated.cut);
  number(w.activated.economyAt, p.combat.activated.economyAt, p.economy.elapsed, false);
  number(w.activated.nextCombatSerial, 1, p.combat.archive.battles + p.combat.battles.length + 1);
  const currentStamp = { cut: { at: p.elapsed, tick: s.tick, travelAction: p.nextSerial, lifeAction: p.expedition!.nextAction, economyAction: p.economy.nextAction }, economyAt: p.economy.elapsed };
  number(w.nextAction, 1); object(w.archive, ['through', 'stamp', 'state']); number(w.archive.through, 0, w.nextAction - 1);
  object(w.archive.stamp, stampKeys); stamp(w.archive.stamp, s, currentStamp);
  array(w.actions, WAR_TAIL); if (w.actions.length !== Math.min(WAR_TAIL, w.nextAction - 1) || w.archive.through + w.actions.length !== w.nextAction - 1) fail();
  const proofs = new Map<number, WarBattleProof>(); snapshot(w.archive.state, s, w.archive.through, w.archive.stamp, proofs);
  if (!w.archive.through && (!equal(w.archive.state, emptyWarSnapshot()) || !equal(w.archive.stamp, { cut: w.activated.cut, economyAt: w.activated.economyAt }))) fail();
  const replay = structuredClone(w.archive.state); let prior: WarStamp = w.archive.stamp;
  for (const [i, a] of w.actions.entries()) {
    actionShape(a, s, w.nextAction - 1, currentStamp, proofs);
    if (a.serial !== w.archive.through + i + 1 || !before(prior, a) || a.economyAt - prior.economyAt + 1e-6 < a.cut.at - prior.cut.at) fail();
    const relation = replay.relations.find(r => r.empireId === a.empireId)!;
    if (a.kind === 'declare' || a.kind === 'peace') {
      const arrival = p.log.find(row => row.serial === a.cut.travelAction - 1), departure = p.log.find(row => row.serial === a.cut.travelAction);
      if (arrival && !['dock', 'orbit'].includes(arrival.to) || a.cut.travelAction === p.nextSerial && p.location && p.location.scale !== 'orbit') fail();
      if (departure && a.cut.at > departure.at - (departure.from === 'dock' ? 0 : 3) + 1 / 30 + 1e-6
        || a.cut.travelAction === p.nextSerial && p.leg && a.cut.at > p.elapsed - p.leg.elapsed + 1e-6) fail();
    }
    if (a.kind === 'declare') {
      const contact = p.empires.actions.find(row => row.kind === 'contact' && row.empireId === a.empireId);
      if (!contact || Object.keys(contact.cut).some(k => contact.cut[k as keyof typeof contact.cut] > a.cut[k as keyof typeof a.cut])) fail();
      const paid = p.expansion.actions.find(row => row.kind === 'alliance' && row.empireId === a.empireId && row.serial < a.cut.economyAction);
      if (!!paid !== !!a.escort) fail();
    }
    if (a.kind === 'engage') {
      const b = p.combat.battles.find(b => b.serial === a.engagement.battleSerial);
      if (b && (!equal(b.start, a.cut) || b.economyAt !== a.economyAt || b.kind !== a.engagement.kind || b.planetId !== a.engagement.planetId
        || !equal(b.war, { empireId: a.empireId, declarationSerial: a.engagement.declarationSerial, orderSerial: a.serial, raidSerial: a.engagement.raidSerial }))) fail();
      const owner = historicalWarOwner(p, replay, a.engagement.planetId, a);
      if (a.engagement.kind === 'invasion' ? owner !== a.empireId : owner !== 'player') fail();
    }
    if (a.kind === 'raid') {
      if (historicalWarOwner(p, replay, a.planetId, a) !== 'player') fail();
      const capital = planetSystem(p.homePlanetId, p.empires.entries.find(e => e.id === a.empireId)!.capitalId)!;
      const targets = p.economy.colonies.filter(c => c.foundedAt < a.economyAt && colonyExistedAt(p, c, a.cut.economyAction, a.economyAt) && historicalWarOwner(p, replay, c.planetId, a) === 'player')
        .map(c => planetSystem(p.homePlanetId, c.planetId)!).sort((x, y) => systemDistance(capital, x) - systemDistance(capital, y) || x.planetId.localeCompare(y.planetId));
      if (targets[0]?.planetId !== a.planetId) fail();
    }
    if (a.kind === 'result' && (!relation.active || a.battle.declarationSerial !== relation.declaration?.serial)) fail();
    applyWarAction(replay, a); prior = actionStamp(a);
  }
  if (!equal(replay, w.current)) fail(); snapshot(w.current, s, w.nextAction - 1, currentStamp, proofs);
  const totals = combatTotals(p);
  for (const key of MILITARY_RESULTS) if ((totals[key] ?? 0) !== w.current.totals[key]) fail();
  const active = activeSpaceBattle(p), engagementNow = w.current.engagement;
  if (!!engagementNow !== !!(active && (active.kind === 'invasion' || active.kind === 'defense'))) fail();
  if (engagementNow && !equal(active!.war, { empireId: engagementNow.empireId, declarationSerial: engagementNow.declarationSerial, orderSerial: engagementNow.orderSerial, raidSerial: engagementNow.raidSerial })) fail();
  if (engagementNow && (active!.serial !== engagementNow.battleSerial || active!.kind !== engagementNow.kind || active!.planetId !== engagementNow.planetId)) fail();
  if (w.current.raid && p.economy.elapsed >= w.current.raid.deadline + 1e-6 && engagementNow?.kind !== 'defense') fail();
  for (const b of p.combat.battles) if ((b.kind === 'invasion' || b.kind === 'defense') && b.serial < w.activated.nextCombatSerial) fail();
  for (const r of w.current.relations) if (r.active) {
    const ally = p.expansion.allies.find(a => a.empireId === r.empireId), escort = r.declaration!.escort;
    if (ally ? !escort || ally.location !== null || !equal(escort, { energy: ally.energy, generated: ally.generated, delivered: ally.delivered }) : escort !== null) fail();
  }
  for (const colony of p.economy.colonies) if (colony.militaryPermission) {
    const permission = colony.militaryPermission; object(permission, ['claim', 'foundingSerial']);
    actionShape(permission.claim, s, w.nextAction - 1, currentStamp, proofs);
    const claim = permission.claim;
    if (claim.kind !== 'result' || claim.battle.kind !== 'invasion' || claim.battle.outcome !== 'won' || claim.battle.planetId !== colony.planetId
      || colony.permission || colony.foundedAt < claim.economyAt) fail();
    number(permission.foundingSerial, claim.cut.economyAction, p.economy.nextAction - 1);
    const found = p.economy.actions.find(row => row.serial === permission.foundingSerial);
    if (found ? found.kind !== 'found' || found.planetId !== colony.planetId || found.at !== colony.foundedAt || found.warAction! <= claim.serial
      : permission.foundingSerial >= p.economy.nextAction - p.economy.actions.length) fail();
  }
  for (const key of MILITARY_RESULTS) {
    const count = [...proofs.values()].filter(b => b.battleSerial <= p.combat!.archive.battles
      && `${b.kind}${b.outcome === 'won' ? 'Victories' : b.outcome === 'lost' ? 'Defeats' : 'Retreats'}` === key).length;
    if (count > (p.combat.archive[key] ?? 0)) fail();
  }
}
/** Called for every v5 economic witness, including permanent copies. */
export function validateWarReceipt(s: GameState, row: SpaceEconomyAction): void {
  const p = s.space!, w = p.wars;
  if (!w || row.serial < w.activated.cut.economyAction) { if (Object.hasOwn(row, 'warAction')) fail(); return; }
  number(row.warAction, 1, w.nextAction); const old = warStateAt(p, row.warAction);
  const beforeRow = w.actions.find(a => a.serial === row.warAction! - 1), afterRow = w.actions.find(a => a.serial === row.warAction);
  const bound = (a: WarAction) => a.cut.at <= row.spaceAt + 1e-6 && a.economyAt <= row.at + 1e-6 && a.cut.tick <= row.tick && a.cut.lifeAction <= row.lifeAction && a.cut.economyAction <= row.serial;
  if (beforeRow && !bound(beforeRow) || afterRow && (afterRow.cut.at < row.spaceAt - 1e-6 || afterRow.economyAt < row.at - 1e-6 || afterRow.cut.economyAction <= row.serial)) fail();
  if (!old) return;
  const snapshotOwner = old.territories.find(t => t.planetId === row.planetId)?.owner ?? baseOwnerAt(p, row.planetId, row.serial, row.at);
  const society = (row.kind === 'repair' || row.kind === 'charge') && row.societyService;
  if (['upgrade', 'load'].includes(row.kind) || (row.kind === 'repair' || row.kind === 'charge') && !society || row.kind === 'equipment' && row.planetId !== p.homePlanetId) { if (snapshotOwner !== 'player') fail(); }
  if (society || row.kind === 'patronage') {
    const occupied = p.economy!.colonies.some(c => c.planetId === row.planetId && colonyExistedAt(p, c, row.serial, row.at)) && snapshotOwner !== 'player';
    if (occupied || snapshotOwner && snapshotOwner !== 'player' && old.relations.find(r => r.empireId === snapshotOwner)!.active) fail();
  }
  if (row.kind === 'found' && snapshotOwner && snapshotOwner !== 'player') fail();
  const embassy = p.empires!.entries.find(e => e.capitalId === row.planetId), counterparty = embassy?.id ?? (snapshotOwner === 'player' ? null : snapshotOwner);
  if ((row.kind === 'sell' || row.kind === 'alliance' || row.kind === 'territory') && counterparty && old.relations.find(r => r.empireId === counterparty)!.active) fail();
}

export function warCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space!, b = cp.space!, now = a.wars, old = b.wars;
  if (!now || !old) return !now && !old;
  const bootstrap = old.nextAction === 1 && old.activated.cut.at === b.elapsed
    && old.activated.cut.economyAction === b.economy!.nextAction && old.activated.economyAt === b.economy!.elapsed;
  if (!bootstrap && !equal(now.activated, old.activated) || !before(old.activated, now.activated)
    || now.activated.nextCombatSerial < old.activated.nextCombatSerial || now.nextAction < old.nextAction || now.archive.through < old.archive.through) return false;
  const cpStamp = { cut: { at: b.elapsed, tick: cp.tick, travelAction: b.nextSerial, lifeAction: b.expedition!.nextAction, economyAction: b.economy!.nextAction }, economyAt: b.economy!.elapsed };
  for (const row of old.actions) {
    const next = now.actions.find(a => a.serial === row.serial);
    if (next ? !equal(next, row) : row.serial > now.archive.through) return false;
  }
  if (now.actions.some(row => row.serial >= old.nextAction && !before(cpStamp, row))) return false;
  if (now.archive.through < old.nextAction) {
    const bridge = structuredClone(old.archive.state);
    for (const row of old.actions) { if (row.serial > now.archive.through) break; applyWarAction(bridge, row); }
    const last = old.actions.find(row => row.serial === now.archive.through);
    const expectedStamp = last ? actionStamp(last) : old.archive.stamp;
    // An empty independently activated checkpoint may legitimately have a
    // later live activation, but may not carry backwards political actions.
    if (!(bootstrap && now.archive.through === 0) && (!equal(bridge, now.archive.state) || !equal(expectedStamp, now.archive.stamp))) return false;
  }
  if (now.archive.through < old.nextAction) {
    const continuation = structuredClone(old.current);
    try { for (const row of now.actions.filter(row => row.serial >= old.nextAction)) applyWarAction(continuation, row); }
    catch { return false; }
    if (!equal(continuation, now.current)) return false;
  }
  for (const key of Object.keys(old.current.totals) as (keyof typeof old.current.totals)[])
    if (now.current.totals[key] < old.current.totals[key]) return false;
  for (const prior of old.current.territories) {
    const current = now.current.territories.find(row => row.planetId === prior.planetId); if (!current) return false;
    if (current.change.serial < old.nextAction ? !equal(current, prior) : !before(cpStamp, current.change)) return false;
  }
  for (const current of now.current.territories) if (!old.current.territories.some(row => row.planetId === current.planetId)
    && (current.change.serial < old.nextAction || !before(cpStamp, current.change))) return false;
  for (const prior of old.current.relations) {
    const current = now.current.relations.find(row => row.empireId === prior.empireId)!;
    if (current.declarations < prior.declarations || current.peaces < prior.peaces || current.suspendedSeconds + 1e-6 < prior.suspendedSeconds) return false;
    for (const [count, field] of [['declarations', 'declaration'], ['peaces', 'peace']] as const) {
      if (current[count] === prior[count]) { if (!equal(current[field], prior[field])) return false; }
      else if (!current[field] || current[field]!.serial < old.nextAction || !before(cpStamp, current[field]!)) return false;
    }
  }
  if (old.current.raid && now.current.raid?.serial === old.current.raid.serial && !equal(now.current.raid, old.current.raid)) return false;
  if (now.current.raid && now.current.raid.serial >= old.nextAction && !before(cpStamp, now.current.raid)) return false;
  const newRows = now.actions.filter(row => row.serial >= old.nextAction);
  if (b.leg && a.nextSerial === b.nextSerial && (now.nextAction - old.nextAction !== newRows.length || newRows.some(row => row.kind !== 'raid' && row.kind !== 'expire'))) return false;
  // No ordinary clock progress can manufacture timer-driven political events.
  if (a.economy!.elapsed === b.economy!.elapsed && newRows.some(row => row.kind === 'raid' || row.kind === 'expire')) return false;
  return true;
}

/** Upper bound from known political intervals. Ecology may reduce production
 * further; a rolled, unknown ownership interval never invents exact history. */
export function ownedColonySeconds(s: GameState, cp: GameState, planetId: string): number {
  const a = s.space!, b = cp.space!, now = a.wars, old = b.wars, dt = a.economy!.elapsed - b.economy!.elapsed;
  if (!now || !old) return dt;
  const starting = historicalWarOwner(b, old.current, planetId, { cut: { at: b.elapsed, tick: cp.tick, travelAction: b.nextSerial, lifeAction: b.expedition!.nextAction, economyAction: b.economy!.nextAction }, economyAt: b.economy!.elapsed });
  const rows = now.actions.filter(row => row.serial >= old.nextAction);
  if (rows.length !== now.nextAction - old.nextAction) {
    const prior = old.current.territories.find(t => t.planetId === planetId), current = now.current.territories.find(t => t.planetId === planetId);
    return starting !== 'player' && equal(prior, current) ? 0 : dt;
  }
  let owner = starting, time = b.economy!.elapsed, allowed = 0;
  for (const row of rows) {
    let next: WarTerritory['owner'] | null = null;
    if (row.kind === 'expire' && row.raid.planetId === planetId) next = row.empireId;
    if (row.kind === 'purchase' && row.planetId === planetId) next = 'player';
    if (row.kind === 'result' && row.battle.planetId === planetId) {
      if (row.battle.kind === 'invasion' && row.battle.outcome === 'won') next = 'player';
      if (row.battle.kind === 'defense' && row.battle.outcome !== 'won') next = row.empireId;
    }
    if (next === null) continue;
    const at = Math.max(time, Math.min(a.economy!.elapsed, row.economyAt));
    if (owner === 'player') allowed += at - time;
    owner = next; time = at;
  }
  if (owner === 'player') allowed += a.economy!.elapsed - time;
  return allowed;
}
