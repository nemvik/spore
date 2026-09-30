import { atWar } from './space-war-content';
import { recordWarPurchase } from './space-war';
import type { GameState } from './types';
import type { EmpireId } from './space-empires-types';
import type { ExpansionKind, ExpansionReceipt } from './space-expansion-types';
import { empireCut } from './space-empires';
import { EMPIRE_IDS, EMPIRE_PROFILES } from './space-empires-content';
import { ALLY_BATTERY, ALLY_REACH, ALLY_SOLAR, ALLY_TRANSFER, EXPANSION_PRICE, alliedEmpire, allyFormation, territoryTitle, ownerAt } from './space-expansion-content';
import { shipCapabilities } from './space-outfit-content';

export function enableSpaceExpansion(s: GameState): void {
  const enable = (state: GameState) => {
    const p = state.space, e = p?.economy;
    if (!p?.outfit || !e || e.version !== 3 || p.expansion) return false;
    p.expansion = { version: 1, activated: empireCut(state), actions: [], allies: [] };
    e.version = 4; e.ledger.alliance = 0; e.ledger.territory = 0; e.counts.alliance = 0; e.counts.territory = 0;
    return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
export function expansionQuote(s: GameState, kind: ExpansionKind, empireId: EmpireId, revision: number) {
  const p = s.space, e = p?.economy, empire = p?.empires?.entries.find(entry => entry.id === empireId);
  const price = kind === 'alliance' || kind === 'territory' ? EXPANSION_PRICE[kind] : 0;
  const reason = !price || !EMPIRE_IDS.includes(empireId) ? 'Neznámá nabídka společnosti.'
    : !p?.expansion || (!e || e.version < 4) || !empire || !p.ship || s.stage !== 5 || s.deathReason || s.player.health <= 0 || p.ship.health <= 0 ? 'Nabídka potřebuje živou vlastní loď.'
      : revision !== e.nextAction ? 'Nabídka už není aktuální. Vyber ji znovu.'
        : atWar(p, empireId) ? 'Během války protistrana nenabízí doprovod ani území.'
        : !p.location || p.leg || p.location.planetId !== empire.capitalId || p.location.scale !== 'surface' || p.location.pos.y > 8
          || Math.hypot(p.location.pos.x, p.location.pos.z) > 12 ? 'Jednej osobně u vyslanectví: povrchový maják do 12 kroků a pod výškou 8.'
          : empire.treaty === null ? 'Nejprve odevzdej zakázku a uzavři obchodní dohodu.'
            : kind === 'alliance' && alliedEmpire(p, empireId) ? 'Zaplacený spojenec už tě doprovází.'
              : kind === 'territory' && (empire.enclave || territoryTitle(p, empire.capitalId)) ? 'Tato soustava už je tvoje.'
                : kind === 'territory' && ownerAt(p, empire.capitalId) !== empireId ? 'Vyslanectví toto území nyní nevlastní.'
                : e.balance < price ? `Cena je ${price} ◈; lodní pokladna má ${e.balance} ◈.` : '';
  return { ok: !reason, reason, price, empire };
}
export function applyExpansionOrder(s: GameState, kind: ExpansionKind, empireId: EmpireId, revision: number): boolean {
  const p = s.space, q = expansionQuote(s, kind, empireId, revision); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const e = p.economy!, empire = q.empire!, before = e.balance;
  const row: ExpansionReceipt = { kind, serial: e.nextAction++, at: e.elapsed, tick: s.tick, spaceAt: p.elapsed,
    lifeAction: p.expedition!.nextAction, ...(p.wars ? { warAction: p.wars.nextAction } : {}), travelAction: p.nextSerial, planetId: empire.capitalId,
    balanceBefore: before, balanceAfter: before - q.price, paid: q.price, empireId, treatySerial: empire.treaty!, shipId: p.ship!.id };
  e.balance = row.balanceAfter; e.ledger[kind]! += q.price; e.counts[kind]!++;
  e.actions.push(row); if (e.actions.length > 128) e.actions.shift(); p.expansion!.actions.push(structuredClone(row));
  if (kind === 'alliance') {
    p.expansion!.allies.push({ id: `${p.homePlanetId}:ally-${empireId}`, empireId, paidSerial: row.serial,
      location: allyFormation(p.location!, empireId), energy: ALLY_BATTERY, generated: 0, delivered: 0 });
    p.notice = `${EMPIRE_PROFILES[empireId].name}: spojenectví uzavřeno za ${q.price} ◈. Doprovod sdílí energii v dosahu 6; vztah +10.`;
  } else { recordWarPurchase(s, empireId, empire.capitalId, row.serial); p.notice = `Soustava je tvoje za ${q.price} ◈. Vyslanectví a dohody zůstávají. Vlastní kolonii založ za 40 ◈ nad stabilním prvním pásem.`; }
  return true;
}
/** Launch, actual arrival and docking are the only address changes. */
export function placeSpaceAllies(s: GameState): void {
  const p = s.space; if (!p?.expansion) return;
  for (const ally of p.expansion.allies) ally.location = p.location && !atWar(p, ally.empireId) ? allyFormation(p.location, ally.empireId) : null;
}
/** Called once per real local flight step. A transition step never transfers,
 * including its final frame; parked home companions have no ticking clock. */
export function stepSpaceAllies(s: GameState, dt: number): void {
  const p = s.space, l = p?.location, stats = p ? shipCapabilities(p) : null;
  if (!p?.expansion || !l || !stats || p.leg || dt <= 0 || !Number.isFinite(dt)) return;
  dt = Math.min(dt, 1 / 30);
  for (const ally of p.expansion.allies) {
    if (!ally.location || atWar(p, ally.empireId)) continue;
    const target = allyFormation(l, ally.empireId), pos = ally.location.pos;
    const dx = target.pos.x - pos.x, dy = target.pos.y - pos.y, dz = target.pos.z - pos.z, distance = Math.hypot(dx, dy, dz);
    const step = Math.min(1, (stats.speed * 1.6 + 2) * dt / Math.max(distance, 1e-9));
    pos.x += dx * step; pos.y += dy * step; pos.z += dz * step; ally.location.heading = l.heading;
    const generated = Math.min(ALLY_BATTERY - ally.energy, ALLY_SOLAR * dt);
    ally.generated += generated; ally.energy += generated;
    if (Math.hypot(pos.x - l.pos.x, pos.y - l.pos.y, pos.z - l.pos.z) > ALLY_REACH) continue;
    const delivered = Math.min(ally.energy, ALLY_TRANSFER * dt, stats.energy - p.ship!.energy);
    ally.delivered += delivered; ally.energy -= delivered; p.ship!.energy += delivered;
  }
}
