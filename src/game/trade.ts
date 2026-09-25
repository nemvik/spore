import type { GameState } from './types';
import { cityAt, cityProgression, type City } from './cities';
import { cityCommandRevision, enableDefense, raids, TRANSFER_LIMIT } from './defense';
import { activeMachines } from './machines';
import { activeField, navigation } from './planet-travel';
import { landRoute } from './military';
import { stateCities } from './states';
import type { CityEconomy } from './city-economy';
import { CITY_LEDGER_LIMIT } from './city-economy';

export interface TradeTransfer {
  method:'trade'; version:1; id:string; from:City['owner']; to:City['owner']; turn:number;
  economy:CityEconomy|null;
  price:number;
  payment:{source:'home';recipient:string;before:number;after:number;receivedBefore:number;receivedAfter:number};
  decision:{cities:number;reserve:number;tradeReserve:number};
  defenseHealth:number|null; fortification:number;
}
export interface TradeOffer {cityId:string;sellerId:string;revision:number;cycle:number;price:number;reserve:number;tradeReserve:number;cities:number;}
export interface TradeQuote {offer:TradeOffer|null;available:boolean;reason:string;}
export const tradeTransfers=(c:City):TradeTransfer[]=>c.transfers?.filter((t):t is TradeTransfer=>t.method==='trade')??[];
export const tradeReceipts=(s:GameState,id:string)=>s.cities?.entries.flatMap(c=>tradeTransfers(c).filter(t=>t.from.id===id))??[];
export const tradePrice=(e:CityEconomy|null|undefined,last:boolean)=>60+(e?.buildings.reduce((n,b)=>n+b.paidAmber,0)??0)+(e?.residents.length??0)*4+(e?.treasury??0)+(last?60:0);

/** No historical commerce or money. Both complete branches migrate before rekey. */
export function enableTrade(s:GameState,origin:'birth'|'legacy-activation'='legacy-activation'):void {
  enableDefense(s,origin);
  const migrate=(v:GameState)=>{
    if(v.cities!.version===7)return false;
    v.cities!.version=7;v.states!.version=4;
    for(const r of v.states!.entries)r.tradeReserve=0;
    return true;
  };
  migrate(s);if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}
export function tradeQuote(s:GameState,c:City|null=cityAt(s)):TradeQuote {
  const deny=(reason:string,offer:TradeOffer|null=null):TradeQuote=>({offer,available:false,reason});
  if(s.cities?.version!==7||s.states?.version!==4||!c||!s.cities.entries.includes(c))return deny('Obchodní pravidla nebo město nejsou dostupné.');
  if(s.stage!==4||!cityProgression(s)||s.deathReason||s.player.health<=0)return deny('Obchod vyžaduje živou linii ve strojové etapě.');
  if(navigation(s)?.mode!=='local'||activeField(s)?.id!==c.address.locationId)return deny('Nabídku vyřiď při místní návštěvě tohoto města.');
  if(c.owner.kind!=='state')return deny('Město už patří tvé linii; nová kupní platba není dostupná.');
  const r=s.states.entries.find(r=>r.id===c.owner.id),m=activeMachines(s);
  if(!r||!m)return deny('Chybí prodávající stát nebo domácí účet.');
  const cities=stateCities(s,r).length,price=tradePrice(c.economy,cities===1);
  const offer:TradeOffer={cityId:c.id,sellerId:r.id,revision:cityCommandRevision(c),cycle:c.economy?.cycle??0,price,reserve:r.reserve,tradeReserve:r.tradeReserve!,cities};
  if(!m.springs.some(p=>p.owner==='player'))return deny('Chybí vlastní původní pramen jako zdroj domácího jantaru.',offer);
  if(!landRoute(s,c))return deny('Město nemá pevninskou cestu od domova.',offer);
  if(s.military?.deployment)return deny('Nejprve vrať nasazený tank domů, včetně dokončení ústupu a přepravy.',offer);
  if(raids(s).some(v=>v.stateId===r.id&&!['destroyed','returned','withdrawn'].includes(v.phase)))return deny('Stát odmítá jednat během přípravy výpadu, cesty, boje, okupace nebo ústupu.',offer);
  if(c.transfers!.length>=TRANSFER_LIMIT||c.economy&&c.economy.revision>=1e9||r.tradeReserve!>CITY_LEDGER_LIMIT-price)return deny('Dosažen limit historie nebo účetnictví; prodej není možný.',offer);
  if(cities===1&&(r.reserve!==0||r.tradeReserve!==0))return deny('Stát odmítá prodat poslední město, dokud má vlastní rezervy.',offer);
  if(cities>1&&r.reserve+r.tradeReserve!>40)return deny('Stát má dostatečné rezervy a odmítá prodat území.',offer);
  if(!Number.isFinite(m.resource)||m.resource<price)return deny(`Stát souhlasí, ale doma chybí ${Math.ceil(price-m.resource)} z ceny ${price} jantaru. Vrať se k vlastním pramenům. Městské pokladny nejsou zdroj nákupu.`,offer);
  return {offer,available:true,reason:cities===1?'Stát bez rezerv přijímá prodej posledního města a ukončení své územní správy.':'Stát s nízkými rezervami přijímá prodej pro financování zbývajícího města.'};
}
const offerMatches=(a:TradeOffer,b:TradeOffer)=>a.cityId===b.cityId&&a.sellerId===b.sellerId&&a.revision===b.revision&&a.cycle===b.cycle&&a.price===b.price&&a.reserve===b.reserve&&a.tradeReserve===b.tradeReserve&&a.cities===b.cities;
/** One synchronous settlement after all checks; an offer itself has no side effects. */
export function acceptTrade(s:GameState,offer:TradeOffer):boolean {
  const nav=navigation(s),c=s.cities?.entries.find(c=>c.id===offer.cityId),q=tradeQuote(s,c??null);
  const fail=(reason:string)=>{if(nav)nav.notice=reason;return false;};
  if(!q.offer||!offerMatches(offer,q.offer))return fail('Nabídka je zastaralá: změnil se vlastník, hospodářství, cena nebo situace státu. Vyžádej novou nabídku.');
  if(!q.available)return fail(q.reason);
  const r=s.states!.entries.find(r=>r.id===offer.sellerId)!,m=activeMachines(s)!,to={kind:'lineage' as const,id:s.homePlanet!.id};
  const receipt:TradeTransfer={method:'trade',version:1,id:`${c!.id}:trade-${c!.transfers!.length+1}`,from:{...c!.owner},to,turn:s.states!.clock.turn,economy:c!.economy?structuredClone(c!.economy):null,price:q.offer.price,
    payment:{source:'home',recipient:r.id,before:m.resource,after:m.resource-q.offer.price,receivedBefore:r.tradeReserve!,receivedAfter:r.tradeReserve!+q.offer.price},
    decision:{cities:q.offer.cities,reserve:r.reserve,tradeReserve:r.tradeReserve!},defenseHealth:c!.defense?.health??null,fortification:c!.fortification!};
  m.resource=receipt.payment.after;r.tradeReserve=receipt.payment.receivedAfter;
  c!.transfers!.push(receipt);c!.owner={...to};if(c!.economy)c!.economy.revision++;
  nav!.notice=`Koupeno ${c!.name} za ${receipt.price} jantaru z domova. Prodávající přijal cenu na civilní účet. ${receipt.decision.cities===1?'Poslední město: stát je poražen a jeho prostředky zůstávají zmrazené.':'Jeho vojenský rozpočet se nezvýšil.'}`;
  return true;
}
