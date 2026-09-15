import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPECIES } from '../src/game/content';
import { genomeCost, initialGenome } from '../src/game/genome';
import { emptyJourney } from '../src/game/journey-types';
import { loadGame, loadGames, parseGame, saveGame, serializeGame } from '../src/game/persistence';
import { createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import type { GameState, Stage } from '../src/game/types';
import { createWorld } from '../src/game/world';

// Explicit serialization fixtures: no campaign completion or duration is implied.
function stagedFixture(stage: Stage): GameState {
  const state = createGame(481516);
  for (let index = 0; index <= stage; index++) state.worlds[index] = createWorld(state.seed, index as Stage);
  state.stage = stage; state.world = state.worlds[stage]!;
  state.player.pos = { ...state.world.landmarks[0].pos };
  state.player.dna = 71; state.player.totalDna = 105;
  state.player.generation = 3; state.campaign.stageReproductions = 2;
  state.world.patches[0].harvested = 7; state.world.patches[0].fertility = 0.73;
  state.world.resources[0].amount = 0;
  state.campaign.journals = [`field:${stage}:0:forage`];
  if (stage === 2) state.player.genome.parts.push(
    { id: 'fixture-legs', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: true },
    { id: 'fixture-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
  );
  makeCheckpoint(state);
  return state;
}

function journeyFixture(stage: Stage = 2): GameState {
  const state = stagedFixture(stage); state.journey = emptyJourney(false);
  // Preserve the historical v2 fixture contract. Fresh canopy campaigns have
  // separate physical-reference coverage in canopy-persistence.test.ts.
  state.journey.version = 2; delete state.journey.canopy;
  state.player.dna = genomeCost(initialGenome()) + state.player.totalDna - genomeCost(state.player.genome);
  for (let index = 0; index <= stage; index++) {
    const world = state.worlds[index]!;
    for (const patch of world.patches) {
      const resources = world.resources.filter(r => r.patch === patch.id && r.kind !== 'meat');
      const source = resources[0], plant = resources[1]; plant.amount = 0;
      state.journey.sites.push({
        id: index * 3 + patch.id, stage: index as Stage, patch: patch.id,
        source: { ...source.pos }, refuges: [{ ...patch.center }, { ...plant.pos }],
        sourceId: source.id, plantedId: plant.id, vitality: 80.25,
        observed: true, resolved: patch.id === 0, method: patch.id === 0 ? 'cultivate' : null,
        threatIds: world.creatures.filter(c => c.patch === patch.id).map(c => c.id), phase: 2,
      });
    }
    const hunter = world.creatures.find(c => SPECIES.find(s => s.id === c.species)!.role === 'predator')!;
    state.journey.hunters.push({ stage: index as Stage, id: hunter.id, phase: 'windup', time: 0.7, aim: { ...hunter.pos } });
    const offering = { id: world.nextId++, kind: 'detritus' as const, pos: { ...world.patches[0].center }, amount: 2, max: 2, patch: 0, regen: 0 };
    world.resources.push(offering);
    state.journey.offerings.push({ stage: index as Stage, id: offering.id, site: index * 3, remaining: 120 });
  }
  state.journey.cargo = { kind: 'algae', purpose: 'culture', site: stage * 3, vitality: 73.5, distance: 18.75 };
  state.journey.insights = ['source-observed:0', 'cultivated:0'];
  state.journey.echoes = ['first-refuge', 'shared-nutrition'];
  makeCheckpoint(state);
  return state;
}

function downgradeToV1(state: GameState): Record<string, any> {
  const value = JSON.parse(JSON.stringify(state));
  delete value.journey; value.version = 1;
  if (value.checkpoint) value.checkpoint = JSON.stringify(downgradeToV1(JSON.parse(value.checkpoint)));
  return value;
}
function oldEnvelope(state: GameState) {
  return { format: 'lumavora', version: 1, savedAt: 123456, state: downgradeToV1(state) };
}
function qualityV1Envelope(state: GameState, oldAccounting?: (value: Record<string, any>) => void) {
  const envelope = JSON.parse(serializeGame(state));
  const downgrade = (value: Record<string, any>) => {
    value.journey.version = 1; delete value.journey.canopy; oldAccounting?.(value);
    if (value.checkpoint) {
      const checkpoint = JSON.parse(value.checkpoint);
      downgrade(checkpoint); value.checkpoint = JSON.stringify(checkpoint);
    }
  };
  downgrade(envelope.state);
  return envelope;
}
function corrupt(change: (state: Record<string, any>) => void, stage: Stage = 2): string {
  const envelope = JSON.parse(serializeGame(journeyFixture(stage)));
  change(envelope.state);
  // JSON has two copies of the active world: ordinary reference tests update both.
  envelope.state.world = envelope.state.worlds[envelope.state.stage];
  return JSON.stringify(envelope);
}

afterEach(() => vi.unstubAllGlobals());

describe('explicit save v1 to v2 migration', () => {
  it.each([0, 1, 2] as const)('preserves every existing world and player field at stage%i, including its checkpoint', stage => {
    const original = oldEnvelope(stagedFixture(stage));
    const bytes = JSON.stringify(original), loaded = parseGame(bytes);
    expect(loaded.version).toBe(2); expect(loaded.journey).toEqual(emptyJourney(true));
    for (const key of ['id', 'seed', 'tick', 'rng', 'stage', 'player', 'worlds', 'world', 'campaign', 'lineage', 'messages', 'deathReason'] as const) {
      expect(loaded[key]).toEqual(original.state[key]);
    }
    expect(loaded.world).toBe(loaded.worlds[stage]);
    const oldCheckpoint = JSON.parse(original.state.checkpoint), checkpoint = JSON.parse(loaded.checkpoint!);
    expect(checkpoint.version).toBe(2); expect(checkpoint.journey).toEqual(emptyJourney(true));
    expect(checkpoint.worlds).toEqual(oldCheckpoint.worlds);
    expect(checkpoint.player).toEqual(oldCheckpoint.player);
    expect(checkpoint.campaign).toEqual(oldCheckpoint.campaign);
    const recovered = recoverGeneration(loaded);
    expect(recovered.world).toBe(recovered.worlds[stage]);
    expect(recovered.journey.legacy).toBe(true);
    expect(JSON.stringify(original)).toBe(bytes);
    const written = JSON.parse(serializeGame(loaded));
    expect(written.version).toBe(2); expect(written.state.version).toBe(2);
    expect(JSON.parse(written.state.checkpoint).version).toBe(2);
  });

  it('migrates an older-stage checkpoint without filling or regenerating its future worlds', () => {
    const state = stagedFixture(2), earlier = stagedFixture(1);
    earlier.id = state.id; earlier.player.generation = 2; earlier.campaign.stageReproductions = 1;
    earlier.checkpoint = null;
    state.checkpoint = JSON.stringify(earlier);
    const loaded = parseGame(JSON.stringify(oldEnvelope(state)));
    const checkpoint = JSON.parse(loaded.checkpoint!);
    expect(checkpoint.stage).toBe(1);
    expect(checkpoint.worlds[2]).toBeNull();
    expect(checkpoint.player.genome).toEqual(earlier.player.genome);
    expect(loaded.worlds[2]).toEqual(state.worlds[2]);
    expect(checkpoint.journey).toEqual(emptyJourney(true));
  });

  it('retains completed legacy campaigns and does not revoke their sandbox or earned DNA', () => {
    const state = stagedFixture(2);
    Object.assign(state.campaign, { won: true, sandbox: true, finale: 'restoration', drought: 0.12 });
    state.world.landmarks.filter(l => l.kind === 'spring').forEach(l => { l.charge = 10; });
    makeCheckpoint(state);
    const loaded = parseGame(JSON.stringify(oldEnvelope(state)));
    expect(loaded.campaign).toEqual(state.campaign);
    expect(loaded.player.dna).toBe(71);
    expect(loaded.journey.legacy).toBe(true);
  });

  it('reads old slots without rewriting them and upgrades only the explicitly saved slot', () => {
    const first = stagedFixture(0), second = stagedFixture(2); second.id += '-other'; makeCheckpoint(second);
    const firstBytes = JSON.stringify(oldEnvelope(first)), secondBytes = JSON.stringify(oldEnvelope(second));
    const records = new Map([[`lumavora:save:${first.id}`, firstBytes], [`lumavora:save:${second.id}`, secondBytes]]);
    const setItem = vi.fn((key: string, value: string) => { records.set(key, value); });
    vi.stubGlobal('localStorage', { get length() { return records.size; }, key: (index: number) => [...records.keys()][index] ?? null, getItem: (key: string) => records.get(key) ?? null, setItem });
    expect(loadGames()).toHaveLength(2);
    const loaded = loadGame(first.id);
    expect(setItem).not.toHaveBeenCalled();
    expect(records.get(`lumavora:save:${first.id}`)).toBe(firstBytes);
    expect(saveGame(loaded)).toEqual({ ok: true });
    expect(JSON.parse(records.get(`lumavora:save:${first.id}`)!).version).toBe(2);
    expect(records.get(`lumavora:save:${second.id}`)).toBe(secondBytes);
  });

  it('keeps the historical scan default explicit and rejects missing scan in a new journey', () => {
    const old = oldEnvelope(stagedFixture(0)); delete old.state.player.scan;
    const checkpoint = JSON.parse(old.state.checkpoint); delete checkpoint.player.scan;
    old.state.checkpoint = JSON.stringify(checkpoint);
    const loaded = parseGame(JSON.stringify(old));
    expect(loaded.player.scan).toBe(0);
    expect(JSON.parse(loaded.checkpoint!).player.scan).toBe(0);
    expect(() => parseGame(corrupt(state => { delete state.player.scan; }))).toThrow('player');
  });

  it('accepts only explicit supported versions and never ignores invented v1 fields', () => {
    for (const version of [0, 3, 999, '1', null]) {
      const old = oldEnvelope(stagedFixture(0)); old.version = version as number;
      expect(() => parseGame(JSON.stringify(old))).toThrow('verze');
    }
    const injected = oldEnvelope(stagedFixture(0)); injected.state.journey = emptyJourney(false);
    expect(() => parseGame(JSON.stringify(injected))).toThrow('neznámá pole');
    const mismatch = JSON.parse(serializeGame(journeyFixture(0))); mismatch.version = 1;
    expect(() => parseGame(JSON.stringify(mismatch))).toThrow('verze');
    const malformed = oldEnvelope(stagedFixture(0)); malformed.state.player.dna = -1;
    expect(() => parseGame(JSON.stringify(malformed))).toThrow('player.dna');
  });
});

describe('strict new-journey construction budget', () => {
  it('round-trips a cheaper body whose available DNA exceeds learned DNA', () => {
    const state = journeyFixture(0);
    state.player.genome.parts = [];
    state.player.dna = genomeCost(initialGenome()) + state.player.totalDna;
    makeCheckpoint(state);
    const loaded = parseGame(serializeGame(state));
    expect(loaded.player.dna).toBeGreaterThan(loaded.player.totalDna);
    expect(loaded.player.genome.parts).toEqual([]);
    expect(recoverGeneration(loaded).player.dna).toBe(loaded.player.dna);
  });

  it('uses the rounded installed genome cost and permits zero learned DNA', () => {
    const state = journeyFixture(0);
    state.player.genome.parts.find(p => p.kind === 'filter')!.scale = .65;
    state.player.totalDna = 0;
    const installed = genomeCost(state.player.genome);
    expect(installed).toBe(18);
    state.player.dna = genomeCost(initialGenome()) - installed;
    makeCheckpoint(state);
    const loaded = parseGame(serializeGame(state));
    expect(loaded.player.totalDna).toBe(0);
    expect(loaded.player.dna).toBe(4);
  });

  it('rejects both excess and missing available DNA in version 2 instead of silently repairing them', () => {
    for (const delta of [-1, 1]) {
      expect(() => parseGame(corrupt(state => { state.player.dna += delta; }, 0))).toThrow('player.dna');
    }
    expect(() => parseGame(corrupt(state => { state.player.totalDna = -1; }, 0))).toThrow('player.totalDna');
  });

  it('rejects an installed body beyond its learned budget even when available DNA is zero', () => {
    expect(() => parseGame(corrupt(state => {
      state.player.totalDna = 0; state.player.dna = 0;
      state.player.genome.parts.push({ id: 'unfunded-shell', kind: 'shell', axial: 0, angle: 0, scale: 1, mirrored: false });
    }, 0))).toThrow('player.dna');
  });

  it('applies the same identity inside generation checkpoints', () => {
    expect(() => parseGame(corrupt(state => {
      const checkpoint = JSON.parse(state.checkpoint);
      checkpoint.player.dna++;
      state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('player.dna');
  });

  it('retains legacy spending rules and never grants legacy refunds for a cheaper body', () => {
    const state = stagedFixture(0);
    state.player.genome.parts = []; state.player.dna = 71; state.player.totalDna = 105;
    makeCheckpoint(state);
    expect(parseGame(serializeGame(state)).player.dna).toBe(71);
    state.player.dna = 106; makeCheckpoint(state);
    expect(() => serializeGame(state)).toThrow('player.totalDna');
  });
});

describe('explicit journey v1 spending to v2 allocation migration', () => {
  it.each([0, 1, 2] as const)('recovers a spent 6 DNA edit fee at stage%i while preserving body, ecology and checkpoint', stage => {
    const current = journeyFixture(stage);
    // Historical j1 accounting charged 6 DNA even for a colour-only generation.
    // Recreate those saved balances, including the generation checkpoint.
    const old = qualityV1Envelope(current, state => { state.player.dna -= 6; });
    const bytes = JSON.stringify(old), loaded = parseGame(bytes);
    expect(loaded.journey.version).toBe(2);
    expect(loaded.player.totalDna).toBe(old.state.player.totalDna);
    expect(loaded.player.dna).toBe(old.state.player.dna + 6);
    expect(loaded.player.genome).toEqual(old.state.player.genome);
    expect(loaded.worlds).toEqual(old.state.worlds);
    expect(loaded.world).toBe(loaded.worlds[stage]);
    expect(loaded.lineage).toEqual(old.state.lineage);
    expect(loaded.journey).toEqual({ ...old.state.journey, version: 2 });
    const recovered = recoverGeneration(loaded), oldCheckpoint = JSON.parse(old.state.checkpoint);
    expect(recovered.journey.version).toBe(2);
    expect(recovered.player.dna).toBe(oldCheckpoint.player.dna + 6);
    expect(recovered.worlds).toEqual(oldCheckpoint.worlds);
    expect(JSON.stringify(old)).toBe(bytes);
    const rewritten = JSON.parse(serializeGame(loaded));
    expect(rewritten.version).toBe(2); expect(rewritten.state.version).toBe(2);
    expect(rewritten.state.journey.version).toBe(2);
    expect(JSON.parse(rewritten.state.checkpoint).journey.version).toBe(2);
    expect(parseGame(JSON.stringify(rewritten))).toEqual(loaded);
  });

  it('preserves old available DNA when the installed body requires a larger grandfathered budget', () => {
    const current = journeyFixture(2), installed = genomeCost(current.player.genome);
    const old = qualityV1Envelope(current, state => { state.player.totalDna = 70; state.player.dna = 12; });
    expect(installed - genomeCost(initialGenome()) + 12).toBeGreaterThan(70);
    const loaded = parseGame(JSON.stringify(old));
    expect(loaded.player.dna).toBe(12);
    expect(loaded.player.totalDna).toBe(installed - genomeCost(initialGenome()) + 12);
    expect(loaded.player.genome).toEqual(current.player.genome);
    expect(recoverGeneration(loaded).player.dna).toBe(12);
    expect(parseGame(serializeGame(loaded))).toEqual(loaded);
  });

  it('keeps the briefly emitted j1 allocation shape with free DNA above learned DNA', () => {
    const current = journeyFixture(0); current.player.genome.parts = [];
    current.player.dna = genomeCost(initialGenome()) + current.player.totalDna; makeCheckpoint(current);
    const loaded = parseGame(JSON.stringify(qualityV1Envelope(current)));
    expect(loaded.player).toEqual(current.player);
    expect(loaded.journey.version).toBe(2);
  });

  it('leaves legacy j1 spending balances untouched and retains their original inequality', () => {
    const legacy = stagedFixture(0), old = qualityV1Envelope(legacy);
    expect(parseGame(JSON.stringify(old)).player).toEqual(legacy.player);
    expect(parseGame(JSON.stringify(old)).journey).toEqual(emptyJourney(true));
    old.state.player.dna = old.state.player.totalDna + 1;
    expect(() => parseGame(JSON.stringify(old))).toThrow('player.totalDna');
  });

  it('still rejects invalid old accounting, unknown fields and unsupported journey versions', () => {
    for (const change of [
      (s: Record<string, any>) => { s.player.dna = -1; },
      (s: Record<string, any>) => { s.player.totalDna = null; },
      (s: Record<string, any>) => { s.player.totalDna = 0; s.player.dna = 40; },
      (s: Record<string, any>) => { s.journey.invented = true; },
      (s: Record<string, any>) => { s.journey.sites[0].refuges = []; },
      (s: Record<string, any>) => { s.journey.version = 0; },
      (s: Record<string, any>) => { s.journey.version = 4; },
      (s: Record<string, any>) => { s.journey.version = '1'; },
    ]) {
      const old = qualityV1Envelope(journeyFixture(0)); change(old.state);
      expect(() => parseGame(JSON.stringify(old))).toThrow('Poškozená');
    }
  });

  it('migrates an older checkpoint in an otherwise current save without repairing its current balance', () => {
    const current = journeyFixture(2), older = qualityV1Envelope(current, state => { state.player.dna -= 6; });
    const envelope = JSON.parse(serializeGame(current)); envelope.state.checkpoint = older.state.checkpoint;
    const loaded = parseGame(JSON.stringify(envelope));
    expect(loaded.player).toEqual(current.player);
    expect(recoverGeneration(loaded).player.dna).toBe(current.player.dna);
    envelope.state.player.dna--;
    expect(() => parseGame(JSON.stringify(envelope))).toThrow('player.dna');
  });
});

describe('strict persistent journey validation', () => {
  it.each([0, 1, 2] as const)('round-trips all available situation fields, resources and checkpoint at stage%i', stage => {
    const state = journeyFixture(stage), loaded = parseGame(serializeGame(state));
    expect(loaded).toEqual(state);
    expect(loaded.journey.sites).toHaveLength((stage + 1) * 3);
    expect(loaded.world).toBe(loaded.worlds[stage]);
    expect(recoverGeneration(loaded).journey).toEqual(state.journey);
    expect(loaded.journey.legacy).toBe(false);
    for (const site of loaded.journey.sites) {
      expect(loaded.worlds[site.stage]!.resources.find(r => r.id === site.plantedId)?.amount).toBe(0);
    }
  });

  it('rejects missing or unknown fields in every newly saved object type', () => {
    const paths = ['journey', 'site', 'cargo', 'hunter', 'offering'] as const;
    for (const path of paths) {
      expect(() => parseGame(corrupt(state => {
        const object = path === 'journey' ? state.journey : path === 'site' ? state.journey.sites[0] : path === 'cargo' ? state.journey.cargo : path === 'hunter' ? state.journey.hunters[0] : state.journey.offerings[0];
        object.invented = true;
      })), path).toThrow('neznámá pole');
    }
    expect(() => parseGame(corrupt(state => { delete state.journey; }))).toThrow('neznámá pole');
    expect(() => parseGame(corrupt(state => { delete state.journey.sites[0].refuges; }))).toThrow('neznámá pole');
  });

  it.each([0, 1, 2] as const)('rejects an empty non-legacy catalogue at stage%i even without cargo or a checkpoint', stage => {
    expect(() => parseGame(corrupt(state => {
      state.journey.sites = []; state.journey.cargo = null;
      state.journey.hunters = []; state.journey.offerings = []; state.checkpoint = null;
    }, stage))).toThrow('journey.sites');
  });

  it('requires all three distinct situations in every visited world, not just the active world', () => {
    for (let missing = 0; missing < 9; missing++) {
      expect(() => parseGame(corrupt(state => {
        state.journey.sites = state.journey.sites.filter((site: { id: number }) => site.id !== missing);
      })), `missing site ${missing}`).toThrow('journey.sites');
    }
    expect(() => parseGame(corrupt(state => {
      state.worlds[1] = null;
      state.journey.sites = state.journey.sites.filter((site: { stage: number }) => site.stage !== 1);
      state.journey.hunters = state.journey.hunters.filter((hunter: { stage: number }) => hunter.stage !== 1);
      state.journey.offerings = state.journey.offerings.filter((offer: { stage: number }) => offer.stage !== 1);
    }))).toThrow('state.worlds[1]');
  });

  it('rejects incomplete current and historical journey checkpoints before migration can hide the missing sites', () => {
    for (const version of [1, 2]) {
      expect(() => parseGame(corrupt(state => {
        const checkpoint = JSON.parse(state.checkpoint);
        checkpoint.journey.version = version;
        checkpoint.journey.sites = checkpoint.journey.sites.filter((site: { id: number }) => site.id !== 4);
        state.checkpoint = JSON.stringify(checkpoint);
      }))).toThrow('journey.sites');
      const old = qualityV1Envelope(journeyFixture(2));
      old.state.journey.version = version; old.state.journey.sites.pop();
      expect(() => parseGame(JSON.stringify(old))).toThrow('journey.sites');
    }
  });

  it('bounds every new collection and rejects empty refuge lists', () => {
    for (const [key, max] of [['sites', 9], ['insights', 128], ['echoes', 128], ['hunters', 384], ['offerings', 128]] as const) {
      expect(() => parseGame(corrupt(state => { state.journey[key] = Array(max + 1).fill(state.journey[key][0]); }))).toThrow('počet');
    }
    expect(() => parseGame(corrupt(state => { state.journey.sites[0].refuges = []; }))).toThrow('počet');
    expect(() => parseGame(corrupt(state => { state.journey.sites[0].refuges = Array(9).fill({ x: 0, y: 0, z: 0 }); }))).toThrow('počet');
    expect(() => parseGame(corrupt(state => { state.journey.sites[0].threatIds = Array(129).fill(1); }))).toThrow('počet');
  });

  it('rejects duplicate situations, memories, offerings, insight rewards and per-site threats', () => {
    for (const key of ['sites', 'hunters', 'offerings', 'insights', 'echoes'] as const) {
      expect(() => parseGame(corrupt(state => { state.journey[key][1] = state.journey[key][0]; }))).toThrow('Poškozená');
    }
    expect(() => parseGame(corrupt(state => { state.journey.sites[0].threatIds.push(state.journey.sites[0].threatIds[0]); }))).toThrow('identifikátory');
  });

  it('rejects invalid numbers, phases, enum values, text and future-stage references', () => {
    const changes = [
      (s: Record<string, any>) => { s.journey.version = 4; },
      (s: Record<string, any>) => { s.journey.legacy = 'false'; },
      (s: Record<string, any>) => { s.journey.sites[0].id = 8; },
      (s: Record<string, any>) => { s.journey.sites[0].vitality = 101; },
      (s: Record<string, any>) => { s.journey.sites[0].phase = 8.1; },
      (s: Record<string, any>) => { s.journey.sites[0].method = 'invented'; },
      (s: Record<string, any>) => { s.journey.sites[0].refuges[0].x = 1e100; },
      (s: Record<string, any>) => { s.journey.cargo.vitality = -1; },
      (s: Record<string, any>) => { s.journey.cargo.distance = Number.POSITIVE_INFINITY; },
      (s: Record<string, any>) => { s.journey.cargo.kind = 'money'; },
      (s: Record<string, any>) => { s.journey.hunters[0].time = 30.01; },
      (s: Record<string, any>) => { s.journey.hunters[0].phase = 'teleport'; },
      (s: Record<string, any>) => { s.journey.offerings[0].remaining = 301; },
      (s: Record<string, any>) => { s.journey.insights[0] = '\u0000'; },
      (s: Record<string, any>) => { s.journey.echoes[0] = 'x'.repeat(257); },
    ];
    for (const change of changes) expect(() => parseGame(corrupt(change))).toThrow('Poškozená');
    expect(() => parseGame(corrupt(state => { state.journey.sites[0].stage = 1; }, 0))).toThrow('stage');
    expect(() => parseGame(corrupt(state => { state.journey.hunters[0].stage = 1; }, 0))).toThrow('stage');
    expect(() => parseGame(corrupt(state => { state.journey.offerings[0].stage = 1; }, 0))).toThrow('stage');
  });

  it('requires live source/plant resources and a known cargo/offer site in the correct world', () => {
    expect(() => parseGame(corrupt(state => { state.journey.sites[0].sourceId = state.worlds[0].obstacles[0].id; }))).toThrow('sourceId');
    expect(() => parseGame(corrupt(state => { state.journey.sites[0].plantedId = state.worlds[0].nextId; }))).toThrow('plantedId');
    expect(() => parseGame(corrupt(state => { state.journey.cargo.site = 8; }, 0))).toThrow('cargo.site');
    expect(() => parseGame(corrupt(state => { state.journey.offerings[0].site = 3; }))).toThrow('site');
    expect(() => parseGame(corrupt(state => { state.worlds[1] = null; }))).toThrow('stage');
  });

  it('allows historical threat/hunter IDs and consumed offerings without accepting IDs of a different live entity type', () => {
    const state = journeyFixture(0), hunterId = state.journey.hunters[0].id, offeringId = state.journey.offerings[0].id;
    state.world.creatures = state.world.creatures.filter(c => c.id !== hunterId);
    state.world.resources = state.world.resources.filter(r => r.id !== offeringId);
    expect(parseGame(serializeGame(state)).journey).toEqual(state.journey);
    expect(() => parseGame(corrupt(state => { state.journey.sites[0].threatIds = [state.worlds[0].resources[0].id]; }, 0))).toThrow('threatIds');
    expect(() => parseGame(corrupt(state => { state.journey.hunters[0].id = state.worlds[0].creatures.find((c: { species: string }) => c.species === 'veil').id; }, 0))).toThrow('druh');
    expect(() => parseGame(corrupt(state => { state.journey.offerings[0].id = state.worlds[0].creatures[0].id; }, 0))).toThrow('id');
    expect(() => parseGame(corrupt(state => { state.journey.hunters[0].id = state.worlds[0].nextId; }, 0))).toThrow('id');
  });

  it('rejects carried samples from a previous stage in both the live state and its checkpoint', () => {
    // The old site genuinely exists, but transport cannot cross a transition.
    expect(() => parseGame(corrupt(state => { state.journey.cargo.site = 0; }))).toThrow('cargo.site');
    expect(() => parseGame(corrupt(state => {
      const checkpoint = JSON.parse(state.checkpoint);
      checkpoint.journey.cargo.site = 3;
      state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('cargo.site');
    expect(parseGame(serializeGame(journeyFixture(2))).journey.cargo?.site).toBe(6);
  });

  it('validates new fields recursively and refuses a checkpoint that changes campaign rules', () => {
    expect(() => parseGame(corrupt(state => {
      const checkpoint = JSON.parse(state.checkpoint); checkpoint.journey.cargo.site = 99; state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('cargo.site');
    expect(() => parseGame(corrupt(state => {
      const checkpoint = JSON.parse(state.checkpoint); checkpoint.journey.legacy = true; state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('nepatří');
    expect(() => parseGame(corrupt(state => {
      const checkpoint = JSON.parse(state.checkpoint); checkpoint.checkpoint = state.checkpoint; state.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('zanořenou');
  });
});
