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
export function creatureStageFixture(kind: 'biped' | 'quadruped' = 'biped', seed = 481516, discoveries = false) {
  const s = createGame(seed, false, true, true, true, true, discoveries);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  const genome = creatureBodyFixture(kind);
  genome.parts.push({ id: 'eyes', kind: 'eyes', axial: .7, angle: 1, mirrored: true, scale: 1 });
  genome.parts.push({ id: 'toxin', kind: 'toxin', axial: .3, angle: 2, mirrored: false, scale: 1 });
  if(discoveries)genome.parts=genome.parts.filter(p=>!['arms','toxin','antenna','spines','recycler'].includes(p.kind));
  s.player.genome = genome; s.player.creatureActions = emptyCreatureActions();
  s.player.totalDna = 220; s.player.dna = genomeCost(initialGenome()) + s.player.totalDna - genomeCost(genome);
  s.player.health = computeStats(genome).maxHealth; s.player.energy = 100;
  s.player.pos = { x: 0, y: groundHeight(0, 0, 2) + organismGroundClearance(genome), z: 0 };
  s.player.invulnerable = 0;
  initializeCreatureStage(s); makeCheckpoint(s);
  return s;
}

/** A prepared legacy genome arriving on land under the new discovery rules. */
export function creatureDiscoveryClassicFixture() {
  const s = creatureStageFixture('biped', 481516, true), genome = initialGenome();
  genome.parts.push(
    { id: 'land-legs', kind: 'legs', axial: -.1, angle: 2, mirrored: true, scale: 1 },
    { id: 'land-lungs', kind: 'lungs', axial: 0, angle: 0, mirrored: false, scale: 1 },
    { id: 'land-eyes', kind: 'eyes', axial: .7, angle: 1, mirrored: true, scale: 1 },
  );
  s.player.genome = genome; delete s.player.creatureActions;
  s.player.dna = genomeCost(initialGenome()) + s.player.totalDna - genomeCost(genome);
  s.player.health = computeStats(genome).maxHealth;
  s.player.pos.y = groundHeight(0, 0, 2) + organismGroundClearance(genome);
  makeCheckpoint(s); return s;
}
