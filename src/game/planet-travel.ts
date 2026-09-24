import type { GameState, Input, Vec3, World } from './types';
import { enableHomePlanet, locationId, resolveLocationAddress, type LocationAddress } from './home-planet';
import { planetAtlas, geographicAddress, locationGeography, type AtlasCell } from './planet-geography';
import { worldStageFor } from './stage';
import { organismGroundClearance } from './anatomy';

export interface FieldLocation { id: string; kind: 'field'; cellId: number; world: World; position: Vec3; heading: number; }
export interface PlanetNavigation {
  version: 1; detailGenerator: 1; mode: 'local' | 'global'; selectedCell: number;
  camera: { x: number; y: number; zoom: number };
  fields: FieldLocation[]; visits: { locationId: string; tick: number }[]; notice: string;
}
export const FIELD_LIMIT = 64;
export const fieldId = (planetId: string, cell: number) => `${planetId}:field-${cell}`;
export const navigation = (s: GameState) => s.homePlanet?.version === 3 ? s.homePlanet.navigation : null;
export const activeField = (s: GameState) => navigation(s)?.fields.find(f => f.id === s.homePlanet?.currentLocationId) ?? null;
export const campaignWorld = (s: GameState) => s.worlds[worldStageFor(s.stage)]!;
export const homeLocationId = (s: GameState) => s.homePlanet ? locationId(s.homePlanet.id, worldStageFor(s.stage)) : '';
/** Resolve the active alias after parse/checkpoint. Never infer campaign stage from geography. */
export function bindActiveWorld(s: GameState): void { s.world = activeField(s)?.world ?? campaignWorld(s); }
export function enablePlanetTravel(s: GameState): void {
  enableHomePlanet(s);
  const activate = (v: GameState) => {
    if (v.homePlanet?.version !== 2) return;
    const cell = planetAtlas(v.homePlanet)!.anchors[worldStageFor(v.stage)].cellId;
    v.homePlanet = { ...v.homePlanet, version: 3, navigation: { version: 1, detailGenerator: 1,
      mode: 'local', selectedCell: cell, camera: { x: 360, y: 180, zoom: 1 }, fields: [], visits: [], notice: '' } };
  };
  activate(s);
  if (s.checkpoint) {
    const checkpoint = JSON.parse(s.checkpoint) as GameState;
    if (checkpoint.homePlanet?.version !== 3) { activate(checkpoint); s.checkpoint = JSON.stringify(checkpoint); }
  }
}
const hash = (seed: number, n: number) => { let h = Math.imul(seed ^ n, 0x45d9f3b); h = Math.imul(h ^ h >>> 16, 0x45d9f3b); return (h ^ h >>> 16) >>> 0; };
/** Detail generator 1: separate from B's immutable atlas and all simulation RNGs. */
export function fieldGround(seed: number, cell: AtlasCell, x: number, z: number): number {
  const phase = hash(seed, cell.id) / 4294967296 * Math.PI * 2;
  const amplitude = cell.biome === 'mountain' ? 5 : cell.biome === 'desert' ? 2 : 1;
  return Math.round(Math.max(.5 - cell.elevationMeters, amplitude * (Math.sin(x / 23 + phase) * Math.cos(z / 27) - Math.sin(phase))) * 1e6) / 1e6;
}
export function createField(seed: number, planetId: string, cell: AtlasCell): FieldLocation {
  const rng = hash(seed, cell.id + 57000), points = [{ x: 0, z: -12 }, { x: -20 - rng % 12, z: 12 }, { x: 20 + rng % 14, z: 20 }];
  const pos = (x: number, z: number) => ({ x, y: fieldGround(seed, cell, x, z), z });
  const world: World = { seed, stage: 2, rng, time: 0, resources: [], creatures: [], obstacles: [], nextId: 1, births: 0, deaths: 0,
    patches: points.map((p, i) => ({ id: i, name: ['Povrchový profil', 'Vodní stopa', 'Biomový profil'][i], subtitle: 'Terénní měření', center: pos(p.x, p.z), radius: 6, fertility: .5, pressure: 0, hunted: 0, harvested: 0, restored: 0, color: 0x9baf70, discovered: false })),
    landmarks: [{ id: 'nest', kind: 'nest', name: 'Příchod výpravy', pos: pos(0, 0), charge: 0 }, { id: 'gate', kind: 'gate', name: 'Návrat', pos: pos(0, 0), charge: 0 },
      ...points.map((p, i) => ({ id: `spring-${i}`, kind: 'spring' as const, name: ['Povrch', 'Voda', 'Biom'][i], pos: pos(p.x, p.z), charge: 0 }))] };
  return { id: fieldId(planetId, cell.id), kind: 'field', cellId: cell.id, world, position: pos(0, 0), heading: Math.PI };
}
export function travelAvailability(s: GameState, cellId: number): { available: boolean; reason: string } {
  const nav = navigation(s), atlas = s.homePlanet && planetAtlas(s.homePlanet), cell = atlas?.cells[cellId];
  let reason = '';
  if (!nav || !cell || !Number.isInteger(cellId)) reason = 'Neplatný cíl.';
  else if (s.deathReason || s.player.health <= 0) reason = 'Nejprve obnov živou generaci.';
  else if (s.stage < 2) reason = 'Výpravy se otevřou po skutečném přechodu na souš v etapě tvora.';
  else if (cell.surface !== 'land') reason = 'Vodní lokalita vyžaduje budoucí námořní cestování.';
  else if (atlas!.anchors.some(a => a.cellId === cellId)) reason = 'Domovský habitat: použij Návrat domů. Etapy mění pouze původní postup.';
  else if (!activeField(s) && s.stage === 2 && s.journey.cargo) reason = 'Nejprve odevzdej nesený ekologický náklad.';
  else if (!activeField(s) && s.stage === 2 && Math.hypot(s.player.pos.x - campaignWorld(s).landmarks[0].pos.x, s.player.pos.z - campaignWorld(s).landmarks[0].pos.z) >= 11) reason = 'Výpravu zahaj u vlastního hnízda (do 11 místních jednotek).';
  else if (!nav.fields.some(f => f.cellId === cellId) && nav.fields.length >= FIELD_LIMIT) reason = 'Uloženo 64 míst. Další výpravy zatím nejsou dostupné; navštívená místa zůstávají přístupná.';
  return { available: !reason, reason: reason || 'Dostupná pevninská výprava · původní dění bude pozastavené.' };
}
export function openAtlas(s: GameState): void {
  const nav = navigation(s); if (!nav) return;
  nav.mode = 'global';
}
export function enterField(s: GameState, cellId: number): boolean {
  const nav = navigation(s), planet = s.homePlanet, status = travelAvailability(s, cellId);
  if (!nav || !planet) return false;
  if (!status.available) { nav.notice = status.reason; return false; }
  let field = nav.fields.find(f => f.cellId === cellId);
  if (!field) { field = createField(s.seed, planet.id, planetAtlas(planet)!.cells[cellId]); nav.fields.push(field); }
  planet.currentLocationId = field.id; s.world = field.world; nav.mode = 'local'; nav.selectedCell = cellId;
  if (!nav.visits.some(v => v.locationId === field.id)) nav.visits.push({ locationId: field.id, tick: s.tick });
  nav.notice = `Příchod · lokalita ${cellId}. WASD k terénním stanovištím, E změří povrch. N otevře planetu.`;
  return true;
}
export function returnHome(s: GameState): void {
  const nav = navigation(s); if (!nav || !s.homePlanet) return;
  const travelled = !!activeField(s);
  s.homePlanet.currentLocationId = homeLocationId(s); bindActiveWorld(s); nav.mode = 'local';
  if (travelled && !nav.visits.some(v => v.locationId === s.homePlanet!.currentLocationId)) nav.visits.push({ locationId: s.homePlanet.currentLocationId, tick: s.tick });
  nav.notice = travelled ? 'Návrat domů · původní svět, poloha a rozpracované příkazy zachované.' : 'Zpět k místnímu dění.';
}
export function fieldSurvey(s: GameState): { index: number; distance: number; done: boolean } | null {
  const field = activeField(s); if (!field) return null;
  return field.world.patches.map((p, index) => ({ index, distance: Math.hypot(field.position.x - p.center.x, field.position.z - p.center.z), done: p.discovered })).sort((a, b) => a.distance - b.distance)[0];
}
export function surveyField(s: GameState): boolean {
  const nav = navigation(s), field = activeField(s), target = fieldSurvey(s);
  if (!nav || !field || nav.mode !== 'local' || !target || s.deathReason || s.player.health <= 0) return false;
  if (target.distance > 3) { nav.notice = 'Přibliž se ke stanovišti na 3 místní jednotky a stiskni E.'; return false; }
  if (target.done) { nav.notice = 'Toto měření už je uložené. Vyhledej další stanoviště.'; return false; }
  field.world.patches[target.index].discovered = true; field.world.landmarks[target.index + 2].charge = 1;
  nav.notice = `Měření uloženo · ${field.world.patches[target.index].name}. ${field.world.patches.filter(p => p.discovered).length}/3 stanovišť. Bez odměny DNA či jantaru.`;
  return true;
}
/** Expedition locomotion only. Campaign tick, player physiology, RNG and units remain frozen. */
export function stepField(s: GameState, input: Input, dt: number): void {
  const field = activeField(s), nav = navigation(s); if (!field || !nav || nav.mode !== 'local' || s.deathReason || s.player.health <= 0) return;
  dt = Math.max(0, Math.min(1 / 30, dt)); const length = Math.hypot(input.x, input.z), speed = 8;
  if (length > 0) {
    field.position.x = Math.max(-78, Math.min(78, field.position.x + input.x / Math.max(1, length) * speed * dt));
    field.position.z = Math.max(-78, Math.min(78, field.position.z + input.z / Math.max(1, length) * speed * dt));
    field.heading = Math.atan2(input.x, input.z);
  }
  field.position.y = fieldGround(s.seed, planetAtlas(s.homePlanet!)!.cells[field.cellId], field.position.x, field.position.z);
  field.world.time += dt;
  if (input.offer) surveyField(s);
}
export function fieldActorPosition(s: GameState): Vec3 | null { const f = activeField(s); return f ? { ...f.position, y: f.position.y + organismGroundClearance(s.player.genome) } : null; }
/** SP-009 supplies real city IDs/addresses; this layer never invents ownership or cities. */
export interface AddressSelection { id: string; name: string; address: LocationAddress; }

export function selectAddress(s: GameState, choices: readonly AddressSelection[], id: string) {
  const nav = navigation(s), matches = choices.filter(choice => choice.id === id);
  if (!nav || matches.length !== 1) return null;
  const choice = matches[0], resolved = resolveLocationAddress(s, choice.address), address = geographicAddress(s, choice.address), geo = locationGeography(s, choice.address.locationId);
  if (!resolved || !address || !geo) return null;
  nav.selectedCell = geo.cell.id; nav.camera = { x: Math.max(90, Math.min(630, (address.point.longitude + 180) * 2)), y: Math.max(45, Math.min(315, (90 - address.point.latitude) * 2)), zoom: 4 }; nav.mode = 'global';
  return { id: choice.id, name: choice.name, address: { ...choice.address, position: { ...choice.address.position } }, geography: address, world: resolved.world };
}
