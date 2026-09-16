import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { initialVehicle, VEHICLE_PARTS, vehicleStats } from '../src/game/blueprint';
import type { Carrier, VehicleBlueprint } from '../src/game/blueprint';
import { createMachine, animateMachine, machineAttachmentOnBody } from '../src/render/machine';
import { disposeObject, selectOrganismPart } from '../src/render/organism';

function parts(model: THREE.Group, id: string): THREE.Object3D[] {
  const result: THREE.Object3D[] = []; model.traverse(node => { if (node.userData.partId === id) result.push(node); }); return result;
}
function meshes(model: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = []; model.traverse(node => { if (node instanceof THREE.Mesh) result.push(node); }); return result;
}
function withArmor(carrier: Carrier = 'tank'): VehicleBlueprint {
  const g = initialVehicle(carrier, 'restoration');
  g.parts.push({ id: 'paired-armor', kind: 'armor', axial: -.35, angle: 1.2, scale: .8, mirrored: true }); return g;
}
function signature(model: THREE.Group) {
  return meshes(model).map(node => ({
    geometry: node.geometry.type, positions: [...node.geometry.getAttribute('position').array],
    color: [...(node.geometry.getAttribute('color')?.array ?? [])], matrix: node.matrixWorld.toArray(),
    material: (node.material as THREE.MeshStandardMaterial).color.getHex(),
  }));
}

