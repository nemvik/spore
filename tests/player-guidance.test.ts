import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { actOnJourney, initializeJourneyStage, journeyAction } from '../src/game/journey';
import { journeyGuide, targetLocation } from '../src/ui/journey-guide';
import { oxygenGuidance } from '../src/ui/oxygen';

describe('concrete quest guidance', () => {
  it.each([67, 481516, 8675309])('follows source → observe → take → plant → visitor for seed %s', seed => {
    const s = createGame(seed, false, true, true, true), site = s.journey.sites[0];
    const before = JSON.stringify(s), start = journeyGuide(s)!;
    expect(start.title).toBe('Zahrada a hladoví hosté'); expect(start.step).toContain('1 ·'); expect(start.target).toEqual(site.source);
    expect(start.instruction).toContain('T'); expect(start.done).toContain('Závojník'); expect(JSON.stringify(s)).toBe(before);
    s.player.pos = { ...site.source }; expect(actOnJourney(s)).toBe(true);
    expect(journeyGuide(s)?.step).toContain('2 ·');
    s.player.cooldown = 0; expect(actOnJourney(s)).toBe(true); expect(s.journey.cargo?.purpose).toBe('culture');
    const carried = journeyGuide(s)!; expect(carried.step).toContain('3 ·'); expect(site.refuges).toContainEqual(carried.target);
    s.player.pos = { ...carried.target! }; s.player.cooldown = 0; expect(actOnJourney(s)).toBe(true);
    expect(s.journey.cargo).toBeNull(); expect(journeyGuide(s)?.step).toContain('4 ·');
    site.resolved = true; expect(journeyGuide(s)?.step).not.toContain('4 ·');
  });
  it('does not mistake a carried meal for a plantable culture', () => {
    const s = createGame(67, false); s.journey.cargo = { site: 0, purpose: 'food', kind: 'algae', vitality: 100, distance: 0 };
    expect(journeyGuide(s)?.step).toBe('Neseš běžné sousto'); expect(journeyGuide(s)?.instruction).toContain('E');
  });
  it('explains weak cultures and sends the player back to the source', () => {
    const s = createGame(67, false); s.journey.cargo = { site: 0, purpose: 'culture', kind: 'algae', vitality: 19, distance: 0 };
    expect(journeyGuide(s)?.step).toBe('Vezmi nový vzorek'); expect(journeyGuide(s)?.target).toEqual(s.journey.sites[0].source);
  });
  it('does not tell the player to take the final culture before its prerequisites', () => {
    const s = createGame(67, false), site = s.journey.sites[2]; site.observed = true; s.player.pos = { ...site.source };
    expect(journeyGuide(s)?.step).toContain('Nejdřív'); expect(journeyGuide(s)?.target).toEqual(s.journey.sites[0].source);
  });
  it('omits organism objectives for other eras and preserves legacy modes', () => {
    const s = createGame(67); expect(journeyGuide(s)).toBeNull(); s.journey.legacy = false; s.stage = 3; expect(journeyGuide(s)).toBeNull();
  });
  it('uses world compass directions and adds the real vertical control', () => {
    expect(targetLocation({ x: 0, y: 0, z: 0 }, { x: -30, y: 8, z: -20 })).toContain('severozápad');
    expect(targetLocation({ x: 0, y: 0, z: 0 }, { x: -30, y: 8, z: -20 })).not.toContain('Q');
    expect(targetLocation({ x: 0, y: 0, z: 0 }, { x: -30, y: 8, z: -20 }, true)).toContain('Q ↑');
  });
  it('requires a canopy visitor and describes an actual nursery action before sampling', () => {
    const s = createGame(67, false, true, true); s.stage = 1; s.world = createWorld(67, 1); s.worlds[1] = s.world; initializeJourneyStage(s);
    const site = s.journey.sites.find(site => site.id === 4)!;
    site.observed = true; s.journey.canopy!.releasedAt = 0; s.player.pos = { ...site.source }; s.world.obstacles = [];
    expect(journeyGuide(s)?.done).toContain('Plachtovec'); expect(journeyGuide(s)?.done).toContain('boční');
    s.world.creatures = s.world.creatures.filter(c => c.species !== 'sail' || c.patch !== 1);
    expect(journeyAction(s)?.operation).toBe('awaken');
    expect(journeyGuide(s)?.step).toBe('Obnov místní druh'); expect(journeyGuide(s)?.instruction).toMatch(/zárodek|plachtovce/);
  });
});

describe('oxygen is a body reserve, not water quality', () => {
  function reef() {
    const s = createGame(67, false, true, true, true); s.stage = 1; s.world = createWorld(67, 1); s.worlds[1] = s.world; initializeJourneyStage(s);
    s.player.pos = { x: -65, y: 6, z: -65 }; s.player.oxygen = 60; return s;
  }
  it('explains depletion without gills even in clear water', () => {
    const s = reef(), guide = oxygenGuidance(s, -1)!;
    expect(guide.label).toBe('ZÁSOBA DECHU'); expect(guide.trend).toBe('Ubývá'); expect(guide.reason).toContain('spotřebováváš'); expect(guide.help).toContain('Q');
  });
  it('shows refill, surface and critical escape instructions', () => {
    const s = reef(); s.player.pos.y = 11;
    expect(oxygenGuidance(s, 6)?.reason).toContain('hladiny'); expect(oxygenGuidance(s, 6)?.trend).toBe('Doplňuje se');
    s.player.oxygen = 100; expect(oxygenGuidance(s, 0)?.trend).toBe('Plná zásoba');
    s.player.pos.y = 6; s.player.oxygen = 12; expect(oxygenGuidance(s, -1)).toMatchObject({ low: true }); expect(oxygenGuidance(s, -1)?.help).toContain('0 %');
  });
  it('does not display a breathing objective in the micro world or on land', () => {
    const s = createGame(67, false); expect(oxygenGuidance(s, -1)).toBeNull(); s.stage = 2; expect(oxygenGuidance(s, -1)).toBeNull();
  });
  it('explains root refill and never promises an exhausted nest refill', () => {
    const s = reef(), site = s.journey.sites.find(site => site.id === 4)!;
    site.plantedId = site.sourceId; s.player.pos = { ...s.world.resources.find(r => r.id === site.plantedId)!.pos };
    expect(oxygenGuidance(s, 4.5)?.reason).toContain('Kořeny');
    s.player.pos = { ...s.world.landmarks.find(l => l.kind === 'nest')!.pos }; s.player.energy = 10;
    expect(oxygenGuidance(s, -.4)?.reason).not.toContain('Kolébka');
    s.player.energy = 20; expect(oxygenGuidance(s, 4)?.reason).toContain('Kolébka');
    s.player.pos.y = 11; s.player.oxygen = 12; expect(oxygenGuidance(s, 6)?.help).toContain('počkej');
  });
});
