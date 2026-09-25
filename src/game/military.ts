import type { GameState, Vec3, World, Input } from './types';
import type { City } from './cities';
import type { CityEconomy } from './city-economy';
import { CITY_BUILDINGS } from './city-economy';
import { cityHall, cityLot, fieldDecorations } from './city-spatial';
import { activeField, fieldGround, navigation } from './planet-travel';
import { atlasNeighbours, planetAtlas } from './planet-geography';
import { activeMachines, machineDesign, machineHome, machineShot } from './machines';
import { initialVehicle, vehicleCost, vehicleStats, type VehicleBlueprint } from './blueprint';
import { moveUnit, unitNavigation } from './unit-motion';
import { horizontalDistance } from './random';
import { enableStates } from './states';

export interface CityDefense { transactionId:string; blueprint:VehicleBlueprint; pos:Vec3; health:number; cooldown:number; }
export interface CityCapture { from:City['owner']; unitId:number; elapsed:number; economy:CityEconomy|null; }
export interface Deployment { unitId:number; cityId:string; home:Vec3; route:number[]; phase:'outbound'|'field'|'returning'; remaining:number; order:'stop'|'attack'|'occupy'|'retreat'; hold:number; elapsed:number; }
export interface Military {version:1; deployment:Deployment|null; notice:string;}
export const defenseDesign=()=>{const g=initialVehicle('tank','predator');g.name='Městská stráž';g.hue=340;for(const p of g.parts)p.scale=.7;return g;};
export const DEFENSE_COST=vehicleCost(defenseDesign());
export const MILITARY_RANGE=12;
export function enableMilitary(s:GameState,origin:'birth'|'legacy-activation'='legacy-activation'):void {
  enableStates(s,origin);
  const migrate=(v:GameState)=>{
    if(v.military)return false;
    v.cities!.version=5;v.states!.version=2;
    for(const c of v.cities!.entries){c.foundingOwner={...c.owner};c.defense=null;c.capture=null;}
    v.military={version:1,deployment:null,notice:'Vojenská cesta používá původní placené tanky s dělem.'};return true;
  };
  migrate(s);if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}
