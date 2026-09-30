import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { starSystems } from '../src/game/galaxy';
import { parseGame, serializeGame } from '../src/game/persistence';
import { activateBiosphere, enableBiosphere, livingExpedition, livingPlanet } from '../src/game/space-biosphere';
import type { LivingExpedition, LivingPlanet, HabitatBand } from '../src/game/space-biosphere-types';
import { activateForeignEcology, bandCondition, enableForeignEcology, refreshForeignStability, roleOf, stableBandCapacity, stepForeignEcology } from '../src/game/space-ecology';
import { specimenQuote, useSpecimenTool } from '../src/game/space-expedition';
import { createForeignPlanet, foreignGround, spaceLifeSpecies } from '../src/game/space-life';
import { changeSpaceScale } from '../src/game/space';
import { makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { EMPTY_INPUT, type GameState } from '../src/game/types';

// Prepared unit worlds and selected positions isolate lifecycle rules. They are
// deliberately not presented as native play or a freshly completed campaign.
function prepared() {
  const home = 'ecology-regression', source = createForeignPlanet(starSystems(home)[1]);
  const e = activateBiosphere({ version: 1, generator: 1, worlds: [source], cargo: [], scans: [], actions: [], nextAction: 1, energySpent: 0 }, home, 0);
  activateForeignEcology(e, 0); return { e, w: e.worlds[0] };
}
function advance(e: LivingExpedition, w: LivingPlanet, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 30); i++) { w.elapsed += 1 / 30; stepForeignEcology(e, w, w.elapsed, 1 / 30); }
}
const native = () => parseGame(readFileSync('tests/fixtures/space/native-c2-carried-life.save.json', 'utf8'));
function active() { const s = native(); enableBiosphere(s); enableForeignEcology(s); return s; }
const round = (s: GameState) => parseGame(serializeGame(s));
const home = (s: GameState) => { const { checkpoint: _cp, space: _space, ...rest } = s; return structuredClone(rest); };
function frames(s: GameState, seconds: number) { for (let i = 0; i < Math.round(seconds * 30); i++) step(s, EMPTY_INPUT, 1 / 30); }
function ecologyFrames(s: GameState, seconds: number) {
  const e = livingExpedition(s)!, w = livingPlanet(s)!;
  // Public ecology unit isolation: advance its two clocks together, without
  // charging/replenishing a ship or running the unrelated domestic simulation.
  for (let i = 0; i < Math.round(seconds * 30); i++) { s.space!.elapsed += 1 / 30; w.elapsed += 1 / 30; stepForeignEcology(e, w, s.space!.elapsed, 1 / 30); }
}
function atSpecimen(s: GameState, id: string) {
  const life = livingPlanet(s)!.life.find(item => item.id === id)!;
  s.space!.location!.pos = { x: life.pos.x, y: 3, z: life.pos.z };
}
function rollWithPaidScans(s: GameState, count: number) {
  const life = livingPlanet(s)!.life[0]; atSpecimen(s, life.id);
  for (let i = 0; i < count; i++) { frames(s, 1); expect(useSpecimenTool(s, 'scan', life.id)).toBe(true); }
}
function refuse(s: GameState) {
  expect(() => serializeGame(s)).toThrow();
  expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
}

