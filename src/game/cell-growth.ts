import type { Creature, GameState, Resource, Vec3 } from './types';
import type { PartDiscovery } from './creature-discovery';
import { discoverPart } from './creature-discovery';
import { attachmentAngles, attachmentPoint, speciesCollisionRadius } from './anatomy';
import { worldSpecies } from './npc-genome';
import { distance, horizontalDistance } from './random';
import { lineBlocked } from './interactions';

export const CELL_PARTS = ['spines', 'antenna', 'toxin'] as const;
export const CELL_THRESHOLDS = [0, 3, 8, 15] as const;
export const CELL_SCALES = [.65, .9, 1.25, 1.7] as const;
export type CellContactKind = 'mouth' | 'spines' | 'shell' | 'hurt' | 'toxin' | 'growth';
export interface CellGrowth {
  version: 1;
  nutrition: number;
  parts: PartDiscovery[];
  sites: { part: typeof CELL_PARTS[number]; pos: Vec3; collected: boolean }[];
  contact: { kind: CellContactKind; pos: Vec3; tick: number } | null;
}
export const activeCell = (s: GameState) => s.stage === 0 ? s.cellGrowth : undefined;
export const cellTier = (s: GameState) => activeCell(s) ? CELL_THRESHOLDS.filter(n => s.cellGrowth!.nutrition >= n).length - 1 : 0;
export const cellScale = (s: GameState) => activeCell(s) ? CELL_SCALES[cellTier(s)] : 1;
export const cellCameraZoom = (s: GameState, zoom: number) => activeCell(s) ? zoom * (.82 + cellTier(s) * .16) : zoom;
export function cellFoodTier(r: Resource): number {
  return r.kind === 'mineral' || r.kind === 'meat' ? 1 : r.kind === 'nectar' || r.max >= 7 ? 2 : 0;
}
export const cellFoodScale = (s: GameState, r: Resource) => activeCell(s) ? [ .65, 1.1, 1.65 ][cellFoodTier(r)] : 1;
export const cellCanEat = (s: GameState, r: Resource) => !activeCell(s) || cellTier(s) >= cellFoodTier(r);
export const cellCanHunt = (s: GameState, c: Creature) => !activeCell(s) || cellScale(s) >= worldSpecies(s.world, c.species).size * 1.6;
export function cellNotice(s: GameState, text: string) {
  s.messages.push({ id: Math.max(s.tick, s.messages.at(-1)?.id ?? 0) + 1, text, time: s.world.time });
  if (s.messages.length > 6) s.messages.shift();
}
export function cellContact(s: GameState, kind: CellContactKind, pos: Vec3) {
  if (activeCell(s)) s.cellGrowth!.contact = { kind, pos: { ...pos }, tick: s.tick };
}
export function initializeCell(s: GameState) {
  // Keep sites outside existing stones without changing seeded ecology or IDs.
  const clear = (x: number, z: number) => {
    for (let ring = 0; ring < 24; ring++) for (let i = 0; i < 12; i++) {
      const p = { x: x + Math.cos(i * Math.PI / 6) * ring, y: 1.1, z: z + Math.sin(i * Math.PI / 6) * ring };
      if (s.world.obstacles.every(o => horizontalDistance(p, o.pos) > o.radius + 5)) return p;
    }
    return { x: 0, y: 1.1, z: 0 }; // Guaranteed clear nursery.
  };
  s.cellGrowth = { version: 1, nutrition: 0, parts: [], contact: null, sites: CELL_PARTS.map((part, i) => ({ part, pos: clear(...([[8, -9], [-12, -18], [18, -25]][i] as [number, number])), collected: false })) };
}
export function recordCellMeal(s: GameState) {
  const cell = activeCell(s); if (!cell || cell.nutrition >= 15) return;
  const before = cellTier(s); cell.nutrition++;
  if (cellTier(s) > before) {
    s.player.dna += 10; s.player.totalDna += 10;
    cellContact(s, 'growth', s.player.pos);
    cellNotice(s, `Růst ${cellTier(s)} / 3 · tělo zesílilo! +10 DNA. ${cellTier(s) === 3 ? 'Jehloúst je teď menší kořist pro čelist.' : 'Zvládneš větší sousta.'} Prozkoumej zářící schránku ✧ klávesou T.`);
  }
}
export function cellSiteTarget(s: GameState) {
  const cell = activeCell(s); if (!cell) return null;
  return cell.sites.filter(site => !site.collected).map(site => ({ ...site, distance: horizontalDistance(s.player.pos, site.pos), requiredTier: CELL_PARTS.indexOf(site.part) + 1 })).sort((a,b) => a.distance-b.distance)[0] ?? null;
}
export function inspectCellSite(s: GameState): boolean {
  const site = cellSiteTarget(s); if (!site || site.distance > 5) return false;
  if (s.player.health <= 0 || s.deathReason || s.player.cooldown > 0) return true;
  if (lineBlocked(s, s.player.pos, site.pos)) { cellNotice(s, 'Schránku zakrývá kámen. Připlav z druhé strany.'); return true; }
  if (cellTier(s) < site.requiredTier) { cellNotice(s, `Pevná schránka · nejdřív vyrůst na stupeň ${site.requiredTier}. Jez menší sousta.`); return true; }
  s.cellGrowth!.sites.find(p => p.part === site.part)!.collected = true;
  discoverPart(s, site.part, 'cell', `Buněčná schránka · růst ${site.requiredTier}`);
  s.player.dna += 8; s.player.totalDna += 8; s.player.cooldown = .4;
  return true;
}
/** Use local organ geometry; an unrelated mouth or the opposite flank cannot sting. */
export function cellSpineContact(s: GameState, c: Creature): boolean {
  if (!activeCell(s) || lineBlocked(s, s.player.pos, c.pos)) return false;
  const g = s.player.genome, scale = cellScale(s), radius = speciesCollisionRadius(worldSpecies(s.world,c.species));
  return g.parts.filter(p => p.kind === 'spines').some(p => attachmentAngles(p).some(angle => {
    const base = attachmentPoint(p.axial, angle, g);
    // The four rendered horns project along the rotated local +Y normal.
    const local = { x: (base.x + Math.sin(angle) * .4 * p.scale) * scale, y: (base.y + Math.cos(angle) * .4 * p.scale) * scale, z: (base.z - .14 * p.scale) * scale };
    const a = s.player.heading, pos = { x: s.player.pos.x + local.x * Math.cos(a) + local.z * Math.sin(a), y: s.player.pos.y + local.y, z: s.player.pos.z - local.x * Math.sin(a) + local.z * Math.cos(a) };
    return distance(pos,c.pos) <= radius + .65 * p.scale * scale && !lineBlocked(s,pos,c.pos);
  }));
}
export function stepCellContacts(s: GameState, kill: (c: Creature, byPlayer: boolean) => void) {
  if (!activeCell(s)) return;
  for (const c of [...s.world.creatures]) if (c.health > 0 && c.fear <= 0 && cellSpineContact(s,c)) {
    c.health -= 8 * cellScale(s); c.fear = 2; c.target = null;
    cellContact(s,'spines',c.pos); cellNotice(s,'Kontakt ostnů · odražení a zranění. Ústa mají vlastní dosah.');
    if (c.health <= 0) kill(c,true);
  }
}
