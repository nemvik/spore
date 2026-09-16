import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { BODY_PRESETS, bodyCollisionRadius, bodySection, neutralSpine, spineAxial } from '../src/game/body-shape';
import { attachmentPoint, organismGroundClearance } from '../src/game/anatomy';
import { cloneGenome, computeStats, genomeCost, initialGenome, mutationCost, validateGenome } from '../src/game/genome';
import { fromGenome, toGenome, cloneBlueprint, initialVehicle, validateVehicle } from '../src/game/blueprint';
import { createGame, evolve, recoverGeneration, step } from '../src/game/simulation';
import { parseGame, serializeGame } from '../src/game/persistence';
import { createOrganism, disposeObject } from '../src/render/organism';
import { createWorld } from '../src/game/world';
import { groundHeight } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
import type { Genome } from '../src/game/types';

describe('individual spine shape', () => {
  it('keeps the seven-key historical body and neutral phenotype exactly', () => {
    const g = initialGenome(), neutral = { ...g, spine: neutralSpine() };
    expect(Object.keys(toGenome(fromGenome(g)))).toHaveLength(7);
    expect(computeStats(neutral)).toEqual(computeStats(g));
    expect(genomeCost(neutral)).toBe(genomeCost(g));
    expect(mutationCost(g, neutral)).toBe(0);
    expect(organismGroundClearance(neutral)).toBe(organismGroundClearance(g));
  });
  it('interpolates independent width, height and bend without overshoot', () => {
    const spine = neutralSpine(); spine[3] = { width: 1.65, height: .5, bend: .65 };
    expect(bodySection(spineAxial(3), spine)).toEqual(spine[3]);
    expect(bodySection(spineAxial(2), spine)).toEqual(spine[2]);
    for (let i = 0; i <= 100; i++) {
      const section = bodySection(-1 + i / 50, spine);
      expect(section.width).toBeGreaterThanOrEqual(1); expect(section.width).toBeLessThanOrEqual(1.65);
      expect(section.height).toBeGreaterThanOrEqual(.5); expect(section.height).toBeLessThanOrEqual(1);
      expect(section.bend).toBeGreaterThanOrEqual(0); expect(section.bend).toBeLessThanOrEqual(.65);
    }
  });
  it('isolates undo drafts and converted genomes from mutable node references', () => {
    const g = { ...initialGenome(), spine: neutralSpine() }, draft = fromGenome(g), undo = cloneBlueprint(draft), converted = toGenome(draft), clone = cloneGenome(g);
    draft.spine![2].width = 1.6; clone.spine![4].bend = .5;
    expect(undo.spine).toEqual(neutralSpine()); expect(converted.spine).toEqual(neutralSpine()); expect(g.spine).toEqual(neutralSpine());
    expect(validateVehicle(initialVehicle('tank', 'restoration'))).toEqual([]);
  });
  it.each(Object.entries(BODY_PRESETS))('validates and roundtrips preset %s through evolution, save and recovery', (_, preset) => {
    const s = createGame(67, false, true, true, true), g: Genome = { ...initialGenome(), ...(preset.nodes() ? { spine: preset.nodes() } : {}) };
    expect(validateGenome(g, 0)).toEqual([]);
    expect(evolve(s, g).ok).toBe(true);
    const loaded = parseGame(serializeGame(s));
    expect(loaded.player.genome).toEqual(g); expect(recoverGeneration(loaded).player.genome).toEqual(g);
  });
  it.each([null, [], neutralSpine().slice(1), [...neutralSpine(), { width: 1, height: 1, bend: 0 }], Array(7), neutralSpine().map(n => ({ ...n, extra: true })), neutralSpine().map(n => ({ ...n, width: Infinity })), neutralSpine().map(n => ({ ...n, height: NaN })), neutralSpine().map(n => ({ ...n, bend: .66 })), neutralSpine().map(n => ({ ...n, width: .49 }))].map(spine => [spine]))('rejects malformed spine %j', spine => {
    expect(validateGenome({ ...initialGenome(), spine }, 0)).not.toEqual([]);
  });
  it('rejects malformed profiles in imported checkpoints as well as active bodies', () => {
    const s = createGame(67, false, true, true, true);
    expect(evolve(s, { ...initialGenome(), spine: BODY_PRESETS.pear.nodes() }).ok).toBe(true);
    const raw = JSON.parse(serializeGame(s)); raw.state.player.genome.spine[0].width = -1;
    expect(() => parseGame(JSON.stringify(raw))).toThrow();
    const valid = JSON.parse(serializeGame(s)), checkpoint = JSON.parse(valid.state.checkpoint); checkpoint.player.genome.spine = [];
    valid.state.checkpoint = JSON.stringify(checkpoint);
    expect(() => parseGame(JSON.stringify(valid))).toThrow();
  });
  it('still loads the historical v2 fixture without adding a profile', () => {
    const s = parseGame(readFileSync('tests/fixtures/saves/legacy-initial.fixture.json', 'utf8'));
    expect(s.player.genome).not.toHaveProperty('spine'); expect(parseGame(serializeGame(s)).player.genome).toEqual(s.player.genome);
  });
  it('charges reshaping and makes a thick body heavier and slower', () => {
    const g = initialGenome(), thick = { ...g, spine: neutralSpine().map(n => ({ ...n, width: 1.6, height: 1.6 })) };
    expect(genomeCost(thick)).toBeGreaterThan(genomeCost(g)); expect(mutationCost(g, thick)).toBeGreaterThan(0);
    expect(computeStats(thick).mass).toBeGreaterThan(computeStats(g).mass);
    expect(computeStats(thick).speed).toBeLessThan(computeStats(g).speed);
    expect(computeStats(thick).metabolism).toBeGreaterThan(computeStats(g).metabolism);
  });
  it.each([0, 1] as const)('keeps extreme sculpted bodies above the stage %s floor while swimming', stage => {
    const s = createGame(67, false, true, true, true); s.stage = stage; if (stage === 1) { s.world = createWorld(67, stage); s.worlds[stage] = s.world; }
    s.player.genome = { ...initialGenome(), width: 1.8, spine: neutralSpine().map(n => ({ ...n, height: 1.65, bend: -.65 })) };
    s.player.pos.y = stage === 0 ? 1.1 : groundHeight(0, 0, 1) + 1.3;
    step(s, EMPTY_INPUT);
    const model = createOrganism(s.player.genome);
    try { const body = new THREE.Box3().setFromObject(model.userData.attachmentSurface); expect(s.player.pos.y + body.min.y).toBeGreaterThanOrEqual(stage === 0 ? 0 : groundHeight(s.player.pos.x, s.player.pos.z, 1)); }
    finally { disposeObject(model); }
  });
  it.each(['pear', 'ray', 'arch'] as const)('renders %s as a closed finite surface with organs attached and body above ground', key => {
    const g = { ...initialGenome(), spine: BODY_PRESETS[key].nodes() }, model = createOrganism(g);
    try {
      const body = model.userData.attachmentSurface as THREE.Mesh, positions = body.geometry.getAttribute('position');
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
      const bounds = new THREE.Box3().setFromObject(body);
      expect(bounds.min.y + organismGroundClearance(g)).toBeGreaterThanOrEqual(0);
      const radius = bodyCollisionRadius(g, 1);
      expect(Math.max(Math.abs(bounds.min.y), bounds.max.y, bounds.max.x)).toBeLessThanOrEqual(radius);
      for (const part of g.parts) {
        const origin = attachmentPoint(part.axial, part.angle, g.length, g.width, g.spine);
        const organ = model.getObjectByProperty('uuid', model.children[0].children.find(c => c.userData.partId === part.id)!.uuid)!;
        expect(organ.position.toArray()).toEqual([origin.x, origin.y, origin.z]);
      }
      // First and last ring close at a single point; the radial seam is welded geometrically.
      for (const row of [0, 64]) for (let side = 1; side <= 24; side++) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, row * 25), b = new THREE.Vector3().fromBufferAttribute(positions, row * 25 + side);
        expect(a.distanceTo(b)).toBeLessThan(1e-7);
      }
    } finally { disposeObject(model); }
  });
});
