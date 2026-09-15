import { describe, expect, it } from 'vitest';
import { getClimate, landSiteSupport, livingLandNetwork } from '../src/game/climate';
import { actOnJourney, activeSites, initializeJourneyStage, journeyFinale, journeyHint, journeyRequirements, recordConsumption, stepJourney } from '../src/game/journey';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { cloneGenome, genomeCost, initialGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState, Vec3 } from '../src/game/types';
import type { EcologySite } from '../src/game/journey-types';

// Disclosed prepared land ecology. Tests use real planting and consumption
// callbacks, but do not claim human travel, combat skill or campaign duration.
function land() {
  const s = createGame(481516, false);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  s.player.genome = cloneGenome(s.player.genome); // Published genomes are immutable, including in prepared fixtures.
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `support-${kind}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false });
  s.player.totalDna = 100; s.player.dna = genomeCost(initialGenome()) + 100 - genomeCost(s.player.genome);
  s.world.creatures = []; s.campaign.drought = 1;
  return s;
}
function at(s: GameState, pos: Vec3) { s.player.pos = { ...pos }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.cooldown = 0; }
function plant(s: GameState, site: EcologySite, refuge = 0) {
  at(s, site.source); if (!site.observed) { actOnJourney(s); s.player.cooldown = 0; }
  actOnJourney(s); at(s, site.refuges[refuge]); actOnJourney(s);
  return s.world.resources.find(r => r.id === site.plantedId)!;
}
function learn(s: GameState, site: EcologySite) {
  const r = plant(s, site), native = spawnCreature(s.world, 'bell', site.patch);
  native.pos = { ...r.pos }; s.world.creatures.push(native); recordConsumption(s, native, r);
  expect(site.resolved).toBe(true); return r;
}

describe('ecological memory and ongoing living support are distinct', () => {
  it('restores a destroyed learned colony without duplicate rewards or dead resource accumulation', () => {
    const s = land(), site = activeSites(s)[0], r = learn(s, site);
    const reward = s.player.totalDna, echoes = [...s.journey.echoes], count = s.world.resources.length;
    site.vitality = 0; stepJourney(s, 1 / 60, s.player.pos, false);
    expect(landSiteSupport(s, site)).toBe(0); expect(site.resolved).toBe(true);
    expect(s.world.resources.some(x => x.id === r.id)).toBe(false);
    expect(journeyRequirements(s)[0]).toMatchObject({ met: false, value: 'poznáno · opora zanikla' });
    at(s, site.source); expect(journeyHint(s)?.title).toBe('Poznání zůstalo. Voda mizí.');
    const replacement = plant(s, site, 1); replacement.amount = 0;
    expect(landSiteSupport(s, site)).toBe(1); // Bare edible portions are not root death.
    expect(s.world.resources).toHaveLength(count); expect(s.player.totalDna).toBe(reward);
    expect(s.journey.echoes).toEqual(echoes); expect(site.method).toBe('guide');
  });

  it('checks new invaders, their actual appetite and location, not a past kill list', () => {
    const s = land(), site = activeSites(s)[0];
    Object.assign(site, { observed: true, resolved: true, method: 'hunt', phase: 4 });
    s.world.landmarks.find(l => l.id === 'spring-0')!.charge = 10;
    const native = spawnCreature(s.world, 'bell', 0); native.pos = { ...site.source }; s.world.creatures.push(native);
    expect(landSiteSupport(s, site)).toBe(1);
    const invader = spawnCreature(s.world, 'gnaw', 0); invader.pos = { ...site.source }; invader.hunger = 85; s.world.creatures.push(invader);
    expect(site.threatIds).not.toContain(invader.id); expect(landSiteSupport(s, site)).toBe(0);
    expect(getClimate(s).springs[0]).toMatchObject({ water: 0, protected: false });
    invader.hunger = 20; expect(landSiteSupport(s, site)).toBe(1);
    invader.hunger = 85; invader.pos.x += 14; expect(landSiteSupport(s, site)).toBe(1);
    s.world.creatures = [invader]; expect(landSiteSupport(s, site)).toBe(0); // Extinction is not selective relief.
  });

  it('does not finish restoration from two historical flags after one root dies', () => {
    const s = land(), [west, east, home] = activeSites(s);
    learn(s, west); learn(s, east); west.vitality = 0;
    expect(livingLandNetwork(s)).toBe(false);
    plant(s, home); expect(home.resolved).toBe(false); expect(journeyFinale(s)).toBeNull();
    stepJourney(s, 1 / 60, s.player.pos, false); expect(home.resolved).toBe(false);
    const carrier = spawnCreature(s.world, 'gloom', 2), homeFood = s.world.resources.find(r => r.id === home.plantedId)!;
    carrier.pos = { ...homeFood.pos }; s.world.creatures.push(carrier); recordConsumption(s, carrier, homeFood);
    expect(home.phase).toBe(5); expect(journeyFinale(s)).toBeNull();
    plant(s, west, 1); stepJourney(s, 1 / 60, s.player.pos, false);
    expect(livingLandNetwork(s)).toBe(true); expect(journeyFinale(s)).toBe('restoration');
    home.vitality = 0; expect(journeyFinale(s)).toBeNull();
  });

  it('round-trips a damaged support and its checkpoint, then evolves deterministically', () => {
    const s = land(), site = activeSites(s)[0]; learn(s, site); site.vitality = 64;
    at(s, site.source); expect(journeyHint(s)?.title).toBe('Živé kořeny · 64 %');
    at(s, s.world.landmarks[0].pos); makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s)), recovered = recoverGeneration(loaded);
    expect(getClimate(loaded)).toEqual(getClimate(s)); expect(getClimate(recovered)).toEqual(getClimate(s));
    for (let i = 0; i < 60; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded).toEqual(s); // The export envelope's savedAt is not simulation state.
  });

  it.each(['restoration', 'predator', 'migration'] as const)('preserves an already-earned %s climate even if live roots are lost', finale => {
    const s = land(), site = activeSites(s)[0]; learn(s, site);
    s.campaign.won = true; s.campaign.finale = finale; site.vitality = 0;
    expect(landSiteSupport(s, site)).toBe(1); expect(getClimate(s).springs[0]).toMatchObject({ water: 1, protected: true });
    expect(parseGame(serializeGame(s)).campaign).toEqual(s.campaign);
  });
});
