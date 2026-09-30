import type { SpaceState } from './space-types';
import type { SpaceBattle, CombatArchive } from './space-combat-types';
import type { Vec3 } from './types';

export const SPACE_PULSE = { range: 24, energy: 3, interval: .65, damage: 12 } as const;
export const PIRATE = { health: 60, speed: 8, standOff: 12, range: 18, interval: 1.8, damage: 8 } as const;
export const WARDEN = { health: 108, speed: 8, standOff: 12, range: 22, interval: 1.4, damage: 12 } as const;
export const enemyProfile = (kind: SpaceBattle['kind']) => kind === 'warden' ? WARDEN : PIRATE;
export const COMBAT_REST = 90;
export const RESCUE_SECONDS = 12;
export const RESCUE_HEALTH = 25;
export const COMBAT_TAIL = 32;
export const MILITARY_RESULTS = ['invasionVictories', 'invasionRetreats', 'invasionDefeats', 'defenseVictories', 'defenseRetreats', 'defenseDefeats'] as const;
export const WARDEN_RESULTS = ['wardenVictories', 'wardenRetreats', 'wardenDefeats'] as const;
export const vecDistance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const pirateOrigin = (origin: Vec3): Vec3 => ({ ...origin, x: origin.x + (origin.x <= 0 ? 22 : -22) });
export const latestBattle = (p: SpaceState) => p.combat?.battles.at(-1) ?? null;
export const activeSpaceBattle = (p: SpaceState) => { const b = latestBattle(p); return b && !b.end ? b : null; };
export const emptyCombatArchive = (): CombatArchive => ({ battles: 0, victories: 0, retreats: 0, defeats: 0, shots: 0, received: 0, damage: 0, restored: 0, endedAt: 0 });
export function archiveBattle(archive: CombatArchive, battle: SpaceBattle): void {
  archive.battles++; archive[battle.end!.outcome === 'won' ? 'victories' : battle.end!.outcome === 'lost' ? 'defeats' : 'retreats']++;
  archive.shots += battle.shots; archive.received += battle.received; archive.damage += battle.damage;
  if (battle.rescue?.completedAt !== null && battle.rescue) archive.restored += RESCUE_HEALTH;
  archive.endedAt = battle.end!.at;
  if (battle.kind !== 'pirate') {
    const key = `${battle.kind}${battle.end!.outcome === 'won' ? 'Victories' : battle.end!.outcome === 'lost' ? 'Defeats' : 'Retreats'}` as typeof MILITARY_RESULTS[number] | typeof WARDEN_RESULTS[number];
    archive[key] = (archive[key] ?? 0) + 1;
  }
}
export function combatTotals(p: SpaceState) {
  const c = p.combat, totals = c ? { ...c.archive } : emptyCombatArchive();
  for (const battle of c?.battles ?? []) {
    if (battle.end) archiveBattle(totals, battle);
    else { totals.shots += battle.shots; totals.received += battle.received; totals.damage += battle.damage; }
  }
  if (c?.legacyRescue?.completedAt != null) totals.restored += RESCUE_HEALTH;
  return totals;
}
export const combatEnergySpent = (p: SpaceState) => combatTotals(p).shots * SPACE_PULSE.energy;
