import { defaultBuildingAppearance, validateBuildingAppearance, appearanceName, type BuildingAppearance } from './building-design';
import type { GameState } from './types';
import { cityAt, cityProgression, type City } from './cities';
import { activeField, navigation } from './planet-travel';
import { buildingSite, cityLot } from './city-spatial';

export const CITY_CYCLE_SECONDS = 10;
export const CITY_FOOD_CAPACITY = 120;
export const CITY_BUILDING_LIMIT = 16;
export const CITY_POPULATION_LIMIT = 32;
export const CITY_LEDGER_LIMIT = 1e12;
export const CITY_CYCLE_LIMIT = 1e7;
export const CITY_BUILDINGS = {
  house: { name:'Obydlí', cost:20, upkeep:1, workers:0, radius:2, color:'#e9d5a8', short:'D', effect:'4 místa pro obyvatele' },
  garden: { name:'Pěstírna', cost:16, upkeep:1, workers:2, radius:2.5, color:'#8fc997', short:'P', effect:'6 porcí / cyklus · 2 pracovníci' },
  workshop: { name:'Dílna', cost:24, upkeep:2, workers:2, radius:2.5, color:'#e6a15c', short:'V', effect:'až 8 jantaru / cyklus · 2 pracovníci' },
  park: { name:'Zahrada odpočinku', cost:18, upkeep:1, workers:1, radius:2.5, color:'#b5a2d6', short:'Z', effect:'+15 nálady do 20 jednotek · 1 pracovník' },
} as const;
export type CityBuildingKind = keyof typeof CITY_BUILDINGS;
export interface CityBuilding { id:number; kind:CityBuildingKind; lot:number; enabled:boolean; paidAmber:number; appearance?:BuildingAppearance; }
export interface CityResident { id:number; source:'invited'; cycle:number; paidAmber:4; }
export interface CityCycle {
  cycle:number; income:number; upkeep:number; produced:number; consumed:number; discarded:number;
  happiness:number; workers:number; hungry:number; funded:boolean;
}
export interface CityEconomy {
  version:1|2;
  opened:{source:'player'; tick:number; transferredAmber:80};
  revision:number; nextId:number; elapsed:number; cycle:number;
  treasury:number; food:number;
  buildings:CityBuilding[]; residents:CityResident[];
  ledger:{transfers:number; construction:number; immigration:number; supplies:number; income:number; upkeep:number; produced:number; consumed:number; discarded:number};
  last:CityCycle|null;
}
export type CityOrder = {kind:'open'} | {kind:'fund'} | {kind:'invite'} | {kind:'supplies'} | {kind:'build'; building:CityBuildingKind; lot:number; appearance?:BuildingAppearance} | {kind:'enable'; id:number; enabled:boolean} | {kind:'demolish'; id:number} | {kind:'appearance';id:number;appearance:BuildingAppearance};
export const cityCapacity=(e:CityEconomy)=>e.buildings.filter(b=>b.kind==='house').length*4;
export const isBuildingKind=(v:unknown):v is CityBuildingKind=>typeof v==='string'&&Object.hasOwn(CITY_BUILDINGS,v);

/** Pure next-cycle preview. No clocks, random values, grants or saved derived rates. */
export function cityEconomyPreview(city:City) {
  const e=city.economy!;
  const requestedUpkeep=e.buildings.filter(b=>b.enabled).reduce((sum,b)=>sum+CITY_BUILDINGS[b.kind].upkeep,0);
  const funded=e.treasury>=requestedUpkeep;
  let available=e.residents.length;
  const staffed:number[]=[];
  for(const kind of ['garden','workshop','park'] as const) {
    for(const b of e.buildings.filter(b=>b.kind===kind&&b.enabled).sort((a,b)=>a.id-b.id)) {
      if(funded&&available>=CITY_BUILDINGS[kind].workers) {available-=CITY_BUILDINGS[kind].workers;staffed.push(b.id);}
    }
  }
  const count=(kind:CityBuildingKind)=>e.buildings.filter(b=>b.kind===kind&&staffed.includes(b.id)).length;
  const produced=count('garden')*6, hungry=Math.max(0,e.residents.length-e.food-produced);
  const workers=e.residents.length-available;
  const homes=e.buildings.filter(b=>b.kind==='house');
  const nearby=(kind:CityBuildingKind,range:number,points:number,cap:number)=>homes.length===0?0:Math.round(homes.reduce((sum,h)=>{
    const p=cityLot(city,h.lot)!;
    return sum+Math.min(cap,e.buildings.filter(b=>b.kind===kind&&staffed.includes(b.id)&&Math.hypot(cityLot(city,b.lot)!.x-p.x,cityLot(city,b.lot)!.z-p.z)<=range).length*points);
  },0)/homes.length);
  const reasons={base:60,food:hungry>0?-30:20,employment:available===0?10:-10,maintenance:funded?0:-20,pollution:0-nearby('workshop',16,10,30),leisure:nearby('park',20,15,30)};
  const happiness=e.residents.length?Math.max(0,Math.min(100,Object.values(reasons).reduce((a,b)=>a+b,0))):0;
  const income=count('workshop')*Math.floor(8*happiness/100),upkeep=funded?requestedUpkeep:0;
  const consumed=Math.min(e.residents.length,e.food+produced),discarded=Math.max(0,e.food+produced-consumed-CITY_FOOD_CAPACITY);
  return {requestedUpkeep,funded,staffed,produced,consumed,discarded,hungry,workers,happiness,reasons,income,upkeep,net:income-upkeep};
}

