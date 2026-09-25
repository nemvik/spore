import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { enableCities, cityAt, foundCity, citySite, enterCity } from '../src/game/cities';
import { applyCityOrder, cityOrderQuote, cityEconomyPreview, cityCapacity, CITY_BUILDINGS, stepCityEconomy, type CityBuildingKind, type CityOrder } from '../src/game/city-economy';
import { buildingSite, CITY_LOTS, cityLot, cityPositionClear } from '../src/game/city-spatial';
import { parseGame, serializeGame, saveGame, loadGame } from '../src/game/persistence';
import { step, makeCheckpoint, recoverGeneration, continueToPlanetEra } from '../src/game/simulation';
import { activeField, navigation, enterField, returnHome, openAtlas, fieldGround, enablePlanetTravel } from '../src/game/planet-travel';
import { planetAtlas } from '../src/game/planet-geography';
import { locationAddress } from '../src/game/home-planet';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { enableLineageHistory, tribeInheritance } from '../src/game/lineage-history';
import { cityEconomyMarkup } from '../src/ui/city-economy';

const input=readFileSync('tests/fixtures/geography/sp-009a-city.save.json','utf8');
const round=(s:GameState)=>parseGame(serializeGame(s));
function base(){const s=parseGame(input);enableCities(s);return s;}
const economy=(s:GameState)=>cityAt(s)!.economy!;
const order=(s:GameState,o:CityOrder)=>applyCityOrder(s,cityAt(s)!.id,o,cityAt(s)!.economy?.revision??0);
function build(s:GameState,kind:CityBuildingKind){
  const c=cityAt(s)!,lot=CITY_LOTS.filter(l=>!buildingSite(s,c,l.id,kind)).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
  expect(lot,`free lot for ${kind}`).toBeTruthy();expect(order(s,{kind:'build',building:kind,lot:lot.id})).toBe(true);return economy(s).buildings.at(-1)!;
}
function running(){const s=base();expect(order(s,{kind:'open'})).toBe(true);build(s,'house');build(s,'garden');build(s,'workshop');expect(order(s,{kind:'invite'})).toBe(true);expect(order(s,{kind:'invite'})).toBe(true);return s;}
function cycles(s:GameState,count=1){for(let i=0;i<count*600;i++)step(s,EMPTY_INPUT);}
const original=(s:GameState)=>({stage:s.stage,tick:s.tick,rng:s.rng,worlds:s.worlds,player:s.player,campaign:s.campaign,journey:s.journey,tribe:s.tribe,machines:s.machines,planet:s.planet,lineage:s.lineage,history:s.lineageHistory});

