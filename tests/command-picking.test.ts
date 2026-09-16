import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { groundHeight } from '../src/game/random';
import { validOrderShape } from '../src/game/unit-order';
import { createWorld } from '../src/game/world';
import { commandRay, pickCommandTarget, selectCommandUnits, terrainDestination } from '../src/render/command-picking';
import type { CommandPickVolume, CommandTarget, ViewportRect } from '../src/render/command-picking';

const viewport = { left: 100, top: 50, width: 800, height: 400 };
function camera() {
  const result = new THREE.PerspectiveCamera(90, 2, 1, 100);
  result.updateMatrixWorld();
  return result;
}
function volume(kind: CommandTarget['kind'], id: number, x = 0, y = 0, z = -10, radius = 1): CommandPickVolume {
  return { target: { kind, id }, center: { x, y, z }, radius };
}
const ray = (origin: number[], direction: number[]) => new THREE.Ray(new THREE.Vector3(...origin), new THREE.Vector3(...direction));

describe('command screen rays', () => {
  it.each<ViewportRect>([viewport, { left: 0, top: 0, width: 1200, height: 800 }, { left: 420, top: 160, width: 300, height: 600 }])('uses CSS viewport offset and size: %j', rect => {
    const view = camera();
    const center = commandRay(view, rect.left + rect.width / 2, rect.top + rect.height / 2, rect)!;
    expect(center.origin.toArray()).toEqual([0, 0, 0]);
    expect(center.direction.toArray()).toEqual([0, 0, -1]);
    const corner = commandRay(view, rect.left, rect.top, rect)!;
    expect(corner.direction.x).toBeLessThan(0);
    expect(corner.direction.y).toBeGreaterThan(0);
    expect(corner.direction.length()).toBeCloseTo(1, 12);
  });

  it('supports orthographic cameras and follows camera orientation', () => {
    const view = new THREE.OrthographicCamera(-10, 10, 5, -5, 1, 100);
    view.position.set(10, 20, 30); view.lookAt(10, 0, 30); view.updateMatrixWorld();
    const center = commandRay(view, 500, 250, viewport)!;
    expect(center.origin.distanceTo(view.position)).toBeLessThan(1e-10);
    expect(center.direction.y).toBeCloseTo(-1, 6);
  });

  it('rejects outside points, invalid viewports and invalid camera matrices', () => {
    const view = camera();
    for (const [x, y] of [[99, 250], [901, 250], [500, 49], [500, 451], [NaN, 250]]) expect(commandRay(view, x, y, viewport)).toBeNull();
    expect(commandRay(view, 500, 250, { ...viewport, width: 0 })).toBeNull();
    expect(commandRay(view, 500, 250, { ...viewport, height: Infinity })).toBeNull();
    view.projectionMatrixInverse.elements[0] = NaN;
    expect(commandRay(view, 500, 250, viewport)).toBeNull();
    expect(commandRay(new THREE.Camera(), 500, 250, viewport)).toBeNull();
  });
});

describe('command sphere picking', () => {
  it('chooses nearest sphere entry, rather than nearest center', () => {
    const volumes = [volume('member', 1, 0, 0, -7), volume('food', 2, 0, 0, -10, 5)];
    expect(pickCommandTarget(ray([0, 0, 0], [0, 0, -4]), volumes)).toEqual({ kind: 'food', id: 2 });
  });

  it('breaks exact ties by kind and id independently of input order', () => {
    const volumes = [volume('member', 3), volume('machine', 9), volume('machine', 2)];
    expect(pickCommandTarget(ray([0, 0, 0], [0, 0, -1]), volumes)).toEqual({ kind: 'machine', id: 2 });
    expect(pickCommandTarget(ray([0, 0, 0], [0, 0, -1]), [...volumes].reverse())).toEqual({ kind: 'machine', id: 2 });
  });

  it('ignores invalid, missed and behind-camera volumes', () => {
    const volumes = [volume('member', 1, NaN), volume('member', 2, 0, 0, -4, -1), volume('member', 3, 0, 0, 10), volume('member', 4, 30), volume('member', Infinity), volume('member', 5, 0, 0, -10, Infinity)];
    expect(pickCommandTarget(ray([0, 0, 0], [0, 0, -1]), volumes)).toBeNull();
    expect(pickCommandTarget(ray([0, 0, 0], [0, 0, 0]), [volume('member', 1)])).toBeNull();
    expect(pickCommandTarget(ray([NaN, 0, 0], [0, 0, -1]), [volume('member', 1)])).toBeNull();
  });

  it('leaves visibility and health filtering to the supplied presentation volumes', () => {
    const visibleLive = [volume('member', 8, 0, 0, -20)];
    const hiddenOrDead = volume('member', 1, 0, 0, -5);
    expect(pickCommandTarget(ray([0, 0, 0], [0, 0, -1]), visibleLive)).toEqual({ kind: 'member', id: 8 });
    expect(pickCommandTarget(ray([0, 0, 0], [0, 0, -1]), [hiddenOrDead, ...visibleLive])).toEqual({ kind: 'member', id: 1 });
  });
});

