import { CULTURE_COLORS, CULTURE_PARTS, OUTFIT_FILE_LIMIT, cultureEffects, deleteOutfitDesign, equipOutfit, importOutfitDesign, memberCapacity, outfitCost, quoteOutfit, saveOutfitDesign, type CulturalDesign } from '../game/culture';
import { FOOD_LABEL } from '../game/content';
import { computeStats } from '../game/genome';
import { TRIBE_COPY } from '../game/tribe-copy.cs';
import type { ActiveTribeState, TribeUnit } from '../game/era-types';
import type { GameState } from '../game/types';

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const button = (action: string, label: string, disabled = false, active = false) => `<button class="secondary${active ? ' active' : ''}" data-action="culture-${action}"${disabled ? ' disabled' : ''}>${label}</button>`;
export function cultureSummary(d?: CulturalDesign): string {
  if (!d) return 'Bez kulturní výstroje';
  const e = cultureEffects(d), labels: string[] = [];
  if (e.social > 1) labels.push(`diplomacie +${Math.round((e.social - 1) * 100)} %`);
  if (e.combat > 1) labels.push(`útok +${Math.round((e.combat - 1) * 100)} %`);
  if (e.capacity) labels.push(`náklad +${e.capacity}`);
  if (e.damageTaken < 1) labels.push(`zásahy −${Math.round((1 - e.damageTaken) * 100)} %`, `pohyb −${Math.round((1 - e.speed) * 100)} %`);
  return labels.join(' · ') || 'Pouze barva, bez přínosu';
}
export function wornCultureMarkup(u: TribeUnit): string {
  return `<div class="worn-culture"><b>${esc(u.outfit?.name ?? 'Bez kulturní výstroje')}</b><span>${esc(cultureSummary(u.outfit))} · kapacita ${memberCapacity(u)}</span></div>`;
}
function freshDesign(): CulturalDesign { return { id: crypto.randomUUID(), revision: 1, name: 'Nová sestava', color: 'jade', head: null, back: null }; }

