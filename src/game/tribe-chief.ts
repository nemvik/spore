import { moveTribeMember } from './tribe-motion';
import type { ActiveTribeState, TribeNeighbour, TribeUnit } from './era-types';
import type { GameState, Vec3 } from './types';
import { clamp, horizontalDistance } from './random';
import { computeStats } from './genome';
import { cultureEffects } from './culture';
import { creatureInheritance } from './lineage-history';
import { recallExpedition, tribeContact } from './tribe-society';
import { resolveNeighbourAlliance } from './tribe-neighbours';

export const CHIEF = { fee: 8, cooldown: 60, travel: 90, speak: 6, grace: 3, reach: 4, gain: 25, truce: 45, home: 10 } as const;
export const CHIEF_REASONS = {
  success: 'Sněm přijat. Vztah posílen, příměří sjednáno a výprava odvolána.',
  cancelled: 'Sněm přerušen hráčem. Bez vratky a bez změny vztahu.',
  contact: 'Řeč ztratila kontakt s hostitelem na 3 sekundy.',
  timeout: 'Náčelník nedorazil do 90 sekund.',
  'lost-member': 'Náčelník zemřel nebo už není dostupný. Zvol dalšího potomka doma.',
  'host-lost': 'Hostitel nebo nevyřešený soused už není dostupný.',
  conflict: 'Útok na hostitelský kmen přerušil sněm.',
  attack: 'Skutečný zásah přerušil náčelníkovu řeč.',
  exhausted: 'Náčelník je příliš hladový či zraněný nebo nese náklad.',
  stage: 'Sněm ukončen přechodem do další etapy.',
} as const;
export type ChiefReason = keyof typeof CHIEF_REASONS;
export interface ChiefCouncil {
  member: number; neighbour: number; host: number; phase: 'travel' | 'speak';
  remaining: number; contactLost: number; paid: number; multiplier: number;
}
export interface ChiefResult { member: number; neighbour: number; reason: ChiefReason; paid: number; delta: number }
export interface TribeChief { version: 1; member: number | null; cooldown: number; active: ChiefCouncil | null; result: ChiefResult | null }
const tribe = (s: GameState) => s.tribe?.version === 2 ? s.tribe : null;
const playable = (s: GameState) => s.stage === 3 && !s.deathReason ? tribe(s) : null;
const result = (ok: boolean, message: string) => ({ ok, message });
export const chiefBusy = (t: ActiveTribeState, id: number) => t.chief?.active?.member === id;
export const chiefMember = (s: GameState): TribeUnit | null => tribe(s)?.members.find(u => u.id === tribe(s)?.chief?.member && u.health > 0 && !u.species) ?? null;
function home(t: ActiveTribeState): Vec3 { return t.huts.filter(h=>h.kind==='shelter'&&h.progress===1&&h.health>0).sort((a,b)=>a.id-b.id)[0].pos; }
function occupied(t: ActiveTribeState, u: TribeUnit): boolean {
  return !!t.music?.active?.members.includes(u.id) || t.domestication?.active?.caretaker === u.id || !!t.domestication?.animals.some(a=>a.caretaker===u.id);
}
function fit(u: TribeUnit): boolean { return u.health >= 35 && u.hunger < 65 && u.cargo === 0; }
function atHome(s: GameState, t: ActiveTribeState, u: TribeUnit): boolean { return horizontalDistance(u.pos,home(t)) <= CHIEF.home && tribeContact(s.world,u.pos,home(t)); }
export function quoteChiefElection(s: GameState, ids: readonly number[]) {
  const t=playable(s),u=ids.length===1?t?.members.find(u=>u.id===ids[0]&&u.health>0&&!u.species):null;
  if(!t||!u)return result(false,'Vyber právě jednoho živého potomka. Symbiont náčelníkem není.');
  if(t.chief?.active)return result(false,'Nejprve ukonči probíhající sněm.');
  if(!fit(u)||u.orders.length||occupied(t,u))return result(false,'Kandidát musí být volný: zdraví ≥35, hlad <65, bez nákladu, rozkazů, hudby a péče.');
  if(!atHome(s,t,u))return result(false,'Kandidát musí být do 10 m od domova bez překážky.');
  const old=chiefMember(s);
  if(old&&old.id!==u.id&&(!atHome(s,t,old)||old.orders.length||occupied(t,old)))return result(false,'Dosavadní náčelník se musí vrátit domů a dokončit práci i péči.');
  if(old?.id===u.id)return result(false,`Člen ${u.id} už je náčelníkem.`);
  return result(true,'Volba je zdarma. Tělo, výstroj a společný cooldown zůstávají.');
}
export function electChief(s: GameState, ids: readonly number[]) {
  const q=quoteChiefElection(s,ids);if(!q.ok)return q;
  const t=playable(s)!;t.chief??={version:1,member:null,cooldown:0,active:null,result:null};t.chief.member=ids[0];
  return result(true,`Člen ${ids[0]} je náčelníkem. Vyber souseda pro Smírčí sněm.`);
}
function conflict(t: ActiveTribeState,n: TribeNeighbour): boolean {
  return n.alarm>0 || t.members.some(u=>u.health>0&&u.orders.some(o=>o.kind==='attack'&&(o.target.kind==='neighbour'&&o.target.id===n.id||o.target.kind==='neighbour-unit'&&n.society?.members.some(v=>v.id===(o.target as {id:number}).id))));
}
export function quoteChiefCouncil(s: GameState, ids: readonly number[], neighbour: number) {
  const t=playable(s),u=chiefMember(s),n=t?.neighbours.find(n=>n.id===neighbour);
  if(!t||!u)return result(false,'Náčelník není dostupný. Zvol jednoho potomka u domova.');
  if(!ids.includes(u.id))return result(false,`Vyber náčelníka ${u.id}. Sněm vede pouze on.`);
  if(t.chief!.active)return result(false,'Náčelník právě vede sněm.');
  if(t.chief!.cooldown>0)return result(false,`Společný odpočinek sněmu: ${Math.ceil(t.chief!.cooldown)} s. Výměna jej nezkrátí.`);
  if(!n||n.resolved||n.health<=0||!n.society?.members.some(v=>v.health>0))return result(false,'Sněm vyžaduje nevyřešeného souseda s živým hostitelem.');
  if(conflict(t,n))return result(false,'Odvolej útoky na hostitelský kmen a vyčkej na uklidnění.');
  if(occupied(t,u))return result(false,'Dokonči hudbu či získávání a předej péči o domácí zvířata jinému členu.');
  if(t.music?.active?.neighbour===n.id)return result(false,'U tohoto souseda probíhá hudba. Sněm a hudba se nesčítají.');
  if(!fit(u))return result(false,'Náčelník potřebuje zdraví ≥35, hlad <65 a prázdný náklad.');
  if(t.food<CHIEF.fee)return result(false,'Na sněm potřebuješ 8 jídla předem.');
  return result(true,'8 jídla ihned, bez vratky. Cesta do 90 s, řeč 6 s při kontaktu do 4 m.');
}
export function startChiefCouncil(s: GameState, ids: readonly number[], neighbour: number) {
  const q=quoteChiefCouncil(s,ids,neighbour);if(!q.ok)return q;
  const t=playable(s)!,c=t.chief!,u=chiefMember(s)!,n=t.neighbours.find(n=>n.id===neighbour)!;
  const host=n.society!.members.filter(v=>v.health>0).sort((a,b)=>horizontalDistance(a.pos,n.pos)-horizontalDistance(b.pos,n.pos)||a.id-b.id)[0];
  t.food-=CHIEF.fee;c.cooldown=CHIEF.cooldown;c.result=null;
  c.active={member:u.id,neighbour,host:host.id,phase:'travel',remaining:CHIEF.travel,contactLost:0,paid:CHIEF.fee,multiplier:cultureEffects(u.outfit).social*creatureInheritance(s).social};
  u.orders=[];u.navigation.rethink=0;
  return result(true,'Náčelník vyrazil za hostitelem. Zaplaceno 8 jídla; ostatní členové pokračují ve své práci.');
}
export function chiefContact(s: GameState): boolean {
  const t=tribe(s),e=t?.chief?.active,u=chiefMember(s),n=t?.neighbours.find(n=>n.id===e?.neighbour),h=n?.society?.members.find(v=>v.id===e?.host&&v.health>0);
  return !!e&&!!u&&u.id===e.member&&!!n&&!!h&&!n.resolved&&n.health>0&&horizontalDistance(h.pos,n.pos)<=12&&horizontalDistance(u.pos,h.pos)<=CHIEF.reach&&tribeContact(s.world,u.pos,h.pos);
}
export function cancelChiefCouncil(s: GameState, reason: ChiefReason='cancelled') {
  const t=tribe(s),c=t?.chief,e=c?.active;if(!t||!c||!e)return result(false,'Žádný sněm neprobíhá.');
  c.result={member:e.member,neighbour:e.neighbour,reason,paid:e.paid,delta:0};c.active=null;c.cooldown=CHIEF.cooldown;
  const u=t.members.find(u=>u.id===e.member);if(u){u.intent='rest';u.navigation.rethink=0;}
  return result(true,CHIEF_REASONS[reason]);
}
export function stepChiefMember(s: GameState,u: TribeUnit,dt: number,positions: readonly {id:number;pos:Vec3}[]): boolean {
  const t=tribe(s),e=t?.chief?.active;if(!t||!e||e.member!==u.id)return false;
  const n=t.neighbours.find(n=>n.id===e.neighbour),h=n?.society?.members.find(v=>v.id===e.host&&v.health>0);
  u.intent='socialize';
  if(n&&h){const stats=computeStats(s.player.genome),target=horizontalDistance(h.pos,n.pos)<=12?h.pos:n.pos;
    moveTribeMember(s,u,target,positions,clamp(stats.speed*stats.walk,2.5,6)*cultureEffects(u.outfit).speed,dt,tribeContact(s.world,u.pos,target)?3:.5);
    if(chiefContact(s))u.heading=Math.atan2(h.pos.x-u.pos.x,h.pos.z-u.pos.z);
  }
  return true;
}
export function stepChief(s: GameState,dt: number): void {
  const t=tribe(s),c=t?.chief;if(s.stage!==3||!t||!c||dt<=0)return;
  const u=chiefMember(s);
  if(!u){const interrupted=!!c.active;if(interrupted)cancelChiefCouncil(s,'lost-member');c.member=null;if(interrupted)return;}
  const e=c.active;
  if(!e){if(u||c.member===null)c.cooldown=Math.max(0,c.cooldown-dt);return;}
  const n=t.neighbours.find(n=>n.id===e.neighbour),h=n?.society?.members.find(v=>v.id===e.host&&v.health>0);
  if(!n||n.health<=0||n.resolved||!h){cancelChiefCouncil(s,'host-lost');return;}
  if(conflict(t,n)){cancelChiefCouncil(s,'conflict');return;}
  if(!fit(u!)){cancelChiefCouncil(s,'exhausted');return;}
  const contact=chiefContact(s);
  if(e.phase==='travel'){
    e.remaining=Math.max(0,e.remaining-dt);
    if(contact){e.phase='speak';e.remaining=CHIEF.speak;}
    else if(e.remaining===0)cancelChiefCouncil(s,'timeout');
    return;
  }
  if(!contact){e.contactLost=Math.min(CHIEF.grace,e.contactLost+dt);if(e.contactLost>=CHIEF.grace)cancelChiefCouncil(s,'contact');return;}
  e.contactLost=0;e.remaining=Math.max(0,e.remaining-dt);if(e.remaining>1e-8)return;
  const before=n.relation;n.relation=clamp(before+CHIEF.gain*e.multiplier,-100,100);
  n.society!.truce=Math.max(n.society!.truce,CHIEF.truce);recallExpedition(n.society!);
  cancelChiefCouncil(s,'success');c.result!.delta=n.relation-before;resolveNeighbourAlliance(t,n);
}
/** Incoming strikes interrupt immediately, including fauna before the tribe phase. */
export function interruptChiefOnDamage(s: GameState,id: number): void {
  const t=tribe(s);if(s.stage===3&&t&&chiefBusy(t,id))cancelChiefCouncil(s,chiefMember(s)?'attack':'lost-member');
  if(t?.chief?.member===id&&!chiefMember(s))t.chief.member=null;
}
