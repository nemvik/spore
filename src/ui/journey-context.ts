import { activeSites, journeyAction } from '../game/journey';
import { distance } from '../game/random';
import { JOURNEY_COPY } from '../game/journey-content';
import type { GameState } from '../game/types';

/** A nearby mother remains identifiable even when T currently takes ordinary food.
 * This label never selects an action or changes the interaction's physical range. */
export function motherContext(s: GameState) {
  if (s.journey.legacy || s.journey.cargo) return null;
  const site = activeSites(s).filter(site => !site.resolved)
    .map(site => ({ site, distance: distance(s.player.pos, site.source) }))
    .filter(item => item.distance < 15).sort((a, b) => a.distance - b.distance)[0];
  if (!site) return null;
  const action = journeyAction(s);
  const ready = action?.ready && action.site?.id === site.site.id
    && ['observe', 'take', 'awaken'].includes(action.operation);
  return { pos: site.site.source, label: JOURNEY_COPY.motherLabel, distance: site.distance,
    ready: !!ready, detail: ready ? action!.operation === 'observe' ? JOURNEY_COPY.motherObserve
      : action!.operation === 'awaken' ? JOURNEY_COPY.motherAwaken : JOURNEY_COPY.motherTake : `${site.distance.toFixed(1)} m` };
}
