import { activeCreatureStage, creatureIntelligence } from '../game/creature-stage';
import { worldSpecies } from '../game/npc-genome';
import { horizontalDistance } from '../game/random';
import { transitionRequirements, transitionStatus } from '../game/simulation';
import type { GameState } from '../game/types';
import { cellGuide } from './cell-growth';
import { escapeHtml } from './creature-library';
import { journeyGuide, targetLocation } from './journey-guide';

export function objectiveNextMarkup(s: GameState, guide: ReturnType<typeof journeyGuide> | ReturnType<typeof cellGuide>): string {
  const life = activeCreatureStage(s);
  if (life) {
    const ready = creatureIntelligence(s) >= 3;
    const nest = life.nests.filter(n => n.discovered && !n.outcome).sort((a, b) => horizontalDistance(s.player.pos, a.pos) - horizontalDistance(s.player.pos, b.pos))[0];
    const home = s.world.landmarks.find(l => l.kind === 'nest');
    const target = ready ? home?.pos : nest?.pos;
    return `<p>${ready ? 'Vrať se do vlastního hnízda ◇ a stiskni G.' : nest ? `Navštiv ${escapeHtml(worldSpecies(s.world, nest.species).name)}. Získej přátelství klávesou V nebo přepni na boj klávesou B.` : 'Prozkoumej okolí a najdi sousední hnízdo. S jeho obyvateli se můžeš spřátelit nebo bojovat.'}</p>${target ? `<div class="quest-location">${escapeHtml(targetLocation(s.player.pos, target))}</div>` : ''}`;
  }
  if (guide) return `<div class="quest-next">${s.stage === 0 && cellGuide(s) ? '' : `<span class="eyebrow">${escapeHtml(guide.step)}</span>`}<p>${escapeHtml(guide.instruction)}</p>${guide.target ? `<div class="quest-location">◎ Cíl na mapě · ${escapeHtml(guide.location)}</div>` : ''}</div>`;
  if (s.stage === 2 && s.journey.legacy && !s.campaign.won && !transitionStatus(s).ready) {
    return '<p>Zvol cestu proti suchu: obnov prameny, zastav žrouty nebo převeď partnery do útočiště. Postup jednotlivých cest najdeš v Podrobnostech.</p>';
  }
  const next = transitionRequirements(s).find(r => !r.met);
  return `<p>${escapeHtml(next ? `${next.label} · ${next.value}` : transitionStatus(s).detail)}</p>`;
}
