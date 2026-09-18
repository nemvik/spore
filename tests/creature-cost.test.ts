import { describe, expect, it } from 'vitest';
import { creatureInvestment, upgradeCreatureGenome } from '../src/game/creature-body';
import { computeStats, genomeCost, initialGenome, mutationCost } from '../src/game/genome';
import { quoteJourneyEvolution } from '../src/game/journey-evolution';
import { createGame, evolve } from '../src/game/simulation';
import { creatureBodyFixture } from './fixtures/creature-bodies';

describe('creature construction investment', () => {
  it.each([[false, 38], [true, 60.8]] as const)('bills ordinary straight leg paired=%s with one final round', (mirrored, want) => {
    const g = creatureBodyFixture('biped');
    g.parts = [{ id: 'leg', kind: 'legs', axial: 0, angle: Math.PI / 2, scale: 1, mirrored, limb: {
      joints: [{ id: 'knee', offset: { x: 0, y: -.6, z: 0 }, radius: .12 }, { id: 'ankle', offset: { x: 0, y: -1.2, z: 0 }, radius: .12 }],
      end: { kind: 'foot', style: 'pad', scale: 1 },
    } }];
    // Catalogue 24 + two 4-DNA bones + 6-DNA foot; pair 1.6.
    expect(creatureInvestment(g)).toBeCloseTo(want, 10); expect(genomeCost(g)).toBe(Math.ceil(want));
    expect(computeStats(g).mass).toBeCloseTo(1 + (.11 + .08 + .08 + .05) * (mirrored ? 1.6 : 1), 10);
  });
  it('keeps fractional organ investments until the final round and salvages only half', () => {
    const old = creatureBodyFixture('biped');
    old.parts = [{ id: 'eye1', kind: 'eyes', axial: 0, angle: 0, scale: .61, mirrored: false },
      { id: 'eye2', kind: 'eyes', axial: .5, angle: 0, scale: .61, mirrored: false }];
    expect(creatureInvestment(old)).toBeCloseTo(14.64, 10); expect(genomeCost(old)).toBe(15);
    const next = structuredClone(old);
    next.parts = [{ id: 'jaw', kind: 'jaw', axial: 0, angle: 0, scale: 1, mirrored: false }];
    // Add 18, salvage 14.64 / 2: ceil(10.68) = 11. Reverse: ceil(14.64 - 9) = 6.
    expect(mutationCost(old, next)).toBe(11); expect(mutationCost(next, old)).toBe(6);
    next.parts = []; expect(mutationCost(old, next)).toBe(0);
  });
  it('charges radius tissue and leaves cosmetic edits free', () => {
    const g = creatureBodyFixture('biped'), larger = structuredClone(g);
    larger.parts.find(p => p.kind === 'legs')!.limb!.joints[0].radius += .05;
    expect(genomeCost(larger)).toBeGreaterThan(genomeCost(g));
    larger.parts = structuredClone(g.parts); larger.hue = 1; larger.pattern = 3;
    larger.body.skin = { finish: 'plated', secondaryHue: 3, contrast: 1, patternScale: 2 };
    expect(genomeCost(larger)).toBe(genomeCost(g)); expect(computeStats(larger)).toEqual(computeStats(g));
  });
  it('rounds only the complete investment and accounts for sampled shape and extra nodes', () => {
    const g = creatureBodyFixture('biped'); g.parts = [];
    g.length = 1.01; g.width = 1.01;
    g.body.spine.forEach(n => { n.width = 1.01; n.height = 1.01; n.bend = .01; });
    expect(creatureInvestment(g)).toBeCloseTo(.31, 10); expect(genomeCost(g)).toBe(1);
    g.body.spine.splice(1, 0, { ...g.body.spine[0], id: 'extra1', axial: -.8 });
    g.body.spine.splice(2, 0, { ...g.body.spine[0], id: 'extra2', axial: -.7 });
    expect(creatureInvestment(g)).toBeCloseTo(4.31, 10);
  });
  it('quotes exact learned capacity, rejects one DNA over and never mutates the player', () => {
    const s = createGame(123, false), g = creatureBodyFixture('biped'); s.stage = 2;
    s.player.totalDna = genomeCost(g) - 22; const before = structuredClone(s.player);
    expect(quoteJourneyEvolution(s, g)).toMatchObject({ ok: true, remaining: 0 }); expect(s.player).toEqual(before);
    s.player.totalDna--; expect(quoteJourneyEvolution(s, g)).toMatchObject({ ok: false, remaining: -1 });
  });
  it('does not earn DNA by repeated removal/addition or preview', () => {
    const s = createGame(123, false), g = creatureBodyFixture('biped'); s.stage = 2; s.player.totalDna = 500;
    const simple = structuredClone(g); simple.parts = simple.parts.filter(p => p.kind !== 'arms');
    for (let i = 0; i < 20; i++) {
      expect(quoteJourneyEvolution(s, simple).ok).toBe(true); expect(quoteJourneyEvolution(s, g).ok).toBe(true);
      expect(mutationCost(g, simple)).toBeGreaterThanOrEqual(0); expect(mutationCost(simple, g)).toBeGreaterThan(0);
    }
    expect(s.player.totalDna).toBe(500);
  });
  it('compares v1/v2 through explicit conversion and prices resampling without indexed-node assumptions', () => {
    const old = initialGenome(), converted = upgradeCreatureGenome(old);
    expect(mutationCost(old, converted)).toBe(0);
    converted.body.spine.splice(1, 0, { id: 'inserted', axial: -.75, width: 1, height: 1, bend: 0 });
    expect(mutationCost(old, converted)).toBe(2);
    converted.body.spine.forEach(n => { n.bend = .5; });
    expect(mutationCost(old, converted)).toBe(4);
  });
  it('retains the legacy six-DNA generation charge for a V2 body', () => {
    const s = createGame(123, true), g = creatureBodyFixture('biped');
    s.stage = 2; s.player.genome = g; s.player.dna = 100;
    s.player.pos = { ...s.world.landmarks.find(l => l.kind === 'nest')!.pos };
    expect(evolve(s, structuredClone(g))).toMatchObject({ ok: true, cost: 6 }); expect(s.player.dna).toBe(94);
  });
});
