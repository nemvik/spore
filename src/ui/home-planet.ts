import type { GameState } from '../game/types';
import { currentLocation, HOME_PLANET_NAME, LOCATION_NAMES } from '../game/home-planet';
import { CHAPTERS } from '../game/content';

export function campaignHeading(s: GameState): string {
  const location = currentLocation(s);
  return `<div class="campaign-heading"><div class="chapter-pill"><b>0${s.stage + 1} / 06</b><span>${CHAPTERS[s.stage].short.toUpperCase()}</span></div>${location ? `<button class="planet-location" data-action="journal" aria-label="Domovská planeta ${HOME_PLANET_NAME}, lokalita ${LOCATION_NAMES[location.kind]}. Otevřít deník klávesou J."><span>Planeta ${HOME_PLANET_NAME}</span><strong>${LOCATION_NAMES[location.kind]}</strong><span aria-hidden="true">↗</span></button>` : ''}</div>`;
}

export function homePlanetMarkup(s: GameState): string {
  const planet = s.homePlanet;
  if (!planet) return '';
  return `<section class="home-planet" aria-label="Domovská planeta"><h3>Domovská planeta · ${HOME_PLANET_NAME}</h3><p>Uložené lokality:</p><ul>${[...planet.locations].sort((a,b) => a.worldSlot-b.worldSlot).map(location => `<li${location.id === planet.currentLocationId ? ' aria-current="location"' : ''}>${LOCATION_NAMES[location.kind]}${location.id === planet.currentLocationId ? ' · právě zde' : ''}</li>`).join('')}</ul><p>Kmen, stroje i místní terraformace pokračují na stejném Dešťovém pobřeží.</p><p>Uložená lokalita není doklad návštěvy. Dřívější cesty nejsou zpětně doplněné; poloha kontinentů a oceánů zatím není zmapovaná.</p></section>`;
}
