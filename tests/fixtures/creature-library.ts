import type { NpcDesign } from '../../src/game/npc-genome';
import { createGame, makeCheckpoint } from '../../src/game/simulation';
import { createWorld } from '../../src/game/world';
import { initializeJourneyStage } from '../../src/game/journey';
import { initializeCreatureStage } from '../../src/game/creature-stage';
import { creatureStageFixture } from './creature-stage';

/** Disclosed prepared land, reusing the exact immutable population chosen at lineage birth. */
export function creatureLibraryLandFixture(designs: NpcDesign[], seed = 481516) {
  const s = createGame(seed, false, true, true, true, true, true, designs);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = s.worlds[stage] ?? createWorld(seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  s.player = structuredClone(creatureStageFixture('biped', seed, true).player);
  initializeCreatureStage(s); makeCheckpoint(s); return s;
}
