import { canOccupy, enemyTarget, fieldRaid } from '../game/defense';
import { raidPhase } from './defense';
import type { GameState } from '../game/types';
import { cityAt } from '../game/cities';
import { activeMachines, machineDesign } from '../game/machines';
import { deploymentQuote, landRoute, DEFENSE_COST } from '../game/military';
import { vehicleStats } from '../game/blueprint';
import { cityEscape } from './cities';
export function militaryMarkup(s:GameState):string {
  const w=s.military,c=cityAt(s);if(!w||!c||s.stage!==4)return '';
  const d=w.deployment,m=activeMachines(s)!,u=m.fleet.find(u=>u.id===d?.unitId),here=d?.cityId===c.id,def=c.defense;
  if(w.version===2)return defenseMarkup(s);
  const button=(cmd:string,label:string,disabled=false)=>`<button class="secondary" data-action="military:${cmd}" ${disabled?'disabled':''}>${label}</button>`;
  return `<h3>Vojenská cesta</h3><p>${c.capture?'✓ Převzato po porážce a obsazení':def?`Stráž · zdraví ${def.health.toFixed(1)} / ${vehicleStats(def.blueprint).durability} · zaplaceno ${DEFENSE_COST} ◈ z rezervy státu`:'Obrana dosud nezaplacená; žádná stráž zdarma.'}</p>${here&&u?`<p><strong>Tvůj tank #${u.id} · ${cityEscape(machineDesign(m,u).name)}</strong><br>Zdraví <strong>${u.health.toFixed(1)} / ${vehicleStats(machineDesign(m,u)).durability}</strong> · dosah 12<br>${d.phase==='field'?`Rozkaz: ${d.order==='attack'?'útok':d.order==='occupy'?'obsazení':d.order==='retreat'?'ústup':'stát'} · obsazení ${d.hold.toFixed(1)} / 5 s`:`Přeprava ${d.phase==='outbound'?'sem':'domů'} · zbývá ${d.remaining.toFixed(1)} s`}<br>Trasa: ${d.route.join(' → ')}</p>${button('camera','Vybrat tank a zaměřit boj')}${button('attack','Útok na stráž',d.phase!=='field'||!def||def.health<=0||!!c.capture)}${button('occupy','Obsadit náměstí · držet 5 s',d.phase!=='field'||!def||def.health>0||!!c.capture)}${button('stop','Zastavit / přerušit',d.phase!=='field')}${button('retreat','Ústup a návrat tanku',d.phase!=='field')}`:d?'<p>Tank je nasazený v jiném městě. Jeho boj a přeprava zde stojí.</p>':c.owner.kind==='state'?`<p>Vyber zaplacený tank u domácí dílny. Přeprava ${((landRoute(s,c)?.length??1)-1)*5} s, příplatek 0 ◈.</p>${m.fleet.map(u=>{const reason=deploymentQuote(s,c,u.id);return `<div>${button('deploy,'+u.id,`Nasadit #${u.id} · ${cityEscape(machineDesign(m,u).name)}`,!!reason)}${reason?`<p class="tiny">${cityEscape(reason)}</p>`:''}</div>`;}).join('')||'<p>Vyrob nejprve tank s dělem doma.</p>'}`:''}<p class="tiny">Dělo: 2× výkon / 1,2 s, dosah 12 a volný výhled. Žlutý kruh: tvůj tank; červený: stráž. Zničení nevrací cenu. Odchod zmrazí boj; návrat neléčí. Pauza a globál stojí. Tank ovládáš rozkazy; WASD dál pohybuje tvorem.</p><p role="status">${cityEscape(w.notice)}</p>`;
}

