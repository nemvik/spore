import type { WorldStage as Stage } from '../src/game/stage';
import { describe, expect, it } from 'vitest';
import { createGame, evolve, fieldProgress, makeCheckpoint, nearNest, recoverGeneration, statsFor, step, summary, transitionRequirements, tryTransition, tryWin } from '../src/game/simulation';
import { createWorld, spawnCreature, surfaceY, WORLD_BOUND } from '../src/game/world';
import { CHAPTERS, SPECIES, stageSpecies } from '../src/game/content';
import { cloneGenome, has, initialGenome, validateGenome } from '../src/game/genome';
import { distance, groundHeight, horizontalDistance } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
import type { AdaptationId, FoodKind, GameState, Genome, Input, } from '../src/game/types';

// These deliberately prepared unit scenarios verify rules and consequences. They are
// not a new-game playthrough and make no claim about natural campaign duration.
const SEEDS = [481516, 20260913, 8675309];
const input = (changes: Partial<Input> = {}): Input => ({ ...EMPTY_INPUT, ...changes });
function attach(genome: Genome, kind: AdaptationId): Genome {
  const draft = cloneGenome(genome);
  draft.parts.push({ id: `fixture-${kind}-${draft.parts.length}`, kind, axial: 0, angle: 1.3, scale: 1, mirrored: false });
  return draft;
}
function withParts(...kinds: AdaptationId[]): Genome {
  let genome: Genome = initialGenome();
  if (kinds.includes('jaw')) genome.parts = genome.parts.filter(p => p.kind !== 'filter');
  for (const kind of kinds) genome = attach(genome, kind);
  return genome;
}
function scenario(stage: Stage = 0, genome = stage === 2 ? withParts('legs', 'lungs') : initialGenome()): GameState {
  const s = createGame(SEEDS[0]);
  s.stage = stage;
  s.world = createWorld(s.seed, stage);
  s.worlds[stage] = s.world;
  s.world.obstacles = [];
  s.world.creatures = [];
  s.world.resources = [];
  s.world.patches.forEach(p => { p.discovered = true; });
  s.player.pos = { x: 0, y: surfaceY(stage, 0, 0), z: 0 };
  s.player.genome = genome;
  s.player.health = statsFor(genome).maxHealth;
  s.player.energy = 70;
  s.player.cooldown = 0;
  s.player.invulnerable = 0;
  s.deathReason = null;
  return s;
}
function advance(s: GameState, frames: number, changes: Partial<Input> = {}): void {
  for (let i = 0; i < frames; i++) step(s, input(changes));
}
function resource(s: GameState, kind: FoodKind, amount = 5, x = s.player.pos.x, z = s.player.pos.z) {
  const r = { id: s.world.nextId++, kind, pos: { x, y: s.player.pos.y, z }, amount, max: 8, patch: 0, regen: 0 };
  s.world.resources.push(r);
  return r;
}
function readiness(s: GameState): void {
  s.campaign.stageMeals = CHAPTERS[s.stage].meals;
  s.campaign.stageReproductions = 2;
  s.world.patches.forEach(p => { p.discovered = true; });
  // Explicitly prepare the field-learning prerequisite alongside the other counters.
  s.campaign.journals.push(...s.world.patches.map(p => `field:${s.stage}:${p.id}:forage`));
  s.player.pos = { ...s.world.landmarks.find(l => l.kind === 'gate')!.pos };
}
function addPartner(s: GameState, species = s.stage === 0 ? 'lantern' : s.stage === 1 ? 'mender' : 'gloom') {
  const c = spawnCreature(s.world, species, 0);
  c.pos = { ...s.player.pos }; c.velocity = { x: 0, y: 0, z: 0 }; s.world.creatures.push(c);
  return c;
}

