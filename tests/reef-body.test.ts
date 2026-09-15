import { describe, expect, it } from 'vitest';
import { cloneGenome, computeStats, genomeCost, initialGenome, validateGenome } from '../src/game/genome';
import { advanceLocomotion } from '../src/game/locomotion';
import { locomotionProfile, reefRespiration } from '../src/game/physiology';
import { reefBodyProfile, reefBodyRespiration } from '../src/game/reef-body';
import { createWorld } from '../src/game/world';
import type { AdaptationId, Genome, Part } from '../src/game/types';

function attach(genome: Genome, kind: AdaptationId, changes: Partial<Part> = {}): Genome {
  const next = cloneGenome(genome);
  next.parts.push({ id: `reef-body-${kind}-${next.parts.length}`, kind, axial: 0, angle: Math.PI / 2, scale: 1, mirrored: false, ...changes });
  return next;
}
function pump(scale = 1.25): Genome {
  const body = initialGenome(); body.parts.find(part => part.kind === 'filter')!.scale = scale;
  return attach(attach(attach(body, 'gills'), 'fins', { mirrored: true }), 'toxin');
}
function diver(): Genome {
  const body = initialGenome(); body.width = .7; body.parts = body.parts.filter(part => part.kind !== 'filter');
  return attach(attach(attach(body, 'jaw', { axial: .85 }), 'lungs'), 'fins', { scale: .7, mirrored: true });
}
const world = createWorld(481516, 1), depth = { x: 0, y: 0, z: 0 };

