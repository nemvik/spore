import * as THREE from 'three';
import { WebGLRenderList } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import { WebGLProperties } from 'three/src/renderers/webgl/WebGLProperties.js';
import { describe, expect, it, vi } from 'vitest';
import { initialVehicle, vehicleStats } from '../src/game/blueprint';
import type { ActiveMachineState, LegacyAbility } from '../src/game/era-types';
import { emptyMachines } from '../src/game/era-types';
import { buildMachine, createMachines } from '../src/game/machines';
import { groundHeight } from '../src/game/random';
import { createGame } from '../src/game/simulation';
import { createTribe } from '../src/game/tribe';
import type { GameState } from '../src/game/types';
import { createWorld } from '../src/game/world';
import { pickCommandTarget, selectCommandUnits } from '../src/render/command-picking';
import { FleetPresentation } from '../src/render/fleet';
import { animateMachine, createMachine } from '../src/render/machine';
import { disposeObject } from '../src/render/organism';

/** Prepared completed tribe/unlocked flight, followed by real paid construction.
 * This checks presentation of committed designs, not earned campaign progression. */
function fixture(archetype: LegacyAbility = 'restoration'): GameState & { machines: ActiveMachineState } {
  const game = createGame(481516); game.stage = 2; game.world = createWorld(game.seed, 2); game.worlds[2] = game.world;
  game.campaign.finale = archetype; game.campaign.won = true; game.tribe = createTribe(game); game.tribe.completed = true;
  game.tribe.neighbours.forEach(n => { n.resolved = 'allied'; });
  game.stage = 4; game.machines = createMachines(game); game.machines.resource = 1000;
  const tank = initialVehicle('tank', archetype); tank.length = 1.35; tank.width = .9; tank.hue = 211; tank.pattern = 2;
  tank.parts.push({ id: 'paid-paired-armor', kind: 'armor', axial: -.35, angle: 1.2, scale: .65, mirrored: true });
  expect(buildMachine(game, tank).ok).toBe(true);
  Object.assign(game.machines.regions[0], { owner: 'player', method: archetype }); game.machines.airUnlocked = true;
  expect(buildMachine(game, initialVehicle('air', archetype)).ok).toBe(true);
  return game as GameState & { machines: ActiveMachineState };
}
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = []; root.traverse(node => { if (node instanceof THREE.Mesh) result.push(node); }); return result;
}
function signature(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true); const inverse = root.matrixWorld.clone().invert();
  return meshes(root).map(node => ({
    geometry: node.geometry.type, positions: [...node.geometry.getAttribute('position').array],
    colors: [...(node.geometry.getAttribute('color')?.array ?? [])],
    matrix: inverse.clone().multiply(node.matrixWorld).toArray().map(value => Math.round(value * 1e8) / 1e8),
    color: (node.material as THREE.MeshStandardMaterial).color.getHex(),
  }));
}
function resources(root: THREE.Object3D): (THREE.BufferGeometry | THREE.Material)[] {
  const owned = new Set<THREE.BufferGeometry | THREE.Material>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh) { owned.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => owned.add(m)); }
    (node.userData.ownedMaterials as THREE.Material[] | undefined)?.forEach(m => owned.add(m));
  });
  return [...owned];
}
function fill(root: THREE.Object3D, name: string): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  return root.getObjectByName(name)!.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

