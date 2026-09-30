import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { starSystems } from '../src/game/galaxy';
import { parseGame, serializeGame } from '../src/game/persistence';
import { activateBiosphere, activatePlanetBiosphere, bandPopulation, climateToolQuote, enableBiosphere,
  LIFE_ROLES, livingExpedition, livingPlanet, newOriginDemography, roleIndex, setClimateTool, stepPlanetBiosphere } from '../src/game/space-biosphere';
import type { LivingExpedition, LivingPlanet, LivingSpecimen } from '../src/game/space-biosphere-types';
import { climateEnergySpent, newClimateWork, type ClimateTool } from '../src/game/space-climate';
import { jumpToSystem, useSpecimenTool } from '../src/game/space-expedition';
import { biosphereCheckpointMatches, validateBiosphere } from '../src/game/space-biosphere-validation';
import { changeSpaceScale } from '../src/game/space';
import { createForeignPlanet, LIFE_PROFILES } from '../src/game/space-life';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState, type Input } from '../src/game/types';

const c2 = () => parseGame(readFileSync('tests/fixtures/space/native-c2-carried-life.save.json', 'utf8'));
const legacy = (s: ReturnType<typeof c2>) => {
  const expedition = s.space!.expedition!;
  if (expedition.version !== 1) throw new Error('Historical C2 parsing must retain expedition v1.');
  return expedition;
};
const oldLife = ({ habitat: _habitat, ...life }: LivingSpecimen) => life;
const oldWorld = ({ biosphere: _biosphere, life, ...world }: LivingPlanet) => ({ ...world, life: life.map(oldLife) });
const oldExpedition = ({ biosphere: _biosphere, version: _version, worlds, cargo, ...expedition }: LivingExpedition) => ({
  ...expedition, version: 1, worlds: worlds.map(oldWorld), cargo: cargo.map(oldLife),
});
const round = (s: GameState) => parseGame(serializeGame(s));
const domestic = (s: GameState) => { const { space: _space, checkpoint: _checkpoint, ...home } = s; return structuredClone(home); };
const withoutNotice = (s: GameState) => { const copy = structuredClone(s); if (copy.space) copy.space.notice = ''; return copy; };
function living() { const s = c2(); enableBiosphere(s); return s; }
function advance(s: GameState, seconds: number, input: Input = EMPTY_INPUT) {
  for (let i = 0; i < Math.ceil(seconds * 30); i++) step(s, input, 1 / 30);
}
function finish(s: GameState) {
  for (let i = 0; i < 182 && s.space!.leg; i++) step(s, EMPTY_INPUT, 1 / 30);
  expect(s.space!.leg).toBeNull();
}
function refuseSave(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}

