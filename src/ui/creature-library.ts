import { attachmentAngles, attachmentPoint } from '../game/anatomy';
import { computeStats } from '../game/genome';
import { upgradeCreatureGenome } from '../game/creature-body';
import { creatureSurfacePoint, resolveCreatureAnatomy } from '../game/creature-anatomy';
import { canPopulateLand } from '../game/npc-genome';
import { FOOD_LABEL } from '../game/content';
import type { CreatureCreation } from '../game/creature-library';
import type { Genome, Vec3 } from '../game/types';
export const escapeHtml = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Compact side silhouette from the actual spine and joints; the editor supplies full 3D. */
export function creatureThumbnail(genome: Genome): string {
  const g = genome.version === 2 ? genome : upgradeCreatureGenome(genome), a = resolveCreatureAnatomy(g);
  const project = (p: Vec3) => ({ x: p.z + p.x * .35, y: -p.y });
  const outline = [...Array.from({ length: 33 }, (_, i) => creatureSurfacePoint(g, -1 + i / 16, 0)), ...Array.from({ length: 33 }, (_, i) => creatureSurfacePoint(g, 1 - i / 16, Math.PI))].map(project);
  const organs = g.parts.filter(p=>!['legs','arms','lungs'].includes(p.kind)).flatMap(p=>attachmentAngles(p).map(angle=>({part:p,point:project(attachmentPoint(p.axial,angle,g))})));
  const limbs = a.limbs.map(l => [l.root, ...l.points].map(project)), points = [...outline, ...limbs.flat(),...organs.map(o=>({x:o.point.x+.5,y:o.point.y-.5}))];
  const x = Math.min(...points.map(p => p.x)) - .3, y = Math.min(...points.map(p => p.y)) - .3;
  const width = Math.max(...points.map(p => p.x)) - x + .3, height = Math.max(...points.map(p => p.y)) - y + .3;
  const path = (p: { x: number; y: number }[]) => p.map(v => `${v.x.toFixed(3)},${v.y.toFixed(3)}`).join(' ');
  return `<svg class="creature-thumbnail" viewBox="${x} ${y} ${width} ${height}" role="img" aria-label="Silueta ${escapeHtml(g.name)}"><g stroke="hsl(${g.hue} 35% 42%)" stroke-width=".16" stroke-linejoin="round" stroke-linecap="round">${limbs.map(l => `<polyline points="${path(l)}" fill="none"/>`).join('')}<polygon points="${path(outline)}" fill="hsl(${g.hue} 42% 66%)" stroke-width=".035"/>${organs.map(({part:p,point:v})=>p.kind==='eyes'?`<path d="M${v.x} ${v.y}l.1 -.28" fill="none" stroke-width=".06"/><circle cx="${v.x+.1}" cy="${v.y-.28}" r=".1" fill="#ebf7df" stroke-width=".025"/><circle cx="${v.x+.13}" cy="${v.y-.29}" r=".045" fill="#153c37" stroke="none"/>`:p.kind==='shell'?`<ellipse cx="${v.x}" cy="${v.y}" rx=".42" ry=".15" fill="hsl(${g.hue} 30% 48%)" stroke-width=".035"/>`:['filter','jaw','proboscis'].includes(p.kind)?`<path d="M${v.x} ${v.y}l.35 -.13l-.05 .24" fill="none" stroke-width="${p.kind==='filter'?.12:.07}"/>`:'').join('')}</g></svg>`;
}
export function creatureLibraryMarkup(entries: CreatureCreation[], canSave: boolean): string {
  const button = (action: string, label: string) => `<button class="secondary" data-action="${action}">${label}</button>`;
  return `<p>Tvůj atlas těl napříč liniemi. Nová linie osídlí souš uloženými tvory, kteří umějí chodit, dýchat a jíst potravu místního druhu.</p>
    <div class="row library-toolbar">${canSave ? button('library-capture', 'Uložit současného tvora') : ''}${button('library-new', 'Vytvořit tvora')}<label class="secondary library-import">Importovat tvora<input id="import-creature" type="file" accept=".json,application/json"></label></div>
    <p class="tiny">${entries.length} / 100 tvorů · úpravy knihovny ovlivní až nové linie · exportuje se každý tvor zvlášť</p>
    <div class="creature-library-grid">${entries.map(c => `<article class="creature-library-card" data-creation="${c.id}">${creatureThumbnail(c.genome)}<h3>${escapeHtml(c.genome.name)}</h3><p class="tiny">${canPopulateLand(c.genome) ? 'Souš · můžeš jej potkat' : 'Bez vhodné role na souši'}<br>${computeStats(c.genome).diet.map(d => FOOD_LABEL[d]).join(' · ')}</p><p>${escapeHtml(c.description || 'Bez popisu')}</p><small>Revize ${c.revision} · ${escapeHtml(new Date(c.updatedAt).toLocaleDateString('cs-CZ'))}</small><div class="row">${button(`library-edit:${c.id}`, 'Upravit / 3D')}${button(`library-export:${c.id}`, 'Exportovat')}${button(`library-delete:${c.id}`, 'Odstranit')}</div></article>`).join('') || '<p class="library-empty">Knihovna je prázdná. Ulož svého tvora z rozehrané linie nebo si zde vytvoř nového.</p>'}</div>`;
}
