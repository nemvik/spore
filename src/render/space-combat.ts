import * as THREE from 'three';
import type { SpaceState } from '../game/space-types';
import type { SpacePulse } from '../game/space-combat-types';
import { latestBattle } from '../game/space-combat-content';
import { EMPIRE_PROFILES } from '../game/space-empires-content';
import { disposeObject } from './organism';

/** Fixed reusable meshes: no geometry or material allocation per animation frame. */
export class SpaceCombatView {
  readonly group = new THREE.Group();
  readonly enemy = new THREE.Group();
  readonly rescue: THREE.Mesh;
  private ownBeam: THREE.Line;
  private enemyBeam: THREE.Line;
  private trim: THREE.MeshStandardMaterial;
  private guard: THREE.Group;
  private crown = new THREE.Group();
  constructor() {
    this.group.name = 'space-combat'; this.enemy.name = 'pirate-shard'; this.group.add(this.enemy);
    const hull = new THREE.MeshStandardMaterial({ color: '#263744', metalness: .7, roughness: .35 });
    const red = new THREE.MeshStandardMaterial({ color: '#e7685e', emissive: '#722f2b', emissiveIntensity: .7, metalness: .4, roughness: .4 });
    this.trim = red;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.25), hull); core.scale.set(1.2, .6, 1.7); this.enemy.add(core);
    for (const side of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(.65, 3.1, 3), hull); claw.rotation.x = -Math.PI / 2; claw.rotation.z = side * .2; claw.position.set(side * 1.6, -.1, -.7); this.enemy.add(claw);
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(.35, 1.6, 3), red); tooth.rotation.x = -Math.PI / 2; tooth.position.set(side * 1.4, 0, -2.5); this.enemy.add(tooth);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.2, 1.7), red); fin.position.set(side * .8, .25, .7); fin.rotation.z = side * -.6; this.enemy.add(fin);
    }
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(.4), new THREE.MeshBasicMaterial({ color: '#ffcf95' })); eye.position.set(0, .7, -.7); this.enemy.add(eye);
    this.guard = new THREE.Group(); this.guard.name = 'empire-guard-shield';
    const shield = new THREE.Mesh(new THREE.TorusGeometry(2.1, .18, 6, 8), red); shield.position.z = -.8;
    this.guard.add(shield);
    for (const side of [-1, 1]) {
      const armor = new THREE.Mesh(new THREE.OctahedronGeometry(.85), hull); armor.scale.set(1.1, .5, 2); armor.position.set(side * 2.1, .1, .5); this.guard.add(armor);
    }
    this.enemy.add(this.guard, this.crown); this.guard.visible = this.crown.visible = false;
    this.crown.name = 'warden-crown';
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.7, .16, 6, 20), red);
      ring.rotation.y = side * .6; ring.position.z = side * .7; this.crown.add(ring);
    }
    this.rescue = new THREE.Mesh(new THREE.TorusGeometry(3.1, .11, 6, 40), new THREE.MeshBasicMaterial({ color: '#f4b18c', transparent: true, opacity: .85 }));
    this.rescue.rotation.x = -Math.PI / 2; this.rescue.name = 'ship-rescue-ring'; this.group.add(this.rescue);
    const beam = (color: string) => {
      const line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: .95 })); this.group.add(line); return line;
    };
    this.ownBeam = beam('#a6f8f2'); this.ownBeam.name = 'ship-defense-pulse';
    this.enemyBeam = beam('#ff8478'); this.enemyBeam.name = 'pirate-pulse';
    this.enemy.visible = this.rescue.visible = this.ownBeam.visible = this.enemyBeam.visible = false;
  }
  sync(p: SpaceState, offset: THREE.Vector3, shipPosition: THREE.Vector3, reducedMotion: boolean): void {
    const b = latestBattle(p), local = b && p.location?.scale === 'orbit' && p.location.planetId === b.planetId && !p.leg;
    const deathAge = b?.end ? p.elapsed - b.end.at : 0;
    const military = b && (b.kind === 'invasion' || b.kind === 'defense'), warden = b?.kind === 'warden';
    this.crown.visible = warden;
    this.guard.visible = !!military || warden; this.enemy.name = warden ? 'silent-warden' : military ? 'empire-guard' : 'pirate-shard';
    this.trim.color.set(warden ? '#c1a9e8' : military ? EMPIRE_PROFILES[b.war!.empireId].color : '#e7685e');
    this.trim.emissive.set(warden ? '#c1a9e8' : military ? EMPIRE_PROFILES[b.war!.empireId].color : '#722f2b');
    (this.enemyBeam.material as THREE.LineBasicMaterial).color.set(warden ? '#c1a9e8' : military ? EMPIRE_PROFILES[b.war!.empireId].color : '#ff8478');
    this.enemy.visible = !!local && (!b.end || b.end.outcome === 'won' && deathAge >= 0 && deathAge < .4);
    if (b && this.enemy.visible) {
      this.enemy.position.set(b.enemy.pos.x, b.enemy.pos.y, b.enemy.pos.z).add(offset);
      this.enemy.rotation.set(0, Math.atan2(this.enemy.position.x - shipPosition.x, this.enemy.position.z - shipPosition.z), reducedMotion ? 0 : Math.sin(p.elapsed * 2) * .04);
      this.enemy.scale.setScalar(b.end ? reducedMotion ? .8 : Math.max(.05, 1 - deathAge / .4) : 1);
    }
    this.rescue.visible = p.ship?.health === 0;
    this.rescue.position.copy(shipPosition); this.rescue.rotation.z = reducedMotion ? 0 : p.elapsed * .8;
    const pulse = (line: THREE.Line, shot: SpacePulse | null) => {
      const age = shot ? p.elapsed - shot.at : -1;
      line.visible = !!local && !!shot && age >= 0 && age < .18;
      if (!line.visible || !shot) return;
      const points = line.geometry.getAttribute('position');
      points.setXYZ(0, shot.from.x + offset.x, shot.from.y + offset.y, shot.from.z + offset.z);
      points.setXYZ(1, shot.to.x + offset.x, shot.to.y + offset.y, shot.to.z + offset.z);
      points.needsUpdate = true; line.geometry.computeBoundingSphere();
    };
    pulse(this.ownBeam, b?.lastShot ?? null); pulse(this.enemyBeam, b?.lastHit ?? null);
  }
  dispose(): void { disposeObject(this.group); this.group.clear(); }
}
