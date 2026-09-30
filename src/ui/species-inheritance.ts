import type { GameState, Genome } from '../game/types';
import { CELL_ADAPTATIONS, canChooseCellAdaptation, creatureInheritance, type CellAdaptation } from '../game/lineage-history';
import { civilizationInheritance } from '../game/civilization';
import { PHILOSOPHY_NAMES, spaceInheritance } from '../game/space-inheritance';

export function cellAdaptationEditor(s: GameState, draft: Genome, selected?: CellAdaptation): string {
  if (s.stage !== 0 || !s.cellGrowth || !s.lineageHistory) return '';
  const chosen = s.lineageHistory.cellAdaptation;
  if (chosen) return `<p class="tiny">Dědictví: ${CELL_ADAPTATIONS[chosen.part].name}. Historie zůstává; tělo můžeš přestavět.</p>`;
  return `<details class="part-detail" open><summary>Dědictví pro útes</summary><p class="tiny">Vyber objevenou část v tomto těle. Potvrzení generace zapíše trvalou historii; další orgány a cesty zůstanou otevřené.</p>${(Object.keys(CELL_ADAPTATIONS) as CellAdaptation[]).map(part => {
    const choice = CELL_ADAPTATIONS[part], enabled = canChooseCellAdaptation(s, draft, part);
    return `<button class="secondary wide" data-action="cell-adaptation:${part}" aria-pressed="${selected === part}" ${enabled ? '' : 'disabled'}>${selected === part ? '✓ ' : ''}${choice.name} · ${part === 'spines' ? 'ostny' : 'tykadla'}</button><p class="tiny">${choice.now} ${choice.later}${enabled ? '' : ' Nejprve objev schránku ✧ a přidej část.'}</p>`;
  }).join('')}<p class="tiny">Pulzy platí pouze v útesu. Toxin na X má přednost, potom sonar. Bez výběru zůstane historie neznámá.</p></details>`;
}

/** A three-node view of the existing evidence, never a second choice registry. */
export function speciesInheritanceMarkup(s: GameState): string {
  const cell = s.lineageHistory?.cellAdaptation, creature = creatureInheritance(s), civic = civilizationInheritance(s);
  const philosophy = s.space?.empires?.inheritance ?? spaceInheritance(s);
  const routeNames: Record<string, string> = { social: 'Přátelství', predator: 'Predace', mixed: 'Smíšený život' };
  const civicNames = { military: 'Vojsko', trade: 'Obchod', conversion: 'Konverze' };
  const cellText = cell ? `${CELL_ADAPTATIONS[cell.part].name} → ${CELL_ADAPTATIONS[cell.part].later} ${s.stage === 1 ? 'Aktivní nyní.' : s.stage === 0 ? 'Aktivuje se v útesu.' : 'Útesová schopnost už skončila.'}` : s.stage === 0 ? 'V editoru zvol dědictví objevených ostnů nebo tykadel; potvrď generaci.' : 'Volba není zaznamenaná. Současné tělo ji nedokládá.';
  return `<section class="species-inheritance" aria-label="Dědictví druhu"><h3>Dědictví druhu</h3><ol><li><strong>Buňka → útes</strong><p>${cellText}</p></li><li><strong>Tvor → kmen</strong><p>${creature.route ? `${routeNames[creature.route]} → diplomacie +${Math.round((creature.social - 1) * 1000) / 10} %, zásah +${Math.round((creature.combat - 1) * 1000) / 10} %. ${s.stage === 3 ? 'Aktivní nyní.' : 'Platí v kmeni.'}` : 'Přátelství se třemi druhy → diplomacie +15 %; predace → zásah +15 %; kombinace → obojí +7,5 %. Rozhodují skutečně vyřešená hnízda.'}</p></li><li><strong>Civilizace → vesmír</strong><p>${civic.methods.length ? civic.methods.map(m => civicNames[m]).join(' + ') : 'Vojsko / obchod / konverze podle skutečných převzetí měst'} → příspěvek k filozofii ${PHILOSOPHY_NAMES[philosophy.philosophy]}. Vojsko podporuje Průkopníka, obchod Prostředníka, konverze Správce; kombinuje se s dřívější historií. Příbuzná říše: vztah +10, smluvní prodej +2/kus; Tkadlec cest +5 a +2 u všech. Bez příbuznosti smlouva +1.</p></li></ol><p class="tiny">Jde o historii činů, nikoli trvalou třídu. Tělo, další společenské volby a civilizační cesty zůstávají volné. Podrobné doklady níže.</p></section>`;
}
