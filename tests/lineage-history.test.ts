import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { enableLineageHistory, observeLineageHistory, creatureInheritance, recordLineageMeal } from '../src/game/lineage-history';
import { createGame, makeCheckpoint, recoverGeneration, step, continueToTribeEra, continueToMachinesEra, continueToPlanetEra, returnToCoast, tryTransition, evolve } from '../src/game/simulation';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { creatureStageFixture } from './fixtures/creature-stage';
import { completeCreatureStage, performSpeciesAction, startEncounter } from '../src/game/creature-stage';
import { CHAPTERS } from '../src/game/content';
import { buildNpcDesigns } from '../src/game/npc-genome';
import { cloneGenome } from '../src/game/genome';
import { issueMachineOrder, machineDesign } from '../src/game/machines';
import { stepTribe, issueTribeOrder } from '../src/game/tribe';
import { lineageHistoryMarkup } from '../src/ui/lineage-history';

function land() { const s = creatureStageFixture(); enableLineageHistory(s); makeCheckpoint(s); return s; }
function friendship(s: GameState, n: number) {
  const c = s.world.creatures.find(c => c.id === s.creatureStage!.nests[n].residents[0])!;
  s.player.pos = { ...c.pos, z: c.pos.z - 3 }; s.player.energy = 100; s.player.cooldown = 0; s.creatureStage!.recharge = 0;
  expect(startEncounter(s, { kind: 'creature', stage: 2, id: c.id })).toBe(true);
  for (let attempts = 0; s.creatureStage!.encounter && attempts < 10; attempts++) {
    s.creatureStage!.recharge = 0;
    performSpeciesAction(s, s.creatureStage!.encounter!.requested, null, () => { throw new Error('social encounter must not kill'); });
  }
  observeLineageHistory(s);
  expect(s.creatureStage!.nests[n].outcome).toBe('friend');
}
function combat(s: GameState, n: number) {
  const nest = s.creatureStage!.nests[n];
  for (const id of [...nest.residents]) {
    const c = s.world.creatures.find(c => c.id === id)!;
    // Prepared target position/health make this a focused action regression, not played evidence.
    s.player.pos = { ...c.pos, z: c.pos.z - 2 }; c.health = 1;
    s.creatureStage!.recharge = 0; s.player.cooldown = 0; s.player.energy = 100;
    step(s, { ...EMPTY_INPUT, speciesAction: 'strike', feedSelection: { kind: 'creature', stage: 2, id } });
  }
  expect(nest.outcome).toBe('predator');
}
function finished(route: 'social' | 'predator' | 'mixed') {
  const s = land();
  for (let i = 0; i < 3; i++) route === 'social' || route === 'mixed' && i === 0 ? friendship(s, i) : combat(s, i);
  s.player.pos = { ...s.world.landmarks[0].pos };
  expect(completeCreatureStage(s)).toBe(true); makeCheckpoint(s); return s;
}
function attackDamage(s: GameState) {
  continueToTribeEra(s);
  const t = s.tribe!; if (t.version !== 2) throw new Error('tribe');
  const u = t.members[0], n = t.neighbours[1];
  u.pos = { ...n.pos, z: n.pos.z - 2 }; const health = n.health;
  expect(issueTribeOrder(s, [u.id], 'attack', { kind: 'neighbour', id: n.id }).ok).toBe(true);
  stepTribe(s, 1 / 60); return health - n.health;
}

