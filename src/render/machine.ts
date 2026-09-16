import * as THREE from 'three';
import { attachmentAngles } from '../game/anatomy';
import { vehicleStats } from '../game/blueprint';
import type { VehicleBlueprint, VehiclePart } from '../game/blueprint';
import { attachmentOnBody } from './organism';

type Motion = { node: THREE.Object3D; kind: 'rotor' | 'drill' | 'wheel' | 'tread' | 'pulse'; phase: number; reach: number };
type Palette = ReturnType<typeof palette>;
type Dimensions = { x: number; y: number; z: number; tank: boolean };

function palette(hue: number) {
  const amber = new THREE.Color().setHSL((((hue % 360) + 360) % 360) / 360, .48, .51);
  const material = (color: THREE.ColorRepresentation, metalness = .25) => new THREE.MeshStandardMaterial({ color, metalness, roughness: .58 });
  return {
    shell: material(amber), trim: material(amber.clone().offsetHSL(.02, -.17, .23)),
    metal: material(0x7b8476, .6), dark: material(0x283c38, .2),
    glass: new THREE.MeshStandardMaterial({ color: 0x8dd0bd, emissive: 0x26443e, emissiveIntensity: .4, metalness: .4, roughness: .24 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xd9f1a4, emissive: 0xa8cd72, emissiveIntensity: .55, roughness: .4 }),
  };
}
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material); result.position.set(x, y, z); result.castShadow = true; result.receiveShadow = true; parent.add(result); return result;
}
function box(parent: THREE.Object3D, p: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
  return mesh(parent, new THREE.BoxGeometry(sx, sy, sz), p, x, y, z);
}
function surface(axial: number, angle: number, d: Dimensions): THREE.Vector3 {
  const a = THREE.MathUtils.clamp(axial, -1, 1), profile = d.tank ? Math.pow(Math.max(0, 1 - a ** 6), 1 / 6) : Math.sqrt(Math.max(0, 1 - a * a));
  const radial = (n: number) => d.tank ? Math.sign(n) * Math.sqrt(Math.abs(n)) : n;
  return new THREE.Vector3(radial(Math.sin(angle)) * d.x * profile, radial(Math.cos(angle)) * d.y * profile, a * d.z);
}

