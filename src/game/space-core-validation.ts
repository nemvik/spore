import type { GameState } from './types';
import type { SpaceBattle } from './space-combat-types';
import type { CoreAction, CoreBattleProof } from './space-core-types';
import type { DiscoveryStamp } from './space-discoveries-types';
import { appendCoreAction, coreProgress, CORE_BOUNDARY, CORE_FRONTIER, CORE_ROOT_ENERGY } from './space-core-content';
import { coreBattleProof } from './space-core';
import { combatTotals, SPACE_PULSE, WARDEN } from './space-combat-content';
import { climateMatchesWork } from './space-climate';
import { planetSystem, starSystems } from './galaxy';
import { societyProgress } from './space-discoveries-content';
import { validateEmpireCut } from './space-empires-validation';
import { shipCapabilities } from './space-outfit-content';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
function fail(): never { throw new Error('Neplatná uložená cesta k jádru nebo planetární odměna.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
const before = (a: DiscoveryStamp, b: DiscoveryStamp) => a.economyAt <= b.economyAt + 1e-6 && a.warAction <= b.warAction
  && Object.keys(a.cut).every(k => a.cut[k as keyof typeof a.cut] <= b.cut[k as keyof typeof b.cut] + 1e-6);
const nowStamp = (s: GameState): DiscoveryStamp => ({ economyAt: s.space!.economy!.elapsed, warAction: s.space!.wars!.nextAction,
  cut: { at: s.space!.elapsed, tick: s.tick, travelAction: s.space!.nextSerial, lifeAction: s.space!.expedition!.nextAction, economyAction: s.space!.economy!.nextAction } });
function stamp(v: DiscoveryStamp, s: GameState, prior: DiscoveryStamp): void {
  validateEmpireCut(v.cut, s, prior.cut); number(v.economyAt, prior.economyAt, s.space!.economy!.elapsed + 1e-6, false); number(v.warAction, prior.warAction, s.space!.wars!.nextAction);
  if (!before(prior, v) || !before(v, nowStamp(s)) || v.cut.at - prior.cut.at > v.economyAt - prior.economyAt + 1e-6) fail();
  for (const row of s.space!.wars!.actions) if (row.serial < v.warAction ? !before({ ...row, warAction: row.serial }, v) : !before(v, { ...row, warAction: row.serial })) fail();
}
function local(s: GameState, id: string, cut: DiscoveryStamp['cut'], scale: 'surface' | 'orbit'): void {
  const p = s.space!;
  if (scale === 'surface' && !p.expedition!.worlds.some(w => w.id === id)) fail();
  const arrival = p.log.find(r => r.serial === cut.travelAction - 1), departure = p.log.find(r => r.serial === cut.travelAction);
  if (arrival && (arrival.planetId !== id || arrival.to !== scale)) fail();
  if (departure && (departure.planetId !== id || departure.from !== scale || cut.at > departure.at - 3 + 1e-6)) fail();
  if (cut.travelAction === p.nextSerial && (p.location?.planetId !== id || p.location.scale !== scale || p.leg && cut.at > p.elapsed - p.leg.elapsed + 1e-6)) fail();
}
export function validateCoreBattle(s: GameState, battle: SpaceBattle): void {
  if (battle.kind !== 'warden') return;
  const p = s.space!, core = p.core, progress = coreProgress(core);
  if (!core || !progress.contact || p.combat?.version !== 3 || battle.planetId !== starSystems(p.homePlanetId)[CORE_FRONTIER].planetId) fail();
  object(battle.core, ['contactSerial']);
  if (battle.core.contactSerial !== progress.contact.serial || battle.serial < core.activated.nextCombatSerial
    || progress.contact.economyAt > battle.economyAt || progress.access && progress.access.cut.at <= battle.start.at) fail();
  validateEmpireCut(battle.start, s, progress.contact.cut);
}
function victory(s: GameState, b: CoreBattleProof, action: Extract<CoreAction, { kind: 'access'; strategy: 'force' }>): void {
  const p = s.space!, core = p.core!, c = p.combat!, contact = coreProgress(core).contact;
  if (!contact) fail();
  object(b, ['battleSerial', 'planetId', 'start', 'economyAt', 'endedAt', 'endedEconomyAt', 'startingHealth', 'health', 'shots', 'received', 'damage']);
  number(b.battleSerial, core.activated.nextCombatSerial, c.archive.battles + c.battles.length);
  validateEmpireCut(b.start, s, contact.cut); number(b.economyAt, contact.economyAt, action.economyAt, false);
  number(b.startingHealth, Number.MIN_VALUE, shipCapabilities(p)!.health, false); number(b.health, Number.MIN_VALUE, b.startingHealth, false);
  number(b.received, 0, Math.ceil(b.startingHealth / WARDEN.damage) - 1); number(b.damage, 0, b.startingHealth, false);
  const shots = WARDEN.health / SPACE_PULSE.damage;
  if (b.planetId !== action.planetId || b.shots !== shots || b.damage !== b.received * WARDEN.damage || !near(b.health, b.startingHealth - b.damage)
    || b.endedAt !== action.cut.at || b.endedEconomyAt !== action.economyAt || b.endedAt < b.start.at + (shots - 1) * SPACE_PULSE.interval - 1e-6
    || b.endedAt < b.start.at + b.received * WARDEN.interval - 1e-6 || !near(b.endedAt - b.start.at, b.endedEconomyAt - b.economyAt)
    || b.start.travelAction !== action.cut.travelAction || b.start.economyAction !== action.cut.economyAction || b.start.lifeAction !== action.cut.lifeAction) fail();
  const retained = c.battles.find(r => r.serial === b.battleSerial);
  if (retained ? retained.kind !== 'warden' || retained.end?.outcome !== 'won' || !equal(coreBattleProof(retained), b) : b.battleSerial > c.archive.battles || !c.archive.wardenVictories) fail();
}
export function validateSpaceCore(s: GameState): void {
  const p = s.space!, core = p.core;
  if (!Object.hasOwn(p, 'core')) { if (p.combat?.version === 3) fail(); return; }
  object(core, ['version', 'activated', 'legacyWorlds', 'actions', 'nextAction']);
  if (core.version !== 1 || !p.discoveries || p.combat?.version !== 3 || p.expedition?.version !== 2 || p.expedition.biosphere.version !== 2) fail();
  object(core.activated, ['cut', 'economyAt', 'warAction', 'nextCombatSerial']); stamp(core.activated, s, p.discoveries.activated);
  number(core.activated.nextCombatSerial, 1, p.combat.archive.battles + p.combat.battles.length + 1);
  if (!Array.isArray(core.legacyWorlds) || core.legacyWorlds.length > 8 || !equal(core.legacyWorlds, [...new Set(core.legacyWorlds)].sort())
    || core.legacyWorlds.some(id => typeof id !== 'string' || (planetSystem(p.homePlanetId, id)?.index ?? 0) < CORE_BOUNDARY)) fail();
  if (!Array.isArray(core.actions) || core.actions.length > 34 || core.nextAction !== core.actions.length + 1 || !p.ship && core.actions.length) fail();
  const replay = { ...structuredClone(core), actions: [] as CoreAction[], nextAction: 1 }; let prior: DiscoveryStamp = core.activated;
  for (const [index, action] of core.actions.entries()) {
    const extra = action?.kind === 'access' ? action.strategy === 'diplomacy' ? ['strategy', 'supportSerial'] : action.strategy === 'force' ? ['strategy', 'battle'] : null
      : action?.kind === 'root' ? ['localAt', 'before', 'work', 'energyPaid'] : ['contact', 'encounter'].includes(action?.kind) ? [] : null;
    if (!extra) fail(); object(action, ['serial', 'planetId', 'kind', 'cut', 'economyAt', 'warAction', ...extra]);
    if (action.serial !== index + 1 || action.cut.tick < p.ship!.purchase.tick) fail(); stamp(action, s, prior); prior = action;
    local(s, action.planetId, action.cut, action.kind === 'contact' || action.kind === 'access' ? 'orbit' : 'surface');
    if (action.kind === 'access') {
      if (action.strategy === 'force') victory(s, action.battle, action);
      else {
        const support = societyProgress(p.discoveries).supported;
        if (!support || support.serial !== action.supportSerial || !before(support, action)) fail();
      }
    } else if (action.kind === 'root') {
      const world = p.expedition.worlds.find(w => w.id === action.planetId)!;
      object(action.before, ['temperature', 'atmosphere']); number(action.before.temperature, -1, 1, false); number(action.before.atmosphere, -1, 1, false);
      object(action.work, ['warm', 'cool', 'thicken', 'thin', 'temperatureDrift', 'atmosphereDrift']);
      number(action.localAt, 0, world.elapsed, false);
      if (action.energyPaid !== CORE_ROOT_ENERGY || !equal(action.work, world.biosphere.work) || !climateMatchesWork(action.before, world.biosphere.initial, action.work)
        || !near(world.temperature, 0) || !near(world.atmosphere, 0) || p.expedition.biosphere.toolPlanetId === world.id) fail();
    }
    appendCoreAction(replay, p.homePlanetId, action);
  }
  const progress = coreProgress(core), wins = combatTotals(p).wardenVictories ?? 0;
  if (wins !== (progress.access?.strategy === 'force' ? 1 : 0)) fail();
  for (const b of p.combat.battles) validateCoreBattle(s, b);
}
export function coreCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space!, b = cp.space!, now = a.core, old = b.core;
  if (!now || !old) return !now && !old;
  const bootstrap = !old.actions.length && old.activated.cut.at === b.elapsed && old.activated.cut.travelAction === b.nextSerial;
  if (!bootstrap && !equal(now.activated, old.activated) || !before(old.activated, now.activated)
    || old.activated.nextCombatSerial > now.activated.nextCombatSerial || !equal(now.legacyWorlds, old.legacyWorlds)) return false;
  if (!old.actions.every((row, i) => equal(row, now.actions[i]))) return false;
  const cut = nowStamp(cp);
  for (const row of now.actions.slice(old.actions.length)) {
    if (!before(cut, row)) return false;
    if (row.kind === 'root' && row.localAt < (b.expedition!.worlds.find(w => w.id === row.planetId)?.elapsed ?? 0)) return false;
  }
  return true;
}
