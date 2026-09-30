import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { fireSpacePulse } from '../src/game/space-combat';
import { latestBattle } from '../src/game/space-combat-content';
import { applyEconomyOrder, colonyCapacity, economyQuote } from '../src/game/space-economy';
import { enableSpaceEvents, resumeColony, resumeColonyQuote } from '../src/game/space-events';
import { quarantineAt } from '../src/game/space-events-content';
import { changeSpaceScale } from '../src/game/space';
import { recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  campaign: { sha: '3acb977ae01fc9be5192207cefeb9d0e1ee96ab2ca406405a5cc99f94797a5c1', health: 99, balance: 308 },
  quarantine: { sha: '1a0b92325cd30b1d98654e92aa7dd26e6020beef1a6f88fadc662246ec2393da', health: 115, balance: 212 },
  battle: { sha: '29cca82110c101177b9d82d27a29e2fa0bcf58af0211c3b6762999689e70b754', health: 107, balance: 212 },
  retreat: { sha: 'a783e9e55b779e1c7590f40e1ee7873bddc81dfa06ee5651b9892fbad54814f2', health: 107, balance: 212 },
} as const;
type Kind = keyof typeof fixtures;
const kinds = Object.keys(fixtures) as Kind[];
const bytes = (kind: Kind) => readFileSync(`tests/fixtures/space/native-d3c-${kind}.save.json`);
const load = (kind: Kind) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const account = (s: GameState) => s.space!.economy!;
const events = (s: GameState) => s.space!.events!;
const hotId = (s: GameState) => `${s.space!.homePlanetId}:star-2:planet`;
const colony = (s: GameState) => account(s).colonies.find(c => c.planetId === hotId(s))!;
const oldCampaign = () => parseGame(readFileSync('tests/fixtures/space/native-d3b-campaign.save.json', 'utf8'));
function rekey(s: GameState) {
  const copy = structuredClone(s), cp = JSON.parse(copy.checkpoint!) as GameState;
  copy.id += '-fixture-import'; cp.id = copy.id; copy.checkpoint = JSON.stringify(cp); return round(copy);
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
afterEach(() => vi.unstubAllGlobals());

describe('D3c byte-identical played quarantine and automatic cargo-pirate exports', () => {
  it.each(kinds)('roundtrips exact %s bytes without incident replay, implicit repair or payment', kind => {
    const raw = bytes(kind), s = parseGame(raw.toString());
    expect(createHash('sha256').update(raw).digest('hex')).toBe(fixtures[kind].sha);
    expect(s).toEqual(JSON.parse(raw.toString()).state); expect(round(s)).toEqual(s);
    const before = structuredClone(s); enableSpaceEvents(s); expect(s).toEqual(before);
    expect(s.space!.ship!.health).toBe(fixtures[kind].health); expect(account(s).balance).toBe(fixtures[kind].balance);
    expect(account(s).version).toBe(6); expect(events(s).version).toBe(1); expect(bytes(kind)).toEqual(raw);
  });

  it.each(kinds)('saves, loads and rekeys %s with the same cargo, local crisis and battle identity', kind => {
    const s = load(kind), local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = rekey(s); expect(imported.id).not.toBe(s.id); expect(imported.space).toEqual(s.space);
    expect(JSON.parse(imported.checkpoint!).id).toBe(imported.id); expect(imported.civilization).toEqual(s.civilization);
  });

  it.each(kinds)('recovers the genuine pre-purchase %s checkpoint without copying later event knowledge backwards', kind => {
    const s = load(kind), cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.tick).toBe(66066); expect(cp.space!.ship).toBeNull(); expect(account(cp).balance).toBe(0);
    expect(events(cp)).toMatchObject({ version: 1, actions: [], nextAction: 1, watches: [], candidate: null,
      activated: { cut: { at: 0, economyAction: 1 }, economyAt: 0, loadCount: 0 } });
    expect(Object.values(events(cp).current.totals).every(n => n === 0)).toBe(true);
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual(cp.space);
    expect(restored.machines).toEqual(cp.machines); expect(round(restored).space).toEqual(cp.space);
  });

  it('retains all36 earlier receipts, six actual battles, war outcomes and paid construction in every branch', () => {
    const old = oldCampaign(), p = old.space!;
    for (const kind of kinds) {
      const s = load(kind), now = s.space!;
      expect(account(s).actions.slice(0, 36)).toEqual(account(old).actions);
      expect(now.combat!.battles.slice(0, 6)).toEqual(p.combat!.battles);
      for (const key of ['empires', 'outfit', 'wars'] as const) expect(now[key]).toEqual(p[key]);
      expect(now.expansion!.actions).toEqual(p.expansion!.actions);
      expect(now.ship!.creation).toEqual(p.ship!.creation); expect(now.ship!.purchase).toEqual(p.ship!.purchase);
      expect(s.civilization).toEqual(old.civilization); expect(s.lineageHistory).toEqual(old.lineageHistory);
      for (const c of account(old).colonies) {
        const current = account(s).colonies.find(row => row.id === c.id)!;
        for (const key of ['id', 'planetId', 'paid', 'level', 'upgraded', 'permission', 'militaryPermission'] as const) expect(current[key]).toEqual(c[key]);
      }
    }
  });

  it('keeps the real missing-role quarantine, paid repairs and seven stock items during ten ordinary local seconds', () => {
    const s = rekey(load('quarantine')), p = s.space!, before = structuredClone(colony(s)), q = structuredClone(quarantineAt(events(s).current, hotId(s)));
    expect(q).not.toBeNull(); expect(before.produced - before.loaded).toBe(7); expect(colonyCapacity(s, before)).toBe(0);
    expect(p.expedition!.cargo.map(l => l.id.split(':').at(-1))).toEqual(['born-5-2', 'born-5-6', 'born-5-9']);
    expect(account(s).actions.slice(-2).map(r => r.kind)).toEqual(['repair', 'repair']);
    expect(resumeColonyQuote(s, hotId(s), events(s).nextAction).ok).toBe(false);
    expect(resumeColony(s, hotId(s), events(s).nextAction)).toBe(false);
    expect(economyQuote(s, { kind: 'load' }, account(s).nextAction).ok).toBe(false);
    expect(applyEconomyOrder(s, { kind: 'load' }, account(s).nextAction)).toBe(false);
    for (let frame = 0; frame < 300; frame++) step(s, EMPTY_INPUT, 1 / 30);
    expect(colony(s)).toEqual(before); expect(quarantineAt(events(s).current, hotId(s))).toEqual(q);
    expect(account(s).balance).toBe(212); expect(p.ship!.health).toBe(115); expect(round(s)).toEqual(s);
  });

  it('continues the exact two-pulse automatic battle with three ordinary paid pulses and no cargo or cash reward', () => {
    const s = rekey(load('battle')), p = s.space!, incident = structuredClone(events(s).current.pirate), cargo = structuredClone(account(s).cargo);
    expect(incident).toMatchObject({ serial: 3, battleSerial: 7, candidate: { receipt: { serial: 40, amount: 3, eventAction: 3 } } });
    expect(latestBattle(p)).toMatchObject({ serial: 7, kind: 'pirate', shots: 2, enemy: { health: 36 }, end: null });
    for (let shot = 0; shot < 3; shot++) { for (let frame = 0; frame < 21; frame++) step(s, EMPTY_INPUT, 1 / 30); expect(fireSpacePulse(s)).toBe(true); }
    expect(events(s).current.pirate).toBeNull(); expect(events(s).current.totals.victories).toBe(1);
    expect(events(s).current.lastPirateResult).toMatchObject({ openingSerial: 3, battle: { battleSerial: 7, outcome: 'won', shots: 5 } });
    expect(account(s).balance).toBe(212); expect(account(s).cargo).toEqual(cargo); expect(round(s)).toEqual(s);
  });

  it('retreats from the actual encounter using the normal paid ascent and preserves the independent native retreat', () => {
    const s = rekey(load('battle')), p = s.space!, energy = p.ship!.energy, cargo = structuredClone(account(s).cargo);
    expect(changeSpaceScale(s, 'up')).toBe(true); expect(p.leg!.energyPaid).toBe(4); expect(p.ship!.energy).toBe(energy - 4);
    expect(events(s).current.lastPirateResult).toMatchObject({ openingSerial: 3, battle: { battleSerial: 7, outcome: 'retreated', shots: 2 } });
    expect(round(s)).toEqual(s);
    for (let frame = 0; frame < 91; frame++) step(s, EMPTY_INPUT, 1 / 30);
    expect(p.location!.scale).toBe('system'); expect(account(s).cargo).toEqual(cargo); expect(round(s)).toEqual(s);
    const native = load('retreat'); expect(native.space!.location!.scale).toBe('system');
    expect(events(native).current.totals).toEqual({ quarantines: 1, resumes: 1, pirates: 1, victories: 0, retreats: 1, defeats: 0 });
    expect(account(native).cargo).toEqual(cargo); expect(account(native).balance).toBe(212);
  });

  it('records the genuine300-second rest, home sale and a subsequent expedition without reusing the load', () => {
    const s = load('campaign'), e = account(s), actions = events(s).actions;
    expect(actions.map(a => a.kind)).toEqual(['quarantine', 'resume', 'pirate', 'pirate-result']);
    expect(actions[2].economyAt - actions[0].economyAt).toBeCloseTo(300, 6);
    expect(events(s).current.totals).toEqual({ quarantines: 1, resumes: 1, pirates: 1, victories: 1, retreats: 0, defeats: 0 });
    expect(events(s).candidate).toBeNull(); expect(e.cargo).toEqual([]); expect(s.space!.location).toBeNull();
    const sale = e.actions.at(-1)!; expect(sale).toMatchObject({ serial: 41, kind: 'sell', amount: 12, unitPrice: 8, earned: 96 });
    expect(e.balance).toBe(222 - 10 + 96);
    // Space time is frozen while docked: the next launch shares the sale's
    // spaceAt even though ordinary domestic time and the sale precede it.
    expect(s.space!.log.filter(r => r.at >= sale.spaceAt && r.from === 'dock' && r.to === 'surface')).toHaveLength(1);
    expect(s.space!.log.filter(r => r.at > sale.spaceAt && r.to === 'dock')).toHaveLength(1);
  });

  it.each(['load', 'arrival', 'result', 'summary', 'resume'] as const)('rejects a forged %s in a unit copy without changing played fixture bytes', fault => {
    const kind = fault === 'load' || fault === 'arrival' ? 'battle' : 'campaign', s = load(kind);
    if (fault === 'load') events(s).current.pirate!.candidate.receipt.amount++;
    if (fault === 'arrival') events(s).current.pirate!.arrival.planetId = hotId(s);
    if (fault === 'result') events(s).current.lastPirateResult!.battle.battleSerial--;
    if (fault === 'summary') events(s).current.totals.pirates++;
    if (fault === 'resume') events(s).current.colonies[0].lastResume!.quarantineSerial++;
    reject(s); expect(createHash('sha256').update(bytes(kind)).digest('hex')).toBe(fixtures[kind].sha);
  });
});
