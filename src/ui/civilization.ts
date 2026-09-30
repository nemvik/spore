import type { GameState } from '../game/types';
import { civilizationFacts, civilizationInheritance, civilizationReadiness, type CivicMethod } from '../game/civilization';
import { cityEscape as esc } from './cities';
const labels:Record<CivicMethod,string>={military:'vojenská',trade:'obchodní',conversion:'konverzní'};
const percent=(v:number)=>String(Math.round(v*1000)/10).replace('.',',');
export function civilizationEffect(s:GameState):string {
  const result=s.civilization?.completed,effect=civilizationInheritance(s);
  if(!result)return s.civilization?.entry==='legacy-stage5'?'Civilizační dědictví: bez nového bonusu. Tato starší linie už vstoupila do terraformace; sjednocení se zpětně nevymýšlí.':'Civilizační dědictví se uzavře po skutečném sjednocení měst. Doložená vojenská cesta zlepší nástroje, obchod ušetří jantar a konverze podpoří život.';
  return `Dědictví civilizace: ${effect.methods.map(m=>labels[m]).join(' + ')||'vlastní osídlení'}. Účinek nástroje +${percent(effect.power-1)} %, spotřeba −${percent(1-effect.consumption)} %, kladná obnova života +${percent(effect.recovery-1)} %. Smíšená cesta dělí pevný rozpočet; opakované dobývání ho nezvyšuje.`;
}
export function civilizationProgressMarkup(s:GameState):string {
  if(!s.civilization)return '';
  const q=civilizationReadiness(s);
  return `<section class="civilization-progress"><h3>Sjednocení planety</h3>${q.ready?'<p>Všechna města patří linii, vlastní hospodářství funguje a závazky jsou uzavřené. Pokračováním zapíšeš skutečnou civilizační cestu.</p>':`<ul>${q.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>`}<button class="secondary" data-action="atlas">Otevřít planetu · města a státy</button><button class="inheritance-link" data-action="journal">Civilizační dějiny · J</button></section>`;
}
export function civilizationHistoryMarkup(s:GameState):string {
  if(!s.civilization)return '';
  const facts=civilizationFacts(s),closed=s.civilization.completed;
  return `<section class="civilization-history" aria-label="Civilizační dědictví"><h3>Civilizační dějiny · ${closed?'uzavřené sjednocení':'dosavadní činy'}</h3><p>${esc(civilizationEffect(s))}</p>${closed?`<p>Uzavřeno v generaci ${closed.at.generation}, strategickém tahu ${closed.at.turn}. Fungující správní město: ${esc(s.cities!.entries.find(c=>c.id===closed.governingCity.cityId)!.name)}.</p>`:'<p>Domácí regiony jsou předchozí část etapy. Tady se evidují skutečná města a způsoby jejich získání.</p>'}${facts.length?`<ul>${facts.map(f=>`<li>${esc(s.cities!.entries.find(c=>c.id===f.cityId)!.name)} · ${f.kind==='founding'?'vlastní založení':f.kind==='loss'?'ztráta města':`${labels[f.method!]} převzetí`} · ${f.turn!==null?`tah ${f.turn}`:f.tick!==null?'doložené založení':'čas převzetí neznámý, doložen původní save'}</li>`).join('')}</ul>`:'<p>Zatím žádné doložené městské činy.</p>'}<p class="tiny">Původní historie regionů a kmene pokračuje beze změny. Bonus nevytváří peníze ani zdraví a nemění ekologické požadavky. Obnova vrací celý checkpoint.</p></section>`;
}
