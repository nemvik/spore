import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { feedTarget, primaryInteraction, tendTarget } from '../src/game/interactions';
import { cloneGenome, computeStats, functionalProfile, genomeCost, initialGenome } from '../src/game/genome';
import { mouthWorldPosition } from '../src/game/locomotion';
import { createGame, makeCheckpoint, step } from '../src/game/simulation';
import { spawnCreature } from '../src/game/world';
import { parseGame, serializeGame } from '../src/game/persistence';
import { GameRenderer } from '../src/render/renderer';
import { EMPTY_INPUT } from '../src/game/types';
import type { FeedSelection, FoodKind, GameState, Vec3 } from '../src/game/types';

// Prepared deterministic scenes verify target identity; these are not campaign evidence.
function scene(jaw = true) {
  const s = createGame(481516, false);
  s.world.creatures = []; s.world.obstacles = [];
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.sourceId === r.id));
  s.player.genome = cloneGenome(s.player.genome);
  if (jaw) {
    s.player.genome.parts = s.player.genome.parts.filter(p => p.kind !== 'filter');
    s.player.genome.parts.push({ id: 'test-jaw', kind: 'jaw', axial: .9, angle: 0, scale: 1, mirrored: false });
  }
  s.player.totalDna = 200; s.player.dna = genomeCost(initialGenome()) + 200 - genomeCost(s.player.genome);
  s.player.heading = 0; s.player.energy = 70; s.player.health = computeStats(s.player.genome).maxHealth;
  return s;
}
// Identity scenarios keep prey inside actual jaw contact. Distant contact and
// the separation from proboscis reach are covered in bite-contact.test.ts.
function creature(s: GameState, offset = 1.2) {
  const c = spawnCreature(s.world, 'veil', 0), mouth = mouthWorldPosition(functionalProfile(s.player.genome), s.player.pos, s.player.heading);
  Object.assign(c, { pos: { ...mouth, x: mouth.x + offset }, velocity: { x: 0, y: 0, z: 0 }, hunger: 0, fear: 0, cooldown: 20, health: 100 });
  s.world.creatures.push(c); return c;
}
function food(s: GameState, offset = 1, kind: FoodKind = 'detritus') {
  const mouth = mouthWorldPosition(functionalProfile(s.player.genome), s.player.pos, s.player.heading);
  const r = { id: s.world.nextId++, pos: { ...mouth, x: mouth.x + offset }, kind, amount: 4, max: 4, regen: 0, patch: 0 };
  s.world.resources.push(r); return r;
}
function selection(s: GameState, kind: FeedSelection['kind'], id: number): FeedSelection { return { kind, id, stage: s.stage }; }
const act = (s: GameState, feedSelection?: FeedSelection | null) => step(s, { ...EMPTY_INPUT, feed: true, feedSelection });

