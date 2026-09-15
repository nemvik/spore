import { describe, expect, it } from 'vitest';
import { compositionCamera, keepCameraOutside, safeCameraPosition, smoothCameraOrbit } from '../src/game/camera';
import { groundHeight, horizontalDistance } from '../src/game/random';
import type { Obstacle, Stage } from '../src/game/types';
import { createWorld } from '../src/game/world';
import { createGame } from '../src/game/simulation';
import { vortexSourceAt } from '../src/game/journey-layout';

function obstacle(id: number, x: number, z: number, height = 12): Obstacle {
  return { id, pos: { x, y: 0, z }, radius: 2, height, kind: 'tree' };
}
function scene(stage: Stage = 2, obstacles: Obstacle[] = []) {
  const world = createWorld(20260913, stage); world.obstacles = obstacles; return world;
}

describe('safe third-person camera positioning', () => {
  it('preserves an unobstructed requested view without mutating its inputs', () => {
    const world = scene(), focus = { x: 0, y: 2, z: 0 }, desired = { x: 10, y: 12, z: 20 };
    const before = JSON.stringify({ world, focus, desired });
    expect(safeCameraPosition(focus, desired, world)).toEqual(desired);
    expect(JSON.stringify({ world, focus, desired })).toBe(before);
  });

  it('pulls the eye in front of an intervening solid tree', () => {
    const tree = obstacle(1, 0, 10);
    const result = safeCameraPosition({ x: 0, y: 2, z: 0 }, { x: 0, y: 9, z: 24 }, scene(2, [tree]));
    expect(result.z).toBeGreaterThan(0);
    expect(result.z).toBeLessThan(tree.pos.z - tree.radius);
    expect(horizontalDistance(result, tree.pos)).toBeGreaterThan(tree.radius);
  });

  it('selects the nearest blocker independently of obstacle order', () => {
    const near = obstacle(1, 0, 8), far = obstacle(2, 0, 16);
    const focus = { x: 0, y: 2, z: 0 }, desired = { x: 0, y: 8, z: 25 };
    const result = safeCameraPosition(focus, desired, scene(2, [far, near]));
    expect(result).toEqual(safeCameraPosition(focus, desired, scene(2, [near, far])));
    expect(result.z).toBeLessThan(near.pos.z - near.radius);
  });

  it('ignores off-axis, behind-focus and below-view obstacles', () => {
    const focus = { x: 0, y: 8, z: 0 }, desired = { x: 0, y: 14, z: 24 };
    const obstacles = [obstacle(1, 8, 10), obstacle(2, 0, -10), obstacle(3, 0, 10, 3)];
    expect(safeCameraPosition(focus, desired, scene(2, obstacles))).toEqual(desired);
  });

  it.each([0, 1, 2] as const)('keeps a downward or zero-length request above terrain in stage%i', stage => {
    const world = scene(stage), focus = { x: 12, y: 1, z: -9 };
    for (const desired of [{ x: 30, y: -20, z: 20 }, { ...focus }]) {
      const result = safeCameraPosition(focus, desired, world);
      expect(Object.values(result).every(Number.isFinite)).toBe(true);
      expect(result.y).toBeGreaterThanOrEqual(groundHeight(result.x, result.z, stage) + 2.2);
      expect(result.y).toBeGreaterThan(focus.y);
    }
  });

  it('escapes a close trunk even when the focus starts inside camera padding', () => {
    const tree = obstacle(1, 0, 1.8, 14);
    const result = safeCameraPosition({ x: 0, y: 2, z: 0 }, { x: 0, y: 8, z: 10 }, scene(2, [tree]));
    const outsideSolid = horizontalDistance(result, tree.pos) >= tree.radius + 0.65 || result.y >= tree.pos.y + tree.height + 0.7;
    expect(outsideSolid).toBe(true);
    expect(Object.values(result).every(Number.isFinite)).toBe(true);
  });
});

