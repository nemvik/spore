import type { GameState } from './types';
import type { City } from './cities';
import { conversionRequired, conversionResponse, conversionSite, CONVERSION_COST, CONVERSION_LIMIT, type ConversionTransfer } from './conversion';
import { originalCityOwner, sameOwner } from './defense';
import { fieldGround, navigation } from './planet-travel';
import { planetAtlas } from './planet-geography';
const check=(v:unknown):void=>{if(!v)throw new Error('Poškozený save: neplatné konverzní obřady nebo doklady.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));};
const num=(v:unknown,max=1e9,min=0)=>check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max);
const integer=(v:unknown,max=1e9,min=0)=>{num(v,max,min);check(Number.isSafeInteger(v));};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function validateConversion(s:GameState):void {
  if(s.cities?.version!==8)return;
  for(const c of s.cities.entries){
    const log=c.conversion;shape(log,['version','events']);check(log!.version===1&&Array.isArray(log!.events)&&log!.events.length<=CONVERSION_LIMIT);
    let epoch=-1,progress=0,turn=0,completed=false;
    for(const [i,e] of log!.events.entries()){
      shape(e,['id','epoch','ownerId','turn','action','response','situation','position','before','after','payment']);
      check(e.id===i+1);integer(e.epoch,c.transfers!.length,Math.max(0,epoch));integer(e.turn,s.states!.clock.turn,turn);turn=e.turn;
      const owner=e.epoch?c.transfers![e.epoch-1].to:originalCityOwner(s,c),next=c.transfers![e.epoch];
      check(owner.kind==='state'&&e.ownerId===owner.id);
      if(e.epoch)check(e.turn>=c.transfers![e.epoch-1].turn);
      if(next)check(e.turn<=next.turn);
      if(e.epoch!==epoch){epoch=e.epoch;progress=0;completed=false;}
      check(!completed&&e.before===progress);integer(e.after,5);
      const v=e.situation;shape(v,['cities','reserve','tradeReserve','residents','food','guard','fortification']);integer(v.cities,2,1);integer(v.reserve,400);integer(v.tradeReserve,1e12);integer(v.residents,32,1);integer(v.food,120);num(v.guard,62);num(v.fortification,80);
      const r=s.states!.entries.find(r=>r.id===e.ownerId)!;
      const founded=r.transactions.find(t=>t.action.kind==='found'&&t.action.address.locationId===c.address.locationId);
      check(!!founded&&e.turn>=founded.turn);
      // Residents are never removed. State AI stops founding purchases after a transfer;
      // before that, every pair of arrivals has an original invite receipt.
      const residents=e.epoch?c.transfers![e.epoch-1].economy?.residents.length??0:2*r.transactions.filter(t=>t.turn<=e.turn&&t.action.kind==='invite'&&t.action.cityId===c.id).length;
      check(v.residents===residents&&v.residents%2===0&&v.residents<=(c.economy?.residents.length??0));
      check(v.reserve===400-r.transactions.filter(t=>t.account==='reserve'&&t.turn<=e.turn).reduce((n,t)=>n+t.cost,0));
      const sales=s.cities.entries.flatMap(c=>c.transfers!.filter(t=>t.method==='trade'&&t.from.id===r.id));
      const civilSpent=r.transactions.filter(t=>t.account==='trade'&&t.turn<=e.turn).reduce((n,t)=>n+t.cost,0);
      const income=(inclusive:boolean)=>sales.reduce((n,t)=>n+(t.method==='trade'&&(inclusive?t.turn<=e.turn:t.turn<e.turn)?t.price:0),0)-civilSpent;
      // A player sale may occur before or after a rite in the same strategic turn.
      check(v.tradeReserve===income(false)||v.tradeReserve===income(true));
      let minimum=0,maximum=0;
      for(const other of s.cities.entries){
        const founder=other.foundingOwner!;
        const created=founder.kind==='state'?s.states!.entries.find(r=>r.id===founder.id)!.transactions.find(t=>t.action.kind==='found'&&t.action.address.locationId===other.address.locationId)?.turn:0;
        if(created===undefined||created>e.turn)continue;
        const prior=other.transfers!.filter(t=>t.turn<e.turn).at(-1)?.to??originalCityOwner(s,other);
        const owners=other===c?[owner]:[prior,...other.transfers!.filter(t=>t.turn===e.turn).map(t=>t.to)];
        if(owners.every(o=>o.kind==='state'&&o.id===r.id))minimum++;
        if(owners.some(o=>o.kind==='state'&&o.id===r.id))maximum++;
      }
      check(v.cities>=minimum&&v.cities<=maximum);
      const defended=c.defense&&r.transactions.find(t=>t.id===c.defense!.transactionId);
      if(!defended||defended.turn>e.turn||c.transfers!.slice(0,e.epoch).some(t=>t.method))check(v.guard===0);
      else check(v.guard>=c.defense!.health);
      check(v.fortification>=c.fortification!);
      const p=e.position;shape(p,['x','y','z']);num(p.x,78,-78);num(p.z,78,-78);num(p.y,1024,-1024);
      const f=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!;
      check(Math.abs(p.y-fieldGround(s.seed,planetAtlas(s.homePlanet!)!.cells[f.cellId],p.x,p.z))<1e-6);
      const payment=e.payment;shape(payment,['source','use','amount','before','after']);check(payment.source==='home'&&payment.use==='consumed');num(payment.before);num(payment.after);
      check(payment.amount===(e.action==='renounce'?0:CONVERSION_COST)&&payment.before>=payment.amount&&payment.after===payment.before-payment.amount);
      if(e.action==='rite'){
        check(['sharing','peace','memory'].includes(e.response!)&&progress<conversionRequired(v));
        check(e.after===(e.response===conversionResponse(v,progress)?progress+1:Math.max(0,progress-1)));
      }else if(e.action==='renounce')check(e.response===null&&progress>0&&e.after===0);
      else{
        check(e.action==='complete'&&e.response===null&&progress>=conversionRequired(v)&&e.after===progress);
        check(next?.method==='conversion'&&next.eventId===e.id&&next.turn===e.turn);completed=true;
      }
      if(e.action!=='renounce'){const site=conversionSite(s,c,progress,e.action==='complete');check(Math.hypot(p.x-site.x,p.z-site.z)<=(e.action==='complete'?6:3));}
      progress=e.after;
    }
  }
}
export function validateConversionTransfer(s:GameState,c:City,t:ConversionTransfer,index:number):void {
  check(s.cities!.version===8);
  shape(t,['method','version','id','from','to','turn','economy','eventId','spent','defenseHealth','fortification']);
  check(t.method==='conversion'&&t.version===1&&t.id===`${c.id}:conversion-${index+1}`);
  check(t.from.kind==='state'&&s.states!.entries.some(r=>r.id===t.from.id)&&sameOwner(t.to,{kind:'lineage',id:s.homePlanet!.id}));
  integer(t.eventId,CONVERSION_LIMIT,1);const e=c.conversion?.events[t.eventId-1];
  check(e?.action==='complete'&&e.epoch===index&&e.ownerId===t.from.id&&e.turn===t.turn);
  integer(t.spent,CONVERSION_COST*CONVERSION_LIMIT,CONVERSION_COST);
  check(t.spent===c.conversion!.events.slice(0,t.eventId).filter(e=>e.epoch===index).reduce((n,e)=>n+e.payment.amount,0));
  const state=s.states!.entries.find(r=>r.id===t.from.id)!;
  const reserve=400-state.transactions.filter(x=>x.account==='reserve'&&x.turn<=t.turn).reduce((n,x)=>n+x.cost,0);
  const sales=s.cities!.entries.flatMap(c=>c.transfers!.filter(x=>x.method==='trade'&&x.from.id===t.from.id&&x.turn<=t.turn));
  const civil=sales.reduce((n,x)=>n+(x.method==='trade'?x.price:0),0)-state.transactions.filter(x=>x.account==='trade'&&x.turn<=t.turn).reduce((n,x)=>n+x.cost,0);
  const count=s.cities!.entries.filter(c=>{const founded=state.transactions.find(x=>x.action.kind==='found'&&x.action.address.locationId===c.address.locationId);return !!founded&&founded.turn<=t.turn&&sameOwner(c.transfers!.filter(x=>x!==t&&x.turn<=t.turn).at(-1)?.to??originalCityOwner(s,c),t.from);}).length;
  check(e!.situation.cities===count&&e!.situation.reserve===reserve&&e!.situation.tradeReserve===civil&&e!.situation.residents===t.economy?.residents.length&&e!.situation.food===t.economy?.food);
  if(t.defenseHealth===null)check(c.defense===null);else{num(t.defenseHealth,62);check(c.defense?.health===t.defenseHealth);}
  check(e!.situation.guard===(c.transfers!.slice(0,index).some(t=>t.method)?0:t.defenseHealth??0));
  num(t.fortification,80);check(e!.situation.fortification===t.fortification&&c.fortification!<=t.fortification);
  check(!s.cities!.entries.some(c=>c.transfers!.some(x=>x!==t&&x.method&&x.from.id===t.from.id&&x.turn===t.turn)));
}
export function conversionCheckpointMatches(live:GameState,cp:GameState):boolean {
  if(live.cities?.version!==8)return true;
  return cp.cities?.version===8&&cp.cities.entries.every(c=>{const l=live.cities!.entries.find(v=>v.id===c.id);return !!l&&c.conversion!.events.every((e,i)=>same(e,l.conversion!.events[i]));});
}
