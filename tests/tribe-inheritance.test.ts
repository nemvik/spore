import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fiveTribes } from './fixtures/five-tribes';
import { envoy } from './fixtures/culture';
import { creatureInheritance, enableLineageHistory, observeLineageHistory, tribeInheritance } from '../src/game/lineage-history';
import { continueToMachinesEra, makeCheckpoint, recoverGeneration, step, summary } from '../src/game/simulation';
import { parseGame, serializeGame, saveGame, loadGame } from '../src/game/persistence';
import { initialVehicle, vehicleCost, vehicleStats } from '../src/game/blueprint';
import { buildMachine, effectiveMachineIncome, issueMachineOrder, machineRegionPower, machineIncome, stepMachines } from '../src/game/machines';
import { issueTribeOrder } from '../src/game/tribe';
import { EMPTY_INPUT, type GameState } from '../src/game/types';
import type { ActiveMachineState, ActiveTribeState, LegacyAbility } from '../src/game/era-types';
import { machineHudMarkup } from '../src/ui/machines';
import { lineageHistoryMarkup, tribeInheritanceEffect } from '../src/ui/lineage-history';

type Route = 'allied' | 'conquered' | 'mixed';
const routes: Route[] = ['allied', 'conquered', 'mixed'];
const rates = { allied: [1.2, 1], conquered: [1, 1.2], mixed: [1.1, 1.1] };
type MachineGame = GameState & { tribe: ActiveTribeState; machines: ActiveMachineState };
/** Explicit prepared resolutions, not earned tribe play. The completion edge and
 * subsequent machine orders/physics/save APIs are production code. */
function completed(route: Route, count = 5, archetype: LegacyAbility = 'restoration') {
  const s = fiveTribes(), t = s.tribe;
  if (count === 3) { delete t.roster; t.neighbours = t.neighbours.slice(0, 3); }
  s.campaign.finale = t.legacyAbility = archetype;
  for (const [i, n] of t.neighbours.entries()) {
    n.resolved = route === 'allied' || route === 'mixed' && i % 2 === 0 ? 'allied' : 'conquered';
    n.relation = n.resolved === 'allied' ? 100 : -100;
    if (n.resolved === 'conquered') n.health = 0;
  }
  step(s, EMPTY_INPUT); // real completion, observation and checkpoint
  expect(t.completed).toBe(true);
  return s;
}
function machine(route: Route, count = 5, archetype: LegacyAbility = 'restoration'): MachineGame {
  const s = completed(route, count, archetype);
  expect(continueToMachinesEra(s)).toBe(true);
  return s as MachineGame;
}
function raw(s: GameState) { return JSON.stringify({ format: 'lumavora', version: 3, savedAt: 1, state: s }); }

// The parser is intentionally stricter than the pure rate function. Corrupt in-memory
// evidence must still never award a partial/duplicated/mismatched bonus.
describe.each([3, 5])('SP-007.B1 %i-neighbour evidence', count => {
  it.each(routes)('derives %s from frozen facts, independent of order and repeats', route => {
    const s = completed(route, count), e = tribeInheritance(s);
    expect(e).toMatchObject({ route, income: rates[route][0], power: rates[route][1] });
    expect(e.allies + e.conquests).toBe(count);
    s.tribe.neighbours.reverse(); s.lineageHistory!.stages[3].facts.reverse();
    makeCheckpoint(s);
    for (let i = 0; i < 3; i++) { observeLineageHistory(s); expect(tribeInheritance(parseGame(serializeGame(s)))).toEqual(e); }
    expect(s.lineageHistory!.stages[3].closed?.source).toBe('action');
  });
  it.each([
    ['unfinished', (s: GameState) => { (s.tribe as ActiveTribeState).completed = false; }],
    ['missing history', (s: GameState) => { delete s.lineageHistory; }],
    ['missing closure', (s: GameState) => { s.lineageHistory!.stages[3].closed = null; }],
    ['partial facts', (s: GameState) => { s.lineageHistory!.stages[3].facts.pop(); }],
    ['duplicate facts', (s: GameState) => { const r=s.lineageHistory!.stages[3]; r.facts[1]=structuredClone(r.facts[0]); }],
    ['wrong method', (s: GameState) => { s.lineageHistory!.stages[3].facts[0].method='conquered'; }],
    ['wrong outcome', (s: GameState) => { s.lineageHistory!.stages[3].closed!.outcome='conquered'; }],
    ['unresolved', (s: GameState) => { (s.tribe as ActiveTribeState).neighbours[0].resolved=null; }],
    ['duplicate neighbour', (s: GameState) => { const t=s.tribe as ActiveTribeState;t.neighbours[1]=structuredClone(t.neighbours[0]); }],
  ] as const)('is neutral with %s', (_, mutate) => {
    const s = completed('allied', count); mutate(s);
    expect(tribeInheritance(s)).toMatchObject({ income: 1, power: 1, route: null });
  });
  it.each(routes)('preserves all prior inheritance and never grants money on %s transition/import/recovery', route => {
    const s=completed(route,count), body=structuredClone(s.player), tribe=structuredClone(s.tribe), oldEffect=creatureInheritance(s);
    expect(continueToMachinesEra(s)).toBe(true);
    expect(s.player).toEqual(body); expect(s.tribe).toEqual(tribe); expect(creatureInheritance(s)).toEqual(oldEffect);
    const initial=structuredClone(s.machines), entry=structuredClone(s.lineageHistory), e=tribeInheritance(s);
    for(let i=0;i<3;i++){
      expect(continueToMachinesEra(s)).toBe(false);
      const loaded=parseGame(serializeGame(s));enableLineageHistory(loaded);
      const recovered=recoverGeneration(loaded);
      expect(recovered.machines).toEqual(initial);expect(recovered.lineageHistory).toEqual(entry);expect(tribeInheritance(recovered)).toEqual(e);
    }
    const m=s.machines as ActiveMachineState;
    expect(m.resource).toBe(100);expect(m.archetype).toBe(s.campaign.finale);
    expect(buildMachine(s,initialVehicle('tank',m.archetype)).ok).toBe(true);
    expect(m.resource).toBe(100-vehicleCost(initialVehicle('tank',m.archetype)));
  });
});

