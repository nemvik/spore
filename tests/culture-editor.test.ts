import { expect, it } from 'vitest';
import { CultureEditor } from '../src/ui/culture';
import { cultureGame, envoy } from './fixtures/culture';
import { equipOutfit, saveOutfitDesign } from '../src/game/culture';

it('edits a detached draft, requires explicit save, and equips only selected own members', () => {
  const s = cultureGame(), ids = s.tribe.members.map(u => u.id), before = structuredClone(s);
  const editor = new CultureEditor(s, ids);
  editor.act('part', 'head:plume'); editor.act('part', 'back:pouches');
  expect(s).toEqual(before); expect(editor.act('equip', '')).toBe('failed');
  expect(editor.ids).toHaveLength(3); expect(editor.act('save', '')).toBe('saved');
  expect(editor.act('equip', '')).toBe('equipped');
  expect(s.tribe.food).toBe(170); expect(s.tribe.members.find(u => u.species)?.outfit).toBeUndefined();
  expect(s.tribe.members[0].outfit?.head).toBe('plume');
});
it('opening a worn old revision never overwrites the newer saved design', () => {
  const s = cultureGame(), id = s.tribe.members[0].id;
  saveOutfitDesign(s, envoy); equipOutfit(s, [id], envoy); saveOutfitDesign(s, { ...envoy, head: 'crest' });
  const editor = new CultureEditor(s, [id]); expect(editor.draft.head).toBe('plume');
  expect(editor.act('save', '')).toBe('failed'); expect(s.tribe.culture?.designs[0].head).toBe('crest');
  editor.act('copy', ''); expect(editor.act('save', '')).toBe('saved'); expect(s.tribe.culture?.designs).toHaveLength(2);
});
it('escapes user-supplied names in library, preview and member markup', () => {
  const s = cultureGame(), editor = new CultureEditor(s, []); editor.draft.name = '<img src=x onerror=alert(1)>';
  editor.act('save', ''); editor.act('equip', ''); const html = editor.markup();
  expect(html).not.toContain('<img'); expect(html).toContain('&lt;img');
});
it.each([false, true])('ignores a completed file read after its editor closed (invalid=%s)', async invalid => {
  const s = cultureGame(), before = structuredClone(s.tribe), editor = new CultureEditor(s, []);
  let complete!: (text: string) => void, current = true;
  const pending = editor.importFile({ size: 1, text: () => new Promise<string>(resolve => { complete = resolve; }) }, () => current);
  current = false; complete(invalid ? 'bad json' : JSON.stringify({ format: 'lumavora-outfit', version: 1, design: envoy }));
  expect(await pending).toBe('stale'); expect(s.tribe).toEqual(before); expect(editor.notice).toBe('');
});
