import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/game/simulation';
import { activeSites, actOnJourney, journeyAction } from '../src/game/journey';
import { motherContext } from '../src/ui/journey-context';
import { JOURNEY_COPY } from '../src/game/journey-content';
import { EMPTY_INPUT } from '../src/game/types';

function scene() {
  const s = createGame(8675309, false, true), site = activeSites(s)[0];
  s.world.obstacles = []; s.world.creatures = []; s.player.cooldown = 0;
  s.player.pos = { ...site.source }; s.player.velocity = { x: 0, y: 0, z: 0 };
  return { s, site };
}

describe('care attempts and world context', () => {
  it('names the nearby mother without promising that T takes it instead of reachable ordinary food', () => {
    const { s, site } = scene(); s.player.pos.x += 8;
    const food = { id: s.world.nextId++, kind: 'algae' as const, pos: { ...s.player.pos }, amount: 4, max: 4, regen: 0, patch: 0 };
    s.world.resources.push(food);
    const before = JSON.stringify(s);
    expect(motherContext(s)).toMatchObject({ pos: site.source, ready: false, distance: 8, detail: '8.0 m' });
    expect(journeyAction(s)).toMatchObject({ operation: 'take-food', resourceId: food.id, ready: true });
    expect(JSON.stringify(s)).toBe(before);
    actOnJourney(s); expect(s.journey.cargo?.purpose).toBe('food'); expect(food.amount).toBe(3);
    expect(motherContext(s)).toBeNull();
  });

  it('shows a source T verb only for the real ready action, including obstruction and cooldown', () => {
    const { s, site } = scene();
    expect(motherContext(s)).toMatchObject({ ready: true, detail: JOURNEY_COPY.motherObserve });
    actOnJourney(s); expect(site.observed).toBe(true);
    expect(motherContext(s)?.ready).toBe(false);
    s.player.cooldown = 0;
    expect(motherContext(s)).toMatchObject({ ready: true, detail: JOURNEY_COPY.motherTake });
    s.player.pos.x += 3;
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { ...site.source, x: site.source.x + 1.5, y: -5 }, radius: .7, height: 12 });
    expect(motherContext(s)?.ready).toBe(false);
  });

  it('hides distant, completed and historical mother labels', () => {
    const { s, site } = scene(); s.player.pos.x += 16; expect(motherContext(s)).toBeNull();
    s.player.pos = { ...site.source }; site.resolved = true; expect(motherContext(s)).toBeNull();
    site.resolved = false; s.journey.legacy = true; expect(motherContext(s)).toBeNull();
  });

  it('reports a failed planting and retains the actual cargo, resources and progression', () => {
    const { s, site } = scene();
    s.journey.cargo = { kind: 'algae', purpose: 'culture', site: site.id, vitality: 91, distance: 0 };
    s.player.pos = { ...site.refuges[0], x: site.refuges[0].x + 6 };
    const before = JSON.stringify({ cargo: s.journey.cargo, sites: s.journey.sites, resources: s.world.resources, rng: s.world.rng, dna: s.player.dna });
    const action = journeyAction(s)!; expect(action.ready).toBe(false); actOnJourney(s);
    expect(s.messages.at(-1)?.text).toBe(JOURNEY_COPY.plantNotDone(action.detail));
    expect(s.messages.at(-1)?.text).not.toBe(action.detail);
    expect(JSON.stringify({ cargo: s.journey.cargo, sites: s.journey.sites, resources: s.world.resources, rng: s.world.rng, dna: s.player.dna })).toBe(before);
    s.player.pos = { ...site.refuges[0] }; actOnJourney(s);
    expect(site.plantedId).not.toBeNull(); expect(s.journey.cargo).toBeNull();
  });

  it('a real T during recharge reports rejection without planting; a later press can succeed', () => {
    const { s, site } = scene();
    s.journey.cargo = { kind: 'algae', purpose: 'culture', site: site.id, vitality: 100, distance: 0 };
    s.player.pos = { ...site.refuges[0] }; s.player.cooldown = .4;
    step(s, { ...EMPTY_INPUT, tend: true });
    expect(site.plantedId).toBeNull(); expect(s.journey.cargo).not.toBeNull();
    expect(s.messages.at(-1)?.text).toContain('Nezasazeno');
    expect(s.messages.at(-1)?.text).toContain('Dokončuješ předchozí akci');
    for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT);
    step(s, { ...EMPTY_INPUT, tend: true });
    expect(site.plantedId).not.toBeNull(); expect(s.journey.cargo).toBeNull();
  });

  it('does not bury a successful first meal under a simultaneous T rejection', () => {
    const { s } = scene();
    const food = { id: s.world.nextId++, kind: 'algae' as const, pos: { ...s.player.pos }, amount: 4, max: 4, regen: 0, patch: 0 };
    s.world.resources.push(food);
    const mealOnly = structuredClone(s);
    step(mealOnly, { ...EMPTY_INPUT, feed: true, feedSelection: { stage: 0, kind: 'food', id: food.id } });
    step(s, { ...EMPTY_INPUT, feed: true, tend: true, feedSelection: { stage: 0, kind: 'food', id: food.id } });
    expect(s.player.meals).toBe(1); expect(s.messages).toEqual(mealOnly.messages);
    expect(s.messages.some(message => /Bez změny|Nezasazeno/.test(message.text))).toBe(false);
  });
});
