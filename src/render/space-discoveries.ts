import * as THREE from 'three';
import type { StarSystem } from '../game/galaxy';
import type { SpaceState } from '../game/space-types';
import type { RelicId } from '../game/space-discoveries-types';
import { RELIC_IDS, RELICS, relicDiscovery, SOCIETY_POSITION, societyProgress, WORMHOLE_INDICES } from '../game/space-discoveries-content';
import { foreignGround } from '../game/space-life';
import { disposeObject } from './organism';

/** Original persistent models. Progress only toggles prebuilt geometry. */
export class SpaceDiscoveriesView {
  readonly group = new THREE.Group();
  private surface = new THREE.Group(); private portal = new THREE.Group();
  private signal = new THREE.Group(); private workshop = new THREE.Group(); private service = new THREE.Group();
  private relic: RelicId | undefined;
  private light = new THREE.MeshStandardMaterial({ color: '#a8e9d7', emissive: '#4ea594', emissiveIntensity: .35, roughness: .4 });
  constructor(readonly system: StarSystem, readonly societyPlanetId: string) {
    this.relic = RELIC_IDS.find(id => RELICS[id].index === system.index);
    const shell = new THREE.MeshStandardMaterial({ color: '#b9a889', roughness: .85 });
    const add = (parent: THREE.Group, geometry: THREE.BufferGeometry, x: number, y: number, z: number, material: THREE.Material = shell) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    };
    this.group.name = 'space-discoveries'; this.group.add(this.surface, this.portal);
    if (this.relic) {
      const spec = RELICS[this.relic], relic = new THREE.Group(); relic.name = `relic-${this.relic}`;
      relic.position.set(spec.x, foreignGround(system.seed, spec.x, spec.z), spec.z); this.surface.add(relic);
      const crystal = new THREE.MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: .3, roughness: .3, metalness: .3 });
      add(relic, new THREE.CylinderGeometry(2.5, 3.2, .7, 7), 0, .35, 0);
      if (this.relic === 'passage') {
        const ring = add(relic, new THREE.TorusGeometry(2.2, .4, 8, 24, Math.PI * 1.65), 0, 2.5, 0, crystal); ring.rotation.z = -.5;
        const inner = add(relic, new THREE.TorusGeometry(1.2, .22, 6, 20), 0, 2.5, 0, crystal); inner.rotation.y = Math.PI / 2;
      } else {
        for (const x of [-1.8, 1.8]) add(relic, new THREE.CylinderGeometry(.4, .75, 3, 5), x, 1.8, 0);
        add(relic, new THREE.OctahedronGeometry(1.3), 0, 3, 0, crystal);
        for (const z of [-1.4, 1.4]) add(relic, new THREE.BoxGeometry(3.8, .18, .35), 0, 1.5, z, crystal);
      }
      this.signal.position.set(0, 5.5, 0); relic.add(this.signal);
      add(this.signal, new THREE.TorusGeometry(.75, .08, 5, 20), 0, 0, 0, crystal);
    }
    if (system.planetId === societyPlanetId) {
      const town = new THREE.Group(); town.name = 'young-society'; town.position.set(SOCIETY_POSITION.x, foreignGround(system.seed, SOCIETY_POSITION.x, SOCIETY_POSITION.z), SOCIETY_POSITION.z); this.surface.add(town);
      for (const x of [-2, 2]) { add(town, new THREE.CylinderGeometry(1.3, 1.6, 1.8, 6), x, .9, 0); add(town, new THREE.ConeGeometry(1.8, 1.1, 6), x, 2.3, 0, this.light); }
      town.add(this.workshop, this.service);
      add(this.workshop, new THREE.BoxGeometry(3.2, 2.2, 2.4), 0, 1.1, -2.2);
      add(this.workshop, new THREE.TorusGeometry(.8, .16, 6, 16), 0, 3.3, -2.2, this.light);
      for (const x of [-3.5, 3.5]) {
        add(this.service, new THREE.CylinderGeometry(.12, .25, 3.5, 6), x, 1.75, 0);
        const sail = add(this.service, new THREE.SphereGeometry(1.4, 8, 4), x, 3.3, 0, this.light); sail.scale.set(1, .13, .8);
      }
      add(this.service, new THREE.TorusGeometry(1.1, .12, 6, 20), 0, 4.5, -2.2, this.light);
    }
    if (WORMHOLE_INDICES.some(index => index === system.index)) {
      // Keep the ring inside the clear canvas between both compact HUD panels.
      this.portal.name = 'wormhole'; this.portal.position.set(-5, 5, 7);
      const rim = new THREE.MeshStandardMaterial({ color: '#90c7ee', emissive: '#5e83bb', emissiveIntensity: .55, roughness: .35, metalness: .6 });
      add(this.portal, new THREE.TorusGeometry(4, .3, 8, 36), 0, 0, 0, rim);
      const inner = add(this.portal, new THREE.TorusGeometry(3.2, .12, 6, 30), 0, 0, 0, this.light); inner.rotation.y = Math.PI / 3;
      add(this.portal, new THREE.OctahedronGeometry(.65), 0, 0, 0, this.light);
    }
  }
  sync(p: SpaceState, reducedMotion: boolean) {
    const d = p.discoveries!, progress = societyProgress(d), l = p.location;
    this.surface.visible = l?.scale === 'surface' && (!p.leg || p.leg.elapsed < p.leg.duration * .8);
    this.portal.visible = l?.scale === 'system' && !!relicDiscovery(d, 'passage') && WORMHOLE_INDICES.some(index => index === this.system.index);
    this.signal.rotation.y = reducedMotion ? 0 : p.elapsed * .3;
    this.portal.rotation.z = reducedMotion ? 0 : p.elapsed * .1;
    this.workshop.visible = !!progress.shared; this.service.visible = !!progress.supported;
    this.light.emissiveIntensity = progress.supported ? .7 : .35;
    this.group.userData.discovery = { planetId: this.system.planetId, relic: this.relic ?? null, studied: this.relic ? !!relicDiscovery(d, this.relic) : false,
      society: this.system.planetId === d.society.planetId, shared: !!progress.shared, supported: !!progress.supported, wormhole: this.portal.visible };
  }
  dispose() { disposeObject(this.group); this.group.clear(); }
}
