import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { cityAt, cityId, enableCities, foundCity, foundingAvailability, citySite, selectCity, enterCity, CITY_COST } from '../src/game/cities';
import { cityHall, cityPositionClear, fieldDecorations, CITY_SQUARE_RADIUS } from '../src/game/city-spatial';
import { locationAddress, resolveLocationAddress } from '../src/game/home-planet';
import { planetAtlas, geographicAddress, localAddress } from '../src/game/planet-geography';
import { activeField, navigation, enterField, returnHome, openAtlas, fieldGround, enablePlanetTravel } from '../src/game/planet-travel';
import { parseGame, serializeGame, saveGame, loadGame } from '../src/game/persistence';
import { createGame, step, makeCheckpoint, recoverGeneration, continueToMachinesEra, continueToPlanetEra, tryTransition, evolve } from '../src/game/simulation';
import { enableLineageHistory, tribeInheritance } from '../src/game/lineage-history';
import { EMPTY_INPUT, type GameState, type Vec3 } from '../src/game/types';
import { cityPanel, cityAtlasList } from '../src/ui/cities';
const fixture=(file:string)=>parseGame(readFileSync(`tests/fixtures/saves/${file}`,'utf8'));
const raw=(s:GameState)=>JSON.stringify({format:'lumavora',version:3,savedAt:1,state:s});
const round=(s:GameState)=>parseGame(serializeGame(s));
const base=()=>{const s=fixture('machines-restoration-final.save.json');enableCities(s);return s;};
const target=(s:GameState)=>planetAtlas(s.homePlanet!)!.cells.find(c=>c.biome==='grassland'&&!planetAtlas(s.homePlanet!)!.anchors.some(a=>a.cellId===c.id))!;
const ground=(s:GameState,x:number,z:number)=>({x,y:fieldGround(s.seed,planetAtlas(s.homePlanet!)!.cells[activeField(s)!.cellId],x,z),z});
function suitable(s:GameState):Vec3 {
  for(let z=-58;z<=58;z+=4)for(let x=-58;x<=58;x+=4){const p=ground(s,x,z);if(citySite(s,locationAddress(s,p)!)===null)return p;}
  throw Error('No valid city position');
}
function ready(s=base()){
  expect(enterField(s,target(s).id)).toBe(true);const f=activeField(s)!;
  // Unit-test preparation only. Native survey/founding is tested in the browser.
  f.world.patches.forEach((p,i)=>{p.discovered=true;f.world.landmarks[i+2].charge=1;});
  f.position=suitable(s);return s;
}
const original=(s:GameState)=>({worlds:s.worlds,player:s.player,stage:s.stage,tick:s.tick,rng:s.rng,campaign:s.campaign,journey:s.journey,tribe:s.tribe,machines:s.machines,planet:s.planet,lineage:s.lineage,history:s.lineageHistory});