describe('shared machine model', () => {
  it.each<Carrier>(['tank', 'air'])('builds the same %s blueprint for editor and fleet without state mutation or shared resource ownership', carrier => {
    const g = withArmor(carrier), before = JSON.stringify(g), editor = createMachine(g), fleet = createMachine(structuredClone(g));
    try {
      expect(signature(editor)).toEqual(signature(fleet)); expect(JSON.stringify(g)).toBe(before);
      expect(editor.userData.vehicleStats).toEqual(vehicleStats(g));
      expect(editor.userData.groundClearance).toBeGreaterThan(0);
      const bounds = new THREE.Box3().setFromObject(editor);
      expect(editor.userData.groundClearance).toBeCloseTo(-bounds.min.y, 8);
      expect(editor.userData.bounds.equals(bounds)).toBe(true);
      const editorGeometry = new Set(meshes(editor).map(node => node.geometry));
      const editorMaterials = new Set(editor.userData.ownedMaterials as THREE.Material[]);
      expect(meshes(fleet).every(node => !editorGeometry.has(node.geometry))).toBe(true);
      expect((fleet.userData.ownedMaterials as THREE.Material[]).every(material => !editorMaterials.has(material))).toBe(true);
    } finally { disposeObject(editor); disposeObject(fleet); }
  });

  it('renders all nine catalog parts as distinct visible assemblies with pickable identities', () => {
    const g = initialVehicle('tank', 'restoration');
    g.parts = VEHICLE_PARTS.map((part, i) => ({ id: `catalog-${part.id}`, kind: part.id, axial: (i - 4) / 6, angle: .5, scale: 1, mirrored: false }));
    const model = createMachine(g);
    try {
      const signatures = g.parts.map(part => {
        const roots = parts(model, part.id); expect(roots).toHaveLength(1); expect(roots[0].userData.kind).toBe(part.kind);
        const geometry = meshes(roots[0]); expect(geometry.length).toBeGreaterThan(0);
        expect(geometry.every(mesh => mesh.visible && mesh.geometry.getAttribute('position').count > 0)).toBe(true);
        return geometry.map(node => `${node.geometry.type}:${node.geometry.getAttribute('position').count}`).join(',');
      });
      expect(new Set(signatures).size).toBe(9);
      const hull = model.userData.attachmentSurface as THREE.Mesh;
      expect(parts(model, 'catalog-hull')[0].children).toContain(hull);
    } finally { disposeObject(model); }
  });

  it('applies dimensions, hull scale and each attachment transform while mirroring across the hull', () => {
    const g = withArmor(); g.length = 1.8; g.width = 1.4; g.parts[0].scale = 1.25;
    const model = createMachine(g);
    try {
      const pair = parts(model, 'paired-armor'); expect(pair).toHaveLength(2);
      expect(pair[0].position.x).toBeCloseTo(-pair[1].position.x, 8);
      expect(pair[0].position.y).toBeCloseTo(pair[1].position.y, 8);
      expect(pair[0].position.z).toBeCloseTo(-.35 * 1.65 * g.length * 1.25, 8);
      expect(pair[0].position.z).toBeCloseTo(pair[1].position.z, 8);
      expect(pair[0].rotation.z).toBe(-1.2); expect(pair[1].rotation.z).toBe(1.2);
      expect(pair.every(node => node.scale.equals(new THREE.Vector3(.8, .8, .8)))).toBe(true);
      const hull = model.userData.attachmentSurface as THREE.Mesh;
      const hullBounds = new THREE.Box3().setFromObject(hull);
      expect(hullBounds.max.z - hullBounds.min.z).toBeCloseTo(g.length * 3.3 * 1.25, 5);
      expect(hullBounds.max.x - hullBounds.min.x).toBeCloseTo(g.width * 1.9 * 1.25, 5);
      const center = pair[0].getWorldPosition(new THREE.Vector3());
      const direction = center.clone().setZ(0).normalize(), ray = new THREE.Raycaster(center.clone().addScaledVector(direction, 4), direction.negate());
      const hit = ray.intersectObject(model, true).find(hit => {
        let node: THREE.Object3D | null = hit.object; while (node) { if (node.userData.partId === 'paired-armor') return true; node = node.parent; } return false;
      });
      expect(hit).toBeDefined();
    } finally { disposeObject(model); }
  });

  it.each<Carrier>(['tank', 'air'])('maps transformed %s hull ray hits to stable editor UV attachments', carrier => {
    const g = initialVehicle(carrier, 'restoration'); g.length = 1.7; g.width = 1.3; g.parts[0].scale = 1.2;
    const model = createMachine(g); model.position.set(2, 1, -3); model.rotation.set(.1, .4, -.2); model.scale.setScalar(1.3); model.updateMatrixWorld(true);
    try {
      for (const cameraPosition of [[-6, 2, 5], [6, 3, 4], [1, 5, -6]]) {
        const camera = new THREE.PerspectiveCamera(40, 4 / 3, .1, 100);
        camera.position.fromArray(cameraPosition).add(model.position); camera.lookAt(model.position); camera.updateMatrixWorld(true);
        const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(0, 0), camera);
        const placement = machineAttachmentOnBody(model, ray); expect(placement).not.toBeNull();
        const body = model.userData.attachmentSurface as THREE.Mesh, hit = ray.intersectObject(body, false)[0];
        const local = body.worldToLocal(hit.point.clone());
        const inverse = (n: number) => carrier === 'tank' ? Math.sign(n) * n * n : n;
        const angle = Math.atan2(inverse(local.x / (.95 * g.width)), inverse(local.y / ((carrier === 'tank' ? .45 : .56) * g.width)));
        expect(placement!.axial).toBeCloseTo(local.z / (1.65 * g.length), 5);
        expect(Math.abs(Math.atan2(Math.sin(placement!.angle - angle), Math.cos(placement!.angle - angle)))).toBeLessThan(.04);
      }
      expect(machineAttachmentOnBody(model, new THREE.Raycaster(new THREE.Vector3(50, 50, 50), new THREE.Vector3(1, 0, 0)))).toBeNull();
    } finally { disposeObject(model); }
  });

  it('keeps mirrored seam attachments separate and tolerates an incomplete editor draft', () => {
    const g = withArmor(); g.parts = g.parts.filter(part => part.kind !== 'hull'); g.parts.at(-1)!.angle = 0;
    const model = createMachine(g);
    try {
      const pair = parts(model, 'paired-armor'); expect(pair[0].position.x).toBeGreaterThan(0); expect(pair[1].position.x).toBeLessThan(0);
      expect(machineAttachmentOnBody(model, new THREE.Raycaster())).toBeNull();
      expect(model.userData.groundClearance).toBeGreaterThanOrEqual(0);
    } finally { disposeObject(model); }
  });

  it('keeps preview bounds finite when the draft has no parts', () => {
    const g = initialVehicle('tank', 'restoration'); g.parts = [];
    const model = createMachine(g);
    try {
      expect(meshes(model)).toHaveLength(0); expect(model.userData.groundClearance).toBe(0);
      const bounds = model.userData.bounds as THREE.Box3;
      expect([...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)).toBe(true);
      expect(machineAttachmentOnBody(model, new THREE.Raycaster())).toBeNull();
    } finally { disposeObject(model); }
  });

  it('uses hue and each pattern on the rendered hull and distinguishes carrier silhouettes', () => {
    const designs = [0, 1, 2, 3].map(pattern => ({ ...initialVehicle('tank', 'restoration'), pattern }));
    designs.push({ ...designs[0], hue: 180 }, initialVehicle('air', 'restoration'));
    const models = designs.map(createMachine);
    try {
      const colors = models.slice(0, 5).map(model => [...(model.userData.attachmentSurface as THREE.Mesh).geometry.getAttribute('color').array].join(','));
      expect(new Set(colors).size).toBe(5);
      expect(models[0].getObjectByName('rotor')).toBeUndefined(); expect(models[5].getObjectByName('rotor')).toBeDefined();
      expect(models[0].getObjectByName('track-tread')).toBeDefined(); expect(models[5].getObjectByName('track-tread')).toBeUndefined();
    } finally { models.forEach(disposeObject); }
  });

  it('animates tracks, rotor and active drill deterministically without rebuilding geometry', () => {
    const tank = createMachine(initialVehicle('tank', 'restoration')), air = createMachine(initialVehicle('air', 'restoration'));
    try {
      const geometry = meshes(tank).map(node => node.geometry), tread = tank.getObjectByName('track-tread')!, drill = tank.getObjectByName('drill')!, rotor = air.getObjectByName('rotor')!;
      const rest = tread.position.clone(); animateMachine(tank, .2, 3, true); animateMachine(air, .2, 3, true);
      expect(tread.position.equals(rest)).toBe(false); expect(drill.rotation.z).toBeCloseTo(2.8, 8); expect(rotor.rotation.y).toBeCloseTo(2.4, 8);
      const moved = tread.position.clone(); animateMachine(tank, .2, 3, true); expect(tread.position.equals(moved)).toBe(true);
      animateMachine(tank, 2, 0, false); expect(tread.position.equals(rest)).toBe(true); expect(drill.rotation.z).toBe(0);
      expect(meshes(tank).map(node => node.geometry)).toEqual(geometry);
      animateMachine(tank, NaN, Infinity, true); expect(Number.isFinite(drill.rotation.z)).toBe(true);
    } finally { disposeObject(tank); disposeObject(air); }
  });

  it('shares organism selection and disposes model-owned originals and highlights once', () => {
    const model = createMachine(withArmor()), original = new Map(meshes(model).map(node => [node, node.material]));
    const owned = model.userData.ownedMaterials.length;
    selectOrganismPart(model, 'paired-armor');
    expect(parts(model, 'paired-armor').every(node => node.userData.selected)).toBe(true);
    for (const root of parts(model, 'paired-armor')) for (const mesh of meshes(root)) expect(mesh.material).not.toBe(original.get(mesh));
    const hull = model.userData.attachmentSurface as THREE.Mesh; expect(hull.material).toBe(original.get(hull));
    selectOrganismPart(model, 'vehicle-hull'); expect(hull.material).not.toBe(original.get(hull));
    selectOrganismPart(model, null); expect(model.userData.ownedMaterials.length).toBe(owned);
    for (const [mesh, material] of original) expect(mesh.material).toBe(material);
    selectOrganismPart(model, 'paired-armor');
    const geometries = new Set(meshes(model).map(node => node.geometry));
    const materials = new Set(model.userData.ownedMaterials as THREE.Material[]);
    const disposed = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
    disposeObject(model); for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1);
  });
});
