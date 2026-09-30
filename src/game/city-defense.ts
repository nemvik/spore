import type { GameState, Vec3, World } from './types';
import type { City } from './cities';
import type { CityBuilding, CityEconomy } from './city-economy';
import { cityLot } from './city-spatial';
import { fieldGround, navigation } from './planet-travel';
import { planetAtlas } from './planet-geography';
import { enableCivilization } from './civilization';
export const TOWER_HEALTH=100, TOWER_RANGE=24, TOWER_POWER=4, TOWER_REPAIR=40;
export interface TowerDefense {health:number;cooldown:number;repaired:number;builtCycle:number;maintained:number|null;}
/** Upgrade current branches only; captured/traded/completed economy snapshots are immutable. */
export function enableCityDefense(s:GameState,origin:'birth'|'legacy-activation'='legacy-activation'):void {
  enableCivilization(s,origin);
  const migrate=(v:GameState)=>{let changed=false;for(const c of v.cities!.entries){const e=c.economy;if(e&&e.version<4){e.version=4;e.ledger.repairs=0;changed=true;}}return changed;};
  migrate(s);if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}
export function activateDefenseEconomy(s:GameState,e:CityEconomy):void {if(s.civilization&&e.version<4){e.version=4;e.ledger.repairs=0;}}
export const liveTowers=(c:City)=>(c.economy?.buildings??[]).filter(b=>b.kind==='tower'&&b.defense!.health>0);
export const towerOnline=(c:City,b:CityBuilding)=>b.kind==='tower'&&b.defense!.health>0&&b.enabled&&b.defense!.maintained===c.economy!.cycle&&!!c.economy!.last?.funded&&c.economy!.last.income>0&&c.economy!.last.produced>0&&c.economy!.last.hungry===0;
export function towerTarget(s:GameState,c:City,b:CityBuilding):{pos:Vec3;health:number;cooldown:number;buildingId:number} {
  const p=cityLot(c,b.lot)!,f=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!,cell=planetAtlas(s.homePlanet!)!.cells[f.cellId],d=b.defense!;
  return {pos:{x:p.x,y:fieldGround(s.seed,cell,p.x,p.z)+.8,z:p.z},buildingId:b.id,get health(){return d.health;},set health(v){d.health=v;},get cooldown(){return d.cooldown;},set cooldown(v){d.cooldown=v;}};
}
/** Bodies remain solid for motion; a tower's own body cannot occlude its muzzle/target. */
export function towerShotWorld(world:World,c:City,id:number):World {
  const obstacleId=100001+c.economy!.buildings.findIndex(b=>b.id===id);
  return {...world,obstacles:world.obstacles.filter(o=>o.id!==obstacleId)};
}