describe('command rectangle selection', () => {
  it('normalizes reversed rectangles and returns unique units in stable order', () => {
    const volumes = [volume('member', 8), volume('member', 2, 1), volume('machine', 5, -1), volume('member', 8), volume('food', 3), volume('creature', 4)];
    const rect = { left: 550, right: 450, top: 280, bottom: 220 };
    const expected = [{ kind: 'machine', id: 5 }, { kind: 'member', id: 2 }, { kind: 'member', id: 8 }];
    expect(selectCommandUnits(camera(), viewport, rect, volumes)).toEqual(expected);
    expect(selectCommandUnits(camera(), viewport, rect, [...volumes].reverse())).toEqual(expected);
  });

  it('excludes behind-camera, clipped and offscreen centers even with oversized rectangles', () => {
    const volumes = [volume('member', 1, 0, 0, 10), volume('member', 2, 0, 0, -.5), volume('member', 3, 0, 0, -101), volume('member', 4, 25), volume('member', 5, 0, 12), volume('member', 6, 0, 0, -10)];
    expect(selectCommandUnits(camera(), viewport, { left: -1000, top: -1000, right: 3000, bottom: 3000 }, volumes)).toEqual([{ kind: 'member', id: 6 }]);
  });

  it('projects centers in an offset viewport and transformed camera', () => {
    const view = camera(); view.position.set(20, 0, 0); view.lookAt(30, 0, 0); view.updateMatrixWorld();
    const rect = { left: 500, top: 200, width: 200, height: 100 };
    expect(selectCommandUnits(view, rect, { left: 590, right: 610, top: 240, bottom: 260 }, [volume('member', 1, 30, 0, 0), volume('member', 2, 10, 0, 0)])).toEqual([{ kind: 'member', id: 1 }]);
  });

  it('handles orthographic clipping and rejects invalid or nonoverlapping rectangles', () => {
    const view = new THREE.OrthographicCamera(-10, 10, 5, -5, 1, 100); view.updateMatrixWorld();
    const volumes = [volume('member', 1), volume('member', 2, 11), volume('member', 3, 0, 0, 2)];
    const rect = { left: 100, top: 50, right: 900, bottom: 450 };
    expect(selectCommandUnits(view, viewport, rect, volumes)).toEqual([{ kind: 'member', id: 1 }]);
    expect(selectCommandUnits(view, viewport, { ...rect, left: NaN }, volumes)).toEqual([]);
    expect(selectCommandUnits(view, viewport, { ...rect, left: 950, right: 1000 }, volumes)).toEqual([]);
    expect(selectCommandUnits(view, { ...viewport, height: 0 }, rect, volumes)).toEqual([]);
  });
});

describe('command terrain destinations', () => {
  it.each([0, 1, 2] as const)('returns the exact ground foot height for stage %i', stage => {
    const world = createWorld(481516, stage);
    for (const [x, z] of [[0, 0], [-60, 50], [76, -76]]) {
      const destination = terrainDestination(ray([x, 60, z], [0, -3, 0]), world)!;
      expect(destination).toEqual({ x, y: groundHeight(x, z, stage), z });
      expect(validOrderShape({ unit: 1, kind: 'move', target: { kind: 'point', pos: destination } })).toBe(true);
    }
  });

  it('bisects sloped rays accurately, including rays entering from outside the world', () => {
    const world = createWorld(481516, 2);
    for (const [origin, x, z] of [[[15, 50, 60], 20, -35], [[100, 50, 0], 50, 20], [[-90, 40, 50], -30, -20]] as [number[], number, number][]) {
      const target = new THREE.Vector3(x, groundHeight(x, z, 2), z);
      const viewRay = new THREE.Ray(new THREE.Vector3(...origin), target.clone().sub(new THREE.Vector3(...origin)).normalize());
      const destination = terrainDestination(viewRay, world)!;
      expect(new THREE.Vector3(destination.x, destination.y, destination.z).distanceTo(target)).toBeLessThan(1e-5);
      expect(viewRay.distanceToPoint(new THREE.Vector3(destination.x, destination.y, destination.z))).toBeLessThan(1e-6);
    }
  });

  it('rejects horizon, upward, underground, invalid and out-of-bounds destinations', () => {
    const world = createWorld(481516, 2);
    for (const input of [ray([0, 40, 0], [1, 0, 0]), ray([0, 40, 0], [1, -1e-8, 0]), ray([0, 40, 0], [0, 1, 0]), ray([0, -10, 0], [0, -1, 0]), ray([77, 40, 0], [0, -1, 0]), ray([79, 40, 0], [0, -1, 0]), ray([0, 40, 0], [1, -.1, 0]), ray([0, NaN, 0], [0, -1, 0]), ray([0, 40, 0], [0, 0, 0]), ray([0, 1e16, 0], [0, -1, 0])])
      expect(terrainDestination(input, world)).toBeNull();
  });

  it('does not mutate camera, rays, volumes, rectangles or the world', () => {
    const world = createWorld(481516, 2), view = camera(), input = ray([0, 40, 0], [0, -3, 0]);
    const volumes = [volume('member', 1)], rect = { left: 100, top: 50, right: 900, bottom: 450 };
    const snapshot = () => JSON.stringify({ world, camera: view.toJSON(), ray: input, volumes, viewport, rect, matrix: view.matrixWorld.elements });
    const before = snapshot();
    commandRay(view, 500, 250, viewport); pickCommandTarget(input, volumes);
    selectCommandUnits(view, viewport, rect, volumes); terrainDestination(input, world);
    expect(snapshot()).toBe(before);
  });
});
