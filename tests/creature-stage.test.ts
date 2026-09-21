import { describe, expect, it } from 'vitest';
import { activeCreatureStage, completeCreatureStage, creatureIntelligence, dismissPack, emptyCreatureStage, initializeCreatureStage, packCapacity, performSpeciesAction, reconcileNest, recordSpeciesDeath, recruitPack, speciesAbilities, startEncounter, stepCreatureStage } from '../src/game/creature-stage';
import { createGame, makeCheckpoint, recoverGeneration, step, tryTransition, continueToTribeEra } from '../src/game/simulation';
import { parseGame, serializeGame } from '../src/game/persistence';
import type { Creature, GameState } from '../src/game/types';
import { EMPTY_INPUT } from '../src/game/types';
import { creatureStageFixture } from './fixtures/creature-stage';
import { creatureBodyFixture } from './fixtures/creature-bodies';
import { readFileSync } from 'node:fs';
import { feedTarget } from '../src/game/interactions';

function resident(s: GameState, n = 0) { return s.world.creatures.find(c => c.id === s.creatureStage!.nests[n].residents[0])!; }
function near(s: GameState, c: Creature, offset = 3) { s.player.pos = { ...c.pos, z: c.pos.z - offset }; s.player.heading = 0; s.player.velocity = { x: 0, y: 0, z: 0 }; }
function kill(s: GameState) { return (c: Creature, byPlayer: boolean) => { recordSpeciesDeath(s, c, byPlayer); s.world.creatures = s.world.creatures.filter(other => other.id !== c.id); }; }
function befriend(s: GameState, n: number) {
  const c = resident(s, n); near(s, c); s.creatureStage!.recharge = 0; s.player.cooldown = 0; s.player.energy = 100;
  expect(startEncounter(s, { kind: 'creature', stage: 2, id: c.id })).toBe(true);
  let tries = 0;
  while (s.creatureStage!.encounter && tries++ < 10) {
    const e = s.creatureStage!.encounter;
    s.creatureStage!.recharge = 0;
    expect(performSpeciesAction(s, e.requested, null, kill(s))).toBe(true);
  }
  expect(s.creatureStage!.nests[n].relationship).toBe(80);
}

