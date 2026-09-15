import * as THREE from 'three';
import type { GameState } from '../game/types';
import { reefBodyProfile } from '../game/reef-body';
import { reefWater } from '../game/journey-network';
import { lineBlocked } from '../game/interactions';

const COUNT = 24, LOCAL_COUNT = 32;
const Y = new THREE.Vector3(0, 1, 0);
const CLEAR = new THREE.Color(0xd4f4df), GAS = new THREE.Color(0xcc926e);

function localGasGeometry(): THREE.BufferGeometry {
  const pieces = [new THREE.IcosahedronGeometry(.22, 0), new THREE.IcosahedronGeometry(.16, 0).translate(.25, .08, .02), new THREE.IcosahedronGeometry(.14, 0).translate(-.17, -.16, .05)];
  const positions = new Float32Array(pieces.reduce((length, piece) => length + piece.getAttribute('position').count * 3, 0));
  let offset = 0;
  for (const piece of pieces) {
    const attribute = piece.getAttribute('position');
    for (let i = 0; i < attribute.count; i++) { positions[offset++] = attribute.getX(i); positions[offset++] = attribute.getY(i); positions[offset++] = attribute.getZ(i); }
    piece.dispose();
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
}

/** The existing soft crown opens; null restores the historical/editor rest pose. */
export function setReefFilterOpening(model: THREE.Group, pumping: number | null): void {
  const visual = model.userData.visual as THREE.Group | undefined;
  if (!visual) return;
  const open = pumping === null ? 1 : THREE.MathUtils.clamp(pumping, 0, 1);
  for (const root of visual.children) if (root.userData.kind === 'filter' && root.children[0]) {
    root.children[0].scale.set(pumping === null ? 1 : .35 + open * .65, pumping === null ? 1 : .55 + open * .45, 1);
  }
}

/** Local intake at the actual placed filter. No new food, target or saved state. */
export class ReefFilterCues {
  readonly group = new THREE.Group();
  private readonly motes: THREE.InstancedMesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private readonly localGas: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private model: THREE.Group | null = null;
  private filters: THREE.Object3D[] = [];
  private readonly point = new THREE.Vector3();
  private readonly inlet = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly transform = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private disposed = false;

  constructor() {
    this.group.name = 'reef-filter-cues'; this.group.visible = false;
    this.motes = new THREE.InstancedMesh(new THREE.ConeGeometry(.045, .22, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, depthTest: true, depthWrite: false, fog: true }), COUNT);
    this.motes.name = 'filter-intake'; this.motes.frustumCulled = false; this.motes.raycast = () => {};
    this.motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.motes);
    this.localGas = new THREE.InstancedMesh(localGasGeometry(),
      new THREE.MeshBasicMaterial({ color: GAS, transparent: true, opacity: .68, depthTest: true, depthWrite: false, fog: true }), LOCAL_COUNT);
    this.localGas.name = 'filter-local-gas'; this.localGas.frustumCulled = false; this.localGas.raycast = () => {};
    this.localGas.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.localGas);
  }

  /** A bounded local sample makes the clearing legible from the normal camera.
   * Sample positions never depend on pumping: opening the crown changes their
   * actual chemistry/size, including when the reduced-motion clock is frozen. */
  private updateLocalGas(s: GameState, clock: number): boolean {
    let visible = false;
    for (let i = 0; i < LOCAL_COUNT; i++) {
      const band = i < 12 ? 0 : i < 24 ? 1 : 2;
      const radius = (band === 0 ? 1.4 : band === 1 ? 3.2 : 4.9) + Math.sin(i * 4.7) * .16;
      const angle = i * 2.3999632297 + clock * .08;
      const y = Math.sin(i * 1.7) * (.45 + band * .55) + Math.sin(clock * .65 + i) * .14;
      this.point.set(s.player.pos.x + Math.cos(angle) * radius, s.player.pos.y + y, s.player.pos.z + Math.sin(angle) * radius);
      const gas = reefWater(s, this.point).oxygenUse;
      const scale = gas > 0 && !lineBlocked(s, s.player.pos, this.point) ? Math.min(1, gas / 5) : 0;
      this.transform.position.copy(this.point); this.transform.rotation.set(i * .7, i * 1.3 + clock * .1, i * .4);
      this.transform.scale.setScalar(scale); this.transform.updateMatrix(); this.localGas.setMatrixAt(i, this.transform.matrix);
      visible ||= scale > 0;
    }
    this.localGas.instanceMatrix.needsUpdate = true; this.localGas.visible = visible;
    return visible;
  }

  update(s: GameState, time: number, model: THREE.Group): void {
    this.group.visible = false; this.motes.visible = false; this.localGas.visible = false;
    if (this.disposed || s.stage !== 1 || s.journey.legacy || !s.journey.reefEvolution
      || s.player.health <= 0 || s.deathReason) return;
    const clock = Number.isFinite(time) ? time : 0;
    this.group.visible = this.updateLocalGas(s, clock);
    if (s.journey.reefEvolution.pumping <= .01) return;
    if (this.model !== model) {
      this.model = model; this.filters = [];
      model.traverse(node => { if (node.userData.kind === 'filter') this.filters.push(node); });
    }
    if (!this.filters.length) return;
    const pumping = s.journey.reefEvolution.pumping, profile = reefBodyProfile(s.player.genome, pumping);
    if (profile.purification <= 0) return;
    model.updateMatrixWorld(true);
    const radius = Math.min(2.5, profile.filterRadius * .75);
    for (let i = 0; i < COUNT; i++) {
      const filter = this.filters[i % this.filters.length];
      // Coordinates are in the attachment's frame, including mirrored placement,
      // organ scale and the body's live swimming pose.
      const phase = ((clock * (.7 + pumping * .3) + Math.floor(i / 3) / 8) % 1 + 1) % 1;
      const spread = (1 - phase) * radius, angle = (i % 3) * Math.PI * 2 / 3 + Math.floor(i / 3) * .21;
      this.inlet.set(0, .45, .12).applyMatrix4(filter.matrixWorld);
      this.point.set(Math.cos(angle) * spread * .5, .45 + spread, .12 + Math.sin(angle) * spread * .5).applyMatrix4(filter.matrixWorld);
      const blocked = lineBlocked(s, this.inlet, this.point);
      this.direction.subVectors(this.inlet, this.point).normalize();
      this.transform.position.copy(this.point); this.transform.quaternion.setFromUnitVectors(Y, this.direction);
      const taper = Math.sin(phase * Math.PI) * pumping;
      this.transform.scale.setScalar(blocked ? 0 : .6 + taper * .65);
      this.transform.updateMatrix(); this.motes.setMatrixAt(i, this.transform.matrix);
      this.color.copy(CLEAR).lerp(GAS, Math.min(1, reefWater(s, this.point).oxygenUse / 5));
      this.motes.setColorAt(i, this.color);
    }
    this.motes.instanceMatrix.needsUpdate = true;
    if (this.motes.instanceColor) this.motes.instanceColor.needsUpdate = true;
    this.motes.material.opacity = .3 + pumping * .55;
    this.motes.visible = true; this.group.visible = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.group.removeFromParent(); this.group.clear(); this.filters = []; this.model = null;
    this.motes.dispose(); this.motes.geometry.dispose(); this.motes.material.dispose();
    this.localGas.dispose(); this.localGas.geometry.dispose(); this.localGas.material.dispose();
  }
}
