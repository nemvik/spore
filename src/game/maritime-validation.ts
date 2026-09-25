import type { GameState } from './types';
import { seaBlueprint, validateSeaBlueprint, vehicleCost, vehicleStats } from './blueprint';
import { atSea, currentCoast, homeCoast, isCoast, seaRoute, SEA_LIMIT } from './maritime';
import { planetAtlas } from './planet-geography';
import { navigation } from './planet-travel';
const check=(v:unknown):void=>{if(!v)throw new Error('Poškozený save: neplatná námořní cesta, prostředek nebo účetní doklad.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));};
const num=(v:unknown,max=1e9,min=0)=>check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max);
const integer=(v:unknown,max=1e9,min=0)=>{num(v,max,min);check(Number.isSafeInteger(v));};
const canonical=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const close=(a:number,b:number)=>Math.abs(a-b)<1e-7;
export function validateMaritime(s:GameState):void {
  if(!Object.hasOwn(s,'maritime'))return;
  const m=s.maritime;shape(m,['version','legacyAccess','revision','vessel','journeys']);
  check(m!.version===1&&s.homePlanet?.version===3&&s.cities?.version===8);
  const nav=navigation(s)!;
  check(Array.isArray(m!.legacyAccess)&&m!.legacyAccess.length<=64);
  for(const [i,id] of m!.legacyAccess.entries()){integer(id,2591);check(i===0||id>m!.legacyAccess[i-1]);check(nav.fields.some(f=>f.cellId===id));}
  integer(m!.revision);check(Array.isArray(m!.journeys)&&m!.journeys.length<=SEA_LIMIT);
  if(m!.vessel===null){check(m!.journeys.length===0&&m!.revision===0);return;}
  const v=m!.vessel!;shape(v,['id','blueprint','health','mooring','payment']);
  check(s.stage>=4&&s.machines?.version===2&&s.tribe?.version===2&&s.tribe.completed);
  check(v.id===`${s.homePlanet!.id}:vessel-1`&&!validateSeaBlueprint(v.blueprint).length);
  check(v.health===vehicleStats(v.blueprint).durability);integer(v.mooring,2591);check(isCoast(s,v.mooring));
  const p=v.payment;shape(p,['source','use','amount','before','after','springId','tick']);
  check(p.source==='home'&&p.use==='consumed'&&p.amount===vehicleCost(seaBlueprint()));num(p.before);num(p.after);check(p.before-p.amount===p.after);
  integer(p.tick,s.tick);integer(p.springId);check(s.machines!.version===2&&s.machines!.springs.some(q=>q.id===p.springId&&q.owner==='player'));
  let mooring=homeCoast(s),revision=1,turn=0;
  for(const [i,j] of m!.journeys.entries()){
    shape(j,['id','from','to','route','phase','progress','distance','elapsed','turn']);check(j.id===i+1);integer(j.from,2591);integer(j.to,2591);integer(j.turn,s.states!.clock.turn,turn);turn=j.turn;
    check(j.from===mooring);const route=seaRoute(s,j.from,j.to);check(route&&same(j.route,route));
    check(j.to===homeCoast(s)||!planetAtlas(s.homePlanet!)!.anchors.some(a=>a.cellId===j.to));
    const total=j.route.length-1;num(j.progress,total);num(j.distance,total);num(j.elapsed,total*2);
    check(['outbound','returning','landed','returned'].includes(j.phase));
    const returned=j.phase==='returning'||j.phase==='returned';
    check(close(j.elapsed,returned?2*j.distance-j.progress:j.progress));check(j.progress<=j.distance);
    if(!returned)check(j.distance===j.progress);
    revision+=j.phase==='outbound'?1:j.phase==='returned'?3:2;
    if(j.phase==='landed'){check(j.progress===total);mooring=j.to;}
    if(j.phase==='returned')check(j.progress===0);
    if(j.phase==='landed'||j.phase==='returned'){
      const id=mooring===homeCoast(s)?`${s.homePlanet!.id}:coast`:`${s.homePlanet!.id}:field-${mooring}`;
      check(nav.visits.some(v=>v.locationId===id));
    }else{check(i===m!.journeys.length-1&&currentCoast(s)===j.from&&s.stage===4);}
  }
  check(v.mooring===mooring&&m!.revision===revision);
  if(atSea(s))check(!s.military?.deployment);
}
export function maritimeCheckpointMatches(s:GameState,cp:GameState):boolean {
  const a=s.maritime,b=cp.maritime;if(!a||!b)return !a&&!b;
  if(a.version!==b.version||b.legacyAccess.some(id=>!a.legacyAccess.includes(id))||b.revision>a.revision||b.journeys.length>a.journeys.length)return false;
  if(b.vessel&&(!a.vessel||!same([a.vessel.id,a.vessel.blueprint,a.vessel.payment,a.vessel.health],[b.vessel.id,b.vessel.blueprint,b.vessel.payment,b.vessel.health])))return false;
  return b.journeys.every((j,i)=>{const v=a.journeys[i];if(!v||!same([j.id,j.from,j.to,j.route,j.turn],[v.id,v.from,v.to,v.route,v.turn]))return false;
    if(j.phase==='landed'||j.phase==='returned')return same(j,v);
    if(j.elapsed>v.elapsed+1e-7||j.distance>v.distance+1e-7)return false;
    return j.phase!=='returning'||((v.phase==='returning'||v.phase==='returned')&&j.distance===v.distance&&v.progress<=j.progress+1e-7);
  });
}
