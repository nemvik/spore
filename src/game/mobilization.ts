import type { GameState } from './types';
import type { City } from './cities';
import { ownershipEpoch } from './commerce';
import { cityEconomyPreview, advanceCityEconomy, type CityEconomy, type CityCycle } from './city-economy';
import { enableCityDefense } from './city-defense';
import { createRaid, entryClear, raids, TRANSFER_LIMIT, type Raid } from './defense';
import { defenseDesign, DEFENSE_COST, landRoute } from './military';
import { navigation } from './planet-travel';
import { functioningCity } from './civilization';
import { stateCities, type RivalState } from './states';
export const MOBILIZATION_LIMIT=256;
export interface ArmyBaseline {cityId:string;stateId:string;epoch:number;entry:'activation'|'future';turn:number;tick:number;cycle:number;income:number;upkeep:number;military:number;}
export interface ArmyEconomyCut {revision:number;cycle:number;treasury:number;income:number;upkeep:number;military:number;last:CityCycle;operatingReserve:number;}
export interface ArmyPurchase {id:string;stateId:string;sourceCityId:string;cityId:string;sourceEpoch:number;targetEpoch:number;turn:number;cost:40;economy:ArmyEconomyCut;}
export interface Mobilization {version:1;activated:{tick:number;turn:number}|null;baselines:ArmyBaseline[];purchases:ArmyPurchase[];raids:Raid[];resolved:{raidId:string;turn:number}[];}
// Resolve at call time: commerce and the city simulation depend on each other.
// Capturing the imported binding during module initialization makes the result
// depend on which public entry point is loaded first.
export function cityEpoch(c:City):number {return ownershipEpoch(c);}
export function activateArmyEconomy(s:GameState,e:CityEconomy):void {if(s.mobilization&&e.version<5){e.version=5;e.ledger.military=0;}}
/** New rules start now, independently in each branch; historic snapshots are never upgraded. */
export function enableMobilization(s:GameState,origin:'birth'|'legacy-activation'='legacy-activation'):void {
  enableCityDefense(s,origin);
  const migrate=(v:GameState)=>{if(v.mobilization)return false;v.mobilization={version:1,activated:null,baselines:[],purchases:[],raids:[],resolved:[]};for(const c of v.cities!.entries)if(c.economy)activateArmyEconomy(v,c.economy);return true;};
  migrate(s);if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}
