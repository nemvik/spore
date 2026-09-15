import * as THREE from 'three';
import { groundHeight } from '../game/random';
import type { Obstacle, Stage, World } from '../game/types';
import { isElevatedShelf } from './habitat';

function footprint(obstacle: Obstacle, stage: Stage): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const segments = 32, width = Math.min(.1, obstacle.radius * .04), shelf = isElevatedShelf(obstacle, stage);
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    for (const radius of [obstacle.radius - width, obstacle.radius]) {
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      // Micro organisms collide horizontally at their swimming plane. A ring on
      // the distant seabed suggests a gap beneath a tapered mineral pillar.
      // A suspended roof is outlined at its underside, never on the open floor.
      const height = stage === 0 ? 1.1 : shelf ? obstacle.pos.y : groundHeight(obstacle.pos.x + x, obstacle.pos.z + z, stage) + .065;
      positions.push(x, height - obstacle.pos.y, z);
    }
    if (i < segments) { const first = i * 2; indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ color: stage === 2 ? 0x52614d : 0x829799, transparent: true, opacity: 0, depthWrite: false, side: shelf ? THREE.DoubleSide : THREE.FrontSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `collision-footprint-${obstacle.id}`;
  mesh.position.set(obstacle.pos.x, obstacle.pos.y, obstacle.pos.z);
  mesh.visible = false;
  return mesh;
}

/** Owned by the habitat group and disposed with it; no contour changes the world or the occlusion bounds. */
export class ObstacleContours {
  readonly group = new THREE.Group();
  private readonly obstacles: Map<number, Obstacle>;
  private readonly meshes = new Map<number, THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>();
  constructor(world: World) {
    this.group.name = 'collision-footprints';
    this.obstacles = new Map(world.obstacles.map(obstacle => [obstacle.id, obstacle]));
    this.stage = world.stage;
  }
  private readonly stage: Stage;

  remove(id: number): void {
    this.obstacles.delete(id);
    const mesh = this.meshes.get(id); if (!mesh) return;
    this.group.remove(mesh); this.meshes.delete(id);
    mesh.geometry.dispose(); mesh.material.dispose();
  }

  setFade(id: number | undefined, objectOpacity: number): void {
    if (id === undefined) return;
    const obstacle = this.obstacles.get(id); if (!obstacle) return;
    let mesh = this.meshes.get(id);
    const faded = objectOpacity < .98;
    if (!mesh && !faded) return;
    if (!mesh) { mesh = footprint(obstacle, this.stage); this.meshes.set(id, mesh); this.group.add(mesh); }
    mesh.visible = faded;
    mesh.material.opacity = .72 * (1 - THREE.MathUtils.clamp(objectOpacity, 0, 1));
  }
}
