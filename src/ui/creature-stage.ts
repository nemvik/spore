import { escapeHtml } from './creature-library';
import { worldSpecies } from '../game/npc-genome';
import { discoveryMarkup } from './creature-discovery';
import { isAlpha, socialGoal } from '../game/creature-discovery';
import { activeCreatureStage, creatureIntelligence, encounterTarget, packCapacity, speciesAbilities, speciesNest, SPECIES_ACTION_LABELS } from '../game/creature-stage';
import { COMBAT_ACTIONS, SOCIAL_ACTIONS } from '../game/creature-stage-types';
import { horizontalDistance } from '../game/random';
import type { FeedSelection, GameState } from '../game/types';

export function creatureStageMarkup(s: GameState, combat: boolean, selection: FeedSelection | null) {
  const life = activeCreatureStage(s); if (!life) return '';
  const target = encounterTarget(s, selection), nest = target && speciesNest(s, target.species);
  const progress = creatureIntelligence(s);
  return `<div class="species-progress"><span>Inteligence <b>${Math.min(3, progress)} / 3</b></span><span>Smečka <b>${life.pack.length} / ${packCapacity(s)}</b></span></div>
  ${discoveryMarkup(s)}<p class="species-next">${progress >= 3 ? 'Vrať se do vlastního hnízda (◇) a stiskni G.' : 'Navštiv tři druhy. Získej přátelství nebo poraz obránce jejich hnízda.'}</p>
  <div class="species-nests">${life.nests.map(n => `<button data-action="species-focus:${n.species}" title="Vybrat obyvatele hnízda" ${n.discovered ? '' : 'disabled'}><span>${n.outcome === 'friend' ? '♥' : n.outcome === 'predator' ? '⚔' : n.relationship < 0 ? '!' : '○'} ${n.discovered ? escapeHtml(worldSpecies(s.world,n.species).name) : 'Neznámé hnízdo'}</span><small>${Math.round(horizontalDistance(s.player.pos, n.pos))} m</small></button>`).join('')}</div>
  <div class="species-target"><strong>${target ? (worldSpecies(s.world,target.species).libraryOrigin?'✦ Z knihovny · ':'')+(isAlpha(s,target.id)?'♛ Alfa · ':'')+escapeHtml(worldSpecies(s.world,target.species).name) : 'Přibliž se k hnízdu'}</strong>${target ? `<small>${Math.round(horizontalDistance(s.player.pos, target.pos))} m · ${nest && nest.relationship >= 60 ? 'přátelský' : nest && nest.relationship <= -40 ? 'nepřátelský' : 'neutrální'} · zdraví ${Math.ceil(target.health)}</small>` : ''}${target&&isAlpha(s,target.id)?'<small class="discovery-new">Vzácná alfa · silnější úder · 9 bodů přátelství · odměna: toxin. Smečka pomůže.</small>':''}</div>
  ${nest && (nest.relationship < 0 || !nest.residents.length) ? `<button class="secondary wide" data-action="species-gift:${nest.species}">Usmíření · 25 energie u hnízda</button>` : ''}
  ${life.nests.filter(n => n.discovered && n.residents.length === 0).map(n => `<button class="secondary wide" data-action="species-gift:${n.species}">Obnovit hnízdo · ${escapeHtml(worldSpecies(s.world,n.species).name)}</button>`).join('')}
  <p class="tiny species-help">V · setkání. Odpovídej zvýrazněným projevem. R · nábor přítele. Útok mění vztah celého druhu. Ekologie a její závěr zůstávají v deníku.</p>
  ${life.pack.length ? `<div class="species-pack">${life.pack.map(id => { const c = s.world.creatures.find(c => c.id === id); return c ? `<button data-action="species-dismiss:${id}" title="Propustit společníka">${escapeHtml(worldSpecies(s.world,c.species).name)} · ${Math.ceil(c.health)} ♥ ×</button>` : ''; }).join('')}</div>` : ''}`;
}

export function creatureStageControlsMarkup(s: GameState, combat: boolean, selection: FeedSelection | null) {
  const life=activeCreatureStage(s);if(!life)return '';
  const abilities=speciesAbilities(s.player.genome),e=life.encounter,actions=combat?COMBAT_ACTIONS:SOCIAL_ACTIONS,cooldown=Math.ceil(Math.max(life.recharge,s.player.cooldown));
  return `  ${e ? `<div class="species-response" role="status"><span>Odpověz: <b>${SPECIES_ACTION_LABELS[e.requested]}</b></span><small>${Math.ceil(e.remaining)} s · ${e.progress.toFixed(1)}/${socialGoal(s,e.target)} · omyly ${e.mistakes}/3</small><meter min="0" max="${socialGoal(s,e.target)}" value="${e.progress}" aria-label="Průběh setkání"></meter></div>` : `<button class="secondary wide" data-action="communicate">V · Zahájit setkání</button>`}
  <div class="species-mode"><button data-action="species-mode" aria-pressed="${combat}">B · ${combat ? 'Boj' : 'Společenské projevy'} ⇄</button><small>${cooldown ? `Obnova ${cooldown} s` : '1–4 · akce'}</small></div>
  <div class="species-actions">${actions.map((action, i) => { const a = abilities[action]; return `<button data-action="species-action:${action}" ${a.enabled ? '' : 'disabled'} class="${e?.requested === action && !combat ? 'requested' : ''}" title="${a.enabled ? `${a.energy} energie · ${action === 'bite' ? 'kontakt čelisti' : `dosah ${a.range} m`} · obnova ${a.recharge} s` : a.reason}"><kbd>${i + 1}</kbd>${SPECIES_ACTION_LABELS[action]}<small>${a.enabled ? `${a.energy} energie` : a.reason}</small></button>`; }).join('')}</div>
`;
}

export function creatureStageEnding(s: GameState): string | null {
  const path = s.creatureStage?.completed;
  return path === 'social' ? 'Tvůj druh spojil sousedy přátelstvím. Společná řeč otevírá cestu ke kmeni.' : path === 'predator' ? 'Tvůj druh zvítězil nad obránci sousedních hnízd. Z územní převahy vzniká první kmen.' : path === 'mixed' ? 'Tvůj druh získal přátele i dobyté území. Tato smíšená historie pokračuje do kmene.' : null;
}

export { syncMarkup as syncCreatureStageMarkup } from './sync-markup';
