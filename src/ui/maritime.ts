import type { GameState } from '../game/types';
import { atSea, seaJourney, seaCommand, boatQuote, sailingQuote, buyBoat, sail, turnBoat, landBoat, currentCoast, homeCoast, SEA_LIMIT, type SeaCommand } from '../game/maritime';
import { navigation } from '../game/planet-travel';
import { planetAtlas } from '../game/planet-geography';
import { cityEscape as escape } from './cities';
let offer: {state:GameState;kind:'buy'|'sail';command:SeaCommand}|null=null;
export function resetSeaOffer(){offer=null;}
const button=(action:string,label:string,disabled=false)=>`<button class="secondary" data-action="sea:${action}" ${disabled?'disabled':''}>${label}</button>`;
export function seaMap(s:GameState,route:number[],progress=0):string {
  if(!route.length)return '';
  const atlas=planetAtlas(s.homePlanet!)!,cells=route.map(i=>atlas.cells[i]);
  // Unwrap longitude in route order so the seam does not draw across land.
  const points=cells.map((c,i)=>{let x=c.longitude; if(i){const prior=cells[i-1].longitude;while(x-prior>180)x-=360;while(x-prior< -180)x+=360;}return {x,y:-c.latitude};});
  for(let i=1;i<points.length;i++){while(points[i].x-points[i-1].x>180)points[i].x-=360;while(points[i].x-points[i-1].x< -180)points[i].x+=360;}
  const minX=Math.min(...points.map(p=>p.x))-7,minY=Math.min(...points.map(p=>p.y))-7,width=Math.max(25,Math.max(...points.map(p=>p.x))-minX+7),height=Math.max(20,Math.max(...points.map(p=>p.y))-minY+7);
  const index=Math.min(points.length-2,Math.floor(progress)),fraction=Math.min(1,progress-index),a=points[index],b=points[index+1];
  return `<svg class="sea-map" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="Vodní trasa a poloha člunu"><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#164e63"/>${points.map((p,i)=>`<rect x="${p.x-2.5}" y="${p.y-2.5}" width="5" height="5" fill="${i===0||i===points.length-1?'#a7bb79':'#2a7182'}"/>`).join('')}<polyline points="${points.map(p=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="#ffda80" stroke-width=".6"/><circle cx="${a.x+(b.x-a.x)*fraction}" cy="${a.y+(b.y-a.y)*fraction}" r="1.6" fill="white"/></svg>`;
}
export function seaPanel(s:GameState):string {
  if(!s.maritime||s.stage!==4)return '';
  const m=s.maritime,nav=navigation(s)!,v=m.vessel,j=seaJourney(s),q=sailingQuote(s,nav.selectedCell),buy=boatQuote(s),pending=offer?.state===s?offer:null;
  const route=atSea(s)?j!.route:q.route??[];
  return `<h3 id="sea-heading" tabindex="-1">Námořní výprava</h3><p>${v?`${escape(v.blueprint.name)} · odolnost ${v.health}<br>Kotviště ${v.mooring} · cestující: výpravový avatar`:'Expediční člun · trup, kabina a lodní šroub'}</p><p><strong>${v?'Zaplaceno 56':'Cena 56'} jantaru</strong> · jediný zdroj: domácí zásoba ${s.machines!.resource.toFixed(2)}.<br>Spotřeba bez příjemce a vratky. Další plavba vlastním člunem: 0.</p><p>Výchozí pobřeží ${currentCoast(s)} → cílové pobřeží ${nav.selectedCell}.<br>Nástup z atlasu představuje pobřežní přesun; místní výprava není fyzická pláž.</p>${seaMap(s,route,atSea(s)?j!.progress:0)}${route.length?`<p>${route.length-1} hran · ${route.length-1} aktivních sekund</p><details data-preserve-open><summary>Celá vodní trasa</summary><p class="sea-route">${route.join(' → ')}</p></details>`:''}${atSea(s)?'<p>Člun už pluje. Zavři přehled klávesou N a pokračuj; mapa čas pozastavuje.</p>':`<p>${escape(v?q.reason??'Člun je připraven. Vyber jej a potvrď nástup i vyplutí.':buy??'Domácí dílna může vyrobit jeden placený člun.')}</p>${v?button('offer-sail','Vybrat člun pro tuto trasu',!!q.reason):button('offer-buy','Objednat člun · 56',!!buy)}`}${pending?`<section class="sea-confirm"><strong>${pending.kind==='buy'?'Potvrdit spotřebu 56 domácího jantaru?':`Nastoupit do člunu a vyplout ${pending.command.from} → ${pending.command.to}?`}</strong><p>Plavba nic nepřivlastní. Na cíli je průzkum a původní založení za 60. Na moři lze obrátit; projetou cestu je nutné doplout zpět.</p>${button('confirm','Potvrdit')}${button('cancel','Zrušit')}</section>`:''}${v?`<details data-preserve-open><summary>Účetní doklad člunu</summary><p>Domov → spotřeba: ${v.payment.before.toFixed(3)} − ${v.payment.amount} = ${v.payment.after.toFixed(3)}. Pramen #${v.payment.springId}. Jediné plavidlo ${escape(v.id)}.</p></details>`:''}${j&&!atSea(s)?`<p>Poslední výsledek: ${j.phase==='landed'?'přistání':'návrat po přerušení'} ${v!.mooring}, ${j.elapsed.toFixed(1)} s.</p>`:''}`;
}
export function sailingStatus(s:GameState):string {
  const j=seaJourney(s)!,total=j.route.length-1,back=j.phase==='returning',lastReturn=s.maritime!.journeys.length===SEA_LIMIT&&j.from!==homeCoast(s),ready=back?j.progress<=1e-8:j.progress>=total-1e-8;
  return `<h2 id="sea-heading" tabindex="-1">${back?'Návrat po přerušení':ready?'Pobřeží na dohled':'Plavba'}</h2><p><strong>${s.maritime!.vessel!.blueprint.name}</strong><br>${j.from} → ${back?j.from:j.to} · tentýž výpravový avatar</p>${seaMap(s,j.route,j.progress)}<p data-sea-progress>${j.progress.toFixed(1)} / ${total} hran<br>${ready?'Připraveno k přistání':`${(back?j.progress:total-j.progress).toFixed(1)} s do pobřeží`}</p><progress value="${j.progress}" max="${total}" aria-label="Průběh plavby"></progress><p>Na moři stojí domov, příjem, jednotky i všechna města. Strategický čas běží. Pauza a atlas plavbu pozastaví.</p>${button('land','Přistát a vystoupit',!ready)}${button('turn','Přerušit a obrátit',back||lastReturn)}${lastReturn?'<p>Poslední záznam je vyhrazen dokončení návratu domů. Tento návrat už nelze obrátit.</p>':''}<details data-preserve-open><summary>Trasa a pokračování</summary><p class="sea-route">${j.route.join(' → ')}</p><p>Po přistání: WASD a E pro původní měření. Město stojí 60 domácího jantaru; plavba nic nevlastní. Zpět pluje tentýž člun.</p></details><p>Pravé tlačítko · otáčet kameru<br>Kolečko · přiblížit</p>${button('camera-left','Kamera ←')}${button('camera-right','Kamera →')}${button('camera-in','Přiblížit')}${button('camera-out','Oddálit')}`;
}
export function sailingHud(s:GameState):string {return `<header class="topbar field-topbar"><div><strong>Lumavora · moře</strong></div><div class="toolbar"><button data-action="atlas">N · Planeta</button><button data-action="save">Uložit</button><button data-action="pause">Pauza</button></div></header><aside class="sea-panel panel" id="sailing-status">${sailingStatus(s)}</aside><div class="field-notice" role="status">${escape(navigation(s)!.notice)}</div>`;}
export function seaAction(s:GameState,arg:string):boolean {
  if(arg==='offer-buy'||arg==='offer-sail'){offer={state:s,kind:arg==='offer-buy'?'buy':'sail',command:seaCommand(s,navigation(s)!.selectedCell)};return false;}
  if(arg==='cancel'){offer=null;return false;}
  if(arg==='confirm'){const p=offer;offer=null;if(!p||p.state!==s)return false;if(p.command.to!==navigation(s)!.selectedCell){navigation(s)!.notice='Výběr pobřeží se změnil. Vyber člun znovu.';return false;}return p.kind==='buy'?buyBoat(s,p.command):sail(s,p.command);}
  if(arg==='turn')return turnBoat(s,s.maritime!.revision);
  if(arg==='land')return landBoat(s,s.maritime!.revision);
  return false;
}
