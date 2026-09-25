import { CITY_BUILDINGS, isBuildingKind, type CityBuildingKind } from './city-economy';
import type { Vec3 } from './types';

export const BUILDING_PART_LIMIT = 24;
export const BUILDING_SHAPES = { box:'Kvádrový blok', cylinder:'Válec', cone:'Kužel', dome:'Kupole' } as const;
export type BuildingShape = keyof typeof BUILDING_SHAPES;
export interface BuildingPart { id:string; shape:BuildingShape; position:Vec3; size:Vec3; yaw:number; color:string; }
export interface BuildingDesign { version:1; kind:CityBuildingKind; parts:BuildingPart[]; }
export interface BuildingCreation {
  format:'lumavora-building'; version:1; id:string; revision:number;
  createdAt:number; updatedAt:number; name:string; design:BuildingDesign;
}
export type BuildingAppearance = {version:1;source:'default';model:'city-b-1'} | {version:1;source:'creation';creation:BuildingCreation};
export const defaultBuildingAppearance=():BuildingAppearance=>({version:1,source:'default',model:'city-b-1'});
export const buildingNameValid=(v:unknown):v is string=>typeof v==='string'&&v===v.trim()&&v.length>0&&v.length<=40&&!/[\u0000-\u001f\u007f]/.test(v);
const bad=(message:string):never=>{throw new Error(message);};
export function buildingShape(v:unknown,keys:string[]):Record<string,unknown> {
  if(!v||typeof v!=='object'||Array.isArray(v))return bad('Neplatná struktura návrhu budovy.');
  const row=v as Record<string,unknown>;
  if(Object.keys(row).length!==keys.length||keys.some(k=>!Object.hasOwn(row,k)))bad('Neplatná pole návrhu budovy.');
  return row;
}
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
/** Conservative rotated bounding box, also for round parts. Same dimensions as rendering. */
export function buildingPartCorners(p:BuildingPart):{x:number;z:number}[] {
  const a=p.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return [-1,1].flatMap(x=>[-1,1].map(z=>({x:p.position.x+x*p.size.x/2*c+z*p.size.z/2*s,z:p.position.z-x*p.size.x/2*s+z*p.size.z/2*c})));
}
export function validateBuildingDesign(value:unknown):asserts value is BuildingDesign {
  const v=buildingShape(value,['version','kind','parts']);
  if(v.version!==1||!isBuildingKind(v.kind))bad('Nepodporovaná verze návrhu nebo hospodářský typ.');
  if(!Array.isArray(v.parts)||v.parts.length<1||v.parts.length>BUILDING_PART_LIMIT)bad('Návrh potřebuje 1–24 dílů.');
  const d=value as BuildingDesign,ids=new Set<string>(),r=CITY_BUILDINGS[d.kind].radius;
  for(const p of d.parts) {
    buildingShape(p,['id','shape','position','size','yaw','color']);
    if(typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(p.id)||ids.has(p.id))bad('Díly potřebují jedinečná ID.');ids.add(p.id);
    if(typeof p.shape!=='string'||!Object.hasOwn(BUILDING_SHAPES,p.shape))bad('Neznámý tvar dílu.');
    buildingShape(p.position,['x','y','z']);buildingShape(p.size,['x','y','z']);
    if(!['x','y','z'].every(k=>finite(p.position[k as keyof Vec3],-7,7)&&finite(p.size[k as keyof Vec3],.2,6))||!finite(p.yaw,-180,180))bad('Poloha, velikost nebo otočení je mimo meze.');
    if(typeof p.color!=='string'||!/^#[0-9a-f]{6}$/.test(p.color))bad('Barva musí být #rrggbb.');
    if(p.position.y-p.size.y/2<.7-1e-8||p.position.y+p.size.y/2>7+1e-8)bad('Díl musí být nad základnou (0,7) a pod výškou 7.');
    if(buildingPartCorners(p).some(q=>Math.hypot(q.x,q.z)>r-.08+1e-8||q.z>r-.55+1e-8))bad(`Díl přesahuje parcelu (poloměr ${r}) nebo přední pás znaku. Zmenši jej či posuň dovnitř.`);
  }
}
export function validateBuildingCreation(value:unknown):asserts value is BuildingCreation {
  const v=buildingShape(value,['format','version','id','revision','createdAt','updatedAt','name','design']);
  if(v.format!=='lumavora-building'||v.version!==1)bad('Nepodporovaný formát nebo verze budovy.');
  if(typeof v.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(v.id))bad('Neplatná identita budovy.');
  if(!finite(v.revision,1,1e9)||!Number.isSafeInteger(v.revision))bad('Neplatná revize budovy.');
  if(!finite(v.createdAt,0,8.64e15)||!finite(v.updatedAt,Number(v.createdAt),8.64e15)||!Number.isSafeInteger(v.createdAt)||!Number.isSafeInteger(v.updatedAt))bad('Neplatné datum výtvoru.');
  if(!buildingNameValid(v.name))bad('Jméno musí mít 1–40 znaků na jednom řádku.');
  validateBuildingDesign(v.design);
}
export function validateBuildingAppearance(value:unknown,kind:CityBuildingKind):asserts value is BuildingAppearance {
  if(!value||typeof value!=='object')bad('Chybí vzhled budovy.');
  const a=value as BuildingAppearance;
  if(a.source==='default'){buildingShape(a,['version','source','model']);if(a.version!==1||a.model!=='city-b-1')bad('Neznámý výchozí model budovy.');}
  else {buildingShape(a,['version','source','creation']);if(a.version!==1||a.source!=='creation')bad('Neznámý původ vzhledu.');validateBuildingCreation(a.creation);if(a.creation.design.kind!==kind)bad('Návrh patří jinému hospodářskému typu.');}
}
export function initialBuildingDesign(kind:CityBuildingKind):BuildingDesign {
  return {version:1,kind,parts:[{id:'body',shape:'cylinder',position:{x:0,y:1.7,z:0},size:{x:2,y:2,z:2},yaw:0,color:CITY_BUILDINGS[kind].color},
    {id:'roof',shape:'dome',position:{x:0,y:3.1,z:0},size:{x:2.2,y:.8,z:2.2},yaw:0,color:'#548e99'}]};
}
export function appearanceName(a?:BuildingAppearance):string {return a?.source==='creation'?`${a.creation.name} · revize ${a.creation.revision}`:'Výchozí vzhled';}
