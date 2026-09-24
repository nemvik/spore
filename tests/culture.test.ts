import { describe, expect, it } from 'vitest';
import { cultureEffects, equipOutfit, quoteOutfit, saveOutfitDesign, importOutfitDesign, deleteOutfitDesign, parseOutfit, serializeOutfit } from '../src/game/culture';
import { parseGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration, continueToMachinesEra } from '../src/game/simulation';
import { readFileSync, readdirSync } from 'node:fs';
import { cultureGame, envoy, guard } from './fixtures/culture';

describe('cultural purchases and independent designs', () => {
  it('pays once per changed member, retains tools/body/diet and owns the equipped snapshot', () => {
    const s = cultureGame(), t = s.tribe, ids = t.members.filter(u => !u.species).map(u => u.id);
    const body = structuredClone(s.player.genome), history = structuredClone(s.lineageHistory);
    const stored = saveOutfitDesign(s, envoy);
    expect(equipOutfit(s, ids, stored).ok).toBe(true);
    expect(t.food).toBe(200 - 10 * ids.length);
    expect(t.members[0].outfit).toEqual(stored);
    expect(t.members[0].outfit).not.toBe(stored);
    const revised = saveOutfitDesign(s, { ...stored, head: 'crest' });
    expect(revised.revision).toBe(2);
    expect(t.members[0].outfit?.head).toBe('plume');
    deleteOutfitDesign(s, stored.id);
    expect(t.members[0].outfit?.head).toBe('plume');
    expect(s.player.genome).toEqual(body); expect(s.lineageHistory).toEqual(history);
    const before = t.food;
    expect(equipOutfit(s, ids, stored).ok).toBe(true); expect(t.food).toBe(before);
    expect(equipOutfit(s, ids, null).ok).toBe(true); expect(t.food).toBe(before);
    expect(t.members.every(u => !u.outfit)).toBe(true);
  });
  it.each(['poor', 'distant', 'partner', 'missing', 'wrong-stage', 'dead'] as const)('rejects %s selection atomically', kind => {
    const s = cultureGame(), t = s.tribe, own = t.members.filter(u => !u.species);
    let ids = own.slice(0, 2).map(u => u.id);
    if (kind === 'poor') t.food = 19;
    if (kind === 'distant') own[1].pos.x += 20;
    if (kind === 'partner') ids.push(t.members.find(u => u.species)!.id);
    if (kind === 'missing') ids.push(999);
    if (kind === 'wrong-stage') s.stage = 4;
    if (kind === 'dead') own[1].health = 0;
    const before = structuredClone(t);
    expect(quoteOutfit(s, ids, guard).ok).toBe(false);
    expect(equipOutfit(s, ids, guard).ok).toBe(false);
    expect(t).toEqual(before);
  });
  it('keeps paid tools and cargo when bags are removed; rejects invalid drafts without mutation', () => {
    const s = cultureGame(), u = s.tribe.members[0]; u.tool = 'basket';
    expect(equipOutfit(s, [u.id], envoy).ok).toBe(true); u.cargo = 7;
    expect(equipOutfit(s, [u.id], null).ok).toBe(true);
    expect(u.cargo).toBe(7); expect(u.tool).toBe('basket');
    const before = structuredClone(s.tribe);
    expect(equipOutfit(s, [u.id], { ...guard, back: 'unknown' } as never).ok).toBe(false);
    expect(s.tribe).toEqual(before);
  });
  it('combines distinct tradeoffs and leaves historical unequipped members neutral', () => {
    expect(cultureEffects(undefined)).toEqual({ social: 1, combat: 1, damageTaken: 1, speed: 1, capacity: 0 });
    expect(cultureEffects(envoy)).toEqual({ social: 1.25, combat: 1, damageTaken: 1, speed: 1, capacity: 2 });
    expect(cultureEffects(guard)).toEqual({ social: 1, combat: 1.2, damageTaken: .75, speed: .9, capacity: 0 });
  });
});

