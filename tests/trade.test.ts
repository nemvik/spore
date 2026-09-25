import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import { parseGame,serializeGame } from '../src/game/persistence';
import { enableTrade,tradeQuote,acceptTrade,tradeTransfers } from '../src/game/trade';
import { cityGuard,enterCity } from '../src/game/cities';
import { cityCommandRevision,raidOpportunity } from '../src/game/defense';
import { deployMachine,militaryOrder,stepMilitary } from '../src/game/military';
import { stepStates,stateOpportunity } from '../src/game/states';
import { activeMachines,effectiveMachineIncome,repairMachines } from '../src/game/machines';
import { applyCityOrder } from '../src/game/city-economy';
import { navigation,returnHome,openAtlas } from '../src/game/planet-travel';
import { step,makeCheckpoint,recoverGeneration } from '../src/game/simulation';
import { EMPTY_INPUT,type GameState } from '../src/game/types';
const bytes=readFileSync('tests/fixtures/geography/sp-009f-defense.save.json','utf8');
const round=(s:GameState)=>parseGame(serializeGame(s));
const advance=(s:GameState,seconds:number)=>{for(let i=0;i<seconds*30;i++)step(s,EMPTY_INPUT,1/30);};
function base(){const s=parseGame(bytes);enableTrade(s);navigation(s)!.mode='local';return s;}
function target(s:GameState,profile=0){return s.cities!.entries.find(c=>c.owner.id===s.states!.entries[profile].id)!;}
function earned(profile=0){const s=base(),c=target(s,profile);returnHome(s);advance(s,125);expect(enterCity(s,c.id)).toBe(true);return {s,c};}
function bought(profile=0){const {s,c}=earned(profile),q=tradeQuote(s,c);expect(q.available).toBe(true);expect(acceptTrade(s,q.offer!)).toBe(true);return {s,c};}
describe('SP-009.G finite commercial continuation of played F',()=>{
 it('preserves the exact F export and migrates both branches without inventing money/history',()=>{
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('1ceed299a31254e8bda104be18b0a86213e37ccfbf45aa2456aed194bad4c2cc');
  const s=parseGame(bytes),before=structuredClone(s);enableTrade(s);expect(s.cities!.version).toBe(7);expect(s.states!.version).toBe(4);
  expect(s.cities!.entries).toEqual(before.cities!.entries);expect(s.machines).toEqual(before.machines);expect(s.worlds).toEqual(before.worlds);expect(s.military).toEqual(before.military);expect(s.lineageHistory).toEqual(before.lineageHistory);
  expect(s.states!.entries.map(r=>r.tradeReserve)).toEqual([0,0]);expect(JSON.parse(s.checkpoint!).cities.version).toBe(7);
  const once=JSON.stringify(s);enableTrade(s);expect(JSON.stringify(s)).toBe(once);expect(()=>round(s)).not.toThrow();
 });
 it('proves feasibility from real original home income, separate treasuries and empty state reserve',()=>{
  const s=base(),c=target(s);expect(s.machines!.resource).toBeCloseTo(.405);expect(effectiveMachineIncome(s)).toBeCloseTo(1.8);expect(s.states!.entries.map(r=>r.reserve)).toEqual([0,40]);
  enterCity(s,c.id);expect(tradeQuote(s,c).offer!.price).toBe(200);expect(tradeQuote(s,c).reason).toContain('doma chybí');const money=s.machines!.resource;advance(s,12);expect(s.machines!.resource).toBe(money);expect(c.owner.kind).toBe('state');expect(c.transfers).toEqual([]);
  returnHome(s);advance(s,112);expect(s.machines!.resource).toBeCloseTo(money+201.6);enterCity(s,c.id);expect(tradeQuote(s,c).available).toBe(false); // 202 after actual local production
  returnHome(s);advance(s,1);enterCity(s,c.id);expect(tradeQuote(s,c).available).toBe(true);
 });
 it('deterministically settles once with full conservation, preserves F/E and demobilizes only the old guard',()=>{
  const run=()=>{const {s,c}=earned(),q=tradeQuote(s,c),before=structuredClone(s),e=structuredClone(c.economy),health=c.defense!.health,revision=cityCommandRevision(c);expect(q.offer!.price).toBe(200);
   expect(acceptTrade(s,q.offer!)).toBe(true);expect(s.machines!.resource).toBe(before.machines!.resource-200);expect(s.states!.entries[0].reserve).toBe(0);expect(s.states!.entries[0].tradeReserve).toBe(200);expect(s.machines!.resource+s.states!.entries[0].tradeReserve!).toBe(before.machines!.resource);
   expect(c.economy).toEqual({...e,revision:e!.revision+1});expect(c.defense!.health).toBe(health);expect(cityGuard(c)).toBeNull();expect(c.fortification).toBe(80);expect(s.military).toEqual(before.military);expect(s.machines!.fleet).toEqual(before.machines!.fleet);
   const original=before.cities!.entries.find(v=>v.capture)!;expect(s.cities!.entries.find(v=>v.capture)).toEqual(original);
   const settled=structuredClone([s.machines,s.states,s.cities]);expect(acceptTrade(s,q.offer!)).toBe(false);expect([s.machines,s.states,s.cities]).toEqual(settled);
   expect(applyCityOrder(s,c.id,{kind:'fund'},revision)).toBe(false);expect(()=>round(s)).not.toThrow();return s;};expect(run()).toEqual(run());
 });
 it('last-city sale defeats the state, freezes proceeds, permits paid local economy and home continuation',()=>{
  const {s,c}=bought(),r=s.states!.entries[0],guards=structuredClone(c.defense),before=s.machines!.resource;expect(stateOpportunity(s,r).reason).toContain('poslední');
  expect(applyCityOrder(s,c.id,{kind:'fund'},cityCommandRevision(c))).toBe(true);expect(s.machines!.resource).toBe(before-20);advance(s,20);expect(r.tradeReserve).toBe(200);expect(r.reserve).toBe(0);expect(c.defense).toEqual(guards);expect(c.economy!.cycle).toBe(2);
  returnHome(s);const amber=s.machines!.resource;advance(s,10);expect(s.machines!.resource).toBeCloseTo(amber+18);expect(c.economy!.cycle).toBe(2);expect(()=>round(s)).not.toThrow();
 });
 it('non-last sale is 140, does not cause a counterattack and solvent remaining state refuses its last city',()=>{
  const {s,c}=bought(1),r=s.states!.entries[1];expect(tradeTransfers(c)[0].price).toBe(140);expect(r.reserve).toBe(40);expect(r.tradeReserve).toBe(140);expect(raidOpportunity(s,r)).toBeNull();advance(s,20);expect(s.military!.raids).toHaveLength(1);
  const remaining=target(s,1);enterCity(s,remaining.id);expect(tradeQuote(s,remaining).reason).toContain('poslední');expect(()=>round(s)).not.toThrow();
 });
 it('prepared treasury shortages spend original reserve first, then exactly seven paid civil transfers; checkpoints restore both',()=>{
  const {s}=bought(1),r=s.states!.entries[1],c=target(s,1);enterCity(s,c.id);const old=structuredClone(r.transactions);
  // Explicit unit-test input, not a played campaign: account for exhausted treasury without inventing income.
  for(let i=0;i<9;i++){
   const e=c.economy!;e.ledger.upkeep+=e.treasury;e.treasury=0;e.cycle+=10;e.last={cycle:e.cycle,income:0,upkeep:0,produced:0,consumed:0,discarded:0,happiness:0,workers:0,hungry:0,funded:false};expect(()=>round(s)).not.toThrow();
   makeCheckpoint(s);const reserve=r.reserve,civil=r.tradeReserve;advance(s,10);
   expect(r.transactions.at(-1)!.account).toBe(i<2?'reserve':'trade');expect(r.reserve+r.tradeReserve!).toBe(reserve+civil!-20);expect(()=>round(s)).not.toThrow();
   const restored=recoverGeneration(round(s));expect(restored.states!.entries[1].reserve).toBe(reserve);expect(restored.states!.entries[1].tradeReserve).toBe(civil);
  }
  expect(r.reserve).toBe(0);expect(r.tradeReserve).toBe(0);expect(r.transactions.filter(t=>t.account==='trade')).toHaveLength(7);expect(r.transactions.slice(0,old.length)).toEqual(old);
  returnHome(s);advance(s,125);enterCity(s,c.id);expect(acceptTrade(s,tradeQuote(s,c).offer!)).toBe(true);expect(()=>round(s)).not.toThrow();
 });
 it('a later commercial receipt cannot launder resurrected guard health from an earlier F-only military capture',()=>{
  const s=base(),c=s.cities!.entries.find(c=>c.capture)!,capture=c.capture!,r=s.states!.entries[0];s.checkpoint=null;
  // Prepared equivalent F-only chain retains the actual E economy snapshot; not a claimed played result.
  c.capture=null;c.transfers!.unshift({from:capture.from,to:{kind:'lineage',id:s.homePlanet!.id},unitId:capture.unitId,raidId:null,turn:r.transactions.find(t=>t.action.kind==='raid')!.turn-1,elapsed:capture.elapsed,economy:capture.economy});c.transfers!.pop();c.owner={kind:'state',id:r.id};expect(()=>round(s)).not.toThrow();
  returnHome(s);advance(s,200);enterCity(s,c.id);expect(acceptTrade(s,tradeQuote(s,c).offer!)).toBe(true);expect(()=>round(s)).not.toThrow();
  c.defense!.health=1;tradeTransfers(c).at(-1)!.defenseHealth=1;expect(()=>round(s)).toThrow();
 });
 it.each(['money','revision','cycle','treasury','reserve','civil','owner','transfers'])('rejects stale or unaffordable %s atomically',kind=>{
  const {s,c}=earned(),q=tradeQuote(s,c);
  if(kind==='money')s.machines!.resource=0;if(kind==='revision')c.economy!.revision++;if(kind==='cycle')c.economy!.cycle++;if(kind==='treasury')c.economy!.treasury++;if(kind==='reserve')s.states!.entries[0].reserve=1;if(kind==='civil')s.states!.entries[0].tradeReserve=1;if(kind==='owner')c.owner={kind:'lineage',id:s.homePlanet!.id};if(kind==='transfers')c.transfers!.push({from:c.owner,to:{kind:'lineage',id:s.homePlanet!.id},unitId:14,raidId:null,turn:s.states!.clock.turn,elapsed:5,economy:null});
  const before=structuredClone([s.machines,s.states,s.cities]);expect(acceptTrade(s,q.offer!)).toBe(false);expect([s.machines,s.states,s.cities]).toEqual(before);
 });
 it.each(['preparing','outbound','waiting','field','occupying','garrison','retreat','returning'] as const)('refuses seller raid phase %s even after quote',phase=>{
  const {s,c}=earned(),q=tradeQuote(s,c);s.military!.raids![0].phase=phase;const before=structuredClone([s.machines,s.states,s.cities]);expect(acceptTrade(s,q.offer!)).toBe(false);expect(navigation(s)!.notice).toContain('odmítá jednat');expect([s.machines,s.states,s.cities]).toEqual(before);
 });
 it('refuses player deployment, attack, occupation and retreat; no selling a battlefield',()=>{
  const {s,c}=earned(),q=tradeQuote(s,c);expect(deployMachine(s,c,14)).toBe(true);for(const order of ['stop','attack','occupy','retreat'] as const){s.military!.deployment!.order=order;expect(acceptTrade(s,q.offer!)).toBe(false);expect(navigation(s)!.notice).toContain('nasazený');}expect(c.owner.kind).toBe('state');
 });
 it('rejects global, other location, dead, wrong stage, unavailable route or absent source',()=>{
  for(const change of [(s:GameState)=>openAtlas(s),(s:GameState)=>returnHome(s),(s:GameState)=>s.player.health=0,(s:GameState)=>s.stage=5,(s:GameState)=>{activeMachines(s)!.springs.forEach(p=>p.owner='neutral');}]){const {s,c}=earned(),q=tradeQuote(s,c);change(s);const before=structuredClone([s.machines,s.states,s.cities]);expect(acceptTrade(s,q.offer!)).toBe(false);expect([s.machines,s.states,s.cities]).toEqual(before);}
 });
 it('waiting and global time cannot create commerce, and inactive cities have no catch-up',()=>{
  const {s,c}=earned(),before=s.machines!.resource;advance(s,30);expect(c.transfers).toEqual([]);expect(s.machines!.resource).toBe(before);openAtlas(s);const frozen=structuredClone([s.states,s.cities,s.machines]);advance(s,40);expect([s.states,s.cities,s.machines]).toEqual(frozen);navigation(s)!.mode='local';returnHome(s);const e=structuredClone(c.economy);advance(s,20);enterCity(s,c.id);expect(c.economy).toEqual(e);
 });
 it('checkpoint before/after settlement replaces the complete branch, including both accounts; rekey is inert',()=>{
  const {s,c}=earned();makeCheckpoint(s);const before=structuredClone(s);expect(acceptTrade(s,tradeQuote(s,c).offer!)).toBe(true);s.id='line-g-rekey';const cp=JSON.parse(s.checkpoint!);cp.id=s.id;s.checkpoint=JSON.stringify(cp);const restored=recoverGeneration(round(s));expect(restored.machines).toEqual(before.machines);expect(restored.states).toEqual(before.states);expect(restored.cities).toEqual(before.cities);
  makeCheckpoint(s);const after=structuredClone(s);advance(s,20);const restoredAfter=recoverGeneration(round(s));expect(restoredAfter.machines).toEqual(after.machines);expect(restoredAfter.states).toEqual(after.states);expect(restoredAfter.cities).toEqual(after.cities);expect(()=>round(restoredAfter)).not.toThrow();
 });
 it.each(['price','source','recipient','debit','credit','civil','reserve','id','method','decision','guard','fort','duplicate','prefix'])('rejects tampered %s receipt/account/checkpoint',kind=>{
  const {s,c}=bought(),t=tradeTransfers(c)[0];
  if(kind==='price')t.price++;if(kind==='source')(t.payment as {source:string}).source='city';if(kind==='recipient')t.payment.recipient='other';if(kind==='debit')t.payment.after++;if(kind==='credit')t.payment.receivedAfter++;if(kind==='civil')s.states!.entries[0].tradeReserve!++;if(kind==='reserve')s.states!.entries[0].reserve++;if(kind==='id')t.id+='x';if(kind==='method')(t as {method:string}).method='military';if(kind==='decision')t.decision.cities=2;if(kind==='guard')t.defenseHealth=0;if(kind==='fort')t.fortification=0;if(kind==='duplicate')c.transfers!.push(structuredClone(t));if(kind==='prefix'){makeCheckpoint(s);t.payment.before++;t.payment.after++;}
  expect(()=>round(s)).toThrow();
 });
 it('still plays actual F combat after activating G, preserving original E and F transfers',()=>{
  const s=parseGame(readFileSync('tests/fixtures/geography/sp-009e-military.save.json','utf8'));enableTrade(s);navigation(s)!.mode='local';const c=s.cities!.entries.find(c=>c.capture)!;enterCity(s,c.id);advance(s,100);expect(c.owner.kind).toBe('state');expect(c.transfers).toHaveLength(1);expect(tradeQuote(s,c).reason).toContain('odmítá jednat');returnHome(s);advance(s,20);expect(repairMachines(s,[12]).ok).toBe(true);enterCity(s,c.id);expect(deployMachine(s,c,12)).toBe(true);for(let i=0;i<600;i++)stepMilitary(s,1/30);militaryOrder(s,'attack');for(let i=0;i<3000;i++)stepMilitary(s,1/30);militaryOrder(s,'occupy');for(let i=0;i<1200;i++)stepMilitary(s,1/30);expect(c.owner.kind).toBe('lineage');expect(c.transfers).toHaveLength(2);expect(()=>round(s)).not.toThrow();
 });
 it.each(readdirSync('tests/fixtures/geography').filter(f=>f.endsWith('.save.json')))('migrates historical %s repeatably before rekey with full checkpoint',file=>{
  const data=readFileSync('tests/fixtures/geography/'+file,'utf8'),s=parseGame(data);enableTrade(s);const once=JSON.stringify(s);enableTrade(s);expect(JSON.stringify(s)).toBe(once);s.id='line-g-history';if(s.checkpoint){const cp=JSON.parse(s.checkpoint);cp.id=s.id;s.checkpoint=JSON.stringify(cp);}expect(()=>round(s)).not.toThrow();if(s.checkpoint)expect(()=>round(recoverGeneration(s))).not.toThrow();expect(readFileSync('tests/fixtures/geography/'+file,'utf8')).toBe(data);
 });
});
