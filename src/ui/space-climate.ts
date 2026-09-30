import { bandCondition, stableBandCapacity, isEcological, ECOLOGY_STABLE_SECONDS } from '../game/space-ecology';
import type { GameState } from '../game/types';
import type { HabitatBand } from '../game/space-biosphere-types';
import { bandPopulation, climateToolQuote, livingExpedition, livingPlanet } from '../game/space-biosphere';
import { climaticTier, CLIMATE_TOOL_NAMES, type ClimateTool } from '../game/space-climate';
import { escapeHtml as esc } from './creature-library';

export function spaceClimate(s: GameState): string {
  const world = livingPlanet(s), expedition = livingExpedition(s); if (!world || !expedition) return '';
  const tier = climaticTier(world), tool = expedition.biosphere.tool;
  const buttons = (['warm', 'cool', 'thicken', 'thin', 'off'] as ClimateTool[]).map(value => {
    const quote = climateToolQuote(s, value);
    return `<button class="secondary ${tool === value ? 'selected' : ''}" data-action="space-climate:${value}" aria-pressed="${tool === value}" ${quote.ok ? '' : 'disabled'} title="${esc(quote.reason)}">${esc(CLIMATE_TOOL_NAMES[value])}</button>`;
  }).join('');
  return `<details id="space-climate" class="space-climate" data-preserve-open><summary>Klima T${tier} · ${esc(CLIMATE_TOOL_NAMES[tool])}${isEcological(expedition) ? ` · stabilní ${stableBandCapacity(expedition, world)}/3` : ''}</summary>
    <svg viewBox="0 0 220 180" role="img" aria-label="Teplota ${world.temperature.toFixed(2)}, atmosféra ${world.atmosphere.toFixed(2)}, klimatické T${tier}">
      <path d="M30 80H170M100 10V150" stroke="#85b9bc" stroke-width="1"/>
      <circle cx="100" cy="80" r="64" fill="#87b4a911" stroke="#87b4a9"/><circle cx="100" cy="80" r="41.6" fill="#87b4a911" stroke="#87b4a9"/><circle cx="100" cy="80" r="19.2" fill="#87b4a922" stroke="#b8e1ab"/>
      <text x="170" y="68">horko</text><text x="5" y="68">chlad</text><text x="105" y="14">hustší</text><text x="105" y="151">řidší</text>
      <text x="156" y="103">T1</text><text x="133" y="103">T2</text><text x="98" y="84">T3</text>
      <circle cx="${100 + world.temperature * 64}" cy="${80 - world.atmosphere * 64}" r="4.5" fill="#ffdc91" stroke="#153d43"/>
      <text x="16" y="174">Teplota ${world.temperature.toFixed(2)} · atmosféra ${world.atmosphere.toFixed(2)}</text>
    </svg><div class="space-climate-tools">${buttons}</div><p class="tiny">Účinný zásah spotřebuje 2 energie/s. Střed grafu odemyká více pásů. Odlet nástroj vypne.</p>
    <div class="space-habitats">${([1, 2, 3] as HabitatBand[]).map(band => { const counts = bandPopulation(world, band), status = isEcological(expedition) ? bandCondition(expedition, world, band) : null; return `<section class="${tier >= band ? '' : 'locked'}"><b>Pás ${band} · ${counts.filter(count => count > 0).length} / 6 rolí${tier < band ? ' · nevhodné klima' : ''}</b><p class="tiny">Rostliny M/S/V ${counts.slice(0, 3).join('/')}<br>Býložravci A/B ${counts[3]}/${counts[4]} · predátor ${counts[5]}</p>${status ? `<p class="tiny ${status.stable ? 'ecology-stable' : ''}">${esc(status.reason)} · ${world.biosphere.stableFor[band - 1].toFixed(1)} / ${ECOLOGY_STABLE_SECONDS} s</p>` : ''}</section>`; }).join('')}</div>
    ${isEcological(expedition) ? `<p class="tiny"><b>Stabilní kapacita: ${stableBandCapacity(expedition, world)} / 3 pásy</b><br>Život spotřebovává skutečnou potravu. Zdravý rodič může vytvořit odnož; sken sám život neobnoví. Bez stabilního pásu se klima pomalu vrací k původnímu.</p><div class="space-life-events">${expedition.actions.filter(row => row.planetId === world.id && (row.kind === 'birth' || row.kind === 'death')).slice(-3).reverse().map(row => `<p class="tiny">${row.kind === 'birth' ? 'Nová odnož' : row.kind === 'death' ? `Ztráta života: ${{ climate: 'klima', hunger: 'hlad', predation: 'predace' }[row.cause]}` : ''} · pás ${'band' in row ? row.band : ''}</p>`).join('')}</div>` : ''}
    <p class="tiny">Klimatické T určuje vhodné pásy. Obsazenost počítá skutečné organismy; samotné klima život nevytvoří.</p></details>`;
}
