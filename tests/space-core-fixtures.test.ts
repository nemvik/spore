import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGame, serializeGame } from '../src/game/persistence';
import { enableSpaceCore } from '../src/game/space-core';
import { coreProgress, coreRoot } from '../src/game/space-core-content';
import { recoverGeneration } from '../src/game/simulation';
import type { GameState } from '../src/game/types';

// Exact public native exports. No prepared positions, grants or payload edits.
const fixtures = {
  campaign: '6aca3612fa272f0f6357beb1d058f912614f6bdea277f2862baa408d2330ca16',
  force: 'ab8d8b19206396d6e9d611a38e3d1858e920daf9145a59a1f630c2e6915f2dcc',
  flight: '63a3b2e752a06f6a2758b62a237c3d9701abd409ee05a3d47515ce7d4e24c05b',
  root: 'b8d0ea5a5340f1a9eaae8cccaee0f572bfeb6489072c311e9d91b730667f6b7f',
  warden: '0f90651bddaa345f8b4562c17bd8452f60ecd3043cd38caebdd804e9f34f279d',
  wreck: '802f2403332b4060b7f327e7e08cbf16801c3e4dbc07861f41a03fdb0f985503',
};
const load = (name: keyof typeof fixtures) => parseGame(readFileSync(`tests/fixtures/space/native-d5-${name}.save.json`, 'utf8'));
const round = (s: GameState) => parseGame(serializeGame(s));
describe('D5 byte-identical played core, reward, battle and actual loss', () => {
  it.each(Object.entries(fixtures))('preserves %s bytes, history, explicit enable, rekey and actual old checkpoint', (name, digest) => {
    const bytes = readFileSync(`tests/fixtures/space/native-d5-${name}.save.json`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest);
    const s = parseGame(bytes.toString()), before = structuredClone(s); expect(round(s)).toEqual(before);
    enableSpaceCore(s); expect(s).toEqual(before);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.space!.core!.actions).toEqual([]); expect(cp.space!.ship).toBeNull(); expect(cp.space!.combat!.battles).toEqual([]);
    const imported = round(s), importedCp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-public-rekey'; importedCp.id = imported.id; imported.checkpoint = JSON.stringify(importedCp);
    expect(round(imported).space).toEqual(s.space);
    const recovered = recoverGeneration(round(imported)); expect(recovered.space!.core).toEqual(cp.space!.core); expect(recovered.space!.ship).toBeNull();
  });
  it.each(['campaign', 'force'] as const)('keeps the actual %s return and permanently rooted world without gifted life or colony', name => {
    const s = load(name), p = s.space!, progress = coreProgress(p.core), root = p.core!.actions.find(a => a.kind === 'root')!;
    expect(p.location).toBeNull(); expect(p.core!.actions).toHaveLength(4); expect(progress.encounter).not.toBeNull();
    expect(progress.access?.strategy).toBe(name === 'force' ? 'force' : 'diplomacy'); expect(root.planetId).toMatch(/star-24:planet$/);
    const world = p.expedition!.worlds.find(w => w.id === root.planetId)!;
    expect(world.temperature).toBe(0); expect(world.atmosphere).toBe(0); expect(world.life).toEqual([]);
    expect(p.economy!.colonies.some(c => c.planetId === world.id)).toBe(false); expect(coreRoot(p.core, world.id)!.energyPaid).toBe(30);
    expect(p.economy!.balance).toBe(name === 'force' ? 298 : 263); expect(p.ship!.health).toBe(name === 'force' ? 33 : 115);
    expect(p.log.filter(r => r.passage).length).toBeGreaterThan(0);
  });
  it('retains the real loss, twelve-second rescue, two paid repairs and subsequent nine-shot victory', () => {
    const p = load('force').space!, wardens = p.combat!.battles.filter(b => b.kind === 'warden'); expect(wardens).toHaveLength(2);
    const [loss, win] = wardens; expect(loss).toMatchObject({ serial: 8, shots: 2, damage: 99, end: { outcome: 'lost', health: 0 } });
    expect(loss.rescue!.completedAt! - loss.rescue!.startedAt).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(win).toMatchObject({ serial: 9, shots: 9, startingHealth: 105, damage: 72, end: { outcome: 'won', health: 33 } });
    expect(p.economy!.actions.filter(a => a.serial >= 42)).toMatchObject([
      { kind: 'repair', paid: 5, before: 25, after: 65 }, { kind: 'repair', paid: 5, before: 65, after: 105 },
    ]);
    expect(p.discoveries!.actions.some(a => a.kind === 'support')).toBe(false);
    const forged = load('force'); forged.space!.core!.actions.find(a => a.kind === 'access')!.cut.at--;
    expect(() => serializeGame(forged)).toThrow();
  });
  it('keeps the already-paid pending core flight and refuses retroactively removing its earned permission', () => {
    const s = load('flight'), p = s.space!; expect(p.leg!.to.systemId).toMatch(/star-31$/);
    expect(p.leg!.duration).toBe(6); expect(p.leg!.elapsed).toBeLessThan(6); expect(coreProgress(p.core).encounter).toBeNull();
    p.core!.actions.pop(); p.core!.nextAction--; expect(() => serializeGame(s)).toThrow();
  });
  it('keeps the active second warden and preceding recovered loss without duplicating either', () => {
    const p = load('warden').space!, b = p.combat!.battles.at(-1)!;
    expect(b).toMatchObject({ serial: 9, kind: 'warden', shots: 2, enemy: { health: 84 }, end: null });
    expect(coreProgress(p.core).access).toBeNull(); expect(p.combat!.battles.find(r => r.serial === 8)!.rescue!.completedAt).not.toBeNull();
    expect(p.economy!.balance).toBe(298);
  });
  it('preserves the actual unhealed wreck and rejects inventing its recovery', () => {
    const s = load('wreck'), p = s.space!; expect(p.ship!.health).toBe(0); expect(p.combat!.battles.at(-1)!.rescue).toBeNull();
    expect(coreProgress(p.core).access).toBeNull(); p.ship!.health = 25; expect(() => serializeGame(s)).toThrow();
  });
  it('retains the precise thirty-energy climate proof and rejects a free saved reward', () => {
    const s = load('root'), p = s.space!, root = coreRoot(p.core, p.location!.planetId)!;
    expect(root.energyPaid).toBe(30); expect(root.before).toEqual({ temperature: -.75, atmosphere: .8 });
    root.energyPaid = 0 as 30; expect(() => serializeGame(s)).toThrow();
  });
});
