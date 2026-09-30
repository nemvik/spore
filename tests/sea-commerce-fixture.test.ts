import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// Keep commerce as the first runtime entry: this exposed an eagerly captured cityEpoch alias in a module cycle.
import {
  activeDelivery, cancelTradeContract, commerceRoute, deliveryAction, deliveryRate,
  dispatchDelivery, inCommerce, matureContract,
} from '../src/game/commerce';
import { homeCoast, isCoast, seaRoute } from '../src/game/maritime';
import { atlasNeighbours, planetAtlas } from '../src/game/planet-geography';
import { activeField, navigation } from '../src/game/planet-travel';
import { parseGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { acceptTrade, tradeQuote, tradeTransfers } from '../src/game/trade';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  settled: { file: 'native-sea-trade-campaign.save.json', sha256: 'f8115ddd92a21b7608d1727d7be4ba6bf40a199738139643c44421bf8f8c6f9b' },
  crossing: { file: 'native-sea-crossing.save.json', sha256: 'e950eeb8c7061ac03cd41c8a8d9b19a4f44c1aeb320f2573ea550dd6c142aae5' },
} as const;
type Fixture = keyof typeof fixtures;
const bytes = (kind: Fixture) => readFileSync(`tests/fixtures/commerce/${fixtures[kind].file}`);
const load = (kind: Fixture) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const route = [1614, 1613, 1541];
const contract = (s: GameState) => s.commerce!.contracts[0];
const target = (s: GameState) => s.cities!.entries.find(c => c.id === contract(s).cityId)!;
const seller = (s: GameState) => s.states!.entries.find(r => r.id === contract(s).stateId)!;
const accounts = (s: GameState) => structuredClone({
  machines: s.machines, cities: s.cities, states: s.states, commerce: s.commerce,
  maritime: s.maritime, military: s.military, mobilization: s.mobilization,
});

// Unit continuation only. Source fixtures themselves are immutable native browser exports.
function advance(s: GameState, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) step(s, EMPTY_INPUT, 1 / 30);
}
function finishCurrentDelivery(s: GameState) {
  const d = activeDelivery(s)!.delivery, balance = s.machines!.resource;
  advance(s, (d.route.length - 1 - d.progress) / deliveryRate(d) + 1 / 30);
  expect(deliveryAction(s, 'unload', s.commerce!.revision)).toBe(true);
  expect(deliveryAction(s, 'unload', s.commerce!.revision)).toBe(false);
  advance(s, (d.route.length - 1) / deliveryRate(d) + 1 / 30);
  const revision = s.commerce!.revision;
  expect(deliveryAction(s, 'dock', revision)).toBe(true);
  expect(deliveryAction(s, 'dock', revision)).toBe(false);
  expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(false);
  expect(s.machines!.resource).toBe(balance);
  expect(d).toMatchObject({ phase: 'returned', delivered: true, progress: 0, distance: 2, elapsed: 4, refund: null });
}
function matureCrossing() {
  const s = load('crossing'), paid = s.machines!.resource;
  finishCurrentDelivery(s);
  for (let i = 0; i < 2; i++) {
    expect(dispatchDelivery(s, contract(s).id, { kind: 'boat', id: s.maritime!.vessel!.id }, s.commerce!.revision)).toBe(true);
    finishCurrentDelivery(s);
  }
  expect(s.machines!.resource).toBe(paid - 40);
  expect(matureContract(s, target(s))).toBe(contract(s));
  return s;
}

