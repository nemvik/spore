import type { GameState } from '../game/types';
import { equipmentQuote } from '../game/space-outfit';
import { equipmentBadge, EQUIPMENT_IDS, SHIP_EQUIPMENT, shipCapabilities } from '../game/space-outfit-content';
import { EMPIRE_PROFILES } from '../game/space-empires-content';
import { escapeHtml as esc } from './creature-library';
export function spaceOutfitPanel(s: GameState): string {
  const p = s.space, outfit = p?.outfit; if (!p?.ship || !outfit || !p.economy) return '';
  const stats = shipCapabilities(p)!;
  return `<details id="space-outfit" data-preserve-open class="space-outfit"><summary>Odznaky a výbava · ${outfit.purchases.length}/3 modulů</summary>
    <p class="tiny">Náklad ${stats.cargo} · dosah ${stats.jumpRange} · stání +${stats.solar.toFixed(1)} energie/s.<br>Lodní pokladna <b>${p.economy.balance} ◈</b>. Montáž doma nebo u vlastní kolonie. Vzhled původní stavby zůstává; moduly jsou navíc.</p>
    ${EQUIPMENT_IDS.map(id => { const spec = SHIP_EQUIPMENT[id], paid = outfit.purchases.find(row => row.equipment === id), badge = paid?.unlock ?? equipmentBadge(p, id), q = equipmentQuote(s, id, p.economy!.nextAction);
      return `<section class="space-equipment"><h4>${esc(spec.name)} ${paid ? '· namontováno' : `· ${spec.price} ◈`}</h4><p class="tiny">${esc(spec.effect)}<br>${badge ? `◆ ${esc(spec.badge)} · ${esc(EMPIRE_PROFILES[badge.empireId].name)}: odevzdaná zakázka.` : `◇ ${esc(spec.badge)} · odevzdej ${spec.mission === 'trade' ? 'obchodní' : spec.mission === 'survey' ? 'průzkumnou' : 'ekologickou'} zakázku.`}</p>${paid ? `<p class="tiny">Zaplaceno ${paid.paid} ◈ z lodní pokladny. Trvalý modul.</p>` : `<button class="secondary" data-action="space-equipment:${id}|${p.economy!.nextAction}" ${q.ok ? '' : 'disabled'} title="${esc(q.reason)}">Zaplatit a namontovat · ${spec.price} ◈</button>${q.reason ? `<p class="tiny">${esc(q.reason)}</p>` : ''}`}</section>`;
    }).join('')}</details>`;
}
