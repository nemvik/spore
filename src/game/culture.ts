import type { ActiveTribeState, TribeUnit } from './era-types';
import type { GameState } from './types';
import { horizontalDistance } from './random';

export interface CulturalDesign {
  id: string; revision: number; name: string; color: 'jade' | 'ochre' | 'clay';
  head: 'plume' | 'crest' | null; back: 'pouches' | 'shell' | null;
}
export interface TribeCulture { version: 1; designs: CulturalDesign[] }
export interface CultureEffects { social: number; combat: number; damageTaken: number; speed: number; capacity: number }
export const CULTURE_COLORS = { jade: { name: 'Jadeit', hex: 0x70d8b3 }, ochre: { name: 'Jantar', hex: 0xf0bf60 }, clay: { name: 'Hlína', hex: 0xeb8d79 } } as const;
export const CULTURE_PARTS = {
  plume: { slot: 'head', name: 'Chochol hlasu', cost: 4, hint: 'Diplomacie +25 %. Násobí účinek bubnu i zděděné historie.', effects: { social: 1.25 } },
  crest: { slot: 'head', name: 'Kostěný hřeben', cost: 4, hint: 'Útok +20 % proti sousedům i kořisti. Nemění jídelníček.', effects: { combat: 1.2 } },
  pouches: { slot: 'back', name: 'Sběračské brašny', cost: 6, hint: 'Náklad +2 porce: bez koše 4, s košem 7. Jedna porce doma = 4 jídla.', effects: { capacity: 2 } },
  shell: { slot: 'back', name: 'Krunýřový plášť', cost: 6, hint: 'Zásahy sousedů a fauny −25 %, pohyb −10 %. Hlad stále škodí stejně.', effects: { damageTaken: .75, speed: .9 } },
} as const;
export const OUTFIT_FILE_LIMIT = 8192;
const fail = (message: string): never => { throw new Error(message); };
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('Neplatná pole kulturní výstroje.');
  return value as Record<string, unknown>;
}
export function validateOutfit(value: unknown): asserts value is CulturalDesign {
  const v = exact(value, ['id', 'revision', 'name', 'color', 'head', 'back']);
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id)) fail('Neplatná identita sestavy.');
  if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 1 || Number(v.revision) > 1e9) fail('Neplatná revize sestavy.');
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 48 || /[\u0000-\u001f\u007f]/.test(v.name)) fail('Jméno musí mít 1–48 znaků bez řídicích znaků.');
  if (!['jade', 'ochre', 'clay'].includes(v.color as string) || ![null, 'plume', 'crest'].includes(v.head as null) || ![null, 'pouches', 'shell'].includes(v.back as null)) fail('Neznámá kulturní část nebo barva.');
}
export function validateCulture(value: unknown): asserts value is TribeCulture {
  const v = exact(value, ['version', 'designs']);
  if (v.version !== 1 || !Array.isArray(v.designs) || v.designs.length > 24) fail('Nepodporovaná kulturní knihovna (nejvýše 24 sestav).');
  const designs = v.designs as CulturalDesign[];
  designs.forEach(validateOutfit);
  if (new Set(designs.map(d => d.id)).size !== designs.length) fail('Opakovaná identita sestavy.');
}
export function cultureEffects(outfit?: CulturalDesign): CultureEffects {
  const effects: CultureEffects = { social: 1, combat: 1, damageTaken: 1, speed: 1, capacity: 0 };
  for (const part of [outfit?.head, outfit?.back]) if (part) Object.assign(effects, CULTURE_PARTS[part].effects);
  return effects;
}
export const outfitCost = (d: CulturalDesign): number => [d.head, d.back].reduce((sum, part) => sum + (part ? CULTURE_PARTS[part].cost : 0), 0);
export const outfitAppearance = (d?: CulturalDesign | null): string => JSON.stringify(d ? [d.head, d.back, d.color] : null);
export const memberCapacity = (u: TribeUnit): number => (u.tool === 'basket' ? 5 : 2) + cultureEffects(u.outfit).capacity;
function playable(s: GameState): ActiveTribeState {
  if (s.stage !== 3 || s.deathReason || s.tribe?.version !== 2) fail('Kulturní výstroj je dostupná v živém kmeni.');
  return s.tribe as ActiveTribeState;
}
export function quoteOutfit(s: GameState, ids: readonly number[], design: CulturalDesign | null): { ok: boolean; cost: number; message: string } {
  let cost = 0;
  try {
    const t = playable(s);
    if (design) validateOutfit(design);
    const units = [...new Set(ids)].map(id => t.members.find(u => u.id === id));
    if (!units.length || units.some(u => !u || u.health <= 0)) fail('Vyber živé členy kmene.');
    if (units.some(u => u!.species)) fail('Kulturní výstroj nosí vlastní druh. Symbionty z výběru vynech.');
    const own = units as TribeUnit[];
    cost = design ? own.filter(u => outfitAppearance(u.outfit) !== outfitAppearance(design)).length * outfitCost(design) : 0;
    const home = t.huts.filter(h => h.kind === 'shelter' && h.progress === 1 && h.health > 0).sort((a, b) => a.id - b.id)[0];
    if (!home || own.some(u => horizontalDistance(u.pos, home.pos) > 10)) fail('Přiveď vybrané členy do 10 m od domova (Ústup domů).');
    if (t.food < cost) fail(`Chybí ${Math.ceil(cost - t.food)} jídla. Celková cena: ${cost}.`);
    return { ok: true, cost, message: design ? `Vybavit ${own.length} členů · ${cost} jídla` : `Sundat výstroj ${own.length} členům · zdarma` };
  } catch (error) { return { ok: false, cost, message: (error as Error).message }; }
}
export function equipOutfit(s: GameState, ids: readonly number[], design: CulturalDesign | null) {
  const quote = quoteOutfit(s, ids, design); if (!quote.ok) return quote;
  const t = playable(s); t.food -= quote.cost;
  if (design) t.culture ??= { version: 1, designs: [] };
  for (const u of t.members.filter(u => ids.includes(u.id))) {
    if (design) u.outfit = structuredClone(design); else delete u.outfit;
  }
  return { ...quote, message: design ? `${design.name}: vybaveno za ${quote.cost} jídla.` : 'Kulturní výstroj sundána. Nástroje i náklad zůstávají.' };
}
export function saveOutfitDesign(s: GameState, draft: CulturalDesign): CulturalDesign {
  const t = playable(s); validateOutfit(draft);
  const entries = t.culture?.designs ?? [], original = entries.find(d => d.id === draft.id);
  if (original && original.revision !== draft.revision) fail('Sestava se mezitím změnila. Otevři aktuální revizi.');
  if (!original && entries.length >= 24) fail('Knihovna je plná (24 sestav). Exportuj a odstraň některou.');
  const saved = { ...structuredClone(draft), revision: original ? original.revision + 1 : 1 };
  validateOutfit(saved);
  t.culture = { version: 1, designs: [...entries.filter(d => d.id !== saved.id), saved] };
  return structuredClone(saved);
}
export function deleteOutfitDesign(s: GameState, id: string): void {
  const t = playable(s); if (t.culture) t.culture.designs = t.culture.designs.filter(d => d.id !== id);
}
export function parseOutfit(text: string): CulturalDesign {
  if (new TextEncoder().encode(text).length > OUTFIT_FILE_LIMIT) fail('Soubor sestavy je příliš velký (8 KiB).');
  let value: unknown; try { value = JSON.parse(text); } catch { return fail('Sestava není platný JSON.'); }
  const v = exact(value, ['format', 'version', 'design']);
  if (v.format !== 'lumavora-outfit' || v.version !== 1) fail('Nepodporovaný formát sestavy.');
  validateOutfit(v.design); return structuredClone(v.design);
}
export function serializeOutfit(design: CulturalDesign): string {
  validateOutfit(design); return JSON.stringify({ format: 'lumavora-outfit', version: 1, design }, null, 2);
}
export function importOutfitDesign(s: GameState, text: string): CulturalDesign {
  const t = playable(s), incoming = parseOutfit(text), entries = t.culture?.designs ?? [];
  const original = entries.find(d => d.id === incoming.id);
  if (original && JSON.stringify(original) === JSON.stringify(incoming)) return structuredClone(original);
  if (entries.length >= 24) fail('Knihovna je plná (24 sestav).');
  if (original) { do { incoming.id = crypto.randomUUID(); } while (entries.some(d => d.id === incoming.id)); }
  t.culture = { version: 1, designs: [...entries, structuredClone(incoming)] };
  return incoming;
}