describe('C3 ecological activation and source balance', () => {
  it('preserves all A1 bytes until explicit activation and then upgrades live and its own older checkpoint without simulation', () => {
    const text = readFileSync('tests/fixtures/space/native-c3a1-climate-off.save.json', 'utf8'), s = parseGame(text);
    expect(s).toEqual(JSON.parse(text).state); const before = structuredClone(s), e = livingExpedition(s)!;
    const inhabitants = [...e.worlds.flatMap(w => w.life), ...e.cargo], prior = structuredClone(inhabitants);
    enableForeignEcology(s); expect(e.biosphere.version).toBe(2);
    expect([...e.worlds.flatMap(w => w.life), ...e.cargo]).toEqual(prior);
    for (const [i, life] of [...e.worlds.flatMap(w => w.life), ...e.cargo].entries()) expect(life).toBe(inhabitants[i]);
    expect(e.biosphere.ecology).toEqual({ activatedAt: s.space!.elapsed, activatedAction: e.nextAction });
    expect(home(s)).toEqual(home(before)); expect(e.actions).toEqual(before.space!.expedition!.actions);
    for (const [i, world] of e.worlds.entries()) expect(world.biosphere).toEqual({ ...(before.space!.expedition as LivingExpedition).worlds[i].biosphere, ecologyElapsed: world.elapsed });
    const cp = JSON.parse(s.checkpoint!) as GameState; expect(livingExpedition(cp)!.biosphere.ecology).toEqual({ activatedAt: 0, activatedAction: 1 });
    const once = structuredClone(s); enableForeignEcology(s); expect(s).toEqual(once); expect(round(s)).toEqual(s);
  });

  it('does not silently enable ecology on missing or legacy C2 branches', () => {
    const s = native(), before = structuredClone(s); enableForeignEcology(s); expect(s).toEqual(before);
    const c1 = parseGame(readFileSync('tests/fixtures/space/native-c1-in-flight.save.json', 'utf8')), original = structuredClone(c1);
    enableForeignEcology(c1); expect(c1).toEqual(original);
  });

  it('keeps all three source food webs healthy for ten active minutes with actual diet, births and finite roles', () => {
    const { e, w } = prepared(), designs = structuredClone(w.designs); advance(e, w, 600);
    expect(stableBandCapacity(e, w)).toBe(3); expect(w.biosphere.stableFor).toEqual([10, 10, 10]);
    expect(w.life).toHaveLength(54); expect(w.life.every(life => life.health >= 40 && life.nutrition >= .2)).toBe(true);
    for (const band of [1, 2, 3] as HabitatBand[]) expect(bandCondition(e, w, band).counts).toEqual([3, 3, 3, 3, 3, 3]);
    expect(e.biosphere.origins[0].births).toEqual([3, 3, 3, 3, 3, 3]); expect(e.biosphere.origins[0].deaths).toEqual([0, 0, 0, 0, 0, 0]);
    expect(w.designs).toEqual(designs); expect(e.energySpent).toBe(0); expect(e.actions.every(row => row.kind === 'birth' && row.energyPaid === 0)).toBe(true);
  });

  it('charges one simultaneous parent, gives its child a unique origin model and rechecks the three-per-role cap', () => {
    const { e, w } = prepared(), parents = w.life.filter(life => roleOf(life) === 0 && life.habitat.band === 1);
    for (const p of parents) p.habitat.reproduction = 40;
    advance(e, w, 1 / 30); const children = w.life.filter(life => life.habitat.birth);
    expect(children).toHaveLength(1); const child = children[0];
    expect(child).toMatchObject({ id: `${w.id}:born-0-1`, originPlanetId: w.id, taxonKey: parents[0].taxonKey, health: 70, nutrition: .45,
      habitat: { band: 1, reproduction: 0, sinceHunt: 120, birth: { parentId: parents[0].id, planetId: w.id, at: 1 / 30 } } });
    expect(parents[0].health).toBe(95); expect(parents[0].nutrition).toBe(.8); expect(parents[0].habitat.reproduction).toBe(0);
    expect(parents[1].health).toBe(100); expect(parents[1].nutrition).toBe(1);
    expect(e.actions).toEqual([{ serial: 1, kind: 'birth', at: 1 / 30, planetId: w.id, lifeId: child.id, energyPaid: 0, parentId: parents[0].id, band: 1 }]);
    expect(e.scans).toEqual([]); expect(e.biosphere.origins[0].births[0]).toBe(1);
  });

  it('never exceeds 96 residents when several parents finish in one frame', () => {
    const { e, w } = prepared();
    // Capacity stress is a deliberately prepared physiology world, not a save.
    const filler = w.life[5]; while (w.life.length < 95) { const life = structuredClone(filler); life.id += `-capacity-${w.life.length}`; w.life.push(life); }
    for (const life of w.life.filter(life => roleOf(life) < 3)) life.habitat.reproduction = 40;
    advance(e, w, 1 / 30); expect(w.life).toHaveLength(96); expect(e.actions.filter(row => row.kind === 'birth')).toHaveLength(1);
    advance(e, w, 1); expect(w.life).toHaveLength(96);
  });

  it('records permanent founder death once and removes the concrete body before population accounting', () => {
    const { e, w } = prepared(), victim = w.life[0]; victim.health = .001; victim.nutrition = 0; w.temperature = 1; w.atmosphere = 1;
    advance(e, w, 1 / 30); expect(w.life).not.toContain(victim); expect(w.life).toHaveLength(35);
    expect(e.biosphere.origins[0].founderDeaths).toEqual([1]); expect(e.biosphere.origins[0].deaths).toEqual([1, 0, 0, 0, 0, 0]);
    expect(e.actions[0]).toMatchObject({ kind: 'death', lifeId: victim.id, cause: 'climate', band: 1, energyPaid: 0 });
    advance(e, w, 1); expect(e.biosphere.origins[0].deaths[0]).toBe(1);
  });

  it('loses and restores continuous band capacity after a missing role returns and spends ten real seconds settling', () => {
    const { e, w } = prepared(); advance(e, w, 12); expect(stableBandCapacity(e, w)).toBe(3);
    const removed = w.life.filter(life => roleOf(life) === 0 && life.habitat.band === 2);
    w.life = w.life.filter(life => !removed.includes(life)); refreshForeignStability(e, w);
    expect(w.biosphere.stableFor).toEqual([10, 0, 10]); expect(stableBandCapacity(e, w)).toBe(1);
    w.life.push(...removed); advance(e, w, 9); expect(stableBandCapacity(e, w)).toBe(1);
    advance(e, w, 1.1); expect(stableBandCapacity(e, w)).toBe(3);
  });

  it('a detritus-fed predator cannot grant stable capacity without a real recent prey meal', () => {
    const { e, w } = prepared();
    for (const life of w.life.filter(life => roleOf(life) === 5)) life.habitat.sinceHunt = 120;
    w.biosphere.stableFor = [10, 10, 10];
    expect(bandCondition(e, w, 1).viable).toBe(false); refreshForeignStability(e, w); expect(stableBandCapacity(e, w)).toBe(0);
    advance(e, w, 12); expect(stableBandCapacity(e, w)).toBe(3);
  });

  it('records bounded drift toward the origin only while no band is stable', () => {
    const { e, w } = prepared(); w.life = []; w.temperature = .5; w.atmosphere = -.2;
    advance(e, w, 5); expect(w.temperature).toBeCloseTo(.498, 10); expect(w.atmosphere).toBeCloseTo(-.198, 10);
    expect(w.biosphere.work.temperatureDrift).toBeCloseTo(-.002, 10); expect(w.biosphere.work.atmosphereDrift).toBeCloseTo(.002, 10);
    const healthy = prepared(); advance(healthy.e, healthy.w, 12); healthy.w.temperature = .1;
    advance(healthy.e, healthy.w, 1); expect(healthy.w.temperature).toBe(.1); expect(healthy.w.biosphere.work.temperatureDrift).toBe(0);
  });
});

