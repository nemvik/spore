import * as THREE from 'three';
import type { SpaceEmpire } from '../game/space-empires-types';
import { EMPIRE_PROFILES } from '../game/space-empires-content';
import { disposeObject } from './organism';

/** Original silhouettes: a crystal exchange, a branching council and a basalt
 * watch arch. The signal reacts to the saved contact/treaty, never invents one. */
export class SpaceEmbassyView {
  readonly group = new THREE.Group();
  private signal = new THREE.Group();
  private light: THREE.MeshStandardMaterial;
  constructor(readonly id: string, empire: SpaceEmpire, ground: number) {
    const profile = EMPIRE_PROFILES[empire.id];
    const shell = new THREE.MeshStandardMaterial({ color: empire.id === 'basalt' ? '#535969' : '#ddccaa', roughness: .8 });
    this.light = new THREE.MeshStandardMaterial({ color: profile.color, emissive: profile.color, emissiveIntensity: .2, metalness: .25, roughness: .35 });
    const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent = this.group) => {
      const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    add(new THREE.CylinderGeometry(3.4, 3.8, .6, 6), shell, 0, .3, 0);
    if (empire.id === 'resin') {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 1.8;
        add(new THREE.CylinderGeometry(.9, 1.15, 1.1 + i * .35, 8), shell, x, 1, 0);
        add(new THREE.OctahedronGeometry(.8), this.light, x, 2.3 + i * .35, 0);
      }
    } else if (empire.id === 'roots') {
      add(new THREE.CylinderGeometry(.35, .8, 3.8, 8), shell, 0, 2, 0);
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2, branch = add(new THREE.CylinderGeometry(.15, .3, 2.5, 6), shell, Math.cos(angle), 2.8, Math.sin(angle));
        branch.rotation.z = Math.PI / 3; branch.rotation.y = -angle;
        const leaf = add(new THREE.SphereGeometry(1, 10, 6), this.light, Math.cos(angle) * 1.8, 3.8, Math.sin(angle) * 1.8); leaf.scale.set(1, .25, .65); leaf.rotation.y = -angle;
      }
    } else {
      for (const x of [-1.8, 1.8]) add(new THREE.CylinderGeometry(.65, 1, 4, 6), shell, x, 2.3, 0);
      const arch = add(new THREE.TorusGeometry(1.8, .38, 6, 12, Math.PI), this.light, 0, 3.4, 0); arch.rotation.z = 0;
      add(new THREE.BoxGeometry(2.7, .6, 1.1), shell, 0, 1.2, 0);
    }
    this.signal.position.y = 5.1; this.group.add(this.signal);
    add(new THREE.TorusGeometry(.7, .07, 5, 20), this.light, 0, 0, 0, this.signal);
    this.group.position.set(7, ground, -5); this.group.name = 'foreign-embassy';
  }
  sync(empire: SpaceEmpire, time: number, reducedMotion: boolean) {
    this.light.emissiveIntensity = empire.treaty !== null ? .7 : empire.contact !== null ? .4 : .2;
    this.signal.rotation.y = reducedMotion ? 0 : time * .3;
    this.group.userData.empire = { id: empire.id, contact: empire.contact !== null, treaty: empire.treaty !== null, enclave: empire.enclave };
  }
  dispose() { disposeObject(this.group); this.group.clear(); }
}
