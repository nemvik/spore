import { raidOpportunity, createRaid } from './defense';
import { DEFENSE_COST, defenseDesign } from './military';
import { vehicleStats } from './blueprint';
import type { GameState } from './types';
import type { LocationAddress } from './home-planet';
import { cityId, cityProgression, citySite, enableCities, type City } from './cities';
import { CITY_BUILDINGS, CITY_LEDGER_LIMIT, type CityBuildingKind } from './city-economy';
import { buildingSite, CITY_LOTS } from './city-spatial';
import { createField, fieldGround, navigation, FIELD_LIMIT, type FieldLocation } from './planet-travel';
import { atlasNeighbours, planetAtlas } from './planet-geography';
import { defaultBuildingAppearance } from './building-design';

export const STATE_RESERVE = 400;
export const STATE_TURN_SECONDS = 10;
export const STATE_TURN_LIMIT = 1e7;
export const STATE_PROFILES = [
  {name:'Svaz zelených údolí',color:'#79d4b3',priority:'garden'},
  {name:'Liga měděných věží',color:'#dc9ee5',priority:'workshop'},
] as const;
export type StateAction = {kind:'raid';cityId:string;sourceCityId:string} | {kind:'defend';cityId:string} | {kind:'found';address:LocationAddress} | {kind:'open';cityId:string} | {kind:'fund';cityId:string} | {kind:'build';cityId:string;building:CityBuildingKind;lot:number} | {kind:'invite';cityId:string};
export interface StateTransaction {id:string;turn:number;action:StateAction;cost:number;account:'reserve'|'city'|'trade';}
export interface StateDecision {turn:number;action:StateAction|null;reason:string;outcome:'paid'|'blocked';transactionId:string|null;}
export interface RivalState {id:string;profile:0|1;endowment:400;reserve:number;tradeReserve?:number;last:StateDecision|null;transactions:StateTransaction[];}
export interface StateRegistry {version:1|2|3|4;origin:'birth'|'legacy-activation';activated:{tick:number;stage:4|5}|null;clock:{version:1;turn:number;elapsed:number};entries:RivalState[];}
export const stateId=(planetId:string,profile:number)=>`${planetId}:state-${profile}`;
export const stateCities=(s:GameState,r:RivalState)=>(s.cities?.entries.filter(c=>c.owner.kind==='state'&&c.owner.id===r.id)??[]).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
export const ownerName=(s:GameState,c:City)=>c.owner.kind==='lineage'?'Tvoje linie':STATE_PROFILES[s.states!.entries.find(r=>r.id===c.owner.id)!.profile].name;
export const ownerColor=(s:GameState,c:City)=>c.owner.kind==='lineage'?'#ffda80':STATE_PROFILES[s.states!.entries.find(r=>r.id===c.owner.id)!.profile].color;

/** Migration is data-only. Actual activation/settlement happens on a future playable step. */
export function enableStates(s:GameState,origin:StateRegistry['origin']='legacy-activation'):void {
  enableCities(s);
  const migrate=(v:GameState)=>{
    if(v.states)return false;
    v.cities!.version=4;
    v.states={version:1,origin,activated:null,clock:{version:1,turn:0,elapsed:0},entries:[]};
    return true;
  };
  migrate(s);
  if(s.checkpoint){const cp=JSON.parse(s.checkpoint) as GameState;if(migrate(cp))s.checkpoint=JSON.stringify(cp);}
}

