import { describe, expect, it } from 'vitest';
import { createGame, senseRange, step } from '../src/game/simulation';
import { actOnJourney, activeSites, initializeJourneyStage, journeyForageTarget } from '../src/game/journey';
import { createWorld, spawnCreature } from '../src/game/world';
import { shareMeal, hasActivePartner } from '../src/game/symbiosis';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT, type GameState, type Vec3 } from '../src/game/types';
import { distance } from '../src/game/random';

function action(s: GameState, pos: Vec3, offer = false) {
  s.player.pos = { ...pos }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.cooldown = 0;
  expect(actOnJourney(s, offer)).toBe(true);
}

describe('a food offer changes actual grazing rather than an objective counter', () => {
  it('draws a root-eating invader eighteen metres away and gives its roots respite after a real meal', () => {
    // Disclosed isolated AI scene: normal T/E and fixed NPC steps, no campaign claim.
    const s = createGame(481516, false);
    s.stage = 2; s.world = createWorld(s.seed, 2); s.worlds[2] = s.world; initializeJourneyStage(s);
    s.world.creatures = []; s.world.obstacles = [];
    const site = activeSites(s)[0];
    action(s, site.source); action(s, site.source); action(s, site.refuges[0]);
    const root = s.world.resources.find(r => r.id === site.plantedId)!;
    const gnaw = spawnCreature(s.world, 'gnaw', 0);
    Object.assign(gnaw, { pos: { ...root.pos }, hunger: 45, cooldown: 0, fear: 0 }); s.world.creatures.push(gnaw);
    expect(journeyForageTarget(s, gnaw)?.id).toBe(root.id);
    action(s, site.source);
    // An extinct planted pasture now offers real nursery care first. Keep its
    // newborn's digestion paused in this isolated invasive-feeding scene, then
    // sample the culture with the next ordinary T action.
    if (!s.journey.cargo) {
      const newborn = s.world.creatures.find(c => c.species === 'bell')!;
      newborn.cooldown = 30;
      action(s, site.source);
    }
    const destination = { ...root.pos, x: root.pos.x + 18 };
    s.player.heading = 0; action(s, { ...destination, z: destination.z + 2 }, true);
    const bait = s.world.resources.find(r => r.id === s.journey.offerings[0].id)!;
    expect(journeyForageTarget(s, gnaw)?.id).toBe(bait.id);
    s.player.pos = { ...s.world.landmarks[0].pos }; s.tick = 29;
    for (let i = 0; i < 600; i++) step(s, EMPTY_INPUT);
    expect(distance(gnaw.pos, bait.pos)).toBeLessThan(2);
    expect(bait.amount).toBeLessThan(5);
    expect(gnaw.hunger).toBeLessThan(28);
    expect(gnaw.intent).toBe('rest');
    expect(journeyForageTarget(s, gnaw)).toBeNull();
    expect(site.vitality).toBe(100); expect(site.resolved).toBe(false);
  });

  it('keeps diet and scent range constraints, and explains E with empty hands', () => {
    const s = createGame(481516, false), site = activeSites(s)[0];
    action(s, site.source); action(s, site.source); action(s, site.source, true);
    const offer = s.world.resources.find(r => r.id === s.journey.offerings[0].id)!;
    const lantern = spawnCreature(s.world, 'lantern', 0); lantern.pos = { ...offer.pos }; lantern.hunger = 85;
    expect(journeyForageTarget(s, lantern)).toBeNull();
    const veil = spawnCreature(s.world, 'veil', 0); veil.pos = { ...offer.pos, x: offer.pos.x + 40 }; veil.hunger = 85;
    expect(journeyForageTarget(s, veil)).toBeNull();
    expect(actOnJourney(s, true)).toBe(true); expect(s.messages.at(-1)?.text).toContain('Nejdřív vezmi kulturu');
    expect(s.journey.offerings).toHaveLength(1);
  });

  it('does not heal a damaged carried culture when its planting is recognized', () => {
    const s = createGame(481516, false), site = activeSites(s)[1];
    action(s, site.source); action(s, site.source); s.journey.cargo!.vitality = 37;
    action(s, site.refuges[0]);
    expect(site.resolved).toBe(true); expect(site.vitality).toBe(37);
  });
});

describe('species-specific care', () => {
  function family(legacy = false) {
    const s = createGame(481516, legacy);
    s.player.bonds = [
      { species: 'lantern', benefit: 'light', hunger: 80, loyalty: 50, age: 5 },
      { species: 'mender', benefit: 'shield', hunger: 80, loyalty: 50, age: 5 },
    ];
    return s;
  }
  it('restores a hungry lantern with detritus while minerals first restore only the shield partner', () => {
    const s = family(), blindRange = senseRange(s);
    expect(hasActivePartner(s, 'light')).toBe(false); expect(hasActivePartner(s, 'shield')).toBe(false);
    expect(shareMeal(s, 'algae')).toEqual([]); expect(s.player.bonds.map(b => b.hunger)).toEqual([80, 80]);
    expect(shareMeal(s, 'mineral')).toEqual(['mender']);
    expect(hasActivePartner(s, 'shield')).toBe(true); expect(senseRange(s)).toBe(blindRange);
    expect(shareMeal(s, 'detritus')).toEqual(['lantern', 'mender']);
    expect(senseRange(s)).toBe(blindRange + 16); expect(s.player.bonds.map(b => b.hunger)).toEqual([60, 40]);
  });
  it('preserves legacy universal meal sharing', () => {
    const s = family(true);
    expect(shareMeal(s, 'algae')).toEqual(['lantern', 'mender']);
    expect(s.player.bonds.map(b => b.hunger)).toEqual([60, 60]);
  });
  it('normal binding carries the wild creature’s appetite into the saved relationship', () => {
    const s = createGame(481516, false);
    s.player.genome.parts.push({ id: 'host', kind: 'symbiote', axial: 0, angle: 0, scale: .55, mirrored: false });
    // Keep this prepared host's construction accounting valid for the save round trip.
    s.player.dna = 4;
    const lantern = spawnCreature(s.world, 'lantern', 2); lantern.pos = { ...s.player.pos }; lantern.hunger = 83;
    s.world.creatures = [lantern]; step(s, { ...EMPTY_INPUT, bond: true });
    expect(s.player.bonds).toHaveLength(1); expect(s.player.bonds[0].hunger).toBeCloseTo(83, 1);
    const loaded = parseGame(serializeGame(s));
    expect(loaded.player.bonds).toEqual(s.player.bonds);
    expect(hasActivePartner(loaded, 'light')).toBe(false);
  });
});