describe('opt-in reef body choices', () => {
  it('exchanges useful local purification for a substantial reversible swimming brake', () => {
    const body = pump(), closed = reefBodyProfile(body), open = reefBodyProfile(body, 1);
    expect(open.purification).toBeGreaterThan(.5); expect(open.filterRadius).toBeGreaterThan(2);
    expect(open.pumpEnergy).toBeGreaterThan(0);
    expect(open.motion.speed).toBeLessThan(closed.motion.speed * .6);
    expect(open.motion.acceleration).toBeLessThan(closed.motion.acceleration);
    expect(open.motion.verticalThrust).toBeLessThan(closed.motion.verticalThrust);
    expect(open.span).toBeGreaterThanOrEqual(closed.span);
    expect(reefBodyProfile(body, 0)).toEqual(closed);
    expect(closed.purification).toBe(0); expect(closed.filterRadius).toBe(0); expect(closed.pumpEnergy).toBe(0);
  });

  it('makes larger filters clean more, occupy more space and cost more movement and energy', () => {
    const profiles = [.55, 1, 1.5, 1.65].map(scale => reefBodyProfile(pump(scale), 1));
    for (let i = 1; i < profiles.length; i++) {
      expect(profiles[i].purification).toBeGreaterThan(profiles[i - 1].purification);
      expect(profiles[i].filterRadius).toBeGreaterThan(profiles[i - 1].filterRadius);
      expect(profiles[i].pumpEnergy).toBeGreaterThan(profiles[i - 1].pumpEnergy);
      expect(profiles[i].motion.speed).toBeLessThan(profiles[i - 1].motion.speed);
      expect(profiles[i].span).toBeGreaterThanOrEqual(profiles[i - 1].span);
    }
    // A medium crown already changes the water; the largest one is not a key.
    expect(profiles[1].purification).toBeGreaterThan(.5);
    expect(profiles[3].purification - profiles[2].purification).toBeLessThan(profiles[2].purification - profiles[1].purification);
  });

  it('makes forward and sheltered rear filters different at exactly the same price', () => {
    const front = pump(), rear = cloneGenome(front);
    rear.parts.find(part => part.kind === 'filter')!.axial = -.9;
    const exposed = reefBodyProfile(front, 1), sheltered = reefBodyProfile(rear, 1);
    expect(genomeCost(front)).toBe(genomeCost(rear));
    expect(exposed.purification).toBeGreaterThan(sheltered.purification);
    expect(exposed.motion.speed).toBeLessThan(sheltered.motion.speed);
    expect(sheltered.purification).toBeGreaterThan(0);
  });

  it('lets larger fins hold a line better while increasing drag and span', () => {
    const small = pump(), broad = cloneGenome(small);
    small.parts.find(part => part.kind === 'fins')!.scale = .7;
    broad.parts.find(part => part.kind === 'fins')!.scale = 1.5;
    const agile = reefBodyProfile(small), steady = reefBodyProfile(broad);
    expect(steady.motion.steeringGrip).toBeGreaterThan(agile.motion.steeringGrip);
    expect(steady.motion.speed).toBeLessThan(agile.motion.speed);
    expect(steady.span).toBeGreaterThan(agile.span);
    const aft = cloneGenome(broad), fore = cloneGenome(broad);
    aft.parts.find(part => part.kind === 'fins')!.axial = -.9;
    fore.parts.find(part => part.kind === 'fins')!.axial = .9;
    expect(reefBodyProfile(fore).motion.turnRate).toBeGreaterThan(reefBodyProfile(aft).motion.turnRate);
    expect(reefBodyProfile(aft).motion.steeringGrip).toBeGreaterThan(reefBodyProfile(fore).motion.steeringGrip);
  });

  it('keeps the air-and-jaw route mobile and entirely usable without a pumping organ', () => {
    const body = diver(), profile = reefBodyProfile(body, 1);
    expect(validateGenome(body, 1)).toEqual([]);
    expect(profile).toEqual(reefBodyProfile(body, 0));
    expect(profile.purification).toBe(0); expect(profile.pumpEnergy).toBe(0); expect(profile.filterRadius).toBe(0);
    expect(profile.motion.speed).toBeGreaterThan(reefBodyProfile(pump(), 1).motion.speed);
    expect(profile.motion.verticalThrust - profile.buoyancy).toBeGreaterThan(1);
  });

  it('trades a larger air reserve for lift and harder descent, with useful heavy ballast', () => {
    const body = diver(), larger = cloneGenome(body);
    larger.parts.find(part => part.kind === 'lungs')!.scale = 1.65;
    const ordinary = reefBodyProfile(body), inflated = reefBodyProfile(larger), ballast = reefBodyProfile(attach(larger, 'shell'));
    expect(inflated.breathCapacity).toBeGreaterThan(ordinary.breathCapacity);
    expect(inflated.buoyancy).toBeGreaterThan(ordinary.buoyancy);
    expect(inflated.motion.verticalThrust - inflated.buoyancy).toBeLessThan(ordinary.motion.verticalThrust - ordinary.buoyancy);
    expect(ballast.buoyancy).toBeLessThan(inflated.buoyancy);
    expect(ballast.motion.speed).toBeLessThan(inflated.motion.speed);
  });

  it('keeps slender and broad bodies physically different without requiring either shape', () => {
    const narrow = diver(), broad = cloneGenome(narrow); broad.width = 1.6;
    const a = reefBodyProfile(narrow), b = reefBodyProfile(broad);
    expect(a.motion.speed).toBeGreaterThan(b.motion.speed); expect(a.span).toBeLessThan(b.span);
    expect(b.motion.speed).toBeGreaterThan(1); expect(b.motion.verticalThrust).toBeGreaterThan(b.buoyancy);
  });

  it('produces a different actual movement response while the crown opens, then recovers when closed', () => {
    const body = pump(1.5), run = (opening: number) => {
      const profile = reefBodyProfile(body, opening).motion;
      let state = { heading: 0, velocity: { x: 0, z: 0 } }, z = 0;
      for (let i = 0; i < 120; i++) { state = advanceLocomotion(state, { x: 0, z: 1 }, profile.speed, profile, 1 / 60); z += state.velocity.z / 60; }
      return { state, z };
    };
    const closed = run(0), open = run(1);
    expect(closed.z).toBeGreaterThan(open.z * 2);
    const restored = reefBodyProfile(body, 0).motion;
    let motion = open.state;
    for (let i = 0; i < 60; i++) motion = advanceLocomotion(motion, { x: 0, z: 1 }, restored.speed, restored, 1 / 60);
    expect(motion.velocity.z).toBeGreaterThan(open.state.velocity.z * 2);
  });
});

