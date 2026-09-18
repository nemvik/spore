import { describe, expect, it } from 'vitest';
import { quoteJourneyEvolution } from '../src/game/journey-evolution';
import { cloneGenome, genomeCost, initialGenome, validateMutation } from '../src/game/genome';
import { createGame } from '../src/game/simulation';
import type { GameState, Genome, Part } from '../src/game/types';

const part = (kind: Part['kind'], scale = 1, mirrored = false): Part => ({ id: `test-${kind}`, kind, axial: 0, angle: 1.25, scale, mirrored });

// These tests exercise the pure quote. State installation below deliberately
// models its documented allocation invariant; journey.test.ts tests real evolve.
function applyQuote(s: GameState, draft: Genome) {
  const quote = quoteJourneyEvolution(s, draft);
  expect(quote.ok).toBe(true);
  s.player.genome = cloneGenome(draft); s.player.dna = quote.remaining;
  return quote;
}

describe('reversible new-journey construction allocation', () => {
  it('starts with the existing initial body financed and all initial DNA free', () => {
    const s = createGame(481516, false);
    expect(quoteJourneyEvolution(s, s.player.genome)).toEqual({ ok: true, errors: [], cost: 22, available: 36, remaining: 14 });
  });

  it('quotes without changing game state or draft', () => {
    const s = createGame(481516, false), draft = cloneGenome(s.player.genome);
    draft.parts.push(part('eyes')); const before = structuredClone(s), draftBefore = structuredClone(draft);
    expect(quoteJourneyEvolution(s, draft).remaining).toBe(2);
    expect(s).toEqual(before); expect(draft).toEqual(draftBefore);
  });

  it('rejects a larger body exceeding learned capacity with the real shortage', () => {
    const s = createGame(481516, false), draft = cloneGenome(s.player.genome);
    draft.parts.push(part('shell', 1.65, true));
    const quote = quoteJourneyEvolution(s, draft);
    expect(quote.ok).toBe(false); expect(quote.cost).toBe(genomeCost(draft)); expect(quote.remaining).toBe(36 - genomeCost(draft));
    expect(quote.errors).toContain(`Chybí ${-quote.remaining} DNA.`);
  });

  it('prices organ size and physical pairs using the unchanged phenotype prices', () => {
    const s = createGame(481516, false); s.stage = 1; s.player.totalDna = 150;
    const single = initialGenome(); single.parts.push(part('legs'));
    const paired = cloneGenome(single); paired.parts.at(-1)!.mirrored = true;
    const enlarged = cloneGenome(paired); enlarged.parts.at(-1)!.scale = 1.65;
    expect(quoteJourneyEvolution(s, single).cost).toBe(46);
    expect(quoteJourneyEvolution(s, paired).cost).toBe(61);
    expect(quoteJourneyEvolution(s, enlarged).cost).toBe(86);
  });

  it('returns removed allocation immediately without increasing learned knowledge', () => {
    const s = createGame(481516, false), knowledge = s.player.totalDna;
    const equipped = cloneGenome(s.player.genome); equipped.parts.push(part('eyes'));
    applyQuote(s, equipped); expect(s.player.dna).toBe(2);
    applyQuote(s, initialGenome()); expect(s.player.dna).toBe(14); expect(s.player.totalDna).toBe(knowledge);
  });

  it('makes body dimensions reversible and leaves hue, attachment placement and pattern free', () => {
    const s = createGame(481516, false); s.player.totalDna = 50;
    const widened = cloneGenome(s.player.genome); widened.length = 1.5; widened.width = 1.5;
    const large = applyQuote(s, widened); expect(large.cost).toBe(33);
    const authored = cloneGenome(widened); authored.hue = 12; authored.pattern = 3;
    authored.parts[0].axial = -.6; authored.parts[0].angle = -.9;
    expect(applyQuote(s, authored).remaining).toBe(large.remaining);
    expect(applyQuote(s, initialGenome()).remaining).toBe(50);
  });

  it('does not create or lose capacity through repeated enlarge/shrink round trips', () => {
    const s = createGame(481516, false); s.player.totalDna = 80;
    const large = initialGenome(); large.width = 1.65; large.parts.push(part('shell', 1.4));
    for (let i = 0; i < 25; i++) { applyQuote(s, large); applyQuote(s, initialGenome()); }
    expect(s.player.totalDna).toBe(80); expect(s.player.dna).toBe(80);
  });

  it('can have more free DNA than learned DNA by reallocating the original body', () => {
    const s = createGame(481516, false), stripped = cloneGenome(s.player.genome);
    stripped.parts = [];
    const zero = applyQuote(s, stripped); expect(zero.cost).toBe(0); expect(zero.priceAvailable).not.toBe(false); expect(zero.remaining).toBe(36); expect(s.player.totalDna).toBe(14);
    expect(applyQuote(s, initialGenome()).remaining).toBe(14);
  });

  it('keeps a mandatory land body affordable after optional underwater body experimentation', () => {
    const s = createGame(481516, false); s.stage = 1; s.player.totalDna = 90;
    const aquatic = initialGenome(); aquatic.parts.push(part('fins', 1.3, true), part('gills', 1.2), part('bladder'));
    const amphibious = initialGenome(); amphibious.parts.push(part('legs', 1, true), part('lungs'));
    for (let i = 0; i < 20; i++) { applyQuote(s, aquatic); applyQuote(s, initialGenome()); }
    expect(applyQuote(s, amphibious).remaining).toBe(27);
    s.stage = 2; expect(quoteJourneyEvolution(s, amphibious).ok).toBe(true);
  });

  it('does not use a stale or artificially increased wallet as construction capacity', () => {
    const s = createGame(481516, false), draft = initialGenome(); draft.parts.push(part('shell'));
    s.player.dna = 10000;
    expect(quoteJourneyEvolution(s, draft)).toMatchObject({ ok: false, available: 36, cost: 40, remaining: -4 });
  });

  it('refuses removing an occupied partner bed and required land organs', () => {
    const s = createGame(481516, false); s.player.totalDna = 100;
    s.player.bonds.push({ species: 'lantern', loyalty: 65, hunger: 10, benefit: 'light', age: 0 });
    expect(quoteJourneyEvolution(s, initialGenome()).ok).toBe(false);
    const hosted = initialGenome(); hosted.parts.push(part('symbiote'));
    expect(quoteJourneyEvolution(s, hosted).ok).toBe(true);
    s.stage = 2; expect(quoteJourneyEvolution(s, hosted).ok).toBe(false);
    hosted.parts.push(part('legs'), part('lungs')); expect(quoteJourneyEvolution(s, hosted).ok).toBe(true);
  });

  it('rejects malformed genomes and nonfinite budgets without pricing exceptions', () => {
    const s = createGame(481516, false);
    const malformed = { ...initialGenome(), parts: [{ ...part('eyes'), kind: 'unknown' }] } as unknown as Genome;
    expect(validateMutation(initialGenome(), malformed, 0, 20)).toMatchObject({ ok: false, priceAvailable: false });
    expect(() => quoteJourneyEvolution(s, malformed)).not.toThrow(); expect(quoteJourneyEvolution(s, malformed)).toMatchObject({ ok: false, priceAvailable: false });
    s.player.totalDna = Number.NaN;
    expect(quoteJourneyEvolution(s, initialGenome())).toMatchObject({ ok: false, available: 0, remaining: 0, priceAvailable: false });
  });

  it('leaves legacy half-salvage mutation pricing unchanged', () => {
    const original = initialGenome(), eyes = initialGenome(); eyes.parts.push(part('eyes'));
    expect(validateMutation(original, eyes, 0, 14)).toMatchObject({ ok: true, cost: 12 });
    const swapped = initialGenome(); swapped.parts.push(part('shell'));
    expect(validateMutation(eyes, swapped, 0, 14)).toMatchObject({ ok: true, cost: 12 });
  });
});
