import * as THREE from 'three';
import type { ShipBlueprint } from '../game/ship-design';

/** One geometry vocabulary for the editable construction and the paid ship. Forward is −Z. */
export function createShip(b: ShipBlueprint): THREE.Group {
  const ship = new THREE.Group(); ship.name = b.name;
  const material = (color: string, metalness = .25) => new THREE.MeshStandardMaterial({ color, roughness: .4, metalness });
  const body = material(b.color), brass = material('#d9ba75', .6), dark = material('#143c49');
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.78, 20, 12), new THREE.MeshStandardMaterial({ color: '#aadce0', roughness: .12, metalness: .5 }));
  cockpit.scale.set(.8, .65, 1.35); cockpit.position.set(0, .35, -.65); ship.add(cockpit);
  for (const part of b.parts) {
    const g = new THREE.Group(); g.userData.shipPart = part.id; g.userData.kind = part.kind;
    g.position.set(part.position.x, part.position.y, part.position.z); g.scale.set(part.scale.x, part.scale.y, part.scale.z); g.rotation.y = part.yaw * Math.PI / 180;
    let shape: THREE.Mesh;
    if (part.kind === 'hull') { shape = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), body.clone()); shape.scale.set(.85, .65, 1); }
    else if (part.kind === 'engine') {
      shape = new THREE.Mesh(new THREE.CylinderGeometry(.35, .55, 1.1, 12), brass.clone()); shape.rotation.x = Math.PI / 2;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(.3, 1.3, 10), new THREE.MeshBasicMaterial({ color: '#8dfbf4', transparent: true, opacity: .8, depthWrite: false }));
      flame.rotation.x = Math.PI / 2; flame.position.z = .9; flame.userData.exhaust = true; g.add(flame);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.43, .08, 6, 16), dark.clone()); ring.position.z = .5; g.add(ring);
    } else if (part.kind === 'fin') {
      const wing = new THREE.Shape(); wing.moveTo(-.8, -.7); wing.quadraticCurveTo(-1, .6, 0, 1); wing.quadraticCurveTo(1, .6, .8, -.7); wing.closePath();
      shape = new THREE.Mesh(new THREE.ExtrudeGeometry(wing, { depth: .08, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: b.color, metalness: .65, roughness: .3 })); shape.rotation.x = -Math.PI / 2;
      const vein = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 1.7, 6), brass.clone()); vein.rotation.x = Math.PI / 2; vein.position.y = .1; g.add(vein);
    } else if (part.kind === 'cargo') {
      shape = new THREE.Mesh(new THREE.IcosahedronGeometry(.8, 1), dark.clone());
      const band = new THREE.Mesh(new THREE.TorusGeometry(.68, .09, 6, 16), brass.clone()); band.rotation.x = Math.PI / 2; g.add(band);
    } else {
      shape = new THREE.Mesh(new THREE.SphereGeometry(.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), body.clone());
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.04, .1, .8, 6), brass.clone()); antenna.position.y = .55; g.add(antenna);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 8), new THREE.MeshBasicMaterial({ color: '#d4fff0' })); eye.position.y = 1; g.add(eye);
    }
    g.add(shape); g.traverse(node => { if (node instanceof THREE.Mesh) { node.userData.shipPart = part.id; node.castShadow = true; } }); ship.add(g);
    const anchor = new THREE.Vector3(part.position.x, part.position.y, part.position.z), length = anchor.length();
    if (length > .7) {
      const link = new THREE.Mesh(new THREE.CylinderGeometry(.045, .065, length - .35, 6), brass.clone());
      link.position.copy(anchor).multiplyScalar((length + .35) / (2 * length)); link.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.normalize()); link.userData.shipPart = part.id; ship.add(link);
    }
  }
  // Temporary prototype materials are not attached; their clones are owned by the model.
  body.dispose(); brass.dispose(); dark.dispose();
  return ship;
}
export function animateShip(ship: THREE.Group, time: number, moving: boolean, reducedMotion = false, powered = true) {
  ship.traverse(node => { if (node.userData.exhaust) { node.scale.y = moving ? 1.2 + (reducedMotion ? 0 : Math.sin(time * 22) * .15) : .25; (node as THREE.Mesh).visible = powered; } });
}
