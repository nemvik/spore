import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { currentShipRescue, fireSpacePulse, investigatePirates, rescueShip } from '../src/game/space-combat';
import { combatEnergySpent, combatTotals, latestBattle } from '../src/game/space-combat-content';
import { applyEconomyOrder, spaceEconomy } from '../src/game/space-economy';
import { useSpecimenTool } from '../src/game/space-expedition';
import { changeSpaceScale } from '../src/game/space';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

const fixtures = {
  active: { name: 'native-d3a-campaign.save.json', sha: '608b238c20d8e7c50fa51069b9b0b84cffae4ea6be8954b9e937ca767c4e3500' },
  battle: { name: 'native-d3a-battle.save.json', sha: 'd572fc686757b57f9886940e19e80d7a8c117c79be5c39c2da55f44a55041c37' },
  wreck: { name: 'native-d3a-wreck.save.json', sha: '837191196062db5987a62410734dbc7e5f31bfd385dfdcfe637d1921cd9e8da2' },
  rescue: { name: 'native-d3a-rescue.save.json', sha: '2f5a5f780a5a03d4f3cc324527ea909938ea6d2940e28632cb7c67bd78a159b4' },
} as const;
type Kind = keyof typeof fixtures;
const kinds = ['active', 'battle', 'wreck', 'rescue'] as const;
const bytes = (kind: Kind) => readFileSync(`tests/fixtures/space/${fixtures[kind].name}`);
const load = (kind: Kind) => parseGame(bytes(kind).toString());
const round = (s: GameState) => parseGame(serializeGame(s));
const account = (s: GameState) => spaceEconomy(s)!;
const combat = (s: GameState) => s.space!.combat!;
const last = (s: GameState) => latestBattle(s.space!)!;
const oldCampaign = () => parseGame(readFileSync('tests/fixtures/space/native-d2b-campaign.save.json', 'utf8'));
const domestic = (s: GameState) => { const { space: _space, checkpoint: _cp, ...home } = s; return structuredClone(home); };
function nativeHome(s: GameState) {
  // The exact native domestic projection excludes only imported campaign IDs.
  const home = structuredClone(s) as unknown as Record<string, unknown>; delete home.id; delete home.space;
  if (typeof home.checkpoint === 'string') { const cp = JSON.parse(home.checkpoint); delete cp.id; home.checkpoint = cp; }
  return home;
}
function reject(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}
function rekey(s: GameState) {
  const imported = structuredClone(s), cp = JSON.parse(imported.checkpoint!) as GameState;
  imported.id += '-fixture-import'; cp.id = imported.id; imported.checkpoint = JSON.stringify(cp); return round(imported);
}
afterEach(() => vi.unstubAllGlobals());

