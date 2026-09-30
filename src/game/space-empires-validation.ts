import { validateWarReceipt } from './space-war-validation';
import type { GameState } from './types';
import type { EmpireAction, EmpireCut, EmpireWitness, SpaceEmpire } from './space-empires-types';
import type { SpaceEconomyAction } from './space-economy-types';
import { allocateEmpires, EMPIRE_IDS, EMPIRE_PROFILES, empireSurveyTarget } from './space-empires-content';
import { empireAffinity, spaceInheritance } from './space-inheritance';
import { lifeIdentity } from './space-ecology-history';
import { missionProgress, missionTarget } from './space-empires';
import { planetSystem } from './galaxy';
import { spaceMarketPrice } from './space-products';
import { territoryTitle } from './space-expansion-content';
import { shipCapabilities } from './space-outfit-content';

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function fail(): never { throw new Error('Neplatné uložené říše, zakázky nebo obchodní dohody.'); }
function object(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(key => !Object.hasOwn(v, key))) fail();
}
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER, integer = true): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || integer && !Number.isSafeInteger(v)) fail();
}
export function validateEmpireCut(v: EmpireCut, s: GameState, before?: EmpireCut): void {
  object(v, ['at', 'tick', 'travelAction', 'lifeAction', 'economyAction']);
  const p = s.space!;
  number(v.at, before?.at ?? 0, p.elapsed, false); number(v.tick, before?.tick ?? 0, s.tick);
  number(v.travelAction, before?.travelAction ?? 1, p.nextSerial);
  number(v.lifeAction, before?.lifeAction ?? 1, p.expedition!.nextAction);
  number(v.economyAction, before?.economyAction ?? 1, p.economy!.nextAction);
  for (const [rows, serial] of [[p.log, v.travelAction], [p.expedition!.actions, v.lifeAction]] as const) {
    const left = rows.find(row => row.serial === serial - 1), right = rows.find(row => row.serial === serial);
    if (left && left.at > v.at || right && right.at < v.at) fail();
  }
  const left = p.economy!.actions.find(row => row.serial === v.economyAction - 1), right = p.economy!.actions.find(row => row.serial === v.economyAction);
  if (left && (left.spaceAt > v.at || left.tick > v.tick) || right && (right.spaceAt < v.at || right.tick < v.tick)) fail();
}
function retained(receipt: { serial: number }, rows: { serial: number }[], next: number): void {
  const matching = rows.find(row => row.serial === receipt.serial);
  if (matching ? !equal(matching, receipt) : receipt.serial >= next - rows.length) fail();
}

/** Called for every sale, including permanent mission witnesses. The old fixed
 * price branch is unchanged; new receipts bind to the treaty before their cut. */
