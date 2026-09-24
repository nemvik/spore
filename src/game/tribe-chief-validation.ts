import type { ActiveTribeState } from './era-types';
import type { GameState } from './types';
import { CHIEF, CHIEF_REASONS } from './tribe-chief';
import { cultureEffects } from './culture';
import { creatureInheritance } from './lineage-history';

const invalid=():never=>{throw new Error('Poškozená uložená hra (state.tribe.chief): neplatný náčelník nebo sněm.');};
function exact(v:unknown,keys:string[]):Record<string,unknown>{
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))invalid();return v as Record<string,unknown>;
}
function num(v:unknown,min:number,max:number,integer=false):number{
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))invalid();return v as number;
}
export function validateChief(value:unknown,t:ActiveTribeState):void {
  const c=exact(value,['version','member','cooldown','active','result']);if(c.version!==1)invalid();
  const member=(v:unknown)=>{const id=num(v,1,t.nextId-1,true);
    if(t.members.some(u=>u.id===id&&u.species!==null)||t.huts.some(h=>h.id===id)||t.neighbours.some(n=>n.id===id||n.society?.members.some(u=>u.id===id)))invalid();return id;
  };
  const neighbour=(v:unknown)=>{num(v,1,t.nextId-1,true);const n=t.neighbours.find(n=>n.id===v);if(!n?.society)invalid();return n!;};
  if(c.member!==null)member(c.member);num(c.cooldown,0,CHIEF.cooldown);
  if(c.active!==null){
    const e=exact(c.active,['member','neighbour','host','phase','remaining','contactLost','paid','multiplier']),id=member(e.member),n=neighbour(e.neighbour),host=num(e.host,1,t.nextId-1,true);
    if(c.member!==id||c.cooldown!==CHIEF.cooldown||c.result!==null||e.paid!==CHIEF.fee)invalid();
    if(t.members.some(u=>u.id===host)||t.huts.some(h=>h.id===host)||t.neighbours.some(v=>v.id===host||v.id!==n.id&&v.society?.members.some(u=>u.id===host)))invalid();
    if(!['travel','speak'].includes(e.phase as string))invalid();num(e.remaining,0,e.phase==='travel'?CHIEF.travel:CHIEF.speak);num(e.contactLost,0,e.phase==='travel'?0:CHIEF.grace);num(e.multiplier,1,1.4375);
    const u=t.members.find(u=>u.id===id);
    if(u?.orders.length||t.music?.active&&(t.music.active.members.includes(id)||t.music.active.neighbour===n.id)||t.domestication?.active?.caretaker===id||t.domestication?.animals.some(a=>a.caretaker===id))invalid();
  }
  if(c.result!==null){
    const r=exact(c.result,['member','neighbour','reason','paid','delta']);member(r.member);neighbour(r.neighbour);
    if(typeof r.reason!=='string'||!Object.hasOwn(CHIEF_REASONS,r.reason)||r.paid!==CHIEF.fee)invalid();
    num(r.delta,0,r.reason==='success'?CHIEF.gain*1.4375:0);
  }
}
/** Missing references can be a real phase boundary. They cancel on the next tick. */
export function validateChiefContext(s:GameState):void {
  const t=s.tribe?.version===2?s.tribe:null,c=t?.chief,e=c?.active;if(!t||!c)return;
  if(s.stage<3||s.stage!==3&&e)invalid();
  if(e){const u=t.members.find(u=>u.id===e.member&&u.health>0&&!u.species);
    if(u&&Math.abs(e.multiplier-cultureEffects(u.outfit).social*creatureInheritance(s).social)>1e-10)invalid();
  }
}
