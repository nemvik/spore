import type { GameState } from '../game/types';
import { raids, type Raid } from '../game/defense';
import { cityEscape } from './cities';
export const raidPhase=(r:Raid)=>({preparing:'Příprava',outbound:'Na cestě',waiting:'Čeká před bojištěm',field:'Útok',occupying:'Obsazování',garrison:'Okupant ve městě',retreat:'Ustupuje ke vstupu',returning:'Přeprava zpět',returned:'Vrácen; žádný další výpad',withdrawn:'Vyřazen bez domova',destroyed:'Zničen'}[r.phase]);
export function incomingMarkup(s:GameState):string {
  const active=raids(s).filter(r=>!['destroyed','returned','withdrawn'].includes(r.phase));
  return active.length?`<div class="incoming-raid"><strong>Protiútok · zaplacený tank</strong>${active.map(r=>`<p>${cityEscape(s.cities!.entries.find(c=>c.id===r.cityId)!.name)} · ${raidPhase(r)}${r.remaining>0?` · ${r.remaining.toFixed(1)} s`:''}<br><button class="secondary" data-action="city-select:${cityEscape(r.cityId)}">Vybrat cíl v přehledu</button></p>`).join('')}<small>Odjeď s původním tankem bránit město. Mimo návštěvu boj stojí.</small></div>`:'';
}
