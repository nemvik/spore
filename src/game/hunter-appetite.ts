import type { Creature, GameState } from './types';
import { speciesById } from './content';

/** A fed predator stops choosing prey, but an already committed attack is still
 * a real threat. General injury is not hunger: retaliation against the nearby
 * player must not keep native animals frightened after the predator has eaten.
 */
export function hunterThreatening(s: GameState, creature: Creature): boolean {
  if (creature.health <= 0 || speciesById(creature.species).role !== 'predator') return false;
  if (s.journey.version !== 3 || s.journey.legacy || creature.hunger > 40) return true;
  return s.journey.hunters.some(memory => memory.stage === s.stage && memory.id === creature.id && (memory.phase === 'windup' || memory.phase === 'lunge'));
}
