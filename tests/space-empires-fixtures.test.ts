import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import { spaceEconomy } from '../src/game/space-economy';
import { applyEmpireOrder, empireQuote, missionProgress } from '../src/game/space-empires';
import type { EmpireId } from '../src/game/space-empires-types';
import { useSpecimenTool } from '../src/game/space-expedition';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  active: { name: 'native-d1-campaign.save.json', sha: 'b2cf84538fea52c2e243affcbc2e0896507ccabe63d287d68a307e8986f8972e' },
  before: { name: 'native-d1-before-roots-accept.save.json', sha: '3937954d012cb894ea6cefc0dfcd55349472592ff6b5c64aa9e9997fe47003cf' },
  branch: { name: 'native-d1-survey-branch.save.json', sha: 'b77ce2200ef96db10971efa1b7df7c15020d8f3dbaa074dde1aef8bf6bfea9b1' },
} as const;
type Kind = keyof typeof fixtures;
const kinds = ['active', 'before', 'branch'] as const;
const bytes = (kind: Kind) => readFileSync(`tests/fixtures/space/${fixtures[kind].name}`);
const load = (kind: Kind) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const account = (s: GameState) => spaceEconomy(s)!;
const registry = (s: GameState) => s.space!.empires!;
const empire = (s: GameState, id: EmpireId) => registry(s).entries.find(e => e.id === id)!;
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
afterEach(() => vi.unstubAllGlobals());