describe('creature life and compatibility', () => {
  it('only enables new explicit lineages and initializes land once', () => {
    expect(createGame(1, false).creatureStage).toBeUndefined();
    const s = createGame(1, false, true, true, true, true);
    expect(s.creatureStage).toEqual(emptyCreatureStage()); expect(activeCreatureStage(s)).toBeNull();
    expect(parseGame(serializeGame(s)).creatureStage).toEqual(s.creatureStage);
    const land = creatureStageFixture(), before = serializeGame(land); initializeCreatureStage(land);
    expect(serializeGame(land).replace(/"savedAt":\d+/, '"savedAt":0')).toEqual(before.replace(/"savedAt":\d+/, '"savedAt":0'));
    expect(land.creatureStage!.nests).toHaveLength(4); expect(new Set(land.creatureStage!.nests.flatMap(n => n.residents)).size).toBe(8);
    expect(parseGame(serializeGame(land)).creatureStage).toEqual(land.creatureStage);
  });
  it('preserves historical saves without inventing creature history', () => {
    const manifest = JSON.parse(readFileSync('tests/fixtures/saves/manifest.json', 'utf8'));
    for (const file of manifest.files) { const s = parseGame(readFileSync(`tests/fixtures/saves/${file.file}`, 'utf8')); expect(s.creatureStage).toBeUndefined(); expect(parseGame(serializeGame(s)).creatureStage).toBeUndefined(); }
  });
  it.each(['biped', 'quadruped'] as const)('earns all three routes with %s', kind => {
    for (const route of ['social', 'predator', 'mixed'] as const) {
      const s = creatureStageFixture(kind);
      for (let n = 0; n < 3; n++) {
        if (route === 'social' || route === 'mixed' && n === 0) befriend(s, n);
        else {
          const nest = s.creatureStage!.nests[n];
          for (const id of [...nest.residents]) {
            const c = s.world.creatures.find(c => c.id === id)!; near(s, c, 4);
            while (c.health > 0) {
              s.creatureStage!.recharge = 0; s.player.cooldown = 0; s.player.energy = 100;
              expect(performSpeciesAction(s, 'spit', { kind: 'creature', stage: 2, id }, kill(s))).toBe(true);
              for (let i = 0; i < 50; i++) stepCreatureStage(s, 1 / 60, kill(s));
              near(s, c, 4);
            }
          }
        }
      }
      expect(creatureIntelligence(s)).toBe(3); expect(packCapacity(s)).toBe(3);
      const restored = parseGame(serializeGame(s)); expect(restored.creatureStage).toEqual(s.creatureStage);
      restored.player.pos = { ...restored.world.landmarks[0].pos };
      expect(tryTransition(restored)).toBe(true); expect(restored.creatureStage!.completed).toBe(route);
      expect(recoverGeneration(restored).creatureStage!.completed).toBe(route);
      expect(parseGame(serializeGame(restored)).creatureStage!.completed).toBe(route);
      expect(continueToTribeEra(restored)).toBe(true); expect(parseGame(serializeGame(restored)).stage).toBe(3);
    }
  });
  it('does not reward refusal, repeated friendship or reconciliation twice', () => {
    const s = creatureStageFixture(), c = resident(s); near(s, c);
    const before = s.player.totalDna;
    befriend(s, 0); expect(s.player.totalDna).toBe(before + 12);
    s.creatureStage!.recharge = 0; expect(startEncounter(s)).toBe(false);
    s.creatureStage!.nests[0].relationship = -100; s.player.pos = { ...s.creatureStage!.nests[0].pos };
    expect(reconcileNest(s, c.species)).toBe(true); befriend(s, 0);
    expect(s.player.totalDna).toBe(before + 12); expect(creatureIntelligence(s)).toBe(1);
  });
  it('moves a recruited resident and adds social assistance only within real range', () => {
    const s = creatureStageFixture(); befriend(s, 0); s.creatureStage!.recharge = 0;
    const ally = resident(s); near(s, ally);
    expect(recruitPack(s, { kind: 'creature', stage: 2, id: ally.id })).toBe(true);
    const origin = { ...ally.pos }; s.player.pos.x += 10;
    for (let i = 0; i < 120; i++) stepCreatureStage(s, 1 / 60, kill(s));
    expect(ally.pos.x).toBeGreaterThan(origin.x + 2);
    const target = resident(s, 1); near(s, target); ally.pos = { ...s.player.pos };
    expect(startEncounter(s, { kind: 'creature', stage: 2, id: target.id })).toBe(true);
    const a = s.creatureStage!.encounter!.requested;
    expect(performSpeciesAction(s, a, null, kill(s))).toBe(true);
    expect(s.creatureStage!.encounter!.progress).toBeCloseTo(speciesAbilities(s.player.genome)[a].power + .7);
    expect(dismissPack(s, ally.id)).toBe(true); expect(s.world.creatures).toContain(ally);
  });
  it('persists a live exchange and resumes with exactly the same response', () => {
    const s = creatureStageFixture(); near(s, resident(s)); expect(startEncounter(s)).toBe(true);
    performSpeciesAction(s, 'sing', null, kill(s)); makeCheckpoint(s);
    const restored = parseGame(serializeGame(s)); expect(restored.creatureStage).toEqual(s.creatureStage);
    expect(recoverGeneration(restored).creatureStage).toEqual(s.creatureStage);
    for (let i = 0; i < 120; i++) { step(s, EMPTY_INPUT); step(restored, EMPTY_INPUT); }
    expect(restored.creatureStage).toEqual(s.creatureStage); expect(restored.world).toEqual(s.world);
  });
});

