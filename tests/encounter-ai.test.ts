import type { WorldStage as Stage } from '../src/game/stage';
import { describe, expect, it } from 'vitest';
import { HUNTER_TIMING, hunterCue, stepHunters } from '../src/game/encounter-ai';
import { emptyJourney } from '../src/game/journey-types';
import { createGame, makeCheckpoint } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { parseGame, serializeGame } from '../src/game/persistence';
import { distance, groundHeight } from '../src/game/random';
import type { Creature, } from '../src/game/types';

// Authored encounter fixtures, not progression shortcuts or evidence of a campaign run.
function scenario(stage: Stage = 0) {
  const s = Object.assign(createGame(20260913), { journey: emptyJourney() });
  s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
  s.world.obstacles = []; s.world.resources = []; s.world.creatures = [];
  s.world.patches[0].center = { x: 0, y: stage === 0 ? 1.1 : 0, z: 0 };
  s.player.pos = { x: 0, y: stage === 0 ? 1.1 : 0, z: 6 }; s.player.health = 100; s.player.invulnerable = 0;
  const hunter = spawnCreature(s.world, stage === 0 ? 'needle' : stage === 1 ? 'ribbon' : 'crest', 0);
  Object.assign(hunter, { pos: { x: 0, y: s.player.pos.y, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, hunger: 50, age: 0, fear: 0, cooldown: 0, target: null, health: 55 });
  s.world.creatures.push(hunter);
  makeCheckpoint(s);
  return { s, hunter };
}
type State = ReturnType<typeof scenario>['s'];
function advance(s: State, frames: number, before?: (dt: number) => void, kills: { id: number; byPlayer: boolean }[] = []) {
  const dt = 1 / 60;
  for (let i = 0; i < frames; i++) {
    before?.(dt); s.tick++; s.world.time += dt; s.player.invulnerable = Math.max(0, s.player.invulnerable - dt);
    stepHunters(s, dt, (creature, byPlayer) => {
      kills.push({ id: creature.id, byPlayer });
      s.world.creatures = s.world.creatures.filter(c => c.id !== creature.id);
    });
  }
  return kills;
}
function obstacle(s: State, x: number, z: number, radius = .7) {
  s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x, y: -6, z }, radius, height: 14 });
}
function offer(s: State, pos = { x: 1, y: s.player.pos.y, z: 0 }, remaining = 30) {
  const resource = { id: s.world.nextId++, kind: 'meat' as const, pos, amount: 1, max: 1, patch: 0, regen: 0 };
  s.world.resources.push(resource); s.journey.offerings.push({ stage: s.stage, id: resource.id, site: 0, remaining });
  return resource;
}

