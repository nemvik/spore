import { validateCoreBattle } from './space-core-validation';
import type { GameState, Vec3 } from './types';
import type { SpaceState } from './space-types';
import type { SpaceBattle, ShipRescue, SpacePulse, CombatArchive } from './space-combat-types';
import { validateEmpireCut } from './space-empires-validation';
import { shipCapabilities } from './space-outfit-content';
import { planetSystem } from './galaxy';
import { activeSpaceBattle, latestBattle, combatTotals, archiveBattle, pirateOrigin, vecDistance,
  SPACE_PULSE, PIRATE, WARDEN, enemyProfile, MILITARY_RESULTS, WARDEN_RESULTS, COMBAT_REST, COMBAT_TAIL, RESCUE_HEALTH, RESCUE_SECONDS } from './space-combat-content';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
function fail(): never { throw new Error('Neplatný uložený lodní boj, poškození nebo nouzová oprava.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
function pos(v: Vec3) { object(v, ['x', 'y', 'z']); number(v.x, -80, 80); number(v.y, -40, 40); number(v.z, -80, 80); }
/** A rolled economic prefix cannot establish a historical repair cut. */
function repairsAt(p: SpaceState, cut: number): number | null {
  const e = p.economy!; if (cut < e.nextAction - e.actions.length) return null;
  return e.ledger.healthRestored - e.actions.reduce((sum, row) => sum + (row.serial >= cut && row.kind === 'repair' ? row.after - row.before : 0), 0);
}
function rescue(v: ShipRescue | null, minimum: number, now: number) {
  if (v === null) return;
  object(v, ['startedAt', 'completedAt']); number(v.startedAt, minimum - 1e-6, now);
  if (v.completedAt === null) { if (now - v.startedAt >= RESCUE_SECONDS + 1e-6) fail(); }
  else { number(v.completedAt, v.startedAt + RESCUE_SECONDS - 1e-6, Math.min(now, v.startedAt + RESCUE_SECONDS + 1 / 30 + 1e-6)); }
}
function pulse(v: SpacePulse | null, count: number, b: SpaceBattle, end: number, own: boolean) {
  if (!count) { if (v !== null) fail(); return; }
  object(v, ['at', 'from', 'to']);
  const enemyStats = enemyProfile(b.kind), interval = own ? SPACE_PULSE.interval : enemyStats.interval;
  number(v.at, b.start.at + interval * (count - (own ? 1 : 0)) - 1e-6, end);
  pos(v.from); pos(v.to);
  if (vecDistance(v.from, v.to) > (own ? SPACE_PULSE.range : enemyStats.range) + 1e-6) fail();
  const enemy = own ? v.to : v.from;
  if (vecDistance(enemy, pirateOrigin(b.origin)) > enemyStats.speed * (v.at - b.start.at) + 1e-6
    || vecDistance(enemy, b.enemy.pos) > enemyStats.speed * (end - v.at) + 1e-6) fail();
}
export function validateSpaceCombat(s: GameState): void {
  const p = s.space!; if (!Object.hasOwn(p, 'combat')) return;
  const c = p.combat!, e = p.economy;
  object(c, ['version', 'activated', 'archive', 'battles', 'legacyRescue']);
  if (![1, 2, 3].includes(c.version) || !p.expansion || !e || (c.version >= 2) !== !!p.wars || (c.version === 3) !== !!p.core) fail();
  object(c.activated, ['cut', 'economyAt', 'health', 'repaired']);
  validateEmpireCut(c.activated.cut, s, p.expansion.activated);
  number(c.activated.economyAt, 0, e.elapsed); number(c.activated.repaired, 0, e.ledger.healthRestored);
  if (c.activated.cut.at - e.activated.spaceAt > c.activated.economyAt + 1e-6) fail();
  const service = repairsAt(p, c.activated.cut.economyAction);
  if (service !== null && !near(service, c.activated.repaired)) fail();
  const stats = shipCapabilities(p);
  if (c.activated.health !== null) { if (!stats) fail(); number(c.activated.health, 0, stats.health); }
  else if (p.ship && p.ship.purchase.tick < c.activated.cut.tick) fail();
  const a = c.archive;
  object(a, ['battles', 'victories', 'retreats', 'defeats', 'shots', 'received', 'damage', 'restored', 'endedAt', ...(c.version >= 2 ? MILITARY_RESULTS : []), ...(c.version === 3 ? WARDEN_RESULTS : [])]);
  for (const [key, value] of Object.entries(a)) number(value, 0, Number.MAX_SAFE_INTEGER, !['damage', 'endedAt'].includes(key));
  if (a.victories + a.retreats + a.defeats !== a.battles || a.restored !== a.defeats * RESCUE_HEALTH
    || a.shots < a.victories * 5 + (a.wardenVictories ?? 0) * 4 || a.shots > a.victories * 5 + (a.wardenVictories ?? 0) * 4 + (a.retreats + a.defeats) * 4 + ((a.wardenRetreats ?? 0) + (a.wardenDefeats ?? 0)) * 4
    || a.damage > a.received * (c.version === 3 ? WARDEN.damage : PIRATE.damage) + 1e-6 || a.received < a.defeats || a.endedAt > p.elapsed) fail();
  if (c.version >= 2 && (a.invasionVictories! + a.defenseVictories! + (a.wardenVictories ?? 0) > a.victories || a.invasionRetreats! + a.defenseRetreats! + (a.wardenRetreats ?? 0) > a.retreats || a.invasionDefeats! + a.defenseDefeats! + (a.wardenDefeats ?? 0) > a.defeats)) fail();
  if (!a.battles && Object.values(a).some(value => value !== 0) || a.battles && a.endedAt < c.activated.cut.at) fail();
  if (a.battles && a.battles > Math.floor((a.endedAt - c.activated.cut.at + 1e-6) / COMBAT_REST) + 1) fail();
  if (!Array.isArray(c.battles) || c.battles.length > COMBAT_TAIL || a.battles && c.battles.length !== COMBAT_TAIL) fail();
  if (c.legacyRescue !== null) {
    if (c.activated.health !== 0) fail(); rescue(c.legacyRescue, c.activated.economyAt, e.elapsed);
    if (c.legacyRescue.completedAt === null && (c.battles.length || a.battles || p.location)) fail();
  }
  let damage = a.damage, restored = a.restored + (c.legacyRescue?.completedAt != null ? RESCUE_HEALTH : 0),
    previous = c.activated.cut, previousTime = a.battles ? a.endedAt : null, previousEconomicTime = c.activated.economyAt, previousRepaired = c.activated.repaired;
  const base = c.activated.health ?? stats?.health ?? 0;
  for (const [index, b] of c.battles.entries()) {
    object(b, ['serial', 'kind', 'start', 'economyAt', 'planetId', 'origin', 'startingHealth', 'repaired', 'enemy', 'shots', 'received', 'damage', 'lastShot', 'lastHit', 'end', 'rescue', ...(b?.kind === 'invasion' || b?.kind === 'defense' ? ['war'] : b?.kind === 'warden' ? ['core'] : [])]);
    if (!stats || !['pirate', ...(c.version >= 2 ? ['invasion', 'defense'] : []), ...(c.version === 3 ? ['warden'] : [])].includes(b.kind) || b.serial !== a.battles + index + 1 || !planetSystem(p.homePlanetId, b.planetId) || b.planetId === p.homePlanetId) fail();
    if (b.kind === 'invasion' || b.kind === 'defense') {
      object(b.war, ['empireId', 'declarationSerial', 'orderSerial', 'raidSerial']);
      if (!p.wars || !p.wars.current.relations.some(r => r.empireId === b.war!.empireId)) fail();
      number(b.war.declarationSerial, 1, p.wars.nextAction - 1, true); number(b.war.orderSerial, b.war.declarationSerial + 1, p.wars.nextAction - 1, true);
      if (b.kind === 'invasion' ? b.war.raidSerial !== null : typeof b.war.raidSerial !== 'number' || b.war.raidSerial <= b.war.declarationSerial || b.war.raidSerial >= b.war.orderSerial) fail();
    }
    validateCoreBattle(s, b); const enemyStats = enemyProfile(b.kind);
    validateEmpireCut(b.start, s, previous);
    number(b.serial, 1, Number.MAX_SAFE_INTEGER, true);
    number(b.economyAt, previousEconomicTime, e.elapsed);
    if (b.economyAt - previousEconomicTime + 1e-6 < b.start.at - previous.at) fail();
    previous = b.start; previousEconomicTime = b.economyAt;
    if (b.start.travelAction < 2 || previousTime !== null && b.start.at < previousTime + COMBAT_REST - 1e-6
      || b.start.at - e.activated.spaceAt > b.economyAt + 1e-6
      || c.legacyRescue && (c.legacyRescue.completedAt === null || b.economyAt < c.legacyRescue.completedAt)) fail();
    pos(b.origin); if (Math.hypot(b.origin.x, b.origin.z) > 24) fail();
    number(b.startingHealth, Number.MIN_VALUE, stats.health); number(b.repaired, previousRepaired, e.ledger.healthRestored); previousRepaired = b.repaired;
    const repaired = repairsAt(p, b.start.economyAction);
    if (repaired !== null && !near(repaired, b.repaired) || !near(b.startingHealth, base + b.repaired - c.activated.repaired - damage + restored)) fail();
    object(b.enemy, ['pos', 'health']); pos(b.enemy.pos);
    number(b.shots, 0, enemyStats.health / SPACE_PULSE.damage, true); number(b.received, 0, Math.ceil(b.startingHealth / enemyStats.damage), true);
    number(b.damage, 0, b.startingHealth); number(b.enemy.health, 0, enemyStats.health);
    if (b.enemy.health !== enemyStats.health - b.shots * SPACE_PULSE.damage || !near(b.damage, Math.min(b.startingHealth, b.received * enemyStats.damage))) fail();
    const end = b.end?.at ?? p.elapsed;
    if (vecDistance(b.enemy.pos, pirateOrigin(b.origin)) > enemyStats.speed * (end - b.start.at) + 1e-6) fail();
    pulse(b.lastShot, b.shots, b, end, true); pulse(b.lastHit, b.received, b, end, false);
    if (b.end !== null) {
      object(b.end, ['outcome', 'at', 'economyAt', 'health']); number(b.end.at, b.start.at, p.elapsed); number(b.end.economyAt, b.economyAt, e.elapsed + 1e-6);
      if (!near(b.end.economyAt - b.economyAt, b.end.at - b.start.at) || !near(b.end.health, b.startingHealth - b.damage)) fail();
      if (!['won', 'retreated', 'lost'].includes(b.end.outcome) || (b.end.outcome === 'won') !== (b.enemy.health === 0)
        || (b.end.outcome === 'lost') !== (b.end.health === 0)
        || b.end.outcome === 'won' && b.lastShot?.at !== b.end.at || b.end.outcome === 'lost' && b.lastHit?.at !== b.end.at) fail();
      previousTime = b.end.at;
      if (b.rescue !== null && b.end.outcome !== 'lost') fail();
      rescue(b.rescue, b.end.economyAt, e.elapsed);
      if (index < c.battles.length - 1 && b.end.outcome === 'lost' && b.rescue?.completedAt == null) fail();
      if (b.rescue?.completedAt != null) restored += RESCUE_HEALTH;
    } else {
      if (index !== c.battles.length - 1 || b.enemy.health <= 0 || b.damage >= b.startingHealth || b.rescue !== null
        || p.nextSerial !== b.start.travelAction || e.nextAction !== b.start.economyAction || p.expedition!.nextAction !== b.start.lifeAction
        || !p.location || p.location.scale !== 'orbit' || p.location.planetId !== b.planetId || p.leg) fail();
    }
    damage += b.damage;
    const arrival = p.log.find(row => row.serial === b.start.travelAction - 1), departure = p.log.find(row => row.serial === b.start.travelAction);
    if (arrival && (arrival.to !== 'orbit' || arrival.planetId !== b.planetId || arrival.at > b.start.at)) fail();
    const departedAt = departure ? departure.at - 3 : p.nextSerial === b.start.travelAction && p.leg ? p.elapsed - p.leg.elapsed : null;
    if (departure && (departure.from !== 'orbit' || departure.planetId !== b.planetId)) fail();
    if (departedAt !== null && (!b.end || b.end.at > departedAt + 1e-6 || b.end.outcome === 'retreated' && Math.abs(b.end.at - departedAt) > (departure ? 1 / 30 + 1e-6 : 1e-6))) fail();
    if (b.end?.outcome === 'retreated' && b.start.travelAction >= p.nextSerial - p.log.length && departedAt === null) fail();
    if (b.start.travelAction === p.nextSerial && (p.location?.planetId !== b.planetId || p.location.scale !== 'orbit')) fail();
    if (index === c.battles.length - 1 && b.end?.outcome === 'lost' && b.rescue?.completedAt == null) {
      if (p.nextSerial !== b.start.travelAction || p.leg || !p.location || !equal(p.location.pos, b.lastHit!.to)) fail();
    }
  }
  if (!p.ship) { if (c.battles.length || a.battles || c.legacyRescue || c.activated.health !== null || c.activated.repaired) fail(); return; }
  if (!near(p.ship.health, base + e.ledger.healthRestored - c.activated.repaired - damage + restored)) fail();
  const last = latestBattle(p);
  if (!p.ship.health && !(last?.end?.outcome === 'lost' && last.rescue?.completedAt == null)
    && !(c.activated.health === 0 && !c.battles.length && !a.battles && c.legacyRescue?.completedAt == null && !p.location)) fail();
  if (p.ship.health && last?.end?.outcome === 'lost' && last.rescue?.completedAt == null) fail();
}
function rescueForward(now: ShipRescue | null, old: ShipRescue | null, clock: number) {
  if (!old) return !now || now.startedAt >= clock - 1e-6;
  return !!now && now.startedAt === old.startedAt && (old.completedAt === null ? now.completedAt === null || now.completedAt >= clock - 1e-6 : now.completedAt === old.completedAt);
}
/** Summary history proves accounts and known checkpoint prefixes, not a replay
 * of every old position. Retained last pulses additionally prove their range. */
export function combatCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space!, b = cp.space!, now = a.combat, old = b.combat;
  if (!now || !old) return !now && !old;
  const bootstrap = !old.archive.battles && !old.battles.length && !old.legacyRescue && old.activated.cut.at === b.elapsed
    && old.activated.cut.economyAction === b.economy!.nextAction;
  if (!bootstrap && !equal(now.activated, old.activated)) return false;
  if (bootstrap) {
    if (old.activated.health !== null && now.activated.health === null) return false;
    if (Object.keys(old.activated.cut).some(key => now.activated.cut[key as keyof typeof old.activated.cut] < old.activated.cut[key as keyof typeof old.activated.cut])
      || now.activated.economyAt < old.activated.economyAt || now.activated.repaired < old.activated.repaired) return false;
    if (b.ship && now.activated.health !== null && now.activated.health > b.ship.health + now.activated.repaired - b.economy!.ledger.healthRestored + 1e-6) return false;
  }
  if (!rescueForward(now.legacyRescue, old.legacyRescue, b.economy!.elapsed)) return false;
  const dt = a.elapsed - b.elapsed, current = combatTotals(a), prior = combatTotals(b);
  if (['battles', 'victories', 'retreats', 'defeats', 'shots', 'received', 'damage', 'restored'].some(key => (current[key as keyof CombatArchive] ?? 0) + 1e-6 < (prior[key as keyof CombatArchive] ?? 0))) return false;
  const withoutActivation = (value: typeof now) => ({ archive: value.archive, battles: value.battles, legacyRescue: value.legacyRescue });
  if (b.leg && a.nextSerial === b.nextSerial && !equal(withoutActivation(now), withoutActivation(old))) return false;
  const required = { ...old.archive }; let allRemovedClosed = true;
  for (const before of old.battles) {
    const after = now.battles.find(row => row.serial === before.serial);
    if (!after) {
      if (before.serial > now.archive.battles) return false;
      if (before.end) {
        const closed = structuredClone(before);
        if (closed.end!.outcome === 'lost') closed.rescue = { startedAt: 0, completedAt: 0 };
        archiveBattle(required, closed);
      } else { allRemovedClosed = false; required.battles++; required.shots += before.shots; required.received += before.received; required.damage += before.damage; }
      continue;
    }
    if (!equal([before.serial, before.kind, before.war, before.core, before.start, before.economyAt, before.planetId, before.origin, before.startingHealth, before.repaired],
      [after.serial, after.kind, after.war, after.core, after.start, after.economyAt, after.planetId, after.origin, after.startingHealth, after.repaired])) return false;
    if (before.end) {
      if (!equal({ ...before, rescue: null }, { ...after, rescue: null }) || !rescueForward(after.rescue, before.rescue, b.economy!.elapsed)) return false;
    } else {
      if (after.shots < before.shots || after.received < before.received || after.damage < before.damage
        || vecDistance(before.enemy.pos, after.enemy.pos) > enemyProfile(before.kind).speed * dt + 1e-6 || after.end && after.end.at < b.elapsed) return false;
      for (const own of [true, false]) {
        const count = own ? 'shots' : 'received', last = own ? 'lastShot' : 'lastHit', interval = own ? SPACE_PULSE.interval : enemyProfile(before.kind).interval;
        const delta = after[count] - before[count], earliest = Math.max(b.elapsed, (before[last]?.at ?? before.start.at - (own ? interval : 0)) + interval);
        if (!delta) { if (!equal(after[last], before[last])) return false; continue; }
        if (!own && dt === 0 || a.elapsed + 1e-7 < earliest || delta > 1 + Math.floor((a.elapsed - earliest + 1e-7) / interval)
          || !after[last] || after[last]!.at < earliest - 1e-7) return false;
        if (b.location) {
          const shipPos = own ? after[last]!.from : after[last]!.to;
          if (vecDistance(shipPos, b.location.pos) > shipCapabilities(a)!.speed * 1.6 * (after[last]!.at - b.elapsed) + 1e-6) return false;
        }
      }
      if (after.rescue && after.rescue.startedAt < b.economy!.elapsed - 1e-6) return false;
    }
  }
  for (const key of Object.keys(required) as (keyof CombatArchive)[]) {
    if ((now.archive[key] ?? 0) + 1e-6 < (required[key] ?? 0)) return false;
    if (allRemovedClosed && now.archive.battles === required.battles && !near(now.archive[key] ?? 0, required[key] ?? 0)) return false;
  }
  const oldNext = old.archive.battles + old.battles.length + 1;
  if (now.archive.battles + now.battles.length < oldNext - 1) return false;
  for (const row of now.battles.filter(row => row.serial >= oldNext)) if (row.start.at < b.elapsed || row.start.tick < cp.tick || row.economyAt < b.economy!.elapsed
    || row.start.travelAction < b.nextSerial || row.start.economyAction < b.economy!.nextAction || row.start.lifeAction < b.expedition!.nextAction) return false;
  // Only a player's deliberate pulse may happen in zero simulation time.
  if (dt === 0 && current.received !== prior.received) return false;
  const inProgress = activeSpaceBattle(b);
  if (dt === 0 && !inProgress && current.shots - prior.shots > 1) return false;
  return true;
}
