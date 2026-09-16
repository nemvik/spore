import { BODY_PRESETS, neutralSpine } from '../game/body-shape';
import type { Genome } from '../game/types';

export function spineSelector(genome: Genome, selected: number): string {
  return (genome.spine ?? neutralSpine()).map((node, i) => `<button data-action="spine-select:${i}" aria-label="Článek ${i + 1}${i === 0 ? ' · ocas' : i === 6 ? ' · hlava' : ''}" aria-pressed="${selected === i}" style="--node-width:${node.width};--node-height:${node.height};--node-bend:${node.bend}"><span>${i + 1}</span></button>`).join('');
}

export function bodyShapeMarkup(genome: Genome, selected: number): string {
  const node = (genome.spine ?? neutralSpine())[selected];
  return `<section class="body-shape"><h3>Vlastní silueta</h3><p class="tiny">Klikni přímo na tělo nebo na číslo článku. Zlatá oblast ukazuje, co tvaruješ. Orgány se přizpůsobí povrchu.</p><div class="spine-presets">${Object.entries(BODY_PRESETS).map(([key, preset]) => `<button data-action="spine-preset:${key}">${preset.label}</button>`).join('')}</div><div class="spine-selector" aria-label="Články těla">${spineSelector(genome, selected)}</div><div class="row spread tiny"><span>Ocas</span><span>Hlava</span></div><strong class="tiny">Článek ${selected + 1} ze 7</strong>${([['width', 'Šířka článku', .5, 1.65], ['height', 'Výška článku', .5, 1.65], ['bend', 'Ohyb článku', -.65, .65]] as const).map(([key, label, min, max]) => `<label><span class="row spread"><span>${label}</span><span>${node[key].toFixed(2)}</span></span><input type="range" data-spine="${key}" aria-label="${label}" min="${min}" max="${max}" step=".05" value="${node[key]}"></label>`).join('')}<p class="tiny">Ohyb zvedá nebo sklání článek. Víc tkáně přidá hmotnost a spotřebu; cenu uvidíš dole.</p></section>`;
}
