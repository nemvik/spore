import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, step, transitionRequirements, transitionStatus, tryTransition } from '../src/game/simulation';
import { activeSites, initializeJourneyStage, journeyEndingStatus, journeyFinale, journeyHint, journeyRequirements, recordJourneyHunt } from '../src/game/journey';
import { cloneGenome, genomeCost, initialGenome } from '../src/game/genome';
import { createWorld, spawnCreature } from '../src/game/world';
import { parseGame, serializeGame } from '../src/game/persistence';
import { PROGRESSION_COPY } from '../src/game/progression-copy.cs';
import { SITE_STORIES, siteOutcome } from '../src/game/journey-content';
import { CHAPTERS, TEXT } from '../src/game/content';
import { EMPTY_INPUT } from '../src/game/types';
import type { GameState, Stage } from '../src/game/types';
import type { EcologySite } from '../src/game/journey-types';

// Prepared readiness scenes verify displayed predicates against actual actions.
// These are not earned campaign progression or browser/play-duration evidence.
function scene(stage: Stage) {
  const s = createGame(481516, false);
  for (let next = 1; next <= stage; next++) {
    s.stage = next as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.stage] = s.world; initializeJourneyStage(s);
  }
  s.world.creatures = []; s.player.genome = cloneGenome(s.player.genome);
  s.player.totalDna = 200; s.player.dna = genomeCost(initialGenome()) + 200 - genomeCost(s.player.genome);
  return s;
}
function organs(s: GameState, kinds: ('lungs' | 'legs' | 'symbiote' | 'reservoir')[]) {
  s.player.genome = cloneGenome(s.player.genome);
  for (const kind of kinds) s.player.genome.parts.push({ id: `readiness-${kind}`, kind, axial: 0, angle: 1.25, scale: 1, mirrored: false });
  s.player.dna = genomeCost(initialGenome()) + s.player.totalDna - genomeCost(s.player.genome);
}
function gate(s: GameState, horizontal: number, height = 1.1) {
  const pos = s.world.landmarks.find(l => l.kind === 'gate')!.pos;
  s.player.pos = { x: pos.x + horizontal, y: height, z: pos.z };
}
function learned(s: GameState) { activeSites(s).forEach(site => Object.assign(site, { observed: true, resolved: true, phase: 4, method: 'cultivate' })); }
function root(s: GameState, site: EcologySite, method: EcologySite['method'] = 'cultivate') {
  const resource = { id: s.world.nextId++, kind: SITE_STORIES[site.id].kind, pos: { ...site.refuges[0] }, amount: 8, max: 12, regen: 0, patch: site.patch };
  s.world.resources.push(resource);
  Object.assign(site, { plantedId: resource.id, vitality: 80, observed: true, resolved: true, phase: site.id === 8 ? 5 : 4, method });
  return resource;
}

