import { describe, expect, it } from 'vitest';
import { cloneGenome, computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { feedTarget } from '../src/game/interactions';
import { createGame, makeCheckpoint, step } from '../src/game/simulation';
import { spawnCreature } from '../src/game/world';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT } from '../src/game/types';
import type { Creature, FeedSelection, GameState, Part, Vec3 } from '../src/game/types';

// Isolated prepared encounters, not earned campaign or play-duration evidence.
// Body changes happen before simulation; actual attacks use public step input.
function scene(legacy = false, jaw: Partial<Part> = {}, extra: Part[] = []) {
  const s = createGame(481516, legacy);
  s.world.creatures = []; s.world.obstacles = [];
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.sourceId === r.id));
  s.world.patches[0].center = { x: 0, y: 1.1, z: 0 };
  s.world.landmarks.find(l => l.kind === 'nest')!.pos = { x: 70, y: 1.1, z: 70 };
  s.player.genome = cloneGenome(s.player.genome);
  s.player.genome.parts = [{ id: 'contact-jaw', kind: 'jaw', axial: .9, angle: 0, scale: 1, mirrored: false, ...jaw }, ...extra];
  s.player.totalDna = 200; s.player.dna = genomeCost(initialGenome()) + 200 - genomeCost(s.player.genome);
  Object.assign(s.player, { pos: { x: 0, y: 1.1, z: 0 }, heading: 0, velocity: { x: 0, y: 0, z: 0 }, energy: 80, health: computeStats(s.player.genome).maxHealth, invulnerable: 0, cooldown: 0 });
  return s;
}
function animal(s: GameState, pos: Vec3 = { x: 0, y: 1.1, z: 2.8 }, species = 'needle') {
  const c = spawnCreature(s.world, species, 0);
  Object.assign(c, { pos: { ...pos }, velocity: { x: 0, y: 0, z: 0 }, heading: Math.PI, health: species === 'needle' ? 55 : 100, hunger: 50, fear: 0, cooldown: 0, age: 0, target: null });
  s.world.creatures.push(c); return c;
}
function chosen(s: GameState, c: Creature): FeedSelection { return { kind: 'creature', id: c.id, stage: s.stage }; }
function bite(s: GameState, c: Creature) { step(s, { ...EMPTY_INPUT, feed: true, feedSelection: chosen(s, c) }); }
function frames(s: GameState, count: number) { for (let i = 0; i < count; i++) step(s, EMPTY_INPUT); }
function launch(s: GameState, c: Creature) {
  for (let i = 0; i < 120 && s.journey.hunters.find(h => h.id === c.id)?.phase !== 'lunge'; i++) step(s, EMPTY_INPUT);
  expect(s.journey.hunters.find(h => h.id === c.id)?.phase).toBe('lunge');
}
const proboscis: Part = { id: 'long-nose', kind: 'proboscis', axial: .9, angle: 0, scale: 1, mirrored: false };

