import { describe, expect, it } from 'vitest';
import {
  cloneBlueprint, fromGenome, initialVehicle, quoteVehicle, toGenome,
  validateVehicle, vehicleCost, vehiclePart, vehicleStats, VEHICLE_PARTS,
} from '../src/game/blueprint';
import type { OrganismBlueprint, VehicleBlueprint, VehiclePart, VehiclePartId } from '../src/game/blueprint';
import { computeStats, genomeCost, initialGenome, validateGenome } from '../src/game/genome';
import { MACHINE_COPY as C } from '../src/game/machine-copy.cs';
import type { Genome } from '../src/game/types';

function attach(g: VehicleBlueprint, kind: VehiclePartId, overrides: Partial<VehiclePart> = {}): VehicleBlueprint {
  const next = cloneBlueprint(g);
  next.parts.push({ id: `${kind}-${next.parts.length}`, kind, axial: 0, angle: 0, scale: 1, mirrored: false, ...overrides });
  return next;
}

function landGenome(): Genome {
  const g = initialGenome();
  g.name = 'Původní pobřežní linie'; g.hue = 271; g.pattern = 3; g.length = 1.2; g.width = .85;
  g.parts.push(
    { id: 'historical-legs', kind: 'legs', axial: -.4, angle: 1.2, scale: 1.1, mirrored: true },
    { id: 'historical-lungs', kind: 'lungs', axial: .6, angle: -1.2, scale: .8, mirrored: false },
  );
  return g;
}

describe('historical organism blueprint adapter', () => {
  it.each([initialGenome(), landGenome()])('round trips the exact historical seven-key wire format for $name', genome => {
    const before = structuredClone(genome), wrapped = fromGenome(genome), restored = toGenome(wrapped);
    expect(wrapped.kind).toBe('organism');
    expect(Object.keys(restored)).toEqual(['version', 'name', 'length', 'width', 'hue', 'pattern', 'parts']);
    expect(restored).not.toHaveProperty('kind'); expect(restored).not.toHaveProperty('carrier');
    expect(JSON.stringify(restored)).toBe(JSON.stringify(genome));
    expect(restored).toEqual(before); expect(genome).toEqual(before);
    expect(genomeCost(restored)).toBe(genomeCost(genome));
    expect(computeStats(restored)).toEqual(computeStats(genome));
    expect(validateGenome(restored, genome.parts.some(p => p.kind === 'legs') ? 2 : 0)).toEqual([]);
  });

  it('copies in both directions without sharing the attachment array or parts', () => {
    const original = landGenome(), before = structuredClone(original), wrapped = fromGenome(original);
    expect(wrapped.parts).not.toBe(original.parts); expect(wrapped.parts[0]).not.toBe(original.parts[0]);
    wrapped.parts[0].scale = 1.3; wrapped.name = 'Upravená linie';
    expect(original).toEqual(before);
    const restored = toGenome(wrapped), restoredBefore = structuredClone(restored);
    expect(restored.parts).not.toBe(wrapped.parts); expect(restored.parts[0]).not.toBe(wrapped.parts[0]);
    wrapped.parts[0].scale = .6; wrapped.parts.pop();
    expect(restored).toEqual(restoredBefore);
    restored.parts[0].axial = -.8;
    expect(original).toEqual(before);
  });

  it('does not leak internal editor fields back into saved Genome', () => {
    const wrapped = { ...fromGenome(landGenome()), carrier: 'tank', editorSelection: 'historical-legs' };
    expect(toGenome(wrapped as OrganismBlueprint)).toEqual(landGenome());
    expect(Object.keys(toGenome(wrapped as OrganismBlueprint))).toHaveLength(7);
  });

  it.each([fromGenome(landGenome()), initialVehicle('tank', 'restoration')])('deep-clones $kind editing history', blueprint => {
    const before = structuredClone(blueprint), copy = cloneBlueprint(blueprint);
    expect(copy).toEqual(blueprint); expect(copy).not.toBe(blueprint);
    copy.name = 'Další návrh'; copy.parts[0].angle = .9; copy.parts.pop();
    expect(blueprint).toEqual(before);
  });
});

