import type { GameState } from '../game/types';
import { cityAt, type City } from '../game/cities';
import { acceptTrade, tradeQuote, tradeTransfers, type TradeOffer } from '../game/trade';
import { cityEscape } from './cities';
import { STATE_PROFILES } from '../game/states';
import { navigation } from '../game/planet-travel';
let shown:City|null=null,branch:GameState|null=null,pending:TradeOffer|null=null;
export function resetTradeOffer(){pending=null;}
function select(s:GameState){const c=cityAt(s);if(shown!==c||branch!==s){shown=c;branch=s;pending=null;}return c;}
export function tradeAction(s:GameState,action:string):boolean {
  select(s);
  if(action==='offer'){const q=tradeQuote(s);pending=q.available?q.offer:null;if(navigation(s))navigation(s)!.notice=pending?`Připravena nabídka ${pending.price} jantaru. Zaplatí až výslovné potvrzení.`:q.reason;}
  else if(action==='cancel'){pending=null;if(navigation(s))navigation(s)!.notice='Nabídka zrušena. Žádná platba ani převod vlastnictví neproběhly.';}
  else if(action==='confirm'&&pending){const p=pending;pending=null;return acceptTrade(s,p);}
  return false;
}
export function tradeMarkup(s:GameState):string {
  const c=select(s);if(!c||(s.cities?.version??0)<7||s.stage!==4)return '';
  const q=tradeQuote(s,c),offer=q.offer;
  const name=(id:string)=>STATE_PROFILES[s.states!.entries.find(r=>r.id===id)!.profile].name;
  const receipt=tradeTransfers(c).at(-1);
  if(c.owner.kind==='lineage'&&!pending)return receipt?`<h3 tabindex="-1">Obchodní převzetí dokončeno</h3><p>Zaplaceno ${receipt.price} ◈ z domova → civilní účet ${cityEscape(name(receipt.from.id))}. Pokladna, občané a stavby zachované; původní stráž demobilizována bez nové jednotky.</p><details data-preserve-open><summary>Kupní doklad a účetní zůstatky</summary><p>${cityEscape(receipt.id)}<br>Domov ${receipt.payment.before.toFixed(3)} → ${receipt.payment.after.toFixed(3)} ◈<br>Civilní účet ${receipt.payment.receivedBefore} → ${receipt.payment.receivedAfter} ◈<br>${receipt.decision.cities===1?'Prodej posledního města; poražený stát své peníze dále nečerpá.':'Příjem slouží jen civilním převodům, nikoli armádě.'}</p></details>`:'';
  return `<h3 tabindex="-1">Obchodní nabídka</h3><p>${cityEscape(q.reason)}</p>${offer?`<p><strong>Aktuální kupní cena ${offer.price} ◈</strong><br>Radnice 60 + budovy ${c.economy?.buildings.reduce((n,b)=>n+b.paidAmber,0)??0} + občanské závazky ${(c.economy?.residents.length??0)*4} + pokladna ${c.economy?.treasury??0}${offer.cities===1?' + poslední město 60':''}.</p><p>Platíš jen z domova: <strong>${s.machines!.resource.toFixed(1)} ◈</strong>.<br>Příjemce: ${cityEscape(name(offer.sellerId))}, civilní účet ${offer.tradeReserve} ◈. Původní vojenská rezerva ${offer.reserve} ◈ se nezvýší.</p>`:''}
  <p class="tiny">Čekání není obchodní pokrok. Cenu znovu ověří potvrzení. Stráž odejde ze služby; tank, léčení ani odměnu nezískáš. Pokladna a majetek pokračují ve městě.</p>
  ${pending?`<div class="city-confirm trade-confirm"><strong>Potvrdit nabídku ${pending.price} ◈?</strong><p>Převod peněz a vlastnictví proběhne společně. Změna situace nabídku odmítne.</p><button class="primary" data-action="trade:confirm">Zaplatit ${pending.price} ◈ a převzít</button><button class="secondary" data-action="trade:cancel">Zrušit nabídku</button></div>`:`<button class="secondary" data-action="trade:offer" ${q.available?'':'disabled'}>Vyžádat kupní nabídku</button>`}`;
}