export function validateSpaceSalePrice(s: GameState, row: Extract<SpaceEconomyAction, { kind: 'sell' }>): void {
  const p = s.space!, economy = p.economy!, base = spaceMarketPrice(p.homePlanetId, row.planetId, row.product);
  if (base === null) fail();
  if (economy.version === 1 || row.serial < economy.pricingActivatedAction!) {
    if (Object.hasOwn(row, 'priceBasis') || row.unitPrice !== base) fail(); return;
  }
  const basis = row.priceBasis;
  object(basis, ['version', 'base', 'empireId', 'treatySerial', 'relationRevision', 'bonus']);
  const registry = p.empires; if (!registry) fail();
  const empire = registry.entries.find(empire => empire.capitalId === row.planetId);
  const treaty = registry.actions.find(action => action.kind === 'treaty' && action.empireId === empire?.id && action.cut.economyAction <= row.serial);
  const bonus = treaty ? empireAffinity(registry.inheritance, empire!.id) ? 2 : 1 : 0;
  if (basis.version !== 1 || basis.base !== base || basis.empireId !== (empire?.id ?? null)
    || basis.treatySerial !== (treaty?.serial ?? null) || basis.relationRevision !== (treaty ? empire!.mission!.completed : null)
    || basis.bonus !== bonus || row.unitPrice !== base + bonus) fail();
  if (treaty && (row.spaceAt < treaty.cut.at || row.tick < treaty.cut.tick || row.lifeAction < treaty.cut.lifeAction)) fail();
}
function witness(s: GameState, empire: SpaceEmpire, proof: EmpireWitness, accepted: EmpireAction, completed?: EmpireAction): void {
  const p = s.space!, economy = p.economy!, life = p.expedition!, mission = empire.mission!;
  object(proof, ['kind', 'receipt', ...(mission.kind === 'ecology' ? ['role'] : [])]);
  if (proof.kind !== mission.kind) fail();
  const r = proof.receipt;
  if (!r || r.planetId !== mission.targetPlanetId) fail();
  const ceiling = completed?.cut;
  if (proof.kind === 'trade') {
    const row = proof.receipt;
    object(row, ['serial', 'at', 'tick', 'spaceAt', 'lifeAction', 'planetId', 'balanceBefore', 'balanceAfter', 'kind', 'originPlanetId', 'product', 'amount', 'unitPrice', 'earned', ...(Object.hasOwn(row, 'priceBasis') ? ['priceBasis'] : []), ...(Object.hasOwn(row, 'warAction') ? ['warAction'] : [])]);
    validateWarReceipt(s, row);
    if (row.kind !== 'sell' || row.originPlanetId === row.planetId || !economy.colonies.some(colony => colony.planetId === row.originPlanetId && colony.product === row.product)) fail();
    number(row.serial, accepted.cut.economyAction, (ceiling?.economyAction ?? economy.nextAction) - 1);
    number(row.at, 0, economy.elapsed, false); number(row.spaceAt, accepted.cut.at, ceiling?.at ?? p.elapsed, false);
    number(row.tick, accepted.cut.tick, ceiling?.tick ?? s.tick); number(row.lifeAction, accepted.cut.lifeAction, ceiling?.lifeAction ?? life.nextAction);
    number(row.balanceBefore); number(row.balanceAfter); number(row.amount, 1, shipCapabilities(p, { economyAction: row.serial, lifeAction: row.lifeAction })!.cargo);
    number(row.earned, 1); if (row.earned !== row.amount * row.unitPrice || row.balanceAfter !== row.balanceBefore + row.earned) fail();
    validateSpaceSalePrice(s, row); retained(row, economy.actions, economy.nextAction);
  } else if (proof.kind === 'ecology') {
    const row = proof.receipt;
    object(row, ['serial', 'at', 'kind', 'planetId', 'lifeId', 'energyPaid']);
    if (row.kind !== 'scan' || row.energyPaid !== 1 || life.version !== 2) fail();
    number(row.serial, accepted.cut.lifeAction, (ceiling?.lifeAction ?? life.nextAction) - 1);
    number(row.at, accepted.cut.at, ceiling?.at ?? p.elapsed, false); number(proof.role, 0, 5);
    if (lifeIdentity(life, row.lifeId)?.role !== proof.role) fail();
    retained(row, life.actions, life.nextAction);
  } else {
    const row = proof.receipt;
    object(row, ['serial', 'at', 'from', 'to', 'planetId']);
    if (row.from !== 'orbit' || row.to !== 'surface') fail();
    number(row.serial, accepted.cut.travelAction, (ceiling?.travelAction ?? p.nextSerial) - 1);
    number(row.at, accepted.cut.at, ceiling?.at ?? p.elapsed, false);
    retained(row, p.log, p.nextSerial);
  }
}
export function validateSpaceEmpires(s: GameState): void {
  const p = s.space!;
  if (!Object.hasOwn(p, 'empires')) { if ((p.economy?.version ?? 1) >= 2) fail(); return; }
  const registry = p.empires!;
  object(registry, ['version', 'activated', 'protectedColonies', 'inheritance', 'entries', 'actions', 'nextAction']);
  if (registry.version !== 1 || !p.economy || p.economy.version < 2 || p.expedition?.version !== 2 || p.expedition.biosphere.version !== 2) fail();
  validateEmpireCut(registry.activated, s);
  if (p.economy.pricingActivatedAction !== registry.activated.economyAction) fail();
  if (!Array.isArray(registry.protectedColonies) || registry.protectedColonies.length > 31
    || !equal(registry.protectedColonies, [...new Set(registry.protectedColonies)].sort())
    || registry.protectedColonies.some(id => typeof id !== 'string' || !planetSystem(p.homePlanetId, id)?.index)) fail();
  if (!Array.isArray(registry.entries) || registry.entries.length !== 3 || !Array.isArray(registry.actions) || registry.actions.length > 12) fail();
  number(registry.nextAction, 1, 13); if (registry.nextAction !== registry.actions.length + 1) fail();
  if (registry.actions.length ? !p.ship || !equal(registry.inheritance, spaceInheritance(s)) : registry.inheritance !== null) fail();
  const expected = allocateEmpires(p.homePlanetId, registry.protectedColonies);
  for (const [index, empire] of registry.entries.entries()) {
    object(empire, ['id', 'capitalId', 'enclave', 'contact', 'mission', 'treaty']);
    if (!equal([empire.id, empire.capitalId, empire.enclave], [expected[index].id, expected[index].capitalId, expected[index].enclave])) fail();
    if (!empire.enclave && p.economy.colonies.some(colony => colony.planetId === empire.capitalId) && !territoryTitle(p, empire.capitalId) && !p.economy.colonies.find(c => c.planetId === empire.capitalId)?.militaryPermission) fail();
    if (empire.mission !== null) {
      object(empire.mission, ['kind', 'targetPlanetId', 'accepted', 'completed', 'evidence']);
      if (!['trade', 'ecology', 'survey'].includes(empire.mission.kind) || !Array.isArray(empire.mission.evidence) || empire.mission.evidence.length > missionTarget(empire.mission.kind)) fail();
    }
  }
  let previous = registry.activated;
  for (const [index, action] of registry.actions.entries()) {
    object(action, ['serial', 'empireId', 'cut', 'kind', ...(action?.kind === 'accept' ? ['missionKind', 'targetPlanetId'] : [])]);
    if (action.serial !== index + 1 || !EMPIRE_IDS.includes(action.empireId)) fail();
    validateEmpireCut(action.cut, s, previous); previous = action.cut;
    const empire = expected.find(empire => empire.id === action.empireId)!;
    const arrival = p.log.find(row => row.serial === action.cut.travelAction - 1);
    if (action.cut.travelAction === 1 || arrival && (arrival.to !== 'surface' || arrival.planetId !== empire.capitalId || arrival.at > action.cut.at)) fail();
    if (action.cut.travelAction === p.nextSerial && (p.location?.scale !== 'surface' || p.location.planetId !== empire.capitalId
      || p.leg && action.cut.at > p.elapsed - p.leg.elapsed + 1e-8)) fail();
    if (action.kind === 'contact') {
      if (empire.contact !== null) fail(); empire.contact = action.serial;
    } else if (action.kind === 'accept') {
      if (empire.contact === null || empire.mission || action.missionKind !== EMPIRE_PROFILES[empire.id].mission && !(empire.id === 'roots' && action.missionKind === 'survey')) fail();
      const target = action.missionKind === 'survey' ? empireSurveyTarget(p.homePlanetId, empire) : empire.capitalId;
      if (action.targetPlanetId !== target) fail();
      empire.mission = { kind: action.missionKind, targetPlanetId: target, accepted: action.serial, completed: null, evidence: [] };
    } else if (action.kind === 'complete') {
      if (!empire.mission || empire.mission.completed !== null) fail(); empire.mission.completed = action.serial;
    } else if (action.kind === 'treaty') {
      if (!empire.mission || empire.mission.completed === null || empire.treaty !== null) fail(); empire.treaty = action.serial;
    } else fail();
  }
  for (const [index, empire] of registry.entries.entries()) {
    const baseline = expected[index];
    const withoutEvidence = (entry: SpaceEmpire) => ({ ...entry, mission: entry.mission ? { ...entry.mission, evidence: [] } : null });
    if (!equal(withoutEvidence(empire), baseline)) fail();
    const mission = empire.mission; if (!mission) continue;
    const accepted = registry.actions[mission.accepted - 1], completed = mission.completed === null ? undefined : registry.actions[mission.completed - 1];
    const ids = new Set<number>(), roles = new Set<number>(); let lastSerial = 0;
    for (const proof of mission.evidence) {
      witness(s, empire, proof, accepted, completed);
      if (ids.has(proof.receipt.serial) || proof.receipt.serial <= lastSerial) fail();
      ids.add(proof.receipt.serial); lastSerial = proof.receipt.serial;
      if (proof.kind === 'ecology') { if (roles.has(proof.role)) fail(); roles.add(proof.role); }
    }
    if (completed && missionProgress(empire) < missionTarget(mission.kind)) fail();
  }
  // Retained and permanent witnesses share one actual historical budget. A
  // rolled receipt is not permission to invent sales or paid scans that the
  // cumulative source accounts say never happened.
  const sales = new Map(p.economy.actions.filter(row => row.kind === 'sell').map(row => [row.serial, row]));
  const scans = new Map(p.expedition.actions.filter(row => row.kind === 'scan').map(row => [row.serial, row]));
  for (const empire of registry.entries) for (const proof of empire.mission?.evidence ?? []) {
    if (proof.kind === 'trade') sales.set(proof.receipt.serial, proof.receipt);
    if (proof.kind === 'ecology') {
      scans.set(proof.receipt.serial, proof.receipt);
      const first = p.expedition.scans.find(scan => scan.lifeId === proof.receipt.lifeId);
      if (first ? first.at > proof.receipt.at : lifeIdentity(p.expedition, proof.receipt.lifeId)?.founder) fail();
    }
  }
  if (sales.size > p.economy.counts.sell) fail();
  for (const origin of new Set([...sales.values()].map(row => row.originPlanetId))) {
    const rows = [...sales.values()].filter(row => row.originPlanetId === origin), total = p.economy.sales.find(row => row.planetId === origin);
    if (!total || rows.reduce((sum, row) => sum + row.amount, 0) > total.amount || rows.reduce((sum, row) => sum + row.earned, 0) > total.earned) fail();
  }
  const earlierScans = p.expedition.scans.filter(first => ![...scans.values()].some(row => row.lifeId === first.lifeId && row.at === first.at)).length;
  if (scans.size + earlierScans > p.expedition.biosphere.paidScans) fail();
}

