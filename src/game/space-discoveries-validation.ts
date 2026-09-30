import type { GameState } from './types';
import type { SpaceEconomyAction } from './space-economy-types';
import type { DiscoveryAction, DiscoveryStamp, PatronageReceipt } from './space-discoveries-types';
import { validateEmpireCut } from './space-empires-validation';
import { historicalWarOwner, validateWarReceipt } from './space-war-validation';
import { warStateAt } from './space-war-content';
import { lifeIdentity } from './space-ecology-history';
import { stableBandCapacity } from './space-ecology';
import { colonyExistedAt } from './space-expansion-content';
import { allocateYoungSociety, appendDiscovery, PATRONAGE_PRICE, RELIC_IDS, RELICS, societyProgress } from './space-discoveries-content';
import { planetSystem, starSystems } from './galaxy';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;
function fail(): never { throw new Error('Neplatný uložený průzkum nebo spolupráce.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
function array(v: unknown, max: number): asserts v is unknown[] { if (!Array.isArray(v) || v.length > max) fail(); }
const stampKeys = ['cut', 'economyAt', 'warAction'];
function before(a: DiscoveryStamp, b: DiscoveryStamp): boolean {
  return a.economyAt <= b.economyAt + 1e-6 && a.warAction <= b.warAction
    && Object.keys(a.cut).every(k => a.cut[k as keyof typeof a.cut] <= b.cut[k as keyof typeof b.cut] + 1e-6);
}
const currentStamp = (s: GameState): DiscoveryStamp => ({ economyAt: s.space!.economy!.elapsed, warAction: s.space!.wars!.nextAction,
  cut: { at: s.space!.elapsed, tick: s.tick, travelAction: s.space!.nextSerial, lifeAction: s.space!.expedition!.nextAction, economyAction: s.space!.economy!.nextAction } });
function stamp(v: DiscoveryStamp, s: GameState, previous: DiscoveryStamp): void {
  validateEmpireCut(v.cut, s, previous.cut); number(v.economyAt, previous.economyAt, s.space!.economy!.elapsed + 1e-6, false);
  number(v.warAction, previous.warAction, s.space!.wars!.nextAction);
  if (!before(previous, v) || !before(v, currentStamp(s)) || v.cut.at - previous.cut.at > v.economyAt - previous.economyAt + 1e-6) fail();
  for (const row of s.space!.wars!.actions) {
    if (row.serial < v.warAction ? !before({ ...row, warAction: row.serial }, v) : !before(v, { ...row, warAction: row.serial })) fail();
  }
}
function onSurface(s: GameState, planetId: string, cut: DiscoveryStamp['cut']): void {
  const p = s.space!;
  if (!p.expedition!.worlds.some(w => w.id === planetId)) fail();
  const arrival = p.log.find(row => row.serial === cut.travelAction - 1), departure = p.log.find(row => row.serial === cut.travelAction);
  if (arrival && (arrival.planetId !== planetId || arrival.to !== 'surface')) fail();
  if (departure && (departure.planetId !== planetId || departure.from !== 'surface' || cut.at > departure.at - 3 + 1e-6)) fail();
  if (cut.travelAction === p.nextSerial && (p.location?.scale !== 'surface' || p.location.planetId !== planetId
    || p.leg && cut.at > p.elapsed - p.leg.elapsed + 1e-6)) fail();
}
function retained(receipt: { serial: number }, rows: { serial: number }[], next: number): void {
  const row = rows.find(r => r.serial === receipt.serial);
  if (row ? !equal(receipt, row) : receipt.serial >= next - rows.length) fail();
}
function payment(s: GameState, row: PatronageReceipt, action: Extract<DiscoveryAction, { kind: 'support'; aid: 'patronage' }>): void {
  const p = s.space!, e = p.economy!, d = p.discoveries!;
  object(row, ['kind', 'serial', 'at', 'tick', 'spaceAt', 'lifeAction', 'travelAction', 'warAction', 'planetId', 'balanceBefore', 'balanceAfter', 'paid', 'discoveryAction', 'shipId']);
  number(row.serial, d.activated.cut.economyAction, e.nextAction - 1); number(row.balanceBefore, PATRONAGE_PRICE); number(row.balanceAfter);
  if (row.kind !== 'patronage' || row.paid !== PATRONAGE_PRICE || row.balanceBefore - row.paid !== row.balanceAfter || row.shipId !== p.ship!.id
    || row.discoveryAction !== action.serial || row.planetId !== d.society.planetId || row.serial !== action.cut.economyAction
    || row.at !== action.economyAt || row.spaceAt !== action.cut.at || row.tick !== action.cut.tick
    || row.lifeAction !== action.cut.lifeAction || row.travelAction !== action.cut.travelAction || row.warAction !== action.warAction) fail();
  validateWarReceipt(s, row); retained(row, e.actions, e.nextAction);
  const prior = e.actions.find(r => r.serial === row.serial - 1), next = e.actions.find(r => r.serial === row.serial + 1);
  if (prior && prior.balanceAfter !== row.balanceBefore || next && next.balanceBefore !== row.balanceAfter) fail();
}
export function validateSpaceDiscoveries(s: GameState): void {
  const p = s.space!, d = p.discoveries, e = p.economy;
  if (!Object.hasOwn(p, 'discoveries')) { if ((e?.version ?? 0) >= 7) fail(); return; }
  object(d, ['version', 'activated', 'protectedPlanets', 'society', 'actions', 'nextAction', 'scans']);
  if (d.version !== 1 || e?.version !== 7 || !p.events || !p.empires || p.expedition?.version !== 2 || p.expedition.biosphere.version !== 2) fail();
  object(d.activated, stampKeys); stamp(d.activated, s, p.events.activated);
  array(d.protectedPlanets, 31);
  if (d.protectedPlanets.some(id => typeof id !== 'string' || !planetSystem(p.homePlanetId, id) || id === p.homePlanetId)
    || !equal(d.protectedPlanets, [...new Set(d.protectedPlanets)].sort())) fail();
  const capitals = p.empires.entries.map(entry => entry.capitalId);
  if (capitals.some(id => !d.protectedPlanets.includes(id)) || e.colonies.some(c => colonyExistedAt(p, c, d.activated.cut.economyAction, d.activated.economyAt) && !d.protectedPlanets.includes(c.planetId))) fail();
  object(d.society, ['planetId', 'enclave']);
  if (!equal(d.society, allocateYoungSociety(p.homePlanetId, d.protectedPlanets, capitals))) fail();
  array(d.actions, 6); array(d.scans, 6); number(d.nextAction, 1, 7);
  if (d.nextAction !== d.actions.length + 1 || !p.ship && (d.actions.length || d.scans.length)) fail();
  let previous = d.activated;
  for (const [index, action] of d.actions.entries()) {
    const extra = action?.kind === 'relic' ? ['relicId'] : action?.kind === 'accept' ? ['aid'] : action?.kind === 'support'
      ? ['aid', ...(action.aid === 'patronage' ? ['receipt'] : ['localAt'])] : ['contact', 'share'].includes(action?.kind) ? [] : null;
    if (!extra) fail(); object(action, ['serial', 'planetId', 'kind', ...stampKeys, ...extra]);
    if (action.serial !== index + 1 || action.cut.tick < p.ship!.purchase.tick) fail();
    stamp(action, s, previous); previous = action; onSurface(s, action.planetId, action.cut);
    if (action.kind === 'relic') {
      if (!RELIC_IDS.includes(action.relicId) || action.planetId !== starSystems(p.homePlanetId)[RELICS[action.relicId].index].planetId) fail();
    } else {
      if (action.planetId !== d.society.planetId) fail();
      const political = warStateAt(p, action.warAction);
      if (political) {
        const owner = historicalWarOwner(p, political, action.planetId, action);
        if (owner && owner !== 'player' && (political.relations.some(r => r.empireId === owner && r.active)
          || e.colonies.some(c => c.planetId === action.planetId && colonyExistedAt(p, c, action.cut.economyAction, action.economyAt)))) fail();
      }
    }
    if (action.kind === 'support') {
      if (action.aid === 'patronage') payment(s, action.receipt, action);
      else if (action.aid === 'ecology') {
        const world = p.expedition.worlds.find(w => w.id === action.planetId)!;
        number(action.localAt, 10, world.elapsed, false);
        if (near(world.elapsed, action.localAt) && stableBandCapacity(p.expedition, world) < 1) fail();
      } else fail();
    }
  }
  const progress = societyProgress(d), accepted = progress.accepted;
  if (d.scans.length && (!accepted || accepted.aid !== 'ecology')) fail();
  const roles = new Set<number>(), ids = new Set<number>();
  for (const proof of d.scans) {
    object(proof, ['role', 'receipt']); number(proof.role, 0, 5); const r = proof.receipt;
    object(r, ['serial', 'at', 'kind', 'planetId', 'lifeId', 'energyPaid']);
    number(r.serial, accepted!.cut.lifeAction, (progress.supported?.cut.lifeAction ?? p.expedition.nextAction) - 1);
    number(r.at, accepted!.cut.at, progress.supported?.cut.at ?? p.elapsed, false);
    if (r.kind !== 'scan' || r.energyPaid !== 1 || r.planetId !== d.society.planetId || lifeIdentity(p.expedition, r.lifeId)?.role !== proof.role
      || roles.has(proof.role) || ids.has(r.serial)) fail();
    roles.add(proof.role); ids.add(r.serial); retained(r, p.expedition.actions, p.expedition.nextAction);
  }
  const replay = { ...structuredClone(d), actions: [] as DiscoveryAction[], nextAction: 1 };
  for (const action of d.actions) appendDiscovery(replay, action);
  const patronage = progress.supported?.aid === 'patronage' ? 1 : 0;
  if (e.counts.patronage !== patronage || e.ledger.patronage !== patronage * PATRONAGE_PRICE) fail();
}

/** New receipts carry a permanent historical cooperation, not today's service
 * flag. Ordinary old colony repairs preserve their unchanged contract. */
export function validateDiscoveryReceipt(s: GameState, row: SpaceEconomyAction): void {
  const p = s.space!, d = p.discoveries;
  if (row.kind === 'patronage') {
    const support = d && societyProgress(d).supported;
    if (!support || support.aid !== 'patronage' || !equal(row, support.receipt)) fail(); return;
  }
  if ((row.kind !== 'repair' && row.kind !== 'charge') || !Object.hasOwn(row, 'societyService')) return;
  if (!d || p.economy!.version !== 7) fail();
  const proof = row.societyService; object(proof, ['supportSerial', 'travelAction']);
  const support = societyProgress(d).supported;
  if (!support || proof.supportSerial !== support.serial || row.planetId !== d.society.planetId || row.warAction === undefined) fail();
  const cut = { at: row.spaceAt, tick: row.tick, lifeAction: row.lifeAction, economyAction: row.serial, travelAction: proof.travelAction };
  validateEmpireCut(cut, s, support.cut); onSurface(s, row.planetId, cut);
  if (!before(support, { cut, economyAt: row.at, warAction: row.warAction }) || support.aid === 'patronage' && row.serial <= support.receipt.serial) fail();
}
export function discoveriesCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space!, b = cp.space!, now = a.discoveries, old = b.discoveries;
  if (!now || !old) return !now && !old;
  const bootstrap = old.nextAction === 1 && old.activated.cut.at === b.elapsed && old.activated.cut.economyAction === b.economy!.nextAction;
  if (!bootstrap && !equal(now.activated, old.activated) || !before(old.activated, now.activated)
    || !equal(now.protectedPlanets, old.protectedPlanets) || !equal(now.society, old.society)) return false;
  if (!old.actions.every((row, index) => equal(row, now.actions[index])) || !old.scans.every((row, index) => equal(row, now.scans[index]))) return false;
  const cut = currentStamp(cp);
  if (now.actions.slice(old.actions.length).some(row => !before(cut, row))
    || now.scans.slice(old.scans.length).some(proof => proof.receipt.at < b.elapsed || proof.receipt.serial < b.expedition!.nextAction)) return false;
  return true;
}
