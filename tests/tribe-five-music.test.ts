import { it, expect } from 'vitest';
import { fiveTribes } from './fixtures/five-tribes';
import { startMusic, answerMusic, musicRequest } from '../src/game/tribe-music';
import { stepTribe, recruitTribeMember } from '../src/game/tribe';
import { meetNeighbour } from '../src/game/tribe-neighbours';
import { parseGame,serializeGame } from '../src/game/persistence';
import { makeCheckpoint } from '../src/game/simulation';
const identities=['garden','terrace','sanctuary','reed','basalt'];
it.each(identities)('plays every real request at %s, including the new doubled instruments',identity=>{
 const s=fiveTribes();s.tribe.food=240;recruitTribeMember(s);const n=s.tribe.neighbours.find(n=>n.identity===identity)!,own=s.tribe.members.filter(u=>!u.species);
 own.forEach((u,i)=>u.tool=(identity==='reed'?['flute','flute','drum','rattle']:identity==='basalt'?['rattle','rattle','flute','drum']:['drum','drum','flute','rattle'])[i] as any);
 const before=n.relation;expect(startMusic(s,own.map(u=>u.id),n.id).ok).toBe(true);
 for(let i=0;i<130*30&&s.tribe.music!.active;i++){
  stepTribe(s,1/30);const e=s.tribe.music!.active;
  if(e?.phase==='respond')expect(answerMusic(s,musicRequest(n,e).instrument).ok).toBe(true);
 }
 expect(s.tribe.music!.result).toMatchObject({reason:'success',delta:60});expect(n.relation).toBe(Math.min(100,before+60));expect(s.tribe.music!.result!.rounds.every(r=>r.success)).toBe(true);
});
it.each(identities.flatMap(identity=>['socialize','attack'].map(kind=>[identity,kind] as const)))('pays a single %s/%s outcome and leaves the result fixed after population loss', (identity,kind)=>{
 const s=fiveTribes(),n=s.tribe.neighbours.find(n=>n.identity===identity)!,u=s.tribe.members[0];
 s.tribe.food=100;n.tribute=16;n.relation=99.9;n.health=1;const stock=s.tribe.food;
 meetNeighbour(s.tribe,u,n,kind as 'attack'|'socialize',1);
 expect(n.resolved).toBe(kind==='attack'?'conquered':'allied');expect(s.tribe.food-stock).toBe(kind==='attack'?12:8);
 n.society!.members=[];makeCheckpoint(s);const loaded=parseGame(serializeGame(s));const t=loaded.tribe!;if(t.version!==2)throw Error('active tribe');
 const again=t.neighbours.find(n=>n.identity===identity)!,before=t.food;
 for(let i=0;i<5;i++)meetNeighbour(t,t.members[0],again,kind as 'attack'|'socialize',100);
 expect(t.food).toBe(before);expect(again.resolved).toBe(n.resolved);expect(again.society!.members).toEqual([]);
});
