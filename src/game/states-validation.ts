import { DEFENSE_COST } from './military';
import type { GameState } from './types';
import { cityId, cityProgression } from './cities';
import { CITY_BUILDINGS, isBuildingKind } from './city-economy';
import { atlasNeighbours, planetAtlas } from './planet-geography';
import { navigation, createField } from './planet-travel';
import { STATE_RESERVE, STATE_TURN_LIMIT, stateCities, stateId, type StateAction, type StateTransaction } from './states';
const check=(v:unknown):void=>{if(!v)throw new Error('Poškozený save: neplatné státy nebo státní transakce.');};
const shape=(v:unknown,keys:string[])=>{check(!!v&&typeof v==='object'&&!Array.isArray(v));const r=v as Record<string,unknown>;check(Object.keys(r).length===keys.length&&keys.every(k=>Object.hasOwn(r,k)));return r;};
const integer=(v:unknown,max:number,min=0)=>check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max);
const text=(v:unknown,max=200)=>check(typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v));
export function actionSignature(a:StateAction|null):unknown {
  return !a?null:a.kind==='found'?[a.kind,a.address.planetId,a.address.locationId,a.address.position.x,a.address.position.y,a.address.position.z]:a.kind==='build'?[a.kind,a.cityId,a.building,a.lot]:[a.kind,a.cityId];
}
export const txSignature=(t:StateTransaction)=>JSON.stringify([t.id,t.turn,actionSignature(t.action),t.cost,t.account]);
function validateAction(a:StateAction,s:GameState,owner:string):void {
  const kind=(a as StateAction|undefined)?.kind;
  if(a?.kind==='found'){
    shape(a,['kind','address']);shape(a.address,['planetId','locationId','position']);shape(a.address.position,['x','y','z']);
    const city=s.cities!.entries.find(c=>c.id===cityId(a.address.locationId));
    check((city?.foundingOwner??city?.owner)?.kind==='state'&&(city?.foundingOwner??city?.owner)?.id===owner&&JSON.stringify(actionSignature(a))===JSON.stringify(actionSignature({kind:'found',address:city!.address})));
  }else{
    check(kind==='open'||kind==='fund'||kind==='build'||kind==='invite'||kind==='defend'&&s.states?.version===2);
    shape(a,a.kind==='build'?['kind','cityId','building','lot']:['kind','cityId']);text(a.cityId);
    check(s.cities!.entries.some(c=>c.id===a.cityId&&(c.foundingOwner??c.owner).kind==='state'&&(c.foundingOwner??c.owner).id===owner));
    if(a.kind==='build'){check(isBuildingKind(a.building));integer(a.lot,120);}
  }
}
export function validateStates(s:GameState):void {
  const states=s.states;
  check((s.cities?.version===4||s.cities?.version===5)&&!!states);
  shape(states,['version','origin','activated','clock','entries']);
  check(states!.version===(s.cities?.version===5?2:1)&&(states!.origin==='birth'||states!.origin==='legacy-activation'));
  shape(states!.clock,['version','turn','elapsed']);check(states!.clock.version===1);integer(states!.clock.turn,STATE_TURN_LIMIT);
  const elapsed=states!.clock.elapsed;check(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<10);
  check(Array.isArray(states!.entries)&&states!.entries.length===(states!.activated?2:0));
  if(states!.activated===null){check(states!.clock.turn===0&&elapsed===0&&!s.cities!.entries.some(c=>c.owner.kind==='state'));return;}
  check(cityProgression(s));
  shape(states!.activated,['tick','stage']);integer(states!.activated.tick,s.tick);check([4,5].includes(states!.activated.stage)&&states!.activated.stage<=s.stage);
  const atlas=planetAtlas(s.homePlanet!)!,nav=navigation(s)!;
  for(const [index,r] of states!.entries.entries()){
    shape(r,['id','profile','endowment','reserve','last','transactions']);check(r.profile===index&&r.id===stateId(s.homePlanet!.id,index)&&r.endowment===STATE_RESERVE);integer(r.reserve,STATE_RESERVE);
    check(Array.isArray(r.transactions)&&r.transactions.length<=64);
    const cities=s.states?.version===2?s.cities!.entries.filter(c=>c.foundingOwner?.id===r.id).map(c=>c.capture?{...c,economy:c.capture.economy}:c):stateCities(s,r);check(cities.length<=2);
    let reserve=STATE_RESERVE,previous=0;
    const established:string[]=[],opened=new Set<string>();
    const records=new Map<string,{builds:Extract<StateAction,{kind:'build'}>[];invites:number;funds:number;nextId:number}>();
    for(const t of r.transactions){
      shape(t,['id','turn','action','cost','account']);integer(t.turn,states!.clock.turn,previous+1);previous=t.turn;
      check(t.id===`${r.id}:tx-${t.turn}`);integer(t.cost,80,1);validateAction(t.action,s,r.id);
      const a=t.action,c=cities.find(c=>c.id===(a.kind==='found'?cityId(a.address.locationId):a.cityId))!;
      if(a.kind==='found'){
        check(t.cost===60&&t.account==='reserve'&&reserve>=140&&!established.includes(c.id)&&c.founded.source==='state');
        if(c.founded.source!=='state')return;
        check(c.founded.transactionId===t.id&&c.founded.tick>=states!.activated.tick&&c.founded.purpose===(established.length?'expansion':'activation'));
        const cell=nav.fields.find(f=>f.id===c.address.locationId)!.cellId;
        check(!atlas.anchors.some(a=>a.cellId===cell)&&atlas.cells[cell].surface==='land');
        if(established.length)check(established.some(id=>atlasNeighbours(nav.fields.find(f=>f.id===cities.find(c=>c.id===id)!.address.locationId)!.cellId).includes(cell)));
        else check(atlas.cells[cell].regionId===atlas.cells[atlas.anchors[2].cellId].regionId);
        established.push(c.id);reserve-=60;
      }else if(a.kind==='open'){
        check(t.cost===80&&t.account==='reserve'&&reserve>=80&&established.includes(c.id)&&!opened.has(c.id));
        check(c.economy?.version===3&&c.economy.opened.source==='state'&&c.economy.opened.transactionId===t.id);
        opened.add(c.id);records.set(c.id,{builds:[],invites:0,funds:0,nextId:1});reserve-=80;
      }else if(a.kind==='defend'){check(states!.version===2&&t.account==='reserve'&&t.cost===DEFENSE_COST&&reserve>=DEFENSE_COST&&c.defense?.transactionId===t.id&&established.includes(c.id));reserve-=DEFENSE_COST;}else if(a.kind==='fund'){const record=records.get(c.id);check(!!record&&t.cost===20&&t.account==='reserve'&&reserve>=20);reserve-=20;record!.funds++;}
      else{
        const record=records.get(c.id);check(!!record&&t.account==='city');
        if(a.kind==='build'){
          check(t.cost===CITY_BUILDINGS[a.building].cost);
          check(c.economy!.buildings.some(b=>b.id===record!.nextId&&b.kind===a.building&&b.lot===a.lot&&b.enabled&&b.appearance?.source==='default'));
          record!.nextId++;record!.builds.push(a);
        }else{
          check(t.cost===8&&record!.builds.some(b=>b.building==='house')&&record!.invites<2);
          for(let i=0;i<2;i++){const id=record!.nextId++;check(c.economy!.residents.some(v=>v.id===id));}record!.invites++;
        }
      }
    }
    check(reserve===r.reserve&&established.length===cities.length);
    for(const c of cities){
      const field=nav.fields.find(f=>f.id===c.address.locationId)!;
      if(!nav.visits.some(v=>v.locationId===field.id)){
        const pristine=createField(s.seed,s.homePlanet!.id,atlas.cells[field.cellId]);
        check(s.homePlanet!.currentLocationId!==field.id&&field.world.time===0&&field.world.patches.every(p=>!p.discovered));
        check(field.position.x===pristine.position.x&&field.position.y===pristine.position.y&&field.position.z===pristine.position.z&&field.heading===pristine.heading);
        check(!c.economy||c.economy.cycle===0&&c.economy.elapsed===0);
      }
      check((!!c.economy)===opened.has(c.id));
      if(!c.economy)continue;
      const record=records.get(c.id)!,e=c.economy;
      check(e.nextId===record.nextId&&e.revision===1+record.builds.length+record.invites+record.funds&&e.buildings.length===record.builds.length&&e.residents.length===record.invites*2);
      check(e.ledger.transfers===80+record.funds*20&&e.ledger.supplies===0&&e.ledger.construction===record.builds.reduce((sum,b)=>sum+CITY_BUILDINGS[b.building].cost,0)&&e.ledger.immigration===record.invites*8);
    }
    if(states!.clock.turn===0){check(r.last===null&&r.transactions.length===0);continue;}
    shape(r.last,['turn','action','reason','outcome','transactionId']);const last=r.last!;
    check(last.turn===states!.clock.turn);text(last.reason,512);check(last.outcome==='paid'||last.outcome==='blocked');
    if(last.action!==null)validateAction(last.action,s,r.id);
    if(last.outcome==='paid')check(r.transactions.at(-1)?.id===last.transactionId&&r.transactions.at(-1)?.turn===last.turn&&JSON.stringify(actionSignature(r.transactions.at(-1)!.action))===JSON.stringify(actionSignature(last.action)));
    else check(last.transactionId===null&&!r.transactions.some(t=>t.turn===last.turn));
  }
  check(s.cities!.entries.every(c=>c.owner.kind!=='state'||states!.entries.some(r=>r.id===c.owner.id)));
}
export function statesCheckpointMatches(live:GameState,cp:GameState):boolean {
  const a=live.states,b=cp.states;
  if(!a||!b)return a===b;
  if(a.origin!==b.origin||a.clock.turn<b.clock.turn||a.clock.turn===b.clock.turn&&a.clock.elapsed+1e-7<b.clock.elapsed)return false;
  if(!b.activated)return true;
  if(!a.activated||a.activated.stage!==b.activated.stage||a.activated.tick!==b.activated.tick)return false;
  return b.entries.every(r=>{const l=a.entries.find(v=>v.id===r.id);return !!l&&r.transactions.every((t,i)=>!!l.transactions[i]&&txSignature(t)===txSignature(l.transactions[i]))&&(a.clock.turn!==b.clock.turn||JSON.stringify([r.last?.turn,actionSignature(r.last?.action??null),r.last?.reason,r.last?.outcome,r.last?.transactionId])===JSON.stringify([l.last?.turn,actionSignature(l.last?.action??null),l.last?.reason,l.last?.outcome,l.last?.transactionId]));});
}
