import type { WorldStage as Stage } from '../src/game/stage';
import { describe, expect, it } from 'vitest';
import { actOnJourney, activeSites, environmentalFlow, initializeJourneyStage, journeyAction, journeyFinale, journeyForageTarget, journeyHint, recordConsumption, stepJourney } from '../src/game/journey';
import { createGame, evolve, step, transitionRequirements, tryTransition } from '../src/game/simulation';
import { cloneGenome } from '../src/game/genome';
import { createWorld, spawnCreature } from '../src/game/world';
import { speciesById } from '../src/game/content';
import { distance, horizontalDistance } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
import { lineBlocked } from '../src/game/interactions';
import type { EcologySite } from '../src/game/journey-types';
import type { Creature, GameState, Vec3 } from '../src/game/types';

// Rules tests use disclosed prepared encounters and actor placement. They exercise
// production actions/NPC steps; they do not claim a fresh campaign run or play duration.
function quiet(seed = 481516, stage: Stage = 0): GameState {
  const s = createGame(seed, false);
  s.player.genome = cloneGenome(s.player.genome);
  if (stage !== 0) {
    s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world;
    if (stage === 2) for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `fixture-${kind}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false });
    initializeJourneyStage(s);
  }
  s.world.creatures = []; s.player.energy = 90;
  return s;
}
function at(s: GameState, pos: Vec3) {
  s.player.pos = { ...pos }; s.player.velocity = { x: 0, y: 0, z: 0 }; s.player.heading = 0; s.player.cooldown = 0;
}
function act(s: GameState, pos: Vec3, operation: string, offering = false) {
  at(s, pos); expect(journeyAction(s, offering)?.operation).toBe(operation); expect(journeyAction(s, offering)?.ready).toBe(true);
  expect(actOnJourney(s, offering)).toBe(true);
}
function transplant(s: GameState, site: EcologySite, refuge = 0) {
  if (!site.observed) act(s, site.source, 'observe');
  if (site.id === 4 && s.journey.canopy?.releasedAt === null) {
    const crust = s.world.resources.find(r => r.id === s.journey.canopy!.crustId)!;
    at(s, { ...crust.pos, y: crust.pos.y - 1.4 });
    step(s, { ...EMPTY_INPUT, feed: true, feedSelection: { stage: 1, kind: 'food', id: crust.id } });
    expect(s.journey.canopy!.releasedAt).not.toBeNull();
  }
  // Quiet fixtures explicitly removed local animals. Recover that extinction
  // through the same food-funded action a player sees before sampling.
  at(s, site.source);
  if (journeyAction(s)?.operation === 'awaken') act(s, site.source, 'awaken');
  act(s, site.source, 'take'); act(s, site.refuges[refuge], 'plant');
  return s.world.resources.find(r => r.id === site.plantedId)!;
}
function grazer(s: GameState, pos: Vec3, patch = 0) {
  const c = spawnCreature(s.world, s.stage === 0 ? 'veil' : s.stage === 1 ? 'sail' : 'bell', patch);
  Object.assign(c, { pos: { ...pos }, velocity: { x: 0, y: 0, z: 0 }, hunger: 80, cooldown: 0, fear: 0, target: null });
  s.world.creatures.push(c); return c;
}
function advance(s: GameState, frames: number) { for (let i = 0; i < frames; i++) step(s, EMPTY_INPUT); }
function makeJaw(s: GameState) {
  const genome = cloneGenome(s.player.genome);
  genome.parts = genome.parts.filter(part => part.kind !== 'filter');
  genome.parts.push({ id: 'fixture-jaw', kind: 'jaw', axial: .92, angle: 0, scale: 1, mirrored: false });
  return genome;
}
function lowHealthBite(s: GameState, c: Creature) {
  // Prepared wounded target isolates actual damage/kill bookkeeping from combat skill.
  c.health = 1; c.velocity = { x: 0, y: 0, z: 0 };
  // Place the forward jaw at the animal, rather than overlapping body centres.
  at(s, { ...c.pos, z: c.pos.z - 2 });
  step(s, { ...EMPTY_INPUT, feed: true, feedSelection: { kind: 'creature', id: c.id, stage: s.stage } });
}
function arrivalEvent(s: GameState, home: EcologySite) {
  // Prepared arrival isolates finale eligibility. migration.test.ts exercises
  // travel and the NPC's actual feeding event instead of this direct callback.
  const food = s.world.resources.find(r => r.id === home.plantedId)!;
  const c = spawnCreature(s.world, 'gloom', 2); c.pos = { ...food.pos }; s.world.creatures.push(c);
  recordConsumption(s, c, food);
}

describe('new journey initialization and earned progress', () => {
  it.each([481516, 20260913, 8675309])('initializes deterministic accessible authored sources for seed %i', seed => {
    const a = createGame(seed, false), b = createGame(seed, false);
    expect(a.journey.legacy).toBe(false); expect(a.world).toEqual(b.world); expect(a.journey).toEqual(b.journey);
    expect(activeSites(a)).toHaveLength(3);
    for (const site of activeSites(a)) {
      expect(site.resolved).toBe(false);
      expect(a.world.resources.find(r => r.id === site.sourceId)).toMatchObject({ pos: site.source, patch: site.patch, amount: 12 });
      for (const node of [site.source, ...site.refuges]) for (const obstacle of a.world.obstacles) {
        expect(horizontalDistance(node, obstacle.pos)).toBeGreaterThan(obstacle.radius + .8);
      }
    }
    const count = a.world.resources.length; initializeJourneyStage(a);
    expect(a.world.resources).toHaveLength(count); expect(activeSites(a)).toHaveLength(3);
  });

  it('leaves legacy worlds unmodified by authored initialization', () => {
    const s = createGame(481516, true), before = structuredClone(s.world);
    initializeJourneyStage(s); expect(s.world).toEqual(before); expect(s.journey.sites).toHaveLength(0);
  });

  it.each([481516, 20260913, 8675309])('does not credit an idle observer with passive ecological completion for seed %i', seed => {
    const s = createGame(seed, false), knowledge = s.player.totalDna;
    advance(s, 7200);
    expect(s.journey.insights).toHaveLength(0);
    expect(activeSites(s).every(site => !site.resolved && !site.observed)).toBe(true);
    expect(s.player.totalDna).toBe(knowledge); expect(s.player.meals).toBe(0);
  });

  it('awards observation and first carrying insights once, instead of repeatable food grinding', () => {
    const s = quiet(), site = activeSites(s)[0], before = s.player.dna;
    act(s, site.source, 'observe'); expect(s.player.dna).toBe(before + 12);
    act(s, site.source, 'take'); expect(s.player.dna).toBe(before + 20);
    act(s, site.source, 'offer', true);
    act(s, site.source, 'take'); expect(s.player.dna).toBe(before + 20);
    expect(s.journey.insights.filter(id => id === `observe:${site.id}`)).toHaveLength(1);
    expect(s.journey.insights.filter(id => id === `carry:${site.id}`)).toHaveLength(1);
  });

  it('does not replace unresolved ecological outcomes with large meal and generation counters', () => {
    const s = quiet(); s.campaign.stageMeals = 1000; s.campaign.stageReproductions = 100;
    expect(transitionRequirements(s).every(requirement => requirement.met)).toBe(false);
    expect(transitionRequirements(s)).toHaveLength(3);
    at(s, s.world.landmarks.find(l => l.kind === 'gate')!.pos);
    expect(tryTransition(s)).toBe(false); expect(s.stage).toBe(0);
  });

  it('preserves the ability to finance the required land body after repeated nursery experimentation', () => {
    const s = quiet(481516, 1), garden = activeSites(s)[0], planted = transplant(s, garden);
    grazer(s, { ...planted.pos, x: planted.pos.x + 2.5 });
    at(s, s.world.landmarks[0].pos); s.tick = 29; advance(s, 90);
    expect(garden.resolved).toBe(true);
    const reefRoot = transplant(s, activeSites(s)[1]);
    grazer(s, { ...reefRoot.pos, x: reefRoot.pos.x + 2.5 }, 1);
    at(s, s.world.landmarks[0].pos); s.tick = 29; advance(s, 90);
    expect(activeSites(s)[1].resolved).toBe(true);
    transplant(s, activeSites(s)[2]);
    expect(activeSites(s).every(site => site.resolved)).toBe(true);
    at(s, s.world.landmarks[0].pos);
    // Finite ecological knowledge was earned above. Repeated ordinary, accepted
    // editor changes must not consume the route to the mandatory next-stage body.
    for (let i = 0; i < 80; i++) {
      const draft = cloneGenome(s.player.genome); draft.hue = (draft.hue + 31) % 360;
      if (!evolve(s, draft).ok) break;
    }
    const land = cloneGenome(s.player.genome);
    for (const kind of ['legs', 'lungs'] as const) land.parts.push({ id: `required-${kind}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: kind === 'legs' });
    expect(evolve(s, land).ok).toBe(true);
    at(s, s.world.landmarks.find(l => l.kind === 'gate')!.pos);
    expect(tryTransition(s)).toBe(true); expect(s.stage).toBe(2);
  });

  it('requires a real grazer meal after planting the garden and then records its lasting world outcome', () => {
    const s = quiet(), site = activeSites(s)[0], planted = transplant(s, site);
    expect(site.resolved).toBe(false); expect(site.phase).toBe(3); expect(site.plantedId).toBe(planted.id);
    const c = grazer(s, { ...planted.pos, x: planted.pos.x + 3 });
    at(s, s.world.landmarks[0].pos); s.tick = 29;
    advance(s, 90);
    expect(c.target).toBe(planted.id); expect(planted.amount).toBeLessThan(8);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate', phase: 4 });
    expect(s.world.patches[site.patch].fertility).toBeGreaterThanOrEqual(1.15);
    expect(s.journey.echoes).toContain('0:cultivate');
    expect(s.journey.insights.filter(id => id === 'resolve:0')).toHaveLength(1);
  });

  it('supports player-selected selective predation with a legitimately evolved jaw and a surviving original grazer', () => {
    const s = createGame(481516, false), site = activeSites(s)[0];
    s.world.creatures = s.world.creatures.filter(c => site.threatIds.includes(c.id));
    s.world.resources = s.world.resources.filter(r => activeSites(s).some(site => site.sourceId === r.id));
    act(s, site.source, 'observe'); at(s, s.world.landmarks[0].pos);
    expect(evolve(s, makeJaw(s)).ok).toBe(true);
    const originals = [...s.world.creatures]; expect(originals).toHaveLength(3);
    lowHealthBite(s, originals[0]); expect(site.resolved).toBe(false);
    lowHealthBite(s, originals[1]);
    expect(site).toMatchObject({ resolved: true, method: 'hunt' });
    expect(s.world.creatures.some(c => c.id === originals[2].id)).toBe(true);
    expect(s.player.kills).toBe(2); expect(s.journey.echoes).toContain('0:hunt');
  });

  it('allows a recolonizing grazer to use the transplanted garden after every original grazer was lost', () => {
    const s = quiet(), site = activeSites(s)[0], planted = transplant(s, site);
    const newcomer = grazer(s, { ...planted.pos, x: planted.pos.x + 2.5 });
    expect(site.threatIds).not.toContain(newcomer.id);
    at(s, s.world.landmarks[0].pos); s.tick = 29; advance(s, 90);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate' });
  });
});

