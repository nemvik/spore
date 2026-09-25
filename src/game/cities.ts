import type { GameState, Vec3 } from './types';
import { locationAddress, type LocationAddress } from './home-planet';
import { addressGeography } from './planet-geography';
import { activeField, navigation, enablePlanetTravel, enterField, selectAddress, FIELD_LIMIT, fieldGround, type FieldLocation } from './planet-travel';
import { activeMachines } from './machines';
import { tribeReady, activeTribe } from './tribe';
import { bodyCollisionRadius } from './body-shape';
import { cityHall, cityPositionClear, fieldDecorations, CITY_SQUARE_RADIUS } from './city-spatial';
import type { CityEconomy } from './city-economy';

export interface City {
  id: string;
  name: string;
  owner: { kind: 'lineage'; id: string };
  address: LocationAddress;
  founded: { source: 'player'; stage: 4 | 5; tick: number; paidAmber: 60; springId: number };
  local: { version: 1 }; // Immutable civic square + hall layout from A.
  economy?: CityEconomy | null; // Required in registry v2; absent in historical v1.
}
export interface CityRegistry { version: 1 | 2; entries: City[]; selectedId: string | null; }
export const CITY_COST = 60;
export const CITY_RADIUS = 18;
export const cityId = (locationId: string) => `${locationId}:city`;
export const cityAt = (s: GameState, locationId = s.homePlanet?.currentLocationId) => s.cities?.entries.find(c => c.address.locationId === locationId) ?? null;
export const cityNameValid = (name: unknown): name is string => typeof name === 'string' && name === name.trim() && name.length >= 1 && name.length <= 40 && !/[\u0000-\u001f\u007f]/.test(name);

