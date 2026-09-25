import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { CITY_BUILDINGS, applyCityOrder, cityEconomyPreview, type CityBuildingKind, type CityOrder } from '../src/game/city-economy';
import { buildingPartCorners, defaultBuildingAppearance, initialBuildingDesign, validateBuildingDesign, validateBuildingCreation, type BuildingAppearance, type BuildingCreation } from '../src/game/building-design';
import { BUILDING_STORAGE_PREFIX, readBuildingLibrary, newBuildingCreation, saveBuildingCreation, importBuildingCreation, deleteBuildingCreation, parseBuildingCreation, serializeBuildingCreation } from '../src/game/building-library';
import { BuildingEdit } from '../src/ui/buildings';
import { createBuilding } from '../src/render/building';
import { disposeObject } from '../src/render/organism';
import { enableCities, cityAt, enterCity } from '../src/game/cities';
import { CITY_LOTS, buildingSite, cityPositionClear, cityLot } from '../src/game/city-spatial';
import { parseGame, serializeGame, saveGame, loadGame } from '../src/game/persistence';
import { activeField, returnHome, openAtlas } from '../src/game/planet-travel';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
const bytes=readFileSync('tests/fixtures/geography/sp-009b-economy.save.json','utf8');
const base=()=>{const s=parseGame(bytes);enableCities(s);return s;};
const creation=(kind:CityBuildingKind='house')=>newBuildingCreation(initialBuildingDesign(kind),'Věž','tower',1);
const appearance=(kind:CityBuildingKind='house'):BuildingAppearance=>({version:1,source:'creation',creation:creation(kind)});
const round=(s:GameState)=>parseGame(serializeGame(s));
const order=(s:GameState,o:CityOrder,rev=cityAt(s)!.economy!.revision)=>applyCityOrder(s,cityAt(s)!.id,o,rev);
function storage(){const m=new Map<string,string>();return {get length(){return m.size;},key:(i:number)=>[...m.keys()][i]??null,getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v);},removeItem:(k:string)=>{m.delete(k);}};}
const original=(s:GameState)=>({stage:s.stage,tick:s.tick,rng:s.rng,player:s.player,worlds:s.worlds,journey:s.journey,tribe:s.tribe,machines:s.machines,planet:s.planet,lineageHistory:s.lineageHistory});

