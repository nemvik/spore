import type { GameState } from './types';
import type { EcologySite } from './journey-types';
import { distance } from './random';
import { hunterThreatening } from './hunter-appetite';
import { landSiteSupport } from './climate';

export const TERRACE_COPY = {
  crossing: 'Západní cesta za kmeny kryje novou pastvu. Východní strana je otevřené loviště. Dvě mezery mezi stromy dovolí převést tvory z jedné strany na druhou.',
  food: 'Detrit přivede žrouty, ale zvonkonoše ponechá u řas. Nektar přiláká oba druhy. E položí potravu za tvým tělem.',
  memory: 'Korunoplaz se vrací tam, kde skutečně snědl maso. Dalším soustem můžeš jeho místo změnit; pouhé položení nestačí.',
  migration: 'Později tudy můžeš vést prachokřídlíka. Živé kořeny jej napojí; loviště v jeho cestě bude potřeba obejít nebo zklidnit.',
  carry: 'Vyber, kde má vyrůst pastva. Západní kruh kryjí stromy; východní kruh leží na otevřené straně.',
};

/** Explain the authored crossing and one actual hunter's learned behavior.
 * Existing imported worlds without its tree screen keep their original text. */
export function terraceGuidance(s: GameState, site: EcologySite): { title: string; text: string; choices: string[] } | null {
  if (s.stage !== 2 || s.journey.version !== 3 || s.journey.legacy || s.campaign.won || site.id !== 7 || !site.observed) return null;
  const wallX = site.source.x - 7;
  if (!s.world.obstacles.some(o => o.kind === 'tree' && o.radius === 2.3 && Math.abs(o.pos.x - wallX) < .01 && Math.abs(o.pos.z - site.source.z + 19) < .01)) return null;
  // Extinction and lost water retain their more urgent existing care guidance.
  if (!s.world.creatures.some(c => c.patch === 1 && c.species === 'bell' && c.health > 0)
    || site.resolved && landSiteSupport(s, site) <= 0) return null;
  const plant = s.world.resources.find(r => r.id === site.plantedId);
  const hunter = s.world.creatures.filter(c => c.species === 'crest' && c.patch === 1 && c.health > 0)
    .sort((a, b) => distance(a.pos, s.player.pos) - distance(b.pos, s.player.pos) || a.id - b.id)[0];
  const memory = hunter && s.journey.hunters.find(h => h.stage === 2 && h.id === hunter.id);
  const learned = memory?.feedingHome;
  const place = learned ? `Korunoplaz si pamatuje jídlo ${learned.x < wallX ? 'na západní straně stromů' : 'na otevřené východní straně'}. ${hunter!.hunger > 40 ? 'Znovu má hlad.' : hunterThreatening(s, hunter!) ? 'Dokončuje rozběhnutý útok.' : 'Je sytý; konzumenty teď nepronásleduje.'}` : TERRACE_COPY.memory;
  if (s.journey.cargo?.purpose === 'culture' && s.journey.cargo.site === 7) return {
    title: 'Vyber budoucí průchod', text: TERRACE_COPY.carry, choices: [TERRACE_COPY.food, TERRACE_COPY.migration],
  };
  if (site.resolved) return {
    title: 'Pramen má nové sousedy', text: `Živá opora drží vodu na ${Math.ceil(landSiteSupport(s, site) * 100)} %. ${place}`,
    choices: [TERRACE_COPY.migration, TERRACE_COPY.food],
  };
  if (plant) {
    const gnaws = s.world.creatures.filter(c => c.species === 'gnaw' && c.health > 0 && c.hunger > 28 && distance(c.pos, plant.pos) < 10).length;
    const bells = s.world.creatures.filter(c => c.species === 'bell' && c.health > 0 && c.intent === 'forage' && c.target === plant.id).length;
    return { title: gnaws ? 'Odděl žrouty od nové pastvy' : 'Pastva mezi dvěma cestami',
      text: `${gnaws ? 'Hladoví žrouti jsou u mladých kořenů.' : bells ? 'Zvonkonoši přicházejí k novým kořenům.' : 'Novou pastvu musí najít živý zvonkonoš.'} ${place}`,
      choices: [TERRACE_COPY.food, gnaws ? 'Přiveď žrouty přes loviště, odlákej je od kořenů, nebo je selektivně lov. Na další hlad korunoplaza nemusíš čekat.' : TERRACE_COPY.migration] };
  }
  return { title: 'Dvě cesty k prameni', text: TERRACE_COPY.crossing, choices: [TERRACE_COPY.food, place] };
}
