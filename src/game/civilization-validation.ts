import { atSea } from './maritime';
import { unresolvedRaid } from './defense';
import type { GameState } from './types';
import { functioningCity } from './civilization';
import { validateCityEconomy, cityEconomyCheckpointMatches } from './city-economy-validation';
import { STATE_PROFILES } from './states';
import { FIELD_STORAGE_LIMIT } from './planet-travel';
const check=(v:unknown):void=>{if(!v)throw new Error('Poškozený save: neplatné dokončení nebo dědictví civilizace.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));};
const int=(v:unknown,max=1e9,min=0)=>check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max);
const canonical=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
export function validateCivilization(s:GameState):void {
  if(!Object.hasOwn(s,'civilization'))return;
  const v=s.civilization;shape(v,['version','entry','completed']);check(v!.version===1&&s.commerce&&s.cities?.version===8&&s.states?.version===4);
  check(v!.entry==='required'||v!.entry==='legacy-stage5');
  if(v!.entry==='legacy-stage5'){check(s.stage>=5&&v!.completed===null);return;}
  if(s.stage<5){check(v!.completed===null);return;}
  check(!s.military?.deployment&&!unresolvedRaid(s)&&!atSea(s)&&!s.commerce!.contracts.some(c=>c.status==='open'));
  const result=v!.completed;shape(result,['at','cities','governingCity']);shape(result!.at,['tick','turn','generation']);
  int(result!.at.tick,s.tick);int(result!.at.turn,s.states!.clock.turn);int(result!.at.generation,s.player.generation,1);
  check(s.machines?.version===2&&s.machines.completed&&s.states!.activated&&s.states!.entries.length===STATE_PROFILES.length);
  check(Array.isArray(result!.cities)&&result!.cities.length>0&&result!.cities.length<=FIELD_STORAGE_LIMIT);
  const seen=new Set<string>();
  for(const [i,cut] of result!.cities.entries()){
    shape(cut,['cityId','capture','transfers']);check(typeof cut.cityId==='string'&&typeof cut.capture==='boolean'&&!seen.has(cut.cityId));seen.add(cut.cityId);
    if(i)check(result!.cities[i-1].cityId.localeCompare(cut.cityId)<0);
    const c=s.cities!.entries.find(c=>c.id===cut.cityId);check(c&&c.founded.stage===4&&c.founded.tick<=result!.at.tick&&cut.capture===!!c.capture);
    int(cut.transfers,c!.transfers!.length);
    let owner=c!.foundingOwner!;if(cut.capture)owner={kind:'lineage',id:s.homePlanet!.id};
    for(const transfer of c!.transfers!.slice(0,cut.transfers)){check(transfer.turn<=result!.at.turn);owner=transfer.to;}
    check(owner.kind==='lineage'&&owner.id===s.homePlanet!.id);
    // Stage-four city history is sealed on entry. Later city activities can only extend it.
    for(const transfer of c!.transfers!.slice(cut.transfers))check(transfer.turn>=result!.at.turn);
  }
  check(s.cities!.entries.filter(c=>c.founded.stage===4).every(c=>seen.has(c.id)));
  for(const r of s.states!.entries)check(s.cities!.entries.some(c=>{const f=c.founded;return f.source==='state'&&seen.has(c.id)&&r.transactions.some(t=>t.id===f.transactionId&&t.action.kind==='found'&&t.turn<=result!.at.turn);}));
  shape(result!.governingCity,['cityId','economy']);const governed=s.cities!.entries.find(c=>c.id===result!.governingCity.cityId);check(governed&&seen.has(governed.id));
  const snapshot={...governed!,owner:{kind:'lineage' as const,id:s.homePlanet!.id},economy:result!.governingCity.economy};
  validateCityEconomy(s,snapshot);check(functioningCity(snapshot)&&cityEconomyCheckpointMatches(governed!,snapshot));
  check(snapshot.economy.opened.tick<=result!.at.tick);
  if(snapshot.economy.cycle===governed!.economy!.cycle){
    check(same(snapshot.economy.last,governed!.economy!.last));
    for(const key of ['income','upkeep','produced','consumed','discarded'] as const)check(snapshot.economy.ledger[key]===governed!.economy!.ledger[key]);
    if(snapshot.economy.revision===governed!.economy!.revision)check(same({...snapshot.economy,version:5,elapsed:0,ledger:{...snapshot.economy.ledger,repairs:snapshot.economy.ledger.repairs??0,military:snapshot.economy.ledger.military??0}},{...governed!.economy,version:5,elapsed:0,ledger:{...governed!.economy!.ledger,repairs:governed!.economy!.ledger.repairs??0,military:governed!.economy!.ledger.military??0}}));
  }
}
export function civilizationCheckpointMatches(s:GameState,cp:GameState):boolean {
  const a=s.civilization,b=cp.civilization;if(!a||!b)return !a&&!b;
  if(a.version!==b.version||a.entry!==b.entry)return false;
  return b.completed===null?cp.stage<5||a.completed===null:same(a.completed,b.completed);
}
