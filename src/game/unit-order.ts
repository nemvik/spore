import type { Vec3 } from './types';

/** Shared by the tribe and fleet; presentation selection is deliberately absent. */
export type UnitTarget =
  | { kind: 'point'; pos: Vec3 }
  | { kind: 'food' | 'creature' | 'hut' | 'neighbour' | 'region' | 'spring'; id: number };
export interface UnitOrder {
  unit: number;
  kind: 'move' | 'gather' | 'attack' | 'socialize' | 'build';
  target: UnitTarget;
}
export const MAX_UNIT_ORDERS = 12;
export const orderedIds = (ids: readonly number[]): number[] => [...new Set(ids)].sort((a, b) => a - b);
export function validOrderShape(order: UnitOrder): boolean {
  if (!Number.isSafeInteger(order.unit) || order.unit < 1) return false;
  if (order.target.kind === 'point') return order.kind === 'move' &&
    [order.target.pos?.x,order.target.pos?.y,order.target.pos?.z].every(Number.isFinite) &&
    Math.abs(order.target.pos.x) <= 76 && Math.abs(order.target.pos.z) <= 76;
  if (!Number.isSafeInteger(order.target.id) || order.target.id < 1) return false;
  return order.kind === 'gather' ? order.target.kind === 'food' || order.target.kind === 'spring' :
    order.kind === 'build' ? order.target.kind === 'hut' || order.target.kind === 'region' :
    order.kind === 'socialize' ? order.target.kind === 'neighbour' || order.target.kind === 'region' :
    order.kind === 'attack' && ['creature', 'neighbour', 'region'].includes(order.target.kind);
}
