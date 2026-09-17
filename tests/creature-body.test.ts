import { describe, expect, it } from 'vitest';
import { CREATURE_ADAPTATIONS, ADAPTATIONS, adaptationsForGenome, getAdaptation } from '../src/game/adaptation-catalog';
import { cloneBlueprint, fromGenome, initialVehicle, toGenome, validateVehicle } from '../src/game/blueprint';
import { neutralSpine, spineAxial } from '../src/game/body-shape';
import { sampleCreatureSection, upgradeCreatureGenome, validateCreatureStructure } from '../src/game/creature-body';
import { cloneGenome, initialGenome, validateGenome } from '../src/game/genome';
import type { CreatureGenome, LegacyGenome } from '../src/game/types';
import { creatureBodyFixture } from './fixtures/creature-bodies';

describe('versioned creature genomes', () => {
  it('keeps the historical catalogue exact and gates arms to v2 land creatures', () => {
    expect(ADAPTATIONS).toHaveLength(21);
    expect(CREATURE_ADAPTATIONS).toHaveLength(22);
    expect(getAdaptation('arms')).toMatchObject({ id: 'arms', category: 'movement', cost: 18 });
    expect(adaptationsForGenome(1, 5).some(item => item.id === 'arms')).toBe(false);
    expect(adaptationsForGenome(2, 1).some(item => item.id === 'arms')).toBe(false);
    expect(adaptationsForGenome(2, 2).some(item => item.id === 'arms')).toBe(true);
  });

  it('discriminates v1 and v2 and does not upgrade a historical genome just by opening the editor', () => {
    const old: LegacyGenome = initialGenome();
    expect(old.version).toBe(1);
    expect(toGenome(fromGenome(old))).toEqual(old);
    expect(toGenome(fromGenome(old))).not.toHaveProperty('body');
    expect(validateGenome(old, 0)).toEqual([]);
    expect(validateGenome(creatureBodyFixture('biped'), 1).length).toBeGreaterThan(0);
    expect(validateGenome(creatureBodyFixture('biped'), 2)).toEqual([]);
  });

  it('upgrades the historical body as a pure exact seven-section conversion', () => {
    const old = initialGenome();
    old.parts.push({ id: 'legs', kind: 'legs', axial: -0.2, angle: 1, scale: 1, mirrored: true });
    const before = structuredClone(old);
    const converted = upgradeCreatureGenome(old);
    expect(old).toEqual(before);
    expect(converted).toMatchObject({ version: 2, name: old.name, length: old.length, width: old.width, hue: old.hue, pattern: old.pattern });
    expect(converted).not.toHaveProperty('spine');
    expect(converted.body.skin).toEqual({ finish: 'smooth', secondaryHue: old.hue, contrast: 0.5, patternScale: 1 });
    expect(converted.body.spine).toEqual(neutralSpine().map((node, index) => ({ id: `spine-${index}`, axial: spineAxial(index), ...node })));
    expect(converted.parts.find(part => part.kind === 'legs')?.limb).toEqual({
      joints: [
        { id: 'legs-joint-0', offset: { x: 0.48, y: -0.34, z: -0.14 }, radius: 0.135 },
        { id: 'legs-joint-1', offset: { x: 0.77, y: -1.14, z: 0.16 }, radius: 0.1 },
      ],
      end: { kind: 'foot', style: 'pad', scale: 1 },
    });
    expect(converted.parts.some(part => part.kind === 'lungs')).toBe(false);
  });

  it('samples articulated sections at nodes and between them without overshoot', () => {
    const g = creatureBodyFixture('longneck');
    expect(sampleCreatureSection(g, 0.6)).toEqual({ width: 0.4, height: 0.45, bend: 1.4 });
    const section = sampleCreatureSection(g, 0.75);
    expect(section.width).toBeGreaterThanOrEqual(0.4);
    expect(section.width).toBeLessThanOrEqual(0.65);
    expect(section.height).toBeGreaterThanOrEqual(0.45);
    expect(section.height).toBeLessThanOrEqual(0.65);
    expect(section.bend).toBeGreaterThanOrEqual(1.4);
    expect(section.bend).toBeLessThanOrEqual(2.1);
  });

  it.each(['biped', 'quadruped', 'longneck'] as const)('constructs a valid independent %s fixture', kind => {
    const first = creatureBodyFixture(kind), second = creatureBodyFixture(kind);
    expect(validateCreatureStructure(first)).toEqual([]);
    expect(validateGenome(first, 2)).toEqual([]);
    first.body.spine[0].width = 1.5;
    first.parts.find(part => part.limb)!.limb!.joints[0].offset.y -= 0.1;
    expect(second.body.spine[0].width).toBe(1);
    expect(second.parts.find(part => part.limb)!.limb!.joints[0].offset.y).toBe(-0.34);
  });

  it('copies every nested joint through blueprint history', () => {
    const g = creatureBodyFixture('biped');
    const draft = fromGenome(g);
    const undo = cloneBlueprint(draft);
    draft.parts.find(p => p.kind === 'legs')!.limb!.joints[0].offset.y -= 0.1;
    expect(toGenome(undo)).toEqual(g);
    expect(toGenome(draft)).not.toEqual(g);
    expect(validateVehicle(initialVehicle('tank', 'restoration'))).toEqual([]);
  });

  it('deep-clones skin, spines, limbs, joints and offsets', () => {
    const original = creatureBodyFixture('biped'), copy = cloneGenome(original) as CreatureGenome;
    copy.body.skin.secondaryHue = 20;
    copy.body.spine[0].bend = 1;
    copy.parts.find(part => part.kind === 'arms')!.limb!.joints[0].offset.x = 4;
    expect(original.body.skin.secondaryHue).toBe(168);
    expect(original.body.spine[0].bend).toBe(0);
    expect(original.parts.find(part => part.kind === 'arms')!.limb!.joints[0].offset.x).toBe(0.3);
  });
});

