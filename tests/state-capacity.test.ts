import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseGame, serializeGame } from '../src/game/persistence';
import { enableMobilization } from '../src/game/mobilization';
import { createField, enterField, navigation, returnHome, travelAvailability } from '../src/game/planet-travel';
import { planetAtlas } from '../src/game/planet-geography';
import { enableStates, stateCities, stepStates } from '../src/game/states';
import { enterCity } from '../src/game/cities';
import { civilizationReadiness } from '../src/game/civilization';
import { makeCheckpoint, recoverGeneration } from '../src/game/simulation';
import type { GameState } from '../src/game/types';

const round = (s: GameState) => parseGame(serializeGame(s));
function fullCampaign(modern = true) {
  const s = parseGame(readFileSync('tests/fixtures/geography/sp-009c-buildings.save.json', 'utf8'));
  if (modern) enableMobilization(s); else enableStates(s);
  returnHome(s);
  const nav = navigation(s)!, atlas = planetAtlas(s.homePlanet!)!;
  const region = atlas.cells[atlas.anchors[2].cellId].regionId;
  for (const cell of atlas.cells.filter(c => c.surface === 'land' && c.regionId === region)) {
    if (nav.fields.length === 64) break;
    if (!nav.fields.some(f => f.cellId === cell.id)) enterField(s, cell.id);
  }
  returnHome(s);
  expect(nav.fields).toHaveLength(64);
  return round(s);
}

it('preserves 64 visited places and still pays for both rival states, with save/checkpoint recovery', () => {
  const s = fullCampaign(), before = structuredClone(navigation(s)!.fields);
  makeCheckpoint(s);
  for (let i = 0; i < 60 * 30; i++) stepStates(s, 1 / 30);
  expect(navigation(s)!.fields.slice(0, 64)).toEqual(before);
  expect(navigation(s)!.fields).toHaveLength(66);
  for (const r of s.states!.entries) {
    expect(stateCities(s, r)).toHaveLength(1);
    expect(r.transactions.filter(t => t.action.kind === 'found')).toHaveLength(1);
    expect(r.reserve + r.transactions.filter(t => t.account === 'reserve').reduce((n, t) => n + t.cost, 0)).toBe(400);
  }
  expect(civilizationReadiness(s).reasons.join(' ')).not.toContain('první město');
  const saved = round(s);
  expect(enterCity(saved, stateCities(saved, saved.states!.entries[0])[0].id)).toBe(true);
  expect(round(saved).states).toEqual(saved.states);
  returnHome(saved); makeCheckpoint(saved);
  expect(round(recoverGeneration(saved)).states).toEqual(saved.states);
  const restored = round(recoverGeneration(s));
  expect(navigation(restored)!.fields).toEqual(before);
  expect(restored.states!.entries).toEqual([]);
});

it('does not grant extra exploration capacity or accept an unreceipted extra field', () => {
  const s = fullCampaign(), nav = navigation(s)!, atlas = planetAtlas(s.homePlanet!)!;
  const cell = atlas.cells.find(c => c.surface === 'land' && !atlas.anchors.some(a => a.cellId === c.id) && !nav.fields.some(f => f.cellId === c.id))!;
  expect(travelAvailability(s, cell.id).available).toBe(false);
  // Corrupted import on a copy, never a played state.
  nav.fields.push(createField(s.seed, s.homePlanet!.id, cell));
  nav.visits.push({ locationId: nav.fields.at(-1)!.id, tick: s.tick });
  expect(() => round(s)).toThrow();
});


it('roundtrips all four reserved cities and their visits before and after later maritime activation', () => {
  const s = fullCampaign(false), before = structuredClone(navigation(s)!.fields);
  for (let i = 0; i < 160 * 30; i++) stepStates(s, 1 / 30);
  expect(navigation(s)!.fields).toHaveLength(68);
  expect(navigation(s)!.fields.slice(0, 64)).toEqual(before);
  for (const r of s.states!.entries) {
    expect(stateCities(s, r)).toHaveLength(2);
    for (const c of stateCities(s, r)) expect(enterCity(s, c.id)).toBe(true);
  }
  returnHome(s);
  expect(round(s).states).toEqual(s.states);
  enableMobilization(s);
  expect(s.maritime!.legacyAccess).toHaveLength(68);
  expect(round(s).maritime).toEqual(s.maritime);
  makeCheckpoint(s);
  expect(round(recoverGeneration(s)).maritime).toEqual(s.maritime);
});
