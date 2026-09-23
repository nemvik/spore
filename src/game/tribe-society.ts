import type { ActiveTribeState, NeighbourSociety, NeighbourUnit, TribeNeighbour } from './era-types';
import type { GameState, Vec3, World } from './types';
import { horizontalDistance } from './random';
import { moveUnit, openGround, unitNavigation } from './unit-motion';
import { TRIBE_COPY } from './tribe-copy.cs';

export const SOCIETY = { capacity: 4, stock: 48, recruit: 12, meal: 2, cargo: 2, warning: 10 } as const;
export const neighbourDisposition = (n: TribeNeighbour): 'friendly' | 'neutral' | 'hostile' =>
  n.resolved || n.relation >= 30 ? 'friendly' : n.relation <= -25 ? 'hostile' : 'neutral';

/** Ground interactions cannot cross a trunk, cliff or rock, even inside reach. */
export function tribeContact(world: World, a: Vec3, b: Vec3): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  return world.obstacles.every(o => {
    const t = length ? Math.max(0, Math.min(1, ((o.pos.x - a.x) * dx + (o.pos.z - a.z) * dz) / length)) : 0;
    return Math.hypot(a.x + dx * t - o.pos.x, a.z + dz * t - o.pos.z) >= o.radius;
  });
}
function resident(s: GameState, t: ActiveTribeState, n: TribeNeighbour): NeighbourUnit {
  const id = t.nextId++, pos = openGround(s.world, n.pos, id, 4.5);
  return { id, pos, heading: 0, health: 70, hunger: 28, cargo: 0, cooldown: 0, task: 'rest', resource: null, navigation: unitNavigation(pos) };
}
export function initializeNeighbours(s: GameState, t: ActiveTribeState): void {
  for (const n of [...t.neighbours].sort((a,b) => a.id-b.id)) if (!n.society) {
    n.society = { version: 1, food: 12, members: [], recruitCooldown: 30, raidCooldown: 0, truce: 0, expedition: null };
    for (let i=0;i<3;i++) n.society.members.push(resident(s,t,n));
  }
}
/** Explicit UI migration; never recreate an empty population or rewrite results. */
export function enableNeighbourSocieties(s: GameState): void {
  if (s.stage !== 3 || s.tribe?.version !== 2) return;
  initializeNeighbours(s,s.tribe);
  if (s.checkpoint) {
    const checkpoint = JSON.parse(s.checkpoint) as GameState;
    enableNeighbourSocieties(checkpoint);
    s.checkpoint = JSON.stringify(checkpoint);
  }
}
export function recallExpedition(society: NeighbourSociety): void {
  if (society.expedition) { society.expedition.phase = 'return'; society.expedition.time = 0; }
  society.raidCooldown = Math.max(society.raidCooldown, 60);
}