describe('SP-009.B playable local economy',()=>{
  it('preserves the actual A export and explicitly opens a zero-time, empty economy with a real transfer',()=>{
    expect(createHash('sha256').update(input).digest('hex')).toBe('ab594a3f92456985aced44c2cc28ba3e659b55df21f6411eae189d33a0efe38d');
    const s=parseGame(input),a=structuredClone(s.cities!.entries[0]);expect(s.cities!.version).toBe(1);expect(a.economy).toBeUndefined();enableCities(s);
    expect(s.cities!.version).toBe(2);expect(cityAt(s)).toEqual({...a,economy:null});cycles(s,2);expect(cityAt(s)!.economy).toBeNull();
    const amber=s.machines!.resource;expect(order(s,{kind:'open'})).toBe(true);expect(s.machines!.resource).toBe(amber-80);expect(economy(s).treasury).toBe(80);expect(economy(s).cycle).toBe(0);expect(economy(s).residents).toEqual([]);
    expect(applyCityOrder(s,a.id,{kind:'open'},0)).toBe(false);expect(s.machines!.resource).toBe(amber-80);expect(round(s).cities).toEqual(s.cities);
  });
  it('pays for three functional buildings, four inhabitants, production and upkeep from the original earned budget',()=>{
    const s=running(),e=economy(s);expect(e.treasury).toBe(4);expect(e.food).toBe(8);expect(e.residents).toHaveLength(4);expect(cityCapacity(e)).toBe(4);
    const originalBefore=structuredClone(original(s)),world=structuredClone(activeField(s)!.world),p=cityEconomyPreview(cityAt(s)!);
    expect(p.workers).toBe(4);expect(p.produced).toBe(6);expect(p.upkeep).toBe(4);expect(p.net).toBeGreaterThan(0);
    cycles(s);expect(e.cycle).toBe(1);expect(e.treasury).toBe(4+p.net);expect(e.food).toBe(10);expect(e.last).toMatchObject({income:p.income,upkeep:4,produced:6,consumed:4,hungry:0});
    expect(original(s)).toEqual(originalBefore);world.time=activeField(s)!.world.time;expect(activeField(s)!.world).toEqual(world);
    cycles(s,24);expect(e.cycle).toBe(25);expect(e.ledger.upkeep).toBe(100);expect(e.ledger.income).toBe(p.income*25);expect(round(s).cities).toEqual(s.cities);
  });
  it('uses real workers, food and spatial happiness; moving a planned workshop changes income without mutating the city',()=>{
    const s=running(),c=cityAt(s)!,e=economy(s),work=e.buildings.find(b=>b.kind==='workshop')!,originalLot=work.lot;
    const near=cityEconomyPreview(c);expect(near.happiness).toBeGreaterThan(0);
    const home=cityLot(c,e.buildings[0].lot)!;
    const far=CITY_LOTS.find(l=>!buildingSite(s,c,l.id,'workshop',work.id,false)&&Math.hypot(cityLot(c,l.id)!.x-home.x,cityLot(c,l.id)!.z-home.z)>16)!;
    expect(far).toBeTruthy();work.lot=far.id;const farPreview=cityEconomyPreview(c);expect(farPreview.reasons.pollution).toBe(0);work.lot=originalLot;
    expect(near.reasons.pollution).toBe(-10);expect(farPreview.happiness).toBeGreaterThan(near.happiness);expect(farPreview.income).toBeGreaterThan(near.income);
    order(s,{kind:'enable',id:work.id,enabled:false});const stopped=cityEconomyPreview(c);expect(stopped.income).toBe(0);expect(stopped.workers).toBe(2);expect(stopped.upkeep).toBe(2);expect(stopped.reasons.employment).toBe(-10);
    const before=e.ledger.income;cycles(s);expect(e.ledger.income).toBe(before);expect(round(s).cities).toEqual(s.cities);
  });
  it('requires a staffed nearby leisure garden for a real happiness and income effect',()=>{
    const s=running();s.machines!.resource+=200;for(let i=0;i<6;i++)order(s,{kind:'fund'});build(s,'house');order(s,{kind:'invite'});
    const c=cityAt(s)!,before=cityEconomyPreview(c),homes=economy(s).buildings.filter(b=>b.kind==='house').map(b=>cityLot(c,b.lot)!);
    const lot=CITY_LOTS.filter(l=>!buildingSite(s,c,l.id,'park')).sort((a,b)=>Math.min(...homes.map(h=>Math.hypot(cityLot(c,a.id)!.x-h.x,cityLot(c,a.id)!.z-h.z)))-Math.min(...homes.map(h=>Math.hypot(cityLot(c,b.id)!.x-h.x,cityLot(c,b.id)!.z-h.z))))[0];
    expect(order(s,{kind:'build',building:'park',lot:lot.id})).toBe(true);const park=economy(s).buildings.at(-1)!,after=cityEconomyPreview(c);
    expect(after.staffed).toContain(park.id);expect(after.reasons.leisure).toBeGreaterThan(0);expect(after.happiness).toBeGreaterThan(before.happiness);
    expect(after.income).toBeGreaterThan(before.income);cycles(s);expect(economy(s).last!.happiness).toBe(after.happiness);expect(()=>round(s)).not.toThrow();
  });
  it('never gives free production on a deficit; returning to springs and transferring restores operation',()=>{
    const s=running(),e=economy(s),work=e.buildings.find(b=>b.kind==='workshop')!;
    expect(order(s,{kind:'enable',id:work.id,enabled:false})).toBe(true);cycles(s,8);
    expect(e.treasury).toBe(0);expect(e.last).toMatchObject({funded:false,income:0,upkeep:0,produced:0,workers:0,hungry:4});
    const snapshot=structuredClone(e),money=s.machines!.resource;
    expect(order(s,{kind:'supplies'})).toBe(false);expect(e).toEqual(snapshot);
    returnHome(s);cycles(s,2);expect(s.machines!.resource).toBeGreaterThan(money);expect(e).toEqual(snapshot);
    expect(enterCity(s,s.cities!.entries[0].id)).toBe(true);expect(order(s,{kind:'fund'})).toBe(true);expect(order(s,{kind:'enable',id:work.id,enabled:true})).toBe(true);cycles(s);
    expect(e.last!.funded).toBe(true);expect(e.last!.income).toBeGreaterThan(e.last!.upkeep);expect(e.last!.hungry).toBe(0);expect(()=>round(s)).not.toThrow();
  });
  it('rejects every repeated transaction and demolition refund; capacity is never removed from inhabitants',()=>{
    const s=running(),e=economy(s),c=cityAt(s)!,house=e.buildings.find(b=>b.kind==='house')!,garden=e.buildings.find(b=>b.kind==='garden')!;
    const snap=structuredClone(e);expect(order(s,{kind:'demolish',id:house.id})).toBe(false);expect(e).toEqual(snap);expect(order(s,{kind:'invite'})).toBe(false);expect(e.residents).toHaveLength(4);
    const rev=e.revision,money=e.treasury;expect(order(s,{kind:'demolish',id:garden.id})).toBe(true);expect(e.treasury).toBe(money);
    expect(applyCityOrder(s,c.id,{kind:'demolish',id:garden.id},rev)).toBe(false);expect(e.treasury).toBe(money);
    const funding=e.revision,m=s.machines!.resource;expect(order(s,{kind:'fund'})).toBe(true);expect(applyCityOrder(s,c.id,{kind:'fund'},funding)).toBe(false);expect(s.machines!.resource).toBe(m-20);
    const rebuilt=build(s,'garden');expect(rebuilt.id).toBeGreaterThan(garden.id);expect(e.ledger.construction).toBe(76);expect(()=>round(s)).not.toThrow();
  });
  it('limits storage, accounts for overflow and refuses an unfittable paid supply or recruitment',()=>{
    const s=running(),e=economy(s);cycles(s,60);expect(e.food).toBe(120);expect(e.ledger.discarded).toBeGreaterThan(0);
    const snap=structuredClone(e);expect(order(s,{kind:'supplies'})).toBe(false);expect(e).toEqual(snap);expect(()=>round(s)).not.toThrow();
  });
  it('charges emergency supplies once and rejects stale invitations after any committed order',()=>{
    const s=base();order(s,{kind:'open'});build(s,'house');const e=economy(s),c=cityAt(s)!;
    const stale=e.revision;expect(order(s,{kind:'invite'})).toBe(true);expect(applyCityOrder(s,c.id,{kind:'invite'},stale)).toBe(false);expect(e.residents).toHaveLength(2);
    const rev=e.revision,food=e.food,money=e.treasury;expect(order(s,{kind:'supplies'})).toBe(true);expect(e.food).toBe(food+20);expect(e.treasury).toBe(money-10);
    expect(applyCityOrder(s,c.id,{kind:'supplies'},rev)).toBe(false);expect(e.food).toBe(food+20);expect(e.ledger.supplies).toBe(10);expect(()=>round(s)).not.toThrow();
  });
  it('rechecks a price after cycle expenses have consumed a previously sufficient balance',()=>{
    const s=base();order(s,{kind:'open'});const house=build(s,'house'),e=economy(s);cycles(s,40);
    expect(e.treasury).toBe(20);const available=CITY_LOTS.find(l=>!buildingSite(s,cityAt(s)!,l.id,'house'))!;
    const proposal:CityOrder={kind:'build',building:'house',lot:available.id},revision=e.revision;expect(cityOrderQuote(s,cityAt(s)!,proposal,revision).ok).toBe(true);
    cycles(s);const before=structuredClone(e);expect(applyCityOrder(s,cityAt(s)!.id,proposal,revision)).toBe(false);expect(e).toEqual(before);expect(e.buildings[0]).toEqual(house);expect(()=>round(s)).not.toThrow();
  });
  it('does not pay for invalid parcels, kinds, context, or insufficient home/local funds',()=>{
    const s=base(),c=cityAt(s)!;s.machines!.resource=79;expect(order(s,{kind:'open'})).toBe(false);expect(c.economy).toBeNull();s.machines!.resource=80;expect(order(s,{kind:'open'})).toBe(true);
    const e=economy(s),before=structuredClone(e);expect(order(s,{kind:'fund'})).toBe(false);
    for(const lot of [-1,60,121,NaN])expect(order(s,{kind:'build',building:'house',lot})).toBe(false);
    expect(order(s,{kind:'build',building:'unknown' as CityBuildingKind,lot:1})).toBe(false);expect(e).toEqual(before);
    openAtlas(s);expect(order(s,{kind:'invite'})).toBe(false);expect(e).toEqual(before);
    navigation(s)!.mode='local';s.player.health=0;expect(order(s,{kind:'fund'})).toBe(false);expect(e).toEqual(before);
  });
  it('makes collisions match paid buildings and keeps the saved actor and arrival corridor safe',()=>{
    const s=running(),c=cityAt(s)!,f=activeField(s)!;
    for(const b of economy(s).buildings){const p=cityLot(c,b.lot)!;expect(cityPositionClear(s,f,{...p,y:0})).toBe(false);expect(buildingSite(s,c,b.lot,b.kind)).toMatch(/obsazená|průchod/);}
    for(let i=0;i<=100;i++){const t=i/100;expect(cityPositionClear(s,f,{x:c.address.position.x*t,y:0,z:c.address.position.z*t})).toBe(true);}
    expect(cityPositionClear(s,f,f.position)).toBe(true);expect(()=>round(s)).not.toThrow();
  });
  it('keeps zero and fractional time, clamps stalls, and never catches up on atlas or return',()=>{
    const s=running(),e=economy(s);for(let i=0;i<599;i++)step(s,EMPTY_INPUT);expect(e.cycle).toBe(0);
    const before=structuredClone(e);openAtlas(s);cycles(s,20);expect(e).toEqual(before);navigation(s)!.mode='local';step(s,EMPTY_INPUT);expect(e.cycle).toBe(1);
    const start=e.elapsed;stepCityEconomy(s,1000);expect(e.elapsed-start).toBeCloseTo(1/30);const frozen=structuredClone(e);for(const dt of [0,-1,NaN,Infinity])stepCityEconomy(s,dt);expect(e).toEqual(frozen);
    s.player.health=0;cycles(s);expect(e).toEqual(frozen);
  });
  it('shows prices, real results, population origin, deficiencies and pause rules in production markup',()=>{
    const s=running();cycles(s);const html=cityEconomyMarkup(s);for(const text of ['Pokladna','4/4 obyvatel','Poslední cyklus 1','Spokojenost','příčiny','8 ◈','20 ◈','vratka 0','civilních','převést'])expect(html.toLowerCase()).toContain(text.toLowerCase());
  });
});

