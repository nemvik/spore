import type { Vec3 } from './types';

export const SHIP_PARTS = {
  hull: { name: 'Obal', cost: 8, mass: 2 },
  engine: { name: 'Ionový pohon', cost: 16, mass: 1.4 },
  fin: { name: 'Solární ploutev', cost: 6, mass: .4 },
  cargo: { name: 'Nákladní komora', cost: 12, mass: 1.8 },
  scanner: { name: 'Živý skener', cost: 10, mass: .6 },
} as const;
export type ShipPartKind = keyof typeof SHIP_PARTS;
export interface ShipPart { id: string; kind: ShipPartKind; position: Vec3; scale: Vec3; yaw: number; }
export interface ShipBlueprint { version: 1; name: string; color: string; parts: ShipPart[]; }
export const SHIP_PART_LIMIT = 24;
const finite = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const keys = (v: unknown, fields: string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
export function validateShipBlueprint(value: unknown): asserts value is ShipBlueprint {
  const fail = (text: string): never => { throw new Error(text); };
  if (!keys(value, ['version', 'name', 'color', 'parts']) || value.version !== 1) fail('Neplatný formát konstrukce lodi.');
  const v = value as unknown as ShipBlueprint;
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 40 || /[\u0000-\u001f\u007f]/.test(v.name)) fail('Jméno lodi musí mít 1–40 znaků bez řídicích znaků.');
  if (typeof v.color !== 'string' || !/^#[0-9a-f]{6}$/.test(v.color)) fail('Neplatná barva lodi.');
  if (!Array.isArray(v.parts) || v.parts.length < 1 || v.parts.length > SHIP_PART_LIMIT) fail('Loď smí mít 1–24 dílů kolem pevné kabiny.');
  const ids = new Set<string>();
  for (const p of v.parts) {
    if (!keys(p, ['id', 'kind', 'position', 'scale', 'yaw']) || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(p.id) || ids.has(p.id)) fail('Neplatná nebo opakovaná identita dílu.');
    ids.add(p.id);
    if (typeof p.kind !== 'string' || !Object.hasOwn(SHIP_PARTS, p.kind)) fail('Neznámý lodní díl.');
    if (!keys(p.position, ['x', 'y', 'z']) || !keys(p.scale, ['x', 'y', 'z'])) fail('Neplatná poloha či rozměry dílu.');
    for (const axis of ['x', 'y', 'z'] as const) {
      if (!finite(p.position[axis], -3, 3) || !finite(p.scale[axis], .3, 2.5)) fail('Poloha dílu je −3 až 3, rozměr 0,3 až 2,5.');
    }
    if (!finite(p.yaw, -180, 180)) fail('Otočení je −180 až 180 stupňů.');
  }
  if (!v.parts.some(p => p.kind === 'engine')) fail('Loď potřebuje alespoň jeden pohon.');
}
export function initialShip(): ShipBlueprint {
  const part = (id: string, kind: ShipPartKind, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): ShipPart => ({ id, kind, position: { x, y, z }, scale: { x: sx, y: sy, z: sz }, yaw: 0 });
  return { version: 1, name: 'Semeno hvězd', color: '#69c9bb', parts: [
    part('hull', 'hull', 0, 0, 0, 1.2, .8, 1.8), part('engine', 'engine', 0, 0, 1.7),
    part('left', 'fin', -1.6, 0, .4), part('right', 'fin', 1.6, 0, .4),
    part('cargo', 'cargo', 0, -.7, .3), part('scanner', 'scanner', 0, .7, -.6, .7, .7, .7),
  ] };
}
/** The same geometric volumes price and move both editor and paid runtime snapshots. */
export function shipStats(b: ShipBlueprint) {
  let mass = 3, thrust = 0, hull = 0, cargo = 4, solar = 1, scan = 8, cost = 40;
  for (const p of b.parts) {
    const volume = p.scale.x * p.scale.y * p.scale.z;
    mass += SHIP_PARTS[p.kind].mass * volume; cost += SHIP_PARTS[p.kind].cost * volume;
    if (p.kind === 'engine') thrust += 12 * volume;
    if (p.kind === 'hull') hull += 18 * volume;
    if (p.kind === 'cargo') cargo += 4 * volume;
    if (p.kind === 'fin') solar += .7 * volume;
    if (p.kind === 'scanner') scan += 10 * volume;
  }
  return { cost: Math.ceil(cost), mass, speed: 5 + Math.min(18, thrust / mass * 9), health: Math.round(70 + hull), energy: Math.round(80 + mass * 2), cargo: Math.floor(cargo), solar, scan };
}
