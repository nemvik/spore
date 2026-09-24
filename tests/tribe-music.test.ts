import { describe, expect, it } from 'vitest';
import { cultureGame, envoy } from './fixtures/culture';
import { answerMusic, cancelMusic, startMusic, stepMusic } from '../src/game/tribe-music';
import { equipTribeUnits, issueTribeOrder, stepTribe } from '../src/game/tribe';
import { meetNeighbour } from '../src/game/tribe-neighbours';
import { equipOutfit } from '../src/game/culture';

import { musicGame } from './fixtures/music';
function begin(g = musicGame()) { expect(startMusic(g.s, g.ids, g.n.id).ok).toBe(true); stepMusic(g.s, .1); expect(g.t.music!.active!.phase).toBe('listen'); return g; }
function answer(g: ReturnType<typeof musicGame>, instrument: 'drum' | 'flute' | 'rattle') { stepMusic(g.s, 3); expect(answerMusic(g.s, instrument).ok).toBe(true); stepMusic(g.s, 2.5); }

describe('active musical encounter', () => {
  it('waits for real contact before charging and pauses passive diplomacy', () => {
    const g = musicGame(); g.t.members[0].pos.x = 50; const food = g.t.food, relation = g.n.relation;
    expect(startMusic(g.s, g.ids, g.n.id).ok).toBe(true); stepMusic(g.s, 1);
    expect(g.t.music!.active!.phase).toBe('travel'); expect(g.t.food).toBe(food);
    meetNeighbour(g.t, g.t.members[1], g.n, 'socialize', 5); expect(g.n.relation).toBe(relation);
    g.t.members[0].pos.x = 0; stepMusic(g.s, .1); expect(g.t.food).toBe(food - 12); expect(g.n.tribute).toBe(8);
  });
  it('three matching instruments succeed, wrong composition fails with same choices', () => {
    const good = begin(); for (const a of ['drum', 'flute', 'rattle'] as const) answer(good, a);
    expect(good.t.music!.result!.reason).toBe('success'); expect(good.n.relation).toBe(90);
    const bad = begin(musicGame(['drum', 'drum', 'drum'])); for (const a of ['drum', 'flute', 'rattle'] as const) answer(bad, a);
    expect(bad.t.music!.result!.reason).toBe('mistakes'); expect(bad.n.relation).toBe(20);
  });
  it('two deliberately wrong answers fail despite full instrumentation', () => {
    const g = begin(); answer(g, 'flute'); answer(g, 'drum'); expect(g.t.music!.result!.reason).toBe('mistakes');
  });
  it('timeouts count as failed rounds', () => {
    const g = begin(); stepMusic(g.s, 3); stepMusic(g.s, 18); stepMusic(g.s, 2.5); stepMusic(g.s, 3); stepMusic(g.s, 18); stepMusic(g.s, 2.5);
    expect(g.t.music!.result!.reason).toBe('mistakes');
  });
  it('plume boosts only successful responses and alliance reward happens once', () => {
    const g = musicGame(); g.t.culture = { version: 1, designs: [] }; g.t.members.forEach(u => u.outfit = structuredClone(envoy)); begin(g);
    const food = g.t.food; for (const a of ['drum', 'flute', 'rattle'] as const) answer(g, a);
    expect(g.n.resolved).toBe('allied'); expect(g.n.relation).toBe(100); expect(g.t.food).toBe(food + 8);
    stepMusic(g.s, 1); meetNeighbour(g.t, g.t.members[0], g.n, 'socialize', 10); expect(g.t.food).toBe(food + 8);
  });
  it('blocks changing musical and cultural equipment for active members', () => {
    const g = begin(); const food = g.t.food;
    expect(equipTribeUnits(g.s, [g.ids[0]], null).ok).toBe(false);
    expect(equipOutfit(g.s, [g.ids[0]], null).ok).toBe(false); expect(g.t.food).toBe(food);
  });
  it('moving or stopping participants cancels, without refunds or replay', () => {
    const g = begin(), food = g.t.food;
    issueTribeOrder(g.s, [g.ids[0]], 'move', { kind: 'point', pos: { x: 30, y: 0, z: 0 } });
    expect(g.t.music!.active).toBeNull(); expect(g.t.music!.result!.reason).toBe('cancelled'); expect(g.t.food).toBe(food); expect(g.n.relation).toBe(25);
    expect(cancelMusic(g.s).ok).toBe(false); expect(g.n.relation).toBe(25);
  });
  it('lost contact blocks answers and interrupts after three seconds', () => {
    const g = begin(); stepMusic(g.s, 3); g.t.members[0].pos.x = 40;
    expect(answerMusic(g.s, 'drum').ok).toBe(false); const time = g.t.music!.active!.remaining;
    stepMusic(g.s, 2); expect(g.t.music!.active!.remaining).toBe(time); stepMusic(g.s, 1);
    expect(g.t.music!.result!.reason).toBe('contact');
  });
  it.each(['member', 'host'] as const)('loss of %s ends without reward', which => {
    const g = begin(); if (which === 'member') g.t.members.shift(); else g.n.society!.members = [];
    stepMusic(g.s, .1); expect(g.t.music!.result!.reason).toBe(which === 'member' ? 'lost-member' : 'host-lost'); expect(g.n.relation).toBe(25);
  });
  it('a hostile order by a different member ends the encounter', () => {
    const g = musicGame(); const outsider = g.t.members.pop()!; g.ids.pop(); begin(g); g.t.members.push(outsider); outsider.orders = [{ unit: outsider.id, kind: 'attack', target: { kind: 'neighbour', id: g.n.id } }];
    stepMusic(g.s, .1); expect(g.t.music!.result!.reason).toBe('conflict');
  });
  it('rejects a dead society, invalid IDs and insufficient supplies atomically', () => {
    const g = musicGame(); const initial = structuredClone(g.t); expect(startMusic(g.s, [999], g.n.id).ok).toBe(false); expect(g.t).toEqual(initial);
    g.t.food = 11; expect(startMusic(g.s, g.ids, g.n.id).ok).toBe(false); g.t.food = 100; g.n.society!.members = []; expect(startMusic(g.s, g.ids, g.n.id).ok).toBe(false);
  });
  it('travel cancellation is free and arrival rechecks stock', () => {
    const g = musicGame(); g.t.members[0].pos.x = 40; startMusic(g.s, g.ids, g.n.id); cancelMusic(g.s); expect(g.n.relation).toBe(30); expect(g.t.food).toBe(200);
    stepMusic(g.s, 30); startMusic(g.s, g.ids, g.n.id); g.t.members[0].pos.x = 0; g.t.food = 0; stepMusic(g.s, .1); expect(g.t.music!.result!.reason).toBe('food'); expect(g.n.tribute).toBe(0);
  });
  it('simulation brings the host and visitors into an active encounter', () => {
    const g = musicGame(); g.t.members.forEach(u => u.pos.x += 20); startMusic(g.s, g.ids, g.n.id);
    for (let i = 0; i < 1500 && g.t.music!.active?.phase === 'travel'; i++) stepTribe(g.s, 1/60);
    expect(g.t.music!.active?.phase).toBe('listen');
  });
});