describe('portable designs and campaign persistence', () => {
  it('roundtrips standalone data and duplicates colliding identities without replacing designs', () => {
    const s = cultureGame(); saveOutfitDesign(s, envoy);
    expect(parseOutfit(serializeOutfit(envoy))).toEqual(envoy);
    const imported = importOutfitDesign(s, serializeOutfit({ ...envoy, head: 'crest' }));
    expect(imported.id).not.toBe(envoy.id);
    expect(s.tribe.culture!.designs.find(d => d.id === envoy.id)?.head).toBe('plume');
  });
  it.each([
    (v: any) => { v.head = 'spear'; }, (v: any) => { v.color = '#fff'; },
    (v: any) => { v.revision = 0; }, (v: any) => { v.name = 'x'.repeat(49); },
    (v: any) => { v.name = '<bad>\n'; }, (v: any) => { v.id = '../escape'; },
    (v: any) => { v.extra = true; }, (v: any) => { delete v.back; },
  ])('rejects malformed standalone and embedded designs', mutate => {
    const bad = structuredClone(envoy); mutate(bad);
    expect(() => parseOutfit(JSON.stringify({ format: 'lumavora-outfit', version: 1, design: bad }))).toThrow();
    const s = cultureGame(); s.tribe.culture = { version: 1, designs: [bad] };
    expect(() => serializeGame(s)).toThrow();
  });
  it('caps the library and preserves it on failed import', () => {
    const s = cultureGame(); for (let i = 0; i < 24; i++) saveOutfitDesign(s, { ...envoy, id: `d${i}` });
    const before = structuredClone(s.tribe);
    expect(() => importOutfitDesign(s, serializeOutfit(guard))).toThrow(); expect(s.tribe).toEqual(before);
    expect(() => parseOutfit(' '.repeat(9000))).toThrow();
  });
  it('roundtrips independent worn revisions, restores paid checkpoint and historical absence', () => {
    const s = cultureGame(), old = structuredClone(s.tribe), id = s.tribe.members[0].id;
    makeCheckpoint(s); saveOutfitDesign(s, envoy); equipOutfit(s, [id], envoy);
    expect(parseGame(serializeGame(s)).tribe).toEqual(s.tribe);
    expect(recoverGeneration(parseGame(serializeGame(s))).tribe).toEqual(old);
    makeCheckpoint(s); const paid = structuredClone(s.tribe);
    saveOutfitDesign(s, { ...envoy, head: 'crest' }); equipOutfit(s, [id], guard);
    expect(recoverGeneration(parseGame(serializeGame(s))).tribe).toEqual(paid);
    expect(parseGame(serializeGame(cultureGame())).tribe).not.toHaveProperty('culture');
  });
  it('rejects duplicate design identities, unknown version and a dressed symbiont', () => {
    for (const kind of ['duplicate', 'version', 'partner']) {
      const s = cultureGame(); saveOutfitDesign(s, envoy);
      if (kind === 'duplicate') s.tribe.culture!.designs.push(structuredClone(envoy));
      if (kind === 'version') (s.tribe.culture as any).version = 2;
      if (kind === 'partner') s.tribe.members.find(u => u.species)!.outfit = structuredClone(envoy);
      expect(() => serializeGame(s)).toThrow();
    }
  });
  it('keeps a seven-portion load valid after removing both bags and the basket', () => {
    const s = cultureGame(), u = s.tribe.members[0]; equipOutfit(s, [u.id], envoy);
    u.cargo = 7; equipOutfit(s, [u.id], null); u.tool = null;
    expect(parseGame(serializeGame(s)).tribe).toEqual(s.tribe);
    u.cargo = 7.01; expect(() => serializeGame(s)).toThrow();
  });
  it('freezes the paid cultural snapshots into machine entry and its checkpoint', () => {
    const s = cultureGame(); saveOutfitDesign(s, envoy); equipOutfit(s, [s.tribe.members[0].id], envoy);
    for (const n of s.tribe.neighbours) n.resolved = 'allied'; s.tribe.completed = true;
    const tribe = structuredClone(s.tribe); expect(continueToMachinesEra(s)).toBe(true);
    const loaded = parseGame(serializeGame(s)); expect(loaded.tribe).toEqual(tribe);
    expect(JSON.parse(loaded.checkpoint!).tribe).toEqual(tribe);
  });
  it('loads every versioned historical save fixture without injecting cultural data', () => {
    const files = readdirSync('tests/fixtures/saves').filter(f => f.endsWith('.json') && f !== 'manifest.json');
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const file of files) {
      const loaded = parseGame(readFileSync(`tests/fixtures/saves/${file}`, 'utf8'));
      if (loaded.tribe) expect(loaded.tribe).not.toHaveProperty('culture');
      if (loaded.tribe?.version === 2) expect(loaded.tribe.members.every(u => !u.outfit)).toBe(true);
      expect(parseGame(serializeGame(loaded))).toEqual(loaded);
    }
  });
});
