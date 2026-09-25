import { appearanceName, type BuildingAppearance } from '../game/building-design';
import type { GameState } from '../game/types';
import { cityAt, type City } from '../game/cities';
import { applyCityOrder, cityOrderQuote, cityCapacity, cityEconomyPreview, CITY_BUILDINGS, CITY_CYCLE_LIMIT, isBuildingKind, type CityBuildingKind, type CityOrder } from '../game/city-economy';
import { CITY_LOTS, cityLot, buildingSite, cityHall } from '../game/city-spatial';
import { cityEscape } from './cities';
import { syncMarkup } from './sync-markup';

// Presentation state only; never persisted as a purchase or placement.
let shown:City|null=null,kind:CityBuildingKind='house',lot:number|null=null;
let appearance:BuildingAppearance|undefined;
let pending:{order:CityOrder;revision:number}|null=null;
const button=(key:string,label:string,disabled=false)=>`<button class="secondary" data-action="city-econ:${key}" ${disabled?'disabled':''}>${label}</button>`;
const signed=(n:number)=>`${n>=0?'+':''}${n}`;
function selectCityUi(c:City) {if(shown!==c){shown=c;kind='house';lot=null;pending=null;appearance=undefined;}}

export function cityEconomyAction(s:GameState,arg:string):boolean {
  const c=cityAt(s);if(!c)return false;selectCityUi(c);
  const [action,value]=arg.split(',');let order:CityOrder|null=null;
  if(action==='kind'&&isBuildingKind(value)){kind=value;pending=null;appearance=undefined;}
  else if(action==='lot'){lot=Number(value);pending=null;}
  else if(action==='cancel')pending=null;
  else if(action==='confirm'&&pending){const p=pending;pending=null;return applyCityOrder(s,c.id,p.order,p.revision);}
  else if(action==='open'||action==='fund'||action==='invite'||action==='supplies')order={kind:action};
  else if(action==='build'&&lot!==null)order={kind:'build',building:kind,lot,...(appearance?{appearance:structuredClone(appearance)}:{})};
  else if(action==='disable'||action==='enable')order={kind:'enable',id:Number(value),enabled:action==='enable'};
  else if(action==='demolish')order={kind:'demolish',id:Number(value)};
  if(order)pending={order,revision:c.economy?.revision??0};
  return false;
}

export function cityDesignKind(s:GameState):CityBuildingKind {const c=cityAt(s);if(c)selectCityUi(c);return kind;}
export function chooseCityAppearance(s:GameState,value:BuildingAppearance,id?:number):void {const c=cityAt(s);if(!c)return;selectCityUi(c);if(id!==undefined)pending={order:{kind:'appearance',id,appearance:structuredClone(value)},revision:c.economy?.revision??0};else{appearance=structuredClone(value);pending=null;}}

