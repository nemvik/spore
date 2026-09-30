import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  VEHICLE_FILE_LIMIT, VEHICLE_LIBRARY_LIMIT, VEHICLE_STORAGE_PREFIX,
  deleteVehicleCreation, importVehicleCreation, newVehicleCreation, parseVehicleCreation,
  readVehicleLibrary, saveVehicleCreation, serializeVehicleCreation, validateVehicleCreation,
} from '../src/game/vehicle-library';
import {
  editableBoat, initialVehicle, seaBlueprint, validateConstruction, validateSeaBlueprint,
  vehicleCost, vehicleStats, type SeaBlueprint, type VehicleConstruction,
} from '../src/game/blueprint';
import { activeMachines, buildMachine, machineDesign } from '../src/game/machines';
import {
  boatQuote, buyBoat, enableMaritime, landBoat, sail, sailingRate, seaCommand,
  seaJourney, turnBoat,
} from '../src/game/maritime';
import { activeField, returnHome } from '../src/game/planet-travel';
import { loadGame, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { sailingStatus } from '../src/ui/maritime';
import { carrierName, vehicleLibraryMarkup, vehicleThumbnail } from '../src/ui/vehicle-library';

class MemoryStorage {
  data = new Map<string, string>();
  failWrite = false;
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrite) throw new Error('quota');
    this.data.set(key, value);
  }
  removeItem(key: string) { this.data.delete(key); }
}

const designs: VehicleConstruction[] = [
  initialVehicle('tank', 'restoration'), initialVehicle('tank', 'predator'),
  initialVehicle('air', 'migration'), seaBlueprint(), editableBoat(),
];
const creation = (blueprint: VehicleConstruction = editableBoat(), id = 'vehicle-a') =>
  newVehicleCreation(blueprint, 'Vlastní vozidlo', id, 100);
const source = readFileSync('tests/fixtures/geography/sp-009h-conversion.save.json', 'utf8');
const advance = (s: GameState, seconds: number) => {
  for (let n = 0; n < Math.ceil(seconds * 30); n++) step(s, EMPTY_INPUT, 1 / 30);
};
function earned() {
  const s = parseGame(source);
  enableMaritime(s); returnHome(s);
  // Prepared historical entry; acquisition earns through real simulation, never injected funds.
  advance(s, 30);
  expect(activeMachines(s)!.resource).toBeGreaterThanOrEqual(56);
  return s;
}
function customBoat(): SeaBlueprint {
  const g = editableBoat();
  g.name = 'Modrá šipka'; g.hue = 215; g.pattern = 2; g.length = 1.25; g.width = .8;
  g.parts.find(p => p.kind === 'cabin')!.axial = .6;
  g.parts.find(p => p.kind === 'propeller')!.scale = 1.3;
  return g;
}
const financialState = (s: GameState) => structuredClone({
  machines: s.machines, states: s.states, cities: s.cities, maritime: s.maritime,
});

