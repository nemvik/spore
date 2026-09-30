import { vehicleCost, vehicleStats, vehiclePart, type VehicleConstruction } from '../game/blueprint';
import type { VehicleCreation } from '../game/vehicle-library';
import { escapeHtml as escape } from './creature-library';

export const carrierName=(carrier:VehicleConstruction['carrier'])=>({tank:'Pozemní stroj',air:'Letoun',boat:'Člun'})[carrier];
/** Side view of the stored proportions/attachments; full animated geometry is in the shared editor. */
export function vehicleThumbnail(g:VehicleConstruction):string {
  const l=g.length*32,w=g.width*14,hull=g.parts.find(p=>p.kind==='hull')?.scale??1;
  const parts=g.parts.filter(p=>p.kind!=='hull').map(p=>{
    const x=80+p.axial*l,y=52-Math.cos(p.angle)*w;
    const mark=p.kind==='tracks'?'<rect x="-28" y="-4" width="56" height="10" rx="5" fill="#263e3d"/>':p.kind==='rotor'?'<path d="M0 0V-15m-24 0h48"/>':p.kind==='propeller'?'<path d="M-9 -9L9 9M-9 9L9 -9"/>':p.kind==='cabin'?'<rect x="-8" y="-10" width="16" height="12" rx="3" fill="#aadcd0"/>':p.kind==='cannon'?'<path d="M0 0L22 -8" stroke-width="5"/>':p.kind==='broadcast'?'<path d="M0 0V-19m-8 0q8 10 16 0"/>':'<circle cy="-4" r="7"/>';
    return `<g transform="translate(${x} ${y}) scale(${p.scale})"><title>${escape(vehiclePart(p.kind).name)}</title>${mark}</g>`;
  }).join('');
  return `<svg class="creature-thumbnail" viewBox="0 0 160 100" role="img" aria-label="${escape(carrierName(g.carrier)+' '+g.name)}"><g stroke="#c4e4cd" stroke-width="2" fill="hsl(${g.hue} 42% 58%)"><ellipse cx="80" cy="52" rx="${l*hull}" ry="${w*hull}"/>${parts}</g></svg>`;
}
export function vehicleLibraryMarkup(entries:VehicleCreation[],campaign:VehicleConstruction[],canUse:boolean):string {
  const button=(action:string,label:string)=>`<button class="secondary" data-action="${action}">${label}</button>`;
  return `<p>Navrhni vozidlo, ulož jej a použij v libovolné linii. Výroba v kampani spotřebuje jantar; letoun potřebuje odemčené létání.</p><div class="row library-toolbar">${(['tank','air','boat'] as const).map(c=>button('vehicle-new:'+c,'Nový '+({tank:'pozemní stroj',air:'letoun',boat:'člun'})[c])).join('')}<label class="secondary library-import">Importovat vozidlo<input id="import-vehicle" type="file" accept=".json,application/json"></label></div><p class="tiny">${entries.length} / 100 návrhů · úpravy knihovny nemění postavené stroje</p>${campaign.length?`<details><summary>Uložit konstrukci z této kampaně</summary><div class="row">${campaign.map((g,i)=>button('vehicle-capture:'+i,escape(g.name))).join('')}</div></details>`:''}<div class="creature-library-grid">${entries.map(c=>{
    const g=c.blueprint,s=vehicleStats(g);
    return `<article class="creature-library-card" data-vehicle-creation="${c.id}">${vehicleThumbnail(g)}<h3>${escape(g.name)}</h3><p>${carrierName(g.carrier)} · výroba ${vehicleCost(g)} jantaru</p><p class="tiny">Odolnost ${s.durability} · rychlost ${s.speed.toFixed(1)} m/s<br>${s.module?escape(vehiclePart(s.module).name):'Přeprava výpravového avatara'}</p><p>${escape(c.description||'Bez popisu')}</p><small>Revize ${c.revision}</small><div class="row">${button('vehicle-edit:'+c.id,'Upravit / 3D')}${canUse?button('vehicle-use:'+c.id,'Vyrobit v kampani'):''}${button('vehicle-export:'+c.id,'Exportovat')}${button('vehicle-delete:'+c.id,'Odstranit')}</div></article>`;
  }).join('')||'<p>Knihovna je prázdná. Vytvoř první vlastní vozidlo.</p>'}</div>`;
}