describe('seeded worlds and deterministic fixed-step simulation', () => {
  it.each(SEEDS)('repeats geometry and resources for seed %i in every stage', seed => {
    for (const stage of [0, 1, 2] as const) {
      const first = createWorld(seed, stage), second = createWorld(seed, stage);
      expect(first).toEqual(second);
      expect(first.patches).toHaveLength(3);
      expect(first.resources.length).toBeGreaterThan(35);
      expect(first.creatures.length).toBeLessThanOrEqual(48);
      expect(first.creatures.every(c => stageSpecies(stage).some(s => s.id === c.species))).toBe(true);
      const ids = [...first.resources, ...first.creatures, ...first.obstacles].map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of first.resources) {
        expect(Math.abs(r.pos.x)).toBeLessThanOrEqual(WORLD_BOUND);
        expect(Math.abs(r.pos.z)).toBeLessThanOrEqual(WORLD_BOUND);
        expect(r.amount).toBeGreaterThan(0);
      }
    }
  });
  it.each(SEEDS)('has accessible nursery resources and an unobstructed spawn for seed %i', seed => {
    for (const stage of [0, 1, 2] as const) {
      const world = createWorld(seed, stage);
      const nursery = world.resources.filter(r => horizontalDistance(r.pos, { x: 0, z: 0 }) < 15);
      expect(nursery.length).toBeGreaterThanOrEqual(9);
      expect(nursery.some(r => r.kind === 'algae')).toBe(true);
      for (const obstacle of world.obstacles) {
        expect(horizontalDistance(obstacle.pos, { x: 0, z: 0 })).toBeGreaterThan(obstacle.radius + .8);
        for (const r of nursery) expect(horizontalDistance(r.pos, obstacle.pos), `stage ${stage}, food ${r.id}, obstacle ${obstacle.id}`).toBeGreaterThanOrEqual(obstacle.radius + .8);
      }
    }
  });
  it.each(SEEDS)('same inputs and fixed steps give identical ecological state for seed %i', seed => {
    for (const stage of [0, 1, 2] as const) {
      const first = createGame(seed), second = createGame(seed);
      for (const s of [first, second]) {
        s.stage = stage; s.world = createWorld(seed, stage); s.worlds[stage] = s.world;
        s.player.pos.y = surfaceY(stage, 0, 0);
        if (stage === 2) s.player.genome = withParts('legs', 'lungs');
      }
      for (let frame = 0; frame < 1800; frame++) {
        const direction = Math.floor(frame / 300) % 4;
        const controls = input({ x: direction === 0 ? 1 : direction === 2 ? -1 : 0, z: direction === 1 ? 1 : direction === 3 ? -1 : 0, vertical: stage === 1 && frame % 600 < 100 ? 1 : 0, feed: frame % 70 === 0, sprint: frame % 400 < 80 });
        step(first, controls); step(second, controls);
      }
      expect(first.tick).toBe(1800);
      expect(summary(first)).toEqual(summary(second));
      expect(first.world.rng).toBe(second.world.rng);
    }
  });
  it('different seeds actually produce different habitat layouts', () => {
    expect(createWorld(SEEDS[0], 1).obstacles).not.toEqual(createWorld(SEEDS[1], 1).obstacles);
    expect(new Set(SPECIES.map(s => s.id)).size).toBeGreaterThanOrEqual(9);
    expect(new Set([0, 1, 2].flatMap(stage => createWorld(SEEDS[0], stage as Stage).patches.map(p => p.name))).size).toBeGreaterThanOrEqual(6);
  });
  it('bounds a delayed frame instead of integrating a tab-sized time step', () => {
    const delayed = scenario(), bounded = scenario();
    step(delayed, input({ x: 1 }), 120);
    step(bounded, input({ x: 1 }), 1 / 30);
    expect(delayed.world.time).toBeCloseTo(1 / 30);
    expect(summary(delayed)).toEqual(summary(bounded));
  });
});

