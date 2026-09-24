import {it,expect} from 'vitest';
import * as THREE from 'three';
import {domesticGame,runDomestic} from './fixtures/domestication';
import {startDomestication,animalStatus,stepDomestication} from '../src/game/tribe-domestication';
import {domesticationMarkup} from '../src/ui/tribe-domestication';
import {syncAnimalMarker,DomesticationObserver} from '../src/render/domestication';
it('HUD uses real eligibility, payment and caretaker instead of treating the animal as a member',()=>{
 const g=domesticGame();let html=domesticationMarkup(g.s,[g.u.id]);expect(html).toContain(`tribe-tame:${g.c.id}`);expect(html).toContain('6 jídla');
 g.u.tool='spear';html=domesticationMarkup(g.s,[g.u.id]);expect(html).toContain('Odlož oštěp');expect(html).toContain(`data-action="tribe-tame:${g.c.id}" disabled`);
});
it('marker follows actual ownership, cargo and hunger; it disposes on release',()=>{
 const g=domesticGame();startDomestication(g.s,[g.u.id],g.c.id);runDomestic(g.s,22);const a=g.t.domestication!.animals[0],group=new THREE.Group();
 a.cargo=2;syncAnimalMarker(group,g.s,g.c,10,false);expect(group.getObjectByName('animal-cargo')!.children.filter(o=>o.visible)).toHaveLength(2);
 g.c.hunger=75;expect(animalStatus(g.s,a)).toBe('hungry');syncAnimalMarker(group,g.s,g.c,10,true);expect(group.getObjectByName('animal-marker')!.userData.status).toBe('hungry');
 g.t.domestication!.animals=[];syncAnimalMarker(group,g.s,g.c,10,false);expect(group.getObjectByName('animal-marker')).toBeUndefined();
});
it('audio observes actual phase, paid feeding and delivery; load does not replay events',()=>{
 const g=domesticGame(),o=new DomesticationObserver();expect(o.observe(g.s)).toBeNull();startDomestication(g.s,[g.u.id],g.c.id);o.observe(g.s);stepDomestication(g.s,.1);expect(o.observe(g.s)?.frequency).toBe(440);expect(o.observe(g.s)).toBeNull();
 runDomestic(g.s,22);expect(o.observe(g.s)?.frequency).toBe(740);const a=g.t.domestication!.animals[0];g.u.pos={...g.c.pos};g.c.hunger=40;o.observe(g.s);stepDomestication(g.s,.1);expect(o.observe(g.s)?.frequency).toBe(520);
 a.cargo=2;o.observe(g.s);stepDomestication(g.s,.1);expect(o.observe(g.s)?.frequency).toBe(620);expect(o.observe(structuredClone(g.s))).toBeNull();
});
it('world rendering keeps campaign ownership while rendering the inherited coast habitat',async()=>{
 const {GameRenderer}=await import('../src/render/renderer');const {createOrganism,disposeObject}=await import('../src/render/organism');
 const g=domesticGame();startDomestication(g.s,[g.u.id],g.c.id);runDomestic(g.s,22);
 const renderer=Object.create(GameRenderer.prototype) as InstanceType<typeof GameRenderer>,meshes=new Map<number,THREE.Group>(),player=createOrganism(g.s.player.genome),afterWildlife=Error('after wildlife rendering');
 Object.assign(renderer,{presentationTime:0,settings:{reducedMotion:false},worldRef:g.s.world,lastStage:3,syncObstacles:()=>{},settlement:{update:()=>{}},fleet:{update:()=>{}},planet:{update:()=>{}},commandSelection:[],commandFocus:g.t.huts[0].pos,playerKey:JSON.stringify(g.s.player.genome),player,lastHeading:0,creatureMeshes:meshes,scene:new THREE.Scene(),updateResources:()=>{throw afterWildlife;}});
 expect(()=>renderer.render(g.s,1/60,'game')).toThrow(afterWildlife);
 expect(meshes.get(g.c.id)?.getObjectByName('animal-marker')).toBeDefined();expect(g.s.stage).toBe(3);
 disposeObject(player);for(const m of meshes.values())disposeObject(m);
});