describe('bounded articulated structure validation', () => {
  const invalid = (mutate: (g: CreatureGenome) => void) => {
    const g = creatureBodyFixture('biped');
    mutate(g);
    expect(validateCreatureStructure(g).length).toBeGreaterThan(0);
  };

  it('rejects duplicate IDs and reversed or collapsed vertebrae', () => {
    invalid(g => { g.body.spine[1].id = g.body.spine[0].id; });
    invalid(g => { g.body.spine[2].axial = g.body.spine[1].axial - 0.01; });
    invalid(g => { g.body.spine[2].axial = g.body.spine[1].axial + 0.07; });
    invalid(g => { g.parts[1].id = g.parts[0].id; });
    invalid(g => { g.parts.find(part => part.limb)!.limb!.joints[1].id = g.parts.find(part => part.limb)!.limb!.joints[0].id; });
  });

  it('rejects zero-length, too-long and overlong limb bones', () => {
    invalid(g => { const joints = g.parts.find(part => part.kind === 'legs')!.limb!.joints; joints[1].offset = { ...joints[0].offset }; });
    invalid(g => { g.parts.find(part => part.kind === 'legs')!.limb!.joints[0].offset.x = 2; });
    invalid(g => { const limb = g.parts.find(part => part.kind === 'legs')!.limb!; limb.joints = [
      { id: 'a', offset: { x: 1.5, y: 0, z: 0 }, radius: .1 },
      { id: 'b', offset: { x: 3, y: 0, z: 0 }, radius: .1 },
      { id: 'c', offset: { x: 4.5, y: 0, z: 0 }, radius: .1 },
      { id: 'd', offset: { x: 4.5, y: 1.5, z: 0 }, radius: .1 },
    ]; });
  });

  it('rejects incompatible ends, limb metadata on organs and missing limb metadata', () => {
    invalid(g => { g.parts.find(part => part.kind === 'legs')!.limb!.end = { kind: 'hand', style: 'palm', scale: 1 }; });
    invalid(g => { g.parts.find(part => part.kind === 'arms')!.limb!.end = { kind: 'foot', style: 'pad', scale: 1 }; });
    invalid(g => { g.parts.find(part => part.kind === 'lungs')!.limb = g.parts.find(part => part.kind === 'legs')!.limb; });
    invalid(g => { delete g.parts.find(part => part.kind === 'legs')!.limb; });
  });

  it('rejects a fourth mouth and a nineteenth part', () => {
    invalid(g => { for (let i = 0; i < 3; i++) g.parts.push({ id: `mouth-${i}`, kind: 'proboscis', axial: i / 10, angle: 0, scale: 1, mirrored: false }); });
    invalid(g => { while (g.parts.length < 19) g.parts.push({ id: `eye-${g.parts.length}`, kind: 'eyes', axial: 0, angle: 0, scale: 1, mirrored: false }); });
  });

  it('rejects unknown nested fields, sparse arrays, numeric overflow and malformed skin', () => {
    invalid(g => { (g.parts.find(part => part.limb)!.limb!.joints[0].offset as unknown as Record<string, unknown>).extra = 1; });
    invalid(g => { g.parts.find(part => part.limb)!.limb!.joints[0].offset.x = Number.MAX_VALUE; });
    invalid(g => { g.body.spine = Array(7) as CreatureGenome['body']['spine']; });
    invalid(g => { (g.body.skin as unknown as Record<string, unknown>).extra = true; });
  });

  it('does not accept arms or limbs in legacy genomes', () => {
    const old = initialGenome();
    old.parts.push({ id: 'arms', kind: 'arms', axial: 0, angle: 0, scale: 1, mirrored: true });
    expect(validateGenome(old, 2).length).toBeGreaterThan(0);
    const withLimb = initialGenome();
    withLimb.parts[0].limb = creatureBodyFixture('biped').parts.find(part => part.kind === 'legs')!.limb;
    expect(validateGenome(withLimb, 0).length).toBeGreaterThan(0);
  });
});
