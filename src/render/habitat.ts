import * as THREE from 'three';
import type { Landmark, Obstacle, Patch, Stage, World } from '../game/types';
import { groundHeight } from '../game/random';
import type { ClimateView } from '../game/climate';

/** Original procedural scenery. All positions are deterministic functions of the seed. */
export const HABITAT_PALETTES = [
  { background: 0x071d2c, floor: 0x103f49, fog: 0x092c3c, accent: 0x7be4cd },
  { background: 0x073449, floor: 0x17606b, fog: 0x0b4155, accent: 0x87f4dc },
  { background: 0x78978e, floor: 0x415d4a, fog: 0x739c92, accent: 0xe0ee98 },
] as const;

export function terrainHeight(x: number, z: number, stage: Stage): number {
  return groundHeight(x, z, stage);
}

/** Elevated reef solids have an underside that actors can actually swim beneath. */
export function isElevatedShelf(obstacle: Obstacle, stage: Stage): boolean {
  return stage === 1 && obstacle.kind === 'rock' && obstacle.pos.y > groundHeight(obstacle.pos.x, obstacle.pos.z, stage) + 2;
}

type FloraRecord = { node: THREE.Group; patch: number; phase: number; scale: number };
type PatchRecord = { materials: THREE.MeshStandardMaterial[]; lush: THREE.Color[]; fertility: number };
type LandmarkRecord = { node: THREE.Group; halo: THREE.Mesh; heart: THREE.Mesh; material: THREE.MeshStandardMaterial; kind: Landmark['kind']; id: string; water: THREE.Mesh | null };
type OasisRecord = { id: string; kind: 'spring' | 'gate'; plants: { mesh: THREE.Mesh; scale: number; phase: number }[]; material: THREE.MeshStandardMaterial };
type RootPocketRecord = { node: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; coordinates: Float32Array; x: number; z: number; radius: number };
type FloorUniforms = {
  lumavoraDrought: { value: number };
  lumavoraShoreline: { value: number };
  lumavoraClimatePatches: { value: THREE.Vector4[] };
  lumavoraOases: { value: THREE.Vector4[] };
  lumavoraDustColor: { value: THREE.Color };
  lumavoraOasisColor: { value: THREE.Color };
};
type HabitatData = {
  flora: FloraRecord[];
  patches: Map<number, PatchRecord>;
  landmarks: LandmarkRecord[];
  motes: THREE.InstancedMesh;
  moteOrigins: THREE.Vector3[];
  stage: Stage;
  lastEcology: number;
  tidalSurface: THREE.Mesh | null;
  oases: OasisRecord[];
  oasisGeometry: THREE.BufferGeometry | null;
  rootPockets: RootPocketRecord[];
  floorUniforms: FloorUniforms;
};

const unit = (value: number | undefined): number => Number.isFinite(value) ? THREE.MathUtils.clamp(value!, 0, 1) : 0;

function hash(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 47, 0x45d9f3b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function material(color: THREE.ColorRepresentation, glow = 0, opacity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.06,
    emissive: color, emissiveIntensity: glow, side: THREE.DoubleSide,
    transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D): THREE.Mesh {
  const result = new THREE.Mesh(geometry, mat);
  result.castShadow = true;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

type Piece = { geometry: THREE.BufferGeometry; matrix?: THREE.Matrix4 };
function combine(pieces: Piece[]): THREE.BufferGeometry {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const { geometry, matrix } of pieces) {
    if (matrix) geometry.applyMatrix4(matrix);
    const p = geometry.getAttribute('position');
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const n = geometry.getAttribute('normal');
    const start = positions.length / 3;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) indices.push(start + geometry.index.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) indices.push(start + i);
    }
    geometry.dispose();
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setIndex(indices);
  result.computeBoundingSphere();
  return result;
}

function tube(points: THREE.Vector3[], radius: number, segments = 12): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 5, false);
}