describe('SP-009.B multiple cities and seeds',()=>{
  it.each([0,1,42,481516,20260913,8675309,0xffffffff])('finds productive paid layouts without rewriting generator 1 on seed %i',seed=>{
    const s=parseGame(readFileSync('tests/fixtures/saves/machines-restoration-final.save.json','utf8'));enableCities(s);s.checkpoint=null;s.seed=seed;s.worlds.forEach(w=>{if(w)w.seed=seed;});if(s.homePlanet!.version!==1)s.homePlanet!.geography.seed=seed;
    const atlas=planetAtlas(s.homePlanet!)!,cell=atlas.cells.find(c=>c.biome==='grassland'&&!atlas.anchors.some(a=>a.cellId===c.id))!;enterField(s,cell.id);const f=activeField(s)!;
    f.world.patches.forEach((p,i)=>{p.discovered=true;f.world.landmarks[i+2].charge=1;});
    let found=false;for(let z=-58;z<=58&&!found;z+=4)for(let x=-58;x<=58&&!found;x+=4){const p={x,y:fieldGround(seed,cell,x,z),z};if(!citySite(s,locationAddress(s,p)!)){f.position=p;found=true;}}
    expect(found).toBe(true);expect(foundCity(s,'Produkční město')).toBe(true);const world=JSON.stringify(f.world);
    order(s,{kind:'open'});build(s,'house');build(s,'garden');build(s,'workshop');order(s,{kind:'invite'});order(s,{kind:'invite'});
    expect(JSON.stringify(f.world)).toBe(world);cycles(s,2);expect(economy(s).last!.income).toBeGreaterThan(economy(s).last!.upkeep);expect(()=>round(s)).not.toThrow();
  });
  it('only ticks the actual local city, independent of selection, and preserves both cities across saves',()=>{
    const s=running(),first=cityAt(s)!,initial=structuredClone(first.economy);s.machines!.resource+=250;
    const atlas=planetAtlas(s.homePlanet!)!,cell=atlas.cells.find(c=>c.biome==='grassland'&&c.id!==activeField(s)!.cellId&&!atlas.anchors.some(a=>a.cellId===c.id))!;enterField(s,cell.id);const f=activeField(s)!;
    f.world.patches.forEach((p,i)=>{p.discovered=true;f.world.landmarks[i+2].charge=1;});
    let found=false;for(let z=-58;z<=58&&!found;z+=4)for(let x=-58;x<=58&&!found;x+=4){const p={x,y:fieldGround(s.seed,cell,x,z),z};if(!citySite(s,locationAddress(s,p)!)){f.position=p;found=true;}}
    expect(foundCity(s,'Druhé')).toBe(true);order(s,{kind:'open'});build(s,'house');build(s,'garden');build(s,'workshop');order(s,{kind:'invite'});order(s,{kind:'invite'});
    const second=cityAt(s)!;s.cities!.selectedId=first.id;cycles(s,2);expect(first.economy).toEqual(initial);expect(second.economy!.cycle).toBe(2);
    const r=round(s),other=structuredClone(second.economy);enterCity(r,first.id);cycles(r);expect(cityAt(r)!.economy!.cycle).toBe(1);expect(r.cities!.entries[1].economy).toEqual(other);expect(()=>round(r)).not.toThrow();
  });
});

