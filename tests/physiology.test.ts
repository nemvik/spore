import { describe, expect, it } from 'vitest';
import { cloneGenome, computeStats, functionalProfile, genomeCost, initialGenome } from '../src/game/genome';
import { advanceLocomotion } from '../src/game/locomotion';
import { locomotionProfile, reefRespiration } from '../src/game/physiology';
import { initializeJourneyStage, journeyAction } from '../src/game/journey';
import { reefConditions } from '../src/game/reef-layout';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import type { AdaptationId, Genome, Part } from '../src/game/types';

function attach(genome: Genome, kind: AdaptationId, overrides: Partial<Part> = {}): Genome {
  const next = cloneGenome(genome);
  next.parts.push({ id: `physiology-${kind}-${next.parts.length}`, kind, axial: 0, angle: Math.PI / 2, scale: 1, mirrored: false, ...overrides });
  return next;
}
function landBody(): Genome {
  const base = initialGenome(); base.parts = base.parts.filter(part => part.kind !== 'flagellum');
  return attach(attach(base, 'legs', { mirrored: true }), 'lungs');
}
function generalist(): Genome {
  return (['flagellum', 'gills', 'bladder', 'fins', 'proboscis', 'reservoir', 'chloroplast', 'eyes', 'toxin', 'symbiote'] as const)
    .reduce((genome, kind) => attach(genome, kind, { mirrored: kind === 'fins' }), landBody());
}

