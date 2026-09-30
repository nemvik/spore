import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createGame, evolve, makeCheckpoint, recoverGeneration, senseRange, step, transitionRequirements, tryTransition } from '../src/game/simulation';
import { CELL_THRESHOLDS, inspectCellSite, recordCellMeal } from '../src/game/cell-growth';
import { activeCellAdaptation, creatureInheritance, type CellAdaptation } from '../src/game/lineage-history';
import { cloneGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { cellGuide } from '../src/ui/cell-growth';
import { speciesInheritanceMarkup } from '../src/ui/species-inheritance';
import { civilizationInheritance } from '../src/game/civilization';
import { spaceInheritance } from '../src/game/space-inheritance';
import { domesticIncomeMultiplier, effectiveMachineIncome, machineIncome } from '../src/game/machines';
import { tribeInheritance } from '../src/game/lineage-history';

const fresh = () => createGame(8675309, false, true, true, true, true, true, undefined, true, true);
function adapted(part: CellAdaptation) {
  const s = fresh();
  for (let i = 0; i < 7; i++) recordCellMeal(s);
  s.player.pos = { ...s.cellGrowth!.sites[part === 'spines' ? 0 : 1].pos };
  expect(inspectCellSite(s)).toBe(true);
  s.player.pos = { ...s.world.landmarks[0].pos };
  const draft = cloneGenome(s.player.genome);
  draft.parts.push({ id: 'inherited-organ', kind: part, axial: 0, angle: 1.57, scale: 1, mirrored: false });
  expect(evolve(s, draft, part).ok).toBe(true);
  return s;
}
function reef(s: GameState) {
  s.player.pos = { ...s.world.landmarks.find(l => l.kind === 'gate')!.pos };
  expect(tryTransition(s)).toBe(true);
  return s;
}
describe('short opening and the existing inheritance tree', () => {
  it('requires earned growth and a used discovery, without requiring the three ecology loops', () => {
    expect(CELL_THRESHOLDS).toEqual([0, 2, 4, 7]);
    const s = fresh();
    expect(transitionRequirements(s).every(r => r.met)).toBe(false);
    for (let i = 0; i < 7; i++) recordCellMeal(s);
    expect(transitionRequirements(s).filter(r => !r.met)).toHaveLength(1);
    const done = adapted('spines');
    expect(done.journey.sites.filter(site => site.resolved)).toHaveLength(0);
    expect(transitionRequirements(done).every(r => r.met)).toBe(true);
    expect(cellGuide(done)?.title).toBe('Útes je otevřený');
    reef(done);
    expect(parseGame(serializeGame(done)).stage).toBe(1);
  });
  it('preserves a historically finished ecology exit and does not invent adaptation', () => {
    const s = parseGame(readFileSync('tests/fixtures/evolution/legacy-cell-complete.save.json', 'utf8'));
    expect(transitionRequirements(s).every(r => r.met)).toBe(true);
    expect(s.lineageHistory?.cellAdaptation).toBeUndefined();
    reef(s); expect(activeCellAdaptation(s)).toBeNull();
  });
  it.each(['spines', 'antenna'] as const)('%s survives rebuild, transition, repeated load and checkpoints without multiplying effects', part => {
    let s = adapted(part);
    const choice = structuredClone(s.lineageHistory!.cellAdaptation);
    const body = cloneGenome(s.player.genome); body.parts = body.parts.filter(p => p.kind !== part);
    expect(evolve(s, body).ok).toBe(true);
    expect(evolve(s, body, part).ok).toBe(false);
    reef(s);
    for (let i = 0; i < 3; i++) s = parseGame(serializeGame(s));
    expect(s.lineageHistory!.cellAdaptation).toEqual(choice);
    expect(activeCellAdaptation(s)).toBe(part);
    expect(recoverGeneration(s).lineageHistory!.cellAdaptation).toEqual(choice);
    expect(s.player.genome.parts.some(p => p.kind === part)).toBe(false);
    expect(creatureInheritance(s).route).toBeNull();
  });
  it('antenna history provides a real sonar option, charges energy and shares the cooldown', () => {
    const s = reef(adapted('antenna')), before = senseRange(s), energy = s.player.energy;
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(s.player.scan).toBeGreaterThan(4);
    expect(senseRange(s)).toBe(before + 35);
    expect(s.player.energy).toBeLessThan(energy - 2.9);
    expect(s.lineageHistory!.usedEffects).toEqual(['cell']);
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(s.lineageHistory!.usedEffects).toEqual(['cell']);
    makeCheckpoint(s); expect(parseGame(serializeGame(recoverGeneration(s))).lineageHistory).toEqual(s.lineageHistory);
  });
  it('spine history repels only nearby visible predators and never damages them', () => {
    const s = reef(adapted('spines')), predator = s.world.creatures.find(c => c.species === 'ribbon')!;
    predator.pos = { ...s.player.pos, x: s.player.pos.x + 4 }; predator.fear = 0;
    const health = predator.health;
    step(s, { ...EMPTY_INPUT, pulse: true });
    expect(predator.fear).toBeGreaterThan(5);
    expect(predator.health).toBe(health);
    expect(parseGame(serializeGame(s)).player.abilityRecharge).toBe(s.player.abilityRecharge);
    expect(s.player.scan).toBe(0);
    expect(s.lineageHistory!.usedEffects).toEqual(['cell']);
  });
  it.each(['future', 'unearned', 'checkpoint', 'duplicate-use'] as const)('rejects corrupt inheritance: %s', kind => {
    const s = reef(adapted('antenna')), data = JSON.parse(serializeGame(s));
    if (kind === 'future') data.state.lineageHistory.cellAdaptation.at.tick++;
    if (kind === 'unearned') data.state.lineageHistory.cellAdaptation.part = 'spines';
    if (kind === 'checkpoint') delete data.state.lineageHistory.cellAdaptation;
    if (kind === 'duplicate-use') data.state.lineageHistory.usedEffects = ['cell', 'cell'];
    expect(() => parseGame(JSON.stringify(data))).toThrow();
  });
  it.each(['military', 'conversion', 'civic'] as const)('preserves evidenced %s civilization and combines it with the creature result', name => {
    const s = parseGame(readFileSync(`tests/fixtures/civilization/native-${name}-campaign.save.json`, 'utf8'));
    const c = civilizationInheritance(s), philosophy = spaceInheritance(s);
    expect(c.methods).toContain(name === 'civic' ? 'trade' : name);
    expect(philosophy.civilization).toEqual(c.methods);
    expect(speciesInheritanceMarkup(s)).toContain('Dědictví druhu');
    for (let i = 0; i < 3; i++) expect(spaceInheritance(parseGame(serializeGame(s)))).toEqual(philosophy);
  });
  it('speeds only the completed domestic economy while retaining the actual tribe multiplier', () => {
    const s = parseGame(readFileSync('tests/fixtures/civilization/native-civic-campaign.save.json', 'utf8'));
    expect(domesticIncomeMultiplier(s)).toBe(1); // already in the next era
    s.stage = 4;
    expect(domesticIncomeMultiplier(s)).toBe(2);
    expect(effectiveMachineIncome(s)).toBeCloseTo(machineIncome(s.machines as import('../src/game/era-types').ActiveMachineState) * tribeInheritance(s).income * 2);
    if (s.machines?.version === 2) s.machines.completed = false;
    expect(domesticIncomeMultiplier(s)).toBe(1);
  });
});


describe('unchanged publicly exported review checkpoints', () => {
  it.each(readdirSync('tests/fixtures/evolution').filter(f=>f.endsWith('.save.json')))('%s keeps history, receipts and recoverable checkpoint', file => {
    const text=readFileSync(`tests/fixtures/evolution/${file}`,'utf8'),s=parseGame(text);
    expect(parseGame(serializeGame(s))).toEqual(s);
    const recovered=recoverGeneration(s);expect(parseGame(serializeGame(recovered))).toEqual(recovered);
  });
});
