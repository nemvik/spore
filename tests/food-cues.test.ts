import type { WorldStage as Stage } from '../src/game/stage';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGame, senseRange } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { actOnJourney, initializeJourneyStage, journeyAction } from '../src/game/journey';
import { groundHeight } from '../src/game/random';
import type { FoodKind, GameState, } from '../src/game/types';
import { FoodCues } from '../src/render/food-cues';
import { disposeObject } from '../src/render/organism';

// Prepared CPU presentation scenes; no campaign or player-duration claim.
function scene(stage: Stage = 0) {
  const s = createGame(20260913, false);
  for (let next = 1; next <= stage; next++) {
    s.stage = next as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.world.stage] = s.world; initializeJourneyStage(s);
  }
  s.world.obstacles = []; s.world.creatures = [];
  s.player.pos = { x: 0, y: stage === 0 ? 1.1 : stage === 1 ? 0 : groundHeight(0, 0, 2) + 1.2, z: 0 };
  s.player.heading = 0; s.player.cooldown = 0;
  return s;
}
function parts(cue: FoodCues) {
  return {
    bud: cue.group.getObjectByName('food-place-bud') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
    motes: cue.group.getObjectByName('food-consumer-motes') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>,
  };
}
function offering(s: GameState, kind: FoodKind = 'algae') {
  const food = { id: s.world.nextId++, kind, pos: { x: 0, y: s.player.pos.y, z: 4 }, amount: 2, max: 2, regen: 0, patch: 0 };
  s.world.resources.push(food); s.journey.offerings.push({ id: food.id, site: s.stage * 3, stage: s.stage, remaining: 120 });
  const creature = spawnCreature(s.world, s.stage === 0 ? 'veil' : s.stage === 1 ? 'sail' : 'bell', 0);
  creature.pos = { x: 5, y: s.player.pos.y, z: 4 }; creature.intent = 'forage'; creature.target = food.id; s.world.creatures.push(creature);
  return { food, creature };
}

