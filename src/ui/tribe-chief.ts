import type { GameState } from '../game/types';
import { CHIEF, CHIEF_REASONS, chiefMember, chiefContact, quoteChiefElection, quoteChiefCouncil } from '../game/tribe-chief';
import { TRIBE_COPY } from '../game/tribe-copy.cs';
import { cultureEffects } from '../game/culture';
import { creatureInheritance } from '../game/lineage-history';
import { horizontalDistance } from '../game/random';
const button=(action:string,label:string,disabled=false)=>`<button class="secondary" data-action="tribe-chief-${action}"${disabled?' disabled':''}>${label}</button>`;
export function chiefMarkup(s:GameState,ids:readonly number[]):string {
  const t=s.tribe?.version===2?s.tribe:null;if(!t||s.stage!==3)return '';
  const c=t.chief,u=chiefMember(s),e=c?.active,r=c?.result,q=quoteChiefElection(s,ids),contact=chiefContact(s);
  const n=t.neighbours.find(n=>n.id===e?.neighbour),host=n?.society?.members.find(v=>v.id===e?.host);
  const gain=CHIEF.gain*(e?.multiplier??(u?cultureEffects(u.outfit).social*creatureInheritance(s).social:1));
  return `<section class="chief-panel panel" aria-label="Náčelník" data-chief-phase="${e?.phase??r?.reason??'idle'}"><div class="row spread"><span class="eyebrow">♛ NÁČELNÍK</span>${button('close','Zavřít')}</div>
    <h3>${u?`Člen ${u.id} · hlas kmene`:'Role čeká na volbu'}</h3>
    <p class="tiny">Jeden z tvých potomků se stejným tělem a výstrojí. Mimo sněm pracuje jako ostatní; samotná přítomnost bonus nedává.</p>
    <div class="row">${button('focus','Vybrat a ukázat',!u)}${button('elect',u?'Předat roli vybranému':'Zvolit náčelníka',!q.ok)}</div>
    <div class="chief-candidates" aria-label="Kandidáti">${t.members.filter(v=>!v.species&&v.health>0).map(v=>`<button class="secondary${ids.includes(v.id)?' active':''}" data-action="tribe-select:${v.id}" aria-pressed="${ids.includes(v.id)}">${v.id===u?.id?'♛ ':''}Člen ${v.id}</button>`).join('')}</div>
    <p class="tiny chief-availability">${q.message}</p>
    <div class="chief-rules"><strong>Smírčí sněm</strong><p class="tiny"><b>8 jídla předem</b> · bez vratky. Řeč <b>6 s</b> do <b>4 m</b> od hostitele bez překážky. Náčelník sám dojde k osadě (do 90 s).</p><p class="tiny">Úspěch: <b>+${gain.toFixed(2)} vztahu</b> a <b>45 s příměří</b>, návrat výpravy. Oděv a dědictví započteny jednou. Běžný dar zůstává samostatný.</p></div>
    ${e?`<div class="chief-activity" role="status"><strong>${e.phase==='travel'?'Na cestě':'Řeč'} · ${Math.ceil(e.remaining)} s</strong><p class="tiny">${n?TRIBE_COPY.neighbours[n.identity].name:'Hostitel ztracen'} · ${u&&host?`${horizontalDistance(u.pos,host.pos).toFixed(1)} m / dosah 4 m`:'Čeká na ověření člena'}<br>${contact?'Kontakt navázán':e.phase==='travel'?'Hledá průchod k hostiteli':`Kontakt přerušen · zbývá ${Math.max(0,Math.ceil(CHIEF.grace-e.contactLost))} s`}</p><div class="meter"><i style="width:${e.phase==='speak'?(1-e.remaining/CHIEF.speak)*100:0}%"></i></div><p class="tiny">Zaplaceno ${e.paid}. Nový rozkaz, Stop nebo zásah sněm ukončí. Hudba, výstroj a péče teď nejsou dostupné.</p>${button('cancel','Přerušit · bez vratky')}</div>`:
    `${r?`<div class="chief-result" role="status"><strong>${r.reason==='success'?'Sněm uspěl':'Sněm skončil'}</strong><p class="tiny">${CHIEF_REASONS[r.reason]}<br>Vztah +${r.delta.toFixed(2)} · zaplaceno ${r.paid} jídla.${t.neighbours.find(n=>n.id===r.neighbour)?.resolved==='allied'?' Spojenectví je uzavřeno.':''}</p></div>`:''}
    <p class="chief-cooldown">${c?.cooldown?`Odpočinek sněmu ${Math.ceil(c.cooldown)} s`:'Sněm připraven po volbě a výběru náčelníka'}</p>
    ${t.neighbours.filter(n=>!n.resolved).map(n=>{const q=quoteChiefCouncil(s,ids,n.id);return `<details class="chief-target" data-preserve-open><summary>${TRIBE_COPY.neighbours[n.identity].name} · vztah ${Math.round(n.relation)}</summary><p class="tiny">${q.message}</p>${button(`council:${n.id}`,'Vyslat na sněm · 8 jídla',!q.ok)}</details>`;}).join('')}`}
    <details class="chief-limits" data-preserve-open><summary>Volba, omezení a nástupnictví</summary><p class="tiny">Volba zdarma u domova do 10 m. Oba členové bez rozkazů, hudby a péče o zvířata. Kandidát: zdraví ≥35, hlad &lt;65, bez nákladu a rozkazů. Před sněmem předej péči o zvířata. Sněm a hudba u stejného souseda se nesčítají. Odpočinek 60 s po každém konci platí pro celý kmen, i při výměně a načtení. Smrt uvolní roli; dalšího volíš ty. Pauza a save zachovají průběh.</p></details>
  </section>`;
}
