import { atWar } from '../game/space-war-content';
import { spaceExpansionOffer } from './space-allies';
import { ownerAt } from '../game/space-expansion-content';
import type { GameState } from '../game/types';
import type { SpaceEmpire } from '../game/space-empires-types';
import { empireAt, empireQuote, empireRelation, missionProgress, missionTarget, type EmpireOrder } from '../game/space-empires';
import { EMPIRE_PROFILES } from '../game/space-empires-content';
import { PHILOSOPHY_NAMES, empireAffinity, spaceInheritance } from '../game/space-inheritance';
import { planetSystem } from '../game/galaxy';
import { LIFE_PROFILES } from '../game/space-life';
import { escapeHtml as esc } from './creature-library';

export function spaceInheritanceMarkup(s: GameState): string {
  const saved = s.space?.empires?.inheritance, inheritance = saved ?? spaceInheritance(s), diet = inheritance.diet;
  const dietNames = { plants: 'rostlinná cesta', meat: 'živočišná cesta', mixed: 'smíšená strava', unknown: 'nedostatek úplných dokladů' };
  const routeNames = { social: 'přátelství', predator: 'lov', mixed: 'smíšená cesta', allied: 'spojenectví', conquered: 'podrobení' };
  const methods = { trade: 'obchod', military: 'vojenství', conversion: 'víra' };
  return `<h4>${PHILOSOPHY_NAMES[inheritance.philosophy]} · ${saved ? 'dědictví prvního kontaktu' : 'dosavadní doložená linie'}</h4>
    <p class="tiny">Strava: ${dietNames[diet.kind]}${diet.plants === null ? '' : ` · rostliny ${diet.plants}, maso ${diet.meat}, ostatní ${diet.other}`}. ${diet.coverage === 'complete' ? 'Uzavřené úplné záznamy etap 0–2.' : 'Chybějící minulost nepovažujeme za nulu.'}<br>
    Tvor: ${inheritance.creature ? routeNames[inheritance.creature] : 'cesta nedoložena'}. Kmen: ${inheritance.tribe ? routeNames[inheritance.tribe] : 'cesta nedoložena'}.<br>
    Sjednocení civilizace: ${inheritance.civilization.map(method => methods[method]).join(', ') || 'dokončení nedoloženo'}.</p>
    <p class="tiny">Čtyři oblasti dávají po 6 hlasech; smíšené cesty je rozdělí. Správce ${inheritance.scores.keeper} · Prostředník ${inheritance.scores.broker} · Průkopník ${inheritance.scores.vanguard}. Shoda znamená Tkadlec cest.</p>
    <p class="tiny">Příbuzné říši lépe rozumíš: příznivější první vztah a po dohodě +2 za kus místo +1. Tkadlec využije porozumění u všech tří. Poutník může všechny zakázky i dohody získat běžným hraním. ${saved ? 'Tento doklad je zachovaný.' : 'Výsledek se uloží při prvním osobním kontaktu.'}</p>`;
}
function missionText(s: GameState, empire: SpaceEmpire): string {
  const mission = empire.mission; if (!mission) return '';
  const target = planetSystem(s.space!.homePlanetId, mission.targetPlanetId)!;
  const objective = mission.kind === 'trade' ? 'Prodej zde nejméně 8 kusů skutečné produkce dovezené z jiné planety.'
    : mission.kind === 'ecology' ? 'Nově proskenuj všech šest živých rolí na této planetě. Známý organismus můžeš znovu placeně skenovat; chybějící role můžeš přivézt.'
      : `Po přijetí zakázky osobně sestup na povrch ${target.name} (soustava ${target.index}) a vrať se sem. Počítá se i nová návštěva známého světa.`;
  const roles = mission.evidence.flatMap(proof => proof.kind === 'ecology' ? [LIFE_PROFILES[proof.role].label] : []);
  return `<p><b>${mission.completed === null ? 'Přijatá zakázka' : 'Zakázka odevzdaná'} · ${Math.min(missionProgress(empire), missionTarget(mission.kind))}/${missionTarget(mission.kind)}</b></p><p class="tiny">${esc(objective)} ${mission.completed === null ? 'Odevzdej osobně u tohoto majáku; odměna vztah +30 a nabídka dohody.' : 'Vztah +30 získán jednou.'}</p>${roles.length ? `<p class="tiny">Doloženo: ${roles.map(esc).join(' · ')}</p>` : ''}`;
}
export function spaceEmpiresPanel(s: GameState): string {
  const p = s.space, registry = p?.empires; if (!p?.ship || !registry) return '';
  const local = p.location ? empireAt(s, p.location.planetId) : null;
  const action = (empire: SpaceEmpire, kind: EmpireOrder['kind'], label: string) => {
    const q = empireQuote(s, { kind, empireId: empire.id }, registry.nextAction);
    return `<button class="secondary" data-action="space-empire:${kind}|${empire.id}|${registry.nextAction}" ${q.ok ? '' : 'disabled'} title="${esc(q.reason)}">${esc(label)}</button>${q.reason ? `<p class="tiny">${esc(q.reason)}</p>` : ''}`;
  };
  const known = registry.entries.filter(empire => empire.contact !== null).length;
  return `<details id="space-diplomacy" class="space-diplomacy" data-preserve-open><summary>Říše a zakázky · ${known}/3 kontaktů</summary>
    ${local ? (() => { const profile = EMPIRE_PROFILES[local.id]; return `<h4 style="color:${profile.color}">${esc(profile.name)}</h4><p class="tiny">${esc(profile.description)} ${ownerAt(p, local.capitalId) === 'player' ? local.enclave ? 'Vyslanectví na tvé planetě; osada i vlastnictví zůstávají tvoje.' : 'Tvoje soustava. Vyslanectví a dřívější dohody zůstávají; vlastní kolonii spravuj v panelu obchodu.' : !local.enclave && ownerAt(p, local.capitalId) === local.id ? 'Vlastní území této společnosti.' : `Území nyní ovládá ${esc(EMPIRE_PROFILES[ownerAt(p, local.capitalId) as keyof typeof EMPIRE_PROFILES].name)}. ${local.enclave ? 'Historická enkláva' : 'Diplomatické vyslanectví'} zůstává zachované.`}</p>
      ${local.contact === null ? action(local, 'contact', 'Osobně navázat kontakt') : `<p>Vztah <b>${empireRelation(s, local)}</b>${empireAffinity(registry.inheritance, local.id) ? ` · rodové porozumění +${empireAffinity(registry.inheritance, local.id)}` : ''}</p>
      ${local.mission ? missionText(s, local) : `<p class="tiny">${profile.mission === 'trade' ? 'První kontrakt: 8 nově dovezených a prodaných kusů.' : profile.mission === 'ecology' ? 'První katalog: nové placené skeny všech šesti živých rolí zde.' : 'První hlídka: nový sestup na blízký pustý svět a osobní návrat.'}</p>${action(local, 'accept', 'Přijmout zakázku')}${local.id === 'roots' ? `<p class="tiny">Pokud chceš zkoumat bez živého katalogu, můžeš místo něj zmapovat pustý svět. Vyber jednu cestu: katalog odemkne odznak Správce života a solární listy, mapování Hvězdného zvěda a skokovou cívku.</p>${action(local, 'accept-survey', 'Místo katalogu přijmout mapování')}` : ''}`}
      ${local.mission && local.mission.completed === null ? action(local, 'complete', 'Odevzdat výsledek · vztah +30') : ''}
      ${local.mission?.completed ? local.treaty === null ? action(local, 'treaty', `Uzavřít dohodu · +${empireAffinity(registry.inheritance, local.id) ? 2 : 1} ◈/ks`) : `<p class="tiny"><b>${atWar(p, local.id) ? 'Dohoda pozastavena válkou' : 'Obchodní dohoda platí'} · +${empireAffinity(registry.inheritance, local.id) ? 2 : 1} ◈/ks</b><br>${atWar(p, local.id) ? 'Trh znovu otevře příměří.' : 'Platí pro nové skutečné prodeje zde.'} Dřívější obchod se nepřepočítává.</p>` : ''}`}${spaceExpansionOffer(s, local)}`; })() : '<p class="tiny">Hvězdná mapa ukazuje tři vysílající soustavy. Pro osobní kontakt sestup k jejich povrchovému majáku, do 12 kroků a pod výšku 8.</p>'}
    <div class="space-empire-overview">${registry.entries.filter(empire => empire !== local).map(empire => { const system = planetSystem(p.homePlanetId, empire.capitalId)!; return `<p class="tiny"><b>${empire.contact === null ? 'Neznámý signál' : esc(EMPIRE_PROFILES[empire.id].name)}</b> · ${system.index} ${esc(system.name)}${empire.contact !== null ? ` · vztah ${empireRelation(s, empire)}` : ''}${empire.mission ? `<br>Zakázka ${Math.min(missionProgress(empire), missionTarget(empire.mission.kind))}/${missionTarget(empire.mission.kind)}${empire.mission.completed ? ' · odevzdaná' : ''}` : ''}${atWar(p, empire.id) ? ' · VÁLKA/embargo' : empire.treaty ? ' · dohoda' : ''}</p>`; }).join('')}</div>
    <details id="space-inheritance" data-preserve-open><summary>Dědictví · ${PHILOSOPHY_NAMES[(registry.inheritance ?? spaceInheritance(s)).philosophy]}</summary>${spaceInheritanceMarkup(s)}</details></details>`;
}
