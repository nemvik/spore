import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { initializeJourneyStage, journeyHint } from '../src/game/journey';
import { ECOLOGY_COPY } from '../src/ui/ecology-copy.cs';
import { reefBodyProfile, reefBodyRespiration } from '../src/game/reef-body';
import { reefBodyEnabled, reefBodyComparison, reefBodyComparisonMarkup, reefFilterControl, reefOxygenTrend, REEF_COMPARISON_GAS } from '../src/ui/reef-body';

function fixture() {
  const s = createGame(20260913, false, true); s.stage = 1; s.world = createWorld(s.seed, 1);
  s.journey.reefEvolution = { version: 1, pumping: 0 };
  s.player.genome.parts.push({ id: 'reef-gills', kind: 'gills', axial: 0, angle: .8, scale: 1, mirrored: true });
  return s;
}

describe('reef body decision feedback', () => {
  it.each(['filter', 'lungs', 'neither'] as const)('gives vent cargo advice for %s anatomy without mutating the save', kind => {
    const s = fixture(); s.worlds[1] = s.world; initializeJourneyStage(s);
    s.journey.cargo = { site: 5, kind: 'mineral', purpose: 'culture', vitality: 75, distance: 0 };
    s.player.genome.parts = s.player.genome.parts.filter(part => !['filter', 'lungs'].includes(part.kind));
    if (kind !== 'neither') s.player.genome.parts.push({ id: 'advice', kind, axial: 1, angle: 0, scale: 1, mirrored: false });
    const before = JSON.stringify(s), advice = journeyHint(s)!;
    expect(advice.title).toBe('Křehký zárodek průduchu');
    expect(advice.choices[0]).toContain(kind === 'filter' ? 'Mezerník' : kind === 'lungs' ? 'Vzdušné komory' : 'krátký ponor');
    if (kind !== 'filter') expect(advice.choices[0]).not.toContain('filtr');
    expect(advice.choices[1]).toContain('horní opora');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('only warns about gas uptake through gills when those gills exist', () => {
    expect(ECOLOGY_COPY.water(5, true)).toContain('žábry');
    expect(ECOLOGY_COPY.water(5, false)).toBe(' · Plyn průduchu');
    expect(ECOLOGY_COPY.water(0, false)).toBe(ECOLOGY_COPY.water(0, true));
    expect(ECOLOGY_COPY.water(1, false)).toBe(ECOLOGY_COPY.water(1, true));
  });

  it('keeps pumping available without a food target and honestly reports exhaustion', () => {
    const s = fixture(); s.world.resources = []; s.world.creatures = []; s.player.energy = 3;
    expect(reefFilterControl(s)?.ready).toBe(true);
    s.journey.reefEvolution!.pumping = .8; expect(reefFilterControl(s)?.active).toBe(true);
    s.player.energy = 2; expect(reefFilterControl(s)?.ready).toBe(false);
    expect(reefFilterControl(s)?.detail).toContain('energii');
    s.player.genome.parts = s.player.genome.parts.filter(p => p.kind !== 'filter');
    expect(reefFilterControl(s)).toBeNull();
  });

  it('does not advertise reef mechanics in old campaigns or another medium', () => {
    const s = fixture(); delete s.journey.reefEvolution;
    expect(reefBodyEnabled(s)).toBe(false); expect(reefOxygenTrend(s, -2)).toBe('');
    s.journey.reefEvolution = { version: 1, pumping: 1 }; s.stage = 2;
    expect(reefBodyEnabled(s)).toBe(false); expect(reefFilterControl(s)).toBeNull();
    expect(reefBodyEnabled(s, 1)).toBe(true); // Same lineage's water editor preview.
    s.journey.legacy = true; expect(reefBodyEnabled(s, 1)).toBe(false);
  });

  it('compares the same genome through the shared motion and respiration contracts', () => {
    const s = fixture(), g = s.player.genome, before = JSON.stringify(s), c = reefBodyComparison(g, s.world);
    expect(c.closed.motion).toEqual(reefBodyProfile(g).motion);
    expect(c.open.motion.speed).toBeLessThan(c.closed.motion.speed);
    expect(c.clear).toBe(reefBodyRespiration(g, s.world, { x: 0, y: 0, z: 0 }, 1, 0));
    expect(c.cleanedGas).toBe(reefBodyRespiration(g, s.world, { x: 0, y: 0, z: 0 }, 1, REEF_COMPARISON_GAS * (1 - c.open.purification)));
    expect(c.cleanedGas).toBeGreaterThan(c.gas);
    const filter = g.parts.find(p => p.kind === 'filter')!;
    filter.scale = .6; const small = reefBodyComparison(g, s.world); filter.scale = 1.6; const large = reefBodyComparison(g, s.world);
    expect(large.open.motion.speed).toBeLessThan(small.open.motion.speed);
    expect(large.cleanedGas).toBeGreaterThan(small.cleanedGas);
    filter.scale = 1; expect(JSON.stringify(s)).toBe(before);
    expect(reefBodyComparisonMarkup(g, s.world)).toContain('energie/s');
  });

  it('compares water breathing from a land preview without changing the retained world', () => {
    const s = fixture(), water = reefBodyComparison(s.player.genome, s.world);
    s.world.stage = 2; const before = JSON.stringify(s.world);
    const preview = reefBodyComparison(s.player.genome, s.world);
    expect(preview.clear).toBe(water.clear); expect(preview.gas).toBe(water.gas);
    expect(JSON.stringify(s.world)).toBe(before);
  });

  it('labels measured oxygen change rather than promising refill at the capacity cap', () => {
    const s = fixture(); s.player.oxygen = 100;
    expect(reefOxygenTrend(s, 0)).toContain('plná');
    s.player.oxygen = 40;
    expect(reefOxygenTrend(s, -1.23)).toContain('↓ −1.2');
    expect(reefOxygenTrend(s, .82)).toContain('↑ +0.8');
    expect(reefOxygenTrend(s, 0)).toContain('drží');
  });
});