describe('SP-009.A city identity, geography and atomic founding',()=>{
  it.each([0,1,42,481516,20260913,8675309,0xffffffff])('valid local/address integration and frozen generators seed %i',seed=>{
    const s=base();s.checkpoint=null;s.seed=seed;s.worlds.forEach(w=>{if(w)w.seed=seed;});if(s.homePlanet!.version!==1)s.homePlanet!.geography.seed=seed;
    ready(s);const f=activeField(s)!,w=structuredClone(f.world),before=structuredClone(original(s));
    expect(foundCity(s,'První město')).toBe(true);const c=cityAt(s)!;
    expect(c.id).toBe(cityId(f.id));expect(c.owner.id).toBe(s.homePlanet!.id);expect(c.founded.paidAmber).toBe(60);
    expect(resolveLocationAddress(s,c.address)!.world).toBe(f.world);
    const back=localAddress(s,geographicAddress(s,c.address)!,f.id)!;
    expect(back.position.x).toBeCloseTo(c.address.position.x,7);expect(back.position.z).toBeCloseTo(c.address.position.z,7);
    expect(f.world).toEqual(w);before.machines!.resource-=CITY_COST;expect(original(s)).toEqual(before);
    expect(round(s).cities).toEqual(s.cities);expect(foundCity(s,'Duplicate')).toBe(false);expect(original(s)).toEqual(before);
  });
  it('requires real progression, a captured amber source, surveys, funds and a local living player',()=>{
    for(const file of ['legacy-initial.fixture.json','earned-reef-entry-v14.json','won-current-coast.fixture.json','alliance-completed.save.json']){const s=fixture(file);enableCities(s);expect(foundCity(s,'Early')).toBe(false);expect(s.cities!.entries).toEqual([]);}
    const s=fixture('alliance-completed.save.json');enableCities(s);expect(continueToMachinesEra(s)).toBe(true);expect(foundingAvailability(s).reason).toMatch(/pramen/);
    const r=ready(),m=r.machines!;m.resource=59;expect(foundCity(r,'Poor')).toBe(false);expect(m.resource).toBe(59);m.resource=60;
    activeField(r)!.world.patches[0].discovered=false;expect(foundCity(r,'Unsurveyed')).toBe(false);activeField(r)!.world.patches[0].discovered=true;
    openAtlas(r);expect(foundCity(r,'Global')).toBe(false);navigation(r)!.mode='local';r.player.health=0;expect(foundCity(r,'Dead')).toBe(false);r.player.health=20;
    for(const name of ['', ' ', 'a'.repeat(41),'a\nb'])expect(foundCity(r,name)).toBe(false);
    expect(m.resource).toBe(60);expect(foundCity(r,'  Přístav světla  ')).toBe(true);expect(cityAt(r)!.name).toBe('Přístav světla');expect(m.resource).toBe(0);
  });
  it('rejects invalid addresses, sea/habitat, all boundaries, occupied landmarks, relief and visible obstacles',()=>{
    const s=ready(),f=activeField(s)!;
    expect(citySite(s,{...locationAddress(s,f.position)!,planetId:'other'})).toBeTruthy();
    expect(citySite(s,locationAddress(s,{x:0,y:0,z:0},s.homePlanet!.locations[0].id)!)).toBeTruthy();
    for(const [x,z] of [[61,0],[-61,0],[0,61],[0,-61],[78,78]])expect(citySite(s,locationAddress(s,ground(s,x,z))!)).toMatch(/hranice/);
    expect(citySite(s,locationAddress(s,{...f.position,y:f.position.y+1})!)).toMatch(/povrchu/);
    for(const p of f.world.landmarks)expect(citySite(s,locationAddress(s,p.pos)!)).toBeTruthy();
    const p={...f.position};f.world.obstacles.push({id:1,kind:'rock',pos:p,radius:2,height:4});expect(citySite(s,locationAddress(s,p)!)).toMatch(/koliduje/);f.world.obstacles=[];
    const atlas=planetAtlas(s.homePlanet!)!,mountain=atlas.cells.find(c=>c.biome==='mountain')!;enterField(s,mountain.id);
    let rejected=0;for(let x=-60;x<=60;x+=12)for(let z=-60;z<=60;z+=12)if(/strmý|členitý/.test(citySite(s,locationAddress(s,ground(s,x,z))!)??''))rejected++;
    expect(rejected).toBeGreaterThan(0);
  });
  it('reserves the entire visible square, including decorations outside the body radius',()=>{
    const s=ready(),f=activeField(s)!,cell=planetAtlas(s.homePlanet!)!.cells[f.cellId];
    const p=ground(s,22,-58);expect(citySite(s,locationAddress(s,p)!)).toMatch(/skálu|vegetaci/);
    for(let x=-58;x<=58;x+=4)for(let z=-58;z<=58;z+=4){const q=ground(s,x,z);if(!citySite(s,locationAddress(s,q)!))expect(fieldDecorations(f,cell).every(d=>Math.hypot(q.x-d.x,q.z-d.z)>=CITY_SQUARE_RADIUS+d.radius+1)).toBe(true);}
  });
  it('solid hall collision, safe preserved arrival, inactive city and original player/units stay frozen',()=>{
    const s=ready();expect(foundCity(s,'Stálé město')).toBe(true);const c=cityAt(s)!,f=activeField(s)!,hall=cityHall(c.address.position),before=structuredClone(original(s)),cities=structuredClone(s.cities);
    const start={...f.position};for(let i=0;i<180;i++)step(s,{...EMPTY_INPUT,x:1});
    expect(f.position.x).toBeLessThan(hall.x-hall.radius);expect(f.position.x).toBeGreaterThan(start.x);expect(cityPositionClear(s,f,f.position)).toBe(true);
    const pos={...f.position};openAtlas(s);for(let i=0;i<120;i++)step(s,EMPTY_INPUT);expect(original(s)).toEqual(before);
    returnHome(s);expect(selectCity(s,c.id)).toBe(true);expect(activeField(s)).toBeNull();expect(s.stage).toBe(4);
    expect(enterCity(s,c.id)).toBe(true);expect(f.position).toEqual(pos);expect(tryTransition(s)).toBe(false);expect(continueToPlanetEra(s)).toBe(false);expect(evolve(s,s.player.genome).ok).toBe(false);
    const time=f.world.time;const other=planetAtlas(s.homePlanet!)!.cells.find(v=>v.biome==='desert')!;enterField(s,other.id);for(let i=0;i<600;i++)step(s,EMPTY_INPUT);
    expect(f.world.time).toBe(time);expect(original(s)).toEqual(before);expect(s.cities).toEqual(cities);expect(round(s).cities).toEqual(cities);
  });
  it('distinct cities retain separate addresses, paid state and scenes across selection/import',()=>{
    const s=ready();expect(foundCity(s,'První')).toBe(true);const first=cityAt(s)!,firstWorld=activeField(s)!.world,firstTime=firstWorld.time;
    const second=planetAtlas(s.homePlanet!)!.cells.find(c=>c.biome==='grassland'&&c.id!==target(s).id&&!planetAtlas(s.homePlanet!)!.anchors.some(a=>a.cellId===c.id))!;
    enterField(s,second.id);const f=activeField(s)!;f.world.patches.forEach((p,i)=>{p.discovered=true;f.world.landmarks[i+2].charge=1;});f.position=suitable(s);
    const money=s.machines!.resource;expect(foundCity(s,'Druhé')).toBe(true);const next=cityAt(s)!;expect(next.id).not.toBe(first.id);expect(s.machines!.resource).toBe(money-60);
    for(let i=0;i<120;i++)step(s,EMPTY_INPUT);expect(firstWorld.time).toBe(firstTime);
    const r=round(s);for(const c of [first,next,first,next]){expect(selectCity(r,c.id)).toBe(true);expect(enterCity(r,c.id)).toBe(true);expect(cityAt(r)).toEqual(c);expect(foundCity(r,'Duplikát')).toBe(false);}
    expect(r.cities!.entries).toHaveLength(2);expect(r.machines!.resource).toBe(money-60);expect(()=>round(r)).not.toThrow();
  });
  it('real registry supplies selection; missing/duplicate choices never create ownership',()=>{
    const s=ready();foundCity(s,'<Záře & město>');const c=cityAt(s)!;returnHome(s);expect(selectCity(s,c.id)).toBe(true);
    expect(navigation(s)!.selectedCell).toBe(target(s).id);expect(navigation(s)!.camera.zoom).toBe(4);
    expect(selectCity(s,'unknown')).toBe(false);expect(enterCity(s,'unknown')).toBe(false);
    expect(cityAtlasList(s)).toContain('&lt;Záře &amp; město&gt;');expect(cityPanel(s)).not.toContain('<Záře & město>');
    s.cities!.entries.push(c);expect(selectCity(s,c.id)).toBe(false);
  });
});

