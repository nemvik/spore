import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { initializeJourneyStage, journeyAction, journeyRequirements } from '../src/game/journey';
import { getClimate, hydrationAt, livingLandNetwork } from '../src/game/climate';
import { cloneGenome, computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { organismGroundClearance, speciesGroundClearance } from '../src/game/anatomy';
import { speciesById } from '../src/game/content';
import { SITE_STORIES } from '../src/game/journey-content';
import { groundHeight, horizontalDistance } from '../src/game/random';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState, Resource } from '../src/game/types';

/** Explicitly prepared open-ground encounters, not native campaign evidence.
 * All visited worlds/source references remain save-valid. After this setup,
 * actor positions, hunger, food, tissue and health change only through step(). */
function scene({ enabled = true, siteId = 6, gloom = false, killer = false, vitality = 100, hunger = 70, drought = 0 }: {
  enabled?: boolean; siteId?: 6 | 7; gloom?: boolean; killer?: boolean; vitality?: number; hunger?: number; drought?: number;
} = {}) {
  const s = createGame(8675309, false, enabled);
  s.id = 'root-dispersal-simulation';
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world; initializeJourneyStage(s);
  }
  const site = s.journey.sites.find(site => site.id === siteId)!;
  s.world.obstacles = [];
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.stage === 2 && site.sourceId === r.id));
  s.world.creatures = []; s.journey.hunters = [];
  s.world.patches.forEach(patch => { patch.discovered = true; });
  const mother: Resource = { id: s.world.nextId++, kind: SITE_STORIES[siteId].kind,
    pos: { x: -8, y: groundHeight(-8, -42, 2) + .3, z: -42 }, amount: .6, max: 12, regen: 0, patch: site.patch };
  s.world.resources.push(mother);
  Object.assign(site, { plantedId: mother.id, observed: true, phase: 3, vitality });
  const carrier = spawnCreature(s.world, 'gnaw', site.patch);
  Object.assign(carrier, { pos: { ...mother.pos, y: groundHeight(-8, -42, 2) + speciesGroundClearance(speciesById('gnaw')) },
    velocity: { x: 0, y: 0, z: 0 }, health: killer ? 1 : 32, hunger, cooldown: 0, fear: 0, intent: 'forage', target: mother.id });
  s.world.creatures.push(carrier);
  const walker = cloneGenome(initialGenome());
  walker.parts.push({ id: 'legs', kind: 'legs', axial: -.1, angle: 1.25, scale: 1, mirrored: true },
    { id: 'lungs', kind: 'lungs', axial: .2, angle: 0, scale: 1, mirrored: false });
  if (killer) walker.parts.push({ id: 'toxin', kind: 'toxin', axial: 0, angle: 0, scale: 1, mirrored: false });
  const x = killer ? -3 : 10;
  Object.assign(s.player, { genome: walker, pos: { x, y: groundHeight(x, -42, 2) + organismGroundClearance(walker), z: -42 },
    velocity: { x: 0, y: 0, z: 0 }, heading: Math.PI / 2, health: computeStats(walker).maxHealth,
    energy: 100, moisture: 100, invulnerable: 0, cooldown: 0, totalDna: 500, dna: genomeCost(initialGenome()) + 500 - genomeCost(walker) });
  s.journey.cargo = { purpose: 'food', kind: 'algae', site: siteId, vitality: 100, distance: 0 };
  s.campaign.drought = drought;
  let moth = null;
  if (gloom) {
    moth = spawnCreature(s.world, 'gloom', 2);
    Object.assign(moth, { pos: { x: 7, y: groundHeight(7, -42, 2) + speciesGroundClearance(speciesById('gloom')), z: -42 },
      velocity: { x: 0, y: 0, z: 0 }, health: 20, hunger: 0, cooldown: 0, fear: 0, intent: 'rest', target: null });
    s.world.creatures.push(moth);
  }
  makeCheckpoint(s);
  return { s, site, mother, carrier, moth };
}

function offer(s: GameState) {
  expect(journeyAction(s, true)).toMatchObject({ operation: 'offer', ready: true });
  step(s, { ...EMPTY_INPUT, offer: true });
  return s.world.resources.find(r => r.id === s.journey.offerings.at(-1)!.id)!;
}

function awaitRoot(s: GameState, alongside?: GameState) {
  for (let frame = 0; frame < 1200 && !s.journey.rootDispersal?.roots.length; frame++) {
    step(s, EMPTY_INPUT); if (alongside) step(alongside, EMPTY_INPUT);
  }
  expect(s.journey.rootDispersal?.roots).toHaveLength(1);
  return s.world.resources.find(r => r.id === s.journey.rootDispersal!.roots[0].resourceId)!;
}