describe('vehicle catalogue and complete initial designs', () => {
  it('contains nine unique usable parts and only ground/air carriers', () => {
    expect(VEHICLE_PARTS.map(p => p.id).sort()).toEqual(['armor', 'broadcast', 'cabin', 'cannon', 'drill', 'hull', 'rotor', 'seeder', 'tracks']);
    expect(new Set(VEHICLE_PARTS.map(p => p.id)).size).toBe(9);
    expect(new Set(VEHICLE_PARTS.map(p => p.category))).toEqual(new Set(['structure', 'drive', 'module', 'armor']));
    for (const part of VEHICLE_PARTS) {
      expect(vehiclePart(part.id)).toBe(part);
      for (const number of [part.cost, part.mass, part.durability, part.power, part.max]) expect(Number.isFinite(number)).toBe(true);
      expect(part.cost).toBeGreaterThan(0); expect(part.mass).toBeGreaterThan(0);
      expect(part.durability).toBeGreaterThan(0); expect(part.power).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(part.max)).toBe(true); expect(part.max).toBeGreaterThan(0);
      expect(part.carriers.length).toBeGreaterThan(0);
      expect(part.carriers.every(carrier => carrier === 'tank' || carrier === 'air')).toBe(true);
      expect(new Set(part.carriers).size).toBe(part.carriers.length);
      expect(part.name.length).toBeGreaterThan(0); expect(part.description.length).toBeGreaterThan(15); expect(part.tradeoff.length).toBeGreaterThan(10);
    }
    expect(vehiclePart('tracks').carriers).toEqual(['tank']); expect(vehiclePart('drill').carriers).toEqual(['tank']);
    expect(vehiclePart('rotor').carriers).toEqual(['air']); expect(vehiclePart('seeder').carriers).toEqual(['air']);
  });

  it.each([
    ['tank', 'restoration', 'drill'], ['air', 'restoration', 'seeder'],
    ['tank', 'predator', 'cannon'], ['air', 'predator', 'cannon'],
    ['tank', 'migration', 'broadcast'], ['air', 'migration', 'broadcast'],
  ] as const)('creates a valid %s / %s design with %s', (carrier, archetype, module) => {
    const g = initialVehicle(carrier, archetype), stats = vehicleStats(g);
    expect(validateVehicle(g)).toEqual([]);
    expect(g.parts.map(p => p.kind)).toEqual(['hull', 'cabin', carrier === 'tank' ? 'tracks' : 'rotor', module]);
    expect(stats.module).toBe(module); expect(stats.mass).toBeLessThanOrEqual(stats.capacity);
    expect(stats.power).toBeGreaterThan(0); expect(stats.speed).toBeGreaterThan(0); expect(stats.durability).toBeGreaterThan(0);
    expect(Object.values(stats).filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true);
    expect(validateVehicle(JSON.parse(JSON.stringify(g)))).toEqual([]);
  });

  it.each(['hull', 'cabin', 'tracks', 'drill'] as const)('requires the initial tank %s component', kind => {
    const g = initialVehicle('tank', 'restoration'); g.parts = g.parts.filter(p => p.kind !== kind);
    expect(validateVehicle(g)).toContain(kind === 'hull' ? C.hull : kind === 'cabin' ? C.cabin : kind === 'tracks' ? C.drive : C.module);
  });

  it.each(['tank', 'air'] as const)('requires exactly one compatible module on %s', carrier => {
    const g = initialVehicle(carrier, 'predator');
    expect(validateVehicle(attach(g, 'broadcast'))).toContain(C.module);
    expect(validateVehicle(attach(g, 'cannon'))).toContain(C.module);
    g.parts = g.parts.filter(p => vehiclePart(p.kind).category !== 'module');
    expect(validateVehicle(g)).toContain(C.module);
  });

  it.each([
    ['tank', 'rotor'], ['tank', 'seeder'], ['air', 'tracks'], ['air', 'drill'],
  ] as const)('refuses %s carrying %s', (carrier, forbidden) => {
    const g = attach(initialVehicle(carrier, 'migration'), forbidden);
    expect(validateVehicle(g)).toContain(C.carrier);
  });

  it('refuses duplicated required structures and mirrored hull/cabin', () => {
    for (const kind of ['hull', 'cabin', 'tracks'] as const) {
      expect(validateVehicle(attach(initialVehicle('tank', 'restoration'), kind)).length).toBeGreaterThan(0);
    }
    for (const kind of ['hull', 'cabin'] as const) {
      const g = initialVehicle('tank', 'restoration'); g.parts.find(p => p.kind === kind)!.mirrored = true;
      expect(validateVehicle(g)).toContain(C.carrier);
    }
  });

  it('limits armor count independently of available mass', () => {
    let g = initialVehicle('tank', 'restoration');
    for (let i = 0; i < 3; i++) g = attach(g, 'armor');
    expect(validateVehicle(g)).toEqual([]);
    g = attach(g, 'armor');
    expect(vehicleStats(g).mass).toBeLessThan(vehicleStats(g).capacity);
    expect(validateVehicle(g)).toContain(C.carrier);
  });

  it('accepts exact air capacity, rejects overweight, and gives tanks a larger capacity', () => {
    const air = attach(attach(initialVehicle('air', 'restoration'), 'armor'), 'armor');
    expect(vehicleStats(air).mass).toBe(vehicleStats(air).capacity);
    expect(validateVehicle(air)).toEqual([]);
    expect(validateVehicle(attach(air, 'armor'))).toContain(C.overweight);
    expect(vehicleStats(initialVehicle('tank', 'restoration')).capacity).toBeGreaterThan(vehicleStats(air).capacity);
  });
});

