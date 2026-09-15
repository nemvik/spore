import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/simulation';
import { initializeJourneyStage } from '../src/game/journey';
import { createWorld, spawnCreature } from '../src/game/world';
import { recordRootDispersalMeal, rootCarrier, rootlet, ROOT_DISPERSAL_COPY, stepRootDispersal } from '../src/game/root-dispersal';
import type { GameState, Resource } from '../src/game/types';

// Hook-level fixtures: these calls model a meal already consumed by the NPC
// loop. Public-step integration and save migration are verified separately.
function scene(siteId = 6) {
  const s = createGame(8675309, false, true);
  s.stage = 2; s.world = createWorld(s.seed, 2); s.worlds[2] = s.world; initializeJourneyStage(s);
  const site = s.journey.sites.find(site => site.id === siteId)!;
  const mother = s.world.resources.find(resource => resource.id === site.sourceId)!;
  const parent: Resource = { id: s.world.nextId++, kind: mother.kind, pos: { ...site.refuges[0] }, amount: 8, max: 12, regen: 0, patch: site.patch };
  s.world.resources.push(parent); site.plantedId = parent.id; site.vitality = 100;
  const c = spawnCreature(s.world, 'gnaw', site.patch); c.pos = { ...parent.pos }; c.health = 55;
  s.world.creatures = [c];
  return { s, site, parent, c, state: s.journey.rootDispersal! };
}
function foodAt(s: GameState, pos: Resource['pos'], kind: Resource['kind'] = 'detritus') {
  const food: Resource = { id: s.world.nextId++, kind, pos: { ...pos }, amount: .65, max: 1, regen: 0, patch: 1 };
  s.world.resources.push(food); return food;
}

