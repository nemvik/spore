import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { enablePlanetTravel, navigation, activeField, enterField, openAtlas, returnHome, surveyField, fieldGround, travelAvailability, campaignWorld, createField, selectAddress, fieldId } from '../src/game/planet-travel';
import { createGame, step, makeCheckpoint, recoverGeneration, tryTransition, continueToTribeEra, continueToMachinesEra, continueToPlanetEra, evolve } from '../src/game/simulation';
import { locationAddress, resolveLocationAddress } from '../src/game/home-planet';
import { planetAtlas, geographicAddress, localAddress, geographicCell, addressGeography } from '../src/game/planet-geography';
import { parseGame, serializeGame, saveGame, loadGame } from '../src/game/persistence';
import { enableLineageHistory, tribeInheritance } from '../src/game/lineage-history';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
const fixture = (name: string) => parseGame(readFileSync(`tests/fixtures/saves/${name}`, 'utf8'));
const base = () => { const s = fixture('alliance-completed.save.json'); enablePlanetTravel(s); enableLineageHistory(s); return s; };
const cells = (s: GameState) => planetAtlas(s.homePlanet!)!.cells.filter(c => c.surface === 'land' && !planetAtlas(s.homePlanet!)!.anchors.some(a => a.cellId === c.id));
const raw = (s: GameState) => JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s });
const round = (s: GameState) => parseGame(serializeGame(s));
const original = (s: GameState) => ({ worlds: s.worlds, player: s.player, stage: s.stage, tick: s.tick, rng: s.rng, campaign: s.campaign, journey: s.journey, tribe: s.tribe, machines: s.machines, planet: s.planet, lineage: s.lineage, history: s.lineageHistory });
const manifest = JSON.parse(readFileSync('tests/fixtures/saves/manifest.json','utf8')).files as {file:string;sha256:string}[];