describe('reef respiration and pure integration contract', () => {
  it('lets a working pump protect gills while an air diver spends a finite reserve without cleaning', () => {
    const body = pump(1.5), profile = reefBodyProfile(body, 1);
    const raw = reefBodyRespiration(body, world, depth, 1, 6.6);
    const clean = reefBodyRespiration(body, world, depth, 1, 6.6 * (1 - profile.purification));
    expect(raw).toBeLessThan(-4); expect(clean).toBeGreaterThan(raw * .1);
    const air = reefBodyRespiration(diver(), world, depth, 1, 6.6);
    expect(air).toBeLessThan(0); expect(air).toBeGreaterThan(raw);
    expect(reefBodyRespiration(diver(), world, depth, 1, 0)).toBeLessThan(0);
    expect(reefBodyRespiration(diver(), world, { ...depth, y: 11 }, 1, 6.6)).toBeGreaterThan(0);
  });

  it('preserves air exchange per capacity and never applies reef breathing to other stages', () => {
    const body = diver();
    for (const gas of [0, 2, 6.6]) for (const effort of [0, .5, 1]) {
      const before = reefRespiration(body, world, depth, effort, gas) * computeStats(body).oxygen;
      const after = reefBodyRespiration(body, world, depth, effort, gas) * reefBodyProfile(body).breathCapacity;
      expect(after).toBeCloseTo(before, 10);
    }
    for (const stage of [0, 2] as const) expect(reefBodyRespiration(body, createWorld(481516, stage), depth, 1, 6.6)).toBe(0);
  });

  it('is deterministic and leaves genomes, world state, global prices and historical profiles unchanged', () => {
    const body = pump(), before = JSON.stringify({ body, world }), price = genomeCost(body);
    const historical = [0, 1, 2].map(stage => locomotionProfile(body, stage as 0 | 1 | 2, true));
    const stats = computeStats(body), expected = reefBodyProfile(body, .4);
    expect(reefBodyProfile(body, .4)).toEqual(expected);
    reefBodyRespiration(body, world, depth, .5, 3);
    expect(JSON.stringify({ body, world })).toBe(before); expect(genomeCost(body)).toBe(price); expect(computeStats(body)).toEqual(stats);
    expect([0, 1, 2].map(stage => locomotionProfile(body, stage as 0 | 1 | 2, true))).toEqual(historical);
  });

  it('bounds the latch, stays continuous at closure and keeps legal extremes finite and controllable', () => {
    const body = pump();
    expect(reefBodyProfile(body, -1)).toEqual(reefBodyProfile(body, 0));
    expect(reefBodyProfile(body, 2)).toEqual(reefBodyProfile(body, 1));
    for (const value of [NaN, Infinity, -Infinity]) expect(reefBodyProfile(body, value)).toEqual(reefBodyProfile(body, 0));
    const nearClosed = reefBodyProfile(body, 1e-8);
    expect(nearClosed.purification).toBeLessThan(1e-6); expect(nearClosed.filterRadius).toBeLessThan(.001);
    for (const width of [.55, 1.8]) for (const scale of [.55, 1.65]) for (const mirrored of [false, true]) {
      const extreme = attach(attach(pump(scale), 'lungs', { scale, mirrored }), 'bladder', { scale, mirrored });
      extreme.width = width; extreme.length = 2.4;
      expect(validateGenome(extreme, 1)).toEqual([]);
      for (const opening of [0, .5, 1]) {
        const p = reefBodyProfile(extreme, opening);
        expect([...Object.values(p.motion), p.purification, p.filterRadius, p.pumpEnergy, p.buoyancy, p.breathCapacity, p.span].every(Number.isFinite)).toBe(true);
        expect(p.purification).toBeGreaterThanOrEqual(0); expect(p.purification).toBeLessThan(.9);
        expect(Object.values(p.motion).every(value => value > 0)).toBe(true);
      }
      const closed = reefBodyProfile(extreme);
      expect(closed.motion.verticalThrust - closed.buoyancy).toBeGreaterThan(1);
    }
  });
});