describe('one gate readiness projection drives both hint and actual transition', () => {
  it.each([0, 1] as const)('shows the stage-%i gate nearby at 11m, but denies action with the same explicit distance reason', stage => {
    const s = scene(stage); learned(s); if (stage === 1) organs(s, ['legs', 'lungs']); gate(s, 11);
    const before = s.stage, status = transitionStatus(s);
    expect(status).toMatchObject({ kind: 'transition', nearGate: true, ready: false, distance: 11 });
    expect(status.detail).toContain('11.0 m'); expect(status.detail).toContain('10 m');
    expect(tryTransition(s)).toBe(false); expect(s.stage).toBe(before); expect(s.messages.at(-1)?.text).toBe(status.detail);
  });

  it.each([{ x: 10, y: 1.3, ready: true }, { x: 10, y: 12, ready: true }, { x: 10.0001, y: 9, ready: false }])('uses the exact existing horizontal threshold for $x m / height $y without inventing a depth gate', ({ x, y, ready }) => {
    const s = scene(1); learned(s); organs(s, ['legs', 'lungs']); gate(s, x, y);
    expect(transitionStatus(s).ready).toBe(ready); expect(tryTransition(s)).toBe(ready); expect(s.stage).toBe(ready ? 2 : 1);
  });

  it('names both missing land organs, then the remaining organ, and opens only when the shared requirements pass', () => {
    const s = scene(1); learned(s); gate(s, 9);
    const status = transitionStatus(s);
    expect(status.requirements).toEqual(transitionRequirements(s));
    expect(status.requirements.filter(r => !r.met).map(r => r.label)).toEqual([TEXT.requirementLungs, TEXT.requirementLegs]);
    expect(status.detail).toContain(TEXT.requirementLungs); expect(status.detail).toContain(TEXT.requirementLegs);
    expect(tryTransition(s)).toBe(false); expect(s.messages.at(-1)?.text).toBe(status.detail);
    organs(s, ['lungs']); expect(transitionStatus(s).detail).toContain(TEXT.requirementLegs); expect(transitionStatus(s).detail).not.toContain(TEXT.requirementLungs);
    organs(s, ['legs']); expect(transitionStatus(s).ready).toBe(true); expect(tryTransition(s)).toBe(true);
  });

  it('preserves legacy requirements, messages and successful transitions', () => {
    const s = createGame(481516, true);
    expect(tryTransition(s)).toBe(false); expect(s.messages.at(-1)?.text).toBe(TEXT.approachGate);
    s.campaign.stageMeals = CHAPTERS[0].meals; s.campaign.stageReproductions = 2;
    for (const patch of s.world.patches) { patch.discovered = true; s.campaign.journals.push(`field:0:${patch.id}:prepared-fixture`); }
    gate(s, 9); expect(transitionStatus(s).requirements).toEqual(transitionRequirements(s));
    expect(transitionStatus(s).ready).toBe(true); expect(tryTransition(s)).toBe(true);
  });

  it('matches legacy land readiness to the actual win guards and describes a ready lineage truthfully', () => {
    const s = scene(2); s.journey.legacy = true; organs(s, ['legs', 'lungs', 'symbiote', 'reservoir']); gate(s, 9);
    s.player.bonds = [{ species: 'gloom', benefit: 'recycle', hunger: 10, loyalty: 55, age: 121 }, { species: 'mender', benefit: 'shield', hunger: 10, loyalty: 55, age: 121 }];
    s.world.patches.forEach(patch => { patch.discovered = true; }); s.player.energy = 80;
    expect(transitionStatus(s)).toMatchObject({ ready: true, detail: PROGRESSION_COPY.legacyMigrationReady });
    for (const reason of ['won', 'health', 'deathReason']) {
      const blocked = structuredClone(s);
      if (reason === 'won') blocked.campaign.won = true;
      else if (reason === 'health') blocked.player.health = 0;
      else blocked.deathReason = 'prepared terminal fixture';
      expect(transitionStatus(blocked).ready).toBe(false); expect(tryTransition(blocked)).toBe(false);
      if (reason === 'won') expect(transitionStatus(blocked).detail).toBe(PROGRESSION_COPY.sandbox);
    }
    expect(tryTransition(s)).toBe(true); expect(s.campaign.finale).toBe('migration');
  });
});