describe('SP-010.C expedition state and geography', () => {
  it.each([0,1,42,481516,0xffffffff,81234,500,39393])('detail determinism/order, original RNG and biome linkage seed %i', seed => {
    const a = base(), b = base(); a.seed = b.seed = seed;
    for (const s of [a,b]) { if(s.homePlanet!.version!==1)s.homePlanet!.geography.seed=seed; }
    const targets = cells(a).filter((_,i)=>i%65===0).slice(0,8);
    for (const c of targets) expect(enterField(a,c.id)).toBe(true);
    for (const c of [...targets].reverse()) expect(enterField(b,c.id)).toBe(true);
    expect(navigation(a)!.fields.map(f=>f.id).sort()).toEqual(navigation(b)!.fields.map(f=>f.id).sort());
    for (const f of navigation(a)!.fields) {
      expect(f).toEqual(navigation(b)!.fields.find(g=>g.id===f.id));
      const c = planetAtlas(a.homePlanet!)!.cells[f.cellId];
      expect(c.surface).toBe('land');expect(c.elevationMeters+fieldGround(seed,c,0,0)).toBeGreaterThan(0);
      for (const x of [-78,0,78]) for (const z of [-78,0,78]) {
        const address=locationAddress(a,{x,y:fieldGround(seed,c,x,z),z},f.id)!;
        const global=geographicAddress(a,address)!;expect(geographicCell(planetAtlas(a.homePlanet!)!,global.point)!.id).toBe(c.id);
        const back=localAddress(a,global,f.id)!;expect(back.position.x).toBeCloseTo(x,7);expect(back.position.z).toBeCloseTo(z,7);
        expect(addressGeography(a,address)!.world).toBe(f.world);expect(addressGeography(a,address)!.groundAltitudeMeters).toBeGreaterThan(0);
      }
    }
    expect(a.rng).toBe(b.rng);expect(a.worlds).toEqual(b.worlds);
  });
  it('lazy visit, physical survey, return, revisit and repeated action preserve original systems', () => {
    const s=base();expect(navigation(s)!.fields).toHaveLength(0);expect(navigation(s)!.visits).toEqual([]);
    const before=structuredClone(original(s)), c=cells(s)[0];openAtlas(s);for(let i=0;i<120;i++)step(s,EMPTY_INPUT);
    expect(original(s)).toEqual(before);expect(enterField(s,c.id)).toBe(true);const f=activeField(s)!;
    expect(s.world).toBe(f.world);expect(s.worlds).toEqual(before.worlds);expect(surveyField(s)).toBe(false);
    for(let i=0;i<90;i++)step(s,{...EMPTY_INPUT,z:-1});expect(surveyField(s)).toBe(true);expect(surveyField(s)).toBe(false);
    expect(original(s)).toEqual(before);const snapshot=structuredClone(f);
    expect(tryTransition(s)).toBe(false);expect(continueToMachinesEra(s)).toBe(false);expect(continueToTribeEra(s)).toBe(false);expect(continueToPlanetEra(s)).toBe(false);expect(evolve(s,s.player.genome).ok).toBe(false);
    returnHome(s);expect(s.world).toBe(campaignWorld(s));expect(original(s)).toEqual(before);
    enterField(s,c.id);expect(activeField(s)).toBe(f);expect(f).toEqual(snapshot);expect(navigation(s)!.visits).toHaveLength(2);
    expect(navigation(s)!.fields).toHaveLength(1);expect(round(s).world).toEqual(f.world);
  });
  it('availability blocks early stages, water, anchors, invalid cells, cargo, distant home and dead players', () => {
    const early=createGame(42);enablePlanetTravel(early);expect(travelAvailability(early,cells(early)[0].id).reason).toMatch(/tvora/);
    const s=base(), atlas=planetAtlas(s.homePlanet!)!, c=cells(s)[0];
    for(const id of [-1,2592,1.5,NaN,atlas.cells.find(c=>c.surface==='water')!.id,atlas.anchors[2].cellId])expect(enterField(s,id)).toBe(false);
    s.player.health=0;expect(enterField(s,c.id)).toBe(false);
    const coast=fixture('won-current-coast.fixture.json');enablePlanetTravel(coast);coast.player.pos.x=78;coast.player.pos.z=78;expect(enterField(coast,cells(coast)[0].id)).toBe(false);
  });
  it('bounds clamp movement and retain valid ground through native simulation steps', () => {
    const s=base();expect(enterField(s,cells(s)[0].id)).toBe(true);for(let i=0;i<1200;i++)step(s,{...EMPTY_INPUT,x:1,z:1},1/30);
    expect(activeField(s)!.position.x).toBe(78);expect(activeField(s)!.position.z).toBe(78);expect(()=>round(s)).not.toThrow();
    expect(locationAddress(s,{x:78.001,y:0,z:0})).toBeNull();expect(locationAddress(s,{x:0,y:NaN,z:0})).toBeNull();
  });
  it.each(['home','global','field','field-global'])('save/load export/import and checkpoint from %s', mode => {
    const s=base();if(mode.startsWith('field')){expect(enterField(s,cells(s)[0].id)).toBe(true);for(let i=0;i<90;i++)step(s,{...EMPTY_INPUT,z:-1});surveyField(s);}
    if(mode.includes('global'))openAtlas(s);makeCheckpoint(s);const expected=structuredClone(s.homePlanet), before=structuredClone(original(s));
    const parsed=round(s);enablePlanetTravel(parsed);expect(parsed.homePlanet).toEqual(expected);expect(original(parsed)).toEqual(before);
    const storage=new Map<string,string>();vi.stubGlobal('localStorage',{setItem:(k:string,v:string)=>storage.set(k,v),getItem:(k:string)=>storage.get(k)??null});
    try {expect(saveGame(s).ok).toBe(true);const loaded=loadGame(s.id);expect(loaded.homePlanet).toEqual(expected);expect(loaded.world).toBe(activeField(loaded)?.world??campaignWorld(loaded));}finally{vi.unstubAllGlobals();}
    const recovered=recoverGeneration(parsed);expect(recovered.homePlanet).toEqual(expected);expect(recovered.world).toBe(activeField(recovered)?.world??campaignWorld(recovered));expect(()=>round(recovered)).not.toThrow();
  });
  it('older checkpoint rolls back entire expedition branch and never merges discoveries', () => {
    const s=base();makeCheckpoint(s);expect(enterField(s,cells(s)[0].id)).toBe(true);const recovered=recoverGeneration(s);expect(navigation(recovered)!.fields).toEqual([]);expect(navigation(recovered)!.visits).toEqual([]);expect(recovered.world).toBe(campaignWorld(recovered));
  });
  it('SP-009 selection resolves a supplied city address without creating cities or ownership', () => {
    const s=base();expect(enterField(s,cells(s)[0].id)).toBe(true);const f=activeField(s)!, address=locationAddress(s,{x:4,y:0,z:5})!;returnHome(s);
    const selected=selectAddress(s,[{id:'test-city',name:'Testovací spotřebitel API',address}],'test-city')!;
    expect(selected.world).toBe(f.world);expect(selected.address).toEqual(address);expect(navigation(s)!.mode).toBe('global');expect(activeField(s)).toBeNull();expect(s).not.toHaveProperty('cities');
    expect(selectAddress(s,[],'missing')).toBeNull();expect(selectAddress(s,[{id:'bad',name:'bad',address:{...address,planetId:'else'}}],'bad')).toBeNull();
  });
});

