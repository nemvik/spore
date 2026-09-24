import { readFileSync } from 'node:fs';
import { parseGame } from '../../src/game/persistence';
import { continueToTribeEra } from '../../src/game/simulation';
import type { ActiveTribeState } from '../../src/game/era-types';
import type { GameState } from '../../src/game/types';
import type { CulturalDesign } from '../../src/game/culture';

export const envoy: CulturalDesign = { id: 'envoy', revision: 1, name: 'Hlas zahrady', color: 'jade', head: 'plume', back: 'pouches' };
export const guard: CulturalDesign = { id: 'guard', revision: 1, name: 'Jantarová stráž', color: 'ochre', head: 'crest', back: 'shell' };
/** Prepared coast, supplies and home positions; not earned progression. */
export function cultureGame() {
  const s = parseGame(readFileSync('tests/fixtures/saves/won-current-coast.fixture.json', 'utf8'));
  if (!continueToTribeEra(s)) throw new Error('Fixture must enter tribe');
  const t = s.tribe as ActiveTribeState;
  t.food = 200;
  for (const u of t.members) u.pos = { ...t.huts[0].pos };
  return s as GameState & { tribe: ActiveTribeState };
}
