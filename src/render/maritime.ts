import * as THREE from 'three';
import type { GameState } from '../game/types';
import { atSea, seaJourney } from '../game/maritime';
import { planetAtlas, wrapLongitude } from '../game/planet-geography';
import { createMachine, animateMachine } from './machine';
import { createOrganism, animateOrganism, disposeObject } from './organism';

/** A compressed route diagram in water, not another geographic simulation. */
export class MaritimeRenderer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(45, 1, .1, 700);
  private identity = '';
  private boat: THREE.Group | null = null;
  private passenger: THREE.Group | null = null;
  private points: THREE.Vector3[] = [];
  private wake: THREE.Mesh | null = null;
  private waves: THREE.LineSegments | null = null;
  private size = new THREE.Vector2();
  private focus = new THREE.Vector3();
  private journeyId: number | null = null;
  private progress = 0;

  cameraState() {
    return { maritime: true, journeyId: this.journeyId, progress: this.progress,
      position: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      focus: { x: this.focus.x, y: this.focus.y, z: this.focus.z },
      boat: this.boat ? { x: this.boat.position.x, y: this.boat.position.y, z: this.boat.position.z } : null };
  }

  dispose(): void {
    disposeObject(this.scene); this.scene.clear(); this.identity = ''; this.boat = null;
    this.passenger = null; this.points = []; this.wake = null; this.waves = null;
    this.journeyId = null; this.progress = 0;
  }

  render(renderer: THREE.WebGLRenderer, s: GameState, yaw: number, pitch: number, zoom: number): void {
    const journey = seaJourney(s), vessel = s.maritime?.vessel;
    if (!atSea(s) || !journey || !vessel || !s.homePlanet) { if (this.boat) this.dispose(); return; }
    const identity = JSON.stringify([s.id, vessel.id, vessel.blueprint, journey.id, journey.route, s.player.genome]);
    if (identity !== this.identity) {
      this.dispose(); this.identity = identity;
      this.scene.background = new THREE.Color('#a8cdd0');
      this.scene.fog = new THREE.Fog('#a8cdd0', 65, 240);
      this.scene.add(new THREE.HemisphereLight('#e7ffff', '#376870', 2.6));
      const light = new THREE.DirectionalLight('#fff2d0', 3); light.position.set(-20, 35, 12); this.scene.add(light);

      const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: '#216d80', roughness: .36, metalness: .22 }));
      sea.rotation.x = -Math.PI / 2; sea.position.y = -.12; this.scene.add(sea);
      const atlas = planetAtlas(s.homePlanet)!;
      this.points = journey.route.map((cellId, i) => {
        if (!i) return new THREE.Vector3(0, .025, 0);
        const here = atlas.cells[cellId], previous = atlas.cells[journey.route[i - 1]];
        return new THREE.Vector3(wrapLongitude(here.longitude - previous.longitude) / 5 * 5, 0, (previous.latitude - here.latitude) / 5 * 5);
      });
      for (let i = 1; i < this.points.length; i++) this.points[i].add(this.points[i - 1]);
      const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.points), new THREE.LineDashedMaterial({ color: '#b0e5ce', dashSize: .6, gapSize: .4, transparent: true, opacity: .75 }));
      route.computeLineDistances(); this.scene.add(route);
      for (const [index, color] of [[0, '#e4c583'], [this.points.length - 1, '#9adcaa']] as const) {
        // Endpoint symbols represent the two actual coast cells, not generated islands.
        const coast = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, .35, 24), new THREE.MeshStandardMaterial({ color, roughness: .9 }));
        coast.position.copy(this.points[index]); coast.position.y = -.05; this.scene.add(coast);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(2.5, .065, 5, 40), new THREE.MeshBasicMaterial({ color }));
        rim.rotation.x = -Math.PI / 2; rim.position.copy(this.points[index]); rim.position.y = .2; this.scene.add(rim);
      }
      const wavePoints: THREE.Vector3[] = [];
      for (let x = -40; x <= 40; x += 5) for (let z = -40; z <= 40; z += 5) {
        const offset = Math.sin(x * .7 + z) * 1.4;
        wavePoints.push(new THREE.Vector3(x + offset, 0, z), new THREE.Vector3(x + offset + 1.4, 0, z + .3));
      }
      this.waves = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wavePoints), new THREE.LineBasicMaterial({ color: '#6eb6c0', transparent: true, opacity: .24 }));
      this.waves.position.y = -.075; this.scene.add(this.waves);

      this.boat = createMachine(vessel.blueprint); this.boat.name = 'paid-expedition-boat'; this.scene.add(this.boat);
      this.passenger = createOrganism(s.player.genome); this.passenger.name = `expedition-passenger-${s.player.genome.name}`;
      const bounds = new THREE.Box3().setFromObject(this.passenger), span = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const scale = Math.min(.5, .9 / Math.max(span.x, span.z, .1));
      this.passenger.scale.setScalar(scale);
      this.passenger.position.set(-center.x * scale, .33 - bounds.min.y * scale, -.8 - center.z * scale);
      (this.boat.userData.visual as THREE.Group).add(this.passenger);

      const wakeShape = new THREE.Shape(); wakeShape.moveTo(-.3, 0); wakeShape.lineTo(-1.3, -4); wakeShape.lineTo(1.3, -4); wakeShape.lineTo(.3, 0); wakeShape.closePath();
      const wakeGeometry = new THREE.ShapeGeometry(wakeShape); wakeGeometry.rotateX(-Math.PI / 2);
      this.wake = new THREE.Mesh(wakeGeometry, new THREE.MeshBasicMaterial({ color: '#c3e8df', transparent: true, opacity: .24, depthWrite: false, side: THREE.DoubleSide }));
      this.scene.add(this.wake);
    }

    const total = this.points.length - 1, progress = THREE.MathUtils.clamp(journey.progress, 0, total);
    const index = Math.min(Math.floor(progress), total - 1), fraction = progress - index;
    const from = this.points[index], to = this.points[index + 1], returning = journey.phase === 'returning';
    this.boat!.position.lerpVectors(from, to, fraction); this.boat!.position.y = .04;
    this.boat!.rotation.y = Math.atan2(to.x - from.x, to.z - from.z) + (returning ? Math.PI : 0);
    const underway = returning ? progress > 1e-8 : progress < total - 1e-8;
    // Saved active seconds drive all motion; pause/load never introduce wall-clock advance.
    animateMachine(this.boat!, journey.elapsed, underway ? 2 : 0, underway);
    animateOrganism(this.passenger!, journey.elapsed, 0, 0, 2, 0);
    this.wake!.visible = underway;
    this.wake!.position.copy(this.boat!.position); this.wake!.position.y = -.04;
    this.wake!.rotation.y = this.boat!.rotation.y + Math.PI;
    this.waves!.position.x = Math.floor(this.boat!.position.x / 5) * 5;
    this.waves!.position.z = Math.floor(this.boat!.position.z / 5) * 5;
    this.journeyId = journey.id; this.progress = progress;

    renderer.getSize(this.size);
    const width = Math.max(1, this.size.x), height = Math.max(1, this.size.y);
    this.camera.aspect = width / height;
    // Center in the area to the right of the persistent 350px command panel.
    this.camera.setViewOffset(width, height, -Math.min(350, width * .35) / 2, 0, width, height);
    const distance = THREE.MathUtils.clamp(Number.isFinite(zoom) ? zoom * .6 : 15, 9, 36);
    const orbitYaw = Number.isFinite(yaw) ? yaw : .6, orbitPitch = THREE.MathUtils.clamp(Number.isFinite(pitch) ? pitch : .55, .22, 1.25);
    this.focus.copy(this.boat!.position); this.focus.y += .5;
    this.camera.position.set(this.focus.x + Math.sin(orbitYaw) * distance * Math.cos(orbitPitch), this.focus.y + distance * Math.sin(orbitPitch), this.focus.z + Math.cos(orbitYaw) * distance * Math.cos(orbitPitch));
    this.camera.lookAt(this.focus); this.camera.updateProjectionMatrix();
    renderer.render(this.scene, this.camera);
  }
}
