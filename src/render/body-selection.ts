import * as THREE from 'three';
import { spineAxial } from '../game/body-shape';

/** A surface-following band, owned by the editor model and excluded from picking.
 * Interpolating the mesh's own rings keeps both edges on the rendered surface,
 * including bent/narrow sections and the historical 32-ring body.
 */
export function selectBodySection(model: THREE.Group, selected: number | null): void {
  const body = model.userData.attachmentSurface as THREE.Mesh | undefined;
  if (!body || body.userData.selectedSection === selected) return;
  body.userData.selectedSection = selected;
  const previous = body.getObjectByName('body-section-selection');
  if (previous) {
    previous.traverse(node => {
      if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
        node.geometry.dispose();
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => m.dispose());
      }
    });
    previous.removeFromParent();
  }
  if (selected === null) return;
  const position = body.geometry.getAttribute('position'), uv = body.geometry.getAttribute('uv');
  let stride = 1;
  while (stride < uv.count && uv.getY(stride) === uv.getY(0)) stride++;
  const rows = position.count / stride;
  const low = selected === 0 ? -1 : spineAxial(selected) - .15;
  const high = selected === 6 ? 1 : spineAxial(selected) + .15;
  const levels = [low];
  for (let row = 1; row < rows - 1; row++) {
    const axial = uv.getY(row * stride) * 2 - 1;
    if (axial > low && axial < high) levels.push(axial);
  }
  levels.push(high);
  const vertices: number[] = [], indices: number[] = [];
  for (const axial of levels) {
    let row = 0;
    while (row < rows - 2 && uv.getY((row + 1) * stride) * 2 - 1 < axial) row++;
    const a = uv.getY(row * stride) * 2 - 1, b = uv.getY((row + 1) * stride) * 2 - 1;
    const blend = THREE.MathUtils.clamp((axial - a) / (b - a), 0, 1);
    for (let side = 0; side < stride; side++) {
      const start = new THREE.Vector3().fromBufferAttribute(position, row * stride + side);
      start.lerp(new THREE.Vector3().fromBufferAttribute(position, (row + 1) * stride + side), blend);
      vertices.push(...start.toArray());
    }
  }
  for (let row = 0; row < levels.length - 1; row++) for (let side = 0; side < stride - 1; side++) {
    const k = row * stride + side;
    indices.push(k, k + stride, k + 1, k + 1, k + stride, k + stride + 1);
  }
  const band = new THREE.Group(); band.name = 'body-section-selection'; body.add(band);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
  const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffca65, transparent: true, opacity: .48, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  fill.raycast = () => {}; band.add(fill);
  for (const row of [0, levels.length - 1]) {
    const edge = new THREE.BufferGeometry();
    edge.setAttribute('position', new THREE.Float32BufferAttribute(vertices.slice(row * stride * 3, (row * stride + stride - 1) * 3), 3));
    const line = new THREE.LineLoop(edge, new THREE.LineBasicMaterial({ color: 0xffdf91, transparent: true, opacity: .95, depthWrite: false }));
    line.raycast = () => {}; band.add(line);
  }
}
