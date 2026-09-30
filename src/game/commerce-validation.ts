import type { GameState } from './types';
import { validateConstruction } from './blueprint';
import { activeMachines } from './machines';
import { atSea, homeCoast } from './maritime';
import { activeField } from './planet-travel';
import { activeDelivery, carrierDesign, commerceRoute, deliveredCount, ownershipEpoch, COMMERCE_LIMIT, DELIVERY_LIMIT, type Delivery } from './commerce';
const check=(v:unknown):void=>{if(!v)throw new Error('Poškozený save: neplatný obchodní kontrakt, přeprava nebo úschova.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));};
const num=(v:unknown,max=1e9,min=0)=>check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max);
const int=(v:unknown,max=1e9,min=0)=>{num(v,max,min);check(Number.isSafeInteger(v));};
const canonical=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const close=(a:number,b:number)=>Math.abs(a-b)<1e-7;
export function validateCommerce(s:GameState):void {
  if(!Object.hasOwn(s,'commerce'))return;
  const m=s.commerce;shape(m,['version','revision','contracts']);check(m!.version===1&&s.maritime&&s.cities?.version===8&&s.states?.version===4);
  int(m!.revision);check(Array.isArray(m!.contracts)&&m!.contracts.length<=COMMERCE_LIMIT);
  let revision=0,totalDeliveries=0,active=0;const opens=new Set<string>(),designs=new Map<string,string>();
  for(const [i,c] of m!.contracts.entries()){
    shape(c,['id','cityId','stateId','epoch','turn','status','deliveries','refund','receiptId']);check(c.id===i+1&&s.stage>=4);
    const city=s.cities!.entries.find(v=>v.id===c.cityId);check(city&&s.states!.entries.some(v=>v.id===c.stateId));
    int(c.epoch,ownershipEpoch(city!));int(c.turn,s.states!.clock.turn);
    const owners=[city!.foundingOwner!,...(city!.capture?[{kind:'lineage',id:s.homePlanet!.id}]:[]),...city!.transfers!.map(t=>t.to)];
    check(owners[c.epoch]?.kind==='state'&&owners[c.epoch].id===c.stateId);
    const transferIndex=c.epoch-(city!.capture?1:0),prior=city!.transfers![transferIndex-1],next=city!.transfers![transferIndex];
    if(prior)check(c.turn>=prior.turn);if(next)check(c.turn<=next.turn);
    const founded=city!.founded;
    if(founded.source==='state'){const creation=s.states!.entries.flatMap(r=>r.transactions).find(t=>t.id===founded.transactionId);check(creation&&c.turn>=creation.turn);}
    if(i)check(c.turn>=m!.contracts[i-1].turn);
    check(['open','cancelled','settled'].includes(c.status));
    check(Array.isArray(c.deliveries)&&c.deliveries.length<=DELIVERY_LIMIT);totalDeliveries+=c.deliveries.length;
    revision++;
    let turn=c.turn,delivered=0;
    for(const [j,d] of c.deliveries.entries()){
      shape(d,[...(Object.hasOwn(d,'units')?['units']:[]),'id','carrier','blueprint','home','route','phase','delivered','progress','distance','elapsed','turn','payment','refund']);check(d.id===j+1);
      shape(d.carrier,['kind','id']);check(['fleet','boat'].includes(d.carrier.kind));
      check(d.blueprint&&validateConstruction(d.blueprint).length===0);
      if(d.carrier.kind==='fleet'){
        int(d.carrier.id,activeMachines(s)!.nextId-1,1);check(d.blueprint.carrier!=='boat');shape(d.home,['x','y','z']);for(const n of Object.values(d.home!))num(n,1000,-1000);
      }else check(d.carrier.id===`${s.homePlanet!.id}:vessel-1`&&d.blueprint.carrier==='boat'&&d.home===null);
      const key=canonical(d.carrier),design=canonical(d.blueprint);check(!designs.has(key)||designs.get(key)===design);designs.set(key,design);
      check(same(d.route,commerceRoute(s,city!,d.blueprint.carrier)));const length=d.route.length-1;check(length>=1);
      num(d.progress,length);num(d.distance,length);num(d.elapsed,length*2);int(d.turn,s.states!.clock.turn,turn);turn=d.turn;
      check(['outbound','returning','returned'].includes(d.phase)&&typeof d.delivered==='boolean');
      check(d.progress<=d.distance&&close(d.elapsed,d.phase==='outbound'?d.progress:2*d.distance-d.progress));
      if(d.phase==='outbound')check(!d.delivered&&d.progress===d.distance);
      const units=Object.hasOwn(d,'units')?d.units!:1;int(units,3,1);check(delivered+units<=3);
      if(d.delivered){check(d.distance===length&&d.phase!=='outbound');delivered+=units;}
      if(d.phase==='returned')check(d.progress===0);else{active++;check(j===c.deliveries.length-1&&c.status==='open'&&s.stage===4&&activeField(s)?.id===city!.address.locationId);}
      const p=d.payment;shape(p,['amount','before','after','springId']);check(p.amount===20*units);num(p.before);num(p.after);check(p.before>=p.amount&&p.after===p.before-p.amount);int(p.springId);check(activeMachines(s)!.springs.some(v=>v.id===p.springId&&v.owner==='player'));
      if(d.phase==='returned'&&!d.delivered){shape(d.refund,['amount','before','after']);check(d.refund!.amount===p.amount);num(d.refund!.before);num(d.refund!.after);check(d.refund!.after===d.refund!.before+p.amount);}else check(d.refund===null);
      revision+=d.phase==='outbound'?1:d.phase==='returning'?2:3;
    }
    check(delivered<=3);
    if(c.status==='open'){check(s.stage===4&&!opens.has(c.cityId)&&c.refund===null&&c.receiptId===null);opens.add(c.cityId);}
    else {
      revision++;check(c.deliveries.every(d=>d.phase==='returned'));
      if(c.status==='cancelled'){
        shape(c.refund,['amount','before','after']);check(c.refund!.amount===delivered*20&&c.receiptId===null);num(c.refund!.before);num(c.refund!.after);check(c.refund!.after===c.refund!.before+c.refund!.amount);
      }else{
        check(c.refund===null&&deliveredCount(c)===3);
        const index=c.epoch-(city!.capture?1:0),receipt=city!.transfers?.[index];
        check(receipt?.method==='trade'&&receipt.version===2&&receipt.id===c.receiptId&&receipt.contractId===c.id&&receipt.from.id===c.stateId&&receipt.turn>=turn);
      }
    }
  }
  check(totalDeliveries<=DELIVERY_LIMIT&&active<=1&&m!.revision===revision);
  const a=activeDelivery(s);if(a){
    const d=a.delivery;check(!atSea(s)&&!s.military?.deployment&&same(carrierDesign(s,d.carrier),d.blueprint));
    if(d.carrier.kind==='fleet'){
      const u=activeMachines(s)!.fleet.find(u=>u.id===d.carrier.id);check(u&&u.health>0&&u.cargo===0&&u.orders.length===0&&same(u.pos,d.home));
    }else check(s.maritime!.vessel!.mooring===homeCoast(s));
  }
}
const deliveryBase=(d:Delivery)=>[d.units??1,d.id,d.carrier,d.blueprint,d.home,d.route,d.turn,d.payment];
export function commerceCheckpointMatches(s:GameState,cp:GameState):boolean {
  const a=s.commerce,b=cp.commerce;if(!a||!b)return !a&&!b;
  if(a.version!==b.version||b.revision>a.revision||b.contracts.length>a.contracts.length)return false;
  return b.contracts.every((c,i)=>{const live=a.contracts[i];if(!live||!same([c.id,c.cityId,c.stateId,c.epoch,c.turn],[live.id,live.cityId,live.stateId,live.epoch,live.turn]))return false;
    if(c.status!=='open')return same(c,live);
    if(c.deliveries.length>live.deliveries.length)return false;
    return c.deliveries.every((d,j)=>{const v=live.deliveries[j];if(!v||!same(deliveryBase(d),deliveryBase(v)))return false;
      if(d.phase==='returned')return same(d,v);
      if(d.elapsed>v.elapsed+1e-7||d.distance>v.distance+1e-7)return false;
      if(d.delivered&&!v.delivered)return false;
      return d.phase!=='returning'||v.phase!=='outbound'&&d.delivered===v.delivered&&d.distance===v.distance&&v.progress<=d.progress+1e-7;
    });
  });
}
