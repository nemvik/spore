import { commerceMarkup, commerceStatus } from '../src/ui/commerce';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  activeDelivery, cancelTradeContract, commerceRoute, contractFor, deliveredCount,
  deliveryAction, deliveryQuote, deliveryRate, dispatchDelivery, enableCommerce,
  inCommerce, matureContract, openTradeContract, type CommerceCarrier, type TradeContract,
} from '../src/game/commerce';
import { acceptTrade, tradeQuote, tradeTransfers } from '../src/game/trade';
import { activeMachines, buildMachine } from '../src/game/machines';
import { editableBoat, initialVehicle } from '../src/game/blueprint';
import { buyBoat, homeCoast, seaCommand } from '../src/game/maritime';
import { activeField, bindActiveWorld, createField, navigation, openAtlas, returnHome } from '../src/game/planet-travel';
import { enterCity, type City } from '../src/game/cities';
import { atlasNeighbours, planetAtlas } from '../src/game/planet-geography';
import { stateCities, stateOpportunity } from '../src/game/states';
import { parseGame, serializeGame } from '../src/game/persistence';
import { continueToPlanetEra, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { validateCommerce } from '../src/game/commerce-validation';

const fixture = 'tests/fixtures/geography/sp-009f-defense.save.json';
const bytes = readFileSync(fixture, 'utf8');
const round = (s: GameState) => parseGame(serializeGame(s));
const advance = (s: GameState, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) step(s, EMPTY_INPUT, 1 / 30);
};
const accounts = (s: GameState) => structuredClone({ machines: s.machines, cities: s.cities, states: s.states, commerce: s.commerce, maritime: s.maritime });
let earnedSnapshot: { s: GameState; carriers: Record<'tank' | 'air' | 'boat', CommerceCarrier> } | undefined;
function earned() {
  if (!earnedSnapshot) {
    const s = parseGame(bytes); enableCommerce(s); returnHome(s);
    // Prepared F entry, then actual income and paid construction. This is a unit regression, not UI campaign evidence.
    advance(s, 400);
    const carriers = {} as Record<'tank' | 'air' | 'boat', CommerceCarrier>;
    for (const kind of ['tank', 'air'] as const) {
      expect(buildMachine(s, initialVehicle(kind, 'migration')).ok).toBe(true);
      carriers[kind] = { kind: 'fleet', id: activeMachines(s)!.fleet.at(-1)!.id };
    }
    expect(buyBoat(s, seaCommand(s, 1171), editableBoat())).toBe(true);
    carriers.boat = { kind: 'boat', id: s.maritime!.vessel!.id };
    earnedSnapshot = { s, carriers };
  }
  return structuredClone(earnedSnapshot);
}
function setup(kind: 'tank' | 'air' | 'boat' = 'tank', profile: 0 | 1 = 1) {
  const { s, carriers } = earned();
  const c = s.cities!.entries.find(c => (kind === 'boat' ? c.owner.kind === 'state' : c.owner.id === s.states!.entries[profile].id) && commerceRoute(s, c, kind));
  expect(c, `${kind} route for state ${profile}`).toBeDefined();
  expect(enterCity(s, c!.id)).toBe(true);
  return { s, c: c!, carrier: carriers[kind] };
}
function opened(kind: 'tank' | 'air' | 'boat' = 'tank') {
  const v = setup(kind); expect(openTradeContract(v.s, v.c)).toBe(true);
  return { ...v, contract: contractFor(v.s, v.c)! };
}
function dispatched(kind: 'tank' | 'air' | 'boat' = 'tank') {
  const v = opened(kind);
  expect(dispatchDelivery(v.s, v.contract.id, v.carrier, v.s.commerce!.revision)).toBe(true);
  return { ...v, delivery: activeDelivery(v.s)!.delivery };
}
function completeDelivery(s: GameState, contract: TradeContract, carrier: CommerceCarrier) {
  expect(dispatchDelivery(s, contract.id, carrier, s.commerce!.revision)).toBe(true);
  const d = activeDelivery(s)!.delivery;
  const seconds = (d.route.length - 1) / deliveryRate(d) + 1 / 30;
  advance(s, seconds);
  expect(deliveryAction(s, 'unload', s.commerce!.revision)).toBe(true);
  advance(s, seconds);
  expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(true);
  return d;
}
function matured() {
  const v = opened();
  for (let i = 0; i < 3; i++) completeDelivery(v.s, v.contract, v.carrier);
  expect(matureContract(v.s, v.c)).toBe(v.contract); return v;
}

