import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/simulation';
import { plantedStatus, journeyAction, journeyHint, initializeJourneyStage } from '../src/game/journey';
import { primaryInteraction, feedTarget, tendTarget } from '../src/game/interactions';
import { createWorld } from '../src/game/world';
import { JOURNEY_COPY } from '../src/game/journey-content';

describe('live ecological guidance', () => {
  it('retains an unfinished canopy while luring into open water, then yields to an observed nearby encounter', () => {
    const s = createGame(20260913, false); s.stage = 1; s.world = createWorld(s.seed, 1); s.worlds[1] = s.world; initializeJourneyStage(s);
    const canopy = s.journey.sites.find(site => site.id === 4)!, coral = s.journey.sites.find(site => site.id === 3)!;
    canopy.observed = true; canopy.plantedId = canopy.sourceId;
    // Native retreat after the lower planting: neither mother is close, and the
    // unobserved coral used to silently replace the player's ongoing work.
    s.player.pos = { x: 3.1316, y: -2.63, z: -24.5183 };
    expect(journeyHint(s)?.site.id).toBe(4);
    expect(journeyHint(s)?.text).toContain('krusta pod stropem');
    s.player.pos = { ...coral.source };
    expect(journeyHint(s)?.site.id).toBe(4);
    coral.observed = true;
    expect(journeyHint(s)?.site.id).toBe(3);
    const before = JSON.stringify(s); journeyHint(s); plantedStatus(s, canopy);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('identifies reachable ordinary food without presenting it as the distant mother culture', () => {
    const s = createGame(481516, false), site = s.journey.sites[0];
    s.world.obstacles = []; s.player.pos = { ...site.source, x: site.source.x + 6 };
    s.world.resources.push({ id: s.world.nextId++, pos: { ...s.player.pos }, kind: 'algae', amount: 5, max: 5, regen: 0, patch: 0 });
    expect(tendTarget(s)).toMatchObject({ kind: 'food', ready: true, priority: false });
    expect(journeyAction(s)).toMatchObject({ operation: 'take-food', ready: true });
    expect(primaryInteraction([feedTarget(s), tendTarget(s)])).toMatchObject({ kind: 'food', ready: true });
  });
  it('says that a rock blocks sampling instead of asking the player to get closer', () => {
    const s = createGame(481516, false), site = s.journey.sites[0];
    s.player.pos = { ...site.source, x: site.source.x + 3 };
    s.world.obstacles = [{ id: s.world.nextId++, kind: 'rock', pos: { ...site.source, x: site.source.x + 1.5, y: -5 }, radius: .7, height: 15 }];
    expect(journeyAction(s)).toMatchObject({ ready: false, detail: JOURNEY_COPY.blockedApproach });
  });
  it('distinguishes an existing plant from an unstarted task and reports real approaching grazers', () => {
    const s = createGame(481516, false), site = s.journey.sites[0];
    expect(plantedStatus(s, site)).toBeNull();
    site.plantedId = site.sourceId; s.world.creatures = s.world.creatures.filter(c => c.species === 'veil');
    const c = s.world.creatures[0]; expect(c).toBeDefined(); c.intent = 'forage'; c.target = site.sourceId;
    const status = plantedStatus(s, site)!;
    expect(status.title).toBe(JOURNEY_COPY.planted); expect(status.choices[0]).toBe(JOURNEY_COPY.approaching(1));
    site.resolved = true; expect(plantedStatus(s, site)).toBeNull();
  });
  it('reports a living threat only when its actual position exposes the plant', () => {
    const s = createGame(481516, false), site = s.journey.sites[0]; site.plantedId = site.sourceId;
    const hunter = s.world.creatures.find(c => c.species === 'needle')!; s.world.creatures = [hunter];
    hunter.pos = { ...site.source, x: site.source.x + 6 }; s.world.obstacles = [];
    expect(plantedStatus(s, site)!.text).toBe(JOURNEY_COPY.unsafePasture);
    s.world.obstacles = [{ id: s.world.nextId++, kind: 'rock', pos: { ...site.source, x: site.source.x + 3, y: -5 }, radius: 1, height: 15 }];
    expect(plantedStatus(s, site)!.text).toBe(JOURNEY_COPY.firstFeast);
  });
});