/** Ribbed, asymmetric radial membranes, used as fronds rather than primitive spheres. */
function canopy(radius: number, height: number, ribs: number, opening = Math.PI * 2): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  const radial = 7, angular = ribs * 4;
  for (let j = 0; j <= radial; j++) {
    const t = j / radial;
    for (let i = 0; i <= angular; i++) {
      const a = (i / angular - 0.5) * opening;
      const scallop = 1 + Math.cos(a * ribs) * 0.045 * t;
      const r = radius * t * scallop;
      const y = height * (1 - t * t * 0.84) + Math.cos(a * ribs) * radius * 0.045 * t;
      positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      if (j < radial && i < angular) {
        const b = j * (angular + 1) + i;
        indices.push(b, b + angular + 1, b + 1, b + 1, b + angular + 1, b + angular + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ribbon(height: number, width: number, phase: number): THREE.BufferGeometry {
  const positions: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const w = width * Math.sin(Math.PI * t) + width * 0.035;
    const x = Math.sin(t * 5 + phase) * t * height * 0.17;
    const z = Math.cos(t * 4 + phase) * t * height * 0.12;
    positions.push(x - w, t * height, z, x + w, t * height, z);
    if (i < 12) { const b = i * 2; indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function floor(world: World, parent: THREE.Group, data: HabitatData): void {
  const geometry = new THREE.PlaneGeometry(600, 600, 94, 94);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const colors: number[] = [];
  const base = new THREE.Color(HABITAT_PALETTES[world.stage].floor);
  const light = new THREE.Color(world.stage === 2 ? 0x74906a : world.stage === 1 ? 0x377f7b : 0x1e6670);
  const sand = new THREE.Color(0xa99c74);
  const patchColors = world.patches.map(patch => new THREE.Color(patch.color));
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const h = terrainHeight(x, z, world.stage);
    positions.setY(i, h);
    const grain = hash(world.seed, i) * 0.11;
    color.copy(base).lerp(light, 0.25 + 0.22 * Math.sin(x * 0.15 + Math.cos(z * 0.12)) + grain);
    for (let patchIndex = 0; patchIndex < world.patches.length; patchIndex++) {
      const patch = world.patches[patchIndex];
      const influence = 1 - THREE.MathUtils.smoothstep(Math.hypot(x - patch.center.x, z - patch.center.z), patch.radius * 0.35, patch.radius * 1.1);
      color.lerp(patchColors[patchIndex], influence * 0.17);
    }
    if (world.stage === 2) color.lerp(sand, THREE.MathUtils.smoothstep(z, 35, 62) * 0.83);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const floorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 });
  {
    // World-space interference makes quiet mineral veins and caustic grain without
    // texture assets, added meshes, or geometry tessellation at texture resolution.
    floorMaterial.onBeforeCompile = shader => {
      shader.uniforms.lumavoraFloorSeed = { value: hash(world.seed, 9871) * 30 };
      Object.assign(shader.uniforms, data.floorUniforms);
      shader.vertexShader = `varying vec2 vLumavoraFloorXZ;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLumavoraFloorXZ = position.xz;');
      shader.fragmentShader = `varying vec2 vLumavoraFloorXZ;
        uniform float lumavoraFloorSeed;
        uniform float lumavoraDrought;
        uniform float lumavoraShoreline;
        uniform vec4 lumavoraClimatePatches[3];
        uniform vec4 lumavoraOases[7];
        uniform vec3 lumavoraDustColor;
        uniform vec3 lumavoraOasisColor;
        ${shader.fragmentShader}`
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 floorPoint = vLumavoraFloorXZ + lumavoraFloorSeed;
          float waveA = sin(floorPoint.x * 0.46 + sin(floorPoint.y * 0.31) * 1.4);
          float waveB = sin(floorPoint.y * 0.39 + sin(floorPoint.x * 0.29) * 1.6);
          float caustic = pow(1.0 - abs(waveA * waveB), 22.0);
          float vein = pow(1.0 - abs(sin(floorPoint.x * 0.092 + sin(floorPoint.y * 0.081) * 2.4)), 32.0);
          float grain = fract(sin(dot(floor(floorPoint * 4.0), vec2(12.9898, 78.233))) * 43758.5453);
          ${world.stage < 2 ? 'diffuseColor.rgb *= 0.94 + grain * 0.035 + caustic * 0.11 - vein * 0.075;' : `
            float soilStress = lumavoraDrought * 0.45;
            for (int n = 0; n < 3; n++) {
              vec4 climatePatchValue = lumavoraClimatePatches[n];
              float weight = 1.0 - smoothstep(climatePatchValue.w * 0.45, climatePatchValue.w * 1.12, distance(vLumavoraFloorXZ, climatePatchValue.xy));
              soilStress = mix(soilStress, climatePatchValue.z, weight);
            }
            float oasis = 0.0;
            for (int n = 0; n < 7; n++) {
              vec4 waterSource = lumavoraOases[n];
              float wetGround = 1.0 - smoothstep(waterSource.z * 0.38, max(0.1, waterSource.z), distance(vLumavoraFloorXZ, waterSource.xy));
              oasis = max(oasis, wetGround * waterSource.w);
            }
            float cracks = pow(1.0 - abs(sin(floorPoint.x * 0.64 + sin(floorPoint.y * 0.51) * 1.9)), 24.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, lumavoraDustColor, clamp(soilStress * 0.8, 0.0, 0.85));
            diffuseColor.rgb *= 0.92 + grain * 0.08 - cracks * soilStress * 0.19 - vein * 0.035;
            diffuseColor.rgb = mix(diffuseColor.rgb, lumavoraOasisColor, clamp(oasis * 0.7, 0.0, 0.7));
            float tidalWet = smoothstep(lumavoraShoreline, lumavoraShoreline + 1.5, vLumavoraFloorXZ.y);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.24, 0.21), tidalWet * 0.62);
          `}
        `);
    };
    floorMaterial.customProgramCacheKey = () => `lumavora-climate-floor-v3-stage-${world.stage}`;
  }
  mesh(geometry, floorMaterial, parent);

  if (world.stage > 0) {
    const water = mesh(new THREE.PlaneGeometry(600, world.stage === 2 ? 320 : 600, 1, 1),
      material(world.stage === 2 ? 0x589f9d : 0x76c9be, 0.08, world.stage === 2 ? 0.38 : 0.075), parent);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, world.stage === 2 ? -0.5 : 13, world.stage === 2 ? 212 : 0);
    water.castShadow = false;
    water.renderOrder = 2;
    water.name = 'tidal-surface';
    data.tidalSurface = water;
  }
}