describe('movement in the organism’s actual medium', () => {
  it.each([0, 1] as const)('preserves existing water propulsion and control in stage %i', stage => {
    for (const genome of [initialGenome(), landBody(), generalist()]) {
      const stats = computeStats(genome), profile = functionalProfile(genome);
      expect(locomotionProfile(genome, stage)).toEqual({ speed: stats.speed * Math.max(.6, stats.swim), turnRate: profile.turnRate, acceleration: profile.acceleration, steeringGrip: profile.steeringGrip, verticalThrust: profile.verticalThrust });
    }
  });

  it.each([0, 1, 2] as const)('preserves historical movement exactly in legacy stage %i', stage => {
    for (const genome of [initialGenome(), landBody(), generalist()]) {
      const stats = computeStats(genome), profile = functionalProfile(genome);
      const medium = stage === 2 ? Math.max(.35, stats.walk) : Math.max(.6, stats.swim);
      const mobility = stage === 2 && !genome.parts.some(part => part.kind === 'legs') ? .08 : 1;
      expect(locomotionProfile(genome, stage, true)).toEqual({ speed: stats.speed * medium * mobility, turnRate: profile.turnRate, acceleration: profile.acceleration, steeringGrip: profile.steeringGrip, verticalThrust: profile.verticalThrust });
    }
  });

  it.each(['flagellum', 'fins', 'tail', 'jet'] as const)('%s cannot propel or steer a new land body', kind => {
    const base = landBody(), reference = locomotionProfile(base, 2);
    for (const scale of [.55, 1, 1.65]) for (const axial of [-.9, 0, .9]) for (const mirrored of [false, true]) {
      const changed = attach(base, kind, { scale, axial, mirrored });
      const motion = locomotionProfile(changed, 2);
      expect(motion.speed).toBeLessThan(reference.speed);
      expect(motion.acceleration).toBeLessThan(reference.acceleration);
      expect(motion.turnRate).toBeLessThan(reference.turnRate);
      expect(motion.steeringGrip).toBeLessThan(reference.steeringGrip);
      expect(motion.verticalThrust).toBe(0);
    }
    // These remain useful propulsive organs in their proper medium.
    expect(locomotionProfile(attach(base, kind), 1).speed).toBeGreaterThan(locomotionProfile(base, 1).speed);
  });

  it('makes fin placement irrelevant to ground steering while keeping its water trade-off', () => {
    const forward = attach(landBody(), 'fins', { axial: .9, mirrored: true });
    const aft = attach(landBody(), 'fins', { axial: -.9, mirrored: true });
    expect(locomotionProfile(forward, 2)).toEqual(locomotionProfile(aft, 2));
    expect(locomotionProfile(forward, 1).turnRate).toBeGreaterThan(locomotionProfile(aft, 1).turnRate);
  });

  it('lets a purpose-built land body cruise near five metres/s without discarding its health or diet', () => {
    const genome = landBody(), motion = locomotionProfile(genome, 2);
    expect(motion.speed).toBeGreaterThan(4.8); expect(motion.speed).toBeLessThan(5.3);
    expect(motion.acceleration).toBeGreaterThan(10);
    expect(computeStats(genome).diet).toContain('algae');
    const loaded = locomotionProfile(generalist(), 2);
    expect(loaded.speed).toBeGreaterThan(3.5);
    expect(loaded.speed).toBeLessThan(motion.speed);
    expect(loaded.acceleration).toBeLessThan(motion.acceleration);
  });

  it('makes useful leg growth improve drive with diminishing returns and real mass', () => {
    const small = landBody(); small.parts.find(part => part.kind === 'legs')!.scale = .55;
    const normal = landBody(), large = landBody(); large.parts.find(part => part.kind === 'legs')!.scale = 1.65;
    const values = [small, normal, large].map(genome => locomotionProfile(genome, 2));
    expect(values[1].speed).toBeGreaterThan(values[0].speed);
    expect(values[2].speed).toBeGreaterThan(values[1].speed);
    expect((values[2].speed - values[1].speed) / .65).toBeLessThan((values[1].speed - values[0].speed) / .45);
    expect(computeStats(large).mass).toBeGreaterThan(computeStats(small).mass);
    expect(genomeCost(large)).toBeGreaterThan(genomeCost(small));
  });

  it('turns more securely on central lateral legs than on tip or dorsal attachments', () => {
    const centred = landBody(), tip = cloneGenome(centred), dorsal = cloneGenome(centred);
    tip.parts.find(part => part.kind === 'legs')!.axial = .9;
    dorsal.parts.find(part => part.kind === 'legs')!.angle = 0;
    const reference = locomotionProfile(centred, 2);
    for (const changed of [tip, dorsal]) {
      expect(computeStats(changed)).toEqual(computeStats(centred));
      expect(genomeCost(changed)).toBe(genomeCost(centred));
      expect(locomotionProfile(changed, 2).speed).toBe(reference.speed);
      expect(locomotionProfile(changed, 2).turnRate).toBeLessThan(reference.turnRate);
      expect(locomotionProfile(changed, 2).steeringGrip).toBeLessThan(reference.steeringGrip);
    }
  });

  it('leaves a body without feet stationary under ordinary movement input', () => {
    const genome = attach(attach(initialGenome(), 'jet'), 'fins', { mirrored: true });
    const profile = locomotionProfile(genome, 2);
    expect(profile.speed).toBe(0);
    let motion = { heading: 0, velocity: { x: 0, z: 0 } };
    for (let frame = 0; frame < 120; frame++) motion = advanceLocomotion(motion, { x: 1, z: 1 }, profile.speed, profile, 1 / 60);
    expect(motion.velocity).toEqual({ x: 0, z: 0 });
    expect(locomotionProfile(genome, 0).speed).toBeGreaterThan(0);
  });

  it('shows the lighter gait in an actual turn trajectory, not only a stat label', () => {
    const corner = (genome: Genome) => {
      const profile = locomotionProfile(genome, 2);
      let motion = { heading: 0, velocity: { x: 0, z: profile.speed } }, x = 0;
      for (let frame = 0; frame < 15; frame++) {
        motion = advanceLocomotion(motion, { x: 1, z: 0 }, profile.speed, profile, 1 / 60);
        x += motion.velocity.x / 60;
      }
      return { ...motion, x };
    };
    const agile = corner(landBody()), loaded = corner(generalist());
    expect(agile.heading).toBeGreaterThan(loaded.heading);
    expect(agile.x).toBeGreaterThan(loaded.x + .05);
  });

  it('does not mutate the genome, prices, capacities or established profile', () => {
    const genome = generalist(), before = JSON.stringify(genome), stats = computeStats(genome), profile = functionalProfile(genome), cost = genomeCost(genome);
    for (const stage of [0, 1, 2] as const) for (const legacy of [false, true]) {
      const first = locomotionProfile(genome, stage, legacy);
      expect(locomotionProfile(genome, stage, legacy)).toEqual(first);
      expect(Object.values(first).every(Number.isFinite)).toBe(true);
    }
    expect(JSON.stringify(genome)).toBe(before);
    expect(computeStats(genome)).toEqual(stats);
    expect(functionalProfile(genome)).toEqual(profile);
    expect(genomeCost(genome)).toBe(cost);
  });
});

