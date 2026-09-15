import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, step, tryTransition } from '../src/game/simulation';
import { actOnJourney, journeyAction, journeyForageTarget, recordConsumption } from '../src/game/journey';
import { canopyForageTarget, releaseCanopyAfterMeal, stepCanopy } from '../src/game/reef-canopy';
import { livingStreams, reefWater, streamEffect, streamPoint } from '../src/game/journey-network';
import { reefConditions } from '../src/game/reef-layout';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT } from '../src/game/types';
import { obstacleSegmentEntry } from '../src/game/obstacle-geometry';
import { distance, groundHeight, horizontalDistance } from '../src/game/random';

function reef(seed = 20260913) {
  const s = createGame(seed, false);
  for (const site of s.journey.sites) { site.resolved = true; site.observed = true; site.method = 'cultivate'; site.phase = 4; }
  s.player.pos = { ...s.world.landmarks.find(l => l.kind === 'gate')!.pos };
  expect(tryTransition(s)).toBe(true);
  const site = s.journey.sites.find(site => site.id === 4)!;
  const crust = s.world.resources.find(r => r.id === s.journey.canopy!.crustId)!;
  return { s, site, crust };
}

describe('a living reef canopy changes the next expedition', () => {
  it.each([481516, 20260913, 8675309])('authors real roof and free body approaches without RNG or spawn timers on seed %i', seed => {
    const { s, site, crust } = reef(seed), w = s.world, canopy = s.journey.canopy!;
    expect(canopy.roofIds).toHaveLength(4);
    expect(w.obstacles.some(o => obstacleSegmentEntry(site.source, { ...site.source, y: 12 }, o, 1.44) !== null)).toBe(true);
    const route = [site.source, { x: site.source.x, y: site.source.y, z: site.source.z + 17 }, { x: site.source.x, y: 12, z: site.source.z + 17 }];
    for (let i = 1; i < route.length; i++) expect(w.obstacles.every(o => obstacleSegmentEntry(route[i - 1], route[i], o, 1.44) === null)).toBe(true);
    for (const p of [site.source, ...site.refuges]) {
      expect(p.y).toBeGreaterThanOrEqual(groundHeight(p.x, p.z, 1) + 1.3);
      expect(w.obstacles.every(o => p.y <= o.pos.y - 1.44 || p.y >= o.pos.y + o.height + 1.44 || horizontalDistance(p, o.pos) >= o.radius + 1.44)).toBe(true);
    }
    expect(crust.amount).toBe(1); expect(crust.regen).toBe(0);
    expect(w.creatures.filter(c => c.patch === 1 && c.species === 'mender').every(c => distance(c.pos, crust.pos) > 7)).toBe(true);
  });

  it('requires a compatible real bite; T observation and pickup do not detach the crust', () => {
    const { s, site, crust } = reef();
    s.player.pos = { ...site.source }; s.player.cooldown = 0;
    actOnJourney(s); s.player.cooldown = 0;
    expect(journeyAction(s)?.ready).toBe(false); actOnJourney(s);
    expect(s.journey.cargo).toBeNull(); expect(s.journey.canopy!.releasedAt).toBeNull();
    s.player.pos = { ...crust.pos, y: crust.pos.y - 1.4 }; s.player.cooldown = 0;
    step(s, { ...EMPTY_INPUT, feed: true, feedSelection: { stage: 1, kind: 'food', id: crust.id } });
    expect(crust.amount).toBe(0); expect(s.journey.canopy!.releasedAt).not.toBeNull();
    expect(s.world.obstacles.some(o => o.id === s.journey.canopy!.capId)).toBe(false);
    expect(s.player.meals).toBe(1);
  });

  it('lets a nearby wild worker remove the same attachment through its real meal', () => {
    const { s, crust } = reef(), worker = s.world.creatures.find(c => c.species === 'mender' && c.patch === 1)!;
    s.player.pos = { x: 0, y: 12, z: 0 };
    for (const hunter of s.world.creatures.filter(c => c.species === 'ribbon')) hunter.pos = { x: -70, y: 12, z: 60 };
    expect(canopyForageTarget(s, worker)).toBeNull();
    worker.pos = { ...crust.pos, y: crust.pos.y - 1.5 }; worker.hunger = 60;
    expect(journeyForageTarget(s, worker)?.id).toBe(crust.id);
    for (let tick = 0; tick < 90 && s.journey.canopy!.releasedAt === null; tick++) step(s, EMPTY_INPUT);
    expect(s.journey.canopy!.releasedAt).not.toBeNull(); expect(crust.amount).toBeCloseTo(.65);
    expect(worker.hunger).toBeLessThan(40);
  });

  it('keeps source, food and pickup aligned throughout unfurling without a collection timer', () => {
    const { s, site, crust } = reef(); site.observed = true;
    crust.amount = 0; expect(releaseCanopyAfterMeal(s, crust)).toBe(true);
    let previous = { ...site.source };
    for (let tick = 0; tick <= 720; tick++) {
      s.world.time = tick / 60; stepCanopy(s);
      expect(s.world.obstacles.every(o => obstacleSegmentEntry(previous, site.source, o, 1.44) === null)).toBe(true);
      previous = { ...site.source };
    }
    for (const seconds of [0, 2, 4, 7, 12]) {
      s.world.time = seconds; stepCanopy(s);
      expect(s.world.resources.find(r => r.id === site.sourceId)!.pos).toEqual(site.source);
      s.player.pos = { ...site.source }; s.player.cooldown = 0;
      expect(journeyAction(s)?.ready).toBe(true);
    }
    expect(site.source.y).toBeGreaterThan(7);
  });

  it('requires an actual safe grazer meal and makes the chosen live planting position matter', () => {
    const { s, site, crust } = reef(); site.observed = true; crust.amount = 0; releaseCanopyAfterMeal(s, crust);
    s.journey.cargo = { site: 4, kind: 'algae', purpose: 'culture', vitality: 93, distance: 0 };
    s.player.pos = { ...site.refuges[1] }; s.player.cooldown = 0; actOnJourney(s);
    expect(site.resolved).toBe(false); expect(livingStreams(s)).toEqual([]);
    const plant = s.world.resources.find(r => r.id === site.plantedId)!;
    const sail = s.world.creatures.find(c => c.species === 'sail' && c.patch === 1)!;
    for (const hunter of s.world.creatures.filter(c => c.species === 'ribbon')) hunter.pos = { x: -70, y: 12, z: 60 };
    recordConsumption(s, sail, plant);
    expect(site.resolved).toBe(true);
    const route = livingStreams(s)[0]; expect(route.from).toEqual(plant.pos); expect(route.to).toEqual(s.journey.sites.find(site => site.id === 5)!.source);
    const onRoute = streamPoint(route.from, route.to, .96), away = { ...onRoute, y: onRoute.y + 10 };
    expect(reefWater(s, onRoute).oxygenUse).toBeLessThan(reefConditions(s.world, onRoute).oxygenUse * .2);
    expect(reefWater(s, away).oxygenUse).toBe(reefConditions(s.world, away).oxygenUse);
    expect(Math.hypot(...Object.values(streamEffect(s, onRoute).flow))).toBeGreaterThan(2);
    expect(Math.hypot(...Object.values(streamEffect(s, away).flow))).toBe(0);
    plant.pos = { ...site.refuges[0] }; expect(livingStreams(s)[0].from).toEqual(site.refuges[0]);
    plant.amount = 0; expect(livingStreams(s)).toEqual([]);
  });

  it('continues the moving food, open roof and live stream deterministically after a normal save', () => {
    const { s, crust } = reef(); crust.amount = 0; releaseCanopyAfterMeal(s, crust);
    for (let i = 0; i < 80; i++) step(s, EMPTY_INPUT);
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s)); expect(loaded).toEqual(s);
    for (let i = 0; i < 120; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded).toEqual(s);
  });

  it('recovers local extinction through a real maternal meal, without remote spawning or duplicate larvae', () => {
    const { s, site, crust } = reef(); site.observed = true; crust.amount = 0; releaseCanopyAfterMeal(s, crust);
    s.world.creatures = s.world.creatures.filter(c => !(c.patch === 1 && c.species === 'sail'));
    const mother = s.world.resources.find(r => r.id === site.sourceId)!, amount = mother.amount, births = s.world.births, dna = s.player.dna;
    s.player.pos = { x: 0, y: 12, z: 0 }; actOnJourney(s);
    expect(s.world.births).toBe(births);
    s.player.pos = { ...site.source }; s.player.cooldown = 0;
    expect(journeyAction(s)).toMatchObject({ operation: 'awaken', ready: true }); actOnJourney(s);
    const larvae = s.world.creatures.filter(c => c.patch === 1 && c.species === 'sail');
    expect(larvae).toHaveLength(1); expect(distance(larvae[0].pos, site.source)).toBeLessThan(5);
    expect(mother.amount).toBe(amount - 1); expect(s.world.births).toBe(births + 1); expect(s.player.dna).toBe(dna);
    s.player.cooldown = 0; expect(journeyAction(s)?.operation).toBe('take'); actOnJourney(s);
    expect(s.world.creatures.filter(c => c.patch === 1 && c.species === 'sail')).toHaveLength(1);
    expect(site.resolved).toBe(false); makeCheckpoint(s); expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('uses donated algae when the maternal food web is depleted, never spawning from empty water', () => {
    const { s, site, crust } = reef(); site.observed = true; crust.amount = 0; releaseCanopyAfterMeal(s, crust);
    s.world.creatures = s.world.creatures.filter(c => !(c.patch === 1 && c.species === 'sail'));
    for (const r of s.world.resources) if (r.kind === 'algae' && distance(r.pos, site.source) < 4) r.amount = 0;
    s.player.pos = { ...site.source }; s.player.cooldown = 0;
    expect(journeyAction(s)).toMatchObject({ operation: 'awaken', ready: false }); actOnJourney(s);
    expect(s.world.creatures.some(c => c.patch === 1 && c.species === 'sail')).toBe(false);
    s.journey.cargo = { site: 4, kind: 'algae', purpose: 'food', vitality: 100, distance: 0 };
    expect(journeyAction(s)).toMatchObject({ operation: 'awaken', ready: true }); actOnJourney(s);
    expect(s.journey.cargo).toBeNull(); expect(s.world.creatures.filter(c => c.patch === 1 && c.species === 'sail')).toHaveLength(1);
    expect(site.resolved).toBe(false);
  });

  it('retains root-room water chemistry while its actual mother rises', () => {
    const { s, site, crust } = reef(); const p = { ...site.source }, before = reefWater(s, p);
    crust.amount = 0; releaseCanopyAfterMeal(s, crust); s.world.time = 12; stepCanopy(s);
    expect(site.source.y).toBeGreaterThan(p.y); expect(reefWater(s, p)).toEqual(before);
  });
});
