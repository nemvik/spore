import { hudPanelStart } from './hud-layout';
import { vehicleStats, type VehicleConstruction } from '../game/blueprint';
import type { GameState } from '../game/types';
import { activeMachines } from '../game/machines';
import { cityAt, type City } from '../game/cities';
import { navigation } from '../game/planet-travel';
import { activeDelivery, contractFor, contractCurrent, deliveredCount, deliveryQuote, deliveryRate, openTradeContract, dispatchDelivery, deliveryAction, cancelTradeContract, type CommerceCarrier } from '../game/commerce';
import { cityEscape as escape } from './cities';
import { seaMap } from './maritime';
let pending:{state:GameState;revision:number;contractId:number;carrier:CommerceCarrier|null;units:1|2|3}|null=null;
export const resetCommerceOffer=()=>{pending=null;};
const button=(a:string,label:string,disabled=false)=>`<button class="secondary" data-action="commerce:${a}" ${disabled?'disabled':''}>${label}</button>`;
export function commerceMarkup(s:GameState,c:City):string {
  if(!s.commerce||s.stage!==4)return '';
  const contract=contractFor(s,c),p=pending?.state===s&&pending.contractId===contract?.id?pending:null;
  if(!contract)return c.owner.kind==='state'?`<h3>Obchodní spojení</h3><p>Tři dodávky vlastním vozidlem otevřou dohodu i s bohatým státem. Každá uloží 20 ◈ jako zálohu na kupní cenu. Zbývající zásilky odvezeš společně jednou cestou.</p>${button('open','Sjednat tři zkušební dodávky')}`:'';
  const n=deliveredCount(contract),current=contractCurrent(contract,c);
  const carriers:CommerceCarrier[]=[...(activeMachines(s)?.fleet.map(u=>({kind:'fleet' as const,id:u.id}))??[]),...(s.maritime?.vessel?[{kind:'boat' as const,id:s.maritime.vessel.id}]:[])];
  return `<section class="commerce-contract"><h3 tabindex="-1">Obchodní spojení · ${n}/3 dodávky</h3><p><strong>Úschova ${n*20} ◈</strong> · při koupi se odečte od celé ceny. Stát peníze zatím nečerpá.</p>${!current?'<p>Vlastnictví se změnilo. Zruš starý kontrakt a vezmi úschovu zpět.</p>':n===3?'<p>Všechny dodávky i vozidla jsou doma. Níže vyžádej a potvrď kupní nabídku.</p>':`<details data-preserve-open><summary>Vybrat dopravce · ${3-n} zásilek společně za ${(3-n)*20} ◈</summary>${carriers.length?carriers.map(carrier=>{const q=deliveryQuote(s,contract,carrier,3-n);return `<p>${escape(q.blueprint?.name??(carrier.kind==='boat'?'Domácí člun':`Vozidlo #${carrier.id}`))}${q.route?` · ${q.blueprint!.carrier==='tank'?'souš':q.blueprint!.carrier==='air'?'vzduch':'moře'} · cesta tam ${((q.route.length-1)/(Math.max(.1,vehicleSpeed(q.blueprint!)/4))).toFixed(1)} s`:`<br>${escape(q.reason!)}`}</p>${button(`${3-n>1?'batch-offer':'offer'},${contract.id},${carrier.kind==='boat'?'boat':carrier.id}`,`Naložit ${(3-n)*20} ◈`,!!q.reason)}${3-n>1?button(`offer,${contract.id},${carrier.kind==='boat'?'boat':carrier.id}`,'Jen jednu za 20 ◈',!!deliveryQuote(s,contract,carrier).reason):''}`;}).join(''):'<p>Nejprve doma postav vlastní vozidlo.</p>'}</details>`}
  ${p?`<div class="commerce-confirm"><strong>${p.carrier?`Odečíst ${p.units*20} ◈ z domova a vyjet?`:`Zrušit kontrakt a vrátit ${n*20} ◈?`}</strong><p>${p.carrier?'Vlastní dopravce musí dojet, vyložit a vrátit se. Přerušení vrací náklad až doma.':'Tím ztratíš dosažené obchodní spojení; město zůstane vlastníkovi.'}</p>${button('confirm','Potvrdit')}${button('dismiss','Zpět bez změny')}</div>`:button(`cancel,${contract.id}`,'Zrušit kontrakt a vrátit úschovu')}
  <details data-preserve-open><summary>Deník dodávek (${contract.deliveries.length})</summary>${contract.deliveries.map(d=>`<p>#${d.id} · ${escape(d.blueprint.name)} · ${d.delivered?'doručeno':'vráceno s nákladem'} · vklad ${d.payment.amount} ◈ · ${d.units??1} zásilek${d.refund?`, vratka ${d.refund.amount} ◈`:''}</p>`).join('')||'<p>Zatím žádná jízda.</p>'}</details></section>`;
}
const vehicleSpeed=(v:VehicleConstruction)=>vehicleStats(v).speed;
export function commerceStatus(s:GameState):string {
  const a=activeDelivery(s)!;if(!a)return '';const d=a.delivery,c=s.cities!.entries.find(c=>c.id===a.contract.cityId)!,back=d.phase==='returning',ready=back?d.progress<=1e-8:d.progress>=d.route.length-1-1e-8;
  const remaining=(back?d.progress:d.route.length-1-d.progress)/deliveryRate(d);
  return `<h2 class="commerce-title" id="commerce-heading" tabindex="-1">${back?'Návrat dopravce':ready?'Město na dohled':'Obchodní přeprava'}</h2><p><strong>${escape(d.blueprint.name)}</strong><br>Domácí dílna ↔ ${escape(c.name)}<br>${d.blueprint.carrier==='tank'?'Pozemní':d.blueprint.carrier==='air'?'Letecká':'Pobřežní'} trasa · vklad ${d.payment.amount} ◈</p><details data-preserve-open><summary>Trasa na atlasu · ${d.route.length-1} hran</summary>${seaMap(s,d.route,d.progress,true)}</details><p data-commerce-progress>${ready?'V cíli':`${remaining.toFixed(1)} s do ${back?'domova':'města'}`} · dokončeno ${deliveredCount(a.contract)}/3 · ${d.delivered?'vyloženo':back?'vrací se':'na vozidle'} ${d.units??1}</p><progress value="${d.progress}" max="${d.route.length-1}" aria-label="Průběh přepravy"></progress><p>${d.delivered?'Náklad vyložen do úschovy. Dopravce se vrací prázdný.':back?`Přeprava přerušena. Doma potvrď návrat a vratku ${d.payment.amount} ◈.`:'Náklad zůstává na vozidle. V cíli potvrď vyložení; při přerušení se celý vrátí.'}</p>${back?button('dock','Dokončit návrat do dílny',!ready):button('unload','Vyložit a poslat vozidlo domů',!ready||!contractCurrent(a.contract,c))+button('abort','Přerušit a vrátit náklad')}<p class="tiny">Sleduješ vlastní vozidlo na zkrácené trase atlasu. Výprava čeká ve městě, domov ${s.mobilization?'stojí, soupeřova města dál vyrábějí':'a místní hospodářství stojí'}. Planeta a pauza zastaví přepravu.</p>${button('camera-left','Kamera ←')}${button('camera-right','Kamera →')}${button('camera-in','Přiblížit')}${button('camera-out','Oddálit')}`;
}
export const commerceHud=(s:GameState)=>`<header class="topbar field-topbar"><div><strong>Lumavora · obchod</strong></div><div class="toolbar"><button data-action="atlas">N · Planeta</button><button data-action="save">Uložit</button><button data-action="pause">Pauza</button></div></header>${hudPanelStart('commerce','Obchodní přeprava','sea-panel commerce-panel panel')}<div id="commerce-status">${commerceStatus(s)}</div></details><div class="field-notice" role="status">${escape(navigation(s)!.notice)}</div>`;
export function commerceAction(s:GameState,arg:string):boolean {
  const [action,id,carrier]=arg.split(','),contractId=Number(id);
  if(action==='open')return openTradeContract(s);
  if(action==='dismiss'){pending=null;return false;}
  if(action==='offer'||action==='batch-offer'||action==='cancel'){
    const c=cityAt(s);if(!c||contractFor(s,c)?.id!==contractId)return false;
    pending={state:s,revision:s.commerce!.revision,contractId,units:action==='offer'?1:(3-deliveredCount(contractFor(s,c)!)) as 1|2|3,carrier:action==='cancel'?null:carrier==='boat'?{kind:'boat',id:s.maritime?.vessel?.id??''}:{kind:'fleet',id:Number(carrier)}};return false;
  }
  if(action==='confirm'){
    const p=pending;pending=null;if(!p||p.state!==s||cityAt(s)?.id!==s.commerce!.contracts.find(c=>c.id===p.contractId)?.cityId)return false;
    return p.carrier?dispatchDelivery(s,p.contractId,p.carrier,p.revision,p.units):cancelTradeContract(s,p.contractId,p.revision);
  }
  if(action==='unload'||action==='abort'||action==='dock')return deliveryAction(s,action,s.commerce!.revision);
  return false;
}
