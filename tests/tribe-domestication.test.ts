import { describe,it,expect } from 'vitest';
import { domesticGame,runDomestic } from './fixtures/domestication';
import * as D from '../src/game/tribe-domestication';
import { issueTribeOrder,equipTribeUnits,stepTribe } from '../src/game/tribe';
import { removeTribePrey,stepTribeWildlife } from '../src/game/tribe-wildlife';
import { startMusic } from '../src/game/tribe-music';
import { spawnCreature } from '../src/game/world';
import { step,continueToMachinesEra } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';
import { parseGame,serializeGame } from '../src/game/persistence';
import { groundHeight,horizontalDistance } from '../src/game/random';

function acquired(){const g=domesticGame();expect(D.startDomestication(g.s,[g.u.id],g.c.id).ok).toBe(true);runDomestic(g.s,22);expect(g.t.domestication!.animals).toHaveLength(1);return {...g,a:g.t.domestication!.animals[0]};}
describe('domestication of a real wild animal',()=>{
 it('charges only at real contact once, escorts the same living individual home',()=>{
  const g=domesticGame(), original=g.c.id;g.u.pos.x=30;
  expect(D.startDomestication(g.s,[g.u.id],original).ok).toBe(true);D.stepDomestication(g.s,.1);expect(g.t.food).toBe(100);
  g.u.pos.x=15;D.stepDomestication(g.s,.1);expect(g.t.food).toBe(94);expect(g.t.domestication!.active!.phase).toBe('lure');
  runDomestic(g.s,22);expect(g.t.domestication!.animals.map(a=>a.creature)).toEqual([original]);expect(g.t.domestication!.result!.reason).toBe('success');
  expect(g.s.world.creatures).toHaveLength(1);expect(g.s.world.creatures[0]).toBe(g.c);expect(horizontalDistance(g.c.pos,g.t.huts[0].pos)).toBeLessThan(6);
  expect(g.t.members).toHaveLength(4); // three descendants + the fixture's one inherited symbiont
 });
 it('a rock blocks payment and acquisition times out',()=>{
  const g=domesticGame();g.s.world.obstacles=[{id:999,pos:{x:16.5,y:0,z:0},radius:1,height:5,kind:'rock'}];
  D.startDomestication(g.s,[g.u.id],g.c.id);D.stepDomestication(g.s,.1);expect(g.t.food).toBe(100);D.stepDomestication(g.s,90);expect(g.t.domestication!.result!.reason).toBe('timeout');
 });
 it('new orders cancel a paid attempt without refund or reward',()=>{
  const g=domesticGame();D.startDomestication(g.s,[g.u.id],g.c.id);D.stepDomestication(g.s,.1);
  expect(issueTribeOrder(g.s,[g.u.id],'move',{kind:'point',pos:g.t.huts[0].pos}).ok).toBe(true);
  expect(g.t.domestication!.active).toBeNull();expect(g.t.food).toBe(94);expect(g.t.domestication!.animals).toHaveLength(0);expect(g.u.orders).toHaveLength(1);
 });
 it('rejects unsuitable species, symbionts, spear, no stock and duplicate ownership atomically',()=>{
  const g=domesticGame();g.c.species='gloom';expect(D.startDomestication(g.s,[g.u.id],g.c.id).ok).toBe(false);g.c.species='bell';
  expect(D.startDomestication(g.s,[g.t.members.find(u=>u.species)!.id],g.c.id).ok).toBe(false);
  g.u.tool='spear';expect(D.startDomestication(g.s,[g.u.id],g.c.id).ok).toBe(false);g.u.tool=null;g.t.food=5;expect(D.startDomestication(g.s,[g.u.id],g.c.id).ok).toBe(false);expect(g.t.domestication).toBeUndefined();
  const h=acquired();expect(D.startDomestication(h.s,[h.u.id],h.c.id).ok).toBe(false);expect(h.t.domestication!.animals).toHaveLength(1);
 });
 it.each(['animal','member','contact','food'] as const)('ends safely after loss of %s',what=>{
  const g=domesticGame();D.startDomestication(g.s,[g.u.id],g.c.id);
  if(what!=='food')D.stepDomestication(g.s,.1);
  if(what==='animal')g.s.world.creatures=[];if(what==='member')g.t.members=g.t.members.filter(u=>u!==g.u);if(what==='contact')g.c.pos.x=60;if(what==='food')g.t.food=0;
  D.stepDomestication(g.s,4);expect(g.t.domestication!.active).toBeNull();expect(g.t.domestication!.animals).toHaveLength(0);expect(g.t.domestication!.result!.reason).toBe(what==='animal'?'lost-animal':what==='member'?'lost-member':what);
 });
 it('music cannot take the active caretaker and equipment cannot add a spear',()=>{
  const g=domesticGame();D.startDomestication(g.s,[g.u.id],g.c.id);
  expect(startMusic(g.s,[g.u.id],g.t.neighbours[0].id).ok).toBe(false);
  g.t.unlocked.push('spear');expect(equipTribeUnits(g.s,[g.u.id],'spear').ok).toBe(false);
 });
 it('gathers finite plant portions, carries them physically and delivers once',()=>{
  const g=acquired();g.s.world.resources=[];const r={id:g.s.world.nextId++,kind:'nectar' as const,pos:{x:16,y:groundHeight(16,0,2)+.8,z:0},amount:6,max:6,patch:0,regen:0};g.s.world.resources.push(r);
  expect(D.orderDomesticAnimal(g.s,g.c.id,r.id).ok).toBe(true);const stock=g.t.food;
  // Isolate economic accounting from ordinary member feeding and environment regrowth.
  for(let i=0;i<2100&&g.t.food===stock;i++)D.stepDomestication(g.s,1/60);
  expect(r.amount).toBe(0);expect(g.a.cargo).toBe(0);expect(g.t.food).toBe(stock+24);expect(horizontalDistance(g.c.pos,g.t.huts[0].pos)).toBeLessThan(6);
  D.stepDomestication(g.s,1);expect(g.t.food).toBeLessThanOrEqual(stock+24);
 });
 it('contact care spends stock; hunger stops work, neglect releases without any grant',()=>{
  const g=acquired();g.c.hunger=40;g.u.pos={...g.c.pos};const stock=g.t.food;D.stepDomestication(g.s,.1);expect(g.t.food).toBe(stock-3);expect(g.c.hunger).toBeLessThan(10);
  g.t.food=0;g.c.hunger=75;g.a.trust=1;const pos={...g.c.pos};D.stepDomestication(g.s,2);expect(g.t.food).toBe(0);expect(g.t.domestication!.animals).toHaveLength(0);expect(g.s.world.creatures[0].id).toBe(g.c.id);expect(g.t.domestication!.result!.reason).toBe('neglect');expect(g.c.pos).toEqual(pos);
 });
 it('lost caretaker stops work and can be replaced without creating a new animal',()=>{
  const g=acquired();g.t.members=g.t.members.filter(u=>u!==g.u);D.stepDomestication(g.s,.1);expect(g.a.caretaker).toBeNull();expect(g.a.mode).toBe('rest');
  const replacement=g.t.members.find(u=>!u.species)!;expect(D.assignAnimalCaretaker(g.s,g.c.id,[replacement.id]).ok).toBe(true);expect(g.a.caretaker).toBe(replacement.id);expect(g.t.domestication!.animals).toHaveLength(1);
 });
 it('wild AI skips owned animals; release preserves identity; death yields one corpse',()=>{
  const g=acquired();g.c.hunger=90;const before=structuredClone(g.c);stepTribeWildlife(g.s,g.t,1);expect(g.c).toEqual(before);
  const stock=g.t.food;expect(D.releaseDomesticAnimal(g.s,g.c.id).ok).toBe(true);expect(g.t.food).toBe(stock);expect(g.s.world.creatures).toHaveLength(1);
  removeTribePrey(g.s,g.c);removeTribePrey(g.s,g.c);expect(g.s.world.resources.filter(r=>r.kind==='meat'&&r.id>=g.s.world.nextId-1)).toHaveLength(1);
 });
 it('an actual predator strike interrupts the attempt in the full simulation',()=>{
  const g=domesticGame();D.startDomestication(g.s,[g.u.id],g.c.id);D.stepDomestication(g.s,.1);const predator=spawnCreature(g.s.world,'crest',0);Object.assign(predator,{pos:{...g.c.pos},target:g.c.id,intent:'hunt',hunger:80,cooldown:0});g.s.world.creatures.push(predator);g.s.tick=1;step(g.s,EMPTY_INPUT,1/60);expect(g.c.health).toBeLessThan(32);expect(g.t.domestication!.result!.reason).toBe('attack');expect(g.t.domestication!.active).toBeNull();
 });
});

