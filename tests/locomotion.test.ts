import { describe, expect, it } from 'vitest';
import { cloneGenome, computeStats, functionalProfile, genomeCost, initialGenome } from '../src/game/genome';
import { advanceLocomotion, mouthWorldPosition } from '../src/game/locomotion';
import type { PlanarMotion } from '../src/game/locomotion';
import type { AdaptationId, Genome, Part } from '../src/game/types';

function withPart(kind: AdaptationId, overrides: Partial<Part> = {}, source = initialGenome()): Genome {
  const genome = cloneGenome(source);
  if (kind === 'jaw') genome.parts = genome.parts.filter(part => part.kind !== 'filter');
  genome.parts.push({ id: `test-${kind}`, kind, axial: 0, angle: Math.PI / 2, scale: 1, mirrored: false, ...overrides });
  return genome;
}

/** Same cruising speed deliberately isolates steering from the existing mass/speed tradeoff. */
function turnTrajectory(genome: Genome, seconds: number, dt = 1 / 120) {
  const profile = functionalProfile(genome);
  let motion: PlanarMotion = { heading: 0, velocity: { x: 0, z: 5 } };
  let x = 0, z = 0;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    motion = advanceLocomotion(motion, { x: 1, z: 0 }, 5, profile, dt);
    x += motion.velocity.x * dt; z += motion.velocity.z * dt;
  }
  return { ...motion, x, z };
}