export function landRoute(s:GameState,city:City):number[]|null {
  const atlas=planetAtlas(s.homePlanet!)!,goal=navigation(s)!.fields.find(f=>f.id===city.address.locationId)!.cellId,start=atlas.anchors[2].cellId;
  const queue=[start],parents=new Map<number,number>([[start,-1]]);
  for(let i=0;i<queue.length;i++){
    const cell=queue[i];if(cell===goal){const route:number[]=[];for(let at=goal;at!==-1;at=parents.get(at)!)route.unshift(at);return route;}
    for(const next of atlasNeighbours(cell))if(atlas.cells[next].surface==='land'&&!parents.has(next)){parents.set(next,cell);queue.push(next);}
  }return null;
}
export function deploymentQuote(s:GameState,c:City,id:number):string|null {
  const m=activeMachines(s),u=m?.fleet.find(u=>u.id===id);
  if(!s.military||s.stage!==4||s.deathReason||s.player.health<=0||navigation(s)?.mode!=='local'||activeField(s)?.id!==c.address.locationId)return 'Nasazení vyžaduje živou strojovou etapu a návštěvu cílového města.';
  if(s.military.deployment)return 'Jeden stroj už je nasazený. Nejprve jej vrať domů.';
  if(c.owner.kind!=='state'||c.capture)return 'Cílem musí být dosud nepřevzaté město soupeře.';
  if(!c.defense)return 'Stát ještě nezaplatil obranu. Toto město zatím není vojenským cílem.';
  if(!u||u.health<=0||machineDesign(m!,u).carrier!=='tank'||vehicleStats(machineDesign(m!,u)).module!=='cannon')return 'Vyber původní živý pozemní stroj s dělem. Vyrob jej v domovském editoru za jeho skutečnou cenu.';
  if(u.cargo||horizontalDistance(u.pos,machineHome(s))>12)return 'Stroj musí být bez nákladu do 12 jednotek od domácí dílny.';
  if(tankRadius(machineDesign(m!,u))>4)return 'Tato konstrukce je příliš široká pro první městskou výpravu (obal nejvýše 4). Vyrob menší tank.';
  if(!landRoute(s,c))return 'Do města nevede souvislá pevninská trasa. Lodě nejsou dostupné.';
  return null;
}
export function deployMachine(s:GameState,c:City,id:number):boolean {
  const reason=deploymentQuote(s,c,id);if(reason){if(s.military)s.military.notice=reason;return false;}
  const u=activeMachines(s)!.fleet.find(u=>u.id===id)!,route=landRoute(s,c)!;
  u.orders=[];u.intent='rest';
  s.military!.deployment={unitId:id,cityId:c.id,home:{...u.pos},route,phase:'outbound',remaining:(route.length-1)*5,order:'stop',hold:0,elapsed:0};
  s.military!.notice=`Tank ${id} vyrazil po ${route.length-1} pevninských hranách. Přeprava ${(route.length-1)*5} s; další cena 0, žádná nová jednotka.`;return true;
}
export function militaryOrder(s:GameState,order:Deployment['order']):boolean {
  const d=s.military?.deployment,c=s.cities?.entries.find(c=>c.id===d?.cityId);
  if(!d||!c||d.phase!=='field'||activeField(s)?.id!==c.address.locationId||navigation(s)?.mode!=='local'||s.deathReason||s.player.health<=0)return false;
  if(!['stop','attack','occupy','retreat'].includes(order))return false;
  if(order==='occupy'&&(!c.defense||c.defense.health>0||c.capture)){s.military!.notice='Nejprve znič skutečnou stráž; obsazené město nelze získat podruhé.';return false;}
  if(order==='attack'&&(c.capture||!c.defense||c.defense.health<=0))return false;
  d.order=order;d.hold=0;const u=activeMachines(s)!.fleet.find(u=>u.id===d.unitId);if(u)u.navigation.rethink=0;
  s.military!.notice=order==='stop'?'Stroj zastavil; nepřítel v dosahu může dál střílet.':order==='retreat'?'Ústup ke vstupu, potom uložená cesta domů. Poškození zůstává.':order==='occupy'?'Dojeď na náměstí a udrž je 5 sekund.':'Útok na placenou městskou stráž. Dosah 12; překážky blokují střelbu.';return true;
}
/** Temporary collision view. Never alter the generated field or its RNG. */
export function militaryWorld(s:GameState,c:City):World {
  const f=navigation(s)!.fields.find(f=>f.id===c.address.locationId)!,cell=planetAtlas(s.homePlanet!)!.cells[f.cellId],hall=cityHall(c.address.position);
  const shapes=[hall,...(c.economy?.buildings??[]).map(b=>({...cityLot(c,b.lot)!,radius:CITY_BUILDINGS[b.kind].radius})),...fieldDecorations(f,cell)];
  return {...f.world,obstacles:[...f.world.obstacles,...shapes.map((p,i)=>({id:100000+i,kind:'rock' as const,pos:{x:p.x,y:fieldGround(s.seed,cell,p.x,p.z)-4,z:p.z},radius:p.radius,height:24}))]};
}
/** Encloses all tank parts under arbitrary attachment angles and hull rotation.
 * Bounds mirror render/machine geometry, with a small safety margin. */
export function tankRadius(g:VehicleBlueprint):number {
  const hull=g.parts.find(p=>p.kind==='hull')!,bx=g.width*.95,by=g.width*.45,bz=g.length*1.65;
  const hx=bx*hull.scale,hy=by*hull.scale,hz=bz*hull.scale;
  let radius=Math.hypot(hx,hy,hz);
  for(const p of g.parts){if(p.kind==='hull')continue;
    const a=Math.max(-.93,Math.min(.93,p.axial)),profile=Math.pow(Math.max(0,1-a**6),1/6);
    const radial=Math.hypot(hx,hy)*profile,z=Math.abs(a)*hz;
    const local=p.kind==='tracks'?[Math.hypot(hx+.8,.5),hz*.65+.3]:p.kind==='cannon'?[1,1.6]:p.kind==='armor'?[1,.95]:p.kind==='cabin'?[1.2,.75]:[2.5,2.5];
    radius=Math.max(radius,Math.hypot(radial+local[0]*p.scale,z+local[1]*p.scale));
  }
  return radius+Math.abs(hull.axial)*bz*.5+.05;
}

