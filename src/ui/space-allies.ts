import { atWar } from '../game/space-war-content';
import type { GameState } from '../game/types';
import type { SpaceEmpire } from '../game/space-empires-types';
import type { ExpansionKind } from '../game/space-expansion-types';
import { expansionQuote } from '../game/space-expansion';
import { alliedEmpire, ownerAt } from '../game/space-expansion-content';
import { EMPIRE_PROFILES } from '../game/space-empires-content';
import { escapeHtml as esc } from './creature-library';

export function spaceExpansionOffer(s: GameState, empire: SpaceEmpire): string {
  const p = s.space; if (!p?.expansion) return '';
  const button = (kind: ExpansionKind, label: string) => {
    const q = expansionQuote(s, kind, empire.id, p.economy!.nextAction);
    return `<button class="secondary" data-action="space-expansion:${kind}|${empire.id}|${p.economy!.nextAction}" ${q.ok ? '' : 'disabled'} title="${esc(q.reason)}">${label}</button>${q.reason ? `<p class="tiny">${esc(q.reason)}</p>` : ''}`;
  };
  return `<section class="space-expansion"><h4>Spojenectví a území</h4>
    ${alliedEmpire(p, empire.id) ? atWar(p, empire.id) ? '<p class="tiny"><b>Zaplacený doprovod pozastaven</b><br>Baterie čeká na příměří; vztahová výhoda je pozastavená.</p>' : '<p class="tiny"><b>Skutečný spojenec · vztah +10</b><br>Zaplacená doprovodná loď letí s tebou.</p>'
      : `<p class="tiny">Doprovod stojí40 ◈. Má baterii12 a vlastní solár0,8/s; v dosahu6 předává až2 energie/s. Pomáhá i při místním letu, mezi soustavami tě následuje. Vyžaduje obchodní dohodu.</p>${button('alliance', 'Spojenectví a doprovod · 40 ◈')}`}
    ${ownerAt(p, empire.capitalId) === 'player' ? '<p class="tiny"><b>Tvoje soustava</b> · vyslanectví i dohody zůstávají.</p>'
      : `<p class="tiny">Za120 ◈ získáš celou soustavu s její planetou. Vyslanectví zůstává; vlastní kolonii potom založíš za40 ◈ nad stabilním prvním pásem.</p>${button('territory', 'Koupit soustavu · 120 ◈')}`}</section>`;
}
export function spaceAlliesPanel(s: GameState): string {
  const p = s.space, allies = p?.expansion?.allies; if (!p || !allies?.length) return '';
  return `<details id="space-allies" data-preserve-open><summary>Spojenecký doprovod · ${allies.length}/3</summary>
    <p class="tiny">Baterie12 · solár0,8/s · sdílení až2/s do6 kroků. V přechodu a doma nepředává. Každý má vlastní zásobu.</p>
    ${allies.map(ally => { const pos = ally.location?.pos, ship = p.location?.pos, distance = pos && ship ? Math.hypot(pos.x - ship.x, pos.y - ship.y, pos.z - ship.z) : null;
      return `<p class="tiny"><b style="color:${EMPIRE_PROFILES[ally.empireId].color}">${esc(EMPIRE_PROFILES[ally.empireId].name)}</b><br>Baterie ${ally.energy.toFixed(1)} /12 · předáno ${ally.delivered.toFixed(1)}<br>${atWar(p, ally.empireId) ? 'Služba pozastavená válkou. Stejná baterie se vrátí po příměří.' : distance === null ? 'Zaparkovaný v domácí dílně.' : p.leg ? 'Společný let mezi měřítky.' : `Vzdálenost ${distance.toFixed(1)} · ${distance <= 6 ? 'v dosahu sdílení' : 'dohání formaci'}`}</p>`;
    }).join('')}</details>`;
}
