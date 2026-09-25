import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe,it,expect } from 'vitest';
import { parseGame,serializeGame } from '../src/game/persistence';
import { enableMilitary,deployMachine,militaryOrder,stepMilitary,DEFENSE_COST,militaryWorld,tankRadius,deploymentQuote } from '../src/game/military';
import { stepStates,executeStateDecision,stateOpportunity } from '../src/game/states';
import { activeMachines,buildMachine,machineShot,repairMachines } from '../src/game/machines';
import { initialVehicle,vehicleStats } from '../src/game/blueprint';
import { cityLot,buildingSite,CITY_LOTS } from '../src/game/city-spatial';
import { MilitaryPresentation } from '../src/render/military';
import { createMachine } from '../src/render/machine';
import { disposeObject } from '../src/render/organism';
import * as THREE from 'three';
import { enterCity } from '../src/game/cities';
import { returnHome,navigation,openAtlas,fieldGround } from '../src/game/planet-travel';
import { initialBuildingDesign,type BuildingAppearance } from '../src/game/building-design';
import { applyCityOrder } from '../src/game/city-economy';
import { planetAtlas } from '../src/game/planet-geography';
import { step,makeCheckpoint,recoverGeneration } from '../src/game/simulation';
import { EMPTY_INPUT,type GameState } from '../src/game/types';
const bytes=readFileSync('tests/fixtures/geography/sp-009d-states.save.json','utf8');
const round=(s:GameState)=>parseGame(serializeGame(s));
function base(){const s=parseGame(bytes);enableMilitary(s);navigation(s)!.mode='local';return s;}
function ready(){const s=base();returnHome(s);const m=activeMachines(s)!;for(let i=0;i<6000&&m.resource<56;i++)step(s,EMPTY_INPUT,1/30);expect(buildMachine(s,initialVehicle('tank','predator')).ok).toBe(true);const id=m.fleet.at(-1)!.id;
 for(let i=0;i<600;i++)stepStates(s,1/30);
 const c=s.cities!.entries.find(c=>c.owner.kind==='state'&&c.defense)!;expect(enterCity(s,c.id)).toBe(true);expect(deployMachine(s,c,id)).toBe(true);return {s,c,id};}