describe('SP-010.C historical compatibility', () => {
  it.each(manifest)('$file bytes, migration, repeated activation, original simulation and B1', entry => {
    const text=readFileSync(`tests/fixtures/saves/${entry.file}`,'utf8');expect(createHash('sha256').update(text).digest('hex')).toBe(entry.sha256);
    const a=parseGame(text), b=parseGame(text);enableLineageHistory(a);enableLineageHistory(b);enablePlanetTravel(b);
    const checkpoint=b.checkpoint, home=structuredClone(b.homePlanet);for(let i=0;i<3;i++)enablePlanetTravel(b);
    expect(b.homePlanet).toEqual(home);expect(b.checkpoint).toBe(checkpoint);expect(navigation(b)!.visits).toEqual([]);
    expect(original(a)).toEqual(original(b));expect(tribeInheritance(a)).toEqual(tribeInheritance(b));
    for(let i=0;i<120;i++){step(a,EMPTY_INPUT);step(b,EMPTY_INPUT);}expect(original(b)).toEqual(original(a));expect(()=>round(b)).not.toThrow();
    expect(()=>round(recoverGeneration(round(b)))).not.toThrow();
  });
  it.each(['sp-010a-fresh.save.json','sp-010b-fresh.save.json'])('preserves actual %s without invented visits', file => {
    const text=readFileSync(`tests/fixtures/geography/${file}`,'utf8');expect(createHash('sha256').update(text).digest('hex')).toBe(file.includes('010a')?'d1ab026239c80e0843e379984056c2b9e0b963069051a111cb27b207f5dc8ece':'690c9453718f6275883b11f34315d593099bcd42116c82d91217bcecb9d2d7fd');
    const s=parseGame(text), before=structuredClone(original(s)), id=s.homePlanet!.id;
    enablePlanetTravel(s);expect(original(s)).toEqual(before);expect(s.homePlanet!.id).toBe(id);expect(navigation(s)!.visits).toEqual([]);expect(round(s).homePlanet).toEqual(s.homePlanet);
    const cp=s.checkpoint;enablePlanetTravel(s);expect(s.checkpoint).toBe(cp);
  });
  it.each(['alliance-completed.save.json','machines-restoration-completed.save.json','stable-sandbox.save.json'])('freezes and restores all inherited systems while away: %s', file => {
    const s=fixture(file);enableLineageHistory(s);enablePlanetTravel(s);const before=structuredClone(original(s)), inheritance=tribeInheritance(s);
    expect(enterField(s,cells(s)[0].id)).toBe(true);for(let i=0;i<600;i++)step(s,{...EMPTY_INPUT,z:-1});returnHome(s);expect(original(s)).toEqual(before);expect(tribeInheritance(s)).toEqual(inheritance);expect(()=>round(s)).not.toThrow();
  });
});

