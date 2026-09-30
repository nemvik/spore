import { validateSpaceCore, coreCheckpointMatches } from './space-core-validation';
import { coreEntryProblem, coreEnergySpent } from './space-core-content';
import { validateSpaceEvents, eventsCheckpointMatches } from './space-events-validation';
import { validateSpaceDiscoveries, discoveriesCheckpointMatches } from './space-discoveries-validation';
import { wormholeProof, WORMHOLE_PRICE } from './space-discoveries-content';
import { validateSpaceWars, warCheckpointMatches } from './space-war-validation';
import { validateSpaceCombat, combatCheckpointMatches } from './space-combat-validation';
import { combatTotals, combatEnergySpent } from './space-combat-content';
import { validateSpaceExpansion, expansionCheckpointMatches } from './space-expansion-validation';
import { shipCapabilities } from './space-outfit-content';
import { validateSpaceOutfit, outfitCheckpointMatches } from './space-outfit-validation';
import { validateSpaceEconomy, economyCheckpointMatches } from './space-economy-validation';
import { validateSpaceEmpires, empiresCheckpointMatches } from './space-empires-validation';
import type { GameState } from './types';
import type { SpacePosition, SpaceScale, SpaceState } from './space-types';
import { validateShipCreation } from './ship-library';
import { shipStats } from './ship-design';
import { jumpEnergy, planetSystem, systemDistance } from './galaxy';
import { validateExpedition, expeditionCheckpointMatches, expeditionEnergySince } from './space-expedition-validation';
function fail(): never { throw new Error('Neplatný uložený vesmírný stav.'); }
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail();
}
function number(value: unknown, min: number, max: number, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) fail();
}
const scales: SpaceScale[] = ['surface', 'orbit', 'system'];
function position(v: SpacePosition, p: SpaceState) {
  object(v, ['scale', 'systemId', 'planetId', 'pos', 'heading']);
  const address = planetSystem(p.homePlanetId, v.planetId);
  if (!scales.includes(v.scale) || !address || address.id !== v.systemId || !p.expedition && v.planetId !== p.homePlanetId) fail();
  object(v.pos, ['x', 'y', 'z']); number(v.pos.x, -80, 80); number(v.pos.z, -80, 80);
  number(v.pos.y, v.scale === 'surface' ? 2 : -40, v.scale === 'surface' ? 26 : 40); number(v.heading, -Math.PI, Math.PI);
}
export function validateSpace(s: GameState): void {
  if (!Object.hasOwn(s, 'space')) return;
  const p = s.space!;
  object(p, ['version', 'homePlanetId', 'elapsed', 'ship', 'location', 'leg', 'log', 'nextSerial', 'notice', ...(Object.hasOwn(p ?? {}, 'expedition') ? ['expedition'] : []), ...(Object.hasOwn(p ?? {}, 'economy') ? ['economy'] : []), ...(Object.hasOwn(p ?? {}, 'empires') ? ['empires'] : []), ...(Object.hasOwn(p ?? {}, 'outfit') ? ['outfit'] : []), ...(Object.hasOwn(p ?? {}, 'expansion') ? ['expansion'] : []), ...(Object.hasOwn(p ?? {}, 'combat') ? ['combat'] : []), ...(Object.hasOwn(p ?? {}, 'wars') ? ['wars'] : []), ...(Object.hasOwn(p ?? {}, 'events') ? ['events'] : []), ...(Object.hasOwn(p ?? {}, 'discoveries') ? ['discoveries'] : []), ...(Object.hasOwn(p ?? {}, 'core') ? ['core'] : [])]);
  if (p.version !== 1 || !s.homePlanet || p.homePlanetId !== s.homePlanet.id) fail();
  number(p.elapsed, 0, 1e12); number(p.nextSerial, 1, Number.MAX_SAFE_INTEGER, true);
  if (typeof p.notice !== 'string' || p.notice.length > 500 || /[\u0000-\u001f\u007f]/.test(p.notice)) fail();
  if (!Array.isArray(p.log) || p.log.length !== Math.min(128, p.nextSerial - 1)) fail();
  validateSpaceWars(s); validateSpaceEvents(s); validateSpaceDiscoveries(s); validateSpaceCore(s); validateSpaceOutfit(s); validateSpaceExpansion(s);
  let lastTime = 0;
  for (const [i, row] of p.log.entries()) {
    const jumped = !!p.expedition && row?.from === 'system' && row?.to === 'system';
    object(row, ['serial', 'at', 'from', 'to', 'planetId', ...(jumped ? ['fromPlanetId', ...(Object.hasOwn(row, 'passage') ? ['passage'] : [])] : [])]); number(row.serial, 1, p.nextSerial - 1, true); number(row.at, lastTime, p.elapsed); lastTime = row.at;
    const target = planetSystem(p.homePlanetId, row.planetId);
    if (row.serial !== p.nextSerial - p.log.length + i || !target || !p.expedition && row.planetId !== p.homePlanetId || !['dock', ...scales].includes(row.from) || !['dock', ...scales].includes(row.to)) fail();
    if (jumped) {
      const origin = typeof row.fromPlanetId === 'string' ? planetSystem(p.homePlanetId, row.fromPlanetId) : null;
      if (!origin || origin.id === target.id) fail();
      if (p.core && row.serial >= p.core.activated.cut.travelAction && coreEntryProblem(p.core, p.homePlanetId, target.planetId, row.at - 6, row.serial)) fail();
      if (Object.hasOwn(row, 'passage')) {
        object(row.passage, ['kind', 'relicSerial']);
        if (!wormholeProof(p, origin.planetId, target.planetId, row.passage, row.serial, row.at - 6)) fail();
      } else if (systemDistance(origin, target) > (shipCapabilities(p, { travelAction: row.serial })?.jumpRange ?? 18)) fail();
    } else if (Math.abs(['dock', ...scales].indexOf(row.from) - ['dock', ...scales].indexOf(row.to)) !== 1) fail();
    if ((row.from === 'dock' || row.to === 'dock') && row.planetId !== p.homePlanetId) fail();
    if (row.serial === 1 && row.from !== 'dock' || i && p.log[i - 1].to !== row.from) fail();
    if (i && p.log[i - 1].planetId !== (jumped ? row.fromPlanetId : row.planetId)) fail();
  }
  if (p.nextSerial !== 1 && !p.log.length || p.log.length && p.log.at(-1)!.to !== (p.location?.scale ?? 'dock')) fail();
  if (p.log.length && p.log.at(-1)!.planetId !== (p.location?.planetId ?? p.homePlanetId)) fail();
  if (p.ship === null) { if (p.location !== null || p.leg !== null || p.log.length || p.nextSerial !== 1 || p.elapsed !== 0) fail(); validateExpedition(p); validateSpaceEmpires(s); validateSpaceEconomy(s); validateSpaceCombat(s); return; }
  if (s.stage !== 5 || s.planet?.version !== 2 || s.machines?.version !== 2 || s.civilization?.entry === 'required' && !s.civilization.completed) fail();
  const ship = p.ship;
  object(ship, ['id', 'creation', 'health', 'energy', 'purchase']); validateShipCreation(ship.creation);
  if (ship.id !== `${p.homePlanetId}:ship-1`) fail();
  const stats = shipStats(ship.creation.blueprint);
  number(ship.health, 0, stats.health); number(ship.energy, 0, stats.energy);
  const receipt = ship.purchase; object(receipt, ['tick', 'before', 'paid', 'after']);
  number(receipt.tick, 0, s.tick, true); number(receipt.before, 0, 1e9); number(receipt.after, 0, 1e9); number(receipt.paid, 0, 1e9, true);
  if (receipt.paid !== stats.cost || Math.abs(receipt.before - receipt.paid - receipt.after) > 1e-8) fail();
  validateExpedition(p); validateSpaceEmpires(s); validateSpaceEconomy(s); validateSpaceCombat(s);
  if (p.location === null) { if (p.leg !== null) fail(); return; }
  position(p.location, p);
  if (!p.log.length || ship.health <= 0 && !p.combat || s.deathReason || s.player.health <= 0 || s.planet.toolOn) fail();
  const home = s.homePlanet;
  if (home.version === 3 && (home.navigation.mode !== 'local' || home.navigation.fields.some(f => f.id === home.currentLocationId))) fail();
  if (s.military?.deployment || s.maritime?.journeys.some(j => j.phase === 'outbound' || j.phase === 'returning') || s.commerce?.contracts.some(c => c.deliveries.some(d => d.phase !== 'returned'))) fail();
  if (p.leg !== null) {
    const leg = p.leg; object(leg, ['from', 'to', 'elapsed', 'duration', 'energyPaid', ...(Object.hasOwn(leg, 'passage') ? ['passage'] : [])]); position(leg.from, p); position(leg.to, p);
    const delta = scales.indexOf(leg.to.scale) - scales.indexOf(leg.from.scale);
    const jumped = !!p.expedition && leg.from.scale === 'system' && leg.to.scale === 'system' && leg.from.systemId !== leg.to.systemId;
    if (JSON.stringify(leg.from) !== JSON.stringify(p.location)) fail();
    if (jumped) {
      const from = planetSystem(p.homePlanetId, leg.from.planetId)!, to = planetSystem(p.homePlanetId, leg.to.planetId)!;
      if (leg.duration !== 6 || Math.hypot(leg.from.pos.x, leg.from.pos.z) > 24 || leg.to.heading !== 0) fail();
      if (coreEntryProblem(p.core, p.homePlanetId, to.planetId, p.elapsed - leg.elapsed, p.nextSerial)) fail();
      if (Object.hasOwn(leg, 'passage')) {
        object(leg.passage, ['kind', 'relicSerial']);
        if (leg.energyPaid !== WORMHOLE_PRICE || !wormholeProof(p, from.planetId, to.planetId, leg.passage, p.nextSerial, p.elapsed - leg.elapsed)) fail();
      } else if (leg.energyPaid !== jumpEnergy(from, to) || systemDistance(from, to) > shipCapabilities(p)!.jumpRange) fail();
    } else if (Object.hasOwn(leg, 'passage') || Math.abs(delta) !== 1 || leg.from.planetId !== leg.to.planetId || leg.duration !== 3 || leg.energyPaid !== (delta === 1 ? 4 : 0)) fail();
    number(leg.elapsed, 0, leg.duration); if (leg.elapsed === leg.duration) fail();
    if (leg.to.pos.x !== 0 || leg.to.pos.z !== 0 || leg.to.pos.y !== (leg.to.scale === 'surface' ? 7 : 0)) fail();
    if (delta === 1 && leg.from.scale === 'surface' && leg.from.pos.y < 20 || delta === -1 && Math.hypot(leg.from.pos.x, leg.from.pos.z) > 16) fail();
  }
}
export function spaceCheckpointMatches(s: GameState, cp: GameState): boolean {
  const a = s.space, b = cp.space;
  if (!a || !b) return !a && !b;
  if (a.homePlanetId !== b.homePlanetId || b.elapsed > a.elapsed || b.nextSerial > a.nextSerial) return false;
  if (!expeditionCheckpointMatches(a, b) || !empiresCheckpointMatches(s, cp) || !economyCheckpointMatches(s, cp) || !outfitCheckpointMatches(s, cp) || !expansionCheckpointMatches(s, cp) || !combatCheckpointMatches(s, cp) || !warCheckpointMatches(s, cp) || !eventsCheckpointMatches(s, cp) || !discoveriesCheckpointMatches(s, cp) || !coreCheckpointMatches(s, cp)) return false;
  if (b.ship && (!a.ship || JSON.stringify([a.ship.id, a.ship.creation, a.ship.purchase]) !== JSON.stringify([b.ship.id, b.ship.creation, b.ship.purchase]))) return false;
  if (!b.log.every(row => { const current = a.log.find(r => r.serial === row.serial); return current ? JSON.stringify(current) === JSON.stringify(row) : row.serial < a.nextSerial - a.log.length; })) return false;
  const since = a.log.filter(row => row.serial >= b.nextSerial);
  if (b.location && a.location && since.length === a.nextSerial - b.nextSerial && !since.some(row => row.to === 'dock')) {
    // A checkpoint already in flight gives a complete baseline. Only the space
    // branch and storage/checkpoint identity may change until an actual landing.
    const home = (v: GameState) => Object.fromEntries(Object.entries(v).filter(([key]) => !['space', 'checkpoint', 'id'].includes(key)));
    if (JSON.stringify(home(s)) !== JSON.stringify(home(cp))) return false;
    if (a.elapsed === b.elapsed && a.nextSerial === b.nextSerial) {
      const extraPaid = expeditionEnergySince(a, b); if (extraPaid === null) return false;
      const battlePaid = combatEnergySpent(a) - combatEnergySpent(b);
      const rootPaid = coreEnergySpent(a.core) - coreEnergySpent(b.core);
      const charged = (a.economy?.ledger.energyRestored ?? 0) - (b.economy?.ledger.energyRestored ?? 0);
      const repaired = (a.economy?.ledger.healthRestored ?? 0) - (b.economy?.ledger.healthRestored ?? 0);
      if (a.economy && Math.abs(a.ship!.health - b.ship!.health - repaired + combatTotals(a).damage - combatTotals(b).damage - combatTotals(a).restored + combatTotals(b).restored) > 1e-6) return false;
      if (JSON.stringify(a.leg) === JSON.stringify(b.leg)) { if (Math.abs(a.ship!.energy - (b.ship!.energy - extraPaid - battlePaid - rootPaid + charged)) > 1e-8) return false; }
      else if (b.leg === null && a.leg !== null && a.leg.elapsed === 0) { if (Math.abs(a.ship!.energy - (b.ship!.energy - a.leg.energyPaid - extraPaid - battlePaid - rootPaid + charged)) > 1e-8) return false; }
      else return false;
    }
  }
  return true;
}
