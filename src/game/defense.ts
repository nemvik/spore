import type { GameState, Vec3, World } from './types';
import type { MachineUnit } from './era-types';
import { cityGuard, type City } from './cities';
import type { CityEconomy } from './city-economy';
import type { RivalState, StateOpportunity } from './states';
import { stateCities, systemDefeated } from './states';
import { activeField, fieldGround, navigation } from './planet-travel';
import { activeMachines, machineDesign, machineShot } from './machines';
import { vehicleStats, type VehicleBlueprint } from './blueprint';
import { enableMilitary, defenseDesign, DEFENSE_COST, landRoute, militaryWorld, tankRadius, MILITARY_RANGE } from './military';
import { moveUnit, unitNavigation } from './unit-motion';
import { planetAtlas } from './planet-geography';
import { resolveObstacleMotion } from './obstacle-geometry';
import { horizontalDistance } from './random';

export const FORTIFICATION = 80;
export const RAID_PREPARATION = 15;
export const TRANSFER_LIMIT = 32;
export interface CityTransfer {
  method?:never;
  from:City['owner']; to:City['owner']; unitId:number; raidId:string|null;
  turn:number; elapsed:number; economy:CityEconomy|null;
}
export interface Raid {
  id:string; stateId:string; sourceCityId:string; cityId:string; route:number[];
  blueprint:VehicleBlueprint; unit:MachineUnit;
  phase:'preparing'|'outbound'|'waiting'|'field'|'occupying'|'garrison'|'retreat'|'returning'|'returned'|'withdrawn'|'destroyed';
  remaining:number; elapsed:number; hold:number;
}
export const raids=(s:GameState):Raid[]=>s.military?.version===2?s.military.raids!:[];
export const unresolvedRaid=(s:GameState)=>raids(s).some(r=>!['destroyed','returned','withdrawn'].includes(r.phase));
export const fieldRaid=(s:GameState,c:City)=>raids(s).find(r=>r.cityId===c.id&&['field','occupying','garrison','retreat'].includes(r.phase)&&r.unit.health>0);
export const sameOwner=(a:City['owner'],b:City['owner'])=>a.kind===b.kind&&a.id===b.id;
export const originalCityOwner=(s:GameState,c:City):City['owner']=>c.capture?{kind:'lineage',id:s.homePlanet!.id}:c.foundingOwner!;
export const cityCommandRevision=(c:City)=>(c.economy?.revision??0)+(c.transfers?.length??0)*1000000001;
/** E stays an independently readable historic contract. Activation adds only future rules. */
export function enableDefense(s:GameState,origin:'birth'|'legacy-activation'='legacy-activation'):void {
  enableMilitary(s,origin);
  const migrate=(v:GameState)=>{
    if(v.military!.version===2)return false;
    v.cities!.version=6;v.states!.version=3;
    for(const c of v.cities!.entries){c.transfers=[];c.fortification=FORTIFICATION;}
    v.military={...v.military!,version:2,raids:[]};
    // E occupation has no F control point; explicitly interrupt its unfinished order.
    if(v.military.deployment?.order==='occupy'){v.military.deployment.order='stop';v.military.deployment.hold=0;v.military.notice='Aktivována obrana F: rozpracované obsazování E přerušeno. Nejprve prolom odolnost náměstí, potom vydej nové obsazení.';}
    return true;
  };
  migrate(s);if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}
