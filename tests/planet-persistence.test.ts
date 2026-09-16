import { describe, expect, it, vi } from 'vitest';
import { initialVehicle } from '../src/game/blueprint';
import { ECOLOGY_CATALOG } from '../src/game/ecology-catalog';
import type { ActiveMachineState, ActivePlanetState, ActiveTribeState } from '../src/game/era-types';
import { emptyPlanet } from '../src/game/era-types';
import { computeStats, genomeCost, initialGenome } from '../src/game/genome';
import { initializeJourneyStage } from '../src/game/journey';
import { buildMachine, createMachines } from '../src/game/machines';
import { parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { introducePlanetLife, planetTScore, stepPlanet } from '../src/game/planet';
import { groundHeight } from '../src/game/random';
import { continueToPlanetEra, createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import { createTribe } from '../src/game/tribe';
import type { GameState } from '../src/game/types';
import { EMPTY_INPUT } from '../src/game/types';
import { createWorld } from '../src/game/world';

/** Prepared coast history: these tests establish schema compatibility rather
 * than claiming that the earlier ecological and territorial goals were earned. */
function coast(legacy = false, seed = 481516): GameState {
  const s = createGame(seed, legacy, !legacy, !legacy);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world; initializeJourneyStage(s);
  }
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `planet-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: false });
  s.player.health = computeStats(s.player.genome).maxHealth; s.player.totalDna = 300;
  s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  Object.assign(s.campaign, { won: true, finale: 'restoration' });
  makeCheckpoint(s); return s;
}
function change(s: GameState, mutate: (s: Record<string, any>) => void): string {
  const envelope = JSON.parse(serializeGame(s)); mutate(envelope.state); return JSON.stringify(envelope);
}
function ledgerState(): GameState {
  const s = coast(); s.journey.ecology = { version: 1, contacts: [
    { key: 'culture:6', stage: 2, patch: 0, method: 'culture' },
    { key: 'species:bell', stage: 2, patch: 1, method: 'feeding' },
    { key: 'species:crest', stage: 2, patch: null, method: 'hunt' },
    { key: 'species:gloom', stage: 2, patch: null, method: 'bond' },
  ] }; makeCheckpoint(s); return s;
}

describe('optional ecological contact history', () => {
  it.each([1, 2, 3] as const)('leaves an absent ledger absent in historical state v%i and its checkpoint', version => {
    const s = coast(true), envelope = JSON.parse(serializeGame(s));
    const downgrade = (state: Record<string, any>) => {
      state.version = version;
      if (version === 1) delete state.journey;
      if (state.checkpoint) { const checkpoint = JSON.parse(state.checkpoint); downgrade(checkpoint); state.checkpoint = JSON.stringify(checkpoint); }
    };
    envelope.version = version; downgrade(envelope.state);
    const loaded = parseGame(JSON.stringify(envelope));
    expect(loaded.journey).not.toHaveProperty('ecology'); expect(JSON.parse(loaded.checkpoint!).journey).not.toHaveProperty('ecology');
    expect(loaded.worlds).toEqual(s.worlds); expect(loaded.player).toEqual(s.player);
    expect(JSON.parse(serializeGame(loaded)).state.journey).not.toHaveProperty('ecology');
  });

  it.each([1, 2, 3] as const)('accepts an explicit valid ledger in journey v%i without inventing new contacts', version => {
    const s = createGame(481516, version !== 3);
    s.journey.ecology = { version: 1, contacts: [{ key: 'culture:0', stage: 0, patch: 0, method: 'culture' }] }; makeCheckpoint(s);
    const envelope = JSON.parse(serializeGame(s)); envelope.state.journey.version = version;
    const checkpoint = JSON.parse(envelope.state.checkpoint); checkpoint.journey.version = version; envelope.state.checkpoint = JSON.stringify(checkpoint);
    const loaded = parseGame(JSON.stringify(envelope));
    expect(loaded.journey.ecology).toEqual(s.journey.ecology); expect(JSON.parse(loaded.checkpoint!).journey.ecology).toEqual(s.journey.ecology);
    expect(loaded.journey.version).toBe(version === 1 ? 2 : version);
  });

  it('keeps exact recorded origin/method even after the interacting animal died', () => {
    const s = ledgerState(); s.world.creatures = s.world.creatures.filter(c => !['bell', 'crest', 'gloom'].includes(c.species));
    // Threat/hunter memories represent historical IDs; no live contact is required.
    makeCheckpoint(s); const bytes = JSON.stringify(s), loaded = parseGame(serializeGame(s));
    expect(loaded.journey.ecology).toEqual(s.journey.ecology); expect(JSON.stringify(s)).toBe(bytes);
    expect(recoverGeneration(loaded).journey.ecology).toEqual(s.journey.ecology);
  });

  it('accepts each of the 19 catalog taxa once with valid historical provenance', () => {
    const s = coast(); s.journey.ecology = { version: 1, contacts: ECOLOGY_CATALOG.map(taxon => ({
      key: taxon.key, stage: taxon.stage, patch: taxon.site === null ? null : taxon.site % 3 as 0 | 1 | 2,
      method: taxon.role === 'producer' ? 'culture' : taxon.role === 'partner' ? 'bond' : 'feeding',
    })) }; makeCheckpoint(s);
    expect(parseGame(serializeGame(s)).journey.ecology).toEqual(s.journey.ecology);
  });

  it.each([
    ['null ledger', (s: any) => { s.journey.ecology = null; }],
    ['unknown ledger version', (s: any) => { s.journey.ecology.version = 2; }],
    ['extra ledger field', (s: any) => { s.journey.ecology.extra = true; }],
    ['missing contacts', (s: any) => { delete s.journey.ecology.contacts; }],
    ['extra contact field', (s: any) => { s.journey.ecology.contacts[0].id = 1; }],
    ['missing contact field', (s: any) => { delete s.journey.ecology.contacts[0].patch; }],
    ['unknown taxon', (s: any) => { s.journey.ecology.contacts[0].key = 'culture:9'; }],
    ['duplicate taxon', (s: any) => { s.journey.ecology.contacts.push(s.journey.ecology.contacts[0]); }],
    ['excess contacts', (s: any) => { s.journey.ecology.contacts = Array(20).fill(s.journey.ecology.contacts[0]); }],
    ['wrong native stage', (s: any) => { s.journey.ecology.contacts[0].stage = 0; }],
    ['era used as native stage', (s: any) => { s.journey.ecology.contacts[0].stage = 5; }],
    ['fractional stage', (s: any) => { s.journey.ecology.contacts[0].stage = 1.5; }],
    ['wrong culture patch', (s: any) => { s.journey.ecology.contacts[0].patch = 1; }],
    ['unknown patch', (s: any) => { s.journey.ecology.contacts[1].patch = 3; }],
    ['fractional patch', (s: any) => { s.journey.ecology.contacts[1].patch = .5; }],
    ['producer fed as fauna', (s: any) => { s.journey.ecology.contacts[0].method = 'feeding'; }],
    ['fauna carried as culture', (s: any) => { s.journey.ecology.contacts[1].method = 'culture'; }],
    ['grazer bonded as partner', (s: any) => { s.journey.ecology.contacts[1].method = 'bond'; }],
    ['unknown method', (s: any) => { s.journey.ecology.contacts[1].method = 'observed'; }],
  ] as const)('rejects %s', (_name, mutate) => { expect(() => parseGame(change(ledgerState(), mutate))).toThrow('journey.ecology'); });

  it('rejects a contact from an unvisited world and malformed checkpoint contacts', () => {
    const s = createGame(481516);
    expect(() => parseGame(change(s, state => { state.journey.ecology = { version: 1, contacts: [{ key: 'culture:6', stage: 2, patch: 0, method: 'culture' }] }; }))).toThrow('journey.ecology');
    expect(() => parseGame(change(ledgerState(), state => { const cp = JSON.parse(state.checkpoint); cp.journey.ecology.contacts[1].method = 'culture'; state.checkpoint = JSON.stringify(cp); }))).toThrow('journey.ecology');
  });
});

type PlanetGame = GameState & { tribe: ActiveTribeState; machines: ActiveMachineState; planet: ActivePlanetState };
function fixture(legacy = false, populated = true, seed = 481516): PlanetGame {
  const s = coast(legacy, seed);
  s.tribe = createTribe(s); s.tribe.neighbours.forEach(n => { n.resolved = 'allied'; }); s.tribe.completed = true;
  s.stage = 4; s.machines = createMachines(s); s.machines.resource = 1000;
  expect(buildMachine(s, initialVehicle('tank', 'restoration')).ok).toBe(true);
  s.machines.regions.forEach(r => { r.owner = 'player'; r.method = 'restoration'; });
  s.machines.airUnlocked = true; s.machines.springs.slice(0, 2).forEach(spring => { spring.owner = 'player'; spring.progress = 1; });
  expect(buildMachine(s, initialVehicle('air', 'restoration')).ok).toBe(true); s.machines.completed = true;
  // Prepared contact history and climate isolate persistence; introduction still
  // uses public actions, a paid machine and actual newly allocated resources.
  s.journey.ecology = { version: 1, contacts: ECOLOGY_CATALOG.map(taxon => ({ key: taxon.key, stage: taxon.stage,
    patch: taxon.site === null ? null : taxon.site % 3 as 0 | 1 | 2, method: taxon.role === 'producer' ? 'culture' : 'feeding' })) };
  expect(continueToPlanetEra(s)).toBe(true); const game = s as PlanetGame;
  if (populated) {
    Object.assign(game.planet, { temperature: .12, atmosphere: -.08, tScore: 3, activeMachine: game.machines.fleet[1].id });
    for (const biome of game.planet.biomes) {
      game.machines.fleet[1].pos = { ...biome.pos, y: groundHeight(biome.pos.x, biome.pos.z, 2) + 15 };
      for (const key of ['culture:6', 'culture:7', 'species:bell', 'species:gnaw', 'species:crest']) expect(introducePlanetLife(game, biome.id, key), `${biome.id}:${key}`).toMatchObject({ ok: true });
    }
    stepPlanet(game, EMPTY_INPUT, .25);
  }
  makeCheckpoint(game); return game;
}
function corrupt(mutate: (s: Record<string, any>) => void): string { return change(fixture(), mutate); }

describe('active terraforming save and recovery', () => {
  it.each([true, false])('preserves the real P3 factory and all inherited data (legacy=%s)', legacy => {
    const s = fixture(legacy, false), before = JSON.stringify(s), loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s); expect(JSON.stringify(s)).toBe(before);
    expect(loaded.worlds).toHaveLength(3); expect(loaded.world).toBe(loaded.worlds[2]);
    expect(loaded.planet).toEqual(JSON.parse(loaded.checkpoint!).planet); expect(recoverGeneration(loaded)).toMatchObject({ planet: s.planet, journey: s.journey, machines: s.machines });
  });

  it('round-trips six actual roots, nine interacting populations, culture sources and partial climate work', () => {
    const s = fixture(); Object.assign(s.planet, { stableTime: 12.25, elapsed: 94.75, toolOn: true });
    s.planet.stabilizers[0].site.vitality = 0; s.world.resources.find(r => r.id === s.planet.stabilizers[0].site.sourceId)!.amount = 0;
    Object.assign(s.planet.populations[0], { vitality: 0, abundance: 0, nutrition: 0 });
    s.world.resources.find(r => r.id === s.planet.nursery.sources[0].resourceId)!.amount = 0;
    makeCheckpoint(s); const bytes = JSON.stringify(s), loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s); expect(JSON.stringify(s)).toBe(bytes);
    expect((loaded.planet as ActivePlanetState).stabilizers).toHaveLength(6); expect((loaded.planet as ActivePlanetState).populations).toHaveLength(9);
    expect(parseGame(serializeGame(recoverGeneration(loaded))).planet).toEqual(s.planet);
  });

  it.each([481516, 20260913, 8675309])('replays live populations, resource consumption and climate exactly after load for seed %i', seed => {
    const s = fixture(false, true, seed); s.planet.toolOn = true;
    for (let i = 0; i < 47; i++) stepPlanet(s, { ...EMPTY_INPUT, x: .6, z: -.3 }, 1 / 60);
    const loaded = parseGame(serializeGame(s));
    for (let i = 0; i < 240; i++) {
      const input = { ...EMPTY_INPUT, x: i < 90 ? .5 : 0, z: i < 90 ? -.4 : 0 };
      if (i === 90) { s.planet.toolOn = false; (loaded.planet as ActivePlanetState).toolOn = false; }
      stepPlanet(s, input, 1 / 60); stepPlanet(loaded, input, 1 / 60);
    }
    expect(loaded).toEqual(s); expect(parseGame(serializeGame(s))).toEqual(s);
  });

  it('preserves completion and sandbox after climate regression and loss of living support', () => {
    const s = fixture(); Object.assign(s.planet, { completed: true, sandbox: true, stableTime: 0, temperature: .95, atmosphere: -.95, tScore: 0 });
    s.planet.stabilizers.forEach(root => { root.site.vitality = 0; }); s.planet.populations.forEach(population => { population.vitality = 0; });
    expect(parseGame(serializeGame(s)).planet).toEqual(s.planet);
  });

  it('preserves the historical P0 planet v1 without activation or automatic contact inference', () => {
    const s: GameState = fixture(true, false); s.planet = emptyPlanet(); delete s.journey.ecology; makeCheckpoint(s);
    const loaded = parseGame(serializeGame(s)); expect(loaded.planet).toEqual(emptyPlanet()); expect(loaded.journey).not.toHaveProperty('ecology');
  });

  it.each([1, 2] as const)('rejects a preview/active checkpoint mismatch for live planet v%i', version => {
    expect(() => parseGame(corrupt(s => {
      if (version === 1) s.planet = emptyPlanet();
      else { const cp = JSON.parse(s.checkpoint); cp.planet = emptyPlanet(); s.checkpoint = JSON.stringify(cp); }
    }))).toThrow('checkpoint');
  });

  it('checks planet data inside a checkpoint and preserves a separate world ID domain', () => {
    expect(() => parseGame(corrupt(s => { const cp = JSON.parse(s.checkpoint); cp.planet.populations[0].nutrition = 2; s.checkpoint = JSON.stringify(cp); }))).toThrow('nutrition');
    const s = fixture(), root = s.planet.stabilizers[0]; root.id = root.site.sourceId; root.site.id = root.id; s.planet.nextId = Math.max(s.planet.nextId, root.id + 1); makeCheckpoint(s);
    expect(parseGame(serializeGame(s)).planet).toEqual(s.planet);
  });

  it.each([[0, 0, 3], [.3, 0, 3], [.300001, 0, 2], [.65, 0, 2], [.650001, 0, 1], [1, 0, 1], [1, .001, 0], [-.21, -.21, 3]] as const)('derives T%s/%s = %s at radial band boundaries', (temperature, atmosphere, score) => {
    const s = fixture(false, false); Object.assign(s.planet, { temperature, atmosphere, tScore: score });
    expect(planetTScore(temperature, atmosphere)).toBe(score); expect(parseGame(serializeGame(s)).planet?.tScore).toBe(score);
    s.planet.tScore = ((score + 1) % 4) as 0 | 1 | 2 | 3; expect(() => serializeGame(s)).toThrow('tScore');
  });
});

describe('strict planet schema and relationships', () => {
  it.each(['planet', 'biome', 'root', 'site', 'population', 'nursery', 'source'] as const)('requires exact %s fields', field => {
    const at = (s: any) => field === 'planet' ? s.planet : field === 'biome' ? s.planet.biomes[0] : field === 'root' ? s.planet.stabilizers[0]
      : field === 'site' ? s.planet.stabilizers[0].site : field === 'population' ? s.planet.populations[0] : field === 'nursery' ? s.planet.nursery : s.planet.nursery.sources[0];
    for (const missing of [false, true]) expect(() => parseGame(corrupt(s => { const value = at(s); if (missing) delete value[Object.keys(value).at(-1)!]; else value.extra = true; }))).toThrow('state.planet');
  });

  it.each([
    ['unknown planet version', (p: any) => { p.version = 3; }],
    ['temperature range', (p: any) => { p.temperature = 1.01; }],
    ['atmosphere range', (p: any) => { p.atmosphere = -1.01; }],
    ['nonfinite climate', (p: any) => { p.temperature = Infinity; }],
    ['stale T score', (p: any) => { p.tScore = 2; }],
    ['fractional active machine', (p: any) => { p.activeMachine = .5; }],
    ['unknown active machine', (p: any) => { p.activeMachine = 999999; }],
    ['nonboolean tool', (p: any) => { p.toolOn = 1; }],
    ['negative elapsed', (p: any) => { p.elapsed = -1; }],
    ['negative stable time', (p: any) => { p.stableTime = -1; }],
    ['excess stable time', (p: any) => { p.stableTime = 30.01; }],
    ['nonboolean completion', (p: any) => { p.completed = 1; }],
    ['unearned sandbox', (p: any) => { p.sandbox = true; }],
    ['next ID collision', (p: any) => { p.nextId = p.populations.at(-1).id; }],
    ['missing biome', (p: any) => { p.biomes.pop(); }],
    ['extra biome', (p: any) => { p.biomes.push({ id: 4, level: 4, pos: p.biomes[0].pos }); }],
    ['duplicate biome', (p: any) => { p.biomes[1] = p.biomes[0]; }],
    ['wrong biome level', (p: any) => { p.biomes[0].level = 2; }],
    ['nonfinite biome position', (p: any) => { p.biomes[0].pos.x = Infinity; }],
    ['cross-collection ID collision', (p: any) => { p.populations[0].id = p.stabilizers[0].id; }],
    ['unknown root biome', (p: any) => { p.stabilizers[0].biome = 4; }],
    ['animal root', (p: any) => { p.stabilizers[0].key = 'species:bell'; }],
    ['too many roots', (p: any) => { p.stabilizers.push({ ...p.stabilizers[0], id: p.nextId++ }); }],
    ['three producers in one biome', (p: any) => { Object.assign(p.stabilizers[2], { biome: 1, key: 'culture:0' }); p.stabilizers[2].site.patch = 0; }],
    ['duplicate root taxon in biome', (p: any) => { p.stabilizers[1].key = p.stabilizers[0].key; }],
    ['root site ID mismatch', (p: any) => { p.stabilizers[0].site.id += 1; }],
    ['root coast stage', (p: any) => { p.stabilizers[0].site.stage = 2; }],
    ['root wrong patch', (p: any) => { p.stabilizers[0].site.patch = 2; }],
    ['root missing refuge', (p: any) => { p.stabilizers[0].site.refuges = []; }],
    ['root displaced refuge', (p: any) => { p.stabilizers[0].site.refuges[0].x += 1; }],
    ['root displaced source', (p: any) => { p.stabilizers[0].site.source.z += 1; }],
    ['root unknown source ID', (p: any) => { p.stabilizers[0].site.sourceId = 999999; p.stabilizers[0].site.plantedId = 999999; }],
    ['root different planted ID', (p: any) => { p.stabilizers[0].site.plantedId += 1; }],
    ['root vitality range', (p: any) => { p.stabilizers[0].site.vitality = 101; }],
    ['root unobserved', (p: any) => { p.stabilizers[0].site.observed = false; }],
    ['root native completion', (p: any) => { p.stabilizers[0].site.resolved = true; }],
    ['root native method', (p: any) => { p.stabilizers[0].site.method = 'cultivate'; }],
    ['root native threat', (p: any) => { p.stabilizers[0].site.threatIds = [1]; }],
    ['root native phase', (p: any) => { p.stabilizers[0].site.phase = 1; }],
    ['unknown population biome', (p: any) => { p.populations[0].biome = 0; }],
    ['too many populations', (p: any) => { p.populations.push({ ...p.populations[0], id: p.nextId++ }); }],
    ['three herbivores in one biome', (p: any) => { p.populations[2].key = 'species:veil'; }],
    ['partner counted as herbivore', (p: any) => { p.populations[0].key = 'species:gloom'; }],
    ['producer counted as fauna', (p: any) => { p.populations[0].key = 'culture:6'; }],
    ['duplicate population taxon in biome', (p: any) => { p.populations[1].key = p.populations[0].key; }],
    ['too many predators in biome', (p: any) => { p.populations[0].key = 'species:needle'; }],
    ['unknown population key', (p: any) => { p.populations[0].key = 'species:alien'; }],
    ['nonfinite population position', (p: any) => { p.populations[0].pos.y = NaN; }],
    ['negative population vitality', (p: any) => { p.populations[0].vitality = -1; }],
    ['population vitality overflow', (p: any) => { p.populations[0].vitality = 101; }],
    ['negative abundance', (p: any) => { p.populations[0].abundance = -1; }],
    ['abundance overflow', (p: any) => { p.populations[0].abundance = 3.01; }],
    ['nutrition overflow', (p: any) => { p.populations[0].nutrition = 1.01; }],
    ['nursery position range', (p: any) => { p.nursery.pos.x = 1025; }],
    ['missing nursery culture', (p: any) => { p.nursery.sources.pop(); }],
    ['duplicate nursery culture', (p: any) => { p.nursery.sources[1].key = p.nursery.sources[0].key; }],
    ['wrong nursery culture', (p: any) => { p.nursery.sources[0].key = 'culture:0'; }],
    ['unknown nursery resource', (p: any) => { p.nursery.sources[0].resourceId = 999999; }],
  ] as const)('rejects %s', (_name, mutate) => { expect(() => parseGame(corrupt(s => mutate(s.planet)))).toThrow('state.planet'); });

  it.each([
    ['missing contact ledger', (s: any) => { delete s.journey.ecology; }],
    ['unknown introduced producer', (s: any) => { s.journey.ecology.contacts = s.journey.ecology.contacts.filter((c: any) => c.key !== 'culture:6'); }],
    ['unknown introduced animal', (s: any) => { s.journey.ecology.contacts = s.journey.ecology.contacts.filter((c: any) => c.key !== 'species:bell'); }],
    ['unfinished machine era', (s: any) => { s.machines.completed = false; }],
    ['dead selected machine', (s: any) => { s.machines.fleet.find((u: any) => u.id === s.planet.activeMachine).health = 0; }],
    ['wrong root food', (s: any) => { for (const w of [s.world, s.worlds[2]]) w.resources.find((r: any) => r.id === s.planet.stabilizers[0].site.sourceId).kind = 'meat'; }],
    ['wrong root patch', (s: any) => { for (const w of [s.world, s.worlds[2]]) w.resources.find((r: any) => r.id === s.planet.stabilizers[0].site.sourceId).patch = 2; }],
    ['regenerating root', (s: any) => { for (const w of [s.world, s.worlds[2]]) w.resources.find((r: any) => r.id === s.planet.stabilizers[0].site.sourceId).regen = .1; }],
    ['root capacity mismatch', (s: any) => { for (const w of [s.world, s.worlds[2]]) w.resources.find((r: any) => r.id === s.planet.stabilizers[0].site.sourceId).max = 15; }],
    ['wrong nursery food', (s: any) => { for (const w of [s.world, s.worlds[2]]) w.resources.find((r: any) => r.id === s.planet.nursery.sources[0].resourceId).kind = 'meat'; }],
    ['wrong nursery patch', (s: any) => { for (const w of [s.world, s.worlds[2]]) w.resources.find((r: any) => r.id === s.planet.nursery.sources[0].resourceId).patch = 2; }],
  ] as const)('rejects %s against retained state', (_name, mutate) => { expect(() => parseGame(corrupt(mutate))).toThrow('state.planet'); });

  it('does not let one physical root act as a nursery source as well', () => {
    expect(() => parseGame(corrupt(s => { s.planet.nursery.sources[0].resourceId = s.planet.stabilizers[0].site.sourceId; }))).toThrow('state.planet');
  });

  it('rejects malformed replacements atomically without altering the caller or previous slot', () => {
    const slots = new Map<string, string>(); vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => slots.set(key, value), getItem: (key: string) => slots.get(key) ?? null });
    try {
      const s = fixture(); expect(saveGame(s)).toEqual({ ok: true }); const previous = slots.get(`lumavora:save:${s.id}`);
      s.planet.populations[0].nutrition = 2; const malformed = JSON.stringify(s);
      expect(saveGame(s)).toMatchObject({ ok: false }); expect(JSON.stringify(s)).toBe(malformed);
      expect(slots.size).toBe(1); expect(slots.get(`lumavora:save:${s.id}`)).toBe(previous);
    } finally { vi.unstubAllGlobals(); }
  });
});