function patchFlora(world: World, patch: Patch, data: HabitatData, parent: THREE.Group): void {
  const color = new THREE.Color(patch.color);
  const stem = material(color.clone().multiplyScalar(0.42), 0.05);
  const leaves = material(color.clone().lerp(new THREE.Color(0x86b99e), 0.22).multiplyScalar(.78), world.stage === 0 ? 0.12 : 0.07);
  const tips = material(color.clone().lerp(new THREE.Color(0xc1daa2), 0.48).multiplyScalar(.84), 0.28);
  data.patches.set(patch.id, { materials: [stem, leaves, tips], lush: [stem.color.clone(), leaves.color.clone(), tips.color.clone()], fertility: -1 });
  const count = world.stage === 0 ? 18 : 16;
  for (let i = 0; i < count; i++) {
    const key = patch.id * 401 + i * 17;
    const angle = hash(world.seed, key) * Math.PI * 2;
    const distance = (0.24 + hash(world.seed, key + 1) * 0.7) * patch.radius;
    const x = patch.center.x + Math.cos(angle) * distance;
    const z = patch.center.z + Math.sin(angle) * distance;
    if (world.stage === 2 && z > 57) continue;
    const node = new THREE.Group();
    node.name = `flora-${patch.id}-${i}`;
    node.position.set(x, terrainHeight(x, z, world.stage), z);
    node.rotation.y = hash(world.seed, key + 2) * Math.PI * 2;
    const scale = 0.75 + hash(world.seed, key + 3) * 0.75;
    node.scale.setScalar(scale);
    // Every nika has a dominant silhouette; occasional secondary flora softens its border.
    const dominant = world.stage === 1 ? [1, 0, 2][patch.id % 3] : patch.id % 3;
    const variant = i % 4 === 3 ? (dominant + 1) % 3 : dominant;
    if (world.stage === 0) {
      if (variant === 0) {
        const segments: Piece[] = [], veins: Piece[] = [];
        for (let j = 0; j < 5; j++) {
          const a = j * Math.PI * 0.4;
          const g = canopy(1.35, 0.35, 8, Math.PI * 0.8);
          g.rotateZ(0.9); g.rotateY(a); g.translate(0, 0.55 + j * 0.22, 0);
          segments.push({ geometry: g });
          veins.push({ geometry: tube([new THREE.Vector3(), new THREE.Vector3(Math.cos(a) * 0.75, 1.1, Math.sin(a) * 0.75), new THREE.Vector3(Math.cos(a) * 1.6, 1.4, Math.sin(a) * 1.6)], 0.035, 7) });
        }
        mesh(combine(segments), leaves, node); mesh(combine(veins), tips, node);
      } else if (variant === 1) {
        const casing = new THREE.TorusGeometry(1, 0.095, 5, 18);
        casing.rotateX(Math.PI / 2); casing.scale(1.5, 1, 0.7); casing.translate(0, 0.22, 0);
        const pieces: Piece[] = [{ geometry: casing }];
        for (let j = -3; j <= 3; j++) {
          const x1 = j * 0.33;
          const span = Math.sqrt(Math.max(0, 1 - x1 * x1 / 2.25)) * 0.62;
          pieces.push({ geometry: tube([new THREE.Vector3(x1, 0.2, -span), new THREE.Vector3(x1 + 0.1, 0.32, 0), new THREE.Vector3(x1, 0.2, span)], 0.035, 4) });
        }
        mesh(combine(pieces), tips, node);
        const membrane = canopy(1, 0.3, 12); membrane.scale(1.5, 1, 0.65);
        mesh(membrane, leaves, node);
      } else {
        const fronds: Piece[] = [];
        for (let j = 0; j < 6; j++) {
          const g = ribbon(2.8 + j * 0.16, 0.38, j);
          g.rotateY(j * 1.05); g.rotateZ((j - 2.5) * 0.17);
          fronds.push({ geometry: g });
        }
        mesh(combine(fronds), leaves, node);
      }
    } else if (world.stage === 1) {
      if (variant === 0) {
        const fronds: Piece[] = [], stems: Piece[] = [];
        for (let j = 0; j < 5; j++) {
          const g = ribbon(3.4 + hash(world.seed, key + j + 10) * 3, 0.3, j * 2);
          g.rotateY(j * 1.6); g.translate(Math.cos(j) * 0.35, 0, Math.sin(j) * 0.35);
          fronds.push({ geometry: g });
          stems.push({ geometry: tube([new THREE.Vector3(), new THREE.Vector3(Math.cos(j) * 0.4, 2.1, Math.sin(j) * 0.4), new THREE.Vector3(Math.cos(j) * 0.8, 4.1, Math.sin(j) * 0.8)], 0.045, 8) });
        }
        mesh(combine(fronds), leaves, node); mesh(combine(stems), tips, node);
      } else if (variant === 1) {
        const fans: Piece[] = [], stems: Piece[] = [];
        for (let j = 0; j < 3; j++) {
          const g = canopy(1.5 - j * 0.22, 0.3, 10, Math.PI * 1.15);
          g.rotateZ(0.75 + j * 0.22); g.rotateY(j * 2); g.translate(0, 1 + j * 0.65, 0);
          fans.push({ geometry: g });
          stems.push({ geometry: tube([new THREE.Vector3(), new THREE.Vector3(0.2, 0.8 + j * 0.6, 0.1), new THREE.Vector3(0, 1.5 + j * 0.6, 0)], 0.12, 6) });
        }
        mesh(combine(fans), leaves, node); mesh(combine(stems), stem, node);
      } else if (patch.id === 2 && i % 4 !== 3) {
        const chimney = new THREE.LatheGeometry([
          new THREE.Vector2(0.78, 0), new THREE.Vector2(0.7, 0.3),
          new THREE.Vector2(0.45, 0.6), new THREE.Vector2(0.51, 0.94),
          new THREE.Vector2(0.3, 1.25), new THREE.Vector2(0.36, 1.65),
          new THREE.Vector2(0.25, 1.78), new THREE.Vector2(0.2, 1.3),
        ], 9);
        mesh(chimney, stem, node);
        const ventRim = new THREE.TorusGeometry(0.275, 0.07, 5, 12);
        ventRim.rotateX(Math.PI / 2); ventRim.translate(0, 1.72, 0);
        const wisps: Piece[] = [{ geometry: ventRim }];
        for (let j = 0; j < 3; j++) {
          const wisp = new THREE.TorusGeometry(0.14 + j * 0.07, 0.022, 3, 9);
          wisp.rotateX(Math.PI / 2); wisp.translate(Math.sin(j) * 0.12, 2.1 + j * 0.55, 0);
          wisps.push({ geometry: wisp });
        }
        mesh(combine(wisps), tips, node);
      } else {
        const branches: Piece[] = [], heads: Piece[] = [];
        for (let j = 0; j < 5; j++) {
          const a = j * 1.26, height = 1.3 + (j % 3) * 0.55;
          const tip = new THREE.Vector3(Math.cos(a) * 0.85, height, Math.sin(a) * 0.85);
          branches.push({ geometry: tube([new THREE.Vector3(), new THREE.Vector3(tip.x * 0.4, height * 0.7, tip.z * 0.4), tip], 0.16, 8) });
          const crown = canopy(0.5, 0.3, 8); crown.translate(tip.x, tip.y, tip.z); heads.push({ geometry: crown });
        }
        mesh(combine(branches), stem, node); mesh(combine(heads), tips, node);
      }
    } else {
      if (variant === 0) {
        const trunk = tube([new THREE.Vector3(), new THREE.Vector3(0.28, 1.5, 0), new THREE.Vector3(-0.15, 2.3, 0.1)], 0.14, 8);
        mesh(trunk, stem, node);
        const crowns: Piece[] = [];
        for (let j = 0; j < 2; j++) {
          const g = canopy(1.65 - j * 0.5, 0.45, 12); g.translate(-0.15, 2.1 - j * 0.65, 0.1);
          crowns.push({ geometry: g });
        }
        mesh(combine(crowns), leaves, node);
      } else if (variant === 1) {
        const blades: Piece[] = [];
        for (let j = 0; j < 7; j++) {
          const g = ribbon(2 + (j % 2) * 0.75, 0.4, 0);
          g.rotateZ((j - 3) * 0.22); g.rotateY(j * 0.9);
          blades.push({ geometry: g });
        }
        mesh(combine(blades), leaves, node);
      } else {
        const blooms: Piece[] = [];
        for (let j = 0; j < 5; j++) {
          const a = j * 1.26;
          const g = canopy(0.8, 0.4, 7, Math.PI * 1.2);
          g.rotateZ(-0.75); g.rotateY(a); g.translate(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5);
          blooms.push({ geometry: g });
        }
        mesh(combine(blooms), tips, node);
      }
    }
    parent.add(node);
    data.flora.push({ node, patch: patch.id, phase: hash(world.seed, key + 9) * Math.PI * 2, scale });
  }
}

