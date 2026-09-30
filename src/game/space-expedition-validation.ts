import { validateForeignEcology } from './space-ecology-validation';
import { ecologyCheckpointMatches } from './space-ecology-checkpoint';
import type { SpaceState } from './space-types';
import type { SpaceExpeditionV1 } from './space-expedition-types';
import { validateExpedition as validateV1, expeditionCheckpointMatches as checkpointV1, expeditionEnergySince as energyV1 } from './space-expedition-v1-validation';
import { validateBiosphere, biosphereCheckpointMatches } from './space-biosphere-validation';

type LegacySpace = Omit<SpaceState, 'expedition'> & { expedition?: SpaceExpeditionV1 };
export function validateExpedition(p: SpaceState): void {
  if (p.expedition?.version === 2 && p.expedition.biosphere.version === 2) validateForeignEcology(p);
  else if (p.expedition?.version === 2) validateBiosphere(p);
  else validateV1(p as LegacySpace);
}
export function expeditionCheckpointMatches(a: SpaceState, b: SpaceState): boolean {
  if (a.expedition?.version === 2 && a.expedition.biosphere.version === 2 || b.expedition?.version === 2 && b.expedition.biosphere.version === 2) return ecologyCheckpointMatches(a, b);
  if (a.expedition?.version === 2 || b.expedition?.version === 2) return biosphereCheckpointMatches(a, b);
  return checkpointV1(a as LegacySpace, b as LegacySpace);
}
export function expeditionEnergySince(a: SpaceState, b: SpaceState): number | null {
  if (a.expedition?.version === 2 && b.expedition?.version === 2) {
    if (a.expedition.biosphere.version !== b.expedition.biosphere.version) return null;
    const actions = a.expedition.actions.filter(row => row.serial >= b.expedition!.nextAction);
    return actions.some(row => row.at !== a.elapsed) ? null : a.expedition.energySpent - b.expedition.energySpent;
  }
  if (a.expedition?.version === 2 || b.expedition?.version === 2) return null;
  return energyV1(a as LegacySpace, b as LegacySpace);
}
