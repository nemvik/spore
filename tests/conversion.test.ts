import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import { parseGame,serializeGame } from '../src/game/persistence';
import { enableConversion,conversionQuote,conversionProgress,conversionResponse,conversionSite,performConversion, type Rite } from '../src/game/conversion';
import { enableTrade,tradeQuote,acceptTrade } from '../src/game/trade';
import { cityGuard,enterCity, type City } from '../src/game/cities';
import { cityCommandRevision,raidOpportunity } from '../src/game/defense';
import { deployMachine,stepMilitary,militaryOrder } from '../src/game/military';
import { stateOpportunity } from '../src/game/states';
import { activeMachines,repairMachines } from '../src/game/machines';
import { applyCityOrder } from '../src/game/city-economy';
import { activeField,navigation,returnHome,openAtlas } from '../src/game/planet-travel';
import { step,makeCheckpoint,recoverGeneration } from '../src/game/simulation';
import { EMPTY_INPUT,type GameState } from '../src/game/types';
const bytes=readFileSync('tests/fixtures/geography/sp-009g-trade.save.json','utf8');
const round=(s:GameState)=>parseGame(serializeGame(s));
const advance=(s:GameState,seconds:number)=>{for(let i=0;i<seconds*30;i++)step(s,EMPTY_INPUT,1/30);};
function base(){const s=parseGame(bytes);enableConversion(s);navigation(s)!.mode='local';return s;}
const target=(s:GameState)=>s.cities!.entries.find(c=>c.owner.id===s.states!.entries[1].id)!;
function earned(){const s=base();returnHome(s);advance(s,140);const c=target(s);expect(enterCity(s,c.id)).toBe(true);return {s,c};}
// Unit tests position the avatar directly, explicitly prepared spatial inputs; browser walks.
function at(s:GameState,c:City,complete=false){activeField(s)!.position={...conversionSite(s,c,conversionProgress(c),complete)};}
function rite(s:GameState,c:City,wrong=false){at(s,c);const q=conversionQuote(s,c),answer=conversionResponse(q.token!.situation,q.progress);return performConversion(s,q.token!,'rite',wrong?(['sharing','peace','memory'] as Rite[]).find(r=>r!==answer)!:answer);}
function seals(s:GameState,c:City){while(conversionProgress(c)<conversionQuote(s,c).required)expect(rite(s,c)).toBe(true);}
function finish(s:GameState,c:City){at(s,c,true);return performConversion(s,conversionQuote(s,c).token!,'complete');}
const financial=(s:GameState)=>structuredClone([s.machines!.resource,s.states!.entries.map(r=>[r.reserve,r.tradeReserve]),s.cities!.entries.map(c=>[c.owner,c.conversion,c.transfers,c.economy])]);
describe('SP-009.H religious continuation of actual G',()=>{
 it('uses the byte-identical G export and migrates live/checkpoint idempotently without history or funds',()=>{
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('ef18ee498054528ab141fd3a69acde110d007fc6188a2e348862f8bbc34b6386');
  const s=parseGame(bytes),old=structuredClone(s);enableConversion(s);expect(s.cities!.version).toBe(8);
  for(const c of s.cities!.entries){expect(c.conversion).toEqual({version:1,events:[]});const {conversion,...rest}=c;expect(rest).toEqual(old.cities!.entries.find(v=>v.id===c.id));}
  expect(s.states).toEqual(old.states);expect(s.machines).toEqual(old.machines);expect(s.lineageHistory).toEqual(old.lineageHistory);
  expect(JSON.parse(s.checkpoint!).cities.version).toBe(8);const once=JSON.stringify(s);enableConversion(s);enableTrade(s);expect(JSON.stringify(s)).toBe(once);expect(()=>round(s)).not.toThrow();
 });
 it('earns finite home funds, performs three different-site rites and atomically converts once with all assets preserved',()=>{
  const {s,c}=earned(),before=s.machines!.resource,assets=structuredClone([c.economy,c.defense,c.fortification,s.military,s.machines!.fleet,s.states,s.lineageHistory]),founding=structuredClone([c.founded,c.foundingOwner]);
  seals(s,c);expect(conversionProgress(c)).toBe(3);const token=conversionQuote(s,c).token!;at(s,c,true);expect(performConversion(s,token,'complete')).toBe(true);expect(performConversion(s,token,'complete')).toBe(false);
  expect(s.machines!.resource).toBe(before-80);expect(c.transfers!.at(-1)).toMatchObject({method:'conversion',spent:80,eventId:4});expect(c.owner.kind).toBe('lineage');expect(cityGuard(c)).toBeNull();
  expect([c.founded,c.foundingOwner]).toEqual(founding);expect(c.economy).toEqual({...assets[0] as object,revision:(assets[0] as NonNullable<City['economy']>).revision+1});expect([c.defense,c.fortification,s.military,s.machines!.fleet,s.states,s.lineageHistory]).toEqual(assets.slice(1));expect(()=>round(s)).not.toThrow();
  expect(raidOpportunity(s,s.states!.entries[1])).toBeNull();expect(applyCityOrder(s,c.id,{kind:'fund'},cityCommandRevision(c))).toBe(true);expect(()=>round(s)).not.toThrow();
 });
 it('is deterministic for the same state, actions and fixed simulation steps',()=>{
  const run=()=>{const {s,c}=earned();rite(s,c);rite(s,c,true);seals(s,c);finish(s,c);return JSON.stringify(s);};expect(run()).toBe(run());
 });
 it('wrong response costs exactly 20 and loses one seal, renunciation costs zero even with an empty home',()=>{
  const {s,c}=earned();rite(s,c);const before=s.machines!.resource;expect(rite(s,c,true)).toBe(true);expect(conversionProgress(c)).toBe(0);expect(s.machines!.resource).toBe(before-20);expect(navigation(s)!.notice).toContain('odmítli');rite(s,c);
  // Explicitly prepared shortage, not a played financial result.
  s.machines!.resource=0;expect(performConversion(s,conversionQuote(s,c).token!,'renounce')).toBe(true);expect(conversionProgress(c)).toBe(0);expect(s.machines!.resource).toBe(0);expect(()=>round(s)).not.toThrow();
 });
 it('insufficient home resources cannot draw from city/state/civil accounts; remote rites cannot pay',()=>{
  const s=base(),c=target(s);enterCity(s,c.id);expect(conversionQuote(s,c).available).toBe(false);const before=financial(s);at(s,c);expect(performConversion(s,conversionQuote(s,c).token!,'rite','memory')).toBe(false);expect(financial(s)).toEqual(before);
  const e=earned();expect(performConversion(e.s,conversionQuote(e.s,e.c).token!,'rite','memory')).toBe(false);expect(e.c.conversion!.events).toHaveLength(0);
 });
 it('waiting, global view, leaving and returning do not manufacture or lose seals, with no home/offline catch-up',()=>{
  const {s,c}=earned();rite(s,c);const log=structuredClone(c.conversion),home=s.machines!.resource;advance(s,30);expect(c.conversion).toEqual(log);expect(s.machines!.resource).toBe(home);openAtlas(s);const freeze=structuredClone([s.cities,s.states,s.machines]);advance(s,30);expect([s.cities,s.states,s.machines]).toEqual(freeze);expect(conversionQuote(s,c).reason).toContain('Přerušeno');returnHome(s);advance(s,2);enterCity(s,c.id);expect(conversionProgress(c)).toBe(1);expect(c.conversion).toEqual(log);seals(s,c);expect(finish(s,c)).toBe(true);
 });
 it('last city has additional resistance, freezes original reserves and G defeated sale remains frozen',()=>{
  const {s,c}=earned();seals(s,c);finish(s,c);advance(s,11);const last=target(s);enterCity(s,last.id);expect(conversionQuote(s,last).required).toBe(4);expect(tradeQuote(s,last).reason).toContain('poslední');for(let i=0;i<3;i++)rite(s,last);at(s,last,true);expect(finish(s,last)).toBe(false);rite(s,last);expect(finish(s,last)).toBe(true);advance(s,11);
  expect(s.states!.entries.map(r=>[r.reserve,r.tradeReserve])).toEqual([[0,203],[40,0]]);expect(s.states!.entries.every(r=>!stateOpportunity(s,r).available&&stateOpportunity(s,r).reason.includes('poslední'))).toBe(true);expect(s.military!.raids).toHaveLength(1);expect(()=>round(s)).not.toThrow();
 });
 it('greater actual reserves increase required rites; hunger and guards change the appropriate response',()=>{
  const s=parseGame(readFileSync('tests/fixtures/geography/sp-009d-states.save.json','utf8'));enableConversion(s);const c=s.cities!.entries.find(c=>c.owner.kind==='state')!;enterCity(s,c.id);const q=conversionQuote(s,c);expect(q.required).toBe(4);expect(conversionResponse({...q.token!.situation,food:0},0)).toBe('sharing');expect(conversionResponse({...q.token!.situation,guard:62},1)).toBe('peace');expect(conversionResponse({...q.token!.situation,guard:0},1)).toBe('sharing');
 });
 it.each(['owner','progress','food','reserve','revision','population','fortification','guard'])('stale %s commands are rejected before debit',kind=>{
  const {s,c}=earned();seals(s,c);at(s,c,true);const token=conversionQuote(s,c).token!;
  if(kind==='owner')c.owner={kind:'lineage',id:s.homePlanet!.id};if(kind==='progress')performConversion(s,token,'renounce');if(kind==='food')c.economy!.food++;if(kind==='reserve')s.states!.entries[1].reserve--;if(kind==='revision')c.economy!.revision++;if(kind==='population')c.economy!.residents.pop();if(kind==='fortification')c.fortification!--;if(kind==='guard')c.defense!.health--;
  const before=financial(s);expect(performConversion(s,token,'complete')).toBe(false);expect(financial(s)).toEqual(before);
 });
 it('ritual invalidates a pending G offer; G acquisition invalidates seals permanently with receipts retained',()=>{
  const {s,c}=earned(),offer=tradeQuote(s,c).offer!;rite(s,c);const after=financial(s);expect(acceptTrade(s,offer)).toBe(false);expect(financial(s)).toEqual(after);const token=conversionQuote(s,c).token!;expect(acceptTrade(s,tradeQuote(s,c).offer!)).toBe(true);expect(conversionProgress(c)).toBe(0);expect(c.conversion!.events).toHaveLength(1);expect(performConversion(s,token,'complete')).toBe(false);expect(()=>round(s)).not.toThrow();
 });
 it('H completion invalidates G, and one state cannot make two peaceful transfers in the same turn',()=>{
  const {s,c}=earned();seals(s,c);const offer=tradeQuote(s,c).offer!;finish(s,c);expect(acceptTrade(s,offer)).toBe(false);const last=target(s);enterCity(s,last.id);seals(s,last);expect(finish(s,last)).toBe(false);advance(s,11);expect(finish(s,last)).toBe(true);expect(()=>round(s)).not.toThrow();
 });
 it.each(['preparing','outbound','waiting','field','occupying','garrison','retreat','returning'] as const)('unresolved rival %s interrupts conversion without consuming anything',phase=>{
  const {s,c}=earned();rite(s,c);const token=conversionQuote(s,c).token!;const raid=structuredClone(s.military!.raids![0]);raid.stateId=c.owner.id;raid.phase=phase;s.military!.raids!.push(raid);const before=financial(s);expect(performConversion(s,token,'rite','peace')).toBe(false);expect(financial(s)).toEqual(before);expect(conversionProgress(c)).toBe(1);expect(conversionQuote(s,c).reason).toContain('vojenským');
 });
 it('actual E/F deployment and combat still work with H active',()=>{
  const s=parseGame(readFileSync('tests/fixtures/geography/sp-009e-military.save.json','utf8'));enableConversion(s);navigation(s)!.mode='local';const c=s.cities!.entries.find(c=>c.capture)!;enterCity(s,c.id);advance(s,100);expect(c.owner.kind).toBe('state');expect(conversionQuote(s,c).available).toBe(false);returnHome(s);advance(s,20);expect(repairMachines(s,[12]).ok).toBe(true);enterCity(s,c.id);expect(deployMachine(s,c,12)).toBe(true);for(let i=0;i<600;i++)stepMilitary(s,1/30);militaryOrder(s,'attack');for(let i=0;i<3000;i++)stepMilitary(s,1/30);militaryOrder(s,'occupy');for(let i=0;i<1200;i++)stepMilitary(s,1/30);expect(c.owner.kind).toBe('lineage');expect(c.transfers).toHaveLength(2);expect(()=>round(s)).not.toThrow();
 });
 it.each(['turn','reserve','cities','guard','civil','residents','oddResidents'])('rejects impossible partial-rite %s history',kind=>{
  const {s,c}=earned();rite(s,c);const e=c.conversion!.events[0];
  if(kind==='turn')e.turn=0;if(kind==='reserve')e.situation.reserve=400;if(kind==='cities')e.situation.cities=1;if(kind==='guard')e.situation.guard=0;if(kind==='civil')e.situation.tradeReserve=20;
  if(kind==='residents'){e.situation.residents=32;e.response='sharing';}if(kind==='oddResidents')e.situation.residents=3;
  expect(()=>round(s)).toThrow();
 });
 it('actual paid H attempt survives military takeover as history, but its seals never revive',()=>{
  const {s,c}=earned();returnHome(s);expect(repairMachines(s,[14]).ok).toBe(true);enterCity(s,c.id);rite(s,c);const paid=structuredClone(c.conversion);expect(deployMachine(s,c,14)).toBe(true);expect(conversionQuote(s,c).reason).toContain('vojenským');
  for(let i=0;i<600;i++)stepMilitary(s,1/30);militaryOrder(s,'attack');for(let i=0;i<5000;i++)stepMilitary(s,1/30);militaryOrder(s,'occupy');for(let i=0;i<1800;i++)stepMilitary(s,1/30);
  expect(c.owner.kind).toBe('lineage');expect(c.conversion).toEqual(paid);expect(conversionProgress(c)).toBe(0);expect(()=>round(s)).not.toThrow();
  // Explicit ownership-epoch unit probe; not claimed as a played recapture.
  c.transfers!.push({from:{...c.owner},to:{kind:'state',id:paid!.events[0].ownerId},unitId:1,raidId:null,turn:s.states!.clock.turn,elapsed:5,economy:structuredClone(c.economy!)});c.owner={kind:'state',id:paid!.events[0].ownerId};expect(conversionProgress(c)).toBe(0);
 });
 it('save/rekey and checkpoint restore the whole partial/complete branch without merging or refunds',()=>{
  const {s,c}=earned();rite(s,c);makeCheckpoint(s);const before=structuredClone([s.cities,s.machines,s.states,s.military]);seals(s,c);finish(s,c);s.id='line-h-rekey';const cp=JSON.parse(s.checkpoint!);cp.id=s.id;s.checkpoint=JSON.stringify(cp);const restored=recoverGeneration(round(s));expect([restored.cities,restored.machines,restored.states,restored.military]).toEqual(before);expect(conversionProgress(target(restored))).toBe(1);
  makeCheckpoint(s);const complete=structuredClone([s.cities,s.machines,s.states,s.military]);advance(s,11);const done=recoverGeneration(round(s));expect([done.cities,done.machines,done.states,done.military]).toEqual(complete);expect(()=>round(done)).not.toThrow();
 });
 it.each(['keys','version','amount','source','recipient','debit','sequence','epoch','owner','response','progress','position','event','spent','guard','fortification','resistance','prefix','future'])('rejects malformed %s data',kind=>{
  const {s,c}=earned();seals(s,c);finish(s,c);const e=c.conversion!.events[0],t=c.transfers!.at(-1)!;if(t.method!=='conversion')throw Error('missing result');
  if(kind==='keys')Object.assign(e,{extra:0});if(kind==='version')c.conversion!.version=2 as 1;if(kind==='amount')e.payment.amount--;if(kind==='source')e.payment.source='city' as 'home';if(kind==='recipient')Object.assign(e.payment,{recipient:'state'});if(kind==='debit')e.payment.after++;if(kind==='sequence')e.id++;if(kind==='epoch')e.epoch++;if(kind==='owner')e.ownerId+='x';if(kind==='response')e.response='sharing';if(kind==='progress')e.after=3;if(kind==='position')e.position.x=70;if(kind==='event')t.eventId=1;if(kind==='spent')t.spent++;if(kind==='guard')t.defenseHealth=0;if(kind==='fortification')t.fortification=0;if(kind==='resistance')c.conversion!.events.at(-1)!.situation.cities=1;if(kind==='prefix'){makeCheckpoint(s);e.payment.before++;e.payment.after++;}if(kind==='future')e.turn=s.states!.clock.turn+1;
  expect(()=>round(s)).toThrow();
 });
 it.each(readdirSync('tests/fixtures/geography').filter(f=>f.endsWith('.save.json')))('migrates historical %s with exact repeated checkpoint and preserved H past',file=>{
  const data=readFileSync('tests/fixtures/geography/'+file,'utf8'),s=parseGame(data),past=s.cities?.entries.map(c=>c.conversion?.events??[])??[];enableConversion(s);const once=JSON.stringify(s);enableConversion(s);expect(JSON.stringify(s)).toBe(once);expect(s.cities!.entries.map(c=>c.conversion!.events)).toEqual(past);s.id='line-h-history';if(s.checkpoint){const cp=JSON.parse(s.checkpoint);cp.id=s.id;s.checkpoint=JSON.stringify(cp);}expect(()=>round(s)).not.toThrow();if(s.checkpoint)expect(()=>round(recoverGeneration(s))).not.toThrow();expect(readFileSync('tests/fixtures/geography/'+file,'utf8')).toBe(data);
 });
});
