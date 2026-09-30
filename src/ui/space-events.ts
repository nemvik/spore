import type { GameState } from '../game/types';
import { eventColonyOpen } from '../game/space-events-content';
import { resumeColonyQuote } from '../game/space-events';
import { livingExpedition } from '../game/space-biosphere';
import { bandCondition } from '../game/space-ecology';
import { ownerAt } from '../game/space-expansion-content';
import { planetSystem } from '../game/galaxy';
import { SPACE_PRODUCTS } from '../game/space-products';
import { escapeHtml as esc } from './creature-library';

export function spaceEventsPanel(s: GameState): string {
  const p = s.space, events = p?.events; if (!p?.ship || !events) return '';
  const open = events.current.colonies.filter(eventColonyOpen), pirate = events.current.pirate;
  const content = `${pirate ? `<p class="space-event-alert"><b>Piráti sledují tvůj náklad</b><br>${esc(SPACE_PRODUCTS[pirate.candidate.receipt.product].name)} z ${esc(planetSystem(p.homePlanetId, pirate.candidate.receipt.planetId)!.name)} přilákala útočníka. Manévruj a použij pulz, nebo R/V ustup. Náklad zůstává tvůj.</p>` : ''}
    ${open.map(row => {
      const address = planetSystem(p.homePlanetId, row.planetId)!, q = resumeColonyQuote(s, row.planetId, events.nextAction),
        e = livingExpedition(s), world = e?.worlds.find(world => world.id === row.planetId), condition = e && world ? bandCondition(e, world, 1) : null;
      return `<section class="space-quarantine" data-planet="${esc(row.planetId)}"><h4>◇ Karanténa · ${esc(address.name)}</h4>
        <p class="tiny">Soustava ${address.index} · ${condition?.stable ? 'První pás je stabilní. Provoz čeká na osobní zprovoznění.' : esc(condition?.reason ?? 'Obnov první živý pás.')}
        ${ownerAt(p, row.planetId) !== 'player' ? '<br>Kolonie je také obsazená. Nejprve ji získej zpět.' : ''}</p>
        <p class="tiny">Výroba a nakládka stojí; původní stavby i zásoby zůstávají. Obnov klima, zdravé rostliny, býložravce a predátora v prvním pásu a vyčkej 10s stability. Pak přileť k povrchovému majáku.</p>
        <button class="secondary" data-action="space-event:resume|${esc(row.planetId)}|${events.nextAction}" ${q.ok ? '' : 'disabled'}>Zprovoznit kolonii · bez platby</button>
        ${q.reason ? `<p class="tiny">${esc(q.reason)}</p>` : ''}</section>`;
    }).join('')}`;
  const totals = events.current.totals;
  if (open.length || pirate) return `<section id="space-events" aria-label="Události výpravy"><h3>Události výpravy</h3>${content}</section>`;
  return `<details id="space-events" data-preserve-open><summary>Události výpravy · klid</summary>
    <p class="tiny">Dlouhodobý rozpad dříve stabilní kolonie může zastavit provoz. Náprava biotopu a osobní zprovoznění jej obnoví. Nový náklad může po příletu k jiné cizí planetě přilákat piráty. Automatické události dělí nejméně 5 minut spuštěné hry.</p>
    <p class="tiny">Obnovené kolonie ${totals.resumes} · pirátská setkání ${totals.pirates} · výhry ${totals.victories} · ústupy ${totals.retreats}.</p></details>`;
}
