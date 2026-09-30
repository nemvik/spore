import * as THREE from 'three';
import type { StarSystem } from '../game/galaxy';
import type { SpaceState } from '../game/space-types';
import { coreRoot, coreProgress, CORE_CENTER, CORE_ENCOUNTER_POSITION, CORE_FRONTIER } from '../game/space-core-content';
import { activeSpaceBattle } from '../game/space-combat-content';
import { foreignGround } from '../game/space-life';
import { disposeObject } from './organism';

export class SpaceCoreView {
  readonly group = new THREE.Group();
  private gateway = new THREE.Group(); private center = new THREE.Group(); private root = new THREE.Group();
  private crystal = new THREE.Group();
  constructor(readonly system: StarSystem) {
    this.group.name = 'galactic-core'; this.group.add(this.gateway, this.center, this.root);
    const stone = new THREE.MeshStandardMaterial({ color: '#574d6e', roughness: .65, metalness: .4 });
    const glow = new THREE.MeshStandardMaterial({ color: '#e6cf82', emissive: '#b99245', emissiveIntensity: .45, roughness: .4, metalness: .6 });
    const mesh = (parent: THREE.Group, geo: THREE.BufferGeometry, x: number, y: number, z: number, material: THREE.Material = glow) => {
      const item = new THREE.Mesh(geo, material); item.position.set(x, y, z); parent.add(item); return item;
    };
    if (system.index === CORE_FRONTIER) {
      this.gateway.name = 'silent-wall'; this.gateway.position.set(-1.5, 5, 7);
      for (const x of [-2.5, 2.5]) mesh(this.gateway, new THREE.BoxGeometry(.7, 5, .7), x, 0, 0, stone);
      mesh(this.gateway, new THREE.TorusGeometry(2.6, .22, 6, 8), 0, 0, 0);
      mesh(this.gateway, new THREE.OctahedronGeometry(.8), 0, 0, 0, stone);
    }
    if (system.index === CORE_CENTER) {
      const { x, z } = CORE_ENCOUNTER_POSITION;
      this.center.name = 'heart-encounter'; this.center.position.set(x, foreignGround(system.seed, x, z), z);
      mesh(this.center, new THREE.CylinderGeometry(3.2, 4.2, .7, 12), 0, .35, 0, stone);
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5; mesh(this.center, new THREE.ConeGeometry(.6, 4, 5), Math.cos(a) * 3, 2, Math.sin(a) * 3, stone);
      }
      this.crystal.position.y = 3; this.center.add(this.crystal);
      mesh(this.crystal, new THREE.IcosahedronGeometry(1.4, 1), 0, 0, 0);
      const ring = mesh(this.center, new THREE.TorusGeometry(2.2, .12, 6, 36), 0, 3, 0); ring.rotation.x = Math.PI / 2;
    }
    if (system.index !== 0) {
      this.root.name = 'climate-root'; this.root.position.set(4, foreignGround(system.seed, 4, -6), -6);
      mesh(this.root, new THREE.CylinderGeometry(.4, 1, 3.2, 7), 0, 1.6, 0);
      for (const side of [-1, 1]) {
        const branch = mesh(this.root, new THREE.TorusGeometry(1.5, .15, 6, 20, Math.PI * 1.4), side * .8, 2.6, 0); branch.rotation.z = side * .65;
      }
      mesh(this.root, new THREE.OctahedronGeometry(.7), 0, 3.5, 0);
    }
  }
  sync(p: SpaceState, reducedMotion: boolean): void {
    const progress = coreProgress(p.core), onSurface = p.location?.scale === 'surface' && (!p.leg || p.leg.elapsed < p.leg.duration * .8);
    this.gateway.visible = this.system.index === CORE_FRONTIER && p.location?.scale === 'orbit' && !p.leg && !activeSpaceBattle(p);
    this.center.visible = this.system.index === CORE_CENTER && onSurface;
    this.root.visible = onSurface && !!coreRoot(p.core, this.system.planetId);
    this.crystal.rotation.y = reducedMotion ? 0 : p.elapsed * .2;
    this.crystal.scale.setScalar(progress.encounter ? .7 : 1);
    this.group.userData.core = { planetId: this.system.planetId, encountered: !!progress.encounter, anchored: this.root.visible, frontier: this.gateway.visible };
  }
  dispose(): void { disposeObject(this.group); this.group.clear(); }
}
