import type { GameState } from '../game/types';
import { creatureInheritance, HISTORY_FOODS } from '../game/lineage-history';
import { CHAPTERS, FOOD_LABEL, SPECIES } from '../game/content';
import { SITE_STORIES } from '../game/journey-content';
import { MACHINE_COPY } from '../game/machine-copy.cs';
import { TRIBE_COPY } from '../game/tribe-copy.cs';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const labels: Record<string, string> = { cultivate: 'pěstování', hunt: 'lov', guide: 'vedení', friend: 'přátelství', predator: 'predace', allied: 'spojenectví', conquered: 'dobytí', restoration: 'obnova', migration: 'migrace', stable: 'stabilní T3', passage: 'přechod', social: 'přátelská cesta', mixed: 'smíšená cesta' };
function factLabel(key: string): string {
  const [kind, id] = key.split(':');
  if (kind === 'nest') return `Hnízdo: ${SPECIES.find(s => s.id === id)?.name ?? id}`;
  if (kind === 'site') return SITE_STORIES[Number(id)]?.title ?? 'Ekologické místo';
  if (kind === 'neighbour') return TRIBE_COPY.neighbours[id as keyof typeof TRIBE_COPY.neighbours]?.name ?? 'Sousední kmen';
  if (kind === 'region') return MACHINE_COPY.regionNames[id as keyof typeof MACHINE_COPY.regionNames] ?? 'Region';
  return 'Místní planeta';
}
const percent = (v: number) => `${Math.round((v - 1) * 1000) / 10}`.replace('.', ',');
export function inheritanceEffect(s: GameState): string {
  const effect = creatureInheritance(s);
  return effect.route ? `Dědictví tvora: ${labels[effect.route]} → diplomacie +${percent(effect.social)} %, zásah sousedů +${percent(effect.combat)} %. Platí pro členy vlastního druhu v kmeni; dary a ceny beze změny.` : 'Nový bonus dědictví: 0 %. Je potřeba dokončit tvorovou cestu se záznamem alespoň tří hnízd. Starý hotový výsledek zpětně bonus nepřidává.';
}
export function lineageHistoryMarkup(s: GameState): string {
  const rows = s.lineageHistory?.stages ?? [];
  return `<section aria-label="Dědictví linie" class="lineage-history"><h3>Dědictví linie</h3><p class="notice">${inheritanceEffect(s)}</p>${s.tribe?.version === 2 ? `<p>Dosavadní schopnost finále: ${TRIBE_COPY.abilities[s.tribe.legacyAbility].name}. Zachována i u starých linií.</p>` : ''}<p class="tiny">Záznam uzavírá dokončení etapy. Obnova generace vrací svět i historii do checkpointu; opakované pokusy se nesčítají.</p>${rows.length ? rows.map(row => `<article class="journal-patch"><h3>${CHAPTERS[row.stage].short} · ${row.closed ? labels[row.closed.outcome] : 'probíhá'}</h3><p>${row.coverage === 'complete' ? 'Pozorováno od vstupu do etapy.' : row.coverage === 'partial' ? `Částečný záznam od generace ${row.started!.generation}. Dřívější jídelníček a počty jsou neznámé.` : 'Dřívější činy a jejich počty nejsou zaznamenané. Nula by zde neznamenala nečinnost.'}</p>${row.counts ? `<p>Snědeno: ${HISTORY_FOODS.map(food => `${FOOD_LABEL[food]} ${row.counts!.meals[food]}`).join(' · ')}. Úspěšný lov hráče / smečky: ${row.counts.hunts}.</p>` : ''}${row.facts.length ? `<ul>${row.facts.map(f => `<li>${escape(factLabel(f.key))}: ${labels[f.method]} · ${f.source === 'action' ? `odehráno, generace ${f.at!.generation}` : 'doloženo starým savem; čas neznámý'}</li>`).join('')}</ul>` : '<p>Žádný doložený vyřešený cíl.</p>'}${row.closed ? `<p>Výsledek: ${labels[row.closed.outcome]} · ${row.closed.source === 'action' ? 'uzavřeno hraním' : 'doloženo starým savem; průběh neznámý'}.</p>` : ''}</article>`).join('') : '<p>Historie není známá. Tělo neurčuje minulé činy; nový bonus zůstává nulový.</p>'}<p class="tiny">Výsledky kmene, regionů a lokální terraformace se uchovávají. Jejich nové následky a vesmírná filozofie přijdou v dalších částech.</p></section>`;
}