describe('SP-009.J contract activation and actual carrier routes', () => {
  it('checks the actual D fixture coastal targets without creating a boat-accessible city', () => {
    const s = parseGame(readFileSync('tests/fixtures/geography/sp-009d-states.save.json', 'utf8')); enableCommerce(s);
    const routes = s.cities!.entries.filter(c => c.owner.kind === 'state').map(c => ({ cell: navigation(s)!.fields.find(f => f.id === c.address.locationId)!.cellId, route: commerceRoute(s, c, 'boat') }));
    expect(routes).toEqual([{ cell: 1542, route: null }, { cell: 1615, route: null }, { cell: 1470, route: null }, { cell: 1543, route: null }]);
  });

  it('activates only empty commerce for live and checkpoint without inventing transactions', () => {
    const s = parseGame(bytes); enableCommerce(s);
    expect(s.commerce).toEqual({ version: 1, revision: 0, contracts: [] });
    expect(JSON.parse(s.checkpoint!).commerce).toEqual(s.commerce);
    const once = structuredClone(s); enableCommerce(s); expect(s).toEqual(once);
    expect(round(s).commerce).toEqual(s.commerce);
    expect(readFileSync(fixture, 'utf8')).toBe(bytes);
  });

  it.each(['tank', 'air'] as const)('moves a paid %s over the appropriate route and restores the same carrier', kind => {
    const { s, c, carrier, contract, delivery } = dispatched(kind);
    const atlas = planetAtlas(s.homePlanet!)!, route = delivery.route, home = homeCoast(s);
    expect(route[0]).toBe(home); expect(route.at(-1)).toBe(activeField(s)!.cellId);
    for (let i = 1; i < route.length; i++) expect(atlasNeighbours(route[i - 1])).toContain(route[i]);
    if (kind === 'tank') expect(route.every(id => atlas.cells[id].surface === 'land')).toBe(true);
    expect(delivery.blueprint.carrier).toBe(kind); expect(delivery.carrier).toEqual(carrier);
    const units = structuredClone(activeMachines(s)!.fleet), boat = structuredClone(s.maritime!.vessel), funds = activeMachines(s)!.resource;
    advance(s, (route.length - 1) / deliveryRate(delivery) + 1 / 30);
    expect(deliveryAction(s, 'unload', s.commerce!.revision)).toBe(true);
    expect(matureContract(s, c)).toBeNull();
    advance(s, (route.length - 1) / deliveryRate(delivery) + 1 / 30);
    expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(true);
    expect(deliveredCount(contract)).toBe(1); expect(inCommerce(s)).toBe(false);
    expect(activeMachines(s)!.fleet).toEqual(units); expect(s.maritime!.vessel).toEqual(boat);
    expect(activeMachines(s)!.resource).toBe(funds); expect(round(s).commerce).toEqual(s.commerce);
  });

  it('operates the paid boat on a prepared coastal target and rejects its route for a land-only tank', () => {
    const { s, carriers } = earned(), c = s.cities!.entries.find(c => c.owner.kind === 'state')!;
    expect(s.cities!.entries.filter(c => c.owner.kind === 'state').every(c => commerceRoute(s, c, 'boat') === null)).toBe(true);
    // Isolated coastal consumer input: relocate this target to an actual generated shore.
    // F has no sea-connected foreign city. This tests transport, not whole-campaign save validity or UI reachability.
    const atlas = planetAtlas(s.homePlanet!)!, field = createField(s.seed, s.homePlanet!.id, atlas.cells[1171]);
    navigation(s)!.fields.push(field); c.address.locationId = field.id;
    s.homePlanet!.currentLocationId = field.id; bindActiveWorld(s); navigation(s)!.mode = 'local';
    expect(commerceRoute(s, c, 'tank')).toBeNull();
    const boatRoute = commerceRoute(s, c, 'boat')!, airRoute = commerceRoute(s, c, 'air')!;
    expect(boatRoute[0]).toBe(homeCoast(s)); expect(boatRoute.at(-1)).toBe(1171);
    expect(boatRoute.slice(1, -1).every(id => atlas.cells[id].surface === 'water')).toBe(true);
    expect(airRoute.at(-1)).toBe(1171);
    expect(openTradeContract(s, c)).toBe(true); const contract = contractFor(s, c)!;
    expect(deliveryQuote(s, contract, carriers.tank).reason).toMatch(/pevninskou/);
    const before = activeMachines(s)!.resource, vessel = structuredClone(s.maritime!.vessel);
    const d = completeDelivery(s, contract, carriers.boat);
    expect(d.carrier.kind).toBe('boat'); expect(d.home).toBeNull(); expect(d.route).toEqual(boatRoute);
    expect(d.blueprint).toEqual(vessel!.blueprint); expect(activeMachines(s)!.resource).toBe(before - 20);
    expect(s.maritime!.vessel).toEqual(vessel); expect(() => validateCommerce(s)).not.toThrow();
  });

  it('opens only at a foreign city and never duplicates an open contract', () => {
    const { s, c } = setup(); returnHome(s);
    expect(openTradeContract(s, c)).toBe(false); expect(s.commerce!.contracts).toEqual([]);
    expect(enterCity(s, c.id)).toBe(true); expect(openTradeContract(s)).toBe(true);
    const before = accounts(s); expect(openTradeContract(s, c)).toBe(false); expect(accounts(s)).toEqual(before);
    expect(continueToPlanetEra(s)).toBe(false);
  });
});