it('five-neighbour history does not award the historic three-neighbour result', () => {
  const s=completed('allied');s.lineageHistory!.stages[3].facts=s.lineageHistory!.stages[3].facts.slice(0,3);
  expect(tribeInheritance(s).route).toBeNull();
});

it.each(['restoration','predator','migration'] as const)('same body and %s finale have three distinct actual machine behaviours', archetype => {
  const variants=routes.map(route=>machine(route,5,archetype));
  for(const s of variants){expect(s.player.genome).toEqual(variants[0].player.genome);expect(s.campaign.finale).toBe(archetype);}
  const results=variants.map((s,i)=>{
    const m=s.machines,g=initialVehicle('tank',archetype),stats=vehicleStats(g);
    expect(buildMachine(s,g).ok).toBe(true);
    const u=m.fleet[0],r=m.regions[0];
    // Prepared contact + paid cargo isolate exactly one tick of module work.
    u.pos={...r.pos};u.cargo=1;
    Object.assign(m.springs[0],{owner:'player',progress:1});
    const start={resource:m.resource,soil:r.soil,health:r.health,relation:r.relation};
    const cost=vehicleCost(g),design=structuredClone(m.blueprints),spring=structuredClone(m.springs);
    expect(issueMachineOrder(s,[u.id],archetype==='restoration'?'build':archetype==='predator'?'attack':'socialize',{kind:'region',id:r.id}).ok).toBe(true);
    stepMachines(s,1/60);
    const delta=archetype==='restoration'?r.soil-start.soil:archetype==='predator'?start.health-r.health:r.relation-start.relation;
    const base=stats.power*(archetype==='restoration'?.28/60:archetype==='predator'?2:.65/60);
    expect(delta).toBeCloseTo(base*rates[routes[i]][1],9);
    expect(m.resource-start.resource).toBeCloseTo(.6/60*rates[routes[i]][0],9);
    expect(m.blueprints).toEqual(design);expect(m.springs).toEqual(spring);expect(vehicleCost(g)).toBe(cost);
    expect(u.cooldown).toBe(archetype==='predator'?1.2:0);expect(r.settlers).toBe(0);expect(r.deliveries).toBe(0);
    // Outfit does not become a machine multiplier; no double use of tribe equipment.
    s.tribe.culture={version:1,designs:[]};s.tribe.members[0].outfit=structuredClone(envoy);
    expect(machineRegionPower(s,stats.power)).toBe(stats.power*rates[routes[i]][1]);
    return {delta,income:m.resource-start.resource};
  });
  expect(results[0].income).toBeGreaterThan(results[2].income);expect(results[2].income).toBeGreaterThan(results[1].income);
  expect(results[1].delta).toBeGreaterThan(results[2].delta);expect(results[2].delta).toBeGreaterThan(results[0].delta);
});

