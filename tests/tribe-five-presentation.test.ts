import { it, expect } from 'vitest';
import { fiveTribes } from './fixtures/five-tribes';
import { tribeHudMarkup } from '../src/ui/tribe';
import { SettlementPresentation } from '../src/render/settlement';
import { TRIBE_COPY } from '../src/game/tribe-copy.cs';
import { pickCommandTarget } from '../src/render/command-picking';
import * as THREE from 'three';

it('exposes all five identities, locations, living economies, actions and simultaneous warnings',()=>{
 const s=fiveTribes();for(const n of s.tribe.neighbours.slice(0,2))n.society!.expedition={phase:'warning',members:[n.society!.members[0].id],time:2};
 const html=tribeHudMarkup(s,[s.tribe.members[0].id],null);
 expect(html).toContain('0 / 5');expect(html).not.toContain('všemi třemi');
 expect(html).toContain('Výpravy: 2');
 for(const n of s.tribe.neighbours.slice(0,2)){expect(html.match(new RegExp(`data-action="tribe-expedition-focus:${n.id}"`,'g'))).toHaveLength(1);expect(html).toContain(`tribe-expedition-alert:${n.id}`);}
 for(const n of s.tribe.neighbours){expect(html).toContain(TRIBE_COPY.neighbours[n.identity].name);expect(html).toContain(`tribe-focus:${n.id}`);expect(html).toContain(`tribe-socialize:${n.id}`);expect(html).toContain(`tribe-attack:${n.id}`);expect(html).toContain(TRIBE_COPY.neighbours[n.identity].hint);}
 expect(html.match(/m od tábora/g)).toHaveLength(5);
 for(const n of s.tribe.neighbours){expect(html.match(new RegExp(`data-action="tribe-focus:${n.id}"`,'g'))).toHaveLength(1);expect(html).toContain(`data-action="tribe-map:${n.id}"`);}
});
it('uses distinct new settlement shapes, actual NPC bodies and matching pick targets without mutation',()=>{
 const s=fiveTribes(),before=JSON.stringify(s),view=new SettlementPresentation();
 try{
  view.update(s,[],0,true);
  for(const n of s.tribe.neighbours){
   expect(view.group.getObjectByName(`tribe-neighbour-${n.id}`)).toBeDefined();
   for(const u of n.society!.members){const model=view.group.getObjectByName(`neighbour-unit-${u.id}`)!;expect(model).toBeDefined();expect(model.position.x).toBe(u.pos.x);expect(view.pickTargets().some(p=>p.target.id===u.id&&p.target.kind==='neighbour-unit')).toBe(true);}
  }
  const reed=s.tribe.neighbours[3],basalt=s.tribe.neighbours[4];
  expect(view.group.getObjectByName(`tribe-neighbour-${reed.id}`)!.getObjectByName('reed-pipes')).toBeDefined();
  expect(view.group.getObjectByName(`tribe-neighbour-${basalt.id}`)!.getObjectByName('basalt-stones')).toBeDefined();
  expect(JSON.stringify(s)).toBe(before);
 }finally{view.dispose();}
});