/** Closed organic shelf: its circular contact rim remains at the full collision radius. */
function shelfGeometry(radius: number, height: number, phase: number): THREE.BufferGeometry {
  // The former two torus trims spent the same triangle budget on an industrial
  // outline. These extra radial samples describe shallow branching tissue instead.
  const sides = 64, rings = 12, positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const upper = new THREE.Color(0x698f79).offsetHSL(Math.sin(phase) * .018, 0, Math.cos(phase) * .018);
  const lower = new THREE.Color(0x678e83), edge = new THREE.Color(0x56776d), vein = new THREE.Color(0xacbb98), shade = new THREE.Color();
  const branches = 6 + Math.floor(phase / (Math.PI * 2) * 4);
  const tissue = (u: number, angle: number): number => {
    const bend = angle * branches + phase + Math.sin(angle * 3 + phase) * .85 + u * 1.8 + Math.sin(u * 5 + angle * 2) * .38;
    // A parent vein forks partway out. Uneven curvature and strength distinguish
    // individual shelves without changing their saved geometry or consuming RNG.
    const fork = Math.max(0, u - .28) * 2.1;
    return Math.max(Math.pow(.5 + .5 * Math.cos(bend + fork), 8), Math.pow(.5 + .5 * Math.cos(bend - fork), 8))
      * (.78 + .22 * Math.sin(angle * 2 + phase) ** 2);
  };
  const vertex = (radial: number, angle: number, y: number, color: THREE.Color) => {
    positions.push(Math.cos(angle) * radial, y, Math.sin(angle) * radial); colors.push(color.r, color.g, color.b);
  };
  let upperCount = 0;
  for (const top of [true, false]) {
    const start = positions.length / 3;
    for (let row = 0; row <= rings; row++) for (let i = 0; i <= sides; i++) {
      const u = row / rings, angle = i / sides * Math.PI * 2, rib = tissue(u, angle);
      const envelope = Math.sin(u * Math.PI);
      // Gill channels recede into the solid; neither they nor the top veins
      // protrude into the swimming space. All edge vertices stay exactly flush.
      const inset = (1 - u * u) * height * (top ? .045 : .055) + envelope * height * (top ? .07 : .14) * (1 - rib);
      shade.copy(top ? upper : lower).lerp(vein, rib * envelope * (top ? .42 : .66));
      shade.multiplyScalar(1 - envelope * .09 * (.5 + .5 * Math.sin(angle * 3 + u * 9 + phase)));
      vertex(radius * u, angle, top ? height - inset : inset, shade);
      if (row < rings && i < sides) {
        const a = start + row * (sides + 1) + i, b = a + sides + 1;
        if (row > 0) indices.push(...(top ? [a, a + 1, b] : [a, b, a + 1]));
        indices.push(...(top ? [a + 1, b + 1, b] : [a + 1, b, b + 1]));
      }
    }
    if (top) upperCount = indices.length;
  }
  const start = positions.length / 3, levels = [0, .18, .82, 1];
  for (let row = 0; row < levels.length; row++) for (let i = 0; i <= sides; i++) {
    const angle = i / sides * Math.PI * 2, growth = tissue(.85 + levels[row] * .15, angle + Math.sin(levels[row] * Math.PI) * .08);
    // Continuous solid fascia, with irregular vertical growth seams instead of
    // two pale concentric rails. No scalloped false gaps at the collision edge.
    shade.copy(edge).lerp(lower, .35 + growth * .4).lerp(vein, growth * .19);
    vertex(radius, angle, height * levels[row], shade);
    if (row < levels.length - 1 && i < sides) {
      const a = start + row * (sides + 1) + i, b = a + sides + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.addGroup(0, upperCount, 0);
  geometry.addGroup(upperCount, indices.length - upperCount, 1);
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

function obstacle(world: World, rock: Obstacle, parent: THREE.Group): void {
  const node = new THREE.Group();
  node.position.set(rock.pos.x, rock.pos.y, rock.pos.z);
  node.userData.obstacleId = rock.id;
  node.name = `obstacle-${rock.kind}-${rock.id}`;
  const r = rock.radius, h = rock.height;
  const phase = hash(world.seed, rock.id * 97) * Math.PI * 2;
  if (isElevatedShelf(rock, world.stage)) {
    const top = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .91, metalness: .01 });
    // A small local light floor keeps underside gills legible under the roof.
    // Standard materials retain this through ordinary occlusion clones.
    const underside = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, metalness: .01,
      emissive: 0x5d8074, emissiveIntensity: .22 });
    const body = mesh(shelfGeometry(r, h, phase), top, node);
    body.material = [top, underside]; body.name = 'shelf-body';
  } else if (rock.kind === 'tree') {
    const trunk = tube([new THREE.Vector3(), new THREE.Vector3(r * 0.13, h * 0.45, 0), new THREE.Vector3(-r * 0.08, h * 0.76, r * 0.06)], Math.min(r * 0.28, 0.55), 12);
    const roots: Piece[] = [{ geometry: trunk }];
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      roots.push({ geometry: tube([new THREE.Vector3(Math.cos(a) * r * 0.85, 0.08, Math.sin(a) * r * 0.85), new THREE.Vector3(Math.cos(a) * r * 0.4, h * 0.11, Math.sin(a) * r * 0.4), new THREE.Vector3(0, h * 0.27, 0)], r * 0.1, 7) });
    }
    mesh(combine(roots), material(0x435a50, 0.035), node);
    const caps: Piece[] = [];
    for (let i = 0; i < 3; i++) {
      const cap = canopy(r * (0.85 - i * 0.13), h * (0.055 + hash(world.seed, rock.id + i) * .035), 9 + (rock.id % 4));
      cap.rotateZ(Math.sin(phase + i * 1.7) * .11); cap.rotateY(phase + i * .8);
      cap.translate(-r * 0.08, h * (0.88 - i * 0.20), r * 0.06); caps.push({ geometry: cap });
    }
    mesh(combine(caps), material(hash(world.seed, rock.id) > 0.5 ? 0x798b63 : 0x647f88, 0.025), node);
  } else if (rock.kind === 'coral') {
    const branches: Piece[] = [], fans: Piece[] = [];
    const branchCount = 5 + rock.id % 3;
    for (let i = 0; i < branchCount; i++) {
      const a = phase + i * Math.PI * 2 / branchCount, reach = r * (.36 + hash(world.seed, rock.id * 31 + i) * .25), top = h * (0.48 + hash(world.seed, rock.id * 17 + i) * 0.40);
      const tip = new THREE.Vector3(Math.cos(a) * reach, top, Math.sin(a) * reach);
      branches.push({ geometry: tube([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(tip.x * 0.65, top * 0.55, tip.z * 0.65), tip], r * 0.09, 9) });
      const g = canopy(r * (0.30 + hash(world.seed, rock.id * 11 + i) * .10), Math.min(r * .22, h * .04), 7 + i % 3);
      g.rotateZ(Math.sin(phase + i) * .17); g.rotateY(a); g.translate(tip.x, tip.y, tip.z); fans.push({ geometry: g });
    }
    mesh(combine(branches), material(world.stage === 0 ? 0x465d69 : 0x406b70, 0.025), node);
    mesh(combine(fans), material(world.stage === 0 ? 0x67938c : 0x7d9f82, 0.065), node);
  } else if (world.stage === 0) {
    // Use the existing nika to establish broad garden folds, mineral shoulders,
    // and tapering twilight shells. The collider remains the same cylinder.
    const nearest = [...world.patches].sort((a, b) => Math.hypot(a.center.x-rock.pos.x,a.center.z-rock.pos.z)-Math.hypot(b.center.x-rock.pos.x,b.center.z-rock.pos.z))[0];
    const form = nearest && Math.hypot(nearest.center.x-rock.pos.x,nearest.center.z-rock.pos.z)<nearest.radius*1.25 ? nearest.id%3 : Math.floor(hash(world.seed,rock.id+1301)*3);
    node.userData.sceneryForm = form;
    const rings = 22, sides = form === 1 ? 24 : 32;
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    const dark = new THREE.Color([0x254c46,0x294955,0x353f53][form]), light = new THREE.Color([0x557360,0x647c81,0x666a7b][form]), shade = new THREE.Color();
    const lobes = form === 0 ? 3 : form === 1 ? 6 : 4;
    const shellPoint = (t: number, a: number): THREE.Vector3 => {
      const pole = t === 0 || t === 1;
      const profile = form === 0 ? Math.pow(Math.sin(Math.PI*t),.28) * (.98-.16*t)
        : form === 1 ? (.88-.36*t+Math.sin(t*Math.PI*3+phase)*.035)
        : Math.pow(Math.sin(Math.PI*t),.47) * (.97-.12*t);
      const bulge = pole ? 0 : profile;
      const fold = Math.cos(a*lobes+phase+t*(form===2?2.5:.5));
      const furrow = Math.pow(.5+.5*Math.cos(a*(lobes*2)+t*4),8);
      const radius = r*bulge*(.92+fold*.05-furrow*.025);
      const bend = Math.sin(t*Math.PI)*r*(form===2?.10:.045);
      const y = h*(form===1?Math.min(1,t*1.06):t);
      return new THREE.Vector3(Math.cos(a)*radius+Math.cos(phase)*bend,y,Math.sin(a)*radius+Math.sin(phase)*bend);
    };
    for (let j = 0; j <= rings; j++) {
      const t = j / rings;
      for (let i = 0; i <= sides; i++) {
        const a = i / sides * Math.PI * 2;
        const point = shellPoint(t, a);
        positions.push(point.x, point.y, point.z);
        const rib = Math.pow(0.5 + 0.5 * Math.cos(a * lobes + phase + t), 5);
        shade.copy(dark).lerp(light, 0.13 + t * 0.19 + rib * 0.24 + Math.sin(t * 38 + a * 2) * 0.035);
        colors.push(shade.r, shade.g, shade.b);
        if (j < rings && i < sides) {
          const b = j * (sides + 1) + i;
          indices.push(b, b + sides + 1, b + 1, b + 1, b + sides + 1, b + sides + 2);
        }
      }
    }
    const shell = new THREE.BufferGeometry();
    shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    shell.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    shell.setIndex(indices); shell.computeVertexNormals();
    mesh(shell, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.025 }), node);
    const etchings: Piece[] = [];
    for (let j = 0; j < 3; j++) {
      const points: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = 0.13 + k / 12 * 0.75;
        points.push(shellPoint(t, j * Math.PI * 2 / 3 + phase + Math.sin(t * Math.PI * 2) * 0.19));
      }
      etchings.push({ geometry: tube(points, r * 0.01, 16) });
    }
    mesh(combine(etchings), material([0x597968,0x759192,0x777e91][form], 0.035), node);
  } else {
    const layers: Piece[] = [];
    for (let i = 0; i < 4; i++) {
      const taper = 1 - i * (0.12 + hash(world.seed, rock.id) * .065);
      const g = new THREE.CylinderGeometry(r * taper * 0.78, r * taper, h * 0.29, 7 + rock.id % 3, 1);
      g.rotateY(phase+(i % 2) * 0.15); g.translate(Math.sin(phase+i)*r*.035, h * (0.145 + i * 0.22), Math.cos(phase+i)*r*.035);
      layers.push({ geometry: g });
    }
    mesh(combine(layers), material(world.stage === 2 ? 0x586851 : 0x294c59, 0.01), node);
    const cap = canopy(r * 0.48, h * 0.03, 9); cap.translate(0, h * 0.96, 0);
    mesh(cap, material(world.stage === 2 ? 0x8a9a6e : 0x578979, 0.04), node);
  }
  // Soft tube ends and membrane ribs must not extend outside the physics cylinder.
  node.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry as THREE.BufferGeometry;
    const vertices = geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i);
      const scale = Math.min(1, r / (Math.hypot(x, z) || 1));
      vertices.setXYZ(i, x * scale, THREE.MathUtils.clamp(vertices.getY(i), 0, h), z * scale);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  });
  parent.add(node);
}