it('natural healthy bells are suitable and paid care cannot over-heal the species',()=>{const g=domesticGame();delete g.s.world.creatureDesigns;const c=spawnCreature(g.s.world,'bell',0);c.fear=0;g.s.world.creatures=[c];expect(c.health).toBe(32);expect(D.domesticationQuote(g.s,[g.u.id],c.id).ok).toBe(true);const h=acquired();h.u.pos={...h.c.pos};h.c.health=31;h.c.hunger=0;D.stepDomestication(h.s,5);expect(h.c.health).toBe(32);});
it('saved dead animal at acquisition boundary makes one corpse and frees the slot',()=>{const g=domesticGame();D.startDomestication(g.s,[g.u.id],g.c.id);D.stepDomestication(g.s,.1);g.c.health=0;const loaded=parseGame(serializeGame(g.s)),before=loaded.world.resources.length;step(loaded,EMPTY_INPUT,1/60);step(loaded,EMPTY_INPUT,1/60);expect(loaded.world.creatures.some(c=>c.id===g.c.id)).toBe(false);expect(loaded.world.resources.length).toBe(before+1);});
it('cached predator target cannot strike a frozen domestic animal after machine entry',()=>{const g=acquired(),p=spawnCreature(g.s.world,'crest',0);Object.assign(p,{pos:{...g.c.pos},target:g.c.id,intent:'hunt',hunger:80,cooldown:0});g.s.world.creatures.push(p);g.t.neighbours.forEach(n=>{n.resolved='allied';n.society!.expedition=null;});g.t.completed=true;g.s.tick=1;expect(continueToMachinesEra(g.s)).toBe(true);const c=structuredClone(g.c),d=structuredClone(g.t.domestication);step(g.s,EMPTY_INPUT,1/60);expect(g.c).toEqual(c);expect(g.t.domestication).toEqual(d);});
it('a hunter cannot strike the acquisition target through a rock',()=>{
 const g=domesticGame();g.s.player.genome.parts.push({id:'hunter-jaw',kind:'jaw',axial:.8,angle:0,scale:1,mirrored:false});D.startDomestication(g.s,[g.u.id],g.c.id);D.stepDomestication(g.s,.1);const hunter=g.t.members.filter(u=>!u.species)[1];hunter.tool='spear';hunter.pos={...g.c.pos,x:g.c.pos.x+3};hunter.orders=[{unit:hunter.id,kind:'attack',target:{kind:'creature',id:g.c.id}}];g.s.world.obstacles=[{id:g.s.world.nextId++,kind:'rock',pos:{...g.c.pos,x:g.c.pos.x+1.5},radius:.5,height:4}];const health=g.c.health;step(g.s,EMPTY_INPUT,1/60);expect(g.c.health).toBe(health);expect(g.t.domestication!.active).not.toBeNull();
});