describe('overview camera beside authored obstacles', () => {
  it.each([481516, 20260913, 8675309])('preserves user zoom and bearing throughout the vortex and garden for seed %i', seed => {
    const state=createGame(seed,false),world=state.world,before=JSON.stringify(world);
    const garden=state.journey.sites.find(site=>site.id===0)!;
    const positions=[garden.source,...garden.refuges];
    for(let time=0;time<34;time+=2)positions.push(vortexSourceAt(time));
    for(const position of positions)for(const zoom of [13,25,45])for(const yaw of [0,.8,1.6,2.4,3.2,4,4.8,5.6]){
      const focus={...position,y:position.y+.5},camera=compositionCamera(focus,yaw,.55,zoom,world);
      const dx=camera.x-focus.x,dy=camera.y-focus.y,dz=camera.z-focus.z;
      expect(Math.hypot(dx,dy,dz)).toBeGreaterThanOrEqual(zoom-1e-8);
      expect(Math.abs(Math.atan2(Math.sin(Math.atan2(dx,dz)-yaw),Math.cos(Math.atan2(dx,dz)-yaw)))).toBeLessThan(1e-8);
      expect(Object.values(camera).every(Number.isFinite)).toBe(true);
      expect(camera.y).toBeGreaterThanOrEqual(groundHeight(camera.x,camera.z,world.stage)+2.2-1e-8);
      for(const rock of world.obstacles)if(horizontalDistance(camera,rock.pos)<rock.radius+.75)
        expect(camera.y).toBeGreaterThanOrEqual(rock.pos.y+rock.height+.85-1e-8);
    }
    expect(JSON.stringify(world)).toBe(before);
  });

  it('does not zoom into a player standing just outside padded stone', () => {
    const world=scene(0,[{...obstacle(1,0,3),pos:{x:0,y:-6,z:3},height:10}]);
    const focus={x:0,y:1.6,z:0},desired={x:0,y:1.6+25*Math.sin(.55),z:25*Math.cos(.55)};
    const old=safeCameraPosition(focus,desired,world),camera=compositionCamera(focus,0,.55,25,world);
    expect(Math.hypot(old.x-focus.x,old.y-focus.y,old.z-focus.z)).toBeLessThan(7);
    expect(Math.hypot(camera.x-focus.x,camera.y-focus.y,camera.z-focus.z)).toBeGreaterThanOrEqual(25-1e-8);
  });

  it('interpolates a half-turn around the organism while preserving its apparent scale', () => {
    const focus={x:0,y:2,z:0},world=scene(),start=compositionCamera(focus,0,.55,25,world);
    const desired=compositionCamera(focus,Math.PI,.55,25,world);
    let camera=start;
    for(let frame=0;frame<120;frame++){
      camera=smoothCameraOrbit(camera,desired,focus,1/60);
      expect(Math.hypot(camera.x-focus.x,camera.y-focus.y,camera.z-focus.z)).toBeCloseTo(25,7);
    }
    expect(Math.hypot(camera.x-desired.x,camera.y-desired.y,camera.z-desired.z)).toBeLessThan(.01);
    expect(smoothCameraOrbit(start,desired,focus,0)).toEqual(start);
  });

  it('keeps zoom changes gradual and takes the short arc across the yaw wrap', () => {
    const focus={x:0,y:2,z:0},world=scene(),from=compositionCamera(focus,Math.PI-.04,.55,13,world);
    const to=compositionCamera(focus,-Math.PI+.04,.55,45,world),next=smoothCameraOrbit(from,to,focus,1/60);
    const distance=Math.hypot(next.x-focus.x,next.y-focus.y,next.z-focus.z);
    expect(distance).toBeGreaterThan(13);expect(distance).toBeLessThan(16);
    const angle=Math.atan2(next.x-focus.x,next.z-focus.z);
    expect(Math.abs(Math.atan2(Math.sin(angle-(Math.PI-.04)),Math.cos(angle-(Math.PI-.04))))).toBeLessThan(.01);
  });

  it.each([0,1,2] as const)('keeps eye and sightline above the actual terrain in stage %i', stage => {
    const world=scene(stage);
    for(let x=-72;x<=72;x+=12)for(let z=-72;z<=72;z+=12){
      const focus={x,y:groundHeight(x,z,stage)+1.1,z};
      const camera=keepCameraOutside({x:x+27,y:-10,z:z+35},focus,world);
      expect(camera.y).toBeGreaterThanOrEqual(groundHeight(camera.x,camera.z,stage)+2.2-1e-8);
      for(let step=1;step<16;step++){
        const t=step/16,px=x+(camera.x-x)*t,pz=z+(camera.z-z)*t;
        expect(focus.y+(camera.y-focus.y)*t).toBeGreaterThanOrEqual(groundHeight(px,pz,stage)+.35-1e-8);
      }
    }
  });
});
