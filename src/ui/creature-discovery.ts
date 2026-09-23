import { discoveryState, migrationProblem, reproductionProblem } from '../game/creature-discovery';
import { getAdaptation } from '../game/adaptation-catalog';
import { horizontalDistance } from '../game/random';
import type { GameState } from '../game/types';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const place = (id: string) => id === 'west' ? 'Západní kosti' : id === 'south' ? 'Jižní kosti' : 'Východní kosti';
export function discoveryMarkup(s: GameState) {
  const d = discoveryState(s); if (!d) return '';
  const pending = d.parts.filter(p => p.usedGeneration === null), home = s.world.landmarks.find(l => l.kind === 'nest')!;
  const nearby = horizontalDistance(s.player.pos, home.pos) < 11;
  return `<section class="discovery"><div class="species-progress"><b>Objevené části ${d.parts.length} / 5</b><small>◇ Domov ${Math.round(horizontalDistance(s.player.pos, home.pos))} m</small></div>
  ${pending.length ? `<p class="discovery-new">Nové: ${pending.map(p => escape(getAdaptation(p.part).name)).join(', ')}. Vrať se domů a předej je další generaci.</p>` : `<p class="tiny">✧ Kosti na mapě skrývají části. Objevy zůstávají, DNA platí stavbu těla.</p>`}
  ${d.remains.filter(r => !r.collected).map(r => `<button class="secondary wide" data-action="species-remains:${r.id}" ${horizontalDistance(s.player.pos, r.pos) > 5 ? 'disabled' : ''}>✧ ${place(r.id)} <small>${Math.round(horizontalDistance(s.player.pos, r.pos))} m · prozkoumat</small></button>`).join('')}
  ${d.migration ? `<p class="discovery-new">Migrace → ${place(d.migration.site)}. Rodina ${Math.round(horizontalDistance(s.player.pos, d.migration.pos))} m; drž se do 18 m.</p><button class="secondary wide" data-action="species-settle">Založit hnízdo s rodinou</button><button class="secondary wide" data-action="species-cancel-migration">Zrušit migraci</button>` : `${nearby ? `<button class="secondary wide" data-action="editor" ${reproductionProblem(s) ? 'disabled' : ''}>Nová generace · Tab</button>${reproductionProblem(s) ? `<p class="tiny">${reproductionProblem(s)}</p>` : ''}` : ''}${d.birth ? `<div class="discovery-migration"><p>Přesunout hnízdo</p>${d.remains.filter(r => r.collected).map(r => `<button class="secondary wide" data-action="species-migrate:${r.id}" title="${migrationProblem(s, r.id) ?? 'Doveď rodinu na nové místo'}" ${migrationProblem(s, r.id) ? 'disabled' : ''}>${place(r.id)}</button>`).join('')}</div>` : '<p class="tiny">Nová generace v editoru zpřístupní migraci hnízda.</p>'}`}</section>`;
}
export function discoveryJournal(s: GameState) {
  const d = discoveryState(s); if (!d) return '';
  return `<h3>Objevy a generace</h3><p>Katalog je dědictví druhu; utracením DNA se objevy neztrácí. Alfa korunoplaz má 96 zdraví, silnější úder a vyžaduje delší sociální setkání. Vezmi smečku, obejdi jej, nebo se vrať s upraveným tělem.</p>${d.parts.map(p => `<p><b>${getAdaptation(p.part).name}</b> · ${escape(p.origin)} · objev v generaci ${p.generation} · ${p.usedGeneration === null ? 'čeká na použití v editoru' : `použito v generaci ${p.usedGeneration}`}</p>`).join('')}<p>Sociální pomoc smečky: ${d.socialAssists} odpovědí. Přesuny hnízda: ${d.migrations.length}. ${d.birth ? `Poslední narození: generace ${d.birth.generation}.` : ''}</p>`;
}
