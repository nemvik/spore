import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import { parseGame,serializeGame } from '../src/game/persistence';
import { enableDefense,cityCommandRevision,raids,cityEntry } from '../src/game/defense';
import { deployMachine,deploymentQuote,militaryOrder,stepMilitary,landRoute } from '../src/game/military';
import { stepStates,executeStateDecision,stateOpportunity } from '../src/game/states';
import { enterCity } from '../src/game/cities';
import { activeMachines,repairMachines } from '../src/game/machines';
import { returnHome,navigation,openAtlas } from '../src/game/planet-travel';
import { applyCityOrder } from '../src/game/city-economy';
import { step,makeCheckpoint,recoverGeneration,continueToPlanetEra } from '../src/game/simulation';
import { EMPTY_INPUT,type GameState } from '../src/game/types';
const bytes=readFileSync('tests/fixtures/geography/sp-009e-military.save.json','utf8');
const round=(s:GameState)=>parseGame(serializeGame(s));
function base(){const s=parseGame(bytes);enableDefense(s);navigation(s)!.mode='local';return s;}
const advance=(s:GameState,n=3000)=>{for(let i=0;i<n;i++)step(s,EMPTY_INPUT,1/30);};
const battle=(s:GameState,n=3000)=>{for(let i=0;i<n;i++)stepMilitary(s,1/30);};
function target(s:GameState){return s.cities!.entries.find(c=>c.capture)!;}
function lose(){const s=base(),c=target(s);enterCity(s,c.id);advance(s);expect(c.owner.kind).toBe('state');expect(c.transfers).toHaveLength(1);return {s,c};}
function reclaim(){const t=lose(),{s,c}=t;returnHome(s);advance(s,600);expect(repairMachines(s,[12]).ok).toBe(true);enterCity(s,c.id);expect(deployMachine(s,c,12)).toBe(true);battle(s,600);expect(militaryOrder(s,'attack')).toBe(true);battle(s);expect(raids(s)[0].unit.health).toBe(0);expect(militaryOrder(s,'occupy')).toBe(true);battle(s,1200);expect(c.owner.kind).toBe('lineage');expect(c.transfers).toHaveLength(2);return t;}
describe('SP-009.F actual E continuation',()=>{
 it('hash and repeatable explicit live/checkpoint migration invent nothing',()=>{expect(createHash('sha256').update(bytes).digest('hex')).toBe('1699d660bdb0b0ec4d8468df451c7d57cb908f6a0c8da394a9f28a4511558e64');const s=parseGame(bytes),history=JSON.stringify([s.states!.entries,s.machines,s.worlds,target(s).capture]);enableDefense(s);expect(JSON.stringify([s.states!.entries,s.machines,s.worlds,target(s).capture])).toBe(history);expect(raids(s)).toEqual([]);const once=JSON.stringify(s);enableDefense(s);expect(JSON.stringify(s)).toBe(once);expect(()=>round(s)).not.toThrow();});
 it('explicit migration interrupts valid unfinished E occupation in live AND checkpoint',()=>{
  const s=parseGame(bytes);navigation(s)!.mode='local';returnHome(s);expect(repairMachines(s,[12]).ok).toBe(true);const c=s.cities!.entries.find(v=>v.owner.kind==='state'&&v.foundingOwner!.id===target(s).foundingOwner!.id)!;
  enterCity(s,c.id);deployMachine(s,c,12);battle(s,1200);militaryOrder(s,'attack');battle(s);expect(militaryOrder(s,'occupy')).toBe(true);for(let i=0;i<1500&&s.military!.deployment!.hold===0;i++)stepMilitary(s,1/30);expect(s.military!.deployment!.hold).toBeGreaterThan(0);makeCheckpoint(s);expect(()=>round(s)).not.toThrow();enableDefense(s);expect(s.military!.deployment!.hold).toBe(0);expect(s.military!.deployment!.order).toBe('stop');expect(JSON.parse(s.checkpoint!).military.deployment.order).toBe('stop');expect(()=>round(s)).not.toThrow();
 });
 it('40 finite reserve pays one reachable raid, no repeated payment or replacement',()=>{const s=base(),r=s.states!.entries[0];expect(r.reserve).toBe(40);advance(s,110);expect(r.reserve).toBe(0);expect(raids(s)).toHaveLength(1);expect(executeStateDecision(s,r.id,s.states!.clock.turn)).toBe(false);expect(stateOpportunity(s,r).reason).toContain('jediný');expect(()=>round(s)).not.toThrow();});
 it('static blocked arrival refuses deployment and raid before any payment',()=>{
  const s=base(),c=target(s),r=s.states!.entries[0];enterCity(s,c.id);
  // Explicit geometry input for the quote boundary, not a historical terrain mutation.
  const f=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!;
  f.world.obstacles.push({id:999999,kind:'rock',pos:cityEntry(s,c),radius:20,height:24});
  const money=r.reserve,fleet=structuredClone(activeMachines(s)!.fleet);
  expect(deploymentQuote(s,c,12)).toContain('blokuje');expect(deployMachine(s,c,12)).toBe(false);
  expect(stateOpportunity(s,r).available).toBe(false);expect(executeStateDecision(s,r.id,s.states!.clock.turn)).toBe(false);
  expect(r.reserve).toBe(money);expect(raids(s)).toEqual([]);expect(activeMachines(s)!.fleet).toEqual(fleet);
 });
 it('actual loss requires damage, physical arrival and occupation; preserves E',()=>{const before=base(),{s,c}=lose();expect(c.fortification).toBe(0);expect(c.capture).toEqual(target(before).capture);expect(c.founded).toEqual(target(before).founded);expect(c.economy!.ledger.transfers).toBe(target(before).economy!.ledger.transfers);expect(raids(s)[0].phase).toBe('garrison');expect(()=>round(s)).not.toThrow();});
 it('paid repair of original E tank wins a real defense deterministically',()=>{const run=()=>{const s=base(),c=target(s);returnHome(s);const reserve=activeMachines(s)!.resource;expect(repairMachines(s,[12]).ok).toBe(true);expect(activeMachines(s)!.resource).toBe(reserve-10);enterCity(s,c.id);expect(deployMachine(s,c,12)).toBe(true);advance(s,310);expect(militaryOrder(s,'defend')).toBe(true);advance(s);expect(c.transfers).toEqual([]);expect(c.owner.kind).toBe('lineage');expect(raids(s)[0].phase).toBe('destroyed');expect(activeMachines(s)!.fleet.find(u=>u.id===12)!.health).toBeGreaterThan(0);expect(()=>round(s)).not.toThrow();return s;};expect(run()).toEqual(run());},15000);
 it('repeated capture is atomic, original capture/receipts persist and stale economic confirmation fails',()=>{const before=base(),revision=cityCommandRevision(target(before)),{s,c}=reclaim();expect(c.capture).toEqual(target(before).capture);expect(applyCityOrder(s,c.id,{kind:'fund'},revision)).toBe(false);expect(applyCityOrder(s,c.id,{kind:'fund'},cityCommandRevision(c))).toBe(true);expect(militaryOrder(s,'occupy')).toBe(false);const history=structuredClone(c.transfers);battle(s);expect(c.transfers).toEqual(history);expect(()=>round(s)).not.toThrow();},15000);
 it('departure/global stops combat and economy; transport only advances with local play',()=>{const s=base(),c=target(s);enterCity(s,c.id);advance(s,400);openAtlas(s);const frozen=structuredClone(s);advance(s,100);expect(s).toEqual(frozen);returnHome(s);const econ=structuredClone(c.economy);advance(s,3000);expect(c.fortification).toBe(80);expect(c.economy).toEqual(econ);expect(raids(s)[0].phase).toBe('waiting');expect(()=>round(s)).not.toThrow();enterCity(s,c.id);advance(s);expect(c.owner.kind).toBe('state');});
 it('checkpoint restores complete branch before payment and after loss; rekey adds nothing',()=>{const s=base();makeCheckpoint(s);const before=structuredClone(s);enterCity(s,target(s).id);advance(s);const restored=recoverGeneration(round(s));expect(restored.military).toEqual(before.military);expect(restored.states).toEqual(before.states);expect(restored.cities).toEqual(before.cities);const {s:a}=lose();makeCheckpoint(a);const snapshot=structuredClone(a);a.id='line-f-import';const cp=JSON.parse(a.checkpoint!);cp.id=a.id;a.checkpoint=JSON.stringify(cp);const rekey=round(a);expect(raids(rekey)).toEqual(raids(snapshot));expect(()=>round(recoverGeneration(rekey))).not.toThrow();});
 it('prepared last-city branch loses its only city, can earn/repair at original home and recapture',()=>{
  const s=base();s.cities!.entries=s.cities!.entries.filter(c=>c.founded.source!=='player');s.cities!.selectedId=target(s).id;s.checkpoint=null;expect(()=>round(s)).not.toThrow();
  const c=target(s),home=structuredClone(s.machines);enterCity(s,c.id);advance(s);expect(s.cities!.entries.filter(c=>c.owner.kind==='lineage')).toHaveLength(0);expect(s.machines).toEqual(home);
  returnHome(s);const resource=activeMachines(s)!.resource;advance(s,600);expect(activeMachines(s)!.resource).toBeGreaterThan(resource);expect(repairMachines(s,[12]).ok).toBe(true);
  enterCity(s,c.id);deployMachine(s,c,12);battle(s,600);militaryOrder(s,'attack');battle(s);militaryOrder(s,'occupy');battle(s,1200);expect(c.owner.kind).toBe('lineage');expect(()=>round(s)).not.toThrow();
 },15000);
 it('actual capture of final state city permanently stops defeated decisions, reserve and old B1 remain',()=>{
  const {s,c}=reclaim(),r=s.states!.entries.find(r=>r.id===c.foundingOwner!.id)!,other=s.cities!.entries.find(v=>v.owner.id===r.id)!;
  militaryOrder(s,'retreat');battle(s,4000);returnHome(s);advance(s,600);expect(repairMachines(s,[12]).ok).toBe(true);enterCity(s,other.id);expect(deployMachine(s,other,12)).toBe(true);battle(s,1200);militaryOrder(s,'attack');battle(s,3000);expect(other.fortification).toBe(0);expect(militaryOrder(s,'occupy')).toBe(true);battle(s,1200);
  expect(other.owner.kind).toBe('lineage');const records=structuredClone(r.transactions),reserve=r.reserve,regions=structuredClone(activeMachines(s)!.regions);advance(s,900);expect(stateOpportunity(s,r).reason).toContain('poslední');expect(r.transactions).toEqual(records);expect(r.reserve).toBe(reserve);expect(activeMachines(s)!.regions).toEqual(regions);expect(()=>round(s)).not.toThrow();
 },15000);
 it('physical shots respect same obstacles/range; actual player loss removes paid unit and no owner flip until occupation',()=>{
  const s=base(),c=target(s);enterCity(s,c.id);deployMachine(s,c,12);advance(s,310);expect(militaryOrder(s,'stop')).toBe(true);advance(s,3000);
  expect(activeMachines(s)!.fleet.some(u=>u.id===12)).toBe(false);expect(c.owner.kind).toBe('state');expect(c.transfers).toHaveLength(1);expect(()=>round(s)).not.toThrow();
 });
 it('cannot abandon unresolved paid invasion or occupation by changing era',()=>{const {s}=lose();returnHome(s);expect(continueToPlanetEra(s)).toBe(false);expect(s.stage).toBe(4);expect(()=>round(s)).not.toThrow();});
 it('accounting limit reached after launch refuses occupation without invalid hold or owner change',()=>{const s=base(),c=target(s);enterCity(s,c.id);advance(s,110);c.economy!.revision=1e9;advance(s,3000);expect(c.owner.kind).toBe('lineage');expect(c.transfers).toEqual([]);expect(raids(s)[0].hold).toBe(0);expect(['retreat','returning','returned']).toContain(raids(s)[0].phase);expect(()=>round(s)).not.toThrow();});
 it('occupied enemy berth waits instead of spawning overlapping tanks',()=>{const s=base(),c=target(s);enterCity(s,c.id);deployMachine(s,c,12);advance(s,310);const u=activeMachines(s)!.fleet.find(u=>u.id===12)!;u.pos=cityEntry(s,c,true);advance(s,600);expect(raids(s)[0].phase).toBe('waiting');expect(u.health).toBe(41.8);expect(()=>round(s)).not.toThrow();u.pos=cityEntry(s,c);battle(s,1);expect(raids(s)[0].phase).toBe('field');expect(()=>round(s)).not.toThrow();});
 it('occupied player berth delays delivery of the same paid tank',()=>{const {s,c}=lose(),r=raids(s)[0];r.unit.pos=cityEntry(s,c);expect(deployMachine(s,c,12)).toBe(true);battle(s,600);expect(s.military!.deployment!.phase).toBe('outbound');expect(s.military!.deployment!.remaining).toBe(0);expect(()=>round(s)).not.toThrow();r.unit.pos=cityEntry(s,c,true);battle(s,1);expect(s.military!.deployment!.phase).toBe('field');expect(()=>round(s)).not.toThrow();});
 it('withdrawal preserves surviving paid raider and never replaces it',()=>{
  const s=base(),c=target(s);enterCity(s,c.id);advance(s,1000);const r=raids(s)[0];r.unit.health=10; // Explicit unit-test input, not a played result.
  battle(s,4000);expect(['returned','withdrawn']).toContain(r.phase);expect(r.unit.health).toBe(10);expect(c.owner.kind).toBe('lineage');expect(raids(s)).toHaveLength(1);expect(()=>round(s)).not.toThrow();
 });
 it('rejects reversal of paid source/target whose historic owners disallow the attack',()=>{
  const s=base();advance(s,110);const r=raids(s)[0];[r.cityId,r.sourceCityId]=[r.sourceCityId,r.cityId];const state=s.states!.entries[0],tx=state.transactions.find(t=>t.id===r.id)!;if(tx.action.kind!=='raid')throw new Error('missing raid');tx.action.cityId=r.cityId;tx.action.sourceCityId=r.sourceCityId;state.last!.action=structuredClone(tx.action);
  const c=s.cities!.entries.find(c=>c.id===r.cityId)!,source=s.cities!.entries.find(c=>c.id===r.sourceCityId)!;r.route=landRoute(s,c,navigation(s)!.fields.find(f=>f.id===source.address.locationId)!.cellId)!;r.unit.pos=cityEntry(s,source,true);r.unit.navigation={waypoint:{...r.unit.pos},target:{...r.unit.pos},rethink:0};expect(()=>round(s)).toThrow();
 });
 it.each(['future-phase','future-timer'])('rejects checkpoint %s ahead of live transport',key=>{
  const s=base();for(let i=0;i<110;i++)stepStates(s,1/30);makeCheckpoint(s);const cp=JSON.parse(s.checkpoint!);if(key==='future-phase'){cp.military.raids[0].phase='waiting';cp.military.raids[0].remaining=0;}else cp.military.raids[0].remaining=1;s.checkpoint=JSON.stringify(cp);expect(()=>round(s)).toThrow();
 });
 it.each(['free','route','owner','history','fort','unit','double','snapshot','version'])('rejects invalid %s',key=>{const {s,c}=lose();const r=raids(s)[0];if(key==='free')s.states!.entries[0].reserve++;if(key==='route')r.route=[0];if(key==='owner')c.owner={kind:'lineage',id:s.homePlanet!.id};if(key==='history')c.transfers![0].from={...c.owner};if(key==='fort')c.fortification=80;if(key==='unit')r.unit.health=100;if(key==='double')s.military!.raids!.push(structuredClone(r));if(key==='snapshot')c.transfers![0].economy!.ledger.transfers+=20;if(key==='version')s.cities!.version=5;expect(()=>round(s)).toThrow();});
 it.each(readdirSync('tests/fixtures/geography').filter(f=>f.endsWith('.save.json')))('migrates historical %s including checkpoint before rekey',file=>{const data=readFileSync('tests/fixtures/geography/'+file,'utf8'),s=parseGame(data);enableDefense(s);expect(()=>round(s)).not.toThrow();s.id='line-f-history';if(s.checkpoint){const cp=JSON.parse(s.checkpoint);cp.id=s.id;s.checkpoint=JSON.stringify(cp);}expect(()=>round(s)).not.toThrow();if(s.checkpoint)expect(()=>round(recoverGeneration(s))).not.toThrow();expect(readFileSync('tests/fixtures/geography/'+file,'utf8')).toBe(data);});
});
