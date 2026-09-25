import { validateTradeTransfer } from './trade-validation';
import { cityGuard } from './cities';
import type { GameState, Vec3 } from './types';
import { activeMachines, machineDesign } from './machines';
import { defenseDesign, landRoute, militaryWorld, tankRadius } from './military';
import { FORTIFICATION, RAID_PREPARATION, TRANSFER_LIMIT, cityEntry, originalCityOwner, sameOwner } from './defense';
import { vehicleStats } from './blueprint';
import { cityEconomyCheckpointMatches, validateCityEconomy } from './city-economy-validation';
import { navigation, fieldGround } from './planet-travel';
import { planetAtlas } from './planet-geography';
const check=(v:unknown):void=>{if(!v)throw new Error('Poškozený save: neplatná obrana, výpad nebo historie vlastníků.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));};
const num=(v:unknown,max=1e9,min=0)=>check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max);
const integer=(v:unknown,max=1e9,min=0)=>{num(v,max,min);check(Number.isSafeInteger(v));};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const vector=(p:Vec3)=>{shape(p,['x','y','z']);num(p.x,78,-78);num(p.z,78,-78);num(p.y,1024,-1024);};
export function validateDefense(s:GameState):void {
  const w=s.military!;check((s.cities!.version===6&&s.states!.version===3||s.cities!.version===7&&s.states!.version===4)&&w.version===2&&Array.isArray(w.raids)&&w.raids.length<=2);
  const raids=w.raids!;check(new Set(raids.map(r=>r.stateId)).size===raids.length);
  for(const r of raids){
    shape(r,['id','stateId','sourceCityId','cityId','route','blueprint','unit','phase','remaining','elapsed','hold']);
    const state=s.states!.entries.find(v=>v.id===r.stateId),tx=state?.transactions.find(t=>t.id===r.id),c=s.cities!.entries.find(c=>c.id===r.cityId),source=s.cities!.entries.find(c=>c.id===r.sourceCityId);
    check(!!state&&!!source&&!!c&&tx?.action.kind==='raid'&&tx.action.cityId===r.cityId&&tx.action.sourceCityId===r.sourceCityId);
    // Strategic payment precedes all battles in that turn. Same-turn transfers occur after it.
    const atPayment=(city:typeof c)=>city!.transfers!.filter(t=>t.turn<tx!.turn).at(-1)?.to??originalCityOwner(s,city!);
    check(sameOwner(atPayment(source),{kind:'state',id:r.stateId})&&sameOwner(atPayment(c),{kind:'lineage',id:s.homePlanet!.id}));
    check(same(r.blueprint,defenseDesign())&&same(r.route,landRoute(s,c!,navigation(s)!.fields.find(f=>f.id===source!.address.locationId)!.cellId)));
    check(['preparing','outbound','waiting','field','occupying','garrison','retreat','returning','returned','withdrawn','destroyed'].includes(r.phase));
    num(r.remaining,Math.max(RAID_PREPARATION,(r.route.length-1)*5));num(r.elapsed);num(r.hold,5);
    if(r.phase==='preparing')num(r.remaining,RAID_PREPARATION);else if(['outbound','returning'].includes(r.phase))num(r.remaining,(r.route.length-1)*5);else check(r.remaining===0);
    const u=r.unit;shape(u,['id','blueprint','pos','heading','health','cooldown','cargo','orders','navigation','intent']);
    check(u.id===1&&u.blueprint===1&&u.cargo===0&&Array.isArray(u.orders)&&u.orders.length===0);vector(u.pos);num(u.heading,1e6,-1e6);num(u.health,vehicleStats(r.blueprint).durability);num(u.cooldown,1.2);
    check(['rest','move','return','attack'].includes(u.intent));shape(u.navigation,['waypoint','target','rethink']);vector(u.navigation.waypoint);vector(u.navigation.target);num(u.navigation.rethink,1,-1);
    check((u.health===0)===(r.phase==='destroyed'));
    if(['preparing','outbound','waiting'].includes(r.phase))check(same(u.pos,cityEntry(s,source!,true))&&r.elapsed===0&&r.hold===0&&u.health===vehicleStats(r.blueprint).durability&&u.cooldown===0);
    else if(r.phase!=='withdrawn'||r.elapsed>0){
      const at=r.phase==='returned'?source!:c!,cell=planetAtlas(s.homePlanet!)!.cells[navigation(s)!.fields.find(f=>f.id===at.address.locationId)!.cellId];
      check(Math.abs(u.pos.y-fieldGround(s.seed,cell,u.pos.x,u.pos.z)-.8)<1e-6);
      check(militaryWorld(s,at).obstacles.every(o=>Math.hypot(o.pos.x-u.pos.x,o.pos.z-u.pos.z)>=o.radius+tankRadius(r.blueprint)-1e-5));
    }
    const d=w.deployment,player=d?.cityId===c!.id&&d.phase==='field'?activeMachines(s)!.fleet.find(v=>v.id===d.unitId):null;
    if(player&&['field','occupying','garrison','retreat'].includes(r.phase))check(Math.hypot(player.pos.x-u.pos.x,player.pos.z-u.pos.z)>=tankRadius(machineDesign(activeMachines(s)!,player))+tankRadius(r.blueprint)-1e-5);
    if(r.phase==='returned')check(same(u.pos,cityEntry(s,source!,true)));
    if(r.hold>0)check(r.phase==='occupying'&&c!.owner.kind==='lineage'&&c!.fortification===0&&Math.hypot(u.pos.x-c!.address.position.x,u.pos.z-c!.address.position.z)<=2.86);
    if(r.phase==='garrison')check(c!.owner.id===r.stateId&&c!.transfers!.some(t=>t.method!=='trade'&&t.raidId===r.id));
  }
  for(const c of s.cities!.entries){
    check(Array.isArray(c.transfers)&&c.transfers.length<=TRANSFER_LIMIT);num(c.fortification,FORTIFICATION);
    let owner=originalCityOwner(s,c),previous={...c,economy:c.capture?.economy??null},turn=0;
    for(const [index,t] of c.transfers!.entries()){
      if(t.method==='trade')validateTradeTransfer(s,c,t,index);
      else shape(t,['from','to','unitId','raidId','turn','elapsed','economy']);
      shape(t.from,['kind','id']);shape(t.to,['kind','id']);
      check(sameOwner(t.from,owner)&&!sameOwner(t.to,owner));integer(t.turn,s.states!.clock.turn,turn);turn=t.turn;
      if(t.method!=='trade'){num(t.elapsed,1e9,5);
      if(t.to.kind==='lineage'){check(t.to.id===s.homePlanet!.id&&t.raidId===null);integer(t.unitId,activeMachines(s)!.nextId-1,1);}
      else{const r=raids.find(r=>r.id===t.raidId);check(t.to.kind==='state'&&r?.stateId===t.to.id&&r.cityId===c.id&&t.unitId===1&&r.elapsed>=t.elapsed&&s.states!.entries.find(v=>v.id===r.stateId)!.transactions.find(v=>v.id===r.id)!.turn<=t.turn&&r.phase!=='preparing'&&r.phase!=='outbound'&&r.phase!=='waiting');
        check(c.transfers!.filter(v=>v.method!=='trade'&&v.raidId===t.raidId).length===1);}
      }
      const archived={...c,economy:t.economy};validateCityEconomy(s,archived);check(cityEconomyCheckpointMatches(archived,previous));
      if(previous.economy&&t.economy)check(t.economy.revision>previous.economy.revision);
      previous=archived;owner=t.to;
    }
    check(sameOwner(c.owner,owner)&&cityEconomyCheckpointMatches(c,previous));
    if(c.transfers!.some(t=>t.method!=='trade'))check(c.fortification===0&&(!cityGuard(c)||c.defense!.health===0));
    // A later sale cannot erase the destroyed guard required by an earlier battle.
    if(c.transfers!.length&&c.transfers![0].method!=='trade')check(!c.defense||c.defense.health===0);
    if(c.transfers!.length){if(previous.economy)check(c.economy!.revision>previous.economy.revision);}
  }
}
const phaseRank={preparing:0,outbound:1,waiting:2,field:3,occupying:3,garrison:4,retreat:5,returning:6,returned:7,withdrawn:7,destroyed:7};
export function defenseCheckpointMatches(live:GameState,cp:GameState):boolean {
  if(live.military?.version!==cp.military?.version)return false;
  if(live.military?.version!==2)return true;
  return cp.cities!.entries.every(c=>{const l=live.cities!.entries.find(v=>v.id===c.id)!;return l&&l.fortification!<=c.fortification!&&c.transfers!.every((t,i)=>same(t,l.transfers![i]));})&&cp.military!.raids!.every(r=>{const l=live.military!.raids!.find(v=>v.id===r.id);return l&&phaseRank[r.phase]<=phaseRank[l.phase]&&(!['returned','withdrawn','destroyed'].includes(r.phase)||r.phase===l.phase)&&(r.phase!==l.phase||!['preparing','outbound','returning'].includes(r.phase)||l.remaining<=r.remaining+1e-7)&&same([r.stateId,r.sourceCityId,r.cityId,r.route,r.blueprint],[l.stateId,l.sourceCityId,l.cityId,l.route,l.blueprint])&&r.unit.health>=l.unit.health&&r.elapsed<=l.elapsed;});
}
