import * as THREE from 'three';
import type { HunterCue } from '../game/encounter-ai';

type LivingFinish = { rim: { value: number }; danger: { value: number } };

/** A quiet view-dependent edge keeps the living body legible without another pass.
 * Materials already belong to this model; the editor keeps its original lighting. */
export function applyLivingFinish(model: THREE.Group, role: 'player' | 'predator'): void {
  if (model.userData.livingFinish) return;
  const finish: LivingFinish = { rim: { value: role === 'player' ? .25 : .09 }, danger: { value: 0 } };
  model.userData.livingFinish = finish;
  const materials = new Set<THREE.MeshStandardMaterial>();
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
      if (mat instanceof THREE.MeshStandardMaterial) materials.add(mat);
    }
  });
  for (const mat of materials) {
    const original = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      original.call(mat, shader, renderer);
      shader.uniforms.lumavoraLivingRim = finish.rim;
      shader.uniforms.lumavoraDanger = finish.danger;
      shader.fragmentShader = `uniform float lumavoraLivingRim; uniform float lumavoraDanger;\n${shader.fragmentShader}`
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float livingEdge = pow(1.0 - max(0.0, dot(normal, normalize(vViewPosition))), 3.0);
          totalEmissiveRadiance += vec3(0.48, 0.84, 0.70) * livingEdge * lumavoraLivingRim;
          totalEmissiveRadiance += vec3(0.92, 0.22, 0.065) * (0.07 + livingEdge * 0.24) * lumavoraDanger;
        `);
    };
    mat.customProgramCacheKey = () => 'lumavora-living-edge-v1';
    mat.needsUpdate = true;
  }
}

/** The colour follows the actual committed attack, never a cosmetic timer. */
export function setLivingDanger(model: THREE.Group, cue: HunterCue | null): void {
  const finish = model.userData.livingFinish as LivingFinish | undefined;
  if (!finish) return;
  finish.danger.value = cue?.phase === 'lunge' ? 1 : cue?.phase === 'windup' ? .35 + .65 * cue.progress : 0;
}

/** A hungry partner remains present, but its living light visibly rests. */
export function setPartnerActivity(model: THREE.Group, active: boolean): void {
  type PartnerFinish = { active: boolean | null; materials: { mat: THREE.MeshStandardMaterial; color: THREE.Color; glow: number }[] };
  let finish = model.userData.partnerFinish as PartnerFinish | undefined;
  if (!finish) {
    finish = { active: null, materials: [] };
    const seen = new Set<THREE.MeshStandardMaterial>();
    model.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(mat instanceof THREE.MeshStandardMaterial) || seen.has(mat)) continue;
        seen.add(mat); finish!.materials.push({ mat, color: mat.color.clone(), glow: mat.emissiveIntensity });
      }
    });
    model.userData.partnerFinish = finish;
  }
  if (finish.active === active) return;
  finish.active = active;
  for (const { mat, color, glow } of finish.materials) {
    mat.color.copy(color).multiplyScalar(active ? 1 : .63);
    mat.emissiveIntensity = glow * (active ? 1 : .15);
  }
}

/** Filled corners keep a consistent visible weight on WebGL implementations
 * that restrict GL lines to one pixel. Their span does not represent action range. */
export function targetBracketGeometry(): THREE.BufferGeometry {
  const coordinates: number[] = [];
  const rectangle = (x0: number, z0: number, x1: number, z1: number) => {
    coordinates.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z0, x1, 0, z1, x0, 0, z1);
  };
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    rectangle(x * .43, z * .75, x * .80, z * .80);
    rectangle(x * .75, z * .43, x * .80, z * .80);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
  geometry.computeVertexNormals();
  return geometry;
}