describe('movement, volume and physical consequences', () => {
  it('accelerates directly from inputs and stops smoothly without drifting forever', () => {
    const s = scenario();
    advance(s, 120, { x: 1 });
    expect(s.player.pos.x).toBeGreaterThan(8);
    expect(s.player.pos.y).toBe(1.1);
    expect(s.player.distance).toBeGreaterThan(8);
    const atRelease = s.player.pos.x;
    advance(s, 120);
    expect(s.player.pos.x - atRelease).toBeLessThan(1.5);
    expect(Math.abs(s.player.velocity.x)).toBeLessThan(.001);
  });
  it('normalizes diagonal input rather than granting diagonal speed', () => {
    const straight = scenario(), diagonal = scenario();
    // Isolate normalization from the different physical arcs needed to face these inputs.
    straight.player.heading = Math.PI / 2; diagonal.player.heading = Math.PI / 4;
    advance(straight, 90, { x: 1 }); advance(diagonal, 90, { x: 1, z: 1 });
    expect(horizontalDistance(straight.player.pos, { x: 0, z: 0 })).toBeCloseTo(horizontalDistance(diagonal.player.pos, { x: 0, z: 0 }), 6);
  });
  it('collides with solid terrain and allows swimming over a low obstacle', () => {
    const blocked = scenario(), above = scenario(1);
    // Aim into the obstacle: turn-limited movement from another heading can go around it.
    blocked.player.heading = above.player.heading = Math.PI / 2;
    blocked.world.obstacles.push({ id: 999, kind: 'rock', pos: { x: 4, y: -6, z: 0 }, radius: 1, height: 4 });
    advance(blocked, 180, { x: 1 });
    expect(blocked.player.pos.x).toBeLessThanOrEqual(2.2 + 1e-6);
    above.world.obstacles.push({ id: 999, kind: 'coral', pos: { x: 4, y: -6, z: 0 }, radius: 1, height: 4 });
    above.player.pos.y = 5;
    advance(above, 90, { x: 1 });
    expect(above.player.pos.x).toBeGreaterThan(5);
  });
  it('supports depth control only underwater and clamps seabed and surface', () => {
    const s = scenario(1);
    const start = s.player.pos.y;
    advance(s, 60, { vertical: 1 });
    expect(s.player.pos.y).toBeCloseTo(start + 3.2, 5);
    advance(s, 600, { vertical: 1 }); expect(s.player.pos.y).toBe(12);
    advance(s, 900, { vertical: -1 });
    expect(s.player.pos.y).toBeCloseTo(groundHeight(s.player.pos.x, s.player.pos.z, 1) + 1.3);
    const micro = scenario(); advance(micro, 60, { vertical: 1 }); expect(micro.player.pos.y).toBe(1.1);
  });
  it('changes actual motion and maintenance when fins, jet or armor are evolved', () => {
    const basic = scenario(1), fins = scenario(1, withParts('fins')), armor = scenario(1, withParts('shell'));
    for (const s of [basic, fins, armor]) advance(s, 90, { x: 1 });
    expect(fins.player.pos.x).toBeGreaterThan(basic.player.pos.x);
    expect(armor.player.pos.x).toBeLessThan(basic.player.pos.x);
    const normalSprint = scenario(1), jetSprint = scenario(1, withParts('jet'));
    advance(normalSprint, 90, { x: 1, sprint: true }); advance(jetSprint, 90, { x: 1, sprint: true });
    expect(jetSprint.player.pos.x).toBeGreaterThan(normalSprint.player.pos.x * 1.3);
    expect(jetSprint.player.energy).toBeLessThan(normalSprint.player.energy);
  });
  it('gills replenish oxygen underwater and a reservoir slows land dehydration', () => {
    const bare = scenario(1), gills = scenario(1, withParts('gills'));
    for (const s of [bare, gills]) { s.player.pos.x = 25; s.player.oxygen = 50; advance(s, 120); }
    expect(bare.player.oxygen).toBeLessThan(50);
    expect(gills.player.oxygen).toBeGreaterThan(60);
    const land = scenario(2), reservoir = scenario(2, withParts('legs', 'lungs', 'reservoir'));
    for (const s of [land, reservoir]) { s.player.pos = { x: 20, y: surfaceY(2, 20, 0), z: 0 }; advance(s, 300); }
    expect(reservoir.player.moisture).toBeGreaterThan(land.player.moisture);
  });
  it('does not permit ordinary terrestrial locomotion or respiration without adaptations [invalid-body fixture]', () => {
    const s = scenario(2, initialGenome()); s.player.pos.x = 20;
    const health = s.player.health;
    advance(s, 120, { x: 1 });
    expect(s.player.pos.x - 20).toBeLessThan(.5);
    expect(s.player.health).toBeLessThan(health - 10);
  });
});