describe('readable committed hunter attacks', () => {
  it('gives a stationary one-second windup before any movement or damage', () => {
    const { s, hunter } = scenario(), origin = { ...hunter.pos };
    advance(s, 1);
    expect(hunterCue(s, hunter.id)).toMatchObject({ phase: 'windup', targetPlayer: true, progress: 0, aim: s.player.pos });
    advance(s, 59);
    expect(hunter.pos).toEqual(origin); expect(s.player.health).toBe(100);
    expect(hunterCue(s, hunter.id)?.phase).toBe('windup');
    advance(s, 6);
    expect(hunterCue(s, hunter.id)?.phase).toBe('lunge');
    expect(hunter.pos.z).toBeGreaterThan(0);
  });

  it('lets a late sideways movement dodge the committed aim while standing still gets hit', () => {
    const stationary = scenario(), dodging = scenario();
    advance(stationary.s, 46); advance(dodging.s, 46);
    expect(dodging.s.journey.hunters[0].time).toBeCloseTo(HUNTER_TIMING.commit);
    const aim = { ...hunterCue(dodging.s, dodging.hunter.id)!.aim };
    advance(stationary.s, 75);
    advance(dodging.s, 75, dt => { dodging.s.player.velocity.x = 4.8; dodging.s.player.pos.x += 4.8 * dt; });
    expect(stationary.s.player.health).toBeLessThan(100);
    expect(dodging.s.player.health).toBe(100);
    expect(hunterCue(dodging.s, dodging.hunter.id)!.aim).toEqual(aim);
    expect(Math.abs(dodging.hunter.pos.x)).toBeLessThan(.001);
  });

  it('visibly leads an early moving target, locks the final .3 s, and catches predictable close lateral walking', () => {
    const { s, hunter } = scenario(); s.player.pos.z = 2.5; s.player.velocity.x = 4.8;
    advance(s, 1); const early = hunterCue(s, hunter.id)!;
    expect(early.aim.x).toBeGreaterThan(s.player.pos.x); expect(hunter.heading).toBeGreaterThan(0);
    advance(s, 45, dt => { s.player.pos.x += s.player.velocity.x * dt; });
    const committed = hunterCue(s, hunter.id)!.aim;
    expect(committed.x).toBeGreaterThan(s.player.pos.x);
    expect(committed).not.toEqual(early.aim);
    expect(s.journey.hunters[0].time).toBeCloseTo(HUNTER_TIMING.commit);
    advance(s, 75, dt => { s.player.pos.x += s.player.velocity.x * dt; });
    expect(s.player.health).toBe(88);
    expect(hunterCue(s, hunter.id)!.aim).toEqual(committed);
    expect(hunterCue(s, hunter.id)?.phase).toBe('recover');
  });

  it('lets the same walking target change perpendicular direction after the lock and escape the immutable lunge', () => {
    const { s, hunter } = scenario(); s.player.pos.z = 2.5; s.player.velocity.x = 4.8;
    advance(s, 46, dt => { s.player.pos.x += s.player.velocity.x * dt; });
    const committed = { ...hunterCue(s, hunter.id)!.aim };
    s.player.velocity = { x: 0, y: 0, z: 4.8 };
    advance(s, 20, dt => { s.player.pos.z += s.player.velocity.z * dt; });
    expect(hunterCue(s, hunter.id)?.phase).toBe('lunge');
    const velocity = { ...hunter.velocity };
    advance(s, 10, dt => { s.player.pos.z += s.player.velocity.z * dt; });
    expect(hunter.velocity.x).toBeCloseTo(velocity.x); expect(hunter.velocity.z).toBeCloseTo(velocity.z);
    advance(s, 45, dt => { s.player.pos.z += s.player.velocity.z * dt; });
    expect(s.player.health).toBe(100); expect(hunterCue(s, hunter.id)!.aim).toEqual(committed);
    expect(hunterCue(s, hunter.id)?.phase).toBe('recover');
  });

  it('closes the land gap before the full tell, then catches close predictable walking without touching on approach', () => {
    const { s, hunter } = scenario(2);
    hunter.pos.y = groundHeight(0, 0, 2) + .8;
    s.player.pos.y = groundHeight(0, 6, 2) + .8;
    advance(s, 1);
    expect(hunterCue(s, hunter.id)?.phase).toBe('stalk');
    expect(hunter.pos.z).toBeGreaterThan(0); expect(s.player.health).toBe(100);
    for (let i = 0; i < 90 && hunterCue(s, hunter.id)?.phase === 'stalk'; i++) advance(s, 1);
    expect(hunterCue(s, hunter.id)?.phase).toBe('windup');
    expect(distance(hunter.pos, s.player.pos)).toBeLessThan(3.2);
    const origin = { ...hunter.pos };
    s.player.velocity = { x: 4.8, y: 0, z: 0 };
    advance(s, 45, dt => { s.player.pos.x += 4.8 * dt; s.player.pos.y = groundHeight(s.player.pos.x, s.player.pos.z, 2) + .8; });
    expect(hunter.pos).toEqual(origin); expect(s.player.health).toBe(100);
    advance(s, 75, dt => { s.player.pos.x += 4.8 * dt; s.player.pos.y = groundHeight(s.player.pos.x, s.player.pos.z, 2) + .8; });
    expect(s.player.health).toBeLessThan(100); expect(hunterCue(s, hunter.id)?.phase).toBe('recover');
  });

  it('allows one strike and then an actual recovery opportunity', () => {
    const { s, hunter } = scenario(); advance(s, 120);
    expect(s.player.health).toBe(88);
    expect(hunterCue(s, hunter.id)?.phase).toBe('recover');
    const position = { ...hunter.pos };
    advance(s, 60);
    expect(s.player.health).toBe(88); expect(hunter.pos).toEqual(position);
    expect(hunterCue(s, hunter.id)?.phase).toBe('recover');
  });

  it('breaks the windup when the player takes cover instead of tracking or biting through it', () => {
    const { s, hunter } = scenario(); advance(s, 15);
    obstacle(s, 0, 3);
    advance(s, 60);
    expect(s.player.health).toBe(100);
    expect(hunterCue(s, hunter.id)?.phase).not.toBe('lunge');
    expect(hunter.pos.z).toBeLessThan(2);
  });

  it('sweeps a lunging body against a new obstacle and never attacks through the wall', () => {
    const { s, hunter } = scenario(); advance(s, 65);
    expect(hunterCue(s, hunter.id)?.phase).toBe('lunge');
    obstacle(s, 0, 3, .4);
    advance(s, 90);
    expect(hunter.pos.z).toBeLessThanOrEqual(3 - .4 - .85 * .55 + .001);
    expect(s.player.health).toBe(100);
  });

  it('normalizes a three-dimensional lunge and bounds a delayed step without teleporting', () => {
    const { s, hunter } = scenario(1); s.player.pos = { x: 3, y: 3, z: 3 };
    advance(s, 65);
    expect(hunterCue(s, hunter.id)?.phase).toBe('lunge');
    expect(Math.hypot(hunter.velocity.x, hunter.velocity.y, hunter.velocity.z)).toBeCloseTo(5 * 2.6);
    const previous = { ...hunter.pos };
    stepHunters(s, 30, () => {});
    expect(distance(previous, hunter.pos)).toBeLessThanOrEqual(5 * 2.6 / 30 + 1e-9);
  });

  it('does not grant targeting immunity to spines or a shield partner, but both mitigate the strike', () => {
    const bare = scenario(), defended = scenario();
    defended.s.player.genome.parts.push({ id: 'defensive-spines', kind: 'spines', axial: 0, angle: 0, scale: 1, mirrored: false });
    defended.s.player.bonds.push({ species: 'mender', benefit: 'shield', hunger: 10, loyalty: 65, age: 10 });
    advance(bare.s, 1); advance(defended.s, 1);
    expect(hunterCue(defended.s, defended.hunter.id)).toMatchObject({ phase: 'windup', targetPlayer: true });
    advance(bare.s, 120); advance(defended.s, 120);
    expect(defended.s.player.health).toBeLessThan(100);
    expect(defended.s.player.health).toBeGreaterThan(bare.s.player.health);
    expect(defended.hunter.health).toBeLessThan(bare.hunter.health);
  });

  it('credits a defensive spine kill to the player once', () => {
    const { s, hunter } = scenario(); hunter.health = 5;
    s.player.genome.parts.push({ id: 'defensive-spines', kind: 'spines', axial: 0, angle: 0, scale: 1, mirrored: false });
    const kills = advance(s, 180);
    expect(kills).toEqual([{ id: hunter.id, byPlayer: true }]);
    expect(s.world.creatures).toHaveLength(0);
  });

  it('lets fear interrupt a windup and create escape time', () => {
    const { s, hunter } = scenario(); advance(s, 10); hunter.fear = 2;
    advance(s, 90);
    expect(hunterCue(s, hunter.id)?.phase).toBe('recover');
    expect(hunter.intent).toBe('flee'); expect(s.player.health).toBe(100);
  });
});

