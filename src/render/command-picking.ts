import * as THREE from 'three';
import { groundHeight } from '../game/random';
import type { Vec3, World } from '../game/types';
import { WORLD_BOUND } from '../game/world';

export type CommandUnitRef = { kind: 'member' | 'machine'; id: number };
export type CommandTarget = CommandUnitRef | { kind: 'food' | 'creature' | 'hut' | 'neighbour' | 'neighbour-unit' | 'region' | 'spring'; id: number };
export interface CommandPickVolume { target: CommandTarget; center: Vec3; radius: number; }
export interface ScreenRect { left: number; top: number; right: number; bottom: number; }
export interface ViewportRect { left: number; top: number; width: number; height: number; }

const targetKinds = new Set(['member', 'machine', 'food', 'creature', 'hut', 'neighbour', 'neighbour-unit', 'region', 'spring']);
// Unit orders reserve two metres at the edge of the physical world.
const commandBound = WORLD_BOUND - 2;
const finitePoint = (point: Vec3): boolean => [point.x, point.y, point.z].every(Number.isFinite);
const validViewport = (rect: ViewportRect): boolean =>
  [rect.left, rect.top, rect.width, rect.height, rect.left + rect.width, rect.top + rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
const validVolume = (volume: CommandPickVolume): boolean => finitePoint(volume.center) &&
  Number.isFinite(volume.radius) && volume.radius > 0 && targetKinds.has(volume.target.kind) &&
  Number.isSafeInteger(volume.target.id) && volume.target.id >= 0;
const targetOrder = (a: CommandTarget, b: CommandTarget): number =>
  a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id - b.id;
function validMatrix(matrix: THREE.Matrix4): boolean {
  const determinant = matrix.determinant();
  return matrix.elements.every(Number.isFinite) && Number.isFinite(determinant) && determinant !== 0;
}
function normalizedRay(ray: THREE.Ray): THREE.Ray | null {
  if (!finitePoint(ray.origin) || !finitePoint(ray.direction)) return null;
  const length = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
  if (!Number.isFinite(length) || length === 0) return null;
  return new THREE.Ray(ray.origin.clone(), new THREE.Vector3(ray.direction.x / length, ray.direction.y / length, ray.direction.z / length));
}

/** Camera matrices must describe the last rendered view; no camera state is changed. */
export function commandRay(camera: THREE.Camera, x: number, y: number, viewport: ViewportRect): THREE.Ray | null {
  if (!validViewport(viewport) || !Number.isFinite(x) || !Number.isFinite(y) ||
    x < viewport.left || x > viewport.left + viewport.width || y < viewport.top || y > viewport.top + viewport.height ||
    !validMatrix(camera.matrixWorld) || !validMatrix(camera.projectionMatrixInverse)) return null;
  if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera && !(camera as THREE.OrthographicCamera).isOrthographicCamera) return null;
  const pointer = new THREE.Vector2((x - viewport.left) / viewport.width * 2 - 1, 1 - (y - viewport.top) / viewport.height * 2);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  return normalizedRay(raycaster.ray);
}

/** Supply only currently visible, live targets; geometry contains no game rules. */
export function pickCommandTarget(ray: THREE.Ray, volumes: readonly CommandPickVolume[]): CommandTarget | null {
  const unitRay = normalizedRay(ray);
  if (!unitRay) return null;
  const sphere = new THREE.Sphere(), point = new THREE.Vector3();
  let nearest = Infinity, target: CommandTarget | null = null;
  for (const volume of volumes) {
    if (!validVolume(volume)) continue;
    sphere.center.set(volume.center.x, volume.center.y, volume.center.z); sphere.radius = volume.radius;
    if (!unitRay.intersectSphere(sphere, point)) continue;
    const distance = point.distanceTo(unitRay.origin);
    if (!Number.isFinite(distance)) continue;
    if (distance < nearest || distance === nearest && target && targetOrder(volume.target, target) < 0) {
      nearest = distance; target = volume.target;
    }
  }
  return target ? { ...target } : null;
}

