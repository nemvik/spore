import type { Stage } from './types';

export type WorldStage = 0 | 1 | 2;
export type ControlModel = 'body' | 'command' | 'vehicle';
export const LAST_ORGANISM_STAGE = 2;

export const isOrganismStage = (stage: Stage): stage is WorldStage => stage <= LAST_ORGANISM_STAGE;
export const isCommandStage = (stage: Stage): boolean => stage === 3 || stage === 4;
export const isPlanetStage = (stage: Stage): boolean => stage === 5;
/** The new eras share the existing coastal habitat; worlds remains a triple. */
export const worldStageFor = (stage: Stage): WorldStage => isOrganismStage(stage) ? stage : 2;
export const controlModelFor = (stage: Stage): ControlModel =>
  isPlanetStage(stage) ? 'vehicle' : isCommandStage(stage) ? 'command' : 'body';