describe('food, predation, resource memory and restoration', () => {
  it('feeding consumes a world resource, pays DNA once and changes the local patch', () => {
    const s = scenario(); const food = resource(s, 'algae');
    const before = { dna: s.player.dna, energy: s.player.energy, amount: food.amount, fertility: s.world.patches[0].fertility };
    step(s, input({ feed: true }));
    expect(food.amount).toBe(before.amount - 1);
    expect(s.player.dna).toBe(before.dna + 3);
    expect(s.player.energy).toBeGreaterThan(before.energy + 16);
    expect(s.player.feeding).toBeGreaterThan(0);
    expect(s.player.meals).toBe(1); expect(s.campaign.stageMeals).toBe(1);
    expect(s.world.patches[0].harvested).toBe(1);
    expect(s.world.patches[0].fertility).toBeLessThan(before.fertility);
    expect(s.world.patches[0].pressure).toBeGreaterThan(0);
    step(s, input({ feed: true }));
    expect(food.amount).toBe(before.amount - 1); expect(s.player.dna).toBe(before.dna + 3);
  });
  it('an incompatible diet cannot consume nectar, while a proboscis reaches and extracts it', () => {
    const filtered = scenario(), nectarivore = scenario(0, withParts('proboscis'));
    const noFood = resource(filtered, 'nectar', 5, 5), yesFood = resource(nectarivore, 'nectar', 5, 5);
    step(filtered, input({ feed: true })); step(nectarivore, input({ feed: true }));
    expect(noFood.amount).toBe(5); expect(filtered.player.meals).toBe(0);
    expect(yesFood.amount).toBe(4); expect(nectarivore.player.meals).toBe(1);
  });
  it('recycling detritus yields different nutrition and DNA', () => {
    const normal = scenario(1), recycler = scenario(1, withParts('recycler'));
    resource(normal, 'detritus'); resource(recycler, 'detritus');
    step(normal, input({ feed: true })); step(recycler, input({ feed: true }));
    expect(recycler.player.energy - normal.player.energy).toBeGreaterThan(7.9);
    expect(recycler.player.dna - normal.player.dna).toBe(1);
  });
  it('a jaw kills prey and leaves meat and a persistent population/pressure consequence', () => {
    const s = scenario(0, withParts('jaw'));
    const prey = spawnCreature(s.world, 'veil', 0); prey.pos = { ...s.player.pos }; prey.health = statsFor(s.player.genome).damage;
    s.world.creatures.push(prey); const dna = s.player.dna;
    step(s, input({ feed: true }));
    expect(s.world.creatures.some(c => c.id === prey.id)).toBe(false);
    expect(s.world.resources.some(r => r.kind === 'meat' && distance(r.pos, prey.pos) < .01)).toBe(true);
    expect(s.world.deaths).toBe(1); expect(s.player.kills).toBe(1); expect(s.player.dna).toBe(dna + 5);
    expect(s.world.patches[0].hunted).toBe(1); expect(s.world.patches[0].pressure).toBeGreaterThan(.06);
    makeCheckpoint(s);
    const restored = recoverGeneration(s);
    expect(restored.world.creatures.some(c => c.id === prey.id)).toBe(false);
    expect(restored.world.patches[0]).toEqual(s.world.patches[0]);
    expect(restored.world.resources).toEqual(s.world.resources);
    expect(restored.world).toBe(restored.worlds[restored.world.stage]);
  });
  it('tending spends energy and restores depleted world resource amounts and soil', () => {
    const s = scenario(); const food = resource(s, 'algae', 1);
    s.world.patches[0].fertility = .5; s.world.patches[0].pressure = .2;
    // The nearest patch is patch 0 for this prepared resource.
    s.player.pos = { ...s.world.patches[0].center }; food.pos = { ...s.player.pos };
    const energy = s.player.energy;
    step(s, input({ tend: true }));
    expect(s.player.energy).toBeLessThan(energy - 9.9);
    expect(food.amount).toBeGreaterThan(1);
    expect(s.world.patches[0].fertility).toBeGreaterThan(.5);
    expect(s.world.patches[0].restored).toBe(1);
    expect(s.world.patches[0].pressure).toBeLessThan(.2);
  });
  it('photosynthesis supplies energy only in the illuminated niche', () => {
    const light = scenario(0, withParts('chloroplast')), dark = scenario(0, withParts('chloroplast'));
    light.player.pos = { ...light.world.patches[0].center }; dark.player.pos = { ...dark.world.patches[2].center };
    advance(light, 600); advance(dark, 600);
    expect(light.player.energy).toBeGreaterThan(70);
    expect(dark.player.energy).toBeLessThan(70);
  });
  it('scarce and fertile patches regenerate at different observed rates', () => {
    const rich = scenario(), scarce = scenario();
    const r = resource(rich, 'algae', 1), q = resource(scarce, 'algae', 1); r.regen = q.regen = .05;
    rich.world.patches[0].fertility = 1.4; scarce.world.patches[0].fertility = .2; scarce.world.patches[0].pressure = .7;
    advance(rich, 600); advance(scarce, 600);
    expect(r.amount - 1).toBeGreaterThan((q.amount - 1) * 10);
  });
});