describe('abilities and failure states', () => {
  it('derives distinct anatomy requirements and costs', () => {
    const biped = speciesAbilities(creatureBodyFixture('biped')), quadruped = speciesAbilities(creatureBodyFixture('quadruped'));
    expect(biped.strike.enabled).toBe(true); expect(quadruped.strike.enabled).toBe(false);
    expect(biped.sing.enabled).toBe(true); expect(biped.dance.enabled).toBe(true); expect(biped.pose.enabled).toBe(true);
    expect(biped.charm.enabled).toBe(false); expect(biped.spit.enabled).toBe(false);
    expect(biped.bite.range).toBeLessThan(biped.charge.range); expect(biped.charge.range).toBeLessThan(biped.spit.range);
  });
  it.each(['energy', 'distance', 'blocked', 'recharge', 'dead'] as const)('does not pay or reward invalid %s action', failure => {
    const s = creatureStageFixture(), c = resident(s); near(s, c, 3);
    if (failure === 'energy') s.player.energy = 0;
    if (failure === 'distance') s.player.pos.x += 30;
    if (failure === 'blocked') s.world.obstacles.push({ id: s.world.nextId++, kind: 'rock', pos: { ...c.pos, z: c.pos.z - 1.5, y: c.pos.y - 2 }, radius: 1, height: 8 });
    if (failure === 'recharge') s.creatureStage!.recharge = 1;
    if (failure === 'dead') c.health = 0;
    const before = [s.player.energy, s.player.totalDna, c.health];
    expect(performSpeciesAction(s, 'spit', { kind: 'creature', stage: 2, id: c.id }, kill(s))).toBe(false);
    expect([s.player.energy, s.player.totalDna, c.health]).toEqual(before);
  });
  it('fails after three wrong answers and interrupts when leaving', () => {
    const s = creatureStageFixture(); near(s, resident(s)); startEncounter(s);
    for (let i = 0; i < 3; i++) { s.creatureStage!.recharge = 0; performSpeciesAction(s, 'dance', null, kill(s)); }
    expect(s.creatureStage!.encounter).toBeNull(); expect(creatureIntelligence(s)).toBe(0);
    s.creatureStage!.recharge = 0; startEncounter(s); s.player.pos.x += 30; stepCreatureStage(s, 1 / 60, kill(s));
    expect(s.creatureStage!.encounter).toBeNull();
  });
  it.each([
    (s: GameState) => { s.creatureStage!.nests[0].residents.push(s.creatureStage!.nests[0].residents[0]); },
    (s: GameState) => { s.creatureStage!.nests[0].species = 'unknown'; },
    (s: GameState) => { s.creatureStage!.nests[0].relationship = Infinity; },
    (s: GameState) => { s.creatureStage!.pack.push(s.creatureStage!.nests[0].residents[0]); },
    (s: GameState) => { s.creatureStage!.completed = 'social'; },
    (s: GameState) => { s.creatureStage!.nests[0].residents[0] = 999999; },
    (s: GameState) => { s.creatureStage!.encounter = { species: 'crest', target: s.creatureStage!.nests[0].residents[0], requested: 'sing', remaining: 1, round: 0, progress: 0, mistakes: 0 }; },
    (s: GameState) => { delete JSON.parse(s.checkpoint!).creatureStage; const checkpoint = JSON.parse(s.checkpoint!); delete checkpoint.creatureStage; s.checkpoint = JSON.stringify(checkpoint); },
  ])('rejects malformed state and checkpoint references %#', mutate => {
    const s = creatureStageFixture(); mutate(s);
    expect(() => parseGame(JSON.stringify({ format: 'lumavora', version: 3, savedAt: Date.now(), state: s }))).toThrow();
  });
  it('keeps the completed route as history after the fourth sandbox outcome', () => {
    const s=creatureStageFixture();for(let i=0;i<3;i++)befriend(s,i);
    s.player.pos={...s.world.landmarks[0].pos};expect(tryTransition(s)).toBe(true);s.campaign.sandbox=true;
    for(const id of [...s.creatureStage!.nests[3].residents])kill(s)(s.world.creatures.find(c=>c.id===id)!,true);
    expect(s.creatureStage!.completed).toBe('social');expect(parseGame(serializeGame(s)).creatureStage!.completed).toBe('social');
  });
  it('retains historical outcomes after tribe wildlife dies', () => {
    const s=creatureStageFixture();for(let i=0;i<3;i++)befriend(s,i);
    s.player.pos={...s.world.landmarks[0].pos};tryTransition(s);continueToTribeEra(s);
    s.world.creatures=[];
    expect(parseGame(serializeGame(s)).creatureStage!.nests.filter(n=>n.outcome==='friend')).toHaveLength(3);
  });
  it.each(['food','pack'] as const)('never turns nest residents into symbionts with a %s selection', selection => {
    const s=creatureStageFixture();s.player.genome.parts.push({id:'symbiote',kind:'symbiote',scale:1,axial:0,angle:0,mirrored:false});
    const c=resident(s,2);near(s,c);s.world.creatures=s.world.creatures.filter(other=>other.species!=='gloom'||s.creatureStage!.nests[2].residents.includes(other.id));
    if(selection==='pack'){befriend(s,2);s.creatureStage!.recharge=0;recruitPack(s,{kind:'creature',stage:2,id:c.id});}
    step(s,{...EMPTY_INPUT,bond:true,feedSelection:selection==='food'?{kind:'food',stage:2,id:s.world.resources[0].id}:{kind:'creature',stage:2,id:c.id}});
    expect(s.world.creatures.some(other=>other.id===c.id)).toBe(true);expect(s.player.bonds).toHaveLength(0);
  });
  it('requires a live player at home to complete', () => {
    const s = creatureStageFixture(); for (let i = 0; i < 3; i++) befriend(s, i);
    expect(completeCreatureStage(s)).toBe(false); s.player.pos = { ...s.world.landmarks[0].pos }; s.player.health = 0;
    expect(completeCreatureStage(s)).toBe(false);
  });
  it('charges through the real movement resolver and stops on contact', () => {
    const s=creatureStageFixture(),c=resident(s);near(s,c,6);s.world.obstacles=[];
    const origin={...s.player.pos},health=c.health;
    step(s,{...EMPTY_INPUT,speciesAction:'charge',feedSelection:{kind:'creature',stage:2,id:c.id}});
    expect(s.creatureStage!.attack?.kind).toBe('charge');
    for(let i=0;i<100;i++)step(s,EMPTY_INPUT);
    expect(Math.hypot(s.player.pos.x-origin.x,s.player.pos.z-origin.z)).toBeGreaterThan(2);
    expect(c.health).toBeLessThan(health);expect(s.creatureStage!.attack).toBeNull();
  });
  it('cannot charge through a wall and spends nothing on the refused attack', () => {
    const s=creatureStageFixture(),c=resident(s);near(s,c,6);
    s.world.obstacles.push({id:s.world.nextId++,kind:'rock',pos:{...c.pos,y:c.pos.y-3,z:c.pos.z-3},radius:1.8,height:10});
    const energy=s.player.energy;
    expect(performSpeciesAction(s,'charge',{kind:'creature',stage:2,id:c.id},kill(s))).toBe(false);
    expect(s.player.energy).toBe(energy);
  });
  it('a committed spit misses a target that leaves the visible trajectory', () => {
    const s=creatureStageFixture(),c=resident(s);near(s,c,10);s.world.obstacles=[];
    expect(performSpeciesAction(s,'spit',{kind:'creature',stage:2,id:c.id},kill(s))).toBe(true);
    const aim={...s.creatureStage!.attack!.aim},health=c.health;c.pos.x+=8;
    for(let i=0;i<50;i++)stepCreatureStage(s,1/60,kill(s));
    expect(c.health).toBe(health);expect(s.creatureStage!.attack).toBeNull();expect(aim.x).not.toBe(c.pos.x);
  });
  it('an arm strike interrupts the defender windup', () => {
    const s=creatureStageFixture(),c=resident(s);near(s,c,2);s.world.obstacles=[];
    s.creatureStage!.nests[0].relationship=-100;
    stepCreatureStage(s,1/60,kill(s));expect(s.creatureStage!.guards.some(g=>g.id===c.id)).toBe(true);
    expect(performSpeciesAction(s,'strike',{kind:'creature',stage:2,id:c.id},kill(s))).toBe(true);
    expect(c.fear).toBeGreaterThan(0);expect(s.creatureStage!.guards.some(g=>g.id===c.id)).toBe(false);
    expect(parseGame(serializeGame(s)).creatureStage).toEqual(s.creatureStage);
  });
  it('pack members can take damage and die without leaving stale references', () => {
    const s=creatureStageFixture();befriend(s,0);const ally=resident(s);near(s,ally);s.creatureStage!.recharge=0;
    recruitPack(s,{kind:'creature',stage:2,id:ally.id});const defender=resident(s,1);s.world.obstacles=[];
    ally.pos={...defender.pos,z:defender.pos.z-2};ally.health=6;ally.cooldown=10;ally.fear=4;
    s.player.pos={...defender.pos,z:defender.pos.z-10};s.creatureStage!.nests[1].relationship=-100;
    for(let i=0;i<70;i++)stepCreatureStage(s,1/60,kill(s));
    expect(s.creatureStage!.pack).not.toContain(ally.id);expect(s.world.creatures).not.toContain(ally);
    expect(parseGame(serializeGame(s)).creatureStage).toEqual(s.creatureStage);
  });
  it('keeps chosen wild participants still while preserving their later ecology', () => {
    const s=creatureStageFixture(),wild=s.world.creatures.find(c=>c.species==='bell'&&!s.creatureStage!.nests[0].residents.includes(c.id))!;
    near(s,wild,3);s.world.obstacles=[];expect(startEncounter(s,{kind:'creature',stage:2,id:wild.id})).toBe(true);
    const position={...wild.pos};for(let i=0;i<60;i++)step(s,EMPTY_INPUT);
    expect(wild.pos).toEqual(position);expect(s.creatureStage!.encounter?.target).toBe(wild.id);
    s.player.pos.x+=30;step(s,EMPTY_INPUT);expect(s.creatureStage!.encounter).toBeNull();
  });
  it('does not select a friend as food or bite a recruited companion',()=>{
    const s=creatureStageFixture();befriend(s,0);const c=resident(s);near(s,c,2);s.creatureStage!.recharge=0;
    expect(feedTarget(s)?.id).not.toBe(c.id);recruitPack(s,{kind:'creature',stage:2,id:c.id});
    expect(feedTarget(s,{kind:'creature',stage:2,id:c.id})?.reason).toBe('ally');
    const health=c.health;step(s,{...EMPTY_INPUT,feed:true,feedSelection:{kind:'creature',stage:2,id:c.id}});expect(c.health).toBe(health);
  });
  it.each(['windup','lunge'] as const)('cancels wild predator %s when its species becomes friendly',phase=>{
    const s=creatureStageFixture(),wild=s.world.creatures.filter(c=>c.species==='crest'&&!s.creatureStage!.nests[3].residents.includes(c.id));
    expect(wild.length).toBeGreaterThan(1);near(s,wild[0],3);s.world.obstacles=[];
    for(const c of wild){
      c.pos={...wild[0].pos};c.target=-1;c.intent='hunt';c.velocity={x:0,y:0,z:-8};
      s.journey.hunters=s.journey.hunters.filter(h=>h.id!==c.id);
      s.journey.hunters.push({stage:2,id:c.id,phase,time:.1,aim:{...s.player.pos}});
    }
    expect(startEncounter(s,{kind:'creature',stage:2,id:wild[0].id})).toBe(true);
    expect(wild[0].target).toBeNull();expect(s.journey.hunters.find(h=>h.id===wild[0].id)?.phase).toBe('recover');
    while(s.creatureStage!.encounter){s.creatureStage!.recharge=0;performSpeciesAction(s,s.creatureStage!.encounter.requested,null,kill(s));}
    expect(s.creatureStage!.nests[3].relationship).toBe(80);
    const health=s.player.health;for(let i=0;i<90;i++)step(s,EMPTY_INPUT);
    expect(s.player.health).toBeGreaterThanOrEqual(health);
    for(const c of wild)expect(c.target).not.toBe(-1);
  });
});
