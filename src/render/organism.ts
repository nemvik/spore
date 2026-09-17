import { bodySection } from '../game/body-shape';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AdaptationId, Genome, Part, Species, Stage, SpineNode } from '../game/types';
import { attachmentAngles, attachmentPoint, LEG_SOLE_REACH, organismGroundClearance } from '../game/anatomy';
export { organismGroundClearance } from '../game/anatomy';

type MotionKind = 'body'|'fin'|'tail'|'leg'|'knee'|'flagellum'|'gill'|'jaw'|'feelers'|'pulse'|'eye'|'tentacle';
interface Motion { node: THREE.Object3D; kind: MotionKind; phase: number; rest: THREE.Vector3; side: number; ceilingPoints?: Float32Array }
interface LegStance { hip: THREE.Group; knee: THREE.Group; solePoints: Float32Array; groundY: number; phase: number }
const stancePoint = new THREE.Vector3();
const stanceHipMatrix = new THREE.Matrix4();
const stanceKneeMatrix = new THREE.Matrix4();
interface Palette { skin: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; light: THREE.MeshStandardMaterial; glow: THREE.MeshStandardMaterial; membrane: THREE.MeshStandardMaterial; pearl: THREE.MeshStandardMaterial; pupil: THREE.MeshStandardMaterial }

function material(color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000, intensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: .36, metalness: .12, emissive, emissiveIntensity: intensity });
}
function palette(hue: number): Palette {
  const skin = new THREE.Color().setHSL((((hue % 360) + 360) % 360) / 360, .60, .43);
  const light = skin.clone().offsetHSL(.03, -.13, .23);
  const glow = new THREE.Color().setHSL((hue / 360 + .16) % 1, .82, .68);
  const membrane = material(light, skin, .14);
  membrane.side = THREE.DoubleSide;
  return { skin: material(skin), dark: material(skin.clone().multiplyScalar(.40)), light: material(light), glow: material(glow, glow, 1.6), membrane, pearl: material(0xf5f8dc, 0xb6cfab, .08), pupil: material(0x072c38) };
}
function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent?: THREE.Object3D): THREE.Mesh {
  const result = new THREE.Mesh(geometry, mat);
  result.castShadow = true;
  result.receiveShadow = true;
  parent?.add(result);
  return result;
}
function ball(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, detail = 12): THREE.Mesh {
  const m = mesh(new THREE.SphereGeometry(1, detail, Math.max(6, detail / 2)), mat, parent);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m;
}
function tube(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material, tubularSegments = 14, radialSegments = 5): THREE.Mesh {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), tubularSegments, radius, radialSegments, false), mat, parent);
}
function v(x: number, y: number, z: number): THREE.Vector3 { return new THREE.Vector3(x, y, z); }
function motion(motions: Motion[], node: THREE.Object3D, kind: MotionKind, phase = 0, side = 1): void {
  motions.push({ node, kind, phase, rest: v(node.rotation.x, node.rotation.y, node.rotation.z), side });
}
function combined(parent: THREE.Object3D, geometries: THREE.BufferGeometry[], mat: THREE.Material): THREE.Mesh | null {
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries);
  geometries.forEach(g => g.dispose());
  return merged ? mesh(merged, mat, parent) : null;
}
function beadGeometry(x: number, y: number, z: number, sx: number, sy = sx, sz = sx): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, 9, 6).scale(sx, sy, sz).translate(x, y, z);
}

/** Continuous asymmetric spindle: its broad, slightly lifted end is the head (+Z). */
function bodyGeometry(length: number, width: number, color: THREE.Color, rings = 32, sides = 24, spine?: readonly SpineNode[]): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    // Cosine spacing concentrates rings where the spindle closes. Exact poles
    // avoid an open micro-ring and all copies share one normal and one color.
    const latitude = i / rings * Math.PI, axial = -Math.cos(latitude), t = (axial + 1) / 2;
    const section = bodySection(axial, spine);
    const pole = i === 0 || i === rings;
    const profile = pole ? 0 : Math.pow(Math.sin(latitude), .96) * (1 + .15 * axial);
    const poleBlend = Math.min(1, Math.sin(latitude) * 2.8);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      const rib = 1 + .035 * Math.sin(t * 7 * Math.PI) * Math.pow(Math.cos(a), 2);
      const x = Math.sin(a) * .69 * width * profile * rib * section.width;
      const y = Math.cos(a) * .62 * width * profile * rib * section.height + .13 * axial * axial + section.bend * width;
      const z = axial * 1.76 * length;
      positions.push(x, y, z);
      const shade = .86 + .14 * Math.cos(a) * poleBlend;
      const c = color.clone().multiplyScalar(shade);
      if (Math.cos(a) < -.35) c.lerp(new THREE.Color(0xc4dfb8), .38 * poleBlend);
      colors.push(c.r, c.g, c.b); uv.push(j / sides, t);
      if (i < rings && j < sides) { const k = i * (sides + 1) + j; indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices); g.computeVertexNormals();
  const normals = g.getAttribute('normal');
  for (let i = 0; i <= rings; i++) {
    const first = i * (sides + 1), last = first + sides;
    if (i === 0 || i === rings) {
      for (let j = first; j <= last; j++) normals.setXYZ(j, 0, 0, i === 0 ? -1 : 1);
    } else {
      const averaged = v(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
      normals.setXYZ(first, averaged.x, averaged.y, averaged.z); normals.setXYZ(last, averaged.x, averaged.y, averaged.z);
    }
  }
  return g;
}
function surface(axial: number, angle: number, length: number, width: number, spine?: readonly SpineNode[]): THREE.Vector3 {
  const point = attachmentPoint(axial, angle, length, width, spine);
  return v(point.x, point.y, point.z);
}

