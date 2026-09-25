import type { GameState } from '../game/types';
import { cityAt, type City } from '../game/cities';
import { conversionQuote, conversionProgress, conversionSite, conversionResponse, performConversion, type ConversionToken, type Rite } from '../game/conversion';
import { activeField, navigation } from '../game/planet-travel';
import { cityEscape } from './cities';
import { ownerName } from '../game/states';
let shown:City|null=null,branch:GameState|null=null,pending:ConversionToken|null=null;
export function resetConversionOffer(){pending=null;}
const labels:Record<Rite,string>={sharing:'Sdílení',peace:'Smíření',memory:'Paměť'};
function select(s:GameState){const c=cityAt(s);if(shown!==c||branch!==s){shown=c;branch=s;pending=null;}return c;}
export function conversionAction(s:GameState,action:string):boolean {
  const c=select(s),q=conversionQuote(s,c),nav=navigation(s);
  if(action==='offer'){pending=q.available&&q.progress>=q.required?q.token:null;if(nav)nav.notice=pending?'Potvrď závěrečný obřad za 20 jantaru. Vlastník se změní až po platném potvrzení.':q.reason;return false;}
  if(action==='cancel'){pending=null;if(nav)nav.notice='Potvrzení zrušeno. Pečeti i prostředky zachované.';return false;}
  if(action==='confirm'&&pending){const token=pending;pending=null;return performConversion(s,token,'complete');}
  if(action==='renounce'&&q.token){pending=null;return performConversion(s,q.token,'renounce');}
  if(['sharing','peace','memory'].includes(action)&&q.token){pending=null;return performConversion(s,q.token,'rite',action as Rite);}
  return false;
}
export function conversionMarkup(s:GameState):string {
  const c=select(s);if(!c||s.cities?.version!==8||s.stage!==4)return '';
  const q=conversionQuote(s,c),progress=conversionProgress(c),complete=progress>=q.required,site=conversionSite(s,c,progress,complete),f=activeField(s)!;
  const distance=Math.hypot(f.position.x-site.x,f.position.z-site.z),near=distance<=(complete?6:3);
  const receipt=c.transfers?.filter(t=>t.method==='conversion').at(-1);
  const history=`<details data-preserve-open><summary>Obřady a účetní doklady (${c.conversion!.events.length})</summary><ol>${c.conversion!.events.map(e=>`<li>#${e.id} · tah ${e.turn} · ${e.action==='complete'?'Závěrečný obřad':e.action==='renounce'?'Vzdání se pečetí':labels[e.response!]} · pečeti ${e.before} → ${e.after} · spotřeba ${e.payment.amount} ◈, domov ${e.payment.before.toFixed(3)} → ${e.payment.after.toFixed(3)}${e.epoch!==c.transfers!.length&&e.action!=='complete'?' · uzavřená vlastnická větev':''}</li>`).join('')}</ol><p>Spotřeba obřadních potřeb, nikoli příjem státu. Původní převody najdeš v úplné historii vlastníků níže.</p></details>`;
  if(c.owner.kind==='lineage')return receipt?.method==='conversion'?`<h3 tabindex="-1">Náboženské převzetí dokončeno</h3><p>${cityEscape(c.name)} · ${cityEscape(ownerName(s,c))}. Spotřebováno ${receipt.spent} ◈ z domova. Stráž demobilizována, občané, pokladna i poškození zachované.</p>${history}`:c.conversion!.events.length?`<h3 tabindex="-1">Konverzní větev uzavřena</h3><p>Změna vlastníka ukončila původní postup. Výdaje se nevracejí.</p>${history}`:'';
  const expected=q.token?conversionResponse(q.token.situation,progress):null;
  const objection=expected==='sharing'?'Odpůrci žádají obřad vzájemné pomoci. Sdílení vyjadřuje solidaritu; nevyrábí jídlo.':expected==='peace'?'Odpůrci se obávají násilného sjednocení. Smíření odmítá použití síly.':'Odpůrci hájí místní tradici a svébytnost. Paměť zachovává jejich hlas.';
  return `<h3 tabindex="-1">Pouť Souznění</h3><p><strong>${cityEscape(c.name)}</strong> · ${cityEscape(ownerName(s,c))}</p><p><strong>Pečeti ${progress}/${q.required}</strong> · 3 základní${q.token?.situation.cities===1?' + 1 za poslední město':''}${q.token&&q.token.situation.reserve+q.token.situation.tradeReserve>40?' + 1 za silné rezervy':''}</p><progress value="${progress}" max="${q.required}" aria-label="Konverzní pečeti"></progress>
  <p>${cityEscape(q.reason)}</p><p><strong>${complete?'Závěrečný obřad na náměstí':`Obřad ${progress+1} u místa „${cityEscape(f.world.patches[progress%3].name)}“`}</strong><br>X ${site.x.toFixed(0)}, Z ${site.z.toFixed(0)} · vzdálenost ${distance.toFixed(1)} / ${complete?6:3}. Dojdi pomocí WASD.</p>
  ${!complete?`<p class="conversion-objection">${objection}</p>`:''}<p>Každý obřad <strong>20 ◈ z domova</strong> (máš ${s.machines!.resource.toFixed(1)}). Spotřebuje se, stát nic nepřijímá. Chybná volba ubere jednu pečeť bez vratky.</p>
  ${pending?`<div class="city-confirm conversion-confirm"><strong>Spotřebovat 20 ◈ a převzít město?</strong><button class="primary" data-action="conversion:confirm">Dokončit konverzi · 20 ◈</button><button class="secondary" data-action="conversion:cancel">Zrušit potvrzení</button></div>`:complete?`<button class="primary" data-action="conversion:offer" ${q.available&&near?'':'disabled'}>Závěrečný obřad · 20 ◈</button>`:`<div class="conversion-choices">${(['sharing','peace','memory'] as const).map(r=>`<button class="secondary" data-action="conversion:${r}" ${q.available&&near?'':'disabled'}>${labels[r]} · 20 ◈</button>`).join('')}</div>`}
  <details data-preserve-open><summary>Přerušení a zachování postupu</summary><p>Odchod a vojenský závazek postup pozastaví. Návrat nic nedohání. Změna vlastníka zruší všechny pečeti této větve; doklady zůstanou. Čekání ani návštěva pečeti nevytvářejí. Bezchybná cesta nyní stojí ${(q.required+1)*20} ◈ včetně závěru. Stráž přestane sloužit, její zdraví se nemění; tank ani odměnu nezískáš.</p><button class="secondary" data-action="conversion:renounce" ${progress>0&&conversionQuote(s,c,0).available?'':'disabled'}>Vzdát se všech pečetí · bez vratky</button></details>${history}`;
}
