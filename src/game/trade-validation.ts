import type { GameState } from './types';
import type { City } from './cities';
import { tradePrice, type TradeTransfer } from './trade';
import { CITY_LEDGER_LIMIT } from './city-economy';
const check=(v:unknown):void=>{if(!v)throw new Error('Poškozený save: neplatná kupní smlouva nebo civilní účet.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));};
const num=(v:unknown,max=1e9)=>check(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max);
const integer=(v:unknown,max=CITY_LEDGER_LIMIT)=>{num(v,max);check(Number.isSafeInteger(v));};
/** History/ownership/economy continuity is checked by the common F/G chain validator. */
export function validateTradeTransfer(s:GameState,c:City,t:TradeTransfer,index:number):void {
  check(s.cities!.version===7&&s.states!.version===4);
  shape(t,['method','version','id','from','to','turn','economy','price','payment','decision','defenseHealth','fortification']);
  check(t.method==='trade'&&t.version===1&&t.id===`${c.id}:trade-${index+1}`);
  check(t.from.kind==='state'&&s.states!.entries.some(r=>r.id===t.from.id)&&t.to.kind==='lineage'&&t.to.id===s.homePlanet!.id);
  shape(t.decision,['cities','reserve','tradeReserve']);integer(t.decision.cities,2);check(t.decision.cities>=1);integer(t.decision.reserve,400);integer(t.decision.tradeReserve);
  check(t.decision.cities===1?t.decision.reserve===0&&t.decision.tradeReserve===0:t.decision.reserve+t.decision.tradeReserve<=40);
  integer(t.price);check(t.price===tradePrice(t.economy,t.decision.cities===1));
  const p=t.payment;shape(p,['source','recipient','before','after','receivedBefore','receivedAfter']);
  check(p.source==='home'&&p.recipient===t.from.id);num(p.before);num(p.after);integer(p.receivedBefore);integer(p.receivedAfter);
  check(p.before>=t.price&&p.after===p.before-t.price&&p.receivedAfter===p.receivedBefore+t.price&&p.receivedBefore===t.decision.tradeReserve);
  if(t.defenseHealth===null)check(c.defense===null);else{num(t.defenseHealth,62);check(c.defense?.health===t.defenseHealth);}
  num(t.fortification,80);check(c.fortification!<=t.fortification);
}
