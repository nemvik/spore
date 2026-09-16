import { describe, expect, it } from 'vitest';
import { initialVehicle, vehicleCost, vehicleStats } from '../src/game/blueprint';
import type { Carrier } from '../src/game/blueprint';
import { livingRootStrength } from '../src/game/climate';
import { speciesById } from '../src/game/content';
import type { ActiveMachineState, ActivePlanetState, ActiveTribeState, MachineUnit } from '../src/game/era-types';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { buildMachine, createMachines, issueMachineOrder, machineDesign, machineHome, machineIncome, machinesReady, stepMachines } from '../src/game/machines';
import { parseGame, serializeGame } from '../src/game/persistence';
import {
  atPlanetBase, biomeLife, introducePlanetLife, planetSampleTargets, planetSupport, planetTScore,
  planetVehicle, preparePlanetNursery, removePlanetLife, samplePlanetLife, selectPlanetVehicle,
  stepPlanet, togglePlanetTool,
} from '../src/game/planet';
import { groundHeight, horizontalDistance } from '../src/game/random';
import { continueToPlanetEra, createGame, evolve, makeCheckpoint, step as stepGame } from '../src/game/simulation';
import { createTribe } from '../src/game/tribe';
import type { GameState, Input, Vec3 } from '../src/game/types';
import { createWorld } from '../src/game/world';

type MachineGame = GameState & { tribe: ActiveTribeState; machines: ActiveMachineState };
type PlanetGame = MachineGame & { planet: ActivePlanetState };
const DT = 1 / 30;
const IDLE: Input = { x: 0, z: 0, vertical: 0, sprint: false, feed: false, bond: false, tend: false, pulse: false };
const KEYS = ['culture:6', 'culture:7', 'species:bell', 'species:gnaw', 'species:crest'] as const;

/** Prepared completed coast/tribe/P2, not an earned campaign playthrough.
 * The factory adds its real rock ring and public construction pays for the
 * two inherited machines. Ecological tests start with an explicit extinction
 * of the three coastal animal taxa to exercise the paid nursery recovery. */
