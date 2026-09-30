import { validateWarReceipt } from './space-war-validation';
import { validateDiscoveryReceipt } from './space-discoveries-validation';
import { validateEventReceipt, operatingColonySeconds } from './space-events-validation';
import type { GameState } from './types';
import type { SpaceState } from './space-types';
import type { SpaceEconomy, SpaceEconomyAction, SpaceEconomyKind } from './space-economy-types';
import { shipCapabilities } from './space-outfit-content';
import { planetProduct } from './space-products';
import { COLONY_PRICE, colonyCycles } from './space-economy';
import { validateSpaceSalePrice } from './space-empires-validation';

const kinds: SpaceEconomyKind[] = ['deposit', 'found', 'upgrade', 'load', 'sell', 'repair', 'charge'];
const baseLedgerKeys = ['deposits', 'construction', 'upgrades', 'repairs', 'charging', 'revenue', 'healthRestored', 'energyRestored'] as const;
const ledgerKeys = (e: SpaceEconomy) => [...baseLedgerKeys, ...(e.version >= 3 ? ['equipment' as const] : []), ...(e.version >= 4 ? ['alliance' as const, 'territory' as const] : []), ...(e.version >= 7 ? ['patronage' as const] : [])];
const accountKinds = (e: SpaceEconomy) => [...kinds, ...(e.version >= 3 ? ['equipment' as const] : []), ...(e.version >= 4 ? ['alliance' as const, 'territory' as const] : []), ...(e.version >= 7 ? ['patronage' as const] : [])];
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
function fail(): never { throw new Error('Neplatný uložený účet kolonií a nákladu.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
function array(v: unknown, max: number): asserts v is unknown[] { if (!Array.isArray(v) || v.length > max) fail(); }
function sums(e: SpaceEconomy, capacity: number): boolean {
  const l = e.ledger, c = e.counts;
  const loaded = e.colonies.reduce((sum, colony) => sum + colony.loaded, 0), sold = e.sales.reduce((sum, sale) => sum + sale.amount, 0);
  return e.nextAction - 1 === accountKinds(e).reduce((n, k) => n + (c[k] ?? 0), 0)
    && l.deposits === c.deposit * 20 && l.construction === c.found * COLONY_PRICE && l.upgrades === c.upgrade * 20
    && l.repairs === c.repair * 5 && l.charging === c.charge * 3 && e.colonies.length === c.found
    && e.colonies.reduce((sum, colony) => sum + colony.upgraded, 0) === l.upgrades
    && e.sales.reduce((sum, sale) => sum + sale.earned, 0) === l.revenue
    && near(e.balance, l.deposits + l.revenue - l.construction - l.upgrades - l.repairs - l.charging - (l.equipment ?? 0) - (l.alliance ?? 0) - (l.territory ?? 0) - (l.patronage ?? 0))
    && (l.patronage ?? 0) === (c.patronage ?? 0) * 40
    && loaded >= c.load && loaded <= c.load * capacity && sold >= c.sell && sold <= c.sell * capacity
    && l.healthRestored >= -1e-6 && l.healthRestored <= c.repair * 40 + 1e-6
    && l.energyRestored >= -1e-6 && l.energyRestored <= c.charge * 60 + 1e-6;
}
/** The biological action stream fixes the occupied life slots at an economic cut.
 * Unknown rolled history stays unknown; it never shrinks the historical ship. */
function lifeAt(p: SpaceState, serial: number): number | null {
  const e = p.expedition!;
  if (serial < e.nextAction - e.actions.length) return null;
  let count = e.cargo.length;
  for (const row of e.actions) if (row.serial >= serial) { if (row.kind === 'collect') count--; else if (row.kind === 'release') count++; }
  return count;
}
function slots(p: SpaceState, e: SpaceEconomy, cut: number): boolean {
  const goods = e.cargo.reduce((sum, cargo) => sum + cargo.amount, 0), life = lifeAt(p, cut),
    capacity = shipCapabilities(p, { economyAction: e.nextAction, lifeAction: cut })?.cargo ?? 0;
  return goods <= capacity && (life === null || life >= 0 && goods + life <= capacity);
}
/** Goods are unchanged between two economic cuts. Inspect every retained life
 * transfer in that interval, including a collect followed by a same-time release. */
function intervalSlots(p: SpaceState, e: SpaceEconomy, from: number, to: number): boolean {
  if (!slots(p, e, to)) return false;
  for (const row of p.expedition!.actions) if (row.serial >= from && row.serial < to
    && (row.kind === 'collect' || row.kind === 'release') && (!slots(p, e, row.serial) || !slots(p, e, row.serial + 1))) return false;
  return true;
}
function subtract(e: SpaceEconomy, key: keyof SpaceEconomy['ledger'], amount: number): boolean {
  e.ledger[key] = (e.ledger[key] ?? 0) - amount;
  if (e.ledger[key]! < -1e-6) return false;
  if (Math.abs(e.ledger[key]!) < 1e-6) e.ledger[key] = 0;
  return true;
}
/** Reverse the retained transactions against permanent stock, sales and accounts.
 * Continuous production is bounded separately; reversing cannot fabricate funds. */
export function rewindSpaceEconomy(p: SpaceState, rows: SpaceEconomyAction[], minimumLifeCut?: number): SpaceEconomy | null {
  const e = structuredClone(p.economy!); let lifeCut = p.expedition!.nextAction;
  for (const row of [...rows].reverse()) {
    if (e.balance !== row.balanceAfter || !intervalSlots(p, e, row.lifeAction, lifeCut) || (e.counts[row.kind] ?? 0) <= 0) return null;
    const colony = e.colonies.find(item => item.planetId === row.planetId);
    if (row.kind === 'equipment' || row.kind === 'alliance' || row.kind === 'territory' || row.kind === 'patronage') {
      if (!subtract(e, row.kind, row.paid)) return null;
    } else if (row.kind === 'deposit') {
      if (!subtract(e, 'deposits', 20)) return null;
    } else if (row.kind === 'found') {
      if (!colony || colony.id !== row.colonyId || colony.foundedAt !== row.at || colony.level !== 1 || colony.loaded !== 0
        || e.cargo.some(item => item.planetId === colony.planetId) || e.sales.some(item => item.planetId === colony.planetId)) return null;
      e.colonies.splice(e.colonies.indexOf(colony), 1);
      if (!subtract(e, 'construction', COLONY_PRICE)) return null;
    } else if (row.kind === 'upgrade') {
      if (!colony || colony.id !== row.colonyId || colony.level !== row.level || colony.upgraded < 20) return null;
      const cycles = colonyCycles(colony.productiveElapsed) - colonyCycles(row.productiveElapsed);
      if (colony.productiveElapsed < row.productiveElapsed || colony.produced < row.produced || colony.produced - row.produced > cycles * colony.level || colony.loaded > row.produced) return null;
      colony.produced = row.produced; colony.productiveElapsed = row.productiveElapsed;
      colony.level = (colony.level - 1) as 1 | 2; colony.upgraded -= 20;
      if (colony.produced - colony.loaded > colony.level * 8) return null;
      if (!subtract(e, 'upgrades', 20)) return null;
    } else if (row.kind === 'load') {
      const cargo = e.cargo.find(item => item.planetId === row.planetId);
      if (!colony || colony.id !== row.colonyId || !cargo || cargo.product !== row.product || cargo.amount < row.amount || colony.loaded < row.amount
        || colony.loaded > colonyCycles(row.at - colony.foundedAt) * colony.level) return null;
      colony.loaded -= row.amount; cargo.amount -= row.amount; if (!cargo.amount) e.cargo.splice(e.cargo.indexOf(cargo), 1);
    } else if (row.kind === 'sell') {
      const sale = e.sales.find(item => item.planetId === row.originPlanetId);
      if (!sale || sale.product !== row.product || sale.amount < row.amount || sale.earned < row.earned) return null;
      sale.amount -= row.amount; sale.earned -= row.earned;
      if (!sale.amount) { if (sale.earned) return null; e.sales.splice(e.sales.indexOf(sale), 1); }
      const cargo = e.cargo.find(item => item.planetId === row.originPlanetId);
      if (cargo) cargo.amount += row.amount; else e.cargo.push({ planetId: row.originPlanetId, product: row.product, amount: row.amount });
      if (!subtract(e, 'revenue', row.earned)) return null;
    } else if (row.kind === 'repair' || row.kind === 'charge') {
      if ((!colony || colony.foundedAt > row.at) && !row.societyService || !subtract(e, row.kind === 'repair' ? 'repairs' : 'charging', row.paid)
        || !subtract(e, row.kind === 'repair' ? 'healthRestored' : 'energyRestored', row.after - row.before)) return null;
    } else return null;
    e.balance = row.balanceBefore; e.counts[row.kind] = (e.counts[row.kind] ?? 0) - 1; e.nextAction--; lifeCut = row.lifeAction;
    if (!slots(p, e, row.lifeAction)) return null;
  }
  const lower = minimumLifeCut ?? (e.nextAction === 1 ? 1 : lifeCut);
  return intervalSlots(p, e, lower, lifeCut) && sums(e, shipCapabilities(p, { economyAction: e.nextAction })?.cargo ?? 0) ? e : null;
}

export function validateSpaceEconomy(s: GameState): void {
  const p = s.space!; if (!Object.hasOwn(p, 'economy')) return;
  const e = p.economy!;
  object(e, ['version', 'activated', 'elapsed', 'balance', 'colonies', 'cargo', 'sales', 'ledger', 'counts', 'actions', 'nextAction', ...((e?.version ?? 1) >= 2 ? ['pricingActivatedAction'] : [])]);
  if (![1, 2, 3, 4, 5, 6, 7].includes(e.version) || p.expedition?.version !== 2 || p.expedition.biosphere.version !== 2) fail();
  if (e.version >= 2) { number(e.pricingActivatedAction, 1, e.nextAction); if (!p.empires) fail(); }
  object(e.activated, ['spaceAt', 'planetAt', 'tick']);
  number(e.activated.spaceAt, 0, p.elapsed, false); number(e.activated.planetAt, 0, s.planet?.version === 2 ? s.planet.elapsed : 0, false); number(e.activated.tick, 0, s.tick);
  number(e.elapsed, 0, 2e12, false); number(e.balance); number(e.nextAction, 1);
  const elapsed = p.elapsed - e.activated.spaceAt + (s.planet?.version === 2 ? s.planet.elapsed : 0) - e.activated.planetAt;
  if (!near(e.elapsed, elapsed)) fail();
  object(e.ledger, ledgerKeys(e)); object(e.counts, accountKinds(e));
  for (const key of ledgerKeys(e)) number(e.ledger[key], 0, Number.MAX_SAFE_INTEGER, !key.endsWith('Restored'));
  for (const kind of accountKinds(e)) number(e.counts[kind]);
  array(e.colonies, 31); array(e.cargo, 31); array(e.sales, 31); array(e.actions, 128);
  if (e.actions.length !== Math.min(128, e.nextAction - 1) || !sums(e, shipCapabilities(p, { economyAction: e.nextAction })?.cargo ?? 0)) fail();
  const ids = new Set<string>();
  for (const colony of e.colonies) {
    object(colony, ['id', 'planetId', 'product', 'foundedAt', 'paid', 'level', 'upgraded', 'productiveElapsed', 'produced', 'loaded', ...(Object.hasOwn(colony, 'permission') ? ['permission'] : []), ...(Object.hasOwn(colony, 'militaryPermission') ? ['militaryPermission'] : [])]);
    if (ids.has(colony.planetId) || !p.expedition.worlds.some(world => world.id === colony.planetId)
      || colony.id !== `${colony.planetId}:colony` || colony.product !== planetProduct(p.homePlanetId, colony.planetId) || colony.paid !== COLONY_PRICE) fail();
    ids.add(colony.planetId); number(colony.foundedAt, 0, e.elapsed, false); number(colony.level, 1, 3);
    number(colony.upgraded); if (colony.upgraded !== (colony.level - 1) * 20) fail();
    number(colony.productiveElapsed, 0, e.elapsed - colony.foundedAt + 1e-6, false);
    number(colony.produced, 0, colonyCycles(colony.productiveElapsed) * colony.level); number(colony.loaded, 0, colony.produced);
    if (colony.produced - colony.loaded > colony.level * 8) fail();
  }
  for (const [entries, sold] of [[e.cargo, false], [e.sales, true]] as const) {
    const seen = new Set<string>();
    for (const item of entries) {
      object(item, ['planetId', 'product', 'amount', ...(sold ? ['earned'] : [])]);
      const colony = e.colonies.find(colony => colony.planetId === item.planetId);
      if (!colony || seen.has(item.planetId) || item.product !== colony.product) fail();
      seen.add(item.planetId); number(item.amount, 1, colony.loaded);
      if (sold) { const sale = item as SpaceEconomy['sales'][number]; number(sale.earned, sale.amount * 5, sale.amount * (e.version >= 2 ? 21 : 19)); }
    }
  }
  for (const colony of e.colonies) if ((e.cargo.find(item => item.planetId === colony.planetId)?.amount ?? 0)
    + (e.sales.find(item => item.planetId === colony.planetId)?.amount ?? 0) !== colony.loaded) fail();
  if (!slots(p, e, p.expedition.nextAction)) fail();
  let lastAt = 0, lastSpace = e.activated.spaceAt, lastTick = e.activated.tick, lastLife = 1;
  for (const [index, row] of e.actions.entries()) {
    if (!row || !accountKinds(e).includes(row.kind) || !p.ship) fail();
    const stats = shipCapabilities(p, { economyAction: row.serial, lifeAction: row.lifeAction })!;
    const extra = row.kind === 'patronage' ? ['paid', 'discoveryAction', 'shipId', 'travelAction'] : row.kind === 'alliance' || row.kind === 'territory' ? ['paid', 'empireId', 'treatySerial', 'shipId', 'travelAction'] : row.kind === 'equipment' ? ['paid', 'catalog', 'equipment', 'shipId', 'travelAction', 'unlock'] : row.kind === 'deposit' ? ['paid', 'homeBefore', 'homeAfter'] : row.kind === 'found' ? ['paid', 'colonyId']
      : row.kind === 'upgrade' ? ['paid', 'colonyId', 'level', 'productiveElapsed', 'produced'] : row.kind === 'load' ? ['paid', 'colonyId', 'product', 'amount']
      : row.kind === 'sell' ? ['originPlanetId', 'product', 'amount', 'unitPrice', 'earned', ...(e.version >= 2 && row.serial >= e.pricingActivatedAction! ? ['priceBasis'] : [])] : ['paid', 'before', 'after'];
    object(row, ['serial', 'at', 'tick', 'spaceAt', 'lifeAction', 'planetId', 'balanceBefore', 'balanceAfter', 'kind', ...extra, ...(Object.hasOwn(row, 'warAction') ? ['warAction'] : []), ...(row.kind === 'load' && Object.hasOwn(row, 'eventAction') ? ['eventAction'] : []), ...((row.kind === 'repair' || row.kind === 'charge') && Object.hasOwn(row, 'societyService') ? ['societyService'] : [])]);
    validateWarReceipt(s, row);
    validateEventReceipt(s, row);
    validateDiscoveryReceipt(s, row);
    if (row.serial !== e.nextAction - e.actions.length + index) fail();
    number(row.at, lastAt, e.elapsed, false); number(row.spaceAt, lastSpace, p.elapsed, false); number(row.tick, lastTick, s.tick); number(row.lifeAction, lastLife, p.expedition.nextAction);
    if (row.spaceAt - e.activated.spaceAt > row.at + 1e-6 || row.spaceAt - lastSpace > row.at - lastAt + 1e-6) fail();
    lastAt = row.at; lastSpace = row.spaceAt; lastTick = row.tick; lastLife = row.lifeAction;
    number(row.balanceBefore); number(row.balanceAfter);
    const colony = e.colonies.find(item => item.planetId === row.planetId);
    if (row.planetId !== p.homePlanetId && !p.expedition.worlds.some(world => world.id === row.planetId)) fail();
    const lifeBefore = p.expedition.actions.find(action => action.serial === row.lifeAction - 1), lifeAfter = p.expedition.actions.find(action => action.serial === row.lifeAction);
    if (lifeBefore && lifeBefore.at > row.spaceAt || lifeAfter && lifeAfter.at < row.spaceAt) fail();
    if (row.kind === 'equipment') {
      if (e.version < 3 || !p.outfit?.purchases.some(purchase => equal(purchase, row))) fail();
    } else if (row.kind === 'alliance' || row.kind === 'territory') {
      if (e.version < 4 || !p.expansion?.actions.some(payment => equal(payment, row))) fail();
    } else if (row.kind === 'patronage') {
      if (e.version < 7 || row.paid !== 40 || row.balanceAfter !== row.balanceBefore - 40) fail();
    } else if (row.kind === 'deposit') {
      number(row.homeBefore, 20, 1e9, false); number(row.homeAfter, 0, 1e9, false);
      if (row.planetId !== p.homePlanetId || row.paid !== 20 || !near(row.homeBefore - 20, row.homeAfter) || row.balanceAfter !== row.balanceBefore + 20) fail();
    } else if (row.kind === 'sell') {
      const origin = e.colonies.find(item => item.planetId === row.originPlanetId);
      if (!origin || origin.planetId === row.planetId || row.product !== origin.product) fail();
      validateSpaceSalePrice(s, row);
      number(row.amount, 1, stats.cargo); number(row.earned, 1); if (row.earned !== row.amount * row.unitPrice || row.balanceAfter !== row.balanceBefore + row.earned) fail();
    } else {
      const service = (row.kind === 'repair' || row.kind === 'charge') && row.societyService;
      if ((!colony || colony.foundedAt > row.at) && !service) fail();
      const price = row.kind === 'found' ? 40 : row.kind === 'upgrade' ? 20 : row.kind === 'load' ? 0 : row.kind === 'repair' ? 5 : 3;
      if (row.paid !== price || row.balanceAfter !== row.balanceBefore - price) fail();
      if (row.kind === 'found' || row.kind === 'upgrade' || row.kind === 'load') if (row.colonyId !== colony!.id) fail();
      if (row.kind === 'found' && row.at !== colony!.foundedAt) fail();
      if (row.kind === 'upgrade') {
        number(row.level, 2, 3); number(row.productiveElapsed, 0, row.at - colony!.foundedAt + 1e-6, false);
        number(row.produced, 0, colonyCycles(row.productiveElapsed) * (row.level - 1));
      }
      if (row.kind === 'load') { number(row.amount, 1, stats.cargo); if (row.product !== colony!.product) fail(); }
      if (row.kind === 'repair' || row.kind === 'charge') {
        const max = row.kind === 'repair' ? stats.health : stats.energy, limit = row.kind === 'repair' ? 40 : 60;
        number(row.before, 0, max, false); number(row.after, 0, max, false);
        if (row.after <= row.before || !near(row.after - row.before, Math.min(limit, max - row.before))) fail();
      }
    }
  }
  const rewound = rewindSpaceEconomy(p, e.actions); if (!rewound) fail();
  if (e.nextAction <= 129 && (rewound.balance !== 0 || rewound.colonies.length || rewound.cargo.length || rewound.sales.length || rewound.nextAction !== 1)) fail();
  if (!p.ship && (e.nextAction !== 1 || e.balance !== 0 || e.colonies.length || e.cargo.length || e.sales.length)) fail();
}

export function economyCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space!, b = cp.space!, now = a.economy, old = b.economy;
  if (!now || !old) return !now && !old;
  if (now.version !== old.version) return false;
  const bootstrap = old.elapsed === 0 && old.nextAction === 1;
  if ((!bootstrap && !equal(now.activated, old.activated)) || now.activated.spaceAt < old.activated.spaceAt || now.activated.planetAt < old.activated.planetAt
    || now.activated.tick < old.activated.tick || now.elapsed < old.elapsed || now.nextAction < old.nextAction) return false;
  // With an otherwise identical home snapshot, the only positive-cost writes
  // without another domestic receipt are ship purchase and this real deposit.
  if (s.machines?.version === 2 && cp.machines?.version === 2) {
    const domestic = (state: GameState) => Object.fromEntries(Object.entries(state)
      .filter(([key]) => !['space', 'checkpoint', 'id'].includes(key))
      .map(([key, value]) => key === 'machines' ? [key, Object.fromEntries(Object.entries(value).filter(([name]) => name !== 'resource'))] : [key, value]));
    const purchase = !b.ship && a.ship ? a.ship.purchase.paid : 0;
    if (equal(domestic(s), domestic(cp)) && !near(s.machines.resource, cp.machines.resource - (now.ledger.deposits - old.ledger.deposits) - purchase)) return false;
  }
  const dt = now.elapsed - old.elapsed;
  if (!bootstrap && !near(dt, a.elapsed - b.elapsed + (s.planet?.version === 2 ? s.planet.elapsed : 0) - (cp.planet?.version === 2 ? cp.planet.elapsed : 0))) return false;
  if (accountKinds(now).some(k => (now.counts[k] ?? 0) < (old.counts[k] ?? 0)) || ledgerKeys(now).some(k => (now.ledger[k] ?? 0) + 1e-6 < (old.ledger[k] ?? 0))) return false;
  for (const before of old.colonies) {
    const after = now.colonies.find(item => item.id === before.id);
    if (!after || after.planetId !== before.planetId || after.product !== before.product || after.foundedAt !== before.foundedAt || after.paid !== before.paid
      || !equal(after.permission, before.permission) || !equal(after.militaryPermission, before.militaryPermission) || after.level < before.level || after.upgraded < before.upgraded || after.productiveElapsed < before.productiveElapsed
      || after.productiveElapsed > before.productiveElapsed + operatingColonySeconds(s, cp, before.planetId) + 1e-6 || after.produced < before.produced || after.loaded < before.loaded) return false;
    const cycles = colonyCycles(after.productiveElapsed) - colonyCycles(before.productiveElapsed);
    if (after.produced - before.produced > cycles * after.level) return false;
  }
  for (const before of old.sales) { const after = now.sales.find(item => item.planetId === before.planetId); if (!after || after.product !== before.product || after.amount < before.amount || after.earned < before.earned) return false; }
  if (!old.actions.every(row => { const current = now.actions.find(item => item.serial === row.serial); return current ? equal(current, row) : row.serial < now.nextAction - now.actions.length; })) return false;
  const since = now.actions.filter(row => row.serial >= old.nextAction);
  if (since.some(row => row.at < old.elapsed || row.spaceAt < b.elapsed || row.tick < cp.tick || row.lifeAction < b.expedition!.nextAction)) return false;
  // An in-flight checkpoint freezes the home account until an actual docking.
  const travels = a.log.filter(row => row.serial >= b.nextSerial);
  if (b.location && travels.length === a.nextSerial - b.nextSerial && !travels.some(row => row.to === 'dock') && now.counts.deposit !== old.counts.deposit) return false;
  const rewind = rewindSpaceEconomy(a, since, since.length === now.nextAction - old.nextAction ? b.expedition!.nextAction : undefined); if (!rewind) return false;
  if (accountKinds(now).some(k => (rewind.counts[k] ?? 0) < (old.counts[k] ?? 0)) || ledgerKeys(now).some(k => (rewind.ledger[k] ?? 0) + 1e-6 < (old.ledger[k] ?? 0))) return false;
  if (since.length === now.nextAction - old.nextAction) {
    const sorted = <T extends { planetId: string }>(items: T[]) => [...items].sort((a, b) => a.planetId.localeCompare(b.planetId));
    if (rewind.balance !== old.balance || !equal(rewind.counts, old.counts) || !equal(sorted(rewind.cargo), sorted(old.cargo)) || !equal(sorted(rewind.sales), sorted(old.sales))) return false;
    if (ledgerKeys(now).some(key => !near(rewind.ledger[key] ?? 0, old.ledger[key] ?? 0))) return false;
    if (!equal(sorted(rewind.colonies).map(({ productiveElapsed, produced, ...rest }) => rest), sorted(old.colonies).map(({ productiveElapsed, produced, ...rest }) => rest))) return false;
  }
  return true;
}
