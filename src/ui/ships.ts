import { initialShip, SHIP_PARTS, SHIP_PART_LIMIT, shipStats, validateShipBlueprint, type ShipBlueprint, type ShipPartKind } from '../game/ship-design';
import { SHIP_FILE_LIMIT, readShipLibrary, saveShipCreation, importShipCreation, serializeShipCreation, deleteShipCreation, type ShipCreation } from '../game/ship-library';
import type { LibraryStorage } from '../game/creature-library';
import { escapeHtml as esc } from './creature-library';

const button = (action: string, label: string, disabled = false) => `<button class="secondary" data-action="ship:${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const input = (key: string, label: string, value: number, min: number, max: number, step = .1) => `<label>${label}<input data-ship="${key}" aria-label="${label}" type="number" min="${min}" max="${max}" step="${step}" value="${Number(value.toFixed(3))}"></label>`;
export class ShipStudio {
  draft: ShipBlueprint | null = null; original: ShipCreation | undefined; selected: string | null = null;
  undo: ShipBlueprint[] = []; redo: ShipBlueprint[] = []; entries: ShipCreation[] = []; notice = '';
  constructor(private storage: LibraryStorage, readonly build: boolean) { this.refresh(); }
  refresh() { try { const r = readShipLibrary(this.storage); this.entries = r.entries; this.notice = r.problems.join(' '); } catch (e) { this.notice = (e as Error).message; } }
  change(fn: (draft: ShipBlueprint) => void) {
    if (!this.draft) return; const next = structuredClone(this.draft); fn(next);
    try { validateShipBlueprint(next); } catch (e) { this.notice = (e as Error).message; return; }
    if (JSON.stringify(next) === JSON.stringify(this.draft)) return;
    this.undo.push(this.draft); if (this.undo.length > 40) this.undo.shift(); this.redo = []; this.draft = next; this.notice = ''; this.reconcile();
  }
  reconcile() { if (!this.draft?.parts.some(p => p.id === this.selected)) this.selected = this.draft?.parts.at(-1)?.id ?? null; }
  input(key: string, value: string) { this.change(b => { if (key === 'name') { b.name = value; return; } if (key === 'color') { b.color = value.toLowerCase(); return; } const p = b.parts.find(p => p.id === this.selected); if (!p) return; const n = value.trim() === '' ? NaN : Number(value); if (key === 'yaw') p.yaw = n; else { const [field, axis] = key.split('.'); if ((field === 'position' || field === 'scale') && ['x', 'y', 'z'].includes(axis)) p[field][axis as 'x' | 'y' | 'z'] = n; } }); }
  async import(file: File) { if (file.size > SHIP_FILE_LIMIT) throw new Error('Návrh je příliš velký (128 KiB).'); const text = await file.text(); return text; }
  importText(text: string) { try { const r = importShipCreation(this.storage, text); this.refresh(); this.notice = r.duplicate ? 'Tato loď už v knihovně je.' : 'Návrh importován. Stavbu platíš až v domácí dílně.'; } catch (e) { this.notice = (e as Error).message; } }
  act(arg: string): 'close' | { build: ShipCreation } | null {
    const [action, ...rest] = arg.split(','), id = rest.join(','), entry = this.entries.find(e => e.id === id);
    try {
      if (action === 'close') return 'close';
      if (action === 'new' || action === 'edit' && entry) { this.draft = structuredClone(entry?.blueprint ?? initialShip()); this.original = entry; this.selected = this.draft.parts[0].id; this.undo = []; this.redo = []; this.notice = ''; }
      if (action === 'use' && entry && this.build && !this.draft) return { build: structuredClone(entry) };
      if (action === 'duplicate' && entry) { saveShipCreation(this.storage, entry.blueprint, entry.description); this.refresh(); }
      if (action === 'delete' && entry && confirm(`Odstranit návrh „${entry.blueprint.name}“? Zaplacená loď si zachová svoji konstrukci.`)) { deleteShipCreation(this.storage, entry); this.refresh(); }
      if (action === 'export' && entry) { const url = URL.createObjectURL(new Blob([serializeShipCreation(entry)], { type: 'application/json' })), a = document.createElement('a'); a.href = url; a.download = `lumavora-ship-${entry.id}.json`; try { a.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); } }
      if (!this.draft) return null;
      if (action === 'cancel') { this.draft = null; this.original = undefined; this.notice = 'Rozpracovaný návrh zrušen.'; return null; }
      if (action === 'save') { saveShipCreation(this.storage, this.draft, this.original?.description ?? '', this.original); this.draft = null; this.original = undefined; this.refresh(); this.notice = 'Návrh uložen. Již postavená loď se nezměnila.'; return null; }
      if (action === 'select') this.selected = this.draft.parts.some(p => p.id === id) ? id : null;
      if (action === 'undo' || action === 'redo') { const from = action === 'undo' ? this.undo : this.redo, to = action === 'undo' ? this.redo : this.undo, next = from.pop(); if (next) { to.push(this.draft); this.draft = next; this.reconcile(); this.notice = ''; } }
      if (action === 'remove') this.change(b => { b.parts = b.parts.filter(p => p.id !== this.selected); });
      if (action === 'add' && Object.hasOwn(SHIP_PARTS, id)) { let n = 1; while (this.draft.parts.some(p => p.id === `part-${n}`)) n++; const partId = `part-${n}`; this.change(b => { b.parts.push({ id: partId, kind: id as ShipPartKind, position: { x: 0, y: 1, z: 0 }, scale: { x: 1, y: 1, z: 1 }, yaw: 0 }); }); if (this.draft.parts.some(p => p.id === partId)) this.selected = partId; }
    } catch (e) { this.notice = (e as Error).message; }
    return null;
  }
  markup() {
    if (!this.draft) return `<main class="building-library panel" aria-label="Knihovna lodí"><header><div><div class="eyebrow">HVĚZDNÁ DÍLNA</div><h2>Knihovna lodí</h2></div>${button('close', 'Zavřít')}</header><p>Sestav vlastní loď. Tvar i velikost dílů mění cenu, rychlost, odolnost a náklad. Návrhy můžeš přenášet; postavená loď si uchová zaplacenou konstrukci.</p><div class="row">${button('new', 'Nová loď')}<label class="secondary">Importovat loď<input id="import-ship" type="file" accept="application/json,.json"></label></div><p role="status">${esc(this.notice)}</p><div class="building-cards">${this.entries.map(e => { const stats = shipStats(e.blueprint); return `<article><div class="ship-swatch" style="--ship-color:${e.blueprint.color}">✧</div><h3>${esc(e.blueprint.name)}</h3><p>Revize ${e.revision} · ${e.blueprint.parts.length} dílů<br>${stats.cost} ◈ · náklad ${stats.cargo} · rychlost ${stats.speed.toFixed(1)}</p><div class="row">${button('edit,' + e.id, 'Upravit / 3D')}${this.build ? button('use,' + e.id, 'Vybrat pro stavbu') : ''}${button('duplicate,' + e.id, 'Kopie')}${button('export,' + e.id, 'Exportovat')}${button('delete,' + e.id, 'Odstranit')}</div></article>`; }).join('') || '<p>Zatím nemáš návrh. Začni vlastní lodí.</p>'}</div><p class="tiny">${this.entries.length}/100 návrhů · uložení zdarma · hra stojí</p></main>`;
    const b = this.draft, p = b.parts.find(p => p.id === this.selected), stats = shipStats(b);
    return `<main class="building-editor" aria-label="Editor lodi"><header class="building-heading panel"><div><div class="eyebrow">${this.original ? 'REVIZE ' + (this.original.revision + 1) : 'NOVÁ KONSTRUKCE'}</div><h2>${esc(b.name)}</h2></div><div class="row">${button('undo', 'Zpět', !this.undo.length)}${button('redo', 'Znovu', !this.redo.length)}${button('cancel', 'Zrušit')}${button('save', 'Uložit loď')}</div></header><aside class="building-controls panel"><label>Jméno lodi<input data-ship="name" aria-label="Jméno lodi" value="${esc(b.name)}" maxlength="40"></label><label>Barva lodi<input data-ship="color" aria-label="Barva lodi" type="color" value="${b.color}"></label><h3>Díly ${b.parts.length}/${SHIP_PART_LIMIT}</h3><div class="building-add">${Object.entries(SHIP_PARTS).map(([k, v]) => button('add,' + k, '+ ' + v.name, b.parts.length >= SHIP_PART_LIMIT)).join('')}</div><div class="building-parts">${b.parts.map(p => `<button data-action="ship:select,${p.id}" aria-pressed="${p.id === this.selected}">${SHIP_PARTS[p.kind].name} · ${esc(p.id)}</button>`).join('')}</div>${p ? `<h3>Vybraný díl</h3><div class="building-numbers">${(['x', 'y', 'z'] as const).map(a => input('position.' + a, 'Poloha ' + a.toUpperCase(), p.position[a], -3, 3)).join('')}${(['x', 'y', 'z'] as const).map(a => input('scale.' + a, 'Rozměr ' + a.toUpperCase(), p.scale[a], .3, 2.5)).join('')}${input('yaw', 'Otočení °', p.yaw, -180, 180, 5)}</div>${button('remove', 'Odebrat díl')}` : ''}</aside><section id="ship-viewport" tabindex="0" aria-label="3D náhled lodi; klikni na díl"></section><footer class="building-footer panel"><div class="row">${button('camera-left', '↶ Kamera')}${button('camera-right', 'Kamera ↷')}${button('camera-up', 'Výš')}${button('camera-down', 'Níže')}${button('zoom-in', 'Přiblížit')}${button('zoom-out', 'Oddálit')}</div><p role="status">${esc(this.notice || 'Pevná kabina spojuje díly. Klikni na díl nebo jej vyber v seznamu. Ctrl/⌘ Z zpět, Delete odebrat.')}</p><p>${stats.cost} ◈ · rychlost ${stats.speed.toFixed(1)} · odolnost ${stats.health} · energie ${stats.energy} · náklad ${stats.cargo} · dobíjení ${stats.solar.toFixed(1)}/s</p></footer></main>`;
  }
}
