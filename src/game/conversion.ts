import type { GameState, Vec3 } from './types';
import { cityAt, cityGuard, cityProgression, type City } from './cities';
import { cityCommandRevision, raids, TRANSFER_LIMIT } from './defense';
import { activeMachines } from './machines';
import { activeField, navigation } from './planet-travel';
import { landRoute } from './military';
import { stateCities } from './states';
import { enableTrade } from './trade';
import type { CityEconomy } from './city-economy';

export const CONVERSION_COST = 20;
export const CONVERSION_LIMIT = 64;
export type Rite = 'sharing' | 'peace' | 'memory';
export interface ConversionSituation {
  cities:number; reserve:number; tradeReserve:number; residents:number; food:number;
  guard:number; fortification:number;
}
export interface ConversionEvent {
  id:number; epoch:number; ownerId:string; turn:number; action:'rite'|'renounce'|'complete';
  response:Rite|null; situation:ConversionSituation; position:Vec3;
  before:number; after:number;
  payment:{source:'home';use:'consumed';amount:number;before:number;after:number};
}
export interface Conversion {version:1;events:ConversionEvent[];}
export interface ConversionTransfer {
  method:'conversion';version:1;id:string;from:City['owner'];to:City['owner'];turn:number;
  economy:CityEconomy|null;eventId:number;spent:number;defenseHealth:number|null;fortification:number;
}
export interface ConversionToken {
  cityId:string;ownerId:string;epoch:number;events:number;revision:number;situation:ConversionSituation;
}
export const conversionRequired=(v:ConversionSituation)=>3+(v.cities===1?1:0)+(v.reserve+v.tradeReserve>40?1:0);
export const conversionResponse=(v:ConversionSituation,progress:number):Rite=>progress%3===0?(v.food<v.residents?'sharing':'memory'):progress%3===1?(v.guard>0?'peace':'sharing'):(v.cities===1?'memory':'peace');
export const conversionProgress=(c:City)=>c.owner.kind==='state'?(c.conversion?.events.filter(e=>e.epoch===(c.transfers?.length??0)).at(-1)?.after??0):0;
export const conversionSpent=(c:City,epoch:number)=>c.conversion?.events.filter(e=>e.epoch===epoch).reduce((n,e)=>n+e.payment.amount,0)??0;
export function enableConversion(s:GameState,origin:'birth'|'legacy-activation'='legacy-activation'):void {
  enableTrade(s,origin);
  const migrate=(v:GameState)=>{
    if(v.cities!.version===8)return false;
    v.cities!.version=8;for(const c of v.cities!.entries)c.conversion={version:1,events:[]};return true;
  };
  migrate(s);if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}
