const STORAGE_KEY = 'lumavora:interface';
const TEXT_SCALES = [1, 1.15, 1.3] as const;
const PANEL_DEFAULTS = {
  'organism-objective': true, 'organism-vitals': true, 'objective-details': false,
  'tribe-neighbours': true, 'tribe-selection': true,
  'machine-regions': true, 'machine-selection': true,
  'planet-vehicle': true, 'planet-community': true,
  'space-instruments': true, 'space-navigation': true,
  field: true, city: true, sailing: true, commerce: true,
} as const;
type PanelId = keyof typeof PANEL_DEFAULTS;
type TextScale = typeof TEXT_SCALES[number];
type Preferences = { textScale: TextScale; panels: Partial<Record<PanelId, boolean>> };

const isPanel = (id: string): id is PanelId => Object.hasOwn(PANEL_DEFAULTS, id);
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Trusted structural attributes only; content stays in each era's UI module. */
export function hudPanelStart(id: PanelId, title: string, classes: string, attributes = '', titleId = ''): string {
  return `<details class="${classes} hud-panel" data-hud-panel="${id}" data-preserve-open ${attributes}><summary class="hud-panel-toggle" title="Sbalit nebo rozbalit panel"><span${titleId ? ` id="${escape(titleId)}"` : ''}>${escape(title)}</span><span class="hud-panel-chevron" aria-hidden="true">⌄</span></summary>`;
}

/** Preferences belong to this device, never to a lineage or its checkpoints. */
export class HudLayout {
  private preferences: Preferences = { textScale: 1, panels: {} };
  private mounted = new WeakMap<HTMLDetailsElement, PanelId>();

  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {
    try {
      const raw = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
      if (TEXT_SCALES.includes(raw?.textScale)) this.preferences.textScale = raw.textScale;
      for (const [id, value] of Object.entries(raw?.panels ?? {})) {
        if (isPanel(id) && typeof value === 'boolean') this.preferences.panels[id] = value;
      }
    } catch { /* Storage can be unavailable or contain an older invalid value. */ }
  }

  attach(root: HTMLElement): void {
    root.addEventListener('toggle', event => {
      const panel = event.target;
      if (!(panel instanceof HTMLDetailsElement) || !root.contains(panel)) return;
      const id = panel.dataset.hudPanel;
      if (!id || !isPanel(id) || this.mounted.get(panel) !== id) return;
      if (panel.open !== (this.preferences.panels[id] ?? PANEL_DEFAULTS[id])) {
        this.preferences.panels[id] = panel.open;
        this.save();
      }
    }, true);
    this.apply(root);
  }

  apply(root: HTMLElement): void {
    const scale = String(this.preferences.textScale);
    if (root.style.getPropertyValue('--ui-text-scale') !== scale) root.style.setProperty('--ui-text-scale', scale);
    for (const panel of root.querySelectorAll<HTMLDetailsElement>('details[data-hud-panel]')) {
      const id = panel.dataset.hudPanel!;
      if (!isPanel(id) || this.mounted.get(panel) === id) continue;
      // Only initialise new/replaced panels. Live counters must not undo an
      // immediate pointer or keyboard toggle before the toggle event is sent.
      this.mounted.set(panel, id);
      panel.open = this.preferences.panels[id] ?? PANEL_DEFAULTS[id];
    }
  }

  setTextScale(value: number): void {
    if (!TEXT_SCALES.includes(value as TextScale)) return;
    this.preferences.textScale = value as TextScale;
    this.save();
  }

  settingsMarkup(): string {
    return `<label class="settings-row" for="interface-text-size"><span>Velikost textu</span><select id="interface-text-size" data-interface-setting="text-size">${TEXT_SCALES.map((scale, i) => `<option value="${scale}"${scale === this.preferences.textScale ? ' selected' : ''}>${['Běžný', 'Větší', 'Největší'][i]} · ${Math.round(scale * 100)} %</option>`).join('')}</select></label><p class="tiny interface-keyboard-help">F6 přepne mezi světem a panely. V panelech přecházej klávesou Tab, rozbaluj mezerníkem nebo Enterem.</p>`;
  }

  private save(): void {
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.preferences)); } catch { /* Session preferences still work. */ }
  }
}