/** Pure candidate search: never insert into the live navigation or mark a player visit. */
function settlement(s:GameState,r:RivalState):{action:Extract<StateAction,{kind:'found'}>;field:FieldLocation}|null {
  const nav=navigation(s)!,atlas=planetAtlas(s.homePlanet!)!,owned=stateCities(s,r);
  const origin=atlas.anchors[2].cellId;
  const candidates=owned.length?[...new Set(owned.flatMap(c=>atlasNeighbours(nav.fields.find(f=>f.id===c.address.locationId)!.cellId)))].sort((a,b)=>a-b)
    :atlas.cells.filter(c=>c.surface==='land'&&c.regionId===atlas.cells[origin].regionId).map(c=>c.id).sort((a,b)=>{
      const distance=(id:number)=>Math.abs(Math.floor(id/72)-Math.floor(origin/72))+Math.min(Math.abs(id%72-origin%72),72-Math.abs(id%72-origin%72));
      return distance(a)-distance(b)||a-b;
    });
  for(const cellId of candidates){
    const cell=atlas.cells[cellId];
    if(cell.surface!=='land'||atlas.anchors.some(a=>a.cellId===cellId)||nav.fields.some(f=>f.cellId===cellId))continue;
    const field=createField(s.seed,s.homePlanet!.id,cell);
    const trial={...s,homePlanet:{...s.homePlanet!,navigation:{...nav,fields:[...nav.fields,field]}}} as GameState;
    for(const z of [-40,40,-56,56])for(const x of [-40,40,-56,56]){
      const address={planetId:s.homePlanet!.id,locationId:field.id,position:{x,y:fieldGround(s.seed,cell,x,z),z}};
      if(citySite(trial,address)===null)return {action:{kind:'found',address},field};
    }
  }
  return null;
}
export interface StateOpportunity {action:StateAction|null;cost:number;account:'reserve'|'city'|'trade';reason:string;available:boolean;}
/** A forecast is not a decision or a receipt. Policy reads current resources/layout. */
export function stateOpportunity(s:GameState,r:RivalState):StateOpportunity {
  const blocked=(reason:string,action:StateAction|null=null,cost=0,account:'reserve'|'city'|'trade'='reserve'):StateOpportunity=>({action,cost,account,reason,available:false});
  if(!s.states?.activated||!s.states.entries.includes(r)||!cityProgression(s))return blocked('Státní vrstva ještě není aktivní.');
  if(r.transactions.length>=64||s.states.clock.turn>=STATE_TURN_LIMIT)return blocked('Dosažen limit státních dokladů nebo strategického času.');
  const owned=stateCities(s,r);
  if(systemDefeated(s,r))return blocked('Stát ztratil poslední město. Rezerva zůstává zmrazená; další osídlení neprovede.');
  const raid=raidOpportunity(s,r);if(raid)return raid;
  for(const c of owned){
    if(s.states.version>=3&&(c.capture||c.transfers!.length))continue; // Never replay founding purchases after recapture.
    if(s.states.version>=2&&!c.defense){const action={kind:'defend',cityId:c.id} as const;return r.reserve<DEFENSE_COST?blocked(`Na stráž chybí ${DEFENSE_COST} jantaru v konečné rezervě.`,action,DEFENSE_COST):{action,cost:DEFENSE_COST,account:'reserve',reason:`Zaplatit jednu městskou stráž za ${DEFENSE_COST} z konečné rezervy.`,available:true};}
    const e=c.economy;
    if(!e){const action={kind:'open',cityId:c.id} as const;return r.reserve<80?blocked('V rezervě chybí 80 jantaru pro otevření hospodářství.',action,80):{action,cost:80,account:'reserve',reason:'Převést 80 z vlastní rezervy do nové městské pokladny.',available:true};}
    if(e.revision>=1e9||e.nextId>=1e9-2||Object.values(e.ledger).some(v=>v>CITY_LEDGER_LIMIT-100))return blocked('Dosažen účetní limit města.');
    const shortage=(reason:string,action:StateAction,cost:number):StateOpportunity=>r.reserve>=20||(r.tradeReserve??0)>=20?{action:{kind:'fund',cityId:c.id},cost:20,account:r.reserve>=20?'reserve':'trade',reason:`${reason} Převést 20 z ${r.reserve>=20?'původní rezervy':'civilního účtu skutečných prodejů'} do města.`,available:true}:blocked(`${reason} V rezervě chybí i 20 na převod; žádná dotace nevznikne.`,action,cost,'city');
    const priority=STATE_PROFILES[r.profile].priority;
    const missing=!e.buildings.some(b=>b.kind==='house')?'house':!e.buildings.some(b=>b.kind===priority)?priority:e.residents.length<4?null:!e.buildings.some(b=>b.kind===(priority==='garden'?'workshop':'garden'))?(priority==='garden'?'workshop':'garden'):undefined;
    if(missing===undefined){
      const upkeep=e.buildings.filter(b=>b.enabled).reduce((n,b)=>n+CITY_BUILDINGS[b.kind].upkeep,0);
      if(e.treasury<upkeep)return shortage('Městu chybí prostředky na údržbu.',{kind:'fund',cityId:c.id},20);
      continue;
    }
    if(missing===null){
      const action={kind:'invite',cityId:c.id} as const;
      if(e.food+4>120)return blocked('Sklad nemá místo na 4 příjezdové porce.',action,8,'city');
      return e.treasury<8?shortage('Městské pokladně chybí 8 jantaru na dva občany.',action,8):{action,cost:8,account:'city',reason:'Volné obydlí: pozvat dva nové občany tohoto státu za 8 jantaru.',available:true};
    }
    const cost=CITY_BUILDINGS[missing].cost;
    const lot=CITY_LOTS.find(l=>!buildingSite(s,c,l.id,missing));
    if(!lot)return blocked(`Pro ${CITY_BUILDINGS[missing].name} není vhodná volná parcela.`);
    const action={kind:'build',cityId:c.id,building:missing,lot:lot.id} as const;
    return e.treasury<cost?shortage(`Městské pokladně chybí ${cost} jantaru na ${CITY_BUILDINGS[missing].name}.`,action,cost):{action,cost,account:'city',reason:`${missing==='house'?'Zajistit bydlení':`${missing===priority?'Priorita státu':'Doplnit provoz'}: ${CITY_BUILDINGS[missing].name}`} · parcela ${lot.id+1}, cena ${cost}.`,available:true};
  }
  if((s.states.version>=2?r.transactions.filter(t=>t.action.kind==='found').length:owned.length)>=2)return blocked('Dosažen limit dvou měst státu. Další expanze neproběhne.');
  if(navigation(s)!.fields.length>=FIELD_LIMIT)return blocked('Registr 64 lokalit je plný; žádný svět se nepřepíše.');
  // Reserve the complete 60 + 80 establishment cost; never create an unfundable colony.
  if(r.reserve<140)return blocked('Expanze potřebuje 140 jantaru v rezervě: založení 60 a budoucí převod 80.');
  const site=settlement(s,r);
  return site?{action:site.action,cost:60,account:'reserve',reason:owned.length?'Rozvinuté město: založit druhé na sousední volné pevnině za 60.':'Nové osídlení při aktivaci: založit první město za 60 z počáteční rezervy.',available:true}:blocked('Není vhodná volná pevnina pro osídlení. Voda, cizí i navštívená místa jsou chráněná.');
}

