import type { GameState } from './types';
import type { EmpireId } from './space-empires-types';
import type { SpaceBattle } from './space-combat-types';
import type { WarBattleProof, WarEngagement, WarStamp } from './space-war-types';
import { empireCut } from './space-empires';
import { EMPIRE_IDS, EMPIRE_PROFILES } from './space-empires-content';
import { ownerAt, allyFormation } from './space-expansion-content';
import { planetSystem, systemDistance } from './galaxy';
import { activeSpaceBattle, MILITARY_RESULTS } from './space-combat-content';
import { beginSpaceBattle, pirateQuote } from './space-combat';
import { appendWarAction, emptyWarSnapshot, atWar, warRelation, WAR_FIRST_RAID, WAR_PEACE_WAIT, WAR_REDECLARE_WAIT, WAR_RAID_WINDOW } from './space-war-content';

export const warStamp = (s: GameState, economyAt = s.space!.economy!.elapsed): WarStamp => ({ cut: empireCut(s), economyAt });
/** Explicit upgrade preserves every old receipt and combat result verbatim. */
export function enableSpaceWars(s: GameState): void {
  const enable = (state: GameState) => {
    const p = state.space; if (!p?.combat || p.wars || p.economy?.version !== 4) return false;
    const current = emptyWarSnapshot(), activated = { ...warStamp(state), nextCombatSerial: p.combat.archive.battles + p.combat.battles.length + 1 };
    p.wars = { version: 1, activated, archive: { through: 0, stamp: warStamp(state), state: structuredClone(current) }, actions: [], nextAction: 1, current };
    p.economy.version = 5; p.combat.version = 2;
    for (const key of MILITARY_RESULTS) p.combat.archive[key] = 0;
    return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
export type WarOrder = 'declare' | 'peace' | 'invasion' | 'defense';
export function warQuote(s: GameState, kind: WarOrder, empireId: EmpireId, revision: number) {
  const p = s.space, w = p?.wars, r = p ? warRelation(p, empireId) : null,
    empire = p?.empires?.entries.find(entry => entry.id === empireId);
  let reason = '';
  if (!EMPIRE_IDS.includes(empireId) || !['declare', 'peace', 'invasion', 'defense'].includes(kind)) reason = 'Neznámá válečná nabídka.';
  else if (!p?.ship || !w || !empire || !r || s.stage !== 5 || s.deathReason || s.player.health <= 0 || p.ship.health <= 0) reason = 'Nejprve připrav živou vlastní loď.';
  else if (revision !== w.nextAction) reason = 'Válečná situace se změnila. Vyber nabídku znovu.';
  else if (p.leg || activeSpaceBattle(p)) reason = 'Nejprve dokonči skutečný let nebo probíhající boj.';
  else if (empire.contact === null) reason = 'Nejprve navazuj osobní kontakt s touto říší.';
  else if (kind === 'declare' || kind === 'peace') {
    if (p.location && p.location.scale !== 'orbit') reason = 'Rádiovou diplomacii použij doma nebo na orbitě.';
    else if (kind === 'declare') {
      if (w.current.relations.some(entry => entry.active)) reason = 'Nejprve ukonči probíhající válku.';
      else {
        const lastPeace = Math.max(0, ...w.current.relations.map(entry => entry.peace?.economyAt ?? -WAR_REDECLARE_WAIT));
        if (w.current.totals.peaces && p.economy!.elapsed < lastPeace + WAR_REDECLARE_WAIT - 1e-6)
          reason = `Příměří chrání klid ještě ${Math.ceil(lastPeace + WAR_REDECLARE_WAIT - p.economy!.elapsed)}s.`;
      }
    } else if (!r.active || !r.declaration) reason = 'S touto říší už je mír.';
    else if (p.economy!.elapsed < r.declaration.economyAt + WAR_PEACE_WAIT - 1e-6)
      reason = `Vyjednávání potrvá ještě ${Math.ceil(r.declaration.economyAt + WAR_PEACE_WAIT - p.economy!.elapsed)}s.`;
  } else if (!r.active) reason = 'Nejprve vědomě vyhlas válku této říši.';
  else {
    reason = pirateQuote(s, p.combat!.archive.battles + p.combat!.battles.length + 1).reason;
    const planetId = p.location?.planetId;
    if (!reason && kind === 'invasion' && ownerAt(p, planetId!) !== empireId) reason = 'Invaze patří na orbitu skutečně nepřátelského území.';
    if (!reason && kind === 'defense') {
      const raid = w.current.raid;
      if (!raid || raid.empireId !== empireId || raid.planetId !== planetId || p.economy!.elapsed >= raid.deadline)
        reason = 'Přileť před termínem na orbitu konkrétní napadené kolonie.';
    }
  }
  return { ok: !reason, reason };
}
export function applyWarOrder(s: GameState, kind: WarOrder, empireId: EmpireId, revision: number): boolean {
  const p = s.space, q = warQuote(s, kind, empireId, revision); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const w = p.wars!, base = { ...warStamp(s), serial: w.nextAction, empireId };
  if (kind === 'declare') {
    const ally = p.expansion!.allies.find(ally => ally.empireId === empireId);
    const escort = ally ? { energy: ally.energy, generated: ally.generated, delivered: ally.delivered } : null;
    appendWarAction(p, { ...base, kind, escort }); if (ally) ally.location = null;
    p.notice = `Válka: ${EMPIRE_PROFILES[empireId].name}. Obchod i doprovod protistrany čekají. Protiútok může přijít po ${WAR_FIRST_RAID}s; na obranu pak máš ${WAR_RAID_WINDOW}s.`;
  } else if (kind === 'peace') {
    appendWarAction(p, { ...base, kind });
    const ally = p.expansion!.allies.find(ally => ally.empireId === empireId);
    if (ally) ally.location = p.location ? allyFormation(p.location, empireId) : null;
    p.notice = 'Příměří přijato. Nájezdy končí, vlastnictví zůstává. Obchod a původní doprovod znovu slouží; další válka nejdříve za 180s.';
  } else {
    const engagement: WarEngagement = { kind, empireId, declarationSerial: warRelation(p, empireId)!.declaration!.serial,
      orderSerial: w.nextAction, raidSerial: kind === 'defense' ? w.current.raid!.serial : null,
      battleSerial: p.combat!.archive.battles + p.combat!.battles.length + 1, planetId: p.location!.planetId };
    appendWarAction(p, { ...base, kind: 'engage', engagement });
    beginSpaceBattle(s, kind, { empireId, declarationSerial: engagement.declarationSerial, orderSerial: engagement.orderSerial, raidSerial: engagement.raidSerial });
    p.notice = `${kind === 'invasion' ? 'Invaze' : 'Obrana kolonie'}: ${EMPIRE_PROFILES[empireId].name}. Mezerník: pulz za 3. WASD manévruje; R/V ustoupí. ${kind === 'defense' ? 'Prohra nebo ústup předá kolonii protivníkovi.' : 'Vítězství získá tuto planetu.'}`;
  }
  return true;
}
export function warBattleProof(b: SpaceBattle): WarBattleProof {
  if (!b.war || b.kind !== 'invasion' && b.kind !== 'defense' || !b.end) throw new Error('Chybí dokončený válečný boj.');
  return { ...b.war, kind: b.kind, battleSerial: b.serial, planetId: b.planetId, start: { ...b.start }, startedEconomyAt: b.economyAt,
    outcome: b.end.outcome, endedAt: b.end.at, endedEconomyAt: b.end.economyAt, shots: b.shots, damage: b.damage };
}
/** Synchronous with the actual shot/hit/accepted retreat, never from import. */
export function finishWarBattle(s: GameState, battle: SpaceBattle): void {
  if (battle.kind !== 'invasion' && battle.kind !== 'defense') return;
  const p = s.space!, proof = warBattleProof(battle);
  appendWarAction(p, { ...warStamp(s, proof.endedEconomyAt), serial: p.wars!.nextAction, empireId: proof.empireId, kind: 'result', battle: proof });
  const result = proof.kind === 'invasion' ? proof.outcome === 'won' ? 'Planeta je tvoje. Stabilní svět může získat placenou kolonii.' : 'Invaze skončila bez změny vlastnictví.'
    : proof.outcome === 'won' ? 'Kolonie útok odrazila. Výroba a služby pokračují.' : 'Kolonii obsadila protistrana. Stavby i zásoby zůstaly; výroba a služby čekají na zpětné získání.';
  p.notice = result + (proof.outcome === 'lost' ? ' Loď je vrak; spusť 12s nouzovou opravu vpravo.' : ' Další boj nejdříve za 90s letu.');
}
export function recordWarPurchase(s: GameState, empireId: EmpireId, planetId: string, paymentSerial: number): void {
  const p = s.space!; if (!p.wars) return;
  appendWarAction(p, { ...warStamp(s), serial: p.wars.nextAction, empireId, kind: 'purchase', planetId, paymentSerial });
}
/** Called after the real economy clock advances and before colony production. */
export function stepSpaceWars(s: GameState): void {
  const p = s.space, w = p?.wars; if (!p || !w) return;
  const r = w.current.relations.find(r => r.active); if (!r?.declaration) return;
  const raid = w.current.raid, time = p.economy!.elapsed;
  if (raid) {
    if (time < raid.deadline - 1e-8 || w.current.engagement?.kind === 'defense' && w.current.engagement.raidSerial === raid.serial) return;
    appendWarAction(p, { ...warStamp(s), serial: w.nextAction, empireId: r.empireId, kind: 'expire', raid: structuredClone(raid) });
    p.notice = `Kolonie ${planetSystem(p.homePlanetId, raid.planetId)!.name} nebyla ubráněna. Stavby i zásoby zůstaly, výroba a služby čekají na zpětné získání.`;
    return;
  }
  if (r.nextRaidAt === null || time < r.nextRaidAt - 1e-8) return;
  const capital = planetSystem(p.homePlanetId, p.empires!.entries.find(e => e.id === r.empireId)!.capitalId)!;
  const candidates = p.economy!.colonies.filter(c => ownerAt(p, c.planetId) === 'player').map(c => planetSystem(p.homePlanetId, c.planetId)!)
    .sort((a, b) => systemDistance(capital, a) - systemDistance(capital, b) || a.planetId.localeCompare(b.planetId));
  if (!candidates.length) return;
  const target = candidates[0];
  appendWarAction(p, { ...warStamp(s), serial: w.nextAction, empireId: r.empireId, kind: 'raid', planetId: target.planetId,
    declarationSerial: r.declaration.serial, deadline: time + WAR_RAID_WINDOW });
  p.notice = `Protiútok na kolonii ${target.name}: 180s na přílet a zahájení obrany na orbitě. Můžeš také vyjednat příměří. Stav ukazuje panel Válka.`;
}
/** The embassy remains the market counterparty even on a purchased capital. */
export function embargoEmpire(s: GameState, planetId: string): EmpireId | null {
  const p = s.space; if (!p?.wars) return null;
  const embassy = p.empires!.entries.find(e => e.capitalId === planetId), owner = ownerAt(p, planetId);
  const counterparty = embassy?.id ?? (owner !== 'player' ? owner : null);
  return counterparty && atWar(p, counterparty) ? counterparty : null;
}
