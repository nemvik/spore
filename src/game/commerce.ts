import type { GameState, Vec3 } from './types';
import type { VehicleConstruction } from './blueprint';
import { vehicleStats } from './blueprint';
import { activeMachines, machineDesign, machineHome } from './machines';
import { atSea, enableMaritime, homeCoast, seaRoute } from './maritime';
import { atlasNeighbours } from './planet-geography';
import { activeField, navigation } from './planet-travel';
import { cityAt, cityProgression, type City } from './cities';
import { landRoute } from './military';
import { raids } from './defense';

export const COMMERCE_LIMIT = 128, DELIVERY_LIMIT = 512, DELIVERY_PRICE = 20, DELIVERY_COUNT = 3;
export type CommerceCarrier = {kind:'fleet';id:number} | {kind:'boat';id:string};
export interface Delivery {
  units?: 1|2|3;
  id:number; carrier:CommerceCarrier; blueprint:VehicleConstruction; home:Vec3|null; route:number[];
  phase:'outbound'|'returning'|'returned'; delivered:boolean; progress:number; distance:number; elapsed:number; turn:number;
  payment:{amount:20|40|60;before:number;after:number;springId:number};
  refund:null|{amount:20|40|60;before:number;after:number};
}
export interface TradeContract {
  id:number; cityId:string; stateId:string; epoch:number; turn:number;
  status:'open'|'cancelled'|'settled'; deliveries:Delivery[];
  refund:null|{amount:number;before:number;after:number}; receiptId:string|null;
}
export interface Commerce {version:1;revision:number;contracts:TradeContract[];}
export const ownershipEpoch=(c:City)=>(c.capture?1:0)+(c.transfers?.length??0);
export const activeDelivery=(s:GameState)=>s.commerce?.contracts.flatMap(contract=>contract.deliveries.filter(delivery=>delivery.phase!=='returned').map(delivery=>({contract,delivery})))[0]??null;
export const inCommerce=(s:GameState)=>!!activeDelivery(s);
export const contractFor=(s:GameState,c:City)=>s.commerce?.contracts.find(v=>v.cityId===c.id&&v.status==='open')??null;
export const deliveredCount=(c:TradeContract)=>c.deliveries.filter(d=>d.delivered&&d.phase==='returned').reduce((n,d)=>n+(d.units??1),0);
export const contractCurrent=(c:TradeContract,city:City)=>city.owner.kind==='state'&&city.owner.id===c.stateId&&ownershipEpoch(city)===c.epoch;
export const matureContract=(s:GameState,c:City)=>{const v=contractFor(s,c);return v&&contractCurrent(v,c)&&deliveredCount(v)===DELIVERY_COUNT&&!inCommerce(s)?v:null;};
export const deliveryRate=(d:Delivery)=>Math.max(.1,vehicleStats(d.blueprint).speed/4);
export function enableCommerce(s:GameState,origin:'birth'|'legacy-activation'='legacy-activation'):void {
  enableMaritime(s,origin);
  const migrate=(v:GameState)=>{if(v.commerce)return false;v.commerce={version:1,revision:0,contracts:[]};return true;};
  migrate(s);if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}
