import type { GameState } from '../game/types';
import { discoveryQuote, wormholeQuote, type DiscoveryOrder } from '../game/space-discoveries';
import { relicDiscovery, RELIC_IDS, RELICS, SOCIETY_NAME, societyProgress, wormholeTarget } from '../game/space-discoveries-content';
import { planetSystem, starSystems } from '../game/galaxy';
import { escapeHtml as esc } from './creature-library';

export function discoveryMapNote(s: GameState, planetId: string): string {
  const p = s.space!, d = p.discoveries; if (!d) return '';
  const index = planetSystem(p.homePlanetId, planetId)!.index, relic = RELIC_IDS.find(id => RELICS[id].index === index);
  const society = planetId === d.society.planetId, progress = societyProgress(d), target = wormholeTarget(p, planetId);
  return `${relic ? `<p class="tiny space-discovery-mark">◇ ${esc(RELICS[relic].name)} · ${relicDiscovery(d, relic) ? 'prozkoumáno' : 'povrchový signál'}</p>` : ''}
    ${society ? `<p class="tiny space-discovery-mark">✧ ${SOCIETY_NAME} · ${progress.supported ? 'spolupráce a servis' : progress.shared ? 'společná dílna' : 'mladší společnost'}${d.society.enclave ? '<br>Enkláva na historicky osídleném světě' : ''}</p>` : ''}
    ${target && relicDiscovery(d, 'passage') ? `<p class="tiny space-discovery-mark">◎ Červí díra ↔ ${target.index} · ${esc(target.name)} ·14 energie. Použij Průzkum a spolupráci u soustavového majáku.</p>` : ''}`;
}
export function spaceDiscoveriesPanel(s: GameState): string {
  const p = s.space, d = p?.discoveries; if (!p?.ship || !d) return '';
  const systems = starSystems(p.homePlanetId), localId = p.location?.planetId, localSociety = localId === d.society.planetId;
  const progress = societyProgress(d), localRelic = RELIC_IDS.find(id => systems[RELICS[id].index].planetId === localId);
  const action = (order: DiscoveryOrder, label: string) => {
    const q = discoveryQuote(s, order, d.nextAction), command = `${order.kind}|${d.nextAction}${order.kind === 'relic' ? `|${order.relicId}` : ''}`;
    return `<button class="secondary" data-action="space-discovery:${command}" ${q.ok ? '' : 'disabled'}>${esc(label)}</button>${q.reason ? `<p class="tiny">${esc(q.reason)}</p>` : ''}`;
  };
  const target = localId ? wormholeTarget(p, localId) : null, worm = wormholeQuote(s, d.nextAction);
  return `<details id="space-discoveries" class="space-discoveries" data-preserve-open ${localRelic && !relicDiscovery(d, localRelic) || localSociety && !progress.supported ? 'open' : ''}>
    <summary>${localRelic && !relicDiscovery(d, localRelic) ? '◇ Povrchový relikt · ' : localSociety ? '✧ Mladší společnost · ' : ''}Průzkum a spolupráce</summary>
    <p class="tiny">Relikty zkoumáš na místě. Poznatky zůstávají v deníku; nezabírají náklad a nevytvářejí suroviny.</p>
    ${RELIC_IDS.map(id => { const spec = RELICS[id], found = relicDiscovery(d, id); return `<section><b>◇ ${esc(spec.name)}</b><p class="tiny">Soustava ${spec.index} · ${esc(systems[spec.index].name)}<br>${found ? esc(spec.result) : esc(spec.signal)}</p>
      ${localRelic === id && !found ? action({ kind: 'relic', relicId: id }, 'Prozkoumat relikt · na místě') : found ? '<p class="tiny">Poznatek zachován.</p>' : ''}</section>`; }).join('')}
    ${target ? `<section><b>◎ Průchod do ${target.index} · ${esc(target.name)}</b><p class="tiny">Obousměrná červí díra ·14 energie ·6s letu. Původní loď, živý náklad i doprovod pokračují s tebou.</p>
      <button class="secondary" data-action="space-wormhole:${d.nextAction}" ${worm.ok ? '' : 'disabled'}>Projít červí dírou ·14 energie</button>${worm.reason ? `<p class="tiny">${esc(worm.reason)}</p>` : ''}</section>` : ''}
    <section><b>✧ ${SOCIETY_NAME}</b><p class="tiny">Soustava ${planetSystem(p.homePlanetId, d.society.planetId)!.index} · ${esc(planetSystem(p.homePlanetId, d.society.planetId)!.name)}${d.society.enclave ? ' · historická enkláva' : ''}<br>
      ${progress.supported ? 'Servisní sídlo: placené opravy a dobíjení v Koloniích a obchodu, i bez vlastní kolonie. Trvalé doporučení máš uložené pro další cestu.'
        : progress.accepted?.aid === 'ecology' ? `Ekologické vedení: nové místní role ${d.scans.length}/6. Po skenech přiletět ke společné dílně se stabilním prvním pásem.`
          : progress.accepted ? 'Patronát: společná dílna čeká na potvrzení skutečné platby40 ◈ z lodní pokladny.'
            : progress.shared ? 'Z předaných poznatků vyrostla společná dílna. Zvolte další pomoc pro servisní sídlo.' : progress.contact ? 'Předej poznatky z Paměti společných kořenů v soustavě20.' : 'Osobní kontakt u povrchového sídla otevře společnou cestu rozvoje.'}</p>
      ${localSociety ? !progress.contact ? action({ kind: 'contact' }, 'Navázat osobní kontakt') : !progress.shared ? action({ kind: 'share' }, 'Předat poznatky paměti') : !progress.accepted
        ? action({ kind: 'accept-patronage' }, 'Dohodnout patronát · poté40 ◈') + action({ kind: 'accept-ecology' }, 'Dohodnout ekologické vedení ·6 rolí')
          : !progress.supported ? action({ kind: 'support' }, progress.accepted.aid === 'patronage' ? 'Zaplatit patronát ·40 ◈' : 'Odevzdat živý katalog') : '' : ''}</section>
  </details>`;
}
