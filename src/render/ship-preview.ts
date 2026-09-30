import * as THREE from 'three';
import type { ShipBlueprint } from '../game/ship-design';
import { createShip, animateShip } from './ship';
import { disposeObject } from './organism';

export class ShipPreview {
  private scene = new THREE.Scene(); private camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  private model: THREE.Group | null = null; private key = ''; private selection: THREE.BoxHelper | null = null; private selected: string | null = null;
  yaw = .65; pitch = .3; zoom = 11.5;
  constructor() { this.scene.background = new THREE.Color('#142d3c'); this.scene.add(new THREE.HemisphereLight('#ddffff', '#294f58', 3)); const light = new THREE.DirectionalLight('#ffe6b8', 3); light.position.set(-4, 7, -5); this.scene.add(light); }
  dispose() { disposeObject(this.scene); this.scene.clear(); this.model = null; this.selection = null; this.key = ''; }
  render(renderer: THREE.WebGLRenderer, b: ShipBlueprint, selected: string | null, rect: DOMRect) {
    const key = JSON.stringify(b), changed = key !== this.key;
    if (changed) { if (this.model) { disposeObject(this.model); this.scene.remove(this.model); } this.model = createShip(b); this.scene.add(this.model); this.key = key; }
    if (changed || this.selected !== selected) {
      this.selected = selected; if (this.selection) { disposeObject(this.selection); this.scene.remove(this.selection); this.selection = null; }
      const part = this.model!.children.find(p => p.userData.shipPart === selected); if (part) { this.selection = new THREE.BoxHelper(part, '#ffdda4'); this.scene.add(this.selection); }
    }
    animateShip(this.model!, 0, false, true);
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    this.camera.aspect = w / h; this.camera.position.set(Math.sin(this.yaw) * this.zoom * Math.cos(this.pitch), Math.sin(this.pitch) * this.zoom, Math.cos(this.yaw) * this.zoom * Math.cos(this.pitch)); this.camera.lookAt(0, 0, 0); this.camera.updateProjectionMatrix();
    renderer.setClearColor('#142d3c'); renderer.clear(); renderer.setViewport(rect.x, innerHeight - rect.y - h, w, h); renderer.setScissor(rect.x, innerHeight - rect.y - h, w, h); renderer.setScissorTest(true); renderer.render(this.scene, this.camera); renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  pick(x: number, y: number, rect: DOMRect): string | null { const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((x - rect.x) / rect.width * 2 - 1, -(y - rect.y) / rect.height * 2 + 1), this.camera); return ray.intersectObjects(this.model?.children ?? [], true).find(h => h.object.userData.shipPart)?.object.userData.shipPart ?? null; }
}
