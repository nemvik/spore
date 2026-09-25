import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe,expect,it,vi } from 'vitest';
import { enableStates,stepStates,stateOpportunity,executeStateDecision,stateCities,STATE_TURN_LIMIT } from '../src/game/states';
import { parseGame,serializeGame,saveGame,loadGame } from '../src/game/persistence';
import { createGame,step,makeCheckpoint,recoverGeneration } from '../src/game/simulation';
import { activeField,enterField,navigation,openAtlas,returnHome,createField } from '../src/game/planet-travel';
import { cityAt,enterCity,selectCity,citySite } from '../src/game/cities';
import { cityPositionClear,buildingSite,cityLot } from '../src/game/city-spatial';
import { applyCityOrder,stepCityEconomy,cityEconomyPreview,type CityOrder } from '../src/game/city-economy';
import { planetAtlas,atlasNeighbours } from '../src/game/planet-geography';
import { EMPTY_INPUT,type GameState } from '../src/game/types';
import { defaultBuildingAppearance } from '../src/game/building-design';
import { atlasMarkup } from '../src/ui/planet-travel';
import { cityPanel,cityAtlasList } from '../src/ui/cities';
const file='tests/fixtures/geography/sp-009c-buildings.save.json';
const bytes=readFileSync(file,'utf8');
const base=()=>{const s=parseGame(bytes);enableStates(s);navigation(s)!.mode='local';return s;};
const round=(s:GameState)=>parseGame(serializeGame(s));
const turns=(s:GameState,n:number)=>{for(let i=0;i<n*300;i++)stepStates(s,1/30);};
const original=(s:GameState)=>({worlds:s.worlds,player:s.player,stage:s.stage,tick:s.tick,rng:s.rng,campaign:s.campaign,journey:s.journey,tribe:s.tribe,machines:s.machines,planet:s.planet,lineage:s.lineage,history:s.lineageHistory});