describe('SP-009.C strict designs and library',()=>{
  it.each(Object.keys(CITY_BUILDINGS) as CityBuildingKind[])('validates and renders %s from exactly the shared part dimensions within the B footprint',kind=>{
    const c=creation(kind);validateBuildingCreation(c);const model=createBuilding(kind,{version:1,source:'creation',creation:c});model.updateMatrixWorld(true);
    for(const p of c.design.parts){const mesh=model.children.find(v=>v.userData.buildingPart===p.id)!;const box=new THREE.Box3().setFromObject(mesh);expect(box.min.y).toBeGreaterThanOrEqual(.7-1e-6);expect(box.max.y).toBeLessThanOrEqual(7);expect(box.min.x).toBeGreaterThanOrEqual(-CITY_BUILDINGS[kind].radius);expect(box.max.z).toBeLessThanOrEqual(CITY_BUILDINGS[kind].radius-.55+1e-6);}
    model.traverse(node=>{if(!(node instanceof THREE.Mesh))return;const vertices=node.geometry.attributes.position;for(let i=0;i<vertices.count;i++){const p=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(node.matrixWorld);expect(Math.hypot(p.x,p.z)).toBeLessThanOrEqual(CITY_BUILDINGS[kind].radius+1e-6);}});
    disposeObject(model);
  });
  const invalid:Array<(v:any)=>void>=[v=>v.version=2,v=>v.freePrice=0,v=>v.design.version=2,v=>v.id='../x',v=>v.revision=0,v=>v.revision=1.5,v=>v.updatedAt=-1,v=>v.name=' ',v=>v.design.kind='factory',v=>v.design.parts=[],v=>v.design.parts.push({...v.design.parts[0]}),v=>v.design.parts[0].shape='sphere',v=>v.design.parts[0].shape=['box'],v=>v.design.parts[0].shape=['cone'],v=>v.design.parts[0].position.x=Infinity,v=>v.design.parts[0].position.x=2,v=>v.design.parts[0].position.z=1,v=>v.design.parts[0].position.y=.6,v=>v.design.parts[0].size.y=6,v=>v.design.parts[0].size.x=-2,v=>v.design.parts[0].yaw=181,v=>v.design.parts[0].color='red',v=>v.design.parts[0].color='#FFFFFF',v=>v.design.parts[0].price=0,v=>v.design.parts[0].position.w=0,v=>v.design.parts=Array.from({length:25},(_,i)=>({...v.design.parts[0],id:'p'+i}))];
  it.each(invalid)('rejects invalid design/import %# atomically',mutate=>{const s=storage(),c:any=creation();saveBuildingCreation(s,c.design,c.name);const before=JSON.stringify(readBuildingLibrary(s));mutate(c);expect(()=>importBuildingCreation(s,JSON.stringify(c))).toThrow();expect(JSON.stringify(readBuildingLibrary(s))).toBe(before);});
  it('checks the rotated corners rather than centres or unrotated extents',()=>{const d=initialBuildingDesign('house');d.parts=[{...d.parts[0],shape:'box',size:{x:2.6,y:1,z:1},position:{x:0,y:1.2,z:.5},yaw:0}];validateBuildingDesign(d);d.parts[0].yaw=90;expect(()=>validateBuildingDesign(d)).toThrow(/pás|parcelu/);expect(buildingPartCorners(d.parts[0]).some(p=>p.z>1.45)).toBe(true);});
  it('edits geometry with detached undo/redo, rejects invalid changes, reconciles selection and cancellation leaves the source intact',()=>{
    const c=creation(),before=structuredClone(c),e=new BuildingEdit(c.design,c.name);e.change(v=>v.design.parts[0].size.y=1);e.change(v=>v.design.parts[0].yaw=30);expect(e.undo).toHaveLength(2);e.history(true);expect(e.value.design.parts[0].yaw).toBe(0);e.history(false);expect(e.value.design.parts[0].yaw).toBe(30);const current=structuredClone(e.value);expect(e.change(v=>v.design.parts[0].size.x=20)).toBe(false);expect(e.value).toEqual(current);expect(c).toEqual(before);
    e.selected='roof';e.change(v=>v.design.parts.pop());expect(e.selected).toBe('body');e.history(true);expect(e.value.design.parts).toHaveLength(2);
  });
  it('creates revisions, independent duplicates, matching no-op imports and forks conflicts without overwriting',()=>{
    const s=storage(),c=saveBuildingCreation(s,creation().design,'První'),text=serializeBuildingCreation(c);expect(importBuildingCreation(s,text).duplicate).toBe(true);expect(s.length).toBe(1);
    const d=structuredClone(c.design);d.parts[0].color='#123456';const revision=saveBuildingCreation(s,d,'Druhý',c);expect(revision.revision).toBe(2);expect(()=>saveBuildingCreation(s,d,'Zastaralý',c)).toThrow(/mezitím/);
    const fork=importBuildingCreation(s,text,()=>'fork');expect(fork.creation.id).toBe('fork');expect(fork.duplicate).toBe(false);expect(s.length).toBe(2);const dup=saveBuildingCreation(s,revision.design,'Kopie');expect(dup.revision).toBe(1);expect(dup.id).not.toBe(c.id);expect(()=>deleteBuildingCreation(s,c)).toThrow();deleteBuildingCreation(s,revision);expect(readBuildingLibrary(s).entries).toHaveLength(2);
  });
  it('preserves corrupted rows, quota failures and refuses overlarge/unknown files and identity collisions',()=>{
    const s=storage(),c=saveBuildingCreation(s,creation().design,'Platný'),saved=s.getItem(BUILDING_STORAGE_PREFIX+c.id);s.setItem(BUILDING_STORAGE_PREFIX+'broken','!');expect(readBuildingLibrary(s).problems).toHaveLength(1);expect(()=>parseBuildingCreation(' '.repeat(131073))).toThrow(/128/);expect(()=>parseBuildingCreation('{}')).toThrow();
    const quota={...s,setItem:()=>{throw new Error('quota');}};expect(()=>saveBuildingCreation(quota,c.design,'Změna',c)).toThrow(/úložiště/i);expect(s.getItem(BUILDING_STORAGE_PREFIX+c.id)).toBe(saved);
    const other={...c,name:'Jiné'};expect(()=>importBuildingCreation(s,serializeBuildingCreation(other),()=>c.id)).toThrow(/Kolize/);
  });
  it('caps the library at 100 while allowing an identical import and an existing revision',()=>{const s=storage();for(let i=0;i<100;i++)importBuildingCreation(s,serializeBuildingCreation({...creation(),id:'b'+i}));expect(()=>saveBuildingCreation(s,creation().design,'101')).toThrow(/100/);expect(importBuildingCreation(s,serializeBuildingCreation({...creation(),id:'b0'})).duplicate).toBe(true);const c=readBuildingLibrary(s).entries[0];expect(saveBuildingCreation(s,c.design,'Revize',c).revision).toBe(2);});
});

