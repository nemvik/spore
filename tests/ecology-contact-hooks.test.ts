import { describe, expect, it } from 'vitest';
import { speciesGroundClearance } from '../src/game/anatomy';
import { speciesById } from '../src/game/content';
import { recordEcologyMeal } from '../src/game/ecology-catalog';
import { stepHunters } from '../src/game/encounter-ai';
import type { ActiveTribeState } from '../src/game/era-types';
import { computeStats, functionalProfile } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { mouthWorldPosition } from '../src/game/locomotion';
import { groundHeight } from '../src/game/random';
import { continueToTribeEra, createGame, makeCheckpoint, step } from '../src/game/simulation';
import type { WorldStage } from '../src/game/stage';
import { issueTribeOrder } from '../src/game/tribe';
import { EMPTY_INPUT } from '../src/game/types';
import type { Creature, FoodKind, GameState, Resource, Vec3 } from '../src/game/types';
import { createWorld, spawnCreature } from '../src/game/world';

const DT = 1 / 60;
function point(s: GameState, x = 20, z = 0): Vec3 {
  return { x, y: s.world.stage === 0 ? 1.1 : s.world.stage === 1 ? 8 : groundHeight(x, z, 2) + .8, z };
}
/** Prepared isolated encounters retain authored mothers but remove other actors
 * and terrain. Runtime actions are primary; classifier exclusions are isolated. */
