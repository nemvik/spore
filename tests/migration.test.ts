import { describe, expect, it } from 'vitest';
import { speciesGroundClearance } from '../src/game/anatomy';
import { hydrationAt, livingLandNetwork } from '../src/game/climate';
import { speciesById } from '../src/game/content';
import { cloneGenome, genomeCost, initialGenome } from '../src/game/genome';
import { lineBlocked } from '../src/game/interactions';
import { actOnJourney, activeSites, initializeJourneyStage, journeyAction, journeyFinale, journeyHint, journeyRequirements, stepJourney } from '../src/game/journey';
import { carrierFearDistance, carrierHealthRate, migrationActive, migrationTarget, wildCarriers } from '../src/game/migration';
import { parseGame, serializeGame } from '../src/game/persistence';
import { distance, groundHeight, horizontalDistance } from '../src/game/random';
import { createGame, makeCheckpoint, recoverGeneration, step, tryWin } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';
import type { AdaptationId, GameState, Vec3 } from '../src/game/types';
import type { EcologySite } from '../src/game/journey-types';
import { createWorld, spawnCreature } from '../src/game/world';

// Explicit prepared scenes isolate migration causality. Previous stages and all
// authored source resources remain valid saved worlds. Creature/obstacle removal
// and initial actor placement are fixture setup, not evidence of human travel,
// combat success, earned evolution or campaign duration. After setup, route and
// feeding assertions advance the actual simulation without moving the carrier.
function land(parts: AdaptationId[] = []) {
  const s = createGame(481516, false);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  s.player.genome = cloneGenome(s.player.genome);
  if (parts.includes('jaw')) s.player.genome.parts = s.player.genome.parts.filter(part => part.kind !== 'filter');
  for (const kind of ['legs', 'lungs', ...parts] as AdaptationId[]) {
    s.player.genome.parts.push({ id: `migration-${kind}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false });
  }
  s.player.totalDna = 300; s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  s.world.creatures = []; s.world.obstacles = [];
  const sources = new Set(activeSites(s).map(site => site.sourceId));
  s.world.resources = s.world.resources.filter(r => sources.has(r.id));
  s.campaign.drought = 1;
  return s;
}
function at(s: GameState, pos: Vec3) {
  s.player.pos = { ...pos }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.cooldown = 0;
}
function point(x: number, z: number, species = 'gloom'): Vec3 {
  return { x, y: groundHeight(x, z, 2) + speciesGroundClearance(speciesById(species)), z };
}
function carrier(s: GameState, pos: Vec3) {
  const c = spawnCreature(s.world, 'gloom', 2);
  Object.assign(c, { pos: point(pos.x, pos.z), hunger: 0, cooldown: 0, intent: 'rest', target: null, velocity: { x: 0, y: 0, z: 0 } });
  s.world.creatures.push(c); return c;
}
function take(s: GameState, site = activeSites(s)[2]) {
  at(s, site.source);
  if (!site.observed) { expect(journeyAction(s)?.operation).toBe('observe'); actOnJourney(s); s.player.cooldown = 0; }
  expect(journeyAction(s)).toMatchObject({ operation: 'take', ready: true }); actOnJourney(s);
  expect(s.journey.cargo).toMatchObject({ site: site.id, purpose: 'culture' });
}
function plant(s: GameState, site: EcologySite) {
  take(s, site); at(s, site.refuges[0]);
  expect(journeyAction(s)).toMatchObject({ operation: 'plant', ready: true }); actOnJourney(s);
  return s.world.resources.find(r => r.id === site.plantedId)!;
}
function steps(s: GameState, count: number) { for (let i = 0; i < count; i++) step(s, EMPTY_INPUT); }
function supportNetwork(s: GameState) {
  for (const site of activeSites(s).slice(0, 2)) {
    const r = plant(s, site), native = spawnCreature(s.world, 'bell', site.patch);
    Object.assign(native, { pos: point(r.pos.x + .7, r.pos.z, 'bell'), intent: 'forage', target: r.id, hunger: 80, cooldown: 0 });
    s.world.creatures = [native]; s.tick = 1; step(s, EMPTY_INPUT);
    expect(site.resolved).toBe(true);
  }
  s.world.creatures = []; expect(livingLandNetwork(s)).toBe(true);
}
function careBonds(s: GameState) {
  s.player.bonds = Array.from({ length: 2 }, () => ({ species: 'gloom', benefit: 'recycle' as const, loyalty: 65, hunger: 20, age: 1 }));
}

describe('the land finale requires a saved, physical wild carrier', () => {
  it.each(['follow', 'flight'] as const)('round-trips mid-%s and the generation checkpoint, then continues identically', mode => {
    const s = land(mode === 'flight' ? ['jaw'] : []); take(s);
    at(s, point(0, -22));
    const c = carrier(s, point(mode === 'flight' ? 2 : 12, -22));
    s.tick = 29; step(s, EMPTY_INPUT);
    expect(c.intent).toBe(mode === 'flight' ? 'flee' : 'forage');
    if (mode === 'follow') expect(c.target).toBe(-1);
    expect(Math.hypot(c.velocity.x, c.velocity.z)).toBeGreaterThan(0);
    makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s)), recovered = recoverGeneration(loaded);
    expect(loaded.worlds.every(Boolean)).toBe(true); expect(loaded.journey.sites).toHaveLength(9);
    expect(loaded.world.creatures).toEqual(s.world.creatures);
    expect(recovered.world.creatures).toEqual(s.world.creatures);
    expect(recovered.journey.cargo).toEqual(s.journey.cargo);
    for (let i = 0; i < 120; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded).toEqual(s);
  });

  it.each(['restoration', 'migration'] as const)('navigates a tree, hands off carried scent to planted food and wins %s only after a real meal', path => {
    const s = land(path === 'migration' ? ['symbiote', 'reservoir'] : []);
    if (path === 'restoration') supportNetwork(s); else careBonds(s);
    const home = activeSites(s)[2]; take(s, home); at(s, home.refuges[0]);
    const c = carrier(s, point(s.player.pos.x - 9, s.player.pos.z));
    const tree = { id: s.world.nextId++, pos: { x: s.player.pos.x - 4.5, y: groundHeight(s.player.pos.x - 4.5, s.player.pos.z, 2), z: s.player.pos.z }, radius: 1.5, height: 8, kind: 'tree' as const };
    s.world.obstacles.push(tree);
    expect(lineBlocked(s, c.pos, s.player.pos)).toBe(true);
    expect(migrationTarget(s, c)).toEqual(s.player.pos); // Nearby scent reaches around the cover.
    s.tick = 29; step(s, EMPTY_INPUT);
    expect(c.target).toBe(-1); expect(c.intent).toBe('forage');
    const oldMeals = s.campaign.stageMeals, oldKills = s.campaign.stageKills, oldBonds = s.campaign.stageBonds;
    s.player.cooldown = 0; expect(journeyAction(s)?.operation).toBe('plant'); actOnJourney(s);
    const root = s.world.resources.find(r => r.id === home.plantedId)!;
    expect(home).toMatchObject({ phase: 3, resolved: false }); expect(s.campaign.won).toBe(false);
    expect(journeyFinale(s)).toBeNull(); expect(migrationTarget(s, c)).toBeNull();
    let handoff = false, deviation = 0, clearance = Infinity;
    for (let i = 0; i < 600 && !s.campaign.won; i++) {
      step(s, EMPTY_INPUT); handoff ||= c.target === root.id;
      deviation = Math.max(deviation, Math.abs(c.pos.z - root.pos.z));
      clearance = Math.min(clearance, horizontalDistance(c.pos, tree.pos));
      if (c.cooldown <= 0) expect(home.phase).toBe(3);
    }
    expect(handoff).toBe(true); expect(deviation).toBeGreaterThan(tree.radius);
    expect(clearance).toBeGreaterThanOrEqual(tree.radius + speciesById('gloom').size * .6 - 1e-8);
    expect(distance(c.pos, root.pos)).toBeLessThan(2); expect(c.cooldown).toBeGreaterThan(0);
    expect(root.amount).toBeLessThan(8); expect(home.phase).toBe(5);
    expect(s.campaign).toMatchObject({ won: true, finale: path, stageMeals: oldMeals, stageKills: oldKills, stageBonds: oldBonds });
    expect(s.journey.insights.filter(id => id === 'resolve:8')).toHaveLength(1);
    expect(parseGame(serializeGame(s)).campaign).toEqual(s.campaign);
  });

  it('keeps living and failed home roots unfinished without a carrier, regardless of supported landscape or counters', () => {
    const s = land(); supportNetwork(s); const home = activeSites(s)[2], root = plant(s, home);
    s.campaign.stageMeals = 100; s.campaign.stageKills = 100; s.campaign.stageBonds = 2;
    steps(s, 120);
    expect(home).toMatchObject({ phase: 3, resolved: false }); expect(journeyFinale(s)).toBeNull(); expect(s.campaign.won).toBe(false);
    expect(journeyRequirements(s)[2].met).toBe(false);
    home.vitality = 0; stepJourney(s, 1 / 60, s.player.pos, false);
    expect(home.plantedId).toBeNull(); expect(s.world.resources.some(r => r.id === root.id)).toBe(false);
    expect(home.resolved).toBe(false); expect(journeyFinale(s)).toBeNull();
  });

  it('requires a fresh carrier meal after a learned home dies and is replanted, preserving earned DNA', () => {
    const s = land(), home = activeSites(s)[2], root = plant(s, home);
    const c = carrier(s, root.pos); c.intent = 'forage'; c.target = root.id; s.tick = 1; step(s, EMPTY_INPUT);
    expect(home).toMatchObject({ phase: 5, resolved: true, method: 'guide' }); expect(s.campaign.won).toBe(false);
    const dna = s.player.totalDna, echoes = [...s.journey.echoes];
    home.vitality = 0; stepJourney(s, 1 / 60, s.player.pos, false);
    s.world.creatures = []; plant(s, home);
    expect(home).toMatchObject({ phase: 3, resolved: true, method: 'guide' });
    steps(s, 60); expect(s.campaign.won).toBe(false); expect(journeyRequirements(s)[2]).toMatchObject({ met: false, value: 'čeká na spory' });
    expect(s.player.totalDna).toBe(dna); expect(s.journey.echoes).toEqual(echoes);
  });

  it('does not convert a dead player into a winner when a valid arrival and body already satisfy the finale', () => {
    const s = land(['symbiote', 'reservoir']), home = activeSites(s)[2], root = plant(s, home);
    const c = carrier(s, root.pos); c.intent = 'forage'; c.target = root.id; s.tick = 1; step(s, EMPTY_INPUT);
    expect(home.phase).toBe(5); expect(s.campaign.won).toBe(false);
    careBonds(s); s.player.health = 0; const lineage = [...s.lineage];
    expect(journeyFinale(s)).toBe('migration'); expect(tryWin(s, 'migration')).toBe(false);
    step(s, EMPTY_INPUT);
    expect(s.campaign.won).toBe(false); expect(s.campaign.finale).toBeNull(); expect(s.deathReason).not.toBeNull();
    expect(s.lineage).toEqual(lineage);
    expect(parseGame(serializeGame(s)).player.health).toBe(0);
  });
});

describe('visible extinction recovery does not run in queries or timers', () => {
  it('awakens once at the observed mother, retains culture and recovers again immediately after an actual exposure death', () => {
    const s = land(); take(s); s.player.cooldown = 0;
    const before = JSON.stringify(s), births = s.world.births, cargo = { ...s.journey.cargo! };
    for (let i = 0; i < 20; i++) {
      expect(journeyAction(s)).toMatchObject({ operation: 'awaken', ready: true }); journeyHint(s); wildCarriers(s);
    }
    expect(JSON.stringify(s)).toBe(before);
    actOnJourney(s);
    expect(wildCarriers(s)).toHaveLength(1); expect(s.world.births).toBe(births + 1); expect(s.journey.cargo).toEqual(cargo);
    const c = wildCarriers(s)[0]; expect(horizontalDistance(c.pos, activeSites(s)[2].source)).toBeLessThan(5);
    const after = JSON.stringify(s); journeyAction(s); journeyHint(s); expect(JSON.stringify(s)).toBe(after);
    s.player.cooldown = 0; actOnJourney(s); expect(wildCarriers(s)).toHaveLength(1); expect(s.world.births).toBe(births + 1);
    // A disclosed dry exposure setup kills this same actor through production.
    c.pos = point(0, -22); c.health = .001; c.velocity = { x: 0, y: 0, z: 0 }; c.intent = 'rest';
    s.tick = 1; step(s, EMPTY_INPUT); expect(wildCarriers(s)).toHaveLength(0); expect(s.world.deaths).toBe(1);
    at(s, activeSites(s)[2].source); const time = s.world.time, held = { ...s.journey.cargo! };
    expect(journeyAction(s)).toMatchObject({ operation: 'awaken', ready: true }); actOnJourney(s);
    expect(s.world.time).toBe(time); expect(wildCarriers(s)).toHaveLength(1); expect(wildCarriers(s)[0].id).not.toBe(c.id);
    expect(s.world.births).toBe(births + 2); expect(s.journey.cargo).toEqual(held);
  });

  it('accepts a compatible care meal but not remote, incompatible, unobserved or already populated nursery actions', () => {
    const s = land(); take(s); s.player.cooldown = 0; const home = activeSites(s)[2];
    at(s, home.refuges[0]); expect(journeyAction(s)?.operation).toBe('plant');
    at(s, home.source); s.journey.cargo!.purpose = 'food'; expect(journeyAction(s)?.operation).toBe('awaken');
    s.journey.cargo!.kind = 'algae'; expect(journeyAction(s)?.operation).not.toBe('awaken');
    s.journey.cargo!.kind = 'detritus';
    s.journey.cargo!.purpose = 'culture'; home.observed = false; expect(journeyAction(s)?.operation).not.toBe('awaken');
    home.observed = true; const c = carrier(s, point(50, -55));
    expect(journeyAction(s)?.operation).not.toBe('awaken'); expect(migrationTarget(s, c)).toBeNull();
    expect(s.world.births).toBe(0);
  });
});

describe('carrier physiology uses actual land shelter and water', () => {
  it('loses health in dry ground, stops drying in tree shade and the nursery, and heals in real water', () => {
    const s = land(), c = carrier(s, point(0, -22)); at(s, point(20, -22));
    expect(hydrationAt(s, c.pos)).toBe(0); expect(carrierHealthRate(s, c)).toEqual({ health: -.6, sharesWater: false });
    c.health = 20; steps(s, 60); expect(c.health).toBeCloseTo(19.4);
    s.world.obstacles.push({ id: s.world.nextId++, pos: point(3, -22), radius: 1, height: 8, kind: 'tree' });
    expect(carrierHealthRate(s, c)).toEqual({ health: 0, sharesWater: false }); const shaded = c.health; steps(s, 60); expect(c.health).toBe(shaded);
    c.pos = point(0, 40); expect(carrierHealthRate(s, c)).toEqual({ health: 0, sharesWater: false });
    c.pos = point(0, 80); expect(hydrationAt(s, c.pos)).toBe(9); expect(carrierHealthRate(s, c)).toEqual({ health: 2, sharesWater: false });
    c.health = 31; steps(s, 120); expect(c.health).toBe(32); expect(s.player.moisture).toBeGreaterThanOrEqual(0);
  });

  it('shares finite player moisture only with a nearby carrier, reservoir and a fed recycle partner', () => {
    const s = land(['reservoir', 'symbiote']); careBonds(s);
    const c = carrier(s, point(0, -22)); at(s, point(6, -22)); s.player.moisture = 40; c.health = 20;
    makeCheckpoint(s); const withoutSharing = parseGame(serializeGame(s)); withoutSharing.player.bonds.forEach(b => b.hunger = 80);
    expect(carrierHealthRate(s, c)).toEqual({ health: 2, sharesWater: true });
    steps(s, 60); steps(withoutSharing, 60);
    expect(c.health).toBeCloseTo(22); expect(s.player.moisture).toBeCloseTo(withoutSharing.player.moisture - .5);
    s.player.moisture = 25; expect(carrierHealthRate(s, c).sharesWater).toBe(false);
    s.player.moisture = 40; s.player.pos.x = 9; expect(carrierHealthRate(s, c).sharesWater).toBe(false);
    s.player.pos.x = 6; s.player.bonds.forEach(b => b.hunger = 70); expect(carrierHealthRate(s, c).sharesWater).toBe(false);
    const noReservoir = land(['symbiote']); careBonds(noReservoir); const other = carrier(noReservoir, point(0, -22)); at(noReservoir, point(6, -22));
    expect(carrierHealthRate(noReservoir, other).sharesWater).toBe(false);
  });

  it('keeps predator-body proximity meaningful until a cared-for partner soothes it', () => {
    const s = land(['jaw', 'reservoir', 'symbiote']); take(s); const c = carrier(s, point(0, -22)); at(s, point(2, -22));
    expect(carrierFearDistance(s, c)).toBe(3.5); s.tick = 29; step(s, EMPTY_INPUT); expect(c.intent).toBe('flee');
    careBonds(s); expect(carrierFearDistance(s, c)).toBe(0); steps(s, 30); expect(c.intent).toBe('forage'); expect(c.target).toBe(-1);
    s.player.bonds.forEach(b => b.hunger = 70); expect(carrierFearDistance(s, c)).toBe(3.5);
  });

  it('does not let an active recycle partner cancel fear caused by an actual toxin pulse', () => {
    const s = land(['toxin', 'reservoir', 'symbiote']); careBonds(s); take(s);
    const c = carrier(s, point(0, -22)); at(s, point(2, -22));
    expect(carrierFearDistance(s, c)).toBe(0); s.tick = 29;
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(c.health).toBeLessThan(32); expect(c.health).toBeGreaterThan(0);
    expect(c.fear).toBeGreaterThan(9); expect(c.intent).toBe('flee');
    const initialDistance = distance(c.pos, s.player.pos); steps(s, 30);
    expect(c.intent).toBe('flee'); expect(distance(c.pos, s.player.pos)).toBeGreaterThan(initialDistance + 1);
  });

  it('keeps partner soothing through planting so a jaw-bearing caretaker can host the real arrival', () => {
    const s = land(['jaw', 'reservoir', 'symbiote']); careBonds(s);
    const home = activeSites(s)[2]; take(s, home); at(s, home.refuges[0]);
    const c = carrier(s, point(s.player.pos.x + 5, s.player.pos.z));
    expect(carrierFearDistance(s, c)).toBe(0);
    s.player.cooldown = 0; actOnJourney(s);
    expect(s.journey.cargo).toBeNull(); expect(home.phase).toBe(3);
    expect(carrierFearDistance(s, c)).toBe(0);
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s));
    for (let i = 0; i < 600 && !s.campaign.won; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded).toEqual(s);
    expect(home.phase).toBe(5); expect(c.cooldown).toBeGreaterThan(0);
    expect(s.campaign).toMatchObject({ won: true, finale: 'migration' });
    expect(s.world.resources.find(r => r.id === home.plantedId)!.amount).toBeLessThan(8);
  });

  it('does not soothe an abandoned, dead or distant pasture, hungry partners, or actual toxin fear after planting', () => {
    const s = land(['jaw', 'toxin', 'reservoir', 'symbiote']); careBonds(s);
    const home = activeSites(s)[2], root = plant(s, home);
    const c = carrier(s, point(root.pos.x + 5, root.pos.z));
    expect(carrierFearDistance(s, c)).toBe(0);
    home.vitality = 0; expect(carrierFearDistance(s, c)).toBe(12); home.vitality = 100;
    c.pos.x += 40; expect(carrierFearDistance(s, c)).toBe(12); c.pos.x -= 40;
    s.player.bonds.forEach(b => b.hunger = 70); expect(carrierFearDistance(s, c)).toBe(12); careBonds(s);
    s.tick = 29; s.player.cooldown = 0; step(s, { ...EMPTY_INPUT, pulse: true });
    expect(c.fear).toBeGreaterThan(0); expect(c.intent).toBe('flee');
    expect(home.phase).toBe(3); expect(s.campaign.won).toBe(false);
    s.journey.legacy = true; expect(carrierFearDistance(s, c)).toBe(12);
  });

  it('does not reduce valid imported health above the normal ceiling when a wet carrier heals', () => {
    const s = land(), c = carrier(s, point(0, 80)); c.health = 60; at(s, point(20, -22));
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s));
    steps(loaded, 60); expect(loaded.world.creatures[0].health).toBe(60);
  });

  it.each(['legacy', 'restoration', 'predator', 'migration'] as const)('leaves %s migration physics inactive and preserves save behavior', mode => {
    const s = land(); take(s); const c = carrier(s, point(0, -22)); at(s, point(9, -22));
    if (mode === 'legacy') { s.journey.legacy = true; s.journey.version = 2; delete s.journey.canopy; }
    else { s.campaign.won = true; s.campaign.finale = mode; }
    expect(migrationActive(s)).toBe(false); expect(migrationTarget(s, c)).toBeNull();
    expect(carrierHealthRate(s, c)).toEqual({ health: 0, sharesWater: false });
    if (mode !== 'legacy') { makeCheckpoint(s); const before = JSON.stringify(s); steps(s, 60); expect(JSON.stringify(s)).toBe(before); }
    else { s.journey.cargo = null; s.checkpoint = null; steps(s, 60); expect(c.health).toBe(32); }
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s)); expect(loaded.campaign).toEqual(s.campaign); expect(loaded.world.creatures).toEqual(s.world.creatures);
  });
});
