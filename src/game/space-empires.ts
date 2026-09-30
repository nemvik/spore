import { firstInheritanceUse } from './lineage-history';
import { atWar, warPenalty } from './space-war-content';
import type { GameState } from './types';
import type { SpaceProduct } from './space-economy-types';
import type { EmpireAction, EmpireCut, EmpireId, EmpireMissionKind, SpaceEmpire, SpacePriceBasis } from './space-empires-types';
import { allocateEmpires, EMPIRE_PROFILES, empireSurveyTarget } from './space-empires-content';
import { PHILOSOPHY_NAMES, empireAffinity, spaceInheritance } from './space-inheritance';
import { lifeIdentity } from './space-ecology-history';
import { spaceMarketPrice } from './space-products';
import { alliedEmpire } from './space-expansion-content';

export type EmpireOrder = { kind: 'contact' | 'accept' | 'accept-survey' | 'complete' | 'treaty'; empireId: EmpireId };
export const empireAt = (s: GameState, planetId: string) => s.space?.empires?.entries.find(empire => empire.capitalId === planetId) ?? null;
export const empireCut = (s: GameState): EmpireCut => ({ at: s.space!.elapsed, tick: s.tick,
  travelAction: s.space!.nextSerial, lifeAction: s.space!.expedition!.nextAction, economyAction: s.space!.economy!.nextAction });

/** Explicit opt-in only. Use the same territorial reservation for the live save
 * and its older checkpoint, without copying a contact or payment backwards. */
export function enableSpaceEmpires(s: GameState): void {
  const cp = s.checkpoint ? JSON.parse(s.checkpoint) as GameState : null;
  const existing = s.space?.empires ?? cp?.space?.empires;
  const protectedColonies = existing?.protectedColonies ?? [...new Set([s, ...(cp ? [cp] : [])]
    .flatMap(state => state.space?.economy?.colonies.map(colony => colony.planetId) ?? []))].sort();
  const enable = (state: GameState) => {
    const p = state.space;
    if (!p?.economy || p.empires || p.expedition?.version !== 2 || p.expedition.biosphere.version !== 2) return false;
    p.empires = { version: 1, activated: empireCut(state), protectedColonies: [...protectedColonies], inheritance: null,
      entries: allocateEmpires(p.homePlanetId, protectedColonies), actions: [], nextAction: 1 };
    p.economy.version = 2; p.economy.pricingActivatedAction = p.economy.nextAction;
    return true;
  };
  enable(s); if (cp && enable(cp)) s.checkpoint = JSON.stringify(cp);
}
export function empireRelation(s: GameState, empire: SpaceEmpire): number {
  return empire.contact === null ? 0 : empireAffinity(s.space?.empires?.inheritance ?? null, empire.id) + (empire.mission?.completed !== null && empire.mission?.completed !== undefined ? 30 : 0) + (s.space && alliedEmpire(s.space, empire.id) && !atWar(s.space, empire.id) ? 10 : 0) - (s.space ? warPenalty(s.space, empire.id) : 0);
}
export function missionProgress(empire: SpaceEmpire): number {
  const mission = empire.mission; if (!mission) return 0;
  return mission.kind === 'trade' ? mission.evidence.reduce((sum, witness) => sum + (witness.kind === 'trade' ? witness.receipt.amount : 0), 0) : mission.evidence.length;
}
export const missionTarget = (kind: EmpireMissionKind) => kind === 'trade' ? 8 : kind === 'ecology' ? 6 : 1;
export function empireQuote(s: GameState, order: EmpireOrder, revision: number) {
  const p = s.space, registry = p?.empires, empire = registry?.entries.find(empire => empire.id === order.empireId);
  let reason = !registry || !p?.ship || !empire || s.stage !== 5 || s.deathReason || s.player.health <= 0 || p.ship.health <= 0 ? 'Kontakt potřebuje živou vlastní loď.'
    : revision !== registry.nextAction ? 'Tato nabídka už není aktuální. Vyber ji znovu.'
      : atWar(p, empire.id) ? 'Během války jsou zakázky a dohody protistrany pozastavené.'
      : !p.location || p.leg || p.location.scale !== 'surface' || p.location.planetId !== empire.capitalId
        || p.location.pos.y > 8 || Math.hypot(p.location.pos.x, p.location.pos.z) > 12 ? 'Vrať se k vyslanectví: povrchový maják do 12 kroků, výška nejvýše 8.' : '';
  if (!reason && empire) {
    if (order.kind === 'contact') reason = empire.contact !== null ? 'Kontakt už jste navázali.' : '';
    else if (empire.contact === null) reason = 'Nejprve se osobně představ.';
    else if (order.kind === 'accept' || order.kind === 'accept-survey') reason = empire.mission ? 'Tuto první zakázku už máš přijatou.'
      : order.kind === 'accept-survey' && empire.id !== 'roots' ? 'Náhradní průzkum nabízí Kořenový sněm.' : '';
    else if (order.kind === 'complete') reason = !empire.mission ? 'Nejprve přijmi konkrétní zakázku.'
      : empire.mission.completed !== null ? 'Výsledek této zakázky už byl přijat.'
        : missionProgress(empire) < missionTarget(empire.mission.kind) ? 'Nejprve dokonči nové činnosti uvedené v zakázce.' : '';
    else if (order.kind === 'treaty') reason = empire.treaty !== null ? 'Obchodní dohoda už platí.'
      : !empire.mission || empire.mission.completed === null ? 'Dohodu nabídneme po osobním odevzdání zakázky.' : '';
    else reason = 'Neznámá diplomatická akce.';
  }
  return { ok: !reason, reason, empire };
}
export function applyEmpireOrder(s: GameState, order: EmpireOrder, revision: number): boolean {
  const q = empireQuote(s, order, revision), p = s.space; if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const registry = p.empires!, empire = q.empire!, serial = registry.nextAction++, cut = empireCut(s);
  let action: EmpireAction;
  if (order.kind === 'contact') {
    registry.inheritance ??= spaceInheritance(s); empire.contact = serial;
    action = { serial, empireId: empire.id, cut, kind: 'contact' };
    p.notice = `${EMPIRE_PROFILES[empire.id].name}: ${EMPIRE_PROFILES[empire.id].greeting}`;
    const affinity = empireAffinity(registry.inheritance, empire.id);
    const civic = registry.inheritance.civilization.map(m=>({trade:'Obchod',military:'Vojsko',conversion:'Konverze'}[m])).join(' + ');
    if (affinity && firstInheritanceUse(s, 'civilization', `${civic?civic+' a ':''}historie druhu → ${PHILOSOPHY_NAMES[registry.inheritance.philosophy]}, vztah +${affinity}.`)) p.notice += ` Dědictví druhu: ${civic?civic+' a ':''}minulé činy → ${PHILOSOPHY_NAMES[registry.inheritance.philosophy]}, vztah +${affinity}. Původ najdeš v J.`;
  } else if (order.kind === 'accept' || order.kind === 'accept-survey') {
    const kind = order.kind === 'accept-survey' ? 'survey' : EMPIRE_PROFILES[empire.id].mission;
    const targetPlanetId = kind === 'survey' ? empireSurveyTarget(p.homePlanetId, empire) : empire.capitalId;
    empire.mission = { kind, targetPlanetId, accepted: serial, completed: null, evidence: [] };
    action = { serial, empireId: empire.id, cut, kind: 'accept', missionKind: kind, targetPlanetId };
    p.notice = 'Zakázka přijata. Počítají se nové činnosti od této chvíle; výsledek odevzdej osobně zde.';
  } else if (order.kind === 'complete') {
    empire.mission!.completed = serial;
    action = { serial, empireId: empire.id, cut, kind: 'complete' };
    p.notice = `${EMPIRE_PROFILES[empire.id].name}: výsledek přijat, vztah +30. Můžeme uzavřít obchodní dohodu.`;
  } else {
    empire.treaty = serial;
    action = { serial, empireId: empire.id, cut, kind: 'treaty' };
    p.notice = `Dohoda platí pro další skutečné prodeje na našem trhu: +${empireAffinity(registry.inheritance, empire.id) ? 2 : 1} za kus.`;
  }
  registry.actions.push(action); return true;
}

