import { coreEntryProblem } from './space-core-content';
import type { GameState } from './types';
import type { DiscoveryAction, RelicId, PatronageReceipt } from './space-discoveries-types';
import { eventStamp } from './space-events';
import { activeSpaceBattle } from './space-combat-content';
import { livingExpedition, livingPlanet, stopClimateTool } from './space-biosphere';
import { stableBandCapacity } from './space-ecology';
import { lifeIdentity } from './space-ecology-history';
import { starSystems } from './galaxy';
import { allocateYoungSociety, appendDiscovery, PATRONAGE_PRICE, relicDiscovery, RELIC_IDS, RELICS, SOCIETY_POSITION, societyProgress, societyUnavailable, WORMHOLE_PRICE, WORMHOLE_SECONDS, wormholeTarget } from './space-discoveries-content';

export type DiscoveryOrder = { kind: 'relic'; relicId: RelicId } | { kind: 'contact' | 'share' | 'accept-patronage' | 'accept-ecology' | 'support' };
/** Preserve live/checkpoint reservations, but activate empty progress separately. */
export function enableSpaceDiscoveries(s: GameState): void {
  const cp = s.checkpoint ? JSON.parse(s.checkpoint) as GameState : null, states = [s, ...(cp ? [cp] : [])];
  const existing = s.space?.discoveries ?? cp?.space?.discoveries;
  const protectedPlanets = existing?.protectedPlanets ?? [...new Set(states.flatMap(v => [
    ...(v.space?.economy?.colonies.map(c => c.planetId) ?? []), ...(v.space?.empires?.entries.map(e => e.capitalId) ?? []),
  ]))].sort();
  const enable = (state: GameState) => {
    const p = state.space;
    if (!p?.events || p.discoveries || p.economy?.version !== 6) return false;
    p.discoveries = { version: 1, activated: eventStamp(state), protectedPlanets: [...protectedPlanets],
      society: allocateYoungSociety(p.homePlanetId, protectedPlanets, p.empires!.entries.map(e => e.capitalId)), actions: [], nextAction: 1, scans: [] };
    p.economy.version = 7; p.economy.ledger.patronage = 0; p.economy.counts.patronage = 0; return true;
  };
  enable(s); if (cp && enable(cp)) s.checkpoint = JSON.stringify(cp);
}
export function discoveryQuote(s: GameState, order: DiscoveryOrder, revision: number) {
  const p = s.space, d = p?.discoveries, l = p?.location, progress = d ? societyProgress(d) : null;
  const relic = order.kind === 'relic' && RELIC_IDS.includes(order.relicId) ? RELICS[order.relicId] : null;
  const planetId = relic && p ? starSystems(p.homePlanetId)[relic.index].planetId : d?.society.planetId ?? '';
  const point = relic ?? SOCIETY_POSITION;
  let reason = !d || !p?.ship || p.ship.health <= 0 || s.stage !== 5 || s.deathReason || s.player.health <= 0 ? 'Průzkum vyžaduje živou vlastní loď.'
    : revision !== d.nextAction ? 'Nabídka už není aktuální. Vyber ji znovu.'
      : p.leg || activeSpaceBattle(p) || !l || l.scale !== 'surface' || l.planetId !== planetId || l.pos.y > 8 || Math.hypot(l.pos.x - point.x, l.pos.z - point.z) > 6
        ? `Přileť k ${relic ? 'reliktu' : 'sídlu'} na povrchu: ${point.x}, ${point.z}, do6 kroků a pod výšku8.` : '';
  if (!reason && d && progress && p) {
    if (order.kind === 'relic') reason = !relic ? 'Neznámý relikt.' : relicDiscovery(d, order.relicId) ? 'Tento relikt už znáš; zůstává na své planetě.' : '';
    else if (societyUnavailable(p)) reason = societyUnavailable(p);
    else if (order.kind === 'contact') reason = progress.contact ? 'Už jste navázali osobní kontakt.' : '';
    else if (!progress.contact) reason = 'Nejprve se osobně představ.';
    else if (order.kind === 'share') reason = progress.shared ? 'Společné poznatky už máte předané.' : !relicDiscovery(d, 'memory') ? 'Prozkoumej Paměť společných kořenů v soustavě20 a vrať se.' : '';
    else if (!progress.shared) reason = 'Nejprve předej skutečně objevenou paměť společné dílny.';
    else if (order.kind === 'accept-patronage' || order.kind === 'accept-ecology') reason = progress.accepted ? 'Dohodnutý způsob pomoci už máte zvolený.' : '';
    else if (order.kind === 'support') {
      if (!progress.accepted) reason = 'Nejprve si zvol konkrétní způsob pomoci.';
      else if (progress.supported) reason = 'Sídlo už spolupracuje a nabízí placený servis.';
      else if (progress.accepted.aid === 'patronage') reason = p.economy!.balance < PATRONAGE_PRICE ? `Patronát stojí40 ◈; lodní pokladna má ${p.economy!.balance} ◈.` : '';
      else {
        const e = livingExpedition(s), world = livingPlanet(s);
        reason = d.scans.length !== 6 ? `Dolož nové placené skeny všech šesti místních rolí: ${d.scans.length}/6.`
          : !e || !world || stableBandCapacity(e, world) < 1 ? 'Před odevzdáním obnov skutečnou10s stabilitu prvního pásu.' : '';
      }
    } else reason = 'Neznámý krok spolupráce.';
  }
  return { ok: !reason, reason, planetId };
}
export function applyDiscoveryOrder(s: GameState, order: DiscoveryOrder, revision: number): boolean {
  const p = s.space, q = discoveryQuote(s, order, revision); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const d = p.discoveries!, e = p.economy!, base = { serial: d.nextAction, planetId: q.planetId, ...eventStamp(s) };
  let action: DiscoveryAction, payment: PatronageReceipt | null = null;
  if (order.kind === 'relic') action = { ...base, kind: 'relic', relicId: order.relicId };
  else if (order.kind === 'contact' || order.kind === 'share') action = { ...base, kind: order.kind };
  else if (order.kind === 'accept-patronage' || order.kind === 'accept-ecology') action = { ...base, kind: 'accept', aid: order.kind === 'accept-patronage' ? 'patronage' : 'ecology' };
  else if (societyProgress(d).accepted!.aid === 'ecology') action = { ...base, kind: 'support', aid: 'ecology', localAt: livingPlanet(s)!.elapsed };
  else {
    payment = { kind: 'patronage', serial: e.nextAction, at: e.elapsed, tick: s.tick, spaceAt: p.elapsed,
      lifeAction: p.expedition!.nextAction, travelAction: p.nextSerial, warAction: p.wars!.nextAction, planetId: q.planetId,
      balanceBefore: e.balance, balanceAfter: e.balance - PATRONAGE_PRICE, paid: PATRONAGE_PRICE,
      discoveryAction: base.serial, shipId: p.ship!.id };
    action = { ...base, kind: 'support', aid: 'patronage', receipt: payment };
  }
  appendDiscovery(d, action);
  if (payment) { e.balance = payment.balanceAfter; e.ledger.patronage! += payment.paid; e.counts.patronage!++; e.nextAction++;
    e.actions.push(payment); if (e.actions.length > 128) e.actions.shift(); }
  p.notice = order.kind === 'relic' ? RELICS[order.relicId].result : order.kind === 'contact' ? 'Kruh prvních světel hledá způsob, jak rozvíjet společnou dílnu. Přivez poznatky z Paměti společných kořenů.'
    : order.kind === 'share' ? 'Z poznatků vyrostla společná dílna. Dohodněte další konkrétní pomoc: patronát nebo ekologické vedení.'
      : order.kind === 'support' ? 'Společné sídlo nabízí placené opravy a dobíjení bez vlastní kolonie. Do dalších cest máš jeho trvalé doporučení.'
        : order.kind === 'accept-patronage' ? 'Patronát dohodnutý: potvrď skutečnou platbu40 ◈ u sídla.' : 'Ekologické vedení dohodnuté. Proskenuj zde nově všech šest rolí a odevzdej výsledek při stabilním prvním pásu.';
  return true;
}
/** Called only after a successful biological action, never by loading or UI. */
export function observeSocietyScans(s: GameState): void {
  const p = s.space, d = p?.discoveries, e = p?.expedition;
  if (!p || !d || e?.version !== 2 || societyUnavailable(p)) return;
  const progress = societyProgress(d), accepted = progress.accepted;
  if (!accepted || accepted.aid !== 'ecology' || progress.supported || d.scans.length === 6) return;
  for (const receipt of e.actions) {
    if (receipt.kind !== 'scan' || receipt.serial < accepted.cut.lifeAction || receipt.planetId !== d.society.planetId) continue;
    const identity = lifeIdentity(e, receipt.lifeId);
    if (identity && !d.scans.some(proof => proof.role === identity.role)) d.scans.push({ role: identity.role, receipt: structuredClone(receipt) });
  }
}
export function wormholeQuote(s: GameState, revision: number) {
  const p = s.space, l = p?.location, d = p?.discoveries, found = relicDiscovery(d, 'passage');
  const target = p && l ? wormholeTarget(p, l.planetId) : null;
  let reason = !p?.ship || !d || !l || p.ship.health <= 0 || s.deathReason || s.player.health <= 0 ? 'Nejprve vzlétni vlastní lodí.'
    : revision !== d.nextAction ? 'Navigace se změnila. Vyber průchod znovu.'
      : !found ? 'Nejprve osobně prozkoumej Ulitu vzdálených proudů v soustavě5.'
        : !target ? 'Průchod spojuje pouze soustavy5 a22.' : p.leg ? 'Dokonči probíhající let.'
          : l.scale !== 'system' || Math.hypot(l.pos.x, l.pos.z) > 24 ? 'Pro průchod vystoupej do soustavy a přibliž se k majáku do24 kroků.'
            : p.ship.energy < WORMHOLE_PRICE ? 'Průchod potřebuje14 energie. Zastav a dobij loď.' : '';
  if (!reason && p && target) reason = coreEntryProblem(p.core, p.homePlanetId, target.planetId);
  return { ok: !reason, reason, target, price: WORMHOLE_PRICE, found };
}
export function enterWormhole(s: GameState, revision: number): boolean {
  const p = s.space, q = wormholeQuote(s, revision); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  p.ship!.energy -= q.price; stopClimateTool(s);
  p.leg = { from: structuredClone(p.location!), to: { scale: 'system', planetId: q.target!.planetId, systemId: q.target!.id, pos: { x: 0, y: 0, z: 0 }, heading: 0 },
    elapsed: 0, duration: WORMHOLE_SECONDS, energyPaid: q.price, passage: { kind: 'wormhole', relicSerial: q.found!.serial } };
  p.notice = `Červí díra do soustavy ${q.target!.name} ·14 energie ·6 sekund. Náklad a doprovod letí s tebou.`;
  return true;
}
