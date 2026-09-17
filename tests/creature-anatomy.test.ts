import { describe, expect, it } from 'vitest';
import { creatureAttachment, creatureSurfacePoint, resolveCreatureAnatomy, validateCreatureStance, creatureMouths, reachableCreatureMouth } from '../src/game/creature-anatomy';
import { bodyGroundClearance, jawContacts, organismGroundClearance } from '../src/game/anatomy';
import { computeStats, functionalProfile, validateGenome } from '../src/game/genome';
import { bodyVolume, bodyWidth } from '../src/game/body-shape';
import { validateCreatureStructure } from '../src/game/creature-body';
import { creatureBodyFixture } from './fixtures/creature-bodies';

const magnitude = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
describe('shared creature anatomy', () => {
  it.each(['biped', 'quadruped', 'longneck'] as const)('resolves %s supports without stretching or mutating genes', kind => {
    const g = creatureBodyFixture(kind), before = structuredClone(g), a = resolveCreatureAnatomy(g);
    const feet = a.limbs.filter(l => l.end.kind === 'foot');
    expect(feet).toHaveLength(kind === 'biped' ? 2 : 4);
    expect(feet[0].points.at(-1)!.x).toBeCloseTo(-feet[1].points.at(-1)!.x, 8);
    expect(a.supportCount).toBe(feet.length); expect(a.stanceErrors).toEqual([]);
    expect(organismGroundClearance(g)).toBe(a.groundClearance);
    expect(a.hull.length).toBeGreaterThan(0); expect(a.bodyVolume).toBeGreaterThan(0);
    expect(g).toEqual(before);
  });
  it('applies limb scale and left-side reflection once', () => {
    const g = creatureBodyFixture('biped'), part = g.parts.find(p => p.kind === 'legs')!; part.scale = 1.5;
    const limbs = resolveCreatureAnatomy(g).limbs.filter(l => l.partId === part.id);
    expect(limbs[0].points[1].x - limbs[0].root.x).toBeCloseTo(.72, 10);
    expect(limbs[1].points[1].x - limbs[1].root.x).toBeCloseTo(-.72, 10);
    expect(limbs[0].radii[0]).toBeCloseTo(.2025, 10);
    expect(limbs[0].end).toMatchObject({ kind: 'foot', scale: 1.5 });
    expect(limbs[0].lengths[0]).toBeCloseTo(Math.hypot(.48, -.34, -.14) * 1.5, 10);
  });
  it('uses the ribbed bent surface and an outward orthonormal frame at every attachment', () => {
    const g = creatureBodyFixture('longneck'), axial = .75, angle = .6;
    const f = creatureAttachment(g, axial, angle);
    // Halfway between .6 and .9: width .525, height .55, bend 1.75.
    const profile = (1 - axial * axial) ** .48 * (1 + .15 * axial);
    const rib = 1 + .035 * Math.sin((axial + 1) / 2 * 7 * Math.PI) * Math.cos(angle) ** 2;
    expect(f.point.x).toBeCloseTo(Math.sin(angle) * .69 * profile * rib * .525, 10);
    expect(f.point.y).toBeCloseTo(Math.cos(angle) * .62 * profile * rib * .55 + .13 * axial ** 2 + 1.75, 10);
    expect(f.point).toEqual(creatureSurfacePoint(g, axial, angle));
    expect(magnitude(f.normal)).toBeCloseTo(1, 10); expect(magnitude(f.tangent)).toBeCloseTo(1, 10);
    expect(f.normal.x * f.tangent.x + f.normal.y * f.tangent.y + f.normal.z * f.tangent.z).toBeCloseTo(0, 8);
    expect(f.normal.x * f.point.x + f.normal.y * (f.point.y - .13 * axial ** 2 - 1.75)).toBeGreaterThan(0);
    expect(f.tangent.z).toBeGreaterThan(0);
    for (const pole of [-1, 1]) expect(Object.values(creatureAttachment(g, pole, angle)).every(v => Number.isFinite(magnitude(v)))).toBe(true);
  });
  it('normalizes neutral volume and grows tissue mass with limb radius and trunk sections', () => {
    const g = creatureBodyFixture('biped'), large = structuredClone(g);
    expect(resolveCreatureAnatomy(g).bodyVolume).toBeCloseTo(1, 10);
    large.parts.find(p => p.kind === 'legs')!.limb!.joints[0].radius += .05;
    expect(computeStats(large).mass).toBeGreaterThan(computeStats(g).mass);
    large.body.spine.forEach(n => { n.width = 2; n.height = 2; });
    expect(resolveCreatureAnatomy(large).bodyVolume).toBeCloseTo(4, 10);
    expect(bodyVolume(large)).toBeCloseTo(4, 10); expect(bodyWidth(large)).toBe(2);
  });
  it('keeps the trunk above the floor when a low spine node lies between section samples', () => {
    const g = creatureBodyFixture('biped');
    Object.assign(g.body.spine[3], { axial: .04, bend: -2.5, height: 2 });
    const clearance = bodyGroundClearance(g);
    for (let i = 0; i <= 2000; i++) expect(creatureSurfacePoint(g, -1 + i / 1000, Math.PI).y + clearance).toBeGreaterThanOrEqual(-1e-8);
  });
  it('rejects an unreachable common stance while retaining a finite resting draft', () => {
    const g = creatureBodyFixture('quadruped');
    g.body.spine.forEach(n => { n.bend = 2.5; });
    const leg = g.parts.find(p => p.kind === 'legs')!;
    leg.angle = 0; leg.limb!.joints = [
      { id: 'knee', offset: { x: 0, y: -.2, z: 0 }, radius: .1 },
      { id: 'ankle', offset: { x: 0, y: -.4, z: 0 }, radius: .1 },
    ];
    expect(validateCreatureStructure(g)).toEqual([]);
    const errors = validateCreatureStance(g);
    expect(errors.join(' ')).toContain(leg.id); expect(errors.join(' ')).toMatch(/prodlou|úchyt/);
    expect(validateGenome(g, 2)).not.toEqual([]);
    expect(Number.isFinite(resolveCreatureAnatomy(g).groundClearance)).toBe(true);
  });
  it('uses the minimum folded reach as well as maximum length when finding a common height', () => {
    const g = creatureBodyFixture('quadruped');
    const legs = g.parts.filter(p => p.kind === 'legs');
    legs[0].limb!.joints = [
      { id: 'knee', offset: { x: 0, y: -1.5, z: 0 }, radius: .1 },
      { id: 'ankle', offset: { x: 0, y: -1.7, z: 0 }, radius: .1 },
    ];
    legs[1].limb!.joints = [
      { id: 'knee', offset: { x: 0, y: -.4, z: 0 }, radius: .1 },
      { id: 'ankle', offset: { x: 0, y: -.8, z: 0 }, radius: .1 },
    ];
    // Each pair alone has a valid height above the body; their intervals do not overlap.
    for (const leg of legs) {
      const alone = structuredClone(g); alone.parts = alone.parts.filter(p => p.kind !== 'legs' || p.id === leg.id);
      expect(validateCreatureStance(alone)).toEqual([]);
    }
    expect(validateCreatureStance(g).length).toBeGreaterThan(0);
  });
  it('rejects fewer than two feet even when arms have hands', () => {
    const g = creatureBodyFixture('biped'); g.parts.find(p => p.kind === 'legs')!.mirrored = false;
    expect(validateCreatureStance(g).length).toBeGreaterThan(0);
  });
  it('orients every real jaw contact along the bent local forward tangent', () => {
    const g = creatureBodyFixture('longneck'), jaw = g.parts.find(p => p.kind === 'jaw')!; jaw.axial = .75; jaw.mirrored = true;
    const contacts = jawContacts(g); expect(contacts).toHaveLength(2);
    const frame = creatureAttachment(g, .75, .22);
    expect(contacts[0].mouthOrigin.y).toBeCloseTo(frame.point.y + .41 * frame.tangent.y, 10);
    expect(contacts[0].mouthOrigin.x).toBeCloseTo(-contacts[1].mouthOrigin.x, 10);
  });
  it('selects an actual reachable mouth of the right diet and has no implicit mouth', () => {
    const g = creatureBodyFixture('biped'), jaw = g.parts.find(p => p.kind === 'jaw')!; jaw.mirrored = true; jaw.angle = Math.PI / 2;
    g.parts.push({ id: 'nectar', kind: 'proboscis', axial: -.9, angle: 0, scale: 1, mirrored: false });
    const mouths = creatureMouths(g); expect(mouths).toHaveLength(3);
    const target = { ...mouths[1].mouthOrigin };
    expect(reachableCreatureMouth(g, target, 'meat', () => false)?.mouthOrigin).toEqual(mouths[1].mouthOrigin);
    expect(reachableCreatureMouth(g, target, 'meat', () => true)).toBeNull();
    expect(reachableCreatureMouth(g, { x: 0, y: 0, z: 100 }, 'nectar', () => false)).toBeNull();
    expect(mouths.filter(m => m.diet.includes('nectar'))).toHaveLength(1);
    expect(functionalProfile(g).mouthOrigin).toEqual(mouths[0].mouthOrigin);
    g.parts = g.parts.filter(p => p.kind !== 'jaw' && p.kind !== 'proboscis');
    expect(creatureMouths(g)).toEqual([]); expect(functionalProfile(g).feedReach).toBe(0);
    expect(computeStats(g).diet).toEqual([]);
    expect(reachableCreatureMouth(g, { x: 0, y: 0, z: 0 }, 'detritus', () => false)).toBeNull();
  });
});
