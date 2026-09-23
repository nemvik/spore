import { speciesGroundClearance } from './anatomy';
import { worldSpecies } from './npc-genome';
import type { GameState, Input, Vec3 } from './types';
import type { ActivePlanetState, PlanetBiome, PlanetPopulation, TScore } from './era-types';
import { activeMachines, machineDesign, machineHome, machineIncome } from './machines';
import { vehicleCost, vehicleStats } from './blueprint';
import { clamp, groundHeight, horizontalDistance } from './random';
import { resolveObstacleMotion } from './obstacle-geometry';
import { openGround } from './unit-motion';
import { livingRootStrength } from './climate';
import { spawnCreature } from './world';
import { lineBlocked } from './interactions';
import { ecologyTaxon, inheritEcologyContacts, recordEcologyContact } from './ecology-catalog';
import type { TribeAction } from './tribe';
import { PLANET_COPY as C } from './planet-copy.cs';

export const activePlanet=(s:GameState):ActivePlanetState|null=>s.planet?.version===2?s.planet:null;
export const planetTScore=(temperature:number,atmosphere:number):TScore=>{const r=Math.hypot(temperature,atmosphere);return r<=.3?3:r<=.65?2:r<=1?1:0;};
export const planetVehicle=(s:GameState)=>{const p=activePlanet(s),m=activeMachines(s);return p&&m?m.fleet.find(u=>u.id===p.activeMachine&&u.health>0)??null:null;};
const playable=(s:GameState)=>s.stage===5&&!s.deathReason?activePlanet(s):null;
const fail=(message:string):TribeAction=>({ok:false,message});
export const atPlanetBase=(s:GameState):boolean=>{const u=planetVehicle(s);return !!u&&horizontalDistance(u.pos,machineHome(s))<=12;};
export function createPlanet(s:GameState):ActivePlanetState {
 const m=activeMachines(s)!,home=machineHome(s);s.journey.ecology=inheritEcologyContacts(s);
 m.fleet=m.fleet.filter(u=>u.health>0);
 m.resource=Math.min(1e9,m.resource+m.fleet.reduce((sum,u)=>sum+u.cargo*(m.archetype==='restoration'?12:m.archetype==='migration'?8:0),0));
 for(const u of m.fleet){u.orders=[];u.intent='rest';u.cargo=0;}
 const pos=openGround(s.world,{x:home.x-12,y:home.y,z:home.z+5},13,2);
 const sources=([6,7] as const).map((site,i)=>{const key=`culture:${site}`,taxon=ecologyTaxon(key)!,place=openGround(s.world,{x:pos.x+(i*2-1)*3,y:pos.y,z:pos.z},site,1.5),resourceId=s.world.nextId++;
  s.world.resources.push({id:resourceId,kind:taxon.food,pos:place,amount:12,max:12,patch:site-6,regen:.1});return {key,resourceId};});
 return {version:2,temperature:.85,atmosphere:-.85,tScore:0,activeMachine:m.fleet[0].id,toolOn:false,
  biomes:m.regions.map((r,i)=>({id:i+1,level:(i+1) as 1|2|3,pos:{...r.pos}})),stabilizers:[],populations:[],nursery:{pos,sources},nextId:4,elapsed:0,stableTime:0,completed:false,sandbox:false};
}
export function selectPlanetVehicle(s:GameState,id:number):TribeAction {const p=playable(s),m=activeMachines(s);if(!p||!m)return fail(C.unavailable);if(!m.fleet.some(u=>u.id===id&&u.health>0))return fail(C.noMachine);p.activeMachine=id;p.toolOn=false;return {ok:true};}
export function togglePlanetTool(s:GameState):TribeAction {const p=playable(s),u=planetVehicle(s),m=activeMachines(s);if(!p||!u||!m)return fail(C.unavailable);const module=vehicleStats(machineDesign(m,u)).module;if(!['drill','seeder'].includes(module??''))return fail(C.wrongTool);p.toolOn=!p.toolOn;return {ok:true};}
export function retirePlanetVehicle(s:GameState):TribeAction {const p=playable(s),m=activeMachines(s),u=planetVehicle(s);if(!p||!m||!u)return fail(C.unavailable);if(!atPlanetBase(s))return fail(C.nearBase);if(m.fleet.filter(v=>v.health>0).length<=1)return fail('Poslední stroj expedice musí zůstat.');m.fleet=m.fleet.filter(v=>v.id!==u.id);m.resource=Math.min(1e9,m.resource+Math.floor(vehicleCost(machineDesign(m,u))*.35));p.activeMachine=m.fleet.find(v=>v.health>0)!.id;p.toolOn=false;return {ok:true};}
function reachable(s:GameState,pos:Vec3):TribeAction|null {const u=planetVehicle(s);if(!u)return fail(C.noMachine);if(horizontalDistance(u.pos,pos)>6)return fail(C.far);if(lineBlocked({...s,stage:2}, {...u.pos,y:u.pos.y+1.5},{...pos,y:pos.y+1}))return fail(C.blocked);return null;}
export type PlanetSampleTarget={kind:'culture'|'creature';id:number};
export function planetSampleTargets(s:GameState):{target:PlanetSampleTarget;key:string;pos:Vec3}[]{const p=activePlanet(s);if(!p)return [];const mothers=[...p.nursery.sources.map(r=>({...r})),...s.journey.sites.filter(site=>site.stage===2).map(site=>({key:`culture:${site.id}`,resourceId:site.sourceId}))];return [
 ...mothers.flatMap(r=>{const resource=s.world.resources.find(v=>v.id===r.resourceId);return resource&&resource.amount>=1?[{target:{kind:'culture' as const,id:resource.id},key:r.key,pos:resource.pos}]:[];}),
 ...s.world.creatures.filter(c=>c.health>0).map(c=>({target:{kind:'creature' as const,id:c.id},key:`species:${c.species}`,pos:c.pos}))];}