describe('SP-005.B standalone vehicle files and strict contracts', () => {
  it.each(designs)('roundtrips detached $carrier v$version construction and its functional values', blueprint => {
    const original = structuredClone(blueprint), record = creation(blueprint);
    expect(validateConstruction(record.blueprint)).toEqual([]);
    const loaded = parseVehicleCreation(serializeVehicleCreation(record));
    expect(loaded).toEqual(record);
    expect(vehicleCost(loaded.blueprint)).toBe(vehicleCost(blueprint));
    expect(vehicleStats(loaded.blueprint)).toEqual(vehicleStats(blueprint));
    loaded.blueprint.parts[0].scale = .7;
    record.blueprint.name = 'Jiný název';
    expect(blueprint).toEqual(original);
    expect(record.blueprint.parts[0].scale).toBe(original.parts[0].scale);
  });

  it('requires every envelope field and rejects unknown fields at both levels', () => {
    const valid = creation();
    for (const key of Object.keys(valid)) {
      const bad = structuredClone(valid) as unknown as Record<string, unknown>;
      delete bad[key];
      expect(() => validateVehicleCreation(bad), key).toThrow();
    }
    for (const bad of [{ ...valid, campaign: {} }, { ...valid, blueprint: { ...valid.blueprint, resource: 999 } }]) {
      const before = structuredClone(bad);
      expect(() => validateVehicleCreation(bad)).toThrow(); expect(bad).toEqual(before);
    }
  });

  it.each([
    ['format', 'lumavora-building'], ['version', 2], ['id', '../save'], ['id', ''],
    ['id', 'x'.repeat(81)], ['revision', 0], ['revision', 1.5], ['revision', 1_000_000_001],
    ['revision', Infinity], ['createdAt', -1], ['createdAt', 101], ['updatedAt', 99],
    ['updatedAt', NaN], ['updatedAt', 8_640_000_000_000_001], ['description', null],
    ['description', 'x'.repeat(281)], ['description', 'nový\nřádek'], ['description', '\u007f'],
    ['blueprint', null], ['blueprint', []], ['blueprint', {}],
  ])('rejects invalid metadata %s=%s before writing', (key, value) => {
    const storage = new MemoryStorage(), valid = creation();
    importVehicleCreation(storage, serializeVehicleCreation(valid));
    const before = [...storage.data];
    const bad = { ...valid, [key]: value };
    expect(() => validateVehicleCreation(bad)).toThrow();
    expect(() => importVehicleCreation(storage, JSON.stringify(bad))).toThrow();
    expect([...storage.data]).toEqual(before);
  });

  it('rejects malformed JSON and enforces the byte limit before parsing', () => {
    expect(() => parseVehicleCreation('{')).toThrow(/JSON/);
    expect(() => parseVehicleCreation(' '.repeat(VEHICLE_FILE_LIMIT + 1))).toThrow(/128/);
    // UTF-8 bytes, not JavaScript character count, determine the file boundary.
    const unicode = 'ě'.repeat(VEHICLE_FILE_LIMIT / 2 + 1);
    expect(unicode.length).toBeLessThan(VEHICLE_FILE_LIMIT);
    expect(() => parseVehicleCreation(unicode)).toThrow(/128/);
  });

  it('permits edited v3 boats without relaxing any canonical v2 boat value', () => {
    const edited = customBoat();
    expect(validateSeaBlueprint(edited)).toEqual([]);
    expect(validateConstruction(edited)).toEqual([]);
    expect(parseVehicleCreation(serializeVehicleCreation(creation(edited))).blueprint).toEqual(edited);
    expect(validateSeaBlueprint({ ...edited, version: 2 }).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries({ name: 'Jiný člun', length: 1.1, width: .9, hue: 41, pattern: 1 })) {
      expect(validateSeaBlueprint({ ...seaBlueprint(), [key]: value }).length, key).toBeGreaterThan(0);
    }
    const attachment = seaBlueprint(); attachment.parts[0].id += '-new';
    expect(validateSeaBlueprint(attachment).length).toBeGreaterThan(0);
    const swapped = seaBlueprint(); swapped.parts.reverse();
    expect(validateSeaBlueprint(swapped).length).toBeGreaterThan(0);
    expect(validateSeaBlueprint(seaBlueprint())).toEqual([]);
  });

  it.each([
    (g: any) => { g.version = 4; }, (g: any) => { g.carrier = 'air'; },
    (g: any) => { g.name = ' '; }, (g: any) => { g.length = .64; },
    (g: any) => { g.width = Infinity; }, (g: any) => { g.pattern = 1.5; },
    (g: any) => { g.parts.pop(); }, (g: any) => { g.parts.push({ ...g.parts[0], id: 'extra' }); },
    (g: any) => { g.parts[1].id = g.parts[0].id; }, (g: any) => { g.parts[1].kind = 'hull'; },
    (g: any) => { g.parts[2].kind = 'cannon'; }, (g: any) => { g.parts[2].mirrored = true; },
    (g: any) => { g.parts[0].scale = .54; }, (g: any) => { g.parts[0].angle = Math.PI + .01; },
    (g: any) => { g.parts[0].axial = -1.01; }, (g: any) => { g.parts[0].cost = 0; },
    (g: any) => { g.length = 2.4; g.width = 1.8; g.parts.forEach((p: any) => { p.scale = 1.65; }); },
  ])('rejects structurally invalid or overloaded edited boat %#', mutate => {
    const g = editableBoat(); mutate(g);
    expect(validateConstruction(g).length).toBeGreaterThan(0);
    const storage = new MemoryStorage(), before = [...storage.data];
    expect(() => importVehicleCreation(storage, JSON.stringify({ ...creation(), blueprint: g }))).toThrow();
    expect([...storage.data]).toEqual(before);
  });
});