describe('deliberate feeding and hunting identity', () => {
  it('keeps a selected creature despite a closer carcass and a closer living bystander', () => {
    const s = scene(), target = creature(s, 1.2), bystander = creature(s, .8), carcass = food(s, .5, 'meat');
    const selected = selection(s, 'creature', target.id);
    expect(feedTarget(s)?.id).toBe(carcass.id);
    expect(feedTarget(s, selected)).toMatchObject({ id: target.id, kind: 'prey', deliberate: true, ready: true });
    expect(primaryInteraction([feedTarget(s, selected), tendTarget(s)])?.id).toBe(target.id);
    act(s, selected);
    expect(target.health).toBeLessThan(100); expect(bystander.health).toBe(100); expect(carcass.amount).toBe(4);
    expect(s.player.meals).toBe(0);
  });

  it('eats selected food while leaving a nearer attackable creature unharmed', () => {
    const s = scene(), target = food(s, 3), bystander = creature(s, .5);
    expect(feedTarget(s)?.id).toBe(bystander.id);
    act(s, selection(s, 'food', target.id));
    expect(target.amount).toBe(3); expect(bystander.health).toBe(100); expect(s.player.meals).toBe(1);
  });

  it.each(['distance', 'blocked', 'energy', 'mouth'] as const)('applies the same %s eligibility to an exact creature identity without fallback', reason => {
    const s = scene(reason !== 'mouth'), target = creature(s, reason === 'distance' ? 35 : 1.2), other = food(s, .3);
    const selected = selection(s, 'creature', target.id);
    if (reason === 'blocked') s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: target.pos.x - .7, y: -5, z: target.pos.z }, radius: .3, height: 12 });
    if (reason === 'energy') s.player.energy = 1;
    expect(feedTarget(s, selected)).toMatchObject({ id: target.id, ready: false, reason });
    act(s, selected);
    expect(target.health).toBe(100); expect(other.amount).toBe(4); expect(s.player.meals).toBe(0);
  });

  it('keeps the target unavailable during cooldown and attacks it once the action completes', () => {
    const s = scene(), target = creature(s), selected = selection(s, 'creature', target.id);
    s.player.cooldown = .5; expect(feedTarget(s, selected)?.reason).toBe('cooldown');
    act(s, selected); expect(target.health).toBe(100);
    for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT);
    act(s, selected); expect(target.health).toBeLessThan(100);
  });

  it.each(['depleted', 'diet'] as const)('does not replace a selected %s food with another reachable meal', reason => {
    const s = scene(), target = food(s, 1, reason === 'diet' ? 'algae' : 'meat'), other = food(s, 2);
    if (reason === 'depleted') target.amount = .4;
    const selected = selection(s, 'food', target.id);
    expect(feedTarget(s, selected)).toMatchObject({ id: target.id, reason, ready: false });
    act(s, selected); expect(other.amount).toBe(4); expect(s.player.meals).toBe(0);
  });

  it('stops held Space after the selected kill until the player explicitly clears or selects another identity', () => {
    const s = scene(), target = creature(s), other = creature(s, 3), selected = selection(s, 'creature', target.id);
    target.health = 1; act(s, selected);
    expect(s.player.kills).toBe(1); expect(feedTarget(s, selected)).toBeNull();
    const corpse = s.world.resources.find(r => r.kind === 'meat')!;
    for (let i = 0; i < 150; i++) act(s, selected);
    expect(s.player.kills).toBe(1); expect(other.health).toBe(100); expect(corpse.amount).toBe(3); expect(s.player.meals).toBe(0);
    s.player.cooldown = 0; act(s, selection(s, 'food', corpse.id));
    expect(s.player.meals).toBe(1);
  });

  it.each(['missing', 'wrong-stage', 'dead'] as const)('fails closed for a %s selection, while a deliberate clear restores automatic choice', reason => {
    const s = scene(), target = creature(s), other = food(s, .2), selected = selection(s, 'creature', target.id);
    if (reason === 'missing') s.world.creatures = [];
    if (reason === 'wrong-stage') selected.stage = 1;
    if (reason === 'dead') target.health = 0;
    expect(feedTarget(s, selected)).toBeNull(); act(s, selected); expect(other.amount).toBe(4);
    s.player.cooldown = 0; act(s, null); expect(other.amount).toBe(3);
  });

  it('keeps selection out of saves and produces identical results for identical explicit commands after reload', () => {
    const s = scene(), target = creature(s), selected = selection(s, 'creature', target.id); makeCheckpoint(s);
    const serialized = serializeGame(s); expect(serialized).not.toContain('feedSelection');
    const loaded = parseGame(serialized);
    act(s, selected); act(loaded, selected);
    expect(loaded.player).toEqual(s.player); expect(loaded.world).toEqual(s.world);
    expect(serializeGame(loaded)).not.toContain('feedSelection');
  });
});

describe('visible world geometry picking', () => {
  function view() {
    const s = scene(), c = creature(s); c.pos = { x: 0, y: 0, z: 0 };
    const renderer = Object.create(GameRenderer.prototype) as GameRenderer;
    const scene3d = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .1, 100);
    camera.position.set(0, 4, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const target = new THREE.Group(); target.add(new THREE.Mesh(new THREE.SphereGeometry(.7), new THREE.MeshBasicMaterial())); scene3d.add(target);
    const world = new THREE.Group(); scene3d.add(world);
    Object.assign(renderer, { scene: scene3d, camera, pointer: new THREE.Vector2(), raycaster: new THREE.Raycaster(), creatureMeshes: new Map([[c.id, target]]), resources: new Map(), journey: { group: new THREE.Group() }, worldGroup: world, player: null, renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 600 }) } } });
    const dispose = () => scene3d.traverse(node => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => m.dispose()); } });
    return { s, c, renderer, target, world, dispose };
  }
  it('picks the visible identity and clears on empty background without altering world state', () => {
    const v = view(), before = structuredClone(v.s);
    try { expect(v.renderer.pickWorld(v.s, 300, 300)).toEqual(selection(v.s, 'creature', v.c.id)); expect(v.renderer.pickWorld(v.s, 10, 10)).toBeNull(); expect(v.s).toEqual(before); } finally { v.dispose(); }
  });
  it('respects a solid foreground blocker while allowing the visible target behind faded canopy', () => {
    const v = view(), material = new THREE.MeshBasicMaterial(), wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, .5), material); wall.position.set(0, 1.6, 4); v.world.add(wall);
    try { expect(v.renderer.pickWorld(v.s, 300, 300)).toBeNull(); material.transparent = true; material.opacity = .1; expect(v.renderer.pickWorld(v.s, 300, 300)?.id).toBe(v.c.id); } finally { v.dispose(); }
  });
  it('does not pick a hidden or dead creature mesh even if it remains in the rendered map for a frame', () => {
    const v = view();
    try { v.target.visible = false; expect(v.renderer.pickWorld(v.s, 300, 300)).toBeNull(); v.target.visible = true; v.c.health = 0; expect(v.renderer.pickWorld(v.s, 300, 300)).toBeNull(); } finally { v.dispose(); }
  });
});
