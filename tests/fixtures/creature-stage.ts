import { createGame, makeCheckpoint } from '../../src/game/simulation';
import { createWorld } from '../../src/game/world';
import { initializeJourneyStage } from '../../src/game/journey';
import { initializeCreatureStage } from '../../src/game/creature-stage';
import { creatureBodyFixture } from './creature-bodies';
import { computeStats, genomeCost, initialGenome } from '../../src/game/genome';
import { emptyCreatureActions } from '../../src/game/creature-actions';
import { groundHeight } from '../../src/game/random';
import { organismGroundClearance } from '../../src/game/anatomy';

/** Prepared start of land, not a played campaign. Earlier stages remain valid. */
export function creatureStageFixture(kind: 'biped' | 'quadruped' = 'biped', seed = 481516) {
  const s = createGame(seed, false, true, true, true, true);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  const genome = creatureBodyFixture(kind);
  genome.parts.push({ id: 'eyes', kind: 'eyes', axial: .7, angle: 1, mirrored: true, scale: 1 });
  genome.parts.push({ id: 'toxin', kind: 'toxin', axial: .3, angle: 2, mirrored: false, scale: 1 });
  s.player.genome = genome; s.player.creatureActions = emptyCreatureActions();
  s.player.totalDna = 220; s.player.dna = genomeCost(initialGenome()) + s.player.totalDna - genomeCost(genome);
  s.player.health = computeStats(genome).maxHealth; s.player.energy = 100;
  s.player.pos = { x: 0, y: groundHeight(0, 0, 2) + organismGroundClearance(genome), z: 0 };
  s.player.invulnerable = 0;
  initializeCreatureStage(s); makeCheckpoint(s);
  return s;
}
