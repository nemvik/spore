import type { GameState } from './types';
import type { ActiveTribeState } from './era-types';
import { ANIMAL_REASONS, animalCapacity } from './tribe-domestication';
const invalid=():never=>{throw new Error('Poškozená uložená hra (state.tribe.domestication): neplatné získávání nebo péče o zvíře.');};
function exact(v:unknown,keys:string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))invalid();return v as Record<string,unknown>;}
function num(v:unknown,min=0,max=1e9,integer=false):number{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||integer&&!Number.isInteger(v))invalid();return v as number;}
function list(v:unknown,max:number):unknown[]{if(!Array.isArray(v)||v.length>max)invalid();return v as unknown[];}
function vector(v:unknown){const p=exact(v,['x','y','z']);for(const k of ['x','y','z'])num(p[k],-80,80);}
function nav(v:unknown){const n=exact(v,['waypoint','target','rethink']);vector(n.waypoint);vector(n.target);num(n.rethink,0,1);}
export function validateDomestication(value:unknown,t:ActiveTribeState):void{
 const d=exact(value,['version','active','animals','result']);if(d.version!==1)invalid();
 const member=(v:unknown)=>{const id=num(v,1,t.nextId-1,true);if(t.members.some(u=>u.id===id&&u.species!==null)||t.huts.some(h=>h.id===id)||t.neighbours.some(n=>n.id===id||n.society?.members.some(u=>u.id===id)))invalid();return id;};
 const ids=list(d.animals,3).map(v=>{const a=exact(v,['creature','caretaker','mode','resource','cargo','trust','navigation']);const id=num(a.creature,1,1e9,true);if(a.caretaker!==null)member(a.caretaker);
  if(!['rest','gather'].includes(a.mode as string)||(a.mode==='rest')!==(a.resource===null))invalid();if(a.resource!==null)num(a.resource,1,1e9,true);num(a.cargo,0,6);num(a.trust,0,100);nav(a.navigation);return id;
 });
 if(new Set(ids).size!==ids.length)invalid();
 if(d.active!==null){const e=exact(d.active,['creature','caretaker','phase','remaining','progress','contactLost','paid','navigation']);const id=num(e.creature,1,1e9,true);const owner=member(e.caretaker);
  if(ids.includes(id)||t.music?.active?.members.includes(owner))invalid();if(!['approach','lure','escort'].includes(e.phase as string))invalid();
  num(e.remaining,0,90);num(e.progress,0,8);num(e.contactLost,0,4);nav(e.navigation);
  if(e.phase==='approach'){if(e.paid!==0||e.progress!==0||e.contactLost!==0)invalid();}else{if(e.paid!==6||e.phase==='escort'&&e.progress!==8)invalid();}
 }
 if(ids.length+(d.active===null?0:1)>animalCapacity(t))invalid();
 if(d.result!==null){const r=exact(d.result,['creature','reason','paid']);num(r.creature,1,1e9,true);if(typeof r.reason!=='string'||!Object.hasOwn(ANIMAL_REASONS,r.reason)||![0,6].includes(r.paid as number))invalid();
  if(r.reason==='success'&&r.paid!==6||['neglect','released','death'].includes(r.reason as string)&&r.paid!==0)invalid();
 }
}
/** Existence can be stale at phase boundaries; extant references must have the correct owner/type. */
export function validateDomesticationContext(s:GameState):void{
 const t=s.tribe?.version===2?s.tribe:null,d=t?.domestication;if(!d)return;
 const w=s.worlds[2];if(!w||s.stage<3||s.stage!==3&&d.active)invalid();
 const creature=(id:number)=>{num(id,1,w!.nextId-1,true);const c=w!.creatures.find(c=>c.id===id);if(c&&c.species!=='bell'||w!.resources.some(r=>r.id===id)||w!.obstacles.some(o=>o.id===id))invalid();};
 if(d.active)creature(d.active.creature);
 for(const a of d.animals){creature(a.creature);if(a.resource!==null){num(a.resource,1,w!.nextId-1,true);const r=w!.resources.find(r=>r.id===a.resource);if(r&&!['nectar','algae'].includes(r.kind)||w!.creatures.some(c=>c.id===a.resource)||w!.obstacles.some(o=>o.id===a.resource))invalid();}}
 if(d.result)num(d.result.creature,1,w!.nextId-1,true);
}
