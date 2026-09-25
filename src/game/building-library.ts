import type { LibraryStorage } from './creature-library';
import { validateBuildingCreation, type BuildingCreation, type BuildingDesign } from './building-design';
export const BUILDING_FILE_LIMIT=128*1024,BUILDING_LIBRARY_LIMIT=100,BUILDING_STORAGE_PREFIX='lumavora:building:';
const fail=(message:string):never=>{throw new Error(message);};
export function parseBuildingCreation(text:string):BuildingCreation {
  if(new TextEncoder().encode(text).length>BUILDING_FILE_LIMIT)fail('Soubor budovy je příliš velký (128 KiB).');
  let v:unknown;try{v=JSON.parse(text);}catch{return fail('Soubor budovy není platný JSON.');}
  validateBuildingCreation(v);return structuredClone(v);
}
export function serializeBuildingCreation(v:BuildingCreation):string {
  validateBuildingCreation(v);const text=JSON.stringify(v,null,2);
  if(new TextEncoder().encode(text).length>BUILDING_FILE_LIMIT)fail('Návrh překračuje 128 KiB.');return text;
}
export function newBuildingCreation(design:BuildingDesign,name:string,id:string=crypto.randomUUID(),now=Date.now()):BuildingCreation {
  const v:BuildingCreation={format:'lumavora-building',version:1,id,revision:1,createdAt:now,updatedAt:now,name,design:structuredClone(design)};
  validateBuildingCreation(v);return v;
}
export function readBuildingLibrary(storage:LibraryStorage) {
  const entries:BuildingCreation[]=[],problems:string[]=[];
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(BUILDING_STORAGE_PREFIX))continue;
    try{const v=parseBuildingCreation(storage.getItem(key)??'');if(key!==BUILDING_STORAGE_PREFIX+v.id)fail('Identita záznamu nesouhlasí.');entries.push(v);}catch{problems.push('Poškozený místní návrh byl ponechán beze změny.');}}
  return {entries:entries.sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id)),problems};
}
function capacity(s:LibraryStorage) {let n=0;for(let i=0;i<s.length;i++)if(s.key(i)?.startsWith(BUILDING_STORAGE_PREFIX))n++;if(n>=BUILDING_LIBRARY_LIMIT)fail('Knihovna je plná (100 budov). Exportuj a odstraň některý návrh.');}
function current(s:LibraryStorage,v:BuildingCreation) {const raw=s.getItem(BUILDING_STORAGE_PREFIX+v.id);if(raw===null||JSON.stringify(parseBuildingCreation(raw))!==JSON.stringify(v))fail('Návrh se mezitím změnil nebo byl odstraněn. Otevři aktuální revizi.');}
function write(s:LibraryStorage,v:BuildingCreation) {const text=serializeBuildingCreation(v);try{s.setItem(BUILDING_STORAGE_PREFIX+v.id,text);}catch{fail('Návrh se nepodařilo uložit. Úložiště je plné nebo nedostupné; původní záznam zůstal zachován.');}}
export function saveBuildingCreation(s:LibraryStorage,design:BuildingDesign,name:string,original?:BuildingCreation) {
  let v:BuildingCreation;
  if(original){current(s,original);v={...original,name,design:structuredClone(design),revision:original.revision+1,updatedAt:Math.max(original.updatedAt,Date.now())};}
  else{capacity(s);v=newBuildingCreation(design,name);if(s.getItem(BUILDING_STORAGE_PREFIX+v.id)!==null)fail('Kolize identity návrhu.');}
  write(s,v);return v;
}
export function importBuildingCreation(s:LibraryStorage,text:string,makeId:()=>string=()=>crypto.randomUUID()) {
  const v=parseBuildingCreation(text),raw=s.getItem(BUILDING_STORAGE_PREFIX+v.id);
  if(raw!==null){try{if(JSON.stringify(parseBuildingCreation(raw))===JSON.stringify(v))return {creation:v,duplicate:true};}catch{/* Preserve corrupt data. */}
    v.id=makeId();if(s.getItem(BUILDING_STORAGE_PREFIX+v.id)!==null)fail('Kolize identity importu.');}
  capacity(s);write(s,v);return {creation:v,duplicate:false};
}
export function deleteBuildingCreation(s:LibraryStorage,v:BuildingCreation) {current(s,v);try{s.removeItem(BUILDING_STORAGE_PREFIX+v.id);}catch{fail('Návrh nelze odstranit: úložiště je nedostupné.');}}