function oasisGeometry(): THREE.BufferGeometry {
  const parts: Piece[] = [{ geometry: tube([new THREE.Vector3(), new THREE.Vector3(0.06, 0.4, 0), new THREE.Vector3(-0.03, 0.75, 0)], 0.055, 7) }];
  for (let i = 0; i < 4; i++) {
    const leaf = canopy(0.44, 0.14, 7, Math.PI * 1.1);
    leaf.rotateZ(-0.65); leaf.rotateY(i * 1.7); leaf.translate(0, 0.22 + i * 0.11, 0);
    parts.push({ geometry: leaf });
  }
  const flower = canopy(0.23, 0.13, 8); flower.translate(-0.03, 0.74, 0);
  parts.push({ geometry: flower });
  return combine(parts);
}

function oasisPlants(world: World, mark: Landmark, node: THREE.Group, data: HabitatData): void {
  const kind = mark.kind === 'gate' ? 'gate' : 'spring';
  const mat = material(0x9fc685, 0.16);
  const plants: OasisRecord['plants'] = [];
  const count = kind === 'gate' ? 12 : 8;
  for (let i = 0; i < count; i++) {
    const phase = hash(world.seed, 71100 + mark.pos.x * 13 + mark.pos.z * 31 + i) * Math.PI * 2;
    const angle = i / count * Math.PI * 2 + Math.sin(phase) * 0.18;
    const radius = kind === 'gate' ? 4 + (i % 3) * 1.7 : 3.1 + (i % 3) * 0.72;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const plant = mesh(data.oasisGeometry!, mat, node);
    plant.position.set(x, groundHeight(mark.pos.x + x, mark.pos.z + z, 2) - node.position.y + 0.035, z);
    plant.rotation.y = phase;
    const scale = 0.75 + hash(world.seed, 71200 + i + Math.floor(mark.pos.x * 7)) * 0.7;
    plant.scale.setScalar(scale);
    plant.visible = false;
    plants.push({ mesh: plant, scale, phase });
  }
  data.oases.push({ id: mark.id, kind, plants, material: mat });
}

