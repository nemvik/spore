import { validateShipBlueprint, type ShipBlueprint } from './ship-design';
import type { LibraryStorage } from './creature-library';

export const SHIP_FILE_LIMIT = 128 * 1024;
export const SHIP_LIBRARY_LIMIT = 100;
export const SHIP_STORAGE_PREFIX = 'lumavora:ship:';
export interface ShipCreation {
  format: 'lumavora-ship'; version: 1; id: string; revision: number;
  createdAt: number; updatedAt: number; description: string; blueprint: ShipBlueprint;
}
const fail = (message: string): never => { throw new Error(message); };
export function validateShipCreation(value: unknown): asserts value is ShipCreation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Soubor neobsahuje loď.');
  const v = value as Record<string, unknown>;
  const fields = ['format', 'version', 'id', 'revision', 'createdAt', 'updatedAt', 'description', 'blueprint'];
  if (Object.keys(v).length !== fields.length || fields.some(k => !Object.hasOwn(v, k))) fail('Neplatná pole výtvoru.');
  if (v.format !== 'lumavora-ship' || v.version !== 1) fail('Nepodporovaný formát nebo verze lodi.');
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id)) fail('Neplatná identita lodi.');
  for (const k of ['revision', 'createdAt', 'updatedAt']) {
    if (typeof v[k] !== 'number' || !Number.isSafeInteger(v[k]) || v[k] < (k === 'revision' ? 1 : 0) || v[k] > (k === 'revision' ? 1_000_000_000 : 8_640_000_000_000_000)) fail('Neplatná revize nebo datum.');
  }
  if (Number(v.updatedAt) < Number(v.createdAt)) fail('Datum úpravy předchází vytvoření.');
  if (typeof v.description !== 'string' || v.description.length > 280 || /[\u0000-\u001f\u007f]/.test(v.description)) fail('Popis smí mít nejvýše 280 znaků bez řídicích znaků.');
  validateShipBlueprint(v.blueprint);
}
export function parseShipCreation(text: string): ShipCreation {
  if (new TextEncoder().encode(text).length > SHIP_FILE_LIMIT) fail('Soubor lodi je příliš velký (maximum 128 KiB).');
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail('Soubor lodi není platný JSON.'); }
  validateShipCreation(value);
  return structuredClone(value);
}
export function serializeShipCreation(value: ShipCreation): string {
  validateShipCreation(value);
  const text = JSON.stringify(value, null, 2);
  if (new TextEncoder().encode(text).length > SHIP_FILE_LIMIT) fail('Návrh překračuje limit souboru.');
  return text;
}
export function newShipCreation(blueprint: ShipBlueprint, description = '', id: string = crypto.randomUUID(), now = Date.now()): ShipCreation {
  const creation: ShipCreation = { format: 'lumavora-ship', version: 1, id, revision: 1, createdAt: now, updatedAt: now, description, blueprint: structuredClone(blueprint) };
  validateShipCreation(creation); return creation;
}
export function readShipLibrary(storage: LibraryStorage) {
  const entries: ShipCreation[] = [], problems: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i); if (!key?.startsWith(SHIP_STORAGE_PREFIX)) continue;
    try {
      const entry = parseShipCreation(storage.getItem(key) ?? '');
      if (key !== SHIP_STORAGE_PREFIX + entry.id) fail('Identita neodpovídá záznamu.');
      entries.push(entry);
    } catch { problems.push('Poškozený místní záznam byl ponechán beze změny.'); }
  }
  return { entries: entries.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), problems };
}
function capacity(storage: LibraryStorage) {
  let count = 0;
  for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(SHIP_STORAGE_PREFIX)) count++;
  if (count >= SHIP_LIBRARY_LIMIT) fail('Knihovna je plná (100 lodí). Exportuj a odstraň některý záznam.');
}
function write(storage: LibraryStorage, creation: ShipCreation) {
  const text = serializeShipCreation(creation);
  try { storage.setItem(SHIP_STORAGE_PREFIX + creation.id, text); }
  catch { fail('Loď se nepodařilo uložit. Úložiště je plné nebo nedostupné; původní záznam zůstal zachován.'); }
}
/** Each creation is one atomic storage write. Imports never replace an existing identity. */
export function importShipCreation(storage: LibraryStorage, text: string, makeId: () => string = () => crypto.randomUUID()) {
  const incoming = parseShipCreation(text), key = SHIP_STORAGE_PREFIX + incoming.id, raw = storage.getItem(key);
  if (raw !== null) {
    try { if (JSON.stringify(parseShipCreation(raw)) === JSON.stringify(incoming)) return { creation: incoming, duplicate: true }; } catch { /* Preserve corrupt records too. */ }
    incoming.id = makeId();
    if (storage.getItem(SHIP_STORAGE_PREFIX + incoming.id) !== null) fail('Kolize identity. Zkus import znovu.');
  }
  capacity(storage); write(storage, incoming); return { creation: incoming, duplicate: false };
}
export function saveShipCreation(storage: LibraryStorage, blueprint: ShipBlueprint, description: string, original?: ShipCreation): ShipCreation {
  let next: ShipCreation;
  if (original) {
    const current = storage.getItem(SHIP_STORAGE_PREFIX + original.id);
    if (current === null || JSON.stringify(parseShipCreation(current)) !== JSON.stringify(original)) fail('Návrh se mezitím změnil nebo byl odstraněn. Vrať se do knihovny a otevři aktuální verzi.');
    next = { ...original, blueprint: structuredClone(blueprint), description, revision: original.revision + 1, updatedAt: Math.max(Date.now(), original.updatedAt) };
  } else {
    capacity(storage); next = newShipCreation(blueprint, description);
    if (storage.getItem(SHIP_STORAGE_PREFIX + next.id) !== null) fail('Kolize identity. Zkus uložení znovu.');
  }
  write(storage, next); return next;
}
export function deleteShipCreation(storage: LibraryStorage, original: ShipCreation) {
  const raw = storage.getItem(SHIP_STORAGE_PREFIX + original.id);
  if (raw === null || JSON.stringify(parseShipCreation(raw)) !== JSON.stringify(original)) fail('Záznam se změnil. Obnov knihovnu před odstraněním.');
  storage.removeItem(SHIP_STORAGE_PREFIX + original.id);
}
