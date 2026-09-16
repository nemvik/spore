import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteGame, loadGame, loadGames, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint, step } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';
import { createWorld } from '../src/game/world';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.values.set(key, String(value));
  }
}

let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function envelope() { return JSON.parse(serializeGame(createGame(481516))); }
function corrupt(change: (file: ReturnType<typeof envelope>) => void) {
  const file = envelope(); change(file); return JSON.stringify(file);
}

describe('versioned persistence', () => {
  it('round trips complete state and restores the active world alias', () => {
    const state = createGame(481516);
    for (let i = 0; i < 60; i++) step(state, { ...EMPTY_INPUT, x: 1 });
    const loaded = parseGame(serializeGame(state));
    expect(loaded).toEqual(state);
    expect(loaded.world).toBe(loaded.worlds[loaded.world.stage]);
    expect(loaded.world).not.toBe(state.world);
    expect(JSON.parse(loaded.checkpoint!).checkpoint).toBeNull();
  });
  it('preserves causal ecology changes and seeded simulation continuation', () => {
    const state = createGame(20260913);
    const resource = state.world.resources.at(-1)!;
    state.player.pos = { ...resource.pos };
    const oldAmount = resource.amount;
    step(state, { ...EMPTY_INPUT, feed: true });
    const changed = state.world.patches[resource.patch];
    expect(resource.amount).toBeLessThan(oldAmount);
    expect(changed.harvested).toBeGreaterThan(0);
    const loaded = parseGame(serializeGame(state));
    expect(loaded.world.patches).toEqual(state.world.patches);
    expect(loaded.world.resources).toEqual(state.world.resources);
    for (let i = 0; i < 180; i++) {
      const input = { ...EMPTY_INPUT, x: i % 60 < 30 ? 1 : -1, z: 0.25 };
      step(state, input); step(loaded, input);
    }
    expect(loaded).toEqual(state);
  });
  it('retains previous habitats, terrestrial construction, bonds and a completed finale', () => {
    // Explicit targeted fixture; this is serialization coverage, not campaign completion evidence.
    const state = createGame(8675309);
    state.worlds[0]!.patches[1].harvested = 12;
    state.worlds[1] = createWorld(state.seed, 1);
    state.worlds[1].patches[2].hunted = 3;
    state.stage = 2; state.world = createWorld(state.seed, 2); state.worlds[2] = state.world;
    state.player.genome.parts.push(
      { id: 'legs', kind: 'legs', scale: 1, axial: 0, angle: 1, mirrored: true },
      { id: 'lungs', kind: 'lungs', scale: 1, axial: 0, angle: 0, mirrored: false },
      { id: 'symbiote', kind: 'symbiote', scale: 1, axial: 0.5, angle: 0, mirrored: false },
    );
    state.player.bonds.push({ species: 'mender', benefit: 'shield', hunger: 22, loyalty: 74, age: 130 });
    state.world.landmarks.filter((landmark) => landmark.kind === 'spring').forEach((spring) => { spring.charge = 10; });
    state.campaign.won = true; state.campaign.finale = 'restoration'; state.campaign.sandbox = true;
    makeCheckpoint(state);
    const loaded = parseGame(serializeGame(state));
    expect(loaded).toEqual(state);
    expect(loaded.world).toBe(loaded.worlds[2]);
    expect(loaded.worlds[0]!.patches[1].harvested).toBe(12);
    expect(loaded.worlds[1]!.patches[2].hunted).toBe(3);
    expect(loaded.player.bonds[0].benefit).toBe('shield');
  });
  it('creates independent slots, replaces only the requested slot and deletes only that lineage', () => {
    const first = createGame(481516), second = createGame(8675309);
    expect(saveGame(first)).toEqual({ ok: true });
    expect(saveGame(second)).toEqual({ ok: true });
    first.player.genome.name = 'Luma druhá'; makeCheckpoint(first);
    expect(saveGame(first).ok).toBe(true);
    expect(loadGames()).toHaveLength(2);
    expect(loadGame(first.id).player.genome.name).toBe('Luma druhá');
    expect(loadGame(second.id)).toEqual(second);
    deleteGame(first.id);
    expect(loadGames().map((slot) => slot.id)).toEqual([second.id]);
    expect(() => loadGame(first.id)).toThrow('nebyla nalezena');
  });
  it('sorts summaries by actual save time and exposes useful lineage metadata', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const first = createGame(481516); saveGame(first);
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    const second = createGame(20260913); saveGame(second);
    expect(loadGames()).toEqual([
      { id: second.id, name: 'Luma', stage: 0, generation: 1, seed: 20260913, updatedAt: 2000 },
      { id: first.id, name: 'Luma', stage: 0, generation: 1, seed: 481516, updatedAt: 1000 },
    ]);
  });
  it('preserves old saves when storage quota prevents an atomic replacement', () => {
    const state = createGame(481516);
    expect(saveGame(state).ok).toBe(true);
    const previous = storage.getItem(`lumavora:save:${state.id}`);
    state.player.dna += 3; state.player.totalDna += 3;
    storage.failWrites = true;
    expect(saveGame(state)).toMatchObject({ ok: false });
    expect(storage.getItem(`lumavora:save:${state.id}`)).toBe(previous);
    expect(loadGame(state.id).player.dna).toBe(14);
  });
  it('isolates corrupt slots and does not depend on a fragile shared index', () => {
    const state = createGame(481516); saveGame(state);
    storage.setItem('lumavora:index', '{broken index');
    storage.setItem('lumavora:save:broken', '{broken save');
    storage.setItem('lumavora:save:wrong-id', serializeGame(state));
    storage.setItem('unrelated-project', 'keep me');
    expect(loadGames()).toHaveLength(1);
    expect(() => loadGame('broken')).toThrow('JSON');
    expect(() => loadGame('wrong-id')).toThrow('nesouhlasí');
    deleteGame(state.id);
    expect(storage.getItem('unrelated-project')).toBe('keep me');
    expect(storage.getItem('lumavora:save:broken')).toBe('{broken save');
  });
  it('handles unavailable browser storage without crashing the game or menu', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadGames()).toEqual([]);
    expect(saveGame(createGame(481516))).toMatchObject({ ok: false });
    expect(() => loadGame('missing')).toThrow('nepřístupné');
    expect(() => deleteGame('missing')).toThrow('nepřístupné');
  });
});

