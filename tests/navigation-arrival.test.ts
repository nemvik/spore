import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { activeSites, actOnJourney, initializeJourneyStage, journeyForageTarget } from '../src/game/journey';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { distance, groundHeight } from '../src/game/random';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT } from '../src/game/types';
import type { AdaptationId, Stage } from '../src/game/types';

// Prepared route scenes on the unchanged authored tree geometry. They are not
// campaign evidence. No actors are repositioned after the ordinary steps begin.
function scene(dx: number, dz: number, heading?: number) {
  const s = createGame(20260913, false);
  for (let stage = 1; stage <= 2; stage++) {
    s.stage = stage as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.stage] = s.world; initializeJourneyStage(s);
  }
  const kinds: AdaptationId[] = ['jaw', 'legs', 'lungs', 'reservoir', 'symbiote'];
  s.player.genome = { ...s.player.genome, parts: [...s.player.genome.parts.filter(part => part.kind !== 'filter'), ...kinds.map(kind => ({ id: 'route-' + kind, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false }))] };
  s.player.totalDna = 200; s.player.dna = genomeCost(initialGenome()) + 200 - genomeCost(s.player.genome);
  s.player.health = computeStats(s.player.genome).maxHealth;
  s.player.bonds = Array.from({ length: 2 }, () => ({ species: 'gloom', benefit: 'recycle', hunger: 10, loyalty: 65, age: 1 }));
  const home = activeSites(s)[2]; home.observed = true;
  s.player.pos = { ...home.source }; s.player.cooldown = 0; actOnJourney(s);
  s.player.pos = { ...home.refuges[0] }; s.player.cooldown = 0; actOnJourney(s);
  s.world.creatures = []; s.journey.hunters = [];
  const root = s.world.resources.find(r => r.id === home.plantedId)!;
  const c = spawnCreature(s.world, 'gloom', 2);
  c.pos = { x: root.pos.x + dx, y: 0, z: root.pos.z + dz };
  c.pos.y = groundHeight(c.pos.x, c.pos.z, 2) + 1.2;
  Object.assign(c, { cooldown: 0, fear: 0, hunger: 0, health: 32, velocity: { x: 0, y: 0, z: 0 } });
  if (heading !== undefined) c.heading = heading;
  s.world.creatures = [c]; s.player.pos = { x: -40, y: groundHeight(-40, -60, 2) + 1.2, z: -60 };
  makeCheckpoint(s); parseGame(serializeGame(s));
  return { s, home, root, c };
}

describe('real arrival around the authored final-home trees', () => {
  it.each([[6, 4], [8, 7], [7, 3], [7, 6]])('routes a fed carrier from offset (%i,%i) into an actual root meal', (dx, dz) => {
    const { s, home, root, c } = scene(dx, dz);
    expect(s.world.obstacles.some(o => o.pos.x === -4.4 && o.pos.z === -53.5 && o.radius === 1.8)).toBe(true);
    expect(s.world.obstacles.some(o => Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) < o.radius + .48)).toBe(false);
    expect(journeyForageTarget(s, c)?.id).toBe(root.id);
    expect(c.hunger).toBe(0); expect(c.cooldown).toBe(0); expect(home.phase).toBe(3);
    let meal = false;
    for (let frame = 0; frame < 600 && home.phase < 5; frame++) {
      const before = { ...c.pos }, amount = root.amount;
      step(s, EMPTY_INPUT);
      // The fix must find a route, not snap the creature through the tree.
      expect(Math.hypot(c.pos.x - before.x, c.pos.z - before.z)).toBeLessThanOrEqual(3 / 60 + .00002);
      expect(s.world.obstacles.every(o => Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) >= o.radius + .48 - .00001)).toBe(true);
      if (root.amount < amount - .3) meal = true;
    }
    expect(meal).toBe(true); expect(home.phase).toBe(5);
    expect(distance(c.pos, root.pos)).toBeLessThan(2); expect(c.cooldown).toBeGreaterThan(0);
    expect(s.campaign).toMatchObject({ won: true, finale: 'migration' });
  });

  it('preserves the physical arrival across a mid-route checkpoint/save with a zero initial heading', () => {
    const { s, c, home } = scene(8, 7, 0);
    for (let frame = 0; frame < 45; frame++) step(s, EMPTY_INPUT);
    expect(home.phase).toBe(3); expect(c.target).toBe(home.plantedId);
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s);
    for (let frame = 0; frame < 600 && !s.campaign.won; frame++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(s.campaign).toMatchObject({ won: true, finale: 'migration' });
    expect(loaded).toEqual(s);
  });
});