export function cityOrderQuote(s:GameState,city:City,order:CityOrder,revision:number):{ok:boolean;reason:string;cost:number} {
  const reject=(reason:string)=>({ok:false,reason,cost:0});
  if(!s.cities||s.cities.version<2||!s.cities.entries.includes(city)||!cityProgression(s)||s.deathReason||s.player.health<=0
    ||navigation(s)?.mode!=='local'||activeField(s)?.id!==city.address.locationId||city.owner.id!==s.homePlanet?.id) return reject('Akci proveď při hraní ve vlastním místním městě.');
  const e=city.economy;
  if(revision!==(e?.revision??0))return reject('Toto potvrzení už bylo použité nebo se město změnilo. Vyber akci znovu.');
  if(order.kind==='open') {
    if(e)return reject('Hospodářství už je otevřené; další počáteční převod se neprovede.');
    if(!Number.isFinite(s.machines!.resource)||s.machines!.resource<80)return reject('Potřebuješ 80 jantaru doma. Vrať se k obsazeným pramenům, vydělej a znovu navštiv město.');
    return {ok:true,cost:80,reason:'Převést 80 jantaru z domova do místní pokladny a otevřít hospodářství. Bez obyvatel a staveb zdarma.'};
  }
  if(!e)return reject('Nejprve otevři hospodářství převodem 80 jantaru.');
  if(e.revision>=1e9||e.nextId>=1e9-2||Object.values(e.ledger).some(v=>v>CITY_LEDGER_LIMIT-100))return reject('Dosažen účetní limit města. Ulož kampaň.');
  let cost=0,reason='';
  if(order.kind==='fund') {
    if(!Number.isFinite(s.machines!.resource)||s.machines!.resource<20)return reject('Doma chybí 20 jantaru. Návrat domů obnoví příjem obsazených pramenů; pak se vrať a převeď peníze.');
    return {ok:true,cost:20,reason:'Převést 20 jantaru z domova do města. Celková zásoba se nezvýší.'};
  } else if(order.kind==='invite') {
    if(e.residents.length+2>Math.min(CITY_POPULATION_LIMIT,cityCapacity(e)))return reject('Pro dva příchozí chybí volná místa. Postav další obydlí (4 místa); limit je 32 obyvatel.');
    if(e.food+4>CITY_FOOD_CAPACITY)return reject('Ve skladu musí být místo na 4 porce příchozích.');
    cost=8;reason='Pozvat 2 nové civilní obyvatele za 8 jantaru, včetně 4 porcí. Původní kmenové jednotky zůstanou doma.';
  } else if(order.kind==='supplies') {
    if(e.food+20>CITY_FOOD_CAPACITY)return reject('Ve skladu není místo na 20 porcí (kapacita 120).');
    cost=10;reason='Koupit 20 porcí za 10 jantaru z místní pokladny.';
  } else if(order.kind==='build') {
    if(!isBuildingKind(order.building))return reject('Neznámý druh provozu.');
    if(e.buildings.length>=CITY_BUILDING_LIMIT)return reject('Město má nejvýše 16 budov; lze zbourat nepotřebný provoz.');
    if(order.appearance){try{validateBuildingAppearance(order.appearance,order.building);}catch(error){return reject((error as Error).message);}if(e.version!==2)return reject('Nejprve aktivuj novou verzi měst načtením kampaně.');}
    const site=buildingSite(s,city,order.lot,order.building);
    if(site)return reject(site);
    cost=CITY_BUILDINGS[order.building].cost;reason=`Postavit ${CITY_BUILDINGS[order.building].name} na parcele ${order.lot+1} za ${cost} jantaru. Údržba ${CITY_BUILDINGS[order.building].upkeep} / cyklus. Vzhled: ${appearanceName(order.appearance)}. Vzhled nemění cenu ani účinky.`;
  } else {
    const b=e.buildings.find(b=>b.id===order.id);
    if(!b)return reject('Tato stavba už neexistuje.');
    if(order.kind==='appearance') {
      if(e.version!==2)return reject('Vzhled vyžaduje novou verzi měst.');
      try{validateBuildingAppearance(order.appearance,b.kind);}catch(error){return reject((error as Error).message);}
      if(JSON.stringify(b.appearance)===JSON.stringify(order.appearance))return reject('Budova už tento vzhled má.');
      reason=`Změnit pouze vzhled ${CITY_BUILDINGS[b.kind].name} na parcele ${b.lot+1}: ${appearanceName(order.appearance)}. Cena 0 jantaru; typ, kapacita, produkce, údržba a čas zůstávají.`;
    } else if(order.kind==='enable') {
      if(typeof order.enabled!=='boolean'||b.enabled===order.enabled)return reject('Provoz už má požadovaný stav.');
      if(b.kind==='house')return reject('Obydlí se nevypíná.');
      reason=`${order.enabled?'Zapnout':'Vypnout'} ${CITY_BUILDINGS[b.kind].name}. ${order.enabled?`Údržba ${CITY_BUILDINGS[b.kind].upkeep} jantaru / cyklus.`:'Bez údržby a produkce.'}`;
    } else if(order.kind==='demolish') {
      if(b.kind==='house'&&cityCapacity(e)-4<e.residents.length)return reject('Obydlí nelze zbourat: obyvatelé by ztratili místo. Nejprve postav náhradu.');
      reason=`Zbourat ${CITY_BUILDINGS[b.kind].name}. Vratka 0 jantaru; účinek i údržba skončí.`;
    } else return reject('Neznámá městská akce.');
  }
  if(e.treasury<cost)return reject(`Místní pokladna má ${e.treasury}, cena je ${cost} jantaru. Převeď 20 z domova nebo nech pracovat zaplacené dílny.`);
  return {ok:true,cost,reason};
}

