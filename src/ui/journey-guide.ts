import { activeSites, journeyAction, journeyHint, journeyRequirements, plantedStatus } from '../game/journey';
import { SITE_STORIES } from '../game/journey-content';
import { distance } from '../game/random';
import { nurserySpecies } from '../game/nursery';
import type { GameState, Vec3 } from '../game/types';

const completion = [
  'Závojník se nají u nové řasy v bezpečí před lovcem.',
  'Minerální kulturu zasadíš do jednoho z vyznačených kruhů.',
  'Soumrakovou kulturu zasadíš u severního odtoku.',
  'Plachtovec se nají u nového porostu mimo dosah lovce.',
  'Uvolněnou řasu zasadíš nahoře mezi kořenové opory.',
  'Kulturu průduchu zasadíš na severní mělčině.',
  'Zvonkonoš se nají u nového porostu a kořeny zůstanou živé.',
  'Zvonkonoš se nají u nového porostu a kořeny zůstanou živé.',
  'Prachokřídlík dorazí do domova; domov získá živou oporu.',
];

export function targetLocation(from: Vec3, to: Vec3, vertical = false): string {
  const dx = to.x - from.x, dz = to.z - from.z;
  const direction = Math.hypot(dx, dz) < 3 ? 'poblíž' : `${dz < -3 ? 'sever' : dz > 3 ? 'jih' : ''}${Math.abs(dx) > 3 ? `${Math.abs(dz) > 3 ? 'o' : ''}${dx > 0 ? 'východ' : 'západ'}` : ''}`;
  return `${direction} · ${Math.round(distance(from, to))} m${vertical && Math.abs(to.y - from.y) > 2 ? ` · ${to.y > from.y ? 'Q ↑' : 'C ↓'}` : ''}`;
}

/** Read-only guidance follows the same selected encounter and care action as the game. */
export function journeyGuide(s: GameState, currentHint?: ReturnType<typeof journeyHint>) {
  if (s.stage > 2 || s.journey.legacy || s.campaign.won) return null;
  const hint = currentHint ?? journeyHint(s);
  if (!hint) return null;
  const site = hint.site, sites = activeSites(s), cargo = s.journey.cargo, action = journeyAction(s);
  const completedWhen = site.id === 4 && s.journey.canopy ? 'Plachtovec se bezpečně nají u nové řasy v horním kruhu nebo boční zátoce.' : completion[site.id];
  const result = (step: string, instruction: string, target: Vec3 | null, done = completedWhen) => ({ title: SITE_STORIES[site.id].title, step, instruction, target, location: target ? targetLocation(s.player.pos, target, s.stage === 1) : '', done });
  if (action?.operation === 'awaken' && action.site?.id === site.id) return result('Obnov místní druh', `${action.label}. ${action.detail}`, site.source);
  if (cargo?.purpose === 'food') return result('Neseš běžné sousto', 'E položí potravu za tebou. Pro výsadbu pak vezmi klávesou T živou kulturu přímo u mateřského porostu.', site.source);
  if (nurserySpecies(s, site) && (site.plantedId !== null || cargo || site.id === 4 && s.journey.canopy?.releasedAt !== null)) return result('Obnov místní druh', hint.choices.join(' '), site.source);
  if (cargo?.purpose === 'culture') {
    if (cargo.vitality < 20) return result('Vezmi nový vzorek', 'Tento vzorek je příliš slabý pro výsadbu. E jej polož a vrať se k mateřskému porostu pro nový.', site.source);
    if (site.id === 8) return result('Doprovoď nosiče spor', `${hint.text} ${hint.choices[0] ?? ''}`, action?.pos ?? site.refuges[0]);
    return result('3 · Zasaď kulturu', `Dostaň se k označenému kořenovému kruhu a stiskni T. ${action?.ready ? 'Jsi v dosahu.' : action?.detail ?? ''} E odloží vzorek jako jídlo. ${s.stage === 1 ? hint.choices[0] ?? '' : 'Cestou šetři sprint.'}`, action?.pos ?? site.refuges[0]);
  }
  const planted = plantedStatus(s, site);
  if (planted && !site.resolved) return result('4 · Přiveď návštěvníka', `${planted.text} ${planted.choices[0] ?? ''}`, s.world.resources.find(r => r.id === site.plantedId)?.pos ?? site.source);
  if (planted && site.resolved && s.stage === 2) return result('Udrž živý domov', `${planted.text} ${planted.choices[0] ?? ''}`, s.world.resources.find(r => r.id === site.plantedId)?.pos ?? site.source);
  if (site.resolved) {
    const next = sites.find((_, i) => !journeyRequirements(s)[i].met);
    if (next && next.id !== site.id) return result('Pokračuj k dalšímu porostu', `Prozkoumej klávesou T: ${SITE_STORIES[next.id].title}.`, next.source, 'Tento vztah už je zapsaný.');
    return result('Připrav další etapu', hint.choices[0] ?? hint.text, s.world.landmarks.find(l => l.kind === 'gate')?.pos ?? null, 'Podmínky přechodu ukazuje deník J.');
  }
  if (!site.observed) return result('1 · Prozkoumej porost', 'Dostaň se k označenému mateřskému porostu a stiskni T. Mezerník jí; T zkoumá a přenáší.', site.source);
  if (site.id === 4 && s.journey.canopy?.releasedAt === null) return result('2 · Uvolni mateřskou řasu', `${hint.text} ${hint.choices[0] ?? ''}`, site.source);
  if (site.id === 4 && s.journey.canopy) return result('2 · Odeber uvolněnou řasu', `${hint.text} ${hint.choices[0] ?? ''}`, site.source);
  if (site.patch === 2 && s.stage < 2 && !(s.stage === 1 && s.journey.reefEvolution) && !sites.filter(x => x.patch < 2).every(x => x.resolved)) {
    const next = sites.find(x => x.patch < 2 && !x.resolved)!;
    return result('Nejdřív obnov okolní porosty', `Tato kultura čeká na zahradu a vír. Pokračuj k porostu: ${SITE_STORIES[next.id].title}.`, next.source);
  }
  return result('2 · Odeber živou kulturu', 'U stejného mateřského porostu stiskni znovu T. Poneseš vzorek pro nový porost; místo výsadby se vyznačí na mapě.', site.source);
}