describe('finite root-fragment transfers after actual meals', () => {
  it.each([1, 7, 12, 100])('reserves only the tissue lost to the caller’s next bite at %i vitality', vitality => {
    const { s, site, parent, c, state } = scene(); site.vitality = vitality;
    const rng = s.world.rng, dna = s.player.dna, resources = s.world.resources.length;
    expect(recordRootDispersalMeal(s, c, parent)).toBe(ROOT_DISPERSAL_COPY.acquired);
    expect(site.vitality).toBe(vitality); // Only recordConsumption owns this debit.
    expect(state.carried).toEqual([{ carrierId: c.id, site: site.id, origin: parent.pos, vitality: Math.min(12, vitality) }]);
    site.vitality = Math.max(0, site.vitality - 12); // Documented caller contract.
    expect(site.vitality + state.carried[0].vitality).toBe(vitality);
    expect(s.world.rng).toBe(rng); expect(s.player.dna).toBe(dna); expect(s.world.resources).toHaveLength(resources);
  });

  it.each(['absent', 'legacy', 'v2', 'aquatic'] as const)('makes no state changes when dispersal is %s', mode => {
    const { s, parent, c } = scene();
    if (mode === 'absent') delete s.journey.rootDispersal;
    if (mode === 'legacy') s.journey.legacy = true;
    if (mode === 'v2') s.journey.version = 2;
    if (mode === 'aquatic') { s.stage = 1; s.world.stage = 1; }
    const before = JSON.stringify(s);
    expect(recordRootDispersalMeal(s, c, parent)).toBeNull(); stepRootDispersal(s);
    expect(rootCarrier(s, c.id)).toBeNull(); expect(rootlet(s, parent.id)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });

  it.each(['dead', 'absent', 'grazer', 'mother', 'home', 'dead-root'] as const)('does not acquire from an ineligible %s meal', condition => {
    const { s, site, parent, c, state } = scene(condition === 'home' ? 8 : 6);
    if (condition === 'dead') c.health = 0;
    if (condition === 'absent') s.world.creatures = [];
    if (condition === 'grazer') c.species = 'bell';
    if (condition === 'dead-root') site.vitality = 0;
    const food = condition === 'mother' ? s.world.resources.find(r => r.id === site.sourceId)! : parent;
    expect(recordRootDispersalMeal(s, c, food)).toBeNull(); expect(state.carried).toEqual([]);
  });

  it('does not multiply tissue on another bite while carrying and preserves the bitten origin after replanting', () => {
    const { s, parent, c, site, state } = scene();
    recordRootDispersalMeal(s, c, parent);
    const origin = { ...parent.pos }, fragment = structuredClone(state.carried[0]);
    expect(recordRootDispersalMeal(s, c, parent)).toBeNull();
    parent.pos.x += 30; site.plantedId = null;
    expect(state.carried).toEqual([fragment]); expect(state.carried[0].origin).toEqual(origin);
  });

  it.each([6, 7])('deposits parent-site %i food at the real eater after a later meal beyond eight horizontal metres', id => {
    const { s, parent, c, state } = scene(id);
    parent.amount = .15; // The legitimate last meal has already been debited.
    recordRootDispersalMeal(s, c, parent);
    c.pos = { ...parent.pos, x: parent.pos.x + 8, y: parent.pos.y + 20 };
    const food = foodAt(s, c.pos);
    expect(recordRootDispersalMeal(s, c, food)).toBeNull(); expect(state.carried).toHaveLength(1);
    c.pos.x += .01; c.pos.y = parent.pos.y; food.pos = { ...c.pos };
    const nextId = s.world.nextId, rng = s.world.rng;
    expect(recordRootDispersalMeal(s, c, food)).toBe(ROOT_DISPERSAL_COPY.deposited);
    expect(state.carried).toEqual([]); expect(state.roots).toEqual([{ resourceId: nextId, site: id, vitality: 12 }]);
    const child = s.world.resources.find(resource => resource.id === nextId)!;
    expect(child).toMatchObject({ kind: parent.kind, pos: c.pos, amount: 1, max: 1, regen: 0 });
    expect(child.pos).not.toBe(c.pos); expect(s.world.nextId).toBe(nextId + 1); expect(s.world.rng).toBe(rng);
  });

  it('deposits carried tissue at another parent without also taking new tissue on that meal', () => {
    const { s, c, parent, state } = scene(); recordRootDispersalMeal(s, c, parent);
    const other = s.journey.sites.find(site => site.id === 7)!;
    const otherRoot = foodAt(s, other.refuges[0], 'algae'); other.plantedId = otherRoot.id;
    c.pos = { ...otherRoot.pos };
    expect(recordRootDispersalMeal(s, c, otherRoot)).toBe(ROOT_DISPERSAL_COPY.deposited);
    expect(state.carried).toEqual([]); expect(state.roots).toHaveLength(1);
  });

  it('keeps an empty child food resource alive, but destroys a separately bitten child without grandchildren', () => {
    const { s, c, parent, state } = scene(); recordRootDispersalMeal(s, c, parent);
    c.pos.x += 10; recordRootDispersalMeal(s, c, foodAt(s, c.pos));
    const child = s.world.resources.find(resource => resource.id === state.roots[0].resourceId)!;
    child.amount = .65; c.species = 'bell';
    expect(recordRootDispersalMeal(s, c, child)).toBeNull();
    child.amount = 0; // Separately prepared empty portion, not another NPC meal.
    stepRootDispersal(s);
    expect(rootlet(s, child.id)?.vitality).toBe(12); expect(s.world.resources).toContain(child);
    const eaten = scene(); recordRootDispersalMeal(eaten.s, eaten.c, eaten.parent);
    eaten.c.pos.x += 10; recordRootDispersalMeal(eaten.s, eaten.c, foodAt(eaten.s, eaten.c.pos));
    const bittenChild = eaten.s.world.resources.find(resource => resource.id === eaten.state.roots[0].resourceId)!;
    bittenChild.amount = .65;
    expect(recordRootDispersalMeal(eaten.s, eaten.c, bittenChild)).toBe(ROOT_DISPERSAL_COPY.destroyed);
    expect(eaten.state.carried).toEqual([]); expect(rootlet(eaten.s, bittenChild.id)?.vitality).toBe(0);
    stepRootDispersal(eaten.s);
    expect(rootlet(eaten.s, bittenChild.id)).toBeNull(); expect(eaten.s.world.resources).not.toContain(bittenChild);
  });

  it('a carrying invader can deposit at a child meal while destroying that child, without duplicating either fragment', () => {
    const { s, c, parent, state } = scene(); recordRootDispersalMeal(s, c, parent);
    const child = foodAt(s, { ...parent.pos, x: parent.pos.x + 10 }, 'nectar');
    state.roots.push({ resourceId: child.id, site: 6, vitality: 12 }); c.pos = { ...child.pos };
    expect(recordRootDispersalMeal(s, c, child)).toContain(ROOT_DISPERSAL_COPY.deposited);
    expect(state.carried).toEqual([]); expect(state.roots.map(root => root.vitality)).toEqual([0, 12]);
    stepRootDispersal(s); expect(state.roots).toHaveLength(1); expect(s.world.resources).not.toContain(child);
  });

  it('reserves bounded child capacity for already carried fragments', () => {
    const { s, c, parent, state } = scene();
    for (let i = 0; i < 31; i++) {
      const r = foodAt(s, parent.pos, parent.kind); state.roots.push({ resourceId: r.id, site: 6, vitality: 12 });
    }
    recordRootDispersalMeal(s, c, parent);
    const other = spawnCreature(s.world, 'gnaw', 0); other.pos = { ...parent.pos }; s.world.creatures.push(other);
    expect(recordRootDispersalMeal(s, other, parent)).toBeNull(); expect(state.carried).toHaveLength(1);
    c.pos.x += 10; recordRootDispersalMeal(s, c, foodAt(s, c.pos));
    expect(state.roots).toHaveLength(32); expect(state.carried).toEqual([]);
    expect(recordRootDispersalMeal(s, other, parent)).toBeNull();
  });

  it('prunes dead carriers and missing roots without touching clocks, living food portions or other resources', () => {
    const { s, c, parent, state } = scene(); recordRootDispersalMeal(s, c, parent);
    state.roots.push({ resourceId: s.world.nextId++, site: 6, vitality: 12 });
    c.health = 0; const resources = structuredClone(s.world.resources), time = s.world.time, tick = s.tick, rng = s.world.rng;
    stepRootDispersal(s);
    expect(state.carried).toEqual([]); expect(state.roots).toEqual([]); expect(s.world.resources).toEqual(resources);
    expect(s.world.time).toBe(time); expect(s.tick).toBe(tick); expect(s.world.rng).toBe(rng);
  });

  it('retains tissue at the save resource bound, then can deposit at a later meal once space exists', () => {
    const { s, c, parent, state } = scene(); recordRootDispersalMeal(s, c, parent);
    c.pos.x += 10; const food = foodAt(s, c.pos);
    while (s.world.resources.length < 512) foodAt(s, c.pos);
    const nextId = s.world.nextId, fragment = structuredClone(state.carried[0]);
    expect(recordRootDispersalMeal(s, c, food)).toBeNull();
    expect(s.world.resources).toHaveLength(512); expect(s.world.nextId).toBe(nextId); expect(state.carried).toEqual([fragment]);
    s.world.resources.pop();
    expect(recordRootDispersalMeal(s, c, food)).toBe(ROOT_DISPERSAL_COPY.deposited);
    expect(s.world.resources).toHaveLength(512); expect(state.carried).toEqual([]);
  });

  it('lookups and context copy leave the full game state unchanged', () => {
    const { s, c, parent } = scene(); recordRootDispersalMeal(s, c, parent);
    const before = JSON.stringify(s);
    expect(rootCarrier(s, c.id)?.vitality).toBe(12); expect(rootCarrier(s, -1)).toBeNull(); expect(rootlet(s, parent.id)).toBeNull();
    expect(ROOT_DISPERSAL_COPY.rootlet(12)).toContain('12 %'); expect(JSON.stringify(s)).toBe(before);
  });
});
