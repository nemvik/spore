import { describe, expect, it } from 'vitest';
import { SPECIES } from '../src/game/content';
import { ECOLOGY_CATALOG, ecologyTaxon, inheritEcologyContacts, recordEcologyContact } from '../src/game/ecology-catalog';
import { actOnJourney, initializeJourneyStage, recordConsumption } from '../src/game/journey';
import { SITE_STORIES } from '../src/game/journey-content';
import type { EcologyContact } from '../src/game/journey-types';
import { createGame } from '../src/game/simulation';
import type { WorldStage } from '../src/game/stage';
import type { GameState } from '../src/game/types';
import { createWorld, spawnCreature } from '../src/game/world';

/** Prepared visited worlds isolate historical evidence; this is not a playthrough. */
function visited(legacy = false): GameState {
  const s = createGame(481516, legacy, !legacy, !legacy);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  delete s.journey.ecology;
  return s;
}
function keys(s: GameState): string[] { return inheritEcologyContacts(s).contacts.map(contact => contact.key); }
function selectWorld(s: GameState, stage: WorldStage): void { s.stage = stage; s.world = s.worlds[stage]!; }
function plant(s: GameState, id: number): void {
  const site = s.journey.sites.find(site => site.id === id)!;
  const taxon = ecologyTaxon(`culture:${id}`)!;
  selectWorld(s, taxon.stage);
  const resource = { ...structuredClone(s.world.resources.find(r => r.id === site.sourceId)!), id: s.world.nextId++, pos: { ...site.refuges[0] } };
  s.world.resources.push(resource); site.plantedId = resource.id; site.vitality = 100;
}

describe('native ecological taxonomy', () => {
  it('contains the nine explicitly living mothers and all ten native species once', () => {
    expect(ECOLOGY_CATALOG).toHaveLength(19);
    expect(new Set(ECOLOGY_CATALOG.map(taxon => taxon.key)).size).toBe(19);
    expect(ECOLOGY_CATALOG.filter(taxon => taxon.role === 'producer')).toHaveLength(9);
    SITE_STORIES.forEach((story, site) => {
      expect(ecologyTaxon(`culture:${site}`)).toMatchObject({ key: `culture:${site}`, role: 'producer', site, species: null, food: story.kind, stage: Math.floor(site / 3) });
      expect(ecologyTaxon(`culture:${site}`)!.name.length).toBeGreaterThan(5);
    });
    for (const species of SPECIES) {
      expect(ecologyTaxon(`species:${species.id}`)).toMatchObject({ species: species.id, site: null, stage: species.stage, name: species.name });
      expect(species.diet).toContain(ecologyTaxon(`species:${species.id}`)!.food);
    }
  });

  it('counts invasive gnaw as herbivorous while retaining partners outside that group', () => {
    expect(ECOLOGY_CATALOG.filter(taxon => taxon.role === 'herbivore').map(taxon => taxon.species)).toEqual(['veil', 'sail', 'bell', 'gnaw']);
    expect(ECOLOGY_CATALOG.filter(taxon => taxon.role === 'predator').map(taxon => taxon.species)).toEqual(['needle', 'ribbon', 'crest']);
    expect(ECOLOGY_CATALOG.filter(taxon => taxon.role === 'partner').map(taxon => taxon.species)).toEqual(['lantern', 'mender', 'gloom']);
  });

  it.each(['', 'culture:9', 'culture:01', 'species:player', 'species:unknown', 'food:mineral', 'food:detritus', '__proto__'])('does not invent a taxon for %s', key => {
    expect(ecologyTaxon(key)).toBeNull();
  });
});