describe('C3 explicit biosphere activation without historical invention', () => {
  it('keeps actual C2 specimens, positions, cargo, origin models and paid history unchanged when adding habitats', () => {
    const s = c2(), old = legacy(s);
    expect(old.version).toBe(1);
    const before = structuredClone(old), savedCheckpoint = s.checkpoint, savedHome = JSON.stringify({ ...s, space: undefined });
    const worlds = [...old.worlds], residents = worlds.flatMap(world => world.life), cargo = [...old.cargo], positions = [...residents, ...cargo].map(life => life.pos);
    const catalogs = worlds.map(world => world.designs), actions = old.actions, scans = old.scans;
    const upgraded = activateBiosphere(old, s.space!.homePlanetId, s.space!.elapsed);
    expect(upgraded).toBe(old); expect(upgraded.version).toBe(2); expect(oldExpedition(upgraded)).toEqual(before);
    expect(upgraded.worlds).toEqual(worlds); expect(upgraded.cargo[0]).toBe(cargo[0]);
    for (const [index, world] of upgraded.worlds.entries()) expect(world).toBe(worlds[index]);
    for (const [index, life] of upgraded.worlds.flatMap(world => world.life).entries()) expect(life).toBe(residents[index]);
    expect(upgraded.actions).toBe(actions); expect(upgraded.scans).toBe(scans);
    for (const [index, life] of [...upgraded.worlds.flatMap(world => world.life), ...upgraded.cargo].entries()) expect(life.pos).toBe(positions[index]);
    for (const [index, world] of upgraded.worlds.entries()) expect(world.designs).toBe(catalogs[index]);
    expect(upgraded.biosphere).toMatchObject({ version: 1, activatedAt: s.space!.elapsed, activatedAction: before.nextAction,
      tool: 'off', toolPlanetId: null, paidScans: 1, paidTransfers: 1 });
    expect(upgraded.biosphere.origins).toEqual([newOriginDemography(worlds[0].id)]);
    for (const world of upgraded.worlds) {
      expect(world.biosphere).toEqual({ initial: { temperature: world.temperature, atmosphere: world.atmosphere },
        activatedElapsed: world.elapsed, work: newClimateWork(), stableFor: [0, 0, 0] });
      for (const life of world.life) expect(life.habitat).toMatchObject({ reproduction: 0, sinceHunt: 120, birth: null });
    }
    expect(upgraded.cargo[0].habitat).toEqual({ band: 2, reproduction: 0, sinceHunt: 120, birth: null });
    expect(s.checkpoint).toBe(savedCheckpoint); expect(JSON.stringify({ ...s, space: undefined })).toBe(savedHome);
  });

  it('assigns exactly two original representatives of every ecological role to each of three bands', () => {
    const system = starSystems('home-biosphere')[1], source = createForeignPlanet(system), original = structuredClone(source);
    const world = activatePlanetBiosphere(source);
    expect(world).toBe(source); expect(oldWorld(world)).toEqual(original); expect(world.life).toHaveLength(36);
    expect(LIFE_ROLES).toEqual(['small-plant', 'medium-plant', 'large-plant', 'herbivore-a', 'herbivore-b', 'predator']);
    const ids = new Set<string>();
    for (const band of [1, 2, 3]) for (const [index, profile] of LIFE_PROFILES.entries()) {
      const members = world.life.filter(life => life.habitat.band === band && roleIndex(life) === index);
      expect(members).toHaveLength(2);
      for (const life of members) { expect(life.taxonKey).toBe(profile.key); expect(ids.has(life.id)).toBe(false); ids.add(life.id); }
    }
    expect(ids.size).toBe(36); expect(roleIndex({ taxonKey: 'missing-role' })).toBe(-1);
    expect(world.biosphere.stableFor).toEqual([0, 0, 0]);
  });

  it('keeps founder bands stable when earlier peers are absent or residents are reordered', () => {
    const source = createForeignPlanet(starSystems('home-stable-bands')[1]);
    const original = activatePlanetBiosphere(structuredClone(source));
    const expected = new Map(original.life.map(life => [life.id, life.habitat.band]));
    source.life.splice(0, 7); source.life.reverse();
    const remaining = source.life.map(life => life.id), partial = activatePlanetBiosphere(source);
    expect(partial.life.map(life => life.id)).toEqual(remaining);
    for (const life of partial.life) expect(life.habitat.band).toBe(expected.get(life.id));
    expect(partial.life).toHaveLength(29); expect(partial.biosphere.stableFor).toEqual([0, 0, 0]);
  });

  it('does not fill an already depleted source, heal a passenger or give a barren destination fictitious ancestry', () => {
    const s = c2(), old = legacy(s), systems = starSystems(s.space!.homePlanetId);
    // Prepared loss of health/nutrition isolates migration; no biological progress is claimed.
    old.cargo[0].health = 71; old.cargo[0].nutrition = .42;
    old.worlds.push(createForeignPlanet(systems[2]));
    const before = structuredClone(old), upgraded = activateBiosphere(old, s.space!.homePlanetId, s.space!.elapsed);
    expect(oldExpedition(upgraded)).toEqual(before); expect(upgraded.worlds[0].life).toHaveLength(35);
    expect(upgraded.cargo).toHaveLength(1); expect(upgraded.cargo[0]).toMatchObject({ health: 71, nutrition: .42 });
    expect(upgraded.worlds[1].life).toEqual([]); expect(upgraded.worlds[1].designs).toEqual(before.worlds[1].designs);
    expect(upgraded.worlds[1].biosphere.initial).toEqual({ temperature: .8, atmosphere: -.7 });
    expect(upgraded.biosphere.origins.map(origin => origin.planetId)).toEqual([upgraded.worlds[0].id]);
    for (const origin of upgraded.biosphere.origins) {
      expect(origin.births).toEqual([0, 0, 0, 0, 0, 0]); expect(origin.deaths).toEqual([0, 0, 0, 0, 0, 0]); expect(origin.founderDeaths).toEqual([]);
    }
  });

  it('is idempotent even after existing habitats, climate work and active tool acquire state', () => {
    const s = c2(), upgraded = activateBiosphere(s.space!.expedition!, s.space!.homePlanetId, s.space!.elapsed);
    upgraded.biosphere.tool = 'cool'; upgraded.biosphere.toolPlanetId = upgraded.worlds[0].id;
    upgraded.worlds[0].biosphere.stableFor[1] = 12;
    upgraded.worlds[0].life[0].habitat.reproduction = .3; upgraded.cargo[0].habitat.sinceHunt = 9;
    const before = structuredClone(upgraded), firstHabitat = upgraded.worlds[0].life[0].habitat;
    expect(activateBiosphere(upgraded, 'different-unused-home', s.space!.elapsed + 100)).toBe(upgraded);
    expect(activatePlanetBiosphere(upgraded.worlds[0])).toBe(upgraded.worlds[0]);
    expect(upgraded).toEqual(before); expect(upgraded.worlds[0].life[0].habitat).toBe(firstHabitat);
  });

  it('uses independent counter arrays and climate receipts for each origin and planet', () => {
    const s = c2(), old = legacy(s), systems = starSystems(s.space!.homePlanetId);
    old.worlds.push(createForeignPlanet(systems[4]));
    const upgraded = activateBiosphere(old, s.space!.homePlanetId, s.space!.elapsed), [a, b] = upgraded.biosphere.origins;
    a.births[0]++; a.deaths[1]++; a.founderDeaths.push(2);
    upgraded.worlds[0].biosphere.work.cool += .1; upgraded.worlds[0].biosphere.stableFor[0] = 7;
    expect(a.births).toEqual([1, 0, 0, 0, 0, 0]); expect(a.deaths).toEqual([0, 1, 0, 0, 0, 0]);
    expect(b).toEqual(newOriginDemography(upgraded.worlds[1].id));
    expect(upgraded.worlds[1].biosphere.work).toEqual(newClimateWork()); expect(upgraded.worlds[1].biosphere.stableFor).toEqual([0, 0, 0]);
  });

  it('recovers exact paid scan/transfer counters after the original C2 action log has rolled over', () => {
    const s = c2(), old = legacy(s), item = old.worlds[0].life[0];
    // Explicit unit range setup. Energy remains paid from actual solar runtime;
    // neither the C2 source bytes nor the real action ledger are fabricated.
    s.space!.location!.pos = { x: item.pos.x, y: 3, z: item.pos.z };
    for (let i = 0; i < 130; i++) {
      for (let frame = 0; frame < 30; frame++) step(s, EMPTY_INPUT, 1 / 30);
      expect(useSpecimenTool(s, 'scan', item.id)).toBe(true);
      if (i < 9) {
        expect(useSpecimenTool(s, 'collect', item.id)).toBe(true);
        expect(useSpecimenTool(s, 'release', item.id)).toBe(true);
      }
    }
    expect(old.actions).toHaveLength(128); expect(old.actions[0].serial).toBeGreaterThan(1);
    expect(old.nextAction - 1).toBe(150); expect(old.energySpent).toBe(169);
    const before = structuredClone(old), upgraded = activateBiosphere(old, s.space!.homePlanetId, s.space!.elapsed);
    expect(upgraded.biosphere.paidScans).toBe(131); expect(upgraded.biosphere.paidTransfers).toBe(19);
    expect(upgraded.biosphere.paidScans + 2 * upgraded.biosphere.paidTransfers).toBe(upgraded.energySpent);
    expect(oldExpedition(upgraded)).toEqual(before); expect(upgraded.actions).toHaveLength(128);
  });
});