describe('SP-010.C limits and compatibility edges', () => {
  it('64 stored scenes retain all returns and stay within the original 8 MiB save limit', () => {
    const s=base(), targets=cells(s).slice(0,65);
    for(const c of targets.slice(0,64))expect(enterField(s,c.id)).toBe(true);
    expect(travelAvailability(s,targets[64].id).reason).toMatch(/64/);expect(enterField(s,targets[64].id)).toBe(false);
    makeCheckpoint(s);const saved=serializeGame(s);expect(new TextEncoder().encode(saved).length).toBeLessThan(8*1024*1024);
    const parsed=parseGame(saved);returnHome(parsed);expect(enterField(parsed,targets[0].id)).toBe(true);expect(navigation(parsed)!.fields).toHaveLength(64);
  });
  it('a living stage-2 creature can depart from home without bypassing its ending', () => {
    const s=fixture('won-current-coast.fixture.json');enablePlanetTravel(s);s.campaign.sandbox=true;s.player.pos={...s.world.landmarks[0].pos};s.journey.cargo=null;
    const before=structuredClone(original(s));expect(enterField(s,cells(s)[0].id)).toBe(true);expect(continueToTribeEra(s)).toBe(false);
    for(let i=0;i<90;i++)step(s,{...EMPTY_INPUT,z:-1});expect(surveyField(s)).toBe(true);returnHome(s);expect(original(s)).toEqual(before);expect(()=>round(s)).not.toThrow();
  });
  it('new-lineage fallback retains navigation activation without old visits', () => {
    const s=base();s.checkpoint=null;enterField(s,cells(s)[0].id);const fresh=recoverGeneration(s);expect(navigation(fresh)!.fields).toEqual([]);expect(navigation(fresh)!.visits).toEqual([]);expect(fresh.stage).toBe(0);expect(()=>round(fresh)).not.toThrow();
  });
  it('remote save remains valid across import rekey including a remote checkpoint', () => {
    const s=base();enterField(s,cells(s)[0].id);makeCheckpoint(s);const id=s.homePlanet!.id;s.id='rekey-import';const cp=JSON.parse(s.checkpoint!);cp.id=s.id;s.checkpoint=JSON.stringify(cp);
    const loaded=round(s);enablePlanetTravel(loaded);expect(loaded.homePlanet!.id).toBe(id);expect(activeField(loaded)!.world).toBe(loaded.world);expect(recoverGeneration(loaded).homePlanet).toEqual(s.homePlanet);
  });
});

describe('SP-010.C strict persistence', () => {
  it.each([
    (s:GameState)=>{navigation(s)!.version=2 as 1;},
    (s:GameState)=>{navigation(s)!.detailGenerator=2 as 1;},
    (s:GameState)=>{navigation(s)!.camera.zoom=9;},
    (s:GameState)=>{navigation(s)!.selectedCell=2592;},
    (s:GameState)=>{s.homePlanet!.currentLocationId='missing';},
    (s:GameState)=>{s.world=s.worlds[2]!;},
    (s:GameState)=>{activeField(s)!.position.x=79;},
    (s:GameState)=>{activeField(s)!.position.y=55;},
    (s:GameState)=>{activeField(s)!.world.landmarks[2].charge=1;},
    (s:GameState)=>{activeField(s)!.world.rng++;},
    (s:GameState)=>{navigation(s)!.fields.push(activeField(s)!);},
    (s:GameState)=>{navigation(s)!.visits=[];},
    (s:GameState)=>{navigation(s)!.visits[0].tick=s.tick+1;},
    (s:GameState)=>{(navigation(s) as unknown as Record<string,unknown>).ownership='player';},
  ])('rejects invalid persisted navigation %#', mutate => {
    const s=base();expect(enterField(s,cells(s)[0].id)).toBe(true);mutate(s);expect(()=>parseGame(raw(s))).toThrow();
  });
});