describe('NPC intentions are driven by resources and threats', () => {
  it('grazers seek compatible food and consume it, while fleeing a predator takes priority', () => {
    const s = scenario(); const food = resource(s, 'algae', 6, 20);
    const grazer = spawnCreature(s.world, 'veil', 0); grazer.pos = { ...food.pos }; grazer.hunger = 75; s.world.creatures.push(grazer);
    advance(s, 30);
    expect(grazer.intent).toBe('forage'); expect(grazer.target).toBe(food.id);
    expect(food.amount).toBeLessThan(6); expect(grazer.hunger).toBeLessThan(75);
    const hunter = spawnCreature(s.world, 'needle', 0); hunter.pos = { x: grazer.pos.x - 5, y: grazer.pos.y, z: grazer.pos.z }; s.world.creatures.push(hunter);
    advance(s, 30);
    expect(grazer.intent).toBe('flee'); expect(grazer.velocity.x).toBeGreaterThan(0);
    expect(hunter.intent).toBe('hunt'); expect(hunter.target).toBe(grazer.id);
  });
  it('a predator chooses nearby prey rather than automatically pursuing the player', () => {
    const s = scenario();
    const predator = spawnCreature(s.world, 'needle', 0), prey = spawnCreature(s.world, 'veil', 0);
    predator.pos = { x: 4, y: 1.1, z: 0 }; predator.hunger = 80; prey.pos = { x: 12, y: 1.1, z: 0 };
    s.world.creatures.push(predator, prey); advance(s, 30);
    expect(predator.intent).toBe('hunt'); expect(predator.target).toBe(prey.id);
  });
  it('toxin has an active energy/cooldown cost and frightens nearby organisms', () => {
    const s = scenario(0, withParts('toxin')); const c = addPartner(s); c.health = 40;
    const energy = s.player.energy; step(s, input({ pulse: true }));
    expect(c.health).toBe(22); expect(c.fear).toBeGreaterThan(9);
    expect(s.player.energy).toBeLessThan(energy - 14.9); expect(s.player.cooldown).toBe(7);
    step(s, input({ pulse: true })); expect(c.health).toBe(22);
  });
});

