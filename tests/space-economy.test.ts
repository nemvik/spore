import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { starSystems } from '../src/game/galaxy';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { enableBiosphere, livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { enableForeignEcology, roleOf, stableBandCapacity } from '../src/game/space-ecology';
import { jumpToSystem, specimenQuote, useSpecimenTool } from '../src/game/space-expedition';
import { applyEconomyOrder, colonyCapacity, colonyStock, economyQuote, enableSpaceEconomy,
  productCargoCount, shipCargoCount, spaceEconomy, stepSpaceEconomy, type EconomyOrder } from '../src/game/space-economy';
import { hasSpaceMarket, planetProduct, SPACE_PRODUCT_KEYS, SPACE_PRODUCTS, spaceMarketPrice } from '../src/game/space-products';
import { shipStats } from '../src/game/ship-design';
import { changeSpaceScale, launchShip } from '../src/game/space';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

// Prepared unit continuation of historical A1 bytes. Scanner positions, ascent
// altitude and explicit damage experiments below are not native-play evidence.
const historical = () => parseGame(readFileSync('tests/fixtures/space/native-c3a1-campaign.save.json', 'utf8'));
function enabled() { const s = historical(); enableBiosphere(s); enableForeignEcology(s); enableSpaceEconomy(s); return s; }
const account = (s: GameState) => spaceEconomy(s)!;
const planetClock = (s: GameState) => s.planet?.version === 2 ? s.planet.elapsed : 0;
const order = (s: GameState, action: EconomyOrder) => applyEconomyOrder(s, action, account(s).nextAction);
const round = (s: GameState) => parseGame(serializeGame(s));
const withoutNotice = (s: GameState) => { const copy = structuredClone(s); if (copy.space) copy.space.notice = ''; return copy; };
const domestic = (s: GameState) => { const { checkpoint: _cp, space: _space, ...rest } = s; return structuredClone(rest); };
function frames(s: GameState, seconds: number) { for (let n = 0; n < Math.round(seconds * 30); n++) step(s, EMPTY_INPUT, 1 / 30); }
function finishLeg(s: GameState) {
  for (let n = 0; n < 182 && s.space!.leg; n++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.leg).toBeNull();
}
function travel(s: GameState, index: 0 | 1) {
  if (!s.space!.location) expect(launchShip(s)).toBe(true);
  s.space!.location!.pos.y = 20;
  expect(changeSpaceScale(s, 'up')).toBe(true); finishLeg(s);
  s.space!.location!.pos.x = 0; s.space!.location!.pos.z = 0;
  expect(changeSpaceScale(s, 'up')).toBe(true); finishLeg(s);
  expect(jumpToSystem(s, starSystems(s.space!.homePlanetId)[index].id)).toBe(true); finishLeg(s);
  expect(changeSpaceScale(s, 'down')).toBe(true); finishLeg(s);
  expect(changeSpaceScale(s, 'down')).toBe(true); finishLeg(s);
  s.space!.location!.pos = { x: 0, y: 3, z: 0 };
  if (index === 0) expect(changeSpaceScale(s, 'down')).toBe(true);
}
function deposit(s: GameState, count: number) {
  for (let i = 0; i < count; i++) {
    // Higher-level tests earn any missing deposit from the ordinary home loop.
    for (let n = 0; n < 3600 && s.machines!.resource < 20; n++) step(s, EMPTY_INPUT, 1 / 30);
    expect(s.machines!.resource).toBeGreaterThanOrEqual(20); expect(order(s, { kind: 'deposit' })).toBe(true);
  }
}
function source(deposits = 2, preparedAmber?: number) {
  const s = enabled();
  // Only the bounded-history stress case supplies this explicit fixture
  // precondition. It is not earned wealth or evidence of native reachability.
  if (preparedAmber !== undefined) { s.machines!.resource = preparedAmber; makeCheckpoint(s); }
  deposit(s, deposits); travel(s, 1); frames(s, 12);
  expect(stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!)).toBe(3); return s;
}
function settleSource(s: GameState) {
  const e = livingExpedition(s)!, w = livingPlanet(s)!;
  // Production-rate experiments start after real reproduction reaches its
  // bounded population and the youngest hunters have genuinely settled. The
  // separate first-founding test below retains the initial 0 → 12 s path.
  for (let n = 0; n < 5400 && (w.life.length !== 54 || stableBandCapacity(e, w) !== 3); n++) step(s, EMPTY_INPUT, 1 / 30);
  expect(w.life).toHaveLength(54); expect(stableBandCapacity(e, w)).toBe(3);
}
function founded(deposits = 2, preparedAmber?: number) {
  const s = source(deposits, preparedAmber); settleSource(s);
  expect(order(s, { kind: 'found' })).toBe(true); return s;
}
function atSpecimen(s: GameState, id: string) {
  const life = livingPlanet(s)!.life.find(item => item.id === id)!;
  s.space!.location!.pos = { x: life.pos.x, y: 3, z: life.pos.z };
}
function refuse(s: GameState, action: EconomyOrder, revision = account(s).nextAction) {
  const before = withoutNotice(s); expect(economyQuote(s, action, revision).ok).toBe(false);
  expect(applyEconomyOrder(s, action, revision)).toBe(false); expect(withoutNotice(s)).toEqual(before);
}
function refuseSave(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
afterEach(() => vi.unstubAllGlobals());

describe('C3b explicit empty accounts and deterministic original products', () => {
  it('keeps historical A1 parsing exact and adds independent empty live/checkpoint accounts without grants', () => {
    const s = historical(), original = structuredClone(s); expect(round(s)).toEqual(s);
    expect(spaceEconomy(s)).toBeNull(); enableSpaceEconomy(s); expect(s).toEqual(original);
    enableForeignEcology(s); const before = structuredClone(s), oldCp = JSON.parse(s.checkpoint!) as GameState;
    enableSpaceEconomy(s); const e = account(s), cp = JSON.parse(s.checkpoint!) as GameState;
    expect(e).toEqual({ version: 1, activated: { spaceAt: before.space!.elapsed, planetAt: planetClock(before), tick: before.tick },
      elapsed: 0, balance: 0, colonies: [], cargo: [], sales: [],
      ledger: { deposits: 0, construction: 0, upgrades: 0, repairs: 0, charging: 0, revenue: 0, healthRestored: 0, energyRestored: 0 },
      counts: { deposit: 0, found: 0, upgrade: 0, load: 0, sell: 0, repair: 0, charge: 0 }, actions: [], nextAction: 1 });
    expect(account(cp).activated).toEqual({ spaceAt: oldCp.space!.elapsed, planetAt: planetClock(oldCp), tick: oldCp.tick });
    expect(account(cp).balance).toBe(0); expect(cp.space!.ship).toBeNull();
    expect(domestic(s)).toEqual(domestic(before)); expect(s.space!.expedition).toEqual(before.space!.expedition);
    const once = structuredClone(s); enableSpaceEconomy(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
  });

  it('resolves the same three named products and finite target-specific prices from stable planet addresses', () => {
    const systems = starSystems('unit-economy-home');
    expect(SPACE_PRODUCT_KEYS).toEqual(['sun-resin', 'moon-salt', 'spore-silk']);
    expect(new Set(systems.slice(1).map(system => planetProduct(systems[0].planetId, system.planetId))).size).toBe(3);
    for (const system of systems) {
      expect(hasSpaceMarket(systems[0].planetId, system.planetId)).toBe(system.index === 0 || system.living);
      for (const product of SPACE_PRODUCT_KEYS) {
        const price = spaceMarketPrice(systems[0].planetId, system.planetId, product);
        if (!system.index || system.living) { expect(price).toBeGreaterThan(0); expect(Number.isInteger(price)).toBe(true); }
        else expect(price).toBeNull();
        expect(spaceMarketPrice(systems[0].planetId, system.planetId, product)).toBe(price);
        expect(SPACE_PRODUCTS[product].name.trim()).not.toBe(''); expect(SPACE_PRODUCTS[product].color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(planetProduct(systems[0].planetId, systems[0].planetId)).toBeNull();
    expect(planetProduct(systems[0].planetId, 'unknown-planet')).toBeNull();
    expect(hasSpaceMarket(systems[0].planetId, 'unknown-planet')).toBe(false);
  });

  it('transfers exactly 20 real home amber per deposit, saves both sides, and refuses reuse of the accepted quote', () => {
    const s = enabled(), e = account(s), homeBefore = s.machines!.resource, revision = e.nextAction;
    makeCheckpoint(s); expect(economyQuote(s, { kind: 'deposit' }, revision)).toMatchObject({ ok: true, price: 20, amount: 20 });
    expect(applyEconomyOrder(s, { kind: 'deposit' }, revision)).toBe(true);
    expect(s.machines!.resource).toBe(homeBefore - 20); expect(e.balance).toBe(20); expect(e.ledger.deposits).toBe(20);
    expect(e.actions[0]).toMatchObject({ serial: revision, kind: 'deposit', paid: 20, homeBefore, homeAfter: homeBefore - 20, balanceBefore: 0, balanceAfter: 20, lifeAction: s.space!.expedition!.nextAction });
    refuse(s, { kind: 'deposit' }, revision); expect(order(s, { kind: 'deposit' })).toBe(true);
    expect(s.machines!.resource).toBe(homeBefore - 40); expect(e.balance).toBe(40); expect(e.counts.deposit).toBe(2); expect(round(s)).toEqual(s);
    const cp = JSON.parse(s.checkpoint!) as GameState, restored = recoverGeneration(round(s));
    expect(account(restored)).toEqual(account(cp)); expect(restored.machines!.resource).toBe(homeBefore);
  });

  it('rejects insufficient home funds and deposits made away from the real workshop atomically', () => {
    const s = enabled(); deposit(s, 3); expect(s.machines!.resource).toBeLessThan(20); refuse(s, { kind: 'deposit' });
    expect(launchShip(s)).toBe(true); refuse(s, { kind: 'deposit' });
    travel(s, 1); refuse(s, { kind: 'deposit' });
  });

  it('rejects a refunded home debit with its deposit receipt retained while permitting actual later home income', () => {
    const s = enabled(); makeCheckpoint(s); const homeBefore = s.machines!.resource;
    expect(order(s, { kind: 'deposit' })).toBe(true); const paid = structuredClone(s);
    expect(s.machines!.resource).toBe(homeBefore - 20); expect(round(s)).toEqual(s);
    s.machines!.resource += 20; expect(account(s).balance).toBe(20); expect(account(s).actions).toEqual(account(paid).actions); refuseSave(s);
    const realIncome = paid; frames(realIncome, 2);
    expect(realIncome.machines!.resource).toBeGreaterThan(homeBefore - 20); expect(account(realIncome).balance).toBe(20);
    expect(round(realIncome)).toEqual(realIncome);
  });
});

describe('C3b paid colony, actual ecological capacity and bounded production', () => {
  it('requires an actual continuously stable first band, charges 40 once and refuses duplicate or stale founding', () => {
    const s = enabled(); deposit(s, 2); travel(s, 1);
    expect(stableBandCapacity(livingExpedition(s)!, livingPlanet(s)!)).toBe(0); refuse(s, { kind: 'found' });
    frames(s, 12); const e = account(s), revision = e.nextAction, homeBefore = s.machines!.resource;
    expect(economyQuote(s, { kind: 'found' }, revision)).toMatchObject({ ok: true, price: 40, amount: 1 });
    expect(applyEconomyOrder(s, { kind: 'found' }, revision)).toBe(true);
    const colony = e.colonies[0]; expect(colony).toMatchObject({ planetId: livingPlanet(s)!.id, paid: 40, level: 1, upgraded: 0, produced: 0, loaded: 0, productiveElapsed: 0 });
    expect(colony.product).toBe(planetProduct(s.space!.homePlanetId, colony.planetId));
    expect(e.balance).toBe(0); expect(e.ledger.construction).toBe(40); expect(s.machines!.resource).toBe(homeBefore);
    refuse(s, { kind: 'found' }, revision); refuse(s, { kind: 'found' }); expect(e.colonies).toHaveLength(1); expect(round(s)).toEqual(s);
  });

  it('rejects unfunded, remote and orbital orders without changing the home or colony state', () => {
    const s = source(1); refuse(s, { kind: 'found' });
    s.space!.location!.pos.x = 13; refuse(s, { kind: 'found' });
    s.space!.location!.pos = { x: 0, y: 9, z: 0 }; refuse(s, { kind: 'found' });
    s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); refuse(s, { kind: 'found' }); finishLeg(s); refuse(s, { kind: 'found' });
  });

  it('produces its first actual unit after ten seconds and consumes full-storage cycles without accumulating an overflow windfall', () => {
    const s = founded(), e = account(s), colony = e.colonies[0], elapsed = e.elapsed;
    frames(s, 9.9); expect(colony.produced).toBe(0); frames(s, .1);
    expect(colony.produced).toBe(1); expect(colonyStock(colony)).toBe(1); expect(e.elapsed - elapsed).toBeCloseTo(10, 8);
    frames(s, 110); expect(colonyStock(colony)).toBe(8); expect(colony.produced).toBe(8);
    expect(colony.productiveElapsed).toBeCloseTo(120, 8); expect(order(s, { kind: 'load' })).toBe(true);
    const produced = colony.produced; frames(s, 1); expect(colony.produced).toBe(produced);
    frames(s, 9); expect(colony.produced).toBe(produced + 1); expect(round(s)).toEqual(s);
  });

  it('pays two upgrades from earned deposits, increases future output and capacity without retroactive stock', () => {
    const s = founded(4), e = account(s), colony = e.colonies[0]; expect(e.balance).toBe(40);
    frames(s, 10); expect(colonyStock(colony)).toBe(1);
    expect(order(s, { kind: 'upgrade' })).toBe(true); expect(colony.level).toBe(2); expect(colony.produced).toBe(1);
    frames(s, 10); expect(colony.produced).toBe(3); expect(order(s, { kind: 'upgrade' })).toBe(true);
    expect(colony.level).toBe(3); expect(colony.upgraded).toBe(40); expect(e.ledger.upgrades).toBe(40); expect(e.balance).toBe(0);
    frames(s, 10); expect(colony.produced).toBe(6); frames(s, 90); expect(colonyStock(colony)).toBe(24);
    refuse(s, { kind: 'upgrade' }); expect(round(s)).toEqual(s);
  });

  it('rejects standalone level-one stock 24 after 240 legal seconds but preserves paid level-three stock after ecological capacity loss', () => {
    const low = founded(), colony = account(low).colonies[0]; frames(low, 240); low.checkpoint = null;
    expect(colony.productiveElapsed).toBeCloseTo(240, 8); expect(colony.level).toBe(1); expect(colony.loaded).toBe(0);
    expect(colony.produced).toBe(8); expect(round(low)).toEqual(low);
    // The time would permit 24 production cycles, but the never-upgraded
    // colony has no legal route to store more than its actual eight slots.
    colony.produced = 24; expect(colonyStock(colony)).toBe(24); refuseSave(low);

    const high = founded(4), highColony = account(high).colonies[0];
    expect(order(high, { kind: 'upgrade' })).toBe(true); expect(order(high, { kind: 'upgrade' })).toBe(true); frames(high, 80);
    expect(highColony.level).toBe(3); expect(colonyStock(highColony)).toBe(24); makeCheckpoint(high);
    for (const item of livingPlanet(high)!.life.filter(life => life.habitat.band === 1 && roleOf(life) === 0)) {
      atSpecimen(high, item.id); expect(useSpecimenTool(high, 'scan', item.id)).toBe(true); expect(useSpecimenTool(high, 'collect', item.id)).toBe(true);
    }
    expect(colonyCapacity(high, highColony)).toBe(0); expect(colonyStock(highColony)).toBe(24);
    expect(round(high)).toEqual(high); high.checkpoint = null; expect(round(high)).toEqual(high);
  });

  it('cannot assign the higher production rate retroactively to elapsed cycles when buying level two', () => {
    const s = source(3); settleSource(s); makeCheckpoint(s); expect(order(s, { kind: 'found' })).toBe(true);
    const e = account(s), colony = e.colonies[0]; frames(s, 80);
    expect(colony.productiveElapsed).toBeCloseTo(80, 8); expect(colony.produced).toBe(8);
    expect(order(s, { kind: 'upgrade' })).toBe(true); expect(colony.level).toBe(2); expect(colony.produced).toBe(8);
    const receipt = e.actions.at(-1)!; expect(receipt.kind).toBe('upgrade');
    if (receipt.kind !== 'upgrade') throw new Error('Expected the actual paid upgrade receipt.');
    expect(receipt.produced).toBe(8); expect(receipt.productiveElapsed).toBeCloseTo(80, 8); expect(round(s)).toEqual(s);
    colony.produced = 16; refuseSave(s); s.checkpoint = null; refuseSave(s);
  });

  it('stops output immediately when a real first-band role is missing, retains paid history and stock, then resumes after genuine recovery', () => {
    const s = founded(), e = account(s), colony = e.colonies[0], w = livingPlanet(s)!, life = livingExpedition(s)!;
    frames(s, 10); const victims = w.life.filter(item => item.habitat.band === 1 && roleOf(item) === 0);
    for (const item of victims) { atSpecimen(s, item.id); expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); expect(useSpecimenTool(s, 'collect', item.id)).toBe(true); }
    s.space!.location!.pos = { x: 35, y: 2.5, z: 35 }; expect(colonyCapacity(s, colony)).toBe(0);
    const stock = colonyStock(colony), paid = structuredClone(e.ledger), productive = colony.productiveElapsed;
    frames(s, 15); expect(colony.produced).toBe(stock); expect(colony.productiveElapsed).toBe(productive); expect(e.ledger).toEqual(paid); expect(e.colonies[0]).toBe(colony);
    for (const item of victims) expect(useSpecimenTool(s, 'release', item.id, 1)).toBe(true);
    expect(stableBandCapacity(life, w)).toBe(0); frames(s, 9); expect(colonyCapacity(s, colony)).toBe(0);
    frames(s, 11.2); expect(colonyCapacity(s, colony)).toBe(1); expect(colonyStock(colony)).toBeGreaterThan(stock); expect(round(s)).toEqual(s);
  });

  it('continues ordinary production in flight and at home while foreign ecological clocks remain frozen', () => {
    const s = founded(), e = account(s), colony = e.colonies[0], sourceWorld = livingPlanet(s)!, foreignBefore = structuredClone(sourceWorld);
    travel(s, 0); expect(sourceWorld).toEqual(foreignBefore); const colonyBefore = colony.produced, timeBefore = e.elapsed;
    frames(s, 10); expect(e.elapsed - timeBefore).toBeCloseTo(10, 8); expect(colony.produced).toBeGreaterThan(colonyBefore);
    expect(sourceWorld).toEqual(foreignBefore); expect(round(s)).toEqual(s);
  });

  it('does not run production from loading, invalid durations or a refused dead-player simulation step', () => {
    const s = founded(), before = structuredClone(account(s));
    expect(round(s)).toEqual(s); expect(account(s)).toEqual(before);
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) stepSpaceEconomy(s, dt);
    expect(account(s)).toEqual(before); s.deathReason = 'prepared stopped campaign'; frames(s, 1); expect(account(s)).toEqual(before);
  });
});

describe('C3b concrete shared cargo, markets, service and complete checkpoints', () => {
  it('loads only free shared slots, preserves the living passenger and prevents collection into product-filled capacity', () => {
    const s = founded(), e = account(s), colony = e.colonies[0]; frames(s, 80);
    const life = livingExpedition(s)!, passenger = structuredClone(life.cargo), capacity = shipStats(s.space!.ship!.creation.blueprint).cargo;
    const energy = s.space!.ship!.energy, stock = colonyStock(colony), revision = e.nextAction;
    expect(economyQuote(s, { kind: 'load' }, revision).amount).toBe(capacity - passenger.length);
    expect(applyEconomyOrder(s, { kind: 'load' }, revision)).toBe(true);
    expect(shipCargoCount(s)).toBe(capacity); expect(productCargoCount(s)).toBe(capacity - passenger.length);
    expect(colonyStock(colony)).toBe(stock - productCargoCount(s)); expect(life.cargo).toEqual(passenger); expect(s.space!.ship!.energy).toBe(energy);
    refuse(s, { kind: 'load' }, revision); refuse(s, { kind: 'load' });
    const resident = livingPlanet(s)!.life[0]; atSpecimen(s, resident.id); expect(useSpecimenTool(s, 'scan', resident.id)).toBe(true);
    const afterScan = withoutNotice(s); expect(specimenQuote(s, 'collect', resident.id).ok).toBe(false);
    expect(useSpecimenTool(s, 'collect', resident.id)).toBe(false); expect(withoutNotice(s)).toEqual(afterScan); expect(round(s)).toEqual(s);
  });

  it('keeps the old full biological cargo checkpoint valid after release followed by product loading at the same clock', () => {
    const s = founded(), e = account(s), life = livingExpedition(s)!; frames(s, 70);
    const capacity = shipStats(s.space!.ship!.creation.blueprint).cargo, collected = [] as string[];
    for (const item of [...livingPlanet(s)!.life].slice(0, capacity - life.cargo.length)) {
      atSpecimen(s, item.id); expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); expect(useSpecimenTool(s, 'collect', item.id)).toBe(true); collected.push(item.id);
    }
    expect(life.cargo).toHaveLength(capacity); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    s.space!.location!.pos = { x: 35, y: 2.5, z: 35 };
    for (const id of collected) expect(useSpecimenTool(s, 'release', id, 1)).toBe(true);
    s.space!.location!.pos = { x: 0, y: 3, z: 0 }; expect(order(s, { kind: 'load' })).toBe(true);
    expect(shipCargoCount(s)).toBe(capacity); expect(e.actions.at(-1)).toMatchObject({ kind: 'load', lifeAction: life.nextAction });
    expect(round(s)).toEqual(s); const restored = recoverGeneration(round(s));
    expect(livingExpedition(restored)!.cargo).toHaveLength(capacity); expect(account(restored)).toEqual(account(cp));
  });

  it('retains a legal eight-life checkpoint when the later eight-goods load rolls out behind 129 actual deposits', () => {
    // Explicit unit wealth setup BEFORE every relevant checkpoint. This case
    // tests bounded history and shared slots, not earning 3000 amber in play.
    // The wallet is never rewritten: all 131 deposits debit the real home pot.
    const s = founded(2, 3000), e = account(s), life = livingExpedition(s)!; frames(s, 80);
    const capacity = shipStats(s.space!.ship!.creation.blueprint).cargo; expect(capacity).toBe(8);
    for (const item of [...livingPlanet(s)!.life].slice(0, capacity - life.cargo.length)) {
      atSpecimen(s, item.id); expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); expect(useSpecimenTool(s, 'collect', item.id)).toBe(true);
    }
    expect(life.cargo).toHaveLength(8); expect(productCargoCount(s)).toBe(0); makeCheckpoint(s);
    const originalCheckpoint = s.checkpoint!, cp = JSON.parse(originalCheckpoint) as GameState;
    const released = life.cargo.map(item => item.id), releaseStart = life.nextAction;
    s.space!.location!.pos = { x: 35, y: 2.5, z: 35 };
    for (const id of released) expect(useSpecimenTool(s, 'release', id, 1)).toBe(true);
    s.space!.location!.pos = { x: 0, y: 3, z: 0 }; expect(order(s, { kind: 'load' })).toBe(true);
    expect(life.cargo).toEqual([]); expect(productCargoCount(s)).toBe(8); expect(round(s)).toEqual(s);
    travel(s, 0); const homeBefore = s.machines!.resource, moneyBefore = e.balance; deposit(s, 129);
    expect(s.machines!.resource).toBe(homeBefore - 129 * 20); expect(e.balance).toBe(moneyBefore + 129 * 20);
    expect(s.checkpoint).toBe(originalCheckpoint); expect(e.actions).toHaveLength(128); expect(e.actions.every(row => row.kind === 'deposit')).toBe(true);
    expect(e.actions.some(row => row.kind === 'load')).toBe(false);
    expect(life.actions.filter(row => row.serial >= releaseStart && row.kind === 'release').map(row => row.lifeId)).toEqual(released);
    expect(shipCargoCount(s)).toBe(8); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(livingExpedition(restored)!.cargo).toEqual(livingExpedition(cp)!.cargo);
    expect(productCargoCount(restored)).toBe(0); expect(account(restored)).toEqual(account(cp)); expect(restored.machines!.resource).toBe(cp.machines!.resource);
    // The load receipt has genuinely rolled out. Keep action counts/serials
    // internally consistent while claiming zero loads, or nine loads for only
    // eight units. Neither is a valid standalone account without its old CP.
    for (const loads of [0, 9]) {
      const forged = structuredClone(s); forged.checkpoint = null;
      const economy = account(forged), delta = loads - economy.counts.load;
      economy.counts.load = loads; economy.nextAction += delta;
      for (const row of economy.actions) row.serial += delta;
      refuseSave(forged);
    }
  });

  it('moves actual produced units to a different market, receives its quoted price once and uses revenue for bounded paid service', () => {
    const s = founded(), e = account(s), colony = e.colonies[0]; frames(s, 70); expect(order(s, { kind: 'load' })).toBe(true);
    const amount = productCargoCount(s), passenger = structuredClone(livingExpedition(s)!.cargo), originPlanetId = colony.planetId;
    refuse(s, { kind: 'sell', originPlanetId }); travel(s, 0);
    const quote = economyQuote(s, { kind: 'sell', originPlanetId }, e.nextAction), price = spaceMarketPrice(s.space!.homePlanetId, s.space!.homePlanetId, colony.product)!;
    expect(quote).toMatchObject({ ok: true, price, amount }); makeCheckpoint(s); const revision = e.nextAction;
    expect(applyEconomyOrder(s, { kind: 'sell', originPlanetId }, revision)).toBe(true);
    expect(e.balance).toBe(amount * price); expect(e.ledger.revenue).toBe(amount * price); expect(e.sales).toEqual([{ planetId: originPlanetId, product: colony.product, amount, earned: amount * price }]);
    expect(productCargoCount(s)).toBe(0); expect(livingExpedition(s)!.cargo).toEqual(passenger); refuse(s, { kind: 'sell', originPlanetId }, revision);
    expect(round(s)).toEqual(s); travel(s, 1);
    // Explicit damage/energy setup isolates bounded service effects. Revenue,
    // colony ownership, cargo movement and all payments are actual transactions.
    const stats = shipStats(s.space!.ship!.creation.blueprint); s.space!.ship!.health = stats.health - 7; s.space!.ship!.energy = stats.energy - 11;
    makeCheckpoint(s); const money = e.balance; expect(economyQuote(s, { kind: 'repair' }, e.nextAction)).toMatchObject({ ok: true, price: 5, amount: 7 });
    expect(order(s, { kind: 'repair' })).toBe(true); expect(s.space!.ship!.health).toBe(stats.health); refuse(s, { kind: 'repair' });
    expect(economyQuote(s, { kind: 'charge' }, e.nextAction)).toMatchObject({ ok: true, price: 3, amount: 11 });
    expect(order(s, { kind: 'charge' })).toBe(true); expect(s.space!.ship!.energy).toBe(stats.energy); refuse(s, { kind: 'charge' });
    expect(e.balance).toBe(money - 8); expect(e.ledger.repairs).toBe(5); expect(e.ledger.charging).toBe(3);
    expect(e.ledger.healthRestored).toBe(7); expect(e.ledger.energyRestored).toBe(11); expect(round(s)).toEqual(s);
    const cp = JSON.parse(s.checkpoint!) as GameState, restored = recoverGeneration(round(s));
    expect(account(restored)).toEqual(account(cp)); expect(restored.space!.ship).toEqual(cp.space!.ship);
  });

  it('roundtrips a complete loaded account through local storage, import identity and checkpoint without moving goods or earning twice', () => {
    const s = founded(); frames(s, 20); expect(order(s, { kind: 'load' })).toBe(true); makeCheckpoint(s);
    const original = structuredClone(s), store = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => store.set(key, value), getItem: (key: string) => store.get(key) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s); expect(round(s)).toEqual(s);
    const cp = JSON.parse(s.checkpoint!) as GameState; s.id += '-economy-import'; cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    expect(account(round(s))).toEqual(account(original)); expect(recoverGeneration(round(s)).space).toEqual({ ...cp.space!, notice: expect.any(String) });
    expect(productCargoCount(s)).toBe(2); expect(account(s).balance).toBe(0); expect(account(s).ledger.revenue).toBe(0);
  });
});