describe('SP-005.B local library transactions', () => {
  it('updates the same identity, increments revisions and detaches editor drafts', () => {
    const storage = new MemoryStorage(), draft = customBoat();
    const first = saveVehicleCreation(storage, draft, 'Původní');
    draft.name = 'Nová revize'; draft.parts[2].scale = .8;
    const second = saveVehicleCreation(storage, draft, 'Upravený', first);
    expect(second).toMatchObject({ id: first.id, revision: 2, createdAt: first.createdAt, description: 'Upravený' });
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    expect(first.blueprint.name).toBe('Modrá šipka');
    draft.parts[2].scale = .9;
    expect(second.blueprint.parts[2].scale).toBe(.8);
    expect(readVehicleLibrary(storage)).toEqual({ entries: [second], problems: [] });
  });

  it('deduplicates an exact import and forks a conflicting revision without overwriting', () => {
    const storage = new MemoryStorage(), first = creation();
    importVehicleCreation(storage, serializeVehicleCreation(first));
    expect(importVehicleCreation(storage, serializeVehicleCreation(first))).toEqual({ creation: first, duplicate: true });
    const changed = { ...first, revision: 2, description: 'Cizí revize' };
    const result = importVehicleCreation(storage, serializeVehicleCreation(changed), () => 'import-fork');
    expect(result).toEqual({ creation: { ...changed, id: 'import-fork' }, duplicate: false });
    expect(parseVehicleCreation(storage.getItem(VEHICLE_STORAGE_PREFIX + first.id)!)).toEqual(first);
    const before = [...storage.data];
    expect(() => importVehicleCreation(storage, serializeVehicleCreation(changed), () => first.id)).toThrow(/Kolize/);
    expect([...storage.data]).toEqual(before);
  });

  it('rejects stale saves and deletion and leaves unrelated campaign data intact', () => {
    const storage = new MemoryStorage(), first = saveVehicleCreation(storage, customBoat(), 'První');
    const current = saveVehicleCreation(storage, first.blueprint, 'Druhá', first);
    storage.setItem('lumavora:save:active', 'untouched campaign');
    const before = [...storage.data];
    expect(() => saveVehicleCreation(storage, first.blueprint, 'Zastaralá', first)).toThrow(/mezitím/);
    expect(() => deleteVehicleCreation(storage, first)).toThrow(/změnil/);
    expect([...storage.data]).toEqual(before);
    deleteVehicleCreation(storage, current);
    expect(readVehicleLibrary(storage).entries).toEqual([]);
    expect(storage.getItem('lumavora:save:active')).toBe('untouched campaign');
    expect(() => saveVehicleCreation(storage, current.blueprint, '', current)).toThrow();
  });

  it('preserves valid and corrupt records when storage quota rejects a write', () => {
    const storage = new MemoryStorage(), first = saveVehicleCreation(storage, customBoat(), 'Původní');
    storage.setItem(VEHICLE_STORAGE_PREFIX + 'broken', '{');
    const before = [...storage.data]; storage.failWrite = true;
    expect(() => saveVehicleCreation(storage, first.blueprint, 'Nová', first)).toThrow(/Úložiště/i);
    expect(() => importVehicleCreation(storage, serializeVehicleCreation(creation(undefined, 'another')))).toThrow(/Úložiště/i);
    expect([...storage.data]).toEqual(before);
    expect(readVehicleLibrary(storage)).toEqual({ entries: [first], problems: [expect.any(String)] });
  });

  it('reports corrupt and mismatched records but preserves them while importing a safe collision copy', () => {
    const storage = new MemoryStorage(), incoming = creation(undefined, 'broken');
    storage.setItem(VEHICLE_STORAGE_PREFIX + 'broken', '{');
    storage.setItem(VEHICLE_STORAGE_PREFIX + 'mismatch', serializeVehicleCreation(creation()));
    expect(readVehicleLibrary(storage).problems).toHaveLength(2);
    const result = importVehicleCreation(storage, serializeVehicleCreation(incoming), () => 'safe-copy');
    expect(result.creation.id).toBe('safe-copy');
    expect(storage.getItem(VEHICLE_STORAGE_PREFIX + 'broken')).toBe('{');
    expect(readVehicleLibrary(storage).entries).toEqual([result.creation]);
  });

  it('counts corrupt slots toward capacity but allows exact duplicates and revisions at the cap', () => {
    const storage = new MemoryStorage(), first = creation();
    importVehicleCreation(storage, serializeVehicleCreation(first));
    for (let i = 1; i < VEHICLE_LIBRARY_LIMIT; i++) storage.setItem(VEHICLE_STORAGE_PREFIX + `corrupt-${i}`, '{');
    const before = [...storage.data];
    expect(() => saveVehicleCreation(storage, customBoat(), '')).toThrow(/100/);
    expect(() => importVehicleCreation(storage, serializeVehicleCreation(creation(undefined, 'extra')))).toThrow(/100/);
    expect([...storage.data]).toEqual(before);
    expect(importVehicleCreation(storage, serializeVehicleCreation(first)).duplicate).toBe(true);
    expect(saveVehicleCreation(storage, first.blueprint, 'Nová revize', first).revision).toBe(2);
    expect(storage.length).toBe(VEHICLE_LIBRARY_LIMIT);
  });
});