describe('SP-009.B strict persistence and complete branch rollback',()=>{
  it('roundtrips fractional cycles, paid development, rekey and checkpoint without claiming production twice',()=>{
    const s=running();for(let i=0;i<755;i++)step(s,EMPTY_INPUT);makeCheckpoint(s);const expected=structuredClone(economy(s)),amber=s.machines!.resource;
    const store=new Map<string,string>();vi.stubGlobal('localStorage',{setItem:(k:string,v:string)=>store.set(k,v),getItem:(k:string)=>store.get(k)??null});
    try{expect(saveGame(s).ok).toBe(true);expect(loadGame(s.id).cities).toEqual(s.cities);}finally{vi.unstubAllGlobals();}
    s.id='new-slot';const cp=JSON.parse(s.checkpoint!);cp.id=s.id;s.checkpoint=JSON.stringify(cp);let r=round(s);
    for(let i=0;i<3;i++){enableCities(r);r=round(r);}expect(economy(r)).toEqual(expected);cycles(r,4);expect(economy(recoverGeneration(round(r)))).toEqual(expected);expect(recoverGeneration(r).machines!.resource).toBe(amber);
    const end=round(s);for(let i=0;i<445;i++)step(end,EMPTY_INPUT);expect(economy(end).cycle).toBe(2);expect(economy(end).ledger.income).toBe(expected.ledger.income*2);
  });
  it('supports older unopened and demolished-building checkpoints, restoring both money and objects',()=>{
    const s=base();makeCheckpoint(s);const amber=s.machines!.resource;order(s,{kind:'open'});build(s,'house');const r=recoverGeneration(round(s));expect(cityAt(r)!.economy).toBeNull();expect(r.machines!.resource).toBe(amber);
    const t=running();makeCheckpoint(t);const original=structuredClone(economy(t));const b=economy(t).buildings.find(b=>b.kind==='garden')!;order(t,{kind:'demolish',id:b.id});cycles(t,2);expect(economy(recoverGeneration(round(t)))).toEqual(original);
  });
  it('survives the original machine to local terraform transition without treating either as city production',()=>{
    const s=running();cycles(s);returnHome(s);const cities=structuredClone(s.cities);expect(continueToPlanetEra(s)).toBe(true);expect(s.planet!.version).toBe(2);expect(s.cities).toEqual(cities);expect(()=>round(s)).not.toThrow();
    enterCity(s,s.cities!.entries[0].id);cycles(s);expect(economy(s).cycle).toBe(2);expect(()=>round(s)).not.toThrow();
  });
  it.each([
    (s:GameState)=>{delete cityAt(s)!.economy;},
    (s:GameState)=>{economy(s).version=2 as 1;},
    (s:GameState)=>{(economy(s) as unknown as Record<string,unknown>).bonus=1;},
    (s:GameState)=>{economy(s).treasury++;},
    (s:GameState)=>{economy(s).food++;},
    (s:GameState)=>{economy(s).elapsed=10;},
    (s:GameState)=>{economy(s).cycle=-1;},
    (s:GameState)=>{economy(s).opened.tick=s.tick+1;},
    (s:GameState)=>{economy(s).opened.transferredAmber=0 as 80;},
    (s:GameState)=>{economy(s).ledger.transfers++;},
    (s:GameState)=>{economy(s).ledger.income=1e15;},
    (s:GameState)=>{economy(s).residents[0].source='cloned' as 'invited';},
    (s:GameState)=>{economy(s).residents[0].paidAmber=0 as 4;},
    (s:GameState)=>{economy(s).residents[1].id=economy(s).residents[0].id;},
    (s:GameState)=>{economy(s).residents[0].cycle=999;},
    (s:GameState)=>{economy(s).buildings[0].enabled=false;},
    (s:GameState)=>{economy(s).buildings[0].kind='invalid' as CityBuildingKind;},
    (s:GameState)=>{economy(s).buildings[0].paidAmber=-20;},
    (s:GameState)=>{economy(s).buildings[0].lot=60;},
    (s:GameState)=>{economy(s).buildings[1].lot=economy(s).buildings[0].lot;},
    (s:GameState)=>{economy(s).nextId=1;},
    (s:GameState)=>{economy(s).revision=0;},
    (s:GameState)=>{economy(s).last!.income++;},
    (s:GameState)=>{economy(s).last!.cycle--;},
    (s:GameState)=>{economy(s).last!.funded=false;},
    (s:GameState)=>{const cp=JSON.parse(s.checkpoint!);cp.cities.entries[0].economy.opened.tick--;s.checkpoint=JSON.stringify(cp);},
    (s:GameState)=>{const p=cityLot(cityAt(s)!,economy(s).buildings[0].lot)!;activeField(s)!.position={...p,y:fieldGround(s.seed,planetAtlas(s.homePlanet!)!.cells[activeField(s)!.cellId],p.x,p.z)};},
  ])('rejects malformed economic state %#',mutate=>{const s=running();cycles(s);makeCheckpoint(s);mutate(s);expect(()=>parseGame(JSON.stringify({format:'lumavora',version:3,savedAt:1,state:s}))).toThrow();});
});