function machineFixture(seed = 481516, completed = true, extinct = true, upgraded = false): MachineGame {
  const s = createGame(seed, false, true, true, true);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world; initializeJourneyStage(s);
  }
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `planet-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  s.player.health = computeStats(s.player.genome).maxHealth;
  s.player.totalDna = 300; s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  Object.assign(s.campaign, { won: true, finale: 'restoration' });
  s.tribe = createTribe(s); s.tribe.completed = true; s.tribe.neighbours.forEach(n => { n.resolved = 'allied'; });
  s.machines = createMachines(s); s.stage = 4; s.machines.resource = 1000;
  expect(buildMachine(s, initialVehicle('tank', 'restoration')).ok).toBe(true);
  if (completed) {
    for (const r of s.machines.regions) Object.assign(r, { owner: 'player', method: 'restoration', soil: 100, settlers: 2 });
    s.machines.airUnlocked = true;
    const air = initialVehicle('air', 'restoration');
    if (upgraded) { const module = air.parts.find(p => p.kind === 'seeder')!; module.scale = 1.65; module.mirrored = true; }
    expect(buildMachine(s, air).ok).toBe(true);
    s.machines.springs.slice(0, 2).forEach(p => { p.owner = 'player'; p.progress = 1; });
    s.machines.completed = true;
  }
  if (extinct) s.world.creatures = s.world.creatures.filter(c => !['bell', 'gnaw', 'crest'].includes(c.species));
  makeCheckpoint(s); return s as MachineGame;
}
function game(seed = 481516, upgraded = false): PlanetGame {
  const s = machineFixture(seed, true, true, upgraded);
  expect(continueToPlanetEra(s)).toBe(true); return s as PlanetGame;
}
function step(s: PlanetGame, count = 1, input: Input = IDLE): void {
  for (let i = 0; i < count; i++) { s.tick++; s.world.time += DT; stepPlanet(s, input, DT); }
}
function until(s: PlanetGame, done: () => boolean, seconds = 180): void {
  for (let i = 0; i < seconds / DT && !done(); i++) step(s);
  expect(done(), `Timed out at ${JSON.stringify({ t: s.planet.tScore, axes: [s.planet.temperature, s.planet.atmosphere], support: planetSupport(s), life: s.planet.populations })}`).toBe(true);
}
function select(s: PlanetGame, carrier: Carrier): MachineUnit {
  const u = s.machines.fleet.find(u => machineDesign(s.machines, u).carrier === carrier)!;
  expect(selectPlanetVehicle(s, u.id).ok).toBe(true); return u;
}
/** Actual WASD-equivalent motion, including every intermediate climate step. */
function flyTo(s: PlanetGame, target: Vec3): void {
  const u = planetVehicle(s)!;
  expect(machineDesign(s.machines, u).carrier).toBe('air');
  for (let i = 0; i < 120 / DT && horizontalDistance(u.pos, target) > .2; i++) {
    const dx = target.x - u.pos.x, dz = target.z - u.pos.z, gap = Math.hypot(dx, dz), speed = vehicleStats(machineDesign(s.machines, u)).speed;
    const amount = Math.min(1, gap / (speed * DT)); step(s, 1, { ...IDLE, x: dx / gap * amount, z: dz / gap * amount });
  }
  expect(horizontalDistance(u.pos, target)).toBeLessThanOrEqual(.2);
}
function research(s: PlanetGame): void {
  select(s, 'air');
  for (const source of s.planet.nursery.sources) {
    const resource = s.world.resources.find(r => r.id === source.resourceId)!;
    flyTo(s, resource.pos); expect(samplePlanetLife(s, { kind: 'culture', id: resource.id }).ok).toBe(true);
  }
  for (const species of ['bell', 'gnaw', 'crest']) {
    flyTo(s, machineHome(s)); expect(atPlanetBase(s)).toBe(true); expect(preparePlanetNursery(s, species).ok).toBe(true);
    const animal = s.world.creatures.find(c => c.species === species)!;
    flyTo(s, animal.pos); expect(samplePlanetLife(s, { kind: 'creature', id: animal.id }).ok).toBe(true);
  }
  expect(KEYS.every(key => s.journey.ecology!.contacts.some(c => c.key === key))).toBe(true);
}
function populate(s: PlanetGame, biomeIndex: number): void {
  const biome = s.planet.biomes[biomeIndex]; flyTo(s, biome.pos);
  for (const key of KEYS) expect(introducePlanetLife(s, biome.id, key).ok, key).toBe(true);
}
function livingPlanet(seed = 481516): PlanetGame {
  const s = game(seed); research(s); expect(togglePlanetTool(s).ok).toBe(true);
  for (let i = 0; i < 3; i++) { until(s, () => s.planet.tScore >= i + 1); populate(s, i); expect(planetSupport(s)).toBe(i + 1); }
  expect(togglePlanetTool(s).ok).toBe(true); expect(s.planet.toolOn).toBe(false); return s;
}

describe('planet entry inherits the paid machine expedition', () => {
  it('preserves the actual P2 result after physical capture and all three regional deliveries', () => {
    const s = machineFixture(481516, false, false), tank = s.machines.fleet[0];
    const machineUntil = (done: () => boolean) => {
      for (let i = 0; i < 360 / DT && !done(); i++) { s.tick++; s.world.time += DT; stepMachines(s, DT); }
      expect(done()).toBe(true);
    };
    for (const spring of s.machines.springs.slice(0, 2)) {
      expect(issueMachineOrder(s, [tank.id], 'gather', { kind: 'spring', id: spring.id }).ok).toBe(true); machineUntil(() => spring.owner === 'player');
    }
    for (const region of s.machines.regions.slice(0, 2)) {
      expect(issueMachineOrder(s, [tank.id], 'build', { kind: 'region', id: region.id }).ok).toBe(true); machineUntil(() => region.owner === 'player');
    }
    expect(buildMachine(s, initialVehicle('air', 'restoration')).ok).toBe(true); const air = s.machines.fleet.at(-1)!;
    expect(issueMachineOrder(s, [air.id], 'build', { kind: 'region', id: s.machines.regions[2].id }).ok).toBe(true);
    machineUntil(() => machinesReady(s)); expect(s.machines.completed).toBe(true);
    expect(issueMachineOrder(s, [tank.id], 'move', { kind: 'point', pos: { ...machineHome(s) } }).ok).toBe(true);
    const before = structuredClone(s), world = s.world;
    expect(continueToPlanetEra(s)).toBe(true);
    expect(s.world).toBe(world); expect(s.world).toBe(s.worlds[2]); expect(s.worlds).toHaveLength(3);
    expect(s.machines.resource).toBe(before.machines.resource); expect(s.machines.blueprints).toEqual(before.machines.blueprints);
    expect(s.machines.regions).toEqual(before.machines.regions); expect(s.machines.springs).toEqual(before.machines.springs);
    expect(s.machines.fleet).toEqual(before.machines.fleet.map(u => ({ ...u, orders: [], intent: 'rest', cargo: 0 })));
    expect(s.world.obstacles).toEqual(before.world.obstacles); expect(s.world.creatures).toEqual(before.world.creatures);
    expect(s.world.resources.slice(0, -2)).toEqual(before.world.resources);
    expect(s.player).toEqual(before.player); expect(s.tribe).toEqual(before.tribe); expect(s.campaign).toEqual(before.campaign);
    expect(s.lineage.slice(0, -1)).toEqual(before.lineage); expect(s.lineage.at(-1)!.stage).toBe(5);
    expect(JSON.parse(s.checkpoint!).planet).toEqual(s.planet);
    const once = structuredClone(s); expect(continueToPlanetEra(s)).toBe(false); expect(s).toEqual(once);
  });

  it('rejects an unfinished expedition, missing fleet and wrong stage without mutation', () => {
    for (const change of [(s: MachineGame) => { s.machines.completed = false; }, (s: MachineGame) => { s.machines.fleet = []; }, (s: MachineGame) => { s.stage = 3; }, (s: MachineGame) => { s.deathReason = 'stopped'; }]) {
      const s = machineFixture(); change(s); const before = structuredClone(s);
      expect(continueToPlanetEra(s)).toBe(false); expect(s).toEqual(before);
    }
  });

  it('drives only the selected paid machine while the complete original body stays frozen', () => {
    const s = game(), air = select(s, 'air'), start = { ...air.pos }, other = structuredClone(s.machines.fleet[0]), player = structuredClone(s.player);
    const input = { ...IDLE, x: 1, z: 1, vertical: 1, sprint: true, feed: true, bond: true, tend: true, pulse: true };
    const tick = s.tick, time = s.world.time; stepGame(s, input, DT);
    expect(horizontalDistance(start, air.pos)).toBeCloseTo(vehicleStats(machineDesign(s.machines, air)).speed * DT, 8);
    expect(air.pos.y).toBeCloseTo(groundHeight(air.pos.x, air.pos.z, 2) + 15);
    expect(air.heading).toBeCloseTo(Math.PI / 4); expect(air.intent).toBe('move');
    expect(s.player).toEqual(player); expect(s.machines.fleet[0]).toEqual(other);
    expect(s.tick).toBe(tick + 1); expect(s.world.time).toBe(time + DT);
    const before = structuredClone(s); expect(evolve(s, structuredClone(s.player.genome)).ok).toBe(false); expect(s).toEqual(before);
  });

  it('sweeps a tank against the inherited closed cliff ring while the air carrier physically crosses it', () => {
    const s = game(), tank = select(s, 'tank'), summit = s.machines.regions[2].pos;
    const barrier = s.world.obstacles.filter(o => s.machines.barrierIds.includes(o.id)); expect(barrier).toHaveLength(16);
    // Prepared approach position outside the actual P2 ring; collision geometry
    // remains untouched. All attempted movement below uses the real Input path.
    const approach = { x: summit.x, y: groundHeight(summit.x, summit.z - 14, 2), z: summit.z - 14 };
    tank.pos = { ...approach }; let clearance = Infinity;
    for (let i = 0; i < 30 * 30; i++) {
      step(s, 1, { ...IDLE, z: 1 });
      for (const obstacle of barrier) clearance = Math.min(clearance, horizontalDistance(tank.pos, obstacle.pos) - obstacle.radius - 1.1);
    }
    expect(clearance).toBeGreaterThanOrEqual(-1e-6); expect(horizontalDistance(tank.pos, summit)).toBeGreaterThan(9);
    const air = select(s, 'air'); air.pos = { ...approach, y: approach.y + 15 };
    let crossed = false;
    for (let i = 0; i < 10 * 30 && horizontalDistance(air.pos, summit) > .3; i++) {
      const gap = summit.z - air.pos.z, speed = vehicleStats(machineDesign(s.machines, air)).speed;
      step(s, 1, { ...IDLE, z: Math.min(1, gap / (speed * DT)) });
      if (barrier.some(o => horizontalDistance(air.pos, o.pos) < o.radius + 1.1)) crossed = true;
      expect(air.pos.y).toBeCloseTo(groundHeight(air.pos.x, air.pos.z, 2) + 15);
    }
    expect(crossed).toBe(true); expect(horizontalDistance(air.pos, summit)).toBeLessThanOrEqual(.3);
  });
});

describe('ecological research requires reachable, consumed food', () => {
  it('does not grant taxa for observed sites, nearby creatures, target listing or nursery invitation', () => {
    const base = machineFixture(); base.journey.sites.forEach(site => { site.observed = true; }); base.world.patches.forEach(p => { p.discovered = true; });
    expect(continueToPlanetEra(base)).toBe(true); const s = base as PlanetGame;
    expect(s.journey.ecology!.contacts).toEqual([]);
    select(s, 'air'); flyTo(s, machineHome(s)); const stock = s.machines.resource, births = s.world.births;
    expect(preparePlanetNursery(s, 'bell').ok).toBe(true);
    expect(s.machines.resource).toBe(stock - 8); expect(s.world.births).toBe(births + 1);
    const creature = s.world.creatures.find(c => c.species === 'bell')!; expect(creature.health).toBeGreaterThan(0);
    expect(s.journey.ecology!.contacts).toEqual([]);
    flyTo(s, creature.pos); const before = structuredClone(s);
    expect(planetSampleTargets(s).some(t => t.target.kind === 'creature' && t.target.id === creature.id)).toBe(true);
    expect(s).toEqual(before); step(s, 300); expect(s.journey.ecology!.contacts).toEqual([]);
    const duplicate = structuredClone(s); flyTo(s, machineHome(s)); const atHome = structuredClone(s);
    expect(preparePlanetNursery(s, 'bell').ok).toBe(false); expect(s).toEqual(atHome); expect(duplicate.world.births).toBe(s.world.births);
  });

  it('consumes one real maternal culture portion and one compatible meal before recording their provenance', () => {
    const s = game(); select(s, 'air');
    const source = s.planet.nursery.sources[0], resource = s.world.resources.find(r => r.id === source.resourceId)!;
    const far = structuredClone(s); expect(samplePlanetLife(s, { kind: 'culture', id: source.resourceId }).ok).toBe(false); expect(s).toEqual(far);
    flyTo(s, resource.pos); const amount = resource.amount;
    expect(samplePlanetLife(s, { kind: 'culture', id: resource.id }).ok).toBe(true); expect(resource.amount).toBe(amount - 1);
    expect(s.journey.ecology!.contacts).toEqual([{ key: source.key, stage: 2, patch: 0, method: 'culture' }]);
    flyTo(s, machineHome(s)); expect(preparePlanetNursery(s, 'crest').ok).toBe(true);
    const predator = s.world.creatures.find(c => c.species === 'crest')!; flyTo(s, predator.pos);
    const meals = s.world.resources.filter(r => speciesById(predator.species).diet.includes(r.kind));
    const food = meals.reduce((sum, r) => sum + r.amount, 0), hunger = predator.hunger;
    expect(samplePlanetLife(s, { kind: 'creature', id: predator.id }).ok).toBe(true);
    expect(meals.reduce((sum, r) => sum + r.amount, 0)).toBe(food - 1); expect(predator.hunger).toBe(hunger - 42);
    expect(s.journey.ecology!.contacts.at(-1)).toEqual({ key: 'species:crest', stage: 2, patch: 0, method: 'feeding' });
  });

  it('rejects an inaccessible sample and a hungry animal without a real compatible meal atomically', () => {
    const s = game(); select(s, 'air'); flyTo(s, machineHome(s)); expect(preparePlanetNursery(s, 'crest').ok).toBe(true);
    const animal = s.world.creatures.find(c => c.species === 'crest')!; flyTo(s, animal.pos);
    // Prepared depletion, then exercise the public feeding action.
    s.world.resources.filter(r => r.kind === 'meat').forEach(r => { r.amount = 0; });
    const before = structuredClone(s); expect(samplePlanetLife(s, { kind: 'creature', id: animal.id }).ok).toBe(false); expect(s).toEqual(before);
    const source = s.planet.nursery.sources[0], resource = s.world.resources.find(r => r.id === source.resourceId)!;
    flyTo(s, { ...resource.pos, x: resource.pos.x + 4 });
    const u = planetVehicle(s)!;
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: (u.pos.x + resource.pos.x) / 2, y: resource.pos.y - 1, z: (u.pos.z + resource.pos.z) / 2 }, radius: .7, height: 30 });
    const blocked = structuredClone(s); expect(samplePlanetLife(s, { kind: 'culture', id: resource.id }).ok).toBe(false); expect(s).toEqual(blocked);
  });
});

describe('physical climate tools and radial T capacity', () => {
  it('uses both signed axes and exact radial boundaries', () => {
    for (const sign of [-1, 1]) {
      expect(planetTScore(.3 * sign, 0)).toBe(3); expect(planetTScore(.30001 * sign, 0)).toBe(2);
      expect(planetTScore(0, .65 * sign)).toBe(2); expect(planetTScore(0, .65001 * sign)).toBe(1);
      expect(planetTScore(.6 * sign, .8)).toBe(1); expect(planetTScore(.60001 * sign, .8)).toBe(0);
    }
    expect(planetTScore(.25, .25)).toBe(2); expect(planetTScore(.6, .6)).toBe(1); expect(planetTScore(.85, -.85)).toBe(0);
  });

  it('charges time spent working, raises water with the tank and cools with the paid air seeder', () => {
    const s = game(), before = structuredClone(s), tank = planetVehicle(s)!;
    expect(togglePlanetTool(s).ok).toBe(true); step(s, 300);
    expect(s.machines.resource).toBeCloseTo(before.machines.resource + (machineIncome(s.machines) - .25) * 10, 7);
    expect(s.planet.atmosphere).toBeGreaterThan(before.planet.atmosphere); expect(s.planet.temperature).toBeGreaterThan(before.planet.temperature); expect(tank.intent).toBe('work');
    select(s, 'air'); expect(s.planet.toolOn).toBe(false); const warm = s.planet.temperature;
    expect(togglePlanetTool(s).ok).toBe(true); step(s, 300); expect(s.planet.temperature).toBeLessThan(warm);
    expect(s.machines.blueprints).toEqual(before.machines.blueprints);
  });

  it('derives stronger terraforming from the more expensive installed module and stops when funds run out', () => {
    const normal = game(), upgraded = game(481516, true); select(normal, 'air'); select(upgraded, 'air');
    const plain = machineDesign(normal.machines, planetVehicle(normal)!), strong = machineDesign(upgraded.machines, planetVehicle(upgraded)!);
    expect(vehicleCost(strong)).toBeGreaterThan(vehicleCost(plain)); expect(vehicleStats(strong).power).toBeGreaterThan(vehicleStats(plain).power);
    togglePlanetTool(normal); togglePlanetTool(upgraded); step(normal, 300); step(upgraded, 300);
    expect(upgraded.planet.temperature).toBeLessThan(normal.planet.temperature); expect(upgraded.planet.atmosphere).toBeGreaterThan(normal.planet.atmosphere);
    // Prepared exhausted treasury with no inherited springs; no unpaid work.
    upgraded.machines.resource = 0; upgraded.machines.springs.forEach(p => { p.owner = 'neutral'; p.progress = 0; });
    step(upgraded); expect(upgraded.planet.toolOn).toBe(false); expect(upgraded.machines.resource).toBe(0);
  });

  it('rejects combat equipment as a climate tool and stale vehicle selection without changing the expedition', () => {
    const base = machineFixture(); expect(buildMachine(base, initialVehicle('tank', 'predator')).ok).toBe(true);
    expect(continueToPlanetEra(base)).toBe(true); const s = base as PlanetGame;
    expect(selectPlanetVehicle(s, s.machines.fleet.at(-1)!.id).ok).toBe(true);
    const before = structuredClone(s); expect(togglePlanetTool(s).ok).toBe(false); expect(s).toEqual(before);
    expect(selectPlanetVehicle(s, 999999).ok).toBe(false); expect(s).toEqual(before);
  });

  it('regresses from machine-achieved good climate all the way to T0 without living roots', () => {
    const s = game(481516, true); select(s, 'air'); togglePlanetTool(s); until(s, () => s.planet.tScore === 3);
    expect(planetSupport(s)).toBe(0); expect(s.planet.stabilizers).toEqual([]); expect(s.planet.completed).toBe(false);
    togglePlanetTool(s); const radius = Math.hypot(s.planet.temperature, s.planet.atmosphere); step(s, 180 * 30);
    expect(Math.hypot(s.planet.temperature, s.planet.atmosphere)).toBeGreaterThan(radius); expect(s.planet.tScore).toBe(0);
    expect(s.planet.stableTime).toBe(0); expect(s.planet.completed).toBe(false);
  });
});

describe('living trophic chains maintain and lose planetary support', () => {
  it('builds separate 2 + 2 + 1 chains through support 0 → 3 and sustains T3 after switching off tools', () => {
    const s = livingPlanet();
    expect(s.planet.stabilizers).toHaveLength(6); expect(s.planet.populations).toHaveLength(9);
    for (const b of s.planet.biomes) {
      const life = biomeLife(s, b); expect(life.roots).toHaveLength(2); expect(life.herbs).toHaveLength(2); expect(life.predators).toHaveLength(1); expect(life.support).toBe(true);
      expect(life.roots.every(r => livingRootStrength(s, r.site) >= .65)).toBe(true);
    }
    expect(new Set([...s.planet.stabilizers, ...s.planet.populations].map(c => c.id)).size).toBe(15);
    const food = s.planet.stabilizers.map(r => s.world.resources.find(v => v.id === r.site.plantedId)!.amount);
    step(s, 10); expect(s.planet.stabilizers.some((r, i) => s.world.resources.find(v => v.id === r.site.plantedId)!.amount !== food[i])).toBe(true);
    until(s, () => s.planet.completed, 120); expect(s.planet.stableTime).toBe(30); expect(s.planet.toolOn).toBe(false);
    step(s, 300 * 30); expect(planetSupport(s)).toBe(3); expect(s.planet.tScore).toBe(3);
    expect(s.planet.populations.every(c => c.nutrition > .9 && c.vitality > 90 && c.abundance >= .7)).toBe(true);
  });

  it('enforces local reach, research, climate, prior chain, species uniqueness and paid introductions', () => {
    const s = game(); research(s); const first = s.planet.biomes[0], second = s.planet.biomes[1];
    flyTo(s, first.pos); const cold = structuredClone(s); expect(introducePlanetLife(s, first.id, KEYS[0]).ok).toBe(false); expect(s).toEqual(cold);
    togglePlanetTool(s); until(s, () => s.planet.tScore >= 1);
    const funds = s.machines.resource; expect(introducePlanetLife(s, first.id, KEYS[0]).ok).toBe(true); expect(s.machines.resource).toBe(funds - 10);
    for (const key of [KEYS[0], 'species:lantern', 'culture:0', 'invalid:missing']) {
      const before = structuredClone(s); expect(introducePlanetLife(s, first.id, key).ok).toBe(false); expect(s).toEqual(before);
    }
    until(s, () => s.planet.tScore >= 2); flyTo(s, second.pos);
    const previous = structuredClone(s); expect(introducePlanetLife(s, second.id, KEYS[0]).ok).toBe(false); expect(s).toEqual(previous);
    const far = structuredClone(s); expect(introducePlanetLife(s, first.id, KEYS[1]).ok).toBe(false); expect(s).toEqual(far);
    flyTo(s, first.pos); s.machines.resource = 0;
    const poor = structuredClone(s); expect(introducePlanetLife(s, first.id, KEYS[1]).ok).toBe(false); expect(s).toEqual(poor);
  });

  it('starves herbivores and then predators after real roots are removed, with climate regression despite permanent completion history', () => {
    const s = livingPlanet(); until(s, () => s.planet.completed); s.planet.sandbox = true;
    const original = structuredClone(s.planet.populations), first = s.planet.biomes[0]; flyTo(s, first.pos);
    const roots = biomeLife(s, first).roots, resourceIds = roots.map(r => r.site.plantedId);
    for (const root of roots) expect(removePlanetLife(s, root.id).ok).toBe(true);
    expect(resourceIds.every(id => !s.world.resources.some(r => r.id === id))).toBe(true); expect(planetSupport(s)).toBe(0);
    step(s, 210 * 30);
    const life = biomeLife(s, first); expect(life.herbs.every(c => c.nutrition === 0 && c.vitality === 0 && c.abundance === 0)).toBe(true);
    expect(life.predators[0].nutrition).toBe(0); expect(life.predators[0].vitality).toBeLessThan(original.find(c => c.id === life.predators[0].id)!.vitality);
    expect(s.planet.tScore).toBe(0); expect(s.planet.completed).toBe(true); expect(s.planet.sandbox).toBe(true); expect(s.planet.stableTime).toBe(0);
  });

  it('loses support when the resource backing a historical root disappears, without granting historical completion as live strength', () => {
    const s = livingPlanet(), root = s.planet.stabilizers[0];
    // Prepared physical resource destruction while its historical site remains.
    s.world.resources = s.world.resources.filter(r => r.id !== root.site.plantedId);
    expect(livingRootStrength(s, root.site)).toBe(0); expect(planetSupport(s)).toBe(0);
    const vitality = root.site.vitality; step(s, 30); expect(root.site.vitality).toBeLessThan(vitality); expect(s.planet.completed).toBe(false);
  });

  it('cannot keep two herbivores alive on incompatible mineral cultures even with tools maintaining suitable climate', () => {
    const base = machineFixture();
    // Prepared historical culture pickups are real-contact evidence understood
    // by entry migration, not observation-based grants or invented new taxa.
    base.journey.insights.push('carry:1', 'carry:5');
    expect(continueToPlanetEra(base)).toBe(true); const s = base as PlanetGame; research(s); togglePlanetTool(s);
    until(s, () => s.planet.tScore >= 1); const biome = s.planet.biomes[0]; flyTo(s, biome.pos);
    for (const key of ['culture:1', 'culture:5', ...KEYS.slice(2)]) expect(introducePlanetLife(s, biome.id, key).ok).toBe(true);
    expect(planetSupport(s)).toBe(1); step(s, 180 * 30);
    const life = biomeLife(s, biome);
    expect(s.planet.tScore).toBeGreaterThanOrEqual(1); expect(s.planet.toolOn).toBe(true);
    expect(life.roots.every(r => livingRootStrength(s, r.site) >= .65)).toBe(true);
    expect(life.herbs.every(c => c.nutrition === 0 && c.vitality === 0)).toBe(true);
    expect(life.predators[0].nutrition).toBe(0); expect(planetSupport(s)).toBe(0);
    expect(life.roots.every(r => s.world.resources.find(v => v.id === r.site.plantedId)!.amount > 0)).toBe(true);
  });
});

describe('planet save continuity and deterministic fixed-step ecology', () => {
  it.each([481516, 20260913, 8675309])('restores the running tool, food chain and paid fleet for seed %i exactly', seed => {
    const s = game(seed); research(s); togglePlanetTool(s); until(s, () => s.planet.tScore >= 1); populate(s, 0); step(s, 37);
    makeCheckpoint(s); const saved = structuredClone(s), loaded = parseGame(serializeGame(s)) as PlanetGame;
    expect(loaded).toEqual(saved); expect(loaded.world).toBe(loaded.worlds[2]); expect(s).toEqual(saved);
    for (let i = 0; i < 1800; i++) {
      const input = { ...IDLE, x: i < 90 ? 1 : 0, z: i >= 90 && i < 180 ? -1 : 0 };
      step(s, 1, input); step(loaded, 1, input);
    }
    expect(loaded).toEqual(s); expect(parseGame(serializeGame(s))).toEqual(s);
    expect(s.planet.populations.some(c => c.nutrition > .8)).toBe(true); expect(s.machines.fleet).toHaveLength(2);
  });

  it('round-trips a self-sustaining T3 sandbox and continues the same living simulation', () => {
    const s = livingPlanet(); until(s, () => s.planet.completed); s.planet.sandbox = true; makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s)) as PlanetGame;
    expect(loaded).toEqual(s); step(s, 60 * 30); step(loaded, 60 * 30);
    expect(loaded).toEqual(s); expect(planetSupport(loaded)).toBe(3); expect(loaded.planet.tScore).toBe(3);
  });
});