/** A swept membrane with a curved leading edge and scalloped trailing edge. */
function leafGeometry(length = 1.2, breadth = .42, sweep = -.45, lobes = 1): THREE.BufferGeometry {
  const pos: number[] = [], ids: number[] = [], uv: number[] = [];
  const rows = 14, cols = 8;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const b = breadth * Math.pow(Math.sin(Math.PI * t), .72) * (1 + .1 * Math.sin(t * Math.PI * 2 * lobes));
    for (let j = 0; j <= cols; j++) {
      const q = j / cols * 2 - 1;
      pos.push(q * b, t * length, sweep * t * t + Math.sin(Math.PI * t) * .14 * (1 - q * q));
      uv.push(j / cols, t);
      if (i < rows && j < cols) { const k = i * (cols + 1) + j; ids.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ids); g.computeVertexNormals(); return g;
}
function leaf(parent: THREE.Object3D, p: Palette, length: number, width: number, sweep: number, mat = p.membrane): THREE.Group {
  const g = new THREE.Group(); parent.add(g);
  mesh(leafGeometry(length, width, sweep, 2), mat, g);
  tube(g, [v(0, 0, 0), v(0, length * .52, sweep * .26 + .14), v(0, length, sweep)], .022, p.glow, 10, 4);
  return g;
}
function horn(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(12, false), vertices: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, center = curve.getPoint(t), r = radius * Math.pow(1 - t, .65) + .004;
    for (let j = 0; j <= 7; j++) {
      const a = j / 7 * Math.PI * 2;
      const point = center.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
      vertices.push(point.x, point.y, point.z);
      if (i < 12 && j < 7) { const k = i * 8 + j; indices.push(k, k + 1, k + 8, k + 1, k + 9, k + 8); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setIndex(indices); g.computeVertexNormals();
  return mesh(g, mat, parent);
}
function eyes(parent: THREE.Object3D, p: Palette, spread: number, height: number, forward: number, size: number, motions: Motion[], shape?: { length: number; width: number; spine: readonly SpineNode[] }): void {
  for (const side of [-1, 1]) {
    const eyelid = new THREE.Group(); eyelid.position.set(side * spread, height, forward); parent.add(eyelid);
    if (shape) {
      // Sculpted faces can slope either way. Seat each eye on that actual surface
      // and turn it outward so a raised neck cannot swallow the fixed old eyes.
      const { length, width, spine } = shape, axial = .76, angle = side * .68;
      const around = surface(axial, angle + .01, length, width, spine).sub(surface(axial, angle - .01, length, width, spine));
      const along = surface(axial + .01, angle, length, width, spine).sub(surface(axial - .01, angle, length, width, spine));
      const normal = along.cross(around).normalize();
      eyelid.position.copy(surface(axial, angle, length, width, spine)).addScaledVector(normal, .06 * width);
      eyelid.quaternion.setFromUnitVectors(v(0, 0, 1), normal);
    }
    ball(eyelid, p.dark, 0, 0, -.035, size * 1.19, size * 1.1, size * .7);
    ball(eyelid, p.pearl, 0, .015, 0, size, size, size * .65);
    ball(eyelid, p.glow, side * .025, .015, size * .56, size * .58, size * .62, size * .17);
    ball(eyelid, p.pupil, side * .025, .015, size * .66, size * .31, size * .43, size * .12);
    ball(eyelid, p.pearl, -size * .07, size * .30, size * .77, size * .11);
    motion(motions, eyelid, 'eye');
  }
}

function addBody(parent: THREE.Group, length: number, width: number, p: Palette, hue: number, pattern: number, motions: Motion[], elaborate = true, spine?: readonly SpineNode[]): THREE.Mesh {
  const mat = p.skin.clone(); mat.color.set(0xffffff); mat.vertexColors = true;
  const body = mesh(bodyGeometry(length, width, p.skin.color, spine ? 64 : 32, 24, spine), mat, parent);
  body.name = 'organism-surface';
  const spots: THREE.BufferGeometry[] = [], ribs: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < (elaborate ? 8 : 5); i++) {
      const a = -.75 + i * (elaborate ? .195 : .32), point = surface(a, side * .83, length, width, spine);
      const size = (.052 + .017 * Math.sin(i * 2 + pattern)) * width;
      spots.push(beadGeometry(point.x * 1.03, point.y * 1.025, point.z, size, size * .65, size * (1.2 + pattern * .14)));
      if (elaborate && i > 0 && i < 7) {
        const points = Array.from({ length: 12 }, (_, j) => surface(a, side * (.12 + j * .085), length, width, spine).multiplyScalar(1.006));
        ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, .012 * width, 3));
      }
    }
  }
  combined(parent, spots, p.glow); combined(parent, ribs, p.light);
  const lipSection = bodySection(.91, spine);
  eyes(parent, p, .30 * width, .32 * width + .03, 1.30 * length, .165 * width, motions, spine ? { length, width, spine } : undefined);
  const mouth = new THREE.Group(); mouth.position.set(0, -.15 * width * lipSection.height + lipSection.bend * width, 1.60 * length); parent.add(mouth);
  const lip = mesh(new THREE.TorusGeometry(.115 * width, .032 * width, 6, 18), p.dark, mouth);
  lip.scale.y = .55;
  motion(motions, mouth, 'jaw');
  return body;
}
function createPart(part: Part, angle: number, genome: Genome, p: Palette, motions: Motion[], copy: number): THREE.Group {
  const root = new THREE.Group();
  root.userData.partId = part.id; root.userData.kind = part.kind;
  root.position.copy(surface(part.axial, angle, genome.length, genome.width, genome.spine));
  root.rotation.z = -angle;
  root.scale.setScalar(part.scale);
  const phase = part.axial * 4 + copy * Math.PI;
  const side = Math.sin(angle) < 0 ? -1 : 1;
  switch (part.kind) {
    case 'fins': {
      const fin = leaf(root, p, 1.23, .50, -.67);
      // Fin veins follow the membrane, making its deformation readable.
      for (const d of [-1, 1]) tube(fin, [v(0, .2, .04), v(d * .34, .60, -.12), v(d * .26, 1, -.48)], .013, p.light, 9, 3);
      motion(motions, fin, 'fin', phase, side); break;
    }
    case 'tail': {
      const stem = new THREE.Group(); root.add(stem);
      horn(stem, [v(0, 0, .02), v(0, .07, -.5), v(0, .07, -1.28)], .18, p.skin);
      for (const d of [-1, 1]) {
        const fin = leaf(stem, p, .90, .45, -.55); fin.position.set(0, .03, -.79); fin.rotation.z = d * Math.PI / 2;
      }
      motion(motions, stem, 'tail', phase); break;
    }
    case 'flagellum': {
      const first = new THREE.Group(); root.add(first);
      let last = first;
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Group(); seg.position.set(0, i ? 0 : .02, i ? -.34 : 0); last.add(seg);
        horn(seg, [v(0, 0, 0), v(.025, .04, -.20), v(0, 0, -.40)], .075 * (1 - i / 6), i === 4 ? p.glow : p.light);
        motion(motions, seg, 'flagellum', phase - i * .72); last = seg;
      }
      break;
    }
    case 'legs': {
      root.rotation.z = 0;
      const hip = new THREE.Group(); root.add(hip);
      ball(hip, p.skin, 0, 0, 0, .20);
      const kneePoint = v(side * .48, -.34, -.14);
      horn(hip, [v(0, 0, 0), v(side * .27, -.10, -.06), kneePoint], .145, p.skin);
      const knee = new THREE.Group(); knee.position.copy(kneePoint); hip.add(knee);
      ball(knee, p.light, 0, 0, 0, .135);
      horn(knee, [v(0, 0, 0), v(side * .13, -.42, .10), v(side * .29, -.80, .30)], .10, p.dark);
      const foot = new THREE.Group(); knee.add(foot);
      for (let i = -1; i <= 1; i++) {
        const toe = horn(foot, [v(side * .27, -.76, .28), v(side * (.29 + i * .09), -.81, .44), v(side * (.32 + i * .15), -.79, .61)], .045, p.light);
        const position = toe.geometry.getAttribute('position');
        // The underside is a deliberate flat sole, not a point that penetrates
        // the floor as the continuous toe curve approaches its lowest sample.
        for (let vertex = 0; vertex < position.count; vertex++) position.setY(vertex, Math.max(-.82, position.getY(vertex)));
        toe.geometry.computeVertexNormals();
      }
      ball(foot, p.dark, side * .29, -.775, .41, .17, .045, .24);
      const solePoints: number[] = [];
      foot.traverse(node => {
        if (!(node as THREE.Mesh).isMesh) return;
        const m = node as THREE.Mesh; m.updateMatrix();
        const positions = m.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          stancePoint.fromBufferAttribute(positions, i).applyMatrix4(m.matrix);
          solePoints.push(stancePoint.x, stancePoint.y, stancePoint.z);
        }
      });
      const groundY = -(organismGroundClearance(genome) + root.position.y) / part.scale;
      // Different attachment angles/scales still give every leg a usable stance.
      hip.scale.y = -groundY / LEG_SOLE_REACH;
      hip.userData.legStance = { hip, knee, solePoints: new Float32Array(solePoints), groundY, phase } satisfies LegStance;
      motion(motions, hip, 'leg', phase, side); motion(motions, knee, 'knee', phase, side); break;
    }
    case 'jet': {
      tube(root, [v(0, 0, 0), v(0, .32, -.18), v(0, .40, -.55)], .17, p.skin, 10, 8);
      const ring = mesh(new THREE.TorusGeometry(.16, .045, 6, 14), p.light, root); ring.position.set(0, .4, -.55);
      ball(root, p.glow, 0, .4, -.575, .115, .115, .035);
      motion(motions, root, 'pulse', phase); break;
    }
    case 'filter': {
      const fan = new THREE.Group(); root.add(fan);
      ball(fan, p.dark, 0, .03, .06, .27, .1, .19);
      const filaments: THREE.BufferGeometry[] = [];
      for (let i = -5; i <= 5; i++) {
        const points = [v(i * .035, .04, 0), v(i * .075, .40, .08), v(i * .10, .70 - Math.abs(i) * .035, .21)];
        filaments.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, .020, 4));
      }
      combined(fan, filaments, p.light); motion(motions, fan, 'gill', phase); break;
    }
    case 'jaw': {
      root.rotation.z = 0;
      // A fleshy socket bridges the surface attachment to both existing hinges.
      // Its overlap survives chewing without moving either branch or bite contact.
      ball(root, p.skin, 0, -.07, -.02, .27, .18, .18).name = 'jaw-socket';
      for (const d of [-1, 1]) {
        const jaw = new THREE.Group(); jaw.position.x = d * .15; root.add(jaw);
        horn(jaw, [v(0, -.10, 0), v(d * .30, -.12, .30), v(d * .24, -.10, .67), v(d * .03, -.03, .82)], .15, p.dark);
        for (let i = 0; i < 3; i++) horn(jaw, [v(d * .23, -.07, .24 + i * .16), v(d * .10, .02, .27 + i * .16), v(d * .025, .02, .29 + i * .16)], .045, p.pearl);
        motion(motions, jaw, 'jaw', d, d);
      }
      break;
    }
    case 'proboscis': {
      const trunk = new THREE.Group(); root.add(trunk);
      tube(trunk, [v(0, 0, 0), v(0, .29, .32), v(0, .19, .77), v(0, .33, 1.12)], .083, p.light, 16, 7);
      const lip = mesh(new THREE.TorusGeometry(.10, .034, 5, 12), p.glow, trunk); lip.position.set(0, .33, 1.12);
      motion(motions, trunk, 'feelers', phase); break;
    }
    case 'eyes': {
      for (const d of [-1, 1]) {
        const stalk = new THREE.Group(); root.add(stalk);
        tube(stalk, [v(d * .12, 0, 0), v(d * .25, .28, 0), v(d * .32, .53, .08)], .055, p.skin, 9);
        ball(stalk, p.pearl, d * .32, .56, .08, .14);
        ball(stalk, p.pupil, d * .32, .57, .20, .07, .08, .032);
        motion(motions, stalk, 'feelers', phase + d);
      }
      break;
    }
    case 'antenna': {
      const stem = new THREE.Group(); root.add(stem);
      tube(stem, [v(0, 0, 0), v(.08, .55, .10), v(.14, 1.04, .37)], .037, p.light, 12);
      const branches: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) for (const d of [-1, 1]) {
        const y = .30 + i * .125;
        branches.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(.04, y, .1), v(d * .14, y + .09, .1), v(d * (.23 - i * .03), y + .16, .15)]), 6, .015, 3));
      }
      combined(stem, branches, p.light); ball(stem, p.glow, .14, 1.04, .37, .08);
      motion(motions, stem, 'feelers', phase); break;
    }
    case 'sonar': {
      ball(root, p.skin, 0, .09, 0, .39, .16, .33);
      for (let i = 0; i < 3; i++) {
        const ring = mesh(new THREE.TorusGeometry(.31 - i * .09, .026, 5, 20), i % 2 ? p.light : p.glow, root);
        ring.rotation.x = -Math.PI / 2; ring.position.y = .19 + i * .075;
      }
      motion(motions, root, 'pulse', phase); break;
    }
    case 'shell': {
      for (let i = 0; i < 3; i++) {
        const scute = mesh(new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI * .53), i % 2 ? p.light : p.skin, root);
        scute.scale.set(.63 - Math.abs(i - 1) * .07, .29, .52); scute.position.set(0, .035 + i * .02, (i - 1) * .48);
        const ridge = Array.from({ length: 13 }, (_, j) => { const a = j / 12 * Math.PI; return v(Math.cos(a) * .60, Math.sin(a) * .29 + .075, (i - 1) * .48 + .04); });
        tube(root, ridge, .026, p.glow, 12, 4);
      }
      break;
    }
    case 'spines': {
      for (let i = 0; i < 4; i++) {
        const z = (i - 1.5) * .28;
        ball(root, p.dark, 0, .02, z, .115, .055, .115);
        horn(root, [v(0, 0, z), v(0, .38 + .1 * Math.sin(i), z - .13), v(.025, .71 + .1 * Math.sin(i), z - .28)], .11, i % 2 ? p.light : p.pearl);
      }
      break;
    }
    case 'toxin': {
      for (let i = -1; i <= 1; i++) {
        ball(root, p.dark, i * .20, .04, i % 2 * .16, .16, .08, .16);
        ball(root, p.glow, i * .20, .23, i % 2 * .16, .13, .23, .14);
      }
      motion(motions, root, 'pulse', phase); break;
    }
    case 'gills': {
      for (let i = 0; i < 5; i++) {
        const frond = leaf(root, p, .53 + Math.sin(i / 4 * Math.PI) * .22, .14, -.1, i % 2 ? p.light : p.membrane);
        frond.position.z = (i - 2) * .18; frond.rotation.x = -.22 + i * .05;
        motion(motions, frond, 'gill', phase + i * .5);
      }
      break;
    }
    case 'lungs': {
      ball(root, p.light, 0, .12, 0, .33, .26, .56);
      const ridges: THREE.BufferGeometry[] = [];
      for (let i = -2; i <= 2; i++) {
        const points = Array.from({ length: 10 }, (_, j) => { const a = j / 9 * Math.PI; return v(Math.cos(a) * .30, Math.sin(a) * .22 + .13, i * .17); });
        ridges.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, .028, 4));
      }
      combined(root, ridges, p.dark); motion(motions, root, 'pulse', phase); break;
    }
    case 'bladder': {
      ball(root, p.light, 0, .30, 0, .31, .43, .45);
      ball(root, p.glow, 0, .43, .21, .20, .23, .18);
      for (const d of [-1, 1]) tube(root, [v(d * .07, 0, 0), v(d * .28, .26, .20), v(d * .13, .64, .1)], .018, p.skin, 9, 4);
      motion(motions, root, 'pulse', phase); break;
    }
    case 'reservoir': {
      ball(root, p.skin, 0, .12, 0, .42, .15, .48);
      for (let i = -1; i <= 1; i++) ball(root, p.light, i * .19, .30, 0, .16, .27 - Math.abs(i) * .05, .35);
      tube(root, [v(-.36, .14, -.29), v(0, .40, -.25), v(.36, .14, -.29)], .025, p.glow, 12, 4);
      motion(motions, root, 'pulse', phase); break;
    }
    case 'chloroplast': {
      for (let i = -1; i <= 1; i++) {
        const frond = leaf(root, p, .74, .28, .09, p.light); frond.rotation.z = i * .72; frond.rotation.x = -.3 + Math.abs(i) * .22;
        motion(motions, frond, 'gill', phase + i);
      }
      break;
    }
    case 'symbiote': {
      const partner = new THREE.Group(); root.add(partner);
      ball(partner, p.dark, 0, .10, 0, .30, .12, .30);
      for (let i = 0; i < 5; i++) {
        const frond = leaf(partner, p, .46, .16, 0); frond.rotation.z = i / 5 * Math.PI * 2; frond.position.y = .23;
      }
      ball(partner, p.glow, 0, .27, .08, .20, .15, .18);
      ball(partner, p.pupil, 0, .28, .245, .08, .09, .034);
      motion(motions, partner, 'tentacle', phase); break;
    }
    case 'recycler': {
      for (let i = -1; i <= 1; i++) {
        const cup = mesh(new THREE.CylinderGeometry(.16, .07, .36 + .07 * (i + 1), 10, 1, true), p.light, root);
        cup.position.set(i * .22, .2, 0); cup.rotation.z = -i * .27;
        const rim = mesh(new THREE.TorusGeometry(.16, .025, 5, 12), p.glow, cup); rim.rotation.x = Math.PI / 2; rim.position.y = .18 + .035 * (i + 1);
        ball(cup, p.dark, 0, .13, 0, .12, .025, .12);
      }
      motion(motions, root, 'pulse', phase); break;
    }
    default: { if (part.kind !== 'arms') { const exhaustive: never = part.kind; void exhaustive; } }
  }
  return root;
}

