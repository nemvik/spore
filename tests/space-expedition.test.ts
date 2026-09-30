import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASIC_JUMP_RANGE, GALAXY_SYSTEMS, galaxySeed, jumpEnergy, planetSystem,
  starSystems, systemById, systemDistance,
} from '../src/game/galaxy';
import {
  activeForeignPlanet, enableExpedition, EXPEDITION_COSTS, foreignSpecimenTargets,
  jumpQuote, jumpToSystem, specimenQuote, useSpecimenTool, visitForeignPlanet,
} from '../src/game/space-expedition';
import { expeditionCheckpointMatches, expeditionEnergySince, validateExpedition } from '../src/game/space-expedition-validation';
import { createForeignPlanet, foreignGround, LIFE_PROFILES, lifeName, spaceLifeSpecies } from '../src/game/space-life';
import type { ExpeditionAction, SpaceLife } from '../src/game/space-expedition-types';
import { initialShip, shipStats } from '../src/game/ship-design';
import { newShipCreation } from '../src/game/ship-library';
import { buildShip, changeSpaceScale, enableSpace, launchShip } from '../src/game/space';
import { machineHome } from '../src/game/machines';
import { planetVehicle } from '../src/game/planet';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { parseGame, serializeGame } from '../src/game/persistence';
import { newCreation } from '../src/game/creature-library';
import { generatedNpcGenome, validateNpcDesigns } from '../src/game/npc-genome';
import { speciesById } from '../src/game/content';
import { EMPTY_INPUT, type GameState, type Input } from '../src/game/types';

// All scenarios in this file are explicitly prepared UNIT regressions. The source
// has earned stage 5, but positioning a carrier/specimen here is not native UI proof.
// Final byte-identical C1 browser fixtures have their own separate fixture tests.
const historical = 'tests/fixtures/civilization/native-military-campaign.save.json';
const round = (s: GameState) => parseGame(serializeGame(s));
const home = (s: GameState) => {
  const { space: _space, checkpoint: _checkpoint, ...rest } = s;
  return structuredClone(rest);
};
const flight = (s: GameState) => {
  const { notice: _notice, ...rest } = s.space!;
  return structuredClone(rest);
};
function minimalFlight(expedition = true, engineScale = 1) {
  const s = parseGame(readFileSync(historical, 'utf8')); enableSpace(s);
  planetVehicle(s)!.pos = { ...machineHome(s) };
  const blueprint = initialShip(); blueprint.parts = blueprint.parts.filter(p => p.kind === 'engine');
  blueprint.parts[0].scale = { x: engineScale, y: engineScale, z: engineScale };
  expect(buildShip(s, newShipCreation(blueprint, '', 'minimal-expedition', 1))).toBe(true);
  expect(launchShip(s)).toBe(true); if (expedition) enableExpedition(s); return s;
}
function advance(s: GameState, seconds: number, input: Input = EMPTY_INPUT) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) step(s, input, 1 / 30);
}
function finish(s: GameState) {
  for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.leg).toBeNull();
}
function toSystem(s: GameState) {
  if (s.space!.location!.scale === 'surface') {
    advance(s, 2, { ...EMPTY_INPUT, vertical: 1 });
    expect(changeSpaceScale(s, 'up')).toBe(true); finish(s);
  }
  if (s.space!.location!.scale === 'orbit') { expect(changeSpaceScale(s, 'up')).toBe(true); finish(s); }
  expect(s.space!.location!.scale).toBe('system');
}
function toSurface(s: GameState) {
  for (const scale of ['orbit', 'surface'] as const) {
    expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); expect(s.space!.location!.scale).toBe(scale);
  }
}
function foreignSurface(index = 1, engineScale = 1) {
  const s = minimalFlight(true, engineScale); toSystem(s);
  // Sequential map neighbours are reachable by the basic range, without upgrades.
  for (let i = 1; i <= index; i++) {
    expect(jumpToSystem(s, starSystems(s.homePlanet!.id)[i].id)).toBe(true); finish(s);
  }
  toSurface(s); expect(activeForeignPlanet(s)).not.toBeNull(); return s;
}
function over(s: GameState, item: SpaceLife) {
  // Prepared range-isolation only. The native driver must fly with real controls.
  s.space!.location!.pos = { x: item.pos.x, y: 3, z: item.pos.z };
}
function assertRejected(s: GameState, action: () => boolean) {
  const before = flight(s), domestic = home(s), cp = s.checkpoint;
  expect(action()).toBe(false); expect(flight(s)).toEqual(before);
  expect(home(s)).toEqual(domestic); expect(s.checkpoint).toBe(cp);
}
function rejectSave(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}