describe('SP-009.J unchanged native sea-commerce campaign', () => {
  it.each(['settled', 'crossing'] as const)('retains the exact %s browser export, all accounts and frozen lineage history across parse/serialize', kind => {
    const source = bytes(kind);
    expect(createHash('sha256').update(source).digest('hex')).toBe(fixtures[kind].sha256);
    const s = parseGame(source.toString()), raw = JSON.parse(source.toString()).state as GameState;
    const once = round(s), twice = round(once);
    expect(accounts(once)).toEqual(accounts(s)); expect(accounts(twice)).toEqual(accounts(s));
    expect(s.lineageHistory).toEqual(raw.lineageHistory); expect(twice.lineageHistory).toEqual(raw.lineageHistory);
    expect(s.checkpoint).toBe(raw.checkpoint); expect(bytes(kind)).toEqual(source);
  });

  it('retains the own paid vessel, actual coastal water route and three fully returned cargo payments at home', () => {
    const s = load('settled'), boat = s.maritime!.vessel!, c = contract(s), atlas = planetAtlas(s.homePlanet!)!;
    expect(s.stage).toBe(4); expect(activeField(s)).toBeNull(); expect(navigation(s)!.mode).toBe('local');
    expect(homeCoast(s)).toBe(1614); expect(boat.mooring).toBe(1614); expect(s.maritime!.journeys).toEqual([]);
    expect(boat.blueprint).toMatchObject({ carrier: 'boat', name: 'Tyrkysová přílivnice', hue: 160 });
    expect(boat.blueprint.parts.find(p => p.id === 'sea-propeller')).toMatchObject({ kind: 'propeller', scale: 1.25 });
    expect(boat.health).toBe(83); expect(boat.payment.amount).toBe(64);
    expect(boat.payment.after).toBe(boat.payment.before - 64);
    expect(isCoast(s, route[0])).toBe(true); expect(isCoast(s, route.at(-1)!)).toBe(true);
    expect(atlas.cells[1613].surface).toBe('water');
    for (let i = 1; i < route.length; i++) expect(atlasNeighbours(route[i - 1])).toContain(route[i]);
    expect(seaRoute(s, route[0], route.at(-1)!)).toEqual(route);
    expect(commerceRoute(s, target(s), 'boat')).toEqual(route);
    expect(c.deliveries).toHaveLength(3);
    for (const [i, d] of c.deliveries.entries()) {
      expect(d.carrier).toEqual({ kind: 'boat', id: boat.id }); expect(d.blueprint).toEqual(boat.blueprint);
      expect(d).toMatchObject({ home: null, route, phase: 'returned', delivered: true, progress: 0, distance: 2, elapsed: 4, refund: null });
      expect(d.payment.amount).toBe(20); expect(d.payment.after).toBe(d.payment.before - 20);
      if (i > 0) expect(d.payment.before).toBe(c.deliveries[i - 1].payment.after);
    }
    expect(c.deliveries.reduce((n, d) => n + d.payment.amount, 0)).toBe(60);
    expect(s.military!.raids).toEqual([]); expect(s.mobilization!.raids).toEqual([]);
  });

  it('links the three escrow payments to the actual 144 sale, credit 60 and exactly one seller receipt', () => {
    const s = load('settled'), c = contract(s), city = target(s), receipt = tradeTransfers(city)[0];
    expect(city.owner).toEqual({ kind: 'lineage', id: s.homePlanet!.id }); expect(city.capture).toBeNull();
    expect(city.transfers).toHaveLength(1);
    expect(receipt).toMatchObject({ method: 'trade', version: 2, price: 144, credit: 60, contractId: c.id, decision: { cities: 2 } });
    expect(c).toMatchObject({ status: 'settled', receiptId: receipt.id, refund: null });
    expect(receipt.payment.before).toBe(c.deliveries.at(-1)!.payment.after);
    expect(receipt.payment.after).toBe(receipt.payment.before - 84);
    expect(c.deliveries[0].payment.before - receipt.payment.after).toBe(144);
    expect(receipt.payment.receivedBefore).toBe(0); expect(receipt.payment.receivedAfter).toBe(144);
    expect(seller(s).tradeReserve).toBe(144); expect(seller(s).reserve).toBe(receipt.decision.reserve);
    const saved = accounts(s);
    expect(cancelTradeContract(s, c.id, s.commerce!.revision)).toBe(false);
    expect(dispatchDelivery(s, c.id, { kind: 'boat', id: s.maritime!.vessel!.id }, s.commerce!.revision)).toBe(false);
    expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(false);
    expect(accounts(s)).toEqual(saved);
  });

  it.each(['settled', 'crossing'] as const)('restores the original earlier generation checkpoint of %s without retaining later boat, city or money', kind => {
    const s = load(kind), checkpoint = JSON.parse(s.checkpoint!) as GameState;
    const recovered = round(recoverGeneration(round(s)));
    expect(accounts(recovered)).toEqual(accounts(checkpoint));
    expect(recovered.machines!.resource).toBeCloseTo(168.66000000007114, 9);
    expect(recovered.maritime!.vessel).toBeNull(); expect(recovered.commerce!.contracts).toEqual([]);
    expect(recovered.cities!.entries).toEqual([]);
    expect(accounts(round(recoverGeneration(recovered)))).toEqual(accounts(checkpoint));
  });
});

