import { obstacleSegmentEntry } from './obstacle-geometry';
import type { ActiveMachineState, MachineRegion, MachineUnit } from './era-types';
import type { GameState, Vec3, World } from './types';
import type { UnitOrder, UnitTarget } from './unit-order';
import type { VehicleBlueprint } from './blueprint';
import { initialVehicle, quoteVehicle, vehicleCost, vehicleStats } from './blueprint';
import { orderedIds, MAX_UNIT_ORDERS, validOrderShape } from './unit-order';
import { activeTribe, tribeHome, type TribeAction } from './tribe';
import { clamp, groundHeight, horizontalDistance } from './random';
import { moveUnit, openGround, unitNavigation } from './unit-motion';
import { MACHINE_COPY as C } from './machine-copy.cs';
import { tribeInheritance } from './lineage-history';

export const activeMachines=(s:GameState):ActiveMachineState|null=>s.machines?.version===2?s.machines:null;
export const machineHome=(s:GameState):Vec3=>tribeHome(activeTribe(s)!);
export const machineIncome=(m:ActiveMachineState):number=>m.springs.filter(p=>p.owner==='player').reduce((n,p)=>n+p.rate,0);
export const machineDesign=(m:ActiveMachineState,u:MachineUnit):VehicleBlueprint=>m.blueprints.find(d=>d.id===u.blueprint)!.blueprint;
export const effectiveMachineIncome=(s:GameState):number=>{const m=activeMachines(s);return m?machineIncome(m)*(s.stage===4?tribeInheritance(s).income:1):0;};
export const machineRegionPower=(s:GameState,base:number):number=>base*(s.stage===4?tribeInheritance(s).power:1);
export const machinesReady=(s:GameState):boolean=>{const m=activeMachines(s);return !!m&&m.fleet.some(u=>u.health>0)&&m.regions.every(r=>r.owner==='player')&&m.springs.filter(p=>p.owner==='player').length>=2;};
export function minimumMachineCost():number {return Math.min(...(['restoration','predator','migration'] as const).map(archetype=>{const g=initialVehicle('tank',archetype);for(const p of g.parts)p.scale=.55;return vehicleCost(g);}));}
/** Aircraft cannot restart amber extraction. Offer recovery without destroying
 * a still-living fleet when no ground carrier can be financed. */
export function machineEconomyStranded(s:GameState):boolean {const m=activeMachines(s);return s.stage===4&&!!m&&machineIncome(m)===0&&m.resource<minimumMachineCost()&&!m.fleet.some(u=>u.health>0&&machineDesign(m,u).carrier==='tank');}
const fail=(message:string):TribeAction=>({ok:false,message});
const playable=(s:GameState)=>s.stage===4&&!s.deathReason&&!s.military?.deployment?activeMachines(s):null;

/** Once-only stage construction; the inherited coast receives a real closed
 * cliff ring. It is ordinary saved collision geometry, not an AI-only veto. */
