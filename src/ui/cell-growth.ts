import { activeCell, CELL_THRESHOLDS, cellTier } from '../game/cell-growth';
import { getAdaptation } from '../game/adaptation-catalog';
import { targetLocation } from './journey-guide';
import type { GameState } from '../game/types';

export function cellGuide(s: GameState) {
  const cell=activeCell(s);if(!cell)return null;
  const tier=cellTier(s),unused=cell.parts.find(p=>p.usedGeneration===null),site=cell.sites.map((site,i)=>({...site,requiredTier:i+1})).find(site=>!site.collected),home=s.world.landmarks.find(l=>l.kind==='nest')!;
  const progress=`Růst ${tier} / 3 · ${cell.nutrition} / ${CELL_THRESHOLDS[Math.min(3,tier+1)]} soust`;
  if(unused)return {title:'Přestav se',step:progress,instruction:`Objeveno: ${getAdaptation(unused.part).name}. Vrať se do kolébky ◇, otevři Tab a přidej část. DNA platí stavbu, objev zůstává.`,target:home.pos,location:targetLocation(s.player.pos,home.pos),done:'Potvrzením přestavby začne další generace.'};
  if(site&&tier>=site.requiredTier)return {title:'Objev část',step:progress,instruction:'Doplavej k zářící schránce ✧. Zblízka stiskni T a odhal novou část.',target:site.pos,location:targetLocation(s.player.pos,site.pos),done:'Objev se dědí do dalších etap.'};
  if(tier<3)return {title:'Sním → vyrostu',step:progress,instruction:`WASD · plav. Mezerník · jez malé řasy nebo detrit. ${tier===0?'Tři sousta zvětší tělo i rozhled.':'Větší tělo zvládá i velká sousta.'}`,target:null,location:'✧ schránky · ◇ kolébka a editor',done:'Pak prozkoumej ✧ a přestav se v kolébce (Tab).'};
  return null;
}
export function cellHud(s:GameState) {
  const guide=cellGuide(s);if(!guide)return null;
  return `<p class="tiny">${guide.step}</p><p>${guide.instruction}</p><p class="tiny">${guide.location}</p><p class="tiny">${guide.done}</p>`;
}