describe('generation boundaries, transitions and fair death recovery', () => {
  it('rejects reproduction far from the nursery or without its DNA cost', () => {
    const s = scenario(); const original = cloneGenome(s.player.genome), dna = s.player.dna;
    s.player.pos.x = 30; expect(nearNest(s)).toBe(false); expect(evolve(s, original).ok).toBe(false); expect(s.player.dna).toBe(dna);
    s.player.pos.x = 0; s.player.dna = 5; expect(evolve(s, original).ok).toBe(false); expect(s.player.generation).toBe(1);
  });
  it('pays exactly the mutation/reproduction cost, retains the organism and recovers that generation', () => {
    const s = scenario(); s.player.dna = 50;
    const draft = attach(s.player.genome, 'eyes'); draft.name = 'Paměť';
    const result = evolve(s, draft);
    expect(result).toEqual({ ok: true, errors: [], cost: 18 });
    expect(s.player.dna).toBe(32); expect(s.player.generation).toBe(2); expect(s.campaign.stageReproductions).toBe(1);
    expect(s.player.genome).toEqual(draft); expect(s.player.genome).not.toBe(draft);
    draft.parts[0].scale = 1.6; expect(s.player.genome.parts[0].scale).toBe(1);
    const checkpoint = s.checkpoint;
    s.player.health = 0; s.deathReason = 'prepared death'; s.world.resources.push({ id: 9999, kind: 'meat', pos: { ...s.player.pos }, amount: 3, max: 3, patch: 0, regen: 0 });
    const restored = recoverGeneration(s);
    expect(restored.deathReason).toBeNull(); expect(restored.player.health).toBeGreaterThan(0);
    expect(restored.player.genome.name).toBe('Paměť'); expect(restored.player.dna).toBe(32); expect(restored.player.generation).toBe(2);
    expect(restored.checkpoint).toBe(checkpoint); expect(restored.world.resources).toHaveLength(0); expect(restored.player.invulnerable).toBe(10);
  });
  it('requires meals, exploration, reproduction and proximity before the first transition [readiness fixture]', () => {
    const s = scenario();
    expect(tryTransition(s)).toBe(false); expect(s.stage).toBe(0);
    readiness(s);
    for (const key of ['stageMeals', 'stageReproductions'] as const) {
      const saved = s.campaign[key]; s.campaign[key] = 0; expect(tryTransition(s)).toBe(false); s.campaign[key] = saved;
    }
    s.world.patches[0].discovered = false; expect(tryTransition(s)).toBe(false); s.world.patches[0].discovered = true;
    s.player.pos.x = 30; expect(tryTransition(s)).toBe(false); s.player.pos.x = 0;
    const genome = cloneGenome(s.player.genome), oldWorld = s.world;
    expect(transitionRequirements(s).every(r => r.met)).toBe(true); expect(tryTransition(s)).toBe(true);
    expect(s.stage).toBe(1); expect(s.player.genome).toEqual(genome); expect(s.worlds[0]).toBe(oldWorld);
    expect(s.campaign.stageMeals).toBe(0); expect(s.campaign.stageReproductions).toBe(0); expect(s.checkpoint).not.toBeNull();
  });
  it('requires both lungs and limbs before shore, and preserves all prior attachments [readiness fixture]', () => {
    const s = scenario(1); readiness(s);
    expect(tryTransition(s)).toBe(false);
    s.player.genome = attach(s.player.genome, 'lungs'); expect(tryTransition(s)).toBe(false);
    s.player.genome = attach(s.player.genome, 'legs'); const genome = cloneGenome(s.player.genome);
    expect(tryTransition(s)).toBe(true); expect(s.stage).toBe(2); expect(s.player.genome).toEqual(genome);
    expect(validateGenome(s.player.genome, 2)).toEqual([]);
    const invalid = cloneGenome(s.player.genome); invalid.parts = invalid.parts.filter(p => p.kind !== 'lungs');
    s.player.dna = 100; expect(evolve(s, invalid).ok).toBe(false); expect(has(s.player.genome, 'lungs')).toBe(true);
  });
  it('requires an actual successful interaction in every niche, with its DNA reward paid only once', () => {
    const s = scenario(); readiness(s);
    // Meals and generations are prepared; each field-learning event below is real feed input.
    s.campaign.journals = [];
    expect(s.world.patches.every(p => p.discovered)).toBe(true);
    expect(fieldProgress(s).every(p => !p.done)).toBe(true);
    expect(tryTransition(s)).toBe(false);
    for (const patch of s.world.patches) {
      s.player.pos = { ...patch.center }; s.player.velocity = { x: 0, y: 0, z: 0 };
      const food = resource(s, 'algae'); food.patch = patch.id;
      const before = s.player.dna;
      step(s, input({ feed: true }));
      expect(s.player.dna - before).toBe(8); // 3 DNA meal + 5 DNA first local success.
      expect(s.campaign.journals).toContain(`field:0:${patch.id}:forage`);
      expect(fieldProgress(s).filter(p => p.done)).toHaveLength(patch.id + 1);
      advance(s, 70);
      const learned = s.player.dna;
      step(s, input({ feed: true }));
      expect(s.player.dna - learned).toBe(3);
      expect(s.campaign.journals.filter(j => j.startsWith(`field:0:${patch.id}:`))).toHaveLength(1);
      advance(s, 70);
    }
    s.player.pos = { ...s.world.landmarks.find(l => l.kind === 'gate')!.pos };
    expect(transitionRequirements(s).every(r => r.met)).toBe(true);
    expect(tryTransition(s)).toBe(true);
    // Learning follows the current world: prior-stage journals cannot unlock another stage.
    expect(fieldProgress(s).every(p => !p.done)).toBe(true);
  });
  it('starvation produces a readable death, stops simulation and restores the last viable generation', () => {
    const s = scenario(); makeCheckpoint(s);
    s.player.pos.x = 30; s.player.energy = 0; s.player.health = .01;
    step(s, input());
    expect(s.deathReason).toContain('energii'); expect(s.player.health).toBe(0);
    const tick = s.tick; advance(s, 300, { x: 1 }); expect(s.tick).toBe(tick);
    const recovered = recoverGeneration(s); expect(recovered.deathReason).toBeNull(); expect(recovered.player.energy).toBe(70); expect(recovered.player.health).toBeGreaterThan(50);
  });
});

