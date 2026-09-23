import { discoveryState } from '../game/creature-discovery';
import * as THREE from 'three';
import { activeCreatureStage } from '../game/creature-stage';
import { SOCIAL_ACTIONS } from '../game/creature-stage-types';
import type { GameState } from '../game/types';
import { groundHeight } from '../game/random';
import { createOrganism, animateOrganism, disposeObject, organismGroundClearance } from './organism';

function ring(radius: number, color: number) {
  const geometry = new THREE.RingGeometry(radius, radius + .15, 36); geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false }));
}

/** Fixed small pools: no per-frame geometry or texture allocations. */
export class CreatureStagePresentation {
  readonly group = new THREE.Group();
  private world: unknown = null;
  private nests: THREE.Group[] = [];
  private kin: THREE.Group[] = [];
  private remains: THREE.Group[] = [];
  private alpha = ring(2.2, 0xffb759);
  private genome = '';
  private guards = Array.from({ length: 8 }, () => ring(2.3, 0xf09874));
  private companions = Array.from({ length: 3 }, () => ring(1.3, 0xacecc3));
  private reaction = ring(1.7, 0xf4d99c);
  private projectile = new THREE.Mesh(new THREE.SphereGeometry(.23, 8, 6), new THREE.MeshBasicMaterial({ color: 0xbae97c }));
  constructor() { this.group.add(...this.guards, ...this.companions, this.reaction, this.projectile, this.alpha); }
  update(s: GameState, reducedMotion: boolean) {
    const life = activeCreatureStage(s); this.group.visible = !!life;
    if (!life) return;
    if (this.world !== s.world) {
      for (const n of this.nests) { n.removeFromParent(); disposeObject(n); }
      for (const r of this.remains) { r.removeFromParent(); disposeObject(r); }
      this.remains = [];
      for (const site of discoveryState(s)?.remains ?? []) {
        const bones = new THREE.Group(), material = new THREE.MeshStandardMaterial({ color: 0xf5e3b7, roughness: .85 });
        bones.name = `discovery-remains-${site.id}`; bones.position.copy(site.pos);
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, 3.4, 7), material); spine.rotation.x = Math.PI / 2; spine.position.y = .28; bones.add(spine);
        for (let i = 0; i < 5; i++) {
          const rib = new THREE.Mesh(new THREE.TorusGeometry(.6 + Math.sin(i / 4 * Math.PI) * .45, .1, 5, 12, Math.PI), material);
          rib.position.set(0, .3, i * .62 - 1.25); bones.add(rib);
        }
        const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(.48, 0), material); skull.position.set(0, .5, 2); bones.add(skull);
        const glow = ring(2.5, 0xffdf91); glow.position.y = .12; bones.add(glow); bones.userData.glow = glow;
        this.remains.push(bones); this.group.add(bones);
      }
      this.nests = []; this.world = s.world;
      for (const n of life.nests) {
        const group = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0xa68a62, roughness: 1 });
        group.position.set(n.pos.x, n.pos.y, n.pos.z); group.name = `species-nest-${n.species}`;
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6, twig = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 2, 5), wood);
          twig.position.set(Math.cos(a) * 2.5, .25, Math.sin(a) * 2.5); twig.rotation.set(Math.PI / 2, 0, -a); group.add(twig);
        }
        const boundary = ring(3.1, 0xe7d5a5); boundary.position.y = .1; group.add(boundary); group.userData.ring = boundary;
        this.nests.push(group); this.group.add(group);
      }
    }
    this.nests.forEach((group, i) => {
      const n = life.nests[i]; (group.userData.ring.material as THREE.MeshBasicMaterial).color.setHex(n.relationship >= 60 ? 0xacecc3 : n.relationship <= -40 ? 0xee947d : 0xe7d5a5);
    });
    const key = JSON.stringify(s.player.genome);
    if (key !== this.genome) {
      for (const k of this.kin) { k.removeFromParent(); disposeObject(k); }
      this.kin = [createOrganism(s.player.genome), createOrganism(s.player.genome)]; this.genome = key;
      this.kin.forEach((k, i) => { k.scale.setScalar(.65); k.name = `home-kin-${i}`; this.group.add(k); });
    }
    const d = discoveryState(s);
    this.remains.forEach((bones, i) => { const site = d?.remains[i]; bones.visible = !!site; if (site) { bones.userData.glow.visible = !site.collected; bones.scale.setScalar(site.collected ? .85 : 1); } });
    const alpha = s.world.creatures.find(c => c.id === d?.alpha?.id && c.health > 0);
    this.alpha.visible = !!alpha; if (alpha) this.alpha.position.set(alpha.pos.x, groundHeight(alpha.pos.x, alpha.pos.z, 2) + .17, alpha.pos.z);
    const home = d?.migration?.pos ?? s.world.landmarks[0].pos;
    this.kin.forEach((k, i) => { const x = home.x + (i ? 3 : -3), z = home.z + 3; k.position.set(x, groundHeight(x, z, 2) + organismGroundClearance(s.player.genome) * .65, z); k.rotation.y = d?.migration?.heading ?? (i ? -.5 : .5); animateOrganism(k, reducedMotion ? 0 : s.world.time + i, d?.migration ? .7 : 0, 0, 2, 0, 0); });
    this.guards.forEach((r, i) => { const guard = life.guards[i]; r.visible = !!guard; if (guard) { r.position.set(guard.aim.x, groundHeight(guard.aim.x, guard.aim.z, 2) + .13, guard.aim.z); r.scale.setScalar(reducedMotion ? 1 : .5 + .5 * (1 - guard.remaining / .9)); } });
    this.companions.forEach((r, i) => { const c = s.world.creatures.find(c => c.id === life.pack[i]); r.visible = !!c; if (c) r.position.set(c.pos.x, groundHeight(c.pos.x, c.pos.z, 2) + .13, c.pos.z); });
    const e = life.encounter, cue = life.cue, target = s.world.creatures.find(c => c.id === (e?.target ?? cue?.target));
    this.reaction.visible = !!target;
    if (target) { this.reaction.position.set(target.pos.x, groundHeight(target.pos.x, target.pos.z, 2) + .17, target.pos.z); this.reaction.scale.setScalar(reducedMotion || !cue ? 1 : 1 + (1.2 - cue.remaining) * .45); this.reaction.material.color.setHex(cue?.success === false ? 0xee947d : cue?.success ? 0xacecc3 : 0xf4d99c); }
    this.projectile.visible = life.attack?.kind === 'spit';
    if (life.attack) this.projectile.position.copy(life.attack.pos);
  }
}

/** The opponent answers on screen; reduced motion keeps posture and colour cues. */
export function animateSpeciesResponse(model: THREE.Group, s: GameState, id: number, reducedMotion: boolean) {
  const life = activeCreatureStage(s), cue = life?.cue;
  if (!life || !cue || !SOCIAL_ACTIONS.includes(cue.action as typeof SOCIAL_ACTIONS[number])) return;
  const c = s.world.creatures.find(c => c.id === id), target = s.world.creatures.find(c => c.id === cue.target);
  const helping = life.pack.includes(id) && cue.success && c && target && c.pos && Math.hypot(c.pos.x-target.pos.x,c.pos.z-target.pos.z)<7;
  if (cue.target !== id && !helping) return;
  const phase = reducedMotion ? 0 : Math.sin((1.2 - cue.remaining) * 14) * Math.min(1, cue.remaining * 3);
  if (cue.action === 'dance') model.position.y += Math.abs(phase) * .45;
  if (cue.action === 'pose') model.rotation.z = phase * .13;
  if (cue.action === 'charm') model.rotation.y += phase * .28;
  if (cue.action === 'sing') model.scale.multiplyScalar(1 + phase * .035);
}
