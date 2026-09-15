import { describe, expect, it } from 'vitest';
import { terraceGuidance, TERRACE_COPY } from '../src/game/terrace-guidance';
import { createGame, step } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { initializeJourneyStage, journeyHint, plantedStatus } from '../src/game/journey';
import { landSiteSupport } from '../src/game/climate';
import { JOURNEY_COPY } from '../src/game/journey-content';
import { groundHeight } from '../src/game/random';
import { EMPTY_INPUT } from '../src/game/types';
import type { HunterMemory } from '../src/game/journey-types';

const point = (x: number, z = -30) => ({ x, y: groundHeight(x, z, 2) + 1.2, z });

/** Prepared status scenes retain the actual authored terrace and its source.
 * Creature isolation makes the represented identity unambiguous. The meal
 * cases then use only public simulation steps until a real portion is eaten;
 * these are guidance regressions, not native campaign evidence. */
function scene() {
  const s = createGame(20260913, false);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  const site = s.journey.sites.find(site => site.id === 7)!;
  site.observed = true;
  const bell = s.world.creatures.find(c => c.patch === 1 && c.species === 'bell')!;
  const hunter = s.world.creatures.find(c => c.patch === 1 && c.species === 'crest')!;
  s.world.creatures = [bell, hunter]; s.journey.hunters = [];
  Object.assign(bell, { health: 32, hunger: 20, fear: 0, target: null, intent: 'rest' });
  Object.assign(hunter, { health: 55, hunger: 20, fear: 0, target: null, intent: 'rest' });
  s.player.pos = { ...site.source };
  return { s, site, bell, hunter };
}
function learned(fixture: ReturnType<typeof scene>, x: number, phase: HunterMemory['phase'] = 'stalk') {
  const { s, hunter } = fixture;
  const memory: HunterMemory = { id: hunter.id, stage: 2, phase, time: .5, aim: point(x), feedingHome: point(x) };
  s.journey.hunters.push(memory); return memory;
}
function plant(fixture: ReturnType<typeof scene>) {
  const { s, site } = fixture;
  const root = { id: s.world.nextId++, kind: 'algae' as const, pos: { ...site.refuges[1] }, amount: 8, max: 12, regen: .09, patch: 1 };
  s.world.resources.push(root); site.plantedId = root.id; site.phase = 3; site.vitality = 80;
  return root;
}
function allText(fixture: ReturnType<typeof scene>) {
  const guidance = terraceGuidance(fixture.s, fixture.site)!;
  return [guidance.text, ...guidance.choices].join(' ');
}