function landmark(world: World, mark: Landmark, data: HabitatData, parent: THREE.Group): void {
  const node = new THREE.Group();
  node.position.set(mark.pos.x, world.stage === 0 ? mark.pos.y - 0.4 : terrainHeight(mark.pos.x, mark.pos.z, world.stage), mark.pos.z);
  node.userData.landmarkId = mark.id;
  node.name = `landmark-${mark.kind}`;
  const tone = mark.kind === 'gate' ? 0xd1d5a1 : mark.kind === 'spring' ? 0x88efdc : 0xefc797;
  const structural = material(world.stage === 2 ? 0x697961 : 0x58797a, 0.06);
  const glow = material(tone, 0.6);
  let water: THREE.Mesh | null = null;
  if (mark.kind === 'nest') {
    const ribs: Piece[] = [];
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      const front = THREE.MathUtils.smoothstep(Math.sin(a), -0.2, 0.65);
      const lip = 1.5 * (1 - front) + 0.24 * front;
      ribs.push({ geometry: tube([
        new THREE.Vector3(Math.cos(a) * 3.1, 0, Math.sin(a) * 3.1),
        new THREE.Vector3(Math.cos(a + 0.12) * 2.65, 0.1, Math.sin(a + 0.12) * 2.65),
        new THREE.Vector3(Math.cos(a + 0.24) * 2.3, lip * 0.45, Math.sin(a + 0.24) * 2.3),
        new THREE.Vector3(Math.cos(a + 0.35) * 2.55, lip, Math.sin(a + 0.35) * 2.55),
      ], 0.075, 12) });
    }
    mesh(combine(ribs), structural, node);
    const petals = canopy(2.15, 0.14, 18); mesh(petals, material(tone, 0.12, 0.32), node);
  } else if (mark.kind === 'gate') {
    const reeds: Piece[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        reeds.push({ geometry: tube([new THREE.Vector3(side * (3.4 + i * 0.55), 0, i * 0.35), new THREE.Vector3(side * (3.5 - i * 0.15), 3.7, i * 0.25), new THREE.Vector3(side * 1.9, 6.3 - i * 0.5, 0), new THREE.Vector3(side * 0.65, 6.6 - i * 0.4, 0)], 0.15 + i * 0.015, 14) });
      }
    }
    mesh(combine(reeds), structural, node);
    const crest = canopy(1.7, 0.2, 14); crest.rotateX(Math.PI / 2); crest.translate(0, 6.3, 0);
    mesh(crest, material(tone, 0.3, 0.65), node);
    if (world.stage === 2) {
      const pool = new THREE.CircleGeometry(3.8, 36);
      pool.rotateX(-Math.PI / 2);
      const vertices = pool.getAttribute('position');
      for (let i = 0; i < vertices.count; i++) vertices.setY(i, groundHeight(mark.pos.x + vertices.getX(i), mark.pos.z + vertices.getZ(i), 2) - node.position.y + 0.055);
      pool.computeVertexNormals();
      water = mesh(pool, material(0x60bda9, 0.12, 0.57), node);
      water.visible = false;
      water.castShadow = false;
      water.name = 'sanctuary-pool';
    }
  } else {
    const rings: Piece[] = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.TorusGeometry(2.3 - i * 0.42, 0.2 + i * 0.03, 5, 18);
      ring.rotateX(Math.PI / 2); ring.translate(0, 0.2 + i * 0.3, 0); rings.push({ geometry: ring });
    }
    mesh(combine(rings), structural, node);
    water = mesh(canopy(1.4, -0.1, 12), material(0x72ebd6, 0.3, 0.7), node);
    water.position.y = 0.7;
    water.castShadow = false;
    water.name = 'spring-water';
  }
  const halo = mesh(new THREE.TorusGeometry(mark.kind === 'gate' ? 2.7 : 2.8, 0.04, 5, 48), glow, node);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.15;
  const heart = mesh(new THREE.OctahedronGeometry(0.45, 0), glow, node);
  heart.scale.set(0.55, 1.5, 0.55);
  heart.position.y = mark.kind === 'gate' ? 4.8 : 1.4;
  if (mark.kind === 'nest') heart.position.z = -2.65;
  if (world.stage === 2 && mark.kind !== 'nest') oasisPlants(world, mark, node, data);
  parent.add(node);
  data.landmarks.push({ node, halo, heart, material: glow, kind: mark.kind, id: mark.id, water });
}