it('zero trust at a save boundary leaves before feeding or depositing cargo',()=>{const g=acquired();g.a.trust=0;g.a.cargo=2;g.c.hunger=1;g.u.pos={...g.c.pos};const loaded=parseGame(serializeGame(g.s)),stock=loaded.tribe!.food;D.stepDomestication(loaded,1/60);expect(loaded.tribe?.version===2&&loaded.tribe.domestication!.animals).toHaveLength(0);expect(loaded.tribe!.food).toBe(stock);});
it('capacity reserves an active slot and is independent of member capacity',()=>{
 const g=acquired(),c=spawnCreature(g.s.world,'bell',0);c.pos={...g.u.pos,x:g.u.pos.x+3};c.fear=0;c.hunger=10;g.s.world.creatures.push(c);
 expect(D.startDomestication(g.s,[g.u.id],c.id).ok).toBe(true);const second=spawnCreature(g.s.world,'bell',0);g.s.world.creatures.push(second);expect(D.startDomestication(g.s,[g.u.id],second.id).ok).toBe(false);runDomestic(g.s,15);expect(g.t.domestication!.animals).toHaveLength(2);expect(D.startDomestication(g.s,[g.u.id],second.id).ok).toBe(false);expect(g.t.members).toHaveLength(4);
});
it('food harvest and home delivery cannot cross a solid obstacle',()=>{
 const g=acquired();g.u.pos={...g.c.pos};const plant={id:g.s.world.nextId++,kind:'nectar' as const,pos:{...g.c.pos,x:g.c.pos.x+1.8},amount:2,max:2,patch:0,regen:0};g.s.world.resources=[plant];g.s.world.obstacles=[{id:g.s.world.nextId++,kind:'rock' as const,pos:{...g.c.pos,x:g.c.pos.x+.9},radius:.4,height:4}];D.orderDomesticAnimal(g.s,g.c.id,plant.id);D.stepDomestication(g.s,1/60);expect(g.a.cargo).toBe(0);expect(plant.amount).toBe(2);
 g.s.world.obstacles=[{id:g.s.world.nextId++,kind:'rock',pos:{x:g.c.pos.x/2,y:0,z:g.c.pos.z/2},radius:.5,height:4}];g.a.cargo=2;g.a.mode='rest';g.a.resource=null;const food=g.t.food;D.stepDomestication(g.s,1/60);expect(g.a.cargo).toBe(2);expect(g.t.food).toBe(food);
});