describe('SP-009.A persistence and rollback',()=>{
  it.each(['home','global','field','field-global'])('save/load, rekey, checkpoint and revisits from %s',mode=>{
    const s=ready();foundCity(s,'Uložené město');const c=cityAt(s)!;
    if(!mode.startsWith('field'))returnHome(s);if(mode.includes('global'))openAtlas(s);
    makeCheckpoint(s);const baseline=round(s),expected=structuredClone(s.cities),money=s.machines!.resource;
    const store=new Map<string,string>();vi.stubGlobal('localStorage',{setItem:(k:string,v:string)=>store.set(k,v),getItem:(k:string)=>store.get(k)??null});
    try {expect(saveGame(s).ok).toBe(true);expect(loadGame(s.id).cities).toEqual(expected);}finally{vi.unstubAllGlobals();}
    s.id='imported-city-slot';const cp=JSON.parse(s.checkpoint!);cp.id=s.id;s.checkpoint=JSON.stringify(cp);
    const imported=round(s);enableCities(imported);expect(imported.cities).toEqual(expected);expect(imported.machines!.resource).toBe(money);
    const restored=recoverGeneration(imported);expect(restored.cities).toEqual(expected);expect(restored.machines!.resource).toBe(money);expect(restored.homePlanet).toEqual(baseline.homePlanet);
    expect(enterCity(restored,c.id)).toBe(true);expect(foundCity(restored,'Again')).toBe(false);expect(restored.machines!.resource).toBe(money);expect(()=>round(restored)).not.toThrow();
  });
  it('checkpoint before payment replaces the whole branch; subsequent founding pays once again',()=>{
    const s=ready();makeCheckpoint(s);const money=s.machines!.resource;foundCity(s,'Větev A');
    const r=recoverGeneration(round(s));expect(r.cities!.entries).toEqual([]);expect(r.machines!.resource).toBe(money);
    expect(foundCity(r,'Větev B')).toBe(true);expect(r.machines!.resource).toBe(money-60);makeCheckpoint(r);
    expect(recoverGeneration(round(r)).machines!.resource).toBe(money-60);expect(recoverGeneration(round(r)).cities!.entries).toHaveLength(1);
  });
  it('no-checkpoint fallback creates a new line without cities or grants',()=>{
    const s=ready();foundCity(s,'Lost');s.checkpoint=null;const r=recoverGeneration(s);expect(r.stage).toBe(0);expect(r.cities!.entries).toEqual([]);expect(r.machines).toBeUndefined();expect(()=>round(r)).not.toThrow();
  });
  it('city survives normal machines → terraform progression without becoming local terraform',()=>{
    const s=ready();foundCity(s,'Trvalé');const c=structuredClone(s.cities);returnHome(s);expect(continueToPlanetEra(s)).toBe(true);expect(s.cities).toEqual(c);expect(s.planet?.version).toBe(2);expect(()=>round(s)).not.toThrow();
  });
  it.each([
    (s:GameState)=>{s.cities!.version=4 as 1;},
    (s:GameState)=>{s.cities!.selectedId='missing';},
    (s:GameState)=>{s.cities!.entries.push(s.cities!.entries[0]);},
    (s:GameState)=>{cityAt(s)!.owner.id=s.id;},
    (s:GameState)=>{cityAt(s)!.id='false';},
    (s:GameState)=>{cityAt(s)!.address.locationId='unknown';},
    (s:GameState)=>{cityAt(s)!.address.position.x=78;},
    (s:GameState)=>{cityAt(s)!.address.position.y+=1;},
    (s:GameState)=>{cityAt(s)!.founded.paidAmber=0 as 60;},
    (s:GameState)=>{cityAt(s)!.founded.springId=999;},
    (s:GameState)=>{cityAt(s)!.founded.tick=s.tick+1;},
    (s:GameState)=>{cityAt(s)!.local.version=2 as 1;},
    (s:GameState)=>{cityAt(s)!.name='bad\nname';},
    (s:GameState)=>{(cityAt(s)!.local as unknown as Record<string,unknown>).income=9;},
    (s:GameState)=>{const cp=JSON.parse(s.checkpoint!);delete cp.cities;s.checkpoint=JSON.stringify(cp);},
    (s:GameState)=>{const cp=JSON.parse(s.checkpoint!);cp.cities.entries[0].name='Changed';s.checkpoint=JSON.stringify(cp);},
    (s:GameState)=>{const h=cityHall(cityAt(s)!.address.position);activeField(s)!.position=ground(s,h.x,h.z);},
  ])('rejects malformed or inconsistent city state %#',mutate=>{
    const s=ready();foundCity(s,'Valid');makeCheckpoint(s);mutate(s);expect(()=>parseGame(raw(s))).toThrow();
  });
});