/** The editor and world intentionally share this constructor. No stage-specific replacement model. */
export function createOrganism(genome: Genome): THREE.Group {
  const group = new THREE.Group(), visual = new THREE.Group(); group.add(visual);
  group.name = genome.name || 'Lumavora';
  const motions: Motion[] = [], p = palette(genome.hue);
  group.userData.attachmentSurface = addBody(visual, genome.length, genome.width, p, genome.hue, genome.pattern, motions, true, genome.spine);
  for (const part of genome.parts) {
    attachmentAngles(part).forEach((angle, copy) => visual.add(createPart(part, angle, genome, p, motions, copy)));
  }
  motion(motions, visual, 'body');
  group.userData.motions = motions; group.userData.visual = visual;
  // Materials are owned by this model, including those not selected by its particular genome.
  group.userData.ownedMaterials = Object.values(p);
  return group;
}

/** UVs encode the actual body surface, so a rotated camera never changes drag axes. */
export function attachmentOnBody(group: THREE.Group, raycaster: THREE.Raycaster): { axial: number; angle: number } | null {
  const body = group.userData.attachmentSurface as THREE.Mesh | undefined;
  if (!body?.isMesh) return null;
  group.updateMatrixWorld(true);
  const uv = raycaster.intersectObject(body, false)[0]?.uv;
  if (!uv) return null;
  const angle = uv.x * Math.PI * 2;
  return { axial: THREE.MathUtils.clamp(uv.y * 2 - 1, -.93, .93), angle: angle > Math.PI ? angle - Math.PI * 2 : angle };
}