/** Every gain is a physical harvest/delivery; every recovery spends stored food. */
export function stepSociety(s: GameState, t: ActiveTribeState, n: TribeNeighbour, dt: number, positions: readonly {id:number;pos:Vec3}[]): string[] {
  const a = n.society; if (!a) return [];
  const messages: string[] = [], home = t.huts.filter(h => h.kind==='shelter' && h.progress===1 && h.health>0).sort((x,y)=>x.id-y.id)[0].pos;
  const disposition = neighbourDisposition(n), name = TRIBE_COPY.neighbours[n.identity].name;
  n.alarm = Math.max(0,n.alarm-dt); n.cooldown = Math.max(0,n.cooldown-dt);
  a.truce = Math.max(0,a.truce-dt); a.raidCooldown = Math.max(0,a.raidCooldown-dt); a.recruitCooldown = Math.max(0,a.recruitCooldown-dt);
  a.members = a.members.filter(u=>u.health>0).sort((x,y)=>x.id-y.id);
  const attackers = t.members.filter(u=>{const o=u.orders[0],target=o?.target;return u.health>0&&o?.kind==='attack'&&(target.kind==='neighbour'&&target.id===n.id||target.kind==='neighbour-unit'&&a.members.some(v=>v.id===target.id));});
  const invading = attackers.filter(u=>horizontalDistance(u.pos,n.pos)<16);
  if (a.expedition) {
    const e=a.expedition;
    e.members=e.members.filter(id=>a.members.some(u=>u.id===id));
    e.time+=dt;
    if (!e.members.length) { a.expedition=null; a.raidCooldown=60; }
    else if (e.phase!=='return' && (n.resolved || disposition!=='hostile' || a.food>=16 || a.truce>0 || invading.length || e.time>45 || a.members.filter(u=>e.members.includes(u.id)).some(u=>u.health<28||u.hunger>75))) recallExpedition(a);
    else if(e.phase==='warning' && e.time>=SOCIETY.warning) { e.phase='outbound'; e.time=0; messages.push(`${name}: výprava vyrazila k tvému jídlu. Můžeš ji zastavit nebo nabídnout smír.`); }
  }
  // A real shortage, a hostile relation and spare people are all required.
  if (!n.resolved && disposition==='hostile' && !a.expedition && a.raidCooldown===0 && a.truce===0 && a.food<10 && t.food>=8 && a.members.length>=3 && !invading.length) {
    const ready=a.members.filter(u=>u.health>=50&&u.hunger<65&&u.cargo===0&&horizontalDistance(u.pos,n.pos)<7);
    const count=Math.min(2,Math.max(1,Math.floor(t.members.length/2)),a.members.length-2);
    if(ready.length>=count){a.expedition={phase:'warning',members:ready.slice(0,count).map(u=>u.id),time:0};messages.push(`${name}: chybí jídlo. Za ${SOCIETY.warning} s vyrazí výprava. Připrav obranu nebo přines dar.`);}
  }
  for (const u of a.members) {
    u.cooldown=Math.max(0,u.cooldown-dt); u.hunger=Math.min(100,u.hunger+dt*.25);
    if(u.hunger>=90)u.health=Math.max(0,u.health-dt*.45);
    if(u.health<=0)continue;
    const travel=(p:Vec3,stop=2)=>moveUnit(s.world,u,p,positions,n.identity==='terrace'?3.6:4,dt,stop);
    const contact=(p:Vec3,stop=2)=>{travel(p,tribeContact(s.world,u.pos,p)?stop:.5);return horizontalDistance(u.pos,p)<=stop+.05&&tribeContact(s.world,u.pos,p);};
    const atHome=horizontalDistance(u.pos,n.pos)<5 && tribeContact(s.world,u.pos,n.pos);
    if(atHome){
      if(u.cargo>0){const delivered=Math.min(u.cargo,(SOCIETY.stock-a.food)/4);a.food+=delivered*4;u.cargo-=delivered;}
      if(u.hunger>=30&&a.food>=SOCIETY.meal){a.food-=SOCIETY.meal;u.hunger=Math.max(0,u.hunger-32);}
      if(u.health<70&&u.hunger<60&&a.food>=dt*.2){const healed=Math.min(70-u.health,dt*2);a.food-=healed*.1;u.health+=healed;}
    }
    const e=a.expedition, onExpedition=!!e?.members.includes(u.id);
    const aggressor = !n.resolved && a.truce===0 ? attackers.filter(v=>horizontalDistance(v.pos,u.pos)<10&&(horizontalDistance(v.pos,n.pos)<18||onExpedition)).sort((x,y)=>horizontalDistance(x.pos,u.pos)-horizontalDistance(y.pos,u.pos)||x.id-y.id)[0] : undefined;
    const raiding=onExpedition&&e?.phase==='outbound';
    const target=aggressor ?? (raiding ? t.members.filter(v=>v.health>0&&horizontalDistance(v.pos,u.pos)<5).sort((x,y)=>horizontalDistance(x.pos,u.pos)-horizontalDistance(y.pos,u.pos)||x.id-y.id)[0] : undefined);
    if(target && u.health>=20 && u.hunger<80){
      u.task='defend';
      if(contact(target.pos,2.2)&&u.cooldown===0){
        const guarded=t.legacyAbility==='predator'&&t.abilityTime>0;
        const shield=t.members.some(v=>v.health>0&&v.benefit==='shield'&&v.hunger<70&&horizontalDistance(v.pos,target.pos)<9);
        target.health=Math.max(0,target.health-(n.identity==='terrace'?5:4)*(guarded?.45:1)*(shield?.65:1));u.cooldown=1.8;
      }
      continue;
    }
    if(onExpedition&&e){
      u.task=e.phase==='outbound'?'raid':e.phase==='return'?'return':'rest';
      if(e.phase==='warning'){travel(n.pos,4);continue;}
      if(e.phase==='outbound'){
        if(contact(home,3.5)) { const stolen=Math.min(t.food,(SOCIETY.cargo-u.cargo)*4);t.food-=stolen;u.cargo+=stolen/4;recallExpedition(a);messages.push(`${name}: výprava odnáší ${Math.round(stolen)} jídla. Náklad získá až návratem domů.`); }
        continue;
      }
      if(atHome&&u.cargo===0)e.members=e.members.filter(id=>id!==u.id);else travel(n.pos,3.5);
      continue;
    }
    if(u.cargo>=SOCIETY.cargo||u.cargo>0&&!s.world.resources.some(r=>r.id===u.resource&&r.amount>=1)||u.health<28||u.hunger>65&&a.food>=2){u.task='return';travel(n.pos,3.5);continue;}
    if(a.food>=SOCIETY.stock-8){u.task='rest';u.resource=null;travel(n.pos,5);continue;}
    let source=s.world.resources.find(r=>r.id===u.resource&&r.amount>=1&&(disposition!=='friendly'||horizontalDistance(r.pos,home)>18));
    if(!source){
      const range=a.food<4?72:38;
      source=s.world.resources.filter(r=>r.kind!=='meat'&&r.amount>=1&&horizontalDistance(r.pos,n.pos)<range && (disposition!=='friendly'||horizontalDistance(r.pos,home)>18) && s.world.obstacles.every(o=>horizontalDistance(o.pos,r.pos)>o.radius+.9))
        .sort((x,y)=>horizontalDistance(x.pos,u.pos)-horizontalDistance(y.pos,u.pos)||x.id-y.id)[0];
      u.resource=source?.id??null;
    }
    if(!source){u.task='rest';travel(n.pos,4);continue;}
    u.task='forage';
    if(contact(source.pos,2)&&u.cooldown===0){const portion=Math.min(1,SOCIETY.cargo-u.cargo);source.amount-=portion;u.cargo+=portion;u.cooldown=1.8;const patch=s.world.patches[source.patch];patch.harvested++;patch.fertility=Math.max(.15,patch.fertility-.003);}
  }
  a.members=a.members.filter(u=>u.health>0);
  if(a.expedition){a.expedition.members=a.expedition.members.filter(id=>a.members.some(u=>u.id===id));if(!a.expedition.members.length){a.expedition=null;a.raidCooldown=60;}}
  const atHome=a.members.some(u=>horizontalDistance(u.pos,n.pos)<5&&tribeContact(s.world,u.pos,n.pos));
  if(atHome&&!invading.length&&n.alarm===0&&a.food>=4){
    const max=n.identity==='garden'?160:n.identity==='terrace'?220:180;
    const repair=Math.min(max-n.health,dt*1.5,a.food*4);
    if(repair>0){n.health+=repair;a.food-=repair/4;}
    if(a.members.length<SOCIETY.capacity&&a.food>=SOCIETY.recruit+4&&a.recruitCooldown===0){a.food-=SOCIETY.recruit;a.members.push(resident(s,t,n));a.recruitCooldown=30;}
  }
  return messages;
}
