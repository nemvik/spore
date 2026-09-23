import { partDiscovered, reproductionProblem } from './creature-discovery';
import { getAdaptation } from './adaptation-catalog';
import type { CreatureAnatomy } from './creature-anatomy';
import { genomeCost, initialGenome, validateGenome, has } from './genome';
import { GENOME_ERRORS } from './errors.cs';
import { TEXT } from './content';
import type { GameState, Genome } from './types';

export interface JourneyEvolutionQuote {
  ok: boolean;
  /** False only when validation prevented pricing; numeric fields are then placeholders. */
  priceAvailable?: false;
  errors: string[];
  /** Total allocation in the proposed body, not an irreversible mutation charge. */
  cost: number;
  /** Initial body allocation plus all learned DNA. Rebuilding never changes this. */
  available: number;
  /** Unallocated DNA after accepting the proposal; negative when over budget. */
  remaining: number;
}

const primordialAllocation = genomeCost(initialGenome());

/** New journeys can reallocate learned construction capacity at the nursery. */
export function quoteJourneyEvolution(s: GameState, draft: Genome, derived?: CreatureAnatomy): JourneyEvolutionQuote {
  const errors = validateGenome(draft, s.stage, derived);
  const validKnowledge = Number.isFinite(s.player.totalDna) && s.player.totalDna >= 0;
  const available = validKnowledge ? primordialAllocation + s.player.totalDna : 0;
  if (!validKnowledge || !Number.isFinite(available)) errors.push(GENOME_ERRORS.invalidBudget);
  // Validate before pricing: malformed imports must never reach getAdaptation.
  if (errors.length) return { ok: false, errors, priceAvailable: false, cost: 0, available, remaining: available };
  for (const part of new Set(draft.parts.map(p => p.kind))) if (!partDiscovered(s, part)) errors.push(`Neobjevená část: ${getAdaptation(part).name}. Prozkoumej krajinu a významná setkání.`);
  const problem = reproductionProblem(s); if (problem) errors.push(problem);
  const cost = genomeCost(draft), remaining = available - cost;
  if (remaining < 0) errors.push(GENOME_ERRORS.missingDna(Math.ceil(-remaining)));
  if (s.player.bonds.length && !has(draft, 'symbiote')) errors.push(TEXT.occupiedSymbiote);
  return { ok: errors.length === 0, errors, cost, available, remaining };
}
