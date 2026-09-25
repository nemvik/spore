import { CITY_BUILDINGS, isBuildingKind, type CityBuildingKind } from '../game/city-economy';
import { BUILDING_PART_LIMIT, BUILDING_SHAPES, initialBuildingDesign, validateBuildingDesign, type BuildingAppearance, type BuildingCreation, type BuildingDesign, type BuildingShape } from '../game/building-design';
import { readBuildingLibrary, saveBuildingCreation, deleteBuildingCreation, serializeBuildingCreation, importBuildingCreation, BUILDING_FILE_LIMIT } from '../game/building-library';
import type { LibraryStorage } from '../game/creature-library';
import { escapeHtml as esc } from './creature-library';

const button=(action:string,label:string,disabled=false)=>`<button class="secondary" data-action="building:${action}" ${disabled?'disabled':''}>${label}</button>`;
const num=(key:string,label:string,value:number,min:number,max:number,step=.1)=>`<label>${label}<input data-building="${key}" aria-label="${label}" type="number" min="${min}" max="${max}" step="${step}" value="${Number(value.toFixed(4))}"></label>`;
export interface BuildingDraft {name:string;design:BuildingDesign;}
/** Detached edit history. Invalid operations leave the last valid geometry intact. */
export class BuildingEdit {
  value:BuildingDraft; selected:string|null; undo:BuildingDraft[]=[];redo:BuildingDraft[]=[];notice='';
  constructor(design:BuildingDesign,name:string){this.value={design:structuredClone(design),name};this.selected=design.parts[0]?.id??null;}
  change(fn:(v:BuildingDraft)=>void):boolean {
    const next=structuredClone(this.value);fn(next);
    try{validateBuildingDesign(next.design);}catch(error){this.notice=(error as Error).message;return false;}
    if(JSON.stringify(next)===JSON.stringify(this.value))return false;
    this.undo.push(this.value);if(this.undo.length>40)this.undo.shift();this.value=next;this.redo=[];this.reconcile();this.notice='';return true;
  }
  reconcile(){if(!this.value.design.parts.some(p=>p.id===this.selected))this.selected=this.value.design.parts.at(-1)?.id??null;}
  history(back:boolean){const from=back?this.undo:this.redo,to=back?this.redo:this.undo,v=from.pop();if(v){to.push(this.value);this.value=v;this.reconcile();this.notice='';}}
  id(){let n=1;while(this.value.design.parts.some(p=>p.id===`part-${n}`))n++;return `part-${n}`;}
}
function thumbnail(c:BuildingCreation) {
  // Orthographic side projection of the actual editable parts, not a preset icon.
  return `<svg viewBox="-3 -7.5 6 8" role="img" aria-label="Silueta ${esc(c.name)}">${c.design.parts.map(p=>`<rect x="${p.position.x-p.size.x/2}" y="${-p.position.y-p.size.y/2}" width="${p.size.x}" height="${p.size.y}" rx="${p.shape==='box'?0:Math.min(p.size.x,p.size.y)/3}" fill="${p.color}" stroke="#244b54" stroke-width=".035"/>`).join('')}<path d="M-2.5 0H2.5" stroke="#536d68" stroke-width=".4"/></svg>`;
}
export type BuildingStudioResult = 'close' | {use:BuildingAppearance} | null;
export class BuildingStudio {
  edit:BuildingEdit|null=null;original:BuildingCreation|undefined;entries:BuildingCreation[]=[];notice='';
  constructor(private storage:LibraryStorage,readonly kind?:CityBuildingKind,readonly installed?:BuildingAppearance){this.refresh();}
  refresh(){try{const r=readBuildingLibrary(this.storage);this.entries=r.entries;this.notice=r.problems.join(' ');}catch(error){this.notice=(error as Error).message;this.entries=[];}}
  preview():BuildingCreation|null {if(!this.edit)return null;return {format:'lumavora-building',version:1,id:'preview',revision:1,createdAt:0,updatedAt:0,name:this.edit.value.name,design:this.edit.value.design};}
  open(design:BuildingDesign,name:string,original?:BuildingCreation){this.original=original;this.edit=new BuildingEdit(design,name);this.notice='';}
  input(key:string,value:string){const e=this.edit;if(!e)return;
    e.change(v=>{if(key==='name'){v.name=value;return;}const p=v.design.parts.find(p=>p.id===e.selected);if(!p)return;
      if(key==='color')p.color=value.toLowerCase();else if(key==='shape'&&Object.hasOwn(BUILDING_SHAPES,value))p.shape=value as BuildingShape;
      else if(key==='yaw')p.yaw=Number(value);else {const [field,axis]=key.split('.');if((field==='position'||field==='size')&&['x','y','z'].includes(axis))p[field][axis as 'x'|'y'|'z']=value.trim()===''?NaN:Number(value);}});
  }
  async import(file:File){try{if(file.size>BUILDING_FILE_LIMIT)throw new Error('Soubor budovy je příliš velký (128 KiB).');const r=importBuildingCreation(this.storage,await file.text());this.refresh();this.notice=r.duplicate?'Tento návrh už v knihovně je.':'Návrh importován; žádná budova nebyla postavena.';}catch(error){this.notice=(error as Error).message;}}
  act(arg:string):BuildingStudioResult {
    const [action,...rest]=arg.split(','),id=rest.join(','),entry=this.entries.find(v=>v.id===id),e=this.edit;
    try {
      if(action==='close')return 'close';
      if(action==='new'&&isBuildingKind(id)){this.open(initialBuildingDesign(id),CITY_BUILDINGS[id].name);return null;}
      if(action==='installed'&&this.kind){const a=this.installed;this.open(a?.source==='creation'?a.creation.design:initialBuildingDesign(this.kind),a?.source==='creation'?a.creation.name:CITY_BUILDINGS[this.kind].name);return null;}
      if(action==='edit'&&entry){this.open(entry.design,entry.name,entry);return null;}
      if(action==='use'&&entry&&!e&&this.kind===entry.design.kind)return {use:{version:1,source:'creation',creation:structuredClone(entry)}};
      if(action==='default'&&!e&&this.kind)return {use:{version:1,source:'default',model:'city-b-1'}};
      if(action==='duplicate'&&entry){saveBuildingCreation(this.storage,entry.design,`${entry.name.slice(0,32)} · kopie`);this.refresh();this.notice='Nová kopie s vlastní identitou a revizí 1.';}
      if(action==='delete'&&entry&&confirm(`Odstranit návrh „${entry.name}“? Postavené budovy si zachovají svůj snapshot.`)){deleteBuildingCreation(this.storage,entry);this.refresh();this.notice='Předloha odstraněna. Postavené budovy zůstávají.';}
      if(action==='export'&&entry){const url=URL.createObjectURL(new Blob([serializeBuildingCreation(entry)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`lumavora-building-${entry.id}.json`;try{a.click();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}this.notice='Návrh exportován.';}
      if(!e)return null;
      if(action==='cancel'){this.edit=null;this.original=undefined;this.notice='Rozpracovaný návrh zrušen. Město ani knihovna se nezměnily.';return null;}
      if(action==='save'){saveBuildingCreation(this.storage,e.value.design,e.value.name.trim(),this.original);this.edit=null;this.original=undefined;this.refresh();this.notice='Návrh uložen. Pro město jej výslovně vyber; cena stavby je daná typem.';return null;}
      if(action==='select'){e.selected=e.value.design.parts.some(p=>p.id===id)?id:null;}
      if(action==='undo'||action==='redo')e.history(action==='undo');
      if(action==='remove')e.change(v=>{v.design.parts=v.design.parts.filter(p=>p.id!==e.selected);});
      if(action==='add'&&Object.hasOwn(BUILDING_SHAPES,id)){const partId=e.id();if(e.change(v=>v.design.parts.push({id:partId,shape:id as BuildingShape,position:{x:0,y:4,z:0},size:{x:.8,y:1,z:.8},yaw:0,color:'#dcae70'})))e.selected=partId;}
      if(action==='copy-part'){const p=e.value.design.parts.find(p=>p.id===e.selected),partId=e.id();if(p&&e.change(v=>v.design.parts.push({...structuredClone(p),id:partId})))e.selected=partId;}
    }catch(error){if(e)e.notice=(error as Error).message;else this.notice=(error as Error).message;}
    return null;
  }
  markup():string {
    const e=this.edit;
    if(!e){const list=this.entries.filter(c=>!this.kind||c.design.kind===this.kind);
      return `<main class="building-library panel" aria-label="Knihovna budov"><header><div><div class="eyebrow">ATELIÉR MĚSTA</div><h2>Knihovna budov</h2></div>${button('close','Zavřít')}</header><p>Návrh je vzhled. Hospodářský typ určuje cenu, kapacitu a produkci. Úpravy knihovny nemění již postavené budovy.</p><div class="row">${Object.entries(CITY_BUILDINGS).filter(([k])=>!this.kind||k===this.kind).map(([k,v])=>button('new,'+k,'Nový návrh · '+v.name)).join('')}<label class="secondary">Importovat návrh<input id="import-building" type="file" accept="application/json,.json"></label>${this.installed?button('installed','Upravit kopii současné budovy'):''}${this.kind?button('default','Použít výchozí vzhled'):''}</div><p class="tiny">${this.entries.length}/100 návrhů · tvorba a revize zdarma · hra a hospodářství stojí</p><p role="status">${esc(this.notice)}</p><div class="building-cards">${list.map(c=>`<article data-building-creation="${c.id}">${thumbnail(c)}<h3>${esc(c.name)}</h3><p>${CITY_BUILDINGS[c.design.kind].name} · revize ${c.revision}<br>${c.design.parts.length} dílů · stavba ${CITY_BUILDINGS[c.design.kind].cost} ◈</p><div class="row">${this.kind?button('use,'+c.id,'Použít návrh'):''}${button('edit,'+c.id,'Upravit / 3D')}${button('duplicate,'+c.id,'Duplikovat')}${button('export,'+c.id,'Exportovat')}${button('delete,'+c.id,'Odstranit')}</div></article>`).join('')||'<p>Zatím žádný návrh tohoto typu. Vytvoř jej skládáním dílů.</p>'}</div></main>`;
    }
    const d=e.value.design,p=d.parts.find(p=>p.id===e.selected),def=CITY_BUILDINGS[d.kind];
    return `<main class="building-editor" aria-label="Editor budovy"><header class="building-heading panel"><div><div class="eyebrow">${def.name} · ${this.original?'revize '+(this.original.revision+1):'nový výtvor'}</div><h2>Tvar města</h2></div><div class="row">${button('undo','Zpět',!e.undo.length)}${button('redo','Znovu',!e.redo.length)}${button('cancel','Zrušit návrh')}${button('save','Uložit návrh')}</div></header>
      <aside class="building-controls panel"><label>Jméno návrhu<input data-building="name" aria-label="Jméno návrhu" maxlength="40" value="${esc(e.value.name)}"></label><h3>Díly · ${d.parts.length}/${BUILDING_PART_LIMIT}</h3><div class="building-add">${Object.entries(BUILDING_SHAPES).map(([k,label])=>button('add,'+k,'+ '+label,d.parts.length>=BUILDING_PART_LIMIT)).join('')}</div><div class="building-parts" role="group" aria-label="Výběr dílu">${d.parts.map((p,i)=>`<button data-action="building:select,${p.id}" aria-pressed="${p.id===e.selected}">${i+1} · ${BUILDING_SHAPES[p.shape]}</button>`).join('')}</div>
      <section class="building-properties">${p?`<h3>Vybraný díl · ${esc(p.id)}</h3><label>Tvar<select data-building="shape" aria-label="Tvar dílu">${Object.entries(BUILDING_SHAPES).map(([k,label])=>`<option value="${k}" ${p.shape===k?'selected':''}>${label}</option>`).join('')}</select></label><div class="building-numbers">${(['x','y','z'] as const).map(axis=>num('position.'+axis,'Poloha '+axis.toUpperCase(),p.position[axis],-7,7)).join('')}${(['x','y','z'] as const).map(axis=>num('size.'+axis,'Rozměr '+axis.toUpperCase(),p.size[axis],.2,6)).join('')}${num('yaw','Otočení °',p.yaw,-180,180,5)}<label>Barva<input data-building="color" aria-label="Barva dílu" type="color" value="${p.color}"></label></div><div class="row">${button('copy-part','Kopírovat díl',d.parts.length>=BUILDING_PART_LIMIT)}${button('remove','Odebrat díl',d.parts.length<=1)}</div>`:'Vyber díl kliknutím ve 3D nebo v seznamu.'}</section></aside>
      <section id="building-viewport" tabindex="0" aria-label="3D náhled budovy; klikni na díl, pravým tažením otáčej, kolečkem přibližuj"></section>
      <footer class="building-footer panel"><div class="row">${button('camera-left','↶ Kamera')}${button('camera-right','Kamera ↷')}${button('camera-up','Výš')}${button('camera-down','Níže')}${button('zoom-in','Přiblížit')}${button('zoom-out','Oddálit')}${button('camera-reset','Obnovit pohled')}</div><p role="status" class="building-notice">${esc(e.notice||'Vyber díl · uprav polohu, rozměry, otočení a barvu. Ctrl/⌘ Z zpět; Shift Z znovu; Delete odebere díl; Esc zruší návrh.')}</p><p class="tiny">${def.effect} · stavba ${def.cost} ◈ · údržba ${def.upkeep} ◈ / cyklus. <b>Vzhled tato čísla nemění. Uložení 0 ◈.</b><br>Plná základna je pevná: vnitřní mezery nejsou průchody. Obal R ${def.radius}, výška 0,7–7; přední pás patří znaku typu. +X východ, +Y nahoru, +Z jih. Hra stojí.</p></footer></main>`;
  }
}