describe('SP-007.A action evidence and inheritance', () => {
  it('records only successful meals by actual food, not installed diet or attempts', () => {
    const s = createGame(481516, false, true, true, true, true, true, undefined, true, true);
    const food = s.world.resources.find(r => r.kind === 'algae' && r.amount >= 1)!;
    s.player.pos = { ...food.pos }; const input = { ...EMPTY_INPUT, feed: true, feedSelection: { kind: 'food' as const, stage: 0 as const, id: food.id } };
    step(s, input); expect(s.lineageHistory!.stages[0].counts!.meals.algae).toBe(1);
    step(s, input); expect(s.lineageHistory!.stages[0].counts!.meals.algae).toBe(1);
    expect(s.lineageHistory!.stages[0].counts!.meals.meat).toBe(0);
    expect(s.lineageHistory!.stages[0].counts!.hunts).toBe(0);
    expect(parseGame(serializeGame(s)).lineageHistory).toEqual(s.lineageHistory);
    expect(s.cellGrowth!.nutrition).toBe(1);
  });
  it.each(['social', 'predator', 'mixed'] as const)('records %s from real outcome actions, freezes it and keeps generation/save/checkpoint coherent', route => {
    const s = finished(route), row = structuredClone(s.lineageHistory!.stages[2]);
    expect(row.closed?.outcome).toBe(route);
    expect(row.facts.filter(f => f.key.startsWith('nest:'))).toHaveLength(3);
    expect(row.counts!.hunts).toBe(route === 'social' ? 0 : route === 'predator' ? 6 : 4);
    expect(row.coverage).toBe('partial');
    expect(completeCreatureStage(s)).toBe(false);
    recordLineageMeal(s, 'meat'); friendship(s, 3); observeLineageHistory(s);
    expect(s.lineageHistory!.stages[2]).toEqual(row);
    expect(parseGame(serializeGame(s)).lineageHistory).toEqual(s.lineageHistory);
    expect(recoverGeneration(s).lineageHistory!.stages[2]).toEqual(row);
    expect(continueToTribeEra(s)).toBe(true); const food = s.tribe!.food;
    expect(continueToTribeEra(s)).toBe(false); expect(s.tribe!.food).toBe(food);
    expect(parseGame(serializeGame(s)).lineageHistory!.stages[2]).toEqual(row);
    expect(creatureInheritance(recoverGeneration(s))).toEqual(creatureInheritance(s));
  });
  it('same body, genuinely different pasts produce distinct actual tribe damage and balanced mixed effect', () => {
    const social = finished('social'), predator = finished('predator'), mixed = finished('mixed');
    expect(social.player.genome).toEqual(predator.player.genome);
    expect(attackDamage(social)).toBeCloseTo(5);
    expect(attackDamage(predator)).toBeCloseTo(5.75);
    expect(attackDamage(mixed)).toBeCloseTo(5.375);
    expect(creatureInheritance(social).social).toBe(1.15);
    expect(creatureInheritance(mixed).social).toBe(1.075);
  });
  it('applies the diplomacy bonus through physical tribe orders and retains the gift cost', () => {
    for (const route of ['social', 'predator'] as const) {
      const s = finished(route); continueToTribeEra(s); const t = s.tribe!;
      if (t.version !== 2) throw new Error('tribe');
      const u = t.members[0], n = t.neighbours[1], food = t.food;
      u.pos = { ...n.pos, z: n.pos.z - 2 };
      issueTribeOrder(s, [u.id], 'socialize', { kind: 'neighbour', id: n.id }); stepTribe(s, 1 / 60);
      expect(n.relation).toBeCloseTo(.45 / 60 * (route === 'social' ? 1.15 : 1));
      expect(t.food).toBe(food - 12);
    }
  });
  it('successful evolution carries counters; recovery rolls back the uncommitted branch without adding rewards', () => {
    const s = land(); recordLineageMeal(s, 'algae');
    const genome = cloneGenome(s.player.genome); genome.name = 'Další generace';
    expect(evolve(s, genome).ok).toBe(true); const dna = s.player.dna;
    recordLineageMeal(s, 'meat'); friendship(s, 0);
    const restored = recoverGeneration(s);
    expect(restored.lineageHistory!.stages[2].counts!.meals).toMatchObject({ algae: 1, meat: 0 });
    expect(restored.lineageHistory!.stages[2].facts).toHaveLength(0);
    expect(restored.player.dna).toBe(dna);
    friendship(restored, 0); observeLineageHistory(restored); observeLineageHistory(restored);
    expect(restored.lineageHistory!.stages[2].facts).toHaveLength(1);
    expect(restored.player.dna).toBe(dna + 12);
  });
  it('imports every historical fixture without guessing food, preserving later outcomes and neutrality', () => {
    const manifest = JSON.parse(readFileSync('tests/fixtures/saves/manifest.json', 'utf8'));
    for (const { file } of manifest.files) {
      const s = parseGame(readFileSync(`tests/fixtures/saves/${file}`, 'utf8'));
      expect(s.lineageHistory).toBeUndefined(); const body = structuredClone(s.player.genome), tribe = structuredClone(s.tribe), npc = structuredClone(s.worlds[2]?.creatureDesigns);
      enableLineageHistory(s); const once = JSON.stringify(s.lineageHistory); enableLineageHistory(s);
      expect(JSON.stringify(s.lineageHistory)).toBe(once);
      expect(creatureInheritance(s)).toMatchObject({ social: 1, combat: 1 });
      const loaded = parseGame(serializeGame(s));
      expect(loaded.player.genome).toEqual(body); expect(loaded.tribe).toEqual(tribe); expect(loaded.worlds[2]?.creatureDesigns).toEqual(npc);
      expect(loaded.lineageHistory).toEqual(s.lineageHistory);
      if (s.stage >= 3) expect(lineageHistoryMarkup(s)).toContain('starým savem');
    }
  });
  it('does not backfill missing food from meat-capable anatomy or total meals', () => {
    const s = creatureStageFixture(); s.player.meals = 999; enableLineageHistory(s);
    expect(s.lineageHistory!.stages[2].counts!.meals.meat).toBe(0);
    expect(s.lineageHistory!.stages[0].counts).toBeNull();
    expect(lineageHistoryMarkup(s)).toContain('Dřívější jídelníček');
  });
  it('records actual later-stage completion edges, preserves imported evidence and freezes each slot', () => {
    // Prepared near-finished historical scenarios, NOT a played multi-era campaign.
    const tribe = parseGame(readFileSync('tests/fixtures/saves/alliance-completed.save.json', 'utf8'));
    const t = tribe.tribe!; if (t.version !== 2) throw new Error('tribe');
    tribe.checkpoint = null; t.completed = false; t.food = 100;
    const neighbour = t.neighbours[2], member = t.members.find(u => !u.species)!;
    neighbour.resolved = null; neighbour.relation = 99.999; member.pos = { ...neighbour.pos, z: neighbour.pos.z - 2 };
    for (const u of t.members) u.orders = [];
    enableLineageHistory(tribe); makeCheckpoint(tribe);
    issueTribeOrder(tribe, [member.id], 'socialize', { kind: 'neighbour', id: neighbour.id }); step(tribe, EMPTY_INPUT);
    const row = structuredClone(tribe.lineageHistory!.stages[3]);
    expect(row.closed).toMatchObject({ outcome: 'allied', source: 'action' });
    expect(row.facts.map(f => f.source)).toEqual(['saved', 'saved', 'action']);
    expect(continueToMachinesEra(tribe)).toBe(true); expect(continueToMachinesEra(tribe)).toBe(false);
    expect(parseGame(serializeGame(tribe)).lineageHistory!.stages[3]).toEqual(row);

    const machine = parseGame(readFileSync('tests/fixtures/saves/machines-restoration-completed.save.json', 'utf8'));
    const m = machine.machines!; if (m.version !== 2) throw new Error('machines');
    machine.checkpoint = null; m.completed = false;
    const region = m.regions[2], air = m.fleet.find(u => machineDesign(m, u).carrier === 'air')!;
    region.owner = 'neutral'; region.method = null; region.soil = 99.999; region.settlers = 1;
    air.pos = { ...region.pos }; air.cargo = 1; for (const u of m.fleet) u.orders = [];
    enableLineageHistory(machine); makeCheckpoint(machine);
    expect(issueMachineOrder(machine, [air.id], 'build', { kind: 'region', id: region.id }).ok).toBe(true); step(machine, EMPTY_INPUT);
    expect(machine.lineageHistory!.stages[4].closed).toMatchObject({ outcome: 'restoration', source: 'action' });
    expect(machine.lineageHistory!.stages[4].facts.at(-1)).toMatchObject({ key: 'region:highlands', method: 'restoration', source: 'action' });
    expect(continueToPlanetEra(machine)).toBe(true); expect(continueToPlanetEra(machine)).toBe(false);
    expect(parseGame(serializeGame(machine)).lineageHistory).toEqual(machine.lineageHistory);

    const planet = parseGame(readFileSync('tests/fixtures/saves/stable-sandbox.save.json', 'utf8'));
    const p = planet.planet!; if (p.version !== 2) throw new Error('planet');
    planet.checkpoint = null; p.completed = false; p.sandbox = false; p.stableTime = 29.999;
    enableLineageHistory(planet); makeCheckpoint(planet); step(planet, EMPTY_INPUT);
    expect(planet.lineageHistory!.stages[5].closed).toMatchObject({ outcome: 'stable', source: 'action' });
    expect(planet.lineageHistory!.stages[5].facts).toHaveLength(1);
    step(planet, EMPTY_INPUT); observeLineageHistory(planet);
    expect(parseGame(serializeGame(planet)).lineageHistory).toEqual(planet.lineageHistory);
    expect(recoverGeneration(planet).lineageHistory).toEqual(planet.lineageHistory);
  });
  it('does not treat reversible legacy tribe preview as a completed chapter', () => {
    const s = parseGame(readFileSync('tests/fixtures/saves/tribe-preview.export.json', 'utf8'));
    enableLineageHistory(s); expect(s.lineageHistory!.stages[3].closed).toBeNull();
    expect(returnToCoast(s)).toBe(true); expect(s.lineageHistory!.stages).toHaveLength(3);
    expect(parseGame(serializeGame(s)).lineageHistory).toEqual(s.lineageHistory);
  });
  it('closes organism passages exactly once and starts the next observation at the boundary', () => {
    const s = createGame(481516); enableLineageHistory(s, true); makeCheckpoint(s);
    for (const stage of [0, 1] as const) {
      // Prepared passage prerequisites test the real transition, not earned progression.
      s.campaign.stageMeals = CHAPTERS[stage].meals; s.campaign.stageReproductions = 2;
      s.world.patches.forEach(p => { p.discovered = true; });
      s.campaign.journals.push(...s.world.patches.map(p => `field:${stage}:${p.id}:forage`));
      s.player.pos = { ...s.world.landmarks.find(l => l.kind === 'gate')!.pos };
      if (stage === 1) for (const kind of ['lungs', 'legs'] as const) s.player.genome.parts.push({ id: kind, kind, axial: 0, angle: 1, scale: 1, mirrored: false });
      expect(tryTransition(s)).toBe(true);
      expect(s.lineageHistory!.stages[stage].closed).toMatchObject({ outcome: 'passage', source: 'action' });
      expect(s.lineageHistory!.stages[stage + 1]).toMatchObject({ coverage: 'complete', closed: null });
      const history = structuredClone(s.lineageHistory); expect(tryTransition(s)).toBe(false); expect(s.lineageHistory).toEqual(history);
      expect(parseGame(serializeGame(s)).lineageHistory).toEqual(history);
    }
  });
  it('preserves SP-005 population snapshot and SP-006 markers through enabled recovery and save/load', () => {
    const designs = buildNpcDesigns([], 481516);
    const s = createGame(481516, false, true, true, true, true, true, designs, true, true);
    const loaded = parseGame(serializeGame(s)), restored = recoverGeneration(loaded);
    expect(restored.worlds[2]!.creatureDesigns).toEqual(designs);
    expect(restored.cellGrowth).toEqual(s.cellGrowth);
    expect(restored.creatureStage!.discovery).toEqual(s.creatureStage!.discovery);
    expect(restored.lineageHistory).toEqual(s.lineageHistory);
  });
  it('rejects counts beyond actual lifetime totals', () => {
    const s = land(); s.lineageHistory!.stages[2].counts!.meals.meat = 100;
    expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
    s.lineageHistory!.stages[2].counts!.meals.meat = 0; s.lineageHistory!.stages[2].counts!.hunts = 100;
    expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
  });
  it('rejects a checkpoint that silently changes an already inherited bonus', () => {
    const s = finished('social'); continueToTribeEra(s);
    const c = JSON.parse(s.checkpoint!); c.lineageHistory.stages[2].closed = { outcome: 'social', source: 'saved', at: null }; s.checkpoint = JSON.stringify(c);
    expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
  });
  it.each([
    ['version', (s: GameState) => { (s.lineageHistory as any).version = 2; }],
    ['duplicate stage', (s: GameState) => { s.lineageHistory!.stages[1].stage = 0; }],
    ['negative food', (s: GameState) => { s.lineageHistory!.stages[2].counts!.meals.meat = -1; }],
    ['fractional food', (s: GameState) => { s.lineageHistory!.stages[2].counts!.meals.meat = .5; }],
    ['future time', (s: GameState) => { s.lineageHistory!.stages[2].started!.tick = s.tick + 1; }],
    ['wrong route', (s: GameState) => { s.lineageHistory!.stages[2].closed!.outcome = 'predator'; }],
    ['duplicate fact', (s: GameState) => { s.lineageHistory!.stages[2].facts.push(s.lineageHistory!.stages[2].facts[0]); }],
    ['invented fact', (s: GameState) => { s.lineageHistory!.stages[2].facts[0].key = 'nest:invented'; }],
    ['mismatched checkpoint', (s: GameState) => { const c = JSON.parse(s.checkpoint!); delete c.lineageHistory; s.checkpoint = JSON.stringify(c); }],
  ] as const)('rejects malformed history: %s', (_, change) => {
    const s = finished('social'); change(s);
    expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }))).toThrow();
  });
});
