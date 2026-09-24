import type { GameState } from '../game/types';
import type { TribeNeighbour } from '../game/era-types';
import { INSTRUMENTS, INSTRUMENT_NAMES as N, INSTRUMENT_SYMBOLS as I, MUSIC_REQUESTS, MUSIC_REASONS, musicContact, musicMembers, musicRequest, quoteMusic, type MusicRound } from '../game/tribe-music';
import { TRIBE_COPY } from '../game/tribe-copy.cs';
const button = (action: string, text: string, disabled = false) => `<button class="secondary" data-action="tribe-${action}"${disabled ? ' disabled' : ''}>${text}</button>`;
export function musicPlanMarkup(s: GameState, n: TribeNeighbour, ids: readonly number[]): string {
  if(s.tribe?.version!==2)return '';
  const selected=s.tribe.members.filter(u=>ids.includes(u.id)&&!u.species&&u.health>0), quote=quoteMusic(s,ids,n.id);
  return `<details class="music-plan" data-preserve-open><summary>Hudba · příprava skupiny</summary><p class="tiny">Tři výzvy: ${MUSIC_REQUESTS[n.identity].map(r=>`${N[r.instrument]} ×${r.count}`).join(' → ')}.</p><p class="tiny">${INSTRUMENTS.map(i=>`${N[i]}: ${selected.filter(u=>u.tool===i).length}`).join(' · ')}<br>${quote.message}</p><p class="tiny">Dílna 22, nástroj 6 jídla. Nahrazuje koš/oštěp/měch; oděv zůstává. Dvě správné odpovědi ze tří; dvě chyby ukončí píseň. Opakování po 30 s.</p>${button(`music:${n.id}`,'Vyrazit s vybranými',!quote.ok)}</details>`;
}
function roundExplanation(r: MusicRound, n: TribeNeighbour, index: number): string {
  const request=MUSIC_REQUESTS[n.identity][index];
  return r.success ? `Přijato · 20 × ${r.multiplier.toFixed(3)} = +${(20*r.multiplier).toFixed(1)}` : r.response===null ? 'Vypršel čas odpovědi' : r.response!==request.instrument ? `Jiný nástroj: soused žádal ${N[request.instrument]}` : `Chybí hráči: potřeba ${request.count}, přítomno ${r.players.length}`;
}
function roundsMarkup(rounds: readonly MusicRound[], n: TribeNeighbour): string {
  return `<ol class="music-rounds">${rounds.map((r,index)=>`<li class="${r.success?'music-good':'music-bad'}">${r.success?'✓':'×'} ${N[MUSIC_REQUESTS[n.identity][index].instrument]} ×${MUSIC_REQUESTS[n.identity][index].count} → ${r.response ? `${N[r.response]}, hráčů ${r.players.length}`:'bez odpovědi'}<br><small>${roundExplanation(r,n,index)}</small></li>`).join('')}</ol>`;
}
export function musicHudMarkup(s: GameState): string {
  if(s.tribe?.version!==2)return '';
  const t=s.tribe, m=t.music; if(!m)return '';
  const e=m.active, result=m.result, n=t.neighbours.find(n=>n.id===(e?.neighbour??result?.neighbour)); if(!n)return '';
  const heading=`<span class="eyebrow">HUDEBNÍ SETKÁNÍ</span><h3>${TRIBE_COPY.neighbours[n.identity].name}</h3>`;
  if(!e&&result)return `<section class="music-encounter panel" aria-label="Výsledek hudby">${heading}<p class="music-outcome" role="status">${MUSIC_REASONS[result.reason]}</p><p>Vztah <b>${result.delta>=0?'+':''}${result.delta.toFixed(1)}</b> → ${Math.round(n.relation)}${n.resolved==='allied'?' · Spojenectví! Jednorázově +8 jídla.':''}</p>${roundsMarkup(result.rounds,n)}<p class="tiny">${result.reason==='success'?'Příspěvky kol připsány, vztah nejvýše 100.':'Příspěvky kol se nepřičítají; platí pouze uvedená změna vztahu.'}</p><p class="tiny">Zaplaceno ${result.paid} jídla včetně daru. Bez vratky. Úspěšné kolo = 20 × chochol odpovídajících hráčů × dědictví. Chybějící nástroj bonus nenahradí.</p>${button('music-dismiss','Zavřít výsledek')}</section>`;
  if(!e)return '';
  const request=musicRequest(n,e), members=musicMembers(t,e), last=e.rounds.at(-1), contact=musicContact(s,t,e);
  const phase=e.phase==='travel'?'Na cestě za hostitelem':e.phase==='listen'?'Poslouchej výzvu':e.phase==='respond'?'Zvol odpověď':last?.success?'Odpověď přijata':'Odpověď se nezdařila';
  return `<section class="music-encounter panel" aria-label="Hudební setkání">${heading}<div class="music-phase" role="status">${phase} · ${Math.ceil(e.remaining)} s</div>${e.phase==='travel'?`<p class="tiny">Skupina ${e.members.join(', ')} jde k živému hostiteli. Platba až při příchodu: 4 + zbývající dar. Ústup na cestě je zdarma.</p>`:`<p class="music-request">${I[request.instrument]} ${N[request.instrument]} <b>×${request.count}</b> <small>kolo ${e.phase==='feedback'?e.rounds.length:e.rounds.length+1}/3</small></p><p class="tiny">${e.phase==='feedback'?`${roundExplanation(last!,n,e.rounds.length-1)}. Vztah se vyhodnotí na konci.`:'Vyber požadovaný nástroj. Počet níže je ze skutečné skupiny.'}</p>`}
    <div class="music-answers">${INSTRUMENTS.map(i=>button(`music-answer:${i}`,`${I[i]} ${N[i]}<small>${members.filter(u=>u.tool===i).length} hráčů</small>`,e.phase!=='respond'||!contact)).join('')}</div>
    ${roundsMarkup(e.rounds,n)}${!contact&&e.phase!=='travel'?`<p class="music-bad" role="alert">Kontakt přerušen · zbývá ${Math.max(0,Math.ceil(3-e.contactLost))} s. Odpověď čeká.</p>`:''}
    <p class="tiny">Dvě chyby: −10 vztahu. Úspěšné kolo: +20 × oděv × dědictví; vztah až na konci. Nástroje a oděv měň před návštěvou. Pauza i uložení zachovají průběh.</p>
    ${button('music-cancel',e.phase==='travel'?'Ukončit cestu · zdarma':'Ukončit návštěvu · −5 vztahu')}
  </section>`;
}
