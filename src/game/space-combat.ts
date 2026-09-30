import type { GameState } from './types';
import type { SpaceBattle, ShipRescue } from './space-combat-types';
import type { WarBattleLink } from './space-war-types';
import { finishWarBattle } from './space-war';
import { finishEventBattle } from './space-events';
import { finishCoreBattle } from './space-core';
import { empireCut } from './space-empires';
import { shipCapabilities } from './space-outfit-content';
import { homeSpaceProblem } from './space';
import { activeSpaceBattle, latestBattle, emptyCombatArchive, archiveBattle, pirateOrigin, vecDistance,
  SPACE_PULSE, enemyProfile, COMBAT_REST, COMBAT_TAIL, RESCUE_HEALTH, RESCUE_SECONDS } from './space-combat-content';

/** Explicit opt-in; loading/validating a historical file never invents combat. */
export function enableSpaceCombat(s: GameState): void {
  const enable = (v: GameState) => {
    const p = v.space; if (!p?.expansion || p.combat) return false;
    p.combat = { version: 1, activated: { cut: empireCut(v), economyAt: p.economy!.elapsed, health: p.ship?.health ?? null, repaired: p.economy!.ledger.healthRestored },
      archive: emptyCombatArchive(), battles: [], legacyRescue: null }; return true;
  };
  enable(s);
  if (s.checkpoint) { const cp = JSON.parse(s.checkpoint) as GameState; if (enable(cp)) s.checkpoint = JSON.stringify(cp); }
}
export function pirateQuote(s: GameState, serial: number) {
  const p = s.space, c = p?.combat, l = p?.location, b = p ? latestBattle(p) : null;
  let reason = '';
  if (!p || !c || !p.ship || s.stage !== 5 || s.deathReason || s.player.health <= 0 || p.ship.health <= 0) reason = 'Nejprve připrav živou vlastní loď.';
  else if (serial !== c.archive.battles + c.battles.length + 1) reason = 'Signál se změnil. Vyber jej znovu.';
  else if (activeSpaceBattle(p)) reason = 'Pirátská loď už je před tebou.';
  else if (!l || p.leg || l.scale !== 'orbit' || l.planetId === p.homePlanetId) reason = 'Pirátské signály prověříš na cizí orbitě.';
  else if (Math.hypot(l.pos.x, l.pos.z) > 24) reason = 'Přibliž se k orbitálnímu majáku do24 kroků.';
  else if (b?.end && p.elapsed < b.end.at + COMBAT_REST - 1e-7) reason = `Další signál za${Math.ceil(b.end.at + COMBAT_REST - p.elapsed)}s letu. Nyní můžeš pokračovat v expedici.`;
  return { ok: !reason, reason };
}
export function investigatePirates(s: GameState, serial: number): boolean {
  const q = pirateQuote(s, serial), p = s.space;
  if (!p || !q.ok) { if (p) p.notice = q.reason; return false; }
  beginSpaceBattle(s, 'pirate');
  p.notice = 'Pirátský střep útočí. Mezerník: pulz za3 energie do24 kroků. WASD uhýbá; R nebo V umožní ústup.'; return true;
}
/** Internal combat construction after the appropriate public quote succeeded. */
export function beginSpaceBattle(s: GameState, kind: SpaceBattle['kind'], war?: WarBattleLink, core?: SpaceBattle['core']): void {
  const p = s.space!, c = p.combat!, l = p.location!, serial = c.archive.battles + c.battles.length + 1;
  if (c.battles.length === COMBAT_TAIL) archiveBattle(c.archive, c.battles.shift()!);
  c.battles.push({ serial, kind, ...(war ? { war: { ...war } } : {}), ...(core ? { core: { ...core } } : {}), start: empireCut(s), economyAt: p.economy!.elapsed, planetId: l.planetId, origin: { ...l.pos }, startingHealth: p.ship!.health,
    repaired: p.economy!.ledger.healthRestored, enemy: { pos: pirateOrigin(l.pos), health: enemyProfile(kind).health },
    shots: 0, received: 0, damage: 0, lastShot: null, lastHit: null, end: null, rescue: null });
}
export function pulseQuote(s: GameState) {
  const p = s.space, b = p ? activeSpaceBattle(p) : null;
  let reason = '';
  if (p?.ship?.health === 0) reason = 'Loď je vrak. Nouzovou opravu najdeš vpravo.';
  else if (!p?.ship || !p.location || p.leg || !b || s.deathReason || s.player.health <= 0) reason = 'Není tu živý pirátský cíl.';
  else if (vecDistance(p.location.pos, b.enemy.pos) > SPACE_PULSE.range) reason = 'Cíl je mimo dosah24. Přibliž se běžným řízením.';
  else if (p.ship.energy < SPACE_PULSE.energy) reason = 'Pulz potřebuje3 energie. Zastavení dobíjí solár.';
  else if (b.lastShot && p.elapsed - b.lastShot.at < SPACE_PULSE.interval - 1e-8) reason = 'Pulz se dobíjí0,65s.';
  return { ok: !reason, reason };
}
function endBattle(s: GameState, b: SpaceBattle, outcome: NonNullable<SpaceBattle['end']>['outcome']) {
  const p = s.space!; b.end = { outcome, at: p.elapsed, economyAt: b.economyAt + p.elapsed - b.start.at, health: p.ship!.health };
  p.notice = outcome === 'won' ? 'Pirátský střep umlkl. Další signál nejdříve za90s letu; můžeš pokračovat v expedici.'
    : outcome === 'lost' ? 'Loď je vrak. Kabina i náklad přežily; spusť12s nouzovou opravu. Potom doletíš k placenému servisu.'
    : 'Ústup z pirátského boje. Odolnost a náklad zůstávají; další signál nejdříve za90s letu.';
  finishWarBattle(s, b);
  finishEventBattle(s, b);
  finishCoreBattle(s, b);
}
export function fireSpacePulse(s: GameState): boolean {
  const q = pulseQuote(s), p = s.space;
  if (!p || !q.ok) { if (p) p.notice = `Poslední pulz odmítnut: ${q.reason}`; return false; }
  const b = activeSpaceBattle(p)!; p.ship!.energy -= SPACE_PULSE.energy; b.shots++;
  b.enemy.health = Math.max(0, b.enemy.health - SPACE_PULSE.damage);
  b.lastShot = { at: p.elapsed, from: { ...p.location!.pos }, to: { ...b.enemy.pos } };
  if (!b.enemy.health) endBattle(s, b, 'won');
  else p.notice = `Pulz zasáhl cíl za${SPACE_PULSE.damage}. Zbývá${b.enemy.health} odolnosti.`;
  return true;
}
/** Invoke only after the existing travel command really created a paid leg. */
export function retreatSpaceBattle(s: GameState): void {
  const p = s.space, b = p ? activeSpaceBattle(p) : null;
  if (b && p!.leg) endBattle(s, b, 'retreated');
}
export function stepSpaceCombat(s: GameState, dt: number): void {
  const p = s.space, b = p ? activeSpaceBattle(p) : null;
  if (!p?.ship || !p.location || p.leg || !b || p.ship.health <= 0 || !Number.isFinite(dt) || dt <= 0) return;
  const enemy = enemyProfile(b.kind);
  dt = Math.min(dt, 1 / 30);
  const target = p.location.pos, pos = b.enemy.pos, distance = vecDistance(pos, target);
  const move = Math.min(Math.max(0, distance - enemy.standOff), enemy.speed * dt);
  if (distance > 0) for (const axis of ['x', 'y', 'z'] as const) pos[axis] += (target[axis] - pos[axis]) / distance * move;
  if (vecDistance(pos, target) > enemy.range || p.elapsed - (b.lastHit?.at ?? b.start.at) < enemy.interval - 1e-8) return;
  const damage = Math.min(enemy.damage, p.ship.health); p.ship.health -= damage; b.damage += damage; b.received++;
  b.lastHit = { at: p.elapsed, from: { ...pos }, to: { ...target } };
  if (!p.ship.health) endBattle(s, b, 'lost');
}
export function currentShipRescue(s: GameState): ShipRescue | null {
  const c = s.space?.combat; if (!c) return null;
  const b = s.space ? latestBattle(s.space) : null;
  return b?.end?.outcome === 'lost' ? b.rescue : c.legacyRescue;
}
export function rescueShip(s: GameState): boolean {
  const p = s.space, c = p?.combat, b = p ? latestBattle(p) : null;
  if (!p?.ship || !c || p.ship.health !== 0 || p.leg || s.stage !== 5 || s.deathReason || s.player.health <= 0 || currentShipRescue(s)) return false;
  const rescue: ShipRescue = { startedAt: p.economy!.elapsed, completedAt: null };
  if (b?.end?.outcome === 'lost') b.rescue = rescue;
  else if (c.activated.health === 0 && !c.battles.length && !c.archive.battles && !homeSpaceProblem(s)) c.legacyRescue = rescue;
  else return false;
  p.notice = 'Kabina opravuje loď12s. Náklad i účty zůstanou. Obnoví25 odolnosti; plný servis poskytne tvoje kolonie.'; return true;
}
/** After the ordinary economy clock advanced. No healing from rendering/import. */
export function stepShipRescue(s: GameState): void {
  const p = s.space, rescue = currentShipRescue(s);
  if (!p?.ship || p.ship.health !== 0 || !rescue || rescue.completedAt !== null || s.deathReason || s.player.health <= 0) return;
  if (p.economy!.elapsed - rescue.startedAt < RESCUE_SECONDS - 1e-8) return;
  rescue.completedAt = p.economy!.elapsed; p.ship.health = Math.min(RESCUE_HEALTH, shipCapabilities(p)!.health);
  p.notice = 'Nouzová oprava hotová:25 odolnosti. Můžeš letět. Oprava dalších40 u vlastní kolonie stojí5 ◈.';
}
