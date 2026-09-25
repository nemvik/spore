import { ownerName } from '../game/states';
import { statesMarkup } from './states';
import type { GameState } from '../game/types';
import { cityAt, foundingAvailability, CITY_COST, type City } from '../game/cities';
import { geographicAddress } from '../game/planet-geography';
import { navigation } from '../game/planet-travel';
import { cityEconomyMarkup } from './city-economy';
export const cityEscape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function cityAddressText(s:GameState,c:City):string {
  const g=geographicAddress(s,c.address)!.point,p=c.address.position;
  return `${g.latitude.toFixed(5)}° šířky · ${g.longitude.toFixed(5)}° délky · ${g.altitudeMeters.toFixed(1)} m<br>Místní X ${p.x.toFixed(1)} · Y ${p.y.toFixed(2)} · Z ${p.z.toFixed(1)}`;
}
export function cityFoundingStatus(s:GameState):string {
  const status=foundingAvailability(s),m=s.machines;
  return `<p>${m?.version===2?`Domovská zásoba: <strong class="city-balance">${m.resource.toFixed(1)} jantaru</strong><br>`:''}Cena: <strong>${CITY_COST} jantaru</strong></p><p class="city-condition">${status.available?'✓':'⊘'} ${cityEscape(status.reason)}</p><button class="primary" data-action="city-found" ${status.available?'':'disabled'}>Založit město · ${CITY_COST} jantaru</button>`;
}
/** Keep name input and action button mounted while the field HUD refreshes. */
export function updateCityFounding(s:GameState,root:HTMLElement):void {
  const status=foundingAvailability(s),button=root.querySelector<HTMLButtonElement>('[data-action="city-found"]'),reason=root.querySelector('.city-condition'),balance=root.querySelector('.city-balance');
  if(button)button.disabled=!status.available;
  if(reason)reason.textContent=`${status.available?'✓':'⊘'} ${status.reason}`;
  if(balance&&s.machines?.version===2)balance.textContent=`${s.machines.resource.toFixed(1)} jantaru`;
}
export function cityPanel(s:GameState):string {
  const c=cityAt(s);
  return `<aside class="city-panel panel"><span class="eyebrow">${c?'Skutečně založené město':'Založení města'}</span>${c?`<h2>${cityEscape(c.name)}</h2><p class="city-owner">${cityEscape(ownerName(s,c))}${c.owner.kind==='state'?' · návštěvník':''}</p><details><summary>Vlastník, založení a adresa</summary><p>${c.founded.source==='player'?'Hráčské založení':'Nové státní osídlení'} · etapa ${c.founded.stage+1} · zaplaceno ${c.founded.paidAmber} jantaru</p><p>${cityAddressText(s,c)}</p><p class="city-identity">${cityEscape(c.id)}<br>Vlastník: ${cityEscape(c.owner.id)}<br>Lokalita: ${cityEscape(c.address.locationId)}</p></details><div id="city-economy">${cityEconomyMarkup(s)}</div><button class="secondary" data-action="atlas">Vybrat v globálním přehledu · N</button>`:`<h2>Nové město</h2><p class="tiny">Strojová etapa · vlastní jantarový pramen · tři místní měření · volná rovná pevnina. Domovské osady zůstávají zachované.</p><label for="city-name">Název města</label><input id="city-name" maxlength="40" autocomplete="off" placeholder="Pojmenuj své město"><div id="city-founding-status">${cityFoundingStatus(s)}</div><p class="tiny">Místo náměstí vybíráš chůzí. Radnice bude 14 jednotek východně; příchod zůstane volný.</p>`}<p class="tiny">Během návštěvy stojí domov, jednotky i ostatní města. Místní hospodářství pracuje jen zde, při hraní. Neaktivní města, globální přehled a pauza nic nedohánějí; domov se neléčí ani nevydělává.</p><section id="states-overview">${statesMarkup(s)}</section></aside>`;
}
export function cityAtlasList(s:GameState):string {
  const cities=s.cities?.entries??[],nav=navigation(s)!;
  const selected=cities.find(c=>c.id===s.cities?.selectedId&&nav.fields.some(f=>f.id===c.address.locationId&&f.cellId===nav.selectedCell));
  return `<section class="city-list"><h2>Města · ${cities.length}</h2>${cities.length?`<ul>${cities.map(c=>`<li><button class="secondary" data-action="city-select:${cityEscape(c.id)}" aria-pressed="${c.id===selected?.id}">${cityEscape(c.name)} · ${cityEscape(ownerName(s,c))} · lokalita ${nav.fields.find(f=>f.id===c.address.locationId)!.cellId}</button></li>`).join('')}</ul>`:'<p>Zatím žádné založené město. Ve strojové etapě obsaď jantarový pramen a prozkoumej vzdálenou pevninu.</p>'}${selected?`<div class="city-selected"><h3>${cityEscape(selected.name)}</h3><p>Vlastník: ${cityEscape(ownerName(s,selected))}<br>${cityAddressText(s,selected)}</p><p class="city-identity">${cityEscape(selected.id)}</p><button class="primary" data-action="city-enter:${cityEscape(selected.id)}">Navštívit město</button><p>${selected.economy?`${selected.economy.residents.length} obyvatel · pokladna ${selected.economy.treasury} jantaru · ${selected.economy.cycle} cyklů`:'Hospodářství dosud neotevřené'}</p><p class="tiny">V globálním přehledu a mimo aktivní město hospodářství stojí. Příchod na poslední místní pozici. Etapa a jednotky se nemění.</p></div>`:''}<section id="states-overview">${statesMarkup(s)}</section></section>`;
}
