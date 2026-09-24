import { readFileSync } from 'node:fs';
import { parseGame } from '../../src/game/persistence';
import { continueToTribeEra } from '../../src/game/simulation';
import { enableLineageHistory } from '../../src/game/lineage-history';
import { createWorld } from '../../src/game/world';
import type { GameState } from '../../src/game/types';
import type { ActiveTribeState } from '../../src/game/era-types';
export function fiveTribes(seed?: number) {
  const s = parseGame(readFileSync('tests/fixtures/saves/won-current-coast.fixture.json','utf8'));
  if (seed !== undefined) { s.world = createWorld(seed,2); s.worlds[2] = s.world; }
  enableLineageHistory(s);
  if (!continueToTribeEra(s)) throw new Error('Prepared completed coast cannot enter tribe');
  return s as GameState & { tribe: ActiveTribeState };
}