describe('vehicle prices and functional consequences', () => {
  it('prices full construction and never charges for name, color, pattern or attachment placement', () => {
    const g = initialVehicle('tank', 'restoration'), cosmetic = cloneBlueprint(g);
    expect(vehicleCost(g)).toBe(52);
    cosmetic.name = 'Jantarový průzkumník'; cosmetic.hue = 281; cosmetic.pattern = 2;
    cosmetic.parts.forEach((p, index) => { p.axial = index * .2; p.angle = -index * .4; });
    expect(validateVehicle(cosmetic)).toEqual([]);
    expect(vehicleCost(cosmetic)).toBe(vehicleCost(g)); expect(vehicleStats(cosmetic)).toEqual(vehicleStats(g));
  });

  it('prices scale and mirrored attachments without rounding away a fractional cost', () => {
    const base = initialVehicle('tank', 'predator'), scaled = cloneBlueprint(base), mirrored = cloneBlueprint(base);
    const cannon = scaled.parts.find(p => p.kind === 'cannon')!; cannon.scale = 1.5;
    mirrored.parts.find(p => p.kind === 'cannon')!.mirrored = true;
    expect(vehicleCost(base)).toBe(56); expect(vehicleCost(scaled)).toBe(66); expect(vehicleCost(mirrored)).toBe(68);
    cannon.scale = 1.01; expect(vehicleCost(scaled)).toBe(57);
    cannon.scale = .55; expect(vehicleCost(scaled)).toBe(47);
  });

  it('charges shape deviations in either direction', () => {
    const g = initialVehicle('tank', 'restoration');
    expect(vehicleCost({ ...g, length: 1.5 })).toBe(60);
    expect(vehicleCost({ ...g, length: .65 })).toBe(58);
    expect(vehicleCost({ ...g, width: 1.5 })).toBe(58);
    expect(vehicleCost({ ...g, width: .55 })).toBe(58);
  });

  it('makes armor increase durability and mass at the expense of speed', () => {
    const g = initialVehicle('tank', 'predator'), armored = attach(g, 'armor');
    const base = vehicleStats(g), changed = vehicleStats(armored);
    expect(changed.durability).toBeGreaterThan(base.durability); expect(changed.mass).toBeGreaterThan(base.mass);
    expect(changed.speed).toBeLessThan(base.speed); expect(changed.power).toBe(base.power);
  });

  it('makes module scale and mirroring increase power while retaining their mass tradeoff', () => {
    const g = initialVehicle('tank', 'predator'), base = vehicleStats(g);
    for (const change of [{ scale: 1.5 }, { mirrored: true }]) {
      const modified = cloneBlueprint(g); Object.assign(modified.parts.find(p => p.kind === 'cannon')!, change);
      const stats = vehicleStats(modified);
      expect(validateVehicle(modified)).toEqual([]);
      expect(stats.power).toBeGreaterThan(base.power); expect(stats.mass).toBeGreaterThan(base.mass);
      expect(stats.durability).toBeGreaterThan(base.durability); expect(stats.speed).toBeLessThan(base.speed);
    }
  });

  it.each(['tank', 'air'] as const)('makes a stronger %s drive faster, and missing drive stationary', carrier => {
    const g = initialVehicle(carrier, 'migration'), larger = cloneBlueprint(g);
    larger.parts.find(p => p.kind === (carrier === 'tank' ? 'tracks' : 'rotor'))!.scale = 1.5;
    expect(validateVehicle(larger)).toEqual([]); expect(vehicleStats(larger).speed).toBeGreaterThan(vehicleStats(g).speed);
    g.parts = g.parts.filter(p => p.kind !== (carrier === 'tank' ? 'tracks' : 'rotor'));
    expect(vehicleStats(g).speed).toBe(0); expect(validateVehicle(g)).toContain(C.drive);
  });

  it('makes larger chassis dimensions heavier and more durable but slower', () => {
    const g = initialVehicle('tank', 'restoration'), bigger = { ...g, length: 1.5, width: 1.25 };
    const base = vehicleStats(g), changed = vehicleStats(bigger);
    expect(validateVehicle(bigger)).toEqual([]);
    expect(changed.mass).toBeGreaterThan(base.mass); expect(changed.durability).toBeGreaterThan(base.durability);
    expect(changed.speed).toBeLessThan(base.speed); expect(changed.power).toBe(base.power);
  });
});

