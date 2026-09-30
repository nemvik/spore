import type { GameState } from './types';
import type { City } from './cities';
import type { CityEconomy } from './city-economy';
import { cityEconomyPreview } from './city-economy';
import { activeMachines, machinesReady } from './machines';
import { enableCommerce } from './commerce';
import { atSea } from './maritime';
import { activeField, navigation } from './planet-travel';
import { unresolvedRaid } from './defense';
import { STATE_PROFILES } from './states';
export type CivicMethod='military'|'trade'|'conversion';
export interface CivicCut {cityId:string;capture:boolean;transfers:number;}
export interface Civilization {
  version:1;entry:'required'|'legacy-stage5';
  completed:null|{at:{tick:number;turn:number;generation:number};cities:CivicCut[];governingCity:{cityId:string;economy:CityEconomy};};
}
export interface CivicFact {key:string;cityId:string;kind:'founding'|'acquisition'|'loss';method:CivicMethod|null;tick:number|null;turn:number|null;}
export function enableCivilization(s:GameState,origin:'birth'|'legacy-activation'='legacy-activation'):void {
  enableCommerce(s,origin);
  const migrate=(v:GameState)=>{if(v.civilization)return false;v.civilization={version:1,entry:v.stage>=5?'legacy-stage5':'required',completed:null};return true;};
  migrate(s);if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}
export const civicCut=(s:GameState):CivicCut[]=>(s.cities?.entries??[]).map(c=>({cityId:c.id,capture:!!c.capture,transfers:c.transfers?.length??0})).sort((a,b)=>a.cityId.localeCompare(b.cityId));
/** Facts reference the original city ledger; an unknown E timestamp stays unknown. */
export function civilizationFacts(s:GameState):CivicFact[] {
  const cuts=s.civilization?.completed?.cities??civicCut(s),facts:CivicFact[]=[];
  for(const cut of cuts){const c=s.cities?.entries.find(c=>c.id===cut.cityId);if(!c)continue;
    if(c.founded.source==='player')facts.push({key:`${c.id}:founding`,cityId:c.id,kind:'founding',method:null,tick:c.founded.tick,turn:null});
    if(cut.capture&&c.capture)facts.push({key:`${c.id}:capture`,cityId:c.id,kind:'acquisition',method:'military',tick:null,turn:null});
    for(const [i,t] of (c.transfers??[]).slice(0,cut.transfers).entries())facts.push({key:`${c.id}:transfer:${i}`,cityId:c.id,kind:t.to.kind==='lineage'?'acquisition':'loss',method:t.to.kind==='lineage'?t.method??'military':null,tick:null,turn:t.turn});
  }
  return facts;
}
export function functioningCity(c:City):boolean {
  const e=c.economy;if(!e||!e.residents.length||!e.last?.funded||e.last.income<=0||e.last.produced<=0||e.last.hungry!==0)return false;
  if(!(['house','garden','workshop'] as const).every(kind=>e.buildings.some(b=>b.kind===kind&&b.enabled)))return false;
  const next=cityEconomyPreview(c);return next.funded&&next.hungry===0&&next.income>0&&next.produced>0&&next.net>=0;
}
export function civilizationReadiness(s:GameState):{ready:boolean;reasons:string[];governingCity:City|null} {
  const reasons:string[]=[],m=activeMachines(s);
  if(s.stage!==4||!s.civilization||s.deathReason||s.player.health<=0)reasons.push('Sjednocení dokončí živá linie v civilizační etapě.');
  if(!m?.completed||!machinesReady(s))reasons.push('Dokonči tři domácí regiony, drž alespoň dva prameny a živé vozidlo.');
  if(!s.states?.activated||s.states.entries.length!==STATE_PROFILES.length||s.states.entries.some(r=>!s.cities?.entries.some(c=>{const founded=c.founded;return founded.source==='state'&&r.transactions.some(t=>t.id===founded.transactionId&&t.action.kind==='found');})))reasons.push('Každý soupeřící stát musí skutečně založit své první město.');
  const foreign=s.cities?.entries.filter(c=>c.owner.kind==='state')??[];
  if(foreign.length)reasons.push(`Sjednoť zbývající soupeřova města: ${foreign.length}. Cestu volíš pro každé město.`);
  const governingCity=s.cities?.entries.find(c=>c.owner.kind==='lineage'&&functioningCity(c))??null;
  if(!governingCity)reasons.push('Rozviň vlastní město: obydlí, pěstírna, dílna a občané; odehraj financovaný cyklus s potravou a příjmem bez provozní ztráty.');
  if(s.military?.deployment||unresolvedRaid(s)||atSea(s)||s.commerce?.contracts.some(c=>c.status==='open'))reasons.push('Vrať všechny jednotky a plavby, vyřeš výpady a dokonči nebo zruš otevřené obchodní kontrakty.');
  if(activeField(s)||navigation(s)?.mode==='global')reasons.push('Pro další etapu se vrať do domácí dílny.');
  return {ready:reasons.length===0,reasons,governingCity};
}
export function completeCivilization(s:GameState):boolean {
  const q=civilizationReadiness(s);if(!q.ready||!s.civilization||s.civilization.completed)return false;
  s.civilization.completed={at:{tick:s.tick,turn:s.states!.clock.turn,generation:s.player.generation},cities:civicCut(s),governingCity:{cityId:q.governingCity!.id,economy:structuredClone(q.governingCity!.economy!)}};return true;
}
export function civilizationInheritance(s:GameState):{methods:CivicMethod[];power:number;consumption:number;recovery:number} {
  const methods:CivicMethod[]=s.civilization?.completed?[...new Set(civilizationFacts(s).flatMap(f=>f.kind==='acquisition'&&f.method?[f.method]:[]))].sort():[];
  const share=methods.length&&s.stage>=5?.2/methods.length:0;
  return {methods,power:1+(methods.includes('military')?share:0),consumption:1-(methods.includes('trade')?share:0),recovery:1+(methods.includes('conversion')?share:0)};
}