describe('SP-009.J escrow and independent trade settlement', () => {
  it('holds exactly three payments of 20, deducts price minus 60 on settlement and credits the entire price to the state once', () => {
    const { s, c, contract, carrier } = opened(), original = activeMachines(s)!.resource;
    const state = s.states!.entries.find(r => r.id === c.owner.id)!, received = state.tradeReserve!;
    for (let i = 0; i < 3; i++) {
      completeDelivery(s, contract, carrier);
      expect(activeMachines(s)!.resource).toBeCloseTo(original - (i + 1) * 20, 8);
      expect(state.tradeReserve).toBe(received); expect(deliveredCount(contract)).toBe(i + 1);
      expect(round(s).commerce).toEqual(s.commerce);
    }
    const before = accounts(s); expect(dispatchDelivery(s, contract.id, carrier, s.commerce!.revision)).toBe(false); expect(accounts(s)).toEqual(before);
    const quote = tradeQuote(s, c), price = quote.offer!.price, balance = activeMachines(s)!.resource;
    expect(quote.available).toBe(true); expect(quote.offer).toMatchObject({ contractId: contract.id, credit: 60 });
    expect(acceptTrade(s, quote.offer!)).toBe(true);
    expect(activeMachines(s)!.resource).toBe(balance - (price - 60));
    expect(activeMachines(s)!.resource).toBeCloseTo(original - price, 8);
    expect(state.tradeReserve).toBe(received + price);
    expect(contract).toMatchObject({ status: 'settled', receiptId: tradeTransfers(c).at(-1)!.id, refund: null });
    expect(tradeTransfers(c).at(-1)).toMatchObject({ version: 2, contractId: contract.id, credit: 60, price });
    const settled = accounts(s);
    expect(acceptTrade(s, quote.offer!)).toBe(false);
    expect(cancelTradeContract(s, contract.id, s.commerce!.revision)).toBe(false); expect(accounts(s)).toEqual(settled);
    expect(round(s).commerce).toEqual(s.commerce);
  });

  it('allows a solvent state to sell its last city after genuine deliveries', () => {
    const { s, c, contract, carrier } = matured(), seller = s.states!.entries.find(r => r.id === c.owner.id)!;
    expect(acceptTrade(s, tradeQuote(s, c).offer!)).toBe(true);
    const last = stateCities(s, seller)[0]; expect(stateCities(s, seller)).toHaveLength(1);
    expect(enterCity(s, last.id)).toBe(true); advance(s, 10);
    expect(seller.reserve + seller.tradeReserve!).toBeGreaterThan(0);
    expect(tradeQuote(s, last).available).toBe(false); expect(tradeQuote(s, last).reason).toContain('poslední');
    expect(openTradeContract(s, last)).toBe(true); const final = contractFor(s, last)!;
    for (let i = 0; i < 3; i++) completeDelivery(s, final, carrier);
    const quote = tradeQuote(s, last), reserve = seller.reserve, civil = seller.tradeReserve!;
    expect(quote.available).toBe(true); expect(quote.offer).toMatchObject({ cities: 1, credit: 60 });
    expect(acceptTrade(s, quote.offer!)).toBe(true);
    expect(seller.reserve).toBe(reserve); expect(seller.tradeReserve).toBe(civil + quote.offer!.price);
    expect(stateCities(s, seller)).toEqual([]); expect(stateOpportunity(s, seller).available).toBe(false);
    expect(contract.status).toBe('settled'); expect(final.status).toBe('settled'); expect(() => round(s)).not.toThrow();
  });

  it('refunds an interrupted payload only after docking and refunds delivered escrow only when cancelling', () => {
    const { s, contract, carrier } = opened(), initial = activeMachines(s)!.resource;
    completeDelivery(s, contract, carrier); expect(activeMachines(s)!.resource).toBe(initial - 20);
    expect(dispatchDelivery(s, contract.id, carrier, s.commerce!.revision)).toBe(true);
    advance(s, .1); const inTransit = accounts(s);
    expect(cancelTradeContract(s, contract.id, s.commerce!.revision)).toBe(false); expect(accounts(s)).toEqual(inTransit);
    const abortRevision = s.commerce!.revision;
    expect(deliveryAction(s, 'abort', abortRevision)).toBe(true);
    expect(deliveryAction(s, 'abort', s.commerce!.revision)).toBe(false);
    expect(activeMachines(s)!.resource).toBe(initial - 40);
    advance(s, 1); const dockRevision = s.commerce!.revision;
    expect(deliveryAction(s, 'dock', dockRevision)).toBe(true);
    expect(activeMachines(s)!.resource).toBe(initial - 20);
    expect(deliveryAction(s, 'dock', dockRevision)).toBe(false);
    expect(contract.deliveries.at(-1)!.refund).toMatchObject({ amount: 20, after: initial - 20 });
    expect(cancelTradeContract(s, contract.id, s.commerce!.revision)).toBe(true);
    expect(contract.refund).toEqual({ amount: 20, before: initial - 20, after: initial });
    expect(activeMachines(s)!.resource).toBe(initial);
    expect(cancelTradeContract(s, contract.id, s.commerce!.revision)).toBe(false);
    expect(round(s).commerce).toEqual(s.commerce);
  });

  it('cannot unload before arrival or reuse a stale dispatch, unload, dock, cancellation or offer', () => {
    const { s, c, contract, carrier, delivery } = dispatched(), revision = s.commerce!.revision;
    const before = accounts(s);
    expect(dispatchDelivery(s, contract.id, carrier, revision - 1)).toBe(false);
    expect(deliveryAction(s, 'unload', revision)).toBe(false); expect(deliveryAction(s, 'dock', revision)).toBe(false);
    expect(deliveryAction(s, 'abort', revision - 1)).toBe(false); expect(accounts(s)).toEqual(before);
    advance(s, (delivery.route.length - 1) / deliveryRate(delivery) + .1);
    expect(deliveryAction(s, 'unload', revision)).toBe(true); expect(deliveryAction(s, 'unload', revision)).toBe(false);
    advance(s, (delivery.route.length - 1) / deliveryRate(delivery) + .1);
    expect(deliveryAction(s, 'dock', revision)).toBe(false); expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(true);
    for (let i = 0; i < 2; i++) completeDelivery(s, contract, carrier);
    const offer = tradeQuote(s, c).offer!, current = s.commerce!.revision;
    expect(cancelTradeContract(s, contract.id, current - 1)).toBe(false);
    expect(cancelTradeContract(s, contract.id, current)).toBe(true);
    const cancelled = accounts(s); expect(acceptTrade(s, offer)).toBe(false); expect(accounts(s)).toEqual(cancelled);
  });

  it('an ownership change makes an old contract unusable but permits safe return and refund', () => {
    const { s, c, contract, delivery } = dispatched();
    // Focused epoch guard input. It is not a claimed valid/played ownership transition.
    c.transfers!.push({ from: { ...c.owner }, to: { ...c.owner }, unitId: 14, raidId: null, turn: s.states!.clock.turn, elapsed: 5, economy: null });
    advance(s, (delivery.route.length - 1) / deliveryRate(delivery) + .1);
    const before = accounts(s); expect(deliveryAction(s, 'unload', s.commerce!.revision)).toBe(false); expect(accounts(s)).toEqual(before);
    expect(deliveryAction(s, 'abort', s.commerce!.revision)).toBe(true);
    advance(s, (delivery.route.length - 1) / deliveryRate(delivery) + .1);
    expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(true);
    expect(deliveryQuote(s, contract, delivery.carrier).reason).toContain('vlastníka');
    expect(cancelTradeContract(s, contract.id, s.commerce!.revision)).toBe(true);
  });

  it('retains valid historical ownership when an ordinary sale leaves unfinished escrow to refund', () => {
    const { s, c, contract, carrier } = opened(), original = activeMachines(s)!.resource;
    completeDelivery(s, contract, carrier);
    const quote = tradeQuote(s, c); expect(quote.available).toBe(true); expect(quote.offer!.contractId).toBeUndefined();
    expect(acceptTrade(s, quote.offer!)).toBe(true); expect(tradeTransfers(c).at(-1)!.version).toBe(1);
    expect(contract.status).toBe('open'); expect(matureContract(s, c)).toBeNull();
    expect(() => round(s)).not.toThrow();
    expect(cancelTradeContract(s, contract.id, s.commerce!.revision)).toBe(true);
    expect(activeMachines(s)!.resource).toBeCloseTo(original - quote.offer!.price, 8);
    expect(round(s).commerce).toEqual(s.commerce);
  });
});

