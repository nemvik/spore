import type { WorldStage as Stage } from '../src/game/stage';
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { activeSites, actOnJourney, initializeJourneyStage, journeyAction, journeyHint, stepJourney } from '../src/game/journey';
import { feedTarget } from '../src/game/interactions';
import { stepHunters } from '../src/game/encounter-ai';
import { functionalProfile } from '../src/game/genome';
import { mouthWorldPosition } from '../src/game/locomotion';
import { groundHeight } from '../src/game/random';
import { organismGroundClearance, speciesGroundClearance } from '../src/game/anatomy';
import { speciesById } from '../src/game/content';
import type { } from '../src/game/types';

// Prepared encounters isolate presentation from progression. All readiness,
// culture damage and predator strikes still use their ordinary public rules.
function scene(stage: Stage) {
  const s = createGame(8675309, false);
  if (stage !== 0) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  s.world.obstacles = [];
  s.player.cooldown = 0;
  return s;
}

describe('guidance follows the available movement and environment', () => {
  it.each([0, 1, 2] as const)('only instructs Q/C for carried culture in the swimming stage, stage %i', stage => {
    const s = scene(stage), site = activeSites(s)[0];
    s.journey.cargo = { purpose: 'culture', kind: 'nectar', site: site.id, vitality: 100, distance: 0 };
    for (const vertical of [-6, 6]) {
      s.player.pos = { ...site.refuges[0], y: site.refuges[0].y + vertical };
      const before = JSON.stringify(s), action = journeyAction(s)!;
      expect(action).toMatchObject({ operation: 'plant', ready: false });
      expect(action.distance).toBeCloseTo(6);
      expect(action.detail).toBe(`${stage === 1 ? vertical > 0 ? 'Níže · C' : 'Výš · Q' : 'Přibliž se'} · 6.0 m`);
      expect(JSON.stringify(s)).toBe(before);
    }
    s.player.pos = { ...site.refuges[0] };
    expect(journeyAction(s)).toMatchObject({ operation: 'plant', ready: true });
  });

  it.each([0, 1, 2] as const)('keeps food reach physical while showing vertical controls only for stage %i water', stage => {
    const s = scene(stage);
    s.world.resources = []; s.world.creatures = [];
    const origin = mouthWorldPosition(functionalProfile(s.player.genome), s.player.pos, s.player.heading);
    const food = { id: s.world.nextId++, kind: 'algae' as const, pos: { ...origin }, amount: 2, max: 2, regen: 0, patch: 0 };
    s.world.resources.push(food);
    for (const vertical of [-6, 6]) {
      food.pos.y = origin.y + vertical;
      const before = JSON.stringify(s);
      expect(feedTarget(s)).toMatchObject({ id: food.id, ready: false, reason: stage === 1 ? vertical > 0 ? 'above' : 'below' : 'distance', distance: 6 });
      expect(JSON.stringify(s)).toBe(before);
    }
    food.pos = { ...origin };
    expect(feedTarget(s)).toMatchObject({ id: food.id, ready: true });
  });

  it('explains land culture care at pickup and while carrying without mentioning an aquatic current', () => {
    const s = scene(2), site = activeSites(s)[0]; site.observed = true;
    s.player.pos = { ...site.source };
    const take = journeyAction(s)!;
    expect(take).toMatchObject({ operation: 'take', ready: true });
    expect(take.detail).toContain('vodu'); expect(take.detail).not.toContain('proud');
    s.journey.cargo = { purpose: 'culture', kind: 'nectar', site: site.id, vitality: 100, distance: 0 };
    const hint = journeyHint(s)!;
    expect(hint.choices.join(' ')).toContain('vodu');
    expect(hint.choices.join(' ')).not.toContain('proud');
  });

  it('asks a walker to go around real cover and still refuses planting through it', () => {
    const s = scene(2), site = activeSites(s)[0], refuge = site.refuges[0];
    s.journey.cargo = { purpose: 'culture', kind: 'nectar', site: site.id, vitality: 100, distance: 0 };
    s.player.pos = { ...refuge, x: refuge.x + 3 };
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'tree', pos: { ...refuge, x: refuge.x + 1.5, y: refuge.y - 5 }, radius: .7, height: 10 });
    const action = journeyAction(s)!;
    expect(action).toMatchObject({ operation: 'plant', ready: false });
    expect(action.detail).toContain('Obejdi'); expect(action.detail).not.toMatch(/výšku|Q|C ·/);
    actOnJourney(s);
    expect(s.journey.cargo).not.toBeNull(); expect(site.plantedId).toBeNull();
    s.world.obstacles = [];
    actOnJourney(s);
    expect(s.journey.cargo).toBeNull(); expect(site.plantedId).not.toBeNull();
  });

  it.each([0, 1, 2] as const)('gives usable recovery instructions after actual culture loss in stage %i', stage => {
    const s = scene(stage), site = activeSites(s)[0];
    s.journey.cargo = { purpose: 'culture', kind: 'nectar', site: site.id, vitality: .01, distance: 0 };
    stepJourney(s, 1 / 60, { ...s.player.pos }, true);
    expect(s.journey.cargo).toBeNull();
    const message = s.messages.find(m => m.text.startsWith('Kultura se rozpadla.'))!.text;
    if (stage === 2) { expect(message).toContain('vodu'); expect(message).not.toContain('plavbu'); }
    else expect(message).toContain('plavbu');
  });

  it.each([0, 1, 2] as const)('names cover from the current environment after a real predator strike in stage %i', stage => {
    const s = scene(stage), species = speciesById(stage === 0 ? 'needle' : stage === 1 ? 'ribbon' : 'crest');
    s.world.resources = []; s.world.creatures = []; s.journey.hunters = [];
    s.player.pos = { x: 0, y: stage === 0 ? 1.1 : stage === 2 ? groundHeight(0, 6, 2) + organismGroundClearance(s.player.genome) : 0, z: 6 };
    s.player.invulnerable = 0; s.player.health = 100;
    const hunter = spawnCreature(s.world, species.id, 0);
    Object.assign(hunter, { pos: { x: 0, y: stage === 2 ? groundHeight(0, 0, 2) + speciesGroundClearance(species) : s.player.pos.y, z: 0 }, hunger: 70, health: 55, cooldown: 0, fear: 0 });
    s.world.patches[0].center = { ...hunter.pos }; s.world.creatures.push(hunter);
    for (let i = 0; i < 150; i++) {
      s.tick++; s.world.time += 1 / 60;
      s.player.invulnerable = Math.max(0, s.player.invulnerable - 1 / 60);
      stepHunters(s, 1 / 60, () => {});
    }
    expect(s.player.health).toBeLessThan(100);
    const message = s.messages.find(m => m.text.startsWith('Zásah predátora.'))!.text;
    expect(message).toContain(stage === 0 ? 'kámen' : stage === 1 ? 'korály' : 'kmen');
    if (stage !== 1) expect(message).not.toContain('korály');
  });
});