/** Run inside successful transactions and after ordinary completed flight steps.
 * Witnesses outlive the bounded source logs; rendering/loading never earns them. */
export function observeSpaceEmpires(s: GameState): void {
  const p = s.space, registry = p?.empires, life = p?.expedition, economy = p?.economy;
  if (!p || !registry || life?.version !== 2 || !economy || !p.ship || p.ship.health <= 0 || s.deathReason || s.player.health <= 0) return;
  for (const empire of registry.entries) {
    const mission = empire.mission;
    if (atWar(p, empire.id) || !mission || mission.completed !== null || missionProgress(empire) >= missionTarget(mission.kind)) continue;
    const accepted = registry.actions.find(action => action.serial === mission.accepted)!.cut;
    if (mission.kind === 'trade') {
      for (const receipt of economy.actions) {
        if (receipt.kind !== 'sell' || receipt.serial < accepted.economyAction || receipt.planetId !== mission.targetPlanetId
          || mission.evidence.some(witness => witness.receipt.serial === receipt.serial)) continue;
        mission.evidence.push({ kind: 'trade', receipt: structuredClone(receipt) });
        if (missionProgress(empire) >= 8) break;
      }
    } else if (mission.kind === 'ecology') {
      for (const receipt of life.actions) {
        if (receipt.kind !== 'scan' || receipt.serial < accepted.lifeAction || receipt.planetId !== mission.targetPlanetId) continue;
        const identity = lifeIdentity(life, receipt.lifeId);
        if (!identity || mission.evidence.some(witness => witness.kind === 'ecology' && witness.role === identity.role)) continue;
        mission.evidence.push({ kind: 'ecology', receipt: structuredClone(receipt), role: identity.role });
      }
    } else {
      const receipt = p.log.find(row => row.serial >= accepted.travelAction && row.to === 'surface' && row.planetId === mission.targetPlanetId);
      if (receipt) mission.evidence.push({ kind: 'survey', receipt: structuredClone(receipt) });
    }
  }
}
export function spaceSalePrice(s: GameState, marketPlanetId: string, product: SpaceProduct): { price: number | null; basis: SpacePriceBasis | null } {
  const p = s.space, base = p ? spaceMarketPrice(p.homePlanetId, marketPlanetId, product) : null;
  if (base === null || !p || !p.economy || p.economy.version < 2) return { price: base, basis: null };
  const empire = empireAt(s, marketPlanetId), treaty = empire?.treaty ?? null;
  const bonus = treaty === null ? 0 : empireAffinity(p.empires!.inheritance, empire!.id) ? 2 : 1;
  return { price: base + bonus, basis: { version: 1, base, empireId: empire?.id ?? null,
    treatySerial: treaty, relationRevision: treaty === null ? null : empire!.mission!.completed, bonus } };
}
