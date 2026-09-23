import { worldSpecies } from './npc-genome';
import type { AdaptationId, GameState, Genome, Vec3 } from './types';
import { getAdaptation } from './adaptation-catalog';
import { groundHeight, horizontalDistance } from './random';
import { lineBlocked } from './interactions';
import { steerToward } from './navigation';
import { resolveObstacleMotion } from './obstacle-geometry';

export const DISCOVERY_PARTS = ['arms', 'antenna', 'spines', 'toxin', 'recycler'] as const;
export type DiscoveryPart = typeof DISCOVERY_PARTS[number];
export type DiscoverySource = 'inherited' | 'remains' | 'friend' | 'victory' | 'alpha';
export interface PartDiscovery { part: DiscoveryPart; source: DiscoverySource; origin: string; generation: number; tick: number; usedGeneration: number | null }
export interface CreatureDiscovery {
  version: 1;
  parts: PartDiscovery[];
  remains: { id: string; part: DiscoveryPart; pos: Vec3; collected: boolean }[];
  alpha: { id: number; resolved: boolean } | null;
  birth: { generation: number; tick: number; nest: Vec3 } | null;
  migration: { site: string; pos: Vec3; heading: number } | null;
  migrations: { site: string; from: Vec3; to: Vec3; generation: number; tick: number }[];
  socialAssists: number;
}
export const emptyCreatureDiscovery = (): CreatureDiscovery => ({ version: 1, parts: [], remains: [], alpha: null, birth: null, migration: null, migrations: [], socialAssists: 0 });
export const discoveryState = (s: GameState) => s.stage === 2 ? s.creatureStage?.discovery : undefined;
const isDiscoveryPart = (part: AdaptationId): part is DiscoveryPart => (DISCOVERY_PARTS as readonly string[]).includes(part);
export const partDiscovered = (s: GameState, part: AdaptationId) => !discoveryState(s) || !isDiscoveryPart(part) || !!discoveryState(s)!.parts.some(p => p.part === part);
export const isAlpha = (s: GameState, id: number) => discoveryState(s)?.alpha?.id === id;
export const socialGoal = (s: GameState, id: number) => isAlpha(s, id) ? 9 : 6;
const home = (s: GameState) => s.world.landmarks.find(l => l.kind === 'nest')!;
const alive = (s: GameState) => s.player.health > 0 && !s.deathReason;
function notice(s: GameState, text: string) {
  s.messages.push({ id: Math.max(s.tick, s.messages.at(-1)?.id ?? 0) + 1, text, time: s.world.time });
  if (s.messages.length > 6) s.messages.shift();
}
export function discoverPart(s: GameState, part: DiscoveryPart, source: DiscoverySource, origin: string): boolean {
  const d = discoveryState(s); if (!d || d.parts.some(p => p.part === part)) return false;
  d.parts.push({ part, source, origin, generation: s.player.generation, tick: s.tick, usedGeneration: source === 'inherited' ? s.player.generation : null });
  if (source !== 'inherited') notice(s, `Nová část: ${getAdaptation(part).name} · ${origin}. Vrať se do hnízda a použij ji v další generaci (Tab). DNA platí konstrukci, objev zůstává.`);
  return true;
}
export function initializeDiscovery(s: GameState, clearPosition: (s: GameState, x: number, z: number) => Vec3) {
  const d = discoveryState(s); if (!d || d.remains.length) return;
  for (const part of DISCOVERY_PARTS) if (s.player.genome.parts.some(p => p.kind === part) || s.lineage.some(l => l.parts.includes(part))) discoverPart(s, part, 'inherited', 'Dědictví předchozích generací');
  d.remains = [
    { id: 'west', part: 'arms', pos: clearPosition(s, -24, -13), collected: false },
    { id: 'south', part: 'recycler', pos: clearPosition(s, 15, 39), collected: false },
    { id: 'east', part: 'toxin', pos: clearPosition(s, 47, -28), collected: false },
  ];
  const id = s.creatureStage!.nests.find(n => n.species === 'crest')!.residents[0];
  d.alpha = { id, resolved: false };
  const c = s.world.creatures.find(c => c.id === id)!; c.health = 96;
}
export function discoveryDescription(s: GameState, part: AdaptationId): string | null {
  const d = discoveryState(s); if (!d || !isDiscoveryPart(part)) return null;
  const found = d.parts.find(p => p.part === part);
  if (found) return `${found.usedGeneration === null ? 'Nové · ' : ''}${found.origin} · generace ${found.generation}`;
  const hints: Record<DiscoveryPart, string> = { arms: 'Objev: západní kosterní pozůstatky', antenna: 'Objev: setkání se zvonkonoši', spines: 'Objev: setkání se žrouty pramenů', toxin: 'Objev: východní pozůstatky nebo alfa', recycler: 'Objev: jižní kosterní pozůstatky' };
  return hints[part];
}
export function inspectRemains(s: GameState, id: string): boolean {
  const d = discoveryState(s), site = d?.remains.find(r => r.id === id);
  if (!site || site.collected || !alive(s) || s.creatureStage?.encounter || s.creatureStage?.attack) return false;
  if (horizontalDistance(s.player.pos, site.pos) > 5 || lineBlocked(s, s.player.pos, { ...site.pos, y: site.pos.y + 1 })) { notice(s, 'Pozůstatky prozkoumáš zblízka (5 m) s volným výhledem.'); return false; }
  site.collected = true;
  if (!discoverPart(s, site.part, 'remains', `Kosterní pozůstatky · ${id === 'west' ? 'západ' : id === 'south' ? 'jih' : 'východ'}`)) notice(s, 'Pozůstatky prozkoumány. Tuto část už znáš; místo může sloužit novému hnízdu.');
  return true;
}
export function rewardSpeciesDiscovery(s: GameState, species: string, outcome: 'friend' | 'predator') {
  const part: Record<string, DiscoveryPart> = { bell: 'antenna', gnaw: 'spines', gloom: 'recycler', crest: 'toxin' };
  if (part[species]) discoverPart(s, part[species], outcome === 'friend' ? 'friend' : 'victory', `${outcome === 'friend' ? 'Přátelství' : 'Vítězství'} · ${worldSpecies(s.world,species).name}`);
}
export function resolveAlpha(s: GameState, id: number) {
  const d = discoveryState(s); if (!d?.alpha || d.alpha.id !== id || d.alpha.resolved) return;
  d.alpha.resolved = true; discoverPart(s, 'toxin', 'alpha', 'Významné setkání s alfou korunoplazů');
}
export function reproductionProblem(s: GameState): string | null {
  const d = discoveryState(s); if (!d) return null;
  if (!alive(s)) return 'Nová generace potřebuje živého rodiče.';
  if (d.migration) return 'Nejdřív doveď vlastní druh do nového hnízda nebo migraci zruš.';
  if (s.creatureStage!.encounter || s.creatureStage!.attack || s.creatureStage!.guards.length) return 'Nejdřív dokonči setkání a vrať se do bezpečí.';
  if (s.player.energy < 25) return 'Reprodukce potřebuje alespoň 25 energie. Nakrm se a vrať se do hnízda.';
  return null;
}
export function recordDiscoveryBirth(s: GameState, genome: Genome) {
  const d = discoveryState(s); if (!d) return;
  d.birth = { generation: s.player.generation, tick: s.tick, nest: { ...home(s).pos } };
  for (const p of d.parts) if (p.usedGeneration === null && genome.parts.some(g => g.kind === p.part)) p.usedGeneration = s.player.generation;
}
export function migrationProblem(s: GameState, id: string): string | null {
  const d = discoveryState(s), site = d?.remains.find(r => r.id === id);
  if (!d || !site?.collected) return 'Nejdřív prozkoumej pozůstatky na cílovém místě.';
  if (!alive(s) || d.migration || s.creatureStage!.encounter || s.creatureStage!.attack || s.creatureStage!.guards.length) return 'Migraci zahaj v klidu s živým rodičem.';
  if (!d.birth) return 'Nejdřív vychovej novou generaci v editoru.';
  if (horizontalDistance(s.player.pos, home(s).pos) >= 11) return 'Migrace začíná ve vlastním hnízdě.';
  if (horizontalDistance(home(s).pos, site.pos) < 20 || d.migrations.some(m => m.site === id)) return 'Vyber nové vzdálené místo pro hnízdo.';
  return null;
}
export function startNestMigration(s: GameState, id: string): boolean {
  const problem = migrationProblem(s, id); if (problem) { notice(s, problem); return false; }
  discoveryState(s)!.migration = { site: id, pos: { ...home(s).pos }, heading: Math.atan2(Math.sin(s.player.heading), Math.cos(s.player.heading)) };
  notice(s, 'Rodina jde za tebou. Doveď ji k prozkoumaným pozůstatkům; při velkém odstupu čeká.'); return true;
}
export function cancelNestMigration(s: GameState): boolean {
  const d = discoveryState(s); if (!d?.migration) return false;
  d.migration = null; notice(s, 'Rodina se vrací do původního hnízda.'); return true;
}
export function stepNestMigration(s: GameState, dt: number) {
  const m = discoveryState(s)?.migration; if (!m || !alive(s) || dt <= 0) return;
  const gap = horizontalDistance(m.pos, s.player.pos); if (gap < 2 || gap > 18) return;
  const target = steerToward(s.world, m.pos, s.player.pos, 1.5, m.heading), distance = horizontalDistance(m.pos, target); if (!distance) return;
  const move = Math.min(distance, 4 * dt, gap - 2);
  m.heading = Math.atan2(target.x - m.pos.x, target.z - m.pos.z);
  m.pos = resolveObstacleMotion(s.world, m.pos, { x: m.pos.x + (target.x - m.pos.x) / distance * move, y: m.pos.y, z: m.pos.z + (target.z - m.pos.z) / distance * move }, 1.5);
  m.pos.y = groundHeight(m.pos.x, m.pos.z, 2);
}
export function settleNestMigration(s: GameState): boolean {
  const d = discoveryState(s), m = d?.migration, site = m && d!.remains.find(r => r.id === m.site);
  if (!d || !m || !site || !alive(s) || s.creatureStage!.encounter || s.creatureStage!.attack || s.creatureStage!.guards.length) return false;
  if (horizontalDistance(s.player.pos, site.pos) > 7 || horizontalDistance(m.pos, site.pos) > 8) { notice(s, 'Na nové místo musí dorazit i rodina. Drž se do 18 m od ní.'); return false; }
  const nest = home(s), from = { ...nest.pos }; nest.pos = { ...site.pos };
  d.migrations.push({ site: site.id, from, to: { ...site.pos }, generation: s.player.generation, tick: s.tick }); d.migration = null;
  s.lineage.push({ generation: s.player.generation, stage: 2, time: s.tick / 60, name: s.player.genome.name, parts: s.player.genome.parts.map(p => p.kind), event: 'Vlastní druh založil nové hnízdo' });
  notice(s, 'Nové hnízdo je domovem stejného druhu. Tady odpočíváš a vychováš další generaci (Tab).'); return true;
}
