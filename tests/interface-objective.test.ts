import { expect, it } from 'vitest';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { cellGuide } from '../src/ui/cell-growth';
import { objectiveNextMarkup } from '../src/ui/objective';

it('gives old coastal saves an actionable choice while keeping their original routes', () => {
  const state = createGame(67, true);
  state.stage = 2;
  state.world = createWorld(67, 2);
  const before = JSON.stringify(state);
  const markup = objectiveNextMarkup(state, null);
  expect(markup).toContain('prameny');
  expect(markup).toContain('žrouty');
  expect(markup).toContain('partnery');
  expect(JSON.stringify(state)).toBe(before);
});

it('keeps the actionable current cell instruction outside the optional conditions', () => {
  const state = createGame(67, false, true, true, true, true, true, [], true, true, true);
  const guide = cellGuide(state)!;
  const before = JSON.stringify(state);
  const markup = objectiveNextMarkup(state, guide);
  expect(markup).toContain(guide.instruction);
  expect(markup).not.toContain(guide.done);
  expect(JSON.stringify(state)).toBe(before);
});
