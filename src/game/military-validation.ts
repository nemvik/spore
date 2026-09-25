import { validateDefense, defenseCheckpointMatches } from './defense-validation';
import { canOccupy } from './defense';
import type { GameState, Vec3 } from './types';
import { activeMachines, machineDesign } from './machines';
import { defenseDesign, landRoute, militaryWorld, tankRadius } from './military';
import { vehicleStats } from './blueprint';
import { validateCityEconomy, cityEconomyCheckpointMatches } from './city-economy-validation';
import { navigation, fieldGround } from './planet-travel';
import { planetAtlas } from './planet-geography';
const check=(v:unknown):void=>{if(!v)throw new Error('Poškozený save: neplatná vojenská cesta nebo převzetí.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));};
const num=(v:unknown,max=1e9,min=0)=>check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max);
const id=(v:unknown,max=1e9)=>{num(v,max,1);check(Number.isInteger(v));};
const vector=(p:Vec3)=>{shape(p,['x','y','z']);num(p.x,78,-78);num(p.z,78,-78);num(p.y,1024,-1024);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function validateMilitary(s:GameState):void {
  const w=s.military,f=w?.version===2;check(f?(s.cities?.version===6&&s.states?.version===3||(s.cities?.version??0)>=7&&s.states?.version===4):s.cities?.version===5&&s.states?.version===2);
  shape(w,['version','deployment','notice',...(f?['raids']:[])]);check((w!.version===1||f)&&typeof w!.notice==='string'&&w!.notice.length<=512);
  for(const c of s.cities!.entries){
    check(!!c.foundingOwner);
    if(c.capture===null){if(!f)check(same(c.owner,c.foundingOwner));}
    else{
      const cap=c.capture!;shape(cap,['from','unitId','elapsed','economy']);shape(cap.from,['kind','id']);
      check(same(cap.from,c.foundingOwner)&&cap.from.kind==='state'&&(f||c.owner.kind==='lineage'&&c.owner.id===s.homePlanet!.id)&&c.defense?.health===0);
      id(cap.unitId,activeMachines(s)!.nextId-1);num(cap.elapsed,1e9,5);
      const archived={...c,economy:cap.economy};validateCityEconomy(s,archived);
      check(cityEconomyCheckpointMatches(c,archived));
      if(cap.economy)check(c.economy!.revision>cap.economy.revision);
    }
    if(c.defense===null){check(c.capture===null);continue;}
    const d=c.defense!;shape(d,['transactionId','blueprint','pos','health','cooldown']);
    check(c.foundingOwner!.kind==='state'&&same(d.blueprint,defenseDesign()));vector(d.pos);
    check(same(d.pos,{...c.address.position,y:c.address.position.y+.8}));num(d.health,vehicleStats(d.blueprint).durability);num(d.cooldown,1.2);
    const r=s.states!.entries.find(r=>r.id===c.foundingOwner!.id);
    check(r?.transactions.some(t=>t.id===d.transactionId&&t.action.kind==='defend'&&t.action.cityId===c.id));
  }
  if(f)validateDefense(s);
  const d=w!.deployment;if(d===null)return;
  shape(d,['unitId','cityId','home','route','phase','remaining','order','hold','elapsed']);
  check(s.stage===4);id(d.unitId);vector(d.home);
  const c=s.cities!.entries.find(c=>c.id===d.cityId),m=activeMachines(s),u=m?.fleet.find(u=>u.id===d.unitId);
  check(c&&u&&u.health>0&&(f||c.defense&&c.foundingOwner?.kind==='state'));
  const g=machineDesign(m!,u!);check(g.carrier==='tank'&&vehicleStats(g).module==='cannon'&&u!.cargo===0&&u!.orders.length===0);
  check(same(d.route,landRoute(s,c!))&&['outbound','field','returning'].includes(d.phase)&&['stop','attack','occupy','retreat',...(f?['defend']:[])].includes(d.order));
  num(d.remaining,(d.route.length-1)*5);num(d.elapsed);num(d.hold,5);
  if(d.phase==='outbound')check(same(u!.pos,d.home)&&d.order==='stop'&&d.hold===0);
  else{
    const f=navigation(s)!.fields.find(f=>f.id===c!.address.locationId)!,cell=planetAtlas(s.homePlanet!)!.cells[f.cellId];
    check(Math.abs(u!.pos.y-fieldGround(s.seed,cell,u!.pos.x,u!.pos.z)-.8)<1e-6);
    check(militaryWorld(s,c!).obstacles.every(o=>Math.hypot(o.pos.x-u!.pos.x,o.pos.z-u!.pos.z)>=o.radius+tankRadius(g)-1e-5));
  }
  if(d.phase==='field')check(d.remaining===0);if(d.phase==='returning')check(d.order==='retreat'&&d.hold===0);
  if(d.hold>0)check(d.phase==='field'&&d.order==='occupy'&&(f?canOccupy(s,c!,{kind:'lineage',id:s.homePlanet!.id}):c!.defense!.health===0&&!c!.capture)&&Math.hypot(u!.pos.x-c!.address.position.x,u!.pos.z-c!.address.position.z)<=2.86);
}
export function militaryCheckpointMatches(live:GameState,cp:GameState):boolean {
  if(!live.military||!cp.military)return live.military===cp.military;
  return defenseCheckpointMatches(live,cp)&&cp.cities!.entries.every(c=>{const l=live.cities!.entries.find(v=>v.id===c.id);return !!l&&same(c.foundingOwner,l.foundingOwner)&&(!c.capture||same(c.capture,l.capture))&&(!c.defense||!!l.defense&&c.defense.transactionId===l.defense.transactionId&&l.defense.health<=c.defense.health);});
}
