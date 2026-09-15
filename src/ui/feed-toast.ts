import { FOOD_LABEL, SPECIES, TEXT, speciesById } from '../game/content';
import { INTERACTION_COPY } from '../game/interaction-copy.cs';
import { SELECTION_COPY } from '../game/selection-copy.cs';
import type { InteractionTarget } from '../game/interactions';
import type { World } from '../game/types';

const targetNames = [...Object.values(FOOD_LABEL), ...SPECIES.map(species => species.name)];
const failureDetails = new Set([
  INTERACTION_COPY.distance, INTERACTION_COPY.above, INTERACTION_COPY.below,
  INTERACTION_COPY.blocked, INTERACTION_COPY.diet, INTERACTION_COPY.mouth,
  INTERACTION_COPY.depleted, TEXT.attackEnergy,
]);

function isJawApproach(detail: string): boolean {
  const measured = detail.slice(detail.lastIndexOf(' · ') + 3);
  if (!/^\d+\.\d m$/.test(measured)) return false;
  return detail === SELECTION_COPY.jawApproach(Number(measured.slice(0, -2)));
}

/** Named feed failures describe a live affordance, not a lasting world event.
 * Match only the exact messages produced by feed(): general action failures,
 * damage, depletion events and progress notices retain their original display.
 * This projection neither removes messages nor changes their saved history. */
export function hideObsoleteFeedToast(text: string, world: World, feeding: InteractionTarget | null, displayed: InteractionTarget | null): boolean {
  const name = targetNames.find(name => text.startsWith(name + ' · '));
  if (!name) return false;
  const detail = text.slice(name.length + 3);
  if (!failureDetails.has(detail) && !isJawApproach(detail)) return false;
  if (!feeding || feeding.action !== 'feed' || feeding.ready) return true;
  const resource = feeding.kind === 'food' ? world.resources.find(r => r.id === feeding.id) : undefined;
  const creature = feeding.kind === 'prey' ? world.creatures.find(c => c.id === feeding.id && c.health > 0) : undefined;
  const currentName = resource ? FOOD_LABEL[resource.kind] : creature ? speciesById(creature.species).name : null;
  const currentDetail = feeding.reason === 'energy' ? TEXT.attackEnergy : feeding.detail ?? INTERACTION_COPY[feeding.reason];
  if (name !== currentName || detail !== currentDetail) return true;
  return displayed?.action === 'feed' && displayed.id === feeding.id && displayed.kind === feeding.kind;
}
