import { describe, expect, it } from 'vitest';
import { ADAPTATIONS, cloneGenome, computeStats, genomeCost, getAdaptation, has, initialGenome, mutationCost, validateGenome, validateMutation } from '../src/game/genome';
import type { AdaptationId, Genome, Part } from '../src/game/types';

function attach(genome: Genome, kind: AdaptationId, overrides: Partial<Part> = {}): Genome {
  const next = cloneGenome(genome);
  next.parts.push({ id: `${kind}-${next.parts.length}`, kind, axial: 0, angle: 1, scale: 1, mirrored: false, ...overrides });
  return next;
}
const landGenome = () => attach(attach(initialGenome(), 'legs'), 'lungs');

describe('adaptation catalogue and phenotype', () => {
  it('contains 21 unique functional adaptations in all six categories', () => {
    expect(ADAPTATIONS).toHaveLength(21);
    expect(new Set(ADAPTATIONS.map((item) => item.id)).size).toBe(21);
    expect(new Set(ADAPTATIONS.map((item) => item.category)).size).toBe(6);
    for (const item of ADAPTATIONS) {
      expect(item.cost).toBeGreaterThan(0);
      expect(Number.isFinite(item.cost)).toBe(true);
      expect(item.description.length).toBeGreaterThan(15);
      expect(getAdaptation(item.id)).toEqual(item);
    }
  });
  it('starts with a mobile, affordable organism and basic diet', () => {
    const genome = initialGenome();
    const stats = computeStats(genome);
    expect(validateGenome(genome, 0)).toEqual([]);
    expect(genomeCost(genome)).toBe(22);
    expect(stats.speed).toBeGreaterThan(4);
    expect(stats.acceleration).toBeGreaterThan(6);
    expect(stats.diet).toEqual(['algae', 'detritus', 'mineral']);
    expect(stats.walk).toBe(0);
  });
  it('makes every adaptation alter a concrete gameplay statistic besides its ability id', () => {
    const naked = { ...initialGenome(), parts: [] };
    const { abilities: _, ...baseline } = computeStats(naked);
    for (const adaptation of ADAPTATIONS) {
      const result = computeStats(attach(naked, adaptation.id));
      expect(result.abilities).toContain(adaptation.id);
      const { abilities: __, ...numericAndDiet } = result;
      expect(numericAndDiet, adaptation.id).not.toEqual(baseline);
      expect(Object.values(result).filter((value) => typeof value === 'number').every(Number.isFinite)).toBe(true);
    }
  });
  it('applies locomotion, defense and maintenance tradeoffs', () => {
    const base = computeStats(initialGenome());
    const armored = computeStats(attach(initialGenome(), 'shell'));
    const fast = computeStats(attach(initialGenome(), 'jet'));
    const land = computeStats(landGenome());
    expect(armored.armor).toBeGreaterThan(base.armor);
    expect(armored.maxHealth).toBeGreaterThan(base.maxHealth);
    expect(armored.speed).toBeLessThan(base.speed);
    expect(armored.turn).toBeLessThan(base.turn);
    expect(fast.acceleration).toBeGreaterThan(base.acceleration);
    expect(fast.metabolism).toBeGreaterThan(base.metabolism);
    expect(land.walk).toBeGreaterThan(0);
    expect(land.swim).toBeLessThan(base.swim);
    expect(computeStats(attach(initialGenome(), 'reservoir')).moisture).toBeGreaterThan(base.moisture);
  });
  it('makes feeding specializations change available foods', () => {
    const naked = { ...initialGenome(), parts: [] };
    expect(computeStats(naked).diet).toEqual(['algae', 'detritus']);
    const predator = attach(naked, 'jaw');
    expect(computeStats(predator).diet).toEqual(['meat', 'detritus']);
    expect(computeStats(attach(predator, 'proboscis')).diet).toContain('nectar');
    expect(computeStats(attach(predator, 'recycler')).diet).toContain('mineral');
    expect(computeStats(attach(naked, 'filter')).diet).not.toContain('meat');
  });
  it('body proportions, part size and symmetry affect phenotype consistently', () => {
    const base = initialGenome();
    const widened = { ...base, width: 1.5 };
    expect(computeStats(widened).mass).toBeGreaterThan(computeStats(base).mass);
    expect(computeStats(widened).speed).toBeLessThan(computeStats(base).speed);
    const one = attach(base, 'fins');
    const pair = attach(base, 'fins', { mirrored: true });
    expect(computeStats(pair).turn).toBeGreaterThan(computeStats(one).turn);
    expect(genomeCost(pair)).toBeGreaterThan(genomeCost(one));
    const small = attach(base, 'fins', { scale: 0.6 });
    expect(computeStats(small).swim).toBeLessThan(computeStats(one).swim);
  });
  it('clones preserve identity but never share mutable parts', () => {
    const genome = initialGenome();
    const copy = cloneGenome(genome);
    copy.parts[0].scale = 1.5;
    expect(genome.parts[0].scale).toBe(1);
    expect(has(copy, 'flagellum')).toBe(true);
    expect(has(copy, 'jaw')).toBe(false);
  });
});

