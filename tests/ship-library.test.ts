import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialShip, SHIP_PART_LIMIT, shipStats, validateShipBlueprint } from '../src/game/ship-design';
import {
  SHIP_FILE_LIMIT, SHIP_LIBRARY_LIMIT, SHIP_STORAGE_PREFIX, deleteShipCreation,
  importShipCreation, newShipCreation, parseShipCreation, readShipLibrary,
  saveShipCreation, serializeShipCreation, validateShipCreation,
} from '../src/game/ship-library';

class MemoryStorage {
  data = new Map<string, string>();
  failWrite = false;
  writes = 0;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    this.writes++;
    if (this.failWrite) throw new Error('quota');
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}
const creation = (id = 'ship-a', now = 100) => newShipCreation(initialShip(), 'Vlastní semeno', id, now);
afterEach(() => vi.restoreAllMocks());

describe('C1 standalone ship design and functional parameters', () => {
  it('prices the default geometry and derives independently checked flight and cargo values', () => {
    const blueprint = initialShip();
    expect(() => validateShipBlueprint(blueprint)).not.toThrow();
    const stats = shipStats(blueprint);
    expect(stats).toMatchObject({ cost: 98, health: 101, energy: 101, cargo: 8, solar: 2.4, scan: 11.43 });
    expect(stats.mass).toBeCloseTo(10.6618, 10);
    expect(stats.speed).toBeCloseTo(5 + 108 / 10.6618, 10);
    const moved = structuredClone(blueprint);
    moved.parts[0].position = { x: 3, y: -3, z: 2 }; moved.parts[0].yaw = 180;
    expect(shipStats(moved)).toEqual(stats);
    moved.parts.find(p => p.kind === 'cargo')!.scale.x = 2;
    const heavy = shipStats(moved);
    expect(heavy.cargo).toBe(12); expect(heavy.cost).toBe(110);
    expect(heavy.speed).toBeLessThan(stats.speed); expect(heavy.energy).toBeGreaterThan(stats.energy);
  });

  it('accepts the minimum engine-only ship and geometric boundary values without exceeding the speed cap', () => {
    const blueprint = initialShip(); blueprint.parts = blueprint.parts.filter(p => p.kind === 'engine');
    expect(() => validateShipBlueprint(blueprint)).not.toThrow();
    expect(shipStats(blueprint)).toEqual({ cost: 56, mass: 4.4, speed: 23, health: 70, energy: 89, cargo: 4, solar: 1, scan: 8 });
    blueprint.parts[0].scale = { x: .3, y: 2.5, z: 2.5 };
    blueprint.parts[0].position = { x: -3, y: 3, z: 0 }; blueprint.parts[0].yaw = -180;
    expect(() => validateShipBlueprint(blueprint)).not.toThrow();
    blueprint.parts = Array.from({ length: SHIP_PART_LIMIT }, (_, i) => ({ ...structuredClone(blueprint.parts[0]), id: `engine-${i}` }));
    expect(() => validateShipBlueprint(blueprint)).not.toThrow();
    expect(shipStats(blueprint).speed).toBe(23);
    blueprint.parts.push({ ...structuredClone(blueprint.parts[0]), id: 'overflow' });
    expect(() => validateShipBlueprint(blueprint)).toThrow();
  });

  it('roundtrips detached drafts and retains every transform and functional value', () => {
    const draft = initialShip(), record = newShipCreation(draft, '', 'custom', 1);
    const parsed = parseShipCreation(serializeShipCreation(record));
    expect(parsed).toEqual(record); expect(shipStats(parsed.blueprint)).toEqual(shipStats(draft));
    draft.parts[0].scale.x = .3; parsed.blueprint.parts[1].position.x = 3;
    expect(record.blueprint.parts[0].scale.x).toBe(1.2);
    expect(record.blueprint.parts[1].position.x).toBe(0);
    expect(initialShip().parts[0].scale.x).toBe(1.2);
  });

  it('requires exact field sets on the file, design, part and both vectors', () => {
    const valid = creation();
    for (const path of [[], ['blueprint'], ['blueprint', 'parts', '0'], ['blueprint', 'parts', '0', 'position'], ['blueprint', 'parts', '0', 'scale']]) {
      const node = path.reduce<any>((v, key) => v[key], valid);
      for (const key of Object.keys(node)) {
        const bad = structuredClone(valid), target = path.reduce<any>((v, key) => v[key], bad);
        delete target[key]; expect(() => validateShipCreation(bad), `${path.join('.')}.${key}`).toThrow();
      }
      const bad = structuredClone(valid), target = path.reduce<any>((v, key) => v[key], bad);
      target.resource = 999; expect(() => validateShipCreation(bad)).toThrow();
    }
  });

  it.each([
    ['format', 'lumavora-save'], ['version', 2], ['id', '../save'], ['id', ''], ['id', 'x'.repeat(81)],
    ['revision', 0], ['revision', 1.5], ['revision', 1_000_000_001], ['createdAt', -1],
    ['createdAt', 101], ['updatedAt', 99], ['updatedAt', 8_640_000_000_000_001],
    ['description', null], ['description', 'x'.repeat(281)], ['description', 'a\nb'], ['description', '\u007f'],
  ])('rejects unsafe metadata %s=%s without any storage write', (key, value) => {
    const storage = new MemoryStorage(); storage.setItem('lumavora:save:active', 'campaign');
    const before = [...storage.data], writes = storage.writes;
    expect(() => importShipCreation(storage, JSON.stringify({ ...creation(), [key]: value }))).toThrow();
    expect([...storage.data]).toEqual(before); expect(storage.writes).toBe(writes);
  });

  it.each([
    ['empty parts', (b: any) => { b.parts = []; }],
    ['missing engine', (b: any) => { b.parts = b.parts.filter((p: any) => p.kind !== 'engine'); }],
    ['duplicate id', (b: any) => { b.parts[1].id = b.parts[0].id; }],
    ['path id', (b: any) => { b.parts[0].id = '../part'; }],
    ['prototype kind', (b: any) => { b.parts[0].kind = '__proto__'; }],
    ['constructor kind', (b: any) => { b.parts[0].kind = 'constructor'; }],
    ['unknown kind', (b: any) => { b.parts[0].kind = 'weapon'; }],
    ['oversize', (b: any) => { b.parts[0].scale.z = 2.51; }],
    ['undersize', (b: any) => { b.parts[0].scale.y = .29; }],
    ['out of bounds', (b: any) => { b.parts[0].position.x = -3.01; }],
    ['nonfinite', (b: any) => { b.parts[0].position.z = Infinity; }],
    ['numeric string', (b: any) => { b.parts[0].yaw = '0'; }],
    ['rotation', (b: any) => { b.parts[0].yaw = 181; }],
    ['empty name', (b: any) => { b.name = ' '; }],
    ['long name', (b: any) => { b.name = 'x'.repeat(41); }],
    ['control name', (b: any) => { b.name = 'a\u0000b'; }],
    ['noncanonical color', (b: any) => { b.color = '#FFFFFF'; }],
    ['style injection', (b: any) => { b.color = 'red;display:none'; }],
  ])('rejects invalid construction: %s', (_name, mutate) => {
    const record = creation(); mutate(record.blueprint);
    expect(() => validateShipCreation(record)).toThrow();
    const storage = new MemoryStorage();
    expect(() => importShipCreation(storage, JSON.stringify(record))).toThrow();
    expect(storage.writes).toBe(0);
  });

  it('enforces UTF-8 byte limits before JSON parsing and rejects prototype envelope additions', () => {
    const json = serializeShipCreation(creation()), bytes = new TextEncoder().encode(json).length;
    expect(parseShipCreation(json + ' '.repeat(SHIP_FILE_LIMIT - bytes))).toEqual(creation());
    expect(() => parseShipCreation(json + ' '.repeat(SHIP_FILE_LIMIT - bytes + 1))).toThrow(/128/);
    expect(() => parseShipCreation('ě'.repeat(SHIP_FILE_LIMIT / 2 + 1))).toThrow(/128/);
    expect(() => parseShipCreation('{')).toThrow(/JSON/);
    expect(() => parseShipCreation(json.replace('{', '{"__proto__":{"polluted":true},'))).toThrow();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('C1 local ship library transactions', () => {
  it('writes each revision once, preserves identity and detaches the editor draft', () => {
    const storage = new MemoryStorage(), draft = initialShip();
    const first = saveShipCreation(storage, draft, 'První');
    draft.name = 'Druhá'; draft.parts[0].scale.x = .8;
    const second = saveShipCreation(storage, draft, 'Nová', first);
    expect(storage.writes).toBe(2);
    expect(second).toMatchObject({ id: first.id, revision: 2, createdAt: first.createdAt, description: 'Nová' });
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    draft.parts[0].scale.x = 2;
    expect(second.blueprint.parts[0].scale.x).toBe(.8); expect(first.blueprint.parts[0].scale.x).toBe(1.2);
    expect(readShipLibrary(storage)).toEqual({ entries: [second], problems: [] });
  });

  it('deduplicates exact imports and forks identity collisions without replacing either record', () => {
    const storage = new MemoryStorage(), first = creation();
    importShipCreation(storage, serializeShipCreation(first));
    expect(importShipCreation(storage, serializeShipCreation(first))).toEqual({ creation: first, duplicate: true });
    expect(storage.writes).toBe(1);
    const revised = { ...first, revision: 2, description: 'Jiná' };
    const fork = importShipCreation(storage, serializeShipCreation(revised), () => 'fork').creation;
    expect(fork).toEqual({ ...revised, id: 'fork' });
    const before = [...storage.data];
    expect(() => importShipCreation(storage, serializeShipCreation(revised), () => 'fork')).toThrow(/Kolize/);
    expect(() => importShipCreation(storage, serializeShipCreation(revised), () => '../unsafe')).toThrow();
    expect([...storage.data]).toEqual(before); expect(storage.writes).toBe(2);
    expect(parseShipCreation(storage.getItem(SHIP_STORAGE_PREFIX + first.id)!)).toEqual(first);
  });

  it('refuses stale revisions and stale deletion, including same-revision payload changes', () => {
    const storage = new MemoryStorage(), first = saveShipCreation(storage, initialShip(), 'První');
    storage.setItem('lumavora:save:active', 'campaign');
    const second = saveShipCreation(storage, first.blueprint, 'Druhá', first), before = [...storage.data];
    expect(() => saveShipCreation(storage, first.blueprint, 'Zastaralá', first)).toThrow(/mezitím/);
    expect(() => deleteShipCreation(storage, first)).toThrow(/změnil/);
    expect(() => deleteShipCreation(storage, { ...second, description: 'Podvrh' })).toThrow();
    expect([...storage.data]).toEqual(before);
    deleteShipCreation(storage, second);
    expect(storage.getItem('lumavora:save:active')).toBe('campaign');
    expect(() => saveShipCreation(storage, second.blueprint, '', second)).toThrow();
    expect(readShipLibrary(storage).entries).toEqual([]);
  });

  it('preserves all old bytes if quota rejects a revision or import', () => {
    const storage = new MemoryStorage(), first = saveShipCreation(storage, initialShip(), 'První');
    storage.setItem(SHIP_STORAGE_PREFIX + 'broken', '{'); storage.setItem('lumavora:save:active', 'campaign');
    const before = [...storage.data]; storage.failWrite = true;
    expect(() => saveShipCreation(storage, first.blueprint, 'Druhá', first)).toThrow(/Úložiště/);
    expect(() => importShipCreation(storage, serializeShipCreation(creation('other')))).toThrow(/Úložiště/);
    expect([...storage.data]).toEqual(before);
    expect(readShipLibrary(storage)).toEqual({ entries: [first], problems: [expect.any(String)] });
  });

  it('preserves corrupt identities, reports mismatches and deterministically sorts valid entries', () => {
    const storage = new MemoryStorage();
    storage.setItem(SHIP_STORAGE_PREFIX + 'broken', '{');
    storage.setItem(SHIP_STORAGE_PREFIX + 'mismatch', serializeShipCreation(creation()));
    const copy = importShipCreation(storage, serializeShipCreation(creation('broken')), () => 'safe-copy').creation;
    for (const record of [creation('z', 102), creation('b', 101), creation('a', 101)]) importShipCreation(storage, serializeShipCreation(record));
    const read = readShipLibrary(storage);
    expect(read.problems).toHaveLength(2); expect(read.entries.map(c => c.id)).toEqual(['z', 'a', 'b', copy.id]);
    expect(storage.getItem(SHIP_STORAGE_PREFIX + 'broken')).toBe('{');
  });

  it('counts corrupt slots toward the cap while allowing exact duplicates and revisions', () => {
    const storage = new MemoryStorage(), first = creation(); importShipCreation(storage, serializeShipCreation(first));
    for (let i = 1; i < SHIP_LIBRARY_LIMIT; i++) storage.setItem(SHIP_STORAGE_PREFIX + `broken-${i}`, '{');
    const before = [...storage.data];
    expect(() => saveShipCreation(storage, initialShip(), '')).toThrow(/100/);
    expect(() => importShipCreation(storage, serializeShipCreation(creation('extra')))).toThrow(/100/);
    expect([...storage.data]).toEqual(before);
    expect(importShipCreation(storage, serializeShipCreation(first)).duplicate).toBe(true);
    expect(saveShipCreation(storage, first.blueprint, 'Revize', first).revision).toBe(2);
    expect(storage.length).toBe(SHIP_LIBRARY_LIMIT);
  });

  it('does not overwrite a new-save UUID collision or overflow a revision', () => {
    const storage = new MemoryStorage(), first = creation('collision');
    importShipCreation(storage, serializeShipCreation(first));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('collision' as ReturnType<typeof crypto.randomUUID>);
    const before = [...storage.data];
    expect(() => saveShipCreation(storage, initialShip(), '')).toThrow(/Kolize/);
    expect([...storage.data]).toEqual(before);
    const terminal = { ...creation('terminal'), revision: 1_000_000_000 };
    importShipCreation(storage, serializeShipCreation(terminal));
    const terminalBytes = storage.getItem(SHIP_STORAGE_PREFIX + terminal.id);
    expect(() => saveShipCreation(storage, terminal.blueprint, '', terminal)).toThrow();
    expect(storage.getItem(SHIP_STORAGE_PREFIX + terminal.id)).toBe(terminalBytes);
  });
});