describe('land readiness distinguishes current life, learned history and alternate endings', () => {
  it('reports a missing carrier meal even when every historical resolved flag is true', () => {
    const s = scene(2); organs(s, ['legs', 'lungs']); activeSites(s).forEach(site => root(s, site));
    const home = activeSites(s)[2]; home.phase = 3;
    expect(activeSites(s).every(site => site.resolved)).toBe(true);
    expect(transitionStatus(s)).toMatchObject({ kind: 'ending', ready: false, nearGate: false });
    expect(transitionRequirements(s)[2]).toMatchObject({ met: false, value: 'čeká na spory' });
    expect(tryTransition(s)).toBe(false); expect(s.messages.at(-1)?.text).toContain('prachokřídlík'); expect(s.campaign.won).toBe(false);
  });

  it('retains learned history but reports failed living support and gives a land-specific continuation near a completed hunted site', () => {
    const s = scene(2), [west, east, home] = activeSites(s); organs(s, ['legs', 'lungs']);
    const native = spawnCreature(s.world, 'bell', 0); s.world.creatures.push(native);
    Object.assign(west, { observed: true, resolved: true, method: 'hunt', phase: 4 });
    s.player.pos = { ...west.source };
    expect(journeyHint(s)?.text).toBe(siteOutcome(west));
    expect(journeyHint(s)?.choices.join(' ')).not.toMatch(/G otevře|cestu potomka/);
    expect(journeyRequirements(s)[0].met).toBe(true);
    root(s, east); root(s, home); east.vitality = 0;
    expect(transitionStatus(s).requirements[1]).toMatchObject({ met: false, value: 'poznáno · opora zanikla' });
    expect(east.resolved).toBe(true); expect(journeyEndingStatus(s).routes[0]).toMatchObject({ met: false, value: '1 / 2 právě žijí' });
    expect(tryTransition(s)).toBe(false); expect(s.messages.at(-1)?.text).toBe(PROGRESSION_COPY.supportNeeded);
  });

  it.each(['restoration', 'predator', 'migration'] as const)('explains an eligible %s ending without forcing migration through G, then the ordinary next step chooses that ending', path => {
    const s = scene(2), [west, east, home] = activeSites(s); organs(s, ['legs', 'lungs']);
    root(s, home, path === 'migration' ? 'guide' : 'cultivate');
    if (path === 'migration') {
      organs(s, ['symbiote', 'reservoir']);
      s.player.bonds = [{ species: 'gloom', benefit: 'recycle', hunger: 10, loyalty: 55, age: 0 }, { species: 'mender', benefit: 'shield', hunger: 10, loyalty: 55, age: 0 }];
      expect(transitionRequirements(s).every(r => r.met)).toBe(false); // Landscape and symbiosis are alternatives.
    } else { root(s, west, path === 'predator' ? 'hunt' : 'cultivate'); root(s, east, path === 'predator' ? 'hunt' : 'cultivate'); }
    expect(journeyFinale(s)).toBe(path); expect(transitionStatus(s)).toMatchObject({ ready: true, detail: PROGRESSION_COPY.endingReady });
    const dead = structuredClone(s); dead.player.health = 0;
    expect(transitionStatus(dead).ready).toBe(false); expect(tryTransition(dead)).toBe(false); expect(dead.campaign.won).toBe(false);
    expect(tryTransition(s)).toBe(false); expect(s.campaign.won).toBe(false); expect(s.messages.at(-1)?.text).toBe(PROGRESSION_COPY.endingReady);
    step(s, EMPTY_INPUT); expect(s.campaign).toMatchObject({ won: true, finale: path });
  });

  it('explains sandbox continuation without suggesting another northern gate', () => {
    const s = scene(2); s.campaign.won = true; s.campaign.sandbox = true; s.campaign.finale = 'restoration';
    const status = transitionStatus(s); expect(status).toMatchObject({ kind: 'sandbox', ready: false, detail: PROGRESSION_COPY.sandbox });
    expect(tryTransition(s)).toBe(false); expect(s.messages.at(-1)?.text).toBe(PROGRESSION_COPY.sandbox);
    expect(journeyHint(s)?.text).toBe(PROGRESSION_COPY.sandbox);
  });

  it('keeps all readiness queries pure and preserves their result across a strict save and checkpoint roundtrip', () => {
    const s = scene(2); organs(s, ['legs', 'lungs']); activeSites(s).forEach(site => root(s, site)); activeSites(s)[1].vitality = 0;
    makeCheckpoint(s); const before = JSON.stringify(s), status = transitionStatus(s);
    for (let i = 0; i < 10; i++) { transitionStatus(s); journeyEndingStatus(s); journeyRequirements(s); journeyHint(s); }
    expect(JSON.stringify(s)).toBe(before);
    const loaded = parseGame(serializeGame(s)); expect(transitionStatus(loaded)).toEqual(status);
  });
});

describe('hunting outcomes describe the actual ecological method', () => {
  it.each([0, 1] as const)('records a stage-%i hunt without claiming a transplanted food source', stage => {
    const s = scene(stage), site = activeSites(s)[0];
    site.threatIds = [s.world.nextId++, s.world.nextId++];
    const removed = spawnCreature(s.world, stage === 0 ? 'veil' : 'ribbon', 0); removed.id = site.threatIds[0];
    if (stage === 0) { const survivor = spawnCreature(s.world, 'veil', 0); survivor.id = site.threatIds[1]; s.world.creatures.push(survivor); }
    recordJourneyHunt(s, removed, true);
    expect(site).toMatchObject({ resolved: true, method: 'hunt', plantedId: null });
    expect(siteOutcome(site)).toBe(SITE_STORIES[site.id].huntResult);
    expect(s.messages.at(-1)?.text).toContain(SITE_STORIES[site.id].huntResult!);
    expect(siteOutcome(site)).not.toBe(SITE_STORIES[site.id].result);
    site.method = 'cultivate'; expect(siteOutcome(site)).toBe(SITE_STORIES[site.id].result);
  });
});