describe('anatomical action outputs', () => {
  it('keeps default feeding and vertical movement familiar without altering saved capacities or prices', () => {
    const genome = initialGenome(), original = cloneGenome(genome), stats = computeStats(genome), cost = genomeCost(genome);
    const profile = functionalProfile(genome);
    expect(profile.feedReach).toBeCloseTo(4.3);
    expect(profile.verticalThrust).toBe(3.2);
    expect(profile.turnRate).toBeCloseTo(4.785);
    expect(profile.currentResistance).toBe(1);
    expect(profile.gillExchange).toBe(0);
    expect(profile.toxinDamage).toBe(0);
    expect(profile.photosynthesis).toBe(0);
    expect(profile.partnerSupport).toBe(0);
    expect(genome).toEqual(original);
    expect(computeStats(genome)).toEqual(stats);
    expect(genomeCost(genome)).toBe(cost);
  });

  it('trades forward fin steering for aft fin resistance at identical investment and legacy stats', () => {
    const fore = withPart('fins', { axial: .8, mirrored: true });
    const aft = withPart('fins', { axial: -.8, mirrored: true });
    expect(computeStats(fore)).toEqual(computeStats(aft));
    expect(genomeCost(fore)).toBe(genomeCost(aft));
    expect(functionalProfile(fore).turnRate).toBeGreaterThan(functionalProfile(aft).turnRate * 1.12);
    expect(functionalProfile(aft).currentResistance).toBeGreaterThan(functionalProfile(fore).currentResistance);
    const forwardPath = turnTrajectory(fore, .25), aftPath = turnTrajectory(aft, .25);
    expect(forwardPath.x).toBeGreaterThan(aftPath.x + .04);
    expect(forwardPath.z).toBeLessThan(aftPath.z);
  });

  it('makes paired lateral fins steer more effectively while paying their existing mass and DNA cost', () => {
    const single = withPart('fins', { axial: .3 }), pair = withPart('fins', { axial: .3, mirrored: true });
    expect(functionalProfile(pair).turnRate).toBeGreaterThan(functionalProfile(single).turnRate);
    expect(functionalProfile(pair).currentResistance).toBeGreaterThan(functionalProfile(single).currentResistance);
    expect(computeStats(pair).mass).toBeGreaterThan(computeStats(single).mass);
    expect(genomeCost(pair)).toBeGreaterThan(genomeCost(single));
  });

  it('moves the feeding area with the organ, with no efficiency penalty for a rear-facing design', () => {
    const front = initialGenome(), rear = cloneGenome(front);
    rear.parts[1].axial = -.92;
    const a = functionalProfile(front), b = functionalProfile(rear);
    expect(a.feedReach).toBe(b.feedReach);
    expect(a.mouthOrigin.z).toBeGreaterThan(1.5);
    expect(b.mouthOrigin.z).toBeLessThan(-1.5);
    const food = { x: 0, y: a.mouthOrigin.y, z: 5 };
    const inReach = (p: typeof a) => Math.hypot(food.x - p.mouthOrigin.x, food.y - p.mouthOrigin.y, food.z - p.mouthOrigin.z) < p.feedReach;
    expect(inReach(a)).toBe(true);
    expect(inReach(b)).toBe(false);
    for (const p of [a, b]) expect(Math.hypot(p.mouthOrigin.x, p.mouthOrigin.y, p.mouthOrigin.z)).toBeLessThan(p.feedReach);
  });

  it('gives a longer body forward reach in exchange for its existing slower movement', () => {
    const short = { ...initialGenome(), length: .7 }, long = { ...initialGenome(), length: 2 };
    const a = functionalProfile(short), b = functionalProfile(long);
    expect(b.mouthOrigin.z + b.feedReach).toBeGreaterThan(a.mouthOrigin.z + a.feedReach + 1.5);
    expect(computeStats(long).speed).toBeLessThan(computeStats(short).speed);
    expect(b.turnRate).toBeLessThan(a.turnRate);
  });

  it('keeps center feeding reachable even for a minimum-size organ at the tip of a maximum-length body', () => {
    const genome = { ...initialGenome(), length: 2.4, width: 1.8 };
    genome.parts[1] = { ...genome.parts[1], axial: 1, scale: .55 };
    const profile = functionalProfile(genome);
    expect(profile.feedReach - Math.hypot(profile.mouthOrigin.x, profile.mouthOrigin.y, profile.mouthOrigin.z)).toBeGreaterThan(.79);
  });

  it('rotates lateral feeding organs and averages mirrored mouths around the body centerline', () => {
    const single = withPart('proboscis', { axial: .2, angle: Math.PI / 2 });
    const paired = cloneGenome(single); paired.parts.at(-1)!.mirrored = true;
    const a = functionalProfile(single), b = functionalProfile(paired);
    expect(a.mouthOrigin.x).toBeGreaterThan(.5);
    expect(b.mouthOrigin.x).toBeCloseTo(0);
    const position = { x: 10, y: 2, z: -4 }, world = mouthWorldPosition(a, position, Math.PI / 2);
    expect(world.x).toBeCloseTo(position.x + a.mouthOrigin.z);
    expect(world.y).toBeCloseTo(position.y + a.mouthOrigin.y);
    expect(world.z).toBeCloseTo(position.z - a.mouthOrigin.x);
  });

  it.each([
    ['gills', 'gillExchange'], ['toxin', 'toxinDamage'], ['bladder', 'verticalThrust'],
    ['chloroplast', 'photosynthesis'], ['symbiote', 'partnerSupport'], ['proboscis', 'feedReach'],
  ] as const)('scales %s output with diminishing returns while preserving investment tradeoffs', (kind, output) => {
    const genomes = [.55, 1, 1.65].map(scale => withPart(kind, { scale, angle: 0 }));
    const [small, normal, large] = genomes.map(genome => functionalProfile(genome)[output]);
    expect(normal).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(normal);
    expect((large - normal) / .65).toBeLessThan((normal - small) / .45);
    expect(genomeCost(genomes[2])).toBeGreaterThan(genomeCost(genomes[0]));
    expect(computeStats(genomes[2]).mass).toBeGreaterThan(computeStats(genomes[0]).mass);
  });

  it('retains normal organ outputs and makes exposed leaves gather more light at the same price', () => {
    expect(functionalProfile(withPart('gills')).gillExchange).toBeCloseTo(6);
    expect(functionalProfile(withPart('toxin')).toxinDamage).toBeCloseTo(18);
    expect(functionalProfile(withPart('toxin')).toxinRadius).toBeCloseTo(10);
    expect(functionalProfile(withPart('symbiote')).partnerSupport).toBeCloseTo(1);
    const top = withPart('chloroplast', { angle: 0 }), underside = withPart('chloroplast', { angle: Math.PI });
    expect(genomeCost(top)).toBe(genomeCost(underside));
    expect(functionalProfile(top).photosynthesis).toBeCloseTo(.25);
    expect(functionalProfile(top).photosynthesis).toBeGreaterThan(functionalProfile(underside).photosynthesis);
  });
});

