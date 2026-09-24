import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { musicGame } from './fixtures/music';
import { answerMusic, startMusic, stepMusic, cancelMusic } from '../src/game/tribe-music';
import { parseGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration } from '../src/game/simulation';

function game() { const g = musicGame(); startMusic(g.s,g.ids,g.n.id); return g; }
describe('music save contract', () => {
  it.each(['travel','listen','respond','feedback','result'] as const)('round trips %s with deterministic continuation', phase => {
    const {s} = game();
    if (phase !== 'travel') stepMusic(s,.1);
    if (['respond','feedback'].includes(phase)) stepMusic(s,3);
    if (phase === 'feedback') answerMusic(s,'drum');
    if (phase === 'result') cancelMusic(s);
    makeCheckpoint(s); const loaded = parseGame(serializeGame(s)); expect(loaded.tribe).toEqual(s.tribe);
    stepMusic(s,.25); stepMusic(loaded,.25); expect(loaded.tribe).toEqual(s.tribe);
    expect(recoverGeneration(loaded).tribe).toEqual(JSON.parse(s.checkpoint!).tribe);
  });
  it('last feedback awards once across load and another roundtrip', () => {
    const {s,t} = game(); stepMusic(s,.1);
    for (const choice of ['drum','flute','rattle'] as const) { stepMusic(s,3); answerMusic(s,choice); if(choice!=='rattle') stepMusic(s,2.5); }
    const loaded = parseGame(serializeGame(s)); stepMusic(s,2.5); stepMusic(loaded,2.5); expect(loaded.tribe).toEqual(t);
    const again = parseGame(serializeGame(loaded)); stepMusic(again,.1); expect(again.tribe?.neighbours[0].relation).toBe(90);
  });
  it.each([
    (m:any)=>m.version=2, (m:any)=>m.extra=true, (m:any)=>m.active.members.push(m.active.members[0]),
    (m:any)=>m.active.remaining=91, (m:any)=>m.active.phase='unknown', (m:any)=>m.active.neighbour=999,
    (m:any)=>m.active.host=m.active.members[0], (m:any)=>m.active.paid=4,
    (m:any)=>m.active.rounds.push({response:'drum',players:[],multiplier:1,success:true}),
    (m:any)=>m.cooldowns.push({neighbour:m.active.neighbour,remaining:99}),
  ])('rejects malformed state %s', mutate => {
    const {s,t} = game(); mutate(t.music); expect(()=>parseGame(serializeGame(s))).toThrow();
  });
  it('allows a member lost after the tribe tick, then safely terminates', () => {
    const {s,t} = game(); stepMusic(s,.1); t.members.shift();
    const loaded = parseGame(serializeGame(s)); stepMusic(loaded,.1);
    expect(loaded.tribe?.version===2 && loaded.tribe.music!.result!.reason).toBe('lost-member');
    expect(()=>parseGame(serializeGame(loaded))).not.toThrow();
  });
  it('loads every historical fixture without inventing music or touching its checkpoint', () => {
    const files = readdirSync('tests/fixtures/saves').filter(f=>f.endsWith('.json') && f!=='manifest.json');
    for(const file of files){ const s=parseGame(readFileSync(`tests/fixtures/saves/${file}`,'utf8')); const loaded=parseGame(serializeGame(s)); expect(loaded.tribe).toEqual(s.tribe); expect(loaded.checkpoint).toEqual(s.checkpoint); if(loaded.tribe?.version===2)expect(loaded.tribe.music).toBeUndefined(); }
  });
});

it('rejects fabricated active instruments and cultural or inherited scoring', () => {
  const {s,t} = game(); stepMusic(s,.1); stepMusic(s,3); answerMusic(s,'drum');
  t.music!.active!.rounds[0].multiplier=1.4375;
  expect(()=>parseGame(serializeGame(s))).toThrow();
  t.music!.active!.rounds[0].multiplier=1;
  t.music!.active!.rounds[0].players=[t.members[1].id];
  expect(()=>parseGame(serializeGame(s))).toThrow();
});

it('restores a checkpoint from before the first music action without keeping spent food or music',()=>{
 const g=musicGame();makeCheckpoint(g.s);const before=structuredClone(g.t);startMusic(g.s,g.ids,g.n.id);stepMusic(g.s,.1);cancelMusic(g.s);
 expect(recoverGeneration(parseGame(serializeGame(g.s))).tribe).toEqual(before);
});
it('keeps a lost host save recoverable and ends its stale visit on the next tick',()=>{
 const {s,t,n}=game();stepMusic(s,.1);n.society!.members=n.society!.members.filter(u=>u.id!==t.music!.active!.host);
 const loaded=parseGame(serializeGame(s));stepMusic(loaded,.1);expect(loaded.tribe?.version===2&&loaded.tribe.music!.result!.reason).toBe('host-lost');
});
it('preserves a terminal encounter and instruments through machine entry and checkpoint',async()=>{
 const {continueToMachinesEra}=await import('../src/game/simulation');const {s,t}=game();stepMusic(s,.1);cancelMusic(s);
 t.neighbours.forEach(n=>{n.resolved='allied';n.relation=100;n.society!.expedition=null;});t.completed=true;const old=structuredClone(t);
 expect(continueToMachinesEra(s)).toBe(true);const loaded=parseGame(serializeGame(s));expect(loaded.tribe).toEqual(old);expect(recoverGeneration(loaded).tribe).toEqual(old);
});