describe('D1 exact native diplomacy continuation and alternative branch', () => {
  it.each(kinds)('keeps exact %s bytes and v2 account without silently installing D2', kind => {
    const raw = bytes(kind), s = parseGame(raw.toString());
    expect(createHash('sha256').update(raw).digest('hex')).toBe(fixtures[kind].sha);
    expect(s).toEqual(JSON.parse(raw.toString()).state); expect(round(s)).toEqual(s);
    expect(account(s).version).toBe(2); expect(account(s).pricingActivatedAction).toBe(15);
    expect(Object.hasOwn(s.space!, 'outfit')).toBe(false);
    expect(Object.hasOwn(account(s).ledger, 'equipment')).toBe(false);
    expect(bytes(kind)).toEqual(raw);
  });

  it.each(kinds)('preserves all %s transactions, stable addresses and B2 on local load and import rekey', kind => {
    const s = load(kind), local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => local.set(key, value), getItem: (key: string) => local.get(key) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-fixture-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp);
    const loaded = round(imported); expect(loaded).toEqual(imported); expect(loaded.space).toEqual(s.space);
    expect(loaded.lineageHistory).toEqual(s.lineageHistory); expect(loaded.civilization).toEqual(s.civilization);
    expect(account(loaded).balance).toBe(425); expect(loaded.machines!.resource).toBe(s.machines!.resource);
  });

  it.each(kinds)('restores the actual old %s checkpoint with independent cuts and no late money, ship or treaty', kind => {
    const s = load(kind), checkpoint = JSON.parse(bytes(kind).toString()).state.checkpoint as string;
    expect(s.checkpoint).toBe(checkpoint); const cp = JSON.parse(checkpoint) as GameState;
    expect(cp.tick).toBe(66066); expect(cp.machines!.resource).toBe(155.76499999940776);
    expect(cp.space!.ship).toBeNull(); expect(cp.space!.elapsed).toBe(0); expect(livingExpedition(cp)!.worlds).toEqual([]);
    expect(account(cp)).toMatchObject({ version: 2, pricingActivatedAction: 1, balance: 0, actions: [], nextAction: 1 });
    expect(registry(cp)).toMatchObject({ activated: { at: 0, tick: 66066, travelAction: 1, lifeAction: 1, economyAction: 1 }, inheritance: null, actions: [], nextAction: 1 });
    expect(registry(cp).protectedColonies).toEqual(registry(s).protectedColonies);
    expect(registry(cp).entries.every(e => e.contact === null && e.mission === null && e.treaty === null)).toBe(true);
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines);
    expect(restored.civilization).toEqual(cp.civilization); expect(restored.lineageHistory).toEqual(cp.lineageHistory);
    expect(round(restored).space).toEqual(cp.space);
  });

  it('preserves earlier v1 price receipts and earns exactly 80 before the treaty and 96 after it', () => {
    const s = load('active'), e = account(s), c3 = parseGame(readFileSync('tests/fixtures/space/native-c3b-campaign.save.json', 'utf8'));
    expect(e.actions.slice(0, 14)).toEqual(account(c3).actions);
    expect(e.ledger).toEqual({ deposits: 60, construction: 80, upgrades: 40, repairs: 0, charging: 3, revenue: 488,
      healthRestored: 0, energyRestored: 15.791666666667709 });
    expect(e.balance).toBe(60 + 488 - 80 - 40 - 3);
    const sales = e.actions.slice(14).filter(row => row.kind === 'sell');
    expect(sales.map(row => [row.serial, row.amount, row.unitPrice, row.earned])).toEqual([[16, 8, 10, 80], [18, 8, 12, 96]]);
    expect(sales[0].priceBasis).toEqual({ version: 1, base: 10, empireId: 'resin', treatySerial: null, relationRevision: null, bonus: 0 });
    expect(sales[1].priceBasis).toEqual({ version: 1, base: 10, empireId: 'resin', treatySerial: 4, relationRevision: 3, bonus: 2 });
    expect(e.colonies.map(c => [c.level, c.produced, c.loaded])).toEqual([[2, 48, 32], [2, 24, 8]]);
    expect(e.cargo).toEqual([]); expect(s.space!.location).toBeNull(); expect(s.space!.leg).toBeNull();
    expect(s.space!.log.at(-1)).toMatchObject({ serial: 286, to: 'dock', planetId: s.space!.homePlanetId });
    expect(registry(s).inheritance).toEqual({ version: 1, diet: { coverage: 'unknown', kind: 'unknown', plants: null, meat: null, other: null },
      creature: null, tribe: 'allied', civilization: ['trade'], scores: { keeper: 0, broker: 12, vanguard: 0 }, philosophy: 'broker' });
    expect(s.space!.ship!.creation).toEqual(c3.space!.ship!.creation); expect(s.space!.ship!.purchase).toEqual(c3.space!.ship!.purchase);
    expect(s.civilization).toEqual(c3.civilization); expect(s.lineageHistory).toEqual(c3.lineageHistory);
  });

  it('credits six genuinely paid new role scans, preserving the earlier first discovery and three completed missions', () => {
    const s = load('active'), before = load('before'), p = livingExpedition(s)!, old = livingExpedition(before)!;
    const mission = empire(s, 'roots').mission!;
    expect(registry(s).actions.slice(0, 5)).toEqual(registry(before).actions); expect(registry(s).actions).toHaveLength(12);
    expect(mission).toMatchObject({ kind: 'ecology', accepted: 6, completed: 7 }); expect(missionProgress(empire(s, 'roots'))).toBe(6);
    expect(mission.evidence.map(row => row.kind === 'ecology' ? [row.role, row.receipt.serial, row.receipt.energyPaid] : null))
      .toEqual([[0, 286, 1], [1, 287, 1], [2, 288, 1], [3, 289, 1], [4, 290, 1], [5, 291, 1]]);
    for (const witness of mission.evidence) expect(p.actions.find(row => row.serial === witness.receipt.serial)).toEqual(witness.receipt);
    const firstId = `${mission.targetPlanetId}:life-1`;
    expect(p.scans.find(row => row.lifeId === firstId)).toEqual(old.scans.find(row => row.lifeId === firstId));
    expect(old.scans.find(row => row.lifeId === firstId)).toBeDefined();
    expect(registry(s).entries.map(e => [e.id, e.mission!.kind, e.mission!.completed, e.treaty]))
      .toEqual([['resin', 'trade', 3, 4], ['roots', 'ecology', 7, 8], ['basalt', 'survey', 11, 12]]);
    expect(empire(s, 'basalt').mission!.evidence[0]).toMatchObject({ kind: 'survey', receipt: { serial: 269, from: 'orbit', to: 'surface', planetId: `${s.space!.homePlanetId}:star-8:planet` } });
  });

  it('keeps the independent roots survey alternative without inventing biology scans or changing the main campaign', () => {
    const s = load('branch'), before = load('before'), mainBytes = bytes('active');
    expect(registry(s).actions.slice(0, 5)).toEqual(registry(before).actions); expect(registry(s).actions).toHaveLength(8);
    expect(empire(s, 'roots').mission).toMatchObject({ kind: 'survey', accepted: 6, completed: 7, targetPlanetId: `${s.space!.homePlanetId}:star-5:planet`,
      evidence: [{ kind: 'survey', receipt: { serial: 252, from: 'orbit', to: 'surface' } }] });
    expect(empire(s, 'basalt')).toMatchObject({ contact: null, mission: null, treaty: null });
    expect(livingExpedition(s)!.actions).toEqual(livingExpedition(before)!.actions); expect(account(s).actions).toEqual(account(before).actions);
    expect(s.space!.location).toBeNull(); expect(s.space!.log.at(-1)).toMatchObject({ serial: 266, to: 'dock' });
    expect(createHash('sha256').update(mainBytes).digest('hex')).toBe(fixtures.active.sha);
  });

  it('separately prepares a full flight checkpoint before acceptance, pays for a rescan and recovers the actual earlier choice', () => {
    // Prepared unit checkpoint and proximity, not a generation checkpoint or input observed in native evidence.
    const s = load('before'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    const cmd = { kind: 'accept', empireId: 'roots' } as const;
    expect(empireQuote(s, cmd, registry(s).nextAction).ok).toBe(true);
    expect(applyEmpireOrder(s, cmd, registry(s).nextAction)).toBe(true);
    const body = livingPlanet(s)!.life.find(row => row.id === `${empire(s, 'roots').capitalId}:life-1`)!;
    s.space!.location!.pos = { x: body.pos.x, y: Math.max(2, body.pos.y + 1), z: body.pos.z };
    const energy = s.space!.ship!.energy; expect(useSpecimenTool(s, 'scan', body.id)).toBe(true);
    expect(s.space!.ship!.energy).toBe(energy - 1); expect(missionProgress(empire(s, 'roots'))).toBe(1); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(registry(restored)).toEqual(registry(cp)); expect(account(restored)).toEqual(account(cp));
    expect(restored.space!.expedition).toEqual(cp.space!.expedition); expect(restored.space!.ship).toEqual(cp.space!.ship);
  });

  it('separately prepares a full home checkpoint and retains closed diplomacy across ordinary frames and recovery', () => {
    const s = load('active'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(registry(s)).toEqual(registry(cp)); expect(account(s).balance).toBe(425); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(registry(restored)).toEqual(registry(cp)); expect(account(restored)).toEqual(account(cp));
  });

  it.each(['price', 'role', 'prefix'] as const)('rejects tampered %s evidence while keeping source bytes immutable', kind => {
    const s = load('active');
    if (kind === 'price') { const row = account(s).actions.find(row => row.serial === 18)!; if (row.kind !== 'sell') throw new Error('fixture sale'); row.priceBasis!.treatySerial = null; }
    else if (kind === 'role') { const proof = empire(s, 'roots').mission!.evidence[0]; if (proof.kind !== 'ecology') throw new Error('fixture scan'); proof.role = 5; }
    else { makeCheckpoint(s); registry(s).actions[0].cut.at += 0.01; }
    reject(s); expect(createHash('sha256').update(bytes('active')).digest('hex')).toBe(fixtures.active.sha);
  });
});