describe('living cargo recovery and physical state', () => {
  it('keeps carried culture and guides to the nearest refuge when T is pressed outside a planting circle', () => {
    const s = quiet(), site = activeSites(s)[0];
    // A live local consumer leaves T dedicated to the held culture. Extinction
    // care has its own integration tests and is a different contextual action.
    grazer(s, { ...site.source, x: site.source.x + 5 });
    act(s, site.source, 'observe'); act(s, site.source, 'take'); at(s, site.source);
    const cargo = structuredClone(s.journey.cargo), count = s.world.resources.length;
    const nearest = [...site.refuges].sort((a, b) => distance(s.player.pos, a) - distance(s.player.pos, b))[0];
    expect(journeyAction(s)).toMatchObject({ operation: 'plant', ready: false, pos: nearest });
    for (let i = 0; i < 12; i++) step(s, { ...EMPTY_INPUT, tend: true });
    expect(s.journey.cargo).toEqual(cargo); expect(s.journey.offerings).toHaveLength(0);
    expect(s.world.resources).toHaveLength(count); expect(site.plantedId).toBeNull();
  });

  it('requires deliberate E and respects cooldown before consuming exactly one carried sample', () => {
    const s = quiet(), site = activeSites(s)[0];
    act(s, site.source, 'observe'); act(s, site.source, 'take');
    expect(journeyAction(s, true)).toMatchObject({ operation: 'offer', ready: false });
    step(s, { ...EMPTY_INPUT, offer: true });
    expect(s.journey.cargo).not.toBeNull(); expect(s.journey.offerings).toHaveLength(0);
    advance(s, 49); const count = s.world.resources.length;
    expect(journeyAction(s, true)).toMatchObject({ operation: 'offer', ready: true });
    step(s, { ...EMPTY_INPUT, offer: true });
    expect(s.journey.cargo).toBeNull(); expect(s.journey.offerings).toHaveLength(1);
    const id = s.journey.offerings[0].id;
    expect(s.world.resources.find(r => r.id === id)).toMatchObject({ kind: 'algae', amount: 5 });
    for (let i = 0; i < 55; i++) step(s, { ...EMPTY_INPUT, offer: true });
    expect(s.journey.offerings).toHaveLength(1); expect(s.world.resources).toHaveLength(count + 1);
  });

  it('lets a lost culture be collected again without repeating its DNA reward', () => {
    const s = quiet(), site = activeSites(s)[0];
    act(s, site.source, 'observe'); act(s, site.source, 'take');
    const dna = s.player.dna; s.journey.cargo!.vitality = .01;
    stepJourney(s, 1 / 60, { ...s.player.pos }, true);
    expect(s.journey.cargo).toBeNull(); expect(site.resolved).toBe(false);
    act(s, site.source, 'take'); expect(s.journey.cargo?.vitality).toBe(100); expect(s.player.dna).toBe(dna);
  });

  it('does not advertise planting as ready when the carried sample is too weak to survive it', () => {
    const s = quiet(), site = activeSites(s)[0];
    act(s, site.source, 'observe'); act(s, site.source, 'take'); s.journey.cargo!.vitality = 10;
    at(s, site.refuges[0]);
    expect(journeyAction(s)).toMatchObject({ operation: 'plant', ready: false });
    actOnJourney(s); expect(site.plantedId).toBeNull(); expect(s.journey.cargo).not.toBeNull();
  });

  it('does not allow carrying to bypass observation, source distance or a blocking obstacle', () => {
    const s = quiet(), site = activeSites(s)[0];
    // Isolate source sampling; ordinary food now has its own valid T action.
    s.world.resources = s.world.resources.filter(r => activeSites(s).some(site => site.sourceId === r.id));
    at(s, { ...site.source, x: site.source.x + 8 });
    expect(journeyAction(s)).toMatchObject({ operation: 'observe', ready: false });
    actOnJourney(s); expect(site.observed).toBe(false);
    at(s, { ...site.source, x: site.source.x + 3 });
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: site.source.x + 1.5, y: -6, z: site.source.z }, radius: .3, height: 10 });
    expect(journeyAction(s)?.ready).toBe(false); actOnJourney(s); expect(site.observed).toBe(false);
  });

  it('moves the vortex resource with its logical source and applies shelter to real flow', () => {
    const s = quiet(), vortex = activeSites(s)[1], resource = s.world.resources.find(r => r.id === vortex.sourceId)!;
    const initial = { ...vortex.source }; s.world.time = 10; stepJourney(s, 1 / 60, s.player.pos, false);
    expect(resource.pos).toEqual(vortex.source); expect(distance(initial, vortex.source)).toBeGreaterThan(1);
    const exposed = { x: 45, y: 1.1, z: -20 }; expect(Math.hypot(environmentalFlow(s, exposed).x, environmentalFlow(s, exposed).z)).toBeGreaterThan(1);
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { ...exposed, x: exposed.x + 2.5 }, radius: 1, height: 8 });
    expect(environmentalFlow(s, exposed)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('clears an optional carried sample at a legitimate stage boundary without breaking new-stage actions', () => {
    const s = quiet(); // Prepared completed-stage state isolates boundary handling.
    activeSites(s).forEach(site => { site.observed = true; site.resolved = true; site.method = 'cultivate'; site.phase = 4; });
    act(s, activeSites(s)[0].source, 'take'); at(s, s.world.landmarks.find(l => l.kind === 'gate')!.pos);
    expect(tryTransition(s)).toBe(true); expect(s.journey.cargo).toBeNull(); expect(activeSites(s)).toHaveLength(3);
    expect(() => journeyAction(s)).not.toThrow(); expect(() => journeyHint(s)).not.toThrow();
  });

  it('replaces an earlier transplant without retaining an orphan permanent resource', () => {
    const s = quiet(), site = activeSites(s)[0], first = transplant(s, site, 0);
    const second = transplant(s, site, 1);
    expect(second.id).not.toBe(first.id); expect(s.world.resources.some(r => r.id === first.id)).toBe(false);
    expect(s.world.resources.some(r => r.id === site.sourceId)).toBe(true);
  });

  it('makes the planted upper reef culture supply oxygen only in its actual vicinity', () => {
    const s = quiet(481516, 1), site = activeSites(s)[1], planted = transplant(s, site);
    s.player.oxygen = 40; at(s, planted.pos);
    stepJourney(s, 1, s.player.pos, false); expect(s.player.oxygen).toBeGreaterThan(40);
    at(s, { ...planted.pos, x: planted.pos.x + 8 }); const oxygen = s.player.oxygen;
    stepJourney(s, 1, s.player.pos, false); expect(s.player.oxygen).toBe(oxygen);
  });

  it('collects actual meat and leaves it as finite hunter bait rather than a plant', () => {
    const s = quiet(), position = { x: 0, y: 1.1, z: 0 };
    const carcass = { id: s.world.nextId++, kind: 'meat' as const, pos: position, amount: 3, max: 3, patch: 0, regen: 0 }; s.world.resources.push(carcass);
    act(s, position, 'take-meat'); expect(carcass.amount).toBe(2); expect(s.journey.cargo?.kind).toBe('meat');
    const site = activeSites(s).find(site => site.id === s.journey.cargo!.site)!;
    at(s, site.refuges[0]); expect(journeyAction(s)).toMatchObject({ operation: 'plant', ready: false });
    step(s, { ...EMPTY_INPUT, tend: true }); expect(s.journey.cargo?.kind).toBe('meat'); expect(site.plantedId).toBeNull();
    act(s, site.refuges[0], 'offer', true);
    const offering = s.journey.offerings[0], bait = s.world.resources.find(r => r.id === offering.id)!;
    expect(bait.kind).toBe('meat'); expect(site.plantedId).toBeNull(); expect(s.journey.cargo).toBeNull();
    offering.remaining = .001; stepJourney(s, 1 / 60, s.player.pos, false);
    expect(s.world.resources.some(r => r.id === bait.id)).toBe(false); expect(s.journey.offerings).toHaveLength(0);
  });
});