describe('truthful local food offer presentation', () => {
  it.each([0, 1, 2] as const)('previews the real E placement in stage%i and then follows its actual resource ID', stage => {
    const s = scene(stage), cue = new FoodCues(), { bud } = parts(cue);
    try {
      for (const heading of [0, .7, Math.PI]) {
        s.player.heading = heading; s.player.cooldown = 0;
        s.journey.cargo = { purpose: 'food', kind: 'algae', site: stage * 3, vitality: 100, distance: 0 };
        const action = journeyAction(s, true)!, before = JSON.stringify(s);
        expect(action.ready).toBe(true); cue.update(s, 0);
        expect(cue.group.visible).toBe(true); expect(cue.group.userData.preview).toBe(true);
        expect(bud.position.x).toBe(action.pos.x); expect(bud.position.z).toBe(action.pos.z);
        expect(bud.position.y).toBe(stage === 2 ? groundHeight(action.pos.x, action.pos.z, 2) + .69 : action.pos.y);
        expect(JSON.stringify(s)).toBe(before);
        const preview = bud.position.clone();
        expect(actOnJourney(s, true)).toBe(true);
        const actual = s.world.resources.find(r => r.id === s.journey.offerings.at(-1)!.id)!;
        cue.update(s, 0);
        expect(cue.group.userData.resourceId).toBe(actual.id); expect(cue.group.userData.preview).toBe(false);
        expect(bud.position.toArray()).toEqual(preview.toArray());
        expect(actual.pos).toEqual(action.pos); // Land's visible grounding does not rewrite saved positions.
      }
    } finally { cue.dispose(); }
  });

  it('shows no misleading preview during cooldown or a blocked physical drop', () => {
    const s = scene(), cue = new FoodCues();
    s.journey.cargo = { purpose: 'food', kind: 'algae', site: 0, vitality: 100, distance: 0 };
    try {
      s.player.cooldown = .1; cue.update(s, 0); expect(cue.group.visible).toBe(false);
      s.player.cooldown = 0;
      s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 0, y: -8, z: -1 }, radius: .3, height: 12 });
      cue.update(s, 0); expect(cue.group.visible).toBe(false);
      s.world.obstacles = []; cue.update(s, 0); expect(cue.group.visible).toBe(true);
      s.journey.legacy = true; cue.update(s, 0); expect(cue.group.visible).toBe(false);
      s.journey.legacy = false; s.player.health = 0; cue.update(s, 0); expect(cue.group.visible).toBe(false);
    } finally { cue.dispose(); }
  });

  it('links only a real local offer and its living compatible forager, clearing interrupted relationships', () => {
    const stops: Array<(s: GameState, c: ReturnType<typeof offering>) => void> = [
      (_, { creature }) => { creature.intent = 'flee'; }, (_, { creature }) => { creature.intent = 'rest'; },
      (_, { creature }) => { creature.intent = 'hunt'; }, (_, { creature }) => { creature.health = 0; },
      (_, { creature }) => { creature.target = null; }, (_, { creature }) => { creature.target = -1; },
      (_, { creature }) => { creature.species = 'needle'; },
      (s, { creature }) => { creature.pos.x = senseRange(s) + 1; },
      (s) => { s.world.creatures = []; },
      (s) => { s.journey.offerings[0].remaining = 0; },
      (s) => { s.journey.offerings[0].stage = 1; },
      (s, { food }) => { s.world.resources = s.world.resources.filter(r => r !== food); },
      (_, { food }) => { food.amount = .49; },
    ];
    const cue = new FoodCues(), { motes } = parts(cue);
    try {
      for (const stop of stops) {
        const s = scene(), pair = offering(s); cue.update(s, 0);
        expect(motes.visible).toBe(true); expect(motes.count).toBeGreaterThan(0);
        expect(cue.group.userData.resourceId).toBe(pair.food.id); expect(cue.group.userData.creatureId).toBe(pair.creature.id);
        stop(s, pair); cue.update(s, 0);
        expect(motes.visible).toBe(false); expect(motes.count).toBe(0); expect(cue.group.userData.creatureId).toBeNull();
      }
    } finally { cue.dispose(); }
  });

  it.each([
    ['between food and consumer', 2.5, 4], ['between player and consumer', 2.5, 2], ['between player and food', 0, 2],
  ] as const)('does not reveal a relationship behind cover %s', (_, x, z) => {
    const s = scene(), cue = new FoodCues(), { motes } = parts(cue); offering(s);
    try {
      cue.update(s, 1); expect(motes.visible).toBe(true);
      s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x, y: -8, z }, radius: .45, height: 12 });
      cue.update(s, 1); expect(motes.visible).toBe(false);
    } finally { cue.dispose(); }
  });

  it('prioritizes an actual working mender at the attached crust, then ends when it is released', () => {
    const s = scene(1), cue = new FoodCues(), { motes } = parts(cue), canopy = s.journey.canopy!;
    const crust = s.world.resources.find(r => r.id === canopy.crustId)!;
    crust.pos = { x: 0, y: 0, z: 4 };
    const worker = spawnCreature(s.world, 'mender', 1); worker.pos = { x: 4, y: 0, z: 4 }; worker.intent = 'forage'; worker.target = crust.id; s.world.creatures.push(worker);
    try {
      const before = JSON.stringify(s); cue.update(s, 0);
      expect(cue.group.userData.resourceId).toBe(crust.id); expect(cue.group.userData.creatureId).toBe(worker.id);
      expect(motes.visible).toBe(true); expect(JSON.stringify(s)).toBe(before);
      worker.intent = 'flee'; cue.update(s, 0); expect(cue.group.visible).toBe(false);
      worker.intent = 'forage'; canopy.releasedAt = 1; cue.update(s, 0); expect(cue.group.visible).toBe(false);
    } finally { cue.dispose(); }
  });

  it('does not turn an unoffered meal or an unanswered new offer into a relationship', () => {
    const s = scene(), cue = new FoodCues(), { motes } = parts(cue), pair = offering(s);
    try {
      s.journey.offerings = []; cue.update(s, 0); expect(cue.group.visible).toBe(false);
      s.journey.offerings.push({ id: pair.food.id, site: 0, stage: 0, remaining: 120 });
      const newer = { ...pair.food, id: s.world.nextId++, pos: { x: -3, y: 1.1, z: 4 } }; s.world.resources.push(newer);
      s.journey.offerings.push({ id: newer.id, site: 0, stage: 0, remaining: 120 });
      cue.update(s, 0); expect(cue.group.userData.resourceId).toBe(newer.id); expect(motes.visible).toBe(false);
    } finally { cue.dispose(); }
  });

  it('reuses a bounded local instance buffer and stays read-only with animation frozen or running', () => {
    const s = scene(), cue = new FoodCues(), { motes } = parts(cue), pair = offering(s);
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), buffer = motes.instanceMatrix;
    try {
      const before = JSON.stringify(s); cue.update(s, 0); const frozen = Array.from(buffer.array);
      cue.update(s, 2); expect(Array.from(buffer.array)).not.toEqual(frozen);
      cue.update(s, 0); expect(Array.from(buffer.array)).toEqual(frozen);
      for (let frame = 0; frame < 40; frame++) cue.update(s, frame / 60);
      expect(motes.instanceMatrix).toBe(buffer); expect(motes.count).toBeLessThanOrEqual(24);
      for (let i = 0; i < motes.count; i++) {
        motes.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
        expect(point.x).toBeGreaterThanOrEqual(pair.food.pos.x); expect(point.x).toBeLessThanOrEqual(pair.creature.pos.x);
        expect(point.z).toBeCloseTo(4, 6); expect(point.y).toBeGreaterThanOrEqual(1.1 - 1e-6); expect(point.y).toBeLessThanOrEqual(1.26 + 1e-6);
      }
      expect(JSON.stringify(s)).toBe(before);
      expect(motes.material.depthTest).toBe(true); expect(motes.material.depthWrite).toBe(false);
      cue.group.updateMatrixWorld(true);
      expect(new THREE.Raycaster(new THREE.Vector3(0, 1.1, 10), new THREE.Vector3(0, 0, -1)).intersectObject(cue.group, true)).toEqual([]);
    } finally { cue.dispose(); }
  });

  it('detaches and disposes geometry, materials and instance buffers exactly once', () => {
    const s = scene(), cue = new FoodCues(), { bud, motes } = parts(cue), parent = new THREE.Group();
    parent.add(cue.group); offering(s); cue.update(s, 0);
    const counts = [0, 0, 0, 0, 0];
    bud.geometry.addEventListener('dispose', () => counts[0]++); bud.material.addEventListener('dispose', () => counts[1]++);
    motes.geometry.addEventListener('dispose', () => counts[2]++); motes.material.addEventListener('dispose', () => counts[3]++);
    motes.addEventListener('dispose', () => counts[4]++);
    cue.dispose(); cue.dispose(); cue.update(s, 2); disposeObject(parent);
    expect(parent.children).toHaveLength(0); expect(counts).toEqual([1, 1, 1, 1, 1]);
  });
});
