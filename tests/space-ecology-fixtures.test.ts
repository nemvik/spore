import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { bandPopulation, livingExpedition } from '../src/game/space-biosphere';
import { stableBandCapacity } from '../src/game/space-ecology';
import { enableSpaceEconomy, spaceEconomy } from '../src/game/space-economy';
import { LIFE_PROFILES, spaceLifeSpecies } from '../src/game/space-life';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const info = {
  cold: { file: 'native-c3a2-cold-stable.save.json', sha: 'c47435be89e18899275cff7f8d2862e06cde6385e94cf57e478ff29f3fbfbec6',
    births: [19, 19, 19, 17, 17, 19], populations: [46, 46, 54], nextAction: 263 },
  active: { file: 'native-c3a2-campaign.save.json', sha: '5745841b9804cf2e6871e096e8df215cab66fc6ba8ac34ebaa7866fb1006c175',
    births: [21, 21, 21, 17, 17, 19], populations: [49, 49, 54], nextAction: 269 },
} as const;
type Kind = keyof typeof info;
const kinds = ['cold', 'active'] as const;
const bytes = (kind: Kind) => readFileSync(`tests/fixtures/space/${info[kind].file}`);
const load = (kind: Kind) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const domestic = (s: GameState) => { const { checkpoint: _cp, space: _space, ...rest } = s; return structuredClone(rest); };
afterEach(() => vi.unstubAllGlobals());

