import * as THREE from 'three';
import type { Creature, FoodKind, GameState, Resource, Vec3 } from '../game/types';
import { speciesById } from '../game/content';
import { journeyAction } from '../game/journey';
import { lineBlocked } from '../game/interactions';
import { distance, groundHeight } from '../game/random';
import { senseRange } from '../game/simulation';

const MOTE_COUNT = 20;

/** Three open petals identify an offered place without resembling an arrow or
 * a second edible resource. Shared for the preview and the actual meal. */
function budGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (let petal = 0; petal < 3; petal++) {
    const angle = petal * Math.PI * 2 / 3, start = positions.length / 3;
    for (let row = 0; row <= 12; row++) {
      const t = row / 12, radius = Math.sin(t * Math.PI) * .3;
      for (const side of [-1, 1]) {
        const width = .023 * Math.sin(t * Math.PI);
        positions.push(Math.cos(angle) * radius - Math.sin(angle) * side * width, (t - .5) * .82,
          Math.sin(angle) * radius + Math.cos(angle) * side * width);
      }
      if (row < 12) { const a = start + row * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeBoundingSphere(); return geometry;
}

/** World food is grounded by the renderer on land, including ordinary E offers. */
function visibleFoodY(s: GameState, pos: Vec3, kind: FoodKind, fraction = 1): number {
  if (s.stage !== 2) return pos.y;
  const scale = .3 + .7 * Math.min(1, fraction);
  return groundHeight(pos.x, pos.z, 2) + (kind === 'algae' ? .69 : kind === 'nectar' ? .37 : kind === 'detritus' ? .58 : .4) * scale;
}

/** One locally perceived meal and one real consumer; never inferred AI intent. */
export class FoodCues {
  readonly group = new THREE.Group();
  private readonly bud: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly motes: THREE.InstancedMesh<THREE.IcosahedronGeometry, THREE.MeshBasicMaterial>;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly matrix = new THREE.Matrix4();
  private disposed = false;

  constructor() {
    this.group.name = 'food-cues';
    this.bud = new THREE.Mesh(budGeometry(), new THREE.MeshBasicMaterial({ color: 0xe3ebc6, side: THREE.DoubleSide,
      transparent: true, opacity: .7, depthTest: true, depthWrite: false, fog: true }));
    this.bud.name = 'food-place-bud'; this.bud.raycast = () => {};
    this.motes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.065, 0),
      new THREE.MeshBasicMaterial({ color: 0xe3ebc6, transparent: true, opacity: .73, depthTest: true, depthWrite: false, fog: true }), MOTE_COUNT);
    this.motes.name = 'food-consumer-motes'; this.motes.frustumCulled = false; this.motes.raycast = () => {};
    this.motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.bud, this.motes); this.clear();
  }

  private clear(): void {
    this.group.visible = false; this.bud.visible = false; this.motes.visible = false; this.motes.count = 0;
    this.group.userData.resourceId = null; this.group.userData.creatureId = null; this.group.userData.preview = false;
  }

  private perceived(s: GameState, pos: Vec3, range: number): boolean {
    return distance(s.player.pos, pos) <= range && !lineBlocked(s, s.player.pos, pos);
  }

  private consumer(s: GameState, food: Resource, range: number, workerOnly: boolean): Creature | null {
    let chosen: Creature | null = null, best = Infinity;
    for (const c of s.world.creatures) {
      if (c.health <= 0 || c.intent !== 'forage' || c.target !== food.id || workerOnly && c.species !== 'mender') continue;
      const species = speciesById(c.species);
      if (!species.diet.includes(food.kind) || food.amount < (species.role === 'predator' && s.journey.version === 3 ? 1 : .5)) continue;
      if (!this.perceived(s, c.pos, range) || lineBlocked(s, food.pos, c.pos)) continue;
      const gap = distance(c.pos, food.pos);
      if (gap < best || gap === best && chosen && c.id < chosen.id) { chosen = c; best = gap; }
    }
    return chosen;
  }

  update(s: GameState, time: number): void {
    if (this.disposed) return;
    this.clear();
    if (s.journey.legacy || s.player.health <= 0 || s.deathReason) return;
    const range = senseRange(s), cargo = s.journey.cargo;
    if (cargo) {
      const action = journeyAction(s, true);
      if (!action?.ready || action.operation !== 'offer' || !this.perceived(s, action.pos, range)) return;
      this.group.visible = this.bud.visible = true; this.group.userData.preview = true;
      this.bud.position.set(action.pos.x, visibleFoodY(s, action.pos, cargo.kind), action.pos.z);
      this.bud.material.opacity = .48; return;
    }

    let food: Resource | null = null, consumer: Creature | null = null;
    const canopy = s.journey.canopy;
    if (s.stage === 1 && canopy?.releasedAt === null) {
      const crust = s.world.resources.find(r => r.id === canopy.crustId && r.amount >= .5);
      if (crust && this.perceived(s, crust.pos, range)) {
        consumer = this.consumer(s, crust, range, true);
        if (consumer) food = crust;
      }
    }
    // The newest visible offer keeps focus until it expires or is removed. An
    // older unrelated consumer cannot make a fresh, unanswered offer look used.
    if (!food) for (let i = s.journey.offerings.length - 1; i >= 0; i--) {
      const offer = s.journey.offerings[i];
      if (offer.stage !== s.stage || offer.remaining <= 0) continue;
      const resource = s.world.resources.find(r => r.id === offer.id && r.amount >= .5);
      if (!resource || !this.perceived(s, resource.pos, range)) continue;
      food = resource; consumer = this.consumer(s, resource, range, false); break;
    }
    if (!food) return;
    this.group.visible = this.bud.visible = true; this.group.userData.resourceId = food.id;
    this.bud.position.set(food.pos.x, visibleFoodY(s, food.pos, food.kind, food.amount / food.max), food.pos.z);
    this.bud.material.opacity = .74;
    if (!consumer) return;
    this.group.userData.creatureId = consumer.id;
    this.from.copy(this.bud.position); this.to.set(consumer.pos.x, consumer.pos.y, consumer.pos.z);
    if (this.from.distanceToSquared(this.to) < .36) return;
    const phase = Number.isFinite(time) ? time * .18 : 0;
    for (let i = 0; i < MOTE_COUNT; i++) {
      const t = ((i / MOTE_COUNT + phase) % 1 + 1) % 1, arc = Math.sin(t * Math.PI);
      this.position.lerpVectors(this.from, this.to, t);
      this.position.y += arc * .16;
      this.scale.setScalar(.45 + arc * .65);
      this.matrix.compose(this.position, this.rotation, this.scale); this.motes.setMatrixAt(i, this.matrix);
    }
    this.motes.count = MOTE_COUNT; this.motes.visible = true; this.motes.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent(); this.group.clear();
    this.motes.dispose(); this.motes.geometry.dispose(); this.motes.material.dispose();
    this.bud.geometry.dispose(); this.bud.material.dispose();
  }
}
