import { describe, expect, it } from 'vitest';
import { hunterThreatening } from '../src/game/hunter-appetite';
import { HUNTER_TIMING, stepHunters } from '../src/game/encounter-ai';
import { createGame, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { spawnCreature } from '../src/game/world';
import { parseGame, serializeGame } from '../src/game/persistence';
import { cloneGenome, genomeCost, initialGenome } from '../src/game/genome';
import { EMPTY_INPUT, type Creature, type GameState, type Resource, type Vec3 } from '../src/game/types';

/** Prepared encounter scenes. AI-only cases hold non-hunters still; public-step
 * cases explicitly exercise actual bites, corpse creation and save resumption. */
function scene(version: 2 | 3 = 3) {
  const s = createGame(481516, false); s.checkpoint = null;
  if (version === 2) { s.journey.version = 2; delete s.journey.canopy; }
  s.world.obstacles = []; s.world.creatures = [];
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.sourceId === r.id));
  s.world.patches[0].center = { x: 0, y: 1.1, z: 0 };
  s.world.landmarks[0].pos = { x: 70, y: 1.1, z: 70 };
  s.player.pos = { x: 60, y: 1.1, z: 60 }; s.player.invulnerable = 0; s.player.health = 100;
  const hunter = spawnCreature(s.world, 'needle', 0);
  Object.assign(hunter, { pos: { x: 0, y: 1.1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, heading: 0, health: 55, hunger: 70, target: null, fear: 0 });
  s.world.creatures.push(hunter);
  return { s, hunter };
}

function prey(s: GameState, pos = { x: 0, y: 1.1, z: 3 }) {
  const c = spawnCreature(s.world, 'veil', 0); c.pos = { ...pos }; c.hunger = 20; c.velocity = { x: 0, y: 0, z: 0 };
  s.world.creatures.push(c); return c;
}

function meat(s: GameState, pos: Vec3 = { x: 0, y: 1.1, z: 1 }, amount = 1, offered = false): Resource {
  const food: Resource = { id: s.world.nextId++, kind: 'meat', pos: { ...pos }, amount, max: Math.max(1, amount), patch: 0, regen: 0 };
  s.world.resources.push(food);
  if (offered) s.journey.offerings.push({ id: food.id, stage: 0, site: 0, remaining: 120 });
  return food;
}

function ai(s: GameState, frames = 1) {
  for (let i = 0; i < frames; i++) {
    s.tick++; s.world.time += 1 / 60; s.player.invulnerable = Math.max(0, s.player.invulnerable - 1 / 60);
    stepHunters(s, 1 / 60, () => { throw new Error('Unexpected death in stationary AI fixture'); });
  }
}

function commit(s: GameState, hunter: Creature, phase: 'windup' | 'lunge', target = -1) {
  hunter.target = target; hunter.intent = 'hunt';
  s.journey.hunters = [{ stage: 0, id: hunter.id, phase, time: phase === 'windup' ? HUNTER_TIMING.windup : HUNTER_TIMING.lunge, aim: { x: 0, y: 1.1, z: 3 } }];
  if (phase === 'lunge') hunter.velocity = { x: 0, y: 0, z: 10.4 };
}

describe('hunger and committed danger share one native-threat predicate', () => {
  it('distinguishes a sated hunter from a hungry one, without treating general injury as hunger', () => {
    const { s, hunter } = scene(); hunter.hunger = 40;
    expect(hunterThreatening(s, hunter)).toBe(false);
    hunter.health = 10; expect(hunterThreatening(s, hunter)).toBe(false);
    hunter.hunger = 40.01; expect(hunterThreatening(s, hunter)).toBe(true);
    hunter.health = 0; expect(hunterThreatening(s, hunter)).toBe(false);
    expect(hunterThreatening(s, prey(s))).toBe(false);
  });

  it.each(['windup', 'lunge'] as const)('keeps a sated %s threatening until the real commitment ends', phase => {
    const { s, hunter } = scene(); hunter.hunger = 0; commit(s, hunter, phase);
    expect(hunterThreatening(s, hunter)).toBe(true);
    s.journey.hunters[0].stage = 1; expect(hunterThreatening(s, hunter)).toBe(false);
    s.journey.hunters[0].stage = 0; s.journey.hunters[0].phase = 'recover';
    expect(hunterThreatening(s, hunter)).toBe(false);
  });

  it('preserves old predator danger independently of the newly meaningful hunger level', () => {
    const { s, hunter } = scene(2); hunter.hunger = 0;
    expect(hunterThreatening(s, hunter)).toBe(true);
    s.journey.legacy = true; expect(hunterThreatening(s, hunter)).toBe(true);
  });
});