import { step } from '../src/game/simulation';
import { EMPTY_INPUT } from '../src/game/types';
import { spawnCreature } from '../src/game/world';
it('incoming wildlife damage interrupts music in the full simulation', () => {
  const g=begin(); stepMusic(g.s,3); const u=g.t.members[0], predator=spawnCreature(g.s.world,'crest',0);
  g.s.world.creatures=[predator];g.s.tick=1;
  Object.assign(predator,{pos:{...u.pos},velocity:{x:0,y:0,z:0},intent:'hunt',target:null,cooldown:0,hunger:80});
  step(g.s,EMPTY_INPUT,1/60);expect(u.health).toBeLessThan(100);expect(g.t.music!.active).toBeNull();expect(g.t.music!.result!.reason).toBe('conflict');
});

it('a raid by another society interrupts music on its actual strike', () => {
  const g=begin(), other=g.t.neighbours[1], raider=other.society!.members[0];
  other.society!.food=0;other.society!.truce=0;other.relation=-35;other.society!.expedition={phase:'outbound',members:[raider.id],time:0};
  raider.pos={...g.t.members[0].pos};raider.cooldown=0;
  step(g.s,EMPTY_INPUT,1/60);expect(g.t.members[0].health).toBeLessThan(100);expect(g.t.music!.active).toBeNull();expect(g.t.music!.result!.reason).toBe('conflict');
});

it('refuses a visibly ongoing conflict before spending a visit or cooldown',()=>{
 const g=musicGame();g.n.alarm=10;expect(startMusic(g.s,g.ids,g.n.id).ok).toBe(false);expect(g.t.music).toBeUndefined();expect(g.t.food).toBe(200);
});
it('does not play through a rock, and travel expires without a fee',()=>{
 const g=musicGame();g.t.members[0].pos={x:6,y:0,z:0};g.s.world.obstacles=[{id:999,pos:{x:3,y:0,z:0},radius:1.5,height:4,kind:'rock'}];
 expect(startMusic(g.s,g.ids,g.n.id).ok).toBe(true);stepMusic(g.s,90);expect(g.t.music!.result!.reason).toBe('travel-timeout');expect(g.t.food).toBe(200);
});
it('does not charge the one-time gift again after an interrupted paid visit',()=>{
 const g=begin();cancelMusic(g.s);stepMusic(g.s,30);const food=g.t.food;expect(startMusic(g.s,g.ids,g.n.id).ok).toBe(true);stepMusic(g.s,.1);expect(g.t.food).toBe(food-4);expect(g.n.tribute).toBe(8);
});
it('two successful rounds still earn their own contributions',()=>{
 const g=begin();answer(g,'flute');answer(g,'flute');answer(g,'rattle');expect(g.t.music!.result!.reason).toBe('success');expect(g.n.relation).toBe(70);
});
it('terrace demands two actual drummers and plumes cannot replace the second',()=>{
 const g=musicGame();g.n.identity='terrace';g.t.culture={version:1,designs:[]};g.t.members[0].outfit=envoy;begin(g);answer(g,'drum');expect(g.t.music!.active!.rounds[0].success).toBe(false);
});