const manifest=JSON.parse(readFileSync('tests/fixtures/saves/manifest.json','utf8')).files as {file:string;sha256:string}[];
describe('SP-009.B historical fixtures and original systems',()=>{
  it.each(manifest)('keeps $file byte-identical, without invented economy/time and with original B1',entry=>{
    const text=readFileSync(`tests/fixtures/saves/${entry.file}`,'utf8');expect(createHash('sha256').update(text).digest('hex')).toBe(entry.sha256);
    const a=parseGame(text),b=parseGame(text);enableLineageHistory(a);enableLineageHistory(b);enablePlanetTravel(a);enableCities(b);expect(b.cities!.entries).toEqual([]);
    for(let i=0;i<120;i++){step(a,EMPTY_INPUT);step(b,EMPTY_INPUT);}expect(original(b)).toEqual(original(a));expect(tribeInheritance(b)).toEqual(tribeInheritance(a));
    const cp=b.checkpoint;enableCities(b);expect(b.checkpoint).toBe(cp);b.id='historical-economy';if(b.checkpoint){const c=JSON.parse(b.checkpoint);c.id=b.id;b.checkpoint=JSON.stringify(c);}
    expect(()=>round(recoverGeneration(round(b)))).not.toThrow();
  });
  it.each(['sp-010a-fresh.save.json','sp-010b-fresh.save.json','sp-010c-travel.save.json','sp-009a-city.save.json'])('repeatedly migrates actual %s before and after rekey, including checkpoints',file=>{
    const s=parseGame(readFileSync('tests/fixtures/geography/'+file,'utf8')),before=structuredClone(original(s));enableCities(s);const cities=structuredClone(s.cities),home=structuredClone(s.homePlanet),cp=s.checkpoint;
    enableCities(s);expect(s.checkpoint).toBe(cp);expect(original(s)).toEqual(before);s.id='geographic-city';if(s.checkpoint){const c=JSON.parse(s.checkpoint);c.id=s.id;s.checkpoint=JSON.stringify(c);}
    const r=round(s);enableCities(r);expect(r.cities).toEqual(cities);expect(r.homePlanet).toEqual(home);expect(()=>round(recoverGeneration(r))).not.toThrow();
  });
});