describe('SP-009.J persistence and authoritative history', () => {
  it('preserves an outbound/returning checkpoint prefix and replaces the full economic branch on recovery', () => {
    const { s, contract, delivery } = dispatched(); advance(s, .2); makeCheckpoint(s);
    const checkpoint = accounts(s); advance(s, .2); expect(round(s).commerce).toEqual(s.commerce);
    const recovered = recoverGeneration(round(s)); expect(accounts(recovered)).toEqual(checkpoint);
    advance(s, (delivery.route.length - 1) / deliveryRate(delivery) + .1);
    expect(deliveryAction(s, 'unload', s.commerce!.revision)).toBe(true); makeCheckpoint(s);
    const returning = accounts(s);
    advance(s, (delivery.route.length - 1) / deliveryRate(delivery) + .1);
    expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(true);
    expect(accounts(recoverGeneration(round(s)))).toEqual(returning);
    expect(deliveredCount(contract)).toBe(1);
    makeCheckpoint(s); const done = accounts(s); expect(accounts(recoverGeneration(round(s)))).toEqual(done);
  });

  it('recovers both sides of settlement and retains commerce identity across a campaign rekey', () => {
    const { s, c } = matured(); makeCheckpoint(s); const before = accounts(s);
    expect(acceptTrade(s, tradeQuote(s, c).offer!)).toBe(true);
    s.id = 'line-commerce-settlement'; const cp = JSON.parse(s.checkpoint!); cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    expect(accounts(recoverGeneration(round(s)))).toEqual(before);
    makeCheckpoint(s); const after = accounts(s); returnHome(s); advance(s, 10);
    expect(accounts(recoverGeneration(round(s)))).toEqual(after);
  });

  it.each(['credit', 'contractId', 'receiptId', 'full debit', 'short credit', 'reopened contract'] as const)('rejects a forged settled %s', kind => {
    const { s, c, contract } = matured(); expect(acceptTrade(s, tradeQuote(s, c).offer!)).toBe(true);
    const receipt = tradeTransfers(c).at(-1)!;
    if (receipt.version !== 2) throw new Error('Expected escrow receipt');
    if (kind === 'credit') (receipt as { credit: number }).credit = 59;
    if (kind === 'contractId') receipt.contractId++;
    if (kind === 'receiptId') contract.receiptId += '-other';
    if (kind === 'full debit') receipt.payment.after -= 60;
    if (kind === 'short credit') receipt.payment.receivedAfter -= 60;
    if (kind === 'reopened contract') { contract.status = 'open'; contract.receiptId = null; s.commerce!.revision--; }
    expect(() => round(s)).toThrow();
  });

  it('freezes home income and actors during delivery; atlas pauses progress, leaving the city is blocked', () => {
    const { s, delivery } = dispatched(), home = structuredClone([s.machines, s.worlds, s.player, s.cities]), location = s.homePlanet!.currentLocationId;
    advance(s, .2); expect([s.machines, s.worlds, s.player, s.cities]).toEqual(home); expect(delivery.progress).toBeGreaterThan(0);
    returnHome(s); expect(s.homePlanet!.currentLocationId).toBe(location);
    openAtlas(s); const frozen = structuredClone(s.commerce); advance(s, 2); expect(s.commerce).toEqual(frozen);
  });

  it.each([
    ['unknown root', (s: any) => { s.commerce.money = 10; }],
    ['version', (s: any) => { s.commerce.version = 2; }],
    ['revision', (s: any) => { s.commerce.revision++; }],
    ['contract identity', (s: any) => { s.commerce.contracts[0].id = 2; }],
    ['city reference', (s: any) => { s.commerce.contracts[0].cityId = 'missing'; }],
    ['state reference', (s: any) => { s.commerce.contracts[0].stateId = 'missing'; }],
    ['wrong historical state', (s: any) => { s.commerce.contracts[0].stateId = s.states.entries[0].id; }],
    ['contract before city founding', (s: any) => { s.commerce.contracts[0].turn = 0; }],
    ['future epoch', (s: any) => { s.commerce.contracts[0].epoch = 999; }],
    ['future turn', (s: any) => { s.commerce.contracts[0].turn = s.states.clock.turn + 1; }],
    ['payload amount', (s: any) => { s.commerce.contracts[0].deliveries[0].payment.amount = 21; }],
    ['payload debit', (s: any) => { s.commerce.contracts[0].deliveries[0].payment.after++; }],
    ['spring identity', (s: any) => { s.commerce.contracts[0].deliveries[0].payment.springId = -1; }],
    ['route', (s: any) => { s.commerce.contracts[0].deliveries[0].route = [0, 1]; }],
    ['progress', (s: any) => { s.commerce.contracts[0].deliveries[0].progress = NaN; }],
    ['elapsed', (s: any) => { s.commerce.contracts[0].deliveries[0].elapsed++; }],
    ['wrong carrier', (s: any) => { s.commerce.contracts[0].deliveries[0].carrier.id = 1; }],
    ['unknown carrier key', (s: any) => { s.commerce.contracts[0].deliveries[0].carrier.free = true; }],
    ['active snapshot', (s: any) => { s.commerce.contracts[0].deliveries[0].blueprint.hue++; }],
    ['home position', (s: any) => { s.commerce.contracts[0].deliveries[0].home.x++; }],
    ['premature delivery', (s: any) => { s.commerce.contracts[0].deliveries[0].delivered = true; }],
    ['premature refund', (s: any) => { s.commerce.contracts[0].deliveries[0].refund = { amount: 20, before: 1, after: 21 }; }],
  ] as const)('rejects poisoned %s without accepting a save', (_, mutate) => {
    const { s } = dispatched(); mutate(s); expect(() => round(s)).toThrow();
  });

  it.each(['payment', 'returned refund', 'contract city', 'completed status'] as const)('rejects checkpoint prefix rewriting: %s', kind => {
    const { s, contract, delivery } = dispatched();
    expect(deliveryAction(s, 'abort', s.commerce!.revision)).toBe(true);
    expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(true);
    if (kind === 'completed status') expect(cancelTradeContract(s, contract.id, s.commerce!.revision)).toBe(true);
    makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, prior = cp.commerce!.contracts[0];
    if (kind === 'payment') { prior.deliveries[0].payment.before++; prior.deliveries[0].payment.after++; }
    if (kind === 'returned refund') { prior.deliveries[0].refund!.before++; prior.deliveries[0].refund!.after++; }
    if (kind === 'contract city') prior.cityId = cp.cities!.entries.find(c => c.owner.kind === 'state' && c.id !== prior.cityId)!.id;
    if (kind === 'completed status') { prior.refund!.before++; prior.refund!.after++; }
    s.checkpoint = JSON.stringify(cp); expect(() => round(s)).toThrow(); expect(delivery.phase).toBe('returned');
  });

  it.each(readdirSync('tests/fixtures/geography').filter(f => f.endsWith('.save.json')))('preserves historical %s and activates an empty live/checkpoint extension before rekey', file => {
    const path = `tests/fixtures/geography/${file}`, original = readFileSync(path, 'utf8'), s = parseGame(original);
    expect(s.commerce).toBeUndefined(); const machines = structuredClone(s.machines), history = structuredClone(s.lineageHistory);
    enableCommerce(s); const once = JSON.stringify(s); enableCommerce(s); expect(JSON.stringify(s)).toBe(once);
    expect(s.commerce).toEqual({ version: 1, revision: 0, contracts: [] });
    expect(s.machines).toEqual(machines); expect(s.lineageHistory).toEqual(history);
    s.id = 'line-commerce-history'; if (s.checkpoint) { const cp = JSON.parse(s.checkpoint); cp.id = s.id; s.checkpoint = JSON.stringify(cp); }
    expect(round(s).commerce).toEqual(s.commerce); if (s.checkpoint) expect(() => round(recoverGeneration(s))).not.toThrow();
    expect(readFileSync(path, 'utf8')).toBe(original);
  });
});