describe('SP-009.C paid instances, migration and snapshots',()=>{
  it('preserves the actual six-resident B export byte-identically; only declares default B models in live and checkpoint',()=>{
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('bb6520f3949acb30e7c33974169cab753b09d80ed5989d7797d0ac355688e71c');const s=parseGame(bytes),before=structuredClone(s);expect(s.cities!.version).toBe(2);expect(cityAt(s)!.economy!.residents).toHaveLength(6);enableCities(s);expect(s.cities!.version).toBe(3);expect(original(s)).toEqual(original(before));
    const migrated=structuredClone(s.cities!);migrated.version=2;for(const c of migrated.entries)if(c.economy){c.economy.version=1;for(const b of c.economy.buildings){expect(b.appearance).toEqual(defaultBuildingAppearance());delete b.appearance;}}expect(migrated).toEqual(before.cities);
    const cp=s.checkpoint;enableCities(s);expect(s.checkpoint).toBe(cp);expect(round(s).cities).toEqual(s.cities);
  });
  it.each(Object.keys(CITY_BUILDINGS) as CityBuildingKind[])('explicit appearance change for %s preserves economy, ownership, collisions and exactly replaces the snapshot once',kind=>{
    const s=base(),c=cityAt(s)!,e=c.economy!,b=e.buildings.find(b=>b.kind===kind)!,before=structuredClone(s),preview=cityEconomyPreview(c),rev=e.revision,a=appearance(kind);
    expect(order(s,{kind:'appearance',id:b.id,appearance:a})).toBe(true);expect(order(s,{kind:'appearance',id:b.id,appearance:defaultBuildingAppearance()},rev)).toBe(false);expect(order(s,{kind:'appearance',id:b.id,appearance:a})).toBe(false);
    expect(e).toEqual({...cityAt(before)!.economy!,revision:rev+1,buildings:cityAt(before)!.economy!.buildings.map(v=>v.id===b.id?{...v,appearance:a}:v)});expect(cityEconomyPreview(c)).toEqual(preview);expect(original(s)).toEqual(original(before));
    if(a.source==='creation')a.creation.design.parts[0].color='#123456';expect(b.appearance).not.toEqual(a);expect(round(s).cities).toEqual(s.cities);const p=cityLot(c,b.lot)!;expect(cityPositionClear(s,activeField(s)!,{...p,y:0})).toBe(false);
  });
  it('builds a chosen snapshot at the unchanged price once, checks context/kind and never refunds demolition',()=>{
    const s=base(),c=cityAt(s)!,e=c.economy!;s.machines!.resource+=80;for(let i=0;i<4;i++)order(s,{kind:'fund'});const lot=CITY_LOTS.find(l=>!buildingSite(s,c,l.id,'house'))!.id,rev=e.revision,m=e.treasury;
    expect(order(s,{kind:'build',building:'house',lot,appearance:appearance('garden')})).toBe(false);const a=appearance();const o:CityOrder={kind:'build',building:'house',lot,appearance:a};expect(order(s,o,rev)).toBe(true);expect(order(s,o,rev)).toBe(false);expect(e.treasury).toBe(m-20);expect(e.buildings.at(-1)!.appearance).toEqual(a);
    const id=e.buildings.at(-1)!.id;expect(order(s,{kind:'demolish',id})).toBe(true);expect(e.treasury).toBe(m-20);expect(()=>round(s)).not.toThrow();openAtlas(s);expect(order(s,{kind:'appearance',id:e.buildings[0].id,appearance:a})).toBe(false);
  });
  it('deleting or revising a library template cannot affect an installed city or imported campaign',()=>{
    const s=base(),lib=storage(),c=saveBuildingCreation(lib,creation().design,'Uložený'),b=cityAt(s)!.economy!.buildings.find(b=>b.kind==='house')!;order(s,{kind:'appearance',id:b.id,appearance:{version:1,source:'creation',creation:c}});const snapshot=structuredClone(b.appearance);
    const next=saveBuildingCreation(lib,c.design,'Revize',c);deleteBuildingCreation(lib,next);expect(b.appearance).toEqual(snapshot);expect(round(s).cities).toEqual(s.cities);
    makeCheckpoint(s);const houseId=b.id;order(s,{kind:'appearance',id:b.id,appearance:defaultBuildingAppearance()});const cp=round(recoverGeneration(round(s)));expect(cityAt(cp)!.economy!.buildings.find(v=>v.id===houseId)!.appearance).toEqual(snapshot);expect(round(recoverGeneration(cp)).cities).toEqual(cp.cities);
  });
  it('preserves snapshot and fractional local time through travel, rekey, checkpoint and storage',()=>{
    const s=base(),c=cityAt(s)!,b=c.economy!.buildings.find(b=>b.kind==='house')!;order(s,{kind:'appearance',id:b.id,appearance:appearance()});makeCheckpoint(s);const economic=structuredClone(c.economy);returnHome(s);for(let i=0;i<60;i++)step(s,EMPTY_INPUT);expect(c.economy).toEqual(economic);enterCity(s,c.id);openAtlas(s);for(let i=0;i<60;i++)step(s,EMPTY_INPUT);expect(c.economy).toEqual(economic);
    s.id='building-rekey';const cp=JSON.parse(s.checkpoint!);cp.id=s.id;s.checkpoint=JSON.stringify(cp);const r=round(s);enableCities(r);expect(r.cities).toEqual(s.cities);expect(round(recoverGeneration(r)).cities).toEqual(cp.cities);
    vi.stubGlobal('localStorage',storage());try{expect(saveGame(s).ok).toBe(true);expect(loadGame(s.id).cities).toEqual(s.cities);}finally{vi.unstubAllGlobals();}
  });
  it.each(['sp-010a-fresh.save.json','sp-010b-fresh.save.json','sp-010c-travel.save.json','sp-009a-city.save.json','sp-009b-economy.save.json'])('repeated migration/rekey/restore of historical %s never invents creations',file=>{
    const s=parseGame(readFileSync('tests/fixtures/geography/'+file,'utf8')),before=structuredClone(original(s));enableCities(s);expect(original(s)).toEqual(before);const cities=structuredClone(s.cities),checkpoint=s.checkpoint;enableCities(s);expect(s.checkpoint).toBe(checkpoint);s.id='historical-c';if(s.checkpoint){const cp=JSON.parse(s.checkpoint);cp.id=s.id;s.checkpoint=JSON.stringify(cp);}expect(round(s).cities).toEqual(cities);expect(()=>round(recoverGeneration(round(s)))).not.toThrow();for(const c of s.cities!.entries)for(const b of c.economy?.buildings??[])expect(b.appearance?.source).toBe('default');
  });
  it.each([(s:GameState)=>{delete cityAt(s)!.economy!.buildings[0].appearance;},(s:GameState)=>{cityAt(s)!.economy!.buildings[0].appearance={version:1,source:'default',model:'other'} as any;},(s:GameState)=>{cityAt(s)!.economy!.buildings[0].appearance=appearance('park');},(s:GameState)=>{cityAt(s)!.economy!.version=1;},(s:GameState)=>{const c=JSON.parse(s.checkpoint!);c.cities.version=2;s.checkpoint=JSON.stringify(c);},(s:GameState)=>{cityAt(s)!.economy!.buildings[0].appearance=appearance();}])('rejects damaged snapshot or same-revision checkpoint divergence %#',mutate=>{const s=base();makeCheckpoint(s);mutate(s);expect(()=>round(s)).toThrow();});
});
