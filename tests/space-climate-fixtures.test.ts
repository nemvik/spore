import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { climateEnergySpent, climateMatchesWork, climaticTier, newClimateWork } from '../src/game/space-climate';
import { livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { spaceLifeSpecies } from '../src/game/space-life';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtureInfo = {
  on: { file: 'native-c3a1-climate-on.save.json', sha: 'bd6e3e82676fa2fbd6b38323f7f44b9d712044a71e337fe027bcb2d81c9f934a' },
  off: { file: 'native-c3a1-climate-off.save.json', sha: '7b8c359b8c5e7286b95403bafd40bb59e03ae8fc346ae948b84cc552bd33e022' },
  active: { file: 'native-c3a1-campaign.save.json', sha: 'c9ceea1f68c9c5d0392ee202be04046ac9792b077fbe781b468df56f345d0009' },
} as const;
type Fixture = keyof typeof fixtureInfo;
const kinds = ['on', 'off', 'active'] as const;
const bytes = (kind: Fixture) => readFileSync(`tests/fixtures/space/${fixtureInfo[kind].file}`);
const load = (kind: Fixture) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const home = (s: GameState) => { const { id: _id, checkpoint: _checkpoint, space: _space, ...rest } = s; return structuredClone(rest); };
afterEach(() => vi.unstubAllGlobals());

describe('C3a1 byte-identical native climate exports', () => {
  it.each(kinds)('retains exact %s bytes and content across export, local load and public-import identity changes', kind => {
    const original = bytes(kind), s = parseGame(original.toString());
    expect(hash(original)).toBe(fixtureInfo[kind].sha); expect(s).toEqual(JSON.parse(original.toString()).state);
    expect(round(s)).toEqual(s);
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, text: string) => store.set(key, text), getItem: (key: string) => store.get(key) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-fixture-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    expect(round(imported)).toEqual(imported); expect(imported.space).toEqual(s.space); expect(bytes(kind)).toEqual(original);
  });

  it.each(kinds)('preserves the real paid ship, B2, physical cargo and stable source model in %s', kind => {
    const s = load(kind), e = livingExpedition(s)!, origin = e.worlds[0];
    // Earlier C2 proof has the same immutable lineage and physical inhabitants;
    // its different play clocks are deliberately not treated as this run's input.
    const older = parseGame(readFileSync('tests/fixtures/space/native-c2-campaign.save.json', 'utf8'));
    const old = older.space!.expedition!;
    expect(e.version).toBe(2); expect(e.cargo).toHaveLength(1);
    const { habitat, ...item } = e.cargo[0]; expect(item).toEqual(old.cargo[0]);
    expect(habitat).toEqual({ band: 2, reproduction: 0, sinceHunt: 120, birth: null });
    expect(origin.life.map(({ habitat: _habitat, ...life }) => life)).toEqual(old.worlds[0].life);
    expect(origin.life).toHaveLength(35); expect(origin.designs).toEqual(old.worlds[0].designs);
    expect(origin.elapsed).toBe(13.800000000000265); expect(origin.biosphere.activatedElapsed).toBe(origin.elapsed);
    expect(origin.biosphere.work).toEqual(newClimateWork());
    expect(e.worlds.flatMap(world => world.life).some(life => life.id === item.id)).toBe(false);
    expect(spaceLifeSpecies(e, e.cargo[0])!.genome).toEqual(origin.designs.find(design => design.species === 'gnaw')!.creation.genome);
    expect(s.space!.ship!.creation).toEqual(older.space!.ship!.creation); expect(s.space!.ship!.purchase).toEqual(older.space!.ship!.purchase);
    expect(s.civilization).toEqual(older.civilization); expect(s.lineageHistory).toEqual(older.lineageHistory);
    expect(s.cities).toEqual(older.cities); expect(s.commerce).toEqual(older.commerce); expect(s.military).toEqual(older.military);
    expect(e.biosphere).toMatchObject({ activatedAt: 150.30000000001175, activatedAction: 6, paidScans: 2, paidTransfers: kind === 'active' ? 5 : 3 });
    expect(e.energySpent).toBe(kind === 'active' ? 12 : 8); expect(e.actions.map(action => action.energyPaid).reduce((a, b) => a + b, 0)).toBe(e.energySpent);
    expect(e.biosphere.origins).toEqual([{ planetId: origin.id, births: [0, 0, 0, 0, 0, 0], deaths: [0, 0, 0, 0, 0, 0], founderDeaths: [] }]);
  });

  it.each(kinds)('restores the actual older pre-purchase checkpoint from %s without inventing climate or cargo', kind => {
    const s = load(kind), cp = JSON.parse(s.checkpoint!) as GameState, restored = recoverGeneration(round(s));
    expect(cp.tick).toBe(66066); expect(cp.space!.elapsed).toBe(0); expect(cp.space!.ship).toBeNull();
    expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines);
    expect(restored.machines!.resource).toBe(155.76499999940776);
    const e = livingExpedition(restored)!;
    expect(e.worlds).toEqual([]); expect(e.cargo).toEqual([]); expect(e.actions).toEqual([]); expect(e.energySpent).toBe(0);
    expect(e.biosphere).toEqual({ version: 1, activatedAt: 0, activatedAction: 1, tool: 'off', toolPlanetId: null, paidScans: 0, paidTransfers: 0, origins: [] });
    expect(round(restored).space).toEqual(cp.space);
  });

  it('retains opposite native climate origins, paid work, the band-2 round trip and T3 without inventing an ecosystem', () => {
    const s = load('active'), e = livingExpedition(s)!, [source, hot, cold] = e.worlds;
    expect(e.worlds).toHaveLength(3); expect(s.space!.location).toBeNull(); expect(s.space!.leg).toBeNull();
    expect(s.space!.log.at(-1)).toMatchObject({ serial: 84, from: 'surface', to: 'dock', planetId: s.space!.homePlanetId });
    expect(hot.biosphere.initial).toEqual({ temperature: .8, atmosphere: -.7 });
    expect(cold.biosphere.initial).toEqual({ temperature: -.75, atmosphere: .8 });
    expect(hot.biosphere.work).toEqual({ warm: 0.04800000000000004, cool: 0.7784999999999365, thicken: 0.6779999999999586, thin: 0, temperatureDrift: 0, atmosphereDrift: 0 });
    expect(cold.biosphere.work).toEqual({ warm: 0.7274999999999476, cool: 0, thicken: 0, thin: 0.7774999999999366, temperatureDrift: 0, atmosphereDrift: 0 });
    for (const world of [hot, cold]) {
      expect(climaticTier(world)).toBe(3); expect(climateMatchesWork(world, world.biosphere.initial, world.biosphere.work)).toBe(true);
      expect(world.life).toEqual([]); expect(world.biosphere.stableFor).toEqual([0, 0, 0]);
    }
    expect(climateEnergySpent(hot.biosphere.work)).toBeCloseTo(100.3, 8);
    expect(climateEnergySpent(cold.biosphere.work)).toBeCloseTo(100.3333333333256, 8);
    expect(e.actions.slice(-2)).toEqual([
      { serial: 6, at: 229.85000000007506, kind: 'release', planetId: hot.id, lifeId: e.cargo[0].id, energyPaid: 2, band: 2 },
      { serial: 7, at: 229.96666666674182, kind: 'collect', planetId: hot.id, lifeId: e.cargo[0].id, energyPaid: 2 },
    ]);
    expect(source.life.length + e.cargo.length).toBe(36);
  });

  it('keeps every domestic field frozen between the real ON/OFF exports and accounts for ordinary post-dock time separately', () => {
    const on = load('on'), off = load('off'), active = load('active');
    expect(on.id).not.toBe(off.id); expect(off.id).not.toBe(active.id);
    expect(home(on)).toEqual(home(off)); expect(on.tick).toBe(66933); expect(on.machines!.resource).toBe(69.10999999940955);
    expect(livingExpedition(on)!.biosphere).toMatchObject({ tool: 'cool', toolPlanetId: livingPlanet(on)!.id });
    expect(livingExpedition(off)!.biosphere).toMatchObject({ tool: 'off', toolPlanetId: null });
    expect(livingExpedition(on)!.cargo).toEqual(livingExpedition(off)!.cargo);
    expect(livingExpedition(on)!.worlds[0]).toEqual(livingExpedition(off)!.worlds[0]);
    expect(livingExpedition(off)!.worlds[0]).toEqual(livingExpedition(active)!.worlds[0]);
    expect(climaticTier(livingPlanet(on)!)).toBe(1); expect(climaticTier(livingPlanet(off)!)).toBe(3);
    // Native export happens after the actual dock: 17 home ticks and .425 amber
    // are legitimate, not evidence of home clocks advancing during the flight.
    expect(active.tick - off.tick).toBe(17); expect(active.machines!.resource - off.machines!.resource).toBeCloseTo(.425, 9);
    expect(active.cities).toEqual(off.cities); expect(active.states!.entries).toEqual(off.states!.entries);
  });

  it.each(['on', 'off'] as const)('separately prepares a complete %s flight checkpoint and restores climate, energy, cargo and home together', kind => {
    // Unit continuation of native bytes. This new CP was not made by the browser.
    const s = load(kind), original = structuredClone(s.space), domestic = home(s), e = livingExpedition(s)!;
    const cargo = structuredClone(e.cargo); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.space).toEqual(original); const startClimate = livingPlanet(s)!.temperature, startWork = climateEnergySpent(livingPlanet(s)!.biosphere.work);
    for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT, 1 / 30);
    if (kind === 'on') {
      expect(livingPlanet(s)!.temperature).toBeCloseTo(startClimate - .03, 10);
      expect(climateEnergySpent(livingPlanet(s)!.biosphere.work) - startWork).toBeCloseTo(2, 9);
    } else {
      expect(livingPlanet(s)!.temperature).toBe(startClimate); expect(climateEnergySpent(livingPlanet(s)!.biosphere.work)).toBe(startWork);
    }
    expect(e.cargo).toEqual(cargo); expect(home(s)).toEqual(domestic); expect(round(s).space).toEqual(s.space);
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual({ ...original, notice: expect.any(String) });
    expect(home(restored)).toEqual(domestic); expect(round(restored).space!.expedition).toEqual(original!.expedition);
  });
});
