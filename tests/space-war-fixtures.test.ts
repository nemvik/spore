import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { fireSpacePulse } from '../src/game/space-combat';
import { latestBattle } from '../src/game/space-combat-content';
import { applyEconomyOrder, economyQuote } from '../src/game/space-economy';
import { enableSpaceEvents } from '../src/game/space-events';
import { ownerAt } from '../src/game/space-expansion-content';
import { recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  campaign: { name: 'native-d3b-campaign.save.json', sha: 'e66caf26dd3184661b97688b51eace5bc27bb9c69580d5a434d0ea2b01685f24' },
  battle: { name: 'native-d3b-battle.save.json', sha: '8cb3322ec4da9b069ef7c4623f0f7589ba77c2ccc98f97f7241c798df6363329' },
  occupied: { name: 'native-d3b-occupied.save.json', sha: 'd4ced1372de54cef0a231453fc717b87d2e85522e137df95ae744cc05fedefe6' },
  ally: { name: 'native-d3b-ally-suspended.save.json', sha: '43c49fc7e43afdf3ff17f6691a01ca6ea3256d529655a75fa866893bfecbb9e0' },
} as const;
type Kind = keyof typeof fixtures;
const kinds = ['campaign', 'battle', 'occupied', 'ally'] as const;
const bytes = (kind: Kind) => readFileSync(`tests/fixtures/space/${fixtures[kind].name}`);
const load = (kind: Kind) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const account = (s: GameState) => s.space!.economy!;
const wars = (s: GameState) => s.space!.wars!;
const militaryColony = (s: GameState) => account(s).colonies.find(c => c.militaryPermission)!;
const oldCampaign = () => parseGame(readFileSync('tests/fixtures/space/native-d3a-campaign.save.json', 'utf8'));
const domestic = (s: GameState) => { const { space: _space, checkpoint: _checkpoint, ...home } = s; return structuredClone(home); };
function nativeHome(s: GameState) {
  const home = structuredClone(s) as unknown as Record<string, unknown>; delete home.id; delete home.space;
  const cp = JSON.parse(home.checkpoint as string); delete cp.id; home.checkpoint = cp; return home;
}
function rekey(s: GameState) {
  const copy = structuredClone(s), cp = JSON.parse(copy.checkpoint!) as GameState;
  copy.id += '-fixture-import'; cp.id = copy.id; copy.checkpoint = JSON.stringify(cp); return round(copy);
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
function beforeEvents(s: GameState) {
  const copy = structuredClone(s);
  const strip = (state: GameState) => { delete state.space!.events; state.space!.economy!.version = 5; };
  strip(copy); const cp = JSON.parse(copy.checkpoint!) as GameState; strip(cp); copy.checkpoint = JSON.stringify(cp); return copy;
}
afterEach(() => vi.unstubAllGlobals());

describe('D3b byte-identical actual war, occupied colony and suspended ally exports', () => {
  it.each(kinds)('roundtrips exact historical %s bytes without implicitly enabling D3c incidents', kind => {
    const raw = bytes(kind), s = parseGame(raw.toString());
    expect(createHash('sha256').update(raw).digest('hex')).toBe(fixtures[kind].sha);
    expect(s).toEqual(JSON.parse(raw.toString()).state); expect(round(s)).toEqual(s);
    expect(account(s).version).toBe(5); expect(s.space!.combat!.version).toBe(2); expect(wars(s).version).toBe(1);
    expect(s.space!.events).toBeUndefined(); expect(JSON.parse(s.checkpoint!).space.events).toBeUndefined(); expect(bytes(kind)).toEqual(raw);
  });

  it.each(kinds)('saves, loads and rekeys %s without healing, energy gifts, new claims or repeated receipts', kind => {
    const s = load(kind), local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = rekey(s); expect(imported.id).not.toBe(s.id); expect(imported.space).toEqual(s.space); expect(imported.player).toEqual(s.player);
    expect(JSON.parse(imported.checkpoint!).id).toBe(imported.id);
    expect(imported.space!.ship!.health).toBe({ campaign: 67, battle: 107, occupied: 83, ally: 115 }[kind]);
    expect(account(imported).balance).toBe({ campaign: 222, battle: 102, occupied: 158, ally: 102 }[kind]);
  });

  it.each(kinds)('recovers the genuinely older %s checkpoint with no later ship, colony or military claim', kind => {
    const s = load(kind), cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.tick).toBe(66066); expect(cp.space!.ship).toBeNull(); expect(cp.machines!.resource).toBe(155.76499999940776);
    expect(account(cp)).toMatchObject({ version: 5, balance: 0, colonies: [], cargo: [], actions: [], nextAction: 1 });
    expect(wars(cp)).toMatchObject({ version: 1, actions: [], nextAction: 1, activated: { economyAt: 0, nextCombatSerial: 1 } });
    expect(wars(cp).current.territories).toEqual([]); expect(Object.values(wars(cp).current.totals).every(n => n === 0)).toBe(true);
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines);
    expect(restored.civilization).toEqual(cp.civilization); expect(restored.lineageHistory).toEqual(cp.lineageHistory); expect(round(restored).space).toEqual(cp.space);
  });

  it('preserves all31 D3a receipts, pirate histories, paid ship/outfit and original peaceful title in every branch', () => {
    const old = oldCampaign(), p = old.space!, capital = `${p.homePlanetId}:star-1:planet`;
    for (const kind of kinds) {
      const s = load(kind), current = s.space!;
      expect(account(s).actions.slice(0, 31)).toEqual(account(old).actions); expect(current.combat!.battles.slice(0, 3)).toEqual(p.combat!.battles);
      expect(current.ship!.creation).toEqual(p.ship!.creation); expect(current.ship!.purchase).toEqual(p.ship!.purchase);
      expect(current.outfit).toEqual(p.outfit); expect(current.empires).toEqual(p.empires); expect(current.expansion!.actions).toEqual(p.expansion!.actions);
      expect(account(s).ledger).toMatchObject({ repairs: 15, healthRestored: 90, equipment: 260, alliance: 40, territory: 120 });
      expect(account(s).colonies.find(c => c.planetId === capital)!.permission).toEqual({ titleSerial: 25, foundingSerial: 26 });
      expect(s.civilization).toEqual(old.civilization); expect(s.lineageHistory).toEqual(old.lineageHistory);
      const inactive = (state: GameState) => state.space!.expedition!.worlds.filter(w => w.id !== capital && w.id !== `${p.homePlanetId}:star-4:planet`);
      expect(inactive(s)).toEqual(inactive(old));
    }
  });

  it.each(['battle', 'occupied'] as const)('retains the exact complete domestic snapshot during actual %s flight', kind => {
    expect(createHash('sha256').update(JSON.stringify(nativeHome(load(kind)))).digest('hex'))
      .toBe('d98bf6179a237d7892f648e1a0b9df2c7336a516363f002f772e2cbf8811e028');
  });

  it('continues the real two-pulse invasion from its exact paid military order without creating a prepared replacement enemy', () => {
    const s = rekey(load('battle')), p = s.space!, before = structuredClone(s), home = domestic(s);
    expect(latestBattle(p)).toMatchObject({ serial: 4, kind: 'invasion', war: { empireId: 'roots', declarationSerial: 1, orderSerial: 2, raidSerial: null }, shots: 2, received: 1, damage: 8, enemy: { health: 36 }, end: null });
    for (let shot = 0; shot < 3; shot++) { for (let frame = 0; frame < 21; frame++) step(s, EMPTY_INPUT, 1 / 30); expect(fireSpacePulse(s)).toBe(true); }
    expect(latestBattle(p)).toMatchObject({ serial: 4, shots: 5, end: { outcome: 'won' } });
    expect(ownerAt(p, p.location!.planetId)).toBe('player'); expect(account(s).actions).toEqual(account(before).actions);
    expect(account(s).balance).toBe(102); expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
  });

  it('keeps the paid military permission and stock while actual occupied production and services remain stopped', () => {
    const s = rekey(load('occupied')), p = s.space!, before = structuredClone(militaryColony(s)), home = domestic(s);
    expect(ownerAt(p, before.planetId)).toBe('roots'); expect(before).toMatchObject({ paid: 40, produced: 17, loaded: 16, militaryPermission: { foundingSerial: 32, claim: { serial: 3, kind: 'result', battle: { battleSerial: 4, outcome: 'won' } } } });
    expect(account(s).cargo).toEqual([{ planetId: before.planetId, product: 'moon-salt', amount: 8 }]);
    for (const kind of ['load', 'upgrade', 'repair', 'charge'] as const) {
      expect(economyQuote(s, { kind }, account(s).nextAction).ok).toBe(false);
      expect(applyEconomyOrder(s, { kind }, account(s).nextAction)).toBe(false);
    }
    for (let frame = 0; frame < 300; frame++) step(s, EMPTY_INPUT, 1 / 30);
    expect(militaryColony(s)).toEqual(before); expect(account(s).balance).toBe(158); expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
  });

  it('retains the same paid colony after native recapture, resumes production and records only genuine neutral/home sales', () => {
    const occupied = load('occupied'), final = load('campaign'), c = militaryColony(final), e = account(final);
    expect(c.id).toBe(militaryColony(occupied).id); expect(c.militaryPermission).toEqual(militaryColony(occupied).militaryPermission);
    expect(c.loaded).toBe(16); expect(c.produced).toBeGreaterThan(militaryColony(occupied).produced); expect(ownerAt(final.space!, c.planetId)).toBe('player');
    expect(wars(final).current.totals).toMatchObject({ declarations: 1, peaces: 1, invasions: 2, defenses: 1, invasionVictories: 2, defenseVictories: 1, raids: 2, expired: 1 });
    expect(wars(final).current.relations.every(r => !r.active)).toBe(true); expect(wars(final).current.raid).toBeNull();
    expect(e.actions.slice(31).map(r => [r.serial, r.kind, r.warAction])).toEqual([[32, 'found', 4], [33, 'load', 5], [34, 'sell', 5], [35, 'load', 8], [36, 'sell', 12]]);
    expect(e.actions.flatMap(r => r.serial >= 32 && r.kind === 'sell' ? [[r.amount, r.unitPrice, r.earned]] : [])).toEqual([[8, 12, 96], [8, 8, 64]]);
    expect(e.balance).toBe(102 - 40 + 96 + 64); expect(e.cargo).toEqual([]); expect(final.space!.location).toBeNull();
    expect(final.space!.ship!.health).toBe(115 - 3 * 16);
  });

  it('holds the exact targeted ally battery and ID through separately simulated ordinary movement while war suspends it', () => {
    const s = rekey(load('ally')), p = s.space!, before = structuredClone(p.expansion!.allies[0]), home = domestic(s);
    expect(before).toMatchObject({ paidSerial: 24, location: null, energy: 5.9666666666668, generated: 55.80733333333501, delivered: 61.84066666666639 });
    const declaration = wars(s).current.relations.find(r => r.empireId === 'resin')!.declaration!;
    expect(declaration.escort).toEqual({ energy: before.energy, generated: before.generated, delivered: before.delivered });
    for (let frame = 0; frame < 60; frame++) step(s, { ...EMPTY_INPUT, x: 1 }, 1 / 30);
    expect(p.expansion!.allies[0]).toEqual(before); expect(account(s).balance).toBe(102); expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
  });

  it.each(kinds)('explicitly activates only empty D3c events and economy6 in exact %s live/older-checkpoint history', kind => {
    const s = load(kind), before = structuredClone(s); enableSpaceEvents(s);
    expect(beforeEvents(s)).toEqual(before);
    const events = s.space!.events!;
    expect(events).toMatchObject({ version: 1, actions: [], nextAction: 1, watches: [], candidate: null, archive: { through: 0 },
      activated: { cut: { at: before.space!.elapsed, tick: before.tick, travelAction: before.space!.nextSerial, lifeAction: before.space!.expedition!.nextAction, economyAction: account(before).nextAction }, economyAt: account(before).elapsed, warAction: wars(before).nextAction, nextCombatSerial: before.space!.combat!.archive.battles + before.space!.combat!.battles.length + 1, loadCount: account(before).counts.load } });
    expect(events.current).toMatchObject({ colonies: [], pirate: null, lastPirateResult: null, lastAutomatic: null, usedLoadSerial: 0 });
    expect(Object.values(events.current.totals).every(n => n === 0)).toBe(true); expect(events.archive.state).toEqual(events.current);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.space!.events).toMatchObject({ actions: [], watches: [], candidate: null, activated: { cut: { at: 0, tick: 66066, economyAction: 1 }, economyAt: 0, warAction: 1, nextCombatSerial: 1, loadCount: 0 } });
    expect(account(cp).version).toBe(6); expect(cp.space!.ship).toBeNull(); expect(account(cp).balance).toBe(0);
    const once = structuredClone(s); enableSpaceEvents(s); expect(s).toEqual(once); expect(round(s)).toEqual(s); expect(rekey(s).space).toEqual(s.space);
    expect(recoverGeneration(round(s)).space).toEqual(cp.space); expect(createHash('sha256').update(bytes(kind)).digest('hex')).toBe(fixtures[kind].sha);
  });

  it.each(['permission', 'ownership', 'ally-energy'] as const)('rejects a forged unit copy of native %s while preserving source bytes', fault => {
    const kind = fault === 'ally-energy' ? 'ally' : 'occupied', s = load(kind);
    if (fault === 'permission') militaryColony(s).militaryPermission!.foundingSerial++;
    if (fault === 'ownership') wars(s).current.territories[0].owner = 'player';
    if (fault === 'ally-energy') s.space!.expansion!.allies[0].energy++;
    reject(s); expect(createHash('sha256').update(bytes(kind)).digest('hex')).toBe(fixtures[kind].sha);
  });
});