describe('C3 active-world climate and complete checkpoint integration', () => {
  it('explicitly upgrades live C2 and its older pre-purchase checkpoint from their own independent clocks', () => {
    const s = c2(), before = structuredClone(s), cpBefore = JSON.parse(s.checkpoint!) as GameState;
    expect(round(s)).toEqual(s); enableBiosphere(s);
    const e = livingExpedition(s)!, cp = JSON.parse(s.checkpoint!) as GameState, ce = livingExpedition(cp)!;
    expect(oldExpedition(e)).toEqual(before.space!.expedition);
    expect(oldExpedition(ce)).toEqual(cpBefore.space!.expedition);
    expect(e.biosphere).toMatchObject({ activatedAt: before.space!.elapsed, activatedAction: 3 });
    expect(ce.biosphere).toMatchObject({ activatedAt: 0, activatedAction: 1, paidScans: 0, paidTransfers: 0 });
    expect(cp.space!.ship).toBeNull(); expect(ce.worlds).toEqual([]); expect(ce.cargo).toEqual([]);
    expect(domestic(s)).toEqual(domestic(before)); expect(domestic(cp)).toEqual(domestic(cpBefore));
    const once = structuredClone(s); enableBiosphere(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
    expect(recoverGeneration(s).space).toEqual(cp.space);
  });

  it('activates an earlier complete C2 flight checkpoint without reassigning collected or surviving founder bands', () => {
    const s = c2(); makeCheckpoint(s); const cpBefore = JSON.parse(s.checkpoint!) as GameState;
    advance(s, 1); const oldLive = structuredClone(s.space!.expedition); enableBiosphere(s);
    const e = livingExpedition(s)!, cp = JSON.parse(s.checkpoint!) as GameState, ce = livingExpedition(cp)!;
    expect(e.biosphere.activatedAt).toBeGreaterThan(ce.biosphere.activatedAt);
    expect(e.worlds[0].biosphere.activatedElapsed).toBeGreaterThan(ce.worlds[0].biosphere.activatedElapsed);
    expect(oldExpedition(e)).toEqual(oldLive); expect(oldExpedition(ce)).toEqual(cpBefore.space!.expedition);
    expect(e.cargo[0].habitat.band).toBe(ce.cargo[0].habitat.band);
    expect(e.worlds[0].life.map(life => [life.id, life.habitat.band])).toEqual(ce.worlds[0].life.map(life => [life.id, life.habitat.band]));
    expect(biosphereCheckpointMatches(s.space!, cp.space!)).toBe(true); expect(round(s)).toEqual(s);
    expect(recoverGeneration(round(s)).space).toEqual({ ...cp.space!, notice: expect.any(String) });
  });

  it('does not opt a C1 campaign into a missing expedition branch or manufacture space content', () => {
    const s = parseGame(readFileSync('tests/fixtures/space/native-c1-in-flight.save.json', 'utf8')), before = structuredClone(s);
    enableBiosphere(s); expect(s).toEqual(before); expect(livingExpedition(s)).toBeNull();
    expect(climateToolQuote(s, 'warm').ok).toBe(false);
    expect(setClimateTool(s, 'warm')).toBe(false); expect(withoutNotice(s)).toEqual(withoutNotice(before));
  });

  it('charges actual active-world work through the normal simulation step while keeping all domestic and carried life unchanged', () => {
    const s = living(), baseline = structuredClone(s), home = domestic(s), e = livingExpedition(s)!, world = livingPlanet(s)!;
    const cargo = structuredClone(e.cargo), life = structuredClone(world.life), elapsed = world.elapsed;
    const initialEnergy = s.space!.ship!.energy;
    expect(setClimateTool(s, 'warm')).toBe(true); expect(s.space!.ship!.energy).toBe(initialEnergy);
    expect(world.biosphere.work).toEqual(newClimateWork()); makeCheckpoint(s);
    advance(s, 1); advance(baseline, 1);
    expect(world.temperature).toBeCloseTo(.03, 10); expect(world.atmosphere).toBe(0);
    expect(world.elapsed).toBeCloseTo(elapsed + 1, 10); expect(world.biosphere.work.warm).toBeCloseTo(.03, 10);
    expect(climateEnergySpent(world.biosphere.work)).toBeCloseTo(2, 10);
    expect(baseline.space!.ship!.energy - s.space!.ship!.energy).toBeCloseTo(2, 9);
    expect(world.life).toEqual(life); expect(e.cargo).toEqual(cargo); expect(domestic(s)).toEqual(home);
    expect(round(s)).toEqual(s);
    const frozen = structuredClone(s); expect(round(round(s))).toEqual(frozen); // Loading cannot perform more climate work.
    const restored = recoverGeneration(round(s)), cp = JSON.parse(s.checkpoint!) as GameState;
    expect(restored.space).toEqual({ ...cp.space!, notice: expect.any(String) }); expect(domestic(restored)).toEqual(home);
  });

  it('stops a paid tool at exhaustion or the axis boundary and never charges OFF time', () => {
    const s = living(), world = livingPlanet(s)!;
    // Prepared resource/axis isolation, not earned fuel or played climate evidence.
    s.space!.ship!.energy = .01; expect(setClimateTool(s, 'warm')).toBe(true); stepPlanetBiosphere(s, 1 / 30);
    expect(s.space!.ship!.energy).toBeCloseTo(0, 12); expect(world.temperature).toBeCloseTo(.00015, 12);
    expect(livingExpedition(s)!.biosphere).toMatchObject({ tool: 'off', toolPlanetId: null });
    const empty = structuredClone(s); stepPlanetBiosphere(s, 1 / 30); expect(s).toEqual(empty);
    s.space!.ship!.energy = 1; world.temperature = .9998; world.biosphere.initial.temperature = .9998;
    world.biosphere.work = newClimateWork(); expect(setClimateTool(s, 'warm')).toBe(true); stepPlanetBiosphere(s, 1 / 30);
    expect(world.temperature).toBe(1); expect(1 - s.space!.ship!.energy).toBeCloseTo(.0002 * 2 / .03, 12);
    expect(livingExpedition(s)!.biosphere).toMatchObject({ tool: 'off', toolPlanetId: null });
    expect(climateToolQuote(s, 'warm').ok).toBe(false); expect(climateToolQuote(s, 'cool').ok).toBe(true);
  });

  it.each([
    ['dead crew', (s: GameState) => { s.player.health = 0; }],
    ['dead ship', (s: GameState) => { s.space!.ship!.health = 0; }],
    ['death reason', (s: GameState) => { s.deathReason = 'Prepared test'; }],
    ['empty battery', (s: GameState) => { s.space!.ship!.energy = 0; }],
    ['orbital scale', (s: GameState) => { s.space!.location!.scale = 'orbit'; }],
    ['domestic surface', (s: GameState) => { s.space!.location!.planetId = s.space!.homePlanetId; s.space!.location!.systemId = `${s.space!.homePlanetId}:system`; }],
  ] as const)('refuses active climate on %s atomically but still permits OFF', (_name, prepare) => {
    const s = living(); prepare(s); const before = withoutNotice(s);
    expect(climateToolQuote(s, 'warm').ok).toBe(false); expect(setClimateTool(s, 'warm')).toBe(false);
    expect(withoutNotice(s)).toEqual(before); expect(setClimateTool(s, 'off')).toBe(true);
    expect(livingExpedition(s)!.biosphere).toMatchObject({ tool: 'off', toolPlanetId: null });
  });

  it('rejects unknown tools and invalid step times without altering climate receipts or energy', () => {
    const s = living(), before = withoutNotice(s);
    expect(setClimateTool(s, 'teleport' as ClimateTool)).toBe(false); expect(withoutNotice(s)).toEqual(before);
    expect(setClimateTool(s, 'cool')).toBe(true);
    const selected = structuredClone(s);
    for (const dt of [0, -1, NaN, Infinity]) { stepPlanetBiosphere(s, dt); expect(s).toEqual(selected); }
  });

  it('turns OFF when a normal departure starts and keeps both planets frozen during a jump', () => {
    const s = living(), world = livingPlanet(s)!, domesticBefore = domestic(s);
    advance(s, 2, { ...EMPTY_INPUT, vertical: 1 }); expect(setClimateTool(s, 'warm')).toBe(true);
    advance(s, 1); const climate = [world.temperature, world.atmosphere], work = structuredClone(world.biosphere.work);
    expect(changeSpaceScale(s, 'up')).toBe(true);
    expect(livingExpedition(s)!.biosphere).toMatchObject({ tool: 'off', toolPlanetId: null });
    expect(setClimateTool(s, 'cool')).toBe(false); finish(s);
    expect(changeSpaceScale(s, 'up')).toBe(true); finish(s);
    const target = starSystems(s.space!.homePlanetId)[2]; expect(jumpToSystem(s, target.id)).toBe(true); finish(s);
    expect([world.temperature, world.atmosphere]).toEqual(climate); expect(world.biosphere.work).toEqual(work);
    for (const _scale of ['orbit', 'surface']) { expect(changeSpaceScale(s, 'down')).toBe(true); finish(s); }
    const destination = livingPlanet(s)!;
    expect(destination.id).toBe(target.planetId); expect(destination.life).toEqual([]);
    expect(destination.biosphere).toMatchObject({ initial: { temperature: .8, atmosphere: -.7 }, work: newClimateWork(), stableFor: [0, 0, 0] });
    const source = structuredClone(world); expect(setClimateTool(s, 'thicken')).toBe(true); advance(s, 1);
    expect(world).toEqual(source); expect(destination.atmosphere).toBeCloseTo(-.67, 9);
    expect(domestic(s)).toEqual(domesticBefore); expect(round(s)).toEqual(s);
  });

  it('counts living founders by one assigned band without treating complete roles as already stable', () => {
    const s = living(), world = livingPlanet(s)!, populations = [1, 2, 3].map(band => bandPopulation(world, band as 1 | 2 | 3));
    expect(populations).toEqual([[2, 2, 2, 2, 2, 2], [2, 2, 2, 2, 1, 2], [2, 2, 2, 2, 2, 2]]);
    expect(populations.flat().reduce((sum, count) => sum + count, 0)).toBe(world.life.length);
    expect(world.biosphere.stableFor).toEqual([0, 0, 0]);
  });

  it('records a selected release band and exact cumulative payment while preserving the same physical specimen', () => {
    const s = living(), e = livingExpedition(s)!, item = e.cargo[0], original = structuredClone(item);
    const energy = s.space!.ship!.energy; makeCheckpoint(s);
    expect(useSpecimenTool(s, 'release', item.id, 3)).toBe(true);
    expect(livingPlanet(s)!.life).toContain(item); expect(item.habitat.band).toBe(3); expect(e.cargo).toEqual([]);
    expect(e.actions.at(-1)).toMatchObject({ kind: 'release', band: 3, energyPaid: 2, serial: e.biosphere.activatedAction });
    expect(e.biosphere).toMatchObject({ paidScans: 1, paidTransfers: 2 }); expect(e.energySpent).toBe(5);
    expect(s.space!.ship!.energy).toBe(energy - 2); expect(oldLife(item)).toMatchObject({ ...oldLife(original), pos: expect.any(Object) });
    expect(round(s).space!.expedition).toEqual(e);
    expect(useSpecimenTool(s, 'collect', item.id)).toBe(true); expect(e.cargo[0]).toBe(item); expect(item.habitat.band).toBe(3);
    const held = withoutNotice(s);
    for (const band of [0, 4, 1.5, NaN]) {
      expect(useSpecimenTool(s, 'release', item.id, band as 1)).toBe(false); expect(withoutNotice(s)).toEqual(held);
    }
    expect(useSpecimenTool(s, 'release', item.id, 1)).toBe(true); expect(item.habitat.band).toBe(1);
    expect(e.biosphere).toMatchObject({ paidScans: 1, paidTransfers: 4 }); expect(e.energySpent).toBe(9);
    expect(round(s).space!.expedition).toEqual(e);
  });

  it.each([['scan', 1], ['collect', 2]] as const)('switches climate OFF when a same-clock %s consumes the final %s energy', (kind, energy) => {
    const s = living(), world = livingPlanet(s)!, e = livingExpedition(s)!, item = world.life[0];
    // Explicit unit range/battery boundary; these values are not a native-play claim.
    s.space!.location!.pos = { x: item.pos.x, y: 3, z: item.pos.z };
    if (kind === 'collect') expect(useSpecimenTool(s, 'scan', item.id)).toBe(true);
    s.space!.ship!.energy = energy;
    expect(setClimateTool(s, 'warm')).toBe(true); makeCheckpoint(s);
    const elapsed = s.space!.elapsed, climate = [world.temperature, world.atmosphere], home = domestic(s);
    expect(useSpecimenTool(s, kind, item.id)).toBe(true);
    expect(s.space!.elapsed).toBe(elapsed); expect(s.space!.ship!.energy).toBe(0);
    expect(e.biosphere).toMatchObject({ tool: 'off', toolPlanetId: null });
    expect(world.biosphere.work).toEqual(newClimateWork()); expect([world.temperature, world.atmosphere]).toEqual(climate);
    expect(domestic(s)).toEqual(home); expect(round(s)).toEqual(s);
  });

  it('keeps actual pre-activation C2 release rows unextended and separates them by action serial', () => {
    const s = parseGame(readFileSync('tests/fixtures/space/native-c2-campaign.save.json', 'utf8'));
    const old = structuredClone(s.space!.expedition!); enableBiosphere(s);
    const e = livingExpedition(s)!; expect(e.biosphere.activatedAction).toBe(6);
    expect(e.actions).toEqual(old.actions); expect(e.actions.find(action => action.kind === 'release')).not.toHaveProperty('band');
    expect(oldExpedition(e)).toEqual(old); expect(round(s)).toEqual(s);
  });
});

describe('C3 strict saved work and immutable activated checkpoint evidence', () => {
  it.each([
    ['extra state field', (e: LivingExpedition) => { Object.assign(e.biosphere, { freeEnergy: 1 }); }],
    ['unknown tool', (e: LivingExpedition) => { e.biosphere.tool = 'teleport' as ClimateTool; }],
    ['OFF with target', (e: LivingExpedition) => { e.biosphere.toolPlanetId = e.worlds[0].id; }],
    ['unearned paid scan', (e: LivingExpedition) => { e.biosphere.paidScans++; }],
    ['unearned paid transfer', (e: LivingExpedition) => { e.biosphere.paidTransfers++; }],
    ['lost source counters', (e: LivingExpedition) => { e.biosphere.origins.pop(); }],
    ['unearned birth', (e: LivingExpedition) => { e.biosphere.origins[0].births[0]++; }],
    ['unearned death', (e: LivingExpedition) => { e.biosphere.origins[0].deaths[0]++; }],
    ['forged tombstone', (e: LivingExpedition) => { e.biosphere.origins[0].founderDeaths.push(1); }],
    ['invalid band', (e: LivingExpedition) => { e.worlds[0].life[0].habitat.band = 4 as 1; }],
    ['unsupported reproduction', (e: LivingExpedition) => { e.worlds[0].life[0].habitat.reproduction = .1; }],
    ['unsupported hunt clock', (e: LivingExpedition) => { e.worlds[0].life[0].habitat.sinceHunt = 119; }],
    ['unearned stable band', (e: LivingExpedition) => { e.worlds[0].biosphere.stableFor[0] = 1; }],
    ['climate without work', (e: LivingExpedition) => { e.worlds[0].temperature += .1; }],
    ['work without elapsed time', (e: LivingExpedition) => { e.worlds[0].temperature += .1; e.worlds[0].biosphere.work.warm += .1; }],
  ] as const)('refuses %s in both live and independently decoded flight checkpoint', (_name, mutate) => {
    const s = living(); makeCheckpoint(s);
    const bad = structuredClone(s); mutate(livingExpedition(bad)!);
    expect(() => validateBiosphere(bad.space!)).toThrow(); refuseSave(bad);
    const cpBad = structuredClone(s), cp = JSON.parse(s.checkpoint!) as GameState;
    mutate(livingExpedition(cp)!); cpBad.checkpoint = JSON.stringify(cp); refuseSave(cpBad);
  });

  it('refuses changed initial climate after an already activated zero-work flight checkpoint', () => {
    const s = living(); makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState;
    advance(s, 1);
    const world = livingPlanet(s)!; world.temperature += .5; world.biosphere.initial.temperature += .5;
    // Each snapshot has a self-consistent zero receipt; only continuity can catch this.
    expect(() => validateBiosphere(s.space!)).not.toThrow();
    expect(biosphereCheckpointMatches(s.space!, cp.space!)).toBe(false); refuseSave(s);
  });

  it('freezes established activation metadata and does not allow a later save to reset paid climate work', () => {
    const s = living(); expect(setClimateTool(s, 'warm')).toBe(true); advance(s, 1); makeCheckpoint(s);
    const cp = JSON.parse(s.checkpoint!) as GameState; advance(s, 1);
    for (const mutate of [
      (e: LivingExpedition) => { e.biosphere.activatedAt += .01; },
      (e: LivingExpedition) => { e.worlds[0].biosphere.activatedElapsed += .01; },
      (e: LivingExpedition) => { e.worlds[0].biosphere.initial.temperature += .01; e.worlds[0].temperature += .01; },
      (e: LivingExpedition) => { e.worlds[0].biosphere.work.warm = 0; e.worlds[0].temperature = e.worlds[0].biosphere.initial.temperature; },
    ]) {
      const bad = structuredClone(s); mutate(livingExpedition(bad)!);
      expect(biosphereCheckpointMatches(bad.space!, cp.space!)).toBe(false); refuseSave(bad);
    }
  });

  it('preserves a closed release-band receipt even after the same specimen moves to a later band', () => {
    const s = living(), e = livingExpedition(s)!, item = e.cargo[0];
    expect(useSpecimenTool(s, 'release', item.id, 2)).toBe(true); makeCheckpoint(s);
    const cp = JSON.parse(s.checkpoint!) as GameState, closedSerial = e.actions.at(-1)!.serial;
    expect(useSpecimenTool(s, 'collect', item.id)).toBe(true); expect(useSpecimenTool(s, 'release', item.id, 3)).toBe(true);
    expect(round(s)).toEqual(s);
    const bad = structuredClone(s), row = livingExpedition(bad)!.actions.find(action => action.serial === closedSerial)!;
    if (row.kind !== 'release') throw new Error('Expected the closed release receipt.');
    row.band = 1;
    expect(() => validateBiosphere(bad.space!)).not.toThrow();
    expect(biosphereCheckpointMatches(bad.space!, cp.space!)).toBe(false); refuseSave(bad);
  });
});
