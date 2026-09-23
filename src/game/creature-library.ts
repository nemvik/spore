import { cloneGenome, validateGenome } from './genome';
import type { Genome } from './types';

export const CREATURE_FILE_LIMIT = 128 * 1024;
export const CREATURE_LIBRARY_LIMIT = 100;
export const CREATURE_STORAGE_PREFIX = 'lumavora:creature:';
export interface CreatureCreation {
  format: 'lumavora-creature'; version: 1; id: string; revision: number;
  createdAt: number; updatedAt: number; description: string; genome: Genome;
}
export type LibraryStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
const fail = (message: string): never => { throw new Error(message); };
export function creationGenomeErrors(genome: unknown): string[] {
  return ([0, 1, 2] as const).map(stage => validateGenome(genome, stage)).sort((a,b) => a.length-b.length)[0];
}
export function validateCreation(value: unknown): asserts value is CreatureCreation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Soubor neobsahuje tvora.');
  const v = value as Record<string, unknown>;
  const fields = ['format', 'version', 'id', 'revision', 'createdAt', 'updatedAt', 'description', 'genome'];
  if (Object.keys(v).length !== fields.length || fields.some(k => !Object.hasOwn(v, k))) fail('Neplatná pole výtvoru.');
  if (v.format !== 'lumavora-creature' || v.version !== 1) fail('Nepodporovaný formát nebo verze tvora.');
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id)) fail('Neplatná identita tvora.');
  for (const k of ['revision', 'createdAt', 'updatedAt']) {
    if (typeof v[k] !== 'number' || !Number.isSafeInteger(v[k]) || v[k] < (k === 'revision' ? 1 : 0) || v[k] > (k === 'revision' ? 1_000_000_000 : 8_640_000_000_000_000)) fail('Neplatná revize nebo datum.');
  }
  if (Number(v.updatedAt) < Number(v.createdAt)) fail('Datum úpravy předchází vytvoření.');
  if (typeof v.description !== 'string' || v.description.length > 280 || /[\u0000-\u001f\u007f]/.test(v.description)) fail('Popis smí mít nejvýše 280 znaků bez řídicích znaků.');
  const errors = creationGenomeErrors(v.genome);
  if (errors.length) fail(`Neplatné tělo: ${errors.join(' ')}`);
}
export function parseCreation(text: string): CreatureCreation {
  if (new TextEncoder().encode(text).length > CREATURE_FILE_LIMIT) fail('Soubor tvora je příliš velký (maximum 128 KiB).');
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail('Soubor tvora není platný JSON.'); }
  validateCreation(value);
  return structuredClone(value);
}
export function serializeCreation(value: CreatureCreation): string {
  validateCreation(value);
  const text = JSON.stringify(value, null, 2);
  if (new TextEncoder().encode(text).length > CREATURE_FILE_LIMIT) fail('Tvor překračuje limit souboru.');
  return text;
}
export function newCreation(genome: Genome, description = '', id: string = crypto.randomUUID(), now = Date.now()): CreatureCreation {
  const creation: CreatureCreation = { format: 'lumavora-creature', version: 1, id, revision: 1, createdAt: now, updatedAt: now, description, genome: cloneGenome(genome) };
  validateCreation(creation); return creation;
}
export function readCreatureLibrary(storage: LibraryStorage) {
  const entries: CreatureCreation[] = [], problems: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i); if (!key?.startsWith(CREATURE_STORAGE_PREFIX)) continue;
    try {
      const entry = parseCreation(storage.getItem(key) ?? '');
      if (key !== CREATURE_STORAGE_PREFIX + entry.id) fail('Identita neodpovídá záznamu.');
      entries.push(entry);
    } catch { problems.push('Poškozený místní záznam byl ponechán beze změny.'); }
  }
  return { entries: entries.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), problems };
}
function capacity(storage: LibraryStorage) {
  let count = 0;
  for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(CREATURE_STORAGE_PREFIX)) count++;
  if (count >= CREATURE_LIBRARY_LIMIT) fail('Knihovna je plná (100 tvorů). Exportuj a odstraň některý záznam.');
}
function write(storage: LibraryStorage, creation: CreatureCreation) {
  const text = serializeCreation(creation);
  try { storage.setItem(CREATURE_STORAGE_PREFIX + creation.id, text); }
  catch { fail('Tvora se nepodařilo uložit. Úložiště je plné nebo nedostupné; původní záznam zůstal zachován.'); }
}
/** Each creation is one atomic storage write. Imports never replace an existing identity. */
export function importCreation(storage: LibraryStorage, text: string, makeId: () => string = () => crypto.randomUUID()) {
  const incoming = parseCreation(text), key = CREATURE_STORAGE_PREFIX + incoming.id, raw = storage.getItem(key);
  if (raw !== null) {
    try { if (JSON.stringify(parseCreation(raw)) === JSON.stringify(incoming)) return { creation: incoming, duplicate: true }; } catch { /* Preserve corrupt records too. */ }
    incoming.id = makeId();
    if (storage.getItem(CREATURE_STORAGE_PREFIX + incoming.id) !== null) fail('Kolize identity. Zkus import znovu.');
  }
  capacity(storage); write(storage, incoming); return { creation: incoming, duplicate: false };
}
export function saveCreation(storage: LibraryStorage, genome: Genome, description: string, original?: CreatureCreation): CreatureCreation {
  let next: CreatureCreation;
  if (original) {
    const current = storage.getItem(CREATURE_STORAGE_PREFIX + original.id);
    if (current === null || JSON.stringify(parseCreation(current)) !== JSON.stringify(original)) fail('Tvor se mezitím změnil nebo byl odstraněn. Vrať se do knihovny a otevři aktuální verzi.');
    next = { ...original, genome: cloneGenome(genome), description, revision: original.revision + 1, updatedAt: Math.max(Date.now(), original.updatedAt) };
  } else {
    capacity(storage); next = newCreation(genome, description);
    if (storage.getItem(CREATURE_STORAGE_PREFIX + next.id) !== null) fail('Kolize identity. Zkus uložení znovu.');
  }
  write(storage, next); return next;
}
export function deleteCreation(storage: LibraryStorage, original: CreatureCreation) {
  const raw = storage.getItem(CREATURE_STORAGE_PREFIX + original.id);
  if (raw === null || JSON.stringify(parseCreation(raw)) !== JSON.stringify(original)) fail('Záznam se změnil. Obnov knihovnu před odstraněním.');
  storage.removeItem(CREATURE_STORAGE_PREFIX + original.id);
}