describe('root fragments through actual simulation meals', () => {
  it('transfers one real maternal bite, then an E lure and physical second meal plant water across a habitat boundary', () => {
    const { s, site, mother, carrier } = scene(), initialId = s.world.nextId;
    const charges = s.world.landmarks.filter(l => l.kind === 'spring').map(l => l.charge);
    step(s, EMPTY_INPUT);
    expect(mother.amount).toBeCloseTo(.25); expect(site.vitality).toBe(88);
    expect(s.journey.rootDispersal!.carried).toEqual([{ carrierId: carrier.id, site: 6, origin: mother.pos, vitality: 12 }]);
    expect(s.journey.rootDispersal!.roots).toHaveLength(0); expect(s.world.nextId).toBe(initialId);
    const offered = offer(s), beforeTravel = { ...carrier.pos }, root = awaitRoot(s);
    expect(horizontalDistance(carrier.pos, beforeTravel)).toBeGreaterThan(8);
    expect(horizontalDistance(carrier.pos, offered.pos)).toBeLessThan(2);
    expect(offered.amount).toBeCloseTo(.65); expect(root.pos).toEqual(carrier.pos);
    expect(root).toMatchObject({ kind: mother.kind, amount: 1, max: 1, regen: 0, patch: 1 });
    expect(root.patch).not.toBe(mother.patch);
    expect(s.journey.rootDispersal!.carried).toHaveLength(0);
    expect(s.journey.rootDispersal!.roots).toEqual([{ resourceId: root.id, site: 6, vitality: 12 }]);
    expect(site.vitality).toBe(88); expect(hydrationAt(s, root.pos)).toBeCloseTo(1.08);
    expect(getClimate(s).rootPockets!.find(p => p.id === `rootlet-${root.id}`)).toMatchObject({ radius: 2.1, water: .12 });
    expect(s.world.landmarks.filter(l => l.kind === 'spring').map(l => l.charge)).toEqual(charges);
    expect(livingLandNetwork(s)).toBe(false); expect(journeyRequirements(s).every(r => !r.met)).toBe(true);
    expect(s.campaign.won).toBe(false); expect(s.world.nextId).toBe(initialId + 2);
    expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('does not create twelve tissue points from a five-point mother and keeps the resulting weak water below the carrier-healing threshold', () => {
    const { s, site, mother } = scene({ siteId: 7, vitality: 5 });
    step(s, EMPTY_INPUT);
    expect(site.vitality).toBe(0); expect(site.plantedId).toBeNull();
    expect(s.world.resources).not.toContain(mother);
    expect(s.journey.rootDispersal!.carried[0].vitality).toBe(5);
    offer(s); const root = awaitRoot(s);
    expect(s.journey.rootDispersal!.roots[0].vitality).toBe(5);
    expect(hydrationAt(s, root.pos)).toBeCloseTo(.45);
    expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('loses carried tissue when the actual toxin action kills its carrier', () => {
    const { s, carrier, site } = scene({ killer: true });
    step(s, EMPTY_INPUT); expect(s.journey.rootDispersal!.carried).toHaveLength(1);
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(s.world.creatures).not.toContain(carrier); expect(s.player.kills).toBe(1);
    expect(site.vitality).toBe(88); expect(s.journey.rootDispersal).toMatchObject({ carried: [], roots: [] });
    expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('lets the same hungry invasive later destroy its real child meal without making a grandchild', () => {
    const { s, site } = scene({ hunger: 100 }); step(s, EMPTY_INPUT); offer(s); const root = awaitRoot(s), afterPlant = s.world.nextId;
    for (let frame = 0; frame < 1800 && s.world.resources.includes(root); frame++) step(s, EMPTY_INPUT);
    expect(root.amount).toBeCloseTo(.65);
    expect(s.world.resources).not.toContain(root); expect(s.journey.rootDispersal).toMatchObject({ carried: [], roots: [] });
    expect(s.world.nextId).toBe(afterPlant); expect(site.vitality).toBe(88);
    expect(hydrationAt(s, root.pos)).toBe(0); expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('heals an actual nearby wild moth through newly dispersed water while the same dry control continues losing health', () => {
    const wet = scene({ siteId: 7, gloom: true, drought: 1 }), dry = scene({ siteId: 7, gloom: true, enabled: false, drought: 1 });
    step(wet.s, EMPTY_INPUT); step(dry.s, EMPTY_INPUT);
    offer(wet.s); offer(dry.s); const root = awaitRoot(wet.s, dry.s);
    expect(horizontalDistance(wet.moth!.pos, root.pos)).toBeLessThan(2.1);
    const beforeWet = wet.moth!.health, beforeDry = dry.moth!.health;
    for (let frame = 0; frame < 180; frame++) { step(wet.s, EMPTY_INPUT); step(dry.s, EMPTY_INPUT); }
    expect(wet.moth!.health).toBeGreaterThan(beforeWet + 5.9);
    expect(dry.moth!.health).toBeLessThan(beforeDry - 1.7);
    expect(wet.s.journey.rootDispersal!.roots).toHaveLength(1); expect(dry.s.journey).not.toHaveProperty('rootDispersal');
    expect(wet.s.campaign.won).toBe(false); expect(dry.s.campaign.won).toBe(false);
  });

  it('continues the same real carrying and meal sequence after strict save/checkpoint roundtrip', () => {
    const { s } = scene(); step(s, EMPTY_INPUT); makeCheckpoint(s);
    const restored = parseGame(serializeGame(s));
    expect(restored).toEqual(s); expect(JSON.parse(restored.checkpoint!).journey.rootDispersal.carried).toHaveLength(1);
    offer(s); offer(restored); awaitRoot(s, restored);
    for (let frame = 0; frame < 90; frame++) { step(s, EMPTY_INPUT); step(restored, EMPTY_INPUT); }
    expect(restored).toEqual(s); expect(restored.rng).toBe(s.rng);
    expect(parseGame(serializeGame(restored))).toEqual(s);
  });
});
