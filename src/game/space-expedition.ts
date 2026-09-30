import { coreEntryProblem } from './space-core-content';
import { shipCargoCount } from './space-economy';
import { observeSocietyScans } from './space-discoveries';
import { isEcological, pruneForeignScans, refreshForeignStability } from './space-ecology';
import type { GameState, Vec3 } from './types';
import type { ExpeditionAction, SpaceExpedition, SpaceLife } from './space-expedition-types';
import { jumpEnergy, systemById, systemDistance, planetSystem } from './galaxy';
import { shipCapabilities } from './space-outfit-content';
import { createForeignPlanet, foreignGround, lifeName } from './space-life';
import { horizontalDistance } from './random';
import { activatePlanetBiosphere, newOriginDemography, stopClimateTool } from './space-biosphere';
import type { HabitatBand, LivingPlanet, LivingSpecimen } from './space-biosphere-types';

export const TRANSFER_RANGE = 6;
export const EXPEDITION_COSTS = { scan: 1, collect: 2, release: 2 } as const;
export function enableExpedition(s: GameState): void {
  const enable = (state: GameState) => {
    if (!state.space || state.space.expedition) return false;
    state.space.expedition = { version: 1, generator: 1, worlds: [], cargo: [], scans: [], actions: [], nextAction: 1, energySpent: 0 }; return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
export const activeForeignPlanet = (s: GameState) => s.space?.location?.scale === 'surface'
  ? s.space.expedition?.worlds.find(world => world.id === s.space!.location!.planetId) ?? null : null;
/** Called only on actual arrival, never on map inspection or loading. */
export function visitForeignPlanet(s: GameState): void {
  const p = s.space, e = p?.expedition, l = p?.location;
  if (!p || !e || !l || l.scale !== 'surface' || l.planetId === p.homePlanetId || e.worlds.some(w => w.id === l.planetId)) return;
  const system = systemById(p.homePlanetId, l.systemId);
  if (!system || system.planetId !== l.planetId) return;
  const world = createForeignPlanet(system, s.worlds[2]?.creatureDesigns?.map(design => design.creation));
  if (e.version === 2) {
    const living = activatePlanetBiosphere(world);
    if (isEcological(e)) living.biosphere.ecologyElapsed = world.elapsed;
    e.worlds.push(living);
    if (system.living) e.biosphere.origins.push(newOriginDemography(world.id));
  } else e.worlds.push(world);
}
export function jumpQuote(s: GameState, targetId: string) {
  const p = s.space, l = p?.location, ship = p?.ship, from = p && l ? systemById(p.homePlanetId, l.systemId) : null,
    to = p ? systemById(p.homePlanetId, targetId) : null;
  const range = p ? shipCapabilities(p)?.jumpRange ?? 18 : 18;
  const distance = from && to ? systemDistance(from, to) : 0, price = from && to ? jumpEnergy(from, to) : 0;
  let reason = !p?.expedition || !l || !ship || ship.health <= 0 || s.deathReason || s.player.health <= 0 ? 'Nejprve vzlétni vlastní lodí.'
    : p.leg ? 'Dokonči probíhající let.' : l.scale !== 'system' ? 'Pro mezihvězdný skok vystoupej do soustavy.'
      : !from || !to ? 'Neznámá soustava.' : from.id === to.id ? 'V této soustavě už jsi.'
        : distance > range ? `Hvězda je ${distance.toFixed(1)} daleko; dosah lodi je ${range}. Zvol mezizastávku.`
          : Math.hypot(l.pos.x, l.pos.z) > 24 ? 'Pro skok se vrať do 24 kroků od soustavového majáku.'
            : ship.energy < price ? `Skok potřebuje ${price} energie. Zastav a nech loď dobít.` : '';
  if (!reason && p && to) reason = coreEntryProblem(p.core, p.homePlanetId, to.planetId);
  return { ok: !reason, reason, price, distance };
}
export function jumpToSystem(s: GameState, targetId: string): boolean {
  const p = s.space, q = jumpQuote(s, targetId); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const target = systemById(p.homePlanetId, targetId)!;
  p.ship!.energy -= q.price;
  stopClimateTool(s);
  p.leg = { from: structuredClone(p.location!), to: { scale: 'system', systemId: target.id, planetId: target.planetId,
    pos: { x: 0, y: 0, z: 0 }, heading: 0 }, elapsed: 0, duration: 6, energyPaid: q.price };
  p.notice = `Skok do soustavy ${target.name} · ${q.price} energie · 6 sekund.`; return true;
}
function surfaceProblem(s: GameState): string {
  if (!s.space?.ship || !s.space.expedition || !activeForeignPlanet(s)) return 'Život zkoumej nad povrchem cizí planety.';
  if (s.space.leg) return 'Nejprve dokonči let.';
  if (s.space.ship.health <= 0 || s.deathReason || s.player.health <= 0) return 'Loď nemůže použít nástroj.';
  return '';
}
/** Keep new living colonies readable without teleporting cargo beyond its tool range. */
function releasePosition(s: GameState): Vec3 | null {
  const world = activeForeignPlanet(s), ship = s.space?.location; if (!world || !ship) return null;
  const e = s.space!.expedition!;
  if (e.version !== 2 || !isEcological(e)) return { x: ship.pos.x, z: ship.pos.z, y: foreignGround(world.seed, ship.pos.x, ship.pos.z) };
  for (const radius of [0, 2.8, 5]) for (let i = 0; i < (radius ? 12 : 1); i++) {
    const x = ship.pos.x + Math.cos(i * Math.PI / 6) * radius, z = ship.pos.z + Math.sin(i * Math.PI / 6) * radius;
    if (Math.abs(x) > 79 || Math.abs(z) > 79) continue;
    const y = foreignGround(world.seed, x, z);
    if (Math.hypot(x - ship.pos.x, y - ship.pos.y, z - ship.pos.z) <= TRANSFER_RANGE
      && world.life.every(life => Math.hypot(life.pos.x - x, life.pos.z - z) >= 2.4)) return { x, y, z };
  }
  return null;
}
export function specimenQuote(s: GameState, kind: ExpeditionAction['kind'], id: string) {
  const p = s.space, e = p?.expedition, world = activeForeignPlanet(s);
  const life = kind === 'release' ? e?.cargo.find(item => item.id === id) : world?.life.find(item => item.id === id);
  let reason = ['scan', 'collect', 'release'].includes(kind) ? surfaceProblem(s) : 'Neznámý lodní nástroj.', distance = 0;
  if (!reason && !life) reason = kind === 'release' ? 'Tento exemplář už v nákladu není.' : 'Tento organismus tu už není.';
  if (!reason && life && p?.location && p.ship && e) {
    const stats = shipCapabilities(p)!;
    distance = kind === 'release' ? p.location.pos.y : Math.hypot(horizontalDistance(p.location.pos, life.pos), p.location.pos.y - life.pos.y);
    const range = kind === 'scan' ? stats.scan : TRANSFER_RANGE;
    if (distance > range) reason = `Přibliž se ${kind === 'release' ? 'k povrchu' : 'k organismu'}: ${distance.toFixed(1)} / ${range.toFixed(1)} kroků.`;
    else if (kind === 'collect' && !e.scans.some(scan => scan.lifeId === id)) reason = 'Nejprve proskenuj tento organismus.';
    else if (kind === 'collect' && shipCargoCount(s) >= stats.cargo) reason = `Náklad je plný (${stats.cargo}). Nejprve vysaď exemplář nebo prodej produkci.`;
    else if (kind === 'release' && world!.life.length >= 96) reason = 'Místní biotop je plný (96 jedinců).';
    else if (kind === 'release' && !releasePosition(s)) reason = 'Pod lodí není volné místo pro život. Klesni nebo se posuň několik kroků.';
    else if (p.ship.energy < EXPEDITION_COSTS[kind]) reason = `Nástroj potřebuje ${EXPEDITION_COSTS[kind]} energie. Nech loď dobít.`;
  }
  return { ok: !reason, reason, distance, price: EXPEDITION_COSTS[kind], life };
}
function recordAction(e: SpaceExpedition, action: Omit<ExpeditionAction, 'serial'> & { band?: HabitatBand }) {
  e.actions.push({ serial: e.nextAction++, ...action }); e.energySpent += action.energyPaid; if (e.actions.length > 128) e.actions.shift();
  if (e.version === 2) { if (action.kind === 'scan') e.biosphere.paidScans++; else e.biosphere.paidTransfers++; pruneForeignScans(e); }
}
function moveSpecimen(from: SpaceLife[], to: SpaceLife[], item: SpaceLife): void {
  from.splice(from.indexOf(item), 1); to.push(item);
}
export function useSpecimenTool(s: GameState, kind: ExpeditionAction['kind'], id: string, band: HabitatBand = 1): boolean {
  const p = s.space, q = specimenQuote(s, kind, id); if (!p) return false;
  if (!q.ok) { p.notice = q.reason; return false; }
  const e = p.expedition!, world = activeForeignPlanet(s)!, item = q.life!, name = lifeName(e, item);
  if (e.version === 2 && kind === 'release' && ![1, 2, 3].includes(band)) { p.notice = 'Vyber platný živý pás 1–3.'; return false; }
  if (kind === 'scan') {
    if (!e.scans.some(scan => scan.lifeId === id)) e.scans.push({ lifeId: id, planetId: world.id, at: p.elapsed });
  } else if (kind === 'collect') {
    moveSpecimen(world.life, e.cargo, item);
  } else {
    if (e.version === 2) e.cargo.find(specimen => specimen.id === id)!.habitat.band = band;
    item.pos = releasePosition(s)!;
    moveSpecimen(e.cargo, world.life, item);
  }
  p.ship!.energy -= q.price;
  if (p.ship!.energy <= 1e-10) stopClimateTool(s);
  recordAction(e, { at: p.elapsed, kind, planetId: world.id, lifeId: id, energyPaid: q.price, ...(e.version === 2 && (kind === 'release' || kind === 'collect' && isEcological(e)) ? { band: kind === 'release' ? band : (item as LivingSpecimen).habitat.band } : {}) });
  if (e.version === 2) refreshForeignStability(e, world as LivingPlanet);
  observeSpaceEmpires(s);
  observeSocietyScans(s);
  p.notice = `${kind === 'scan' ? 'Proskenováno' : kind === 'collect' ? 'Naloženo' : 'Vysazeno'}: ${name}. ${q.price} energie.`;
  return true;
}
export function spacePlaceName(s: GameState): string {
  const p = s.space, l = p?.location;
  const system = p && l ? planetSystem(p.homePlanetId, l.planetId) : null;
  return system ? l?.scale === 'system' ? system.name : system.planetName : 'Lumavora';
}
export function foreignSpecimenTargets(s: GameState): { life: SpaceLife; distance: number; scanned: boolean }[] {
  const p = s.space, e = p?.expedition, world = activeForeignPlanet(s); if (!p?.location || !e || !world) return [];
  return world.life.map(life => ({ life, distance: Math.hypot(horizontalDistance(p.location!.pos, life.pos), p.location!.pos.y - life.pos.y),
    scanned: e.scans.some(scan => scan.lifeId === life.id) })).sort((a, b) => a.distance - b.distance || a.life.id.localeCompare(b.life.id));
}
import { observeSpaceEmpires } from './space-empires';