const fail=(s:GameState,reason:string)=>{if(navigation(s))navigation(s)!.notice=reason;return false;};
const context=(s:GameState)=>!!s.commerce&&s.stage===4&&cityProgression(s)&&!s.deathReason&&s.player.health>0&&navigation(s)?.mode==='local'&&!atSea(s);
export function commerceRoute(s:GameState,c:City,carrier:VehicleConstruction['carrier']):number[]|null {
  const to=navigation(s)?.fields.find(f=>f.id===c.address.locationId)?.cellId,from=homeCoast(s);
  if(to===undefined)return null;
  if(carrier==='tank')return landRoute(s,c);
  if(carrier==='boat')return seaRoute(s,from,to);
  if(from===to)return null;
  const queue=[from],parents=new Map([[from,-1]]);
  for(let i=0;i<queue.length;i++){
    const here=queue[i];if(here===to){const route:number[]=[];for(let n=to;n!==-1;n=parents.get(n)!)route.unshift(n);return route;}
    for(const next of atlasNeighbours(here))if(!parents.has(next)){parents.set(next,here);queue.push(next);}
  }
  return null;
}
export function openTradeContract(s:GameState,c:City|null=cityAt(s)):boolean {
  if(!context(s)||!c||!s.cities!.entries.includes(c)||activeField(s)?.id!==c.address.locationId||c.owner.kind!=='state'||inCommerce(s))return fail(s,'Kontrakt sjednej při návštěvě cizího města po dokončení přepravy.');
  if(contractFor(s,c))return fail(s,'Toto město už má otevřený kontrakt.');
  if(s.commerce!.contracts.length>=COMMERCE_LIMIT)return fail(s,'Další kontrakt se nevejde do deníku; existující lze dokončit nebo zrušit.');
  s.commerce!.contracts.push({id:s.commerce!.contracts.length+1,cityId:c.id,stateId:c.owner.id,epoch:ownershipEpoch(c),turn:s.states!.clock.turn,status:'open',deliveries:[],refund:null,receiptId:null});s.commerce!.revision++;
  navigation(s)!.notice='Dohodnuty tři zkušební dodávky. Každá vloží 20 jantaru do úschovy kupní ceny. Vyber vlastní vozidlo v domácí dílně.';return true;
}
export function carrierDesign(s:GameState,carrier:CommerceCarrier):VehicleConstruction|null {
  if(carrier.kind==='boat')return s.maritime?.vessel?.id===carrier.id?s.maritime.vessel.blueprint:null;
  const m=activeMachines(s),u=m?.fleet.find(u=>u.id===carrier.id);return m&&u?machineDesign(m,u):null;
}
export function deliveryQuote(s:GameState,c:TradeContract,carrier:CommerceCarrier,units:number=1):{reason:string|null;route:number[]|null;blueprint:VehicleConstruction|null} {
  const deny=(reason:string)=>({reason,route:null,blueprint:null}),city=s.cities?.entries.find(v=>v.id===c.cityId),m=activeMachines(s);
  if(!Number.isInteger(units)||units<1||units>DELIVERY_COUNT-deliveredCount(c))return deny('Neplatný počet zásilek; lze spojit jen zbývající část kontraktu.');
  if(!carrier||!['fleet','boat'].includes(carrier.kind))return deny('Neplatný dopravce.');
  if(!context(s)||!s.commerce!.contracts.includes(c)||c.status!=='open'||!city||!contractCurrent(c,city))return deny('Kontrakt už není platný pro tohoto vlastníka. Vrať přepravu a zruš jej s vratkou.');
  if(activeField(s)?.id!==city.address.locationId)return deny('Přepravu řiď při návštěvě smluvního města.');
  if(inCommerce(s)||s.military?.deployment||raids(s).some(r=>!['destroyed','returned','withdrawn'].includes(r.phase)))return deny('Nejprve dokonči rozjetou přepravu nebo vojenské nasazení a návraty.');
  if(deliveredCount(c)>=DELIVERY_COUNT)return deny('Tři dodávky jsou hotové. Vyžádej kupní nabídku nebo zruš kontrakt.');
  if(s.commerce!.contracts.reduce((n,v)=>n+v.deliveries.length,0)>=DELIVERY_LIMIT)return deny('Deník přeprav je plný. Existující kontrakt lze zrušit s vratkou.');
  if(!m||!m.springs.some(p=>p.owner==='player')||!Number.isFinite(m.resource)||m.resource<DELIVERY_PRICE*units)return deny(`Přeprava vyžaduje ${DELIVERY_PRICE*units} jantaru z domácího pramene. Vrať se domů vydělat.`);
  const blueprint=carrierDesign(s,carrier);if(!blueprint)return deny('Vybrané vlastní vozidlo už neexistuje.');
  if(carrier.kind==='fleet'){
    const u=m.fleet.find(u=>u.id===carrier.id)!;
    if(u.health<=0||u.cargo!==0||u.orders.length||Math.hypot(u.pos.x-machineHome(s).x,u.pos.z-machineHome(s).z)>12)return deny('Vozidlo musí být živé, bez nákladu a příkazů, do 12 metrů od domácí dílny.');
  }else if(s.maritime!.vessel!.mooring!==homeCoast(s)||s.maritime!.vessel!.health<=0)return deny('Člun musí kotvit živý u domova.');
  const route=commerceRoute(s,city,blueprint.carrier);if(!route)return deny(blueprint.carrier==='boat'?'Město potřebuje pobřeží spojené s domovem vodní trasou.': 'Tank nemá souvislou pevninskou cestu. Použij letoun nebo pobřežní člun.');
  return {reason:null,route,blueprint};
}
export function dispatchDelivery(s:GameState,id:number,carrier:CommerceCarrier,revision:number,units:1|2|3=1):boolean {
  const c=s.commerce?.contracts.find(c=>c.id===id);if(!c||s.commerce!.revision!==revision)return fail(s,'Zastaralý příkaz přepravy. Vyber vozidlo znovu.');
  const q=deliveryQuote(s,c,carrier,units);if(q.reason||!q.route||!q.blueprint)return fail(s,q.reason!);
  const m=activeMachines(s)!,u=carrier.kind==='fleet'?m.fleet.find(u=>u.id===carrier.id)!:null,before=m.resource,amount=DELIVERY_PRICE*units as 20|40|60;
  const delivery:Delivery={...(units>1?{units}:{}),id:c.deliveries.length+1,carrier:{...carrier},blueprint:structuredClone(q.blueprint),home:u?{...u.pos}:null,route:q.route,phase:'outbound',delivered:false,progress:0,distance:0,elapsed:0,turn:s.states!.clock.turn,payment:{amount,before,after:before-amount,springId:m.springs.find(p=>p.owner==='player')!.id},refund:null};
  m.resource=delivery.payment.after;if(u)u.intent='rest';c.deliveries.push(delivery);s.commerce!.revision++;
  navigation(s)!.notice=`Naloženo ${units} zásilek za ${amount} jantaru do úschovy. Vlastní vozidlo vyjelo z domova; na cíli potvrď vyložení a návrat.`;return true;
}
export function stepCommerce(s:GameState,dt:number):void {
  const active=activeDelivery(s);if(!active||!context(s))return;
  const d=active.delivery,total=d.route.length-1,remaining=d.phase==='outbound'?total-d.progress:d.progress;
  const move=Math.min(remaining,Math.max(0,Math.min(1/30,Number.isFinite(dt)?dt:0))*deliveryRate(d));
  d.elapsed+=move;if(d.phase==='outbound'){d.progress+=move;d.distance=d.progress;}else d.progress-=move;
}
export function deliveryAction(s:GameState,action:'unload'|'abort'|'dock',revision:number):boolean {
  const a=activeDelivery(s);if(!context(s)||!a||s.commerce!.revision!==revision)return false;
  const {contract:c,delivery:d}=a,city=s.cities!.entries.find(v=>v.id===c.cityId)!,m=activeMachines(s)!;
  if(action==='unload'){
    if(d.phase!=='outbound'||d.progress<d.route.length-1-1e-8)return fail(s,'Vozidlo ještě nedojelo.');
    if(!contractCurrent(c,city))return fail(s,'Město změnilo vlastníka. Obrať s nákladem zpět.');
    d.progress=d.distance=d.route.length-1;d.elapsed=d.progress;d.delivered=true;d.phase='returning';
    navigation(s)!.notice='Dodávka vyložena a zůstává v úschově. Vozidlo se vrací domů. Tři dodávky umožní dohodu i se solventním státem.';
  }else if(action==='abort'){
    if(d.phase!=='outbound')return false;d.phase='returning';
    navigation(s)!.notice=`Přerušeno. Vozidlo veze náklad zpět; ${d.payment.amount} jantaru se vrátí po dojezdu do dílny.`;
  }else{
    if(d.phase!=='returning'||d.progress>1e-8)return fail(s,'Vozidlo ještě není doma.');
    if(!d.delivered){if(m.resource>1e9-d.payment.amount)return fail(s,'Domácí sklad nemá místo pro celou vratku.');d.refund={amount:d.payment.amount,before:m.resource,after:m.resource+d.payment.amount};m.resource+=d.payment.amount;}
    d.phase='returned';d.progress=0;d.elapsed=2*d.distance;
    navigation(s)!.notice=d.delivered?`Vozidlo doma. Doručeno ${deliveredCount(c)}/3; v úschově ${deliveredCount(c)*20} jantaru.`:`Vozidlo i ${d.payment.amount} jantaru se vrátily. Kontrakt lze opakovat nebo zrušit.`;
  }
  s.commerce!.revision++;return true;
}
export function cancelTradeContract(s:GameState,id:number,revision:number):boolean {
  const c=s.commerce?.contracts.find(c=>c.id===id),m=activeMachines(s);
  if(!context(s)||!c||c.status!=='open'||inCommerce(s)||!m||s.commerce!.revision!==revision)return fail(s,'Nejprve dokonči přepravu a vyber otevřený kontrakt.');
  const amount=deliveredCount(c)*20;if(m.resource>1e9-amount)return fail(s,'Domácí sklad nemá místo pro celou vratku. Nejprve uvolni zásobu.');
  c.refund={amount,before:m.resource,after:m.resource+amount};m.resource+=amount;c.status='cancelled';s.commerce!.revision++;
  navigation(s)!.notice=`Kontrakt zrušen, vráceno ${amount} jantaru do domova. Žádný převod vlastnictví.`;return true;
}
