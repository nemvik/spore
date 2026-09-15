import { describe, expect, it } from 'vitest';
import { createGame, step } from '../src/game/simulation';
import { journeyAction, journeyHint } from '../src/game/journey';
import { EMPTY_INPUT } from '../src/game/types';

describe('carried ordinary food names only compatible local species', () => {
  it.each([
    ['mineral', 'Tuto potravu nepřijímá žádný místní druh.'],
    ['algae', 'Závojník'],
    ['meat', 'Jehloúst'],
  ] as const)('reports the actual %s diet after a real T pickup', (kind, expected) => {
    // Prepared pickup isolates the ordinary portion from sources and scenery.
    // Only public T input performs the transfer; the projection remains pure.
    const s = createGame(20260913, false);
    s.world.obstacles = []; s.world.creatures = [];
    s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.sourceId === r.id));
    const food = { id: s.world.nextId++, kind, pos: { ...s.player.pos }, amount: 2, max: 2, regen: 0, patch: 0 };
    s.world.resources.push(food);
    expect(journeyAction(s)).toMatchObject({ ready: true, resourceId: food.id });
    step(s, { ...EMPTY_INPUT, tend: true });
    expect(food.amount).toBe(1); expect(s.journey.cargo).toMatchObject({ kind, purpose: 'food' });
    const before = JSON.stringify(s), hint = journeyHint(s)!;
    expect(hint.choices[0]).toContain(expected);
    expect(hint.choices[0]).not.toBe('Tuto potravu přijímá: .');
    expect(hint.text).toContain('běžná potrava nevytvoří nový porost');
    expect(JSON.stringify(s)).toBe(before);
  });
});
