import { describe, expect, it } from 'vitest';
import { hideObsoleteFeedToast } from '../src/ui/feed-toast';
import { createGame, step } from '../src/game/simulation';
import { feedTarget } from '../src/game/interactions';
import type { InteractionTarget } from '../src/game/interactions';
import { FOOD_LABEL, TEXT } from '../src/game/content';
import { INTERACTION_COPY } from '../src/game/interaction-copy.cs';
import { SELECTION_COPY } from '../src/game/selection-copy.cs';
import { cloneGenome, functionalProfile } from '../src/game/genome';
import { mouthWorldPosition } from '../src/game/locomotion';
import { spawnCreature } from '../src/game/world';
import { EMPTY_INPUT } from '../src/game/types';

function scene() {
  const s = createGame(8675309, false);
  s.world.creatures = []; s.world.obstacles = [];
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.sourceId === r.id));
  s.player.genome = cloneGenome(s.player.genome);
  s.player.genome.parts = [{ id: 'toast-jaw', kind: 'jaw', axial: .9, angle: 0, scale: 1, mirrored: false }];
  s.player.heading = 0; s.player.cooldown = 0;
  const creature = spawnCreature(s.world, 'veil', 0);
  Object.assign(creature, { pos: { x: 0, y: 1.1, z: 9 }, hunger: 0, health: 100, fear: 0, cooldown: 20 });
  s.world.creatures.push(creature);
  const selected = { kind: 'creature' as const, stage: s.stage, id: creature.id };
  return { s, creature, selected };
}
const culture: InteractionTarget = { action: 'tend', kind: 'culture', id: 0, pos: { x: 0, y: 1.1, z: 0 }, distance: 0, range: 4, ready: true, reason: 'ready', priority: true };

describe('named feeding-failure toast visibility', () => {
  it('hides a real failed bite when automatic targeting switches to a ready meal, without clearing history', () => {
    const { s, selected } = scene();
    expect(feedTarget(s, selected)?.reason).toBe('distance');
    step(s, { ...EMPTY_INPUT, feed: true, feedSelection: selected });
    const failure = s.messages.at(-1)!;
    expect(failure.text).toContain('Závojník · Přilož čelist');
    const pos = mouthWorldPosition(functionalProfile(s.player.genome), s.player.pos, s.player.heading);
    s.world.resources.push({ id: s.world.nextId++, kind: 'detritus', pos, amount: 3, max: 3, regen: 0, patch: 0 });
    // Let the actual failure lock expire before presenting the ready meal.
    for (let i = 0; i < 25; i++) step(s, EMPTY_INPUT);
    const feeding = feedTarget(s), before = JSON.stringify(s);
    expect(feeding).toMatchObject({ kind: 'food', ready: true });
    expect(hideObsoleteFeedToast(failure.text, s.world, feeding, feeding)).toBe(true);
    expect(s.messages).toContainEqual(failure); expect(JSON.stringify(s)).toBe(before);
  });

  it('hides a duplicate named failure when the actual HUD displays that same prey and reason', () => {
    const { s, selected } = scene(), feeding = feedTarget(s, selected)!;
    const text = 'Závojník · ' + feeding.detail;
    expect(hideObsoleteFeedToast(text, s.world, feeding, feeding)).toBe(true);
    // Space failure is still useful if a higher-priority culture occupies HUD.
    expect(hideObsoleteFeedToast(text, s.world, feeding, culture)).toBe(false);
  });

  it('hides an old measured contact distance when the live distance changes beneath a culture hint', () => {
    const { s, creature, selected } = scene();
    const old = feedTarget(s, selected)!, text = 'Závojník · ' + old.detail;
    creature.pos.z -= 1;
    const now = feedTarget(s, selected)!;
    expect(now.reason).toBe('distance'); expect(now.detail).not.toBe(old.detail);
    expect(hideObsoleteFeedToast(text, s.world, now, culture)).toBe(true);
  });

  it.each(['blocked', 'above', 'below', 'diet', 'mouth', 'depleted'] as const)('removes an obsolete exact %s failure even after the target disappears', reason => {
    const { s } = scene();
    expect(hideObsoleteFeedToast('Korunoplaz · ' + INTERACTION_COPY[reason], s.world, null, culture)).toBe(true);
  });

  it('handles the simulation’s longer energy failure without hiding an unrepresented current shortage', () => {
    const { s, selected } = scene(); s.player.energy = 1;
    const feeding = feedTarget(s, selected)!;
    expect(feeding.reason).toBe('energy');
    const text = 'Závojník · ' + TEXT.attackEnergy;
    expect(hideObsoleteFeedToast(text, s.world, feeding, feeding)).toBe(true);
    expect(hideObsoleteFeedToast(text, s.world, feeding, culture)).toBe(false);
    s.player.energy = 20;
    expect(hideObsoleteFeedToast(text, s.world, feedTarget(s, selected), culture)).toBe(true);
  });

  it('recognizes an obsolete named food-diet failure after another food becomes ready', () => {
    const { s } = scene();
    const pos = mouthWorldPosition(functionalProfile(s.player.genome), s.player.pos, s.player.heading);
    s.world.resources.push({ id: s.world.nextId++, kind: 'meat', pos, amount: 3, max: 3, regen: 0, patch: 0 });
    const feeding = feedTarget(s)!;
    expect(feeding).toMatchObject({ kind: 'food', ready: true });
    expect(hideObsoleteFeedToast(FOOD_LABEL.algae + ' · ' + INTERACTION_COPY.diet, s.world, feeding, feeding)).toBe(true);
  });

  it.each([
    TEXT.predatorHit(2), TEXT.firstMeal, TEXT.depletedSource, TEXT.victory,
    TEXT.huntedSpecies('Korunoplaz'), 'Korunoplaz: lov změnil potravní vztah. +10 DNA',
    'Korunoplaz · zásah za 34', 'Kultura zakořenila a mění okolí.',
    'Korunoplaz · Přilož čelist k tělu cíle · neznámá vzdálenost',
    'Neznámý tvor · ' + INTERACTION_COPY.distance,
    INTERACTION_COPY.blocked, INTERACTION_COPY.cooldown, TEXT.attackEnergy,
    SELECTION_COPY.missing,
  ])('leaves world events, unknown text and ambiguous unnamed notices intact: %s', text => {
    const { s, selected } = scene(), feeding = feedTarget(s, selected);
    expect(hideObsoleteFeedToast(text, s.world, feeding, feeding)).toBe(false);
  });
});