function scene(stage: WorldStage = 0, ecology = true, legacy = false): GameState {
  const s = createGame(481516, legacy, !legacy, false, ecology);
  for (let next = 1; next <= stage; next++) { s.stage = next as WorldStage; s.world = createWorld(s.seed, s.stage); s.worlds[next] = s.world; initializeJourneyStage(s); }
  if (stage === 2) for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `contact-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  s.player.health = computeStats(s.player.genome).maxHealth; s.player.pos = point(s, -60, 60); s.player.velocity = { x: 0, y: 0, z: 0 };
  s.world.creatures = []; s.world.obstacles = []; s.journey.hunters = []; s.checkpoint = null;
  s.world.resources = s.world.resources.filter(r => s.journey.sites.some(site => site.stage === stage && site.sourceId === r.id) || r.id === s.journey.canopy?.crustId);
  return s;
}
function animal(s: GameState, species: string, pos = point(s), patch = 1): Creature {
  const c = spawnCreature(s.world, species, patch);
  Object.assign(c, { pos: { ...pos }, health: 32, hunger: 70, age: 0, fear: 0, cooldown: 0, velocity: { x: 0, y: 0, z: 0 }, intent: 'rest', target: null });
  s.world.creatures.push(c); return c;
}
function food(s: GameState, kind: FoodKind, pos = point(s), amount = 1, patch = 0): Resource {
  const r: Resource = { id: s.world.nextId++, kind, pos: { ...pos }, amount, max: amount, regen: 0, patch }; s.world.resources.push(r); return r;
}
function contacts(s: GameState) { return s.journey.ecology?.contacts ?? []; }
function jaw(s: GameState): void {
  s.player.genome = structuredClone(s.player.genome); s.player.genome.parts = s.player.genome.parts.filter(p => p.kind !== 'filter');
  s.player.genome.parts.push({ id: 'contact-jaw', kind: 'jaw', axial: .8, angle: 0, scale: 1, mirrored: false });
}
function partnerBed(s: GameState): void { s.player.genome.parts.push({ id: 'contact-symbiote', kind: 'symbiote', axial: 0, angle: 1, scale: 1, mirrored: false }); }
function mealFixture(stage: WorldStage, provenance: 'natural' | 'planted' | 'offering' | 'root', species = stage === 0 ? 'veil' : stage === 1 ? 'sail' : 'bell') {
  const s = scene(stage), c = animal(s, species), r = food(s, stage === 0 ? 'algae' : 'nectar'), site = s.journey.sites.find(site => site.id === stage * 3)!;
  if (provenance === 'planted') { site.plantedId = r.id; site.vitality = 100; site.phase = 3; }
  if (provenance === 'offering') s.journey.offerings.push({ stage, id: r.id, site: site.id, remaining: 120 });
  if (provenance === 'root') s.journey.rootDispersal!.roots.push({ resourceId: r.id, site: site.id, vitality: 12 });
  // Existing foraging intent isolates the consumption tick from the AI think interval.
  c.intent = 'forage'; c.target = r.id; return { s, c, r, site };
}
function tribeScene(jawed = false): GameState & { tribe: ActiveTribeState } {
  const s = scene(2); if (jawed) jaw(s); Object.assign(s.campaign, { won: true, finale: 'restoration' });
  expect(continueToTribeEra(s)).toBe(true); const game = s as GameState & { tribe: ActiveTribeState };
  game.tribe.members.forEach(u => { u.pos = point(s, -50, 50); });
  // Isolate the player's ledger from five societies harvesting the same mother.
  for(const n of game.tribe.neighbours){n.society!.food=48;for(const u of n.society!.members)u.hunger=0;}
  return game;
}

describe('ecology ledger opt-in preserves original gameplay', () => {
  it.each([true, false])('keeps four-argument simulations identical to opted-in runs except recorded history, legacy=%s', legacy => {
    const old = createGame(481516, legacy, !legacy, !legacy), opted = createGame(481516, legacy, !legacy, !legacy, true);
    expect(old.journey).not.toHaveProperty('ecology'); expect(opted.journey.ecology).toEqual({ version: 1, contacts: [] });
    opted.id = old.id; makeCheckpoint(opted);
    for (let i = 0; i < 180; i++) {
      const input = { ...EMPTY_INPUT, x: i < 90 ? .5 : -.5, feed: i % 45 === 0, tend: i % 83 === 0 };
      step(old, input); step(opted, input);
    }
    const plain = structuredClone(opted); delete plain.journey.ecology;
    const checkpoint = JSON.parse(plain.checkpoint!); delete checkpoint.journey.ecology; plain.checkpoint = JSON.stringify(checkpoint);
    expect(plain).toEqual(old); expect(old.journey).not.toHaveProperty('ecology');
  });

  it('collects a culture only after the second successful T action, not observation or cooldown failure', () => {
    const s = scene(), site = s.journey.sites[0]; s.player.pos = { ...site.source };
    step(s, { ...EMPTY_INPUT, tend: true }); expect(site.observed).toBe(true); expect(contacts(s)).toEqual([]);
    step(s, { ...EMPTY_INPUT, tend: true }); expect(s.journey.cargo).toBeNull(); expect(contacts(s)).toEqual([]);
    s.player.cooldown = 0; step(s, { ...EMPTY_INPUT, tend: true });
    expect(s.journey.cargo).toMatchObject({ purpose: 'culture', site: 0 });
    expect(contacts(s)).toEqual([{ key: 'culture:0', stage: 0, patch: 0, method: 'culture' }]);
  });

  it('leaves the ledger absent after a real historical culture collection', () => {
    const s = scene(0, false), site = s.journey.sites[0]; s.player.pos = { ...site.source }; site.observed = true;
    step(s, { ...EMPTY_INPUT, tend: true }); expect(s.journey.cargo).toMatchObject({ purpose: 'culture', site: 0 });
    expect(s.journey).not.toHaveProperty('ecology');
  });

  it('connects actual T collection and E offering to the animal that consumes the newly allocated food', () => {
    const s = scene(), site = s.journey.sites[0]; s.player.pos = { ...site.source }; site.observed = true;
    step(s, { ...EMPTY_INPUT, tend: true }); expect(s.journey.cargo).toMatchObject({ purpose: 'culture', site: 0 });
    step(s, { ...EMPTY_INPUT, offer: true }); expect(s.journey.offerings).toEqual([]);
    s.player.cooldown = 0; step(s, { ...EMPTY_INPUT, offer: true });
    expect(s.journey.cargo).toBeNull(); expect(s.journey.offerings).toHaveLength(1);
    const offer = s.journey.offerings[0], r = s.world.resources.find(r => r.id === offer.id)!;
    expect(r).toMatchObject({ kind: 'algae', amount: 5, regen: 0 });
    const c = animal(s, 'veil', r.pos, 0); c.intent = 'forage'; c.target = r.id; step(s, EMPTY_INPUT);
    expect(r.amount).toBeCloseTo(4.65); expect(c.hunger).toBeLessThan(70);
    expect(contacts(s)).toEqual([{ key: 'culture:0', stage: 0, patch: 0, method: 'culture' }, { key: 'species:veil', stage: 0, patch: 0, method: 'feeding' }]);
  });
});

describe('NPC meals have precise player provenance', () => {
  it.each([0, 1, 2] as const)('does not unlock a stage-%i native animal eating natural food', stage => {
    const { s, c, r } = mealFixture(stage, 'natural'); step(s, EMPTY_INPUT);
    expect(r.amount).toBeCloseTo(.65); expect(c.hunger).toBeLessThan(70); expect(contacts(s)).toEqual([]);
  });

  it.each([0, 1, 2] as const)('records the actual stage-%i eater of a planted culture and its own native patch', stage => {
    const { s, c, r } = mealFixture(stage, 'planted'); step(s, EMPTY_INPUT);
    expect(r.amount).toBeCloseTo(.65); expect(c.hunger).toBeLessThan(70);
    expect(contacts(s)).toEqual([{ key: `species:${c.species}`, stage, patch: 1, method: 'feeding' }]);
  });

  it.each([0, 1, 2] as const)('records an actual stage-%i offering meal once without rewriting first provenance', stage => {
    const { s, c, r } = mealFixture(stage, 'offering'); step(s, EMPTY_INPUT);
    expect(r.amount).toBeCloseTo(.65); expect(contacts(s)).toEqual([{ key: `species:${c.species}`, stage, patch: 1, method: 'feeding' }]);
    c.patch = 2; c.cooldown = 0; step(s, EMPTY_INPUT);
    expect(r.amount).toBeCloseTo(.3); expect(contacts(s)).toEqual([{ key: `species:${c.species}`, stage, patch: 1, method: 'feeding' }]);
  });

  it.each(['bell', 'gnaw'])('records %s consuming a carried-root descendant, even when the bite destroys its provenance', species => {
    const { s, c, r } = mealFixture(2, 'root', species); step(s, EMPTY_INPUT);
    expect(c.hunger).toBeLessThan(70); expect(contacts(s)).toEqual([{ key: `species:${species}`, stage: 2, patch: 1, method: 'feeding' }]);
    if (species === 'gnaw') { expect(s.journey.rootDispersal!.roots).toEqual([]); expect(s.world.resources).not.toContain(r); }
    else expect(r.amount).toBeCloseTo(.65);
  });

  it.each(['absent ledger', 'expired offering', 'other-world offering', 'other-world planting'] as const)('ignores %s in the shared post-meal classifier', reason => {
    const { s, c, r, site } = mealFixture(2, 'natural');
    if (reason === 'absent ledger') { site.plantedId = r.id; delete s.journey.ecology; }
    if (reason === 'expired offering') s.journey.offerings.push({ stage: 2, id: r.id, site: 6, remaining: 0 });
    if (reason === 'other-world offering') s.journey.offerings.push({ stage: 1, id: r.id, site: 3, remaining: 120 });
    if (reason === 'other-world planting') s.journey.sites.find(site => site.stage === 1)!.plantedId = r.id;
    const before = structuredClone(s); expect(recordEcologyMeal(s, c, r)).toBe(false); expect(s).toEqual(before);
  });

  it.each(['natural', 'offering', 'expired', 'out of reach', 'empty', 'blocked'] as const)('credits a predator only for consumed offering meat: %s', mode => {
    const s = scene(2), center = s.world.patches[1].center, c = animal(s, 'crest', { ...center, y: groundHeight(center.x, center.z, 2) + speciesGroundClearance(speciesById('crest')) });
    const r = food(s, 'meat', c.pos, mode === 'empty' ? .5 : 1, 1); c.health = 55;
    if (mode !== 'natural') s.journey.offerings.push({ stage: 2, id: r.id, site: 7, remaining: mode === 'expired' ? 0 : 120 });
    if (mode === 'out of reach') r.pos.x += 10;
    if (mode === 'blocked') { r.pos.x += 3; s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { x: c.pos.x + 1.5, y: c.pos.y - 2, z: c.pos.z }, radius: .3, height: 6 }); }
    const amount = r.amount; stepHunters(s, DT, () => { throw new Error('Unexpected hunt in meal fixture'); });
    if (mode === 'offering' || mode === 'natural') { expect(r.amount).toBe(amount - 1); expect(c.hunger).toBeLessThan(70); }
    else expect(r.amount).toBe(amount);
    expect(contacts(s)).toEqual(mode === 'offering' ? [{ key: 'species:crest', stage: 2, patch: 1, method: 'feeding' }] : []);
  });
});

describe('organism hunts and bonds require success', () => {
  it.each(['successful kill', 'nonlethal bite', 'cooldown', 'energy', 'out of reach'] as const)('records a player hunt only after %s', mode => {
    const s = scene(); jaw(s); s.player.pos = point(s, 0, 0); s.player.heading = 0; s.player.energy = 80;
    const mouth = mouthWorldPosition(functionalProfile(s.player.genome), s.player.pos, 0), c = animal(s, 'veil', { ...mouth, x: mouth.x + .5 }); c.cooldown = 20;
    c.health = mode === 'nonlethal bite' ? 100 : 1;
    if (mode === 'cooldown') s.player.cooldown = 20;
    if (mode === 'energy') s.player.energy = 0;
    if (mode === 'out of reach') c.pos.x += 30;
    const health = c.health; step(s, { ...EMPTY_INPUT, feed: true });
    if (mode === 'successful kill') { expect(s.world.creatures).not.toContain(c); expect(s.player.kills).toBe(1); }
    else { expect(s.world.creatures).toContain(c); expect(s.player.kills).toBe(0); if (mode === 'nonlethal bite') expect(c.health).toBeLessThan(health); else expect(c.health).toBe(health); }
    expect(contacts(s)).toEqual(mode === 'successful kill' ? [{ key: 'species:veil', stage: 0, patch: 1, method: 'hunt' }] : []);
  });

  it.each(['predator', 'starvation'] as const)('does not credit a native death caused by %s', cause => {
    const s = scene(), prey = animal(s, 'veil'); prey.health = cause === 'starvation' ? .0001 : 1; prey.cooldown = 20;
    if (cause === 'starvation') { prey.hunger = 100; prey.age = 500; }
    else {
      const hunter = animal(s, 'needle', { ...prey.pos, x: prey.pos.x + .3 }); hunter.target = prey.id;
      s.journey.hunters.push({ stage: 0, id: hunter.id, phase: 'lunge', time: .2, aim: { ...prey.pos } });
    }
    step(s, EMPTY_INPUT); expect(s.world.creatures).not.toContain(prey); expect(s.player.kills).toBe(0); expect(contacts(s)).toEqual([]);
  });

  it.each(['success', 'missing organ', 'energy', 'capacity', 'cooldown', 'out of reach'] as const)('records symbiosis only after an actual join: %s', mode => {
    const s = scene(); s.player.pos = point(s, 0, 0); s.player.energy = 80;
    if (mode !== 'missing organ') partnerBed(s);
    const c = animal(s, 'lantern', point(s, mode === 'out of reach' ? 30 : 3, 0)); c.cooldown = 20; c.hunger = 0;
    if (mode === 'energy') s.player.energy = 24;
    if (mode === 'capacity') s.player.bonds = Array.from({ length: 2 }, () => ({ species: 'lantern', benefit: 'light' as const, hunger: 0, age: 10, loyalty: 90 }));
    if (mode === 'cooldown') s.player.cooldown = 20;
    const count = s.player.bonds.length; step(s, { ...EMPTY_INPUT, bond: true });
    expect(s.player.bonds).toHaveLength(count + Number(mode === 'success'));
    expect(s.world.creatures.includes(c)).toBe(mode !== 'success');
    expect(contacts(s)).toEqual(mode === 'success' ? [{ key: 'species:lantern', stage: 0, patch: 1, method: 'bond' }] : []);
  });
});

describe('tribal harvests, wildlife meals and kills', () => {
  it.each(['natural', 'mother', 'planted', 'empty', 'distant'] as const)('records culture knowledge only after an actual inherited harvest: %s', provenance => {
    const s = tribeScene(), site = s.journey.sites.find(site => site.id === 6)!, member = s.tribe.members[0];
    s.player.genome.parts.push({ id: 'contact-proboscis', kind: 'proboscis', axial: .8, angle: 0, scale: 1, mirrored: false });
    const r = provenance === 'mother' ? s.world.resources.find(r => r.id === site.sourceId)! : food(s, 'nectar', point(s), provenance === 'empty' ? .5 : 3);
    r.regen = 0; if (provenance === 'planted') site.plantedId = r.id;
    member.pos = { ...r.pos, x: r.pos.x + (provenance === 'distant' ? 20 : 1) }; member.hunger = 0;
    expect(issueTribeOrder(s, [member.id], 'gather', { kind: 'food', id: r.id }).ok).toBe(true);
    const amount = r.amount; step(s, EMPTY_INPUT);
    const consumed = provenance !== 'empty' && provenance !== 'distant'; expect(r.amount).toBe(amount - Number(consumed)); expect(member.cargo).toBe(Number(consumed));
    expect(contacts(s)).toEqual(provenance === 'mother' || provenance === 'planted' ? [{ key: 'culture:6', stage: 2, patch: 0, method: 'culture' }] : []);
  });

  it.each(['natural', 'planted', 'offering', 'root'] as const)('records actual P1 wildlife eating %s food with native stage 2', provenance => {
    const s = tribeScene(), c = animal(s, 'bell'), r = food(s, 'nectar'), site = s.journey.sites.find(site => site.id === 6)!;
    c.intent = 'forage'; c.target = r.id;
    if (provenance === 'planted') site.plantedId = r.id;
    if (provenance === 'offering') s.journey.offerings.push({ stage: 2, id: r.id, site: 6, remaining: 120 });
    if (provenance === 'root') s.journey.rootDispersal!.roots.push({ resourceId: r.id, site: 6, vitality: 12 });
    step(s, EMPTY_INPUT); expect(r.amount).toBeCloseTo(.65); expect(c.hunger).toBeLessThan(70);
    expect(contacts(s)).toEqual(provenance === 'natural' ? [] : [{ key: 'species:bell', stage: 2, patch: 1, method: 'feeding' }]);
  });

  it('records a completed tribal hunt, not its preceding nonlethal hit', () => {
    const s = tribeScene(true), member = s.tribe.members[0], c = animal(s, 'gnaw'); c.health = 100; c.cooldown = 20;
    member.pos = { ...c.pos, x: c.pos.x + 1 }; member.hunger = 0;
    expect(issueTribeOrder(s, [member.id], 'attack', { kind: 'creature', id: c.id }).ok).toBe(true);
    step(s, EMPTY_INPUT); expect(c.health).toBeLessThan(100); expect(c.health).toBeGreaterThan(0); expect(contacts(s)).toEqual([]);
    c.health = 1; member.cooldown = 0; step(s, EMPTY_INPUT);
    expect(s.world.creatures).not.toContain(c); expect(contacts(s)).toEqual([{ key: 'species:gnaw', stage: 2, patch: 1, method: 'hunt' }]);
  });

  it('does not credit a P1 wildlife predator killing its own prey', () => {
    const s = tribeScene(), prey = animal(s, 'gnaw'); prey.health = 1; prey.cooldown = 20;
    const hunter = animal(s, 'crest', { ...prey.pos, x: prey.pos.x + 1 }); hunter.intent = 'hunt'; hunter.target = prey.id;
    step(s, EMPTY_INPUT); expect(s.world.creatures).not.toContain(prey); expect(contacts(s)).toEqual([]);
  });
});
