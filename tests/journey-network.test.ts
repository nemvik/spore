import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/game/simulation';
import { livingStreams, streamEffect, streamPoint } from '../src/game/journey-network';
import { parseGame, serializeGame } from '../src/game/persistence';

const idle = { x: 0, z: 0, vertical: 0, sprint: false, feed: false, bond: false, tend: false, pulse: false };

function established() {
  const s = createGame(481516, false);
  for (const site of s.journey.sites.slice(0, 2)) { site.resolved = true; site.method = 'cultivate'; site.observed = true; site.phase = 4; site.plantedId = site.sourceId; }
  return s;
}

describe('useful living return routes', () => {
  it('produces no free support before a food web changes', () => {
    const s = createGame(481516, false); expect(livingStreams(s)).toEqual([]);
    expect(streamEffect(s, { x: 0, y: 1.1, z: 20 })).toEqual({ flow: { x: 0, y: 0, z: 0 }, nourishment: 0 });
  });
  it('restores weakened cargo along the actual green strand', () => {
    const s = established(), route = livingStreams(s).find(x => x.kind === 'nutrient')!;
    s.player.pos = streamPoint(route.from, route.to, .55); s.journey.cargo = { site: 2, kind: 'detritus', purpose: 'culture', vitality: 45, distance: 0 };
    expect(streamEffect(s, s.player.pos).nourishment).toBeGreaterThan(3.8);
    step(s, idle); expect(s.journey.cargo!.vitality).toBeGreaterThan(45);
  });
  it('carries toward the chosen landing and then toward its closest outlet', () => {
    const s = established(), routes = livingStreams(s).filter(x => x.kind === 'current');
    expect(routes).toHaveLength(2);
    for (const route of routes) {
      const pos = streamPoint(route.from, route.to, .5), effect = streamEffect(s, pos);
      const ahead = streamPoint(route.from, route.to, .51);
      expect(effect.flow.x * (ahead.x - pos.x) + effect.flow.z * (ahead.z - pos.z)).toBeGreaterThan(0);
    }
  });
  it('follows a moved living plant and disappears with its food supply', () => {
    const s = established(), site = s.journey.sites[0], r = s.world.resources.find(x => x.id === site.plantedId)!;
    r.pos = { x: -51, y: 1.1, z: -6 };
    expect(livingStreams(s)[0].from).toEqual(r.pos);
    r.amount = 0; expect(livingStreams(s).every(x => x.kind === 'current')).toBe(true);
  });
  it('is derived identically after saving and leaves legacy worlds untouched', () => {
    const s = established(), point = { x: 13, y: 1.1, z: 19 };
    expect(streamEffect(parseGame(serializeGame(s)), point)).toEqual(streamEffect(s, point));
    s.journey.legacy = true; expect(livingStreams(s)).toEqual([]);
  });
});
