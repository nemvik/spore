import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import { createWorld } from '../src/game/world';
import { emptyJourney } from '../src/game/journey-types';
import { groundHeight } from '../src/game/random';
import { genomeCost, initialGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import type { GameState, Stage } from '../src/game/types';

/** Explicit serialization scenes, not gameplay. These construct references
 * independently of canopy authoring so a renderer/author cannot repair corrupt
 * saves before the validator sees them. Both visited worlds remain present. */
function canopyFixture(stage: 1 | 2 = 1, released = false): GameState {
  const s = createGame(20260913, true); s.journey = emptyJourney(false);
  for (let index = 0; index <= stage; index++) {
    const w = createWorld(s.seed, index as Stage); w.time = 12.5; s.worlds[index] = w;
    for (const patch of w.patches) {
      const source = w.resources.find(r => r.patch === patch.id)!;
      s.journey.sites.push({ id: index * 3 + patch.id, stage: index as Stage, patch: patch.id,
        source: { ...source.pos }, sourceId: source.id, refuges: [{ ...patch.center }], plantedId: null,
        observed: true, resolved: false, method: null, vitality: 100, phase: 1, threatIds: [] });
    }
  }
  s.stage = stage; s.world = s.worlds[stage]!; s.player.pos = { ...s.world.landmarks[0].pos };
  if (stage === 2) s.player.genome.parts.push(
    { id: 'save-legs', kind: 'legs', axial: 0, angle: 1.2, scale: 1, mirrored: true },
    { id: 'save-lungs', kind: 'lungs', axial: 0, angle: 0, scale: 1, mirrored: false },
  );
  s.player.totalDna = 100; s.player.dna = genomeCost(initialGenome()) + 100 - genomeCost(s.player.genome);
  const reef = s.worlds[1]!, center = reef.patches[1].center;
  const crustId = reef.nextId++, capId = reef.nextId++;
  reef.resources.push({ id: crustId, kind: 'mineral', pos: { ...center, y: 2 }, amount: released ? .65 : 1, max: 1, patch: 1, regen: 0 });
  if (!released) reef.obstacles.push({ id: capId, kind: 'rock', pos: { ...center, y: 3 }, radius: 1, height: .7 });
  const roofIds = Array.from({ length: 4 }, (_, i) => {
    const id = reef.nextId++, x = center.x + (i % 2 ? 4 : -4), z = center.z + (i < 2 ? 4 : -4);
    reef.obstacles.push({ id, kind: 'rock', pos: { x, y: groundHeight(x, z, 1) + 8, z }, radius: 3, height: 1 });
    return id;
  });
  s.journey.canopy = { crustId, capId, roofIds, releasedAt: released ? 8.25 : null };
  makeCheckpoint(s); return s;
}

function changed(change: (state: GameState) => void, released = false, stage: 1 | 2 = 1) {
  const file = JSON.parse(serializeGame(canopyFixture(stage, released))) as { state: GameState };
  file.state.world = file.state.worlds[file.state.stage]!;
  change(file.state); file.state.world = file.state.worlds[file.state.stage]!;
  return JSON.stringify(file);
}

function asVersion2(s: GameState): GameState {
  const old = JSON.parse(JSON.stringify(s)) as GameState;
  old.journey.version = 2; delete old.journey.canopy;
  if (old.checkpoint) old.checkpoint = JSON.stringify(asVersion2(JSON.parse(old.checkpoint)));
  return old;
}

describe('canopy campaign format and retained physical references', () => {
  it('round-trips a fresh pre-reef v3 without authoring a future room or downgrading its checkpoint', () => {
    const s = createGame(20260913, false), loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s); expect(loaded.journey.version).toBe(3);
    expect(loaded.journey.canopy).toBeNull(); expect(loaded.worlds[1]).toBeNull();
    expect(JSON.parse(loaded.checkpoint!).journey).toEqual(s.journey);
    expect(recoverGeneration(loaded).journey.version).toBe(3);
  });

  it.each([[1, false], [1, true], [2, false], [2, true]] as const)('preserves the stage%i canopy and its %s release state across current save and checkpoint', (stage, released) => {
    const s = canopyFixture(stage, released), bytes = JSON.stringify(s), loaded = parseGame(serializeGame(s));
    expect(loaded).toEqual(s); expect(JSON.stringify(s)).toBe(bytes);
    expect(loaded.world).toBe(loaded.worlds[stage]); expect(loaded.journey.version).toBe(3);
    expect(recoverGeneration(loaded).journey.canopy).toEqual(s.journey.canopy);
    expect(loaded.worlds[1]!.obstacles.some(o => o.id === loaded.journey.canopy!.capId)).toBe(!released);
    expect(parseGame(serializeGame(loaded))).toEqual(loaded);
  });

  it('preserves a valid earlier pre-reef v3 checkpoint without inserting later roof references into it', () => {
    const s = canopyFixture(1), earlier = createGame(s.seed, false); earlier.id = s.id; earlier.checkpoint = null;
    s.checkpoint = JSON.stringify(earlier);
    const loaded = parseGame(serializeGame(s)), recovered = recoverGeneration(loaded);
    expect(loaded.journey.canopy).not.toBeNull(); expect(recovered.stage).toBe(0);
    expect(recovered.journey.canopy).toBeNull(); expect(recovered.worlds[1]).toBeNull();
  });

  it('accepts a fully consumed crust as persistent evidence while refusing to recreate its removed cap', () => {
    const s = canopyFixture(1, true), canopy = s.journey.canopy!;
    s.world.resources.find(r => r.id === canopy.crustId)!.amount = 0;
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s));
    expect(loaded.world.resources.find(r => r.id === canopy.crustId)!.amount).toBe(0);
    expect(loaded.world.obstacles.some(o => o.id === canopy.capId)).toBe(false);
  });

  it('requires the exact canopy field in v3 and refuses it in historical v2', () => {
    const s = createGame(20260913, false), file = JSON.parse(serializeGame(s)); delete file.state.journey.canopy;
    expect(() => parseGame(JSON.stringify(file))).toThrow('journey');
    for (const version of [1, 2]) {
      const file = JSON.parse(serializeGame(s)); file.state.journey.version = version;
      expect(() => parseGame(JSON.stringify(file))).toThrow('journey');
    }
    expect(() => parseGame(changed(s => { (s.journey.canopy as unknown as Record<string, unknown>).invented = true; }))).toThrow('journey.canopy');
    expect(() => parseGame(changed(s => { delete (s.journey.canopy as unknown as Record<string, unknown>).releasedAt; }))).toThrow('journey.canopy');
  });

  it('requires a canopy for the retained reef even when land is the active world', () => {
    for (const stage of [1, 2] as const) expect(() => parseGame(changed(s => { s.journey.canopy = null; }, false, stage))).toThrow('journey.canopy');
    const file = JSON.parse(serializeGame(createGame(20260913, false)));
    file.state.journey.canopy = canopyFixture().journey.canopy;
    expect(() => parseGame(JSON.stringify(file))).toThrow('journey.canopy');
  });

  it('requires real, correctly typed, non-regenerating mineral crust food', () => {
    const mutations: ((s: GameState) => void)[] = [
      s => { s.world.resources = s.world.resources.filter(r => r.id !== s.journey.canopy!.crustId); },
      s => { s.journey.canopy!.crustId = s.world.creatures[0].id; },
      s => { s.journey.canopy!.crustId = s.world.nextId; },
      ...(['kind', 'max', 'regen', 'patch'] as const).map(key => (s: GameState) => {
        const crust = s.world.resources.find(r => r.id === s.journey.canopy!.crustId)!;
        Object.assign(crust, { [key]: key === 'kind' ? 'algae' : key === 'max' ? 2 : key === 'regen' ? .01 : 0 });
      }),
    ];
    for (const mutation of mutations) expect(() => parseGame(changed(mutation))).toThrow('journey.canopy.crustId');
  });

  it('requires a rock cap while sealed, and a historic absent cap after a real crust bite', () => {
    expect(() => parseGame(changed(s => { s.world.obstacles = s.world.obstacles.filter(o => o.id !== s.journey.canopy!.capId); }))).toThrow('capId');
    expect(() => parseGame(changed(s => { s.world.obstacles.find(o => o.id === s.journey.canopy!.capId)!.kind = 'coral'; }))).toThrow('capId');
    for (const released of [false, true]) {
      expect(() => parseGame(changed(s => { s.journey.canopy!.capId = s.world.creatures[0].id; }, released))).toThrow('capId');
      expect(() => parseGame(changed(s => { s.journey.canopy!.capId = s.world.resources[0].id; }, released))).toThrow('capId');
      expect(() => parseGame(changed(s => { s.journey.canopy!.capId = s.world.nextId; }, released))).toThrow('capId');
    }
    expect(() => parseGame(changed(s => { s.world.obstacles.push({ id: s.journey.canopy!.capId, kind: 'rock', pos: { x: 0, y: 3, z: 0 }, radius: 1, height: 1 }); }, true))).toThrow('capId');
    expect(() => parseGame(changed(s => { s.world.resources.find(r => r.id === s.journey.canopy!.crustId)!.amount = .65; }))).toThrow('releasedAt');
    expect(() => parseGame(changed(s => { s.world.resources.find(r => r.id === s.journey.canopy!.crustId)!.amount = 1; }, true))).toThrow('releasedAt');
  });

  it('requires exactly four distinct elevated live rock roofs, separate from the crust and cap', () => {
    for (const roofs of [0, 3, 5]) expect(() => parseGame(changed(s => { s.journey.canopy!.roofIds = Array(roofs).fill(s.journey.canopy!.roofIds[0]); }))).toThrow('roofIds');
    expect(() => parseGame(changed(s => { s.journey.canopy!.roofIds[1] = s.journey.canopy!.roofIds[0]; }))).toThrow('identifikátory');
    for (const key of ['crustId', 'capId'] as const) expect(() => parseGame(changed(s => { s.journey.canopy!.roofIds[0] = s.journey.canopy![key]; }))).toThrow('identifikátory');
    expect(() => parseGame(changed(s => { s.world.obstacles = s.world.obstacles.filter(o => o.id !== s.journey.canopy!.roofIds[0]); }))).toThrow('roofIds');
    expect(() => parseGame(changed(s => { s.world.obstacles.find(o => o.id === s.journey.canopy!.roofIds[0])!.kind = 'coral'; }))).toThrow('roofIds');
    expect(() => parseGame(changed(s => { const roof = s.world.obstacles.find(o => o.id === s.journey.canopy!.roofIds[0])!; roof.pos.y = groundHeight(roof.pos.x, roof.pos.z, 1); }))).toThrow('roofIds');
    expect(() => parseGame(changed(s => { s.journey.canopy!.roofIds[0] = s.world.creatures[0].id; }))).toThrow('roofIds');
  });

  it.each([-1, 12.5001, '8', false])('rejects release time %s outside the retained reef clock contract', releasedAt => {
    expect(() => parseGame(changed(s => { Object.assign(s.journey.canopy!, { releasedAt }); }, true, 2))).toThrow('releasedAt');
  });

  it('validates physical references recursively and cannot change canopy rules through generation recovery', () => {
    expect(() => parseGame(changed(s => {
      const checkpoint = JSON.parse(s.checkpoint!); checkpoint.journey.canopy.roofIds[0] = checkpoint.world.creatures[0].id;
      s.checkpoint = JSON.stringify(checkpoint);
    }))).toThrow('roofIds');
    const current = canopyFixture(), old = asVersion2(current);
    current.checkpoint = old.checkpoint;
    expect(() => serializeGame(current)).toThrow('nepatří');
    old.checkpoint = canopyFixture().checkpoint;
    // The same lineage identity is needed to make version, not identity, reject it.
    const checkpoint = JSON.parse(old.checkpoint!); checkpoint.id = old.id; old.checkpoint = JSON.stringify(checkpoint);
    expect(() => serializeGame(old)).toThrow('nepatří');
  });

  it('keeps v3 construction accounting as strict as v2 instead of treating it as old spending', () => {
    for (const delta of [-1, 1]) expect(() => parseGame(changed(s => { s.player.dna += delta; }))).toThrow('player.dna');
    expect(() => parseGame(changed(s => { const cp = JSON.parse(s.checkpoint!); cp.player.dna++; s.checkpoint = JSON.stringify(cp); }))).toThrow('player.dna');
  });

  it('does not retrofit canopy fields or room geometry when importing or rewriting historical v2', () => {
    const old = asVersion2(canopyFixture(2, true)), oldBytes = JSON.stringify(old), loaded = parseGame(serializeGame(old));
    expect(loaded).toEqual(old); expect(JSON.stringify(old)).toBe(oldBytes);
    expect(Object.hasOwn(loaded.journey, 'canopy')).toBe(false); expect(loaded.journey.version).toBe(2);
    expect(Object.hasOwn(JSON.parse(loaded.checkpoint!).journey, 'canopy')).toBe(false);
    expect(loaded.worlds).toEqual(old.worlds); expect(recoverGeneration(loaded).journey.version).toBe(2);
  });

  it('keeps legacy v2 unchanged and refuses a newly invented legacy v3 rule combination', () => {
    const s = createGame(20260913, true); expect(parseGame(serializeGame(s))).toEqual(s);
    expect(Object.hasOwn(s.journey, 'canopy')).toBe(false);
    expect(() => parseGame(changed(s => { s.journey.legacy = true; }))).toThrow('journey.legacy');
  });
});