export function conversionSite(s:GameState,c:City,progress=conversionProgress(c),complete=false):Vec3 {
  return complete?c.address.position:navigation(s)!.fields.find(f=>f.id===c.address.locationId)!.world.patches[progress%3].center;
}
export function conversionQuote(s:GameState,c:City|null=cityAt(s),cost=CONVERSION_COST):{token:ConversionToken|null;available:boolean;reason:string;progress:number;required:number} {
  const progress=c?conversionProgress(c):0;
  const deny=(reason:string,token:ConversionToken|null=null)=>({available:false,reason,token,progress,required:token?conversionRequired(token.situation):3});
  if(s.cities?.version!==8||!c||!s.cities.entries.includes(c))return deny('Konverzní pravidla nebo město nejsou dostupné.');
  if(c.owner.kind!=='state')return deny('Město patří tvé linii. Náboženské převzetí už není dostupné.');
  const r=s.states?.entries.find(r=>r.id===c.owner.id),m=activeMachines(s);
  if(!r||!m)return deny('Chybí vlastník nebo domácí účet.');
  const situation:ConversionSituation={cities:stateCities(s,r).length,reserve:r.reserve,tradeReserve:r.tradeReserve!,residents:c.economy?.residents.length??0,food:c.economy?.food??0,guard:cityGuard(c)?.health??0,fortification:c.fortification!};
  const token:ConversionToken={cityId:c.id,ownerId:r.id,epoch:c.transfers!.length,events:c.conversion!.events.length,revision:cityCommandRevision(c),situation};
  if(s.stage!==4||!cityProgression(s)||s.deathReason||s.player.health<=0)return deny('Obřady vyžadují živou linii v dosažené strojové etapě.',token);
  if(navigation(s)?.mode!=='local'||activeField(s)?.id!==c.address.locationId)return deny('Přerušeno mimo místní návštěvu cíle. Pečeti zůstávají do změny vlastníka.',token);
  if(!m.springs.some(p=>p.owner==='player')||!landRoute(s,c))return deny('Potřebuješ vlastní původní pramen a pevninskou cestu od domova.',token);
  if(situation.residents===0)return deny('Bez civilních obyvatel nelze svolat konverzní shromáždění.',token);
  if(s.military?.deployment||raids(s).some(v=>v.stateId===r.id&&!['destroyed','returned','withdrawn'].includes(v.phase)))return deny('Přerušeno vojenským závazkem: dokonči přípravu, cestu, boj, okupaci i ústup. Pečeti se zachovají, pokud se nezmění vlastník.',token);
  // Reserve a final receipt slot, even after a failed rite or voluntary reset.
  if(c.conversion!.events.length>=CONVERSION_LIMIT-1&&progress<conversionRequired(situation)||c.conversion!.events.length>=CONVERSION_LIMIT||c.transfers!.length>=TRANSFER_LIMIT||c.economy&&c.economy.revision>=1e9)return deny('Dosažen limit dokladů nebo hospodářských revizí. Další obřad není možný.',token);
  if(!Number.isFinite(m.resource)||m.resource<cost)return deny(`Doma chybí ${Math.ceil(cost-m.resource)} jantaru na obřad za 20. Městské pokladny ani státní rezervy ho neplatí.`,token);
  return {available:true,reason:'Shromáždění je dostupné. Dojdi k uvedenému místu a zvol obřad podle námitky.',token,progress,required:conversionRequired(situation)};
}
export const conversionTokenMatches=(a:ConversionToken,b:ConversionToken)=>a.cityId===b.cityId&&a.ownerId===b.ownerId&&a.epoch===b.epoch&&a.events===b.events&&a.revision===b.revision&&(['cities','reserve','tradeReserve','residents','food','guard','fortification'] as const).every(k=>a.situation[k]===b.situation[k]);
/** Every check precedes the single synchronous debit + event + optional ownership change. */
export function performConversion(s:GameState,token:ConversionToken,action:ConversionEvent['action'],response:Rite|null=null):boolean {
  const nav=navigation(s),c=s.cities?.entries.find(c=>c.id===token.cityId),q=conversionQuote(s,c??null,action==='renounce'?0:CONVERSION_COST);
  const fail=(reason:string)=>{if(nav)nav.notice=reason;return false;};
  if(!q.token||!conversionTokenMatches(token,q.token))return fail('Zastaralý konverzní příkaz: změnil se vlastník, postup nebo situace. Zkontroluj novou námitku.');
  if(!q.available)return fail(q.reason);
  if(!['rite','renounce','complete'].includes(action))return false;
  if(action==='rite'?!['sharing','peace','memory'].includes(response??''):response!==null)return false;
  if(action==='complete'&&s.cities!.entries.some(c=>c.transfers!.some(t=>t.method&&t.from.id===token.ownerId&&t.turn===s.states!.clock.turn)))return fail('V tomto strategickém tahu už stát uzavřel převod. Vyčkej dalšího aktivního tahu.');
  if(action==='complete'&&q.progress<q.required)return fail(`Odpůrci odmítají převzetí: potřebuješ ${q.required} pečetí, máš ${q.progress}.`);
  if(action==='rite'&&q.progress>=q.required)return fail('Pečeti jsou připravené. Dokonči obřad na náměstí.');
  if(action==='renounce'&&q.progress===0)return fail('Nemáš žádné pečeti ke vzdání se.');
  const pos=activeField(s)!.position,site=conversionSite(s,c!,q.progress,action==='complete');
  if(action!=='renounce'&&Math.hypot(pos.x-site.x,pos.z-site.z)>(action==='complete'?6:3))return fail(action==='complete'?'Dojdi na náměstí do 6 jednotek.':'Dojdi k označenému stanovišti do 3 jednotek; vzdálený obřad neplatí.');
  const m=activeMachines(s)!,cost=action==='renounce'?0:CONVERSION_COST,accepted=response===conversionResponse(q.token.situation,q.progress);
  const event:ConversionEvent={id:c!.conversion!.events.length+1,epoch:c!.transfers!.length,ownerId:c!.owner.id,turn:s.states!.clock.turn,action,response,situation:{...q.token.situation},position:{...pos},before:q.progress,
    after:action==='renounce'?0:action==='complete'?q.progress:accepted?q.progress+1:Math.max(0,q.progress-1),payment:{source:'home',use:'consumed',amount:cost,before:m.resource,after:m.resource-cost}};
  const receipt:ConversionTransfer|null=action==='complete'?{method:'conversion',version:1,id:`${c!.id}:conversion-${c!.transfers!.length+1}`,from:{...c!.owner},to:{kind:'lineage',id:s.homePlanet!.id},turn:event.turn,economy:c!.economy?structuredClone(c!.economy):null,eventId:event.id,spent:conversionSpent(c!,event.epoch)+cost,defenseHealth:c!.defense?.health??null,fortification:c!.fortification!}:null;
  m.resource=event.payment.after;c!.conversion!.events.push(event);
  if(receipt){c!.transfers!.push(receipt);c!.owner={...receipt.to};if(c!.economy)c!.economy.revision++;}
  nav!.notice=receipt?`Konverze města ${c!.name} dokončena. Spotřeba ${receipt.spent} jantaru z domova; žádný příjem státu. ${event.situation.cities===1?'Poslední město: poražený stát své rezervy zmrazí.':'Civilní přijetí samo nezahajuje vojenský výpad.'}`:action==='renounce'?'Pečetí ses vzdal. Dřívější spotřeba zůstává v dokladech, žádná vratka.':accepted?`Obřad přijat: pečeti ${event.after}/${q.required}. Spotřebováno 20 jantaru z domova.`:`Odpůrci obřad odmítli. Pečeti ${event.before} → ${event.after}; 20 jantaru spotřebováno bez vratky.`;
  return true;
}
