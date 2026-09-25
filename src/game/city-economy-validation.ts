import { validateBuildingAppearance } from './building-design';
import type { GameState } from './types';
import type { City } from './cities';
import { CITY_BUILDINGS, CITY_BUILDING_LIMIT, CITY_POPULATION_LIMIT, CITY_FOOD_CAPACITY, CITY_LEDGER_LIMIT, CITY_CYCLE_LIMIT, cityCapacity, isBuildingKind, type CityEconomy } from './city-economy';
import { buildingSite, cityLot } from './city-spatial';

const bad=():never=>{throw new Error('Poškozený save: neplatné hospodářství města.');};
const check=(condition:unknown)=>{if(!condition)bad();};
function shape(v:unknown,keys:string[]):Record<string,unknown> {
  if(!v||typeof v!=='object'||Array.isArray(v))bad();
  const row=v as Record<string,unknown>;check(Object.keys(row).length===keys.length&&keys.every(k=>Object.hasOwn(row,k)));return row;
}
const integer=(v:unknown,max=CITY_LEDGER_LIMIT,min=0)=>check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max);

/** Validate structure before touching geometry or derived economy calculations. */
export function validateCityEconomy(s:GameState,c:City):void {
  const raw=c.economy;if(raw===null)return;
  const row=shape(raw,['version','opened','revision','nextId','elapsed','cycle','treasury','food','buildings','residents','ledger','last']);
  const stateOrigin=s.cities!.version===5?(c.capture?.economy?c.foundingOwner!.kind==='state':c.capture?false:c.foundingOwner!.kind==='state'):c.owner.kind==='state';
  check(row.version===(stateOrigin?3:s.cities!.version>=3?2:1));
  const opened=shape(row.opened,['source','tick','transferredAmber',...(stateOrigin?['transactionId']:[])]);
  check(opened.source===(stateOrigin?'state':'player')&&opened.transferredAmber===80);integer(opened.tick,s.tick,c.founded.tick);
  integer(row.revision,1e9,1);integer(row.nextId,1e9,1);integer(row.cycle,CITY_CYCLE_LIMIT);
  check(typeof row.elapsed==='number'&&Number.isFinite(row.elapsed)&&row.elapsed>=0&&row.elapsed<10);
  integer(row.treasury);integer(row.food,CITY_FOOD_CAPACITY);
  check(Array.isArray(row.buildings)&&row.buildings.length<=CITY_BUILDING_LIMIT);
  check(Array.isArray(row.residents)&&row.residents.length<=CITY_POPULATION_LIMIT);
  const e=raw as CityEconomy,ids:number[]=[];
  for(const b of e.buildings) {
    shape(b,['id','kind','lot','enabled','paidAmber',...(e.version>=2?['appearance']:[])]);integer(b.id,e.nextId-1,1);integer(b.lot,120);
    check(isBuildingKind(b.kind)&&!!cityLot(c,b.lot));
    if(e.version>=2)validateBuildingAppearance(b.appearance,b.kind);
    check(typeof b.enabled==='boolean'&&(b.kind!=='house'||b.enabled));check(b.paidAmber===CITY_BUILDINGS[b.kind].cost);ids.push(b.id);
  }
  for(const r of e.residents) {
    shape(r,['id','source','cycle','paidAmber']);integer(r.id,e.nextId-1,1);integer(r.cycle,e.cycle);
    check(r.source==='invited'&&r.paidAmber===4);ids.push(r.id);
  }
  check(new Set(ids).size===ids.length&&e.residents.length%2===0&&e.residents.length<=cityCapacity(e));
  const ledger=shape(e.ledger,['transfers','construction','immigration','supplies','income','upkeep','produced','consumed','discarded']);
  Object.values(ledger).forEach(v=>integer(v));const l=e.ledger;
  check(l.transfers>=80&&(l.transfers-80)%20===0&&l.immigration===e.residents.length*4&&l.supplies%10===0&&l.construction%2===0);
  check(l.construction>=e.buildings.reduce((n,b)=>n+b.paidAmber,0));
  check(e.treasury===l.transfers+l.income-l.construction-l.immigration-l.supplies-l.upkeep);
  check(e.food===e.residents.length*2+l.supplies*2+l.produced-l.consumed-l.discarded);
  check(l.produced<=e.cycle*CITY_BUILDING_LIMIT*6&&l.income<=e.cycle*CITY_BUILDING_LIMIT*8&&l.upkeep<=e.cycle*CITY_BUILDING_LIMIT*2&&l.consumed<=e.cycle*CITY_POPULATION_LIMIT);
  // Every surviving ID was allocated by a paid construction or an arrival.
  check(e.nextId>=ids.length+1&&e.nextId<=1+l.construction/16+e.residents.length);
  check(e.revision>=1+e.buildings.length+e.residents.length/2+(l.transfers-80)/20+l.supplies/10);
  if(e.cycle===0)check(e.last===null&&l.produced===0&&l.income===0&&l.upkeep===0&&l.consumed===0&&l.discarded===0);
  else {
    const last=shape(e.last,['cycle','income','upkeep','produced','consumed','discarded','happiness','workers','hungry','funded']);
    check(last.cycle===e.cycle&&typeof last.funded==='boolean');
    for(const key of ['income','upkeep','produced','consumed','discarded'] as const){integer(last[key],key==='discarded'?CITY_FOOD_CAPACITY+96:128);check(Number(last[key])<=l[key]);}
    integer(last.happiness,100);integer(last.workers,e.residents.length);integer(last.hungry,e.residents.length);
    check(Number(last.consumed)+Number(last.hungry)<=e.residents.length);
    if(!last.funded)check(last.income===0&&last.upkeep===0&&last.produced===0&&last.workers===0);
  }
  for(const b of e.buildings)check(buildingSite(s,c,b.lot,b.kind,b.id,false)===null);
}

/** Earlier checkpoints may have fewer buildings or an unopened economy, never a later ledger. */
export function cityEconomyCheckpointMatches(live:City,cp:City):boolean {
  const a=live.economy,b=cp.economy;
  if(!b)return true;
  if(!a||JSON.stringify([a.opened.source,a.opened.tick,a.opened.transferredAmber,'transactionId' in a.opened?a.opened.transactionId:null])!==JSON.stringify([b.opened.source,b.opened.tick,b.opened.transferredAmber,'transactionId' in b.opened?b.opened.transactionId:null])||a.cycle<b.cycle||a.revision<b.revision||a.nextId<b.nextId)return false;
  if(a.cycle===b.cycle&&a.elapsed+1e-7<b.elapsed)return false;
  if(Object.keys(b.ledger).some(k=>a.ledger[k as keyof typeof a.ledger]<b.ledger[k as keyof typeof b.ledger]))return false;
  if(b.residents.some(r=>!a.residents.some(v=>v.id===r.id&&v.cycle===r.cycle)))return false;
  // A surviving building cannot change its kind, price or location; demolition is allowed.
  return b.buildings.every(r=>{const v=a.buildings.find(v=>v.id===r.id);return !v||v.kind===r.kind&&v.lot===r.lot&&v.paidAmber===r.paidAmber&&(a.revision!==b.revision||JSON.stringify(v.appearance)===JSON.stringify(r.appearance));});
}
