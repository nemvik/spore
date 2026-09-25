import type { Genome, Part } from './types';
import { MACHINE_COPY as C } from './machine-copy.cs';

export type Carrier='tank'|'air';
export type VehiclePartId='hull'|'cabin'|'tracks'|'rotor'|'drill'|'seeder'|'cannon'|'broadcast'|'armor';
export type VehicleCategory='structure'|'drive'|'module'|'armor';
export interface VehiclePart extends Omit<Part,'kind'|'limb'> {kind:VehiclePartId;}
export interface VehicleBlueprint {version:1;kind:'vehicle';carrier:Carrier;name:string;length:number;width:number;hue:number;pattern:number;parts:VehiclePart[];}
export type SeaPartId='hull'|'cabin'|'propeller';
export interface SeaPart extends Omit<VehiclePart,'kind'> {kind:SeaPartId;}
export interface SeaBlueprint extends Omit<VehicleBlueprint,'version'|'carrier'|'parts'> {version:2;carrier:'boat';parts:SeaPart[];}
export type VehicleConstruction=VehicleBlueprint|SeaBlueprint;
export type OrganismBlueprint=Genome&{kind:'organism'};
export type Blueprint=OrganismBlueprint|VehicleBlueprint;
export type BlueprintPart=Part|VehiclePart;
export interface VehiclePartSpec {id:VehiclePartId;category:VehicleCategory;cost:number;mass:number;durability:number;power:number;max:number;carriers:readonly Carrier[];name:string;description:string;tradeoff:string;}
const part=(id:VehiclePartId,category:VehicleCategory,cost:number,mass:number,durability:number,power:number,max=1,carriers:readonly Carrier[]=['tank','air']):VehiclePartSpec=>({id,category,cost,mass,durability,power,max,carriers,...C.parts[id]});
export const VEHICLE_PARTS:readonly VehiclePartSpec[]=[
  part('hull','structure',16,8,55,0),part('cabin','structure',8,2,15,0),
  part('tracks','drive',12,4,12,0,1,['tank']),part('rotor','drive',18,2,8,0,1,['air']),
  part('drill','module',16,4,5,7,1,['tank']),part('seeder','module',14,2,3,6,1,['air']),
  part('cannon','module',20,5,6,11),part('broadcast','module',14,2,3,6),part('armor','armor',10,4,35,0,3),
];
export interface SeaPartSpec extends Omit<VehiclePartSpec,'id'|'carriers'> {id:SeaPartId;carriers:readonly ['boat'];}
/** Separate catalogue keeps the historical v1 editor and saved-design validator unchanged. */
export const SEA_PARTS:readonly SeaPartSpec[]=[
  ...VEHICLE_PARTS.filter(p=>p.id==='hull'||p.id==='cabin').map(p=>({...p,id:p.id as SeaPartId,carriers:['boat'] as const})),
  {id:'propeller',category:'drive',cost:32,mass:3,durability:10,power:0,max:1,carriers:['boat'],...C.parts.propeller},
];
export function vehiclePart(id:VehiclePartId):VehiclePartSpec;
export function vehiclePart(id:VehiclePartId|SeaPartId):VehiclePartSpec|SeaPartSpec;
export function vehiclePart(id:VehiclePartId|SeaPartId):VehiclePartSpec|SeaPartSpec {return VEHICLE_PARTS.find(p=>p.id===id)??SEA_PARTS.find(p=>p.id===id)!;}
/** First paid maritime construction is fixed; it is not an editor or library entry. */
export function seaBlueprint():SeaBlueprint {
  return {version:2,kind:'vehicle',carrier:'boat',name:'Expediční člun',length:1,width:1,hue:40,pattern:0,parts:[
    {id:'sea-hull',kind:'hull',axial:0,angle:0,scale:1,mirrored:false},
    {id:'sea-cabin',kind:'cabin',axial:.2,angle:0,scale:1,mirrored:false},
    {id:'sea-propeller',kind:'propeller',axial:-1,angle:Math.PI,scale:1,mirrored:false},
  ]};
}
export const fromGenome=(genome:Genome):OrganismBlueprint=>({...structuredClone(genome),kind:'organism'});
/** Preserve the exact genome discriminant and every nested body field. */
export const toGenome = (g: OrganismBlueprint): Genome => {
  if (g.version === 2) return structuredClone({
    version: g.version, name: g.name, length: g.length, width: g.width, hue: g.hue,
    pattern: g.pattern, parts: g.parts, body: g.body,
  });
  return structuredClone({
    version: g.version, name: g.name, length: g.length, width: g.width, hue: g.hue,
    pattern: g.pattern, parts: g.parts, ...(g.spine ? { spine: g.spine } : {}),
  });
};
export const cloneBlueprint=<T extends Blueprint>(g:T):T=>structuredClone(g);
export function initialVehicle(carrier:Carrier,archetype:'restoration'|'predator'|'migration'):VehicleBlueprint {
  const module:VehiclePartId=archetype==='predator'?'cannon':archetype==='migration'?'broadcast':carrier==='tank'?'drill':'seeder';
  const ids:VehiclePartId[]=['hull','cabin',carrier==='tank'?'tracks':'rotor',module];
  return {version:1,kind:'vehicle',carrier,name:carrier==='tank'?'První pozemní stroj':'První létající stroj',length:1,width:1,hue:40,pattern:0,
    parts:ids.map((kind,i)=>({id:`vehicle-${kind}`,kind,axial:kind==='cabin'?.35:kind===module?.75:0,angle:kind==='tracks'?Math.PI:0,scale:1,mirrored:false}))};
}
export function vehicleStats(g:VehicleConstruction){
  let mass=Math.abs(g.length*g.width)*2,durability=0,power=0;let module:VehiclePartId|null=null;
  for(const p of g.parts){const spec=vehiclePart(p.kind);if(!spec)continue;const factor=p.scale*(p.mirrored?1.6:1);mass+=spec.mass*factor;durability+=spec.durability*factor;if(spec.category==='module'&&p.kind!=='propeller'){module=p.kind;power+=spec.power*factor;}}
  durability*=.7+.3*g.length*g.width;
  const capacity=g.carrier==='tank'?48:24,drive=g.parts.find(p=>p.kind===(g.carrier==='tank'?'tracks':g.carrier==='boat'?'propeller':'rotor'));
  const speed=drive?Math.max(1.5,(g.carrier==='tank'?5.2:g.carrier==='boat'?6:10.5)*drive.scale/(.6+mass/32)):0;
  return {mass,durability:Math.round(durability),power,speed,capacity,module};
}
export function vehicleCost(g:VehicleConstruction):number {
  return Math.ceil(g.parts.reduce((sum,p)=>sum+(vehiclePart(p.kind)?.cost??0)*p.scale*(p.mirrored?1.6:1),0)+Math.abs(g.length-1)*16+Math.abs(g.width-1)*12-1e-8);
}
function exact(value:unknown,keys:readonly string[]):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));}
const finite=(n:unknown,min:number,max:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
/** v2 currently admits exactly the first construction, including attachment identities. */
export function validateSeaBlueprint(value:unknown):string[]{
  const expected=seaBlueprint();
  if(!exact(value,Object.keys(expected)))return [C.shape];
  for(const key of ['version','kind','carrier','name','length','width','hue','pattern'] as const)if(value[key]!==expected[key])return [C.seaConstruction];
  if(!Array.isArray(value.parts)||value.parts.length!==expected.parts.length)return [C.attachments];
  for(let i=0;i<expected.parts.length;i++){
    const p=value.parts[i],canonical=expected.parts[i];
    if(!exact(p,Object.keys(canonical))||Object.keys(canonical).some(key=>p[key]!==canonical[key as keyof SeaPart]))return [C.attachments];
  }
  return [];
}
/** Validates saved designs without depending on current funds or unlock UI. */
export function validateVehicle(value:unknown):string[]{
  if(!exact(value,['version','kind','carrier','name','length','width','hue','pattern','parts'])||value.version!==1||value.kind!=='vehicle'||!['tank','air'].includes(value.carrier as string))return [C.shape];
  const errors:string[]=[];
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>32||/[\u0000-\u001f\u007f]/.test(value.name))errors.push(C.name);
  if(!finite(value.length,.65,2.4)||!finite(value.width,.55,1.8)||!finite(value.hue,0,360)||!finite(value.pattern,0,3)||!Number.isInteger(value.pattern))errors.push(C.dimensions);
  if(!Array.isArray(value.parts)||value.parts.length>12)return [...errors,C.attachments];
  const ids=new Set<string>();
  for(const p of value.parts){
    if(!exact(p,['id','kind','axial','angle','scale','mirrored'])||typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(p.id)||ids.has(p.id)||!VEHICLE_PARTS.some(s=>s.id===p.kind)||!finite(p.axial,-1,1)||!finite(p.angle,-Math.PI,Math.PI)||!finite(p.scale,.55,1.65)||typeof p.mirrored!=='boolean')return [...errors,C.attachments];
    ids.add(p.id);
  }
  const g=value as unknown as VehicleBlueprint,count=(kind:VehiclePartId)=>g.parts.filter(p=>p.kind===kind).length;
  if(count('hull')!==1)errors.push(C.hull);if(count('cabin')!==1)errors.push(C.cabin);
  if(count(g.carrier==='tank'?'tracks':'rotor')!==1)errors.push(C.drive);
  if(g.parts.filter(p=>vehiclePart(p.kind).category==='module').length!==1)errors.push(C.module);
  if(g.parts.some(p=>!vehiclePart(p.kind).carriers.includes(g.carrier)||count(p.kind)>vehiclePart(p.kind).max||p.mirrored&&['hull','cabin'].includes(p.kind)))errors.push(C.carrier);
  if(!errors.length&&vehicleStats(g).mass>vehicleStats(g).capacity)errors.push(C.overweight);
  return [...new Set(errors)];
}
export function quoteVehicle(value:unknown,available:number,airUnlocked:boolean){
  const errors=validateVehicle(value),validBudget=finite(available,0,1_000_000_000);
  if(!validBudget)errors.push(C.badBudget);
  if(errors.length)return {ok:false,errors,cost:0,available:validBudget?available:0,remaining:validBudget?available:0};
  const g=value as VehicleBlueprint;
  if(g.carrier==='air'&&airUnlocked!==true)errors.push(C.locked);
  const cost=vehicleCost(g);if(cost>available)errors.push(C.notEnough);
  return {ok:errors.length===0,errors,cost,available,remaining:available-cost};
}