describe('strict genome validation', () => {
  it('accepts boundary values and rejects nonfinite, out of bounds or coercible fields', () => {
    const genome = initialGenome();
    expect(validateGenome({ ...genome, length: 0.65, width: 1.8, hue: 360, pattern: 3 }, 0)).toEqual([]);
    for (const [field, invalid] of [['length', NaN], ['length', Infinity], ['width', -1], ['hue', '120'], ['pattern', 1.5], ['version', 2], ['name', '\n'], ['name', 'x'.repeat(33)]]) {
      expect(validateGenome({ ...genome, [field as string]: invalid }, 0).length, String(field)).toBeGreaterThan(0);
    }
    for (const invalid of [null, [], 'genome', 1, new Date()]) expect(validateGenome(invalid, 0).length).toBeGreaterThan(0);
  });
  it('rejects unknown keys, missing fields, duplicate IDs and malformed parts', () => {
    const genome = initialGenome();
    expect(validateGenome({ ...genome, dna: 999 }, 0).length).toBeGreaterThan(0);
    const { hue: _, ...missing } = genome;
    expect(validateGenome(missing, 0).length).toBeGreaterThan(0);
    expect(validateGenome({ ...genome, parts: [...genome.parts, genome.parts[0]] }, 0).length).toBeGreaterThan(0);
    for (const value of [null, {}, { ...genome.parts[0], cost: -100 }, { ...genome.parts[0], scale: -1 }, { ...genome.parts[0], scale: Infinity }, { ...genome.parts[0], angle: 4 }, { ...genome.parts[0], axial: 2 }, { ...genome.parts[0], mirrored: 1 }, { ...genome.parts[0], kind: '__proto__' }]) {
      expect(validateGenome({ ...genome, parts: [value] }, 0).length).toBeGreaterThan(0);
    }
    expect(validateGenome({ ...genome, parts: Array(3) }, 0).length).toBeGreaterThan(0);
  });
  it('enforces unlock stages, attachment counts and incompatible mouths', () => {
    expect(validateGenome(attach(initialGenome(), 'fins'), 0).length).toBeGreaterThan(0);
    expect(validateGenome(attach(initialGenome(), 'fins'), 1)).toEqual([]);
    expect(validateGenome(attach(initialGenome(), 'jaw'), 0).join(' ')).toContain('vylučují');
    expect(validateGenome(attach(attach(initialGenome(), 'tail'), 'tail'), 1).length).toBeGreaterThan(0);
    let oversized: Genome = initialGenome();
    for (let i = 0; i < 18; i++) oversized = attach(oversized, 'flagellum');
    expect(validateGenome(oversized, 1).join(' ')).toContain('18');
  });
  it('requires both land movement and respiration for a terrestrial genome', () => {
    expect(validateGenome(initialGenome(), 2).join(' ')).toContain('končetiny');
    expect(validateGenome(attach(initialGenome(), 'legs'), 2).join(' ')).toContain('komory');
    expect(validateGenome(landGenome(), 1)).toEqual([]);
    expect(validateGenome(landGenome(), 2)).toEqual([]);
    const withoutLungs = landGenome();
    withoutLungs.parts = withoutLungs.parts.filter((part) => part.kind !== 'lungs');
    expect(validateMutation(landGenome(), withoutLungs, 2, 100).ok).toBe(false);
  });
});

describe('mutation economics', () => {
  it('prices additions, size and symmetry and displays budget shortfalls', () => {
    const base = initialGenome();
    const fins = attach(base, 'fins');
    expect(mutationCost(base, fins)).toBe(16);
    expect(validateMutation(base, fins, 1, 15)).toMatchObject({ ok: false, cost: 16 });
    expect(validateMutation(base, fins, 1, 16)).toEqual({ ok: true, errors: [], cost: 16 });
    expect(mutationCost(base, attach(base, 'fins', { mirrored: true }))).toBe(26);
    expect(mutationCost(base, attach(base, 'fins', { scale: 1.5 }))).toBe(24);
  });
  it('salvages half removed investment only within the same mutation and never refunds DNA', () => {
    const base = initialGenome();
    const predator = cloneGenome(base);
    predator.parts = predator.parts.filter((part) => part.kind !== 'filter');
    predator.parts.push({ id: 'jaw-new', kind: 'jaw', axial: 1, angle: 0, scale: 1, mirrored: false });
    expect(mutationCost(base, predator)).toBe(12); // 18 jaw minus half the 12 DNA filter.
    expect(mutationCost(predator, base)).toBe(3); // 12 filter minus half the 18 DNA jaw.
    const emptied = { ...base, parts: [] };
    expect(mutationCost(base, emptied)).toBe(0);
    expect(mutationCost(emptied, base)).toBe(22);
    let budget = 100;
    for (let i = 0; i < 5; i++) {
      budget -= mutationCost(base, predator);
      budget -= mutationCost(predator, base);
    }
    expect(budget).toBe(25);
  });
  it('charges shape changes in either direction, while cosmetic or placement changes are free', () => {
    const base = initialGenome();
    const wider = { ...base, width: 1.5 };
    expect(mutationCost(base, wider)).toBe(5);
    expect(mutationCost(wider, base)).toBe(5);
    const cosmetic = cloneGenome(base);
    cosmetic.hue = 45; cosmetic.name = 'Nová Luma'; cosmetic.pattern = 2;
    cosmetic.parts[0].axial = -0.5; cosmetic.parts[0].angle = 2;
    expect(mutationCost(base, cosmetic)).toBe(0);
  });
  it('refuses malformed genomes and budgets before trying to price them', () => {
    const base = initialGenome();
    const invalid = { ...base, parts: [{ ...base.parts[0], kind: 'missing' }] } as unknown as Genome;
    expect(validateMutation(base, invalid, 0, 20)).toMatchObject({ ok: false, cost: 0 });
    for (const budget of [-1, NaN, Infinity]) expect(validateMutation(base, base, 0, budget).ok).toBe(false);
    expect(validateMutation(invalid, base, 0, 20).ok).toBe(false);
  });
  it('shrinking parts cannot generate points and re-expanding pays the full difference', () => {
    const base = initialGenome();
    const smaller = cloneGenome(base);
    smaller.parts[0].scale = 0.6;
    expect(mutationCost(base, smaller)).toBe(0);
    expect(mutationCost(smaller, base)).toBe(4);
    expect(mutationCost(base, base)).toBe(0);
  });
});