describe('symbiosis has world, attachment, cost and care requirements', () => {
  it('requires its organ and energy, consumes a partner NPC and stores an explicit visible bond', () => {
    const incompatible = scenario(); addPartner(incompatible); step(incompatible, input({ bond: true })); expect(incompatible.player.bonds).toHaveLength(0);
    const s = scenario(0, withParts('symbiote')); const c = addPartner(s); s.player.energy = 24;
    step(s, input({ bond: true })); expect(s.player.bonds).toHaveLength(0); expect(s.world.creatures).toContain(c);
    s.player.energy = 70; s.player.cooldown = 0; step(s, input({ bond: true }));
    expect(s.world.creatures.some(o => o.id === c.id)).toBe(false);
    expect(s.player.bonds).toHaveLength(1); expect(s.player.bonds[0]).toMatchObject({ species: 'lantern', benefit: 'light', hunger: 10, loyalty: 65, age: 0 });
    expect(s.player.energy).toBeLessThan(45.1); expect(s.campaign.stageBonds).toBe(1); expect(s.world.patches[0].restored).toBe(1);
  });
  it('caps symbiosis at two partners and persists their age, hunger and loyalty', () => {
    const s = scenario(0, withParts('symbiote'));
    for (let i = 0; i < 3; i++) { addPartner(s); s.player.energy = 90; s.player.cooldown = 0; step(s, input({ bond: true })); }
    expect(s.player.bonds).toHaveLength(2); expect(s.world.creatures).toHaveLength(1);
    advance(s, 120); makeCheckpoint(s); const restored = recoverGeneration(s);
    expect(restored.player.bonds).toEqual(s.player.bonds); expect(restored.player.bonds[0].age).toBeGreaterThan(1.9);
  });
  it('requires ongoing nourishment and abandons a host after sustained neglect', () => {
    const bonded = scenario(0, withParts('symbiote')), alone = scenario(0, withParts('symbiote'));
    bonded.player.bonds.push({ species: 'lantern', benefit: 'light', age: 0, hunger: 71, loyalty: 1 });
    advance(bonded, 60); advance(alone, 60);
    expect(bonded.player.energy).toBeLessThan(alone.player.energy);
    expect(bonded.player.bonds[0].hunger).toBeGreaterThan(71); expect(bonded.player.bonds[0].loyalty).toBeLessThan(1);
    advance(bonded, 120); expect(bonded.player.bonds).toHaveLength(0);
    expect(bonded.messages.some(m => m.text.includes('opustil'))).toBe(true);
  });
  it('feeding the host feeds the partner and improves loyalty', () => {
    const s = scenario(0, withParts('symbiote')); resource(s, 'algae');
    s.player.bonds.push({ species: 'lantern', benefit: 'light', age: 0, hunger: 60, loyalty: 40 });
    step(s, input({ feed: true }));
    expect(s.player.bonds[0].hunger).toBeLessThan(40.1); expect(s.player.bonds[0].loyalty).toBeGreaterThan(42.9);
  });
  it('keeps energy within the save contract when photosynthesis and a recycling partner overlap', () => {
    const s = scenario(0, withParts('symbiote', 'chloroplast'));
    s.player.pos = { ...s.world.patches[0].center }; s.player.energy = 100;
    s.player.bonds.push({ species: 'gloom', benefit: 'recycle', age: 10, hunger: 20, loyalty: 60 });
    advance(s, 120);
    expect(s.player.energy).toBeLessThanOrEqual(100);
    expect(s.player.energy).toBeGreaterThanOrEqual(0);
  });
  it('cannot retain functional partners after their supporting organ is removed', () => {
    const s = scenario(0, withParts('symbiote')); s.player.dna = 50;
    s.player.bonds.push({ species: 'lantern', benefit: 'light', age: 100, hunger: 20, loyalty: 60 });
    const withoutOrgan = cloneGenome(s.player.genome); withoutOrgan.parts = withoutOrgan.parts.filter(p => p.kind !== 'symbiote');
    const result = evolve(s, withoutOrgan);
    expect(!result.ok || s.player.bonds.length === 0).toBe(true);
  });
});