const manifest=JSON.parse(readFileSync('tests/fixtures/saves/manifest.json','utf8')).files as {file:string;sha256:string}[];
describe('SP-009.A historical campaigns',()=>{
  it.each(manifest)('preserves $file, all systems and B1 after repeated migration',entry=>{
    const text=readFileSync(`tests/fixtures/saves/${entry.file}`,'utf8');expect(createHash('sha256').update(text).digest('hex')).toBe(entry.sha256);
    const a=parseGame(text),b=parseGame(text);enablePlanetTravel(a);enableLineageHistory(a);enableLineageHistory(b);enableCities(b);
    expect(b.cities!.entries).toEqual([]);const cp=b.checkpoint;enableCities(b);enableCities(b);expect(b.checkpoint).toBe(cp);
    expect(original(a)).toEqual(original(b));expect(tribeInheritance(b)).toEqual(tribeInheritance(a));
    for(let i=0;i<120;i++){step(a,EMPTY_INPUT);step(b,EMPTY_INPUT);}expect(original(b)).toEqual(original(a));
    const home=structuredClone(b.homePlanet);b.id='historical-import';if(b.checkpoint){const old=JSON.parse(b.checkpoint);old.id=b.id;b.checkpoint=JSON.stringify(old);}
    const imported=round(b);enableCities(imported);expect(imported.homePlanet).toEqual(home);expect(imported.cities!.entries).toEqual([]);expect(recoverGeneration(round(imported)).cities!.entries).toEqual([]);
  });
  it.each([
    ['sp-010a-fresh.save.json','d1ab026239c80e0843e379984056c2b9e0b963069051a111cb27b207f5dc8ece'],
    ['sp-010b-fresh.save.json','690c9453718f6275883b11f34315d593099bcd42116c82d91217bcecb9d2d7fd'],
    ['sp-010c-travel.save.json','d967d50991850aa312a1032ec58d8d1a406608dc85383851843b9267c660a84f'],
  ])('migrates actual %s without invented ownership or visits', (file,hash)=>{
    const text=readFileSync(`tests/fixtures/geography/${file}`,'utf8');expect(createHash('sha256').update(text).digest('hex')).toBe(hash);
    const s=parseGame(text);expect(s.cities).toBeUndefined();enablePlanetTravel(s);const before=structuredClone(s.homePlanet),originals=structuredClone(original(s));
    enableCities(s);expect(s.homePlanet).toEqual(before);expect(original(s)).toEqual(originals);expect(s.cities!.entries).toEqual([]);
    const cp=s.checkpoint;enableCities(s);expect(s.checkpoint).toBe(cp);s.id='geography-import';if(s.checkpoint){const old=JSON.parse(s.checkpoint);old.id=s.id;s.checkpoint=JSON.stringify(old);}
    const imported=round(s);enableCities(imported);expect(imported.homePlanet).toEqual(before);expect(imported.cities!.entries).toEqual([]);expect(()=>round(recoverGeneration(imported))).not.toThrow();
  });
});