interface SelectionAppearance {
  id: string | null;
  changed: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }[];
  copies: THREE.Material[];
}

/** Selection owns temporary materials; shared skin/other attachments remain unchanged. */
export function selectOrganismPart(group: THREE.Group, id: string | null): void {
  const previous = group.userData.selectionAppearance as SelectionAppearance | undefined;
  if (previous?.id === id) return;
  if (previous) {
    previous.changed.forEach(({ mesh, original }) => { mesh.material = original; });
    previous.copies.forEach(material => material.dispose());
    const oldCopies = new Set(previous.copies);
    group.userData.ownedMaterials = (group.userData.ownedMaterials as THREE.Material[]).filter(material => !oldCopies.has(material));
  }
  const selected: SelectionAppearance = { id, changed: [], copies: [] };
  const copies = new Map<THREE.Material, THREE.Material>();
  group.traverse(node => {
    if (!node.userData.partId) return;
    node.userData.selected = node.userData.partId === id;
    if (!node.userData.selected) return;
    node.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const original = child.material;
      const highlight = (material: THREE.Material) => {
        let copy = copies.get(material);
        if (!copy) {
          copy = material.clone();
          if (copy instanceof THREE.MeshStandardMaterial) {
            copy.color.lerp(new THREE.Color(0xb5ffe0), .24);
            copy.emissive.setHex(0x6ef0bb);
            copy.emissiveIntensity = Math.max(.72, copy.emissiveIntensity + .32);
            copy.roughness = Math.min(copy.roughness, .32);
          }
          copies.set(material, copy); selected.copies.push(copy);
        }
        return copy;
      };
      child.material = Array.isArray(original) ? original.map(highlight) : highlight(original);
      selected.changed.push({ mesh: child, original });
    });
  });
  group.userData.ownedMaterials.push(...selected.copies);
  group.userData.selectionAppearance = selected;
}

