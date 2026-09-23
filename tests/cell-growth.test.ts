import { describe, expect, it } from 'vitest';
import { createGame, evolve, makeCheckpoint, recoverGeneration, step } from '../src/game/simulation';
import { activeCell, CELL_SCALES, cellCameraZoom, cellCanHunt, cellContact, cellFoodScale, cellScale, cellSpineContact, cellTier, inspectCellSite, recordCellMeal, stepCellContacts } from '../src/game/cell-growth';
import { feedTarget, lineBlocked } from '../src/game/interactions';
import { partDiscovered, initializeDiscovery, discoveryDescription } from '../src/game/creature-discovery';
import { cloneGenome, computeStats, functionalProfile } from '../src/game/genome';
import { parseGame, serializeGame } from '../src/game/persistence';
import { cellGuide } from '../src/ui/cell-growth';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import { stepHunters } from '../src/game/encounter-ai';
import { mouthWorldPosition } from '../src/game/locomotion';
import { jawContacts } from '../src/game/anatomy';
import { CellPresentation } from '../src/render/cell-growth';
import { creatureStageFixture } from './fixtures/creature-stage';
import { buildNpcDesigns } from '../src/game/npc-genome';
const fresh=()=>createGame(481516,false,true,true,true,true,true,buildNpcDesigns([],481516),true);
function grow(s:GameState,n=15){for(let i=0;i<n;i++)recordCellMeal(s);}
function discover(s:GameState,i=0){s.player.pos={...s.cellGrowth!.sites[i].pos};s.player.cooldown=0;expect(inspectCellSite(s)).toBe(true);}
function jaw(s:GameState){s.player.genome=cloneGenome(s.player.genome);s.player.genome.parts=s.player.genome.parts.filter(p=>p.kind!=='filter');s.player.genome.parts.push({id:'jaw-test',kind:'jaw',axial:1,angle:0,scale:1,mirrored:false});}
function eat(s:GameState){const r=s.world.resources.find(r=>r.kind==='algae'&&r.max<7)!;const m=functionalProfile(s.player.genome),scale=cellScale(s);r.pos=mouthWorldPosition({mouthOrigin:{x:m.mouthOrigin.x*scale,y:m.mouthOrigin.y*scale,z:m.mouthOrigin.z*scale}},s.player.pos,s.player.heading);s.player.cooldown=0;step(s,{...EMPTY_INPUT,feed:true,feedSelection:{kind:'food',id:r.id,stage:0}});}