const cityEntries=new WeakMap<City,{key:string;player:Vec3;enemy:Vec3}>();
export function cityEntry(s:GameState,c:City,enemy=false):Vec3 {
  const f=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!,cell=planetAtlas(s.homePlanet!)!.cells[f.cellId];
  const key=JSON.stringify([s.seed,f.world.rng,c.address.position]);let pair=cityEntries.get(c);
  if(pair?.key===key)return {...(enemy?pair.enemy:pair.player)};
  // C reserves the arrival center, but decorations have nonzero radii outside it.
  // Rotate two berths against immutable terrain/hall; later construction reserves them.
  const world=militaryWorld(s,{...c,economy:null}),radius=tankRadius(defenseDesign());
  let best=-Infinity;pair=undefined;
  for(let i=0;i<32;i++){
    const angle=i*Math.PI/16,x=3.4*Math.cos(angle),z=3.4*Math.sin(angle);
    const player={x:-x,y:fieldGround(s.seed,cell,-x,-z)+.8,z:-z},rival={x,y:fieldGround(s.seed,cell,x,z)+.8,z};
    const clearance=Math.min(...world.obstacles.flatMap(o=>[horizontalDistance(player,o.pos)-o.radius-4,horizontalDistance(rival,o.pos)-o.radius-radius]));
    if(clearance>best){best=clearance;pair={key,player,enemy:rival};}if(clearance>=.1)break;
  }
  cityEntries.set(c,pair!);return {...(enemy?pair!.enemy:pair!.player)};
}
export function entryClear(s:GameState,c:City,enemy:boolean,g:VehicleBlueprint):boolean {
  const p=cityEntry(s,c,enemy);
  return militaryWorld(s,c).obstacles.every(o=>horizontalDistance(p,o.pos)>=o.radius+tankRadius(g)+.05);
}
/** An occupied arrival berth waits; transport never places two tank bodies on each other. */
function entryAvailable(s:GameState,c:City,enemy:boolean,g:VehicleBlueprint):boolean {
  const p=cityEntry(s,c,enemy),d=s.military!.deployment,player=d?.cityId===c.id&&d.phase==='field'?activeMachines(s)!.fleet.find(u=>u.id===d.unitId):null;
  const rival=fieldRaid(s,c);
  if(!entryClear(s,c,enemy,g))return false;
  return enemy?(!player||horizontalDistance(p,player.pos)>=tankRadius(g)+tankRadius(machineDesign(activeMachines(s)!,player))+.1):(!rival||horizontalDistance(p,rival.unit.pos)>=tankRadius(g)+tankRadius(rival.blueprint)+.1);
}
export function raidOpportunity(s:GameState,r:RivalState):StateOpportunity|null {
  if(s.military?.version!==2||s.stage!==4)return null;
  const targets=s.cities!.entries.filter(c=>c.owner.kind==='lineage'&&c.foundingOwner?.id===r.id&&c.transfers?.at(-1)?.method!=='trade');
  if(!targets.length)return null; // Counterattack is a response to an actual territorial loss.
  const blocked=(reason:string):StateOpportunity=>({action:null,cost:DEFENSE_COST,account:'reserve',available:false,reason});
  if(raids(s).some(v=>v.stateId===r.id))return blocked('Stát již zaplatil svůj jediný výpad. Zničený ani navrácený tank nenahrazuje zdarma.');
  if(r.reserve<DEFENSE_COST)return blocked(`Protiútok stojí ${DEFENSE_COST} jantaru; konečná rezerva má ${r.reserve}. Bez dotace.`);
  const choices=stateCities(s,r).flatMap(source=>targets.filter(c=>!fieldRaid(s,c)&&!raids(s).some(v=>v.cityId===c.id&&!['destroyed','returned','withdrawn'].includes(v.phase))).flatMap(c=>{
    const route=landRoute(s,c,navigation(s)!.fields.find(f=>f.id===source.address.locationId)!.cellId);
    return route&&entryClear(s,source,true,defenseDesign())&&entryClear(s,c,true,defenseDesign())?[{source,c,route}]:[];
  })).sort((a,b)=>a.route.length-b.route.length||(a.c.id<b.c.id?-1:a.c.id>b.c.id?1:0)||(a.source.id<b.source.id?-1:a.source.id>b.source.id?1:0));
  const choice=choices[0];if(!choice)return blocked('Protiútok nemá vlastní zdrojové město a dosažitelný ztracený cíl s volnými příjezdy po pevnině.');
  if(choice.c.transfers!.length>=TRANSFER_LIMIT||choice.c.economy&&choice.c.economy.revision>=1e9)return blocked('Cíl dosáhl limitu historie nebo hospodářských revizí.');
  return {action:{kind:'raid',cityId:choice.c.id,sourceCityId:choice.source.id},cost:DEFENSE_COST,account:'reserve',available:true,
    reason:`Protiútok na ${choice.c.name}: nový tank za ${DEFENSE_COST} z rezervy, příprava ${RAID_PREPARATION} s a pevninská přeprava ${(choice.route.length-1)*5} s. Boj jen při návštěvě.`};
}
/** Called only inside the synchronous, revalidated state payment. */
export function createRaid(s:GameState,stateId:string,source:City,c:City,id:string):Raid {
  const blueprint=defenseDesign(),pos=cityEntry(s,source,true);
  return {id,stateId,sourceCityId:source.id,cityId:c.id,route:landRoute(s,c,navigation(s)!.fields.find(f=>f.id===source.address.locationId)!.cellId)!,blueprint,
    unit:{id:1,blueprint:1,pos,heading:0,health:vehicleStats(blueprint).durability,cooldown:0,cargo:0,orders:[],navigation:unitNavigation(pos),intent:'rest'},
    phase:'preparing',remaining:RAID_PREPARATION,elapsed:0,hold:0};
}
export function enemyTarget(s:GameState,c:City):{pos:Vec3;health:number;cooldown:number}|null {
  const raid=fieldRaid(s,c);if(raid)return raid.unit;
  const guard=cityGuard(c);if(c.owner.kind==='state'&&guard&&guard.health>0)return guard;
  return null;
}
export function canOccupy(s:GameState,c:City,owner:City['owner']):boolean {
  if(sameOwner(c.owner,owner)||c.fortification!==0||c.transfers!.length>=TRANSFER_LIMIT||c.economy&&c.economy.revision>=1e9)return false;
  if(owner.kind==='lineage')return !enemyTarget(s,c);
  const d=s.military!.deployment,u=d?.cityId===c.id&&d.phase==='field'?activeMachines(s)!.fleet.find(u=>u.id===d.unitId):null;
  return !u||u.health<=0;
}
/** Only this battle-result transaction may append F ownership. No public UI capture action. */
function transfer(s:GameState,c:City,owner:City['owner'],u:MachineUnit,hold:number,elapsed:number,raidId:string|null):boolean {
  if(activeField(s)?.id!==c.address.locationId||navigation(s)?.mode!=='local'||s.deathReason||s.player.health<=0||u.health<=0||hold+1e-8<5||horizontalDistance(u.pos,c.address.position)>3||!canOccupy(s,c,owner))return false;
  const d=s.military!.deployment;
  if(owner.kind==='lineage'?(owner.id!==s.homePlanet!.id||d?.unitId!==u.id||d.cityId!==c.id||d.phase!=='field'||d.order!=='occupy'||!activeMachines(s)!.fleet.includes(u)):
    !raids(s).some(r=>r.id===raidId&&r.stateId===owner.id&&r.cityId===c.id&&r.unit===u&&r.phase==='occupying'&&!systemDefeated(s,s.states!.entries.find(v=>v.id===r.stateId)!)))return false;
  const receipt:CityTransfer={from:{...c.owner},to:{...owner},unitId:u.id,raidId,turn:s.states!.clock.turn,elapsed,economy:c.economy?structuredClone(c.economy):null};
  c.transfers!.push(receipt);c.owner={...owner};if(c.economy)c.economy.revision++;
  s.military!.notice=owner.kind==='lineage'?`Město ${c.name} získáno skutečným obsazením. Pokladna, občané a všechny předchozí doklady zachovány.`:
    `Město ${c.name} ztraceno po střetu a obsazení. Domov a prameny zůstávají; další tank nebo opravu zaplať doma a město získej zpět.`;
  return true;
}
// Keep only the current battlefield per live branch. Shared navigation caches use
// World identity; a fresh object every frame would rebuild the static visibility graph.
const battleWorlds=new WeakMap<GameState,{cityId:string;field:World;shape:string;world:World}>();
function battleWorld(s:GameState,c:City):World {
  const field=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!.world;
  const shape=JSON.stringify([c.address.position,s.military!.deployment?activeMachines(s)!.fleet.filter(u=>u.id===s.military!.deployment!.unitId).map(u=>tankRadius(machineDesign(activeMachines(s)!,u))):[],field.obstacles,(c.economy?.buildings??[]).map(b=>[b.kind,b.lot])]);
  const cache=battleWorlds.get(s);if(cache?.cityId===c.id&&cache.field===field&&cache.shape===shape)return cache.world;
  const world=militaryWorld(s,c);battleWorlds.set(s,{cityId:c.id,field,shape,world});return world;
}
function moveTank(s:GameState,c:City,u:MachineUnit,g:VehicleBlueprint,world:World,p:Vec3,dt:number,stop:number):boolean {
  const other=fieldRaid(s,c)?.unit,d=s.military!.deployment,player=d?.cityId===c.id&&d.phase==='field'?activeMachines(s)!.fleet.find(v=>v.id===d.unitId):null;
  const bodies=[other,player,cityGuard(c)&&c.defense!.health>0?c.defense:null].filter(v=>v&&v!==u&&v.health>0);
  const collision={...world,obstacles:[...world.obstacles,...bodies.map((v,i)=>({id:200000+i,kind:'rock' as const,pos:{...v!.pos,y:v!.pos.y-4},radius:v===player?tankRadius(machineDesign(activeMachines(s)!,player!)):tankRadius(defenseDesign()),height:24}))]};
  u.intent='move';const from={...u.pos};
  moveUnit(world,u,p,[],vehicleStats(g).speed,dt,stop,tankRadius(g),tankRadius(g),true);
  // Moving bodies constrain the swept step, not the cached static route graph.
  u.pos=resolveObstacleMotion(collision,from,{...u.pos,y:from.y},tankRadius(g));
  const cell=planetAtlas(s.homePlanet!)!.cells[navigation(s)!.fields.find(f=>f.id===c.address.locationId)!.cellId];
  u.pos.y=fieldGround(s.seed,cell,u.pos.x,u.pos.z)+.8;return horizontalDistance(u.pos,p)<=stop+.05;
}
function shootOrApproach(s:GameState,c:City,u:MachineUnit,g:VehicleBlueprint,world:World,target:{pos:Vec3;health:number},dt:number):void {
  u.intent='attack';if(!machineShot(world,u,target,vehicleStats(g).power,MILITARY_RANGE))moveTank(s,c,u,g,world,target.pos,dt,Math.max(3,tankRadius(g)+1));
}
function shootFort(s:GameState,c:City,u:MachineUnit,g:VehicleBlueprint,world:World,dt:number):void {
  const target={pos:{...c.address.position,y:c.address.position.y+.8},health:c.fortification!};
  shootOrApproach(s,c,u,g,world,target,dt);c.fortification=target.health;
}
/** B/C/D clocks stay separate; no remote combat, healing, generation or offline catch-up. */
export function stepDefense(s:GameState,dt:number):void {
  const w=s.military;if(w?.version!==2||s.stage!==4||!Number.isFinite(dt)||dt<=0||s.deathReason||s.player.health<=0||navigation(s)?.mode!=='local')return;
  dt=Math.min(dt,1/30);
  for(const r of raids(s)){
    const source=s.cities!.entries.find(c=>c.id===r.sourceCityId)!,target=s.cities!.entries.find(c=>c.id===r.cityId)!;
    const sourceLost=source.owner.kind!=='state'||source.owner.id!==r.stateId;
    if(['preparing','outbound','waiting'].includes(r.phase)){
      if(r.phase==='preparing'&&(sourceLost||target.owner.kind!=='lineage')){r.phase=sourceLost?'withdrawn':'returned';r.remaining=0;continue;}
      if(r.phase!=='waiting'){
        r.remaining=Math.max(0,r.remaining-dt);
        if(r.remaining>1e-8)continue;
        if(r.phase==='preparing'){r.phase='outbound';r.remaining=(r.route.length-1)*5;continue;}
        r.phase='waiting';r.remaining=0;
      }
      if(activeField(s)?.id!==target.address.locationId)continue;
      if(!entryAvailable(s,target,true,r.blueprint)){w.notice='Příchod útočníka čeká na volný vstup; žádný tank se nepřekryje.';continue;}
      r.unit.pos=cityEntry(s,target,true);r.unit.navigation=unitNavigation(r.unit.pos);r.phase=sourceLost||target.owner.kind!=='lineage'?'retreat':'field';
      w.notice=`Protiútok dorazil do města ${target.name}. Znič tank nebo braň náměstí. Odchod boj pozastaví.`;
    }
    if(r.phase==='returning'){
      r.remaining=Math.max(0,r.remaining-dt);if(r.remaining>1e-8)continue;
      r.remaining=0;r.phase=sourceLost?'withdrawn':'returned';if(!sourceLost)r.unit.pos=cityEntry(s,source,true);r.unit.navigation=unitNavigation(r.unit.pos);r.unit.intent='rest';
    }
  }
  const c=s.cities!.entries.find(c=>c.address.locationId===activeField(s)?.id);if(!c){if(w.deployment)w.deployment.hold=0;return;}
  const world=battleWorld(s,c),m=activeMachines(s)!,d=w.deployment,here=d?.cityId===c.id;
  let u=here?m.fleet.find(u=>u.id===d.unitId):undefined;
  const r=fieldRaid(s,c);
  if(r) {r.elapsed=Math.min(1e9,r.elapsed+dt);r.unit.cooldown=Math.max(0,r.unit.cooldown-dt);}
  if(cityGuard(c))c.defense!.cooldown=Math.max(0,c.defense!.cooldown-dt);
  if(d&&!here)d.hold=0;
  if(here&&d&&u){
    if(u.health<=0){w.deployment=null;u=undefined;}
    else{
      d.elapsed=Math.min(1e9,d.elapsed+dt);
      if(d.phase!=='field'){
        d.remaining=Math.max(0,d.remaining-dt);
        if(d.remaining<=1e-8){
          if(d.phase==='returning'){u.pos={...d.home};u.navigation=unitNavigation(u.pos);u.intent='rest';w.deployment=null;u=undefined;w.notice='Tank se vrátil domů. Poškození zůstává; oprava stojí původních 10 jantaru.';}
          else if(entryAvailable(s,c,false,machineDesign(m,u))){d.phase='field';d.remaining=0;u.pos=cityEntry(s,c);u.navigation=unitNavigation(u.pos);}else w.notice='Přeprava dokončena, tvůj tank čeká na volný vstup bojiště.';
        }
      }
      if(u&&d.phase==='field'){
        const g=machineDesign(m,u);u.cooldown=Math.max(0,u.cooldown-dt);
        if(d.order==='attack'){
          const enemy=enemyTarget(s,c);
          if(enemy)shootOrApproach(s,c,u,g,world,enemy,dt);
          else if(c.owner.kind==='state'&&c.fortification!>0)shootFort(s,c,u,g,world,dt);
          else{d.order='stop';w.notice=c.owner.kind==='lineage'?'Útok odražen skutečným střetem. Město zůstává tvoje.':'Obrana zničena. Dojeď a obsaď náměstí.';}
        }else if(d.order==='defend'){
          if(r)shootOrApproach(s,c,u,g,world,r.unit,dt);else moveTank(s,c,u,g,world,c.address.position,dt,2.8);
        }else if(d.order==='occupy'){
          if(canOccupy(s,c,{kind:'lineage',id:s.homePlanet!.id})&&moveTank(s,c,u,g,world,c.address.position,dt,2.8)){
            d.hold=Math.min(5,d.hold+dt);if(transfer(s,c,{kind:'lineage',id:s.homePlanet!.id},u,d.hold,d.elapsed,null)){d.hold=0;d.order='stop';}
          }else d.hold=0;
        }else if(d.order==='retreat'&&moveTank(s,c,u,g,world,cityEntry(s,c),dt,2.8)){d.phase='returning';d.remaining=(d.route.length-1)*5;d.hold=0;u.intent='return';}
        else if(d.order==='stop')u.intent='rest';
      }
    }
  }
  if(r){
    const enemy=r.unit;
    if(enemy.health<=0){r.phase='destroyed';r.hold=0;r.remaining=0;enemy.intent='rest';w.notice='Nepřátelský tank zničen. Zaplacená jednotka nemá bezplatnou náhradu.';}
    else{
      const source=s.cities!.entries.find(v=>v.id===r.sourceCityId)!;
      if(r.phase!=='garrison'&&(enemy.health<=vehicleStats(r.blueprint).durability*.2||source.owner.id!==r.stateId)){r.phase='retreat';r.hold=0;}
      if(r.phase==='retreat'){
        if(moveTank(s,c,enemy,r.blueprint,world,cityEntry(s,c,true),dt,2.8)){r.phase='returning';r.remaining=(r.route.length-1)*5;enemy.intent='return';}
      }else if(u&&d?.phase==='field'&&u.health>0){r.hold=0;if(r.phase==='occupying')r.phase='field';shootOrApproach(s,c,enemy,r.blueprint,world,u,dt);}
      else if(c.owner.kind==='lineage'){
        if(c.fortification!>0){r.hold=0;shootFort(s,c,enemy,r.blueprint,world,dt);}
        else if(!canOccupy(s,c,{kind:'state',id:r.stateId})){r.hold=0;r.phase='retreat';w.notice='Obsazení odmítnuto limitem historie nebo hospodářství; zaplacený tank ustupuje.';}
        else if(moveTank(s,c,enemy,r.blueprint,world,c.address.position,dt,2.8)){
          r.phase='occupying';r.hold=Math.min(5,r.hold+dt);
          if(transfer(s,c,{kind:'state',id:r.stateId},enemy,r.hold,r.elapsed,r.id)){r.phase='garrison';r.hold=0;enemy.intent='rest';}
        }else r.hold=0;
      }
    }
  }
  if(u&&d?.phase==='field'&&u.health>0&&c.owner.kind==='state'&&cityGuard(c)&&c.defense!.health>0)machineShot(world,c.defense!,u,vehicleStats(c.defense!.blueprint).power,MILITARY_RANGE);
  if(u&&u.health<=0){m.fleet=m.fleet.filter(v=>v!==u);w.deployment=null;w.notice='Tvůj nasazený tank byl zničen. Město není automaticky ztracené: útočník musí prolomit radnici a obsadit náměstí.';}
}