describe('anatomical jaw contact through the same projected and actual action', () => {
  it('explains a missed bite behind the body and hits only after the real jaw turns toward prey', () => {
    const s = scene(), c = animal(s, { x: 0, y: 1.1, z: -2.8 });
    const hint = feedTarget(s, chosen(s, c))!;
    expect(hint).toMatchObject({ ready: false, reason: 'distance' });
    expect(hint.detail).toBe(`Přilož čelist k tělu cíle · ${hint.distance.toFixed(1)} m`);
    bite(s, c);
    expect(c.health).toBe(55);
    expect(s.messages.at(-1)?.text).toContain(hint.detail!);
    // No teleport or bigger tolerance: rotate the same jaw and use the normal action.
    s.player.heading = Math.PI; s.player.cooldown = 0;
    expect(feedTarget(s, chosen(s, c))?.ready).toBe(true);
    expect(feedTarget(s, chosen(s, c))?.detail).toBeUndefined();
    bite(s, c); expect(c.health).toBe(24);
  });

  it('does not borrow a proboscis range for predation while preserving its ordinary food reach', () => {
    for (const extra of [[], [proboscis]]) {
      const s = scene(false, {}, extra), c = animal(s, { x: 0, y: 1.1, z: 8 });
      expect(feedTarget(s, chosen(s, c))).toMatchObject({ ready: false, reason: 'distance' });
      bite(s, c); expect(c.health).toBe(55);
    }
    const short = scene(), long = scene(false, {}, [proboscis]);
    for (const s of [short, long]) {
      const food = { id: s.world.nextId++, kind: 'meat' as const, pos: { x: 0, y: 1.1, z: 7 }, amount: 3, max: 3, regen: 0, patch: 0 };
      s.world.resources.push(food);
      const selected: FeedSelection = { kind: 'food', id: food.id, stage: 0 };
      expect(feedTarget(s, selected)?.ready).toBe(s === long);
      step(s, { ...EMPTY_INPUT, feed: true, feedSelection: selected });
      expect(food.amount).toBe(s === long ? 2 : 3);
    }
  });

  it.each([false, true])('legacy=%s preserves the appropriate old or anatomical distant-bite behavior', legacy => {
    const s = scene(legacy), c = animal(s, { x: 0, y: 1.1, z: 6 });
    expect(feedTarget(s, chosen(s, c))?.ready).toBe(legacy);
    bite(s, c); expect(c.health).toBe(legacy ? 24 : 55);
    if (legacy) { expect(c.fear).toBeGreaterThan(4.9); expect(c.target).toBe(-1); expect(s.journey.hunters).toEqual([]); }
  });

  it('keeps legacy proboscis-assisted predation at its exact prior range', () => {
    const s = scene(true, {}, [proboscis]), c = animal(s, { x: 0, y: 1.1, z: 8 });
    expect(feedTarget(s, chosen(s, c))).toMatchObject({ ready: true, range: 7 });
    bite(s, c); expect(c.health).toBe(24); expect(c.fear).toBeGreaterThan(4.9);
  });

  it('uses the actual jaw attachment: a forward jaw reaches the same prey that a rear jaw cannot', () => {
    for (const axial of [.9, -.9]) {
      const s = scene(false, { axial }), c = animal(s);
      expect(feedTarget(s, chosen(s, c))?.ready).toBe(axial > 0);
      bite(s, c); expect(c.health).toBe(axial > 0 ? 24 : 55);
    }
  });

  it('a larger jaw makes a physically farther contact that a small jaw cannot reach', () => {
    for (const scale of [.55, 1.65]) {
      const s = scene(false, { scale }), c = animal(s, { x: 0, y: 1.1, z: 3.35 }, 'veil');
      expect(feedTarget(s, chosen(s, c))?.ready).toBe(scale > 1);
      bite(s, c); expect(c.health < 100).toBe(scale > 1);
    }
  });

  it('a mirrored lateral jaw can contact the opposite flank without inventing a central mouth', () => {
    for (const mirrored of [false, true]) {
      const s = scene(false, { axial: 0, angle: Math.PI / 2, mirrored }), c = animal(s, { x: -1.7, y: 1.1, z: .4 }, 'veil');
      expect(feedTarget(s, chosen(s, c))?.ready).toBe(mirrored);
      bite(s, c); expect(c.health < 100).toBe(mirrored);
    }
  });

  it('rotates the jaw contact with the creature rather than the camera or world axes', () => {
    for (const heading of [Math.PI / 2, Math.PI]) {
      const s = scene(); s.player.heading = heading;
      const c = animal(s, { x: 2.8, y: 1.1, z: 0 });
      expect(feedTarget(s, chosen(s, c))?.ready).toBe(heading === Math.PI / 2);
      bite(s, c); expect(c.health).toBe(heading === Math.PI / 2 ? 24 : 55);
    }
  });

  it('shows and applies the same close contact while rejecting a farther visible target', () => {
    const s = scene(), close = animal(s), far = animal(s, { x: 0, y: 1.1, z: 5 });
    expect(feedTarget(s, chosen(s, close))?.ready).toBe(true);
    expect(feedTarget(s, chosen(s, far))?.ready).toBe(false);
    bite(s, far); expect(close.health).toBe(55); expect(far.health).toBe(55);
    frames(s, 25); bite(s, close); expect(close.health).toBe(24); expect(far.health).toBe(55);
  });

  it('still blocks contact through a real wall or without attack energy', () => {
    for (const reason of ['wall', 'energy']) {
      const s = scene(), c = animal(s);
      if (reason === 'wall') s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 0, y: -5, z: 1.2 }, radius: .4, height: 12 });
      else s.player.energy = 1;
      expect(feedTarget(s, chosen(s, c))).toMatchObject({ ready: false, reason: reason === 'wall' ? 'blocked' : 'energy' });
      bite(s, c); expect(c.health).toBe(55);
    }
  });

  it('an unrelated distant animal cannot erase a nearby blocked contact hint', () => {
    const s = scene(), near = animal(s);
    s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: 0, y: -5, z: 1.2 }, radius: .4, height: 12 });
    expect(feedTarget(s)).toMatchObject({ id: near.id, ready: false, reason: 'blocked' });
    animal(s, { x: 0, y: 1.1, z: 40 });
    expect(feedTarget(s)).toMatchObject({ id: near.id, ready: false, reason: 'blocked' });
    step(s, { ...EMPTY_INPUT, feed: true });
    expect(near.health).toBe(55);
  });
});