describe('turn-limited planar locomotion', () => {
  it('accelerates smoothly, respects analog magnitude, and has no diagonal speed advantage', () => {
    const profile = functionalProfile(initialGenome()), rest = { heading: Math.PI / 4, velocity: { x: 0, z: 0 } };
    let full = rest, half = rest;
    for (let i = 0; i < 120; i++) {
      full = advanceLocomotion(full, { x: 1, z: 1 }, 5, profile, 1 / 60);
      half = advanceLocomotion(half, { x: Math.SQRT1_2 * .5, z: Math.SQRT1_2 * .5 }, 5, profile, 1 / 60);
    }
    expect(Math.hypot(full.velocity.x, full.velocity.z)).toBeCloseTo(5, 4);
    expect(Math.hypot(half.velocity.x, half.velocity.z)).toBeCloseTo(2.5, 4);
    const first = advanceLocomotion(rest, { x: 1, z: 1 }, 5, profile, 1 / 60);
    expect(Math.hypot(first.velocity.x, first.velocity.z)).toBeGreaterThan(0);
    expect(Math.hypot(first.velocity.x, first.velocity.z)).toBeLessThan(1);
  });

  it('turns actual travel along an arc and preserves speed instead of strafing or stopping', () => {
    const genome = initialGenome(), profile = functionalProfile(genome);
    const first = advanceLocomotion({ heading: 0, velocity: { x: 0, z: 5 } }, { x: 1, z: 0 }, 5, profile, 1 / 60);
    expect(first.heading).toBeCloseTo(profile.turnRate / 60);
    expect(first.velocity.z).toBeGreaterThan(4.9);
    expect(first.velocity.x).toBeGreaterThan(0);
    const settled = turnTrajectory(genome, .8);
    expect(settled.heading).toBeCloseTo(Math.PI / 2);
    expect(settled.velocity.x).toBeGreaterThan(4.99);
    expect(Math.hypot(settled.velocity.x, settled.velocity.z)).toBeCloseTo(5);
    expect(settled.z).toBeGreaterThan(.8);
  });

  it('gives a bulky armored organism a wider turn than a nimble body at the same cruising speed', () => {
    const bulky = withPart('shell', { scale: 1.65, mirrored: true }, { ...initialGenome(), length: 2.4, width: 1.8 });
    const nimble = turnTrajectory(initialGenome(), .6), armored = turnTrajectory(bulky, .6);
    expect(armored.heading).toBeLessThan(nimble.heading - .3);
    expect(armored.z).toBeGreaterThan(nimble.z + .7);
    expect(armored.x).toBeLessThan(nimble.x);
    expect(Math.hypot(armored.velocity.x, armored.velocity.z)).toBeCloseTo(5);
  });

  it('helps a stationary organism respond to a new heading and brakes predictably on release', () => {
    const profile = functionalProfile(initialGenome());
    const launch = advanceLocomotion({ heading: 0, velocity: { x: 0, z: 0 } }, { x: 1, z: 0 }, 5, profile, 1 / 60);
    expect(launch.heading).toBeGreaterThan(profile.turnRate / 60);
    expect(launch.heading).toBeLessThanOrEqual(profile.turnRate * 1.65 / 60 + 1e-12);
    let stopping: PlanarMotion = { heading: 0, velocity: { x: 0, z: 5 } };
    for (let i = 0; i < 60; i++) stopping = advanceLocomotion(stopping, { x: 0, z: 0 }, 5, profile, 1 / 60);
    expect(stopping.heading).toBe(0);
    expect(Math.hypot(stopping.velocity.x, stopping.velocity.z)).toBeLessThan(.002);
  });

  it('takes the short turn across the angle seam and does not mutate supplied state', () => {
    const state: PlanarMotion = { heading: Math.PI - .02, velocity: { x: .1, z: -5 } }, original = structuredClone(state);
    const result = advanceLocomotion(state, { x: -.02, z: -1 }, 5, functionalProfile(initialGenome()), 1 / 60);
    expect(Math.abs(Math.atan2(Math.sin(result.heading - state.heading), Math.cos(result.heading - state.heading)))).toBeLessThan(.05);
    expect(state).toEqual(original);
    expect(advanceLocomotion(state, { x: 1, z: 0 }, 5, functionalProfile(initialGenome()), 0)).toEqual(state);
  });

  it('produces comparable physical trajectories at 30 and 120 simulation steps per second', () => {
    const genome = withPart('fins', { mirrored: true, axial: .6 });
    const coarse = turnTrajectory(genome, 2, 1 / 30), fine = turnTrajectory(genome, 2, 1 / 120);
    expect(Math.hypot(coarse.x - fine.x, coarse.z - fine.z)).toBeLessThan(.15);
    expect(coarse.heading).toBeCloseTo(fine.heading, 8);
    expect(Math.hypot(coarse.velocity.x, coarse.velocity.z)).toBeCloseTo(Math.hypot(fine.velocity.x, fine.velocity.z), 8);
  });
});