describe('strict saved vehicle shape', () => {
  it.each([null, [], 'vehicle', 1, new Date(), {}])('rejects a non-blueprint %s', value => {
    expect(validateVehicle(value).length).toBeGreaterThan(0);
  });

  it('requires every root and attachment key and refuses unknown fields without changing input', () => {
    const g = initialVehicle('tank', 'restoration');
    for (const key of Object.keys(g)) {
      const invalid = structuredClone(g) as unknown as Record<string, unknown>; delete invalid[key];
      expect(validateVehicle(invalid).length, key).toBeGreaterThan(0);
    }
    for (const key of Object.keys(g.parts[0])) {
      const invalid = structuredClone(g) as unknown as { parts: Record<string, unknown>[] }; delete invalid.parts[0][key];
      expect(validateVehicle(invalid).length, key).toBeGreaterThan(0);
    }
    for (const value of [{ ...g, budget: 999 }, { ...g, parts: [{ ...g.parts[0], cost: 0 }, ...g.parts.slice(1)] }]) {
      const before = structuredClone(value); expect(validateVehicle(value).length).toBeGreaterThan(0); expect(value).toEqual(before);
    }
  });

  it.each([
    ['version', 2], ['kind', 'organism'], ['carrier', 'boat'], ['carrier', 'space'],
    ['name', ''], ['name', '   '], ['name', 'bad\nname'], ['name', 'bad\u007fname'], ['name', 'x'.repeat(33)], ['name', 12],
    ['length', NaN], ['length', Infinity], ['length', .64], ['length', 2.41], ['length', '1'],
    ['width', .54], ['width', 1.81], ['hue', -1], ['hue', 361], ['hue', -Infinity],
    ['pattern', -.1], ['pattern', 4], ['pattern', 1.5], ['pattern', '1'],
    ['parts', null], ['parts', {}], ['parts', Array(3)], ['parts', []],
  ])('rejects invalid %s=%s', (key, value) => {
    expect(validateVehicle({ ...initialVehicle('tank', 'restoration'), [key as string]: value }).length).toBeGreaterThan(0);
  });

  it.each([
    ['id', ''], ['id', 'bad id'], ['id', 'x'.repeat(65)], ['kind', 'jet'], ['kind', '__proto__'],
    ['axial', -1.01], ['axial', 1.01], ['axial', NaN], ['angle', -Math.PI - .01], ['angle', Math.PI + .01],
    ['scale', .54], ['scale', 1.66], ['scale', Infinity], ['scale', '1'], ['mirrored', 1],
  ])('rejects malformed attachment %s=%s', (key, value) => {
    const g = initialVehicle('tank', 'restoration');
    expect(validateVehicle({ ...g, parts: [{ ...g.parts[0], [key as string]: value }, ...g.parts.slice(1)] }).length).toBeGreaterThan(0);
  });

  it('accepts inclusive shape/attachment bounds and rejects duplicate IDs or more than twelve attachments', () => {
    for (const [length, width, hue, pattern, axial, angle, scale] of [[.65, .55, 0, 0, -1, -Math.PI, .55], [2.4, 1.8, 360, 3, 1, Math.PI, 1.65]]) {
      const g = initialVehicle('tank', 'restoration'); Object.assign(g, { length, width, hue, pattern, name: 'x'.repeat(32) });
      Object.assign(g.parts[0], { axial, angle, scale, id: 'x'.repeat(64) });
      expect(validateVehicle(g)).toEqual([]);
    }
    const g = initialVehicle('tank', 'restoration');
    g.parts[1].id = g.parts[0].id; expect(validateVehicle(g)).toContain(C.attachments);
    const many = initialVehicle('tank', 'restoration');
    many.parts = Array.from({ length: 13 }, (_, i) => ({ ...many.parts[0], id: `part-${i}` }));
    expect(validateVehicle(many)).toContain(C.attachments);
  });
});