it.each(routes)('actual spring capture and integrated save/load keep %s rates without compounding', route => {
  let s=machine(route);const m=s.machines;expect(buildMachine(s,initialVehicle('tank','restoration')).ok).toBe(true);
  const u=m.fleet[0],spring=m.springs[0];u.pos={...spring.pos}; // prepared start of physical capture
  expect(issueMachineOrder(s,[u.id],'gather',{kind:'spring',id:spring.id}).ok).toBe(true);
  stepMachines(s,8);expect(spring.progress).toBe(.5);expect(effectiveMachineIncome(s)).toBe(0);
  const messages=stepMachines(s,8);expect(spring.owner).toBe('player');expect(messages.join(' ')).toContain((.6*rates[route][0]).toFixed(2));
  const before=m.resource;stepMachines(s,10);expect(m.resource-before).toBeCloseTo(6*rates[route][0],8);
  makeCheckpoint(s);const frozen=structuredClone(s.machines);
  for(let i=0;i<3;i++){s=parseGame(serializeGame(s)) as MachineGame;enableLineageHistory(s);expect(s.machines).toEqual(frozen);expect(effectiveMachineIncome(s)).toBeCloseTo(.6*rates[route][0]);}
  const loaded=parseGame(serializeGame(s));for(let i=0;i<60;i++){step(s,EMPTY_INPUT);step(loaded,EMPTY_INPUT);}expect(loaded).toEqual(s);
  const restored=recoverGeneration(loaded);expect(restored.machines).toEqual(frozen);expect(tribeInheritance(restored)).toEqual(tribeInheritance(s));
});

it('loads every historical fixture without inventing decisions or retroactive amber', () => {
  const manifest=JSON.parse(readFileSync('tests/fixtures/saves/manifest.json','utf8'));
  for(const {file} of manifest.files){
    const s=parseGame(readFileSync(`tests/fixtures/saves/${file}`,'utf8')),before=structuredClone(s);
    expect(tribeInheritance(s).route).toBeNull();enableLineageHistory(s);
    expect(s.player).toEqual(before.player);expect(s.tribe).toEqual(before.tribe);expect(s.machines).toEqual(before.machines);
    const e=tribeInheritance(s),t=s.tribe;
    if(t?.version===2&&t.completed){
      expect(e.route).not.toBeNull();expect(e.allies+e.conquests).toBe(t.neighbours.length);
      expect(s.lineageHistory!.stages[3].closed).toMatchObject({source:'saved',at:null});
      expect(lineageHistoryMarkup(s)).toContain('čas neznámý');
    }else expect(e.route).toBeNull();
    const roundtrip=parseGame(serializeGame(s));expect(tribeInheritance(roundtrip)).toEqual(e);
    const restored=recoverGeneration(roundtrip);expect(()=>parseGame(serializeGame(restored))).not.toThrow();
  }
});

it('finishes a partial old tribe through an actual paid contact before awarding its mixed result', () => {
  const s=parseGame(readFileSync('tests/fixtures/saves/alliance-completed.save.json','utf8'));
  s.checkpoint=null;const t=s.tribe as ActiveTribeState;t.completed=false;t.food=100;
  t.neighbours[0].resolved='conquered';t.neighbours[0].health=0;
  const n=t.neighbours[2],u=t.members.find(u=>!u.species)!;n.resolved=null;n.relation=99.999;
  t.members.forEach(u=>u.orders=[]);u.pos={...n.pos};enableLineageHistory(s);makeCheckpoint(s);
  expect(tribeInheritance(s).route).toBeNull();expect(s.lineageHistory!.stages[3].coverage).toBe('partial');
  expect(issueTribeOrder(s,[u.id],'socialize',{kind:'neighbour',id:n.id}).ok).toBe(true);step(s,EMPTY_INPUT);
  expect(tribeInheritance(s)).toMatchObject({route:'mixed',income:1.1,power:1.1});
  expect(s.lineageHistory!.stages[3].facts.map(f=>f.source)).toEqual(['saved','saved','action']);
  expect(continueToMachinesEra(s)).toBe(true);expect(parseGame(serializeGame(s)).lineageHistory).toEqual(s.lineageHistory);
});

it('rejects checkpoint tampering of an already closed saved tribe as well as an action result', () => {
  for(const saved of [false,true]){
    const s=machine('allied');if(saved){delete s.lineageHistory;s.checkpoint=null;enableLineageHistory(s);makeCheckpoint(s);}
    const c=JSON.parse(s.checkpoint!);c.lineageHistory.stages[3].facts.pop();s.checkpoint=JSON.stringify(c);
    expect(()=>parseGame(raw(s))).toThrow();
  }
});

