import { coreEnergySpent } from './space-core-content';
import { validateWarReceipt } from './space-war-validation';
import { atWar, allySuspendedTime } from './space-war-content';
import { combatEnergySpent } from './space-combat-content';
import type { GameState } from './types';
import type { ExpansionReceipt } from './space-expansion-types';
import { validateEmpireCut } from './space-empires-validation';
import { EMPIRE_IDS } from './space-empires-content';
import { ALLY_BATTERY, ALLY_SOLAR, ALLY_TRANSFER, EXPANSION_PRICE } from './space-expansion-content';
import { planetSystem } from './galaxy';
import { shipCapabilities } from './space-outfit-content';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
function fail(): never { throw new Error('Neplatné uložené spojenectví, energie doprovodu nebo vlastnictví soustavy.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
const rowCut = (row: ExpansionReceipt) => ({ at: row.spaceAt, tick: row.tick, lifeAction: row.lifeAction, travelAction: row.travelAction, economyAction: row.serial });
export function validateSpaceExpansion(s: GameState): void {
  const p = s.space!, expansion = p.expansion, e = p.economy;
  if (!Object.hasOwn(p, 'expansion')) {
    if ((e?.version ?? 0) >= 4 || e?.colonies.some(colony => (Object.hasOwn(colony, 'permission') || Object.hasOwn(colony, 'militaryPermission')))) fail(); return;
  }
  object(expansion, ['version', 'activated', 'actions', 'allies']);
  if (expansion.version !== 1 || (!e || e.version < 4) || !p.outfit || !p.empires) fail();
  validateEmpireCut(expansion.activated, s, p.outfit.activated);
  if (!Array.isArray(expansion.actions) || expansion.actions.length > 6 || !Array.isArray(expansion.allies) || expansion.allies.length > 3) fail();
  let previous = expansion.activated, previousAt = 0;
  const seen = new Set<string>();
  // Permanent witnesses can outlive the common 128-row tail. One economic
  // serial cannot stand for two different payments or a sale and a founding.
  const occupied = new Set(p.outfit.purchases.map(row => row.serial));
  for (const empire of p.empires.entries) for (const proof of empire.mission?.evidence ?? []) if (proof.kind === 'trade') occupied.add(proof.receipt.serial);
  for (const row of expansion.actions) {
    object(row, ['kind', 'serial', 'at', 'tick', 'spaceAt', 'lifeAction', 'travelAction', 'planetId', 'balanceBefore', 'balanceAfter', 'paid', 'empireId', 'treatySerial', 'shipId', ...(Object.hasOwn(row, 'warAction') ? ['warAction'] : [])]);
    validateWarReceipt(s, row);
    if (!['alliance', 'territory'].includes(row.kind) || !EMPIRE_IDS.includes(row.empireId) || seen.has(`${row.kind}:${row.empireId}`)
      || !p.ship || row.shipId !== p.ship.id || row.tick < p.ship.purchase.tick) fail();
    seen.add(`${row.kind}:${row.empireId}`); validateEmpireCut(rowCut(row), s, previous);
    if (row.serial >= e.nextAction || previous !== expansion.activated && row.serial <= previous.economyAction || occupied.has(row.serial)) fail();
    occupied.add(row.serial);
    previous = rowCut(row); number(row.at, previousAt, e.elapsed, false); previousAt = row.at;
    number(row.balanceBefore); number(row.balanceAfter); number(row.paid); number(row.treatySerial, 1);
    if (row.paid !== EXPANSION_PRICE[row.kind] || row.balanceBefore - row.paid !== row.balanceAfter) fail();
    const empire = p.empires.entries.find(entry => entry.id === row.empireId), treaty = p.empires.actions.find(action => action.serial === row.treatySerial);
    if (!empire || row.planetId !== empire.capitalId || row.kind === 'territory' && empire.enclave || empire.treaty !== row.treatySerial
      || treaty?.kind !== 'treaty' || treaty.empireId !== empire.id) fail();
    const cut = treaty.cut;
    if (cut.at > row.spaceAt || cut.tick > row.tick || cut.economyAction > row.serial || cut.lifeAction > row.lifeAction || cut.travelAction > row.travelAction) fail();
    const arrival = p.log.find(action => action.serial === row.travelAction - 1), departing = p.log.find(action => action.serial === row.travelAction);
    if (row.travelAction === 1 || arrival && (arrival.to !== 'surface' || arrival.planetId !== row.planetId)) fail();
    if (departing && (departing.from !== 'surface' || departing.to !== 'orbit' || row.spaceAt > departing.at - 3 + 1e-7)) fail();
    if (row.travelAction === p.nextSerial && (p.location?.scale !== 'surface' || p.location.planetId !== row.planetId
      || p.leg && row.spaceAt > p.elapsed - p.leg.elapsed + 1e-8)) fail();
    const retained = e.actions.find(action => action.serial === row.serial);
    if (retained ? !equal(retained, row) : row.serial >= e.nextAction - e.actions.length) fail();
    const before = e.actions.find(action => action.serial === row.serial - 1), after = e.actions.find(action => action.serial === row.serial + 1);
    if (before && (before.at > row.at || before.balanceAfter !== row.balanceBefore) || after && (after.at < row.at || after.balanceBefore !== row.balanceAfter)
      || row.spaceAt - e.activated.spaceAt > row.at + 1e-6) fail();
  }
  for (const kind of ['alliance', 'territory'] as const) {
    const rows = expansion.actions.filter(row => row.kind === kind);
    if (e.counts[kind] !== rows.length || e.ledger[kind] !== rows.length * EXPANSION_PRICE[kind]) fail();
  }
  if (e.actions.some(row => (row.kind === 'alliance' || row.kind === 'territory') && !expansion.actions.some(payment => equal(payment, row)))) fail();
  for (const colony of e.colonies) {
    const title = expansion.actions.find(row => row.kind === 'territory' && row.planetId === colony.planetId);
    if (colony.militaryPermission) {
      const serial = colony.militaryPermission.foundingSerial;
      if (!p.wars || occupied.has(serial) || title && title.serial < serial || Object.hasOwn(colony, 'permission')) fail();
      occupied.add(serial); continue;
    }
    if (!title) { if (Object.hasOwn(colony, 'permission')) fail(); continue; }
    object(colony.permission, ['titleSerial', 'foundingSerial']);
    number(colony.permission.foundingSerial, title.serial + 1, e.nextAction - 1);
    if (colony.permission.titleSerial !== title.serial || colony.foundedAt < title.at || occupied.has(colony.permission.foundingSerial)) fail();
    occupied.add(colony.permission.foundingSerial);
    const founded = e.actions.find(row => row.serial === colony.permission!.foundingSerial);
    if (founded ? founded.kind !== 'found' || founded.planetId !== colony.planetId || founded.colonyId !== colony.id || founded.at !== colony.foundedAt
      : colony.permission.foundingSerial >= e.nextAction - e.actions.length) fail();
  }
  const alliances = expansion.actions.filter(row => row.kind === 'alliance');
  if (expansion.allies.length !== alliances.length) fail();
  for (const [index, ally] of expansion.allies.entries()) {
    object(ally, ['id', 'empireId', 'paidSerial', 'location', 'energy', 'generated', 'delivered']);
    const payment = alliances[index];
    if (ally.empireId !== payment.empireId || ally.paidSerial !== payment.serial || ally.id !== `${p.homePlanetId}:ally-${payment.empireId}`) fail();
    const elapsed = p.elapsed - payment.spaceAt - allySuspendedTime(p, ally.empireId);
    number(ally.energy, 0, ALLY_BATTERY, false); number(ally.generated, 0, ALLY_SOLAR * elapsed + 1e-6, false); number(ally.delivered, 0, ALLY_TRANSFER * elapsed + 1e-6, false);
    if (!near(ally.energy, ALLY_BATTERY + ally.generated - ally.delivered) || elapsed === 0 && (ally.generated !== 0 || ally.delivered !== 0)) fail();
    if (!p.location || atWar(p, ally.empireId)) { if (ally.location !== null) fail(); continue; }
    const l = ally.location; object(l, ['scale', 'systemId', 'planetId', 'pos', 'heading']); object(l.pos, ['x', 'y', 'z']);
    if (l.scale !== p.location.scale || l.planetId !== p.location.planetId || l.systemId !== p.location.systemId || planetSystem(p.homePlanetId, l.planetId)?.id !== l.systemId) fail();
    number(l.pos.x, -80, 80, false); number(l.pos.z, -80, 80, false); number(l.pos.y, l.scale === 'surface' ? 2 : -40, l.scale === 'surface' ? 26 : 40, false); number(l.heading, -Math.PI, Math.PI, false);
  }
}
export function expansionCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space!, b = cp.space!, now = a.expansion, old = b.expansion;
  if (!now || !old) return !now && !old;
  const bootstrap = !old.actions.length && old.activated.economyAction === b.economy!.nextAction;
  if (!bootstrap && !equal(now.activated, old.activated) || Object.keys(old.activated).some(key => now.activated[key as keyof typeof old.activated] < old.activated[key as keyof typeof old.activated])) return false;
  if (!old.actions.every((row, index) => equal(row, now.actions[index]))) return false;
  if (now.actions.slice(old.actions.length).some(row => row.serial < b.economy!.nextAction || row.at < b.economy!.elapsed || row.spaceAt < b.elapsed
    || row.tick < cp.tick || row.travelAction < b.nextSerial || row.lifeAction < b.expedition!.nextAction)) return false;
  for (const colony of a.economy!.colonies) if (colony.permission && !b.economy!.colonies.some(before => before.id === colony.id)
    && (colony.permission.foundingSerial < b.economy!.nextAction || colony.foundedAt < b.economy!.elapsed)) return false;
  const dt = a.elapsed - b.elapsed;
  if (b.leg && a.nextSerial === b.nextSerial) {
    if (!a.leg || !equal({ ...a.leg, elapsed: 0 }, { ...b.leg, elapsed: 0 }) || !near(a.leg.elapsed, b.leg.elapsed + dt)) return false;
    // No local simulation or interaction can occur inside this proven single
    // uninterrupted transition. Only the colony production clock may advance.
    if (a.ship!.energy !== b.ship!.energy || a.ship!.health !== b.ship!.health
      || a.economy!.nextAction !== b.economy!.nextAction || a.expedition!.nextAction !== b.expedition!.nextAction) return false;
  }
  if (a.ship && b.ship) {
    const lifePaid = a.expedition!.energySpent - b.expedition!.energySpent;
    const battlePaid = combatEnergySpent(a) - combatEnergySpent(b);
    const rootPaid = coreEnergySpent(a.core) - coreEnergySpent(b.core);
    const charged = a.economy!.ledger.energyRestored - b.economy!.ledger.energyRestored;
    const delivered = now.allies.reduce((sum, ally) => sum + ally.delivered, 0) - old.allies.reduce((sum, ally) => sum + ally.delivered, 0);
    // Even a rolled journey cannot generate more energy than all local solar
    // time plus actual companion/service receipts. Paused/home time gives none.
    const upper = b.ship.energy + shipCapabilities(a)!.solar * dt + delivered + charged - lifePaid - battlePaid - rootPaid;
    if (a.ship.energy > upper + 1e-6) return false;
    if (dt === 0) {
      if (a.log.some(row => row.serial >= b.nextSerial && row.from !== 'dock' && row.to !== 'dock')) return false;
      let newLegPaid = 0;
      if (!equal(a.leg, b.leg)) {
        if (b.leg !== null || !a.leg || a.leg.elapsed !== 0) return false;
        newLegPaid = a.leg.energyPaid;
      }
      if (!near(a.ship.energy, b.ship.energy - lifePaid - battlePaid - rootPaid + charged - newLegPaid)) return false;
    }
  }
  for (const ally of now.allies) {
    const before = old.allies.find(item => item.id === ally.id), payment = now.actions.find(row => row.serial === ally.paidSerial)!;
    const duration = (before ? dt : a.elapsed - payment.spaceAt) - allySuspendedTime(a, ally.empireId) + (before ? allySuspendedTime(b, ally.empireId) : 0);
    if (duration < -1e-6) return false;
    const generated = ally.generated - (before?.generated ?? 0), delivered = ally.delivered - (before?.delivered ?? 0);
    if (generated < 0 || delivered < 0 || generated > ALLY_SOLAR * duration + 1e-6 || delivered > ALLY_TRANSFER * duration + 1e-6
      || duration === 0 && (generated !== 0 || delivered !== 0)) return false;
    if (before && a.nextSerial === b.nextSerial) {
      if (!a.location && (!equal(ally, before))) return false;
      if (ally.location && before.location) {
        if (a.leg && b.leg && !equal(ally, before)) return false;
        const x = ally.location.pos, y = before.location.pos;
        if (Math.hypot(x.x - y.x, x.y - y.y, x.z - y.z) > (shipCapabilities(a)!.speed * 1.6 + 2) * dt + 1e-6) return false;
      }
    }
  }
  return true;
}