const ceilingMatrix = new THREE.Matrix4();

/** Small conservative support set, cached once for each soft hinge in world play. */
function softCeilingPoints(node: THREE.Object3D): Float32Array {
  const inverse = node.matrixWorld.clone().invert(), relative = new THREE.Matrix4(), point = new THREE.Vector3(), points: number[] = [];
  node.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry as THREE.BufferGeometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    relative.multiplyMatrices(inverse, child.matrixWorld);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      point.set(x, y, z).applyMatrix4(relative); points.push(point.x, point.y, point.z);
    }
  });
  return new Float32Array(points);
}

/** Fold soft membranes against a real roof; each call starts at the ordinary pose. */
function foldUnderCeiling(group: THREE.Group, motions: Motion[], ceilingY: number): void {
  group.updateWorldMatrix(true, true);
  for (const m of motions) {
    if (m.kind !== 'fin' && m.kind !== 'gill') continue;
    const node = m.node, points = m.ceilingPoints ??= softCeilingPoints(node);
    const openX = node.rotation.x, openZ = node.rotation.z;
    const highestAt = (fold: number): number => {
      node.rotation.x = THREE.MathUtils.lerp(openX, m.rest.x - 1.85, fold);
      node.rotation.z = THREE.MathUtils.lerp(openZ, m.rest.z, fold);
      node.updateMatrix(); ceilingMatrix.multiplyMatrices(node.parent!.matrixWorld, node.matrix);
      const e = ceilingMatrix.elements;
      let highest = -Infinity;
      for (let i = 0; i < points.length; i += 3) highest = Math.max(highest, points[i] * e[1] + points[i + 1] * e[5] + points[i + 2] * e[9] + e[13]);
      return highest;
    };
    const limit = ceilingY - .045, openTop = highestAt(0);
    if (openTop <= limit) continue;
    let previous = 0, best = 0, bestTop = openTop, found = false;
    // A fixed short sweep handles lateral attachments whose arc is not monotonic.
    // It changes only hinge rotations, never organ scale or the contact volume.
    for (let step = 1; step <= 8; step++) {
      const fold = step / 8, highest = highestAt(fold);
      if (highest < bestTop) { bestTop = highest; best = fold; }
      if (highest <= limit) {
        let low = previous, high = fold;
        for (let sample = 0; sample < 6; sample++) {
          const middle = (low + high) / 2;
          if (highestAt(middle) <= limit) high = middle; else low = middle;
        }
        highestAt(high); found = true; break;
      }
      previous = fold;
    }
    if (!found) highestAt(best);
  }
}

