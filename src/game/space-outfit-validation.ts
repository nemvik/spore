import { validateWarReceipt } from './space-war-validation';
import type { GameState } from './types';
import type { EquipmentReceipt } from './space-outfit-types';
import { EQUIPMENT_IDS, SHIP_EQUIPMENT } from './space-outfit-content';
import { validateEmpireCut } from './space-empires-validation';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function fail(): never { throw new Error('Neplatná uložená lodní výbava nebo její platba.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
const rowCut = (row: EquipmentReceipt) => ({ at: row.spaceAt, tick: row.tick, lifeAction: row.lifeAction, travelAction: row.travelAction, economyAction: row.serial });
export function validateSpaceOutfit(s: GameState): void {
  const p = s.space!, outfit = p.outfit, e = p.economy;
  if (!Object.hasOwn(p, 'outfit')) { if ((e?.version ?? 1) >= 3) fail(); return; }
  object(outfit, ['version', 'catalog', 'activated', 'purchases']);
  if (outfit.version !== 1 || outfit.catalog !== 1 || (!e || e.version < 3) || !p.empires || p.expedition?.version !== 2 || p.expedition.biosphere.version !== 2) fail();
  validateEmpireCut(outfit.activated, s, p.empires.activated);
  if (!Array.isArray(outfit.purchases) || outfit.purchases.length > 3) fail();
  if (e.counts.equipment !== outfit.purchases.length) fail();
  let paid = 0, previous = outfit.activated, previousEconomicTime = 0;
  const seen = new Set<string>();
  for (const row of outfit.purchases) {
    object(row, ['kind', 'serial', 'at', 'tick', 'spaceAt', 'lifeAction', 'travelAction', 'planetId', 'balanceBefore', 'balanceAfter', 'paid', 'catalog', 'equipment', 'shipId', 'unlock', ...(Object.hasOwn(row, 'warAction') ? ['warAction'] : [])]);
    validateWarReceipt(s, row);
    if (row.kind !== 'equipment' || row.catalog !== 1 || !EQUIPMENT_IDS.includes(row.equipment) || seen.has(row.equipment)
      || !p.ship || row.shipId !== p.ship.id || row.tick < p.ship.purchase.tick) fail();
    seen.add(row.equipment); validateEmpireCut(rowCut(row), s, previous);
    if (row.serial >= e.nextAction || previous !== outfit.activated && row.serial <= previous.economyAction) fail();
    previous = rowCut(row); number(row.at, previousEconomicTime, e.elapsed, false); previousEconomicTime = row.at;
    number(row.balanceBefore); number(row.balanceAfter); number(row.paid);
    if (row.paid !== SHIP_EQUIPMENT[row.equipment].price || row.balanceBefore - row.paid !== row.balanceAfter) fail();
    paid += row.paid;
    const colony = e.colonies.find(c => c.planetId === row.planetId);
    if (row.planetId !== p.homePlanetId && (!colony || colony.foundedAt > row.at)) fail();
    const before = p.log.find(r => r.serial === row.travelAction - 1);
    if (before && (before.planetId !== row.planetId || before.to !== (row.planetId === p.homePlanetId ? 'dock' : 'surface'))) fail();
    if (row.travelAction === 1 && row.planetId !== p.homePlanetId) fail();
    const departing = p.log.find(r => r.serial === row.travelAction);
    if (departing && departing.from !== 'dock' && departing.to !== 'dock') {
      const duration = departing.from === 'system' && departing.to === 'system' ? 6 : 3;
      if (row.spaceAt > departing.at - duration + 1e-7) fail();
    }
    if (row.travelAction === p.nextSerial) {
      if (row.planetId === p.homePlanetId ? !!p.location : p.location?.scale !== 'surface' || p.location.planetId !== row.planetId) fail();
      if (p.leg && row.spaceAt > p.elapsed - p.leg.elapsed + 1e-8) fail();
    }
    object(row.unlock, ['empireId', 'completedSerial']);
    const empire = p.empires.entries.find(entry => entry.id === row.unlock.empireId);
    const complete = p.empires.actions.find(action => action.serial === row.unlock.completedSerial);
    if (!empire?.mission || empire.mission.kind !== SHIP_EQUIPMENT[row.equipment].mission || empire.mission.completed !== row.unlock.completedSerial
      || complete?.kind !== 'complete' || complete.empireId !== empire.id) fail();
    const cut = complete.cut;
    if (cut.at > row.spaceAt || cut.tick > row.tick || cut.lifeAction > row.lifeAction || cut.travelAction > row.travelAction || cut.economyAction > row.serial) fail();
    const retained = e.actions.find(action => action.serial === row.serial);
    if (retained ? !equal(retained, row) : row.serial >= e.nextAction - e.actions.length) fail();
    const prior = e.actions.find(action => action.serial === row.serial - 1), next = e.actions.find(action => action.serial === row.serial + 1);
    if (prior && (prior.at > row.at || prior.balanceAfter !== row.balanceBefore) || next && (next.at < row.at || next.balanceBefore !== row.balanceAfter)) fail();
    if (row.spaceAt - e.activated.spaceAt > row.at + 1e-6) fail();
  }
  if (e.ledger.equipment !== paid) fail();
  if (e.actions.some(row => row.kind === 'equipment' && !outfit.purchases.some(purchase => equal(row, purchase)))) fail();
}
export function outfitCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space!, b = cp.space!, now = a.outfit, old = b.outfit;
  if (!now || !old) return !now && !old;
  const bootstrap = !old.purchases.length && old.activated.economyAction === b.economy!.nextAction;
  if ((!bootstrap && !equal(now.activated, old.activated)) || now.activated.at < old.activated.at || now.activated.tick < old.activated.tick
    || now.activated.lifeAction < old.activated.lifeAction || now.activated.travelAction < old.activated.travelAction || now.activated.economyAction < old.activated.economyAction) return false;
  if (!old.purchases.every((row, index) => equal(now.purchases[index], row))) return false;
  return now.purchases.slice(old.purchases.length).every(row => row.serial >= b.economy!.nextAction && row.lifeAction >= b.expedition!.nextAction
    && row.travelAction >= b.nextSerial && row.spaceAt >= b.elapsed && row.tick >= cp.tick && row.at >= b.economy!.elapsed);
}