it('loads the unchanged native D-to-J commercial unification, including solvent final cities and every escrow receipt',()=>{
  const text=readFileSync('tests/fixtures/commerce/native-trade-campaign.save.json','utf8');
  expect(createHash('sha256').update(text).digest('hex')).toBe('67f7ec49336a464a433aeb4a7dd19a89b3a1b752d5fa65debc66655714ae5ab8');
  const s=parseGame(text);expect(s.cities!.entries.every(c=>c.owner.kind==='lineage'&&!c.capture)).toBe(true);
  expect(s.commerce!.contracts.filter(c=>c.status==='settled')).toHaveLength(4);
  expect(s.commerce!.contracts.some(c=>c.status==='open')).toBe(false);
  expect(s.states!.entries.map(r=>[r.reserve,r.tradeReserve])).toEqual([[40,342],[40,340]]);
  const sales=s.cities!.entries.flatMap(c=>c.transfers!).filter(t=>t.method==='trade');expect(sales).toHaveLength(4);
  expect(sales.every(t=>t.version===2&&t.credit===60)).toBe(true);expect(sales.filter(t=>t.decision.cities===1).every(t=>t.decision.reserve===40&&t.decision.tradeReserve>0)).toBe(true);
  expect(()=>parseGame(serializeGame(s))).not.toThrow();
});

