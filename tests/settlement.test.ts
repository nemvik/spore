import * as THREE from 'three';
import { WebGLRenderList } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import { WebGLProperties } from 'three/src/renderers/webgl/WebGLProperties.js';
import { describe, expect, it, vi } from 'vitest';
import { SettlementPresentation } from '../src/render/settlement';
import { createGame } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { groundHeight } from '../src/game/random';
import { organismGroundClearance } from '../src/render/organism';
import { speciesGroundClearance } from '../src/game/anatomy';
import { speciesById } from '../src/game/content';
import type { ActiveTribeState, ToolId, TribeUnit } from '../src/game/era-types';
import type { GameState } from '../src/game/types';

function member(id: number, species: string | null = null): TribeUnit {
  const pos = { x: id * 3, y: groundHeight(id * 3, 0, 2) + .8, z: 0 };
  return { id, pos, heading: 0, health: 100, hunger: 12, tool: null, species, benefit: species ? 'recycle' : null, loyalty: 88, cargo: 0, cooldown: 0, orders: [], intent: 'rest', navigation: { waypoint: { ...pos }, target: { ...pos }, rethink: 0 } };
}
function state(): GameState & { tribe: ActiveTribeState } {
  const game = createGame(481516); game.stage = 3; game.world = createWorld(game.seed, 2); game.worlds[2] = game.world;
  game.player.genome.parts.push({ id: 'legs-render', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: true });
  game.player.bonds = [{ species: 'gloom', benefit: 'recycle', age: 200, hunger: 12, loyalty: 88 }];
  const tribe: ActiveTribeState = { version: 2, food: 40, members: [member(1), member(2, 'gloom')], huts: [{ id: 3, kind: 'shelter', pos: { x: -4, y: 2, z: 0 }, tool: null, progress: 1, health: 100 }], neighbours: ['garden', 'terrace', 'sanctuary'].map((identity, index) => ({ id: index + 4, identity: identity as 'garden' | 'terrace' | 'sanctuary', pos: { x: 20 + index * 10, y: 2, z: 10 }, relation: 0, resolved: null, health: 100, alarm: 0, tribute: 0, cooldown: 0 })), unlocked: [], legacyAbility: 'restoration', abilityCooldown: 0, abilityTime: 0, nextId: 7, elapsed: 0, completed: false };
  return Object.assign(game, { tribe });
}