describe('NPC outcomes and reachable food', () => {
  it('prefers a reachable authored plant over a closer one behind shelter', () => {
    const s = quiet(), site = activeSites(s)[0], planted = transplant(s, site);
    // Isolate the deliberate barrier below. Authored refuge rocks otherwise
    // overlap this prepared actor position and block both comparison rays.
    s.world.obstacles = [];
    const c = grazer(s, { ...planted.pos, x: planted.pos.x - 4 });
    // Even with its food-offering priority, this alternative ranks farther away.
    // Choosing it must come from reachability, not merely the offering bonus.
    const alternative = { id: s.world.nextId++, kind: 'algae' as const, pos: { ...c.pos, z: c.pos.z + 18 }, amount: 4, max: 4, patch: 0, regen: 0 };
    s.world.resources.push(alternative); s.journey.offerings.push({ stage: 0, site: 0, id: alternative.id, remaining: 60 });
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: c.pos.x + 2, y: -6, z: c.pos.z }, radius: .6, height: 10 });
    expect(lineBlocked(s, c.pos, planted.pos)).toBe(true);
    expect(lineBlocked(s, c.pos, alternative.pos)).toBe(false);
    expect(journeyForageTarget(s, c)?.id).toBe(alternative.id);
  });

  it('cannot consume an already-targeted plant through a newly blocking wall', () => {
    const s = quiet(), site = activeSites(s)[0], planted = transplant(s, site);
    const c = grazer(s, { ...planted.pos, x: planted.pos.x - 1.6 });
    c.target = planted.id; c.intent = 'forage';
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: planted.pos.x - .8, y: -6, z: planted.pos.z }, radius: .15, height: 10 });
    at(s, s.world.landmarks[0].pos); s.tick = 1; const before = planted.amount;
    step(s, EMPTY_INPUT);
    expect(planted.amount).toBeGreaterThanOrEqual(before); expect(site.resolved).toBe(false);
  });

  it('can reach and eat the only usable culture around a simple shelter obstacle', () => {
    const s = quiet(), site = activeSites(s)[0], planted = transplant(s, site);
    for (const resource of s.world.resources) if (resource.id !== planted.id) { resource.amount = 0; resource.regen = 0; }
    const c = grazer(s, { ...planted.pos, x: planted.pos.x - 7 });
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: planted.pos.x - 3.5, y: -6, z: planted.pos.z }, radius: 1.2, height: 10 });
    at(s, s.world.landmarks[0].pos); s.tick = 29;
    advance(s, 600);
    expect(distance(c.pos, planted.pos)).toBeLessThan(3);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate' });
  });

  it('preserves historical v2 timed recovery after a zero-grazer population fixture', () => {
    const s = quiet(); s.journey.version = 2; delete s.journey.canopy;
    const site = activeSites(s)[0]; transplant(s, site);
    at(s, s.world.landmarks[0].pos); advance(s, 7200);
    expect(s.world.creatures.some(c => speciesById(c.species).role === 'grazer')).toBe(true);
    expect(s.deathReason).toBeNull();
  });

  it('keeps v3 extinction visible until a real nursery meal, then lets the actual arrival resolve the garden', () => {
    const s = quiet(), site = activeSites(s)[0]; transplant(s, site);
    at(s, s.world.landmarks[0].pos); advance(s, 7200);
    expect(s.world.creatures).toHaveLength(0); expect(site.resolved).toBe(false);
    const mother = s.world.resources.find(r => r.id === site.sourceId)!, amount = mother.amount, dna = s.player.dna;
    act(s, site.source, 'awaken');
    expect(mother.amount).toBe(amount - 1); expect(s.player.dna).toBe(dna);
    expect(s.world.creatures).toHaveLength(1); expect(site.resolved).toBe(false);
    at(s, s.world.landmarks[0].pos); advance(s, 900);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate' });
  });

  it('requires a safe actual grazer meal for terrestrial guidance instead of planting alone', () => {
    const s = quiet(481516, 2), site = activeSites(s)[0], planted = transplant(s, site);
    expect(site.resolved).toBe(false);
    const c = grazer(s, { ...planted.pos, x: planted.pos.x + 2.5 });
    at(s, s.world.landmarks[0].pos); s.tick = 29; advance(s, 90);
    expect(c.target).toBe(planted.id); expect(site).toMatchObject({ resolved: true, method: 'guide' });
    expect(s.world.landmarks.find(l => l.id === 'spring-0')!.charge).toBe(10);
  });

  it('lets an invasive meal destroy a weakened plant and leaves a recoverable fresh source', () => {
    const s = quiet(481516, 2), site = activeSites(s)[0], planted = transplant(s, site);
    // Prepared previously damaged roots isolate the final real grazing event.
    site.vitality = 12;
    const c = spawnCreature(s.world, 'gnaw', site.patch);
    Object.assign(c, { pos: { ...planted.pos, x: planted.pos.x + .7 }, velocity: { x: 0, y: 0, z: 0 }, hunger: 80, cooldown: 0, target: planted.id, intent: 'forage' });
    s.world.creatures.push(c); at(s, s.world.landmarks[0].pos); s.tick = 1;
    step(s, EMPTY_INPUT);
    expect(site.resolved).toBe(false); expect(site.plantedId).toBeNull(); expect(planted.amount).toBe(0); expect(planted.regen).toBe(0);
    act(s, site.source, 'take'); expect(s.journey.cargo?.vitality).toBe(100);
  });

  it('requires ecological arrival as well as healthy partners and a living planted home', () => {
    const s = quiet(481516, 2), home = activeSites(s)[2];
    s.player.genome.parts.push({ id: 'fixture-reservoir', kind: 'reservoir', axial: 0, angle: 0, scale: 1, mirrored: false });
    s.player.genome.parts.push({ id: 'fixture-symbiote', kind: 'symbiote', axial: 0, angle: 0, scale: 1, mirrored: false });
    s.player.bonds = Array.from({ length: 2 }, () => ({ species: 'gloom', loyalty: 65, hunger: 20, benefit: 'recycle', age: 150 }));
    expect(journeyFinale(s)).toBeNull(); transplant(s, home);
    expect(home.resolved).toBe(false); expect(journeyFinale(s)).toBeNull();
    arrivalEvent(s, home); expect(home).toMatchObject({ resolved: true, method: 'guide', phase: 5 });
    expect(journeyFinale(s)).toBe('migration');
    s.player.bonds[0].hunger = 80; expect(journeyFinale(s)).toBeNull();
    s.player.bonds[0].hunger = 20; step(s, EMPTY_INPUT);
    expect(s.campaign).toMatchObject({ won: true, finale: 'migration' }); expect(s.player.kills).toBe(0);
  });

  it('does not substitute bonding or a second planting for wild spore arrival', () => {
    const s = quiet(481516, 2), home = activeSites(s)[2];
    for (const kind of ['reservoir', 'symbiote'] as const) s.player.genome.parts.push({ id: `fixture-${kind}`, kind, axial: 0, angle: 0, scale: 1, mirrored: false });
    const firstPlant = transplant(s, home);
    expect(home).toMatchObject({ resolved: false, method: null, phase: 3 });
    // Prepared newly joined partners cannot substitute for the wild arrival.
    s.player.bonds = Array.from({ length: 2 }, () => ({ species: 'gloom', loyalty: 65, hunger: 20, benefit: 'recycle', age: 0 }));
    step(s, EMPTY_INPUT); expect(home.resolved).toBe(false); expect(s.campaign.won).toBe(false); expect(journeyFinale(s)).toBeNull();
    transplant(s, home);
    expect(home.plantedId).not.toBe(firstPlant.id); expect(home.resolved).toBe(false); expect(journeyFinale(s)).toBeNull();
    arrivalEvent(s, home); expect(home).toMatchObject({ resolved: true, method: 'guide', phase: 5 });
    expect(journeyFinale(s)).toBe('migration');
  });

  it('keeps an earlier unaccompanied home dormant until spring recovery and spore arrival', () => {
    const s = quiet(481516, 2), home = activeSites(s)[2]; transplant(s, home);
    expect(home.resolved).toBe(false);
    for (const site of activeSites(s).filter(site => site.patch < 2)) {
      const planted = transplant(s, site); grazer(s, { ...planted.pos, x: planted.pos.x + 2.5 }, site.patch);
      at(s, s.world.landmarks[0].pos); s.tick = 29; advance(s, 90);
      expect(site).toMatchObject({ resolved: true, method: 'guide' });
    }
    expect(home.resolved).toBe(false); expect(s.campaign.won).toBe(false);
    arrivalEvent(s, home); step(s, EMPTY_INPUT);
    expect(home).toMatchObject({ resolved: true, method: 'cultivate', phase: 5 });
    expect(s.campaign).toMatchObject({ won: true, finale: 'restoration' }); expect(s.player.kills).toBe(0);
  });
});