describe('C2 deterministic galaxy and stable physical addresses', () => {
  it.each(['home-line-481516-original', 'home-line-0', 'home-line-4294967295'])('connects all %s systems using only basic neighbouring jumps', id => {
    const systems = starSystems(id);
    expect(systems).toHaveLength(GALAXY_SYSTEMS); expect(GALAXY_SYSTEMS).toBe(32);
    expect(new Set(systems.map(v => v.id)).size).toBe(32); expect(new Set(systems.map(v => v.planetId)).size).toBe(32);
    expect(systems[0]).toMatchObject({ id: `${id}:system`, planetId: id, index: 0, name: 'Lumavora' });
    expect(systems.at(-1)).toMatchObject({ index: 31, x: 0, z: 0 });
    for (let i = 1; i < systems.length; i++) {
      const a = systems[i - 1], b = systems[i];
      expect(systemDistance(a, b)).toBeLessThanOrEqual(BASIC_JUMP_RANGE);
      expect(systemDistance(a, b)).toBe(systemDistance(b, a));
      expect(jumpEnergy(a, b)).toBe(jumpEnergy(b, a)); expect(jumpEnergy(a, b)).toBeLessThanOrEqual(10);
      expect(systemById(id, b.id)).toEqual(b); expect(planetSystem(id, b.planetId)).toEqual(b);
    }
    expect(starSystems(id)).toEqual(systems); systems[1].name = 'Mutated outside';
    expect(starSystems(id)[1].name).toBe('Jantarový háj');
    expect(systemById(id, `${id}:unknown`)).toBeNull(); expect(planetSystem(id, systems[0].id)).toBeNull();
  });

  it('uses the preserved home namespace rather than a rekeyed campaign id', () => {
    const s = minimalFlight(), before = starSystems(s.homePlanet!.id), original = s.homePlanet!.id;
    s.id += '-imported'; const cp = JSON.parse(s.checkpoint!) as GameState; cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    expect(round(s).homePlanet!.id).toBe(original); expect(starSystems(s.homePlanet!.id)).toEqual(before);
    expect(before[1].seed).toBe(galaxySeed(before[1].id));
    expect(starSystems('another-home')[1].seed).not.toBe(before[1].seed);
    expect(starSystems('another-home')[1].planetId).not.toBe(before[1].planetId);
  });

  it('generates six real ecological roles and distinct barren climates without touching the home world', () => {
    const systems = starSystems('home-unit'), a = createForeignPlanet(systems[1]), b = createForeignPlanet(systems[2]), c = createForeignPlanet(systems[3]);
    expect(a).toEqual(createForeignPlanet(systems[1])); expect(a.life).toHaveLength(36);
    expect(new Set(a.life.map(life => life.id)).size).toBe(36);
    for (const profile of LIFE_PROFILES) expect(a.life.filter(life => life.taxonKey === profile.key)).toHaveLength(6);
    expect(a.life.every(life => life.originPlanetId === a.id)).toBe(true);
    expect(a.life.every(life => life.pos.y === foreignGround(a.seed, life.pos.x, life.pos.z))).toBe(true);
    expect(() => validateNpcDesigns(a.designs)).not.toThrow();
    expect(b.life).toEqual([]); expect(c.life).toEqual([]);
    expect([a.temperature, a.atmosphere]).not.toEqual([b.temperature, b.atmosphere]);
    expect([b.temperature, b.atmosphere]).not.toEqual([c.temperature, c.atmosphere]);
    expect(() => createForeignPlanet(systems[0])).toThrow();
    a.life.pop(); expect(createForeignPlanet(systems[1]).life).toHaveLength(36);
  });
});