describe('SP-006 food, size and contact',()=>{
 it('opts in only the new UI rules; all older constructors keep original scale',()=>{
  const old=createGame(1,false,true,true,true,true,true);expect(old.cellGrowth).toBeUndefined();expect(cellScale(old)).toBe(1);expect(cellCameraZoom(old,25)).toBe(25);expect(partDiscovered(old,'spines')).toBe(true);
  expect(parseGame(serializeGame(fresh())).cellGrowth?.nutrition).toBe(0);
 });
 it('three discrete earned steps increase body and camera without mutating the genome or heading',()=>{
  const s=fresh(),g=cloneGenome(s.player.genome),pos={...s.player.pos},heading=s.player.heading,budget=s.player.totalDna;
  for(let n=0;n<=15;n++){expect(cellScale(s)).toBe(CELL_SCALES[n<3?0:n<8?1:n<15?2:3]);if(n<15)grow(s,1);}
  expect(s.player.genome).toEqual(g);expect(s.player.pos).toEqual(pos);expect(s.player.heading).toBe(heading);expect(s.player.totalDna).toBe(budget+30);expect(cellCameraZoom(s,25)).toBeCloseTo(32.5);grow(s);expect(s.player.totalDna).toBe(budget+30);
 });
 it('only successful food consumption grows; holding at a depleted source or rejected actions does not',()=>{
  const s=fresh();s.world.creatures=[];s.world.obstacles=[];eat(s);expect(s.cellGrowth?.nutrition).toBe(1);expect(s.player.meals).toBe(1);
  for(let i=0;i<20;i++)step(s,{...EMPTY_INPUT,feed:true});expect(s.cellGrowth?.nutrition).toBe(1);
  const before=s.cellGrowth!.nutrition;step(s,{...EMPTY_INPUT,feed:true,feedSelection:{stage:1,id:1,kind:'food'}});expect(s.cellGrowth?.nutrition).toBe(before);
 });
 it('visibly larger food is unavailable before growth and available afterwards, retaining diet restrictions',()=>{
  const s=fresh(),r=s.world.resources.find(r=>r.kind==='mineral')!;r.pos={...s.player.pos};s.world.obstacles=[];const selected={kind:'food' as const,id:r.id,stage:0 as const};expect(feedTarget(s,selected)?.detail).toContain('Velké sousto');expect(cellFoodScale(s,r)).toBe(1.1);
  grow(s,3);expect(feedTarget(s,selected)?.ready).toBe(true);jaw(s);expect(feedTarget(s,selected)?.reason).toBe('diet');
 });
 it('outgrowing the same living hunter cancels its attack and makes it huntable',()=>{
  const s=fresh(),c=s.world.creatures.find(c=>c.species==='needle')!;s.world.obstacles=[];s.player.pos={...c.pos,z:c.pos.z-3};c.hunger=80;expect(cellCanHunt(s,c)).toBe(false);
  stepHunters(s,1/60,()=>{});expect(c.target).toBe(-1);expect(s.journey.hunters.find(m=>m.id===c.id)?.phase).toBe('windup');
  grow(s);expect(cellCanHunt(s,c)).toBe(true);stepHunters(s,1/60,()=>{});expect(c.intent).toBe('flee');expect(c.target).toBeNull();expect(s.journey.hunters.find(m=>m.id===c.id)?.phase).toBe('recover');
 });
 it('scaled jaws require the actual mouth and cannot bite a bigger animal or through stone',()=>{
  const s=fresh();jaw(s);s.world.obstacles=[];const c=s.world.creatures.find(c=>c.species==='needle')!,selected={kind:'creature' as const,id:c.id,stage:0 as const};c.pos={...s.player.pos};expect(feedTarget(s,selected)?.ready).toBe(false);grow(s);
  const j=jawContacts(s.player.genome)[0],scale=cellScale(s);c.pos=mouthWorldPosition({mouthOrigin:{x:j.mouthOrigin.x*scale,y:j.mouthOrigin.y*scale,z:j.mouthOrigin.z*scale}},s.player.pos,s.player.heading);expect(feedTarget(s,selected)?.ready).toBe(true);
  c.pos={...s.player.pos,z:s.player.pos.z+6};expect(feedTarget(s,selected)?.ready).toBe(false);
  c.pos={...s.player.pos,z:s.player.pos.z-3};s.world.obstacles=[{id:999,pos:{...s.player.pos,z:s.player.pos.z-1.5},radius:.6,height:4,kind:'rock'}];expect(feedTarget(s,selected)?.reason).toBe('blocked');
 });
 it('local spines repel and hurt on contact, but neither eat nor grant growth',()=>{
  const s=fresh();s.world.obstacles=[];s.player.heading=0;s.player.genome.parts.push({id:'spine-test',kind:'spines',axial:0,angle:Math.PI/2,scale:1,mirrored:false});const c=s.world.creatures[0];c.pos={...s.player.pos,x:s.player.pos.x+.8};c.fear=0;
  expect(cellSpineContact(s,c)).toBe(true);const health=c.health;stepCellContacts(s,()=>{});expect(c.health).toBeLessThan(health);expect(c.fear).toBe(2);expect(s.cellGrowth?.nutrition).toBe(0);expect(s.cellGrowth?.contact?.kind).toBe('spines');stepCellContacts(s,()=>{});expect(c.health).toBe(health-8*.65);
  c.pos.x=s.player.pos.x-3;expect(cellSpineContact(s,c)).toBe(false);
 });
 it('a blocked spine contact never hurts and a toxin pulse respects cover',()=>{
  const s=fresh();s.world.obstacles=[];s.player.genome.parts.push({id:'toxin-test',kind:'toxin',axial:0,angle:0,scale:1,mirrored:false});const c=s.world.creatures[0];c.pos={...s.player.pos,x:3};s.world.obstacles=[{id:999,pos:{x:1.5,y:0,z:0},radius:.6,height:4,kind:'rock'}];const hp=c.health;step(s,{...EMPTY_INPUT,pulse:true});expect(c.health).toBe(hp);expect(s.player.abilityRecharge).toBe(7);expect(s.cellGrowth?.contact?.kind).toBe('toxin');
 });
 it('does not sting through a stone off the body sightline',()=>{
  const s=fresh();grow(s);s.player.pos={x:0,y:1.1,z:0};s.player.heading=0;s.player.genome.parts.push({id:'side-spines',kind:'spines',axial:0,angle:Math.PI/2,scale:1.65,mirrored:false});
  const c=s.world.creatures.find(c=>c.species==='needle')!;c.pos={x:3.35,y:1.1,z:1.65};c.fear=0;s.world.creatures=[c];s.world.obstacles=[{id:999,pos:{x:3.05,y:0,z:.6},radius:.4,height:4,kind:'rock'}];
  expect(lineBlocked(s,s.player.pos,c.pos)).toBe(false);expect(cellSpineContact(s,c)).toBe(false);stepCellContacts(s,()=>{});expect(c.health).toBe(55);
 });
 it('a body with no mouth cannot eat through an imaginary default mouth',()=>{
  const s=fresh();s.player.genome.parts=s.player.genome.parts.filter(p=>p.kind!=='filter');const r=s.world.resources.find(r=>r.kind==='detritus')!;r.pos={...s.player.pos};r.max=5;r.amount=5;
  expect(feedTarget(s,{kind:'food',id:r.id,stage:0})?.reason).toBe('mouth');
 });
 it('shell absorbs an incoming body strike without retaliating; ordinary skin takes more damage',()=>{
  const hit=(shell:boolean)=>{const s=fresh();s.world.obstacles=[];s.player.invulnerable=0;if(shell)s.player.genome.parts.push({id:'shell-test',kind:'shell',axial:0,angle:0,scale:1,mirrored:false});const c=s.world.creatures.find(c=>c.species==='needle')!;s.world.creatures=[c];c.pos={...s.player.pos,x:.5};c.velocity={x:0,y:0,z:0};c.target=-1;s.journey.hunters=[{id:c.id,stage:0,phase:'lunge',time:.75,aim:{...s.player.pos}}];const hp=s.player.health;stepHunters(s,1/60,()=>{});expect(c.health).toBe(55);expect(c.fear).toBe(0);expect(s.cellGrowth?.contact?.kind).toBe(shell?'shell':'hurt');return hp-s.player.health;};
  expect(hit(true)).toBeLessThan(hit(false));
 });
 it('toxin costs energy, repels nearby unblocked animals and cannot bypass recharge',()=>{
  const s=fresh();s.world.obstacles=[];s.player.genome.parts.push({id:'toxin-test',kind:'toxin',axial:0,angle:0,scale:1,mirrored:false});const c=s.world.creatures.find(c=>c.species==='needle')!;s.world.creatures=[c];c.pos={...s.player.pos,x:2};const hp=c.health,energy=s.player.energy;
  step(s,{...EMPTY_INPUT,pulse:true});expect(c.health).toBeLessThan(hp);expect(c.fear).toBeGreaterThan(9);expect(s.player.energy).toBeLessThan(energy-14);const hit=c.health;step(s,{...EMPTY_INPUT,pulse:true});expect(c.health).toBe(hit);expect(s.cellGrowth?.nutrition).toBe(0);
 });
});
describe('SP-006 discovery, rebuild and saves',()=>{
 it('guides eating, discovery and the editor; locks parts centrally and does not spend discovery',()=>{
  const s=fresh(),draft=cloneGenome(s.player.genome);draft.parts.push({id:'spine-test',kind:'spines',axial:0,angle:1.57,scale:1,mirrored:false});expect(evolve(s,draft).ok).toBe(false);expect(cellGuide(s)?.title).toContain('Sním');
  grow(s,3);expect(cellGuide(s)?.title).toBe('Objev část');discover(s);expect(cellGuide(s)?.title).toBe('Přestav se');const budget=s.player.totalDna;expect(partDiscovered(s,'spines')).toBe(true);const parts=structuredClone(s.cellGrowth!.parts);expect(inspectCellSite(s)).toBe(false);expect(s.player.totalDna).toBe(budget);expect(s.cellGrowth!.parts).toEqual(parts);
  s.player.pos={x:0,y:1.1,z:0};expect(evolve(s,draft).ok).toBe(true);expect(s.player.generation).toBe(2);expect(s.cellGrowth!.parts[0].usedGeneration).toBe(2);expect(s.cellGrowth!.nutrition).toBe(3);expect(s.player.dna).toBeLessThan(budget);
  expect(parseGame(serializeGame(s)).cellGrowth).toEqual(s.cellGrowth);expect(recoverGeneration(s).cellGrowth).toEqual(s.cellGrowth);
 });
 it('requires enough growth, proximity, clear sight and a living player to discover',()=>{
  const s=fresh();expect(inspectCellSite(s)).toBe(false);discover(s);expect(s.cellGrowth!.parts).toHaveLength(0);grow(s,3);s.player.health=0;expect(inspectCellSite(s)).toBe(true);expect(s.cellGrowth!.parts).toHaveLength(0);
  s.player.health=100;const site=s.cellGrowth!.sites[0];s.player.pos={...site.pos,x:site.pos.x-4};s.world.obstacles.push({id:999,pos:{...site.pos,x:site.pos.x-2},radius:1,height:4,kind:'rock'});inspectCellSite(s);expect(s.cellGrowth!.parts).toHaveLength(0);
 });
 it('inherits discovered but unused cell parts with their original provenance on land',()=>{
  const s=fresh();grow(s);for(let i=0;i<3;i++)discover(s,i);const land=creatureStageFixture('biped',481516,true);land.cellGrowth=s.cellGrowth;land.creatureStage!.discovery!.remains=[];land.tick=s.tick;initializeDiscovery(land,(_s,x,z)=>({x,y:1,z}));
  for(const p of s.cellGrowth!.parts)expect(land.creatureStage!.discovery!.parts).toContainEqual(p);expect(cellScale(land)).toBe(1);expect(activeCell(land)).toBeUndefined();
 });
 it('round trips all thresholds and preserves the independent SP-005 NPC snapshot',()=>{
  const s=fresh(),designs=structuredClone(s.worlds[2]!.creatureDesigns);for(let i=0;i<16;i++){makeCheckpoint(s);const restored=parseGame(serializeGame(s));expect(restored.cellGrowth).toEqual(s.cellGrowth);expect(restored.worlds[2]!.creatureDesigns).toEqual(designs);grow(s,1);}
 });
 it.each(['nutrition','version','duplicate','unearned','future','checkpoint','unknown'] as const)('rejects corrupt %s without changing the source state',kind=>{
  const s=fresh(),before=serializeGame(s),data=JSON.parse(before);const c=data.state.cellGrowth;
  if(kind==='nutrition')c.nutrition=16;if(kind==='version')c.version=2;if(kind==='duplicate')c.sites[1]=c.sites[0];if(kind==='unearned')c.sites[0].collected=true;if(kind==='future')c.contact={kind:'mouth',pos:s.player.pos,tick:5};if(kind==='checkpoint')delete data.state.cellGrowth;if(kind==='unknown')c.extra=true;
  expect(()=>parseGame(JSON.stringify(data))).toThrow();expect(s.cellGrowth!.nutrition).toBe(0);
 });
 it('keeps stage-one ordinary organs available and accurately explains deferred discoveries',()=>{
  const s=fresh();s.stage=1;expect(partDiscovered(s,'recycler')).toBe(true);expect(discoveryDescription(s,'recycler')).toBeNull();expect(partDiscovered(s,'spines')).toBe(false);expect(discoveryDescription(s,'spines')).toContain('souši');expect(cellScale(s)).toBe(1);
 });
 it('cannot rebuild after death and cancelling does not consume an unused discovery',()=>{
  const s=fresh();grow(s,3);discover(s);s.player.pos={x:0,y:1.1,z:0};s.player.health=0;const before=JSON.stringify(s);expect(evolve(s,cloneGenome(s.player.genome)).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);expect(s.cellGrowth!.parts[0].usedGeneration).toBeNull();
 });
 it('presentation is read-only and reduced motion retains growth and discoveries',()=>{
  const s=fresh(),view=new CellPresentation();cellContact(s,'growth',s.player.pos);const before=JSON.stringify(s);view.update(s,true);expect(view.group.visible).toBe(true);expect(JSON.stringify(s)).toBe(before);
 });
});