describe('D3a byte-identical actual combat, wreck, rescue and return exports', () => {
  it.each(kinds)('preserves exact %s bytes and all historical v4 branches through deserialize/export', kind => {
    const raw = bytes(kind), s = parseGame(raw.toString());
    expect(createHash('sha256').update(raw).digest('hex')).toBe(fixtures[kind].sha);
    expect(s).toEqual(JSON.parse(raw.toString()).state); expect(round(s)).toEqual(s);
    expect(account(s).version).toBe(4); expect(combat(s).version).toBe(1);
    expect(s.checkpoint).toBe(JSON.parse(raw.toString()).state.checkpoint); expect(bytes(kind)).toEqual(raw);
  });

  it.each(kinds)('loads and rekeys %s without healing, granting energy, repeating payments or resetting combat', kind => {
    const s = load(kind), local = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => local.set(k, v), getItem: (k: string) => local.get(k) ?? null });
    expect(saveGame(s)).toEqual({ ok: true }); expect(loadGame(s.id)).toEqual(s);
    const imported = rekey(s); expect(imported.space).toEqual(s.space); expect(imported.space!.homePlanetId).toBe(s.space!.homePlanetId);
    expect(imported.player).toEqual(s.player); expect(imported.id).not.toBe(s.id);
    expect(account(imported).balance).toBe(kind === 'active' ? 102 : 117);
  });

  it.each(kinds)('recovers the actual historical %s checkpoint without inventing its later ship, repair or battle', kind => {
    const s = load(kind), cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.tick).toBe(66066); expect(cp.space!.ship).toBeNull(); expect(cp.machines!.resource).toBe(155.76499999940776);
    expect(combat(cp)).toMatchObject({ version: 1, activated: { cut: { at: 0, tick: 66066, travelAction: 1, lifeAction: 1, economyAction: 1 }, economyAt: 0, health: null, repaired: 0 }, battles: [], legacyRescue: null });
    expect(Object.values(combat(cp).archive).every(value => value === 0)).toBe(true);
    expect(account(cp)).toMatchObject({ balance: 0, colonies: [], cargo: [], actions: [], nextAction: 1 });
    const restored = recoverGeneration(round(s)); expect(restored.space).toEqual(cp.space); expect(restored.machines).toEqual(cp.machines);
    expect(restored.civilization).toEqual(cp.civilization); expect(restored.lineageHistory).toEqual(cp.lineageHistory); expect(round(restored).space).toEqual(cp.space);
  });

  it('keeps the original twenty-eight receipts, paid model, inheritance, title and all inactive biospheres across every export', () => {
    const old = oldCampaign(), p = old.space!, capital = `${p.homePlanetId}:star-1:planet`;
    for (const kind of kinds) {
      const s = load(kind), current = s.space!;
      expect(account(s).actions.slice(0, 28)).toEqual(account(old).actions);
      expect(current.ship!.creation).toEqual(p.ship!.creation); expect(current.ship!.purchase).toEqual(p.ship!.purchase);
      expect(current.outfit).toEqual(p.outfit); expect(current.empires).toEqual(p.empires); expect(current.expansion!.actions).toEqual(p.expansion!.actions);
      expect(s.civilization).toEqual(old.civilization); expect(s.lineageHistory).toEqual(old.lineageHistory); expect(s.player.health).toBe(old.player.health);
      expect(current.expedition!.worlds.filter(w => w.id !== capital)).toEqual(p.expedition!.worlds.filter(w => w.id !== capital));
      expect(current.expedition!.actions).toEqual(p.expedition!.actions); expect(current.expedition!.nextAction).toBe(294);
      expect(current.expedition!.cargo).toEqual([]); expect(account(s).cargo).toEqual([]);
      expect(account(s).colonies.find(c => c.planetId === capital)!.permission).toEqual({ titleSerial: 25, foundingSerial: 26 });
      expect(combat(s).activated).toEqual({ cut: { at: p.elapsed, tick: old.tick, travelAction: 331, lifeAction: 294, economyAction: 29 }, economyAt: account(old).elapsed, health: 115, repaired: 0 });
    }
  });

  it.each(['battle', 'wreck', 'rescue'] as const)('preserves the exact whole native domestic snapshot in the %s export', kind => {
    const s = load(kind);
    expect(createHash('sha256').update(JSON.stringify(nativeHome(s))).digest('hex')).toBe('8fa61868706e8fd1d6ca102a5be7060f520c9326721cb1b4c04aee1cdba59eff');
    expect(s.tick).toBe(67562); expect(s.machines!.resource).toBe(24.834999999409824); expect(s.deathReason).toBeNull();
  });

  it('retains the genuine two-pulse enemy and its received hits without replacing them with a prepared encounter', () => {
    const s = load('battle'), p = s.space!;
    expect(combat(s).battles).toHaveLength(1); expect(last(s)).toMatchObject({ serial: 1, startingHealth: 115, shots: 2, received: 3, damage: 24, enemy: { health: 36 }, end: null, rescue: null });
    expect(p.ship).toMatchObject({ health: 91, energy: 103.59133333333324 }); expect(p.location!.pos.x).toBe(74.6190499073611);
    expect(last(s).lastShot!.at).toBe(2787.533333341216); expect(last(s).lastHit!.at).toBe(2787.4666666745484); expect(combatEnergySpent(p)).toBe(6);
    expect(account(s).balance).toBe(117); expect(account(s).ledger.repairs).toBe(0);
  });

  it('preserves won/retreated/lost outcomes, twelve-second rescue, real paid repairs and physical final docking', () => {
    const s = load('active'), p = s.space!, e = account(s);
    expect(combat(s).battles.map(b => [b.serial, b.shots, b.received, b.damage, b.end!.outcome, b.end!.health]))
      .toEqual([[1, 5, 4, 32, 'won', 83], [2, 0, 0, 0, 'retreated', 83], [3, 0, 11, 83, 'lost', 0]]);
    expect(combatTotals(p)).toMatchObject({ battles: 3, victories: 1, retreats: 1, defeats: 1, shots: 5, received: 15, damage: 115, restored: 25 });
    expect(combatEnergySpent(p)).toBe(15); expect(currentShipRescue(s)!.completedAt! - currentShipRescue(s)!.startedAt).toBeCloseTo(12, 7);
    expect(e.actions.slice(28).map(r => { if (r.kind !== 'repair') throw new Error('native repair'); return [r.serial, r.paid, r.before, r.after, r.balanceBefore, r.balanceAfter]; }))
      .toEqual([[29, 5, 25, 65, 117, 112], [30, 5, 65, 105, 112, 107], [31, 5, 105, 115, 107, 102]]);
    expect(e.ledger).toMatchObject({ repairs: 15, healthRestored: 90, equipment: 260, alliance: 40, territory: 120, revenue: 640 });
    expect(e.balance).toBe(102); expect(p.ship!.health).toBe(115); expect(p.location).toBeNull(); expect(p.leg).toBeNull();
    expect(p.log.at(-1)).toMatchObject({ serial: 352, from: 'surface', to: 'dock', planetId: p.homePlanetId });
    expect(p.expansion!.allies[0].location).toBeNull(); expect(s.tick).toBe(67583);
  });

  it('keeps the actual unrepaired wreck immobile and unable to attack, scan, trade or change scale', () => {
    const s = rekey(load('wreck')), p = s.space!, before = structuredClone(s), home = domestic(s);
    expect(last(s)).toMatchObject({ startingHealth: 83, received: 11, damage: 83, end: { outcome: 'lost', health: 0 }, rescue: null });
    expect(p.ship).toMatchObject({ health: 0, energy: 105 }); expect(currentShipRescue(s)).toBeNull();
    expect(fireSpacePulse(s)).toBe(false); expect(investigatePirates(s, 4)).toBe(false); expect(changeSpaceScale(s, 'up')).toBe(false); expect(changeSpaceScale(s, 'down')).toBe(false);
    expect(useSpecimenTool(s, 'scan', 'missing')).toBe(false); expect(applyEconomyOrder(s, { kind: 'load' }, account(s).nextAction)).toBe(false);
    for (let i = 0; i < 60; i++) step(s, { ...EMPTY_INPUT, x: 1, vertical: 1, sprint: true }, 1 / 30);
    expect(p.ship).toEqual(before.space!.ship); expect(p.location).toEqual(before.space!.location); expect(p.expansion).toEqual(before.space!.expansion);
    expect(p.expedition).toEqual(before.space!.expedition); expect(p.combat).toEqual(before.space!.combat); expect(domestic(s)).toEqual(home);
    expect(account(s).balance).toBe(117); expect(account(s).actions).toEqual(account(before).actions); expect(round(s)).toEqual(s);
  });

  it.each([false, true])('continues the actual pending rescue with prepared full checkpoint=%s and no money, cargo, movement or energy grant', prepared => {
    // Only this explicitly selected variant creates a new UNIT checkpoint.
    // The other continuation retains the real native pre-purchase checkpoint.
    const s = rekey(load('rescue')); if (prepared) makeCheckpoint(s);
    const before = structuredClone(s), home = domestic(s), cp = JSON.parse(s.checkpoint!) as GameState, rescue = currentShipRescue(s)!;
    expect(account(s).elapsed - rescue.startedAt).toBeCloseTo(.25, 7); expect(rescue.completedAt).toBeNull(); expect(rescueShip(s)).toBe(false);
    for (let i = 0; i < 352; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(s.space!.ship!.health).toBe(0); expect(rescue.completedAt).toBeNull(); expect(round(s)).toEqual(s);
    for (let i = 0; i < 3 && rescue.completedAt === null; i++) step(s, EMPTY_INPUT, 1 / 30);
    expect(rescue.completedAt).not.toBeNull(); expect(rescue.completedAt! - rescue.startedAt).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(rescue.completedAt! - rescue.startedAt).toBeLessThanOrEqual(12 + 1 / 30 + 1e-6);
    expect(s.space!.ship).toEqual({ ...before.space!.ship, health: 25 }); expect(s.space!.location).toEqual(before.space!.location);
    expect(s.space!.expansion).toEqual(before.space!.expansion); expect(s.space!.expedition).toEqual(before.space!.expedition); expect(domestic(s)).toEqual(home);
    expect(account(s).balance).toBe(117); expect(account(s).actions).toEqual(account(before).actions); expect(account(s).ledger).toEqual(account(before).ledger);
    expect(account(s).cargo).toEqual(account(before).cargo); expect(s.checkpoint).toBe(before.checkpoint); expect(round(s)).toEqual(s);
    if (prepared) {
      const restored = recoverGeneration(round(s)); expect(restored.space!.combat).toEqual(cp.space!.combat); expect(restored.space!.ship).toEqual(cp.space!.ship);
      expect(currentShipRescue(restored)!.completedAt).toBeNull(); expect(round(restored)).toEqual(restored);
    }
  });

  it('separately prepares a full midbattle checkpoint and wins its remaining fight through paid public pulses and ordinary time', () => {
    const s = load('battle'); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState, home = domestic(s);
    for (let shot = 0; shot < 3; shot++) { for (let i = 0; i < 20; i++) step(s, EMPTY_INPUT, 1 / 30); expect(fireSpacePulse(s)).toBe(true); }
    expect(last(s).end?.outcome).toBe('won'); expect(last(s).shots).toBe(5); expect(combatEnergySpent(s.space!)).toBe(15);
    expect(account(s).actions).toEqual(account(cp).actions); expect(account(s).balance).toBe(117); expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(restored.space!.combat).toEqual(cp.space!.combat); expect(restored.space!.ship).toEqual(cp.space!.ship);
    expect(restored.space!.location).toEqual(cp.space!.location); expect(round(restored)).toEqual(restored);
  });

  it.each(['repair-payment', 'early-rescue', 'battle-damage'] as const)('rejects a prepared forged %s copy while original native bytes remain exact', kind => {
    const key = kind === 'early-rescue' ? 'rescue' : 'active', s = load(key);
    if (kind === 'repair-payment') { const row = account(s).actions[28]; if (row.kind !== 'repair') throw new Error('native repair'); row.paid = 0; }
    if (kind === 'early-rescue') { currentShipRescue(s)!.completedAt = account(s).elapsed; s.space!.ship!.health = 25; }
    if (kind === 'battle-damage') last(s).damage++;
    reject(s); expect(createHash('sha256').update(bytes(key)).digest('hex')).toBe(fixtures[key].sha);
  });

  it('rejects rewriting a known closed native battle after a separately prepared full docked checkpoint', () => {
    const s = load('active'); makeCheckpoint(s); combat(s).battles[0].origin.x += .1;
    const standalone = structuredClone(s); standalone.checkpoint = null; expect(round(standalone)).toEqual(standalone);
    reject(s);
  });
});
