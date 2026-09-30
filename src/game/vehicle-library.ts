import { validateConstruction, type VehicleConstruction } from './blueprint';
import type { LibraryStorage } from './creature-library';

export const VEHICLE_FILE_LIMIT = 128 * 1024;
export const VEHICLE_LIBRARY_LIMIT = 100;
export const VEHICLE_STORAGE_PREFIX = 'lumavora:vehicle:';
export interface VehicleCreation {
  format: 'lumavora-vehicle'; version: 1; id: string; revision: number;
  createdAt: number; updatedAt: number; description: string; blueprint: VehicleConstruction;
}
const fail = (message: string): never => { throw new Error(message); };
export function validateVehicleCreation(value: unknown): asserts value is VehicleCreation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Soubor neobsahuje vozidlo.');
  const v = value as Record<string, unknown>;
  const fields = ['format', 'version', 'id', 'revision', 'createdAt', 'updatedAt', 'description', 'blueprint'];
  if (Object.keys(v).length !== fields.length || fields.some(k => !Object.hasOwn(v, k))) fail('Neplatná pole výtvoru.');
  if (v.format !== 'lumavora-vehicle' || v.version !== 1) fail('Nepodporovaný formát nebo verze vozidla.');
  if (typeof v.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.id)) fail('Neplatná identita vozidla.');
  for (const k of ['revision', 'createdAt', 'updatedAt']) {
    if (typeof v[k] !== 'number' || !Number.isSafeInteger(v[k]) || v[k] < (k === 'revision' ? 1 : 0) || v[k] > (k === 'revision' ? 1_000_000_000 : 8_640_000_000_000_000)) fail('Neplatná revize nebo datum.');
  }
  if (Number(v.updatedAt) < Number(v.createdAt)) fail('Datum úpravy předchází vytvoření.');
  if (typeof v.description !== 'string' || v.description.length > 280 || /[\u0000-\u001f\u007f]/.test(v.description)) fail('Popis smí mít nejvýše 280 znaků bez řídicích znaků.');
  const errors = validateConstruction(v.blueprint);
  if (errors.length) fail(`Neplatné vozidlo: ${errors.join(' ')}`);
}
export function parseVehicleCreation(text: string): VehicleCreation {
  if (new TextEncoder().encode(text).length > VEHICLE_FILE_LIMIT) fail('Soubor vozidla je příliš velký (maximum 128 KiB).');
  let value: unknown;
  try { value = JSON.parse(text); } catch { return fail('Soubor vozidla není platný JSON.'); }
  validateVehicleCreation(value);
  return structuredClone(value);
}
export function serializeVehicleCreation(value: VehicleCreation): string {
  validateVehicleCreation(value);
  const text = JSON.stringify(value, null, 2);
  if (new TextEncoder().encode(text).length > VEHICLE_FILE_LIMIT) fail('Návrh překračuje limit souboru.');
  return text;
}
export function newVehicleCreation(blueprint: VehicleConstruction, description = '', id: string = crypto.randomUUID(), now = Date.now()): VehicleCreation {
  const creation: VehicleCreation = { format: 'lumavora-vehicle', version: 1, id, revision: 1, createdAt: now, updatedAt: now, description, blueprint: structuredClone(blueprint) };
  validateVehicleCreation(creation); return creation;
}
export function readVehicleLibrary(storage: LibraryStorage) {
  const entries: VehicleCreation[] = [], problems: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i); if (!key?.startsWith(VEHICLE_STORAGE_PREFIX)) continue;
    try {
      const entry = parseVehicleCreation(storage.getItem(key) ?? '');
      if (key !== VEHICLE_STORAGE_PREFIX + entry.id) fail('Identita neodpovídá záznamu.');
      entries.push(entry);
    } catch { problems.push('Poškozený místní záznam byl ponechán beze změny.'); }
  }
  return { entries: entries.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), problems };
}
function capacity(storage: LibraryStorage) {
  let count = 0;
  for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(VEHICLE_STORAGE_PREFIX)) count++;
  if (count >= VEHICLE_LIBRARY_LIMIT) fail('Knihovna je plná (100 vozidel). Exportuj a odstraň některý záznam.');
}
function write(storage: LibraryStorage, creation: VehicleCreation) {
  const text = serializeVehicleCreation(creation);
  try { storage.setItem(VEHICLE_STORAGE_PREFIX + creation.id, text); }
  catch { fail('Vozidlo se nepodařilo uložit. Úložiště je plné nebo nedostupné; původní záznam zůstal zachován.'); }
}
/** Each creation is one atomic storage write. Imports never replace an existing identity. */
export function importVehicleCreation(storage: LibraryStorage, text: string, makeId: () => string = () => crypto.randomUUID()) {
  const incoming = parseVehicleCreation(text), key = VEHICLE_STORAGE_PREFIX + incoming.id, raw = storage.getItem(key);
  if (raw !== null) {
    try { if (JSON.stringify(parseVehicleCreation(raw)) === JSON.stringify(incoming)) return { creation: incoming, duplicate: true }; } catch { /* Preserve corrupt records too. */ }
    incoming.id = makeId();
    if (storage.getItem(VEHICLE_STORAGE_PREFIX + incoming.id) !== null) fail('Kolize identity. Zkus import znovu.');
  }
  capacity(storage); write(storage, incoming); return { creation: incoming, duplicate: false };
}
export function saveVehicleCreation(storage: LibraryStorage, blueprint: VehicleConstruction, description: string, original?: VehicleCreation): VehicleCreation {
  let next: VehicleCreation;
  if (original) {
    const current = storage.getItem(VEHICLE_STORAGE_PREFIX + original.id);
    if (current === null || JSON.stringify(parseVehicleCreation(current)) !== JSON.stringify(original)) fail('Návrh se mezitím změnil nebo byl odstraněn. Vrať se do knihovny a otevři aktuální verzi.');
    next = { ...original, blueprint: structuredClone(blueprint), description, revision: original.revision + 1, updatedAt: Math.max(Date.now(), original.updatedAt) };
  } else {
    capacity(storage); next = newVehicleCreation(blueprint, description);
    if (storage.getItem(VEHICLE_STORAGE_PREFIX + next.id) !== null) fail('Kolize identity. Zkus uložení znovu.');
  }
  write(storage, next); return next;
}
export function deleteVehicleCreation(storage: LibraryStorage, original: VehicleCreation) {
  const raw = storage.getItem(VEHICLE_STORAGE_PREFIX + original.id);
  if (raw === null || JSON.stringify(parseVehicleCreation(raw)) !== JSON.stringify(original)) fail('Záznam se změnil. Obnov knihovnu před odstraněním.');
  storage.removeItem(VEHICLE_STORAGE_PREFIX + original.id);
}
