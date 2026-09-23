import { describe, expect, it } from 'vitest';
import { creatureStageFixture } from './fixtures/creature-stage';
import { cancelNestMigration, discoverPart, discoveryState, inspectRemains, isAlpha, partDiscovered, settleNestMigration, socialGoal, startNestMigration, stepNestMigration } from '../src/game/creature-discovery';
import { completeCreatureStage, performSpeciesAction, recordSpeciesDeath, recruitPack, startEncounter, stepCreatureStage } from '../src/game/creature-stage';
import { createGame, evolve, makeCheckpoint, recoverGeneration, continueToTribeEra } from '../src/game/simulation';
import { quoteJourneyEvolution } from '../src/game/journey-evolution';
import { parseGame, serializeGame } from '../src/game/persistence';
import { cloneGenome } from '../src/game/genome';
import { defaultCreatureLimb } from '../src/ui/creature-editor';
import type { Creature, GameState } from '../src/game/types';
import { CreatureStagePresentation, animateSpeciesResponse } from '../src/render/creature-stage';
import { createSpeciesModel, disposeObject } from '../src/render/organism';
import { speciesById } from '../src/game/content';
import { discoveryJournal, discoveryMarkup } from '../src/ui/creature-discovery';
const fixture = () => creatureStageFixture('biped', 481516, true);
const d = (s: GameState) => discoveryState(s)!;
const home = (s: GameState) => s.world.landmarks.find(l => l.kind === 'nest')!;
function inspect(s: GameState, index = 0) { const r=d(s).remains[index];s.player.pos={...r.pos,y:r.pos.y+1};expect(inspectRemains(s,r.id)).toBe(true); }
function birth(s: GameState) { s.player.pos={...home(s).pos}; s.creatureStage!.recharge=0;s.player.energy=100;expect(evolve(s,cloneGenome(s.player.genome)).ok).toBe(true); }
function kill(s: GameState) {return (c: Creature, player: boolean)=>{recordSpeciesDeath(s,c,player);s.world.creatures=s.world.creatures.filter(other=>other.id!==c.id);};}
function friend(s: GameState, index: number) {
 const n=s.creatureStage!.nests[index],c=s.world.creatures.find(c=>c.id===n.residents[0])!;s.player.pos={...c.pos,z:c.pos.z-2};s.player.energy=100;s.player.cooldown=0;s.creatureStage!.recharge=0;
 expect(startEncounter(s,{kind:'creature',stage:2,id:c.id})).toBe(true);let turns=0;
 while(s.creatureStage!.encounter&&turns++<10){s.creatureStage!.recharge=0;expect(performSpeciesAction(s,s.creatureStage!.encounter.requested,null,kill(s))).toBe(true);}
 expect(n.outcome).toBe('friend');return c;
}
describe('SP-004 catalogue and generations',()=>{
 it('opts in only new campaigns and preserves both old and fresh cell saves',()=>{
  const old=creatureStageFixture();expect(old.creatureStage?.discovery).toBeUndefined();expect(partDiscovered(old,'arms')).toBe(true);
  for(const s of [old,fixture(),createGame(1,false,true,true,true,true,true)])expect(parseGame(serializeGame(s)).creatureStage).toEqual(s.creatureStage);
 });
 it('discovers a usable part without changing DNA; repeated collection and forged drafts cannot bypass knowledge',()=>{
  const s=fixture(),g=cloneGenome(s.player.genome);g.parts.push({id:'new-arms',kind:'arms',axial:.25,angle:0,scale:1,mirrored:true,limb:defaultCreatureLimb('arms')});
  expect(quoteJourneyEvolution(s,g).errors.join()).toContain('Neobjevená');expect(evolve(s,g).ok).toBe(false);
  const dna=s.player.dna,total=s.player.totalDna;expect(inspectRemains(s,'west')).toBe(false);inspect(s);expect(s.player.dna).toBe(dna);expect(s.player.totalDna).toBe(total);expect(inspectRemains(s,'west')).toBe(false);
  s.player.pos={...home(s).pos};expect(evolve(s,g).ok).toBe(true);expect(s.player.generation).toBe(2);expect(d(s).parts[0]).toMatchObject({part:'arms',source:'remains',usedGeneration:2});
  expect(d(s).birth?.generation).toBe(2);expect(s.player.genome.parts.some(p=>p.kind==='arms')).toBe(true);
  expect(parseGame(serializeGame(s)).creatureStage).toEqual(s.creatureStage);expect(recoverGeneration(s).creatureStage).toEqual(s.creatureStage);
 });
 it('rejects reproduction after death, during an encounter and without energy, atomically',()=>{
  const s=fixture();for(const block of ['dead','energy','encounter']){s.player.health=block==='dead'?0:100;s.player.energy=block==='energy'?20:100;s.creatureStage!.encounter=block==='encounter'?{species:'bell',target:s.creatureStage!.nests[0].residents[0],requested:'sing',progress:0,round:0,mistakes:0,remaining:12}:null;
  const before=JSON.stringify(s);expect(evolve(s,cloneGenome(s.player.genome)).ok).toBe(false);expect(JSON.stringify(s)).toBe(before);}
 });
 it('rewards first significant encounters and records visible social pack assistance',()=>{
  const s=fixture(),c=friend(s,0);expect(d(s).parts.some(p=>p.part==='antenna'&&p.source==='friend')).toBe(true);expect(recruitPack(s,{kind:'creature',stage:2,id:c.id})).toBe(true);
  const n=s.creatureStage!.nests[1],target=s.world.creatures.find(c=>c.id===n.residents[0])!;c.pos={...target.pos,x:target.pos.x+2};friend(s,1);expect(d(s).socialAssists).toBeGreaterThan(0);expect(d(s).parts.some(p=>p.part==='spines')).toBe(true);
  const model=createSpeciesModel(speciesById(c.species));s.creatureStage!.cue={action:'dance',target:target.id,remaining:.85,success:true};animateSpeciesResponse(model,s,c.id,false);expect(model.position.y).toBeGreaterThan(0);disposeObject(model);
  expect(parseGame(serializeGame(s)).creatureStage).toEqual(s.creatureStage);
 });
 it.each(['social','combat'] as const)('gives the alpha higher stakes and a single reward through %s',route=>{
  const s=fixture(),id=d(s).alpha!.id,c=s.world.creatures.find(c=>c.id===id)!;expect(isAlpha(s,id)).toBe(true);expect(c.health).toBe(96);expect(socialGoal(s,id)).toBe(9);
  if(route==='social')friend(s,3);else{c.health=0;kill(s)(c,true);}
  expect(d(s).alpha!.resolved).toBe(true);expect(d(s).parts.filter(p=>p.part==='toxin')).toHaveLength(1);expect(d(s).parts.find(p=>p.part==='toxin')?.source).toBe('alpha');
  expect(discoverPart(s,'toxin','alpha','repeat')).toBe(false);expect(parseGame(serializeGame(s)).creatureStage).toEqual(s.creatureStage);
 });
 it('does not cut alpha health down to ordinary health when it eats',()=>{
  const s=fixture(),c=s.world.creatures.find(c=>c.id===d(s).alpha!.id)!;c.hunger=70;c.cooldown=0;const food=s.world.resources[0];food.kind=speciesById(c.species).diet[0];food.pos={...c.pos};food.amount=5;
  stepCreatureStage(s,1/60,kill(s));expect(c.health).toBe(96);
 });
});
describe('SP-004 nest migration',()=>{
 it('requires exploration and a generation, follows physically, persists midway, and settles without losing identity',()=>{
  let s=fixture();const id=s.id,g=cloneGenome(s.player.genome);expect(startNestMigration(s,'west')).toBe(false);inspect(s);s.player.pos={...home(s).pos};expect(startNestMigration(s,'west')).toBe(false);birth(s);
  expect(startNestMigration(s,'west')).toBe(true);expect(evolve(s,g).ok).toBe(false);expect(settleNestMigration(s)).toBe(false);
  s.player.pos.x=-6;const x=d(s).migration!.pos.x;stepNestMigration(s,1);expect(d(s).migration!.pos.x).toBeLessThan(x);s=parseGame(serializeGame(s));expect(d(s).migration).not.toBeNull();
  s.player.pos={...d(s).remains[0].pos};const before={...d(s).migration!.pos};stepNestMigration(s,1);expect(d(s).migration!.pos).toEqual(before);
  // Unit fixture moves both participants; browser separately verifies real walking.
  d(s).migration!.pos={...s.player.pos};expect(settleNestMigration(s)).toBe(true);expect(s.id).toBe(id);expect(s.player.genome).toEqual(g);expect(home(s).pos).toEqual(d(s).remains[0].pos);expect(d(s).migrations).toHaveLength(1);
  expect(parseGame(serializeGame(s)).creatureStage).toEqual(s.creatureStage);expect(startNestMigration(s,'west')).toBe(false);birth(s);expect(d(s).birth?.nest).toEqual(home(s).pos);
 });
 it('keeps its heading around a trunk instead of oscillating between path vertices',()=>{
  const s=fixture();inspect(s);birth(s);startNestMigration(s,'west');d(s).migration!.pos={x:-9.731221750584812,y:-1.1913155373061741,z:-6};s.player.pos={x:-17.1136489382505,y:.18633242139313355,z:-13.704361854434834};
  for(let i=0;i<200;i++)stepNestMigration(s,1/60);
  const pos=d(s).migration!.pos;expect(Math.hypot(pos.x-s.player.pos.x,pos.z-s.player.pos.z)).toBeLessThan(2.1);
  expect(parseGame(serializeGame(s)).creatureStage!.discovery!.migration).toEqual(d(s).migration);
 });
 it('normalizes a valid imported player heading before starting a saved caravan',()=>{let s=fixture();inspect(s);birth(s);s.player.heading=3*Math.PI;s=parseGame(serializeGame(s));expect(startNestMigration(s,'west')).toBe(true);expect(parseGame(serializeGame(s)).creatureStage!.discovery!.migration?.heading).toBeCloseTo(Math.PI);});
 it('can cancel without moving the original home',()=>{const s=fixture();inspect(s);birth(s);const pos={...home(s).pos};expect(startNestMigration(s,'west')).toBe(true);expect(cancelNestMigration(s)).toBe(true);expect(home(s).pos).toEqual(pos);expect(d(s).migrations).toEqual([]);});
 it('preserves history and clears an active caravan on entry to the tribe',()=>{
  const s=fixture();inspect(s);birth(s);for(let i=0;i<3;i++)friend(s,i);s.player.pos={...home(s).pos};expect(completeCreatureStage(s)).toBe(true);expect(startNestMigration(s,'west')).toBe(true);makeCheckpoint(s);expect(continueToTribeEra(s)).toBe(true);expect(s.creatureStage!.discovery!.migration).toBeNull();expect(parseGame(serializeGame(s)).creatureStage!.discovery!.parts.length).toBeGreaterThan(0);
 });
});
describe('SP-004 import validation and presentation',()=>{
 const malformed=[
  (s:GameState)=>d(s).parts.push({...d(s).parts[0]}),
  (s:GameState)=>{d(s).parts[0].usedGeneration=99;},
  (s:GameState)=>{d(s).remains[0].pos.x=NaN;},
  (s:GameState)=>{d(s).remains[1].collected=true;},
  (s:GameState)=>{d(s).migration={site:'missing',pos:{x:0,y:0,z:0},heading:0};},
  (s:GameState)=>{d(s).alpha!.id=s.creatureStage!.nests[0].residents[0];},
  (s:GameState)=>{const checkpoint=JSON.parse(s.checkpoint!) as GameState;delete checkpoint.creatureStage!.discovery;s.checkpoint=JSON.stringify(checkpoint);},
 ];
 it.each(malformed)('rejects corrupt history or mismatched rule markers',mutate=>{const s=fixture();inspect(s);mutate(s);expect(()=>parseGame(serializeGame(s))).toThrow();});
 it('shows bones, catalogue provenance and migrated family with finite geometry',()=>{
  const s=fixture(),view=new CreatureStagePresentation();view.update(s,false);expect(view.group.getObjectByName('discovery-remains-west')).toBeDefined();inspect(s);birth(s);startNestMigration(s,'west');d(s).migration!.pos.x=-8;view.update(s,false);expect(view.group.getObjectByName('home-kin-0')!.position.x).toBe(-11);view.group.updateMatrixWorld(true);view.group.traverse(n=>expect(n.matrixWorld.elements.every(Number.isFinite)).toBe(true));
  expect(discoveryMarkup(s)).toContain('Migrace');expect(discoveryJournal(s)).toContain('Kosterní pozůstatky');disposeObject(view.group);
 });
});