export function empiresCheckpointMatches(s: GameState, cp: GameState): boolean {
  const now = s.space?.empires, old = cp.space?.empires;
  if (!now || !old) return !now && !old;
  const bootstrap = old.nextAction === 1 && cp.space!.economy!.pricingActivatedAction === cp.space!.economy!.nextAction;
  if (!equal(now.protectedColonies, old.protectedColonies) || now.nextAction < old.nextAction
    || !bootstrap && !equal(now.activated, old.activated) || old.inheritance !== null && !equal(now.inheritance, old.inheritance)) return false;
  if (Object.keys(old.activated).some(key => now.activated[key as keyof EmpireCut] < old.activated[key as keyof EmpireCut])) return false;
  if (!old.actions.every((action, index) => equal(action, now.actions[index]))) return false;
  const cpCut = empireCutForCheckpoint(cp);
  for (const action of now.actions.slice(old.actions.length)) if (Object.keys(cpCut).some(key => action.cut[key as keyof EmpireCut] < cpCut[key as keyof EmpireCut])) return false;
  for (const before of old.entries) {
    const after = now.entries.find(empire => empire.id === before.id);
    if (!after || after.capitalId !== before.capitalId || after.enclave !== before.enclave) return false;
    const oldProofs = before.mission?.evidence ?? [], newProofs = after.mission?.evidence ?? [];
    if (!oldProofs.every((proof, index) => equal(proof, newProofs[index]))) return false;
    for (const proof of newProofs.slice(oldProofs.length)) {
      const minimum = proof.kind === 'trade' ? cpCut.economyAction : proof.kind === 'ecology' ? cpCut.lifeAction : cpCut.travelAction;
      if (proof.receipt.serial < minimum) return false;
    }
  }
  return true;
}
const empireCutForCheckpoint = (s: GameState): EmpireCut => ({ at: s.space!.elapsed, tick: s.tick,
  travelAction: s.space!.nextSerial, lifeAction: s.space!.expedition!.nextAction, economyAction: s.space!.economy!.nextAction });