describe('untrusted import validation', () => {
  it('rejects corrupt JSON, wrong format, unknown versions and files over 8 MB', () => {
    expect(() => parseGame('{')).toThrow('JSON');
    expect(() => parseGame(corrupt((file) => { file.format = 'other'; }))).toThrow('LUMAVORA');
    expect(() => parseGame(corrupt((file) => { file.version = 999; }))).toThrow('verze');
    expect(() => parseGame(corrupt((file) => { file.state.version = 999; }))).toThrow('verze');
    expect(() => parseGame(' '.repeat(8 * 1024 * 1024 + 1))).toThrow('8 MB');
    expect(() => parseGame('ž'.repeat(4 * 1024 * 1024 + 1))).toThrow('8 MB');
  });
  it('rejects missing fields, invented properties, bad identifiers and invalid numeric values', () => {
    const changes = [
      (file: ReturnType<typeof envelope>) => { delete file.state.player.velocity; },
      (file: ReturnType<typeof envelope>) => { file.state.player.admin = true; },
      (file: ReturnType<typeof envelope>) => { file.state.id = '../outside'; },
      (file: ReturnType<typeof envelope>) => { file.state.player.dna = -20; },
      (file: ReturnType<typeof envelope>) => { file.state.player.energy = '100'; },
      (file: ReturnType<typeof envelope>) => { file.state.player.health = null; },
      (file: ReturnType<typeof envelope>) => { file.state.rng = 2 ** 40; },
      (file: ReturnType<typeof envelope>) => { file.state.player.genome.parts[0].scale = 0; },
      (file: ReturnType<typeof envelope>) => { file.state.player.genome.extraDna = 500; },
      (file: ReturnType<typeof envelope>) => { file.state.player.pos.x = 1e100; },
    ];
    for (const change of changes) expect(() => parseGame(corrupt(change))).toThrow('Poškozená');
    const text = serializeGame(createGame(481516)).replace('"energy":90', '"energy":1e999');
    expect(() => parseGame(text)).toThrow('číselná');
  });
  it('rejects broken ecological references, species, IDs, capacities and required landmarks', () => {
    const changes = [
      (world: ReturnType<typeof envelope>['state']['world']) => { world.resources[0].patch = 3; },
      (world: ReturnType<typeof envelope>['state']['world']) => { world.creatures[0].species = 'invented'; },
      (world: ReturnType<typeof envelope>['state']['world']) => { world.resources[0].kind = 'credits'; },
      (world: ReturnType<typeof envelope>['state']['world']) => { world.resources[0].amount = world.resources[0].max + 1; },
      (world: ReturnType<typeof envelope>['state']['world']) => { world.resources[1].id = world.resources[0].id; },
      (world: ReturnType<typeof envelope>['state']['world']) => { world.nextId = 1; },
      (world: ReturnType<typeof envelope>['state']['world']) => { world.patches[1].id = 2; },
      (world: ReturnType<typeof envelope>['state']['world']) => { world.landmarks = []; },
      (world: ReturnType<typeof envelope>['state']['world']) => { world.seed += 1; },
    ];
    for (const change of changes) expect(() => parseGame(corrupt((file) => { change(file.state.world); change(file.state.worlds[0]); }))).toThrow('Poškozená');
    expect(() => parseGame(corrupt((file) => { file.state.world.resources[0].amount -= 1; }))).toThrow('rozchází');
  });
  it('bounds every collection class and rejects impossible campaign status', () => {
    expect(() => parseGame(corrupt((file) => { file.state.messages = Array(17).fill(file.state.messages[0]); }))).toThrow('počet');
    expect(() => parseGame(corrupt((file) => { file.state.worlds[0].resources = Array(513).fill(file.state.world.resources[0]); }))).toThrow('počet');
    expect(() => parseGame(corrupt((file) => { file.state.campaign.won = true; }))).toThrow('dokončení');
    expect(() => parseGame(corrupt((file) => { file.state.campaign.stageMeals = 2; }))).toThrow('číselná');
    expect(() => parseGame(corrupt((file) => { file.state.lineage[0].parts = ['missing']; }))).toThrow('adaptace');
  });
  it('validates generation checkpoints including identity and forbids recursive checkpoints', () => {
    expect(() => parseGame(corrupt((file) => { file.state.checkpoint = '{bad'; }))).toThrow('checkpoint');
    expect(() => parseGame(corrupt((file) => {
      const checkpoint = JSON.parse(file.state.checkpoint); checkpoint.id = 'another-line'; file.state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('nepatří');
    expect(() => parseGame(corrupt((file) => {
      const checkpoint = JSON.parse(file.state.checkpoint); checkpoint.checkpoint = file.state.checkpoint; file.state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('zanořenou');
    expect(() => parseGame(corrupt((file) => {
      const checkpoint = JSON.parse(file.state.checkpoint); checkpoint.player.genome.parts[0].scale = -1; file.state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('genome');
  });
  it('validates runtime state before replacing a valid stored slot', () => {
    const state = createGame(481516); saveGame(state);
    state.player.energy = NaN;
    expect(saveGame(state)).toMatchObject({ ok: false });
    expect(loadGame(state.id).player.energy).toBe(90);
  });
});
