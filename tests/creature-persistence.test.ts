import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyCreatureActions } from '../src/game/creature-actions';
import { organismGroundClearance } from '../src/game/anatomy';
import { genomeCost, initialGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { groundHeight } from '../src/game/random';
import { continueToTribeEra, evolve, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import type { CreatureGenome, GameState } from '../src/game/types';
import { creatureBodyFixture } from './fixtures/creature-bodies';

const saves = 'tests/fixtures/saves';
const manifest = JSON.parse(readFileSync(`${saves}/manifest.json`, 'utf8')) as {
  files: { file: string; bytes: number; sha256: string }[];
};

const readSave = (file: string): GameState => parseGame(readFileSync(`${saves}/${file}`, 'utf8'));
const clone = <T>(value: T): T => structuredClone(value);

function bodyWithOccupiedSymbiosis(kind: 'biped' | 'quadruped' | 'longneck'): CreatureGenome {
  const body = creatureBodyFixture(kind);
  body.parts.push({ id: 'occupied-symbiote', kind: 'symbiote', axial: 0, angle: 0, scale: 1, mirrored: false });
  return body;
}

/** Prepared persistence state, not evidence of played or earned progression. */
function preparedCoast(kind: 'biped' | 'quadruped' | 'longneck' = 'biped') {
  const state = readSave('won-current-coast.fixture.json');
  const draft = bodyWithOccupiedSymbiosis(kind);
  const primordial = genomeCost(initialGenome());
  state.player.totalDna = Math.max(state.player.totalDna, genomeCost(draft) - primordial + 12);
  state.player.dna = primordial + state.player.totalDna - genomeCost(state.player.genome);
  state.player.pos = { ...state.world.landmarks.find(landmark => landmark.kind === 'nest')!.pos };
  return { state, draft };
}

function evolvePrepared(kind: 'biped' | 'quadruped' | 'longneck' = 'biped') {
  const prepared = preparedCoast(kind);
  const result = evolve(prepared.state, prepared.draft);
  expect(result).toMatchObject({ ok: true, errors: [] });
  return prepared;
}

function envelope(state: GameState): Record<string, any> {
  return JSON.parse(serializeGame(state));
}

function corruptV2(mutate: (state: Record<string, any>) => void): string {
  const { state } = evolvePrepared();
  const file = envelope(state);
  mutate(file.state);
  return JSON.stringify(file);
}

describe('historical save manifest', () => {
  for (const entry of manifest.files) {
    it(`preserves historical construction: ${entry.file}`, () => {
      const bytes = readFileSync(`${saves}/${entry.file}`);
      expect(bytes.byteLength).toBe(entry.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      const loaded = parseGame(bytes.toString());
      const again = parseGame(serializeGame(loaded));
      expect(again).toEqual(loaded);
      expect(again.player.genome.version).toBe(1);
      expect(again.player).not.toHaveProperty('creatureActions');
    });
  }
});

describe('articulated generation confirmation', () => {
  it.each(['biped', 'quadruped', 'longneck'] as const)('round-trips and recovers the prepared %s generation', kind => {
    const { state, draft } = evolvePrepared(kind);
    const expected = {
      genome: draft,
      dna: state.player.dna,
      totalDna: state.player.totalDna,
      generation: state.player.generation,
      creatureActions: emptyCreatureActions(),
    };
    expect(state.player.velocity.y).toBe(0);
    expect(state.player.pos.y).toBeCloseTo(
      groundHeight(state.player.pos.x, state.player.pos.z, 2) + organismGroundClearance(draft),
      10,
    );
    const loaded = parseGame(serializeGame(state));
    expect(loaded.player).toMatchObject(expected);
    expect(loaded.version).toBe(3);
    expect(envelope(loaded).version).toBe(3);
    expect(recoverGeneration(loaded).player).toMatchObject(expected);
    expect(loaded.lineage.at(-1)!.parts).toContain(kind === 'biped' ? 'arms' : 'legs');
  });

  it.each([
    ['malformed limb', (state: GameState, draft: CreatureGenome) => { draft.parts.find(part => part.limb)!.limb!.joints[0].radius = 9; }],
    ['insufficient DNA', (state: GameState) => {
      const primordial = genomeCost(initialGenome());
      state.player.totalDna = genomeCost(state.player.genome) - primordial;
      state.player.dna = 0;
    }],
    ['away from the nest', (state: GameState) => { state.player.pos.x += 30; }],
    ['occupied symbiosis removed', (_state: GameState, draft: CreatureGenome) => {
      draft.parts = draft.parts.filter(part => part.kind !== 'symbiote');
    }],
    ['land anatomy removed', (_state: GameState, draft: CreatureGenome) => {
      draft.parts = draft.parts.filter(part => part.kind !== 'lungs');
    }],
  ] as const)('leaves the entire state byte-identical when refusing %s', (_name, arrange) => {
    const { state, draft } = preparedCoast();
    arrange(state, draft);
    const before = JSON.stringify(state);
    expect(evolve(state, draft).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('preserves the legacy evolution velocity and player shape', () => {
    const state = readSave('won-current-coast.fixture.json');
    const draft = clone(state.player.genome);
    state.player.velocity.y = 3.25;
    expect(evolve(state, draft).ok).toBe(true);
    expect(state.player.velocity.y).toBe(3.25);
    expect(state.player).not.toHaveProperty('creatureActions');
  });
});

describe('versioned articulated persistence validation', () => {
  it('requires exact bounded action state on each v2 player independently', () => {
    const mutations = [
      (s: any) => { delete s.player.creatureActions; },
      (s: any) => { s.player.creatureActions.extra = 1; },
      (s: any) => { s.player.creatureActions.version = 2; },
      (s: any) => { s.player.creatureActions.jumpRecharge = 1.2001; },
      (s: any) => { s.player.creatureActions.communicationRecharge = 2.001; },
      (s: any) => { s.player.creatureActions.communicationTime = .801; },
      (s: any) => { s.player.creatureActions.communicationSerial = 1.5; },
      (s: any) => { s.player.creatureActions.communicationSerial = 1_000_000_001; },
      (s: any) => {
        const checkpoint = JSON.parse(s.checkpoint);
        delete checkpoint.player.creatureActions;
        s.checkpoint = JSON.stringify(checkpoint);
      },
    ];
    for (const mutate of mutations) expect(() => parseGame(corruptV2(mutate)), mutate.toString()).toThrow('Poškozená');
  });

  it('rejects malformed nested anatomy, an unknown genome version and an invalid DNA balance', () => {
    const mutations = [
      (s: any) => { s.player.genome.parts.find((part: any) => part.limb).limb.joints[0].offset.y = 99; },
      (s: any) => { s.player.genome.version = 3; },
      (s: any) => { s.player.dna += 1; },
    ];
    for (const mutate of mutations) expect(() => parseGame(corruptV2(mutate)), mutate.toString()).toThrow('Poškozená');
  });

  it('keeps v1 players exact and rejects invented action state', () => {
    const file = JSON.parse(readFileSync(`${saves}/won-current-coast.fixture.json`, 'utf8'));
    file.state.player.creatureActions = emptyCreatureActions();
    expect(() => parseGame(JSON.stringify(file))).toThrow('player');
  });

  it('accepts a v2 active body with its independently valid v1 checkpoint and recovers v1 exactly', () => {
    const { state } = preparedCoast();
    const v1Checkpoint = state.checkpoint!;
    const v1Player = JSON.parse(v1Checkpoint).player as GameState['player'];
    expect(evolve(state, bodyWithOccupiedSymbiosis('biped')).ok).toBe(true);
    state.checkpoint = v1Checkpoint;
    const loaded = parseGame(serializeGame(state));
    expect(loaded.player.genome.version).toBe(2);
    const recovered = recoverGeneration(loaded);
    expect(recovered.player.genome).toEqual(v1Player.genome);
    expect(recovered.player).not.toHaveProperty('creatureActions');
  });

  it('refuses files over 8 MB before parsing their articulated payload', () => {
    expect(() => parseGame(' '.repeat(8 * 1024 * 1024 + 1))).toThrow('8 MB');
  });
});

describe('later-era articulated inheritance', () => {
  it('preserves the v2 body and resets action timers when founding the tribe', () => {
    const { state, draft } = evolvePrepared();
    Object.assign(state.player.creatureActions!, {
      jumpRecharge: .7,
      communicationRecharge: 1.5,
      communicationTime: .4,
      communicationSerial: 17,
    });
    expect(continueToTribeEra(state)).toBe(true);
    expect(state.player.genome).toEqual(draft);
    expect(state.player.creatureActions).toEqual({
      version: 1,
      jumpRecharge: 0,
      communicationRecharge: 0,
      communicationTime: 0,
      communicationSerial: 17,
    });
    expect(parseGame(serializeGame(state)).player).toMatchObject(state.player);
  });

  it.each([
    ['machines-restoration-final.save.json', 4],
    ['stable-sandbox.save.json', 5],
  ] as const)('round-trips v2 construction through %s without versioning vehicles or era data', (file, stage) => {
    const state = readSave(file);
    const body = bodyWithOccupiedSymbiosis('biped');
    state.player.genome = body;
    state.player.creatureActions = emptyCreatureActions();
    state.player.totalDna = 500;
    state.player.dna = genomeCost(initialGenome()) + state.player.totalDna - genomeCost(body);
    state.lineage.at(-1)!.parts = body.parts.map(part => part.kind);
    makeCheckpoint(state);
    const loaded = parseGame(serializeGame(state));
    expect(loaded.stage).toBe(stage);
    expect(loaded.version).toBe(3);
    expect(loaded.player.genome).toEqual(body);
    expect(loaded.player.creatureActions).toEqual(emptyCreatureActions());
    expect(loaded.machines!.version).toBe(2);
    expect(loaded.machines!.blueprints.every(design => design.blueprint.version === 1)).toBe(true);
    if (stage === 5) expect(loaded.planet!.version).toBe(2);
  });
});
