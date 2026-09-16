import { describe, expect, it } from 'vitest';
import { initialVehicle } from '../src/game/blueprint';
import { getClimate } from '../src/game/climate';
import { CHAPTERS, speciesById } from '../src/game/content';
import { emptyMachines, emptyTribe } from '../src/game/era-types';
import type { ActiveMachineState, ActiveTribeState, LegacyAbility } from '../src/game/era-types';
import { cloneGenome, computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { buildMachine, issueMachineOrder } from '../src/game/machines';
import { parseGame, serializeGame } from '../src/game/persistence';
import {
  awaitingOrganismVictory, continueToMachinesEra, continueToTribeEra, createGame,
  evolve, makeCheckpoint, recoverGeneration, returnToCoast, step, tryTransition,
} from '../src/game/simulation';
import { issueTribeOrder } from '../src/game/tribe';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState } from '../src/game/types';
import { createWorld } from '../src/game/world';

type TribeGame = GameState & { tribe: ActiveTribeState };
type MachineGame = TribeGame & { machines: ActiveMachineState };

/** Explicit prepared campaign/tribe completion, not an earned playthrough.
 * Both era factories and all entry/step/save operations use production APIs. */
function completedTribe(legacy = false, finale: LegacyAbility = 'restoration'): TribeGame {
  const s = createGame(481516, legacy, !legacy, !legacy);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
    s.lineage.push({ ...structuredClone(s.lineage[0]), stage, event: CHAPTERS[stage].title });
  }
  for (const kind of ['legs', 'lungs', 'symbiote'] as const) {
    s.player.genome.parts.push({ id: `entry-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  }
  s.player.totalDna = 300; s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  s.player.health = computeStats(s.player.genome).maxHealth;
  s.player.bonds = [{ species: 'gloom', benefit: 'recycle', hunger: 28, loyalty: 77, age: 150 }];
  Object.assign(s.campaign, { won: true, finale, drought: .36 });
  s.world.resources[0].amount = .25; s.world.patches[1].fertility = .65;
  expect(continueToTribeEra(s)).toBe(true);
  const tribe = s.tribe as ActiveTribeState;
  tribe.neighbours.forEach((n, index) => {
    n.resolved = index === 1 ? 'conquered' : 'allied';
    if (n.resolved === 'conquered') n.health = 0;
    else { n.relation = 100; n.tribute = index === 0 ? 8 : 16; }
  });
  tribe.completed = true; tribe.elapsed = 125;
  tribe.members[0].health = 71; tribe.members[0].hunger = 45; tribe.members[0].cargo = 1;
  const food = s.world.resources.find(r => r.kind === 'detritus')!;
  expect(issueTribeOrder(s, [tribe.members[0].id], 'gather', { kind: 'food', id: food.id }).ok).toBe(true);
  makeCheckpoint(s);
  return s as TribeGame;
}

function enter(legacy = false, finale: LegacyAbility = 'restoration'): MachineGame {
  const s = completedTribe(legacy, finale);
  expect(continueToMachinesEra(s)).toBe(true);
  return s as MachineGame;
}

describe.each([false, true])('explicit tribe → machine entry, legacy=%s', legacy => {
  it.each(['restoration', 'predator', 'migration'] as const)('preserves %s inheritance and adds the barrier only once', finale => {
    const s = parseGame(serializeGame(completedTribe(legacy, finale))) as TribeGame;
    const before = structuredClone(s), world = s.world, climate = getClimate(s);
    expect(continueToMachinesEra(s)).toBe(true);
    const m = s.machines as ActiveMachineState;
    expect(s.stage).toBe(4); expect(s.version).toBe(3);
    expect(m).toMatchObject({ version: 2, archetype: finale, airUnlocked: false, completed: false, elapsed: 0, blueprints: [], fleet: [] });
    expect(m.resource).toBeGreaterThan(0); expect(m.regions).toHaveLength(3); expect(m.springs).toHaveLength(3);
    expect(s).not.toHaveProperty('planet'); expect(awaitingOrganismVictory(s)).toBe(false);
    expect(s.player).toEqual(before.player); expect(s.tribe).toEqual(before.tribe);
    expect(s.journey).toEqual(before.journey); expect(s.campaign).toEqual(before.campaign);
    expect(s.world).toBe(world); expect(s.world).toBe(s.worlds[2]); expect(s.worlds).toHaveLength(3);
    expect(s.worlds.slice(0, 2)).toEqual(before.worlds.slice(0, 2));
    expect(s.tick).toBe(before.tick); expect(s.rng).toBe(before.rng); expect(getClimate(s)).toEqual(climate);
    const added = s.world.obstacles.slice(before.world.obstacles.length);
    expect(added).toHaveLength(16); expect(added.every(o => o.kind === 'rock')).toBe(true);
    expect(m.barrierIds).toEqual(added.map(o => o.id)); expect(new Set(m.barrierIds).size).toBe(16);
    expect(added.every(o => o.id >= before.world.nextId)).toBe(true);
    expect(s.world.nextId).toBe(before.world.nextId + 16);
    expect({ ...s.world, obstacles: s.world.obstacles.slice(0, before.world.obstacles.length), nextId: before.world.nextId }).toEqual(before.world);
    expect(s.lineage.slice(0, -1)).toEqual(before.lineage);
    expect(s.lineage.at(-1)).toMatchObject({ stage: 4, event: CHAPTERS[4].title, generation: s.player.generation });
    const checkpoint = JSON.parse(s.checkpoint!);
    expect(checkpoint.stage).toBe(4); expect(checkpoint.checkpoint).toBeNull();
    expect(checkpoint.tribe).toEqual(s.tribe); expect(checkpoint.machines).toEqual(m);
    expect(parseGame(serializeGame(s))).toEqual(s);
    const once = structuredClone(s);
    expect(continueToMachinesEra(s)).toBe(false);
    expect(s).toEqual(once);
  });

  it('records tribe completion but waits for explicit machine entry', () => {
    const s = completedTribe(legacy); s.tribe.completed = false; makeCheckpoint(s);
    const obstacles = structuredClone(s.world.obstacles), lineage = structuredClone(s.lineage);
    step(s, EMPTY_INPUT);
    expect(s.tribe.completed).toBe(true); expect(s.stage).toBe(3);
    expect(s).not.toHaveProperty('machines'); expect(s.world.obstacles).toEqual(obstacles);
    expect(s.lineage).toEqual(lineage); expect(JSON.parse(s.checkpoint!).stage).toBe(3);
    expect(continueToMachinesEra(s)).toBe(true);
    expect(s.stage).toBe(4); expect(s.world.obstacles).toHaveLength(obstacles.length + 16);
  });

  it('runs the machine clock and wildlife while ignoring body inputs and retiring tribe simulation', () => {
    const s = enter(legacy), before = structuredClone(s), control = structuredClone(s);
    for (let frame = 0; frame < 120; frame++) {
      step(s, { x: 1, z: -1, vertical: 1, sprint: true, feed: true, bond: true, tend: true, pulse: true, offer: true }, 1 / 30);
      step(control, EMPTY_INPUT, 1 / 30);
    }
    expect(s).toEqual(control); expect(s.tick).toBe(before.tick + 120);
    expect(s.world.time).toBeCloseTo(before.world.time + 4, 8); expect(s.machines.elapsed).toBeCloseTo(4, 8);
    expect(s.world.creatures.some(c => c.age > (before.world.creatures.find(old => old.id === c.id)?.age ?? Infinity))).toBe(true);
    expect(s.world.resources).not.toEqual(before.world.resources);
    expect(s.tribe).toEqual(before.tribe); expect(s.player).toEqual(before.player);
    expect(s.worlds.slice(0, 2)).toEqual(before.worlds.slice(0, 2));
    expect(s.campaign).toEqual(before.campaign); expect(s.lineage).toEqual(before.lineage);
    expect(awaitingOrganismVictory(s)).toBe(false);
    expect(parseGame(serializeGame(s))).toEqual(s);
    const after = structuredClone(s), draft = cloneGenome(s.player.genome); draft.hue = 230;
    expect(evolve(s, draft)).toMatchObject({ ok: false, cost: 0 });
    expect(returnToCoast(s)).toBe(false); expect(continueToTribeEra(s)).toBe(false); expect(tryTransition(s)).toBe(false);
    expect(s).toEqual(after);
  });

  it('round-trips a moving paid machine and resumes the integrated simulation deterministically', () => {
    const s = enter(legacy);
    expect(buildMachine(s, initialVehicle('tank', 'restoration')).ok).toBe(true);
    const unit = s.machines.fleet[0];
    expect(issueMachineOrder(s, [unit.id], 'move', { kind: 'point', pos: { x: 18, y: 1, z: -9 } }).ok).toBe(true);
    const initialPos = { ...unit.pos };
    for (let i = 0; i < 37; i++) step(s, EMPTY_INPUT);
    expect(unit.pos).not.toEqual(initialPos); expect(unit.orders).toHaveLength(1);
    const saved = serializeGame(s), loaded = parseGame(saved);
    expect(loaded).toEqual(s); expect(loaded.world).toBe(loaded.worlds[2]);
    for (let i = 0; i < 90; i++) { step(s, EMPTY_INPUT); step(loaded, EMPTY_INPUT); }
    expect(loaded).toEqual(s); expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('recovers the stage-four entry checkpoint without recreating terrain or discarding tribe history', () => {
    const s = enter(legacy), entry = structuredClone(s);
    expect(buildMachine(s, initialVehicle('tank', 'restoration')).ok).toBe(true);
    for (let i = 0; i < 45; i++) step(s, EMPTY_INPUT);
    // Prepared fatal damage and exhausted budget; the real stage step detects
    // extinction and offers the entry checkpoint rather than waiting forever.
    s.machines.fleet.forEach(unit => { unit.health = 0; }); s.machines.resource = 0;
    step(s, EMPTY_INPUT);
    expect(s.deathReason).toBeTruthy(); expect(s.machines.fleet).toHaveLength(0);
    const recovered = recoverGeneration(parseGame(serializeGame(s)));
    expect(recovered.stage).toBe(4); expect(recovered.deathReason).toBeNull();
    expect(recovered.world).toBe(recovered.worlds[2]); expect(recovered.worlds).toEqual(entry.worlds);
    expect(recovered.tribe).toEqual(entry.tribe); expect(recovered.machines).toEqual(entry.machines);
    expect(recovered.player.genome).toEqual(entry.player.genome); expect(recovered.player.bonds).toEqual(entry.player.bonds);
    expect(recovered.campaign).toEqual(entry.campaign); expect(recovered.journey).toEqual(entry.journey);
    expect(recovered.lineage).toEqual(entry.lineage); expect(recovered.tick).toBe(entry.tick);
    expect(parseGame(serializeGame(recovered))).toEqual(recovered);
    const beforeRetry = structuredClone(recovered);
    expect(continueToMachinesEra(recovered)).toBe(false); expect(recovered).toEqual(beforeRetry);
    step(recovered, EMPTY_INPUT);
    expect(recovered.tick).toBe(entry.tick + 1);
  });
});

describe('machine entry boundary failures', () => {
  it.each([0, 1, 2, 4, 5] as const)('rejects a request outside tribe stage %i without mutation', stage => {
    const s = completedTribe(); s.stage = stage;
    const before = structuredClone(s);
    expect(continueToMachinesEra(s)).toBe(false); expect(s).toEqual(before);
  });

  it.each([
    ['missing tribe', (s: GameState) => { delete s.tribe; }],
    ['P0 preview', (s: GameState) => { s.tribe = emptyTribe(); }],
    ['unfinished tribe', (s: GameState) => { (s.tribe as ActiveTribeState).completed = false; }],
    ['unresolved neighbour', (s: GameState) => { (s.tribe as ActiveTribeState).neighbours[1].resolved = null; }],
    ['no remaining members', (s: GameState) => { (s.tribe as ActiveTribeState).members = []; }],
    ['no living member', (s: GameState) => { s.tribe!.members.forEach(u => { u.health = 0; }); }],
    ['death screen', (s: GameState) => { s.deathReason = 'Kmen zanikl.'; }],
    ['existing machine slice', (s: GameState) => { s.machines = emptyMachines(); }],
  ] as const)('rejects %s without adding terrain, IDs or history', (_name, change) => {
    const s = completedTribe(); change(s); const before = structuredClone(s);
    expect(continueToMachinesEra(s)).toBe(false); expect(s).toEqual(before);
  });

  it('allows a single surviving member after all three neighbours are resolved', () => {
    const s = completedTribe(); s.tribe.members = [s.tribe.members[0]]; makeCheckpoint(s);
    expect(continueToMachinesEra(s)).toBe(true);
    expect(s.stage).toBe(4); expect(s.tribe.members).toHaveLength(1);
    expect(parseGame(serializeGame(s))).toEqual(s);
  });
});

describe('integrated machine stage checkpoints and retired units', () => {
  it('does not let nearby wildlife attack the saved tribe or original body in stage four', () => {
    const s = enter(), predator = s.world.creatures.find(c => speciesById(c.species).role === 'predator')!;
    // Isolate target choice from wild prey; the actual wildlife step runs below.
    predator.pos = { ...s.tribe.members[0].pos }; predator.velocity = { x: 0, y: 0, z: 0 };
    predator.hunger = 80; predator.cooldown = 0; predator.target = null; predator.intent = 'hunt';
    s.world.creatures = [predator]; s.tick = 29;
    const tribe = structuredClone(s.tribe), player = structuredClone(s.player), age = predator.age;
    for (let i = 0; i < 120; i++) step(s, EMPTY_INPUT);
    expect(predator.age).toBeGreaterThan(age); expect(predator.intent).toBe('rest'); expect(predator.target).toBeNull();
    expect(s.tribe).toEqual(tribe); expect(s.player).toEqual(player);
    expect(s.deathReason).toBeNull();
  });

  it('checkpoints machine completion once and recovers it without repeating the terrain factory', () => {
    const s = enter(); expect(buildMachine(s, initialVehicle('tank', 'restoration')).ok).toBe(true);
    // Prepared completion boundary only, not evidence of earned region control.
    for (const region of s.machines.regions) Object.assign(region, { owner: 'player', method: 'restoration', soil: 100, settlers: 2 });
    for (const spring of s.machines.springs.slice(0, 2)) Object.assign(spring, { owner: 'player', progress: 1 });
    s.machines.airUnlocked = true;
    const entryCheckpoint = s.checkpoint, obstacles = structuredClone(s.world.obstacles);
    expect(s.machines.completed).toBe(false);
    step(s, EMPTY_INPUT);
    expect(s.machines.completed).toBe(true); expect(s.stage).toBe(4); expect(s).not.toHaveProperty('planet');
    expect(s.checkpoint).not.toBe(entryCheckpoint);
    const completedCheckpoint = s.checkpoint, checkpoint = JSON.parse(completedCheckpoint!);
    expect(checkpoint.stage).toBe(4); expect(checkpoint.machines).toEqual(s.machines);
    expect(checkpoint.tribe).toEqual(s.tribe); expect(checkpoint.world.obstacles).toEqual(obstacles);
    step(s, EMPTY_INPUT);
    expect(s.checkpoint).toBe(completedCheckpoint);
    const recovered = recoverGeneration(parseGame(serializeGame(s)));
    expect(recovered.machines).toEqual(checkpoint.machines); expect(recovered.tribe).toEqual(checkpoint.tribe);
    expect(recovered.world.obstacles).toEqual(obstacles); expect(recovered.lineage).toEqual(checkpoint.lineage);
    expect(recovered.world).toBe(recovered.worlds[2]); expect(parseGame(serializeGame(recovered))).toEqual(recovered);
  });
});