describe('combined delivery reduces repeated journeys without changing escrow', () => {
  it.each(['tank', 'air'] as const)('%s carries all three paid portions in one real return trip', kind => {
    const {s,c,carrier,contract}=opened(kind),before=activeMachines(s)!.resource;
    expect(dispatchDelivery(s,contract.id,carrier,s.commerce!.revision,3)).toBe(true);
    const d=activeDelivery(s)!.delivery;
    expect(d.payment.amount).toBe(60);expect(activeMachines(s)!.resource).toBe(before-60);
    makeCheckpoint(s);expect(round(recoverGeneration(s)).commerce).toEqual(s.commerce);
    const seconds=(d.route.length-1)/deliveryRate(d)+1/30;
    advance(s,seconds);expect(deliveryAction(s,'unload',s.commerce!.revision)).toBe(true);
    expect(matureContract(s,c)).toBeNull();
    advance(s,seconds);expect(deliveryAction(s,'dock',s.commerce!.revision)).toBe(true);
    expect(deliveredCount(contract)).toBe(3);expect(contract.deliveries).toHaveLength(1);
    expect(matureContract(s,c)).toBe(contract);expect(round(s).commerce).toEqual(s.commerce);
    const q=tradeQuote(s,c);expect(q.available).toBe(true);expect(acceptTrade(s,q.offer!)).toBe(true);
    expect(round(s).commerce).toEqual(s.commerce);
  });
  it('continues a historical single portion with two, and returns all escrow once when cancelled', () => {
    const {s,carrier,contract}=opened(),before=activeMachines(s)!.resource;
    completeDelivery(s,contract,carrier);
    expect(dispatchDelivery(s,contract.id,carrier,s.commerce!.revision,3)).toBe(false);
    expect(dispatchDelivery(s,contract.id,carrier,s.commerce!.revision,2)).toBe(true);
    expect(deliveryAction(s,'abort',s.commerce!.revision)).toBe(true);
    expect(deliveryAction(s,'dock',s.commerce!.revision)).toBe(true);
    expect(activeMachines(s)!.resource).toBe(before-20);
    expect(cancelTradeContract(s,contract.id,s.commerce!.revision)).toBe(true);
    expect(activeMachines(s)!.resource).toBe(before);
    expect(cancelTradeContract(s,contract.id,s.commerce!.revision)).toBe(false);
    expect(round(s).commerce).toEqual(s.commerce);
  });
  it('rejects insufficient balance, forged batch receipts and a changed checkpoint quantity', () => {
    const {s,carrier,contract}=opened();activeMachines(s)!.resource=40;
    expect(dispatchDelivery(s,contract.id,carrier,s.commerce!.revision,3)).toBe(false);
    expect(dispatchDelivery(s,contract.id,carrier,s.commerce!.revision,2)).toBe(true);
    makeCheckpoint(s);const data=JSON.parse(serializeGame(s));
    data.state.commerce.contracts[0].deliveries[0].units=3;
    expect(()=>parseGame(JSON.stringify(data))).toThrow();
  });
});

 it('rejects an explicit null batch marker instead of treating it as an old delivery', () => {
  const {s}=dispatched(),data=JSON.parse(serializeGame(s));
  data.state.commerce.contracts[0].deliveries[0].units=null;
  expect(()=>parseGame(JSON.stringify(data))).toThrow();
 });

 it('offers a combined trip and an affordable single portion, and distinguishes cargo from completed deliveries', () => {
  const {s,c,carrier,contract}=opened();
  expect(commerceMarkup(s,c)).toContain('batch-offer,');expect(commerceMarkup(s,c)).toContain('Jen jednu za 20');
  expect(dispatchDelivery(s,contract.id,carrier,s.commerce!.revision,3)).toBe(true);
  expect(commerceStatus(s)).toContain('dokončeno 0/3 · na vozidle 3');
  expect(deliveryAction(s,'abort',s.commerce!.revision)).toBe(true);
  expect(commerceStatus(s)).toContain('dokončeno 0/3 · vrací se 3');
  expect(commerceStatus(s)).toContain('vratku 60');
 });