describe('three alternative ecological endings [prepared scenarios, not campaign playthroughs]', () => {
  it('restores all three springs through repeated paid tending without a combat organ', () => {
    const s = scenario(2); s.player.energy = 100;
    expect(has(s.player.genome, 'jaw')).toBe(false); expect(tryWin(s, 'restoration')).toBe(false);
    for (const spring of s.world.landmarks.filter(l => l.kind === 'spring')) {
      s.player.pos = { ...spring.pos }; const food = resource(s, 'algae', 8); food.max = 50; food.amount = 50;
      for (let i = 0; i < 10; i++) {
        advance(s, 121); step(s, input({ feed: true })); advance(s, 67); step(s, input({ tend: true }));
      }
      expect(spring.charge).toBe(10);
    }
    expect(s.campaign.won).toBe(true); expect(s.campaign.finale).toBe('restoration'); expect(s.player.kills).toBe(0);
    const tick = s.tick; step(s, input({ x: 1 })); expect(s.tick).toBe(tick);
    s.campaign.sandbox = true; step(s, input({ x: 1 })); expect(s.tick).toBe(tick + 1);
  });
  it('predator ending requires invasive control, nutrition and exploration, not arbitrary kills', () => {
    const s = scenario(2, withParts('jaw', 'legs', 'lungs')); s.player.energy = 95;
    s.campaign.stageKills = 11; expect(tryWin(s, 'predator')).toBe(false);
    const invasive = spawnCreature(s.world, 'gnaw', 0); invasive.pos = { ...s.player.pos }; invasive.health = statsFor(s.player.genome).damage; s.world.creatures.push(invasive);
    const fertility = s.world.patches[0].fertility;
    step(s, input({ feed: true }));
    expect(s.campaign.stageKills).toBe(12); expect(s.world.patches[0].fertility).toBeGreaterThan(fertility);
    expect(s.campaign.won).toBe(true); expect(s.campaign.finale).toBe('predator');
    const hungry = scenario(2); hungry.campaign.stageKills = 12; hungry.player.energy = 59; expect(tryWin(hungry, 'predator')).toBe(false);
    hungry.player.energy = 90; hungry.world.patches[0].discovered = false; expect(tryWin(hungry, 'predator')).toBe(false);
  });
  it('migration requires two mature cared-for partners, reservoir, energy, exploration and the destination', () => {
    const s = scenario(2, withParts('legs', 'lungs', 'symbiote', 'reservoir')); s.player.energy = 90;
    const gate = s.world.landmarks.find(l => l.kind === 'gate')!; s.player.pos = { ...gate.pos };
    expect(tryWin(s, 'migration')).toBe(false);
    s.player.bonds = [{ species: 'mender', benefit: 'shield', hunger: 20, loyalty: 60, age: 119 }, { species: 'gloom', benefit: 'recycle', hunger: 20, loyalty: 60, age: 121 }];
    expect(tryWin(s, 'migration')).toBe(false); s.player.bonds[0].age = 121;
    s.player.bonds[1].loyalty = 34; expect(tryWin(s, 'migration')).toBe(false); s.player.bonds[1].loyalty = 60;
    s.player.pos.x += 15; expect(tryWin(s, 'migration')).toBe(false); s.player.pos = { ...gate.pos };
    expect(tryWin(s, 'migration')).toBe(true); expect(s.campaign.finale).toBe('migration'); expect(s.player.kills).toBe(0);
  });
});