/** Detached draft and selection; only explicit save/equip/import actions mutate the campaign. */
export class CultureEditor {
  draft: CulturalDesign;
  ids: number[];
  notice = '';
  constructor(readonly state: GameState, selected: readonly number[]) {
    const own = this.tribe.members.filter(u => !u.species && u.health > 0);
    this.ids = own.filter(u => selected.includes(u.id)).map(u => u.id);
    if (!this.ids.length && own[0]) this.ids = [own[0].id];
    const first = this.tribe.members.find(u => this.ids.includes(u.id));
    this.draft = structuredClone(first?.outfit ?? this.tribe.culture?.designs[0] ?? freshDesign());
  }
  get tribe(): ActiveTribeState { return this.state.tribe as ActiveTribeState; }
  get dirty(): boolean { return JSON.stringify(this.tribe.culture?.designs.find(d => d.id === this.draft.id)) !== JSON.stringify(this.draft); }
  get tool() { return this.tribe.members.find(u => this.ids.includes(u.id))?.tool ?? null; }
  act(command: string, arg: string): 'saved' | 'equipped' | 'changed' | 'failed' {
    this.notice = '';
    try {
      if (command === 'new') this.draft = freshDesign();
      else if (command === 'copy') this.draft = { ...structuredClone(this.draft), id: crypto.randomUUID(), revision: 1, name: `${this.draft.name.slice(0, 44)} II` };
      else if (command === 'load') { const saved = this.tribe.culture?.designs.find(d => d.id === arg); if (saved) this.draft = structuredClone(saved); }
      else if (command === 'part') {
        const [slot, id] = arg.split(':');
        if (slot === 'head' && ['none', 'plume', 'crest'].includes(id)) this.draft.head = id === 'none' ? null : id as CulturalDesign['head'];
        if (slot === 'back' && ['none', 'pouches', 'shell'].includes(id)) this.draft.back = id === 'none' ? null : id as CulturalDesign['back'];
      } else if (command === 'color' && Object.hasOwn(CULTURE_COLORS, arg)) this.draft.color = arg as CulturalDesign['color'];
      else if (command === 'member') {
        const id = Number(arg); if (this.tribe.members.some(u => u.id === id && !u.species && u.health > 0)) this.ids = this.ids.includes(id) ? this.ids.filter(n => n !== id) : [...this.ids, id];
      } else if (command === 'save') {
        this.draft = saveOutfitDesign(this.state, this.draft); this.notice = 'Návrh uložen v této kampani. Nyní jej můžeš vybavit.'; return 'saved';
      } else if (command === 'delete') {
        deleteOutfitDesign(this.state, this.draft.id); this.draft = freshDesign(); this.notice = 'Návrh odstraněn. Již oblečení členové si výstroj ponechali.'; return 'saved';
      } else if (command === 'equip' || command === 'remove') {
        if (command === 'equip' && this.dirty) throw new Error('Nejprve ulož návrh.');
        const result = equipOutfit(this.state, this.ids, command === 'remove' ? null : this.draft);
        this.notice = result.message; return result.ok ? 'equipped' : 'failed';
      }
      return 'changed';
    } catch (error) { this.notice = (error as Error).message; return 'failed'; }
  }
  import(text: string): void { this.draft = importOutfitDesign(this.state, text); this.notice = 'Sestava importována. Vybavení se platí až při použití.'; }
  async importFile(file: Pick<File, 'size' | 'text'>, isCurrent: () => boolean): Promise<'saved' | 'failed' | 'stale'> {
    try {
      if (file.size > OUTFIT_FILE_LIMIT) throw new Error('Soubor sestavy je příliš velký (8 KiB).');
      const text = await file.text();
      if (!isCurrent()) return 'stale';
      this.import(text); return 'saved';
    } catch (error) {
      if (!isCurrent()) return 'stale';
      this.notice = (error as Error).message; return 'failed';
    }
  }
  markup(): string {
    const t = this.tribe, d = this.draft, quote = quoteOutfit(this.state, this.ids, d), remove = quoteOutfit(this.state, this.ids, null);
    const saved = t.culture?.designs ?? [], diet = computeStats(this.state.player.genome).diet.map(k => FOOD_LABEL[k]).join(' · ');
    const slots = (['head', 'back'] as const).map(slot => `<fieldset><legend>${slot === 'head' ? 'Ozdoba hlavy' : 'Výstroj zad'} <small>nejvýše jedna</small></legend>${button(`part:${slot}:none`, 'Bez části · zdarma', false, d[slot] === null)}${Object.entries(CULTURE_PARTS).filter(([, p]) => p.slot === slot).map(([id, p]) => `<button class="culture-part${d[slot] === id ? ' active' : ''}" data-action="culture-part:${slot}:${id}" aria-pressed="${d[slot] === id}"><strong>${p.name}<span>${p.cost} jídla</span></strong><small>${p.hint}</small></button>`).join('')}</fieldset>`).join('');
    return `<div class="culture-editor">
      <header class="culture-header"><div><h1>Kulturní výstroj</h1><p>Tělo zůstává. Dej členům svého druhu společenskou roli.</p></div>${button('close', 'Zpět do kmene · Esc')}</header>
      <section class="culture-left panel" aria-label="Návrh výstroje"><label for="culture-name">Jméno sestavy</label><input id="culture-name" maxlength="48" value="${esc(d.name)}"><div class="culture-options">${slots}</div><fieldset class="culture-color-options"><legend>Barva výstroje</legend><div class="culture-colors">${Object.entries(CULTURE_COLORS).map(([id, c]) => `<button data-action="culture-color:${id}" aria-pressed="${d.color === id}" class="${d.color === id ? 'active' : ''}" style="--dye:#${c.hex.toString(16)}">${c.name}</button>`).join('')}</div></fieldset><p class="tiny">Návrh ${outfitCost(d)} jídla / člen. Ukládání návrhů je zdarma.</p><div class="row">${button('save', this.dirty ? 'Uložit návrh' : 'Návrh uložen', !this.dirty)}${button('copy', 'Vytvořit kopii')}</div></section>
      <section class="culture-preview-label"><h2>${esc(d.name)}</h2><p>${esc(cultureSummary(d))}</p><p class="tiny">${esc(this.state.player.genome.name)} · ${diet}<br>Pracovní nástroj v náhledu: ${this.tool ? TRIBE_COPY.tools[this.tool].name : 'žádný'}</p><div class="row">${button('rotate:left', '↶ Otočit')}${button('rotate:right', 'Otočit ↷')}</div></section>
      <section class="culture-right panel" aria-label="Sestavy a vybavení"><div class="row spread"><h2>Sestavy <small>${saved.length}/24</small></h2>${button('new', 'Nová')}</div><div class="culture-library">${saved.length ? saved.map(v => button(`load:${v.id}`, `${esc(v.name)} <small>rev. ${v.revision}</small>`, false, v.id === d.id)).join('') : '<p class="tiny">Vytvoř první sestavu vlevo a ulož ji.</p>'}</div><div class="culture-file-row">${button('export', 'Export sestavy')}<label class="secondary culture-import">Import sestavy<input id="import-outfit" type="file" accept="application/json,.json"></label>${button('delete', 'Smazat návrh', !saved.some(v => v.id === d.id))}</div>
      <h2>Vybavit členy</h2><div class="culture-members">${t.members.map(u => `<button class="culture-member${this.ids.includes(u.id) ? ' active' : ''}" data-action="culture-member:${u.id}" aria-pressed="${this.ids.includes(u.id)}"${u.species ? ' disabled' : ''}><b>${u.species ? 'Symbiont' : 'Člen'} ${u.id}</b><span>${u.species ? 'Výstroj jen pro vlastní druh' : esc(u.outfit?.name ?? 'Bez kulturní výstroje')} · ${u.tool ? TRIBE_COPY.tools[u.tool].name : 'bez nástroje'}</span></button>`).join('')}</div>
      <div class="culture-price"><strong>${quote.cost} jídla <small>/ sklad ${Math.floor(t.food)}</small></strong><p>${esc(quote.message)}</p><p class="tiny">${this.dirty ? 'Nejprve ulož návrh. ' : ''}Vybavení u domova do 10 m. Platíš celou novou sestavu každému změněnému členovi, bez vratky. Stejná výstroj je zdarma. Nástroje i náklad zůstávají.</p>${button('equip', 'Vybavit vybrané', !quote.ok || this.dirty)}${button('remove', 'Sundat zdarma', !remove.ok)}</div></section>
      <footer class="culture-feedback" role="status" aria-live="polite">${esc(this.notice || 'Hra je pozastavená. Neuložený návrh se při návratu zahodí. Sestavy cestují s kampaní.')}</footer>
    </div>`;
  }
}