/** Explicit activation preserves old campaigns, including checkpoints, without founding anything. */
export function enableCities(s: GameState): void {
  enablePlanetTravel(s);
  const activate = (v: GameState) => {
    if (v.cities?.version === 2) return false;
    v.cities = { version: 2, entries: (v.cities?.entries ?? []).map(c => ({...c, economy:null})), selectedId:v.cities?.selectedId ?? null };
    return true;
  };
  activate(s);
  if (s.checkpoint) {
    const cp = JSON.parse(s.checkpoint) as GameState;
    if (activate(cp)) s.checkpoint = JSON.stringify(cp);
  }
}
export function cityProgression(s: GameState): boolean {
  return s.stage >= 4 && !!activeMachines(s) && !!activeTribe(s)?.completed && tribeReady(s);
}
/** Buildability is a consumer of A/B/C, never a modification of either generator. */
export function citySite(s: GameState, address: LocationAddress): string | null {
  const geo = addressGeography(s, address);
  if (!geo || geo.location.kind !== 'field') return 'Založ město v samostatné vzdálené lokalitě. Domovské osady a základna zůstávají původní.';
  const p = address.position, field = geo.location;
  if (geo.cell.surface !== 'land' || geo.groundAltitudeMeters <= 0) return 'Město vyžaduje pevninu nad vodou.';
  if (Math.abs(p.x) > 78 - CITY_RADIUS || Math.abs(p.z) > 78 - CITY_RADIUS) return 'Náměstí musí být nejméně 18 místních jednotek od hranice.';
  if (Math.abs(p.y - geo.localGround) > 1e-7) return 'Adresa neleží na místním povrchu.';
  // Sample the whole footprint at 2-unit intervals; generator 1 is smooth with
  // wavelength >= 23 units. Bound both relief and local grade, including edges.
  let low = Infinity, high = -Infinity;
  for (let x = -18; x <= 18; x += 2) for (let z = -18; z <= 18; z += 2) {
    if (Math.hypot(x,z) > CITY_RADIUS) continue;
    const h = fieldGround(s.seed, geo.cell, p.x+x, p.z+z);
    low = Math.min(low,h); high = Math.max(high,h);
    if (geo.anchor.altitudeMeters + h * geo.anchor.metersPerUnit <= 0) return 'Část stavební plochy je pod vodou.';
    const dx = fieldGround(s.seed,geo.cell,p.x+x+.1,p.z+z)-h, dz = fieldGround(s.seed,geo.cell,p.x+x,p.z+z+.1)-h;
    if (Math.hypot(dx,dz)/.1 > .25) return 'Terén je příliš strmý. Najdi rovnější plochu.';
  }
  if (high-low > 2) return 'Terén je příliš členitý. Najdi rovnější plochu.';
  const gap = (v: Vec3) => Math.hypot(p.x-v.x,p.z-v.z);
  if (field.world.obstacles.some(o=>gap(o.pos)<CITY_RADIUS+o.radius)
    || field.world.landmarks.some(l=>gap(l.pos)<CITY_RADIUS+3)
    || field.world.patches.some(v=>gap(v.center)<CITY_RADIUS+v.radius)) return 'Stavební plocha koliduje se stanovištěm, příchodem nebo překážkou.';
  const hall = cityHall(p), radius = bodyCollisionRadius(s.player.genome,2);
  if (Math.hypot(p.x-hall.x,p.z-hall.z) < radius+hall.radius+.5) return 'Tělo nemá dostatečný odstup od budoucí radnice.';
  // C decorations remain decorative. Reserve the square and solid hall so their
  // visible geometry cannot intersect the new city or its arrival position.
  if (fieldDecorations(field,geo.cell).some(d=>Math.hypot(p.x-d.x,p.z-d.z)<Math.max(radius,CITY_SQUARE_RADIUS)+d.radius+1 || Math.hypot(hall.x-d.x,hall.z-d.z)<hall.radius+d.radius+1)) return 'Náměstí nebo radnice by zasáhly skálu či vegetaci. Popojdi na volnou plochu.';
  return null;
}
export function foundingAvailability(s: GameState): { available: boolean; reason: string; address: LocationAddress | null } {
  const f = activeField(s), nav = navigation(s), m = activeMachines(s);
  const address = f ? locationAddress(s, f.position) : null;
  let reason: string | null = null;
  if (!s.cities || !nav) reason = 'Registr měst není aktivní.';
  else if (!cityProgression(s)) reason = 'Nejprve dokonči kmen a běžným postupem vstup do strojové etapy.';
  else if (s.deathReason || s.player.health<=0) reason = 'Nejprve obnov živou generaci.';
  else if (!m!.springs.some(p=>p.owner==='player')) reason = 'Nejprve strojem obsaď jantarový pramen u domovské základny.';
  else if (!f || nav.mode !== 'local' || !address) reason = 'Vstup do vzdálené pevninské lokality a vyber místo chůzí.';
  else if (cityAt(s)) reason = 'V této lokalitě už město stojí. Další platba se neprovede.';
  else if (s.cities.entries.length>=FIELD_LIMIT) reason = 'Registr obsahuje 64 měst; existující města zůstávají dostupná.';
  else if (f.world.patches.some(p=>!p.discovered)) reason = 'Nejprve fyzicky změř všechna tři stanoviště této lokality (E).';
  else if (!Number.isFinite(m!.resource) || m!.resource<CITY_COST) reason = `Založení stojí ${CITY_COST} jantaru z domovské strojové zásoby. Vrať se vydělat chybějící jantar.`;
  else reason = citySite(s,address);
  return { available: !reason, reason: reason ?? `Volná plocha · založení za ${CITY_COST} jantaru.`, address };
}
export function foundCity(s: GameState, name: string): boolean {
  const nav = navigation(s), status = foundingAvailability(s);
  if (!nav) return false;
  if (!status.available) { nav.notice=status.reason; return false; }
  name=name.trim();
  if (!cityNameValid(name)) { nav.notice='Název města musí mít 1–40 znaků na jednom řádku.'; return false; }
  const m=activeMachines(s)!, address=status.address!;
  const city: City = {id:cityId(address.locationId),name,owner:{kind:'lineage',id:s.homePlanet!.id},address,
    founded:{source:'player',stage:s.stage as 4|5,tick:s.tick,paidAmber:CITY_COST,springId:m.springs.find(p=>p.owner==='player')!.id},local:{version:1},...(s.cities!.version===2?{economy:null}:{})};
  // One synchronous commit after every precondition; no grant, refund or World edit.
  m.resource-=CITY_COST; s.cities!.entries.push(city); s.cities!.selectedId=city.id;
  nav.notice=`Založeno město ${name} · zaplaceno ${CITY_COST} jantaru. Identita a adresa jsou uložené v kampani.`;
  return true;
}
export function selectCity(s: GameState, id: string): boolean {
  if (!s.cities || !selectAddress(s,s.cities.entries,id)) return false;
  s.cities.selectedId=id; return true;
}
export function enterCity(s: GameState, id: string): boolean {
  const city=s.cities?.entries.find(c=>c.id===id), nav=navigation(s);
  const f=nav?.fields.find(f=>f.id===city?.address.locationId);
  if (!city || !f || !nav || !cityPositionClear(s,f,f.position)) return false;
  if (!enterField(s,f.cellId)) return false;
  s.cities!.selectedId=id;
  nav.notice=`Příchod do města ${city.name} · poslední místní poloha zachována. Domov a jednotky stojí.`;
  return true;
}
