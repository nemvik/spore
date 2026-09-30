import { EMPIRE_PROFILES } from '../game/space-empires-content';
import type { GameState } from '../game/types';
import { pirateQuote, pulseQuote, currentShipRescue } from '../game/space-combat';
import { activeSpaceBattle, combatTotals, latestBattle, vecDistance, RESCUE_SECONDS, enemyProfile } from '../game/space-combat-content';
import { escapeHtml as esc } from './creature-library';
const button = (action: string, label: string, disabled = false) => `<button class="secondary" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
export function spaceCombatPanel(s: GameState): string {
  const p = s.space, c = p?.combat; if (!p?.ship || !c) return '';
  const battle = activeSpaceBattle(p), last = latestBattle(p), totals = combatTotals(p);
  if (p.ship.health === 0) {
    const rescue = currentShipRescue(s), remaining = rescue ? Math.max(0, RESCUE_SECONDS - (p.economy!.elapsed - rescue.startedAt)) : RESCUE_SECONDS;
    return `<section id="space-combat" class="space-combat" aria-label="Nouzová oprava"><h3>Vrak · kabina přežila</h3><p>Náklad, kolonie a účet zůstaly. Nouzová oprava vrátí25 odolnosti za12 herních sekund; nepotřebuje peníze.</p>
      ${rescue ? `<p role="status"><b>Oprava · zbývá ${remaining.toFixed(1)}s</b></p>` : button('space-rescue', 'Spustit nouzovou opravu · 12s')}
      <p class="tiny">Po opravě můžeš odletět. Placený servis u vlastní kolonie obnoví dalších40 za5 ◈.</p></section>`;
  }
  if (battle) {
    const enemy = enemyProfile(battle.kind), q = pulseQuote(s), distance = vecDistance(p.location!.pos, battle.enemy.pos);
    return `<section id="space-combat" class="space-combat" aria-label="Lodní boj"><h3>${battle.kind === 'warden' ? 'Tichý val · hraniční hlídka' : battle.kind === 'pirate' ? 'Pirátský střep' : `${battle.kind === 'invasion' ? 'Invaze' : 'Obrana'} · ${esc(EMPIRE_PROFILES[battle.war!.empireId].name)}`}</h3>
      <p><b>Odolnost ${battle.enemy.health}/${enemy.health}</b><br>Cíl ${distance.toFixed(1)} kroků · tvůj dosah24</p>
      ${button('space-pulse', 'Obranný pulz · 3 energie · ␣', !q.ok)}<p class="tiny">${esc(q.reason || 'Zásah12 · další pulz po0,65s. Mezerník vystřelí jednou.')}</p>
      <p class="tiny">${battle.kind === 'pirate' ? 'Pirát' : battle.kind === 'warden' ? 'Tichý val' : 'Říšská hlídka'} střílí za${enemy.damage} po${enemy.interval.toFixed(1).replace('.', ',')}s do${enemy.range} kroků. WASD manévruje. R ustoupí do soustavy za4 energie; V sestoupí zdarma u majáku do16.</p></section>`;
  }
  const serial = c.archive.battles + c.battles.length + 1, q = pirateQuote(s, serial);
  return `<details id="space-combat" class="space-combat" data-preserve-open><summary>Obrana lodi · ${totals.victories} vítězství</summary>
    <p class="tiny">Na cizí orbitě můžeš prověřit pirátský signál. Vyvolá skutečný souboj; začni s opravenou lodí. Výhra umlčí hlídku a další signál odloží nejméně o90s letu. Můžeš také pokračovat bez boje.</p>
    ${button(`space-pirate:${serial}`, 'Prověřit pirátský signál', !q.ok)}${q.reason ? `<p class="tiny">${esc(q.reason)}</p>` : ''}
    <p class="tiny">Pulz kabiny:3 energie, zásah12 do24 kroků. ${p.location ? 'Manévr/WASD, pulz/mezerník, ústup/R nebo V.' : 'Nejprve vzlétni a doleť na cizí orbitu.'}</p>
    ${last?.end ? `<p class="tiny">Poslední střet: ${last.end.outcome === 'won' ? 'vítězství' : last.end.outcome === 'retreated' ? 'ústup' : 'prohra a nouzová obnova'}.<br>Celkem ${totals.victories} vítězství · ${totals.retreats} ústupů · ${totals.defeats} proher.</p>` : ''}</details>`;
}
