import type { GameState } from '../game/types';
import type { EmpireId } from '../game/space-empires-types';
import { warQuote, type WarOrder } from '../game/space-war';
import { EMPIRE_PROFILES } from '../game/space-empires-content';
import { planetSystem } from '../game/galaxy';
import { escapeHtml as esc } from './creature-library';

export function spaceWarPanel(s: GameState): string {
  const p = s.space, w = p?.wars; if (!p?.ship || !w) return '';
  const active = w.current.relations.find(r => r.active), raid = w.current.raid;
  const button = (kind: WarOrder, empire: EmpireId, label: string) => {
    const q = warQuote(s, kind, empire, w.nextAction);
    return `<button class="secondary" data-action="space-war:${kind}|${empire}|${w.nextAction}" ${q.ok ? '' : 'disabled'}>${esc(label)}</button>${q.reason ? `<p class="tiny">${esc(q.reason)}</p>` : ''}`;
  };
  if (active) {
    const profile = EMPIRE_PROFILES[active.empireId], t = w.current.totals;
    return `<section id="space-war" aria-label="Válka a obrana"><h3>Válka · ${esc(profile.name)}</h3>
      ${raid ? `<div class="space-raid"><p><b>Protiútok: ${esc(planetSystem(p.homePlanetId, raid.planetId)!.name)}</b><br>Soustava ${planetSystem(p.homePlanetId, raid.planetId)!.index} · ${w.current.engagement?.kind === 'defense' ? 'Probíhá skutečný obranný boj.' : `Na zahájení obrany zbývá ${Math.max(0, raid.deadline - p.economy!.elapsed).toFixed(0)}s.`}</p>
        ${button('defense', active.empireId, 'Bránit kolonii na její orbitě')}<p class="tiny">Přileť k cílovému orbitálnímu majáku do 24. Prohra, ústup či zmeškaný termín předá kolonii protivníkovi. Stavby a zásoby přežijí.</p></div>`
        : `<p class="tiny">Další protiútok nejdříve za ${Math.max(0, (active.nextRaidAt ?? p.economy!.elapsed) - p.economy!.elapsed).toFixed(0)}s, pokud máš vlastní kolonii. Oznámení dá 180s na přílet.</p>`}
      ${button('invasion', active.empireId, 'Napadnout místní orbitální hlídku')}
      <p class="tiny">Vítězství získá nepřátelskou planetu; nová kolonie stojí 40. Zpětné dobytí obnoví původní kolonii. Obchod a placený doprovod protistrany během války čekají.</p>
      ${button('peace', active.empireId, 'Vyjednat příměří · bez platby')}
      <p class="tiny">Po 60s lze doma či na orbitě jednat o míru. Zruší čekající nájezd a ponechá území; nemění zdraví ani zásoby.<br>Dobytí ${t.invasionVictories} · ubráněno ${t.defenseVictories} · ztracené kolonie ${t.expired + t.defenseRetreats + t.defenseDefeats}.</p></section>`;
  }
  return `<details id="space-war" data-preserve-open><summary>Válka a příměří · mír</summary>
    <p class="tiny">Válku vyhlašuješ vědomě doma nebo na orbitě. Zastaví obchod i doprovod protistrany a ohrozí vlastní kolonie. Domov zůstává v bezpečí. Invaze potřebuje skutečný lodní boj; mírová koupě zůstává u vyslanectví.</p>
    ${p.empires!.entries.filter(e => e.contact !== null).map(e => `<section><h4>${esc(EMPIRE_PROFILES[e.id].name)}</h4>${button('declare', e.id, 'Vyhlásit válku a zahájit embargo')}</section>`).join('') || '<p class="tiny">Nejprve osobně kontaktuj některou říši.</p>'}
    <p class="tiny">Příměří lze sjednat po 60s bez peněz. Poté následuje 180s společného klidu; vlastnictví zůstane podle výsledků.</p></details>`;
}
