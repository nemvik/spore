import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { initializeJourneyStage } from '../src/game/journey';
import { reefWater } from '../src/game/journey-network';
import { reefConditions } from '../src/game/reef-layout';
import * as body from '../src/game/reef-body';
import type { GameState, Genome, Vec3 } from '../src/game/types';

function fixture() {
  const s = createGame(20260913, false, true, true);
  s.stage = 1; s.world = createWorld(s.seed, 1); s.worlds[1] = s.world; initializeJourneyStage(s);
  s.player.pos = { ...s.journey.sites.find(site => site.id === 5)!.source };
  s.world.obstacles = [];
  return s;
}

// This prepared scene has no living stream. Derive chemistry independently of
// the cache from the public body and authored water functions.
function uncached(s: GameState, pos: Vec3) {
  const profile = body.reefBodyProfile(s.player.genome, s.journey.reefEvolution!.pumping);
  const raw = reefConditions(s.world, pos, s.journey.sites.find(site => site.id === 4)!.sourceId).oxygenUse;
  const gap = Math.hypot(pos.x - s.player.pos.x, pos.y - s.player.pos.y, pos.z - s.player.pos.z);
  const core = Math.min(1.5, profile.filterRadius * .5);
  const weight = profile.filterRadius > 0 ? Math.min(1, Math.max(0, (profile.filterRadius - gap) / Math.max(.001, profile.filterRadius - core))) : 0;
  return raw * (1 - profile.purification * weight);
}

afterEach(() => vi.restoreAllMocks());

describe('reused reef water physiology', () => {
  it('does no body derivation while closed and shares one derivation across particle samples', () => {
    const s = fixture(), derive = vi.spyOn(body, 'reefBodyProfile'), before = JSON.stringify(s);
    for (let i = 0; i < 288; i++) reefWater(s, s.player.pos);
    expect(derive).not.toHaveBeenCalled();
    expect(JSON.stringify(s)).toBe(before);
    s.journey.reefEvolution!.pumping = .5;
    const pumpingState = JSON.stringify(s);
    for (let i = 0; i < 288; i++) reefWater(s, { ...s.player.pos, x: s.player.pos.x + i / 80 });
    expect(derive).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(s)).toBe(pumpingState);
    s.journey.reefEvolution!.pumping = .6; reefWater(s, s.player.pos);
    expect(derive).toHaveBeenCalledTimes(2);
    s.journey.reefEvolution!.pumping = 0; reefWater(s, s.player.pos);
    expect(derive).toHaveBeenCalledTimes(2);
  });

  it('observes every physical edit in place, including insertion, removal and reordered parts', () => {
    const s = fixture(); s.journey.reefEvolution!.pumping = 1;
    const g = s.player.genome, derive = vi.spyOn(body, 'reefBodyProfile');
    const edits: Array<(g: Genome) => void> = [
      g => { g.width = .7; }, g => { g.length = 1.4; },
      g => { g.parts[1].scale = 1.4; }, g => { g.parts[1].axial = -.6; },
      g => { g.parts[1].angle = Math.PI / 2; }, g => { g.parts[1].mirrored = true; },
      g => { g.parts[1].kind = 'gills'; }, g => { g.parts[1].kind = 'filter'; },
      g => { g.parts.push({ id: 'extra', kind: 'shell', scale: 1, axial: 0, angle: 1, mirrored: false }); },
      g => { g.parts.reverse(); }, g => { g.parts.pop(); },
    ];
    reefWater(s, s.player.pos);
    for (const edit of edits) {
      edit(g); derive.mockClear();
      const point = { ...s.player.pos, x: s.player.pos.x + 1.8 }, result = reefWater(s, point);
      expect(derive).toHaveBeenCalledTimes(1);
      reefWater(s, point); expect(derive).toHaveBeenCalledTimes(1);
      expect(result.oxygenUse).toBeCloseTo(uncached(s, point), 12);
    }
    derive.mockClear(); g.name = 'Nové jméno'; g.hue = 250; g.pattern = 2; g.parts[0].id = 'renamed';
    reefWater(s, s.player.pos); expect(derive).not.toHaveBeenCalled();
  });

  it('resamples moving water and player position without retaining mutable query outputs', () => {
    const s = fixture(); s.journey.reefEvolution!.pumping = 1;
    const point = { ...s.player.pos }, first = reefWater(s, point), expected = first.oxygenUse;
    expect(expected).toBeLessThan(reefConditions(s.world, point).oxygenUse);
    first.oxygenUse = -900; first.flow.x = -900;
    expect(reefWater(s, point).oxygenUse).toBe(expected);
    expect(reefWater(s, point).flow.x).not.toBe(-900);
    s.player.pos.x += 30;
    expect(reefWater(s, point).oxygenUse).toBeCloseTo(uncached(s, point), 12);
    expect(reefWater(s, point).oxygenUse).toBeGreaterThan(expected);
    s.world.time += 6;
    expect(reefWater(s, point).oxygenUse).toBeCloseTo(uncached(s, point), 12);
  });
});
