import { describe, expect, it } from 'vitest';
import { controlModelFor, isCommandStage, isOrganismStage, isPlanetStage, worldStageFor } from '../src/game/stage';
import { CHAPTERS } from '../src/game/content';
import type { Stage } from '../src/game/types';

const stages = [0, 1, 2, 3, 4, 5] as Stage[];
describe('campaign stages', () => {
  it('assigns every stage to exactly one control model', () => {
    for (const stage of stages) expect([isOrganismStage(stage), isCommandStage(stage), isPlanetStage(stage)].filter(Boolean)).toHaveLength(1);
    expect(stages.filter(isOrganismStage)).toEqual([0, 1, 2]);
    expect(stages.filter(isCommandStage)).toEqual([3, 4]);
    expect(stages.filter(isPlanetStage)).toEqual([5]);
    expect(stages.map(controlModelFor)).toEqual(['body', 'body', 'body', 'command', 'command', 'vehicle']);
  });
  it('maps new eras onto the coast without adding habitats', () => {
    expect(stages.map(worldStageFor)).toEqual([0, 1, 2, 2, 2, 2]);
  });
  it('provides chapter copy for all six stages', () => {
    expect(CHAPTERS).toHaveLength(6);
    expect(CHAPTERS.slice(3).map(chapter => chapter.short)).toEqual(['Kmen', 'Stroje', 'Terraformace']);
  });
});