export function createMachines(s:GameState):ActiveMachineState {
  const t=activeTribe(s)!,home=tribeHome(t);let nextId=1;
  const regions:MachineRegion[]=(['gardens','terraces','highlands'] as const).map((identity,i)=>({id:nextId++,identity,
    pos:i<2?{...t.neighbours.find(n=>n.identity===(i===0?'garden':'terrace'))!.pos}:{x:50,y:groundHeight(50,-48,2),z:-48},airOnly:i===2,owner:'neutral',method:null,
    health:i===1?320:240,soil:i===0?20:0,settlers:0,relation:0,deliveries:0,alarm:0,cooldown:0}));
  const centers=[{x:home.x+10,y:0,z:home.z+10},{x:regions[0].pos.x+10,y:0,z:regions[0].pos.z+5},{x:regions[1].pos.x-10,y:0,z:regions[1].pos.z+8}];
  const springs=centers.map((center,i)=>({id:nextId++,pos:openGround(s.world,center,i,2),owner:'neutral' as const,progress:0,rate:.6+i*.3}));
  const barrierIds:number[]=[];const summit=regions[2].pos;
  for(let i=0;i<16;i++){const angle=i*Math.PI/8,id=s.world.nextId++,x=summit.x+Math.cos(angle)*8,z=summit.z+Math.sin(angle)*8;barrierIds.push(id);s.world.obstacles.push({id,kind:'rock',pos:{x,y:groundHeight(x,z,2),z},radius:2.2,height:9});}
  return {version:2,resource:100,blueprints:[],fleet:[],regions,springs,archetype:t.legacyAbility,airUnlocked:false,barrierIds,nextId,elapsed:0,completed:false};
}
export function buildMachine(s:GameState,draft:VehicleBlueprint):TribeAction {
  const m=s.stage===5&&s.planet?.version===2&&!s.deathReason?activeMachines(s):playable(s);if(!m)return fail(C.unavailable);
  if(s.stage===5){const planet=s.planet;const active=planet?.version===2?m.fleet.find(u=>u.id===planet.activeMachine):null;if(!active||horizontalDistance(active.pos,machineHome(s))>12)return fail('S výrobou se vrať do vzdálenosti 12 metrů od dílny.');}
  const quote=quoteVehicle(draft,m.resource,m.airUnlocked);if(!quote.ok)return fail(quote.errors.join(' '));
  if(m.fleet.length>=8)return fail(C.tooMany);
  // Old wreck designs are archival, not permanent production slots. IDs stay
  // monotonic and every design still referenced by a live unit is preserved.
  if(m.blueprints.length>=64){const used=new Set(m.fleet.map(u=>u.blueprint));m.blueprints=m.blueprints.filter(d=>used.has(d.id));}
  const design={id:m.nextId++,blueprint:structuredClone(draft)},pos=openGround(s.world,machineHome(s),m.nextId,7);
  if(draft.carrier==='air')pos.y=groundHeight(pos.x,pos.z,2)+15;
  m.resource-=quote.cost;m.blueprints.push(design);
  m.fleet.push({id:m.nextId++,blueprint:design.id,pos,heading:0,health:vehicleStats(design.blueprint).durability,cooldown:0,cargo:0,orders:[],navigation:unitNavigation(pos),intent:'rest'});
  return {ok:true,message:C.built};
}
/** Reclaim a paid carrier at the workshop so a full fleet can change roles. */
export function retireMachine(s:GameState,id:number):TribeAction {
  const m=playable(s);if(!m)return fail(C.unavailable);
  const u=m.fleet.find(u=>u.id===id&&u.health>0);if(!u)return fail(C.selectFirst);
  if(horizontalDistance(u.pos,machineHome(s))>12)return fail(C.retireHome);
  if(m.fleet.filter(u=>u.health>0).length<=1)return fail(C.lastMachine);
  const cargo=m.archetype==='restoration'?12:m.archetype==='migration'?8:0;
  m.resource=Math.min(1e9,m.resource+Math.floor(vehicleCost(machineDesign(m,u))*.35)+u.cargo*cargo);
  m.fleet=m.fleet.filter(unit=>unit.id!==id);
  return {ok:true,message:C.retired};
}
export function issueMachineOrder(s:GameState,ids:readonly number[],kind:UnitOrder['kind'],target:UnitTarget,append=false):TribeAction {
  const m=playable(s);if(!m)return fail(C.unavailable);
  const wanted=orderedIds(ids),units=wanted.map(id=>m.fleet.find(u=>u.id===id&&u.health>0));
  if(!wanted.length||units.some(u=>!u))return fail(C.selectFirst);
  if(!validOrderShape({unit:wanted[0],kind,target}))return fail(C.badTarget);
  if(append&&units.some(u=>u!.orders.length>=MAX_UNIT_ORDERS))return fail(C.queueFull);
  if(target.kind==='spring'){
    if(!m.springs.some(p=>p.id===target.id&&p.owner==='neutral'))return fail(C.badTarget);
    if(units.some(u=>machineDesign(m,u!).carrier!=='tank'))return fail(C.onlyTank);
  }else if(target.kind==='region'){
    const r=m.regions.find(r=>r.id===target.id&&r.owner==='neutral');if(!r)return fail(C.badTarget);
    if(r.airOnly&&units.some(u=>machineDesign(m,u!).carrier!=='air'))return fail(C.airRequired);
    const expected=m.archetype==='restoration'?'build':m.archetype==='predator'?'attack':'socialize';if(kind!==expected)return fail(C.strategy[m.archetype]);
    const allowed=m.archetype==='restoration'?['drill','seeder']:m.archetype==='predator'?['cannon']:['broadcast'];
    if(units.some(u=>!allowed.includes(vehicleStats(machineDesign(m,u!)).module??'')))return fail(C.wrongModule);
  }else if(target.kind!=='point')return fail(C.badTarget);
  for(const [i,u] of units.entries()){
    const unit=u!,destination=structuredClone(target);
    if(destination.kind==='point'&&units.length>1){destination.pos.x=clamp(destination.pos.x+(i%3-1)*4,-75,75);destination.pos.z=clamp(destination.pos.z+Math.floor(i/3)*4,-75,75);}
    const order={unit:unit.id,kind,target:destination};if(append)unit.orders.push(order);else unit.orders=[order];unit.navigation.rethink=0;
  }
  return {ok:true};
}
export function stopMachines(s:GameState,ids:readonly number[]):TribeAction {const m=playable(s);if(!m)return fail(C.unavailable);for(const u of m.fleet)if(ids.includes(u.id)){u.orders=[];u.intent='rest';}return {ok:true};}
export function repairMachines(s:GameState,ids:readonly number[]):TribeAction {
  const m=playable(s);if(!m)return fail(C.unavailable);const wanted=orderedIds(ids),units=wanted.map(id=>m.fleet.find(u=>u.id===id&&u.health>0));
  if(!wanted.length||units.some(u=>!u))return fail(C.selectFirst);
  if(units.some(u=>horizontalDistance(u!.pos,machineHome(s))>9))return fail(C.repairHome);
  const injured=units.filter(u=>u!.health<vehicleStats(machineDesign(m,u!)).durability),cost=injured.length*10;if(m.resource<cost)return fail(C.notEnough);
  m.resource-=cost;for(const u of injured)u!.health=vehicleStats(machineDesign(m,u!)).durability;return {ok:true,message:C.repaired};
}
function fly(unit:MachineUnit,target:Vec3,speed:number,dt:number,stop:number):boolean {
  const gap=horizontalDistance(unit.pos,target);unit.pos.y=groundHeight(unit.pos.x,unit.pos.z,2)+15;if(gap<=stop)return true;
  const travel=Math.min(gap-stop,speed*dt),dx=target.x-unit.pos.x,dz=target.z-unit.pos.z;unit.pos.x+=dx/gap*travel;unit.pos.z+=dz/gap*travel;unit.heading=Math.atan2(dx,dz);return gap-travel<=stop+.05;
}
export function machineStrike(attacker:{cooldown:number},target:{health:number},power:number):boolean {if(attacker.cooldown!==0)return false;target.health=Math.max(0,target.health-power*2);attacker.cooldown=1.2;return true;}
export function machineShot(world:World,attacker:{pos:Vec3;cooldown:number},target:{pos:Vec3;health:number},power:number,range:number):boolean {
  const a={...attacker.pos,y:attacker.pos.y+1},b={...target.pos,y:target.pos.y+1};
  if(horizontalDistance(a,b)>range||world.obstacles.some(o=>obstacleSegmentEntry(a,b,o)!==null))return false;
  machineStrike(attacker,target,power);return true;
}
export function stepMachines(s:GameState,dt:number):string[]{
  const m=activeMachines(s);if(!m)return [];const messages:string[]=[],home=machineHome(s);m.elapsed+=dt;m.resource=Math.min(1e9,m.resource+effectiveMachineIncome(s)*dt);
  const units=m.fleet.filter(u=>u.id!==s.military?.deployment?.unitId).sort((a,b)=>a.id-b.id),frozen=units.map(u=>({id:u.id,pos:{...u.pos}}));
  for(const u of units){if(u.health<=0)continue;const g=machineDesign(m,u),stats=vehicleStats(g);u.cooldown=Math.max(0,u.cooldown-dt);
    const travel=(pos:Vec3,stop=3)=>g.carrier==='air'?fly(u,pos,stats.speed,dt,stop):moveUnit(s.world,u,pos,frozen,stats.speed,dt,stop,1.1);
    const order=u.orders[0],target=order?.target;const finish=()=>{u.orders.shift();u.navigation.rethink=0;u.intent='rest';};
    if(!target){u.intent='rest';continue;}
    if(target.kind==='point'){u.intent='move';if(travel(target.pos,1))finish();continue;}
    if(target.kind==='spring'){
      const spring=m.springs.find(p=>p.id===target.id);if(!spring||spring.owner==='player'||g.carrier!=='tank'){finish();continue;}
      u.intent='work';if(travel(spring.pos,3)){spring.progress=Math.min(1,spring.progress+dt/16);if(spring.progress===1){spring.owner='player';messages.push(C.springCaptured+` ${C.actualIncome(effectiveMachineIncome(s))}`);finish();}}continue;
    }
    if(target.kind!=='region'){finish();continue;}
    const region=m.regions.find(r=>r.id===target.id);if(!region||region.owner==='player'||region.airOnly&&g.carrier!=='air'){finish();continue;}
    const allowed=m.archetype==='restoration'?['drill','seeder']:m.archetype==='predator'?['cannon']:['broadcast'];
    if(!allowed.includes(stats.module??'')){finish();continue;}
    if(m.archetype!=='predator'&&u.cargo===0){
      u.intent='return';if(horizontalDistance(u.pos,home)>5){travel(home,4);continue;}
      const cost=m.archetype==='restoration'?12:8;if(m.resource<cost){u.intent='rest';continue;}m.resource-=cost;u.cargo=1;
    }
    u.intent=m.archetype==='predator'?'attack':'work';if(!travel(region.pos,g.carrier==='tank'?4:2.5))continue;
    const power=machineRegionPower(s,stats.power);
    if(m.archetype==='restoration'){
      region.soil=Math.min(100,region.soil+power*dt*.28);
      if(region.soil>=100&&u.cargo>0){u.cargo=0;region.settlers=Math.min(2,region.settlers+1);}
      if(region.settlers>=2)region.owner='player';
    }else if(m.archetype==='predator'){
      region.alarm=12;if(machineStrike(u,region,power))region.soil=Math.max(0,region.soil-2);
      if(region.health===0)region.owner='player';
    }else{
      region.relation=Math.min(100,region.relation+power*dt*.65);
      const threshold=(region.deliveries+1)*100/3;
      if(u.cargo>0&&region.relation>=threshold){u.cargo=0;region.deliveries=Math.min(3,region.deliveries+1);}
      if(region.deliveries>=3&&region.relation>=100)region.owner='player';
    }
    if(region.owner==='player'){const patch=s.world.patches[region.identity==='gardens'?0:region.identity==='terraces'?1:2];patch.fertility=clamp(patch.fertility+(m.archetype==='restoration'?.2:m.archetype==='predator'?-.22:.07),.15,1.5);region.method=m.archetype;region.alarm=0;m.airUnlocked=true;messages.push(C.regionJoined(C.regionNames[region.identity])+(power>stats.power?` ${C.inheritedWork(power/stats.power-1)}`:''));finish();}
  }
  for(const r of [...m.regions].sort((a,b)=>a.id-b.id)){
    r.alarm=Math.max(0,r.alarm-dt);r.cooldown=Math.max(0,r.cooldown-dt);if(r.owner==='player'||r.alarm===0||r.cooldown>0)continue;
    const target=units.filter(u=>u.health>0&&horizontalDistance(u.pos,r.pos)<14).sort((a,b)=>horizontalDistance(a.pos,r.pos)-horizontalDistance(b.pos,r.pos)||a.id-b.id)[0];
    if(target){target.health=Math.max(0,target.health-(r.identity==='terraces'?9:6));r.cooldown=1.8;}
  }
  m.fleet=m.fleet.filter(u=>u.health>0);
  if(!m.completed&&machinesReady(s)){m.completed=true;messages.push(C.ready);}
  // A captured spring can rebuild a wiped fleet. Before any income, the stage
  // checkpoint remains a recoverable supply base rather than an endless wait.
  if(!m.fleet.length&&m.blueprints.length&&machineIncome(m)===0&&m.resource<minimumMachineCost()){s.deathReason=C.dead;messages.push(C.dead);}
  return messages;
}