export function stepMilitary(s:GameState,dt:number,input?:Input):void {
  const war=s.military,d=war?.deployment;
  if(!war||!d||!Number.isFinite(dt)||dt<=0||s.deathReason||s.player.health<=0||navigation(s)?.mode!=='local')return;
  const c=s.cities!.entries.find(c=>c.id===d.cityId)!;
  if(activeField(s)?.id!==c.address.locationId){d.hold=0;return;}
  const m=activeMachines(s)!,u=m.fleet.find(u=>u.id===d.unitId);
  if(!u||u.health<=0){war.deployment=null;war.notice='Nasazený tank byl zničen. Město zůstává soupeři; výroba náhrady se platí doma.';return;}
  dt=Math.min(dt,1/30);d.elapsed+=dt;
  const f=activeField(s)!,cell=planetAtlas(s.homePlanet!)!.cells[f.cellId];
  const entry={x:0,y:fieldGround(s.seed,cell,0,0)+.8,z:0};
  if(d.phase!=='field'){
    d.remaining=Math.max(0,d.remaining-dt);
    if(d.remaining>1e-8)return;
    if(d.phase==='returning'){u.pos={...d.home};u.navigation=unitNavigation(u.pos);u.intent='rest';war.deployment=null;war.notice=`Tank ${u.id} se vrátil domů se zdravím ${u.health.toFixed(1)}. Bez léčení a odměny.`;return;}
    d.phase='field';d.remaining=0;u.pos=entry;u.navigation=unitNavigation(u.pos);war.notice='Tank dorazil na vstup lokality. Vyber útok, obsazení, zastavení nebo ústup.';
  }
  const g=machineDesign(m,u),stats=vehicleStats(g),world=militaryWorld(s,c),guard=c.defense;
  u.cooldown=Math.max(0,u.cooldown-dt);if(guard)guard.cooldown=Math.max(0,guard.cooldown-dt);
  const move=(p:Vec3,stop:number)=>{u.intent='move';const arrived=moveUnit(world,u,p,[],stats.speed,dt,stop,tankRadius(g),tankRadius(g),true);u.pos.y=fieldGround(s.seed,cell,u.pos.x,u.pos.z)+.8;return arrived;};
  if(input&&(input.x||input.z)){d.order='stop';d.hold=0;move({x:Math.max(-74,Math.min(74,u.pos.x+input.x*4)),y:u.pos.y,z:Math.max(-74,Math.min(74,u.pos.z+input.z*4))},.1);}
  else if(d.order==='attack'&&guard&&guard.health>0&&!c.capture){
    u.intent='attack';
    if(!machineShot(world,u,guard,stats.power,MILITARY_RANGE)){move(guard.pos,Math.max(3,tankRadius(g)+1));}
    if(guard.health===0){d.order='stop';war.notice='Stráž zničena skutečnými zásahy. Nyní můžeš obsadit náměstí; vlastnictví se ještě nezměnilo.';}
  }else if(d.order==='occupy'&&guard?.health===0&&!c.capture){
    if(move(c.address.position,2.8)){d.hold+=dt;if(d.hold+1e-8>=5){
      c.capture={from:{...c.owner},unitId:u.id,elapsed:d.elapsed,economy:c.economy?structuredClone(c.economy):null};
      c.owner={kind:'lineage',id:s.homePlanet!.id};if(c.economy)c.economy.revision++;
      d.order='stop';d.hold=0;war.notice=`Město ${c.name} převzato po porážce stráže a 5 s obsazení. Pokladna a občané zachováni; hospodářství nyní ovládáš ty.`;
    }}else d.hold=0;
  }else if(d.order==='retreat'&&move(entry,2.8)){d.phase='returning';d.remaining=(d.route.length-1)*5;u.intent='return';d.hold=0;}
  else if(d.order==='stop')u.intent='rest';
  if(d.phase==='field'&&guard&&guard.health>0&&!c.capture)machineShot(world,guard,u,vehicleStats(guard.blueprint).power,MILITARY_RANGE);
  if(u.health===0){m.fleet=m.fleet.filter(v=>v!==u);war.deployment=null;war.notice='Tank zničen palbou stráže. Žádné převzetí ani odměna; zbývající poškození stráže se ukládá.';}
}