describe('live guidance for the authored land crossing', () => {
  it('describes the real two-mouth terrace before claiming any learned feeding place', () => {
    const fixture = scene(), { s, site } = fixture;
    expect(site.source).toMatchObject({ x: 37, z: -20 });
    expect(s.world.obstacles.filter(o => o.kind === 'tree' && o.radius === 2.3 && o.pos.x === 30)).toHaveLength(7);
    const hint = journeyHint(s)!;
    expect(hint.site.id).toBe(7); expect(hint.title).toBe('Dvě cesty k prameni');
    expect(hint.text).toBe(TERRACE_COPY.crossing); expect(hint.choices).toContain(TERRACE_COPY.memory);
    expect(allText(fixture)).not.toContain('si pamatuje jídlo');
  });

  it.each([
    [22, 'na západní straně stromů'],
    [37, 'na otevřené východní straně'],
  ] as const)('names the actual meal learned at x=%i only after its portion is consumed', (x, side) => {
    const fixture = scene(), { s, hunter } = fixture;
    hunter.pos = point(x + 6); hunter.hunger = 70; s.player.pos = point(0, 0);
    const food = { id: s.world.nextId++, kind: 'meat' as const, pos: point(x), amount: 1, max: 1, regen: 0, patch: 1 };
    s.world.resources.push(food); s.journey.offerings.push({ id: food.id, stage: 2, site: 7, remaining: 120 });
    expect(allText(fixture)).not.toContain('si pamatuje jídlo');
    step(s, EMPTY_INPUT);
    expect(food.amount).toBe(1); expect(hunter.intent).toBe('forage');
    expect(allText(fixture)).not.toContain('si pamatuje jídlo');
    for (let tick = 0; tick < 600 && food.amount >= 1; tick++) step(s, EMPTY_INPUT);
    expect(food.amount).toBe(0);
    expect(s.journey.hunters.find(h => h.id === hunter.id && h.stage === 2)!.feedingHome).toEqual(hunter.pos);
    expect(allText(fixture)).toContain(`si pamatuje jídlo ${side}`);
    expect(allText(fixture)).toContain('Je sytý');
  });

  it('uses the saved feeding focus rather than the hunter’s present side of the trees', () => {
    const fixture = scene(); learned(fixture, 22); fixture.hunter.pos = point(45);
    expect(allText(fixture)).toContain('si pamatuje jídlo na západní straně stromů');
    expect(allText(fixture)).not.toContain('si pamatuje jídlo na otevřené');
  });

  it.each([
    ['stalk', 20, 'Je sytý'], ['recover', 40, 'Je sytý'],
    ['windup', 20, 'Dokončuje rozběhnutý útok'], ['lunge', 20, 'Dokončuje rozběhnutý útok'],
    ['stalk', 41, 'Znovu má hlad'],
  ] as const)('describes %s at hunger %i without calling a committed attack safe', (phase, hunger, expected) => {
    const fixture = scene(); fixture.hunter.hunger = hunger; learned(fixture, 37, phase);
    expect(allText(fixture)).toContain(expected);
    if (phase === 'windup' || phase === 'lunge') expect(allText(fixture)).not.toContain('Je sytý');
  });

  it('does not borrow a dead or foreign-stage hunter’s remembered meal', () => {
    const fixture = scene(), { s, hunter } = fixture;
    const memory = learned(fixture, 22); memory.stage = 1;
    expect(allText(fixture)).not.toContain('si pamatuje jídlo');
    memory.stage = 2; hunter.health = 0;
    expect(allText(fixture)).not.toContain('si pamatuje jídlo');
  });

  it('explains pasture placement only for its actual culture, retaining ordinary food guidance', () => {
    const fixture = scene(), { s, site } = fixture;
    s.journey.cargo = { site: 7, kind: 'algae', purpose: 'culture', vitality: 88, distance: 0 };
    expect(journeyHint(s)).toMatchObject({ title: 'Vyber budoucí průchod', text: TERRACE_COPY.carry, site });
    s.journey.cargo.purpose = 'food';
    expect(journeyHint(s)!.title).not.toBe('Vyber budoucí průchod');
    expect(journeyHint(s)!.text).toContain('běžná potrava nevytvoří nový porost');
    s.journey.cargo.purpose = 'culture'; s.journey.cargo.site = 6;
    expect(terraceGuidance(s, site)!.title).toBe('Dvě cesty k prameni');
  });

  it('distinguishes hungry invaders from fed bodies and actual root-bound natives from flight', () => {
    const fixture = scene(), { s, site, bell } = fixture, root = plant(fixture);
    const gnaw = spawnCreature(s.world, 'gnaw', 1); gnaw.pos = { ...root.pos }; gnaw.hunger = 70;
    s.world.creatures.push(gnaw);
    expect(plantedStatus(s, site)!.title).toBe('Odděl žrouty od nové pastvy');
    gnaw.hunger = 28;
    expect(plantedStatus(s, site)!.text).not.toContain('Hladoví žrouti');
    bell.intent = 'forage'; bell.target = root.id;
    expect(plantedStatus(s, site)!.text).toContain('Zvonkonoši přicházejí');
    bell.intent = 'flee';
    expect(plantedStatus(s, site)!.text).not.toContain('Zvonkonoši přicházejí');
  });

  it('keeps local extinction recovery ahead of the terrace despite a living bell elsewhere', () => {
    const fixture = scene(), { s, site, bell } = fixture; plant(fixture); bell.health = 0;
    s.world.creatures.push({ ...bell, id: s.world.nextId++, patch: 0, health: 32 });
    expect(terraceGuidance(s, site)).toBeNull();
    const hint = journeyHint(s)!;
    expect(hint.title).toBe('Pastva potřebuje živého návštěvníka');
    expect(hint.choices.join(' ')).toMatch(/T · probudit zárodek zvonkonoše/);
    expect(hint.text).not.toContain('Západní cesta');
  });

  it('prioritizes actual local recovery while preserving the carried culture before planting', () => {
    const { s, site, bell } = scene(); bell.health = 0;
    s.world.creatures.push({ ...bell, id: s.world.nextId++, patch: 0, health: 32 });
    s.journey.cargo = { site: 7, kind: 'algae', purpose: 'culture', vitality: 88, distance: 0 };
    expect(site.plantedId).toBeNull();
    const before = structuredClone(s), hint = journeyHint(s)!;
    expect(hint.title).toContain('živého návštěvníka');
    expect(hint.choices.join(' ')).toContain('T · probudit zárodek zvonkonoše');
    expect(hint.text).not.toContain('najdi kořenový kruh');
    expect(s).toEqual(before);
  });

  it('keeps lost living support ahead of remembered success and reports partial support truthfully', () => {
    const fixture = scene(), { s, site } = fixture; plant(fixture); learned(fixture, 37);
    site.resolved = true; site.method = 'cultivate'; site.vitality = 37;
    expect(landSiteSupport(s, site)).toBe(.37);
    expect(plantedStatus(s, site)!.text).toContain('37 %');
    site.vitality = 0;
    expect(terraceGuidance(s, site)).toBeNull();
    expect(journeyHint(s)).toMatchObject({ title: JOURNEY_COPY.supportLost, text: JOURNEY_COPY.deadRootHistory });
    expect(site.resolved).toBe(true);
  });

  it.each(['old world', 'v2', 'legacy', 'won', 'other stage', 'other site', 'unobserved'] as const)
  ('does not describe an authored encounter in the %s state', mode => {
    const { s, site } = scene();
    if (mode === 'old world') s.world.obstacles = s.world.obstacles.filter(o => !(o.kind === 'tree' && o.radius === 2.3));
    if (mode === 'v2') s.journey.version = 2;
    if (mode === 'legacy') s.journey.legacy = true;
    if (mode === 'won') s.campaign.won = true;
    if (mode === 'other stage') s.stage = 1;
    if (mode === 'other site') site.id = 6;
    if (mode === 'unobserved') site.observed = false;
    const before = JSON.stringify(s);
    expect(terraceGuidance(s, site)).toBeNull(); expect(JSON.stringify(s)).toBe(before);
  });

  it('does not reorder world actors, write memory or consume RNG when projected repeatedly', () => {
    const fixture = scene(), { s, site } = fixture; plant(fixture); learned(fixture, 22);
    const other = spawnCreature(s.world, 'crest', 1); other.pos = { ...s.player.pos };
    s.world.creatures.unshift(other);
    const before = structuredClone(s), serialized = JSON.stringify(s);
    for (let i = 0; i < 10; i++) { terraceGuidance(s, site); plantedStatus(s, site); journeyHint(s); }
    expect(s).toEqual(before); expect(JSON.stringify(s)).toBe(serialized);
  });
});