describe('satiation changes the choice to hunt, while attacks stay readable', () => {
  it('patrols without choosing native prey while full, even if already injured', () => {
    const hungry = scene(), full = scene(); prey(hungry.s); prey(full.s);
    full.hunter.hunger = 0; full.hunter.health = 24;
    ai(hungry.s); ai(full.s, 120);
    expect(hungry.hunter.intent).toBe('hunt'); expect(hungry.hunter.target).toBe(hungry.s.world.creatures[1].id);
    expect(full.hunter.intent).toBe('rest'); expect(full.hunter.target).toBeNull();
    expect(full.s.world.creatures[1].health).toBe(32);
    expect(Math.hypot(full.hunter.velocity.x, full.hunter.velocity.z)).toBeLessThanOrEqual(4 * .38 + 1e-8);
  });

  it('ignores a nearby player while healthy and full, but an injured hunter defends within4.5m', () => {
    const calm = scene(), defensive = scene(), distant = scene(), covered = scene();
    for (const pair of [calm, defensive, distant, covered]) { pair.hunter.hunger = 0; pair.s.player.pos = { x: 0, y: 1.1, z: 3 }; }
    defensive.hunter.health = distant.hunter.health = covered.hunter.health = 24;
    distant.s.player.pos.z = 5;
    covered.s.world.obstacles.push({ id: covered.s.world.nextId++, kind: 'rock', pos: { x: 0, y: -6, z: 1.5 }, radius: .5, height: 12 });
    for (const pair of [calm, defensive, distant, covered]) ai(pair.s);
    expect(calm.hunter.target).toBeNull(); expect(distant.hunter.target).toBeNull(); expect(covered.hunter.target).toBeNull();
    expect(defensive.hunter.target).toBe(-1); expect(defensive.s.journey.hunters[0].phase).toBe('windup');
  });

  it('a real player bite provokes close defense without making the fed animal pursue natives', () => {
    const { s, hunter } = scene(); hunter.hunger = 0; hunter.pos.z = 2.8;
    s.player.pos = { x: 0, y: 1.1, z: 0 }; s.player.heading = 0;
    s.player.genome = cloneGenome(s.player.genome);
    s.player.genome.parts = [{ id: 'defensive-contact', kind: 'jaw', axial: .9, angle: 0, scale: 1, mirrored: false }];
    s.player.totalDna = 200; s.player.dna = genomeCost(initialGenome()) + 200 - genomeCost(s.player.genome);
    step(s, { ...EMPTY_INPUT, feed: true, feedSelection: { kind: 'creature', id: hunter.id, stage: 0 } });
    expect(hunter.health).toBe(24); expect(hunter.target).toBe(-1); expect(hunter.fear).toBe(0);
    expect(s.journey.hunters.find(h => h.id === hunter.id)?.phase).toBe('windup');
  });

  it.each(['windup', 'lunge'] as const)('does not cancel a saved sated %s, but fear still interrupts it', phase => {
    const attacking = scene(), afraid = scene();
    for (const pair of [attacking, afraid]) {
      pair.hunter.hunger = 0; pair.s.player.pos = { x: 0, y: 1.1, z: 3 }; commit(pair.s, pair.hunter, phase);
    }
    afraid.hunter.fear = 10;
    ai(attacking.s); ai(afraid.s);
    expect(attacking.s.journey.hunters[0].phase).toBe(phase);
    expect(afraid.s.journey.hunters[0].phase).toBe('recover'); expect(afraid.hunter.intent).toBe('flee');
  });

  it.each([2, 3] as const)('version%i preserves the appropriate nutrition consequence of a nonlethal player hit', version => {
    const { s, hunter } = scene(version); s.player.pos = { x: 0, y: 1.1, z: 1.2 }; commit(s, hunter, 'lunge');
    ai(s);
    expect(s.player.health).toBe(88);
    expect(hunter.hunger).toBeCloseTo(70 + .14 / 60 - (version === 2 ? 18 : 0), 10);
    expect(s.world.resources.some(r => r.kind === 'meat')).toBe(false);
  });
});

