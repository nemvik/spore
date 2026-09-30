import * as THREE from 'three';
import type { EmpireId } from '../game/space-empires-types';
import type { SpaceState } from '../game/space-types';
import { EMPIRE_PROFILES } from '../game/space-empires-content';
import { allyFormation } from '../game/space-expansion-content';
import { disposeObject } from './organism';

function escortModel(id: EmpireId): THREE.Group {
  const group = new THREE.Group(), color = EMPIRE_PROFILES[id].color;
  const shell = new THREE.MeshStandardMaterial({ color: id === 'basalt' ? '#545b71' : '#e1d7b1', roughness: .55, metalness: .25 });
  const light = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35, roughness: .4 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };
  if (id === 'resin') {
    add(new THREE.OctahedronGeometry(.85), light).scale.set(.8, .7, 1.4);
    for (const side of [-1, 1]) add(new THREE.CapsuleGeometry(.25, 1.2, 3, 6), shell, side, 0, .2).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(.7, .08, 5, 16), light, 0, .15, .5).rotation.x = Math.PI / 2;
  } else if (id === 'roots') {
    add(new THREE.CapsuleGeometry(.3, 1.2, 4, 8), shell).rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const leaf = add(new THREE.SphereGeometry(.85, 10, 6), light, side * .8, .1, .1); leaf.scale.set(1, .18, .65); leaf.rotation.z = side * -.22;
    }
    add(new THREE.SphereGeometry(.25, 8, 6), light, 0, .3, -.6);
  } else {
    add(new THREE.BoxGeometry(.6, .5, 1.7), shell);
    for (const side of [-1, 1]) { const wing = add(new THREE.ConeGeometry(.65, 1.6, 3), shell, side * .9, 0, .2); wing.rotation.x = -Math.PI / 2; }
    add(new THREE.TorusGeometry(.6, .08, 5, 12), light, 0, .25, .3);
  }
  group.name = `ally-${id}`; return group;
}
/** Persistent ID-based meshes and one reused beam per real companion. */
export class SpaceAlliesView {
  readonly group = new THREE.Group();
  private entries = new Map<string, { model: THREE.Group; beam: THREE.Line; delivered: number; flashAt: number }>();
  sync(p: SpaceState, offset: THREE.Vector3, player: THREE.Vector3, reducedMotion: boolean): void {
    const allies = p.expansion?.allies ?? [];
    for (const [id, entry] of this.entries) if (!allies.some(ally => ally.id === id)) {
      this.group.remove(entry.model, entry.beam); disposeObject(entry.model); disposeObject(entry.beam); this.entries.delete(id);
    }
    for (const ally of allies) {
      let entry = this.entries.get(ally.id);
      if (!entry) {
        const model = escortModel(ally.empireId), beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          new THREE.LineBasicMaterial({ color: EMPIRE_PROFILES[ally.empireId].color, transparent: true, opacity: .85 }));
        entry = { model, beam, delivered: ally.delivered, flashAt: -1 }; this.entries.set(ally.id, entry); this.group.add(model, beam);
      }
      const l = ally.location; entry.model.visible = !!l; entry.beam.visible = false; if (!l) continue;
      const source = new THREE.Vector3(l.pos.x, l.pos.y, l.pos.z);
      if (p.leg) {
        const target = allyFormation(p.leg.to, ally.empireId).pos, raw = p.leg.elapsed / p.leg.duration, t = raw * raw * (3 - 2 * raw);
        source.lerp(new THREE.Vector3(target.x, target.y, target.z), t);
      }
      entry.model.position.copy(source.add(offset)); entry.model.rotation.y = l.heading;
      entry.model.rotation.z = reducedMotion ? 0 : Math.sin(p.elapsed * 1.8 + ally.paidSerial) * .04;
      if (ally.delivered < entry.delivered || p.elapsed < entry.flashAt) entry.flashAt = -1;
      if (ally.delivered > entry.delivered) entry.flashAt = p.elapsed; entry.delivered = ally.delivered;
      entry.beam.visible = !p.leg && entry.flashAt >= 0 && p.elapsed >= entry.flashAt && p.elapsed - entry.flashAt < .2;
      const positions = entry.beam.geometry.getAttribute('position');
      positions.setXYZ(0, source.x, source.y, source.z); positions.setXYZ(1, player.x, player.y, player.z); positions.needsUpdate = true; entry.beam.geometry.computeBoundingSphere();
      entry.model.userData.ally = { id: ally.id, energy: ally.energy, delivered: ally.delivered };
    }
  }
  dispose(): void { disposeObject(this.group); this.group.clear(); this.entries.clear(); }
}