/** One synchronous transaction, after every precondition. Retry uses the old revision. */
export function applyCityOrder(s:GameState,cityId:string,order:CityOrder,revision:number):boolean {
  const city=s.cities?.entries.find(c=>c.id===cityId),nav=navigation(s);
  if(!city||!nav)return false;
  const q=cityOrderQuote(s,city,order,revision);
  if(!q.ok){nav.notice=q.reason;return false;}
  if(order.kind==='open') {
    s.machines!.resource-=80;
    city.economy={version:s.cities!.version===3?2:1,opened:{source:'player',tick:s.tick,transferredAmber:80},revision:1,nextId:1,elapsed:0,cycle:0,treasury:80,food:0,buildings:[],residents:[],
      ledger:{transfers:80,construction:0,immigration:0,supplies:0,income:0,upkeep:0,produced:0,consumed:0,discarded:0},last:null};
  } else {
    const e=city.economy!;
    if(order.kind==='fund'){s.machines!.resource-=20;e.treasury+=20;e.ledger.transfers+=20;}
    else if(order.kind==='build'){e.treasury-=q.cost;e.ledger.construction+=q.cost;e.buildings.push({id:e.nextId++,kind:order.building,lot:order.lot,enabled:true,paidAmber:q.cost,...(e.version===2?{appearance:structuredClone(order.appearance??defaultBuildingAppearance())}:{})});}
    else if(order.kind==='invite'){e.treasury-=q.cost;e.ledger.immigration+=q.cost;e.food+=4;for(let i=0;i<2;i++)e.residents.push({id:e.nextId++,source:'invited',cycle:e.cycle,paidAmber:4});}
    else if(order.kind==='supplies'){e.treasury-=q.cost;e.ledger.supplies+=q.cost;e.food+=20;}
    else if(order.kind==='enable')e.buildings.find(b=>b.id===order.id)!.enabled=order.enabled;
    else if(order.kind==='appearance')e.buildings.find(b=>b.id===order.id)!.appearance=structuredClone(order.appearance);
    else e.buildings=e.buildings.filter(b=>b.id!==order.id);
    e.revision++;
  }
  nav.notice=`Potvrzeno · ${q.reason}`;
  return true;
}

/** Called only from the active field branch; no campaign clocks or machine income. */
export function stepCityEconomy(s:GameState,dt:number):void {
  const city=cityAt(s),e=city?.economy;
  if(!e||!city||!activeField(s)||navigation(s)?.mode!=='local'||s.deathReason||s.player.health<=0||!Number.isFinite(dt)||dt<=0)return;
  if(e.cycle>=CITY_CYCLE_LIMIT||Object.values(e.ledger).some(v=>v>CITY_LEDGER_LIMIT-100))return;
  e.elapsed+=Math.min(1/30,dt);
  if(e.elapsed+1e-9<CITY_CYCLE_SECONDS)return;
  e.elapsed=Math.max(0,e.elapsed-CITY_CYCLE_SECONDS);
  const result=cityEconomyPreview(city);
  e.treasury+=result.income-result.upkeep;
  e.food+=result.produced-result.consumed-result.discarded;
  for(const key of ['income','upkeep','produced','consumed','discarded'] as const)e.ledger[key]+=result[key];
  e.cycle++;
  e.last={cycle:e.cycle,income:result.income,upkeep:result.upkeep,produced:result.produced,consumed:result.consumed,discarded:result.discarded,happiness:result.happiness,workers:result.workers,hungry:result.hungry,funded:result.funded};
}
