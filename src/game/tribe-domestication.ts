import { moveTribeMember } from './tribe-motion';
import type { ActiveTribeState, TribeUnit, UnitNavigation } from './era-types';
import type { Creature, GameState, Vec3 } from './types';
import { clamp, groundHeight, horizontalDistance } from './random';
import { worldSpecies } from './npc-genome';
import { speciesCollisionRadius } from './anatomy';
import { moveUnit, unitNavigation } from './unit-motion';
import { tribeContact } from './tribe-society';
import { computeStats } from './genome';
import { cultureEffects } from './culture';
import { removeTribePrey } from './tribe-wildlife';
import { recordEcologyContact } from './ecology-catalog';

export const DOMESTICATION = { fee: 6, meal: 3, lure: 8, travel: 90, grace: 4, capacity: 6, radius: 32 } as const;
export const ANIMAL_REASONS = {
  success:'Zvonkonoš dorazil domů. Přiděl mu sběr a zajisti péči.', cancelled:'Získávání přerušeno hráčem.',
  contact:'Zvíře ztratilo klidný kontakt na 4 sekundy.', timeout:'Získávání překročilo 90 sekund.',
  'lost-member':'Pečující člen už není dostupný.', 'lost-animal':'Zvíře už není živé nebo dostupné.',
  food:'Při kontaktu chybělo 6 jídla.', attack:'Útok nebo strach přerušil získávání.',
  neglect:'Zanedbaný zvonkonoš opustil kmen. Nesený náklad se ztratil.', released:'Zvíře uvolněno do divočiny bez vratky.',
  death:'Domestikované zvíře zemřelo; náklad se ztratil.', stage:'Získávání ukončeno přechodem do další etapy.',
} as const;
export type AnimalReason = keyof typeof ANIMAL_REASONS;
export interface AnimalAcquisition {
  creature:number; caretaker:number; phase:'approach'|'lure'|'escort'; remaining:number; progress:number; contactLost:number; paid:number; navigation:UnitNavigation;
}
export interface DomesticAnimal {
  creature:number; caretaker:number|null; mode:'rest'|'gather'; resource:number|null; cargo:number; trust:number; navigation:UnitNavigation;
}
export interface TribeDomestication {
  version:1; active:AnimalAcquisition|null; animals:DomesticAnimal[]; result:{creature:number;reason:AnimalReason;paid:number}|null;
}
const activeTribe = (s:GameState) => s.tribe?.version===2?s.tribe:null;
const playable = (s:GameState) => s.stage===3&&!s.deathReason?activeTribe(s):null;
const home = (t:ActiveTribeState) => t.huts.filter(h=>h.kind==='shelter'&&h.progress===1&&h.health>0).sort((a,b)=>a.id-b.id)[0].pos;
const result = (ok:boolean,message?:string) => ({ok,message});
export const animalCapacity = (t:ActiveTribeState) => Math.min(3,t.huts.filter(h=>h.kind==='shelter'&&h.progress===1&&h.health>0).length*2);
export const domesticAnimal = (s:GameState,id:number) => activeTribe(s)?.domestication?.animals.find(a=>a.creature===id);
export const acquisitionCaretaker = (s:GameState,id:number) => activeTribe(s)?.domestication?.active?.caretaker===id;
/** World IDs and tribe IDs are separate; an animal always remains in the world. */
export function managedAnimal(s:GameState,id:number):boolean {
  const d=activeTribe(s)?.domestication;
  return !!d&&(d.animals.some(a=>a.creature===id)||d.active?.creature===id&&d.active.phase!=='approach');
}
export const animalMaxHealth = (s:GameState,c:Creature) => worldSpecies(s.world,c.species).maxHealth??32;
export function animalSuitability(s:GameState,c:Creature):string|null {
  if(c.species!=='bell'||worldSpecies(s.world,c.species).role!=='grazer')return c.species==='gloom'?'Prachokřídlík je symbiont; ochočuje se zde zvonkonoš.':'Tento druh není vhodný pro domácí sběr. Divoký lov zůstává samostatný.';
  if(c.health<animalMaxHealth(s,c)*.6)return `Zvíře je příliš zraněné (potřebuje alespoň 60 % zdraví: ${Math.ceil(animalMaxHealth(s,c)*.6)}).`;
  if(c.fear>0)return 'Zvíře je vyplašené. Počkej mimo dosah hrozby.';
  if(domesticAnimal(s,c.id))return 'Toto zvíře už patří kmeni.';
  return null;
}
function caretakerProblem(s:GameState,ids:readonly number[]):string|null {
  const t=activeTribe(s), u=ids.length===1?t?.members.find(u=>u.id===ids[0]):null;
  if(!u||u.species||u.health<35||u.hunger>=65||u.cargo>0)return 'Vyber jednoho vlastního člena: zdraví ≥35, hlad <65, prázdný náklad. Symbiont není pečující.';
  if(t?.chief?.active?.member===u.id)return 'Náčelník právě vede sněm. Nejprve jej ukonči.';
  if(u.tool==='spear')return 'Odlož oštěp; zvonkonoš potřebuje klidného pečujícího.';
  if(t?.music?.active?.members.includes(u.id)||acquisitionCaretaker(s,u.id))return 'Člen už vede získávání nebo hudební návštěvu.';
  return null;
}
export function domesticationQuote(s:GameState,ids:readonly number[],creature:number) {
  const t=playable(s),c=s.world.creatures.find(c=>c.id===creature);
  if(!t||!c)return result(false,'Vyber skutečné živé zvíře v kmenové etapě.');
  const unsuitable=animalSuitability(s,c);if(unsuitable)return result(false,unsuitable);
  if(t.domestication?.active)return result(false,'Nejprve dokonči nebo přeruš probíhající získávání.');
  if((t.domestication?.animals.length??0)>=animalCapacity(t))return result(false,'Kapacita zvířat je plná: dva na přístřešek, nejvýše tři.');
  const problem=caretakerProblem(s,ids);if(problem)return result(false,problem);
  if(t.members.some(u=>u.orders.some(o=>o.kind==='attack'&&o.target.kind==='creature'&&o.target.id===creature)))return result(false,'Nejprve odvolej lov tohoto zvířete.');
  if(t.food<DOMESTICATION.fee)return result(false,'Na získání potřebuješ 6 jídla.');
  return result(true,'6 jídla při prvním kontaktu, bez vratky. 8 s klidu a doprovod domů do 90 s.');
}
export function startDomestication(s:GameState,ids:readonly number[],creature:number) {
  const quote=domesticationQuote(s,ids,creature);if(!quote.ok)return quote;
  const t=playable(s)!,c=s.world.creatures.find(c=>c.id===creature)!,u=t.members.find(u=>u.id===ids[0])!;
  t.domestication??={version:1,active:null,animals:[],result:null};
  t.domestication.active={creature,caretaker:u.id,phase:'approach',remaining:90,progress:0,contactLost:0,paid:0,navigation:unitNavigation(c.pos)};
  t.domestication.result=null;u.orders=[];u.navigation.rethink=0;
  return result(true,'Pečující jde za zvonkonošem. Ostatní lovce drž dál.');
}
export function cancelDomestication(s:GameState,reason:AnimalReason='cancelled') {
  const t=activeTribe(s),d=t?.domestication,e=d?.active;if(!t||!d||!e)return result(false);
  d.result={creature:e.creature,reason,paid:e.paid};d.active=null;
  const c=s.world.creatures.find(c=>c.id===e.creature);if(c){c.velocity={x:0,y:0,z:0};c.target=null;c.intent='rest';}
  const u=t.members.find(u=>u.id===e.caretaker);if(u)u.intent='rest';
  return result(true,ANIMAL_REASONS[reason]);
}
export function interruptDomesticationOnDamage(s:GameState,member:number):void {if(acquisitionCaretaker(s,member))cancelDomestication(s,'attack');}
export function damageDomesticAnimal(s:GameState,id:number):void {
  if(activeTribe(s)?.domestication?.active?.creature===id)cancelDomestication(s,'attack');
  const a=domesticAnimal(s,id);if(a){a.trust=Math.max(0,a.trust-15);a.mode='rest';a.resource=null;}
}
export function forgetDomesticAnimal(s:GameState,id:number,reason:AnimalReason):void {
  const d=activeTribe(s)?.domestication;if(!d)return;
  if(d.active?.creature===id)cancelDomestication(s,reason==='death'?'lost-animal':reason);
  if(d.animals.some(a=>a.creature===id)){d.animals=d.animals.filter(a=>a.creature!==id);d.result={creature:id,reason,paid:0};}
}
export function releaseDomesticAnimal(s:GameState,id:number) {
  if(!playable(s)||!domesticAnimal(s,id))return result(false,'Zvíře nepatří kmeni.');
  forgetDomesticAnimal(s,id,'released');const c=s.world.creatures.find(c=>c.id===id);if(c){c.target=null;c.intent='rest';c.velocity={x:0,y:0,z:0};c.fear=5;}
  return result(true,ANIMAL_REASONS.released);
}
export function assignAnimalCaretaker(s:GameState,id:number,ids:readonly number[]) {
  const t=playable(s),a=domesticAnimal(s,id);if(!t||!a)return result(false,'Zvíře nepatří kmeni.');
  const problem=caretakerProblem(s,ids);if(problem)return result(false,problem);
  a.caretaker=ids[0];const u=t.members.find(u=>u.id===ids[0])!;
  u.orders=[{unit:u.id,kind:'move',target:{kind:'point',pos:{...home(t)}}}];u.navigation.rethink=0;
  return result(true,'Pečující jde domů. Krmí při kontaktu; jeden může pečovat o více zvířat.');
}
export function animalResources(s:GameState) {
  const t=activeTribe(s);return t?s.world.resources.filter(r=>['nectar','algae'].includes(r.kind)&&r.amount>=1&&horizontalDistance(r.pos,home(t))<=DOMESTICATION.radius):[];
}
export function orderDomesticAnimal(s:GameState,id:number,resource:number|null) {
  const t=playable(s),a=domesticAnimal(s,id);if(!t||!a)return result(false,'Zvíře nepatří kmeni.');
  if(resource!==null&&!animalResources(s).some(r=>r.id===resource))return result(false,'Sběr vyžaduje skutečnou řasu nebo nektar do 32 m od domova.');
  a.mode=resource===null?'rest':'gather';a.resource=resource;a.navigation.rethink=0;
  return result(true,resource===null?'Zvíře se vrací domů.':'Zvonkonoš vyrazí, pokud je sytý, klidný a má pečujícího.');
}
const contact = (s:GameState,a:Vec3,b:Vec3,reach:number) => horizontalDistance(a,b)<=reach&&tribeContact(s.world,a,b);
export function stepAcquisitionMember(s:GameState,u:TribeUnit,dt:number,positions:readonly {id:number;pos:Vec3}[]):boolean {
  const t=activeTribe(s),e=t?.domestication?.active;if(!t||!e||e.caretaker!==u.id)return false;
  const c=s.world.creatures.find(c=>c.id===e.creature&&c.health>0);if(!c)return true;
  u.intent='socialize';const stats=computeStats(s.player.genome),speed=clamp(stats.speed*stats.walk,2.5,6)*cultureEffects(u.outfit).speed;
  if(e.phase==='approach'||e.phase==='lure')moveTribeMember(s,u,c.pos,positions,speed,dt,tribeContact(s.world,u.pos,c.pos)?3:.5);
  else if(contact(s,u.pos,c.pos,6))moveTribeMember(s,u,home(t),positions,Math.min(speed,2.6),dt,2.5);
  return true;
}
/** Status is derived once for HUD and effects; no separate preview timers. */
export function animalStatus(s:GameState,a:DomesticAnimal):'lost'|'afraid'|'hungry'|'unattended'|'carrying'|'gathering'|'resting' {
  const c=s.world.creatures.find(c=>c.id===a.creature&&c.health>0),u=activeTribe(s)?.members.find(u=>u.id===a.caretaker&&u.health>0&&!u.species);
  if(!c)return 'lost';if(c.fear>0)return 'afraid';if(c.hunger>=70)return 'hungry';if(!u||u.tool==='spear')return 'unattended';if(a.cargo>0)return 'carrying';return a.mode==='gather'?'gathering':'resting';
}
function travelAnimal(s:GameState,c:Creature,nav:UnitNavigation,target:Vec3,dt:number,stop:number):boolean {
  const spec=worldSpecies(s.world,c.species),previous={...c.pos},offset=Math.max(.25,c.pos.y-groundHeight(c.pos.x,c.pos.z,2));
  // Negative world ID avoids collisions with the independent tribe ID domain.
  const mover={id:-c.id,pos:c.pos,heading:c.heading,navigation:nav},t=activeTribe(s)!;
  const positions=[...t.members.map(u=>({id:u.id,pos:u.pos})),...s.world.creatures.filter(o=>o.id!==c.id).map(o=>({id:-o.id,pos:o.pos}))];
  const reached=moveUnit(s.world,mover,target,positions,Math.min(4,spec.speed)*(c.hunger>=70?.65:1),dt,tribeContact(s.world,c.pos,target)?stop:.5,speciesCollisionRadius(spec));
  c.pos=mover.pos;c.pos.y=groundHeight(c.pos.x,c.pos.z,2)+offset;c.heading=mover.heading;
  c.velocity={x:(c.pos.x-previous.x)/dt,y:0,z:(c.pos.z-previous.z)/dt};
  return reached&&contact(s,c.pos,target,stop+.06);
}
export function stepDomestication(s:GameState,dt:number):void {
  const t=playable(s),d=t?.domestication;if(!t||!d||dt<=0)return;
  const e=d.active;
  if(e){
    const c=s.world.creatures.find(c=>c.id===e.creature),u=t.members.find(u=>u.id===e.caretaker&&u.health>0&&!u.species);
    if(!c)cancelDomestication(s,'lost-animal');
    else if(c.health<=0)removeTribePrey(s,c);
    else if(!u)cancelDomestication(s,'lost-member');
    else if(c.fear>0||u.tool==='spear'||t.members.some(v=>v.id!==u.id&&v.health>0&&v.tool==='spear'&&contact(s,v.pos,c.pos,7)))cancelDomestication(s,'attack');
    else {
      e.remaining=Math.max(0,e.remaining-dt);
      const near=contact(s,u.pos,c.pos,e.phase==='escort'?9:4);
      if(e.phase==='approach'){
        if(near){if(t.food<6)cancelDomestication(s,'food');else{t.food-=6;recordEcologyContact(s,'species:bell','feeding',2,c.patch as 0|1|2);e.paid=6;e.phase='lure';c.hunger=Math.max(0,c.hunger-20);c.velocity={x:0,y:0,z:0};c.target=null;c.intent='bonded';}}
      }else{
        c.age+=dt;c.hunger=Math.min(100,c.hunger+dt*.65);c.cooldown=Math.max(0,c.cooldown-dt);c.velocity={x:0,y:0,z:0};c.intent='bonded';
        e.contactLost=near?0:Math.min(4,e.contactLost+dt);
        if(e.contactLost>=4)cancelDomestication(s,'contact');
        else if(e.phase==='lure'){if(near)e.progress=Math.min(8,e.progress+dt);if(e.progress>=8){e.phase='escort';e.navigation.rethink=0;}}
        else {
          travelAnimal(s,c,e.navigation,u.pos,dt,2.7);
          if(contact(s,c.pos,home(t),5.5)&&contact(s,u.pos,home(t),4)&&near){
            d.animals.push({creature:c.id,caretaker:u.id,mode:'rest',resource:null,cargo:0,trust:60,navigation:unitNavigation(c.pos)});
            cancelDomestication(s,'success');
          }
        }
      }
      if(d.active&&e.remaining===0)cancelDomestication(s,'timeout');
    }
  }
  for(const a of [...d.animals]){
    const c=s.world.creatures.find(c=>c.id===a.creature);
    if(!c){forgetDomesticAnimal(s,a.creature,'lost-animal');continue;}
    if(c.health<=0){removeTribePrey(s,c);continue;}
    if(a.trust===0){forgetDomesticAnimal(s,c.id,'neglect');c.intent='rest';c.target=null;c.velocity={x:0,y:0,z:0};c.fear=5;continue;}
    const u=t.members.find(u=>u.id===a.caretaker&&u.health>0&&!u.species);
    if(!u){a.caretaker=null;a.mode='rest';a.resource=null;}
    c.age+=dt;c.hunger=Math.min(100,c.hunger+dt*.65);c.fear=Math.max(0,c.fear-dt);c.cooldown=Math.max(0,c.cooldown-dt);c.velocity={x:0,y:0,z:0};c.intent='rest';c.target=null;
    const atHome=contact(s,c.pos,home(t),5.5),care=!!u&&u.tool!=='spear'&&u.hunger<70&&contact(s,u.pos,home(t),6)&&contact(s,c.pos,u.pos,7)&&atHome;
    if(care&&c.hunger>=30&&t.food>=3){t.food-=3;c.hunger=Math.max(0,c.hunger-32);c.cooldown=3;c.intent='forage';}
    a.trust=clamp(a.trust+dt*(c.hunger>=70||!u?-.7:care&&c.hunger<40?.5:0),0,100);
    if(c.hunger>=90)c.health=Math.max(0,c.health-dt*.55);
    else if(care&&c.hunger<40)c.health=Math.max(c.health,Math.min(animalMaxHealth(s,c),c.health+dt*.8));
    if(c.health===0){removeTribePrey(s,c);continue;}
    if(a.trust===0){forgetDomesticAnimal(s,c.id,'neglect');c.intent='rest';c.target=null;c.fear=5;continue;}
    const status=animalStatus(s,a);
    // Hungry/frightened/ownerless animals do not harvest or cash in their cargo.
    if(['hungry','afraid','unattended'].includes(status)){c.intent=c.fear>0?'flee':'rest';travelAnimal(s,c,a.navigation,home(t),dt,4.5);continue;}
    if(atHome&&a.cargo>0){t.food+=a.cargo*4;a.cargo=0;}
    const r=s.world.resources.find(r=>r.id===a.resource&&['nectar','algae'].includes(r.kind)&&horizontalDistance(r.pos,home(t))<=32);
    if(a.cargo>=6||a.mode==='rest'||!r||r.amount<1){travelAnimal(s,c,a.navigation,home(t),dt,4.5);if(!r||r.amount<1){a.mode='rest';a.resource=null;}continue;}
    c.intent='forage';c.target=r.id;
    if(travelAnimal(s,c,a.navigation,r.pos,dt,2)&&c.cooldown===0){
      const amount=Math.min(1,6-a.cargo);r.amount-=amount;a.cargo+=amount;c.cooldown=3;
      const patch=s.world.patches[r.patch];patch.harvested++;patch.fertility=Math.max(.15,patch.fertility-.003);
    }
  }
}