export const armyBaseline=(s:GameState,c:City)=>s.mobilization?.baselines.find(b=>b.cityId===c.id&&b.stateId===c.owner.id&&b.epoch===cityEpoch(c));
export function armyBudget(s:GameState,c:City):number {
  const b=armyBaseline(s,c),e=c.economy;if(!b||!e)return 0;
  return Math.max(0,e.ledger.income-b.income-(e.ledger.upkeep-b.upkeep)-((e.ledger.military??0)-b.military));
}
export const autonomousCity=(s:GameState,c:City)=>!!s.mobilization&&s.stage===4&&c.owner.kind==='state';
/** Enroll before the first production, including a takeover inside this frame. */
export function enrollArmyCity(s:GameState,c:City,activating=false):void {
  const e=c.economy;if(!s.mobilization?.activated||!e||!autonomousCity(s,c)||armyBaseline(s,c))return;
  s.mobilization.baselines.push({cityId:c.id,stateId:c.owner.id,epoch:cityEpoch(c),entry:activating?'activation':'future',turn:s.states!.clock.turn,tick:s.tick,cycle:e.cycle,income:e.ledger.income,upkeep:e.ledger.upkeep,military:e.ledger.military!});
}
const advancedCities=new WeakMap<GameState,Set<string>>();
export const rivalAdvanced=(s:GameState,c:City)=>advancedCities.get(s)?.has(c.id)??false;
export function stepRivalEconomies(s:GameState,dt:number):void {
  const advanced=new Set<string>();advancedCities.set(s,advanced);
  if(!s.mobilization||s.stage!==4||s.deathReason||s.player.health<=0||navigation(s)?.mode!=='local'||!Number.isFinite(dt)||dt<=0)return;
  const activating=s.mobilization.activated===null;
  s.mobilization.activated??={tick:s.tick,turn:s.states!.clock.turn};
  for(const r of raids(s))if(['returned','withdrawn','destroyed'].includes(r.phase)&&!s.mobilization.resolved.some(v=>v.raidId===r.id))s.mobilization.resolved.push({raidId:r.id,turn:s.states!.clock.turn});
  for(const c of s.cities!.entries){
    if(!autonomousCity(s,c)||!c.economy)continue;
    const e=c.economy;activateArmyEconomy(s,e);
    enrollArmyCity(s,c,activating);
    advanceCityEconomy(c,dt);advanced.add(c.id);
  }
}
export function armyOpportunity(s:GameState,r:RivalState):{source:City|null;target:City|null;reason:string} {
  const no=(reason:string)=>({source:null,target:null,reason}),m=s.mobilization;
  if(!m?.activated||s.stage!==4)return no('Obnova armády není aktivní.');
  if(m.purchases.length>=MOBILIZATION_LIMIT)return no('Dosažen limit 256 nových vojenských dokladů.');
  if(raids(s).some(v=>v.stateId===r.id&&!['returned','withdrawn','destroyed'].includes(v.phase)))return no('Nejprve se musí vyřešit zaplacená výprava státu.');
  if(raids(s).some(v=>v.stateId===r.id&&!m.resolved.some(e=>e.raidId===v.id)))return no('Nejprve zaznamenat dokončení předchozí výpravy.');
  const ended=m.resolved.filter(v=>raids(s).some(a=>a.id===v.raidId&&a.stateId===r.id));
  const rest=ended.length?Math.max(...ended.map(v=>v.turn))+6-s.states!.clock.turn:0;
  if(rest>0)return no(`Obnova po návratu či ztrátě jednotky: ještě ${rest} strategických tahů klidu.`);
  const targets=s.cities!.entries.filter(c=>c.owner.kind==='lineage'&&c.foundingOwner?.id===r.id&&!c.transfers?.at(-1)?.method&&c.transfers!.length<TRANSFER_LIMIT&&(!c.economy||c.economy.revision<1e9));
  if(!targets.length)return no('Žádné vojensky ztracené vlastní město. Mírové převody obnova nenapadá.');
  const sources=stateCities(s,r).filter(c=>c.economy&&c.economy.revision<1e9&&functioningCity(c)&&armyBudget(s,c)>=DEFENSE_COST&&c.economy.treasury>=DEFENSE_COST+2*cityEconomyPreview(c).requestedUpkeep);
  for(const source of sources)for(const target of targets){
    if(raids(s).some(v=>v.cityId===target.id&&!['returned','withdrawn','destroyed'].includes(v.phase)))continue;
    if(!entryClear(s,source,true,defenseDesign())||!entryClear(s,target,true,defenseDesign()))continue;
    if(landRoute(s,target,navigation(s)!.fields.find(f=>f.id===source.address.locationId)!.cellId))return {source,target,reason:`Nový protiútok na ${target.name}: 40 z pokladny ${source.name}, krytých novým čistým ziskem. Dva cykly údržby zůstanou.`};
  }
  return no('Obnova čeká na 40 nového čistého zisku, provozní rezervu a průchodnou trasu.');
}
/** Called once after a real strategic turn. The synchronous quote is also the payment guard. */
export function purchaseArmies(s:GameState):void {
  const m=s.mobilization;if(!m||s.stage!==4||s.deathReason||s.player.health<=0||navigation(s)?.mode!=='local')return;
  for(const r of s.states!.entries){
    if(m.purchases.some(p=>p.stateId===r.id&&p.turn===s.states!.clock.turn))continue;
    const q=armyOpportunity(s,r);if(!q.source||!q.target)continue;
    const e=q.source.economy!,id=`${r.id}:army-${m.purchases.length+1}`;
    const raid=createRaid(s,r.id,q.source,q.target,id);
    m.purchases.push({id,stateId:r.id,sourceCityId:q.source.id,cityId:q.target.id,sourceEpoch:cityEpoch(q.source),targetEpoch:cityEpoch(q.target),turn:s.states!.clock.turn,cost:40,economy:{revision:e.revision,cycle:e.cycle,treasury:e.treasury,income:e.ledger.income,upkeep:e.ledger.upkeep,military:e.ledger.military!,last:structuredClone(e.last!),operatingReserve:2*cityEconomyPreview(q.source).requestedUpkeep}});
    e.treasury-=DEFENSE_COST;e.ledger.military!+=DEFENSE_COST;e.revision++;m.raids.push(raid);s.military!.notice=q.reason;
  }
}