describe('fleet presentation', () => {
  it('renders each paid design exactly like its editor model and never mutates the save', () => {
    const game = fixture(), before = JSON.stringify(game), view = new FleetPresentation();
    try {
      view.update(game, [], 7, true);
      expect(view.group.visible).toBe(true); expect(view.group.children).toHaveLength(8);
      for (const unit of game.machines.fleet) {
        const blueprint = game.machines.blueprints.find(d => d.id === unit.blueprint)!.blueprint;
        const preview = createMachine(blueprint), body = view.group.getObjectByName(`machine-unit-${unit.id}`)!.children[0];
        try {
          animateMachine(preview, 0, 0, false); expect(signature(body)).toEqual(signature(preview));
          expect(body.userData.vehicleStats).toEqual(vehicleStats(blueprint));
          const privateResources = new Set(resources(preview)); expect(resources(body).every(r => !privateResources.has(r))).toBe(true);
        } finally { disposeObject(preview); }
      }
      expect(view.pickTargets().map(v => v.target)).toEqual([
        ...game.machines.fleet.map(u => ({ kind: 'machine', id: u.id })),
        ...game.machines.regions.map(r => ({ kind: 'region', id: r.id })),
        ...game.machines.springs.map(s => ({ kind: 'spring', id: s.id })),
      ]);
      expect(JSON.stringify(game)).toBe(before);
    } finally { view.dispose(); }
  });

  it('preserves body geometry during movement, sets tank clearance, and retains saved flight height', () => {
    const game = fixture(), view = new FleetPresentation(), [tank, air] = game.machines.fleet;
    try {
      view.update(game, [], 0, true);
      const tankGroup = view.group.getObjectByName(`machine-unit-${tank.id}`)!, tankBody = tankGroup.children[0];
      const geometry = (tankBody.userData.attachmentSurface as THREE.Mesh).geometry;
      tank.pos = { x: 17, y: groundHeight(17, 23, 2) + .8, z: 23 }; tank.heading = .73;
      air.pos = { x: -14, y: groundHeight(-14, -22, 2) + 15, z: -22 }; air.heading = -1.2;
      view.update(game, [{ kind: 'machine', id: tank.id }], 1, true); view.group.updateMatrixWorld(true);
      expect(view.group.getObjectByName(`machine-unit-${tank.id}`)).toBe(tankGroup);
      expect((tankBody.userData.attachmentSurface as THREE.Mesh).geometry).toBe(geometry);
      expect(new THREE.Box3().setFromObject(tankBody).min.y).toBeCloseTo(groundHeight(17, 23, 2), 6);
      const airGroup = view.group.getObjectByName(`machine-unit-${air.id}`)!;
      expect(airGroup.position.y).toBe(air.pos.y); expect(airGroup.children[0].position.y).toBe(0);
      expect(tankGroup.rotation.y).toBe(.73); expect(airGroup.rotation.y).toBe(-1.2);
      expect(tankGroup.getObjectByName('selection-ring')!.visible).toBe(true);
      view.update(game, [{ kind: 'member', id: tank.id }], 2);
      expect(tankGroup.getObjectByName('selection-ring')!.visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('keeps ground rings, contact shadows and ground bars above slopes even beneath aircraft', () => {
    const game = fixture(), view = new FleetPresentation(), point = new THREE.Vector3();
    try {
      for (const heading of [0, .7, 2.2, Math.PI]) {
        game.machines.fleet.forEach(u => { u.heading = heading; });
        view.update(game, game.machines.fleet.map(u => ({ kind: 'machine', id: u.id })), heading, true); view.group.updateMatrixWorld(true);
        const nodes: THREE.Mesh[] = [];
        for (const group of view.group.children) {
          for (const name of ['selection-ring', 'ground-contact', 'region-ring', 'spring-ring']) {
            const node = group.getObjectByName(name); if (node) nodes.push(node as THREE.Mesh);
          }
          group.traverseVisible(node => { if (node.userData.statusBar) nodes.push(...node.children as THREE.Mesh[]); });
        }
        for (const node of nodes) {
          const vertices = node.geometry.getAttribute('position');
          for (let i = 0; i < vertices.count; i++) {
            point.fromBufferAttribute(vertices, i).applyMatrix4(node.matrixWorld);
            expect(point.y).toBeGreaterThan(groundHeight(point.x, point.z, 2) + .025);
          }
        }
      }
    } finally { view.dispose(); }
  });

  it('shows actual health and paid cargo and hides full unselected health', () => {
    const game = fixture(), view = new FleetPresentation(), unit = game.machines.fleet[0];
    try {
      view.update(game, [], 0); const model = view.group.getObjectByName(`machine-unit-${unit.id}`)!;
      expect(model.getObjectByName('machine-health')!.visible).toBe(false); expect(model.getObjectByName('paid-cargo')!.visible).toBe(false);
      unit.health *= .25; unit.cargo = 1; view.update(game, [], 1);
      expect(model.getObjectByName('machine-health')!.visible).toBe(true); expect(fill(model, 'machine-health').scale.x).toBe(.25);
      expect(model.getObjectByName('paid-cargo')!.visible).toBe(true);
      unit.cargo = 0; view.update(game, [], 2); expect(model.getObjectByName('paid-cargo')!.visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('animates movement and work from live intent without reallocating, with stable reduced motion', () => {
    const game = fixture(), view = new FleetPresentation(), [tank, air] = game.machines.fleet;
    try {
      view.update(game, [], 0); const group = view.group.getObjectByName(`machine-unit-${tank.id}`)!;
      const tread = group.getObjectByName('track-tread')!, drill = group.getObjectByName('drill')!, rotor = view.group.getObjectByName(`machine-unit-${air.id}`)!.getObjectByName('rotor')!;
      const rest = tread.position.clone(), owned = resources(view.group), rotorRest = rotor.rotation.y;
      tank.pos.x += 3; tank.intent = 'work'; view.update(game, [], .8);
      expect(tread.position.equals(rest)).toBe(false); expect(drill.rotation.z).not.toBe(0); expect(rotor.rotation.y).not.toBe(rotorRest);
      expect(resources(view.group)).toEqual(owned);
      tank.intent = 'rest'; view.update(game, [], 1); expect(drill.rotation.z).toBe(0); expect(tread.position.equals(rest)).toBe(true);
      tank.intent = 'attack'; view.update(game, [], 1.2); expect(drill.rotation.z).not.toBe(0);
      view.update(game, [], 2, true); const frozen = signature(view.group), opacity = game.machines.springs.map(s => (view.group.getObjectByName(`amber-spring-${s.id}`)!.getObjectByName('spring-glow') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>).material.opacity);
      view.update(game, [], 92, true); expect(signature(view.group)).toEqual(frozen);
      expect(game.machines.springs.map(s => (view.group.getObjectByName(`amber-spring-${s.id}`)!.getObjectByName('spring-glow') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>).material.opacity)).toEqual(opacity);
    } finally { view.dispose(); }
  });

  it.each<LegacyAbility>(['restoration', 'predator', 'migration'])('shows real %s regional progress and ownership without a duplicate cliff ring', archetype => {
    const game = fixture(archetype), view = new FleetPresentation(), region = game.machines.regions[1];
    Object.assign(region, { soil: 45, health: 160, settlers: 1, relation: 65, deliveries: 2 });
    const worldBefore = JSON.stringify(game.world.obstacles);
    try {
      view.update(game, [], 0); const model = view.group.getObjectByName(`machine-region-${region.id}`)!;
      expect(fill(model, 'region-progress').scale.x).toBe(archetype === 'restoration' ? .45 : archetype === 'predator' ? .5 : .65);
      expect(fill(model, 'region-health').scale.x).toBe(.5);
      const pips = [1, 2, 3].map(i => model.getObjectByName(`region-delivery-${i}`) as THREE.Mesh);
      expect(pips.filter(p => p.visible)).toHaveLength(archetype === 'restoration' ? 2 : archetype === 'migration' ? 3 : 0);
      if (archetype !== 'predator') {
        const count = archetype === 'restoration' ? 1 : 2;
        expect(pips.slice(0, count).every(p => p.material === pips[0].material)).toBe(true);
        expect(pips[count].material).not.toBe(pips[0].material);
      }
      const flag = model.getObjectByName('ownership-flag') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>, neutralColor = flag.material.color.getHex();
      region.owner = 'player'; region.method = archetype; view.update(game, [], 1);
      expect(fill(model, 'region-progress').scale.x).toBe(1); expect(flag.material.color.getHex()).not.toBe(neutralColor);
      expect(model.getObjectByName('region-health')!.visible).toBe(false);
      expect(new Set(game.machines.regions.map(r => meshes(view.group.getObjectByName(`machine-region-${r.id}`)!).map(m => m.geometry.type).join(','))).size).toBe(3);
      expect(JSON.stringify(game.world.obstacles)).toBe(worldBefore); expect(view.group.children).toHaveLength(8);
      const summit = game.machines.regions[2], volume = view.pickTargets().find(v => v.target.kind === 'region' && v.target.id === summit.id)!;
      expect(volume.center.y).toBeGreaterThan(groundHeight(summit.pos.x, summit.pos.z, 2) + 9);
    } finally { view.dispose(); }
  });

  it('makes amber sources pickable and updates progress, ownership and vertical glow in place', () => {
    const game = fixture(), view = new FleetPresentation(), spring = game.machines.springs[0]; spring.progress = .375;
    try {
      view.update(game, [], 0, true); const model = view.group.getObjectByName(`amber-spring-${spring.id}`)!;
      const glow = model.getObjectByName('spring-glow') as THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>, color = glow.material.color.getHex();
      expect(fill(model, 'spring-progress').scale.x).toBe(.375); expect(glow.geometry.parameters.height).toBeGreaterThan(6);
      const volume = view.pickTargets().find(v => v.target.kind === 'spring' && v.target.id === spring.id)!;
      const center = new THREE.Vector3(volume.center.x, volume.center.y, volume.center.z);
      expect(pickCommandTarget(new THREE.Ray(center.clone().add(new THREE.Vector3(0, 20, 0)), new THREE.Vector3(0, -1, 0)), [volume])).toEqual({ kind: 'spring', id: spring.id });
      const camera = new THREE.PerspectiveCamera(48, 1, .1, 100); camera.position.copy(center).add(new THREE.Vector3(0, 20, 20)); camera.lookAt(center); camera.updateMatrixWorld(true);
      expect(selectCommandUnits(camera, { left: 0, top: 0, width: 100, height: 100 }, { left: 0, top: 0, right: 100, bottom: 100 }, [volume])).toEqual([]);
      spring.owner = 'player'; spring.progress = 1; view.update(game, [], 1, true);
      expect(view.group.getObjectByName(`amber-spring-${spring.id}`)).toBe(model); expect(fill(model, 'spring-progress').scale.x).toBe(1);
      expect(glow.material.color.getHex()).not.toBe(color); expect(glow.material.opacity).toBeGreaterThan(.2);
    } finally { view.dispose(); }
  });

  it('draws every progress fill after its background in the actual Three render queues', () => {
    const game = fixture('predator'), view = new FleetPresentation(); game.machines.fleet[0].health *= .4;
    try {
      view.update(game, [], 0); view.group.updateMatrixWorld(true); const bars: THREE.Object3D[] = [];
      view.group.traverseVisible(node => { if (node.userData.statusBar) bars.push(node); }); expect(bars.length).toBeGreaterThanOrEqual(9);
      for (const bar of bars) {
        const camera = new THREE.PerspectiveCamera(48, 1, .1, 100), target = bar.getWorldPosition(new THREE.Vector3());
        camera.position.copy(target).add(new THREE.Vector3(0, 15, 10)); camera.lookAt(target); camera.updateMatrixWorld(true);
        const list = new WebGLRenderList(new WebGLProperties());
        for (const child of bar.children) { const plane = child as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; list.push(plane, plane.geometry, plane.material, 0, plane.getWorldPosition(new THREE.Vector3()).project(camera).z, null); }
        Reflect.apply(list.sort, list, []); const order = [...list.opaque, ...list.transmissive, ...list.transparent], foreground = bar.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
        expect(order.at(-1)?.object).toBe(foreground);
        const pixel = new THREE.Color(0x567844); for (const item of order) { const mat = item.material as THREE.MeshBasicMaterial; pixel.lerp(mat.color, mat.transparent ? mat.opacity : 1); }
        expect(pixel.getHex()).toBe(foreground.material.color.getHex());
      }
    } finally { view.dispose(); }
  });

  it('replaces imported changed designs, retires dead units and disposes every owned resource once', () => {
    const game = fixture(), view = new FleetPresentation(), unit = game.machines.fleet[0]; view.update(game, [], 0);
    const old = view.group.getObjectByName(`machine-unit-${unit.id}`)!, retired = resources(old).map(r => vi.spyOn(r, 'dispose'));
    game.machines.blueprints[0].blueprint.hue = 35; view.update(game, [], 1);
    expect(view.group.getObjectByName(`machine-unit-${unit.id}`)).not.toBe(old); retired.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    const living = resources(view.group).map(r => vi.spyOn(r, 'dispose')); unit.health = 0; view.update(game, [], 2);
    expect(view.group.getObjectByName(`machine-unit-${unit.id}`)).toBeUndefined(); expect(view.pickTargets().some(v => v.target.kind === 'machine' && v.target.id === unit.id)).toBe(false);
    game.machines.regions[1].settlers = 2; view.update(game, [], 3); // Previously unused pip material also has an owner.
    view.dispose(); view.dispose(); expect(view.group.children).toHaveLength(0); expect(view.pickTargets()).toEqual([]);
    [...retired, ...living].forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    view.update(game, [], 4); expect(view.group.children).toHaveLength(0);
  });

  it('clears stale targets outside active P2 while retaining the real fleet in P3', () => {
    const game = fixture(), view = new FleetPresentation();
    try {
      view.update(game, [], 0); game.stage = 5; view.update(game, [], 1); expect(view.group.visible).toBe(true); expect(view.pickTargets()).toHaveLength(8);
      game.stage = 3; view.update(game, [], 2); expect(view.group.visible).toBe(false); expect(view.group.children).toHaveLength(0); expect(view.pickTargets()).toEqual([]);
      const preview: GameState = { ...game, stage: 4, machines: emptyMachines() }; view.update(preview, [], 3);
      expect(view.group.visible).toBe(false); expect(view.group.children).toHaveLength(0); expect(view.pickTargets()).toEqual([]);
    } finally { view.dispose(); }
  });
});
