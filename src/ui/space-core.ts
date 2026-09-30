import type { GameState } from '../game/types';
import { coreQuote, type CoreOrder } from '../game/space-core';
import { coreProgress, coreRoot, CORE_BOUNDARY, CORE_CENTER, CORE_FRONTIER } from '../game/space-core-content';
import { planetSystem } from '../game/galaxy';
import { escapeHtml as esc } from './creature-library';

export function coreMapNote(s: GameState, planetId: string): string {
  const p = s.space, core = p?.core; if (!p || !core) return '';
  const index = planetSystem(p.homePlanetId, planetId)!.index, progress = coreProgress(core);
  const access = !!progress.access || core.legacyWorlds.length > 0;
  return `${index === CORE_FRONTIER ? '<p class="tiny space-discovery-mark">◈ Tichý val · osobní jednání na orbitě. Doporučení společnosti nebo hraniční souboj.</p>' : ''}
    ${index >= CORE_BOUNDARY ? `<p class="tiny space-discovery-mark">${index === CORE_CENTER ? '✦ Srdce světla · osobní setkání na povrchu' : '◈ Vnitřní oblast Tichého valu'}<br>${access ? 'Průchod zachován' : 'Nejprve vyřeš průchod na orbitě 23'}</p>` : ''}
    ${coreRoot(core, planetId) ? '<p class="tiny space-discovery-mark">✺ Kořen jasu · trvalá klimatická kotva T3</p>' : ''}`;
}
export function spaceCorePanel(s: GameState): string {
  const p = s.space, core = p?.core; if (!p?.ship || !core) return '';
  const progress = coreProgress(core), index = p.location ? planetSystem(p.homePlanetId, p.location.planetId)!.index : 0;
  const access = !!progress.access || core.legacyWorlds.length > 0, roots = core.actions.filter(a => a.kind === 'root');
  const button = (order: CoreOrder, label: string) => { const q = coreQuote(s, order, core.nextAction); return `<button class="secondary" data-action="space-core:${order}|${core.nextAction}" ${q.ok ? '' : 'disabled'}>${esc(label)}</button>${q.reason ? `<p class="tiny">${esc(q.reason)}</p>` : ''}`; };
  const accessText = core.legacyWorlds.length ? 'Dřívější cesty a osady zachovaly přístup. Setkání ani odměna se zpětně neudělily.'
    : progress.access?.strategy === 'diplomacy' ? 'Diplomatické doporučení bylo uznáno. Vnitřní oblast je průchozí.'
      : progress.access ? 'Hlídka uznala tvé vítězství a průchod. Její planety jsi nemusel zničit.' : '';
  const history = `<details id="space-core-history" data-preserve-open><summary>Průchod a ukotvené světy · ${roots.length}/31</summary><p class="tiny">${accessText}</p>${roots.length ? `<p class="tiny">${roots.map(r => esc(planetSystem(p.homePlanetId, r.planetId)!.name)).join(' · ')}</p>` : ''}</details>`;
  const reward = `<p class="tiny">Za <b>30 energie</b> srovná obě osy klimatu na T3 a trvale zastaví drift.</p>
    ${p.location?.scale === 'surface' && index !== 0 ? button('root', 'Ukotvit klima · 30 energie') : '<p class="tiny">Použij jej nad cizím povrchem u majáku. Můžeš vyrazit na další výpravu.</p>'}
    <p class="tiny">Každý cizí svět jednou. Původní život i kolonie zůstávají. Pustý svět stále potřebuje dovezené role a skutečnou stabilitu.</p>${history}`;
  const frontier = index === CORE_FRONTIER && !access ? !progress.contact ? button('contact', 'Oslovit Tichý val · na orbitě')
    : `<p class="tiny">Zvol průchod bez vyhlazení říše:</p>${button('diplomacy', 'Předložit doporučení')}${button('challenge', 'Vyzvat hraniční hlídku')}
      <p class="tiny">Hlídka: 108 odolnosti; pulz za 12 po 1,4 s do 22 kroků. R/V umožní ústup; prohra má nouzovou obnovu.</p>` : '';
  const route = `<p class="tiny">Jádro: <b>Srdce světla · 31</b>. Vnitřní oblast 24–31 chrání Tichý val.</p>
    ${access ? `<p class="tiny">${accessText}</p><p class="tiny">Setkání na povrchu 31: <b>9,−8</b>. Přibliž se do 6 kroků pod výšku 8.</p>${index === CORE_CENTER ? button('encounter', 'Setkat se · přijmout Kořen') : ''}`
      : `${frontier}${!progress.contact || index !== CORE_FRONTIER ? '<p class="tiny">Přileť k orbitálnímu majáku Horkého jantaru (23). Doporučení Kruhu prvních světel nebo vítězství nad hlídkou otevře průchod.</p>' : ''}`}
    ${index !== CORE_FRONTIER && index !== CORE_CENTER ? '<p class="tiny">V mapě vybírej dosažitelné hvězdy. Červí díra vede do 22 před hranici.</p>' : ''}`;
  return `<details id="space-core" class="space-core" data-preserve-open ${index === CORE_FRONTIER || index === CORE_CENTER && !progress.encounter ? 'open' : ''}>
    <summary>✦ ${progress.encounter ? 'Kořen jasu · galaxie pokračuje' : 'Cíl výpravy: Srdce světla'}</summary>${progress.encounter ? reward : route}</details>`;
}