/** Hull UVs use the organism editor's circumference/axial convention. */
function hullGeometry(d: Dimensions, hue: THREE.Color, pattern: number): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [], rings = 32, sides = 40;
  const light = hue.clone().offsetHSL(.02, -.16, .23);
  for (let i = 0; i <= rings; i++) {
    const axial = i / rings * 2 - 1;
    for (let j = 0; j <= sides; j++) {
      const angle = j / sides * Math.PI * 2, point = surface(axial, angle, d);
      positions.push(point.x, point.y, point.z); uvs.push(j / sides, i / rings);
      const stripe = pattern === 1 ? Math.cos(axial * Math.PI * 6) > .65 : pattern === 2 ? Math.cos(axial * Math.PI * 5 + Math.abs(Math.sin(angle)) * 6) > .6 : pattern === 3 && Math.sin(axial * 15) * Math.cos(angle * 4) > .3;
      const color = (stripe ? light : hue).clone().multiplyScalar(.88 + .12 * Math.cos(angle)); colors.push(color.r, color.g, color.b);
      if (i < rings && j < sides) { const k = i * (sides + 1) + j; indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function tracks(root: THREE.Group, d: Dimensions, p: Palette, motions: Motion[]): void {
  const reach = d.z * .65;
  for (const side of [-1, 1]) {
    const track = new THREE.Group(); track.position.x = side * (d.x + .13); root.add(track);
    box(track, p.dark, 0, .12, 0, .4, .54, reach * 2);
    for (const z of [-reach, reach]) { const end = mesh(track, new THREE.CylinderGeometry(.27, .27, .4, 12), p.dark, 0, .12, z); end.rotation.z = Math.PI / 2; }
    for (let i = 0; i < 5; i++) {
      const wheel = new THREE.Group(); wheel.position.set(side * .23, .12, (i / 4 * 2 - 1) * reach); track.add(wheel);
      const disc = mesh(wheel, new THREE.CylinderGeometry(.22, .22, .055, 10), p.metal); disc.rotation.z = Math.PI / 2;
      box(wheel, p.trim, side * .04, 0, 0, .025, .28, .055); motions.push({ node: wheel, kind: 'wheel', phase: 0, reach: 0 });
    }
    for (let i = 0; i < 16; i++) {
      const tread = box(track, p.trim, 0, 0, 0, .47, .075, .18); tread.name = 'track-tread';
      motions.push({ node: tread, kind: 'tread', phase: i / 16 * Math.PI * 2, reach });
    }
  }
}

function attachment(root: THREE.Group, part: VehiclePart, d: Dimensions, p: Palette, motions: Motion[]): void {
  switch (part.kind) {
    case 'hull': break;
    case 'cabin': {
      const cabin = mesh(root, new THREE.CylinderGeometry(.48, .65, .68, 4), p.shell, 0, .32); cabin.rotation.y = Math.PI / 4; cabin.scale.z = 1.25;
      box(root, p.glass, 0, .40, .49, .62, .32, .08); box(root, p.trim, 0, .73, 0, .78, .13, .95);
      for (const side of [-1, 1]) box(root, p.glass, side * .49, .4, 0, .055, .27, .44);
      break;
    }
    case 'tracks': tracks(root, d, p, motions); break;
    case 'rotor': {
      mesh(root, new THREE.CylinderGeometry(.12, .2, .63, 10), p.metal, 0, .3);
      const rotor = new THREE.Group(); rotor.position.y = .65; rotor.name = 'rotor'; root.add(rotor);
      mesh(rotor, new THREE.SphereGeometry(.23, 10, 6), p.trim);
      for (let i = 0; i < 3; i++) { const blade = new THREE.Group(); blade.rotation.y = i * Math.PI * 2 / 3; rotor.add(blade); box(blade, p.dark, 1.12, 0, 0, 2.05, .065, .24); box(blade, p.trim, 1.98, .015, 0, .25, .07, .25); }
      motions.push({ node: rotor, kind: 'rotor', phase: 0, reach: 0 }); break;
    }
    case 'drill': {
      box(root, p.metal, 0, .17, .15, .68, .36, .65);
      const drill = new THREE.Group(); drill.position.set(0, .20, .4); drill.name = 'drill'; root.add(drill);
      const tip = mesh(drill, new THREE.ConeGeometry(.34, 1.15, 12), p.dark, 0, 0, .56); tip.rotation.x = Math.PI / 2;
      const points = Array.from({ length: 49 }, (_, i) => { const t = i / 48, r = .35 * (1 - t) + .025, a = t * Math.PI * 6; return new THREE.Vector3(Math.sin(a) * r, Math.cos(a) * r, t * 1.1); });
      mesh(drill, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, .04, 5, false), p.trim);
      motions.push({ node: drill, kind: 'drill', phase: 0, reach: 0 }); break;
    }
    case 'seeder': {
      box(root, p.metal, 0, .12, 0, 1.18, .18, .72);
      for (const x of [-.4, 0, .4]) {
        const tank = mesh(root, new THREE.SphereGeometry(.3, 10, 7), p.glass, x, .4); tank.scale.set(.8, 1.35, 1);
        mesh(root, new THREE.ConeGeometry(.15, .32, 8), p.trim, x, .09, .46).rotation.x = Math.PI / 2;
      }
      const seed = mesh(root, new THREE.OctahedronGeometry(.19), p.glow, 0, .76); motions.push({ node: seed, kind: 'pulse', phase: 0, reach: 0 }); break;
    }
    case 'cannon': {
      mesh(root, new THREE.CylinderGeometry(.4, .5, .25, 10), p.metal, 0, .14);
      box(root, p.shell, 0, .4, .05, .72, .48, .65);
      const barrel = mesh(root, new THREE.CylinderGeometry(.13, .19, 1.22, 10), p.dark, 0, .41, .86); barrel.rotation.x = Math.PI / 2;
      const muzzle = mesh(root, new THREE.TorusGeometry(.15, .055, 6, 12), p.trim, 0, .41, 1.48); muzzle.name = 'cannon-muzzle'; break;
    }
    case 'broadcast': {
      mesh(root, new THREE.CylinderGeometry(.07, .14, 1.12, 8), p.metal, 0, .52);
      mesh(root, new THREE.CylinderGeometry(.61, .14, .35, 14, 1, true), p.trim, 0, 1.05);
      const rim = mesh(root, new THREE.TorusGeometry(.6, .045, 6, 20), p.metal, 0, 1.22); rim.rotation.x = Math.PI / 2;
      const beacon = mesh(root, new THREE.SphereGeometry(.17, 10, 7), p.glow, 0, 1.30); motions.push({ node: beacon, kind: 'pulse', phase: .7, reach: 0 }); break;
    }
    case 'armor': {
      const plate = mesh(root, new THREE.CylinderGeometry(.67, .71, .16, 6), p.metal, 0, .12); plate.scale.z = 1.25;
      for (const x of [-.39, .39]) for (const z of [-.38, .38]) mesh(root, new THREE.SphereGeometry(.065, 6, 4), p.trim, x, .23, z);
      break;
    }
    default: { const exhaustive: never = part.kind; void exhaustive; }
  }
}

/** One construction path for both editor and fleet; each instance owns its resources. */
export function createMachine(g: VehicleBlueprint): THREE.Group {
  const model = new THREE.Group(), visual = new THREE.Group(), p = palette(g.hue), motions: Motion[] = [];
  model.name = g.name; model.add(visual);
  const hull = g.parts.find(part => part.kind === 'hull'), hullScale = hull?.scale ?? 1;
  const base: Dimensions = { x: g.width * .95, y: g.width * (g.carrier === 'tank' ? .45 : .56), z: g.length * 1.65, tank: g.carrier === 'tank' };
  const dimensions: Dimensions = { ...base, x: base.x * hullScale, y: base.y * hullScale, z: base.z * hullScale };
  visual.position.z = (hull?.axial ?? 0) * base.z * .5; visual.rotation.z = -(hull?.angle ?? 0);
  const owned: THREE.Material[] = Object.values(p);
  for (const part of g.parts) {
    const angles = part.kind === 'hull' ? [0] : attachmentAngles(part);
    for (const angle of angles) {
      const root = new THREE.Group(); root.name = `machine-${part.kind}`; root.userData.partId = part.id; root.userData.kind = part.kind; root.scale.setScalar(part.scale); visual.add(root);
      if (part.kind === 'hull') {
        const mat = p.shell.clone(); mat.color.setHex(0xffffff); mat.vertexColors = true; owned.push(mat);
        const body = mesh(root, hullGeometry(base, p.shell.color, g.pattern), mat); body.name = 'machine-surface';
        model.userData.attachmentSurface ??= body;
        if (g.carrier === 'air') for (const side of [-1, 1]) { const wing = box(root, p.trim, side * base.x, -.12, -.4 * base.z, 1.2, .1, .72); wing.rotation.z = side * -.15; }
      } else {
        root.position.copy(surface(THREE.MathUtils.clamp(part.axial, -.93, .93), angle, dimensions)); root.rotation.z = -angle;
        attachment(root, part, dimensions, p, motions);
      }
    }
  }
  model.userData.visual = visual; model.userData.motions = motions; model.userData.ownedMaterials = owned; model.userData.vehicleStats = vehicleStats(g);
  animateMachine(model, 0, 0, false); model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(), new THREE.Vector3());
  model.userData.groundClearance = Math.max(0, -bounds.min.y);
  model.userData.bounds = bounds;
  return model;
}

export function animateMachine(model: THREE.Group, time: number, speed: number, active: boolean): void {
  const clock = Number.isFinite(time) ? time : 0, movement = Number.isFinite(speed) ? THREE.MathUtils.clamp(speed, -40, 40) : 0;
  for (const motion of (model.userData.motions ?? []) as Motion[]) {
    const node = motion.node;
    if (motion.kind === 'rotor') node.rotation.y = clock * (6 + Math.abs(movement) * 2);
    else if (motion.kind === 'drill') node.rotation.z = active ? clock * 14 : 0;
    else if (motion.kind === 'wheel') node.rotation.x = clock * movement * 3;
    else if (motion.kind === 'tread') {
      const phase = motion.phase + clock * movement * 1.8;
      node.position.y = .12 + Math.sin(phase) * .31; node.position.z = Math.cos(phase) * (motion.reach + .27); node.rotation.x = phase;
    } else node.scale.setScalar(active ? 1 + .16 * Math.sin(clock * 8 + motion.phase) : 1);
  }
}

export function machineAttachmentOnBody(model: THREE.Group, raycaster: THREE.Raycaster): { axial: number; angle: number } | null {
  return attachmentOnBody(model, raycaster);
}