function advance(s:GameState,n=3000){for(let i=0;i<n;i++)stepMilitary(s,1/30);}
function win(){const t=ready();advance(t.s,600);expect(militaryOrder(t.s,'attack')).toBe(true);advance(t.s);expect(t.c.defense!.health).toBe(0);expect(militaryOrder(t.s,'occupy')).toBe(true);advance(t.s,600);expect(t.c.capture).not.toBeNull();return t;}
describe('SP-009.E military authority',()=>{
 it('byte-identical actual D; migration invents no purchases, damage or capture and is repeatable',()=>{
  expect(createHash('sha256').update(bytes).digest('hex')).toBe('e7e6329b53e4d9688a084207b1cbd74add0b2cfec9d20569d860969560fe3bbf');
  const s=parseGame(bytes),before=structuredClone(s);enableMilitary(s);expect(s.machines).toEqual(before.machines);expect(s.states!.entries).toEqual(before.states!.entries);
  expect(s.cities!.entries.every(c=>c.capture===null&&c.defense===null)).toBe(true);const migrated=JSON.stringify(s);enableMilitary(s);expect(JSON.stringify(s)).toBe(migrated);expect(round(s).military).toEqual(s.military);
 });
 it('finite paid defense, same turn cannot pay twice',()=>{const s=base(),reserve=s.states!.entries.map(r=>r.reserve);for(let i=0;i<600;i++)stepStates(s,1/30);
  for(const [i,r] of s.states!.entries.entries()){expect(r.reserve).toBe(reserve[i]-2*DEFENSE_COST);expect(r.transactions.filter(t=>t.action.kind==='defend')).toHaveLength(2);expect(executeStateDecision(s,r.id,s.states!.clock.turn)).toBe(false);}
  expect(()=>round(s)).not.toThrow();
 });
 it('actual deterministic fight and occupation, original receipts preserved, no reward',()=>{const a=win(),b=win();expect(a.s.military).toEqual(b.s.military);expect(a.c).toEqual(b.c);expect(a.c.owner.kind).toBe('lineage');expect(a.c.founded.source).toBe('state');
  const u=activeMachines(a.s)!.fleet.find(u=>u.id===a.id)!;expect(u.health).toBeLessThan(vehicleStats(initialVehicle('tank','predator')).durability);expect(u.health).toBeGreaterThan(0);
  const before=serializeGame(a.s);expect(militaryOrder(a.s,'occupy')).toBe(false);advance(a.s,30);expect(a.c.capture).toEqual(b.c.capture);expect(()=>round(a.s)).not.toThrow();expect(before).toContain('capture');
 });
 it('economy permissions follow owner; post-capture construction/demolition and appearance retain historic ledger',()=>{const {s,c}=ready();expect(applyCityOrder(s,c.id,{kind:'fund'},c.economy!.revision)).toBe(false);advance(s,600);militaryOrder(s,'attack');advance(s);militaryOrder(s,'occupy');advance(s,600);
  returnHome(s);for(let i=0;i<900;i++)step(s,EMPTY_INPUT,1/30);enterCity(s,c.id);const revision=c.economy!.revision;expect(applyCityOrder(s,c.id,{kind:'fund'},revision)).toBe(true);expect(applyCityOrder(s,c.id,{kind:'fund'},revision)).toBe(false);
  const e=c.economy!,snapshot=structuredClone(c.capture),lot=CITY_LOTS.find(l=>!buildingSite(s,c,l.id,'park'))!;
  expect(applyCityOrder(s,c.id,{kind:'build',building:'park',lot:lot.id},e.revision)).toBe(true);const park=e.buildings.at(-1)!;
  const appearance:BuildingAppearance={version:1,source:'creation',creation:{format:'lumavora-building',version:1,id:'post-capture',revision:1,createdAt:1,updatedAt:1,name:'Zahrada po převzetí',design:initialBuildingDesign('park')}};
  const treasury=e.treasury,ledger=structuredClone(e.ledger);expect(applyCityOrder(s,c.id,{kind:'appearance',id:park.id,appearance},e.revision)).toBe(true);expect(e.treasury).toBe(treasury);expect(e.ledger).toEqual(ledger);expect(()=>round(s)).not.toThrow();
  expect(applyCityOrder(s,c.id,{kind:'demolish',id:park.id},e.revision)).toBe(true);expect(e.treasury).toBe(treasury);expect(c.capture).toEqual(snapshot);expect(()=>round(s)).not.toThrow();
 });
 it('outbound/save/load/return preserve the one unit, health and home anchor',()=>{const {s,c,id}=win();const d=s.military!.deployment!,home=structuredClone(d.home),health=activeMachines(s)!.fleet.find(u=>u.id===id)!.health;expect(()=>round(s)).not.toThrow();militaryOrder(s,'retreat');advance(s,4000);expect(s.military!.deployment).toBeNull();const u=activeMachines(s)!.fleet.find(u=>u.id===id)!;expect(u.pos).toEqual(home);expect(u.health).toBe(health);expect(s.cities!.entries.find(v=>v.id===c.id)!.capture).toBeTruthy();expect(()=>round(s)).not.toThrow();});
 it('departure/global freeze, interrupted occupation and active-city local time',()=>{const {s,c}=ready();advance(s,600);militaryOrder(s,'attack');advance(s);militaryOrder(s,'occupy');advance(s,100);openAtlas(s);const frozen=structuredClone(s);for(let i=0;i<100;i++)step(s,EMPTY_INPUT,1/30);expect(s).toEqual(frozen);
  returnHome(s);stepMilitary(s,1/30);expect(s.military!.deployment!.hold).toBe(0);const hp=c.defense!.health;advance(s);expect(c.defense!.health).toBe(hp);enterCity(s,c.id);expect(()=>round(s)).not.toThrow();
 });
 it('checkpoint restores complete pre-purchase branch and permits one new future payment',()=>{const s=base();makeCheckpoint(s);const before=structuredClone(s.states);for(let i=0;i<600;i++)stepStates(s,1/30);const restored=recoverGeneration(round(s));expect(restored.states).toEqual(before);expect(restored.cities!.entries.every(c=>c.defense===null)).toBe(true);expect(()=>round(restored)).not.toThrow();});
 it('checkpoint before capture restores owner, defense and canonical tank, without merging',()=>{const {s,c}=ready();advance(s,600);makeCheckpoint(s);const before=structuredClone(s);militaryOrder(s,'attack');advance(s);militaryOrder(s,'occupy');advance(s,600);const restored=recoverGeneration(round(s));expect(restored.cities).toEqual(before.cities);expect(restored.machines).toEqual(before.machines);expect(restored.military).toEqual(before.military);});
 it('shot requires range and line of sight, consumes cooldown and damages only once',()=>{const {s,c}=ready(),w=militaryWorld(s,c),a={pos:{x:0,y:1,z:0},cooldown:0},b={pos:{x:13,y:1,z:0},health:30};expect(machineShot(w,a,b,5,12)).toBe(false);b.pos.x=10;w.obstacles=[{id:1,kind:'rock',pos:{x:5,y:-5,z:0},radius:2,height:20}];expect(machineShot(w,a,b,5,12)).toBe(false);w.obstacles=[];expect(machineShot(w,a,b,5,12)).toBe(true);expect(b.health).toBe(20);machineShot(w,a,b,5,12);expect(b.health).toBe(20);});
 it('dead attacker cannot capture; guard never regenerates on revisit',()=>{const {s,c,id}=ready();advance(s,600);const u=activeMachines(s)!.fleet.find(u=>u.id===id)!;u.health=1;militaryOrder(s,'attack');advance(s);expect(s.military!.deployment).toBeNull();expect(c.capture).toBeNull();expect(activeMachines(s)!.fleet.some(u=>u.id===id)).toBe(false);const health=c.defense!.health;returnHome(s);enterCity(s,c.id);advance(s);expect(c.defense!.health).toBe(health);expect(()=>round(s)).not.toThrow();});
 it.each(['owner','defense','capture','route','health','version'])('rejects malformed %s',kind=>{const {s,c}=ready();if(kind==='owner')c.owner={kind:'lineage',id:s.homePlanet!.id};if(kind==='defense')c.defense!.transactionId='fake';if(kind==='capture')(c as any).capture={};if(kind==='route')s.military!.deployment!.route=[0,1];if(kind==='health')c.defense!.health=Infinity;if(kind==='version')(s.military as any).version=2;expect(()=>round(s)).toThrow();});
 it('rejects rewritten source or transaction of captured economy and player founding',()=>{
  const {s,c}=win();(c.economy as any).version=2;(c.economy!.opened as any).source='player';delete (c.economy!.opened as any).transactionId;expect(()=>round(s)).toThrow();
  const b=base(),own=b.cities!.entries.find(c=>c.founded.source==='player')!;(own.economy as any).version=3;(own.economy!.opened as any).source='state';(own.economy!.opened as any).transactionId='fake';expect(()=>round(b)).toThrow();
 });
 it('prevents player and strategic placement over a deployed tank',()=>{
  const {s,c,id}=win(),u=activeMachines(s)!.fleet.find(u=>u.id===id)!;
  const lot=CITY_LOTS.find(l=>!buildingSite(s,c,l.id,'park'))!;expect(lot).toBeTruthy();const p=cityLot(c,lot.id)!;u.pos={...p,y:fieldGround(s.seed,planetAtlas(s.homePlanet!)!.cells[navigation(s)!.fields.find(f=>f.id===c.address.locationId)!.cellId],p.x,p.z)+.8};
  expect(buildingSite(s,c,lot.id,'park')).toContain('tank');const treasury=c.economy!.treasury;expect(applyCityOrder(s,c.id,{kind:'build',building:'park',lot:lot.id},c.economy!.revision)).toBe(false);expect(c.economy!.treasury).toBe(treasury);
 });
 it('conservative footprint encloses original renderer across hull scales/angles and modules',()=>{
  for(const scale of [.55,1,1.65])for(const angle of [-Math.PI,-1,0,1,Math.PI]){
    const g=initialVehicle('tank','predator');g.length=2.4;g.width=1.8;for(const p of g.parts){p.scale=scale;p.angle=angle;p.axial=.93;}const model=createMachine(g);model.updateMatrixWorld(true);const point=new THREE.Vector3(),radius=tankRadius(g);
    model.traverse(o=>{if(o instanceof THREE.Mesh){const vertices=o.geometry.attributes.position;for(let i=0;i<vertices.count;i++){point.fromBufferAttribute(vertices,i).applyMatrix4(o.matrixWorld);expect(Math.hypot(point.x,point.z)).toBeLessThanOrEqual(radius);}}});disposeObject(model);
  }
 });
 it('after both actual captures the defeated state cannot found again or receive resources',()=>{
  const {s,c,id}=win(),state=s.states!.entries.find(r=>r.id===c.foundingOwner!.id)!;
  militaryOrder(s,'retreat');advance(s,4000);returnHome(s);for(let i=0;i<300;i++)step(s,EMPTY_INPUT,1/30);
  const u=activeMachines(s)!.fleet.find(u=>u.id===id)!; // A paid repair uses original API in this prepared simulation branch.
  const other=s.cities!.entries.find(v=>v.owner.id===state.id)!;expect(repairMachines(s,[id]).ok).toBe(true);expect(enterCity(s,other.id)).toBe(true);expect(deployMachine(s,other,id)).toBe(true);advance(s,600);militaryOrder(s,'attack');advance(s);militaryOrder(s,'occupy');advance(s,600);expect(other.capture).toBeTruthy();
  const reserve=state.reserve,tx=state.transactions.length;expect(stateOpportunity(s,state).reason).toContain('poslední');for(let i=0;i<600;i++)stepStates(s,1/30);expect(state.reserve).toBe(reserve);expect(state.transactions).toHaveLength(tx);expect(()=>round(s)).not.toThrow();
 });
 it('roundtrip/rekey mid-transport and mid-occupation keeps one paid unit',()=>{
  let {s,c,id}=ready();advance(s,15);s=round(s);s.id='line-rekey-military';if(s.checkpoint){const cp=JSON.parse(s.checkpoint);cp.id=s.id;s.checkpoint=JSON.stringify(cp);}s=round(s);advance(s,600);militaryOrder(s,'attack');advance(s);militaryOrder(s,'occupy');
  for(let i=0;i<1000&&s.military!.deployment!.hold<1;i++)stepMilitary(s,1/30);expect(s.military!.deployment!.hold).toBeGreaterThan(0);s=round(s);advance(s,300);expect(s.cities!.entries.find(v=>v.id===c.id)!.capture!.unitId).toBe(id);expect(activeMachines(s)!.fleet.filter(u=>u.id===id)).toHaveLength(1);
 });
 it.each(readdirSync('tests/fixtures/geography').filter(f=>f.endsWith('.save.json')))('explicit historical migration/checkpoint/rekey %s',file=>{
  const data=readFileSync('tests/fixtures/geography/'+file,'utf8'),s=parseGame(data),history=JSON.stringify([s.worlds,s.player,s.machines,s.journey,s.lineageHistory]);enableMilitary(s);expect(JSON.stringify([s.worlds,s.player,s.machines,s.journey,s.lineageHistory])).toBe(history);const once=JSON.stringify(s);enableMilitary(s);expect(JSON.stringify(s)).toBe(once);expect(()=>round(s)).not.toThrow();expect(readFileSync('tests/fixtures/geography/'+file,'utf8')).toBe(data);
  s.id='line-import-check';if(s.checkpoint){const cp=JSON.parse(s.checkpoint);cp.id=s.id;s.checkpoint=JSON.stringify(cp);}expect(()=>round(s)).not.toThrow();if(s.checkpoint)expect(()=>round(recoverGeneration(s))).not.toThrow();
 });

 it('military renderer places the original machine model on local ground',()=>{const {s,c,id}=ready();advance(s,600);const view=new MilitaryPresentation();view.update(s);view.group.updateMatrixWorld(true);const positions=[c.defense!.pos,activeMachines(s)!.fleet.find(u=>u.id===id)!.pos];view.group.children.forEach((root,i)=>{const bounds=new THREE.Box3().setFromObject(root.children[0]);expect(bounds.min.y).toBeCloseTo(positions[i].y-.8,5);});view.dispose();});

});
