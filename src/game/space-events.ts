import type { GameState } from './types';
import type { SpaceBattle } from './space-combat-types';
import type { SpaceEconomyAction } from './space-economy-types';
import type { EventBattleProof, EventStamp } from './space-events-types';
import { empireCut } from './space-empires';
import { livingExpedition, livingPlanet } from './space-biosphere';
import { bandCondition, stableBandCapacity } from './space-ecology';
import { ownerAt } from './space-expansion-content';
import { activeSpaceBattle } from './space-combat-content';
import { beginSpaceBattle, pirateQuote } from './space-combat';
import { planetSystem } from './galaxy';
import { appendEventAction, automaticEventReady, emptyEventSnapshot, quarantineAt, QUARANTINE_REARM, QUARANTINE_UNSTABLE } from './space-events-content';

export const eventStamp = (s: GameState, economyAt = s.space!.economy!.elapsed): EventStamp =>
  ({ cut: empireCut(s), economyAt, warAction: s.space!.wars!.nextAction });
/** Loading never calls this parser-side. The UI opts live and checkpoint in
 * independently without turning historical cargo or ecology into incidents. */
export function enableSpaceEvents(s: GameState): void {
  const enable = (state: GameState) => {
    const p = state.space; if (!p?.wars || p.events || p.economy?.version !== 5) return false;
    const current = emptyEventSnapshot(), activated = { ...eventStamp(state), nextCombatSerial: p.combat!.archive.battles + p.combat!.battles.length + 1, loadCount: p.economy.counts.load };
    p.events = { version: 1, activated, archive: { through: 0, stamp: eventStamp(state), state: structuredClone(current) },
      actions: [], nextAction: 1, current, watches: [], candidate: null };
    p.economy.version = 6; return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
/** Called only after a real paid-account action was appended. */
export function observeEventCargo(s: GameState, receipt: SpaceEconomyAction): void {
  const p = s.space, events = p?.events; if (!p || !events) return;
  if (receipt.kind === 'load' && receipt.eventAction !== undefined) {
    events.candidate = { receipt: { ...receipt, eventAction: receipt.eventAction }, travelAction: p.nextSerial,
      sold: p.economy!.sales.find(row => row.planetId === receipt.planetId)?.amount ?? 0 };
  } else if (receipt.kind === 'sell' && events.candidate?.receipt.planetId === receipt.originPlanetId) events.candidate = null;
}
export function resumeColonyQuote(s: GameState, planetId: string, revision: number) {
  const p = s.space, events = p?.events, l = p?.location, e = livingExpedition(s), world = livingPlanet(s);
  let reason = '';
  if (!p?.ship || !events || s.stage !== 5 || s.deathReason || s.player.health <= 0 || p.ship.health <= 0) reason = 'Nejprve připrav živou vlastní loď.';
  else if (revision !== events.nextAction) reason = 'Stav událostí se změnil. Vyber nabídku znovu.';
  else if (!quarantineAt(events.current, planetId)) reason = 'Tato kolonie není v karanténě.';
  else if (p.leg || activeSpaceBattle(p) || !l || l.scale !== 'surface' || l.planetId !== planetId || l.pos.y > 8 || Math.hypot(l.pos.x, l.pos.z) > 12)
    reason = 'Přileť k povrchovému majáku postižené kolonie do 12 kroků a klesni pod výšku 8.';
  else if (ownerAt(p, planetId) !== 'player') reason = 'Kolonii obsadila protistrana. Nejprve ji získej zpět.';
  else if (!e || !world || stableBandCapacity(e, world) < 1)
    reason = `Nejprve obnov první živý pás a jeho 10s stabilitu. ${e && world ? bandCondition(e, world, 1).reason + '.' : ''}`;
  return { ok: !reason, reason };
}
export function resumeColony(s: GameState, planetId: string, revision: number): boolean {
  const p = s.space, q = resumeColonyQuote(s, planetId, revision); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const events = p.events!, world = livingPlanet(s)!, serial = events.nextAction;
  appendEventAction(events, { ...eventStamp(s), serial, kind: 'resume', planetId,
    quarantineSerial: quarantineAt(events.current, planetId)!.serial, localAt: world.elapsed });
  const watch = events.watches.find(row => row.planetId === planetId)!;
  Object.assign(watch, { anchorSerial: serial, observedElapsed: world.elapsed, armedAt: null, unstableFor: 0 });
  p.notice = 'Karanténa ukončena. Kolonie znovu vyrábí a vydává původní zásoby. Loď ani účet se nezměnily.';
  return true;
}
export interface EcologyObservation { planetId: string; before: number; after: number }
/** The caller supplies the actual world-clock delta from this surface frame.
 * No watch advances from orbit, a flight, a wreck, rendering or an import. */
function observeColony(s: GameState, observation: EcologyObservation | null): void {
  const p = s.space!, events = p.events!, e = livingExpedition(s), world = livingPlanet(s);
  if (!observation || !e || !world || world.id !== observation.planetId || observation.after !== world.elapsed
    || observation.after <= observation.before || observation.after - observation.before > 1 / 30 + 1e-6
    || p.leg || !p.ship || p.ship.health <= 0 || ownerAt(p, world.id) !== 'player') return;
  const colony = p.economy!.colonies.find(row => row.planetId === world.id);
  if (!colony || quarantineAt(events.current, world.id)) return;
  let watch = events.watches.find(row => row.planetId === world.id);
  if (!watch) {
    watch = { planetId: world.id, anchorSerial: 0, observedElapsed: observation.before, armedAt: null, unstableFor: 0 };
    events.watches.push(watch); events.watches.sort((a, b) => a.planetId.localeCompare(b.planetId));
  }
  if (Math.abs(watch.observedElapsed - observation.before) > 1e-6) { watch.armedAt = null; watch.unstableFor = 0; }
  watch.observedElapsed = observation.after;
  const stable = stableBandCapacity(e, world) >= 1;
  if (stable) {
    watch.unstableFor = 0;
    const resumed = events.current.colonies.find(row => row.planetId === world.id)?.lastResume;
    if (!watch.armedAt && (!resumed || world.elapsed >= resumed.localAt + QUARANTINE_REARM - 1e-6))
      watch.armedAt = { stamp: eventStamp(s), localAt: world.elapsed };
    return;
  }
  if (!watch.armedAt) return;
  watch.unstableFor += observation.after - observation.before;
  if (watch.unstableFor < QUARANTINE_UNSTABLE - 1e-6 || !automaticEventReady(events.current, p.economy!.elapsed)) return;
  appendEventAction(events, { ...eventStamp(s), serial: events.nextAction, kind: 'quarantine', planetId: world.id, colonyId: colony.id,
    watch: { ...structuredClone(watch), armedAt: structuredClone(watch.armedAt) } });
  watch.armedAt = null; watch.unstableFor = 0;
  p.notice = `Karanténa kolonie ${planetSystem(p.homePlanetId, world.id)!.name}: ${bandCondition(e, world, 1).reason.toLowerCase()}. Výroba a nakládka čekají. Obnov první živý pás a u majáku zprovozni kolonii.`;
}
/** After synchronized economy/space clocks and before this frame's production.
 * A frame that began in flight cannot start a new battle on arrival. */
export function stepSpaceEvents(s: GameState, observation: EcologyObservation | null, canStartPirate: boolean): void {
  const p = s.space, events = p?.events;
  if (!p || !events || s.stage !== 5 || s.deathReason || s.player.health <= 0) return;
  observeColony(s, observation);
  const candidate = events.candidate, l = p.location;
  if (!canStartPirate || !candidate || !l || !automaticEventReady(events.current, p.economy!.elapsed)
    || events.current.pirate || p.wars!.current.raid || p.wars!.current.relations.some(row => row.active)) return;
  const receipt = candidate.receipt, cargo = p.economy!.cargo.find(row => row.planetId === receipt.planetId);
  if (!cargo || cargo.amount < receipt.amount || (p.economy!.sales.find(row => row.planetId === receipt.planetId)?.amount ?? 0) !== candidate.sold) {
    events.candidate = null; return;
  }
  const arrival = p.log.at(-1), serial = p.combat!.archive.battles + p.combat!.battles.length + 1;
  if (!arrival || arrival.to !== 'orbit' || arrival.planetId !== l.planetId || arrival.serial < candidate.travelAction
    || arrival.at >= p.elapsed || l.planetId === receipt.planetId || !pirateQuote(s, serial).ok) return;
  appendEventAction(events, { ...eventStamp(s), serial: events.nextAction, kind: 'pirate', planetId: l.planetId,
    candidate: structuredClone(candidate), arrival: { ...arrival }, battleSerial: serial });
  beginSpaceBattle(s, 'pirate'); events.candidate = null;
  p.notice = 'Piráti zachytili nově dovezenou produkci. Mezerník: pulz za 3 energie, WASD: manévr, R/V: ústup. Náklad zůstává tvůj; boj nevyžaduje návrat domů.';
}
export function eventBattleProof(battle: SpaceBattle): EventBattleProof {
  if (battle.kind !== 'pirate' || !battle.end) throw new Error('Chybí dokončený pirátský boj události.');
  return { battleSerial: battle.serial, planetId: battle.planetId, start: { ...battle.start }, startedEconomyAt: battle.economyAt,
    outcome: battle.end.outcome, endedAt: battle.end.at, endedEconomyAt: battle.end.economyAt, shots: battle.shots, damage: battle.damage };
}
export function finishEventBattle(s: GameState, battle: SpaceBattle): void {
  const events = s.space?.events, opening = events?.current.pirate;
  if (!events || !opening || opening.battleSerial !== battle.serial) return;
  const proof = eventBattleProof(battle);
  appendEventAction(events, { ...eventStamp(s, proof.endedEconomyAt), serial: events.nextAction, kind: 'pirate-result', openingSerial: opening.serial, battle: proof });
}