export function cityEconomyMarkup(s:GameState):string {
  const c=cityAt(s);if(!c)return '';selectCityUi(c);
  const e=c.economy,revision=e?.revision??0;
  if(c.owner.kind==='state'){
    const p=e?cityEconomyPreview(c):null;
    return `<h3>Hospodářství cizího města</h3><p>Jsi návštěvník. Rozvoj i platby řídí jeho stát.</p>${e?`<div class="city-economy-metrics"><strong>Pokladna ${e.treasury} ◈</strong><span>${e.residents.length}/${cityCapacity(e)} občanů</span><span>Jídlo ${e.food}/120</span></div><p>Cyklus ${e.cycle} · za ${(10-e.elapsed).toFixed(1)} s návštěvy: +${p!.income} − ${p!.upkeep} jantaru. Spokojenost ${p!.happiness}/100.</p><p>${e.last?`Poslední skutečný cyklus: +${e.last.income} − ${e.last.upkeep}, jídlo +${e.last.produced} − ${e.last.consumed}.`:'Žádná minulá výroba není zaznamenaná.'}</p><ul>${e.buildings.map(b=>`<li>${CITY_BUILDINGS[b.kind].name} · parcela ${b.lot+1} · zaplaceno ${b.paidAmber} ◈</li>`).join('')}</ul><details data-preserve-open><summary>Účetnictví města</summary><p>Převody ${e.ledger.transfers} · stavby ${e.ledger.construction} · příchody ${e.ledger.immigration} · příjem ${e.ledger.income} · údržba ${e.ledger.upkeep} ◈.</p></details>`:'<p>Stát zatím neotevřel hospodářství. Žádní občané ani výroba zdarma.</p>'}`;
  }

  const confirmation=pending?cityOrderQuote(s,c,pending.order,pending.revision):null;
  const confirm=`<section class="city-confirm" aria-label="Potvrzení městské akce" ${pending?'':'hidden'}><p>${cityEscape(confirmation?.reason??'')}</p>${button('confirm','Potvrdit akci',!confirmation?.ok)}${button('cancel','Zrušit')}</section>`;
  if(!e){const q=cityOrderQuote(s,c,{kind:'open'},0);return `<h3>Otevřít hospodářství</h3><p>Založení a radnice jsou zaplacené. Obyvatelé ani minulá výroba zatím nejsou zaznamenaní.</p><p>Převeď <strong>80 jantaru</strong> z domova do místní pokladny. Potom postav obydlí, pěstírnu a dílnu, pozvi 4 obyvatele a sleduj výsledek po 10 s.</p><p>Doma: ${s.machines!.resource.toFixed(1)} jantaru</p>${button('open','Otevřít · převést 80 jantaru',!q.ok)}${!q.ok?`<p>${cityEscape(q.reason)}</p>`:''}${confirm}`;}
  const p=cityEconomyPreview(c),catalog=CITY_BUILDINGS[kind],timeLimit=e.cycle>=CITY_CYCLE_LIMIT;
  if(lot===null)lot=CITY_LOTS.find(l=>!buildingSite(s,c,l.id,kind))?.id??null;
  const order:CityOrder={kind:'build',building:kind,lot:lot??-1,...(appearance?{appearance}:{})},quote=cityOrderQuote(s,c,order,revision);
  const pos=c.address.position,hall=cityHall(pos);
  const cells=CITY_LOTS.map(l=>{const b=e.buildings.find(b=>b.lot===l.id),blocked=buildingSite(s,c,l.id,kind);return `<button class="city-lot" style="grid-column:${l.id%11+1};grid-row:${Math.floor(l.id/11)+1};${b?`background:${CITY_BUILDINGS[b.kind].color};color:#142e35`:''}" data-action="city-econ:lot,${l.id}" aria-label="Parcela ${l.id+1}${b?' · '+CITY_BUILDINGS[b.kind].name:blocked?' · '+cityEscape(blocked):' · volná'}" aria-pressed="${lot===l.id}" title="${l.id+1}: ${b?CITY_BUILDINGS[b.kind].name:cityEscape(blocked??'Volná parcela')}" ${b?'data-occupied="true"':''}>${b?CITY_BUILDINGS[b.kind].short:blocked?'·':l.id+1}</button>`;}).join('');
  const status=(b:typeof e.buildings[number])=>!b.enabled?'vypnuto':!p.funded?'chybí údržba':b.kind==='house'?'ubytování':p.staffed.includes(b.id)?'pracuje':'chybí pracovníci';
  return `<h3>Hospodářství · cyklus ${e.cycle}</h3><div class="city-economy-metrics"><strong>Pokladna ${e.treasury} ◈</strong><span>${e.residents.length}/${cityCapacity(e)} obyvatel</span><span>Jídlo ${e.food}/120</span><span>${p.workers}/${e.residents.length} pracuje</span></div>
    <p class="city-forecast">${timeLimit?'Časový limit dosažen; hospodářství stojí. Poslední výhled:':`Za ${(10-e.elapsed).toFixed(1)} s hraní:`} příjem <b>+${p.income}</b> − výdaje <b>${p.upkeep}</b> = <b>${signed(p.net)} jantaru</b><br>Jídlo +${p.produced} − ${p.consumed}${p.discarded?` · přebytek ${p.discarded} propadne`:''}</p>
    <p class="city-last">${e.last?`Poslední cyklus ${e.last.cycle}: +${e.last.income} − ${e.last.upkeep} = ${signed(e.last.income-e.last.upkeep)} jantaru; jídlo +${e.last.produced} − ${e.last.consumed}; spokojenost ${e.last.happiness}/100.${e.last.discarded?` Přebytek ${e.last.discarded} porcí propadl.`:''}`:'Dosud žádný hospodářský výsledek.'}</p>
    <details data-preserve-open><summary>Spokojenost ${p.happiness}/100 · příčiny</summary><p>Základ 60; jídlo ${signed(p.reasons.food)}; zaměstnání ${signed(p.reasons.employment)}; údržba ${signed(p.reasons.maintenance)}; blízké dílny ${p.reasons.pollution}; odpočinek +${p.reasons.leisure}. Bez obyvatel je spokojenost 0.</p><p>Dílna: 8 × spokojenost / 100, zaokrouhleno dolů. Do 16 jednotek od obydlí snižuje náladu; zahrada do 20 ji zvyšuje. Průměr přes obydlí.</p></details>
    <p class="city-warning">${timeLimit?'Dosažen limit 10 milionů cyklů. Ulož kampaň; další hospodářský čas se nezapočítává.':!p.funded?`Provoz stojí: údržba vyžaduje ${p.requestedUpkeep} jantaru před výrobou. Vypni zbytečné provozy nebo převeď peníze z domova.`:p.hungry?`${p.hungry} obyvatelům chybí jídlo. Zapni/obsazuj pěstírnu nebo kup zásoby.`:e.residents.length===0?'Začni obydlím a pozvi obyvatele; pracovníci se přidělí pěstírnám, dílnám a zahradám.':'Výroba a údržba probíhají jen zde během hraní.'}</p>
    <div class="city-economy-actions">${button('invite','Pozvat 2 · 8 ◈')}${button('fund','Převést z domova 20 ◈')}${button('supplies','20 porcí · 10 ◈')}</div>${confirm}
    <details data-preserve-open class="city-construction"><summary>Rozvoj · ${e.buildings.length}/16 staveb</summary><div class="city-kind">${Object.entries(CITY_BUILDINGS).map(([id,v])=>`<button class="secondary" data-action="city-econ:kind,${id}" aria-pressed="${kind===id}">${v.name} · ${v.cost} ◈</button>`).join('')}</div>
    <p>Vzhled: <strong>${cityEscape(appearanceName(appearance))}</strong></p><button class="secondary" data-action="building-open:build">Vybrat / vytvořit vzhled</button><p>${catalog.effect}<br>Údržba ${catalog.upkeep} jantaru / 10 s. Místní sever ↑; parcela má rozestup 8 jednotek.</p><div class="city-lots" role="group" aria-label="Parcely města; N je náměstí, R radnice">${cells}<span style="grid-column:6;grid-row:6" title="Náměstí">N</span><span style="grid-column:${Math.round((hall.x-pos.x)/8)+6};grid-row:6" title="Radnice">R</span></div><p class="tiny">N náměstí · R radnice · D obydlí · P pěstírna · V dílna · Z odpočinek. Tečka: nevhodná parcela, vyber ji pro důvod.</p><p class="city-site">${lot===null?'Žádná dostupná parcela.':`Parcela ${lot+1} · X ${cityLot(c,lot)?.x.toFixed(1)}, Z ${cityLot(c,lot)?.z.toFixed(1)}. `}${cityEscape(quote.reason)}</p>${button('build',`Postavit ${catalog.name} · ${catalog.cost} ◈`,!quote.ok)}</details>
    <details data-preserve-open><summary>Provozy a náklady</summary><ul class="city-buildings">${e.buildings.map(b=>`<li><strong>${CITY_BUILDINGS[b.kind].name} · parcela ${b.lot+1}</strong><br>${status(b)} · ${b.enabled?CITY_BUILDINGS[b.kind].upkeep:0} ◈ / cyklus${b.kind!=='house'?button(`${b.enabled?'disable':'enable'},${b.id}`,b.enabled?'Vypnout':'Zapnout'):''}<p class="tiny">${cityEscape(appearanceName(b.appearance))}</p><button class="secondary" data-action="building-open:${b.id}">Upravit vzhled · 0 ◈</button>${button(`demolish,${b.id}`,'Zbourat · vratka 0')}</li>`).join('')}</ul></details>
    <details data-preserve-open><summary>Účetnictví a původ</summary><p>Převedeno ${e.ledger.transfers}; stavby ${e.ledger.construction}; příchody ${e.ledger.immigration}; zásoby ${e.ledger.supplies}; výroba +${e.ledger.income}; údržba −${e.ledger.upkeep} jantaru.</p><p>${e.residents.length} nově pozvaných civilních obyvatel vlastní linie. Žádné přesunuté kmenové jednotky. Každý spotřebuje 1 porci / cyklus. Doma zbývá ${s.machines!.resource.toFixed(1)} jantaru. Prameny a jejich dědictví fungují jen doma; městské dílny mají vlastní sazbu.</p></details>`;
}

export function updateCityEconomy(s:GameState,root:HTMLElement):void {syncMarkup(root,cityEconomyMarkup(s));}
