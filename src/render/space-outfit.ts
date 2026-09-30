import * as THREE from 'three';
import type { OutfittedSpace } from '../game/space-outfit-content';
import type { ShipEquipment } from '../game/space-outfit-types';
import { disposeObject } from './organism';

/** Paid attachments share the original ship transform; the blueprint is untouched. */
export class ShipOutfitView {
  readonly group = new THREE.Group();
  private modules = new Map<ShipEquipment, THREE.Group>();
  private pulses = new Map<ShipEquipment, THREE.MeshStandardMaterial>();
  private disposed = false;
  constructor() { this.group.name = 'paid-ship-equipment'; }
  private build(kind: ShipEquipment) {
    const group = new THREE.Group(); group.name = `ship-equipment-${kind}`;
    const shell = new THREE.MeshStandardMaterial({ color: kind === 'hold' ? '#c89d50' : kind === 'drive' ? '#809ed5' : '#699d78', roughness: .58, metalness: .28 });
    const glow = new THREE.MeshStandardMaterial({ color: '#c6f6d5', emissive: '#62cdb3', emissiveIntensity: .35, roughness: .5 });
    this.pulses.set(kind, glow);
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const part = new THREE.Mesh(geometry, material); part.position.set(x, y, z); group.add(part); return part;
    };
    if (kind === 'hold') {
      for (const x of [-2.65, 2.65]) for (const z of [-.85, .85]) {
        const pod = mesh(new THREE.CylinderGeometry(.48, .55, 1.1, 6), shell, x, -.25, z); pod.rotation.x = Math.PI / 2;
        mesh(new THREE.SphereGeometry(.19, 8, 6), glow, x, -.25, z - .6);
        const strut = mesh(new THREE.BoxGeometry(1.6, .12, .12), shell, x * .65, -.25, z); strut.rotation.z = x < 0 ? .12 : -.12;
      }
    } else if (kind === 'drive') {
      mesh(new THREE.TorusGeometry(2.4, .16, 6, 32), shell, 0, .1, 1.9);
      for (let i = 0; i < 6; i++) { const angle = i * Math.PI / 3;
        mesh(new THREE.OctahedronGeometry(.3), glow, Math.cos(angle) * 2.4, .1 + Math.sin(angle) * 2.4, 1.9);
      }
    } else {
      for (const side of [-1, 1]) {
        const leaf = mesh(new THREE.SphereGeometry(1, 10, 6), shell, side * 2.8, .8, -.4); leaf.scale.set(1.1, .1, 1.7); leaf.rotation.z = side * .25;
        const vein = mesh(new THREE.BoxGeometry(.06, .08, 2.5), glow, side * 2.8, .93, -.4); vein.rotation.z = side * .25;
        mesh(new THREE.CylinderGeometry(.08, .08, 2, 6), shell, side * 1.9, .4, -.4).rotation.z = side * Math.PI / 3;
      }
    }
    this.group.add(group); this.modules.set(kind, group); return group;
  }
  sync(p: OutfittedSpace, time: number, reducedMotion: boolean) {
    if (this.disposed) return;
    const bought = p.outfit?.purchases ?? [];
    for (const [kind, group] of this.modules) if (!bought.some(row => row.equipment === kind)) {
      this.group.remove(group); disposeObject(group); this.modules.delete(kind); this.pulses.delete(kind);
    }
    for (const receipt of bought) {
      const module = this.modules.get(receipt.equipment) ?? this.build(receipt.equipment);
      module.userData.paymentSerial = receipt.serial;
      this.pulses.get(receipt.equipment)!.emissiveIntensity = reducedMotion ? .35 : .35 + .12 * Math.sin(time * 2);
    }
  }
  dispose() { if (this.disposed) return; this.disposed = true; disposeObject(this.group); this.group.clear(); this.modules.clear(); this.pulses.clear(); }
}