/** Re-evaluate an intent immediately before its one synchronous payment. */
export function executeStateDecision(s:GameState,id:string,turn:number):boolean {
  const system=s.states,r=system?.entries.find(v=>v.id===id);
  if(!system?.activated||!r||turn!==system.clock.turn||!Number.isInteger(turn)||turn<1||r.last&&r.last.turn>=turn||navigation(s)?.mode!=='local'||s.deathReason||s.player.health<=0)return false;
  const q=stateOpportunity(s,r),decision:StateDecision={turn,action:q.action,reason:q.reason,outcome:'blocked',transactionId:null};
  r.last=decision;
  if(!q.available||!q.action)return false;
  const action=q.action,transactionId=`${r.id}:tx-${turn}`;
  if(action.kind==='raid'){
    const source=s.cities!.entries.find(c=>c.id===action.sourceCityId)!,city=s.cities!.entries.find(c=>c.id===action.cityId)!;
    const raid=createRaid(s,r.id,source,city,transactionId);r.reserve-=DEFENSE_COST;s.military!.raids!.push(raid);s.military!.notice=q.reason;
  }else if(action.kind==='found'){
    const nav=navigation(s)!,cell=planetAtlas(s.homePlanet!)!.cells.find(c=>`${s.homePlanet!.id}:field-${c.id}`===action.address.locationId)!;
    const field=createField(s.seed,s.homePlanet!.id,cell);
    const city:City={id:cityId(field.id),name:`${r.profile===0?'Zelený dvůr':'Měděná věž'} ${stateCities(s,r).length+1}`,owner:{kind:'state',id:r.id},address:structuredClone(action.address),
      founded:{source:'state',stage:s.stage as 4|5,tick:s.tick,paidAmber:60,transactionId,purpose:stateCities(s,r).length?'expansion':'activation'},local:{version:1},economy:null};
    if(s.cities!.version>=5){city.foundingOwner={...city.owner};city.defense=null;city.capture=null;}
    if(s.cities!.version>=6){city.transfers=[];city.fortification=80;}
    if(s.cities!.version>=8)city.conversion={version:1,events:[]};
    r.reserve-=60;nav.fields.push(field);s.cities!.entries.push(city);
  }else{
    const city=s.cities!.entries.find(c=>c.id===action.cityId)!;
    if(action.kind==='defend'){
      const blueprint=defenseDesign();r.reserve-=DEFENSE_COST;city.defense={transactionId,blueprint,pos:{...city.address.position,y:city.address.position.y+.8},health:vehicleStats(blueprint).durability,cooldown:0};
    }else if(action.kind==='open'){
      r.reserve-=80;
      city.economy={version:3,opened:{source:'state',tick:s.tick,transferredAmber:80,transactionId},revision:1,nextId:1,elapsed:0,cycle:0,treasury:80,food:0,buildings:[],residents:[],ledger:{transfers:80,construction:0,immigration:0,supplies:0,income:0,upkeep:0,produced:0,consumed:0,discarded:0},last:null};
    }else if(action.kind==='fund'){if(q.account==='trade')r.tradeReserve!-=20;else r.reserve-=20;city.economy!.treasury+=20;city.economy!.ledger.transfers+=20;city.economy!.revision++;}
    else{
      const e=city.economy!;e.treasury-=q.cost;e.revision++;
      if(action.kind==='build'){e.ledger.construction+=q.cost;e.buildings.push({id:e.nextId++,kind:action.building,lot:action.lot,enabled:true,paidAmber:q.cost,appearance:defaultBuildingAppearance()});}
      else{e.ledger.immigration+=8;e.food+=4;for(let i=0;i<2;i++)e.residents.push({id:e.nextId++,source:'invited',cycle:e.cycle,paidAmber:4});}
    }
  }
  r.transactions.push({id:transactionId,turn,action:structuredClone(action),cost:q.cost,account:q.account});decision.outcome='paid';decision.transactionId=transactionId;
  return true;
}
export function stepStates(s:GameState,dt:number):void {
  const system=s.states;
  if(!system||!cityProgression(s)||navigation(s)?.mode!=='local'||s.deathReason||s.player.health<=0||!Number.isFinite(dt)||dt<=0)return;
  if(!system.activated){system.activated={tick:s.tick,stage:s.stage as 4|5};system.entries=STATE_PROFILES.map((_,profile)=>({id:stateId(s.homePlanet!.id,profile),profile:profile as 0|1,endowment:400,reserve:400,...(system.version===4?{tradeReserve:0}:{}),last:null,transactions:[]}));}
  if(system.clock.turn>=STATE_TURN_LIMIT)return;
  system.clock.elapsed+=Math.min(dt,1/30);
  if(system.clock.elapsed+1e-9<STATE_TURN_SECONDS)return;
  system.clock.elapsed=Math.max(0,system.clock.elapsed-STATE_TURN_SECONDS);system.clock.turn++;
  for(const r of system.entries)executeStateDecision(s,r.id,system.clock.turn);
}

export const systemDefeated=(s:GameState,r:RivalState)=>(s.states?.version??0)>=2&&r.transactions.some(t=>t.action.kind==='found')&&stateCities(s,r).length===0;