describe('C3a2 unchanged native healthy-ecology continuation exports', () => {
  it.each(kinds)('keeps %s bytes, all rolled histories and absence of economy exact through parse/export/local load and rekey', kind => {
    const raw = bytes(kind), s = parseGame(raw.toString());
    expect(hash(raw)).toBe(info[kind].sha); expect(s).toEqual(JSON.parse(raw.toString()).state);
    expect(round(s)).toEqual(s); expect(Object.hasOwn(s.space!, 'economy')).toBe(false);
    expect(Object.hasOwn((JSON.parse(s.checkpoint!) as GameState).space!, 'economy')).toBe(false);
    const local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => local.set(key, value), getItem: (key: string) => local.get(key) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-native-fixture-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    expect(round(imported)).toEqual(imported); expect(imported.space).toEqual(s.space); expect(bytes(kind)).toEqual(raw);
  });

  it.each(kinds)('conserves all 36 founders and each actually born individual in %s with exact paid counters', kind => {
    const s = load(kind), e = livingExpedition(s)!, [source, hot, cold] = e.worlds, all = e.worlds.flatMap(world => world.life);
    expect(e.version).toBe(2); expect(e.biosphere.version).toBe(2); expect(e.cargo).toEqual([]);
    expect(e.biosphere.origins).toEqual([{ planetId: source.id, births: info[kind].births, deaths: [0, 0, 0, 0, 0, 0], founderDeaths: [] }]);
    expect(e.biosphere.ecology).toEqual({ activatedAt: 350.3333333333434, activatedAction: 8 });
    expect(e.biosphere).toMatchObject({ tool: 'off', toolPlanetId: null, paidScans: 50, paidTransfers: 102 });
    expect(e.energySpent).toBe(254); expect(e.scans).toHaveLength(49); expect(e.nextAction).toBe(info[kind].nextAction);
    expect(e.actions).toHaveLength(128); expect(e.actions[0].serial).toBe(e.nextAction - 128);
    expect(e.worlds.map(world => world.life.length)).toEqual(info[kind].populations);
    expect(new Set(all.map(item => item.id)).size).toBe(all.length);
    expect(all.length).toBe(36 + info[kind].births.reduce((sum, count) => sum + count, 0));
    const founders = all.filter(item => !item.habitat.birth);
    expect(founders).toHaveLength(36); expect(new Set(founders.map(item => item.id))).toEqual(new Set(Array.from({ length: 36 }, (_, i) => `${source.id}:life-${i + 1}`)));
    expect(source.life.filter(item => !item.habitat.birth)).toHaveLength(36);
    expect(hot.life.every(item => item.habitat.birth)).toBe(true); expect(cold.life.every(item => item.habitat.birth)).toBe(true);
    for (const [role, profile] of LIFE_PROFILES.entries()) expect(all.filter(item => item.taxonKey === profile.key)).toHaveLength(6 + info[kind].births[role]);
    for (const world of e.worlds) {
      expect(stableBandCapacity(e, world)).toBe(3); expect(world.biosphere.stableFor).toEqual([10, 10, 10]);
      expect(world.life.every(item => item.health >= 40 && item.nutrition >= .2)).toBe(true);
      for (const band of [1, 2, 3] as const) expect(bandPopulation(world, band).every(count => count > 0)).toBe(true);
    }
  });

  it.each(kinds)('preserves actual hot-born settlers and their cold-born descendants with the original source genome in %s', kind => {
    const e = livingExpedition(load(kind))!, [source, hot, cold] = e.worlds;
    const all = new Map(e.worlds.flatMap(world => world.life).map(item => [item.id, item]));
    const settlers = cold.life.filter(item => item.habitat.birth!.planetId === hot.id);
    const nativeChildren = cold.life.filter(item => item.habitat.birth!.planetId === cold.id);
    expect(settlers).toHaveLength(24); expect(nativeChildren).toHaveLength(30);
    for (const settler of settlers) expect(e.scans.find(scan => scan.lifeId === settler.id)?.planetId).toBe(hot.id);
    for (const item of cold.life) {
      expect(item.originPlanetId).toBe(source.id); expect(item.id.startsWith(`${source.id}:born-`)).toBe(true);
      const parent = all.get(item.habitat.birth!.parentId)!; expect(parent).toBeDefined();
      expect(parent.taxonKey).toBe(item.taxonKey); expect(parent.originPlanetId).toBe(source.id);
      if (parent.habitat.birth) expect(parent.habitat.birth.at).toBeLessThanOrEqual(item.habitat.birth!.at);
      if (item.taxonKey.startsWith('species:')) {
        const design = source.designs.find(design => design.species === item.taxonKey.slice('species:'.length))!;
        expect(spaceLifeSpecies(e, item)!.genome).toEqual(design.creation.genome);
        expect(spaceLifeSpecies(e, item)!.creationId).toBe(design.creation.id);
      }
    }
    expect(nativeChildren.every(item => !e.scans.some(scan => scan.lifeId === item.id))).toBe(true);
    for (const band of [1, 2, 3] as const) expect(bandPopulation(cold, band)).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it.each(kinds)('retains the actual older pre-purchase checkpoint in %s and restores it without ecology or account grants', kind => {
    const s = load(kind), rawCheckpoint = JSON.parse(bytes(kind).toString()).state.checkpoint as string;
    expect(s.checkpoint).toBe(rawCheckpoint); const cp = JSON.parse(rawCheckpoint) as GameState;
    expect(cp.tick).toBe(66066); expect(cp.machines!.resource).toBe(155.76499999940776);
    expect(cp.space!.ship).toBeNull(); expect(cp.space!.elapsed).toBe(0); expect(livingExpedition(cp)!.worlds).toEqual([]);
    const restored = recoverGeneration(round(s));
    expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines); expect(restored.planet).toEqual(cp.planet);
    expect(restored.civilization).toEqual(cp.civilization); expect(restored.lineageHistory).toEqual(cp.lineageHistory);
    expect(spaceEconomy(restored)).toBeNull(); expect(livingExpedition(restored)!.biosphere).toMatchObject({
      version: 2, paidScans: 0, paidTransfers: 0, origins: [], ecology: { activatedAt: 0, activatedAction: 1 },
    });
    expect(round(restored).space).toEqual(cp.space);
  });

  it.each(kinds)('explicit economy activation adds only empty live/old-checkpoint accounts to %s', kind => {
    const s = load(kind), before = structuredClone(s), oldCp = JSON.parse(s.checkpoint!) as GameState;
    enableSpaceEconomy(s); const e = spaceEconomy(s)!, cp = JSON.parse(s.checkpoint!) as GameState, ce = spaceEconomy(cp)!;
    const { economy: _economy, ...oldSpace } = s.space!, { economy: _cpEconomy, ...oldCheckpointSpace } = cp.space!;
    expect(oldSpace).toEqual(before.space); expect(oldCheckpointSpace).toEqual(oldCp.space); expect(domestic(s)).toEqual(domestic(before));
    expect(domestic(cp)).toEqual(domestic(oldCp));
    for (const account of [e, ce]) {
      expect(account.balance).toBe(0); expect(account.elapsed).toBe(0); expect(account.nextAction).toBe(1);
      expect(account.colonies).toEqual([]); expect(account.cargo).toEqual([]); expect(account.sales).toEqual([]); expect(account.actions).toEqual([]);
      expect(Object.values(account.ledger).every(n => n === 0)).toBe(true); expect(Object.values(account.counts).every(n => n === 0)).toBe(true);
    }
    expect(e.activated.spaceAt).toBe(before.space!.elapsed); expect(ce.activated.spaceAt).toBe(0);
    const once = structuredClone(s); enableSpaceEconomy(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
    expect(spaceEconomy(recoverGeneration(round(s)))).toEqual(ce);
  });

  it('keeps the paid ship and frozen B2 history while accounting separately for the real post-dock home ticks', () => {
    const cold = load('cold'), active = load('active'), a1 = parseGame(readFileSync('tests/fixtures/space/native-c3a1-campaign.save.json', 'utf8'));
    expect(active.space!.ship!.creation).toEqual(a1.space!.ship!.creation); expect(active.space!.ship!.purchase).toEqual(a1.space!.ship!.purchase);
    expect(active.space!.ship!.purchase.paid).toBe(108); expect(active.space!.location).toBeNull(); expect(active.space!.leg).toBeNull();
    expect(active.space!.log.at(-1)).toMatchObject({ serial: 164, from: 'surface', to: 'dock', planetId: active.space!.homePlanetId });
    for (const s of [cold, active]) {
      expect(s.civilization).toEqual(a1.civilization); expect(s.lineageHistory).toEqual(a1.lineageHistory);
      expect(s.cities).toEqual(a1.cities); expect(s.commerce).toEqual(a1.commerce); expect(s.military).toEqual(a1.military);
      expect(livingExpedition(s)!.worlds[0].designs).toEqual(livingExpedition(a1)!.worlds[0].designs);
    }
    expect(cold.tick).toBe(66980); expect(active.tick - cold.tick).toBe(50);
    expect(active.machines!.resource - cold.machines!.resource).toBeCloseTo(1.25, 9);
    expect(livingExpedition(active)!.biosphere.origins[0].births.reduce((a, b) => a + b, 0)).toBe(116);
  });

  it('separately prepares a complete cold-surface checkpoint and restores its physiology and inactive worlds exactly', () => {
    // Explicit unit continuation; the original native checkpoint is much older.
    const s = load('cold'), e = livingExpedition(s)!, home = domestic(s), inactive = structuredClone(e.worlds.slice(0, 2));
    makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, beforeTime = e.worlds[2].elapsed;
    for (let n = 0; n < 30; n++) step(s, EMPTY_INPUT, 1 / 30);
    expect(e.worlds[2].elapsed).toBeCloseTo(beforeTime + 1, 9); expect(e.worlds.slice(0, 2)).toEqual(inactive);
    expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual({ ...cp.space!, notice: expect.any(String) }); expect(domestic(restored)).toEqual(home);
  });
});
