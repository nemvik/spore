import { planetAtlas, locationGeography, geographicAddress, wrapLongitude, BIOMES, type GeographicBiome } from '../game/planet-geography';
import { locationAddress } from '../game/home-planet';
import type { GameState } from '../game/types';
import { currentLocation, HOME_PLANET_NAME, LOCATION_NAMES } from '../game/home-planet';
import { CHAPTERS } from '../game/content';

export function campaignHeading(s: GameState): string {
  const location = currentLocation(s);
  return `<div class="campaign-heading"><div class="chapter-pill"><b>0${s.stage + 1} / 06</b><span>${CHAPTERS[s.stage].short.toUpperCase()}</span></div>${location ? `<button class="planet-location" data-action="journal" aria-label="Domovská planeta ${HOME_PLANET_NAME}, lokalita ${LOCATION_NAMES[location.kind]}. Otevřít deník klávesou J."><span>Planeta ${HOME_PLANET_NAME}</span><strong>${LOCATION_NAMES[location.kind]}</strong><span aria-hidden="true">↗</span></button>` : ''}</div>`;
}

const biomeStyle: Record<GeographicBiome, { name: string; color: string }> = {
  ocean: { name: 'Oceán', color: '#225572' }, shelf: { name: 'Mělčina', color: '#469ba9' },
  rainforest: { name: 'Deštný les', color: '#377d57' }, grassland: { name: 'Traviny', color: '#9baf70' },
  desert: { name: 'Poušť', color: '#d6b078' }, tundra: { name: 'Tundra', color: '#d4ddcd' }, mountain: { name: 'Hory', color: '#908894' },
};
const coordinates = (p: { latitude: number; longitude: number }, precision = 3) => `${Math.abs(p.latitude).toFixed(precision)}° ${p.latitude < 0 ? 'j. š.' : 's. š.'} · ${Math.abs(p.longitude).toFixed(precision)}° ${p.longitude < 0 ? 'z. d.' : 'v. d.'}`;

