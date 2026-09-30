import type { GameState } from './types';
import type { ShipEquipment, EquipmentReceipt } from './space-outfit-types';
import { empireCut } from './space-empires';
import { homeSpaceProblem } from './space';
import { equipmentBadge, EQUIPMENT_IDS, SHIP_EQUIPMENT } from './space-outfit-content';
import { ownerAt } from './space-expansion-content';

/** Explicit opt-in keeps all prior transactions and the D1 pricing boundary. */
export function enableSpaceOutfit(s: GameState): void {
  const enable = (state: GameState) => {
    const p = state.space, e = p?.economy;
    if (!p?.empires || !e || e.version !== 2 || p.outfit) return false;
    p.outfit = { version: 1, catalog: 1, activated: empireCut(state), purchases: [] };
    e.version = 3; e.ledger.equipment = 0; e.counts.equipment = 0; return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
export function equipmentQuote(s: GameState, equipment: ShipEquipment, revision: number) {
  const p = s.space, e = p?.economy, spec = EQUIPMENT_IDS.includes(equipment) ? SHIP_EQUIPMENT[equipment] : undefined;
  const unlock = p && spec ? equipmentBadge(p, equipment) : null;
  const home = !homeSpaceProblem(s), planetId = home ? p!.homePlanetId : p?.location?.planetId ?? '';
  let reason = !spec || !EQUIPMENT_IDS.includes(equipment) ? 'Neznámé lodní vybavení.'
    : !p?.outfit || (!e || e.version < 3) || !p.ship || s.stage !== 5 || s.deathReason || s.player.health <= 0 || p.ship.health <= 0 ? 'Výbavu potřebuje živá vlastní loď.'
      : revision !== e.nextAction ? 'Nabídka už není aktuální. Vyber modul znovu.'
        : p.outfit.purchases.some(row => row.equipment === equipment) ? 'Tento modul už je zaplacený a namontovaný.'
          : !unlock ? `Nejprve získej odznak ${spec.badge} odevzdáním odpovídající zakázky.`
            : !home && (!p.location || p.leg || p.location.scale !== 'surface' || p.location.pos.y > 8
              || Math.hypot(p.location.pos.x, p.location.pos.z) > 12 || !e.colonies.some(c => c.planetId === planetId) || ownerAt(p, planetId) !== 'player')
              ? 'Montáž nabízí domácí dílna nebo vlastní kolonie u majáku do 12 kroků a pod výškou 8.'
              : e.balance < spec.price ? `Modul stojí ${spec.price} ◈; lodní pokladna má ${e.balance} ◈.` : '';
  return { ok: !reason, reason, price: spec?.price ?? 0, unlock, planetId };
}
export function buyShipEquipment(s: GameState, equipment: ShipEquipment, revision: number): boolean {
  const p = s.space, q = equipmentQuote(s, equipment, revision); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const e = p.economy!, before = e.balance;
  const row: EquipmentReceipt = { kind: 'equipment', serial: e.nextAction++, at: e.elapsed, tick: s.tick, spaceAt: p.elapsed,
    lifeAction: p.expedition!.nextAction, travelAction: p.nextSerial, planetId: q.planetId,
    ...(p.wars ? { warAction: p.wars.nextAction } : {}),
    balanceBefore: before, balanceAfter: before - q.price, paid: q.price, catalog: 1, equipment, shipId: p.ship!.id, unlock: q.unlock! };
  e.balance = row.balanceAfter; e.ledger.equipment! += q.price; e.counts.equipment!++;
  e.actions.push(row); if (e.actions.length > 128) e.actions.shift();
  p.outfit!.purchases.push(structuredClone(row));
  p.notice = `${SHIP_EQUIPMENT[equipment].name} namontováno za ${q.price} ◈. ${SHIP_EQUIPMENT[equipment].effect}`;
  return true;
}