describe('opt-in completed contact recording', () => {
  it('leaves the entire historical state untouched when the ledger is absent', () => {
    const s = visited(), before = structuredClone(s);
    expect(recordEcologyContact(s, 'species:bell', 'feeding', 2, 0)).toBe(false);
    expect(s).toEqual(before); expect(s.journey).not.toHaveProperty('ecology');
  });

  it('adds one native contact without changing RNG, DNA, worlds, or other state', () => {
    const s = visited(); s.journey.ecology = { version: 1, contacts: [] };
    const before = structuredClone(s);
    expect(recordEcologyContact(s, 'species:gnaw', 'feeding', 2, 1)).toBe(true);
    expect(s.journey.ecology.contacts).toEqual([{ key: 'species:gnaw', method: 'feeding', stage: 2, patch: 1 }]);
    before.journey.ecology = structuredClone(s.journey.ecology);
    expect(s).toEqual(before);
  });

  it('deduplicates by taxon across methods and localities without rewriting first provenance', () => {
    const s = visited(); s.journey.ecology = { version: 1, contacts: [] };
    expect(recordEcologyContact(s, 'species:bell', 'feeding', 2, 0)).toBe(true);
    const before = structuredClone(s);
    expect(recordEcologyContact(s, 'species:bell', 'hunt', 2, 1)).toBe(false);
    expect(s).toEqual(before);
  });

  it.each([
    ['culture:1', 'culture', 0, 1],
    ['culture:8', 'culture', 2, 2],
    ['species:crest', 'hunt', 2, null],
    ['species:gloom', 'bond', 2, null],
    ['species:gloom', 'feeding', 2, 2],
    ['species:gloom', 'hunt', 2, 2],
  ] as const)('accepts %s via %s with honest native provenance', (key, method, stage, patch) => {
    const s = visited(); s.journey.ecology = { version: 1, contacts: [] };
    expect(recordEcologyContact(s, key, method, stage, patch)).toBe(true);
  });

  const invalid: { key: string; method: string; stage: number; patch: number | null }[] = [
    { key: 'species:invented', method: 'feeding', stage: 2, patch: 1 },
    { key: 'species:bell', method: 'observe', stage: 2, patch: 1 },
    { key: 'species:bell', method: 'culture', stage: 2, patch: 1 },
    { key: 'species:bell', method: 'bond', stage: 2, patch: 1 },
    { key: 'culture:6', method: 'hunt', stage: 2, patch: 0 },
    { key: 'culture:6', method: 'feeding', stage: 2, patch: 0 },
    { key: 'culture:6', method: 'bond', stage: 2, patch: 0 },
    { key: 'culture:6', method: 'culture', stage: 2, patch: 1 },
    { key: 'species:bell', method: 'feeding', stage: 1, patch: 0 },
    { key: 'species:bell', method: 'feeding', stage: 5, patch: 0 },
    { key: 'species:bell', method: 'feeding', stage: NaN, patch: 0 },
    ...[-1, 3, .5, NaN, Infinity].map(patch => ({ key: 'species:bell', method: 'feeding', stage: 2, patch })),
  ];
  it.each(invalid)('rejects invalid taxonomy/provenance without mutation: $key $method $stage/$patch', invalid => {
    const s = visited(); s.journey.ecology = { version: 1, contacts: [] };
    const before = structuredClone(s), contact = invalid as EcologyContact;
    expect(recordEcologyContact(s, contact.key, contact.method, contact.stage, contact.patch)).toBe(false);
    expect(s).toEqual(before);
  });
});