describe('construction quotes stay pure and enforce funds/unlocks', () => {
  it.each(['tank', 'air'] as const)('quotes the whole %s cost at the exact budget boundary without mutation', carrier => {
    const g = initialVehicle(carrier, 'restoration'), before = structuredClone(g), cost = vehicleCost(g);
    expect(quoteVehicle(g, cost, true)).toEqual({ ok: true, errors: [], cost, available: cost, remaining: 0 });
    expect(quoteVehicle(g, cost - 1, true)).toMatchObject({ ok: false, cost, remaining: -1, errors: [C.notEnough] });
    expect(quoteVehicle(g, cost + 3, true)).toMatchObject({ ok: true, cost, remaining: 3 });
    expect(g).toEqual(before);
  });

  it('distinguishes locked flight from insufficient funds and saved-design validity', () => {
    const air = initialVehicle('air', 'predator'), before = structuredClone(air), cost = vehicleCost(air);
    expect(validateVehicle(air)).toEqual([]);
    expect(quoteVehicle(air, cost, false)).toMatchObject({ ok: false, errors: [C.locked] });
    expect(quoteVehicle(air, cost - 1, false).errors).toEqual(expect.arrayContaining([C.locked, C.notEnough]));
    expect(quoteVehicle(initialVehicle('tank', 'predator'), 100, false).ok).toBe(true);
    expect(air).toEqual(before);
  });

  it.each([-1, NaN, Infinity, -Infinity])('rejects invalid funds %s without changing the design', available => {
    const g = initialVehicle('tank', 'restoration'), before = structuredClone(g);
    expect(quoteVehicle(g, available, true).ok).toBe(false); expect(g).toEqual(before);
  });

  it('rejects an invalid complete design even when funds and flight are available', () => {
    const g = initialVehicle('air', 'predator'); g.parts = g.parts.filter(p => p.kind !== 'cabin');
    const before = structuredClone(g);
    expect(quoteVehicle(g, 1000, true)).toMatchObject({ ok: false, errors: expect.arrayContaining([C.cabin]) });
    expect(g).toEqual(before);
  });

  it.each([null, [], { ...initialVehicle('tank', 'restoration'), parts: null }])('returns rejection instead of throwing while quoting malformed saved data', value => {
    const before = structuredClone(value);
    expect(() => quoteVehicle(value as unknown as VehicleBlueprint, 1000, true)).not.toThrow();
    expect(quoteVehicle(value as unknown as VehicleBlueprint, 1000, true).ok).toBe(false);
    expect(value).toEqual(before);
  });
});
