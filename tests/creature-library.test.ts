import { describe, expect, it } from 'vitest';
import { CREATURE_FILE_LIMIT, CREATURE_STORAGE_PREFIX, deleteCreation, importCreation, newCreation, parseCreation, readCreatureLibrary, saveCreation, serializeCreation } from '../src/game/creature-library';
import { initialGenome } from '../src/game/genome';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { creatureLibraryMarkup } from '../src/ui/creature-library';

class MemoryStorage {
  data = new Map<string, string>(); fail = false;
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.fail) throw new Error('quota'); this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}
describe('standalone creature library', () => {
  it.each([initialGenome(), creatureBodyFixture('biped'), creatureBodyFixture('longneck')])('roundtrips a detached genome $name', genome => {
    const c = newCreation(genome, 'Moje tělo', 'creature-a', 100);
    expect(parseCreation(serializeCreation(c))).toEqual(c);
    c.genome.name = 'Changed'; expect(genome.name).not.toBe('Changed');
  });
  it.each([
    (c: any) => { c.version = 2; }, (c: any) => { c.genome.length = null; },
    (c: any) => { c.genome.parts[0].kind = 'unknown'; }, (c: any) => { c.id = '../file'; },
    (c: any) => { c.id = '<script>'; }, (c: any) => { c.revision = -1; },
    (c: any) => { c.description = 'x'.repeat(281); }, (c: any) => { c.createdAt = c.updatedAt + 1; },
    (c: any) => { c.campaign = {}; }, (c: any) => { c.genome.body.spine = []; },
  ])('rejects malformed data without touching storage', mutate => {
    const storage = new MemoryStorage(), original = saveCreation(storage, initialGenome(), '');
    const bad = newCreation(creatureBodyFixture('biped')); mutate(bad);
    expect(() => importCreation(storage, JSON.stringify(bad))).toThrow();
    expect(readCreatureLibrary(storage).entries).toEqual([original]);
  });
  it('rejects invalid JSON and excessive file size', () => {
    expect(() => parseCreation('{')).toThrow('JSON');
    expect(() => parseCreation(' '.repeat(CREATURE_FILE_LIMIT + 1))).toThrow('velký');
  });
  it('updates the same identity and increments its revision', () => {
    const storage = new MemoryStorage(), first = saveCreation(storage, initialGenome(), '');
    const genome = { ...first.genome, hue: 32, name: 'Dřívější tvor' };
    const second = saveCreation(storage, genome, 'Nový popis', first);
    expect(second.id).toBe(first.id); expect(second.revision).toBe(2); expect(second.createdAt).toBe(first.createdAt);
    expect(readCreatureLibrary(storage).entries).toEqual([second]); expect(first.genome.hue).toBe(168);
  });
  it('deduplicates exact imports, forks collisions without replacing the original', () => {
    const storage = new MemoryStorage(), first = saveCreation(storage, initialGenome(), '');
    expect(importCreation(storage, serializeCreation(first)).duplicate).toBe(true); expect(storage.length).toBe(1);
    const changed = structuredClone(first); changed.genome.hue = 40;
    const result = importCreation(storage, serializeCreation(changed), () => 'forked');
    expect(result.creation.id).toBe('forked'); expect(storage.length).toBe(2);
    expect(readCreatureLibrary(storage).entries.find(c => c.id === first.id)).toEqual(first);
  });
  it('preserves data on quota errors and does not report a successful write', () => {
    const storage = new MemoryStorage(), first = saveCreation(storage, initialGenome(), ''); storage.fail = true;
    expect(() => saveCreation(storage, { ...first.genome, name: 'Lost?' }, '', first)).toThrow('nepodařilo');
    expect(() => importCreation(storage, serializeCreation(newCreation(initialGenome())))).toThrow('nepodařilo');
    expect(readCreatureLibrary(storage).entries).toEqual([first]);
  });
  it('refuses stale edits and deletions while preserving unrelated records', () => {
    const storage = new MemoryStorage(), first = saveCreation(storage, initialGenome(), '');
    saveCreation(storage, first.genome, 'newer', first);
    expect(() => saveCreation(storage, first.genome, 'stale', first)).toThrow('mezitím');
    expect(() => deleteCreation(storage, first)).toThrow('změnil');
    storage.setItem('lumavora:save:active', 'campaign');
    deleteCreation(storage, readCreatureLibrary(storage).entries[0]);
    expect(storage.getItem('lumavora:save:active')).toBe('campaign');
  });
  it('leaves corrupt records intact and forks imports that collide with them', () => {
    const storage = new MemoryStorage(); storage.setItem(CREATURE_STORAGE_PREFIX + 'bad', '{');
    expect(readCreatureLibrary(storage).problems).toHaveLength(1);
    importCreation(storage, serializeCreation(newCreation(initialGenome(), '', 'bad')), () => 'good');
    expect(storage.getItem(CREATURE_STORAGE_PREFIX + 'bad')).toBe('{');
    expect(readCreatureLibrary(storage).entries[0].id).toBe('good');
  });
  it('limits growth to 100 records while allowing edits and duplicate imports', () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 100; i++) importCreation(storage, serializeCreation(newCreation(initialGenome(), '', `c-${i}`)));
    expect(() => saveCreation(storage, initialGenome(), '')).toThrow('plná');
    const first = readCreatureLibrary(storage).entries[0];
    expect(importCreation(storage, serializeCreation(first)).duplicate).toBe(true);
    expect(saveCreation(storage, first.genome, 'edit', first).revision).toBe(2);
  });
  it('escapes imported names and descriptions in cards and thumbnails', () => {
    const g = creatureBodyFixture('biped'); g.name = '<img src=x onerror=alert(1)>';
    const markup = creatureLibraryMarkup([newCreation(g, '<script>alert(1)</script>')], true);
    expect(markup).not.toContain('<img'); expect(markup).not.toContain('<script>'); expect(markup).toContain('&lt;img');
  });
});