describe('SP-009.J unit continuation of the actual mid-sea export', () => {
  it('restores a runtime sea checkpoint after an aborted refund and finishes its already paid cargo without charging or refunding twice', () => {
    const s = load('crossing'), d = activeDelivery(s)!.delivery, boat = structuredClone(s.maritime!.vessel);
    expect(inCommerce(s)).toBe(true); expect(d.phase).toBe('outbound'); expect(d.progress).toBeGreaterThan(0); expect(d.progress).toBeLessThan(2);
    expect(d.payment.after).toBe(s.machines!.resource); expect(contract(s).deliveries).toHaveLength(1);
    makeCheckpoint(s); const before = accounts(s);
    expect(deliveryAction(s, 'abort', s.commerce!.revision)).toBe(true);
    advance(s, d.progress / deliveryRate(d) + 1 / 30);
    expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(true);
    expect(s.machines!.resource).toBe(before.machines!.resource + 20);
    const afterRefund = accounts(s);
    expect(deliveryAction(s, 'dock', s.commerce!.revision)).toBe(false); expect(accounts(s)).toEqual(afterRefund);
    const restored = round(recoverGeneration(round(s)));
    expect(accounts(restored)).toEqual(before); expect(restored.maritime!.vessel).toEqual(boat);
    expect(contract(restored).deliveries[0].refund).toBeNull();
    finishCurrentDelivery(restored);
    expect(restored.machines!.resource).toBe(before.machines!.resource);
    expect(contract(restored).deliveries).toHaveLength(1); expect(restored.maritime!.vessel).toEqual(boat);
    expect(round(restored).commerce).toEqual(restored.commerce);
  });

  it('continues all three real-route deliveries through runtime methods and restores both sides of settlement without duplicating seller income', () => {
    const s = matureCrossing(); makeCheckpoint(s); const before = accounts(s);
    const offer = tradeQuote(s, target(s)).offer!;
    expect(offer).toMatchObject({ credit: 60, contractId: contract(s).id });
    expect(acceptTrade(s, offer)).toBe(true);
    expect(s.machines!.resource).toBe(before.machines!.resource - (offer.price - 60));
    expect(seller(s).tradeReserve).toBe(offer.price);
    const settled = accounts(s);
    expect(acceptTrade(s, offer)).toBe(false); expect(accounts(s)).toEqual(settled);
    const restored = round(recoverGeneration(round(s)));
    expect(accounts(restored)).toEqual(before); expect(seller(restored).tradeReserve).toBe(0);
    expect(target(restored).owner.kind).toBe('state');
    expect(acceptTrade(restored, tradeQuote(restored, target(restored)).offer!)).toBe(true);
    expect(accounts(restored)).toEqual(settled);
    makeCheckpoint(restored);
    expect(accounts(round(recoverGeneration(round(restored))))).toEqual(settled);
  });
});