export function homePlanetMarkup(s: GameState): string {
  const planet = s.homePlanet;
  if (!planet) return '';
  const atlas = planetAtlas(planet), locations = [...planet.locations].sort((a,b) => a.worldSlot-b.worldSlot);
  if (!atlas) return `<section class="home-planet" aria-label="Domovská planeta"><h3>Domovská planeta · ${HOME_PLANET_NAME}</h3><p>Geografie této starší identity ještě není přiřazená.</p></section>`;
  const current = locationGeography(s)!, origin = locationAddress(s, s.player.pos), playerPoint = origin && geographicAddress(s, origin);
  const x = (longitude: number) => (longitude + 180) * 2, y = (latitude: number) => (90 - latitude) * 2;
  const tiles = atlas.cells.map(c => `<rect x="${x(c.longitude)-5}" y="${y(c.latitude)-5}" width="10" height="10" fill="${biomeStyle[c.biome].color}"/>`).join('');
  const continentCount = atlas.regions.filter(r => r.surface === 'land').length;
  // The regional inset uses the same raster and exact anchors. The global marker
  // intentionally represents their shared region; these scenes are much smaller.
  const coast = atlas.anchors[2];
  const ix = (longitude: number) => 22 + wrapLongitude(longitude - coast.longitude) * 2;
  const iy = (latitude: number) => 15 + (coast.latitude - latitude) * 2;
  const localTiles = atlas.cells.filter(c => Math.abs(wrapLongitude(c.longitude-coast.longitude)) < 20 && Math.abs(c.latitude-coast.latitude) < 15).map(c => `<rect x="${ix(c.longitude)-5}" y="${iy(c.latitude)-5}" width="10" height="10" fill="${biomeStyle[c.biome].color}"/>`).join('');
  const inset = `<svg class="habitat-inset" viewBox="0 0 37 30" role="img" aria-label="Detail domovského pobřeží, očíslované uložené habitaty">${localTiles}${locations.map(l => {
    const a = atlas.anchors[l.worldSlot], active = l.id === planet.currentLocationId;
    return `<g><circle cx="${ix(a.longitude)}" cy="${iy(a.latitude)}" r="2" fill="${active ? '#ffdc8b' : '#ecf5e8'}" stroke="#122e39" stroke-width=".5"/><text x="${ix(a.longitude)}" y="${iy(a.latitude)+.85}" text-anchor="middle" fill="#102a35" font-size="2.5" font-weight="bold">${l.worldSlot+1}</text></g>`;
  }).join('')}</svg>`;
  return `<section class="home-planet" aria-label="Domovská planeta"><h3>Domovská planeta · ${HOME_PLANET_NAME}</h3>
    <p class="atlas-origin">${planet.version === 2 && planet.geography.provenance === 'birth' ? 'Geografie založená s touto linií.' : 'Geografie nově přiřazená starší kampani; není záznamem jejích dřívějších cest.'} ${continentCount} pevninské celky · obvod rovníku 36 km.</p>
    <p class="atlas-current">Aktuální lokalita: <strong>${LOCATION_NAMES[current.location.kind]}</strong> · ${current.cell.surface === 'land' ? 'pevnina' : 'voda'}.</p>
    <figure class="home-atlas"><svg viewBox="0 0 720 360" role="img" aria-label="Planeta: kontinenty, oceány a biomy. Kroužek označuje aktuální domovský region.">${tiles}<path d="M0 180H720 M360 0V360" stroke="#edf7e1" stroke-opacity=".3" stroke-dasharray="4 6"/><circle cx="${x(current.anchor.longitude)}" cy="${y(current.anchor.latitude)}" r="8" fill="none" stroke="#fff4ca" stroke-width="3"/><circle cx="${x(current.anchor.longitude)}" cy="${y(current.anchor.latitude)}" r="2" fill="#fff4ca"/></svg><figcaption>Sever ↑ · západ vlevo · východ vpravo · ○ aktuální region. Levý a pravý okraj navazují. Rovník je přerušovaná čára.</figcaption></figure>
    <div class="atlas-legend">${BIOMES.map(b => `<span><i style="background:${biomeStyle[b].color}"></i>${biomeStyle[b].name}</span>`).join('')}</div>
    <div class="habitat-overview">${inset}<div><p><strong>Uložené lokality:</strong></p><ol class="habitat-list">${locations.map(l => {
      const binding = locationGeography(s, l.id)!, a = binding.anchor, active = l.id === planet.currentLocationId;
      return `<li value="${l.worldSlot+1}"${active ? ' aria-current="location"' : ''}><strong>${LOCATION_NAMES[l.kind]}${active ? ' · právě zde' : ''}</strong><span>${binding.cell.surface === 'land' ? 'Pevnina' : 'Voda'} · ${biomeStyle[binding.cell.biome].name} · šířka místa ${(156*a.metersPerUnit).toLocaleString('cs-CZ', { maximumFractionDigits: 3 })} m</span><span>${coordinates(a)}</span></li>`;
    }).join('')}</ol></div></div>
    <details class="atlas-details"><summary>Souřadnice a měřítko místa</summary><p>${playerPoint ? `Poloha organismu: ${coordinates(playerPoint.point, 6)}. ` : ''}Místní X/Z zůstávají −78 až 78; X na východ, Z na jih. Jedna místní jednotka zde představuje ${current.anchor.metersPerUnit} m. Atlas má buňky 5° (500 m na rovníku); detailní terén a objekty patří původnímu místu.</p><p>Výchozí region: ${biomeStyle[current.cell.biome].name}, ${current.cell.temperatureC} °C, vlhkost ${current.cell.moisture} %. To jsou zeměpisné podmínky atlasu. Místní terraformace, její klima a T0–T3 se vyvíjejí samostatně.</p></details>
    <p>Uložená lokalita není doklad návštěvy. Nová mapa nepřidává objevy, vlastnictví ani minulá rozhodnutí. Kmen, stroje i místní terraformace pokračují na stejném Dešťovém pobřeží. Přehled zatím neumožňuje vzdálené cestování.</p></section>`;
}