/** Screen coordinates are CSS pixels, including the viewport's page offset. */
export function selectCommandUnits(camera: THREE.Camera, viewport: ViewportRect, rect: ScreenRect, volumes: readonly CommandPickVolume[]): CommandUnitRef[] {
  if (!validViewport(viewport) || ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite) ||
    !validMatrix(camera.matrixWorld) || !validMatrix(camera.projectionMatrix)) return [];
  const left = Math.max(viewport.left, Math.min(rect.left, rect.right));
  const right = Math.min(viewport.left + viewport.width, Math.max(rect.left, rect.right));
  const top = Math.max(viewport.top, Math.min(rect.top, rect.bottom));
  const bottom = Math.min(viewport.top + viewport.height, Math.max(rect.top, rect.bottom));
  if (left > right || top > bottom) return [];
  const view = camera.matrixWorld.clone().invert(), position = new THREE.Vector4();
  const selected = new Map<string, CommandUnitRef>();
  for (const volume of volumes) {
    if (!validVolume(volume) || volume.target.kind !== 'member' && volume.target.kind !== 'machine') continue;
    position.set(volume.center.x, volume.center.y, volume.center.z, 1).applyMatrix4(view);
    if (position.z >= 0) continue;
    position.applyMatrix4(camera.projectionMatrix);
    if (!Number.isFinite(position.w) || position.w <= 0) continue;
    const x = position.x / position.w, y = position.y / position.w, z = position.z / position.w;
    if (![x, y, z].every(Number.isFinite) || x < -1 || x > 1 || y < -1 || y > 1 || z < -1 || z > 1) continue;
    const screenX = viewport.left + (x + 1) * .5 * viewport.width;
    const screenY = viewport.top + (1 - y) * .5 * viewport.height;
    if (screenX >= left && screenX <= right && screenY >= top && screenY <= bottom)
      selected.set(`${volume.target.kind}:${volume.target.id}`, { ...volume.target });
  }
  return [...selected.values()].sort(targetOrder);
}

/** Ground foot position, constrained to the same playable area as move orders. */
export function terrainDestination(ray: THREE.Ray, world: World): Vec3 | null {
  const unitRay = normalizedRay(ray);
  if (!unitRay || unitRay.direction.y >= -1e-6 || ![0, 1, 2].includes(world.stage)) return null;
  // Exact envelopes of groundHeight keep marching bounded even for distant eyes.
  const lower = world.stage === 2 ? -2 : -6.7, upper = world.stage === 2 ? 2 : -5.3;
  let start = 0, end = Infinity;
  for (const [axis, minimum, maximum] of [['x', -WORLD_BOUND, WORLD_BOUND], ['y', lower, upper], ['z', -WORLD_BOUND, WORLD_BOUND]] as const) {
    const origin = unitRay.origin[axis], direction = unitRay.direction[axis];
    if (direction === 0) { if (origin < minimum || origin > maximum) return null; continue; }
    const a = (minimum - origin) / direction, b = (maximum - origin) / direction;
    start = Math.max(start, Math.min(a, b)); end = Math.min(end, Math.max(a, b));
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const point = new THREE.Vector3();
  const heightAboveGround = (distance: number): number => {
    unitRay.at(distance, point);
    return point.y - groundHeight(point.x, point.z, world.stage);
  };
  const destination = (distance: number): Vec3 | null => {
    unitRay.at(distance, point);
    if (!finitePoint(point) || Math.abs(point.x) > commandBound || Math.abs(point.z) > commandBound) return null;
    return { x: point.x, y: groundHeight(point.x, point.z, world.stage), z: point.z };
  };
  const firstHeight = heightAboveGround(start);
  if (firstHeight < 0) return null;
  if (firstHeight === 0) return destination(start);
  let previous = start;
  while (previous < end) {
    const next = Math.min(previous + .5, end);
    // An extreme origin can exceed sub-metre floating-point precision.
    if (next <= previous) return null;
    if (heightAboveGround(next) <= 0) {
      let low = previous, high = next;
      for (let iteration = 0; iteration < 22; iteration++) {
        const middle = (low + high) * .5;
        if (heightAboveGround(middle) > 0) low = middle; else high = middle;
      }
      return destination((low + high) * .5);
    }
    previous = next;
  }
  return null;
}
