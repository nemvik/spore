import type { GameState } from './types';
import type { City } from './cities';
import { CITY_BUILDINGS, type CityEconomy } from './city-economy';
import { originalCityOwner, raids, sameOwner } from './defense';
import { cityEpoch, MOBILIZATION_LIMIT } from './mobilization';
const check=(v:unknown)=>{if(!v)throw new Error('Poškozený save: neplatná výroba nebo financování obnovované armády.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));check(Object.keys(v as object).length===keys.length&&keys.every(k=>Object.hasOwn(v as object,k)));};
const int=(v:unknown,max=1e12,min=0)=>check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max);
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const offset=(c:City)=>c.capture?1:0;
const epochOwner=(s:GameState,c:City,epoch:number)=>c.transfers?.[epoch-offset(c)-1]?.to??originalCityOwner(s,c);
const epochEnd=(c:City,epoch:number)=>c.transfers?.[epoch-offset(c)];
function epochTime(c:City,epoch:number,turn:number):void {
  int(epoch,cityEpoch(c),offset(c));
  check(turn>=(c.transfers?.[epoch-offset(c)-1]?.turn??0));
  const end=epochEnd(c,epoch);if(end)check(turn<=end.turn);
}
export function validateMobilization(s:GameState):void {
  if(!Object.hasOwn(s,'mobilization'))return;
  const m=s.mobilization!;shape(m,['version','activated','baselines','purchases','raids','resolved']);
  check(m.version===1&&s.civilization&&s.military?.version===2&&s.states?.version===4);
  check(Array.isArray(m.baselines)&&m.baselines.length<=2112&&Array.isArray(m.purchases)&&m.purchases.length<=MOBILIZATION_LIMIT&&Array.isArray(m.raids)&&m.raids.length===m.purchases.length&&Array.isArray(m.resolved)&&m.resolved.length<=MOBILIZATION_LIMIT+2);
  if(m.activated===null){check(!m.baselines.length&&!m.purchases.length&&!m.raids.length&&!m.resolved.length);check(s.cities!.entries.every(c=>(c.economy?.ledger.military??0)===0));return;}
  shape(m.activated,['tick','turn']);int(m.activated.tick,s.tick);int(m.activated.turn,s.states!.clock.turn);
  check(new Set(m.baselines.map(b=>`${b.cityId}:${b.epoch}`)).size===m.baselines.length);
  for(const b of m.baselines){
    shape(b,['cityId','stateId','epoch','entry','turn','tick','cycle','income','upkeep','military']);
    const c=s.cities!.entries.find(c=>c.id===b.cityId);check(c&&s.states!.entries.some(r=>r.id===b.stateId));
    int(b.turn,s.states!.clock.turn,m.activated.turn);int(b.tick,s.tick,m.activated.tick);epochTime(c!,b.epoch,b.turn);
    check(sameOwner(epochOwner(s,c!,b.epoch),{kind:'state',id:b.stateId}));
    const end=epochEnd(c!,b.epoch)?.economy??c!.economy;check(end);
    int(b.cycle,end!.cycle);int(b.income,end!.ledger.income);int(b.upkeep,end!.ledger.upkeep);int(b.military,end!.ledger.military??0);check(b.military===m.purchases.filter(p=>p.sourceCityId===b.cityId&&p.sourceEpoch<b.epoch).length*40);
    const incoming=c!.transfers?.[b.epoch-offset(c!)-1]?.economy;
    check(b.entry==='activation'||b.entry==='future');
    if(b.entry==='activation')check(b.tick===m.activated.tick&&b.turn===m.activated.turn);
    if(incoming&&b.entry==='future')check(b.cycle===incoming.cycle&&b.income===incoming.ledger.income&&b.upkeep===incoming.ledger.upkeep);
    if(incoming)check(b.cycle>=incoming.cycle&&b.income>=incoming.ledger.income&&b.upkeep>=incoming.ledger.upkeep);
    if(b.cycle===end!.cycle)check(b.income===end!.ledger.income&&b.upkeep===end!.ledger.upkeep);
  }
  check(new Set(m.resolved.map(r=>r.raidId)).size===m.resolved.length);
  for(const r of m.resolved){
    shape(r,['raidId','turn']);int(r.turn,s.states!.clock.turn,m.activated.turn);
    const a=raids(s).find(v=>v.id===r.raidId);check(a&&['returned','withdrawn','destroyed'].includes(a.phase));
    const paid=m.purchases.find(p=>p.id===r.raidId)?.turn??s.states!.entries.flatMap(r=>r.transactions).find(t=>t.id===r.raidId)?.turn;check(paid!==undefined&&r.turn>=paid);
  }
  let turn=m.activated.turn;
  for(const [i,p] of m.purchases.entries()){
    shape(p,['id','stateId','sourceCityId','cityId','sourceEpoch','targetEpoch','turn','cost','economy']);
    check(p.id===`${p.stateId}:army-${i+1}`&&p.cost===40&&s.states!.entries.some(r=>r.id===p.stateId));
    int(p.turn,s.states!.clock.turn,turn);turn=p.turn;
    const prior=m.purchases.slice(0,i),source=s.cities!.entries.find(c=>c.id===p.sourceCityId),target=s.cities!.entries.find(c=>c.id===p.cityId);check(source&&target&&source!==target);
    epochTime(source!,p.sourceEpoch,p.turn);epochTime(target!,p.targetEpoch,p.turn);
    check(sameOwner(epochOwner(s,source!,p.sourceEpoch),{kind:'state',id:p.stateId})&&sameOwner(epochOwner(s,target!,p.targetEpoch),{kind:'lineage',id:s.homePlanet!.id}));
    check(target!.foundingOwner?.id===p.stateId&&!target!.transfers?.[p.targetEpoch-offset(target!)-1]?.method);
    const base=m.baselines.find(b=>b.cityId===source!.id&&b.stateId===p.stateId&&b.epoch===p.sourceEpoch);check(base&&base.turn<=p.turn);
    const e=p.economy;shape(e,['revision','cycle','treasury','income','upkeep','military','last','operatingReserve']);
    for(const k of ['revision','cycle','treasury','income','upkeep','military','operatingReserve'] as const)int(e[k]);
    const end=epochEnd(source!,p.sourceEpoch)?.economy??source!.economy;check(end&&e.cycle<=end.cycle&&e.revision<end.revision&&e.income<=end.ledger.income&&e.upkeep<=end.ledger.upkeep);
    check(e.cycle>base!.cycle&&e.income>=base!.income&&e.upkeep>=base!.upkeep&&e.military===prior.filter(v=>v.sourceCityId===p.sourceCityId).length*40);
    check(e.income-base!.income-(e.upkeep-base!.upkeep)-(e.military-base!.military)>=40&&e.treasury>=40+e.operatingReserve);
    // Civil spending is immutable during state ownership: original D receipts or
    // the incoming ownership cut. Production and army purchases have separate counters.
    const incoming=source!.transfers?.[p.sourceEpoch-offset(source!)-1]?.economy;
    const civil=incoming?.ledger??(()=>{
      const tx=s.states!.entries.find(r=>r.id===p.stateId)!.transactions.filter(t=>t.turn<=p.turn&&t.action.kind!=='found'&&t.action.cityId===source!.id);
      return {transfers:tx.filter(t=>t.action.kind==='open'||t.action.kind==='fund').reduce((n,t)=>n+t.cost,0),construction:tx.filter(t=>t.action.kind==='build').reduce((n,t)=>n+t.cost,0),immigration:tx.filter(t=>t.action.kind==='invite').reduce((n,t)=>n+t.cost,0),supplies:0,repairs:0};
    })();
    check(e.treasury===civil.transfers+e.income-civil.construction-civil.immigration-civil.supplies-e.upkeep-(civil.repairs??0)-e.military);
    const running=incoming?incoming.buildings.filter(b=>b.enabled).reduce((n,b)=>n+CITY_BUILDINGS[b.kind].upkeep,0):s.states!.entries.find(r=>r.id===p.stateId)!.transactions.filter(t=>t.turn<=p.turn&&t.action.kind==='build'&&t.action.cityId===source!.id).reduce((n,t)=>n+(t.action.kind==='build'?CITY_BUILDINGS[t.action.building].upkeep:0),0);
    check(e.operatingReserve===2*running);
    const last=e.last;shape(last,['cycle','income','upkeep','produced','consumed','discarded','happiness','workers','hungry','funded']);
    int(last.cycle,1e7);
    if(e.cycle===end!.cycle)check(same(last,end!.last)&&e.income===end!.ledger.income&&e.upkeep===end!.ledger.upkeep);
    check(last.funded===true&&last.cycle===e.cycle&&last.hungry===0&&last.income>0&&last.produced>0&&last.income>=last.upkeep);
    for(const k of ['income','upkeep','produced','consumed','discarded','happiness','workers','hungry'] as const)int(last[k],k==='happiness'?100:240);
    check(last.income<=e.income&&last.upkeep<=e.upkeep&&e.operatingReserve>=2*last.upkeep&&e.operatingReserve<=64);
    const previous=prior.filter(v=>v.sourceCityId===p.sourceCityId).at(-1);if(previous)check(e.revision>previous.economy.revision&&e.cycle>=previous.economy.cycle&&e.income>=previous.economy.income&&e.upkeep>=previous.economy.upkeep);
    const older=[...s.military!.raids!,...m.raids.slice(0,i)].filter(r=>r.stateId===p.stateId||r.cityId===p.cityId);
    for(const r of older){const end=m.resolved.find(v=>v.raidId===r.id);check(end&&p.turn>=end.turn+(r.stateId===p.stateId?6:0));}
    const r=m.raids[i];check(r.id===p.id&&r.stateId===p.stateId&&r.sourceCityId===p.sourceCityId&&r.cityId===p.cityId);
  }
  // Every current/archived economy has exactly the purchases preceding that revision.
  for(const c of s.cities!.entries){
    const history=[c.capture?.economy,...(c.transfers??[]).map(t=>t.economy),c.economy,s.civilization?.completed?.governingCity.cityId===c.id?s.civilization.completed.governingCity.economy:null].filter((v):v is CityEconomy=>!!v);
    for(const e of history)check((e.ledger.military??0)===m.purchases.filter(p=>p.sourceCityId===c.id&&p.economy.revision<e.revision).length*40);
  }
  const active=raids(s).filter(r=>!['returned','withdrawn','destroyed'].includes(r.phase));
  check(new Set(active.map(r=>r.stateId)).size===active.length&&new Set(active.map(r=>r.cityId)).size===active.length);
}
export function mobilizationCheckpointMatches(s:GameState,cp:GameState):boolean {
  const a=s.mobilization,b=cp.mobilization;if(!a||!b)return !a&&!b;
  if(!b.activated)return true;
  if(!same(a.activated,b.activated))return false;
  return b.baselines.every((v,i)=>same(v,a.baselines[i]))&&b.purchases.every((v,i)=>same(v,a.purchases[i]))&&b.resolved.every((v,i)=>same(v,a.resolved[i]));
}