describe('SP-005.B actual paid construction and campaign persistence', () => {
  it.each(['tank', 'air'] as const)('rejects imported %s production while visiting a city without changing the campaign', carrier => {
    const s = parseGame(source), storage = new MemoryStorage();
    enableMaritime(s);
    // H fixture starts in a city. An affordable design isolates the location guard.
    expect(activeField(s)).not.toBeNull();
    const blueprint = initialVehicle(carrier, 'migration');
    for (const part of blueprint.parts) part.scale = .7;
    const imported = importVehicleCreation(storage, serializeVehicleCreation(creation(blueprint))).creation;
    if (imported.blueprint.carrier === 'boat') throw new Error('Wrong fixture carrier');
    expect(validateConstruction(imported.blueprint)).toEqual([]);
    expect(activeMachines(s)!.resource).toBeGreaterThanOrEqual(vehicleCost(imported.blueprint));
    expect(activeMachines(s)!.fleet.length).toBeLessThan(8);
    if (carrier === 'air') expect(activeMachines(s)!.airUnlocked).toBe(true);
    const before = structuredClone(s), result = buildMachine(s, imported.blueprint);
    expect(result.ok).toBe(false); expect(result.message).toMatch(/domácí dílny/);
    expect(s).toEqual(before);
  });

  it.each(['tank', 'air'] as const)('builds imported %s for its real cost with an independent campaign snapshot', carrier => {
    const s = earned(), storage = new MemoryStorage(), blueprint = initialVehicle(carrier, 'migration');
    blueprint.name = `Knihovní ${carrier}`; blueprint.hue = 260; blueprint.parts.at(-1)!.scale = 1.2;
    const imported = importVehicleCreation(storage, serializeVehicleCreation(creation(blueprint))).creation;
    const available = activeMachines(s)!.resource, fleet = activeMachines(s)!.fleet.length;
    expect(imported.blueprint.carrier).toBe(carrier);
    if (imported.blueprint.carrier === 'boat') throw new Error('Wrong fixture carrier');
    expect(buildMachine(s, imported.blueprint).ok).toBe(true);
    const m = activeMachines(s)!, built = m.fleet.at(-1)!, snapshot = structuredClone(machineDesign(m, built));
    expect(m.resource).toBe(available - vehicleCost(blueprint)); expect(m.fleet.length).toBe(fleet + 1);
    expect(snapshot).toEqual(blueprint); expect(built.health).toBe(vehicleStats(blueprint).durability);
    const next = saveVehicleCreation(storage, { ...blueprint, name: 'Pozdější revize' }, '', imported);
    deleteVehicleCreation(storage, next); imported.blueprint.parts[0].scale = .6;
    expect(machineDesign(m, built)).toEqual(snapshot);
    expect(parseGame(serializeGame(s)).machines).toEqual(s.machines);
  });

  it('does not let a library import bypass campaign flight unlocks or create a free machine', () => {
    const s = earned(), m = activeMachines(s)!, storage = new MemoryStorage();
    // Focused precondition regression; deliberately locked flight is not played campaign evidence.
    m.airUnlocked = false;
    const before = financialState(s), imported = importVehicleCreation(storage, serializeVehicleCreation(creation(initialVehicle('air', 'predator')))).creation;
    expect(financialState(s)).toEqual(before);
    if (imported.blueprint.carrier === 'boat') throw new Error('Wrong fixture carrier');
    expect(buildMachine(s, imported.blueprint).ok).toBe(false);
    expect(financialState(s)).toEqual(before); expect(m.airUnlocked).toBe(false);
  });

  it('quotes and pays the edited boat cost once, retaining construction independently of its library', () => {
    const s = earned(), storage = new MemoryStorage(), blueprint = customBoat();
    const imported = importVehicleCreation(storage, serializeVehicleCreation(creation(blueprint))).creation;
    expect(vehicleCost(blueprint)).toBe(72);
    expect(boatQuote(s, blueprint)).toBeNull();
    const accounts = financialState(s), available = activeMachines(s)!.resource, command = seaCommand(s, 1171);
    if (imported.blueprint.carrier !== 'boat') throw new Error('Wrong fixture carrier');
    expect(buyBoat(s, command, imported.blueprint)).toBe(true);
    const vessel = structuredClone(s.maritime!.vessel!);
    expect(vessel.blueprint).toEqual(blueprint);
    expect(vessel.payment).toMatchObject({ before: available, amount: 72, after: available - 72 });
    expect(vessel.health).toBe(vehicleStats(blueprint).durability);
    expect(s.states).toEqual(accounts.states); expect(s.cities).toEqual(accounts.cities);
    expect(activeMachines(s)!.resource).toBe(available - 72);
    const next = saveVehicleCreation(storage, { ...blueprint, name: 'Jiná loď' }, '', imported);
    deleteVehicleCreation(storage, next); imported.blueprint.parts[2].scale = .7;
    expect(s.maritime!.vessel).toEqual(vessel);
    expect(buyBoat(s, command, blueprint)).toBe(false);
    expect(buyBoat(s, seaCommand(s, 1171), blueprint)).toBe(false);
    expect(activeMachines(s)!.resource).toBe(available - 72);
    expect(parseGame(serializeGame(s)).maritime).toEqual(s.maritime);
  });

  it('rejects invalid, unaffordable and stale boat purchases without consuming funds', () => {
    const s = parseGame(source); enableMaritime(s); returnHome(s);
    const blueprint = customBoat(), before = financialState(s);
    expect(boatQuote(s, blueprint)).toContain(String(vehicleCost(blueprint)));
    expect(buyBoat(s, seaCommand(s, 1171), blueprint)).toBe(false);
    const bad = editableBoat(); bad.parts[2].mirrored = true;
    expect(buyBoat(s, seaCommand(s, 1171), bad)).toBe(false);
    const stale = seaCommand(s, 1171); stale.revision++;
    expect(buyBoat(s, stale, blueprint)).toBe(false);
    expect(financialState(s)).toEqual(before);
  });

  it('saves and restores an edited boat in transit, uses its speed, and resumes the same paid voyage', () => {
    const s = earned(), blueprint = customBoat();
    expect(buyBoat(s, seaCommand(s, 1171), blueprint)).toBe(true);
    expect(sail(s, seaCommand(s, 1171))).toBe(true);
    advance(s, 2);
    const rate = sailingRate(s);
    expect(rate).toBeGreaterThan(1);
    expect(seaJourney(s)!.progress).toBeCloseTo(2 * rate, 7);
    makeCheckpoint(s);
    const checkpointBoat = structuredClone(s.maritime), checkpointFunds = activeMachines(s)!.resource;
    advance(s, 1); expect(seaJourney(s)!.progress).toBeGreaterThan(checkpointBoat!.journeys.at(-1)!.progress);
    const recovered = recoverGeneration(s);
    expect(recovered.maritime).toEqual(checkpointBoat);
    expect(activeMachines(recovered)!.resource).toBe(checkpointFunds);
    const loaded = parseGame(serializeGame(recovered));
    expect(loaded.maritime).toEqual(checkpointBoat);
    advance(loaded, (seaJourney(loaded)!.route.length - 1) / rate);
    expect(landBoat(loaded, loaded.maritime!.revision)).toBe(true);
    expect(loaded.maritime!.vessel!.mooring).toBe(1171);
    expect(loaded.maritime!.vessel!.blueprint).toEqual(blueprint);
    expect(activeMachines(loaded)!.resource).toBe(checkpointFunds);
    expect(parseGame(serializeGame(loaded)).maritime).toEqual(loaded.maritime);
    vi.stubGlobal('localStorage', new MemoryStorage());
    try {
      expect(saveGame(loaded).ok).toBe(true);
      expect(loadGame(loaded.id).maritime).toEqual(loaded.maritime);
    } finally { vi.unstubAllGlobals(); }
  });

  it('preserves custom propulsion on turnaround without falsifying historical route units', () => {
    const s = earned(); expect(buyBoat(s, seaCommand(s, 1171), customBoat())).toBe(true);
    expect(sail(s, seaCommand(s, 1171))).toBe(true); advance(s, 2);
    const reached = seaJourney(s)!.progress;
    expect(turnBoat(s, s.maritime!.revision)).toBe(true); advance(s, 1);
    expect(seaJourney(s)!.progress).toBeCloseTo(reached - sailingRate(s), 7);
    expect(parseGame(serializeGame(s)).maritime).toEqual(s.maritime);
    advance(s, 2);
    expect(landBoat(s, s.maritime!.revision)).toBe(true);
    expect(seaJourney(s)!.phase).toBe('returned');
    expect(seaJourney(s)!.elapsed).toBeCloseTo(reached * 2, 7);
    expect(parseGame(serializeGame(s)).maritime).toEqual(s.maritime);
  });

  it('rejects forged edited-boat receipts and a changed checkpoint construction', () => {
    const s = earned(); expect(buyBoat(s, seaCommand(s, 1171), customBoat())).toBe(true); makeCheckpoint(s);
    const receipt = structuredClone(s); receipt.maritime!.vessel!.payment.amount--;
    expect(() => serializeGame(receipt)).toThrow();
    const changed = structuredClone(s), cp = JSON.parse(changed.checkpoint!) as GameState;
    cp.maritime!.vessel!.blueprint.hue++;
    changed.checkpoint = JSON.stringify(cp);
    expect(() => serializeGame(changed)).toThrow();
    expect(parseGame(serializeGame(s)).maritime).toEqual(s.maritime);
  });
});