describe('C2 explicit extension, basic jumps and saved arrival', () => {
  it('keeps old C1 absence and explicitly activates empty live/checkpoint branches without grants', () => {
    const s = minimalFlight(false), c1 = round(s), old = structuredClone(c1), before = home(s);
    expect(Object.hasOwn(c1.space!, 'expedition')).toBe(false);
    enableExpedition(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(home(s)).toEqual(before); expect(s.space!.ship).toEqual(old.space!.ship);
    expect(s.space!.log).toEqual(old.space!.log);
    expect(s.space!.expedition).toEqual({ version: 1, generator: 1, worlds: [], cargo: [], scans: [], actions: [], nextAction: 1, energySpent: 0 });
    expect(cp.space!.expedition).toEqual(s.space!.expedition);
    const once = structuredClone(s); enableExpedition(s); expect(s).toEqual(once);
    expect(round(s).space).toEqual(s.space);
  });

  it('flies the minimum ship through a paid jump and exact mid-jump checkpoint, then returns home', () => {
    let s = minimalFlight(); const domestic = home(s), p = s.space!, stats = shipStats(p.ship!.creation.blueprint);
    expect(stats).toMatchObject({ cargo: 4, scan: 8, solar: 1 });
    toSystem(s); const target = starSystems(p.homePlanetId)[1], energy = p.ship!.energy;
    const q = jumpQuote(s, target.id); expect(q.ok).toBe(true);
    expect(jumpToSystem(s, target.id)).toBe(true); expect(p.ship!.energy).toBe(energy - q.price);
    expect(p.leg).toMatchObject({ elapsed: 0, duration: 6, energyPaid: q.price, from: { scale: 'system' }, to: { systemId: target.id, planetId: target.planetId } });
    assertRejected(s, () => jumpToSystem(s, target.id));
    advance(s, 2); makeCheckpoint(s); const checkpoint = structuredClone(s.space);
    s = round(s); expect(s.space).toEqual(checkpoint); advance(s, 1);
    const restored = recoverGeneration(round(s));
    expect(restored.space).toEqual({ ...checkpoint, notice: expect.any(String) }); expect(home(restored)).toEqual(domestic);
    finish(s); expect(s.space!.location!.systemId).toBe(target.id);
    expect(s.space!.expedition!.worlds).toEqual([]); toSurface(s);
    expect(activeForeignPlanet(s)!.id).toBe(target.planetId); expect(s.space!.expedition!.worlds).toHaveLength(1);
    const arrived = structuredClone(s.space!.expedition!.worlds); visitForeignPlanet(s); expect(s.space!.expedition!.worlds).toEqual(arrived);
    s = round(s); toSystem(s); advance(s, 20); expect(jumpToSystem(s, starSystems(p.homePlanetId)[0].id)).toBe(true);
    finish(s); toSurface(s); expect(activeForeignPlanet(s)).toBeNull();
    expect(changeSpaceScale(s, 'down')).toBe(true); expect(home(s)).toEqual(domestic);
    expect(round(s).space!.expedition!.worlds[0].id).toBe(target.planetId);
  });

  it.each([
    ['surface scale', (s: GameState) => { s.space!.location!.scale = 'surface'; s.space!.location!.pos.y = 3; }, 1],
    ['unknown address', (_s: GameState) => {}, -1],
    ['same address', (_s: GameState) => {}, 0],
    ['beyond range', (_s: GameState) => {}, 16],
    ['away from beacon', (s: GameState) => { s.space!.location!.pos.x = 24.01; }, 1],
    ['no energy', (s: GameState) => { s.space!.ship!.energy = 0; }, 1],
    ['dead ship', (s: GameState) => { s.space!.ship!.health = 0; }, 1],
    ['dead crew', (s: GameState) => { s.player.health = 0; }, 1],
  ] as const)('atomically refuses jump with %s', (_name, prepare, index) => {
    const s = minimalFlight(); toSystem(s); prepare(s);
    const target = starSystems(s.homePlanet!.id)[index]?.id ?? 'unknown-system';
    expect(jumpQuote(s, target).ok).toBe(false); assertRejected(s, () => jumpToSystem(s, target));
  });

  it('map inspection and repeated load do not generate residents or advance unvisited worlds', () => {
    let s = minimalFlight(); toSystem(s); const before = flight(s), domestic = home(s);
    for (const target of starSystems(s.homePlanet!.id)) jumpQuote(s, target.id);
    visitForeignPlanet(s); expect(flight(s)).toEqual(before); s = round(round(s));
    expect(flight(s)).toEqual(before); expect(home(s)).toEqual(domestic);
  });

  it('roundtrips all 32 used systems, every generated specimen and a full checkpoint below the 8 MiB save limit', () => {
    // Capacity regression through public flight/tool methods. Range positions are
    // deliberately prepared; this is neither a native route nor worst-case genomes.
    const s = minimalFlight(), p = s.space!, e = p.expedition!, systems = starSystems(p.homePlanetId);
    const domestic = home(s); toSystem(s);
    for (const system of systems.slice(1)) {
      const stats = shipStats(p.ship!.creation.blueprint);
      advance(s, Math.ceil((stats.energy - p.ship!.energy) / stats.solar)); // Public solar charging, no grant.
      expect(jumpToSystem(s, system.id)).toBe(true); finish(s); toSurface(s);
      const world = activeForeignPlanet(s)!;
      for (const item of world.life) { over(s, item); expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); }
      if (system.index < systems.length - 1) {
        p.location!.pos = { x: 0, y: 7, z: 0 }; // Prepared beacon position, as declared above.
        toSystem(s);
      }
    }
    for (const item of activeForeignPlanet(s)!.life.slice(0, 4)) {
      over(s, item); expect(useSpecimenTool(s, 'collect', item.id)).toBe(true);
    }
    expect(e.worlds).toHaveLength(31); expect(new Set([p.homePlanetId, ...e.worlds.map(world => world.id)]).size).toBe(32);
    expect(e.scans).toHaveLength(396); expect(e.cargo).toHaveLength(4);
    expect(e.worlds.reduce((count, world) => count + world.life.length, e.cargo.length)).toBe(396);
    expect(e.actions).toHaveLength(128); expect(p.log).toHaveLength(128); expect(home(s)).toEqual(domestic);
    makeCheckpoint(s);
    const checkpointBytes = Buffer.byteLength(s.checkpoint!, 'utf8'), exported = serializeGame(s), exportBytes = Buffer.byteLength(exported, 'utf8');
    expect(checkpointBytes).toBeLessThan(8 * 1024 * 1024); expect(exportBytes).toBeLessThan(8 * 1024 * 1024);
    const loaded = parseGame(exported); expect(loaded).toEqual(s);
    const restored = recoverGeneration(loaded);
    expect(restored.space).toEqual({ ...p, notice: expect.any(String) }); expect(home(restored)).toEqual(domestic);
    expect(restored.space!.expedition).toEqual(e);
    console.info(`Prepared 32-system save: ${exportBytes} UTF-8 bytes including checkpoint; checkpoint ${checkpointBytes} bytes.`);
  });
});