/** Prepared geometry comparisons, not a campaign or a human timing measurement. */
function reef(seed = 481516) {
  const state = createGame(seed, false);
  state.stage = 1; state.world = createWorld(seed, 1); state.worlds[1] = state.world;
  initializeJourneyStage(state);
  return state;
}

describe('respiration in the actual reef water', () => {
  it.each([481516, 20260913, 8675309])('makes exposed gills risky in the real vent core for seed %i', seed => {
    const state = reef(seed), source = state.journey.sites.find(site => site.id === 5)!.source;
    state.world.time = Math.PI / 2 / .55;
    const air = attach(initialGenome(), 'lungs'), gilled = attach(air, 'gills');
    expect(reefConditions(state.world, source).oxygenUse).toBeGreaterThan(5);
    const heldBreath = reefRespiration(air, state.world, source, .5);
    const exposedGills = reefRespiration(gilled, state.world, source, .5);
    expect(heldBreath).toBeLessThan(0);
    expect(exposedGills).toBeLessThan(heldBreath - 2);
    expect(exposedGills).toBeLessThan(-4);
    // More exchange surface cannot turn the chemical core into free oxygen.
    const large = cloneGenome(gilled); large.parts.find(part => part.kind === 'gills')!.scale = 1.65;
    expect(reefRespiration(large, state.world, source, .5)).toBeLessThan(heldBreath - 2);
  });

  it('keeps ordinary gills restorative in open water while stored air slowly runs down', () => {
    const state = reef(), pos = { x: 0, y: 4, z: 0 };
    const air = attach(initialGenome(), 'lungs'), gilled = attach(air, 'gills');
    expect(reefConditions(state.world, pos).oxygenUse).toBe(0);
    expect(reefRespiration(gilled, state.world, pos, 1)).toBeGreaterThan(2);
    expect(reefRespiration(air, state.world, pos, 0)).toBeLessThan(0);
    expect(reefRespiration(air, state.world, pos, 0)).toBeGreaterThan(-1);
  });

  it.each([481516, 20260913, 8675309])('keeps long-mouth sampling viable above the chemical core for seed %i', seed => {
    const state = reef(seed), source = state.journey.sites.find(site => site.id === 5)!.source;
    // Isolate mother-culture reach from incidental forage, which can now be
    // carried too. Keep every authored source so local reef chemistry is intact.
    const sourceIds = new Set(state.journey.sites.filter(site => site.stage === 1).map(site => site.sourceId));
    state.world.resources = state.world.resources.filter(resource => sourceIds.has(resource.id));
    expect(state.world.resources).toHaveLength(sourceIds.size);
    state.world.time = Math.PI / 2 / .55;
    for (const site of state.journey.sites.filter(site => site.stage === 1)) {
      site.observed = true; if (site.patch < 2) site.resolved = true;
    }
    const body = attach(attach(initialGenome(), 'lungs'), 'gills');
    const long = attach(body, 'proboscis', { scale: 1.65, mirrored: true, axial: .9, angle: 0 });
    state.player.pos = { ...source, y: source.y + 6.1 }; state.player.genome = long;
    expect(journeyAction(state)).toMatchObject({ ready: true, operation: 'take', site: { id: 5 } });
    expect(reefRespiration(long, state.world, state.player.pos, .5)).toBeGreaterThan(0);
    state.player.genome = body;
    expect(journeyAction(state)).toMatchObject({ ready: false, operation: 'take', site: { id: 5 } });
    expect(reefRespiration(body, state.world, source, .5)).toBeLessThan(-4);
  });

  it('preserves surface breathing and usable upper root refuges', () => {
    const state = reef(), roots = state.journey.sites.find(site => site.id === 4)!;
    const air = attach(initialGenome(), 'lungs'), gilled = attach(air, 'gills');
    for (const genome of [initialGenome(), air, gilled, generalist()]) {
      expect(reefRespiration(genome, state.world, { x: 0, y: 11, z: 40 }, 1)).toBe(6);
      expect(reefRespiration(genome, state.world, roots.refuges[0], 1)).toBe(6);
    }
    expect(reefConditions(state.world, roots.refuges[1]).oxygenUse).toBe(0);
    expect(reefRespiration(gilled, state.world, roots.refuges[1], 1)).toBeGreaterThan(0);
    // The existing +5/s planted-root recovery can comfortably restore a breath-holder here.
    expect(reefRespiration(air, state.world, roots.refuges[1], 1)).toBeGreaterThan(-5);
  });

  it('lets cover and the vent phase change the actual chemical burden', () => {
    const state = reef(), source = state.journey.sites.find(site => site.id === 5)!.source;
    const gilled = attach(initialGenome(), 'gills');
    state.world.time = Math.PI / 2 / .55;
    const peak = reefRespiration(gilled, state.world, source, .5);
    state.world.time = Math.PI * 1.5 / .55;
    expect(reefRespiration(gilled, state.world, source, .5)).toBeGreaterThan(peak);
    const side = { ...source, x: source.x - 2, z: source.z - 10 };
    expect(reefConditions(state.world, side).oxygenUse).toBeLessThan(reefConditions(state.world, source).oxygenUse);
    expect(reefRespiration(gilled, state.world, side, .5)).toBeGreaterThan(reefRespiration(gilled, state.world, source, .5));
  });

  it('charges active propulsion and scales the complete exchange by stored capacity', () => {
    const state = reef(), source = state.journey.sites.find(site => site.id === 5)!.source;
    const body = attach(initialGenome(), 'gills'), storage = attach(body, 'bladder');
    const resting = reefRespiration(body, state.world, source, 0);
    expect(reefRespiration(body, state.world, source, 1)).toBeLessThan(resting);
    expect(reefRespiration(body, state.world, source, 100)).toBe(reefRespiration(body, state.world, source, 1));
    expect(reefRespiration(body, state.world, source, -2)).toBe(resting);
    const withStorage = reefRespiration(storage, state.world, source, 0);
    expect(withStorage * computeStats(storage).oxygen).toBeCloseTo(resting * computeStats(body).oxygen, 10);
  });

  it('remains deterministic, finite and read-only without changing non-reef respiration', () => {
    const state = reef(), genome = generalist(), before = JSON.stringify({ world: state.world, genome });
    const source = state.journey.sites.find(site => site.id === 5)!.source;
    expect(reefRespiration(genome, state.world, source, Number.NaN)).toBe(reefRespiration(genome, state.world, source, 0));
    const rate = reefRespiration(genome, state.world, source, .5);
    expect(Number.isFinite(rate)).toBe(true);
    expect(reefRespiration(genome, state.world, source, .5)).toBe(rate);
    expect(JSON.stringify({ world: state.world, genome })).toBe(before);
    expect(reefRespiration(genome, createWorld(481516, 0), source, .5)).toBe(0);
    expect(reefRespiration(genome, createWorld(481516, 2), source, .5)).toBe(0);
  });
});