describe('offering, territory and food-web behavior', () => {
  it('consumes a real live meat offering and grants several seconds of feeding distraction', () => {
    const { s, hunter } = scenario(), resource = offer(s);
    advance(s, 1);
    expect(resource.amount).toBe(0); expect(hunter.hunger).toBeLessThan(10);
    expect(hunterCue(s, hunter.id)).toMatchObject({ phase: 'recover', feeding: true, targetPlayer: false });
    expect(s.journey.hunters[0].time).toBe(HUNTER_TIMING.feeding);
    advance(s, 180);
    expect(s.player.health).toBe(100); expect(hunterCue(s, hunter.id)?.feeding).toBe(true);
  });

  it.each(['expired', 'missing', 'wrong-stage', 'non-meat'] as const)('historical v2 does not treat a %s offering entry as free distraction', kind => {
    const { s, hunter } = scenario(), resource = offer(s);
    s.journey.version = 2; delete s.journey.canopy;
    if (kind === 'expired') s.journey.offerings[0].remaining = 0;
    if (kind === 'missing') s.world.resources = [];
    if (kind === 'wrong-stage') s.journey.offerings[0].stage = 1;
    if (kind === 'non-meat') s.world.resources[0].kind = 'algae';
    advance(s, 1);
    expect(hunterCue(s, hunter.id)).toMatchObject({ phase: 'windup', targetPlayer: true });
    expect(resource.amount).toBe(1);
  });

  it('does not smell an offering through solid cover while ignoring a visible player', () => {
    const { s, hunter } = scenario(); s.player.pos = { x: 6, y: 1.1, z: 0 };
    offer(s, { x: 0, y: 1.1, z: 4 }); obstacle(s, 0, 2);
    advance(s, 1);
    expect(hunterCue(s, hunter.id)).toMatchObject({ phase: 'windup', targetPlayer: true });
  });

  it('lets a meat offering interrupt preparation, but cannot turn an already launched attack', () => {
    const preparing = scenario(), committed = scenario();
    advance(preparing.s, 25); const earlyFood = offer(preparing.s);
    advance(preparing.s, 1);
    expect(earlyFood.amount).toBe(0); expect(hunterCue(preparing.s, preparing.hunter.id)?.feeding).toBe(true);
    advance(committed.s, 65); const velocity = { ...committed.hunter.velocity }, aim = { ...hunterCue(committed.s, committed.hunter.id)!.aim };
    expect(hunterCue(committed.s, committed.hunter.id)?.phase).toBe('lunge');
    const lateFood = offer(committed.s, { x: 4, y: 1.1, z: 0 });
    advance(committed.s, 5);
    expect(committed.hunter.target).toBe(-1); expect(lateFood.amount).toBe(1);
    expect(committed.hunter.velocity.z).toBeCloseTo(velocity.z); expect(committed.hunter.velocity.x).toBeCloseTo(velocity.x);
    expect(hunterCue(committed.s, committed.hunter.id)!.aim).toEqual(aim);
  });

  it('still hunts vulnerable NPC prey when the player is outside the territory', () => {
    const { s, hunter } = scenario(); s.player.pos.x = 60;
    const prey = spawnCreature(s.world, 'veil', 0);
    Object.assign(prey, { pos: { x: 0, y: 1.1, z: 5 }, velocity: { x: 0, y: 0, z: 0 }, health: 10 }); s.world.creatures.push(prey);
    advance(s, 1);
    expect(hunter.target).toBe(prey.id);
    const kills = advance(s, 140);
    expect(kills).toEqual([{ id: prey.id, byPlayer: false }]);
    expect(s.player.health).toBe(100);
  });

  it('does not pursue a nearby player outside the local territorial leash', () => {
    const { s, hunter } = scenario(); hunter.pos.x = 30; s.player.pos = { x: 36, y: 1.1, z: 0 };
    advance(s, 120);
    expect(hunter.target).toBeNull(); expect(hunter.pos.x).toBeLessThan(30);
    expect(s.player.health).toBe(100);
  });

  it('follows living twilight cargo beyond the original territory while ordinary bodies and solid cover avoid detection', () => {
    const carrier = scenario(), ordinary = scenario(), covered = scenario(), depleted = scenario();
    for (const { s, hunter } of [carrier, ordinary, covered, depleted]) {
      hunter.patch = 2; hunter.pos = { x: 30, y: 1.1, z: 0 };
      s.world.patches[2].center = { x: 0, y: 1.1, z: 0 }; s.world.patches[2].radius = 29;
      // The player is outside the original territory and too far away for normal
      // detection. These target-selection fixtures are not serialized campaigns.
      s.player.pos = { x: 48, y: 1.1, z: 0 };
    }
    for (const { s } of [carrier, covered, depleted]) s.journey.cargo = { kind: 'algae', purpose: 'culture', site: 2, vitality: 100, distance: 30 };
    depleted.s.journey.cargo!.vitality = 0;
    obstacle(covered.s, 39, 0, 1);
    for (const { s } of [carrier, ordinary, covered, depleted]) advance(s, 1);
    expect(carrier.hunter.target).toBe(-1);
    expect(carrier.hunter.pos.x).toBeGreaterThan(30);
    for (const { hunter } of [ordinary, covered, depleted]) expect(hunter.target).toBeNull();
    advance(carrier.s, 120); advance(ordinary.s, 120);
    expect(carrier.hunter.pos.x).toBeGreaterThan(35);
    expect(ordinary.hunter.pos.x).toBeLessThan(30);
    expect(covered.s.player.health).toBe(100);
  });

  it('extends the land corridor hunter leash only for the living site-8 culture and pursues faster than a walking carrier', () => {
    const cases = ['culture', 'ordinary-food', 'other-culture', 'depleted', 'cover'] as const;
    for (const variant of cases) {
      const { s, hunter } = scenario(2); hunter.patch = 2;
      s.world.patches[2].center = { x: 0, y: 0, z: 0 }; s.world.patches[2].radius = 29;
      hunter.pos = { x: 30, y: groundHeight(30, 0, 2) + .8, z: 0 };
      s.player.pos = { x: 48, y: groundHeight(48, 0, 2) + .8, z: 0 };
      s.player.velocity = { x: 4.8, y: 0, z: 0 };
      s.journey.cargo = { kind: 'detritus', purpose: variant === 'ordinary-food' ? 'food' : 'culture', site: variant === 'other-culture' ? 7 : 8, vitality: variant === 'depleted' ? 0 : 100, distance: 30 };
      if (variant === 'cover') obstacle(s, 39, 0, 1);
      advance(s, 1);
      if (variant === 'culture') {
        expect(hunter.target).toBe(-1); expect(Math.hypot(hunter.velocity.x, hunter.velocity.z)).toBeCloseTo(5.4);
        const initialGap = s.player.pos.x - hunter.pos.x;
        advance(s, 120, dt => { s.player.pos.x += 4.8 * dt; s.player.pos.y = groundHeight(s.player.pos.x, 0, 2) + .8; });
        expect(s.player.pos.x - hunter.pos.x).toBeLessThan(initialGap - 1);
        expect(s.player.health).toBe(100); // Pursuit is pressure, not contact damage.
      } else expect(hunter.target, variant).toBeNull();
    }
  });

  it.each(['gloom', 'bell', 'gnaw'])('prefers genuinely nearer living land prey (%s) over the player', species => {
    const { s, hunter } = scenario(2); s.player.pos.z = 10;
    const prey = spawnCreature(s.world, species, 0); prey.pos = { x: 0, y: 0, z: 4 }; s.world.creatures.push(prey);
    advance(s, 1); expect(hunter.target).toBe(prey.id);
  });

  it('keeps the player as the near land target instead of flickering to almost equidistant prey', () => {
    const { s, hunter } = scenario(2), prey = spawnCreature(s.world, 'gloom', 0);
    prey.pos = { x: 0, y: 0, z: 5.5 }; s.world.creatures.push(prey);
    advance(s, 1); expect(hunter.target).toBe(-1);
  });

  it('can kill a wild land carrier through the actual committed attack, while completed campaigns leave it outside the diet', () => {
    for (const won of [false, true]) {
      const { s, hunter } = scenario(2); s.campaign.won = won; s.player.pos.x = 60;
      hunter.pos.y = groundHeight(0, 0, 2) + .8;
      const prey = spawnCreature(s.world, 'gloom', 0);
      Object.assign(prey, { pos: { x: 0, y: groundHeight(0, 3, 2) + .8, z: 3 }, velocity: { x: 0, y: 0, z: 0 }, health: 10 });
      s.world.creatures.push(prey);
      const kills = advance(s, 120);
      expect(kills).toEqual(won ? [] : [{ id: prey.id, byPlayer: false }]);
      if (won) expect(hunter.target).toBeNull();
    }
  });

  it('preserves earlier-stage player priority and excludes partner species from the earlier food web', () => {
    for (const stage of [0, 1] as const) {
      const { s, hunter } = scenario(stage), prey = spawnCreature(s.world, stage === 0 ? 'veil' : 'sail', 0);
      prey.pos = { x: 0, y: s.player.pos.y, z: 2 }; s.world.creatures.push(prey);
      advance(s, 1); expect(hunter.target).toBe(-1);
      const independent = scenario(stage), partner = spawnCreature(independent.s.world, stage === 0 ? 'lantern' : 'mender', 0);
      independent.s.player.pos.x = 60; partner.pos = { x: 0, y: independent.hunter.pos.y, z: 2 }; independent.s.world.creatures.push(partner);
      advance(independent.s, 1); expect(independent.hunter.target).toBeNull();
    }
  });
});