describe('C2 unique specimens, origin models and paid tool operations', () => {
  it('scans knowledge once and moves the same physical animal to another world without replacing its origin model', () => {
    let s = foreignSurface(), e = s.space!.expedition!, source = activeForeignPlanet(s)!;
    const genome = generatedNpcGenome(speciesById('bell'), 7); genome.name = 'Přenesený vlastní zvon';
    const own = newCreation(genome, 'Původ z jednotkové knihovny', 'origin-friend', 1);
    // Prepared origin library, before the checkpoint; production arrival uses the saved coast catalogue.
    const custom = createForeignPlanet(starSystems(s.homePlanet!.id)[1], [own]);
    e.worlds[0] = custom; source = custom;
    const item = source.life.find(life => life.taxonKey === 'species:bell')!, original = structuredClone(item);
    const model = structuredClone(spaceLifeSpecies(e, item)); expect(model?.name).toBe(genome.name);
    const originalDesigns = structuredClone(source.designs), domestic = home(s); over(s, item);
    const energy = s.space!.ship!.energy;
    expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); expect(source.life).toContain(item); expect(e.cargo).toEqual([]);
    expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); expect(e.scans).toHaveLength(1);
    expect(useSpecimenTool(s, 'collect', item.id)).toBe(true); expect(e.cargo[0]).toBe(item);
    expect(source.life).not.toContain(item); expect(source.life).toHaveLength(35);
    expect(s.space!.ship!.energy).toBe(energy - 4); assertRejected(s, () => useSpecimenTool(s, 'collect', item.id));
    own.genome.name = 'Nová revize knihovny'; own.revision++;
    expect(spaceLifeSpecies(e, item)).toEqual(model); expect(source.designs).toEqual(originalDesigns);
    toSystem(s); expect(jumpToSystem(s, starSystems(s.homePlanet!.id)[2].id)).toBe(true); finish(s); toSurface(s);
    const destination = activeForeignPlanet(s)!; expect(destination.life).toEqual([]);
    advance(s, 1, { ...EMPTY_INPUT, vertical: -1 });
    expect(useSpecimenTool(s, 'release', item.id)).toBe(true); expect(e.cargo).toEqual([]);
    expect(destination.life[0]).toBe(item);
    expect(item).toMatchObject({ id: original.id, originPlanetId: original.originPlanetId, taxonKey: original.taxonKey,
      heading: original.heading, health: original.health, nutrition: original.nutrition });
    expect(item.pos.y).toBe(foreignGround(destination.seed, item.pos.x, item.pos.z));
    expect(spaceLifeSpecies(e, item)).toEqual(model); assertRejected(s, () => useSpecimenTool(s, 'release', item.id));
    expect(home(s)).toEqual(domestic); s = round(s); e = s.space!.expedition!;
    const imported = e.worlds.find(w => w.id === destination.id)!.life[0];
    expect(spaceLifeSpecies(e, imported)).toEqual(model); expect(lifeName(e, imported)).toBe('Přenesený vlastní zvon');
    expect(e.worlds.find(w => w.id === source.id)!.designs).toEqual(originalDesigns);
    expect(e.worlds.flatMap(w => w.life).filter(life => life.id === item.id)).toHaveLength(1);
  });

  it('saves immediately after scan, collection and release at the checkpoint clock with exact total energy', () => {
    const s = foreignSurface(), item = activeForeignPlanet(s)!.life[0]; over(s, item); makeCheckpoint(s);
    const before = JSON.parse(s.checkpoint!) as GameState, energy = s.space!.ship!.energy, elapsed = s.space!.elapsed;
    for (const kind of ['scan', 'collect', 'release'] as const) {
      expect(useSpecimenTool(s, kind, item.id)).toBe(true); expect(s.space!.elapsed).toBe(elapsed);
      expect(round(s).space).toEqual(s.space);
    }
    expect(expeditionEnergySince(s.space!, before.space!)).toBe(5); expect(s.space!.ship!.energy).toBe(energy - 5);
    expect(s.space!.expedition!.energySpent).toBe(5);
    expect(expeditionCheckpointMatches(s.space!, before.space!)).toBe(true);
    const free = structuredClone(s); free.space!.ship!.energy = energy; rejectSave(free);
    const restored = recoverGeneration(round(s)); expect(restored.space!.expedition).toEqual(before.space!.expedition);
    expect(restored.space!.ship!.energy).toBe(energy); expect(home(restored)).toEqual(home(before));
  });

  it('respects the minimum four-specimen cargo and deterministic range-sorted targets', () => {
    const s = foreignSurface(), e = s.space!.expedition!, world = activeForeignPlanet(s)!;
    const items = world.life.slice(0, 5);
    for (const item of items.slice(0, 4)) {
      over(s, item); expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); expect(useSpecimenTool(s, 'collect', item.id)).toBe(true);
    }
    expect(e.cargo).toHaveLength(4); expect(world.life).toHaveLength(32); over(s, items[4]);
    expect(useSpecimenTool(s, 'scan', items[4].id)).toBe(true);
    expect(specimenQuote(s, 'collect', items[4].id).reason).toContain('plný');
    assertRejected(s, () => useSpecimenTool(s, 'collect', items[4].id));
    const targets = foreignSpecimenTargets(s); expect(targets[0]).toMatchObject({ life: items[4], scanned: true });
    expect(targets.map(t => t.distance)).toEqual([...targets.map(t => t.distance)].sort((a, b) => a - b));
    expect(() => validateExpedition(s.space!)).not.toThrow();
  });

  it('refuses release into a prepared full 96-resident destination without consuming its cargo', () => {
    const s = foreignSurface(), systems = starSystems(s.homePlanet!.id), e = s.space!.expedition!;
    // Prepared capacity stress state: all 108 generated instances remain unique.
    // This setup does not claim those interplanetary transports were played.
    const origins = [1, 4, 7].map(index => createForeignPlanet(systems[index]));
    const destination = createForeignPlanet(systems[2]), all = origins.flatMap(world => world.life);
    destination.life = all.splice(0, 96);
    for (const item of destination.life) item.pos.y = foreignGround(destination.seed, item.pos.x, item.pos.z);
    const carried = all.shift()!;
    for (const origin of origins) origin.life = all.filter(item => item.originPlanetId === origin.id);
    e.worlds = [...origins, destination]; e.cargo = [carried];
    const records: ExpeditionAction[] = [];
    e.scans = [];
    const record = (kind: ExpeditionAction['kind'], planetId: string, item: SpaceLife) => {
      records.push({ serial: records.length + 1, at: s.space!.elapsed, kind, planetId, lifeId: item.id, energyPaid: EXPEDITION_COSTS[kind] });
      if (kind === 'scan') e.scans.push({ lifeId: item.id, planetId, at: s.space!.elapsed });
    };
    for (const item of destination.life) {
      record('scan', item.originPlanetId, item); record('collect', item.originPlanetId, item); record('release', destination.id, item);
    }
    record('scan', carried.originPlanetId, carried); record('collect', carried.originPlanetId, carried);
    e.actions = records.slice(-128); e.nextAction = records.length + 1;
    e.energySpent = records.reduce((sum, action) => sum + action.energyPaid, 0);
    s.space!.location = { scale: 'surface', systemId: destination.systemId, planetId: destination.id,
      pos: { x: 0, y: 3, z: 0 }, heading: 0 };
    expect(() => validateExpedition(s.space!)).not.toThrow();
    expect(specimenQuote(s, 'release', carried.id).reason).toContain('96');
    assertRejected(s, () => useSpecimenTool(s, 'release', carried.id));
    expect(e.cargo[0]).toBe(carried); expect(destination.life).toHaveLength(96);
  });

  it.each([
    ['not scanned', 'collect', (_s: GameState) => {}],
    ['outside scanner range', 'scan', (s: GameState) => { s.space!.location!.pos.x = 80; }],
    ['too high to collect', 'collect', (s: GameState) => {
      const item = activeForeignPlanet(s)!.life[0]; expect(useSpecimenTool(s, 'scan', item.id)).toBe(true);
      s.space!.location!.pos.y = 26;
    }],
    ['no energy', 'scan', (s: GameState) => { s.space!.ship!.energy = 0; }],
    ['dead ship', 'scan', (s: GameState) => { s.space!.ship!.health = 0; }],
    ['dead player', 'scan', (s: GameState) => { s.player.health = 0; }],
    ['wrong scale', 'scan', (s: GameState) => { s.space!.location!.scale = 'orbit'; }],
    ['unknown tool kind', 'teleport', (_s: GameState) => {}],
  ] as const)('atomically rejects specimen operation: %s', (_name, kind, prepare) => {
    const s = foreignSurface(), item = activeForeignPlanet(s)!.life[0]; over(s, item); prepare(s);
    assertRejected(s, () => useSpecimenTool(s, kind as ExpeditionAction['kind'], item.id));
  });

  it('rejects tools during descent, unknown instances, high release and release into the frozen home', () => {
    const s = foreignSurface(), item = activeForeignPlanet(s)!.life[0]; over(s, item);
    assertRejected(s, () => useSpecimenTool(s, 'scan', 'missing-life'));
    expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); expect(useSpecimenTool(s, 'collect', item.id)).toBe(true);
    s.space!.location!.pos.y = 7; assertRejected(s, () => useSpecimenTool(s, 'release', item.id));
    s.space!.location!.pos = { x: 0, y: 20, z: 0 }; expect(changeSpaceScale(s, 'up')).toBe(true);
    assertRejected(s, () => useSpecimenTool(s, 'release', item.id)); finish(s); toSystem(s);
    expect(jumpToSystem(s, starSystems(s.homePlanet!.id)[0].id)).toBe(true); finish(s); toSurface(s);
    assertRejected(s, () => useSpecimenTool(s, 'release', item.id)); expect(s.space!.expedition!.cargo[0].id).toBe(item.id);
  });

  it('keeps every inactive world and carried instance in stasis while only the visited surface clock advances', () => {
    const s = foreignSurface(), first = activeForeignPlanet(s)!, item = first.life[0]; over(s, item);
    useSpecimenTool(s, 'scan', item.id); useSpecimenTool(s, 'collect', item.id);
    toSystem(s);
    expect(jumpToSystem(s, starSystems(s.homePlanet!.id)[2].id)).toBe(true); finish(s); toSurface(s);
    const inactive = structuredClone(first), cargo = structuredClone(s.space!.expedition!.cargo), current = activeForeignPlanet(s)!;
    const elapsed = current.elapsed; advance(s, 1);
    expect(current.elapsed).toBeCloseTo(elapsed + 1, 8); expect(first).toEqual(inactive);
    expect(s.space!.expedition!.cargo).toEqual(cargo);
    toSystem(s); const all = structuredClone(s.space!.expedition!.worlds); advance(s, 2);
    expect(s.space!.expedition!.worlds).toEqual(all);
  });
});

