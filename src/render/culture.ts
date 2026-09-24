import * as THREE from 'three';
import { attachmentPoint } from '../game/anatomy';
import { CULTURE_COLORS, CULTURE_PARTS, outfitAppearance, type CulturalDesign } from '../game/culture';
import type { Genome } from '../game/types';
import { disposeObject } from './organism';

/** All coordinates are body-local, shared by the editor and live members. */
export function createCulturalOutfit(genome: Genome, design: CulturalDesign): THREE.Group {
  const root = new THREE.Group(); root.name = 'cultural-outfit';
  const dyed = new THREE.MeshStandardMaterial({ color: CULTURE_COLORS[design.color].hex, roughness: .75 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xf5e2b0, roughness: .7 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x684d39, roughness: .95 });
  root.userData.ownedMaterials = [dyed, bone, leather];
  const size = THREE.MathUtils.clamp(genome.width, .75, 1.6);
  function mesh(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
  }
  for (const part of [design.head, design.back]) {
    if (!part) continue;
    const group = new THREE.Group(); group.name = `culture-${part}`; root.add(group);
    group.userData.part = part; group.userData.slot = CULTURE_PARTS[part].slot;
    if (CULTURE_PARTS[part].slot === 'head') {
      const p = attachmentPoint(.64, 0, genome); group.position.set(p.x, p.y, p.z); group.scale.setScalar(size);
      const band = mesh(group, new THREE.TorusGeometry(.33, .065, 6, 16, Math.PI), leather, 0, .04, 0); band.rotation.x = Math.PI / 2;
      if (part === 'plume') {
        for (let i = -2; i <= 2; i++) {
          const feather = mesh(group, new THREE.SphereGeometry(1, 8, 7), dyed, i * .19, .48 + (2 - Math.abs(i)) * .1, 0);
          feather.scale.set(.12, .62, .065); feather.rotation.z = -i * .24;
          mesh(group, new THREE.CylinderGeometry(.022, .025, .6, 4), bone, i * .13, .25, .075).rotation.z = -i * .24;
        }
      } else {
        for (let i = -1; i <= 1; i++) {
          const horn = mesh(group, new THREE.ConeGeometry(.18, .78 - Math.abs(i) * .16, 5), bone, i * .25, .3, 0);
          horn.rotation.z = -i * .35;
          mesh(group, new THREE.SphereGeometry(.12, 8, 6), dyed, i * .23, .06, .12);
        }
      }
    } else if (part === 'pouches') {
      for (const side of [-1, 1]) {
        const p = attachmentPoint(-.2, side * 1.05, genome);
        const bag = mesh(group, new THREE.SphereGeometry(1, 9, 7), dyed, p.x + side * .2 * size, p.y + .08, p.z);
        bag.scale.set(.34 * size, .35 * size, .44 * size);
        const flap = mesh(group, new THREE.BoxGeometry(.42 * size, .08, .45 * size), leather, bag.position.x, bag.position.y + .28 * size, p.z); flap.rotation.z = -side * .25;
        mesh(group, new THREE.SphereGeometry(.09 * size, 6, 5), bone, bag.position.x + side * .3 * size, bag.position.y + .1, p.z);
      }
    } else {
      for (const axial of [-.55, -.3, -.05, .2]) {
        const p = attachmentPoint(axial, 0, genome), side = attachmentPoint(axial, Math.PI / 2, genome);
        const scale = Math.max(.28, Math.abs(side.x));
        const plate = mesh(group, new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), dyed, p.x, p.y + .05, p.z);
        plate.scale.set(scale * 1.1, .25 * size, .38 * genome.length);
        const ridge = mesh(group, new THREE.BoxGeometry(scale * 1.65, .045, .06), bone, p.x, p.y + .23 * size, p.z);
        ridge.rotation.z = 0;
      }
    }
  }
  return root;
}

/** The visual parent follows body sway/pose. Changing clothes never mutates the genome. */
export function syncCulturalOutfit(body: THREE.Group, genome: Genome, design?: CulturalDesign): void {
  const key = outfitAppearance(design);
  if (body.userData.cultureKey === key) return;
  const previous = body.getObjectByName('cultural-outfit');
  if (previous) { previous.removeFromParent(); disposeObject(previous); }
  if (design) (body.userData.visual as THREE.Group).add(createCulturalOutfit(genome, design));
  body.userData.cultureKey = key;
}
