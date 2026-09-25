import type { GameState } from './types';
import type { SeaBlueprint } from './blueprint';
import { seaBlueprint, vehicleCost, vehicleStats } from './blueprint';
import { enableConversion } from './conversion';
import { activeMachines } from './machines';
import { cityProgression } from './cities';
import { atlasNeighbours, planetAtlas } from './planet-geography';
import { activeField, navigation, createField, homeLocationId, bindActiveWorld, FIELD_LIMIT } from './planet-travel';

export const SEA_LIMIT = 128;
export interface SeaJourney {
  id: number; from: number; to: number; route: number[];
  phase: 'outbound' | 'returning' | 'landed' | 'returned';
  progress: number; distance: number; elapsed: number; turn: number;
}
export interface Maritime {
  version: 1; legacyAccess: number[]; revision: number;
  vessel: null | { id: string; blueprint: SeaBlueprint; health: number; mooring: number;
    payment: { source: 'home'; use: 'consumed'; amount: number; before: number; after: number; springId: number; tick: number } };
  journeys: SeaJourney[];
}
export interface SeaCommand { revision: number; from: number; to: number; vesselId: string | null; }
export const seaJourney = (s: GameState) => s.maritime?.journeys.at(-1) ?? null;
export const atSea = (s: GameState) => { const j = seaJourney(s); return !!j && (j.phase === 'outbound' || j.phase === 'returning'); };
export const homeCoast = (s: GameState) => s.homePlanet ? planetAtlas(s.homePlanet)?.anchors[2].cellId ?? -1 : -1;
export const currentCoast = (s: GameState) => activeField(s)?.cellId ?? homeCoast(s);
export function enableMaritime(s: GameState, origin: 'birth' | 'legacy-activation' = 'legacy-activation'): void {
  enableConversion(s, origin);

  const migrate = (v: GameState) => {
    if (v.maritime) return false;
    v.maritime = { version: 1, legacyAccess: navigation(v)!.fields.map(f => f.cellId).sort((a,b) => a-b), revision: 0, vessel: null, journeys: [] }; return true;
  };
  migrate(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (migrate(cp)) s.checkpoint = JSON.stringify(cp); }
}
export function isCoast(s: GameState, id: number): boolean {
  const atlas = s.homePlanet && planetAtlas(s.homePlanet);
  return !!atlas && Number.isInteger(id) && atlas.cells[id]?.surface === 'land' && atlasNeighbours(id).some(n => atlas.cells[n].surface === 'water');
}
/** Ordered BFS on the unchanged shared-edge atlas; only endpoints may be land. */
export function seaRoute(s: GameState, from: number, to: number): number[] | null {
  if (from === to || !isCoast(s, from) || !isCoast(s, to)) return null;
  const atlas = planetAtlas(s.homePlanet!)!, queue = [from], parents = new Map([[from, -1]]);
  for (let i=0; i<queue.length; i++) {
    const here=queue[i];
    if (here===to) { const path:number[]=[]; for(let n=to;n!==-1;n=parents.get(n)!)path.unshift(n); return path.length>=3?path:null; }
    for(const next of atlasNeighbours(here)) if(!parents.has(next) && (atlas.cells[next].surface==='water' || next===to && here!==from)) { parents.set(next,here); queue.push(next); }
  }
  return null;
}
export function maritimeLandReason(s: GameState, to: number): string | null {
  if (!s.maritime || s.stage<4) return null;
  if (atSea(s)) return 'Nejprve dokonči plavbu nebo obrať a dopluj zpět.';
  const atlas=planetAtlas(s.homePlanet!)!, from=currentCoast(s), home=homeCoast(s), legacy=s.maritime.legacyAccess;
  if (atlas.cells[from]?.regionId===atlas.cells[to]?.regionId) return null;
  // Preserve exact historical access points, not a fictitious seafaring history.
  if ((atlas.cells[from]?.regionId===atlas.cells[home].regionId || legacy.includes(from)) && (legacy.includes(to)||to===home)) return null;
  return 'Oddělená pevnina: zvol pobřeží a použij zaplacený člun. Běžná výprava nepřekračuje moře.';
}
const contextReason = (s: GameState, commitments = true): string | null => {
  if (!s.maritime || s.stage!==4 || s.deathReason || s.player.health<=0 || !cityProgression(s) || !activeMachines(s)?.springs.some(p=>p.owner==='player')) return 'Plavba vyžaduje živou strojovou etapu, dokončený kmen a vlastní pramen.';
  if (commitments && (s.military?.deployment || (s.military?.raids??[]).some(r=>!['destroyed','returned','withdrawn'].includes(r.phase)))) return 'Nejprve dokonči vojenské nasazení a všechny výpady i návraty.';
  return null;
};
export const seaCommand = (s: GameState, to: number): SeaCommand => ({revision:s.maritime?.revision??-1,from:currentCoast(s),to,vesselId:s.maritime?.vessel?.id??null});
const matches = (s:GameState,c:SeaCommand) => {const n=seaCommand(s,c.to);return c.revision===n.revision&&c.from===n.from&&c.vesselId===n.vesselId;};
const fail = (s:GameState,reason:string) => {if(navigation(s))navigation(s)!.notice=reason;return false;};
export function boatQuote(s: GameState): string | null {
  const reason=contextReason(s); if(reason)return reason;
  if(s.maritime!.vessel)return 'Člun už vlastníš; další se nevyrábí.';
  if(activeField(s)||atSea(s))return 'Člun vyrábí původní domácí dílna. Vrať se domů.';
  if(!Number.isFinite(activeMachines(s)!.resource)||activeMachines(s)!.resource<vehicleCost(seaBlueprint()))return 'Člun stojí 56 domácího jantaru. Vydělej u původních pramenů; městské a státní pokladny ho neplatí.';
  return null;
}
export function buyBoat(s: GameState, c: SeaCommand): boolean {
  if(!matches(s,c))return fail(s,'Zastaralý námořní příkaz. Vyber znovu prostředek a cíl.');
  const reason=boatQuote(s); if(reason)return fail(s,reason);
  const m=activeMachines(s)!, blueprint=seaBlueprint(), amount=vehicleCost(blueprint), before=m.resource;
  const vessel:NonNullable<Maritime['vessel']>={id:`${s.homePlanet!.id}:vessel-1`,blueprint,health:vehicleStats(blueprint).durability,mooring:homeCoast(s),payment:{source:'home',use:'consumed',amount,before,after:before-amount,springId:m.springs.find(p=>p.owner==='player')!.id,tick:s.tick}};
  m.resource=vessel.payment.after;s.maritime!.vessel=vessel;s.maritime!.revision++;
  navigation(s)!.notice='Expediční člun zaplacen: 56 jantaru z domova spotřebováno. Vyber cílové pobřeží a nastup.';return true;
}
export function sailingQuote(s: GameState, to: number): {reason:string|null;route:number[]|null} {
  const reason=contextReason(s,false);if(reason)return {reason,route:null};
  const m=s.maritime!,v=m.vessel,from=currentCoast(s),nav=navigation(s)!;
  const deny=(reason:string)=>({reason,route:null});
  if(s.military?.deployment)return deny('Nejprve vrať nasazenou jednotku. Člun nepřepravuje tanky.');
  if((s.military?.raids??[]).some(r=>!['destroyed','returned','withdrawn'].includes(r.phase))&&!(from!==homeCoast(s)&&to===homeCoast(s)))return deny('Vojenský závazek: člun smí pouze vrátit avatara přímo domů k obraně.');
  if(atSea(s))return deny('Člun už pluje. Přistání nebo obrat dokonči před další cestou.');
  if(!v)return deny('Nejprve zaplať expediční člun za 56 domácího jantaru.');
  if(v.mooring!==from)return deny(`Člun kotví u pobřeží ${v.mooring}. Vrať se k němu po souši.`);
  if(m.journeys.length>=SEA_LIMIT || m.journeys.length===SEA_LIMIT-1&&to!==homeCoast(s))return deny('Dosažen limit 128 uložených plaveb. Další cesta není dostupná.');
  const atlas=planetAtlas(s.homePlanet!)!;
  if(atlas.anchors.some(a=>a.cellId===to)&&to!==homeCoast(s))return deny('Tento habitat patří jiné původní etapě; zde nelze přistát.');
  const route=seaRoute(s,from,to);if(!route)return deny('Potřebuješ dvě odlišná pobřeží spojená souvislou vodní trasou.');
  const field=nav.fields.find(f=>f.cellId===to),city=s.cities?.entries.find(c=>c.address.locationId===field?.id);
  if(city?.owner.kind==='state')return deny('Cizí město nepřijímá civilní výsadek. Člun nepřevádí vlastnictví ani nebojuje.');
  if(to!==homeCoast(s)&&!field&&nav.fields.length>=FIELD_LIMIT)return deny('Uloženo 64 detailů; nové přistání není dostupné.');
  return {reason:null,route};
}
export function sail(s: GameState,c:SeaCommand): boolean {
  if(!matches(s,c))return fail(s,'Zastaralý námořní příkaz. Vyber znovu prostředek a cíl.');
  const q=sailingQuote(s,c.to);if(q.reason||!q.route)return fail(s,q.reason!);
  s.maritime!.journeys.push({id:s.maritime!.journeys.length+1,from:c.from,to:c.to,route:q.route,phase:'outbound',progress:0,distance:0,elapsed:0,turn:s.states!.clock.turn});
  s.maritime!.revision++;navigation(s)!.mode='local';navigation(s)!.notice=`Nastoupen tentýž výpravový avatar. Člun vyplul ${c.from} → ${c.to}; ${q.route.length-1} aktivních sekund, další cena 0.`;return true;
}
export function turnBoat(s:GameState,revision:number):boolean {
  const j=seaJourney(s);if(contextReason(s,false)||!j||j.phase!=='outbound'||s.maritime!.revision!==revision)return false;
  if(s.maritime!.journeys.length===SEA_LIMIT&&j.from!==homeCoast(s))return fail(s,'Poslední záznam je vyhrazen dokončení návratu domů.');
  j.phase='returning';s.maritime!.revision++;navigation(s)!.notice='Plavba přerušena: člun i cestující se vracejí po projeté části. Bez vratky.';return true;
}
export function stepMaritime(s:GameState,dt:number):void {
  const j=seaJourney(s);if(!atSea(s)||!j||navigation(s)?.mode!=='local'||s.deathReason||s.player.health<=0)return;
  const total=j.route.length-1, remaining=j.phase==='outbound'?total-j.progress:j.progress;
  const move=Math.min(remaining,Math.max(0,Math.min(1/30,Number.isFinite(dt)?dt:0)));
  j.elapsed+=move;if(j.phase==='outbound'){j.progress+=move;j.distance=j.progress;}else j.progress-=move;
  // No automatic arrival/visit: the player explicitly confirms disembarkation.
}
export function landBoat(s:GameState,revision:number):boolean {
  const j=seaJourney(s),m=s.maritime,nav=navigation(s);
  if(contextReason(s,false)||!j||!m||!nav||!atSea(s)||m.revision!==revision||nav.mode!=='local')return false;
  const returning=j.phase==='returning',goal=returning?j.from:j.to;
  if(returning?j.progress>1e-8:j.progress<j.route.length-1-1e-8)return fail(s,'Člun ještě nedoplul k pobřeží.');
  let field=nav.fields.find(f=>f.cellId===goal);
  if(goal!==homeCoast(s)&&!field&&nav.fields.length>=FIELD_LIMIT)return fail(s,'Přistání nemá místo v registru; obrať zpět.');
  if(goal!==homeCoast(s)&&!field){field=createField(s.seed,s.homePlanet!.id,planetAtlas(s.homePlanet!)!.cells[goal]);nav.fields.push(field);}
  const city=s.cities?.entries.find(c=>c.address.locationId===field?.id);
  if(city?.owner.kind==='state')return fail(s,'Pobřeží převzal cizí stát. Přistání odmítnuto; obrať zpět.');
  s.homePlanet!.currentLocationId=goal===homeCoast(s)?homeLocationId(s):field!.id;bindActiveWorld(s);
  if(!nav.visits.some(v=>v.locationId===s.homePlanet!.currentLocationId))nav.visits.push({locationId:s.homePlanet!.currentLocationId,tick:s.tick});
  j.progress=returning?0:j.route.length-1;if(!returning)j.distance=j.progress;j.elapsed=returning?2*j.distance:j.progress;
  m.vessel!.mooring=goal;j.phase=returning?'returned':'landed';m.revision++;nav.selectedCell=goal;
  nav.notice=`${returning?'Návrat po přerušení':'Přistání'} · pobřeží ${goal}. Člun kotví zde. Žádné vlastnictví nebo odměna; průzkum a založení města mají původní pravidla.`;return true;
}
