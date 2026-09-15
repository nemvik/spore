import * as THREE from 'three';
import { groundHeight } from '../game/random';
import type { GameState } from '../game/types';

const MOTES_PER_FOLLOWER = 5;
const MAX_FOLLOWERS = 128; // The persisted world creature limit.

/** Small spores at the feet of wild moths currently following the final culture. */
export class MigrationCues {
  readonly mesh: THREE.InstancedMesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private disposed = false;

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(.075, 0),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: .76, depthTest: true, depthWrite: false, fog: true }),
      MAX_FOLLOWERS * MOTES_PER_FOLLOWER,
    );
    this.mesh.name = 'migration-spores';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Presentation cannot consume a click intended for a creature or food behind it.
    this.mesh.raycast = () => {};
    const lilac = new THREE.Color(0xc9badd), warm = new THREE.Color(0xe2cda7);
    for (let i = 0; i < this.mesh.instanceMatrix.count; i++) this.mesh.setColorAt(i, i % MOTES_PER_FOLLOWER === 0 ? warm : lilac);
    this.mesh.count = 0; this.mesh.visible = false;
  }

  update(s: GameState, time: number): void {
    if (this.disposed) return;
    let count = 0;
    const cargo = s.journey.cargo;
    if (s.stage === 2 && !s.journey.legacy && !s.campaign.won && cargo?.purpose === 'culture' && cargo.site === 8) {
      for (const creature of s.world.creatures) {
        if (creature.species !== 'gloom' || creature.target !== -1 || creature.intent !== 'forage') continue;
        if (count + MOTES_PER_FOLLOWER > this.mesh.instanceMatrix.count) break;
        for (let i = 0; i < MOTES_PER_FOLLOWER; i++) {
          const phase = time * .6 + creature.id * 2.399 + i * Math.PI * 2 / MOTES_PER_FOLLOWER;
          const radius = .68 + .12 * Math.sin(phase * 1.7 + i);
          const x = creature.pos.x + Math.cos(phase) * radius, z = creature.pos.z + Math.sin(phase) * radius;
          this.position.set(x, groundHeight(x, z, 2) + .21 + .1 * Math.sin(phase * 1.3), z);
          this.scale.setScalar(.8 + .2 * Math.sin(phase + i));
          this.matrix.compose(this.position, this.rotation, this.scale);
          this.mesh.setMatrixAt(count++, this.matrix);
        }
      }
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count) this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Detach before habitat disposal so geometry, material and instance buffers have one owner. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent(); this.mesh.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}