describe('deterministic persistent encounter phases', () => {
  it.each([30, 50, 75])('continues identically after a production save/load roundtrip at frame %i', frames => {
    const original = scenario();
    // Complete the saved campaign metadata without introducing encounter geometry
    // or extra actors. Ordinary non-meat sources do not distract these hunters.
    for (const patch of original.s.world.patches) {
      const source = { id: original.s.world.nextId++, kind: 'algae' as const, pos: { ...patch.center }, amount: 12, max: 12, patch: patch.id, regen: .08 };
      original.s.world.resources.push(source);
      original.s.journey.sites.push({ id: patch.id, stage: 0, patch: patch.id, source: { ...source.pos }, refuges: [{ ...source.pos }, { ...source.pos }], sourceId: source.id, plantedId: null, vitality: 100, observed: false, resolved: false, method: null, threatIds: [], phase: 0 });
    }
    original.s.player.pos.z = 2.5; original.s.player.velocity.x = 3;
    makeCheckpoint(original.s); advance(original.s, frames, dt => { original.s.player.pos.x += original.s.player.velocity.x * dt; });
    const restored = parseGame(serializeGame(original.s));
    advance(original.s, 240, dt => { original.s.player.pos.x += original.s.player.velocity.x * dt; });
    advance(restored, 240, dt => { restored.player.pos.x += restored.player.velocity.x * dt; });
    expect(restored).toEqual(original.s);
  });

  it('leaves legacy campaigns and ordinary grazers to the existing NPC simulation', () => {
    const { s } = scenario(); s.journey.legacy = true;
    const before = structuredClone(s);
    stepHunters(s, 1 / 60, () => {}); expect(s).toEqual(before);
    s.journey.legacy = false; s.world.creatures = [spawnCreature(s.world, 'veil', 0)];
    const grazer: Creature = structuredClone(s.world.creatures[0]);
    stepHunters(s, 1 / 60, () => {}); expect(s.world.creatures[0]).toEqual(grazer);
  });

  it('removes stale local hunter memories while retaining inactive-stage memories', () => {
    const { s, hunter } = scenario();
    s.journey.hunters = [
      { stage: 0, id: 99999, phase: 'recover', time: 1, aim: { x: 0, y: 0, z: 0 } },
      { stage: 1, id: 99998, phase: 'windup', time: .5, aim: { x: 0, y: 0, z: 0 } },
    ];
    advance(s, 1);
    expect(s.journey.hunters.map(h => h.id)).toEqual([99998, hunter.id]);
    const cue = hunterCue(s, hunter.id)!; cue.aim.x = 999;
    expect(s.journey.hunters.find(h => h.id === hunter.id)!.aim.x).not.toBe(999);
  });
});