describe('C3 public simulation, complete saves and concrete ecological history', () => {
  it('scatters six paid releases at one prepared ship position within actual range, preserving physical identities, ground and chosen bands', () => {
    const s = active(), e = livingExpedition(s)!, w = livingPlanet(s)!; makeCheckpoint(s);
    // Prepared scanner/ship coordinates isolate the placement rule. Every
    // acquisition and release still uses the public paid tool transaction.
    for (const role of [0, 1, 2, 3, 5]) {
      const specimen = w.life.find(item => roleOf(item) === role)!; atSpecimen(s, specimen.id);
      expect(useSpecimenTool(s, 'scan', specimen.id)).toBe(true); expect(useSpecimenTool(s, 'collect', specimen.id)).toBe(true);
    }
    const cargo = [...e.cargo], paid = e.energySpent, energy = s.space!.ship!.energy, nextAction = e.nextAction;
    expect(cargo).toHaveLength(6); expect(new Set(cargo.map(roleOf)).size).toBe(6);
    const ship = { x: 35, y: 2.5, z: 35 }; s.space!.location!.pos = ship;
    for (const [index, specimen] of cargo.entries()) {
      const band = (index % 3 + 1) as HabitatBand, { pos: _pos, habitat: _habitat, ...physical } = structuredClone(specimen);
      expect(specimenQuote(s, 'release', specimen.id).ok).toBe(true); expect(useSpecimenTool(s, 'release', specimen.id, band)).toBe(true);
      expect(w.life.find(life => life.id === specimen.id)).toBe(specimen);
      expect(specimen).toMatchObject(physical); expect(specimen.habitat.band).toBe(band);
      expect(specimen.pos.y).toBe(foreignGround(w.seed, specimen.pos.x, specimen.pos.z));
      expect(Math.hypot(specimen.pos.x - ship.x, specimen.pos.y - ship.y, specimen.pos.z - ship.z)).toBeLessThanOrEqual(6);
      expect(e.actions.at(-1)).toEqual({ serial: nextAction + index, at: s.space!.elapsed, kind: 'release', planetId: w.id, lifeId: specimen.id, energyPaid: 2, band });
    }
    for (let a = 0; a < cargo.length; a++) for (let b = a + 1; b < cargo.length; b++) {
      expect(Math.hypot(cargo[a].pos.x - cargo[b].pos.x, cargo[a].pos.z - cargo[b].pos.z)).toBeGreaterThanOrEqual(2.4);
    }
    expect(e.cargo).toEqual([]); expect(e.energySpent - paid).toBe(12); expect(energy - s.space!.ship!.energy).toBe(12);
    expect(w.life).toHaveLength(36); expect(round(s)).toEqual(s);
  });

  it('refuses crowded or high releases atomically and permits the same paid specimen after moving and lowering', () => {
    const s = active(), e = livingExpedition(s)!, w = livingPlanet(s)!, passenger = e.cargo[0];
    // Prepared existing bodies fill a five-by-five patch. No new organism,
    // cargo capacity, energy or biological history is manufactured.
    for (const [i, life] of w.life.entries()) {
      const x = i < 25 ? (i % 5 - 2) * 2 : 50 + i % 5 * 3, z = i < 25 ? (Math.floor(i / 5) - 2) * 2 : 50 + Math.floor((i - 25) / 5) * 3;
      life.pos = { x, z, y: foreignGround(w.seed, x, z) };
    }
    s.space!.location!.pos = { x: 0, y: 3, z: 0 }; makeCheckpoint(s);
    const before = structuredClone(e), energy = s.space!.ship!.energy;
    expect(specimenQuote(s, 'release', passenger.id)).toMatchObject({ ok: false, reason: expect.stringContaining('volné místo') });
    expect(useSpecimenTool(s, 'release', passenger.id, 3)).toBe(false); expect(e).toEqual(before); expect(s.space!.ship!.energy).toBe(energy);
    s.space!.location!.pos = { x: 35, y: 7, z: 35 };
    expect(specimenQuote(s, 'release', passenger.id)).toMatchObject({ ok: false, reason: expect.stringContaining('povrchu') });
    expect(useSpecimenTool(s, 'release', passenger.id, 3)).toBe(false); expect(e).toEqual(before); expect(s.space!.ship!.energy).toBe(energy);
    s.space!.location!.pos.y = 2.5; expect(useSpecimenTool(s, 'release', passenger.id, 3)).toBe(true);
    expect(w.life.find(item => item.id === passenger.id)).toBe(passenger); expect(e.cargo).toEqual([]);
    expect(e.nextAction).toBe(before.nextAction + 1); expect(e.energySpent).toBe(before.energySpent + 2); expect(s.space!.ship!.energy).toBe(energy - 2);
    expect(passenger.habitat.band).toBe(3); expect(round(s)).toEqual(s);
  });

  it('advances only active surface life while home, cargo and an inactive source stay exact', () => {
    const s = active(), e = livingExpedition(s)!, w = livingPlanet(s)!, domestic = home(s), cargo = structuredClone(e.cargo);
    makeCheckpoint(s); const initialNutrition = w.life.find(life => roleOf(life) === 3)!.nutrition;
    frames(s, 2); expect(w.life.find(life => roleOf(life) === 3)!.nutrition).not.toBe(initialNutrition);
    expect(e.cargo).toEqual(cargo); expect(home(s)).toEqual(domestic); expect(round(s)).toEqual(s);
    s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true);
    const frozen = structuredClone(w); frames(s, 5); expect(w).toEqual(frozen); expect(e.cargo).toEqual(cargo); expect(home(s)).toEqual(domestic);
    expect(round(s)).toEqual(s); const restored = recoverGeneration(round(s)), cp = JSON.parse(s.checkpoint!) as GameState;
    expect(restored.space).toEqual({ ...cp.space!, notice: expect.any(String) }); expect(home(restored)).toEqual(domestic);
  });

  it('saves natural reproduction, complete parent/model history and a new full checkpoint after public runtime', () => {
    const s = active(), e = livingExpedition(s)!; makeCheckpoint(s); frames(s, 61);
    expect(e.actions.some(row => row.kind === 'birth')).toBe(true); expect(round(s)).toEqual(s);
    const child = livingPlanet(s)!.life.find(life => life.habitat.birth && roleOf(life) >= 3)!;
    expect(child).toBeDefined(); expect(spaceLifeSpecies(e, child)!.genome).toBe(spaceLifeSpecies(e, livingPlanet(s)!.life.find(life => life.id === child.habitat.birth!.parentId)!)!.genome);
    makeCheckpoint(s); const cp = JSON.parse(s.checkpoint!) as GameState; frames(s, 2);
    expect(round(s)).toEqual(s); expect(recoverGeneration(round(s)).space).toEqual({ ...cp.space!, notice: expect.any(String) });
  });

  it('invalidates an exhausted role immediately on public collection and retains its source band in the paid receipt', () => {
    const s = active(), e = livingExpedition(s)!, w = livingPlanet(s)!; frames(s, 12);
    const resident = w.life.find(life => roleOf(life) === 4 && life.habitat.band === 2)!;
    expect(w.life.filter(life => roleOf(life) === 4 && life.habitat.band === 2)).toHaveLength(1);
    expect(w.biosphere.stableFor[1]).toBe(10); makeCheckpoint(s);
    s.space!.location!.pos = { x: resident.pos.x, y: 3, z: resident.pos.z };
    expect(useSpecimenTool(s, 'scan', resident.id)).toBe(true); expect(useSpecimenTool(s, 'collect', resident.id)).toBe(true);
    expect(w.biosphere.stableFor[1]).toBe(0); expect(stableBandCapacity(e, w)).toBe(1);
    expect(e.actions.at(-1)).toMatchObject({ kind: 'collect', band: 2 }); expect(round(s)).toEqual(s);
  });

  it('keeps the older origin and the carried organism frozen while an actually visited second surface lives', () => {
    const s = parseGame(readFileSync('tests/fixtures/space/native-c3a1-climate-off.save.json', 'utf8')); enableForeignEcology(s);
    const e = livingExpedition(s)!, source = structuredClone(e.worlds[0]), cargo = structuredClone(e.cargo), domestic = home(s);
    const before = livingPlanet(s)!.elapsed; frames(s, 2);
    expect(livingPlanet(s)!.elapsed).toBeCloseTo(before + 2, 9); expect(e.worlds[0]).toEqual(source);
    expect(e.cargo).toEqual(cargo); expect(home(s)).toEqual(domestic); expect(round(s)).toEqual(s);
  });

  it('preserves exact ecological snapshots through rekey and independently restores the older native checkpoint', () => {
    const s = active(); frames(s, 3); const before = structuredClone(s.space), cp = JSON.parse(s.checkpoint!) as GameState;
    s.id += '-ecological-import'; cp.id = s.id; s.checkpoint = JSON.stringify(cp);
    expect(round(s).space).toEqual(before); expect(recoverGeneration(round(s)).space).toEqual(cp.space);
    expect(livingExpedition(recoverGeneration(round(s)))!.biosphere).toMatchObject({ paidScans: 0, paidTransfers: 0, origins: [], ecology: { activatedAt: 0, activatedAction: 1 } });
  });

  it('persists actual population loss under unsupported climate with founder tombstones and exact conservation', () => {
    const s = active(), e = livingExpedition(s)!, w = livingPlanet(s)!;
    // Prepared unsupported climate creates a real runtime decline, not a fake
    // death receipt. The direct ecology pass conserves its own active clocks.
    w.temperature = 1; w.atmosphere = 1; w.biosphere.initial = { temperature: 1, atmosphere: 1 };
    makeCheckpoint(s); ecologyFrames(s, 250);
    expect(w.life).toHaveLength(0); expect(e.cargo).toHaveLength(1);
    expect(e.biosphere.origins[0].founderDeaths).toHaveLength(35);
    expect(e.biosphere.origins[0].deaths.reduce((sum, n) => sum + n, 0)).toBe(35);
    expect(e.actions.filter(row => row.kind === 'death')).toHaveLength(35); expect(round(s)).toEqual(s);
    const restored = recoverGeneration(round(s)); expect(livingExpedition(restored)!.worlds[0].life).toHaveLength(35);
    expect(livingExpedition(restored)!.biosphere.origins[0].deaths).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('prunes an old dead descendant scan after 128 later real paid actions while preserving founder knowledge and counters', () => {
    const s = active(), e = livingExpedition(s)!, w = livingPlanet(s)!;
    w.life[0].habitat.reproduction = 40; ecologyFrames(s, 1 / 30);
    const child = w.life.find(life => life.habitat.birth)!; expect(child).toBeDefined(); atSpecimen(s, child.id);
    expect(useSpecimenTool(s, 'scan', child.id)).toBe(true); const oldScan = e.scans.find(scan => scan.lifeId === child.id)!;
    // Prepared weak newborn isolates a real paid scan → hunger death → pruning
    // sequence without claiming the health preparation was played.
    child.health = .001; child.nutrition = 0; makeCheckpoint(s); ecologyFrames(s, 1 / 30);
    expect(e.scans).toContainEqual(oldScan); expect(e.actions.at(-1)).toMatchObject({ kind: 'death', lifeId: child.id, cause: 'hunger' });
    rollWithPaidScans(s, 129);
    expect(e.actions).toHaveLength(128); expect(e.actions.some(row => row.lifeId === child.id)).toBe(false);
    expect(e.scans.some(scan => scan.lifeId === child.id)).toBe(false); expect(e.scans.some(scan => scan.lifeId.includes(':life-'))).toBe(true);
    expect(e.biosphere.paidScans).toBe(131); expect(e.energySpent).toBe(133); expect(round(s)).toEqual(s);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(livingExpedition(recoverGeneration(round(s)))!.scans).toEqual(livingExpedition(cp)!.scans);
  });

  it('rejects collection before the first scan even when reordered receipts share the same clock', () => {
    const s = active(), e = livingExpedition(s)!, life = livingPlanet(s)!.life[0]; atSpecimen(s, life.id); makeCheckpoint(s);
    expect(useSpecimenTool(s, 'scan', life.id)).toBe(true); expect(useSpecimenTool(s, 'collect', life.id)).toBe(true); expect(useSpecimenTool(s, 'release', life.id, 1)).toBe(true);
    expect(round(s)).toEqual(s);
    const tail = e.actions.slice(-3), [scan, collect, release] = tail;
    e.actions.splice(-3, 3, { ...collect, serial: scan.serial }, { ...release, serial: collect.serial }, { ...scan, serial: release.serial });
    refuse(s); s.checkpoint = null; refuse(s);
  });

  it('rejects physiology changes hidden behind a same-clock round trip followed by orbital time', () => {
    const s = active(), e = livingExpedition(s)!, life = livingPlanet(s)!.life[0]; atSpecimen(s, life.id); makeCheckpoint(s);
    expect(useSpecimenTool(s, 'scan', life.id)).toBe(true); expect(useSpecimenTool(s, 'collect', life.id)).toBe(true); expect(useSpecimenTool(s, 'release', life.id, 1)).toBe(true);
    s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); frames(s, 5);
    expect(round(s)).toEqual(s); e.worlds[0].life.find(item => item.id === life.id)!.health--;
    refuse(s);
  });

  it('cannot reuse checkpoint scan payments to explain a wholly new rolled action suffix', () => {
    const s = active(); rollWithPaidScans(s, 130); makeCheckpoint(s);
    const e = livingExpedition(s)!, w = livingPlanet(s)!, origin = e.biosphere.origins[0], start = e.nextAction;
    // Deliberately forged bounded-history attack. The missing action and 128
    // scan rows are new, but all old scan payments are left unchanged.
    s.space!.elapsed += 1; w.elapsed += 1;
    origin.births[0] += 65; origin.deaths[0] += 64;
    const parent = w.life.find(life => roleOf(life) === 0)!, child = structuredClone(parent);
    child.id = `${w.id}:born-0-${origin.births[0]}`; child.health = 70; child.nutrition = .45;
    child.habitat = { band: parent.habitat.band, reproduction: 0, sinceHunt: 120, birth: { parentId: parent.id, planetId: w.id, at: s.space!.elapsed } };
    w.life.push(child); e.nextAction += 129;
    e.actions = Array.from({ length: 128 }, (_, i) => ({ serial: start + i + 1, at: s.space!.elapsed, kind: 'scan' as const, planetId: w.id, lifeId: parent.id, energyPaid: 1 }));
    refuse(s);
  });

  it('cannot resurrect a dead early descendant in place of a living later one after their receipts roll away', () => {
    const s = active(), e = livingExpedition(s)!, w = livingPlanet(s)!, parent = w.life[0];
    parent.habitat.reproduction = 40; ecologyFrames(s, 1 / 30);
    const first = w.life.find(life => life.habitat.birth)!; const oldBirth = structuredClone(first.habitat.birth);
    first.health = .001; first.nutrition = 0; ecologyFrames(s, 1 / 30);
    parent.health = 100; parent.nutrition = 1; parent.habitat.reproduction = 40; ecologyFrames(s, 1 / 30);
    const second = w.life.find(life => life.id === `${w.id}:born-0-2`)!; expect(second).toBeDefined();
    makeCheckpoint(s); rollWithPaidScans(s, 129); expect(round(s)).toEqual(s);
    expect(e.actions.some(row => row.lifeId === first.id || row.lifeId === second.id)).toBe(false);
    second.id = first.id; second.habitat.birth = oldBirth; refuse(s);
  });

  it.each([false, true])('rejects an exactly accounted founder death during orbit-only time (prior healthy ecological time: %s)', hadEcologicalTime => {
    const s = active(), e = livingExpedition(s)!, w = livingPlanet(s)!;
    if (hadEcologicalTime) { frames(s, 2); makeCheckpoint(s); }
    else s.checkpoint = null; // Standalone fresh A2 branch has no ecological time at all.
    const worldTime = w.elapsed, activationTime = w.biosphere.ecologyElapsed!, clock = s.space!.elapsed;
    expect(worldTime > activationTime).toBe(hadEcologicalTime);
    // Prepared altitude, followed by a real paid ascent and ordinary orbit time.
    s.space!.location!.pos.y = 20; expect(changeSpaceScale(s, 'up')).toBe(true); frames(s, 4);
    expect(s.space!.location!.scale).toBe('orbit'); expect(s.space!.elapsed).toBeGreaterThan(clock);
    expect(w.elapsed).toBe(worldTime); expect(round(s)).toEqual(s);
    const victim = w.life[0], origin = e.biosphere.origins.find(item => item.planetId === victim.originPlanetId)!;
    // Attack balances the physical removal, permanent tombstone, death count,
    // action serial and zero ship payment. Only the absent world time disproves it.
    w.life.splice(0, 1); origin.deaths[roleOf(victim)]++;
    origin.founderDeaths.push(Number(victim.id.split(':life-').at(-1)));
    e.actions.push({ serial: e.nextAction++, at: s.space!.elapsed, kind: 'death', planetId: w.id,
      lifeId: victim.id, energyPaid: 0, band: victim.habitat.band, cause: 'hunger' });
    expect(e.biosphere.paidScans + 2 * e.biosphere.paidTransfers).toBe(e.energySpent);
    expect(w.elapsed).toBe(worldTime); refuse(s);
  });

  it.each([
    ['wrong ecology version', (e: LivingExpedition) => { e.biosphere.version = 1; }],
    ['future activation', (e: LivingExpedition) => { e.biosphere.ecology!.activatedAt = 1e9; }],
    ['invented birth count', (e: LivingExpedition) => { e.biosphere.origins[0].births[0]++; }],
    ['invented death count', (e: LivingExpedition) => { e.biosphere.origins[0].deaths[0]++; }],
    ['living founder tombstone', (e: LivingExpedition) => { e.biosphere.origins[0].founderDeaths.push(1); }],
    ['duplicated founder', (e: LivingExpedition) => { e.worlds[0].life.push(structuredClone(e.worlds[0].life[0])); }],
    ['missing founder', (e: LivingExpedition) => { e.worlds[0].life.pop(); }],
    ['unearned stable time', (e: LivingExpedition) => { e.worlds[0].biosphere.stableFor[0] = 10; }],
    ['unearned drift', (e: LivingExpedition) => { e.worlds[0].biosphere.work.temperatureDrift = .001; e.worlds[0].temperature += .001; }],
    ['changed cargo health', (e: LivingExpedition) => { e.cargo[0].health--; }],
  ] as [string, (e: LivingExpedition) => void][])('rejects malformed %s in a complete checkpoint campaign', (_name, mutate) => {
    const s = active(); makeCheckpoint(s); mutate(livingExpedition(s)!); refuse(s);
  });
});
