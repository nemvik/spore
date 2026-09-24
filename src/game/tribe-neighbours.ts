import { recallExpedition, stepSociety } from './tribe-society';
import type { ActiveTribeState, NeighbourUnit, TribeNeighbour, TribeUnit } from './era-types';
import type { GameState } from './types';
import { clamp } from './random';
import { TRIBE_COPY } from './tribe-copy.cs';
import { cultureEffects } from './culture';

export const neighbourGift = (n: TribeNeighbour) => n.identity === 'garden' ? 8 : n.identity === 'terrace' ? 12 : 16;
export const neighbourMaxHealth = (n: Pick<TribeNeighbour, 'identity'>) => n.identity === 'garden' ? 160 : n.identity === 'terrace' ? 220 : 180;

export function meetNeighbour(tribe: ActiveTribeState, unit: TribeUnit, neighbour: TribeNeighbour, kind: 'attack' | 'socialize', dt: number, inheritance = { social: 1, combat: 1 }): string | null {
  if (neighbour.resolved) return null;
  if (kind === 'attack') {
    unit.intent = 'hunt';
    if (unit.cooldown > 0) return null;
    neighbour.alarm = 12;
    if (neighbour.society) neighbour.society.truce = 0;
    neighbour.relation = Math.max(-100, neighbour.relation - 8);
    neighbour.health = Math.max(0, neighbour.health - (unit.tool === 'spear' ? 18 : 5) * inheritance.combat * cultureEffects(unit.outfit).combat);
    unit.cooldown = unit.tool === 'spear' ? 1.15 : 1.5;
    if (neighbour.health === 0) {
      neighbour.resolved = 'conquered'; neighbour.alarm = 0; tribe.food += 12;
      if (neighbour.society) recallExpedition(neighbour.society);
      return TRIBE_COPY.conquest(TRIBE_COPY.neighbours[neighbour.identity].name);
    }
  } else {
    if (tribe.music?.active?.neighbour === neighbour.id) return null;
    unit.intent = 'socialize';
    if (neighbour.tribute < neighbourGift(neighbour)) {
      if (tribe.food < neighbourGift(neighbour)) return null;
      tribe.food -= neighbourGift(neighbour); neighbour.tribute = neighbourGift(neighbour);
      if (neighbour.society) neighbour.society.food = Math.min(48, neighbour.society.food + neighbourGift(neighbour));
    }
    if (neighbour.society) { neighbour.society.truce = 20; recallExpedition(neighbour.society); neighbour.alarm = 0; }
    // A drummer must be physically present. Unarmed visitors can still make
    // peace, while a waterskin reduces the danger of an interrupted audience.
    neighbour.relation = clamp(neighbour.relation + dt * inheritance.social * cultureEffects(unit.outfit).social * (unit.tool === 'drum' ? 3.2 : .45) * (neighbour.identity === 'sanctuary' ? 1.2 : 1), -100, 100);
    if (unit.tool === 'waterskin') neighbour.alarm = Math.max(0, neighbour.alarm - dt * 3);
    return resolveNeighbourAlliance(tribe, neighbour);
  }
  return null;
}

/** Player strikes share the existing tool cooldown and inherited combat effect. */
export function strikeNeighbourUnit(unit: TribeUnit, n: TribeNeighbour, target: NeighbourUnit, combat = 1): void {
  unit.intent = 'hunt';
  if (n.resolved || unit.cooldown > 0 || target.health <= 0) return;
  n.alarm = 12; n.relation = Math.max(-100, n.relation - 8);
  if (n.society) n.society.truce = 0;
  target.health = Math.max(0,target.health - (unit.tool === 'spear' ? 18 : 5) * combat * cultureEffects(unit.outfit).combat);
  unit.cooldown = unit.tool === 'spear' ? 1.15 : 1.5;
}

export function stepNeighbours(s: GameState, tribe: ActiveTribeState, dt: number): string[] {
  const positions = [...tribe.members, ...tribe.neighbours.flatMap(n=>n.society?.members??[])].filter(u=>u.health>0).sort((a,b)=>a.id-b.id).map(u=>({id:u.id,pos:{...u.pos}}));
  return [...tribe.neighbours].sort((a,b)=>a.id-b.id).flatMap(n=>stepSociety(s,tribe,n,dt,positions));
}

export function resolveNeighbourAlliance(tribe: ActiveTribeState, neighbour: TribeNeighbour): string | null {
  if (neighbour.resolved || neighbour.relation < 100) return null;
  neighbour.resolved = 'allied'; neighbour.alarm = 0; tribe.food += 8;
  if (neighbour.society) recallExpedition(neighbour.society);
  return TRIBE_COPY.alliance(TRIBE_COPY.neighbours[neighbour.identity].name);
}
