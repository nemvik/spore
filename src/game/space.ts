import { stepSpaceCombat, retreatSpaceBattle } from './space-combat';
import { shipCapabilities } from './space-outfit-content';
import type { GameState, Input } from './types';
import type { SpacePosition, SpaceScale, SpaceState } from './space-types';
import { shipStats } from './ship-design';
import { validateShipCreation, type ShipCreation } from './ship-library';
import { activePlanet, atPlanetBase } from './planet';
import { activeMachines } from './machines';
import { activeField, navigation } from './planet-travel';
import { atSea } from './maritime';
import { inCommerce } from './commerce';
import { clamp } from './random';
import { activeForeignPlanet, visitForeignPlanet, spacePlaceName } from './space-expedition';
import { stepPlanetBiosphere, stopClimateTool } from './space-biosphere';
import { placeSpaceAllies, stepSpaceAllies } from './space-expansion';

export const inSpace = (s: GameState): boolean => !!s.space?.location;
export const homeSystemId = (planetId: string): string => `${planetId}:system`;
export const SCALE_NAMES: Record<SpaceScale, string> = { surface: 'Nad povrchem', orbit: 'Orbita', system: 'Soustava' };
/** Explicit UI activation, including the independently frozen generation checkpoint. */
export function enableSpace(s: GameState): void {
  const enable = (v: GameState) => {
    if (v.space || !v.homePlanet) return false;
    v.space = { version: 1, homePlanetId: v.homePlanet.id, elapsed: 0, ship: null, location: null, leg: null, log: [], nextSerial: 1, notice: '' }; return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
export function homeSpaceProblem(s: GameState): string {
  if (s.stage !== 5 || !activePlanet(s) || !activeMachines(s) || !s.space) return 'Loď se otevře po sjednocení civilizace v etapě planety.';
  if (s.civilization?.entry === 'required' && !s.civilization.completed) return 'Nejprve dokonči sjednocení civilizace.';
  if (s.deathReason || s.player.health <= 0) return 'Nejprve obnov živou generaci.';
  if (inSpace(s) || activeField(s) || navigation(s)?.mode === 'global' || atSea(s) || inCommerce(s)) return 'Vrať se do domácí dílny.';
  if (!atPlanetBase(s)) return 'S řízeným strojem se vrať k domácí dílně (do 12 kroků).';
  return '';
}
export function shipQuote(s: GameState, creation: ShipCreation) {
  let reason = homeSpaceProblem(s), price = 0;
  try { validateShipCreation(creation); price = shipStats(creation.blueprint).cost; } catch (e) { reason = (e as Error).message; }
  if (!reason && s.space!.ship) reason = 'Vlastní loď už máš. Úprava knihovny nemění její zaplacenou konstrukci.';
  if (!reason && activeMachines(s)!.resource < price) reason = `Chybí jantar: stavba stojí ${price} ◈.`;
  return { ok: !reason, reason, price };
}
export function buildShip(s: GameState, creation: ShipCreation): boolean {
  const q = shipQuote(s, creation); if (!q.ok) { if (s.space) s.space.notice = q.reason; return false; }
  const m = activeMachines(s)!, p = s.space!, stats = shipStats(creation.blueprint), before = m.resource;
  m.resource -= q.price;
  p.ship = { id: `${p.homePlanetId}:ship-1`, creation: structuredClone(creation), health: stats.health, energy: stats.energy, purchase: { tick: s.tick, before, paid: q.price, after: m.resource } };
  p.notice = `Loď ${creation.blueprint.name} postavena za ${q.price} ◈. Nastup a vzlétni.`; return true;
}
function record(p: SpaceState, from: 'dock' | SpaceScale, to: 'dock' | SpaceScale, fromPlanetId?: string, passage?: NonNullable<SpaceState['leg']>['passage']) {
  p.log.push({ serial: p.nextSerial++, at: p.elapsed, from, to, planetId: p.location?.planetId ?? p.homePlanetId,
    ...(fromPlanetId ? { fromPlanetId } : {}), ...(passage ? { passage: structuredClone(passage) } : {}) });
  if (p.log.length > 128) p.log.shift();
}
export function launchShip(s: GameState): boolean {
  const reason = homeSpaceProblem(s), p = s.space;
  if (!p) return false;
  if (reason || !p.ship || p.ship.health <= 0) { p.notice = reason || 'Nejprve postav vlastní loď.'; return false; }
  activePlanet(s)!.toolOn = false;
  p.location = { scale: 'surface', systemId: homeSystemId(p.homePlanetId), planetId: p.homePlanetId, pos: { x: 0, y: 3, z: 0 }, heading: 0 };
  placeSpaceAllies(s);
  record(p, 'dock', 'surface'); p.notice = 'WASD řídí loď · Q stoupá · C klesá. Ve výšce 20 vystoupej na orbitu.'; return true;
}
export function changeSpaceScale(s: GameState, direction: 'up' | 'down'): boolean {
  const p = s.space, l = p?.location, ship = p?.ship;
  if (!p || !l || !ship || p.leg) return false;
  if (ship.health <= 0) { p.notice = 'Vrak nejprve obnov nouzovou opravou.'; return false; }
  const deny = (text: string) => { p.notice = text; return false; };
  if (direction === 'up' && l.scale === 'system') return deny(p.expedition ? 'Otevři Hvězdnou mapu a vyber dostupnou soustavu.' : 'Jsi v soustavě. Další hvězdy otevře mezihvězdná navigace.');
  if (direction === 'up' && l.scale === 'surface' && l.pos.y < 20) return deny('Nejprve vystoupej klávesou Q alespoň do výšky 20.');
  if (direction === 'down' && l.scale === 'surface') {
    if (l.planetId !== p.homePlanetId) return deny('Nad cizím povrchem zůstáváš v lodi. Život přenes skenerem; Q a R umožní další odlet.');
    if (l.planetId !== p.homePlanetId || Math.hypot(l.pos.x, l.pos.z) > 10 || l.pos.y > 8) return deny('Přistaň nad domácím majákem: vzdálenost do 10, výška do 8.');
    record(p, 'surface', 'dock'); p.location = null; placeSpaceAllies(s); p.notice = 'Návrat do dílny. Domácí svět, města i rozpracované příkazy zůstaly zachované.'; return true;
  }
  if (direction === 'down' && Math.hypot(l.pos.x, l.pos.z) > 16) return deny('Přibliž se k planetárnímu majáku na 16 kroků.');
  const cost = direction === 'up' ? 4 : 0;
  if (ship.energy < cost) return deny('Počkej se zastavenými motory: solární ploutve dobíjejí energii.');
  const scale: SpaceScale = direction === 'up' ? l.scale === 'surface' ? 'orbit' : 'system' : l.scale === 'system' ? 'orbit' : 'surface';
  const to: SpacePosition = { ...structuredClone(l), scale, pos: { x: 0, y: scale === 'surface' ? 7 : 0, z: 0 } };
  stopClimateTool(s);
  ship.energy -= cost; p.leg = { from: structuredClone(l), to, elapsed: 0, duration: 3, energyPaid: cost };
  p.notice = `${direction === 'up' ? 'Vzestup' : 'Sestup'} · ${SCALE_NAMES[scale]}.`; retreatSpaceBattle(s); return true;
}
/** No home clocks, random streams, player, city accounts or ecology are advanced here. */
export function stepSpace(s: GameState, input: Input, dt: number): void {
  const p = s.space, l = p?.location, ship = p?.ship;
  if (!p || !l || !ship || s.deathReason || s.player.health <= 0) return;
  dt = Number.isFinite(dt) ? clamp(dt, 0, 1 / 30) : 0; p.elapsed += dt;
  if (p.leg) {
    p.leg.elapsed = Math.min(p.leg.duration, p.leg.elapsed + dt);
    if (p.leg.elapsed >= p.leg.duration) {
      const from = l.scale, jumped = l.systemId !== p.leg.to.systemId, passage = p.leg.passage;
      p.location = p.leg.to; p.leg = null; record(p, from, p.location.scale, jumped ? l.planetId : undefined, passage);
      placeSpaceAllies(s);
      visitForeignPlanet(s);
      observeSpaceEmpires(s);
      p.notice = `${spacePlaceName(s)} · WASD / Q / C řídí loď. Planetární maják je ve středu souřadnic.`;
    }
    return;
  }
  if (ship.health <= 0) return;
  const foreign = activeForeignPlanet(s); if (foreign) foreign.elapsed += dt;
  const stats = shipCapabilities(p)!;
  const x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0, z = Number.isFinite(input.z) ? clamp(input.z, -1, 1) : 0, y = Number.isFinite(input.vertical) ? clamp(input.vertical, -1, 1) : 0;
  const length = Math.hypot(x, y, z), speed = stats.speed * (input.sprint && ship.energy > 1 ? 1.6 : 1);
  if (length) {
    const distance = speed * dt / Math.max(1, length);
    l.pos.x = clamp(l.pos.x + x * distance, -80, 80); l.pos.z = clamp(l.pos.z + z * distance, -80, 80);
    l.pos.y = clamp(l.pos.y + y * distance, l.scale === 'surface' ? 2 : -40, l.scale === 'surface' ? 26 : 40);
    if (Math.hypot(x, z) > .01) l.heading = Math.atan2(-x, -z);
    ship.energy = Math.max(0, ship.energy - dt * (input.sprint && ship.energy > 1 ? .8 : .05));
  } else ship.energy = Math.min(stats.energy, ship.energy + stats.solar * dt);
  stepSpaceAllies(s, dt);
  stepSpaceCombat(s, dt);
  stepPlanetBiosphere(s, dt);
}
import { observeSpaceEmpires } from './space-empires';
