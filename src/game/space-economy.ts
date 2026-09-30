import type { GameState } from './types';
import type { SpaceEconomy, SpaceEconomyAction, SpaceEconomyKind, Colony, ProductCargo } from './space-economy-types';
import { stableBandCapacity } from './space-ecology';
import { livingExpedition } from './space-biosphere';
import { shipCapabilities } from './space-outfit-content';
import { homeSpaceProblem } from './space';
import { hasSpaceMarket, planetProduct, SPACE_PRODUCTS } from './space-products';
import { observeSpaceEmpires, spaceSalePrice } from './space-empires';
import { ownerAt, territoryTitle } from './space-expansion-content';
import { embargoEmpire, stepSpaceWars } from './space-war';
import { observeEventCargo, stepSpaceEvents, type EcologyObservation } from './space-events';
import { quarantineAt } from './space-events-content';
import { societyService } from './space-discoveries-content';

export const COLONY_CYCLE = 10;
export const COLONY_PRICE = 40;
export const COLONY_STORAGE_PER_BAND = 8;
export const colonyCycles = (seconds: number) => Math.floor((seconds + 1e-8) / COLONY_CYCLE);
export const spaceEconomy = (s: GameState): SpaceEconomy | null => s.space?.economy ?? null;
export const productCargoCount = (s: GameState) => spaceEconomy(s)?.cargo.reduce((sum, item) => sum + item.amount, 0) ?? 0;
export const shipCargoCount = (s: GameState) => (s.space?.expedition?.cargo.length ?? 0) + productCargoCount(s);
export const colonyStock = (colony: Colony) => colony.produced - colony.loaded;
export type EconomyOrder = { kind: Exclude<SpaceEconomyKind, 'sell'> } | { kind: 'sell'; originPlanetId: string };

