import { expect, it } from 'vitest';
import * as THREE from 'three';
import { musicGame } from './fixtures/music';
import { startMusic, stepMusic, answerMusic, musicPerformance } from '../src/game/tribe-music';
import { musicHudMarkup, musicPlanMarkup } from '../src/ui/tribe-music';
import { equipment, SettlementPresentation } from '../src/render/settlement';
import { disposeObject } from '../src/render/organism';
import { MusicObserver, musicVoiceRecipe } from '../src/render/audio';
function geometry(group: THREE.Object3D) { const a: unknown[]=[];group.traverse(n=>{if(n instanceof THREE.Mesh)a.push([n.position.toArray(),Array.from(n.geometry.getAttribute('position').array)]);});return a; }
it('explains real requirements, price and composition before dispatch',()=>{
 const g=musicGame(['drum','drum','drum']), html=musicPlanMarkup(g.s,g.n,g.ids);
 expect(html).toContain('Píšťala ×1');expect(html).toContain('Píšťala: 0');expect(html).toContain('4 jídla + 8 dar');expect(html).toContain('Dílna 22, nástroj 6');
});
it('shows timed request and concrete missing instrument outcome without relying on sound',()=>{
 const g=musicGame(['drum','drum','drum']);startMusic(g.s,g.ids,g.n.id);stepMusic(g.s,.1);stepMusic(g.s,3);
 expect(musicHudMarkup(g.s)).toContain('Zvol odpověď');answerMusic(g.s,'flute');
 expect(musicHudMarkup(g.s)).toContain('Píšťala, hráčů 0');expect(musicHudMarkup(g.s)).toContain('Odpověď se nezdařila');
});
it.each(['drum','flute','rattle'] as const)('uses the same %s geometry in world and preview',instrument=>{
 const g=musicGame([instrument,instrument,instrument]), scene=new SettlementPresentation(), preview=equipment(instrument), before=JSON.stringify(g.s);
 try{scene.update(g.s,[],0);expect(geometry(scene.group.getObjectByName(`tribe-member-${g.ids[0]}`)!.getObjectByName(`tool-${instrument}`)!)).toEqual(geometry(preview));expect(JSON.stringify(g.s)).toBe(before);}finally{scene.dispose();disposeObject(preview);}
});
it('animates only the actual caller or answering players, respects reduced motion and lost contact',()=>{
 const g=musicGame();startMusic(g.s,g.ids,g.n.id);stepMusic(g.s,.1);const e=g.t.music!.active!,scene=new SettlementPresentation();
 try{
  expect(musicPerformance(g.s,e.host)?.role).toBe('host');expect(musicPerformance(g.s,g.ids[0])).toBeNull();scene.update(g.s,[],.12);
  expect(scene.group.getObjectByName(`neighbour-unit-${e.host}`)!.getObjectByName('music-cue')).toBeDefined();
  stepMusic(g.s,3);answerMusic(g.s,'drum');expect(musicPerformance(g.s,g.ids[0])?.instrument).toBe('drum');expect(musicPerformance(g.s,g.ids[1])).toBeNull();
  scene.update(g.s,[],.24,true);const tool=scene.group.getObjectByName(`tribe-member-${g.ids[0]}`)!.getObjectByName('tool-drum')!;expect(tool.parent!.rotation.z).toBe(0);
  g.t.members[0].pos.x=50;scene.update(g.s,[],.3);expect(scene.group.getObjectByName('music-cue')).toBeUndefined();
 }finally{scene.dispose();}
});
it('emits distinct call/response/result voices once and seeds loaded identity silently',()=>{
 const g=musicGame(), observer=new MusicObserver();expect(observer.observe(g.s)).toBeNull();startMusic(g.s,g.ids,g.n.id);observer.observe(g.s);stepMusic(g.s,.1);
 expect(observer.observe(g.s)).toEqual(musicVoiceRecipe('drum'));expect(observer.observe(g.s)).toBeNull();stepMusic(g.s,3);expect(observer.observe(g.s)?.frequency).toBe(880);
 answerMusic(g.s,'flute');expect(observer.observe(g.s)).toEqual(musicVoiceRecipe('flute',false));expect(observer.observe(structuredClone(g.s))).toBeNull();
 expect(new Set(['drum','flute','rattle'].map(i=>musicVoiceRecipe(i as 'drum').frequency)).size).toBe(3);
});
it('explains the exact failed response cause',()=>{
 const g=musicGame(['drum','drum','drum']);startMusic(g.s,g.ids,g.n.id);stepMusic(g.s,.1);stepMusic(g.s,3);answerMusic(g.s,'drum');stepMusic(g.s,2.5);stepMusic(g.s,3);answerMusic(g.s,'flute');
 expect(musicHudMarkup(g.s)).toContain('Chybí hráči: potřeba 1, přítomno 0');
});