export function animateOrganism(group: THREE.Group, time: number, speed: number, headingDelta: number, stage: Stage, feeding: number | boolean, hurt = 0, ceilingY?: number): void {
  const movement = Math.min(1, Math.max(0, speed) / 3), bite = typeof feeding === 'boolean' ? (feeding ? 1 : 0) : Math.min(1, Math.max(0, feeding));
  const motions = group.userData.motions as Motion[] | undefined;
  if (!motions) return;
  for (const m of motions) {
    const t = time * (stage === 2 ? 7 : 4.8) + m.phase;
    const wave = Math.sin(t), node = m.node;
    switch (m.kind) {
      case 'body':
        node.rotation.x = m.rest.x + (stage === 2 ? 0 : .065 * Math.sin(time * 2.4) * movement);
        node.rotation.y = m.rest.y + Math.sin(time * 4.4) * .035 * movement;
        node.rotation.z = m.rest.z + (stage === 2 ? 0 : THREE.MathUtils.clamp(-headingDelta * .13, -.22, .22) + Math.sin(time * 3) * .015) + Math.sin(time * 43) * hurt * .055;
        node.position.y = stage === 2 ? 0 : Math.sin(time * 2) * .026;
        node.scale.y = stage === 2 ? 1 : 1 + Math.sin(time * 2.4) * .012 - hurt * .035;
        break;
      case 'fin': node.rotation.x = m.rest.x + wave * (.12 + movement * .36); node.rotation.z = m.rest.z + Math.cos(t) * .07; break;
      case 'tail': node.rotation.y = m.rest.y + wave * (.08 + movement * .42); break;
      case 'flagellum': node.rotation.y = m.rest.y + wave * (.12 + movement * .31); node.rotation.x = m.rest.x + Math.cos(t * .81) * .16; break;
      case 'leg': node.rotation.x = m.rest.x + wave * (stage === 2 ? .30 * movement : .12); node.rotation.z = m.rest.z + m.side * Math.max(0, wave) * (stage === 2 ? .09 * movement : .06); break;
      case 'knee': node.rotation.x = m.rest.x + Math.max(0, wave) * (stage === 2 ? .40 * movement : .13); break;
      case 'gill': node.rotation.x = m.rest.x + Math.sin(time * 3 + m.phase) * .16; node.rotation.z = m.rest.z + Math.cos(time * 2.5 + m.phase) * .06; break;
      case 'jaw': node.rotation.y = m.rest.y + m.side * Math.sin(time * 20) * bite * .32; node.scale.y = 1 + bite * (.3 + .2 * Math.sin(time * 18)); break;
      case 'feelers': node.rotation.z = m.rest.z + Math.sin(time * 1.7 + m.phase) * .09; node.rotation.x = m.rest.x + Math.cos(time * 2.1 + m.phase) * .07; break;
      case 'pulse': node.scale.y = (node.userData.baseScale ??= node.scale.y) * (1 + Math.sin(time * 2.7 + m.phase) * .055); break;
      case 'eye': node.scale.y = 1 - Math.pow(Math.max(0, Math.sin(time * .9)), 42) * .90; break;
      case 'tentacle': node.rotation.y = m.rest.y + Math.sin(time * 2 + m.phase) * .19; node.rotation.z = m.rest.z + Math.cos(time * 2.5 + m.phase) * .07; break;
    }
  }
  if (stage === 1 && ceilingY !== undefined && Number.isFinite(ceilingY)) foldUnderCeiling(group, motions, ceilingY);
  for (const m of motions) {
    if (m.kind !== 'leg') continue;
    const stance = m.node.userData.legStance as LegStance | undefined;
    if (!stance) continue;
    if (stage !== 2) { stance.hip.position.y = 0; continue; }
    let lowest = Infinity;
    stanceKneeMatrix.makeRotationFromEuler(stance.knee.rotation).setPosition(stance.knee.position);
    const matrix = stanceHipMatrix.makeRotationFromEuler(stance.hip.rotation).scale(stance.hip.scale).multiply(stanceKneeMatrix).elements;
    // A minimum-Y dot product against precomputed sole vertices is exact and
    // cheap; unlike transformed bounding boxes it cannot leave feet hovering.
    for (let i = 0; i < stance.solePoints.length; i += 3) {
      const y = stance.solePoints[i] * matrix[1] + stance.solePoints[i + 1] * matrix[5] + stance.solePoints[i + 2] * matrix[9] + matrix[13];
      lowest = Math.min(lowest, y);
    }
    // Stance feet stay at the analytical sole plane; only the swing half lifts.
    const lift = Math.max(0, Math.sin(time * 7 + stance.phase)) * .16 * movement;
    stance.hip.position.y = stance.groundY - lowest + lift;
  }
}

