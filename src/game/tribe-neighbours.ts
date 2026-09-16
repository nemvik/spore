import type { ActiveTribeState, TribeNeighbour, TribeUnit } from './era-types';
import type { GameState } from './types';
import { clamp, horizontalDistance } from './random';
import { TRIBE_COPY } from './tribe-copy.cs';

export const neighbourGift = (n: TribeNeighbour) => n.identity === 'garden' ? 8 : n.identity === 'terrace' ? 12 : 16;
export const neighbourMaxHealth = (n: Pick<TribeNeighbour, 'identity'>) => n.identity === 'garden' ? 160 : n.identity === 'terrace' ? 220 : 180;

export function meetNeighbour(tribe: ActiveTribeState, unit: TribeUnit, neighbour: TribeNeighbour, kind: 'attack' | 'socialize', dt: number): string | null {
  if (neighbour.resolved) return null;
  if (kind === 'attack') {
    unit.intent = 'hunt';
    if (unit.cooldown > 0) return null;
    neighbour.alarm = 12;
    neighbour.relation = Math.max(-100, neighbour.relation - 8);
    neighbour.health = Math.max(0, neighbour.health - (unit.tool === 'spear' ? 18 : 5));
    unit.cooldown = unit.tool === 'spear' ? 1.15 : 1.5;
    if (neighbour.health === 0) {
      neighbour.resolved = 'conquered'; neighbour.alarm = 0; tribe.food += 12;
      return TRIBE_COPY.conquest(TRIBE_COPY.neighbours[neighbour.identity].name);
    }
  } else {
    unit.intent = 'socialize';
    if (neighbour.tribute < neighbourGift(neighbour)) {
      if (tribe.food < neighbourGift(neighbour)) return null;
      tribe.food -= neighbourGift(neighbour); neighbour.tribute = neighbourGift(neighbour);
    }
    // A drummer must be physically present. Unarmed visitors can still make
    // peace, while a waterskin reduces the danger of an interrupted audience.
    neighbour.relation = clamp(neighbour.relation + dt * (unit.tool === 'drum' ? 3.2 : .45) * (neighbour.identity === 'sanctuary' ? 1.2 : 1), -100, 100);
    if (unit.tool === 'waterskin') neighbour.alarm = Math.max(0, neighbour.alarm - dt * 3);
    if (neighbour.relation >= 100) {
      neighbour.resolved = 'allied'; neighbour.alarm = 0; tribe.food += 8;
      return TRIBE_COPY.alliance(TRIBE_COPY.neighbours[neighbour.identity].name);
    }
  }
  return null;
}

/** Retaliation is local and visible; a peaceful unprovoked visitor is safe. */
export function stepNeighbours(s: GameState, tribe: ActiveTribeState, dt: number): void {
  for (const neighbour of [...tribe.neighbours].sort((a, b) => a.id - b.id)) {
    neighbour.cooldown = Math.max(0, neighbour.cooldown - dt);
    neighbour.alarm = Math.max(0, neighbour.alarm - dt);
    if (neighbour.resolved === 'allied' && neighbour.identity === 'garden') {
      for (const resource of s.world.resources) if (resource.kind !== 'meat' && horizontalDistance(resource.pos, neighbour.pos) < 20) resource.amount = Math.min(resource.max, resource.amount + dt * .035);
    }
    if (neighbour.resolved) continue;
    if (neighbour.identity === 'garden' && neighbour.alarm === 0) neighbour.health = Math.min(neighbourMaxHealth(neighbour), neighbour.health + dt * .6);
    if (neighbour.alarm <= 0 || neighbour.cooldown > 0) continue;
    const target = [...tribe.members].filter(u => u.health > 0 && horizontalDistance(u.pos, neighbour.pos) < (neighbour.identity === 'terrace' ? 11 : 7))
      .sort((a, b) => horizontalDistance(a.pos, neighbour.pos) - horizontalDistance(b.pos, neighbour.pos) || a.id - b.id)[0];
    if (!target) continue;
    const guarded = tribe.legacyAbility === 'predator' && tribe.abilityTime > 0;
    const shield = tribe.members.some(u => u.health > 0 && u.benefit === 'shield' && u.hunger < 70 && horizontalDistance(u.pos, target.pos) < 9);
    target.health = Math.max(0, target.health - (neighbour.identity === 'terrace' ? 13 : 9) * (guarded ? .45 : 1) * (shield ? .65 : 1));
    neighbour.cooldown = 1.5;
  }
}
