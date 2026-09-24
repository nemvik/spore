import type { GameState, Vec3 } from './types';
import type { FieldLocation } from './planet-travel';
import type { AtlasCell } from './planet-geography';
import { bodyCollisionRadius } from './body-shape';

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
  return Math.hypot(p.x-hall.x,p.z-hall.z)>=hall.radius+radius+.1;
}
