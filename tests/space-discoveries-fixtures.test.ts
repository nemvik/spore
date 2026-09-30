import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGame, serializeGame } from '../src/game/persistence';
import { societyProgress } from '../src/game/space-discoveries-content';
import { recoverGeneration } from '../src/game/simulation';
import type { GameState } from '../src/game/types';

// Byte-identical public native exports, with no rewritten payload or unit setup.
const fixtures = {
  campaign: 'c62b896de2e54ff1123f04e13877cf0cf32e9a864bd7781812c71bddb34e1da9',
  ecology: 'e67596f4add14be415af88f8f67ad08c7f7a58e41d9cffdf0563cf1eb2be0049',
  passage: 'd0cbeb59debcff26b154696154f68cab3b3b5874e1371805d0499075eeb2fbd8',
  workshop: '94027584f0d517858b3039f723114393be8bdebe195b8ba8b63e86ad3015640e',
};
const round = (s: GameState) => parseGame(serializeGame(s));
describe('D4 exact played public exports', () => {
  it.each(Object.entries(fixtures))('preserves %s bytes, immutable discovery evidence, rekey and old checkpoint recovery', (name, digest) => {
    const bytes = readFileSync(`tests/fixtures/space/native-d4-${name}.save.json`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest);
    const s = parseGame(bytes.toString()), before = structuredClone(s); expect(round(s)).toEqual(before);
    const cp = JSON.parse(s.checkpoint!) as GameState;
    expect(cp.space!.discoveries!.actions).toHaveLength(0); expect(cp.space!.ship).toBeNull(); expect(cp.space!.economy!.ledger.patronage).toBe(0);
    const imported = round(s), importedCp = JSON.parse(imported.checkpoint!) as GameState;
    imported.id += '-public-rekey'; importedCp.id = imported.id; imported.checkpoint = JSON.stringify(importedCp);
    expect(round(imported).space).toEqual(s.space); expect(recoverGeneration(round(imported)).space!.discoveries).toEqual(cp.space!.discoveries);
  });
  it('retains paid pending wormhole, and rejects an unlocked unrelated route or a free crossing', () => {
    const s = parseGame(readFileSync('tests/fixtures/space/native-d4-passage.save.json', 'utf8')), p = s.space!;
    expect(p.leg).toMatchObject({ duration: 6, energyPaid: 14, passage: { kind: 'wormhole', relicSerial: 1 } });
    expect(p.leg!.elapsed).toBeLessThan(6); expect(p.leg!.from.systemId).toMatch(/star-5$/); expect(p.leg!.to.systemId).toMatch(/star-22$/);
    const free = structuredClone(s); free.space!.leg!.energyPaid = 0; expect(() => serializeGame(free)).toThrow();
    const missing = structuredClone(s); delete missing.space!.leg!.passage; expect(() => serializeGame(missing)).toThrow();
  });
  it('retains both discoveries, exact patronage and used service after actual return without a new colony', () => {
    const s = parseGame(readFileSync('tests/fixtures/space/native-d4-campaign.save.json', 'utf8')), p = s.space!, d = p.discoveries!, e = p.economy!;
    expect(p.location).toBeNull(); expect(p.ship!.health).toBe(115); expect(d.actions).toHaveLength(6);
    expect(societyProgress(d).supported).toMatchObject({ serial: 6, aid: 'patronage', receipt: { serial: 42, paid: 40, balanceBefore: 308, balanceAfter: 268 } });
    expect(e.balance).toBe(263); expect(e.ledger.patronage).toBe(40); expect(e.counts.patronage).toBe(1);
    expect(e.actions.at(-1)).toMatchObject({ kind: 'repair', paid: 5, before: 99, after: 115, societyService: { supportSerial: 6 } });
    expect(e.colonies.some(c => c.planetId === d.society.planetId)).toBe(false);
    expect(p.log.filter(r => r.passage).map(r => r.passage!.relicSerial)).toEqual([1, 1]);
    const forged = structuredClone(s); forged.space!.economy!.ledger.patronage = 0; expect(() => serializeGame(forged)).toThrow();
  });
  it('retains the exact open decision for a genuinely separate alternative playthrough', () => {
    const s = parseGame(readFileSync('tests/fixtures/space/native-d4-workshop.save.json', 'utf8')), p = s.space!, d = p.discoveries!;
    expect(p.location?.planetId).toBe(d.society.planetId); expect(d.actions).toHaveLength(4);
    expect(societyProgress(d).shared).not.toBeNull(); expect(societyProgress(d).accepted).toBeNull(); expect(d.scans).toHaveLength(0);
    expect(p.economy!.balance).toBe(308); expect(p.economy!.ledger.patronage).toBe(0); expect(p.ship!.health).toBe(99);
  });
  it('preserves the six actually played new scans and ecological service without patronage or colony grant', () => {
    const s = parseGame(readFileSync('tests/fixtures/space/native-d4-ecology.save.json', 'utf8')), p = s.space!, d = p.discoveries!, e = p.economy!;
    const progress = societyProgress(d); expect(p.location).toBeNull(); expect(p.ship!.health).toBe(115); expect(progress.supported?.aid).toBe('ecology');
    expect(new Set(d.scans.map(r => r.role)).size).toBe(6); expect(d.scans.every(r => r.receipt.serial >= progress.accepted!.cut.lifeAction && r.receipt.energyPaid === 1)).toBe(true);
    expect(e.balance).toBe(303); expect(e.counts.patronage).toBe(0); expect(e.ledger.patronage).toBe(0);
    expect(e.actions.at(-1)).toMatchObject({ kind: 'repair', paid: 5, societyService: { supportSerial: 6 } });
    expect(e.colonies.some(c => c.planetId === d.society.planetId)).toBe(false);
    d.scans.pop(); expect(() => serializeGame(s)).toThrow();
  });
});