export function enableSpaceEconomy(s: GameState): void {
  const enable = (state: GameState) => {
    const p = state.space;
    if (!p || p.economy || p.expedition?.version !== 2 || p.expedition.biosphere.version !== 2) return false;
    p.economy = { version: 1, activated: { spaceAt: p.elapsed, planetAt: state.planet?.version === 2 ? state.planet.elapsed : 0, tick: state.tick }, elapsed: 0, balance: 0,
      colonies: [], cargo: [], sales: [], ledger: { deposits: 0, construction: 0, upgrades: 0, repairs: 0, charging: 0, revenue: 0, healthRestored: 0, energyRestored: 0 },
      counts: { deposit: 0, found: 0, upgrade: 0, load: 0, sell: 0, repair: 0, charge: 0 }, actions: [], nextAction: 1 };
    return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
export function colonyCapacity(s: GameState, colony: Colony): number {
  if (s.space && ownerAt(s.space, colony.planetId) !== 'player') return 0;
  if (quarantineAt(s.space?.events?.current, colony.planetId)) return 0;
  const e = livingExpedition(s), world = e?.worlds.find(world => world.id === colony.planetId);
  return e && world ? Math.min(colony.level, stableBandCapacity(e, world)) : 0;
}
export function economyQuote(s: GameState, order: EconomyOrder, revision: number) {
  const e = spaceEconomy(s), p = s.space, ship = p?.ship, home = !homeSpaceProblem(s);
  const planetId = home ? p!.homePlanetId : p?.location?.planetId ?? '', colony = e?.colonies.find(item => item.planetId === planetId);
  const reject = (reason: string) => ({ ok: false, reason, price: 0, amount: 0, planetId, colony, cargo: undefined as ProductCargo | undefined });
  if (!e || !p || !ship || s.stage !== 5 || ship.health <= 0 || s.deathReason || s.player.health <= 0) return reject('Nejprve připrav vlastní loď v domácí dílně.');
  if (revision !== e.nextAction) return reject('Nabídka už byla použitá. Vyber akci znovu.');
  if (order.kind === 'deposit') {
    if (!home) return reject('Jantar převeď z domova u domácí dílny.');
    if (!s.machines || s.machines.resource < 20) return reject('V domácí pokladně chybí 20 jantaru.');
    return { ok: true, reason: 'Převést skutečných 20 jantaru z domácí do lodní pokladny.', price: 20, amount: 20, planetId, colony, cargo: undefined };
  }
  if (!home && (!p.location || p.leg || p.location.scale !== 'surface' || p.location.pos.y > 8 || Math.hypot(p.location.pos.x, p.location.pos.z) > 12))
    return reject('Přibliž se k povrchovému majáku do 12 kroků a klesni pod výšku 8.');
  if (order.kind === 'sell') {
    const cargo = e.cargo.find(item => item.planetId === order.originPlanetId);
    if (!cargo) return reject('Tuto produkci už v lodi nemáš.');
    if (!hasSpaceMarket(p.homePlanetId, planetId)) return reject('Na této planetě není odběratelský trh.');
    if (embargoEmpire(s, planetId)) return reject('Trh protistrany je během války uzavřený. Prodej náklad doma nebo u jiné říše.');
    if (cargo.planetId === planetId) return reject('Místní produkci dovez na jiný trh.');
    const price = spaceSalePrice(s, planetId, cargo.product).price!;
    return { ok: true, reason: `Prodat ${cargo.amount} × ${SPACE_PRODUCTS[cargo.product].name} za ${price} za kus.`, price, amount: cargo.amount, planetId, colony, cargo };
  }
  if (home) return reject('Kolonii spravuj nad cizím povrchem. Domácí svět zůstává původním domovem.');
  const expedition = livingExpedition(s), world = expedition?.worlds.find(item => item.id === planetId);
  if (!world || !expedition || expedition.biosphere.version !== 2) return reject('Nejprve prozkoumej a osídli živé pásy planety.');
  let price = 0, amount = 0, reason = '';
  const capacity = stableBandCapacity(expedition, world);
  if (order.kind === 'found') {
    if (colony) return reject('Na této planetě už máš zaplacenou kolonii.');
    const owner = ownerAt(p, planetId);
    if (owner && owner !== 'player') return reject('Tato planeta patří cizí říši. Kup její soustavu u vyslanectví nebo kolonizuj volný svět.');
    if (!capacity) return reject('Kolonie potřebuje skutečně stabilní první živý pás.');
    price = COLONY_PRICE; amount = 1; reason = 'Založit trvalou kolonii s první úrovní výroby za 40.';
  } else {
    const service = (order.kind === 'repair' || order.kind === 'charge') && societyService(p, planetId);
    if (!colony && !service) return reject((order.kind === 'repair' || order.kind === 'charge') && p.discoveries?.society.planetId === planetId
      ? 'Nejprve dokonči spolupráci s místním sídlem nebo zde založ kolonii.' : 'Nejprve na této planetě založ kolonii.');
    if (colony && ownerAt(p, planetId) !== 'player') return reject('Kolonii obsadila protistrana. Získej ji zpět; stavby i zásoby čekají.');
    if (order.kind === 'upgrade') {
      if (colony!.level >= 3 || capacity <= colony!.level) return reject('Další úroveň potřebuje vyšší souvislý stabilní pás.');
      price = 20; amount = colony!.level + 1; reason = `Rozšířit kolonii na úroveň ${amount} za 20.`;
    } else if (order.kind === 'load') {
      if (quarantineAt(p.events?.current, planetId)) return reject('Kolonie je v karanténě. Obnov první živý pás a u majáku výslovně zprovozni kolonii.');
      const stock = colonyStock(colony!), free = shipCapabilities(p)!.cargo - shipCargoCount(s);
      if (!stock) return reject('Sklad je prázdný. Stabilní pásy umožňují výrobu jednou za 10 aktivních sekund.');
      if (free <= 0) return reject('Náklad je plný. Živé exempláře a produkce sdílejí lodní kapacitu.');
      amount = Math.min(stock, free); reason = `Převézt ${amount} kusů ze skladu do skutečného nákladu.`;
    } else if (order.kind === 'repair') {
      amount = Math.min(40, shipCapabilities(p)!.health - ship.health);
      if (amount <= 0) return reject('Loď má plnou odolnost.');
      price = 5; reason = `Opravit ${amount.toFixed(1)} odolnosti za 5.`;
    } else if (order.kind === 'charge') {
      amount = Math.min(60, shipCapabilities(p)!.energy - ship.energy);
      if (amount <= 0) return reject('Loď má plnou energii.');
      price = 3; reason = `Doplnit ${amount.toFixed(1)} energie za 3.`;
    } else return reject('Neznámá kolonizační akce.');
  }
  if (e.balance < price) return reject(`Lodní pokladna má ${e.balance}; cena je ${price}. Prodej dovezenou produkci nebo převeď jantar doma.`);
  return { ok: true, reason, price, amount, planetId, colony, cargo: undefined };
}

type ReceiptCommon = 'serial' | 'at' | 'tick' | 'spaceAt' | 'lifeAction' | 'planetId' | 'balanceBefore' | 'balanceAfter';
type ReceiptDetails<A = SpaceEconomyAction> = A extends SpaceEconomyAction ? Omit<A, ReceiptCommon> : never;
export function applyEconomyOrder(s: GameState, order: EconomyOrder, revision: number): boolean {
  const e = spaceEconomy(s), p = s.space, q = economyQuote(s, order, revision);
  if (!e || !p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const base = { serial: e.nextAction++, at: e.elapsed, tick: s.tick, spaceAt: p.elapsed, lifeAction: p.expedition!.nextAction,
    ...(p.wars ? { warAction: p.wars.nextAction } : {}),
    planetId: q.planetId, balanceBefore: e.balance };
  let data: ReceiptDetails;
  if (order.kind === 'deposit') {
    const homeBefore = s.machines!.resource; s.machines!.resource -= 20; e.balance += 20; e.ledger.deposits += 20;
    data = { kind: 'deposit', paid: 20, homeBefore, homeAfter: s.machines!.resource };
  } else if (order.kind === 'found') {
    const id = `${q.planetId}:colony`; e.balance -= COLONY_PRICE; e.ledger.construction += COLONY_PRICE;
    const title = territoryTitle(p, q.planetId);
    const claim = p.wars?.current.territories.find(row => row.planetId === q.planetId)?.change;
    e.colonies.push({ id, planetId: q.planetId, product: planetProduct(p.homePlanetId, q.planetId)!, foundedAt: e.elapsed,
      paid: 40, level: 1, upgraded: 0, productiveElapsed: 0, produced: 0, loaded: 0,
      ...(title ? { permission: { titleSerial: title.serial, foundingSerial: base.serial } }
        : claim?.kind === 'result' && claim.battle.kind === 'invasion' && claim.battle.outcome === 'won'
          ? { militaryPermission: { claim: structuredClone(claim), foundingSerial: base.serial } } : {}) });
    data = { kind: 'found', paid: 40, colonyId: id };
  } else if (order.kind === 'upgrade') {
    const colony = q.colony!; colony.level = q.amount as 2 | 3; colony.upgraded += 20; e.balance -= 20; e.ledger.upgrades += 20;
    data = { kind: 'upgrade', paid: 20, colonyId: colony.id, level: colony.level, productiveElapsed: colony.productiveElapsed, produced: colony.produced };
  } else if (order.kind === 'load') {
    const colony = q.colony!; colony.loaded += q.amount;
    const cargo = e.cargo.find(item => item.planetId === colony.planetId);
    if (cargo) cargo.amount += q.amount; else e.cargo.push({ planetId: colony.planetId, product: colony.product, amount: q.amount });
    data = { kind: 'load', paid: 0, colonyId: colony.id, product: colony.product, amount: q.amount, ...(p.events ? { eventAction: p.events.nextAction } : {}) };
  } else if (order.kind === 'sell') {
    const cargo = q.cargo!, earned = q.price * q.amount; e.balance += earned; e.ledger.revenue += earned;
    let sold = e.sales.find(item => item.planetId === cargo.planetId);
    if (!sold) { sold = { planetId: cargo.planetId, product: cargo.product, amount: 0, earned: 0 }; e.sales.push(sold); }
    sold.amount += q.amount; sold.earned += earned; e.cargo.splice(e.cargo.indexOf(cargo), 1);
    const basis = spaceSalePrice(s, q.planetId, cargo.product).basis;
    data = { kind: 'sell', originPlanetId: cargo.planetId, product: cargo.product, amount: q.amount, unitPrice: q.price, earned, ...(basis ? { priceBasis: basis } : {}) };
  } else {
    const ship = p.ship!, key = order.kind === 'repair' ? 'health' : 'energy', before = ship[key];
    ship[key] += q.amount; e.balance -= q.price; e.ledger[order.kind === 'repair' ? 'repairs' : 'charging'] += q.price;
    e.ledger[order.kind === 'repair' ? 'healthRestored' : 'energyRestored'] += q.amount;
    const service = !q.colony ? societyService(p, q.planetId) : null;
    data = { kind: order.kind, paid: q.price, before, after: ship[key], ...(service ? { societyService: service } : {}) };
  }
  e.counts[order.kind]++;
  e.actions.push({ ...base, ...data, balanceAfter: e.balance });
  if (e.actions.length > 128) e.actions.shift();
  observeEventCargo(s, e.actions.at(-1)!);
  observeSpaceEmpires(s);
  p.notice = q.reason; return true;
}

/** Call once after the actual simulation step; never from drawing or loading. */
export function stepSpaceEconomy(s: GameState, duration: number, observation: EcologyObservation | null = null, canStartPirate = false): void {
  const e = spaceEconomy(s); if (!e || s.stage !== 5 || s.deathReason || s.player.health <= 0 || !Number.isFinite(duration) || duration <= 0) return;
  const dt = duration <= 1 / 30 + 1e-7 ? duration : 1 / 30; e.elapsed += dt;
  stepSpaceWars(s);
  stepSpaceEvents(s, observation, canStartPirate);
  for (const colony of e.colonies) {
    const capacity = colonyCapacity(s, colony); if (!capacity) continue;
    const cycle = colonyCycles(colony.productiveElapsed);
    colony.productiveElapsed += dt;
    if (colonyCycles(colony.productiveElapsed) > cycle) {
      const free = Math.max(0, capacity * COLONY_STORAGE_PER_BAND - colonyStock(colony));
      colony.produced += Math.min(capacity, free);
    }
  }
}
