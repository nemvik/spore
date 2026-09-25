import { fieldRaid, cityEntry } from './defense';
import { tankRadius } from './military';
import { activeMachines, machineDesign } from './machines';
import type { GameState, Vec3 } from './types';
import type { FieldLocation } from './planet-travel';
import type { AtlasCell } from './planet-geography';
import { bodyCollisionRadius } from './body-shape';
import type { City } from './cities';
import { CITY_BUILDINGS, type CityBuildingKind } from './city-economy';
import { fieldGround, navigation } from './planet-travel';
import { locationGeography } from './planet-geography';

/** Same visual decorations as C, extracted without changing the generator. */
export function fieldDecorations(field: FieldLocation, cell: AtlasCell) {
  const result: { x:number; z:number; radius:number; index:number; plants:boolean }[]=[];
  for(let i=0;i<65;i++){
    const x=((field.world.rng+i*37)%146)-73,z=((field.world.rng%97+i*61)%146)-73;
    if(Math.hypot(x,z)<8 || field.world.patches.some(p=>Math.hypot(x-p.center.x,z-p.center.z)<5))continue;
    const plants=cell.biome==='rainforest'||cell.biome==='grassland';
    result.push({x,z,radius:plants?(cell.biome==='rainforest'?1.8:.5):.6+i%4*.3,index:i,plants});
  }
  return result;
}
export const CITY_SQUARE_RADIUS = 4;

/** Layout 1: square at the address, solid circular hall to the east. */
export const cityHall=(p:Vec3)=>({x:p.x+14,z:p.z,radius:2.5});
export function cityPositionClear(s:GameState,field:FieldLocation,p:Vec3):boolean {
  const city=s.cities?.entries.find(c=>c.address.locationId===field.id);
  if(!city)return true;
  const hall=cityHall(city.address.position),radius=bodyCollisionRadius(s.player.genome,2);
  if(Math.hypot(p.x-hall.x,p.z-hall.z)<hall.radius+radius+.1)return false;
  return (city.economy?.buildings??[]).every(b=>{const v=cityLot(city,b.lot);return !!v&&Math.hypot(p.x-v.x,p.z-v.z)>=CITY_BUILDINGS[b.kind].radius+radius+.1;});
}

/** Local overlay layout, independent of atlas/detail generators and World RNG. */
export const CITY_LOTS = Array.from({length:121},(_,i)=>({id:i,x:(i%11-5)*8,z:(Math.floor(i/11)-5)*8})).filter(p=>Math.hypot(p.x,p.z)<=40&&Math.hypot(p.x,p.z)>=8);
export function cityLot(c:City,id:number):{x:number;z:number}|null {
  const p=CITY_LOTS.find(p=>p.id===id);
  return p?{x:c.address.position.x+p.x,z:c.address.position.z+p.z}:null;
}
function segmentDistance(p:{x:number;z:number},a:{x:number;z:number},b:{x:number;z:number}):number {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
/** Shared by quotes, committed placement and strict import validation. */
export function buildingSite(s:GameState,c:City,lot:number,kind:CityBuildingKind,ignoreId?:number,checkActor=true):string|null {
  const p=cityLot(c,lot),geo=locationGeography(s,c.address.locationId),f=navigation(s)?.fields.find(f=>f.id===c.address.locationId);
  if(!p||!Number.isInteger(lot)||!geo||!f||!Object.hasOwn(CITY_BUILDINGS,kind))return 'Neplatná parcela.';
  const r=CITY_BUILDINGS[kind].radius,body=bodyCollisionRadius(s.player.genome,2),clearance=2*body+.5;
  const distance=(v:{x:number;z:number})=>Math.hypot(p.x-v.x,p.z-v.z);
  if(Math.abs(p.x)+r+body+.5>78||Math.abs(p.z)+r+body+.5>78)return 'Parcela je příliš blízko hranice.';
  if(distance(c.address.position)<CITY_SQUARE_RADIUS+r+body+1)return 'Zachovej volné náměstí.';
  const hall=cityHall(c.address.position);
  if(distance(hall)<hall.radius+r+clearance)return 'Zachovej odstup a průchod kolem radnice.';
  if(segmentDistance(p,c.address.position,{x:0,z:0})<r+body+1)return 'Tudy vede bezpečná cesta mezi příchodem a náměstím.';
  if(f.world.landmarks.some(l=>distance(l.pos)<r+body+3)||f.world.patches.some(l=>distance(l.center)<l.radius+r+body+1)||f.world.obstacles.some(o=>distance(o.pos)<o.radius+r+clearance))return 'Parcela zasahuje stanoviště, příchod nebo překážku.';
  if(fieldDecorations(f,geo.cell).some(d=>distance(d)<r+d.radius+1))return 'Na parcele stojí skála nebo vegetace.';
  if((c.economy?.buildings??[]).some(b=>b.id!==ignoreId&&(b.lot===lot||distance(cityLot(c,b.lot)!)<r+CITY_BUILDINGS[b.kind].radius+clearance)))return 'Parcela je obsazená nebo nemá průchod mezi budovami.';
  // Historical buildings remain valid; F reserves berths only for future construction.
  if(checkActor&&s.cities?.version===6&&[cityEntry(s,c),cityEntry(s,c,true)].some(v=>distance(v)<r+4+.1))return 'Zachovej volné příjezdy tanků u vstupu.';
  const deployment=s.military?.deployment,m=activeMachines(s),tank=deployment?.cityId===c.id&&deployment.phase!=='outbound'?m?.fleet.find(u=>u.id===deployment.unitId):null;
  const raid=fieldRaid(s,c);if(checkActor&&raid&&distance(raid.unit.pos)<r+tankRadius(raid.blueprint)+.1)return 'Na parcele stojí soupeřův tank. Nejprve jej odveď nebo znič.';
  if(checkActor&&tank&&distance(tank.pos)<r+tankRadius(machineDesign(m!,tank))+.1)return 'Na parcele stojí nasazený tank. Nejprve jej odveď.';
  if(checkActor&&distance(f.position)<r+body+.5)return 'Na parcele stojí tvůj tvor. Popojdi a potvrď znovu.';
  let low=Infinity,high=-Infinity;
  for(const x of [-r,0,r])for(const z of [-r,0,r]) {
    const h=fieldGround(s.seed,geo.cell,p.x+x,p.z+z);low=Math.min(low,h);high=Math.max(high,h);
    if(geo.anchor.altitudeMeters+h*geo.anchor.metersPerUnit<=0)return 'Část parcely je pod vodou.';
    const dx=fieldGround(s.seed,geo.cell,p.x+x+.1,p.z+z)-h,dz=fieldGround(s.seed,geo.cell,p.x+x,p.z+z+.1)-h;
    if(Math.hypot(dx,dz)/.1>.25)return 'Parcela je příliš strmá.';
  }
  return high-low>1?'Parcela je příliš členitá.':null;
}