describe('C2 strict expedition saves and immutable checkpoint evidence', () => {
  it.each([
    ['extra extension key', (e: any) => { e.money = 5; }],
    ['unsupported version', (e: any) => { e.version = 2; }],
    ['unsupported generator', (e: any) => { e.generator = 2; }],
    ['negative energy counter', (e: any) => { e.energySpent = -1; }],
    ['fractional energy counter', (e: any) => { e.energySpent = .5; }],
    ['oversized energy counter', (e: any) => { e.energySpent = 1e12 + 1; }],
    ['counter inconsistent with full ledger', (e: any) => { e.energySpent++; }],
    ['duplicate world', (e: any) => { e.worlds.push(structuredClone(e.worlds[0])); }],
    ['changed seed', (e: any) => { e.worlds[0].seed++; }],
    ['wrong system', (e: any) => { e.worlds[0].systemId = 'another'; }],
    ['lost life', (e: any) => { e.worlds[0].life.pop(); }],
    ['duplicate life', (e: any) => { e.worlds[0].life.push(structuredClone(e.worlds[0].life[0])); }],
    ['wrong taxon', (e: any) => { e.worlds[0].life[0].taxonKey = 'species:crest'; }],
    ['unknown origin', (e: any) => { e.worlds[0].life[0].originPlanetId = 'other'; }],
    ['noncanonical identity', (e: any) => { e.worlds[0].life[0].id = `${e.worlds[0].id}:life-01`; }],
    ['dead specimen', (e: any) => { e.worlds[0].life[0].health = 0; }],
    ['overfed specimen', (e: any) => { e.worlds[0].life[0].nutrition = 1.1; }],
    ['wrong surface height', (e: any) => { e.worlds[0].life[0].pos.y = .349; }],
    ['unsafe origin genome', (e: any) => { e.worlds[0].designs[0].creation.genome.parts = []; }],
    ['duplicate scan', (e: any) => { e.scans.push(structuredClone(e.scans[0])); }],
    ['future scan', (e: any) => { e.scans[0].at = 1e10; }],
    ['unpaid action', (e: any) => { e.actions[0].energyPaid = 0; }],
    ['unknown action', (e: any) => { e.actions[0].kind = 'teleport'; }],
    ['lost action prefix', (e: any) => { e.actions.shift(); }],
  ] as const)('rejects %s in live and independently decoded checkpoint', (_name, mutate) => {
    const s = foreignSurface(), item = activeForeignPlanet(s)!.life[0]; over(s, item); useSpecimenTool(s, 'scan', item.id); makeCheckpoint(s);
    const bad = structuredClone(s); mutate(bad.space!.expedition); expect(() => validateExpedition(bad.space!)).toThrow(); rejectSave(bad);
    const checkpointBad = structuredClone(s), cp = JSON.parse(s.checkpoint!) as GameState;
    mutate(cp.space!.expedition); checkpointBad.checkpoint = JSON.stringify(cp); rejectSave(checkpointBad);
  });

  it('rejects deleting the opt-in branch, rewriting models or changing conserved health and nutrition against checkpoint', () => {
    const s = foreignSurface(); makeCheckpoint(s);
    const missing = structuredClone(s); delete missing.space!.expedition; rejectSave(missing);
    for (const mutate of [
      (bad: GameState) => { bad.space!.expedition!.worlds[0].designs[0].creation.genome.name = 'Replaced body'; },
      (bad: GameState) => { bad.space!.expedition!.worlds[0].life[0].health -= 1; },
      (bad: GameState) => { bad.space!.expedition!.worlds[0].life[0].nutrition -= .1; },
    ]) {
      const bad = structuredClone(s); mutate(bad);
      expect(expeditionCheckpointMatches(bad.space!, s.space!)).toBe(false); rejectSave(bad);
    }
  });

  it('rejects moving an already scanned instance into cargo without a paid collect record', () => {
    const s = foreignSurface(), world = activeForeignPlanet(s)!, item = world.life[0]; over(s, item);
    expect(useSpecimenTool(s, 'scan', item.id)).toBe(true); makeCheckpoint(s);
    const before = JSON.parse(s.checkpoint!) as GameState;
    const expedition = s.space!.expedition!;
    if (expedition.version !== 1) throw new Error('This historical prepared regression requires expedition v1.');
    world.life.splice(world.life.indexOf(item), 1); expedition.cargo.push(item);
    expect(() => validateExpedition(s.space!)).toThrow();
    expect(expeditionCheckpointMatches(s.space!, before.space!)).toBe(false); rejectSave(s);
  });

  it('binds first-scan metadata to its actual world and time in both full history and the checkpoint suffix', () => {
    const s = foreignSurface(), item = activeForeignPlanet(s)!.life[0]; over(s, item); makeCheckpoint(s);
    const before = JSON.parse(s.checkpoint!) as GameState;
    useSpecimenTool(s, 'scan', item.id); toSystem(s);
    expect(jumpToSystem(s, starSystems(s.homePlanet!.id)[2].id)).toBe(true); finish(s); toSurface(s);
    for (const mutate of [
      (bad: GameState) => { bad.space!.expedition!.scans[0].planetId = activeForeignPlanet(bad)!.id; },
      (bad: GameState) => { bad.space!.expedition!.scans[0].at -= .01; },
    ]) {
      const bad = structuredClone(s); mutate(bad);
      expect(() => validateExpedition(bad.space!)).toThrow();
      expect(expeditionCheckpointMatches(bad.space!, before.space!)).toBe(false); rejectSave(bad);
    }
  });

  it('accounts for 129 paid scans in one clock step after log rollover without manufacturing energy', () => {
    // The 2.5× engine is a legal paid design: cost290, mass24.875, energy130.
    // Recharge uses the public clock; no energy or amber is injected.
    const s = foreignSurface(1, 2.5), p = s.space!, e = p.expedition!;
    expect(p.ship!.purchase.paid).toBe(290); expect(shipStats(p.ship!.creation.blueprint).energy).toBe(130);
    advance(s, 30); expect(p.ship!.energy).toBe(130);
    const item = activeForeignPlanet(s)!.life[0]; over(s, item); makeCheckpoint(s);
    const before = JSON.parse(s.checkpoint!) as GameState, elapsed = p.elapsed;
    for (let i = 0; i < 129; i++) expect(useSpecimenTool(s, 'scan', item.id)).toBe(true);
    expect(p.elapsed).toBe(elapsed); expect(p.ship!.energy).toBe(1); expect(e.energySpent).toBe(129);
    expect(e.actions).toHaveLength(128); expect(e.actions[0].serial).toBe(2); expect(e.scans).toHaveLength(1);
    expect(expeditionEnergySince(p, before.space!)).toBe(129);
    expect(expeditionCheckpointMatches(p, before.space!)).toBe(true); expect(round(s).space).toEqual(p);
    for (const counter of [128, 131]) {
      const bad = structuredClone(s); bad.space!.expedition!.energySpent = counter;
      expect(() => validateExpedition(bad.space!)).toThrow();
      expect(expeditionCheckpointMatches(bad.space!, before.space!)).toBe(false); rejectSave(bad);
    }
    //130 is within standalone omitted-action bounds (the missing action could cost2),
    // but contradicts the exact same-clock ship balance against this checkpoint.
    const balanceMismatch = structuredClone(s); balanceMismatch.space!.expedition!.energySpent = 130;
    expect(() => validateExpedition(balanceMismatch.space!)).not.toThrow(); rejectSave(balanceMismatch);
  });

  it('preserves closed scan/action prefixes and refuses contradictory transfer evidence', () => {
    const s = foreignSurface(), item = activeForeignPlanet(s)!.life[0]; over(s, item);
    useSpecimenTool(s, 'scan', item.id); makeCheckpoint(s); const before = JSON.parse(s.checkpoint!) as GameState;
    useSpecimenTool(s, 'collect', item.id); expect(expeditionCheckpointMatches(s.space!, before.space!)).toBe(true);
    const swapped = structuredClone(s); swapped.space!.expedition!.actions.at(-1)!.kind = 'release';
    expect(expeditionCheckpointMatches(swapped.space!, before.space!)).toBe(false); rejectSave(swapped);
    const scanChanged = structuredClone(s); scanChanged.space!.expedition!.scans[0].at -= .01;
    expect(expeditionCheckpointMatches(scanChanged.space!, before.space!)).toBe(false); rejectSave(scanChanged);
  });

  it('bounds repeat-scan history while retaining one known instance and requiring complete same-time energy evidence', () => {
    const s = foreignSurface(), item = activeForeignPlanet(s)!.life[0]; over(s, item);
    useSpecimenTool(s, 'scan', item.id); makeCheckpoint(s); const before = JSON.parse(s.checkpoint!) as GameState;
    for (let i = 0; i < 130; i++) {
      advance(s, 1); over(s, item); expect(useSpecimenTool(s, 'scan', item.id)).toBe(true);
    }
    const e = s.space!.expedition!; expect(e.actions).toHaveLength(128); expect(e.actions[0].serial).toBe(4);
    expect(e.scans).toHaveLength(1); expect(e.cargo).toEqual([]); expect(activeForeignPlanet(s)!.life).toHaveLength(36);
    expect(e.energySpent).toBe(131);
    expect(expeditionCheckpointMatches(s.space!, before.space!)).toBe(true);
    // Retained action timestamps span real simulation seconds, so this is not a same-clock debit.
    expect(expeditionEnergySince(s.space!, before.space!)).toBeNull(); expect(round(s).space!.expedition).toEqual(e);
    expect(EXPEDITION_COSTS).toEqual({ scan: 1, collect: 2, release: 2 });
  });
});
