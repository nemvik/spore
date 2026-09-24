import { readFileSync, readdirSync } from 'node:fs';
import { it, expect } from 'vitest';
import { fiveTribes } from './fixtures/five-tribes';
import { parseGame, serializeGame } from '../src/game/persistence';
import { makeCheckpoint, recoverGeneration, continueToMachinesEra } from '../src/game/simulation';
import { stepTribe, tribeReady } from '../src/game/tribe';
import { observeLineageHistory } from '../src/game/lineage-history';

it('roundtrips all five economies, music cooldowns and checkpoint without creating supplies',()=>{
 const s=fiveTribes();s.tribe.music={version:1,active:null,result:null,cooldowns:s.tribe.neighbours.map(n=>({neighbour:n.id,remaining:30}))};makeCheckpoint(s);
 const loaded=parseGame(serializeGame(s));expect(loaded).toEqual(s);expect(recoverGeneration(loaded).tribe).toEqual(s.tribe);
});
it.each(['missing','marker','identity','duplicate','completed','checkpoint'] as const)('rejects a malformed five-campaign %s',kind=>{
 const s=fiveTribes();
 if(kind==='missing')s.tribe.neighbours.pop();
 if(kind==='marker')delete s.tribe.roster;
 if(kind==='identity')(s.tribe.neighbours[4] as any).identity='unknown';
 if(kind==='duplicate')s.tribe.neighbours[4].identity='reed';
 if(kind==='completed'){s.tribe.neighbours.slice(0,3).forEach(n=>n.resolved='allied');s.tribe.completed=true;}
 if(kind==='checkpoint'){const c=JSON.parse(s.checkpoint!);delete c.tribe.roster;c.tribe.neighbours.splice(3);s.checkpoint=JSON.stringify(c);}
 expect(()=>parseGame(serializeGame(s))).toThrow();
});
it.each(['allied','conquered','mixed'] as const)('records exactly five %s facts, freezes them and preserves the machine archetype',method=>{
 const s=fiveTribes();s.tribe.neighbours.forEach((n,i)=>n.resolved=method==='mixed'?(i%2?'conquered':'allied'):method);
 stepTribe(s,1/60);observeLineageHistory(s);expect(s.lineageHistory!.stages[3].facts).toHaveLength(5);
 expect(s.lineageHistory!.stages[3].closed?.outcome).toBe(method);expect(tribeReady(s)).toBe(true);
 const facts=structuredClone(s.lineageHistory!.stages[3]);expect(continueToMachinesEra(s)).toBe(true);
 const loaded=parseGame(serializeGame(s));observeLineageHistory(loaded);expect(loaded.lineageHistory!.stages[3]).toEqual(facts);
 expect(loaded.machines).toMatchObject({archetype:s.campaign.finale});expect(loaded.tribe).toEqual(s.tribe);
});
it('keeps every historical fixture readable and does not insert a five-roster marker',()=>{
 for(const file of readdirSync('tests/fixtures/saves').filter(f=>f.endsWith('.json')&&f!=='manifest.json')){
  const s=parseGame(readFileSync(`tests/fixtures/saves/${file}`,'utf8'));expect(parseGame(serializeGame(s))).toEqual(s);
  if(s.tribe?.version===2){expect(s.tribe.roster).toBeUndefined();expect(s.tribe.neighbours).toHaveLength(3);}
 }
});
it('maps machine regions by stable society identity after a reordered save',()=>{
 const s=fiveTribes();s.tribe.neighbours.reverse();s.tribe.neighbours.forEach(n=>n.resolved='allied');stepTribe(s,1/60);
 const garden={...s.tribe.neighbours.find(n=>n.identity==='garden')!.pos},terrace={...s.tribe.neighbours.find(n=>n.identity==='terrace')!.pos};
 observeLineageHistory(s);const restored=parseGame(serializeGame(s));expect(continueToMachinesEra(restored)).toBe(true);const m=restored.machines;if(m?.version!==2)throw Error('machines');
 expect(m.regions.find(r=>r.identity==='gardens')!.pos).toEqual(garden);expect(m.regions.find(r=>r.identity==='terraces')!.pos).toEqual(terrace);
});
