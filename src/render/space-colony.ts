import * as THREE from 'three';
import type { Colony } from '../game/space-economy-types';
import { SPACE_PRODUCTS } from '../game/space-products';
import { colonyStock } from '../game/space-economy';
import { disposeObject } from './organism';

/** A small living workshop beside the landing beacon, with actual stock crates.
 * Meshes are allocated once; level, ecological activity and cargo change in place. */
export class SpaceColonyView {
  readonly group = new THREE.Group();
  private pods: THREE.Group[] = []; private crates: THREE.Mesh[] = [];
  private vane = new THREE.Group();
  private quarantine = new THREE.Group();
  private lamp: THREE.MeshStandardMaterial;
  constructor(readonly id: string, colony: Colony, ground: number) {
    const shell = new THREE.MeshStandardMaterial({ color: '#e5cf9e', roughness: .75, metalness: .12 });
    const dark = new THREE.MeshStandardMaterial({ color: '#354e53', roughness: .75 });
    const glass = new THREE.MeshStandardMaterial({ color: SPACE_PRODUCTS[colony.product].color, roughness: .28, metalness: .35 });
    this.lamp = new THREE.MeshStandardMaterial({ color: '#9cecc0', emissive: '#58b58a', emissiveIntensity: .5 });
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent = this.group) => {
      const body = new THREE.Mesh(geometry, material); body.position.set(x, y, z); parent.add(body); return body;
    };
    mesh(new THREE.CylinderGeometry(3.8, 4.2, .45, 12), dark, 0, .2, 0);
    mesh(new THREE.CylinderGeometry(.6, 1.1, 3, 8), shell, 0, 1.7, 0);
    mesh(new THREE.SphereGeometry(.45, 10, 8), this.lamp, 0, 3.45, 0);
    this.vane.position.y = 3.45; this.group.add(this.vane);
    const warning = new THREE.MeshStandardMaterial({ color: '#ffc978', emissive: '#c0782c', emissiveIntensity: .55 });
    this.quarantine.name = 'colony-quarantine'; this.quarantine.position.y = 5; this.group.add(this.quarantine);
    mesh(new THREE.TorusGeometry(.85, .08, 5, 12), warning, 0, 0, 0, this.quarantine);
    const stripe = mesh(new THREE.BoxGeometry(.14, 1.3, .12), warning, 0, 0, 0, this.quarantine); stripe.rotation.z = -.6;
    this.quarantine.visible = false;
    for (let i = 0; i < 3; i++) {
      const petal = mesh(new THREE.SphereGeometry(1, 8, 6), glass, Math.sin(i * Math.PI * 2 / 3) * 1.4, .25, Math.cos(i * Math.PI * 2 / 3) * 1.4, this.vane);
      petal.scale.set(.48, .14, 1.05); petal.rotation.y = i * Math.PI * 2 / 3;
      const pod = new THREE.Group(); this.pods.push(pod); this.group.add(pod);
      const angle = i * Math.PI * 2 / 3, x = Math.sin(angle) * 2.1, z = Math.cos(angle) * 2.1;
      mesh(new THREE.CylinderGeometry(1, 1.3, 1.25, 10), shell, x, 1.1, z, pod);
      const dome = mesh(new THREE.SphereGeometry(1.05, 12, 8), glass, x, 1.75, z, pod); dome.scale.y = .65;
    }
    const crateGeo = new THREE.OctahedronGeometry(.23);
    for (let i = 0; i < 24; i++) this.crates.push(mesh(crateGeo, glass, -1.6 + i % 8 * .46, .5 + Math.floor(i / 8) * .42, 4.1));
    this.group.position.set(-7, ground, -5); this.group.name = 'foreign-colony';
  }
  sync(colony: Colony, capacity: number, time: number, reducedMotion: boolean, quarantined = false) {
    this.pods.forEach((pod, i) => { pod.visible = i < colony.level; });
    this.crates.forEach((crate, i) => { crate.visible = i < colonyStock(colony); });
    this.lamp.emissiveIntensity = capacity ? .65 : .08;
    this.lamp.color.set(quarantined ? '#ffc978' : capacity ? '#9cecc0' : '#d79b75');
    this.vane.rotation.y = reducedMotion || !capacity ? 0 : time * .24;
    this.quarantine.visible = quarantined; this.quarantine.rotation.y = reducedMotion ? 0 : Math.sin(time * .7) * .25;
    this.group.userData.colony = { id: colony.id, level: colony.level, capacity, stock: colonyStock(colony), product: colony.product, quarantined };
  }
  dispose() { disposeObject(this.group); this.group.clear(); }
}