describe('settlement presentation', () => {
  it('draws one model for every living member, including actual symbionts, without changing the save', () => {
    const game = state(), before = JSON.stringify(game), view = new SettlementPresentation();
    try {
      view.update(game, [], 12);
      expect(view.group.visible).toBe(true);
      expect(view.group.children.filter(node => node.name.startsWith('tribe-member-'))).toHaveLength(2);
      const host = view.group.getObjectByName('tribe-member-1') as THREE.Group;
      const partner = view.group.getObjectByName('tribe-member-2') as THREE.Group;
      expect(host.children[0].userData.attachmentSurface).toBeDefined();
      expect(partner.children[0].userData.species).toBe('gloom');
      expect(view.pickTargets().map(target => target.target)).toEqual([
        { kind: 'member', id: 1 }, { kind: 'member', id: 2 }, { kind: 'hut', id: 3 },
        { kind: 'neighbour', id: 4 }, { kind: 'neighbour', id: 5 }, { kind: 'neighbour', id: 6 },
      ]);
      expect(JSON.stringify(game)).toBe(before);
    } finally { view.dispose(); }
  });

  it('caches member geometry through movement and equipment changes and keeps feet on ground', () => {
    const game = state(), view = new SettlementPresentation();
    try {
      view.update(game, [], 0);
      const group = view.group.getObjectByName('tribe-member-1') as THREE.Group, body = group.children[0];
      const geometry = (body.userData.attachmentSurface as THREE.Mesh).geometry;
      game.tribe.members[0].pos.x += 4; game.tribe.members[0].tool = 'basket';
      view.update(game, [{ kind: 'member', id: 1 }], 1);
      expect(view.group.getObjectByName('tribe-member-1')).toBe(group);
      expect(group.children[0]).toBe(body);
      expect((body.userData.attachmentSurface as THREE.Mesh).geometry).toBe(geometry);
      expect(group.getObjectByName('tool-basket')).toBeDefined();
      expect(group.position.y + body.position.y - organismGroundClearance(game.player.genome)).toBeCloseTo(groundHeight(group.position.x, group.position.z, 2), 8);
      expect(group.getObjectByName('selection-ring')!.visible).toBe(true);
      view.update(game, [{ kind: 'machine', id: 1 }], 2);
      expect(group.getObjectByName('selection-ring')!.visible).toBe(false);
    } finally { view.dispose(); }
  });

  it.each<ToolId>(['basket', 'spear', 'drum', 'waterskin'])('mounts %s on the member and its workshop', tool => {
    const game = state(), view = new SettlementPresentation();
    game.tribe.members[0].tool = tool;
    game.tribe.huts.push({ id: 10, kind: 'workshop', tool, pos: { x: -10, y: 0, z: 0 }, progress: 1, health: 100 });
    try {
      view.update(game, [], 0);
      expect(view.group.getObjectByName('tribe-member-1')!.getObjectByName(`tool-${tool}`)).toBeDefined();
      expect(view.group.getObjectByName('tribe-hut-10')!.getObjectByName(`tool-${tool}`)).toBeDefined();
      let count = 0; view.group.getObjectByName(`tool-${tool}`)!.traverse(node => { if (node instanceof THREE.Mesh) count++; });
      expect(count).toBeGreaterThan(2);
    } finally { view.dispose(); }
  });

  it.each(['gloom', 'mender', 'lantern'])('uses the existing species clearance for %s', species => {
    const game = state(), view = new SettlementPresentation(); game.tribe.members[1].species = species;
    try {
      view.update(game, [], 0);
      const group = view.group.getObjectByName('tribe-member-2')!;
      expect(group.position.y + group.children[0].position.y).toBeCloseTo(groundHeight(group.position.x, group.position.z, 2) + speciesGroundClearance(speciesById(species)), 8);
    } finally { view.dispose(); }
  });

  it('keeps selection circles, contact shadows and health bars above sloping ground', () => {
    const game = state(), view = new SettlementPresentation(), point = new THREE.Vector3();
    try {
      for (const heading of [0, .7, 2.2, Math.PI]) {
        game.tribe.members[0].heading = heading; view.update(game, [{ kind: 'member', id: 1 }], heading);
        view.group.updateMatrixWorld(true);
        const host = view.group.getObjectByName('tribe-member-1')!;
        const targets = [host.getObjectByName('selection-ring')!, host.getObjectByName('ground-contact')!, ...host.getObjectByName('status-bar')!.children];
        for (const node of targets) {
          const mesh = node as THREE.Mesh, vertices = mesh.geometry.getAttribute('position');
          for (let i = 0; i < vertices.count; i++) {
            point.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld);
            expect(point.y).toBeGreaterThan(groundHeight(point.x, point.z, 2) + .025);
          }
        }
      }
    } finally { view.dispose(); }
  });

  it('reflects construction, carried food, wounds, and neighbour relations from committed state', () => {
    const game = state(), view = new SettlementPresentation();
    game.tribe.huts[0].progress = .25;
    game.tribe.members[0].cargo = 4; game.tribe.members[0].health = 20;
    try {
      view.update(game, [], 0);
      const hut = view.group.getObjectByName('tribe-hut-3') as THREE.Group;
      expect(hut.children[0].scale.y).toBe(.25);
      expect(hut.children[1].visible).toBe(true);
      const host = view.group.getObjectByName('tribe-member-1') as THREE.Group;
      expect(host.getObjectByName('carried-food')!.visible).toBe(true);
      const health = host.getObjectByName('status-bar')!;
      expect(health.visible).toBe(true); expect(health.children[1].scale.x).toBe(.2);
      const garden = view.group.getObjectByName('tribe-neighbour-4')!;
      const banner = garden.children.find(node => node instanceof THREE.Mesh && (node.geometry as THREE.BoxGeometry).parameters?.width === 1.25) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
      const hostile = banner.material.color.getHex();
      game.tribe.neighbours[0].resolved = 'allied'; game.tribe.neighbours[0].relation = 100;
      game.tribe.huts[0].progress = 1; game.tribe.members[0].cargo = 0;
      view.update(game, [], 1);
      expect(banner.material.color.getHex()).not.toBe(hostile);
      expect(hut.children[0].scale.y).toBe(1); expect(hut.children[1].visible).toBe(false);
      expect(host.getObjectByName('carried-food')!.visible).toBe(false);
    } finally { view.dispose(); }
  });

  it('draws health and construction fills after their translucent backgrounds', () => {
    const game = state(), view = new SettlementPresentation();
    game.tribe.huts[0].progress = .25; game.tribe.huts[0].health = 50;
    game.tribe.members[1].health = 20;
    try {
      view.update(game, [{ kind: 'member', id: 1 }], 0); view.group.updateMatrixWorld(true);
      const bars: THREE.Object3D[] = [];
      view.group.traverseVisible(node => { if (node.name === 'status-bar') bars.push(node); });
      expect(bars.length).toBeGreaterThanOrEqual(6);
      for (const bar of bars) {
        const camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
        const target = bar.getWorldPosition(new THREE.Vector3());
        camera.position.copy(target).add(new THREE.Vector3(0, 15, 10)); camera.lookAt(target); camera.updateMatrixWorld(true);
        const list = new WebGLRenderList(new WebGLProperties());
        for (const child of bar.children) {
          const plane = child as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
          list.push(plane, plane.geometry, plane.material, 0, plane.getWorldPosition(new THREE.Vector3()).project(camera).z, null);
        }
        // Use Three's default sorting and its opaque-before-transparent render passes.
        Reflect.apply(list.sort, list, []);
        const drawOrder = [...list.opaque, ...list.transmissive, ...list.transparent];
        const fill = bar.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
        expect(drawOrder.at(-1)?.object).toBe(fill);
        const pixel = new THREE.Color(0x567844);
        for (const item of drawOrder) {
          const material = item.material as THREE.MeshBasicMaterial;
          pixel.lerp(material.color, material.transparent ? material.opacity : 1);
        }
        expect(pixel.getHex()).toBe(fill.material.color.getHex());
      }
    } finally { view.dispose(); }
  });

  it('has distinct geometry for the garden, terraces and sanctuary', () => {
    const game = state(), view = new SettlementPresentation();
    try {
      view.update(game, [], 0);
      const signatures = [4, 5, 6].map(id => {
        const shapes: string[] = [];
        view.group.getObjectByName(`tribe-neighbour-${id}`)!.traverse(node => { if (node instanceof THREE.Mesh) shapes.push(node.geometry.type); });
        return shapes.join(',');
      });
      expect(new Set(signatures).size).toBe(3);
    } finally { view.dispose(); }
  });

  it('normalizes neighbour damage against the actual identity health limit', () => {
    const game = state(), view = new SettlementPresentation();
    game.tribe.neighbours[0].health = 160;
    game.tribe.neighbours[1].health = 110;
    game.tribe.neighbours[2].health = 45;
    try {
      view.update(game, [], 0);
      const healthBars = [4, 5, 6].map(id => view.group.getObjectByName(`tribe-neighbour-${id}`)!.children.filter(child => child.name === 'status-bar')[1]);
      expect(healthBars[0].visible).toBe(false);
      expect(healthBars[1].visible).toBe(true); expect(healthBars[1].children[1].scale.x).toBe(.5);
      expect(healthBars[2].children[1].scale.x).toBe(.25);
    } finally { view.dispose(); }
  });

  it('retires dead units and equipment with one geometry owner, and dispose is idempotent', () => {
    const game = state(), view = new SettlementPresentation();
    game.tribe.members[0].tool = 'spear'; view.update(game, [], 0);
    const group = view.group.getObjectByName('tribe-member-1')!, body = group.children[0];
    const geometry = (body.userData.attachmentSurface as THREE.Mesh).geometry, retired = vi.spyOn(geometry, 'dispose');
    const tool = group.getObjectByName('tool-spear')!.children[0] as THREE.Mesh, toolRetired = vi.spyOn(tool.geometry, 'dispose');
    game.tribe.members[0].tool = 'drum'; view.update(game, [], 1);
    expect(toolRetired).toHaveBeenCalledTimes(1); expect(retired).not.toHaveBeenCalled();
    game.tribe.members[0].health = 0; view.update(game, [], 2);
    expect(view.group.getObjectByName('tribe-member-1')).toBeUndefined();
    expect(view.pickTargets().some(item => item.target.kind === 'member' && item.target.id === 1)).toBe(false);
    expect(retired).toHaveBeenCalledTimes(1);
    view.dispose(); view.dispose();
    expect(view.group.children).toHaveLength(0); expect(view.pickTargets()).toEqual([]);
    expect(retired).toHaveBeenCalledTimes(1);
  });

  it('retires replaced neighbours in P2/P3 while retaining the camp and historical P1 data', () => {
    const game = state(), view = new SettlementPresentation(), before = JSON.stringify(game.tribe);
    try {
      view.update(game, [], 0);
      const member = view.group.getObjectByName('tribe-member-1')!, hut = view.group.getObjectByName('tribe-hut-3')!;
      const neighbour = view.group.getObjectByName('tribe-neighbour-4')!;
      let geometry: THREE.BufferGeometry | undefined;
      neighbour.traverse(node => { if (!geometry && node instanceof THREE.Mesh) geometry = node.geometry; });
      const disposed = vi.spyOn(geometry!, 'dispose');
      for (const stage of [4, 5] as const) {
        game.stage = stage; view.update(game, [], stage);
        expect(view.group.visible).toBe(true); expect(view.group.children).toHaveLength(3);
        expect(view.group.getObjectByName('tribe-member-1')).toBe(member); expect(view.group.getObjectByName('tribe-hut-3')).toBe(hut);
        expect(view.group.getObjectByName('tribe-neighbour-4')).toBeUndefined();
        expect(view.pickTargets().map(v => v.target)).toEqual([{ kind: 'member', id: 1 }, { kind: 'member', id: 2 }, { kind: 'hut', id: 3 }]);
        expect(disposed).toHaveBeenCalledTimes(1); expect(JSON.stringify(game.tribe)).toBe(before);
      }
      game.stage = 3; view.update(game, [], 6);
      expect(view.group.getObjectByName('tribe-neighbour-4')).toBeDefined(); expect(view.group.getObjectByName('tribe-neighbour-4')).not.toBe(neighbour);
      expect(view.pickTargets().filter(v => v.target.kind === 'neighbour')).toHaveLength(3);
      expect(view.group.getObjectByName('tribe-member-1')).toBe(member); expect(disposed).toHaveBeenCalledTimes(1);
    } finally { view.dispose(); }
  });

  it('does not display or pick settlement content in organism stages or the old preview', () => {
    const game = state(), view = new SettlementPresentation();
    try {
      view.update(game, [], 0); expect(view.group.children.length).toBeGreaterThan(0);
      game.stage = 2; view.update(game, [], 1);
      expect(view.group.visible).toBe(false); expect(view.group.children).toHaveLength(0); expect(view.pickTargets()).toEqual([]);
      const preview: GameState = { ...game, stage: 3, tribe: { version: 1, food: 0, members: [], huts: [], neighbours: [], unlocked: [] } };
      view.update(preview, [], 2); expect(view.group.visible).toBe(false); expect(view.pickTargets()).toEqual([]);
    } finally { view.dispose(); }
  });
});