it('rolls back an unfinished branch and its rewards together, not into completed history', () => {
  const s=fiveTribes();makeCheckpoint(s);const food=s.tribe.food;
  const n=s.tribe.neighbours[0],u=s.tribe.members[0];n.relation=99.999;u.pos={...n.pos};
  expect(issueTribeOrder(s,[u.id],'socialize',{kind:'neighbour',id:n.id}).ok).toBe(true);step(s,EMPTY_INPUT);
  expect(s.lineageHistory!.stages[3].facts).toHaveLength(1);
  const restored=recoverGeneration(parseGame(serializeGame(s)));
  expect(restored.tribe!.food).toBe(food);expect(restored.lineageHistory!.stages[3].facts).toHaveLength(0);expect(tribeInheritance(restored).route).toBeNull();
});

it('limits both effects to machines, leaving terraform income and design power unchanged', () => {
  const s=machine('mixed');Object.assign(s.machines.springs[0],{owner:'player',progress:1});
  expect(effectiveMachineIncome(s)).toBeCloseTo(.66);expect(machineRegionPower(s,10)).toBe(11);
  s.stage=5;expect(effectiveMachineIncome(s)).toBe(machineIncome(s.machines));expect(machineRegionPower(s,10)).toBe(10);
  expect(tribeInheritanceEffect(s)).toContain('v terraformaci se neuplatňuje');
});

it.each(routes)('explains %s provenance, effective income and region power in HUD and journal', route => {
  const s=machine(route);buildMachine(s,initialVehicle('tank','restoration'));Object.assign(s.machines.springs[0],{owner:'player',progress:1});
  const html=machineHudMarkup(s,[s.machines.fleet[0].id]),journal=lineageHistoryMarkup(s);
  expect(html).toContain(`+${effectiveMachineIncome(s).toFixed(2)}/s`);expect(html).toContain('Výkon v regionu');expect(html).toContain('Základ konstrukce');
  expect(html).toContain('data-inheritance');expect(html).toContain('data-action="journal"');expect(html).toContain('uzavřeno hraním');
  expect(journal).toContain('Kulturní výstroj i dědictví tvora');expect(journal).toContain('Ceny, počet dodávek');
  expect(summary(s).tribeInheritance).toEqual(tribeInheritance(s));expect(summary(s).machineIncome).toBe(effectiveMachineIncome(s));
});

it.each(routes)('local save slot reload preserves the %s result, stock and derived rates', route => {
  const slots=new Map<string,string>();vi.stubGlobal('localStorage',{setItem:(k:string,v:string)=>slots.set(k,v),getItem:(k:string)=>slots.get(k)??null});
  try {
    const s=machine(route);Object.assign(s.machines.springs[0],{owner:'player',progress:1});stepMachines(s,7);
    expect(saveGame(s).ok).toBe(true);const loaded=loadGame(s.id);enableLineageHistory(loaded);
    expect(loaded.machines).toEqual(s.machines);expect(tribeInheritance(loaded)).toEqual(tribeInheritance(s));expect(effectiveMachineIncome(loaded)).toBe(effectiveMachineIncome(s));
  } finally {vi.unstubAllGlobals();}
});

it.each(routes)('announces the %s regional bonus only when actual work completes the region', route => {
  const s=machine(route);buildMachine(s,initialVehicle('tank','restoration'));
  const u=s.machines.fleet[0],r=s.machines.regions[0];u.pos={...r.pos};u.cargo=1;r.soil=99.99;r.settlers=1;
  issueMachineOrder(s,[u.id],'build',{kind:'region',id:r.id});const messages=stepMachines(s,1/60);
  expect(r.owner).toBe('player');expect(messages.join(' ')).toContain('region se připojil');
  if(route==='allied')expect(messages.join(' ')).not.toContain('Dědictví kmene: výkon');
  else expect(messages.join(' ')).toContain(`výkon při připojování +${route==='conquered'?20:10} %`);
  expect(stepMachines(s,1/60)).toEqual([]);
});

it('starts only future income for an old campaign already in machines, without changing its saved stock', () => {
  const s=parseGame(readFileSync('tests/fixtures/saves/machines-restoration-completed.save.json','utf8'));
  const stock=(s.machines as ActiveMachineState).resource,base=effectiveMachineIncome(s);
  expect(base).toBe(1.5);enableLineageHistory(s);
  expect((s.machines as ActiveMachineState).resource).toBe(stock);expect(effectiveMachineIncome(s)).toBeCloseTo(1.8);
  step(s,EMPTY_INPUT);expect((s.machines as ActiveMachineState).resource-stock).toBeCloseTo(1.8/60,8);
  const loaded=parseGame(serializeGame(s));enableLineageHistory(loaded);expect(loaded.machines).toEqual(s.machines);
  expect(tribeInheritance(recoverGeneration(loaded))).toEqual(tribeInheritance(s));
});