describe('ordinary contact no longer cancels an explicit predator attack', () => {
  it('a nonlethal bite preserves the naturally started windup and lets it launch', () => {
    const s = scene(), c = animal(s); step(s, EMPTY_INPUT);
    expect(s.journey.hunters[0].phase).toBe('windup');
    bite(s, c);
    expect(c.health).toBe(24); expect(c.fear).toBe(0); expect(c.target).toBe(-1); expect(s.journey.hunters[0].phase).toBe('windup');
    launch(s, c); expect(c.velocity.z).toBeLessThan(0);
  });

  it('a nonlethal bite cannot cancel an already launched lunge: standing still still takes its real hit', () => {
    const s = scene(), c = animal(s); launch(s, c);
    const aim = { ...s.journey.hunters[0].aim }, health = s.player.health;
    bite(s, c);
    expect(c.health).toBe(24); expect(c.fear).toBe(0); expect(s.journey.hunters[0].phase).toBe('lunge');
    expect(s.journey.hunters[0].aim).toEqual(aim);
    frames(s, 60); expect(s.player.health).toBe(health - 12);
  });

  it.each(['windup', 'lunge'] as const)('does not steal a prepared %s target from an NPC when its hunter is bitten', phase => {
    const s = scene(), c = animal(s, { x: 0, y: 1.1, z: 2.6 }), victim = animal(s, { x: 0, y: 1.1, z: 5.4 }, 'veil');
    c.target = victim.id; c.intent = 'hunt'; c.heading = 0;
    c.velocity = { x: 0, y: 0, z: phase === 'lunge' ? 10.4 : 0 };
    s.journey.hunters = [{ id: c.id, stage: 0, phase, time: phase === 'lunge' ? .75 : .2, aim: { ...victim.pos } }];
    const aim = { ...s.journey.hunters[0].aim }, health = s.player.health;
    bite(s, c);
    expect(c.target).toBe(victim.id); expect(c.fear).toBe(0); expect(s.journey.hunters[0].phase).toBe(phase); expect(s.journey.hunters[0].aim).toEqual(aim);
    frames(s, 60); expect(victim.health).toBeLessThan(100); expect(s.player.health).toBe(health);
  });

  it('the explicit toxin ability still interrupts a naturally launched attack', () => {
    const toxin: Part = { id: 'contact-toxin', kind: 'toxin', axial: 0, angle: 0, scale: 1, mirrored: false };
    const s = scene(false, {}, [toxin]), c = animal(s); launch(s, c);
    const energy = s.player.energy;
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(c.health).toBe(37); expect(c.fear).toBeGreaterThan(9.9); expect(s.journey.hunters[0].phase).toBe('recover');
    expect(energy - s.player.energy).toBeGreaterThanOrEqual(15); expect(s.player.abilityRecharge).toBe(7);
  });

  it.each([false, true])('ordinary grazing prey still react with fear in legacy=%s', legacy => {
    const s = scene(legacy), c = animal(s, { x: 0, y: 1.1, z: 2.8 }, 'veil');
    bite(s, c); expect(c.health).toBe(69); expect(c.fear).toBeGreaterThan(4.9); expect(c.target).toBe(-1);
  });

  it('a saved/checkpointed bitten lunge resumes the identical contact and subsequent world', () => {
    const s = scene(), c = animal(s); launch(s, c); bite(s, c); makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s); expect(loaded.journey.hunters[0].phase).toBe('lunge');
    for (let frame = 0; frame < 120; frame++) {
      const input = { ...EMPTY_INPUT, x: frame >= 12 && frame < 35 ? 1 : 0, feed: frame === 45, feedSelection: chosen(s, c) };
      step(s, input); step(loaded, input);
    }
    expect(loaded).toEqual(s); expect(loaded.checkpoint).toBe(s.checkpoint);
  });
});