/** Three reusable terrain-following wet surfaces, one per possible living root. */
function rootWaterSurfaces(parent: THREE.Group, data: HabitatData): void {
  for (let slot = 0; slot < 3; slot++) {
    const geometry = new THREE.RingGeometry(0, 1, 48, 5);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position');
    const coordinates = new Float32Array(position.count * 2), radial = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      coordinates[i * 2] = position.getX(i); coordinates[i * 2 + 1] = position.getZ(i);
      radial[i] = Math.hypot(position.getX(i), position.getZ(i));
    }
    geometry.setAttribute('rootDistance', new THREE.BufferAttribute(radial, 1));
    const mat = material(0x62baa2, .11, .46); mat.roughness = .28;
    mat.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float rootDistance; varying float vRootDistance;\n${shader.vertexShader}`
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRootDistance = rootDistance;');
      shader.fragmentShader = `varying float vRootDistance;\n${shader.fragmentShader}`
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(0.84, 1.0, vRootDistance);');
    };
    mat.customProgramCacheKey = () => 'lumavora-root-water-v1';
    const node = new THREE.Mesh(geometry, mat); node.name = `root-wet-pocket-slot-${slot}`;
    node.visible = false; node.castShadow = false; node.receiveShadow = true; node.renderOrder = 1;
    parent.add(node); data.rootPockets.push({ node, coordinates, x: NaN, z: NaN, radius: -1 });
  }
}

function updateRootWater(data: HabitatData, climate?: ClimateView): void {
  // Dispersed cuttings own their small wet surfaces in RootDispersalPresentation.
  const mothers = climate?.rootPockets?.filter(pocket => !pocket.dispersed);
  for (let i = 0; i < 3; i++) {
    const pocket = mothers?.[i], water = unit(pocket?.water), radius = pocket?.radius ?? 0;
    data.floorUniforms.lumavoraOases.value[4 + i].set(pocket?.x ?? 0, pocket?.z ?? 0, radius, water);
    const record = data.rootPockets[i]; if (!record) continue;
    record.node.visible = !!pocket && water > 0 && radius > 0;
    record.node.userData.rootPocketId = pocket?.id ?? null;
    record.node.userData.water = water; record.node.userData.radius = radius;
    if (!pocket) continue;
    record.node.name = `root-wet-pocket-${pocket.site}`;
    record.node.material.opacity = .22 + water * .34;
    record.node.material.emissiveIntensity = .035 + water * .10;
    if (record.x === pocket.x && record.z === pocket.z && record.radius === radius) continue;
    record.x = pocket.x; record.z = pocket.z; record.radius = radius;
    const floor = groundHeight(pocket.x, pocket.z, 2);
    record.node.position.set(pocket.x, floor, pocket.z);
    const position = record.node.geometry.getAttribute('position');
    for (let vertex = 0; vertex < position.count; vertex++) {
      const x = record.coordinates[vertex * 2] * radius, z = record.coordinates[vertex * 2 + 1] * radius;
      position.setXYZ(vertex, x, groundHeight(pocket.x + x, pocket.z + z, 2) - floor + .13, z);
    }
    position.needsUpdate = true; record.node.geometry.computeVertexNormals(); record.node.geometry.computeBoundingSphere();
  }
}

export function createHabitat(world: World, climate?: ClimateView): THREE.Group {
  const root = new THREE.Group();
  root.name = `habitat-stage-${world.stage}`;
  const moteCount = world.stage === 2 ? 75 : 115;
  const motes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.055, 0), material(HABITAT_PALETTES[world.stage].accent, 0.7, 0.5), moteCount);
  motes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  motes.frustumCulled = false;
  motes.castShadow = false;
  const data: HabitatData = { flora: [], patches: new Map(), landmarks: [], motes, moteOrigins: [], stage: world.stage, lastEcology: -10,
    tidalSurface: null, oases: [], oasisGeometry: world.stage === 2 ? oasisGeometry() : null, rootPockets: [],
    floorUniforms: { lumavoraDrought: { value: 0 }, lumavoraShoreline: { value: 54 },
      lumavoraClimatePatches: { value: Array.from({ length: 3 }, (_, i) => new THREE.Vector4(world.patches[i]?.center.x ?? 0, world.patches[i]?.center.z ?? 0, 0, world.patches[i]?.radius ?? 29)) },
      lumavoraOases: { value: Array.from({ length: 7 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      lumavoraDustColor: { value: new THREE.Color(0xb49365) }, lumavoraOasisColor: { value: new THREE.Color(0x447944) },
    },
  };
  root.userData.habitat = data;
  floor(world, root, data);
  for (const patch of world.patches) patchFlora(world, patch, data, root);
  for (const item of world.obstacles) obstacle(world, item, root);
  for (const item of world.landmarks) landmark(world, item, data, root);
  if (world.stage === 2) rootWaterSurfaces(root, data);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < moteCount; i++) {
    const x = (hash(world.seed, 11001 + i * 3) - 0.5) * 170;
    const z = (hash(world.seed, 11002 + i * 3) - 0.5) * 170;
    const y = world.stage === 2 ? terrainHeight(x, z, 2) + 1 + hash(world.seed, 11003 + i * 3) * 8 : -4 + hash(world.seed, 11003 + i * 3) * 15;
    data.moteOrigins.push(new THREE.Vector3(x, y, z));
    matrix.makeTranslation(x, y, z); motes.setMatrixAt(i, matrix);
  }
  root.add(motes);
  if (world.stage === 0) {
    const veilMaterial = material(0x599fa6, 0.25, 0.055);
    for (let i = 0; i < 5; i++) {
      const veil = mesh(ribbon(20, 12, i * 1.1), veilMaterial, root);
      veil.position.set((hash(world.seed, 43000 + i) - 0.5) * 150, -9, -70 + i * 33);
      veil.rotation.z = 0.6 + i * 0.5;
      veil.rotation.y = i * 1.2;
      veil.castShadow = false;
    }
  }
  updateHabitat(root, world, 0, climate);
  return root;
}

const matrix = new THREE.Matrix4();
const faded = new THREE.Color(0x514f43);
const newOasisGreen = new THREE.Color(0x9fc685);

export function updateHabitat(group: THREE.Group, world: World, time: number, climate?: ClimateView): void {
  const data = group.userData.habitat as HabitatData | undefined;
  if (!data) return;
  const drought = world.stage === 2 ? unit(climate?.drought) : 0;
  const shoreline = Number.isFinite(climate?.shorelineZ) ? climate!.shorelineZ : 54;
  data.floorUniforms.lumavoraDrought.value = drought;
  data.floorUniforms.lumavoraShoreline.value = shoreline;
  group.userData.drought = drought;
  group.userData.shorelineZ = shoreline;
  if (data.tidalSurface && world.stage === 2) data.tidalSurface.position.z = shoreline + 160;
  for (let i = 0; i < 3; i++) {
    const patch = world.patches[i];
    data.floorUniforms.lumavoraClimatePatches.value[i].set(patch?.center.x ?? 0, patch?.center.z ?? 0, unit(climate?.patchStress[i]), patch?.radius ?? 29);
    const mark = world.landmarks.find(item => item.id === `spring-${i}`);
    const spring = climate?.springs.find(item => item.id === `spring-${i}`);
    const water = spring ? unit(spring.water) : mark ? Math.max(0.6, unit(mark.charge / 10)) : 0;
    data.floorUniforms.lumavoraOases.value[i].set(spring?.x ?? mark?.pos.x ?? 0, spring?.z ?? mark?.pos.z ?? 0, 1.5 + 5 * water, water * (spring?.protected ? 1 : 0.48));
  }
  const sanctuary = climate?.sanctuary;
  data.floorUniforms.lumavoraOases.value[3].set(sanctuary?.x ?? 0, sanctuary?.z ?? 0, sanctuary?.radius ?? 12, sanctuary?.active ? 1 : 0);
  updateRootWater(data, climate);
  if (world.time - data.lastEcology > 0.3 || world.time < data.lastEcology) {
    data.lastEcology = world.time;
    for (const patch of world.patches) {
      const appearance = data.patches.get(patch.id);
      const fertility = THREE.MathUtils.clamp(patch.fertility, 0, 1.5) * (1 - 0.65 * unit(climate?.patchStress[patch.id]));
      if (!appearance || Math.abs(appearance.fertility - fertility) < 0.003) continue;
      appearance.fertility = fertility;
      appearance.materials.forEach((mat, i) => {
        mat.color.copy(faded).lerp(appearance.lush[i], 0.08 + Math.min(1, fertility) * 0.92);
        mat.emissive.copy(appearance.lush[i]);
        mat.emissiveIntensity = (i === 2 ? 0.28 : i === 1 ? 0.10 : 0.035) * fertility;
      });
      for (const flora of data.flora) {
        if (flora.patch !== patch.id) continue;
        const vigor = 0.18 + 0.82 * fertility;
        flora.node.scale.set(flora.scale * Math.sqrt(vigor), flora.scale * vigor, flora.scale * Math.sqrt(vigor));
        flora.node.userData.fertility = fertility;
      }
    }
  }
  for (const flora of data.flora) {
    const amplitude = data.stage === 2 ? 0.015 : 0.038;
    flora.node.rotation.z = Math.sin(time * 0.7 + flora.phase) * amplitude;
    flora.node.rotation.x = Math.cos(time * 0.55 + flora.phase) * amplitude * 0.6;
  }
  for (const record of data.landmarks) {
    const current = world.landmarks.find(item => item.id === record.id);
    if (current && record.kind === 'nest') record.node.position.set(current.pos.x, world.stage === 0 ? current.pos.y - .4 : terrainHeight(current.pos.x, current.pos.z, world.stage), current.pos.z);
    const liveSpring = world.stage === 2 && record.kind === 'spring' ? climate?.springs.find(item => item.id === record.id) : undefined;
    const charge = liveSpring?.support ?? THREE.MathUtils.clamp((current?.charge ?? 0) / (record.kind === 'spring' ? 10 : 1), 0, 1);
    record.node.userData.charge = charge;
    record.material.emissiveIntensity = 0.28 + charge * 1.3 + Math.sin(time * 1.8) * 0.08;
    record.heart.position.y = (record.kind === 'gate' ? 4.8 : 1.4) + Math.sin(time * 1.2) * 0.15;
    record.heart.rotation.y = time * 0.3;
    record.halo.scale.setScalar(1 + Math.sin(time * 1.4) * 0.035 + charge * 0.1);
    if (world.stage === 2 && record.kind === 'spring') {
      const spring = climate?.springs.find(item => item.id === record.id);
      const water = spring ? unit(spring.water) : Math.max(0.6, charge);
      record.node.userData.water = water;
      record.node.userData.protected = spring?.protected ?? charge >= 1;
      record.material.color.setHex(water < 0.12 ? 0xc0a276 : 0x88efdc);
      record.material.emissive.copy(record.material.color);
      record.material.emissiveIntensity = 0.06 + water * 0.65 + charge * 0.8;
      if (record.water) {
        record.water.visible = water > 0.015;
        record.water.scale.set(Math.sqrt(water), 1, Math.sqrt(water));
        record.water.position.y = 0.34 + water * 0.36;
        (record.water.material as THREE.MeshStandardMaterial).opacity = 0.35 + water * 0.38;
      }
    } else if (world.stage === 2 && record.kind === 'gate') {
      const active = !!sanctuary?.active;
      record.node.userData.sanctuaryActive = active;
      if (record.water) record.water.visible = active;
      record.material.color.setHex(active ? 0x8de9bd : 0xd1d5a1);
      record.material.emissive.copy(record.material.color);
      record.material.emissiveIntensity = active ? 1.1 + Math.sin(time * 1.4) * 0.1 : 0.3;
      if (active) record.halo.scale.setScalar(1.25 + Math.sin(time * 1.4) * 0.035);
    }
  }
  for (const oasis of data.oases) {
    const spring = climate?.springs.find(item => item.id === oasis.id);
    const mark = world.landmarks.find(item => item.id === oasis.id);
    const protectedSpring = spring?.protected ?? (mark?.charge ?? 0) >= 10;
    const water = spring ? unit(spring.water) : Math.max(0.6, unit((mark?.charge ?? 0) / 10));
    const vigor = oasis.kind === 'gate' ? (sanctuary?.active ? 1 : 0) : protectedSpring ? 1 : water * 0.35;
    oasis.material.color.copy(faded).lerp(newOasisGreen, vigor);
    oasis.material.emissiveIntensity = 0.04 + vigor * 0.25;
    for (const plant of oasis.plants) {
      plant.mesh.visible = vigor > 0.025;
      plant.mesh.scale.setScalar(plant.scale * (0.28 + vigor * 0.95));
      plant.mesh.rotation.z = Math.sin(time * 0.85 + plant.phase) * 0.035 * vigor;
    }
  }
  for (let i = 0; i < data.moteOrigins.length; i++) {
    const p = data.moteOrigins[i];
    matrix.makeTranslation(p.x + Math.sin(time * 0.075 + i) * 1.6, p.y + Math.sin(time * 0.19 + i * 0.7) * 0.7, p.z + Math.cos(time * 0.09 + i * 0.3) * 1.2);
    data.motes.setMatrixAt(i, matrix);
  }
  data.motes.instanceMatrix.needsUpdate = true;
}