describe('SP-009.D independent finite states',()=>{
 it('preserves exact C fixture and migrates live/checkpoint without granting anything',()=>{
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('d511e6f55d5480cf2305f26641f20e442dcac715d60abd79b920a6b31bab0d77');
  const s=parseGame(bytes),before=structuredClone(original(s)),cities=structuredClone(s.cities!.entries);enableStates(s);
  expect(s.cities!.version).toBe(4);expect(s.cities!.entries).toEqual(cities);expect(original(s)).toEqual(before);expect(s.states!.activated).toBeNull();expect(s.states!.entries).toEqual([]);
  const cp=s.checkpoint;enableStates(s);expect(s.checkpoint).toBe(cp);expect(round(s).states).toEqual(s.states);
 });
 it('two autonomous policies develop and expand, with receipts and no player attack or production',()=>{
  const s=base(),before=structuredClone(original(s)),home=structuredClone(cityAt(s)),fields=structuredClone(navigation(s)!.fields);turns(s,16);
  expect(s.states!.entries).toHaveLength(2);
  for(const r of s.states!.entries){const cities=stateCities(s,r);expect(cities).toHaveLength(2);expect(r.reserve).toBe(120);expect(r.last!.outcome).toBe('blocked');expect(r.last!.reason).toContain('limit dvou');expect(r.transactions).toHaveLength(14);
   for(const c of cities){expect(c.economy!.buildings).toHaveLength(3);expect(c.economy!.residents).toHaveLength(4);expect(c.economy!.treasury).toBe(4);expect(c.economy!.cycle).toBe(0);expect(c.economy!.ledger.income).toBe(0);expect(c.founded.source).toBe('state');expect(citySite(s,c.address)).toBeNull();const f=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!;expect(cityPositionClear(s,f,f.position)).toBe(true);expect(navigation(s)!.visits.some(v=>v.locationId===f.id)).toBe(false);expect(f.world.patches.every(p=>!p.discovered)).toBe(true);}
   const cells=cities.map(c=>navigation(s)!.fields.find(f=>f.id===c.address.locationId)!.cellId);expect(atlasNeighbours(cells[0])).toContain(cells[1]);
  }
  const [a,b]=s.states!.entries;expect((a.transactions[3].action as any).building).toBe('garden');expect((b.transactions[3].action as any).building).toBe('workshop');
  expect(original(s)).toEqual(before);expect(cityAt(s)).toEqual(home);expect(navigation(s)!.fields.slice(0,fields.length)).toEqual(fields);expect(round(s).states).toEqual(s.states);
 });
 it.each([0,1,42,481516,20260913,8675309,0xffffffff])('determinism and buildability seed %i',seed=>{
  const s=parseGame(readFileSync('tests/fixtures/saves/machines-restoration-final.save.json','utf8'));s.checkpoint=null;s.seed=seed;s.worlds.forEach(w=>{if(w)w.seed=seed;});enableStates(s);if(s.homePlanet!.version!==1)s.homePlanet!.geography.seed=seed;
  const b=structuredClone(s);turns(s,16);turns(b,16);expect(s.states).toEqual(b.states);expect(s.cities).toEqual(b.cities);expect(s.states!.entries.every(r=>stateCities(s,r).length===2)).toBe(true);expect(()=>round(s)).not.toThrow();
 });
 it('visiting a growing city can transfer a finite reserve, recover and still expand after load',()=>{
  let s=base();turns(s,1);const id=stateCities(s,s.states!.entries[0])[0].id;enterCity(s,id);
  for(let i=0;i<6000;i++){step(s,EMPTY_INPUT,1/30);if(i===1700)s=round(s);}
  const r=s.states!.entries[0];expect(r.transactions.some(t=>t.action.kind==='fund')).toBe(true);expect(stateCities(s,r)).toHaveLength(2);expect(r.reserve).toBeLessThan(120);
  expect(r.reserve+r.transactions.filter(t=>t.account==='reserve').reduce((n,t)=>n+t.cost,0)).toBe(400);expect(()=>round(s)).not.toThrow();
 });
 it.each([false,0,''])('rejects falsy non-null activation and blocked action %s',invalid=>{
  const s=base();(s.states as any).activated=invalid;expect(()=>round(s)).toThrow();
  const b=base();turns(b,16);(b.states!.entries[0].last as any).action=invalid;expect(()=>round(b)).toThrow();
 });
 it('unvisited state fields have no player visit dot; a real visit adds it',()=>{
  const s=base();turns(s,1);const c=stateCities(s,s.states!.entries[0])[0];openAtlas(s);
  const dots=(s:GameState)=>(atlasMarkup(s).match(/r="2.5" fill="#fff"/g)??[]).length;const before=dots(s);
  expect(before).toBe(navigation(s)!.fields.filter(f=>navigation(s)!.visits.some(v=>v.locationId===f.id)).length);
  enterCity(s,c.id);openAtlas(s);expect(dots(s)).toBe(before+1);expect(()=>round(s)).not.toThrow();
 });
 it('forecasts are pure and replaying a committed turn cannot spend twice',()=>{
  const s=base();turns(s,2);const before=structuredClone(s),r=s.states!.entries[0];expect(stateOpportunity(s,r).available).toBe(true);expect(s).toEqual(before);expect(executeStateDecision(s,r.id,2)).toBe(false);expect(executeStateDecision(s,r.id,3)).toBe(false);expect(executeStateDecision(s,'foreign',2)).toBe(false);expect(s).toEqual(before);
 });
 it('insufficient budgets do not grant resources or create receipts',()=>{
  const s=base();stepStates(s,1/30);s.states!.entries[0].reserve=139;turns(s,1);const r=s.states!.entries[0];expect(r.reserve).toBe(139);expect(r.last!.reason).toContain('140');expect(r.transactions).toEqual([]);expect(stateCities(s,r)).toEqual([]);
  const c=base();turns(c,2);const rr=c.states!.entries[0],city=stateCities(c,rr)[0];city.economy!.treasury=0;rr.reserve=0;const n=rr.transactions.length;turns(c,1);expect(rr.last!.outcome).toBe('blocked');expect(rr.transactions).toHaveLength(n);expect(city.economy!.buildings).toEqual([]);expect(city.economy!.treasury).toBe(0);
 });
 it('occupied navigation, full registries, actor position and time limits are respected',()=>{
  const s=base();stepStates(s,1/30);const atlas=planetAtlas(s.homePlanet!)!;
  for(const c of atlas.cells.filter(c=>c.surface==='land'&&!atlas.anchors.some(a=>a.cellId===c.id))){if(navigation(s)!.fields.length>=64)break;if(!navigation(s)!.fields.some(f=>f.cellId===c.id))navigation(s)!.fields.push(createField(s.seed,s.homePlanet!.id,c));}
  const before=structuredClone(navigation(s)!.fields);turns(s,1);expect(s.states!.entries[0].last!.reason).toContain('64');expect(navigation(s)!.fields).toEqual(before);
  const t=base();turns(t,2);const r=t.states!.entries[0],c=stateCities(t,r)[0],q=stateOpportunity(t,r);expect(q.action!.kind).toBe('build');const a=q.action as Extract<NonNullable<typeof q.action>,{kind:'build'}>,f=navigation(t)!.fields.find(f=>f.id===c.address.locationId)!;const p=cityLot(c,a.lot)!;f.position={...p,y:0};expect(buildingSite(t,c,a.lot,a.building)).toContain('tvor');expect(stateOpportunity(t,r).action).not.toEqual(q.action);
  t.states!.clock.turn=STATE_TURN_LIMIT;const freeze=structuredClone(t.states);stepStates(t,1/30);expect(t.states).toEqual(freeze);
 });
 it('no viable adjacent land never overwrites existing places',()=>{
  const s=base();turns(s,7);const nav=navigation(s)!,atlas=planetAtlas(s.homePlanet!)!;
  for(const r of s.states!.entries)for(const c of stateCities(s,r)){const id=nav.fields.find(f=>f.id===c.address.locationId)!.cellId;for(const cell of atlasNeighbours(id)){if(atlas.cells[cell].surface==='land'&&!atlas.anchors.some(a=>a.cellId===cell)&&!nav.fields.some(f=>f.cellId===cell))nav.fields.push(createField(s.seed,s.homePlanet!.id,atlas.cells[cell]));}}
  const before=structuredClone(nav.fields);turns(s,1);expect(s.states!.entries.every(r=>r.last!.reason.includes('pevnina'))).toBe(true);expect(nav.fields).toEqual(before);
 });
 it('player orders cannot control state cities, including funding, appearance and demolition',()=>{
  const s=base();turns(s,7);const c=stateCities(s,s.states!.entries[0])[0];enterCity(s,c.id);const e=c.economy!,before=structuredClone(e),money=s.machines!.resource;
  const orders:CityOrder[]=[{kind:'open'},{kind:'fund'},{kind:'invite'},{kind:'supplies'},{kind:'build',building:'house',lot:1},{kind:'enable',id:1,enabled:false},{kind:'demolish',id:1},{kind:'appearance',id:1,appearance:defaultBuildingAppearance()}];
  for(const order of orders)expect(applyCityOrder(s,c.id,order,e.revision)).toBe(false);expect(c.economy).toEqual(before);expect(s.machines!.resource).toBe(money);expect(cityPanel(s)).toContain('návštěvník');expect(cityPanel(s)).not.toContain('city-econ:fund');expect(cityAtlasList(s)).toContain('Svaz zelených údolí');
 });
 it('strategic time is separate: global/death/early stages freeze, active local economy only',()=>{
  const s=base();turns(s,7);const r=s.states!.entries[0],c=stateCities(s,r)[0],other=cityAt(s)!,e=structuredClone(c.economy),orig=structuredClone(original(s));
  openAtlas(s);const frozen=structuredClone(s);for(let i=0;i<900;i++)step(s,EMPTY_INPUT,1/30);expect(s).toEqual(frozen);
  enterCity(s,c.id);const own=structuredClone(other.economy);for(let i=0;i<300;i++)step(s,EMPTY_INPUT,1/30);expect(c.economy!.cycle).toBe(e!.cycle+1);expect(c.economy!.last!.income).toBeGreaterThan(0);expect(other.economy).toEqual(own);expect(original(s)).toEqual(orig);
  returnHome(s);const economy=structuredClone(c.economy);for(let i=0;i<300;i++)stepCityEconomy(s,1/30);expect(c.economy).toEqual(economy);enterCity(s,c.id);expect(c.economy).toEqual(economy);
  s.player.health=0;const dead=structuredClone(s.states);turns(s,1);expect(s.states).toEqual(dead);
  const fresh=createGame(481516);enableStates(fresh,'birth');turns(fresh,1);expect(fresh.states!.activated).toBeNull();expect(fresh.states!.origin).toBe('birth');
  const zero=base();for(const dt of [0,-1,NaN,Infinity])stepStates(zero,dt);expect(zero.states!.activated).toBeNull();stepStates(zero,10);expect(zero.states!.clock.elapsed).toBe(1/30);
 });
 it('save/load/rekey/checkpoint restore whole branches before and after expansion',()=>{
  const s=base();makeCheckpoint(s);const before=s.checkpoint!;turns(s,7);makeCheckpoint(s);const developed=s.checkpoint!;turns(s,1);expect(s.cities!.entries).toHaveLength(5);const saved=round(s);expect(round(recoverGeneration(saved)).states).toEqual(JSON.parse(developed).states);
  s.id='states-imported';const cp=JSON.parse(s.checkpoint!);cp.id=s.id;s.checkpoint=JSON.stringify(cp);const r=round(s);enableStates(r);expect(r.states).toEqual(s.states);expect(round(recoverGeneration(r)).states).toEqual(cp.states);
  const storage=new Map<string,string>();vi.stubGlobal('localStorage',{get length(){return storage.size;},key:(i:number)=>[...storage.keys()][i]??null,getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});try{expect(saveGame(r).ok).toBe(true);expect(loadGame(r.id).states).toEqual(r.states);}finally{vi.unstubAllGlobals();}
  const originalId=JSON.parse(before).id;s.id=originalId;s.checkpoint=before;const restored=round(recoverGeneration(round(s)));expect(restored.states!.activated).toBeNull();turns(restored,8);expect(restored.states).toEqual(saved.states);expect(restored.cities).toEqual(saved.cities);
 });
 it.each(JSON.parse(readFileSync('tests/fixtures/saves/manifest.json','utf8')).files as {file:string;sha256:string}[])('original fixture $file retains bytes, original simulation and migration',({file,sha256})=>{
  const bytes=readFileSync('tests/fixtures/saves/'+file);expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
  const a=parseGame(bytes.toString()),b=parseGame(bytes.toString());enableStates(b);const cp=b.checkpoint;enableStates(b);expect(b.checkpoint).toBe(cp);
  for(let i=0;i<120;i++){step(a,EMPTY_INPUT);step(b,EMPTY_INPUT);}expect(original(b)).toEqual(original(a));expect(()=>round(b)).not.toThrow();
 });
 it.each(['sp-010a-fresh.save.json','sp-010b-fresh.save.json','sp-010c-travel.save.json','sp-009a-city.save.json','sp-009b-economy.save.json','sp-009c-buildings.save.json'])('historical %s migration twice, rekey and restore',file=>{
  const s=parseGame(readFileSync('tests/fixtures/geography/'+file,'utf8')),before=structuredClone(original(s));enableStates(s);expect(original(s)).toEqual(before);expect(s.states!.activated).toBeNull();const checkpoint=s.checkpoint;enableStates(s);expect(s.checkpoint).toBe(checkpoint);s.id='migrated-d';if(s.checkpoint){const cp=JSON.parse(s.checkpoint);cp.id=s.id;s.checkpoint=JSON.stringify(cp);}expect(round(s).states).toEqual(s.states);expect(()=>round(recoverGeneration(round(s)))).not.toThrow();
 });
 it.each([
  (s:GameState)=>{const c=stateCities(s,s.states!.entries[0])[0],f=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!;f.world.patches[0].discovered=true;f.world.landmarks[2].charge=1;},
  (s:GameState)=>{const c=stateCities(s,s.states!.entries[0])[0],f=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!;s.homePlanet!.currentLocationId=f.id;s.world=f.world;},
  (s:GameState)=>{const c=stateCities(s,s.states!.entries[0])[0];c.economy!.elapsed=1;},
  (s:GameState)=>{s.states!.version=2 as 1;},(s:GameState)=>{s.cities!.version=3;},(s:GameState)=>{delete s.states;},
  (s:GameState)=>{s.states!.entries[0].reserve++;},(s:GameState)=>{s.states!.entries[0].endowment=800 as 400;},
  (s:GameState)=>{s.states!.entries[0].id='foreign';},(s:GameState)=>{s.states!.entries[0].transactions.push(s.states!.entries[0].transactions[0]);},
  (s:GameState)=>{s.states!.entries[0].transactions[0].cost=0;},(s:GameState)=>{s.states!.entries[0].transactions[1].account='city';},
  (s:GameState)=>{s.states!.clock.elapsed=10;},(s:GameState)=>{s.states!.clock.version=2 as 1;},(s:GameState)=>{s.states!.activated!.tick=s.tick+1;},
  (s:GameState)=>{stateCities(s,s.states!.entries[0])[0].owner.id=s.homePlanet!.id;},
  (s:GameState)=>{stateCities(s,s.states!.entries[0])[0].address.position.x=78;},
  (s:GameState)=>{(stateCities(s,s.states!.entries[0])[0].founded as any).transactionId='missing';},
  (s:GameState)=>{stateCities(s,s.states!.entries[0])[0].economy!.opened.source='player';},
  (s:GameState)=>{stateCities(s,s.states!.entries[0])[0].economy!.buildings[0].paidAmber=0;},
  (s:GameState)=>{stateCities(s,s.states!.entries[0])[0].economy!.residents[1].id=1;},
  (s:GameState)=>{s.states!.entries[0].transactions[2].action={kind:'open',cityId:s.cities!.entries[0].id};},
  (s:GameState)=>{s.states!.entries[0].last!.transactionId='missing';s.states!.entries[0].last!.outcome='paid';},
  (s:GameState)=>{const cp=JSON.parse(s.checkpoint!);cp.states.origin='birth';s.checkpoint=JSON.stringify(cp);},
  (s:GameState)=>{const c=stateCities(s,s.states!.entries[0])[0];navigation(s)!.fields.push(createField(s.seed,s.homePlanet!.id,planetAtlas(s.homePlanet!)!.cells.find(v=>v.surface==='land'&&!navigation(s)!.fields.some(f=>f.cellId===v.id)&&!planetAtlas(s.homePlanet!)!.anchors.some(a=>a.cellId===v.id))!));},
 ])('rejects corrupt version, finance, identity, clock, provenance or receipt %#',mutate=>{const s=base();turns(s,7);makeCheckpoint(s);mutate(s);expect(()=>round(s)).toThrow();});
});
