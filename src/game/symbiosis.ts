import { worldSpecies } from './npc-genome';
import { clamp } from './random';
import type { Bond, FoodKind, GameState } from './types';

/** Care belongs to the actual species, not to an interchangeable bonus slot. */
export function partnerActive(bond: Bond): boolean {
  return bond.loyalty > 0 && bond.hunger < 70;
}

export function hasActivePartner(state: GameState, benefit: Bond['benefit']): boolean {
  return state.player.bonds.some(bond => bond.benefit === benefit
    && (state.journey.legacy ? bond.loyalty > 0 : partnerActive(bond)));
}

/** One ordinary meal can be shared only with partners that digest it. */
export function shareMeal(state: GameState, kind: FoodKind): string[] {
  const fed: string[] = [];
  for (const bond of state.player.bonds) {
    if (!state.journey.legacy && !worldSpecies(state.world,bond.species).diet.includes(kind)) continue;
    bond.hunger = clamp(bond.hunger - 20, 0, 100);
    bond.loyalty = clamp(bond.loyalty + 3, 0, 100);
    fed.push(bond.species);
  }
  return fed;
}
