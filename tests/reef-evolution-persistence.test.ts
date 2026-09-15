import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyJourney } from '../src/game/journey-types';
import { createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { initializeJourneyStage } from '../src/game/journey';
import { genomeCost, initialGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import type { GameState, Stage } from '../src/game/types';

/** Explicit persistence fixture, not earned gameplay. The marker is installed
 * before any reef authoring; every visited world and its sites remain intact. */
function fixture(stage: Stage = 0, optedIn = true): GameState {
  const s = createGame(8675309, false, true);
  if (optedIn) s.journey.reefEvolution = emptyJourney(false, false, true).reefEvolution;
  for (let visited = 1; visited <= stage; visited++) {
    s.stage = visited as Stage; s.world = createWorld(s.seed, s.stage); s.worlds[s.stage] = s.world;
    initializeJourneyStage(s);
  }
  if (stage === 2) {
    for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `reef-save-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: true });
    s.player.totalDna = 300; s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  }
  makeCheckpoint(s); return s;
}

function changed(change: (s: GameState) => void, original = fixture()) {
  const file = JSON.parse(serializeGame(original)) as { state: GameState };
  change(file.state);
  return JSON.stringify(file);
}

function editCheckpoint(s: GameState, change: (checkpoint: GameState) => void) {
  const checkpoint = JSON.parse(s.checkpoint!) as GameState;
  change(checkpoint); s.checkpoint = JSON.stringify(checkpoint);
}

describe('optional reef evolution rules and continuous save state', () => {
  it('opts in only when requested and never adds the marker to legacy journeys', () => {
    for (const journey of [emptyJourney(), emptyJourney(false, true), emptyJourney(true), emptyJourney(true, true, true)]) {
      expect(journey).not.toHaveProperty('reefEvolution');
    }
    expect(emptyJourney(false, false, true).reefEvolution).toEqual({ version: 1, pumping: 0 });
    expect(emptyJourney(false, true, true).rootDispersal).toEqual(emptyJourney(false, true).rootDispersal);
  });

  it('preserves the actual earned v14 reef entry, RNG, retained worlds and checkpoint exactly', () => {
    const bytes = readFileSync(new URL('../evidence/reef-body/baseline-play/earned-reef-entry.json', import.meta.url), 'utf8');
    const original = JSON.parse(bytes).state as GameState;
    const loaded = parseGame(bytes);
    expect(loaded.journey).not.toHaveProperty('reefEvolution');
    expect(JSON.parse(loaded.checkpoint!).journey).not.toHaveProperty('reefEvolution');
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(original));
    expect(parseGame(serializeGame(loaded))).toEqual(original);
    expect(loaded.world).toBe(loaded.worlds[1]);
  });

  it.each([0, 1, 2] as const)('keeps old stage %i saves and checkpoint markers absent without rebuilding a world', stage => {
    const old = fixture(stage, false), bytes = JSON.stringify(old);
    const loaded = parseGame(serializeGame(old));
    expect(JSON.stringify(loaded)).toBe(bytes);
    expect(loaded.journey).not.toHaveProperty('reefEvolution');
    expect(recoverGeneration(loaded).journey).not.toHaveProperty('reefEvolution');
  });

  it.each([0, 1, 2] as const)('round-trips the actual opening in stage %i independently of root dispersal', stage => {
    for (const pumping of [0, .425, 1]) {
      const s = fixture(stage); s.journey.reefEvolution!.pumping = pumping; makeCheckpoint(s);
      const loaded = parseGame(serializeGame(s));
      expect(loaded).toEqual(s);
      expect(loaded.world).toBe(loaded.worlds[stage]);
      expect(recoverGeneration(loaded).journey.reefEvolution).toEqual({ version: 1, pumping });
      expect(loaded.journey.rootDispersal).toEqual(s.journey.rootDispersal);
    }
  });

  it('restores an earlier micro checkpoint with its earlier opening without inserting a future reef', () => {
    const s = fixture(1), earlier = fixture(0);
    earlier.id = s.id; earlier.journey.reefEvolution!.pumping = .125; earlier.checkpoint = null;
    s.checkpoint = JSON.stringify(earlier); s.journey.reefEvolution!.pumping = .875;
    const loaded = parseGame(serializeGame(s)), restored = recoverGeneration(loaded);
    expect(loaded.journey.reefEvolution).toEqual({ version: 1, pumping: .875 });
    expect(restored.stage).toBe(0);
    expect(restored.journey.reefEvolution).toEqual({ version: 1, pumping: .125 });
    expect(restored.journey.canopy).toBeNull();
    expect(restored.worlds[1]).toBeNull();
    expect(restored.world).toBe(restored.worlds[0]);
  });

  it.each([
    null, [], true, {}, { version: 2, pumping: 0 }, { version: '1', pumping: 0 },
    { version: 1 }, { pumping: 0 }, { version: 1, pumping: 0, extra: true },
    { version: 1, pumping: -.0001 }, { version: 1, pumping: 1.0001 },
    { version: 1, pumping: '0.5' }, { version: 1, pumping: null },
  ])('rejects a malformed or unsupported reef rule object: %j', value => {
    expect(() => parseGame(changed(s => { s.journey.reefEvolution = value as GameState['journey']['reefEvolution']; }))).toThrow('journey.reefEvolution');
  });

  it('rejects a non-finite JSON number instead of silently clamping or resetting the opening', () => {
    const bytes = serializeGame(fixture()).replace('"pumping":0', '"pumping":1e309');
    expect(() => parseGame(bytes)).toThrow('journey.reefEvolution.pumping');
  });

  it.each([1, 2] as const)('refuses the marker in historical journey version %i', version => {
    expect(() => parseGame(changed(s => {
      (s.journey as unknown as { version: number }).version = version;
      delete s.journey.canopy; delete s.journey.rootDispersal;
      s.checkpoint = null;
    }))).toThrow('journey');
  });

  it('refuses a marker in either a historical legacy save or an invented legacy v3', () => {
    const legacy = createGame(8675309, true);
    expect(() => parseGame(changed(s => { s.journey.reefEvolution = { version: 1, pumping: 0 }; }, legacy))).toThrow('journey');
    expect(() => parseGame(changed(s => { s.journey.legacy = true; }))).toThrow('journey.legacy');
  });

  it('rejects losing the rule marker through generation recovery in either direction', () => {
    expect(() => parseGame(changed(s => { editCheckpoint(s, checkpoint => { delete checkpoint.journey.reefEvolution; }); }))).toThrow('checkpoint');
    expect(() => parseGame(changed(s => { delete s.journey.reefEvolution; }))).toThrow('checkpoint');
  });

  it('validates the opening and rule version inside the checkpoint, not just the outer save', () => {
    expect(() => parseGame(changed(s => { editCheckpoint(s, checkpoint => { checkpoint.journey.reefEvolution!.pumping = 1.1; }); }))).toThrow('journey.reefEvolution.pumping');
    expect(() => parseGame(changed(s => { editCheckpoint(s, checkpoint => { (checkpoint.journey.reefEvolution as unknown as { version: number }).version = 2; }); }))).toThrow('journey.reefEvolution.version');
  });
});