describe('SP-005.B imported names and descriptions remain inert UI text', () => {
  const name = '<b title="x">&\'</b>';
  const escapedName = '&lt;b title=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;';
  const description = '<img src=x onerror=alert(1)>';
  const escapedDescription = '&lt;img src=x onerror=alert(1)&gt;';

  it.each(['tank', 'air', 'boat'] as const)('escapes %s library metadata, capture buttons and thumbnail attributes', carrier => {
    const blueprint = carrier === 'boat' ? editableBoat() : initialVehicle(carrier, 'migration');
    blueprint.name = name;
    const storage = new MemoryStorage();
    const entry = importVehicleCreation(storage, serializeVehicleCreation(newVehicleCreation(blueprint, description, 'html-name', 100))).creation;
    const thumbnail = vehicleThumbnail(entry.blueprint);
    expect(thumbnail).toContain(`aria-label="${carrierName(carrier)} ${escapedName}"`);
    expect(thumbnail).not.toContain(name);
    const markup = vehicleLibraryMarkup([entry], [entry.blueprint], true);
    expect(markup).toContain(`<h3>${escapedName}</h3>`);
    expect(markup).toContain(`<p>${escapedDescription}</p>`);
    expect(markup).toContain(`data-action="vehicle-capture:0">${escapedName}</button>`);
    expect(markup).not.toContain(name); expect(markup).not.toContain(description);
    expect(markup).not.toMatch(/<img\b|<b\s+title=/);
    expect(readVehicleLibrary(storage).entries[0].blueprint.name).toBe(name);
  });

  it('escapes the actual paid boat name in the sailing status without changing its saved identity', () => {
    const s = earned(), blueprint = customBoat(); blueprint.name = name;
    const entry = parseVehicleCreation(serializeVehicleCreation(creation(blueprint)));
    if (entry.blueprint.carrier !== 'boat') throw new Error('Wrong fixture carrier');
    expect(buyBoat(s, seaCommand(s, 1171), entry.blueprint)).toBe(true);
    expect(sail(s, seaCommand(s, 1171))).toBe(true);
    const before = structuredClone(s.maritime), markup = sailingStatus(s);
    expect(markup).toContain(`<strong>${escapedName}</strong>`);
    expect(markup).not.toContain(name); expect(markup).not.toMatch(/<b\s+title=/);
    expect(s.maritime).toEqual(before);
    expect(parseGame(serializeGame(s)).maritime!.vessel!.blueprint.name).toBe(name);
  });
});


describe('SP-005.B actual native production export', () => {
  it('keeps the earned custom fleet and all three voyages independent of the deleted library entry', () => {
    const bytes = readFileSync('tests/fixtures/vehicles/library-campaign.save.json', 'utf8');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('7bf57ced1bdca1e306f68d8af2ff7c7c1cf06ff3490e945b200f8786b49d0450');
    const s = parseGame(bytes), vessel = s.maritime!.vessel!;
    expect(vessel.blueprint).toMatchObject({ version: 3, carrier: 'boat', name: 'Modrá perlorodka II' });
    expect(vessel.payment.amount).toBe(64); expect(vessel.payment.before - vessel.payment.after).toBe(64);
    expect(vessel.mooring).toBe(1614);
    expect(s.maritime!.journeys.map(j => j.phase)).toEqual(['returned', 'landed', 'landed']);
    expect(s.machines!.blueprints.map(b => b.blueprint.name)).toEqual(expect.arrayContaining(['Jantarový kráčivec', 'Listový větroplach']));
    expect(parseGame(serializeGame(s)).maritime).toEqual(s.maritime);
    expect(parseGame(serializeGame(s)).machines).toEqual(s.machines);
  });
});
