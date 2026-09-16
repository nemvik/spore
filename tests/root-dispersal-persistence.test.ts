import { describe, expect, it } from 'vitest';
import { createGame, makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import { createWorld, spawnCreature } from '../src/game/world';
import { initializeJourneyStage } from '../src/game/journey';
import { genomeCost, initialGenome } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { SITE_STORIES } from '../src/game/journey-content';
import type { GameState } from '../src/game/types';

/** Explicit save-reference fixture; these records are not earned gameplay. */
function fixture(): GameState {
  const s = createGame(8675309, false, true);
  for (const stage of [1, 2] as const) {
    s.stage = stage; s.world = createWorld(s.seed, stage); s.worlds[stage] = s.world;
    initializeJourneyStage(s);
  }
  for (const kind of ['legs', 'lungs'] as const) s.player.genome.parts.push({ id: `save-${kind}`, kind, axial: 0, angle: 1.2, scale: 1, mirrored: true });
  s.player.totalDna = 300; s.player.dna = genomeCost(initialGenome()) + 300 - genomeCost(s.player.genome);
  const c = spawnCreature(s.world, 'gnaw', 0); s.world.creatures.push(c);
  const root = { id: s.world.nextId++, kind: SITE_STORIES[6].kind, pos: { ...c.pos }, amount: .3, max: 1, regen: 0, patch: 0 };
  s.world.resources.push(root);
  s.journey.rootDispersal!.carried.push({ carrierId: c.id, site: 6, origin: { ...s.journey.sites[6].source }, vitality: 12 });
  s.journey.rootDispersal!.roots.push({ resourceId: root.id, site: 6, vitality: 12 });
  makeCheckpoint(s); return s;
}
function corrupt(change: (s: any) => void) {
  const file = JSON.parse(serializeGame(fixture()));
  file.state.world = file.state.worlds[2]; change(file.state);
  return JSON.stringify(file);
}

describe('optional root dispersal save contract', () => {
  it('round-trips opted-in fresh and land saves, including checkpoint and recovery', () => {
    for (const original of [createGame(8675309, false, true), fixture()]) {
      const loaded = parseGame(serializeGame(original));
      expect(loaded).toEqual(original);
      expect(recoverGeneration(loaded).journey.rootDispersal).toEqual(original.journey.rootDispersal);
      expect(loaded.world).toBe(loaded.worlds[loaded.world.stage]);
    }
  });
  it('leaves the extension absent in older v3 saves and nested checkpoints', () => {
    const old = createGame(8675309, false), bytes = JSON.stringify(old);
    const loaded = parseGame(serializeGame(old));
    expect(JSON.stringify(loaded)).toBe(bytes);
    expect(loaded.journey).not.toHaveProperty('rootDispersal');
    expect(JSON.parse(loaded.checkpoint!).journey).not.toHaveProperty('rootDispersal');
  });
  it('allows a carried cutting after the original plant has vanished or moved', () => {
    const s = fixture(), original = { ...s.journey.rootDispersal!.carried[0].origin };
    s.journey.sites[6].plantedId = null; s.journey.sites[6].vitality = 0;
    const loaded = parseGame(serializeGame(s));
    expect(loaded.journey.rootDispersal!.carried[0].origin).toEqual(original);
  });
  it('rejects unknown versions, extra fields, non-land references and malformed tissue', () => {
    for (const mutate of [
      (s: any) => { s.journey.rootDispersal.version = 2; },
      (s: any) => { s.journey.rootDispersal.extra = true; },
      (s: any) => { s.journey.rootDispersal.carried[0].site = 8; },
      (s: any) => { s.journey.rootDispersal.carried[0].origin.x = 9999; },
      (s: any) => { s.journey.rootDispersal.carried[0].vitality = 12.001; },
      (s: any) => { s.journey.rootDispersal.roots[0].vitality = 0; },
      (s: any) => { s.journey.rootDispersal.carried.push(s.journey.rootDispersal.carried[0]); },
      (s: any) => { s.journey.rootDispersal.roots.push(s.journey.rootDispersal.roots[0]); },
      (s: any) => { s.journey.rootDispersal.roots = Array(33).fill(s.journey.rootDispersal.roots[0]); },
    ]) expect(() => parseGame(corrupt(mutate))).toThrow('journey.rootDispersal');
  });
  it('requires live invasive carriers and real child resources with exact biology', () => {
    for (const mutate of [
      (s: any) => { s.world.creatures = s.world.creatures.filter((c: any) => c.id !== s.journey.rootDispersal.carried[0].carrierId); },
      (s: any) => { s.world.creatures.find((c: any) => c.id === s.journey.rootDispersal.carried[0].carrierId).health = 0; },
      (s: any) => { s.journey.rootDispersal.carried[0].carrierId = s.world.creatures.find((c: any) => c.species === 'bell').id; },
      (s: any) => { s.world.resources.find((r: any) => r.id === s.journey.rootDispersal.roots[0].resourceId).regen = .1; },
      (s: any) => { s.world.resources.find((r: any) => r.id === s.journey.rootDispersal.roots[0].resourceId).kind = 'detritus'; },
      (s: any) => { s.journey.sites[6].plantedId = s.journey.rootDispersal.roots[0].resourceId; },
      (s: any) => { s.journey.offerings.push({ stage: 2, id: s.journey.rootDispersal.roots[0].resourceId, site: 6, remaining: 90 }); },
    ]) expect(() => parseGame(corrupt(mutate))).toThrow('journey.rootDispersal');
  });
  it('refuses populated future land and corrupted nested checkpoints', () => {
    const s = createGame(8675309, false, true), f = fixture();
    s.journey.rootDispersal = f.journey.rootDispersal;
    expect(() => parseGame(serializeGame(s))).toThrow('journey.rootDispersal');
    const envelope = JSON.parse(serializeGame(f));
    const checkpoint = JSON.parse(envelope.state.checkpoint);
    checkpoint.journey.rootDispersal.carried[0].carrierId = 999999;
    envelope.state.checkpoint = JSON.stringify(checkpoint);
    expect(() => parseGame(JSON.stringify(envelope))).toThrow('journey.rootDispersal');
  });
});