describe('conservative historical contact inheritance', () => {
  it.each([false, true])('ignores sightings, natural populations and aggregate counters, legacy=%s', legacy => {
    const s = visited(legacy);
    for (const world of s.worlds) if (world) for (const patch of world.patches) Object.assign(patch, { discovered: true, harvested: 100, hunted: 100, restored: 100 });
    s.journey.sites.forEach(site => { site.observed = true; site.phase = 1; });
    s.journey.insights = ['observe:0', 'observe:6', 'taste:algae', 'taste:nectar', 'taste:mineral', 'taste:detritus', 'first-meal', 'resolve:0'];
    s.campaign.journals = ['field:0:0:forage', 'field:1:0:hunt', 'field:2:2:bond', 'field:2:1:restore'];
    s.campaign.won = true; s.campaign.finale = 'restoration'; s.player.meals = 999; s.player.kills = 999;
    expect(inheritEcologyContacts(s)).toEqual({ version: 1, contacts: [] });
  });

  it('inherits a real mother sampling action, but not its preceding observation', () => {
    const s = createGame(481516, false); delete s.journey.ecology;
    const site = s.journey.sites[0]; s.player.pos = { ...site.source }; s.player.cooldown = 0;
    expect(actOnJourney(s)).toBe(true); expect(site.observed).toBe(true);
    expect(keys(s)).toEqual([]);
    s.player.cooldown = 0;
    expect(actOnJourney(s)).toBe(true); expect(s.journey.cargo).toMatchObject({ purpose: 'culture', site: 0 });
    expect(inheritEcologyContacts(s).contacts).toEqual([{ key: 'culture:0', stage: 0, patch: 0, method: 'culture' }]);
  });

  it('retains culture knowledge after the carried or planted resource is gone', () => {
    const s = visited(); s.journey.insights = ['carry:1', 'carry:5'];
    expect(inheritEcologyContacts(s).contacts).toEqual([
      { key: 'culture:1', stage: 0, patch: 1, method: 'culture' },
      { key: 'culture:5', stage: 1, patch: 2, method: 'culture' },
    ]);
  });

  it('recognizes a live planted reference without requiring a still-present carry insight', () => {
    const s = visited(); plant(s, 6);
    expect(keys(s)).toEqual(['culture:6']);
    const planted = s.journey.sites[6].plantedId;
    s.world.resources = s.world.resources.filter(r => r.id !== planted);
    expect(keys(s)).toEqual([]);
  });

  it('does not turn ordinary carried food into a living culture', () => {
    const s = visited(); s.journey.cargo = { kind: 'nectar', purpose: 'food', site: 6, vitality: 100, distance: 0 };
    expect(keys(s)).toEqual([]);
    s.journey.cargo.purpose = 'culture'; expect(keys(s)).toEqual(['culture:6']);
    s.journey.cargo.kind = 'detritus'; expect(keys(s)).toEqual([]);
  });

  it('ignores malformed or unvisited historical IDs', () => {
    const s = createGame(481516, false); delete s.journey.ecology;
    s.journey.insights = ['carry:01', 'carry:-1', 'carry:9', 'carry:8', 'hunt:unknown', 'hunt:crest'];
    expect(keys(s)).toEqual([]);
  });

  it('retains direct hunts even after extinction without inventing a patch', () => {
    const s = visited(); s.journey.insights = ['hunt:needle', 'hunt:gnaw', 'hunt:crest'];
    for (const world of s.worlds) if (world) world.creatures = [];
    expect(inheritEcologyContacts(s).contacts).toEqual([
      { key: 'species:needle', stage: 0, patch: null, method: 'hunt' },
      { key: 'species:gnaw', stage: 2, patch: null, method: 'hunt' },
      { key: 'species:crest', stage: 2, patch: null, method: 'hunt' },
    ]);
  });

  it.each([false, true])('inherits actual bonds once and preserves their unknown locality, legacy=%s', legacy => {
    const s = visited(legacy);
    s.player.bonds = [{ species: 'gloom', benefit: 'recycle', hunger: 85, loyalty: 5, age: 100 }, { species: 'gloom', benefit: 'recycle', hunger: 20, loyalty: 90, age: 5 }];
    expect(inheritEcologyContacts(s).contacts).toEqual([{ key: 'species:gloom', stage: 2, patch: null, method: 'bond' }]);
  });

  it.each([
    [0, 'cultivate', 4, 'veil'], [3, 'cultivate', 4, 'sail'],
    [6, 'guide', 4, 'bell'], [7, 'guide', 4, 'bell'],
    [8, 'guide', 5, 'gloom'], [8, 'cultivate', 5, 'gloom'],
  ] as const)('recognizes the narrowly proved meal at site %i', (id, method, phase, species) => {
    const s = visited(), site = s.journey.sites[id];
    Object.assign(site, { resolved: true, method, phase });
    expect(inheritEcologyContacts(s).contacts).toEqual([{ key: `species:${species}`, stage: site.stage, patch: site.patch, method: 'feeding' }]);
  });

  it('records an actual NPC meal on a planted mother and can infer its historical outcome', () => {
    const s = visited(); plant(s, 0); s.world.creatures = [];
    const site = s.journey.sites[0], food = s.world.resources.find(r => r.id === site.plantedId)!;
    const veil = spawnCreature(s.world, 'veil', 0); veil.pos = { ...food.pos }; s.world.creatures.push(veil);
    food.amount -= .35; recordConsumption(s, veil, food);
    expect(site).toMatchObject({ resolved: true, method: 'cultivate' });
    expect(keys(s)).toEqual(['culture:0', 'species:veil']);
  });

  it('does not infer an animal meal from old automatic reef planting', () => {
    const s = visited(), site = s.journey.sites[4];
    Object.assign(site, { resolved: true, method: 'cultivate', phase: 4 });
    s.journey.version = 2; delete s.journey.canopy;
    expect(keys(s)).toEqual([]);
    s.journey.version = 3;
    expect(keys(s)).toEqual([]);
    s.journey.canopy = { crustId: 1, capId: 2, roofIds: [3, 4, 5, 6], releasedAt: null };
    expect(keys(s)).toEqual([]);
    s.journey.canopy.releasedAt = 42;
    expect(inheritEcologyContacts(s).contacts).toEqual([{ key: 'species:sail', stage: 1, patch: 1, method: 'feeding' }]);
  });

  it('does not grant unrelated cultures or animal contacts from a generic resolved site', () => {
    const s = visited();
    for (const site of s.journey.sites) Object.assign(site, { resolved: true, method: 'hunt', phase: 4 });
    expect(keys(s)).toEqual([]);
    Object.assign(s.journey.sites[8], { method: 'guide', phase: 4 });
    expect(keys(s)).toEqual([]);
  });

  it('ignores a lure that was only placed and feedingHome from an unspecified meat source', () => {
    const s = visited(), crest = s.world.creatures.find(c => c.species === 'crest')!;
    const resource = s.world.resources[0];
    s.journey.offerings.push({ stage: 2, id: resource.id, site: 6, remaining: 60 });
    s.journey.hunters.push({ id: crest.id, stage: 2, phase: 'recover', time: 2, aim: { ...resource.pos }, feedingHome: { ...resource.pos } });
    expect(keys(s)).toEqual([]);
  });

  it.each(['carried', 'roots'] as const)('recognizes actual gnaw tissue dispersal from %s', mode => {
    const s = visited(), site = s.journey.sites[6];
    if (mode === 'carried') {
      const gnaw = s.world.creatures.find(c => c.species === 'gnaw')!;
      s.journey.rootDispersal!.carried.push({ carrierId: gnaw.id, site: 6, origin: { ...site.refuges[0] }, vitality: 12 });
    } else {
      const resource = { ...structuredClone(s.world.resources.find(r => r.id === site.sourceId)!), id: s.world.nextId++, regen: 0, amount: 1, max: 1 };
      s.world.resources.push(resource);
      s.journey.rootDispersal!.roots.push({ resourceId: resource.id, site: 6, vitality: 12 });
    }
    expect(inheritEcologyContacts(s).contacts).toEqual([{ key: 'species:gnaw', stage: 2, patch: 0, method: 'feeding' }]);
  });

  it('ignores broken dispersal references rather than creating evidence from numbers alone', () => {
    const s = visited();
    s.journey.rootDispersal!.carried.push({ carrierId: s.world.nextId + 50, site: 6, origin: { x: 0, y: 0, z: 0 }, vitality: 12 });
    s.journey.rootDispersal!.roots.push({ resourceId: s.world.nextId + 51, site: 7, vitality: 12 });
    expect(keys(s)).toEqual([]);
  });

  it('preserves explicit ledger provenance, returns independent copies and is idempotent', () => {
    const s = visited();
    s.journey.ecology = { version: 1, contacts: [{ key: 'species:crest', stage: 2, patch: 1, method: 'feeding' }] };
    s.journey.insights = ['hunt:crest', 'carry:6'];
    const before = structuredClone(s), inherited = inheritEcologyContacts(s);
    expect(s).toEqual(before);
    expect(inherited.contacts[0]).toEqual(before.journey.ecology!.contacts[0]);
    expect(inherited.contacts[0]).not.toBe(s.journey.ecology.contacts[0]);
    expect(inherited.contacts).not.toBe(s.journey.ecology.contacts);
    s.journey.ecology = structuredClone(inherited);
    expect(inheritEcologyContacts(s)).toEqual(inherited);
    inherited.contacts[0].patch = 0;
    expect(s.journey.ecology.contacts[0].patch).toBe(1);
  });
});