/** Nine recognizable NPC body plans; ecology chooses their movement and intent elsewhere. */
export function createSpeciesModel(species: Species): THREE.Group {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const color = new THREE.Color(species.color), hsl = { h: 0, s: 0, l: 0 }; color.getHSL(hsl);
  const p = palette(hsl.h * 360); p.skin.color.copy(color);
  const motions: Motion[] = [];
  const simpleEyes = (spread: number, y: number, z: number, size = .12) => eyes(body, p, spread, y, z, size, motions);
  switch (species.shape) {
    case 'ray': {
      const center = mesh(bodyGeometry(.7, .65, color, 16, 14), p.skin, body); center.scale.y = .50;
      for (const side of [-1, 1]) {
        const wing = leaf(body, p, 1.55, .69, -.58); wing.rotation.z = side * Math.PI / 2; wing.position.x = -side * .22; motion(motions, wing, 'fin', side, side);
      }
      horn(body, [v(0, 0, -.7), v(0, .1, -1.6), v(.14, .13, -2.25)], .1, p.light);
      simpleEyes(.24, .20, .62); break;
    }
    case 'stalker': {
      if (species.id === 'ribbon') {
        // Reef hunters have a ribbon mantle, four travelling pairs of vanes,
        // and a forked caudal fin; the microscopic needle keeps its dart plan.
        const core = mesh(bodyGeometry(1.30, .38, color, 24, 16), p.skin, body); core.scale.y = .76;
        for (const side of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            const vane = leaf(body, p, .48 + Math.sin(i / 3 * Math.PI) * .31, .19, -.41);
            vane.position.set(-side * .19, .02, 1.04 - i * .69); vane.rotation.z = side * Math.PI / 2;
            motion(motions, vane, 'fin', i * .68 + (side < 0 ? Math.PI : 0), side);
          }
          horn(body, [v(side * .15, -.07, 1.78), v(side * .29, -.06, 2.12), v(side * .06, -.04, 2.34)], .075, p.pearl);
        }
        const crest = leaf(body, p, .61, .19, -1.07); crest.position.set(0, .15, .88);
        motion(motions, crest, 'gill', .9);
        const caudal = new THREE.Group(); caudal.position.z = -1.88; body.add(caudal);
        horn(caudal, [v(0, 0, 0), v(0, .02, -.32), v(0, .04, -.69)], .10, p.skin);
        for (const side of [-1, 1]) {
          const blade = leaf(caudal, p, .88, .23, -.15); blade.position.z = -.38; blade.rotation.set(-Math.PI / 2, 0, side * .48);
        }
        motion(motions, caudal, 'tail', .6);
        simpleEyes(.17, .12, 1.73, .105);
      } else {
        mesh(bodyGeometry(1.02, .43, color, 20, 14), p.skin, body);
        for (const side of [-1, 1]) {
          const fin = leaf(body, p, .6, .23, -.47); fin.rotation.z = side * Math.PI / 2; fin.position.set(side * -.22, -.1, -.48); motion(motions, fin, 'fin', side);
          horn(body, [v(side * .20, -.1, 1.18), v(side * .38, -.09, 1.53), v(side * .08, -.06, 1.82)], .1, p.pearl);
        }
        const crest = leaf(body, p, .62, .43, -.6); crest.position.z = -.20; motion(motions, crest, 'gill');
        simpleEyes(.20, .18, 1.13, .105);
      }
      break;
    }
    case 'jelly': {
      const bell = mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * .62), p.membrane, body); bell.scale.set(.85, .63, .85);
      const ring = mesh(new THREE.TorusGeometry(.77, .06, 5, 24), p.glow, body); ring.rotation.x = Math.PI / 2; ring.position.y = -.19;
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, tentacle = new THREE.Group(); tentacle.position.set(Math.cos(a) * .48, -.14, Math.sin(a) * .48); body.add(tentacle);
        tube(tentacle, [v(0, 0, 0), v(.13, -.55, .04), v(-.12, -.94, .18), v(.03, -1.35, .08)], .035, i % 2 ? p.glow : p.light, 13, 4);
        motion(motions, tentacle, 'tentacle', i);
      }
      simpleEyes(.22, .2, .71, .105); motion(motions, bell, 'pulse'); break;
    }
    case 'grazer': {
      const m = mesh(bodyGeometry(.68, .83, color, 18, 16), p.skin, body); m.scale.y = .8;
      for (let i = 0; i < 4; i++) {
        const flap = leaf(body, p, .58 - i * .055, .22, -.17); flap.position.set(0, .35, .60 - i * .41); flap.rotation.x = -.15; motion(motions, flap, 'gill', i);
      }
      for (const side of [-1, 1]) {
        const foot = leaf(body, p, .5, .30, -.21); foot.position.set(side * .45, -.2, 0); foot.rotation.z = -side * 1.9; motion(motions, foot, 'fin', side);
      }
      simpleEyes(.29, .16, .93); break;
    }
    case 'spiral': {
      const shell = new THREE.Group(); body.add(shell);
      const points = Array.from({ length: 68 }, (_, i) => { const t = i / 67, a = t * Math.PI * 4.7, r = .10 + t * .66; return v(Math.cos(a) * r, Math.sin(a) * r + .05, -.12 + t * .3); });
      tube(shell, points, .125, p.light, 64, 7);
      ball(body, p.skin, 0, -.35, .12, .64, .24, .91);
      simpleEyes(.20, -.17, .89, .11);
      for (const side of [-1, 1]) tube(body, [v(side * .17, -.18, .60), v(side * .27, .12, .76), v(side * .36, .29, .84)], .038, p.glow, 8, 4);
      motion(motions, shell, 'pulse'); break;
    }
    case 'strider': {
      mesh(bodyGeometry(.66, .40, color, 16, 12), p.skin, body);
      const fakeGenome: Genome = { version: 1, name: '', length: .66, width: .40, hue: hsl.h * 360, pattern: 0, parts: [] };
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) fakeGenome.parts.push({ id: `npc-leg-${side}-${i}`, kind: 'legs', axial: (i - 1) * .55, angle: side * Math.PI / 2, scale: .95, mirrored: false });
      fakeGenome.parts.forEach((leg, i) => body.add(createPart(leg, leg.angle, fakeGenome, p, motions, i % 2)));
      simpleEyes(.17, .21, .83, .11); break;
    }
    case 'moth': {
      mesh(bodyGeometry(.52, .30, color, 16, 12), p.skin, body);
      for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
        const wing = leaf(body, p, i ? .86 : 1.35, i ? .35 : .55, -.20, i ? p.light : p.membrane); wing.rotation.z = side * 1.37; wing.rotation.x = i ? -.8 : .1; wing.position.z = .20 - i * .5; motion(motions, wing, 'fin', side + i * .5);
      }
      for (const side of [-1, 1]) {
        tube(body, [v(side * .09, .1, .59), v(side * .18, .38, .77), v(side * .30, .42, .68)], .024, p.glow, 8, 4);
      }
      simpleEyes(.13, .13, .56, .095); break;
    }
    case 'crab': {
      ball(body, p.skin, 0, .08, 0, .83, .38, .64, 18);
      const shell = mesh(new THREE.SphereGeometry(1, 16, 9, 0, Math.PI * 2, 0, Math.PI * .5), p.light, body); shell.scale.set(.74, .33, .59); shell.position.y = .18;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const limb = new THREE.Group(); limb.position.set(side * .55, -.10, (i - 1) * .34); body.add(limb);
          tube(limb, [v(0, 0, 0), v(side * .40, -.15, -.16), v(side * .55, -.66, .06)], .058, p.dark, 9, 5); motion(motions, limb, 'leg', i * 2 + side, side);
        }
        horn(body, [v(side * .55, .03, .30), v(side * .92, .13, .66), v(side * .79, .2, 1.05)], .18, p.skin);
        horn(body, [v(side * .92, .13, .66), v(side * .57, .11, .73), v(side * .64, .15, .97)], .12, p.light);
      }
      simpleEyes(.27, .33, .50); break;
    }
    case 'worm': {
      const segmentGeometries: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) {
        const scale = .30 + .07 * Math.sin(i / 8 * Math.PI);
        segmentGeometries.push(beadGeometry(0, .07 * Math.sin(i * .4), 1.15 - i * .28, scale, scale * .78, .22));
      }
      combined(body, segmentGeometries, p.skin);
      for (let i = 0; i < 6; i++) {
        const tuft = leaf(body, p, .27, .11, -.12); tuft.position.set(0, .31, .84 - i * .31); motion(motions, tuft, 'gill', i);
      }
      simpleEyes(.15, .15, 1.25, .09); break;
    }
    default: { const exhaustive: never = species.shape; void exhaustive; }
  }
  motion(motions, body, 'body');
  group.userData.motions = motions; group.userData.visual = body; group.userData.ownedMaterials = Object.values(p);
  group.userData.species = species.id;
  group.scale.setScalar(species.size);
  return group;
}
export function animateSpeciesModel(group: THREE.Group, time: number, speed: number, species: Species): void {
  animateOrganism(group, time, speed, 0, species.stage, 0);
}

/** Shared materials and merged geometries are disposed exactly once per model. */
export function disposeObject(group: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(node => {
    if ((node as THREE.Mesh).isMesh || (node as THREE.Line).isLine) {
      const m = node as THREE.Mesh;
      geometries.add(m.geometry);
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(material => materials.add(material));
    }
    const owned = node.userData.ownedMaterials as THREE.Material[] | undefined;
    owned?.forEach(m => materials.add(m));
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}