function defenseMarkup(s:GameState):string {
  const w=s.military!,c=cityAt(s)!,m=activeMachines(s)!,d=w.deployment,here=d?.cityId===c.id,u=here?m.fleet.find(u=>u.id===d!.unitId):null;
  const r=w.raids!.find(r=>r.cityId===c.id),enemy=enemyTarget(s,c),ready=here&&d?.phase==='field';
  const button=(cmd:string,label:string,reason='')=>`<div><button class="secondary" data-action="military:${cmd}" ${reason?'disabled':''}>${label}</button><small class="tiny">${cityEscape(reason)}</small></div>`;
  const unavailable=ready?'':'Tank musí nejprve dorazit do tohoto města.';
  const name=(id:string)=>id===s.homePlanet!.id?'Tvoje linie':s.states!.entries.find(v=>v.id===id)?.profile===0?'Svaz zelených údolí':'Liga měděných věží';
  return `<h3>Obrana a obsazení</h3><p><strong>Náměstí · odolnost ${c.fortification!.toFixed(1)} / 80</strong><br>${c.owner.kind==='lineage'?'Tvoje město':'Město soupeře'} · bez automatické obnovy</p>
  ${u?`<p><strong>Tvůj tank #${u.id}: ${u.health.toFixed(1)} / ${vehicleStats(machineDesign(m,u)).durability}</strong></p>`:''}
  ${r?`<p class="raid-status"><strong>${raidPhase(r)} · ${r.unit.health.toFixed(1)} / 62 zdraví</strong><br>${r.remaining>0?`Zbývá ${r.remaining.toFixed(1)} s · `:''}obsazení ${r.hold.toFixed(1)} / 5 s</p><details data-preserve-open><summary>Cena ${DEFENSE_COST} ◈ · trasa a doklad</summary><p>Zaplaceno z rezervy, další příjem 0.<br>${cityEscape(s.cities!.entries.find(c=>c.id===r.sourceCityId)!.name)} → ${cityEscape(c.name)}<br>${r.route.join(' → ')}<br>${cityEscape(r.id)}</p></details>`:'<p>Žádný zaplacený výpad proti tomuto městu.</p>'}
  ${c.defense&&c.defense.health>0?`<p>Původní stráž E: ${c.defense.health.toFixed(1)} / 62 zdraví.</p>`:''}
  ${button('camera','Zaměřit boj / vybraný tank')}
  ${u&&d?`<p><strong>Vybraný tank #${u.id} · ${cityEscape(machineDesign(m,u).name)}</strong><br>Zdraví ${u.health.toFixed(1)} / ${vehicleStats(machineDesign(m,u)).durability}<br>${d.phase==='field'?`Rozkaz: ${{stop:'stát',attack:'útok',defend:'obrana',occupy:'obsazování',retreat:'ústup'}[d.order]} · ${d.hold.toFixed(1)} / 5 s`:`Přeprava ${d.phase==='outbound'?'sem':'domů'} · ${d.remaining.toFixed(1)} s`}</p>
  <p>Cíl: ${fieldRaid(s,c)?'nepřátelský tank':enemy?'původní stráž':c.owner.kind==='state'&&c.fortification!>0?'odolnost náměstí':'náměstí'}</p>
  ${button('defend','Bránit město',unavailable||(c.owner.kind==='lineage'?'':'Obrana vyžaduje vlastní město.'))}
  ${button('attack','Útok na označený cíl',unavailable||(!enemy&&!(c.owner.kind==='state'&&c.fortification!>0)?'Žádný živý nepřátelský cíl.':''))}
  ${button('occupy','Obsadit náměstí · 5 s',unavailable||(canOccupy(s,c,{kind:'lineage',id:s.homePlanet!.id})?'':'Vyžaduje cizí město bez živé obrany a s nulovou odolností.'))}
  ${button('stop','Zastavit / přerušit',unavailable)}${button('retreat','Ústup a návrat tanku',unavailable)}`:d?'<p>Tank je nasazený v jiném městě. Nejprve jej vrať domů.</p>':`<p>Vyber původní tank u dílny. Přeprava ${((landRoute(s,c)?.length??1)-1)*5} s · příplatek 0 ◈.</p>${m.fleet.map(u=>button('deploy,'+u.id,`Nasadit #${u.id} · ${cityEscape(machineDesign(m,u).name)}`,deploymentQuote(s,c,u.id)??'')).join('')||'<p>Vyrob tank s dělem doma za cenu konstrukce.</p>'}`}
  <p role="status">${cityEscape(w.notice)}</p><details data-preserve-open><summary>Pravidla boje a úplná historie vlastníků</summary><p>Dělo: dosah 12, volný výhled, 2× výkon / 1,2 s. Žlutá: tvůj tank, červená: soupeř, modrý kruh: náměstí. Obrana vyhledá útočníka, jinak dojede na náměstí. Rozkazy aktivuješ klikem, Tab + Enter/mezerník. WASD pohybuje tvorem, pravé tlačítko kamerou. Odchod přeruší obsazování a zmrazí boj. Pauza, editor a globál stojí.</p><ol><li>Zakladatel: ${name(c.foundingOwner!.id)}</li>${c.capture?'<li>E · porážka původní stráže a převzetí hráčem; původní doklad zachován.</li>':''}${c.transfers!.map(t=>`<li>F · tah ${t.turn}: ${name(t.from.id)} → ${name(t.to.id)} · tank #${t.unitId} · pokladna ${t.economy?.treasury??0} ◈</li>`).join('')}</ol></details>`;
}
