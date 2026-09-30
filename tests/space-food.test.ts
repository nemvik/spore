import { describe, expect, it } from 'vitest';
import { starSystems } from '../src/game/galaxy';
import { activateBiosphere } from '../src/game/space-biosphere';
import { activateForeignEcology } from '../src/game/space-ecology';
import { FOREIGN_FOOD, stepForeignFood } from '../src/game/space-food';
import { createForeignPlanet, spaceLifeSpecies } from '../src/game/space-life';

// Explicitly prepared physiology experiments, not native campaign evidence.
function prepared() {
  const home = 'food-regression', source = createForeignPlanet(starSystems(home)[1]);
  const e = activateBiosphere({ version: 1, generator: 1, worlds: [source], cargo: [], scans: [], actions: [], nextAction: 1, energySpent: 0 }, home, 0);
  activateForeignEcology(e, 0);
  return { e, w: e.worlds[0] };
}

describe('C3 actual food, diet and physiological rates (prepared unit experiments)', () => {
  it('grows concrete plant biomass and charges a compatible producer for a grazer meal', () => {
    const { e, w } = prepared(), plant = w.life[0], grazer = w.life[3];
    w.life = [plant, grazer]; plant.nutrition = .5; grazer.nutrition = .5;
    expect(spaceLifeSpecies(e, grazer)!.diet).toContain('algae');
    const out = stepForeignFood(e, w, 1 / 30);
    expect(out.plantMeals).toBeCloseTo(.001, 12); expect(out.preyMeals).toBe(0);
    expect(plant.nutrition).toBeCloseTo(.5 + FOREIGN_FOOD.plantGrowth / 30 - .001, 12);
    expect(grazer.nutrition).toBeCloseTo(.5 - .018 / 30 + .04 / 30, 12);
    expect(out.deaths).toEqual([]);
  });

  it('does not feed across habitat bands or use the cargo as a producer', () => {
    const { e, w } = prepared(), plant = w.life[0], grazer = w.life[3];
    w.life = [grazer]; e.cargo.push(plant); grazer.nutrition = .5;
    const cargo = structuredClone(plant); expect(stepForeignFood(e, w, 1 / 30).plantMeals).toBe(0);
    expect(plant).toEqual(cargo); expect(grazer.nutrition).toBeCloseTo(.5 - .018 / 30, 12);
    e.cargo = []; w.life.push(plant); plant.habitat.band = 2;
    expect(stepForeignFood(e, w, 1 / 30).plantMeals).toBe(0);
  });

  it('uses the saved source genome diet instead of the nominal grazer label', () => {
    const { e, w } = prepared(), plant = w.life[0], grazer = w.life[3];
    const design = w.designs.find(d => d.species === 'bell')!;
    // A mouthless prepared model cannot graze, even though the taxon says herbivore.
    design.creation.genome.parts = design.creation.genome.parts.filter(part => !['filter', 'proboscis', 'jaw', 'recycler'].includes(part.kind));
    w.life = [plant, grazer]; grazer.nutrition = .5;
    expect(spaceLifeSpecies(e, grazer)!.diet).not.toContain('algae');
    expect(stepForeignFood(e, w, 1 / 30).plantMeals).toBe(0);
    expect(grazer.nutrition).toBeCloseTo(.5 - .018 / 30, 12);
  });

  it('a real prey meal damages the concrete victim and resets only the actual hunter', () => {
    const { e, w } = prepared(), prey = w.life[3], hunter = w.life[5];
    w.life = [prey, hunter]; hunter.nutrition = .5;
    const out = stepForeignFood(e, w, 1 / 30);
    expect(out.preyMeals).toBeCloseTo(.25 / 30, 12); expect(hunter.habitat.sinceHunt).toBe(0);
    expect(prey.health).toBeCloseTo(100 - .25 / 30 + .2 / 30, 10);
    expect(hunter.nutrition).toBeCloseTo(.5 - .018 / 30 + .04 / 30, 12);
  });

  it('can eat actual detritus but never invents a hunt or a predator birth', () => {
    const { e, w } = prepared(), detritus = w.life[1], hunter = w.life[5];
    w.life = [detritus, hunter]; hunter.nutrition = .8; hunter.habitat.reproduction = 59.999;
    expect(spaceLifeSpecies(e, hunter)!.diet).toContain('detritus');
    const out = stepForeignFood(e, w, 1 / 30);
    expect(out.preyMeals).toBe(0); expect(out.plantMeals).toBeGreaterThan(0);
    expect(hunter.habitat.sinceHunt).toBe(120); expect(hunter.habitat.reproduction).toBe(0); expect(out.parents).toEqual([]);
    expect(hunter.nutrition).toBeCloseTo(.8, 12);
  });

  it.each(['hunger', 'climate', 'predation'] as const)('reports concrete %s death without deleting it before the atomic lifecycle transaction', cause => {
    const { e, w } = prepared(), victim = w.life[3], hunter = w.life[5];
    victim.health = .001; w.life = [victim];
    if (cause === 'hunger') victim.nutrition = 0;
    if (cause === 'climate') { w.temperature = 1; w.atmosphere = 1; }
    if (cause === 'predation') { hunter.nutrition = .5; w.life.push(hunter); }
    const result = stepForeignFood(e, w, 1 / 30);
    expect(result.deaths).toEqual([{ life: victim, cause }]); expect(victim.health).toBe(0); expect(w.life).toContain(victim);
  });

  it('climate unsupported life loses health and biomass cannot rescue its reproduction', () => {
    const { e, w } = prepared(), plant = w.life[0]; w.life = [plant];
    plant.nutrition = .5; w.temperature = 1; w.atmosphere = 1;
    stepForeignFood(e, w, 1 / 30);
    expect(plant.health).toBeCloseTo(100 - .6 / 30, 12); expect(plant.nutrition).toBe(.5);
    expect(plant.habitat.reproduction).toBe(0);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('does not mutate on invalid duration %s', duration => {
    const { e, w } = prepared(), before = structuredClone(e);
    expect(stepForeignFood(e, w, duration)).toEqual({ deaths: [], parents: [], plantMeals: 0, preyMeals: 0 }); expect(e).toEqual(before);
  });

  it('caps a single physiology call at one actual frame rather than simulating a supplied long jump', () => {
    const a = prepared(), b = prepared();
    expect(stepForeignFood(a.e, a.w, 600)).toEqual(stepForeignFood(b.e, b.w, 1 / 30)); expect(a.e).toEqual(b.e);
  });
});