describe('actual meat supports predator feeding and reproduction', () => {
  it('a complete offered portion keeps a normally hungry hunter sated after the short eating animation ends', () => {
    const { s, hunter } = scene(); s.player.pos = { x: 0, y: 1.1, z: 3 }; const food = meat(s, undefined, 1, true);
    ai(s); expect(food.amount).toBe(0); expect(hunter.hunger).toBeCloseTo(28 + .14 / 60);
    expect(hunter.intent).toBe('forage'); expect(hunterThreatening(s, hunter)).toBe(false);
    ai(s, 240);
    expect(hunter.hunger).toBeLessThan(40); expect(hunter.target).toBeNull(); expect(hunter.intent).toBe('rest'); expect(s.player.health).toBe(100);
  });

  it('one meal does not disable a starving predator that remains genuinely hungry', () => {
    const { s, hunter } = scene(); hunter.hunger = 100; s.player.pos = { x: 0, y: 1.1, z: 3 }; meat(s, undefined, 1, true);
    ai(s, 220);
    expect(hunter.hunger).toBeGreaterThan(40); expect(hunter.target).toBe(-1); expect(s.journey.hunters[0].phase).toBe('windup');
  });

  it('still attracts and feeds a full hunter with a deliberate E offer, without creating food from a fragment', () => {
    const complete = scene(), fragment = scene(); complete.hunter.hunger = fragment.hunter.hunger = 0;
    const meal = meat(complete.s, undefined, 1, true), scrap = meat(fragment.s, undefined, .65, true);
    ai(complete.s); ai(fragment.s);
    expect(meal.amount).toBe(0); expect(complete.hunter.intent).toBe('forage'); expect(complete.s.world.creatures).toHaveLength(1);
    expect(scrap.amount).toBe(.65); expect(fragment.hunter.intent).toBe('rest');
  });

  it('prefers the nearest visible real carcass and leaves unreachable, blocked, depleted and foreign-territory meat alone', () => {
    const { s, hunter } = scene();
    const blocked = meat(s, { x: 0, y: 1.1, z: 4 }, 2);
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 0, y: -6, z: 2 }, radius: .6, height: 12 });
    const near = meat(s, { x: 6, y: 1.1, z: 0 }, 2), far = meat(s, { x: 10, y: 1.1, z: 0 }, 2);
    const scraps = meat(s, { x: 1, y: 1.1, z: 0 }, .65);
    ai(s); expect(hunter.target).toBe(near.id); expect(hunter.intent).toBe('forage');
    expect([blocked.amount, far.amount, scraps.amount]).toEqual([2, 2, .65]);
    const unreachable = scene(); meat(unreachable.s, { x: 17, y: 1.1, z: 0 }, 2); ai(unreachable.s); expect(unreachable.hunter.target).toBeNull();
    const foreign = scene(); foreign.hunter.pos.x = 25; meat(foreign.s, { x: 34, y: 1.1, z: 0 }, 2); ai(foreign.s); expect(foreign.hunter.target).toBeNull();
  });

  it('keeps explicit bait priority over a nearer corpse and does not make a sated patrol scavenge indiscriminately', () => {
    const lure = scene(), calm = scene();
    const corpse = meat(lure.s, undefined, 2), offer = meat(lure.s, { x: 8, y: 1.1, z: 0 }, 1, true);
    calm.hunter.hunger = 0; const ignored = meat(calm.s, undefined, 2);
    ai(lure.s); ai(calm.s);
    expect(lure.hunter.target).toBe(offer.id); expect(corpse.amount).toBe(2);
    expect(calm.hunter.target).toBeNull(); expect(ignored.amount).toBe(2);
  });

  it('does not scavenge expired current-stage offers before cleanup, while foreign IDs cannot hide a real local carcass', () => {
    const expired = scene(), foreign = scene();
    const vanished = meat(expired.s, undefined, 1, true); expired.s.journey.offerings[0].remaining = 0;
    const local = meat(foreign.s, undefined, 1);
    foreign.s.journey.offerings.push({ id: local.id, stage: 1, site: 3, remaining: 120 });
    ai(expired.s); ai(foreign.s);
    expect(vanished.amount).toBe(1); expect(expired.hunter.target).toBeNull();
    expect(local.amount).toBe(0); expect(foreign.hunter.intent).toBe('forage');
  });

  it('an actual public-step prey death creates the corpse that later feeds the hunter and its child', () => {
    const { s, hunter } = scene(), victim = prey(s, { x: 0, y: 1.1, z: 1.2 }); victim.health = 15;
    commit(s, hunter, 'lunge', victim.id);
    step(s, EMPTY_INPUT);
    expect(s.world.creatures.some(c => c.id === victim.id)).toBe(false);
    const corpse = s.world.resources.find(r => r.kind === 'meat')!;
    expect(corpse.amount).toBe(3); expect(hunter.hunger).toBeGreaterThan(70);
    const births = s.world.births;
    for (let i = 0; i < 240 && hunter.hunger > 40; i++) step(s, EMPTY_INPUT);
    expect(hunter.hunger).toBeLessThan(40); expect(corpse.amount).toBe(1);
    expect(s.world.births).toBe(births + 1);
    expect(s.world.creatures.find(c => c.id !== hunter.id)).toMatchObject({ species: 'needle', hunger: 70, age: 0 });
    expect(s.player.kills).toBe(0);
  });

  it('keeps historical v2 partial bait, no natural scavenging, and post-meal aggression unchanged', () => {
    const natural = scene(2), offered = scene(2); natural.hunter.hunger = 0;
    const corpse = meat(natural.s, undefined, 2), partial = meat(offered.s, undefined, .65, true);
    ai(natural.s); expect(corpse.amount).toBe(2); expect(natural.hunter.intent).toBe('rest');
    offered.s.player.pos = { x: 0, y: 1.1, z: 3 };
    ai(offered.s); expect(partial.amount).toBe(0);
    ai(offered.s, 220);
    expect(offered.hunter.target).toBe(-1); expect(offered.s.journey.hunters[0].phase).toBe('windup');
    natural.s.player.pos = { x: 0, y: 1.1, z: 3 }; ai(natural.s);
    expect(natural.hunter.target).toBe(-1);
  });

  it('continues a real meal and its family identically after strict save/load and generation recovery', () => {
    const { s, hunter } = scene(); meat(s, { x: 6, y: 1.1, z: 0 }, 3);
    step(s, EMPTY_INPUT); makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s));
    for (let i = 0; i < 180; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded).toEqual(s); expect(hunter.hunger).toBeLessThan(40); expect(s.world.births).toBeGreaterThan(0);
    const recovered = recoverGeneration(parseGame(serializeGame(s)));
    expect(recovered.journey.version).toBe(3);
    expect(recovered.world.creatures).toEqual(JSON.parse(s.checkpoint!).world.creatures);
    expect(parseGame(serializeGame(s))).toEqual(s);
  });
});