export function samplePlanetLife(s:GameState,target?:PlanetSampleTarget):TribeAction {
 const p=playable(s),u=planetVehicle(s);if(!p||!u)return fail(C.unavailable);
 const options=planetSampleTargets(s),item=target?options.find(t=>t.target.kind===target.kind&&t.target.id===target.id):options.sort((a,b)=>horizontalDistance(a.pos,u.pos)-horizontalDistance(b.pos,u.pos)||a.target.id-b.target.id).find(t=>!s.journey.ecology?.contacts.some(c=>c.key===t.key));
 if(!item)return fail(C.unknown);const blocked=reachable(s,item.pos);if(blocked)return blocked;
 const taxon=ecologyTaxon(item.key)!;
 if(item.target.kind==='culture'){
  const r=s.world.resources.find(r=>r.id===item.target.id)!;if(r.amount<1)return fail(C.noFood);r.amount-=1;recordEcologyContact(s,item.key,'culture',taxon.stage,taxon.site===null?null:taxon.site%3 as 0|1|2);return {ok:true,message:C.sampled};
 }
 const c=s.world.creatures.find(c=>c.id===item.target.id)!;const food=s.world.resources.filter(r=>r.amount>=1&&worldSpecies(s.world,c.species).diet.includes(r.kind)&&horizontalDistance(r.pos,c.pos)<=8&&!lineBlocked({...s,stage:2},{...c.pos,y:c.pos.y+1},r.pos)).sort((a,b)=>horizontalDistance(a.pos,c.pos)-horizontalDistance(b.pos,c.pos)||a.id-b.id)[0];
 if(!food)return fail(C.noFood);food.amount-=1;c.hunger=Math.max(0,c.hunger-42);c.health=Math.min(worldSpecies(s.world,c.species).maxHealth??(worldSpecies(s.world,c.species).role==='predator'?55:32),c.health+4);c.cooldown=3;c.fear=0;recordEcologyContact(s,item.key,'feeding',taxon.stage,c.patch as 0|1|2);return {ok:true,message:C.fed};
}
export function preparePlanetNursery(s:GameState,species:string):TribeAction {
 const p=playable(s),m=activeMachines(s);if(!p||!m)return fail(C.unavailable);if(!atPlanetBase(s))return fail(C.nearBase);if(!['bell','gnaw','crest'].includes(species))return fail(C.unknown);if(m.resource<8)return fail(C.noAmber);
 if(s.world.creatures.some(c=>c.species===species&&c.health>0&&horizontalDistance(c.pos,p.nursery.pos)<12))return fail(C.nurseryFull);
 const c=spawnCreature(s.world,species,0),pos=openGround(s.world,p.nursery.pos,c.id,3);c.pos={...pos,y:pos.y+(worldSpecies(s.world,species).genome?speciesGroundClearance(worldSpecies(s.world,species)):1)};c.hunger=70;s.world.creatures.push(c);s.world.births++;m.resource-=8;
 const kind=species==='crest'?'meat':'nectar',foodPos={...pos,x:pos.x+1};
 // Refill a nearby school food portion instead of accumulating disposable
 // resources. Never reuse a living culture or its saved root.
 const retained=new Set([...s.journey.sites.filter(site=>site.stage===2).flatMap(site=>[site.sourceId,site.plantedId]),...p.nursery.sources.map(source=>source.resourceId),...p.stabilizers.flatMap(root=>[root.site.sourceId,root.site.plantedId]),...(s.journey.rootDispersal?.roots.map(root=>root.resourceId)??[])]);
 const snack=kind==='nectar'?s.world.resources.find(r=>r.kind==='nectar'&&r.max===3&&r.regen===0&&horizontalDistance(r.pos,pos)<=8&&!retained.has(r.id)):undefined;
 if(snack){snack.amount=3;}else s.world.resources.push({id:s.world.nextId++,kind,pos:foodPos,amount:3,max:3,patch:0,regen:0});
 return {ok:true,message:C.nurseryReady};
}
export function biomeLife(s:GameState,biome:PlanetBiome){
 const p=activePlanet(s)!;const roots=p.stabilizers.filter(r=>r.biome===biome.id),pop=p.populations.filter(c=>c.biome===biome.id),herbs=pop.filter(c=>ecologyTaxon(c.key)?.role==='herbivore'),predators=pop.filter(c=>ecologyTaxon(c.key)?.role==='predator');
 const alive=(c:PlanetPopulation)=>c.vitality>=65&&c.abundance>=.65&&c.nutrition>=.35;
 const support=roots.length===2&&roots.every(r=>livingRootStrength(s,r.site)>=.65)&&herbs.length===2&&herbs.every(alive)&&predators.length===1&&predators.every(alive);
 return {roots,herbs,predators,support};
}
export function planetSupport(s:GameState):TScore {const p=activePlanet(s);if(!p)return 0;let level:TScore=0;for(const b of [...p.biomes].sort((a,b)=>a.level-b.level)){if(!biomeLife(s,b).support)break;level=b.level;}return level;}
export function introducePlanetLife(s:GameState,biomeId:number,key:string):TribeAction {
 const p=playable(s),m=activeMachines(s);if(!p||!m)return fail(C.unavailable);const b=p.biomes.find(b=>b.id===biomeId),taxon=ecologyTaxon(key);if(!b||!taxon||taxon.role==='partner'||!s.journey.ecology?.contacts.some(c=>c.key===key))return fail(C.unknown);
 const blocked=reachable(s,b.pos);if(blocked)return blocked;if(p.tScore<b.level)return fail(C.climateLow);if(planetSupport(s)<b.level-1)return fail(C.previous);
 const life=biomeLife(s,b),group=taxon.role==='producer'?life.roots:taxon.role==='herbivore'?life.herbs:life.predators,max=taxon.role==='predator'?1:2;
 if(group.some(c=>c.key===key))return fail(C.duplicate);if(group.length>=max)return fail(C.full);const cost=taxon.role==='producer'?10:taxon.role==='herbivore'?12:18;if(m.resource<cost)return fail(C.noAmber);
 m.resource-=cost;const id=p.nextId++,pos=openGround(s.world,{x:b.pos.x+(taxon.role==='producer'?-3:3),y:b.pos.y,z:b.pos.z+(group.length*2-1)*3},id,1);
 if(taxon.role==='producer'){const resourceId=s.world.nextId++;s.world.resources.push({id:resourceId,kind:taxon.food,pos:{...pos},amount:6,max:12,patch:b.id-1,regen:0});p.stabilizers.push({id,biome:b.id,key,site:{id,stage:5,patch:b.id-1,source:{...pos},refuges:[{...pos}],sourceId:resourceId,plantedId:resourceId,vitality:75,observed:true,resolved:false,method:null,threatIds:[],phase:0}});}
 else p.populations.push({id,biome:b.id,key,pos,vitality:80,abundance:1,nutrition:.8});return {ok:true,message:C.introduced};
}
export function removePlanetLife(s:GameState,id:number):TribeAction {const p=playable(s);if(!p)return fail(C.unavailable);const root=p.stabilizers.find(r=>r.id===id),population=p.populations.find(c=>c.id===id),b=p.biomes.find(b=>b.id===(root?.biome??population?.biome));if(!b)return fail(C.unknown);const blocked=reachable(s,b.pos);if(blocked)return blocked;if(root)s.world.resources=s.world.resources.filter(r=>r.id!==root.site.plantedId);p.stabilizers=p.stabilizers.filter(r=>r.id!==id);p.populations=p.populations.filter(r=>r.id!==id);return {ok:true};}
function stepLife(s:GameState,p:ActivePlanetState,dt:number):void {
 for(const b of p.biomes){const life=biomeLife(s,b),suitable=p.tScore>=b.level;
  for(const root of life.roots){const r=s.world.resources.find(r=>r.id===root.site.plantedId);root.site.vitality=clamp(root.site.vitality+dt*(r&&suitable?.25:-.6),0,100);if(r)r.amount=clamp(r.amount+dt*.22*livingRootStrength(s,root.site),0,r.max);}
  for(const c of life.herbs){const spec=worldSpecies(s.world,ecologyTaxon(c.key)!.species!),food=life.roots.map(r=>s.world.resources.find(v=>v.id===r.site.plantedId)).filter(r=>r&&spec.diet.includes(r.kind)&&r.amount>0),need=.025*Math.max(.5,c.abundance)*dt;let eaten=0;for(const r of food){const take=Math.min(r!.amount,need-eaten);r!.amount-=take;eaten+=take;if(eaten>=need)break;}const fed=eaten>=need*.95;c.nutrition=clamp(c.nutrition+dt*(fed?.03:-.055),0,1);c.vitality=clamp(c.vitality+dt*(suitable&&c.nutrition>.2?.12:-.65),0,100);c.abundance=clamp(c.abundance+dt*(c.vitality>=50&&c.nutrition>.35?.012:-.02),0,3);}
  for(const c of life.predators){const prey=life.herbs.filter(h=>h.vitality>0&&h.abundance>.7),need=.007*Math.max(.5,c.abundance)*dt;let eaten=0;for(const h of prey){const take=Math.min(Math.max(0,h.abundance-.7),need-eaten);h.abundance-=take;eaten+=take;if(eaten>=need)break;}const fed=eaten>=need*.95;c.nutrition=clamp(c.nutrition+dt*(fed?.03:-.055),0,1);c.vitality=clamp(c.vitality+dt*(suitable&&c.nutrition>.2?.12:-.65),0,100);c.abundance=clamp(c.abundance+dt*(c.vitality>=50&&c.nutrition>.35?.004:-.02),0,1.5);}
 }
}
export function stepPlanet(s:GameState,input:Input,dt:number):string[]{
 const p=activePlanet(s),m=activeMachines(s),u=planetVehicle(s);if(!p||!m||!u)return [];p.elapsed+=dt;m.resource=Math.min(1e9,m.resource+machineIncome(m)*dt);const g=machineDesign(m,u),stats=vehicleStats(g),length=Math.hypot(input.x,input.z),norm=Math.max(1,length),previous={...u.pos};
 const pos={x:clamp(u.pos.x+input.x/norm*stats.speed*dt,-76,76),y:u.pos.y,z:clamp(u.pos.z+input.z/norm*stats.speed*dt,-76,76)};
 u.pos=g.carrier==='air'?pos:resolveObstacleMotion(s.world,u.pos,pos,1.1);u.pos.y=groundHeight(u.pos.x,u.pos.z,2)+(g.carrier==='air'?15:0);if(length>.01)u.heading=Math.atan2(input.x,input.z);u.intent=horizontalDistance(previous,u.pos)>.0001?'move':'rest';
 const support=planetSupport(s),target=[.88,.60,.36,.10][support];p.temperature=clamp(p.temperature+(target-p.temperature)*dt*.035,-1,1);p.atmosphere=clamp(p.atmosphere+(-target-p.atmosphere)*dt*.035,-1,1);
 if(p.toolOn){if(m.resource<dt*.25||!['drill','seeder'].includes(stats.module??''))p.toolOn=false;else{m.resource-=dt*.25;u.intent='work';if(stats.module==='drill'){p.atmosphere=Math.min(0,p.atmosphere+stats.power*.009*dt);p.temperature=clamp(p.temperature+stats.power*.0008*dt,-1,1);}else{p.temperature=Math.max(0,p.temperature-stats.power*.008*dt);p.atmosphere=Math.min(0,p.atmosphere+stats.power*.0025*dt);}}}
 p.tScore=planetTScore(p.temperature,p.atmosphere);stepLife(s,p,dt);s.campaign.drought=clamp(-p.atmosphere/.88,0,1);
 p.stableTime=p.tScore===3&&planetSupport(s)===3&&!p.toolOn?Math.min(30,p.stableTime+dt):0;
 if(!p.completed&&p.stableTime>=30){p.completed=true;return [C.ready];}return [];
}
